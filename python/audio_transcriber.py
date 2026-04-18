import os
import sys
import json
import queue
import threading
import time
import requests
import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel

# Configuration
SAMPLE_RATE = 16000
CHANNELS = 1
TRANSCRIPT_URL = "http://localhost:3001/transcript"

# ── Whisper Model Configuration ───────────────────────────────────────────────
# Model sizes: tiny, base, small, medium, large-v3
# "small" = best balance of accuracy + speed on CPU (~2-3s for 5s audio)
# "medium" = higher accuracy, slower (~5-7s for 5s audio on CPU)
# "large-v3" = best accuracy, needs GPU for real-time
MODEL_SIZE = "base"

# ── Chunking & VAD Configuration   ──────────────────────────────────────────────
CHUNK_DURATION = 3           # seconds per chunk (shorter = lower latency)
OVERLAP_DURATION = 0.5       # overlap between chunks (avoids cutting words)
VAD_ENERGY_THRESHOLD = 0.005 # min RMS energy to count as speech
VAD_MIN_SPEECH_RATIO = 0.10  # min speech % in a chunk to transcribe it
MAX_SILENCE_BEFORE_FLUSH = 1.5  # flush speech after this much silence
NOISE_GATE_THRESHOLD = 0.003    # RMS below this = silence

print("=" * 60)
print("  AI Meeting Transcriber — Local Whisper (High Accuracy)")
print("=" * 60)
print(f"  Model        : faster-whisper '{MODEL_SIZE}'")
print(f"  Transcript URL: {TRANSCRIPT_URL}")
print(f"  Sample Rate   : {SAMPLE_RATE} Hz")
print(f"  Chunk Duration: {CHUNK_DURATION}s  (overlap: {OVERLAP_DURATION}s)")
print("=" * 60)


# ── Load Whisper Model ────────────────────────────────────────────────────────
print(f"\n⏳ Loading Whisper '{MODEL_SIZE}' model (first run downloads ~500MB)...")
load_start = time.time()

try:
    whisper_model = WhisperModel(
        MODEL_SIZE,
        device="cpu",         # Use "cuda" if you have a GPU
        compute_type="int8",  # int8 = fast on CPU, use "float16" for GPU
    )
    print(f"✅ Model loaded in {time.time() - load_start:.1f}s\n")
except Exception as e:
    print(f"❌ Failed to load Whisper model: {e}")
    sys.exit(1)


# ── Audio Preprocessing ──────────────────────────────────────────────────────

def compute_rms(audio_float):
    """Compute Root Mean Square energy."""
    return np.sqrt(np.mean(audio_float ** 2))


def normalize_audio(audio_int16):
    """Normalize audio to use full dynamic range without clipping."""
    peak = np.max(np.abs(audio_int16.astype(np.float64)))
    if peak < 1e-6:
        return audio_int16
    scale = (32767 * 0.9) / peak
    return np.clip(audio_int16 * scale, -32768, 32767).astype(np.int16)


def apply_noise_gate(audio_int16, frame_size=800):
    """Zero out frames below noise threshold."""
    output = audio_int16.copy()
    num_frames = len(audio_int16) // frame_size
    for i in range(num_frames):
        start = i * frame_size
        end = start + frame_size
        frame_f = audio_int16[start:end].astype(np.float64) / 32768.0
        if compute_rms(frame_f) < NOISE_GATE_THRESHOLD:
            output[start:end] = (output[start:end] * 0.05).astype(np.int16)
    return output


def detect_speech_ratio(audio_int16, frame_ms=30):
    """Returns ratio of frames that contain speech."""
    frame_size = int(SAMPLE_RATE * frame_ms / 1000)
    num_frames = len(audio_int16) // frame_size
    if num_frames == 0:
        return 0.0
    speech_count = 0
    for i in range(num_frames):
        start = i * frame_size
        end = start + frame_size
        rms = compute_rms(audio_int16[start:end].astype(np.float64) / 32768.0)
        if rms > VAD_ENERGY_THRESHOLD:
            speech_count += 1
    return speech_count / num_frames


# ── Smart Audio Chunker ──────────────────────────────────────────────────────

class SmartAudioChunker:
    """Accumulates audio and produces speech chunks for transcription."""

    def __init__(self):
        self.buffer = []
        self.total_samples = 0
        self.chunk_samples = int(SAMPLE_RATE * CHUNK_DURATION)
        self.overlap_samples = int(SAMPLE_RATE * OVERLAP_DURATION)
        self.silence_samples = 0
        self.max_silence_samples = int(SAMPLE_RATE * MAX_SILENCE_BEFORE_FLUSH)
        self.has_speech = False
        self.overlap_buffer = None

    def feed(self, audio_int16):
        """Feed raw int16 audio. Returns list of chunks ready for transcription."""
        self.buffer.append(audio_int16.copy())
        self.total_samples += len(audio_int16)

        rms = compute_rms(audio_int16.astype(np.float64) / 32768.0)
        is_speech = rms > VAD_ENERGY_THRESHOLD

        if is_speech:
            self.has_speech = True
            self.silence_samples = 0
        else:
            self.silence_samples += len(audio_int16)

        chunks = []

        # Full chunk accumulated
        if self.total_samples >= self.chunk_samples:
            chunk = self._flush()
            if chunk is not None:
                chunks.append(chunk)

        # Speech followed by long silence → flush early for lower latency
        elif (self.has_speech
              and self.silence_samples >= self.max_silence_samples
              and self.total_samples >= SAMPLE_RATE):
            chunk = self._flush()
            if chunk is not None:
                chunks.append(chunk)

        return chunks

    def _flush(self):
        if not self.buffer:
            return None

        audio = np.concatenate(self.buffer)

        # Prepend overlap from previous chunk
        if self.overlap_buffer is not None:
            audio = np.concatenate([self.overlap_buffer, audio])

        # Save overlap for next chunk
        if len(audio) > self.overlap_samples:
            self.overlap_buffer = audio[-self.overlap_samples:].copy()
        else:
            self.overlap_buffer = None

        self.buffer = []
        self.total_samples = 0
        self.silence_samples = 0
        self.has_speech = False

        # Skip mostly-silent chunks
        speech_ratio = detect_speech_ratio(audio)
        if speech_ratio < VAD_MIN_SPEECH_RATIO:
            print(f"  ⏭️  Skipping silence chunk (speech: {speech_ratio:.0%})")
            return None

        # Preprocess
        audio = apply_noise_gate(audio)
        audio = normalize_audio(audio)

        print(f"  🎤 Speech chunk ready ({len(audio)/SAMPLE_RATE:.1f}s, speech: {speech_ratio:.0%})")
        return audio

    def flush_remaining(self):
        if self.buffer and self.has_speech:
            return self._flush()
        return None


# ── Transcription + Sending ──────────────────────────────────────────────────

transcribe_queue = queue.Queue(maxsize=10)
last_text = ""
# Rolling context for Whisper's initial_prompt (improves continuity)
rolling_context = ""
MAX_CONTEXT_LEN = 200


def transcribe_and_send():
    """Background thread: runs Whisper locally, sends text to backend."""
    global last_text, rolling_context

    while True:
        audio_int16 = transcribe_queue.get()
        if audio_int16 is None:
            break

        try:
            # Convert int16 → float32 [-1, 1] for faster-whisper
            audio_float = audio_int16.astype(np.float32) / 32768.0

            # Run Whisper locally
            t0 = time.time()
            segments, info = whisper_model.transcribe(
                audio_float,
                language="en",
                beam_size=1,              # Greedy decoding = fastest
                temperature=0.0,          # Deterministic = most accurate
                condition_on_previous_text=False,
                initial_prompt=rolling_context if rolling_context else None,
                vad_filter=True,          # Built-in VAD to skip silence
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=200,
                ),
                no_speech_threshold=0.6,  # Filter no-speech segments
            )

            # Collect text from segments
            text_parts = []
            for seg in segments:
                # Skip low-confidence / no-speech segments
                if seg.no_speech_prob > 0.6:
                    continue
                t = seg.text.strip()
                if t:
                    text_parts.append(t)

            text = " ".join(text_parts).strip()
            elapsed = time.time() - t0

            if not text or text == last_text:
                continue

            print(f"  📝 [{elapsed:.1f}s] {text}")
            last_text = text

            # Update rolling context for next chunk
            rolling_context += " " + text
            if len(rolling_context) > MAX_CONTEXT_LEN:
                rolling_context = rolling_context[-MAX_CONTEXT_LEN:]

            # Send transcript text to backend
            for attempt in range(3):
                try:
                    resp = requests.post(
                        TRANSCRIPT_URL,
                        json={"text": text},
                        timeout=5,
                    )
                    if resp.status_code == 200:
                        break
                except requests.exceptions.ConnectionError:
                    print(f"  🔌 Backend not reachable (attempt {attempt+1}/3)")
                    time.sleep(1)
                except Exception as e:
                    print(f"  ⚠️ Send error: {e}")
                    time.sleep(0.5)

        except Exception as e:
            print(f"  ❌ Transcription error: {e}")

        transcribe_queue.task_done()


# Start transcription worker
threading.Thread(target=transcribe_and_send, daemon=True).start()


# ── Audio Capture Callback ───────────────────────────────────────────────────

chunker = SmartAudioChunker()


def audio_callback(indata, frames, time_info, status):
    if status:
        print(f"  ⚠️ Audio: {status}", file=sys.stderr)

    audio_int16 = np.frombuffer(bytes(indata), dtype=np.int16)
    chunks = chunker.feed(audio_int16)

    for chunk in chunks:
        try:
            transcribe_queue.put_nowait(chunk)
        except queue.Full:
            try:
                transcribe_queue.get_nowait()
                transcribe_queue.put_nowait(chunk)
            except:
                pass


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("\n🎧 Starting audio capture...\n")

    try:
        with sd.RawInputStream(
            samplerate=SAMPLE_RATE,
            blocksize=4000,
            dtype='int16',
            channels=CHANNELS,
            latency='low',
            callback=audio_callback,
        ):
            print("✅ STREAM ACTIVE — Listening for speech...\n")
            print("   Transcription runs LOCALLY via faster-whisper.")
            print("   No internet needed. High accuracy.\n")
            print("   Press Ctrl+C to stop.\n")

            while True:
                time.sleep(0.1)

    except KeyboardInterrupt:
        print("\n🛑 Stopping...")
        remaining = chunker.flush_remaining()
        if remaining is not None:
            transcribe_queue.put(remaining)
        transcribe_queue.put(None)
        print("   Done.")

    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        time.sleep(3)
        sys.exit(1)


if __name__ == "__main__":
    main()
