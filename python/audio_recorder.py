import sounddevice as sd
import numpy as np
import requests
import time
import sys

# Configuration
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION = 3  # seconds
SAMPLES_PER_CHUNK = SAMPLE_RATE * CHUNK_DURATION
URL = "http://localhost:3001/audio"

print(f"Starting Python Audio Capture")
print(f"Sending to: {URL}")
print(f"Config: {SAMPLE_RATE}Hz, Mono, {CHUNK_DURATION}s chunks")

buffer = []
current_samples = 0

def callback(indata, frames, time, status):
    global buffer, current_samples
    if status:
        print(f"Status: {status}", file=sys.stderr)
    
    # indata is float32 by default from sounddevice
    buffer.append(indata.copy())
    current_samples += frames

    if current_samples >= SAMPLES_PER_CHUNK:
        # Concatenate and process
        audio = np.concatenate(buffer, axis=0)
        
        # Normalize and clip to prevent artifacts
        audio = np.clip(audio, -1.0, 1.0)
        
        # Convert to 16-bit PCM
        audio_int16 = (audio * 32767).astype(np.int16)
        audio_bytes = audio_int16.tobytes()
        
        # Send to Node.js backend
        try:
            print(f"Sending chunk ({len(audio_bytes)} bytes)...")
            response = requests.post(
                URL,
                data=audio_bytes,
                headers={"Content-Type": "application/octet-stream"},
                timeout=5
            )
            if response.status_code == 200:
                print(f"Chunk sent successfully")
            else:
                print(f"Server returned status {response.status_code}")
        except Exception as e:
            print(f"Failed to send audio: {e}")
            print("Retrying on next chunk...")

        # Reset buffer
        buffer = []
        current_samples = 0

# Start recording
try:
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, callback=callback):
        print("Recording... Press Ctrl+C to stop.")
        while True:
            time.sleep(1)
except KeyboardInterrupt:
    print("\nStopped by user")
except Exception as e:
    print(f"Error: {e}")
