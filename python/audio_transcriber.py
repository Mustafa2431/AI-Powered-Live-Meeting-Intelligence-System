import os
import sys
import json
import queue
import threading
import time
import requests
from vosk import Model, KaldiRecognizer
import sounddevice as sd

# Configuration
SAMPLE_RATE = 16000
CHANNELS = 1
SERVER_URL = "http://localhost:3001/transcript"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model", "vosk-model-small-en-us-0.15", "vosk-model-small-en-us-0.15")

# Optimized blocksize for balance between CPU and Latency
# 4000 samples approx 250ms at 16kHz
BLOCKSIZE = 4000

print("--------------------------------------------------")
print("Starting Local Vosk Transcriber (Optimized v3)")
print(f"Model Path: {MODEL_PATH}")
print(f"Blocksize: {BLOCKSIZE} | Latency: low")
print("--------------------------------------------------")

# Load Vosk model
if not os.path.exists(MODEL_PATH):
    print(f"ERROR: Model folder NOT FOUND at {MODEL_PATH}")
    sys.exit(1)

print("Loading Vosk Model... (this may take 10-20 seconds)")
try:
    start_time = time.time()
    model = Model(MODEL_PATH)
    rec = KaldiRecognizer(model, SAMPLE_RATE)
    
    # Optimization: Disable word alternatives to save CPU
    rec.SetWords(True)
    rec.SetMaxAlternatives(0)
    
    print(f"Model Loaded Successfully in {time.time() - start_time:.2f}s")
except Exception as e:
    print(f"FATAL ERROR: Failed to create Vosk model: {e}")
    sys.exit(1)

# Bounded Queue (size 30) for transcripts
q = queue.Queue(maxsize=30)
last_text = ""

def safe_enqueue(text):
    """Helper to enqueue with LIFO drop-oldest policy"""
    global q
    try:
        q.put_nowait(text)
    except queue.Full:
        try:
            # Drop the oldest item to make room for fresh real-time data
            q.get_nowait()
            q.put_nowait(text)
        except:
            pass

def sender_worker():
    """Background thread to send transcripts to Node.js"""
    while True:
        text = q.get()
        if text is None:
            break
        
        # Retry logic for network instability
        for attempt in range(3):
            try:
                response = requests.post(
                    SERVER_URL,
                    json={"text": text},
                    timeout=3
                )
                if response.status_code == 200:
                    break
                else:
                    # Minimal logging to prevent CPU overhead
                    pass
            except Exception as e:
                # print(f"Error sending transcript (attempt {attempt+1}): {e}")
                time.sleep(1)
        
        # Rate control to prevent CPU spikes and request flooding
        time.sleep(0.01)
        q.task_done()

# Start background worker
threading.Thread(target=sender_worker, daemon=True).start()

def audio_callback(indata, frames, time_info, status):
    """Callback for sounddevice to process raw audio"""
    global last_text
    
    # Monitor audio status (overflow/underflow)
    if status:
        print(f"⚠️ Audio Status: {status}", file=sys.stderr)
    
    # Process audio chunk with Vosk
    if rec.AcceptWaveform(bytes(indata)):
        result = json.loads(rec.Result())
        text = result.get("text", "").strip()
        
        # Deduplication and Silence filtering
        if text and text != last_text:
            print(f"📝 {text}")
            safe_enqueue(text)
            last_text = text

# Main recording loop
try:
    # Use low latency mode with optimized blocksize
    with sd.RawInputStream(
        samplerate=SAMPLE_RATE,
        blocksize=BLOCKSIZE,
        dtype='int16',
        channels=CHANNELS,
        latency='low',
        callback=audio_callback
    ):
        print("STREAM ACTIVE. Listening... Press Ctrl+C to stop.")
        while True:
            # CPU safety sleep
            time.sleep(0.1)
except KeyboardInterrupt:
    print("\nStopping...")
except Exception as e:
    print(f"FATAL ERROR during audio capture: {e}")
    time.sleep(5)
    sys.exit(1)
