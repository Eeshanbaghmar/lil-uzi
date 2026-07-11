import requests
import wave
import struct

# Create a 1-second dummy WAV file
def create_dummy_wav(filename):
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(44100)
        for i in range(44100):
            wav_file.writeframes(struct.pack('h', 0))

create_dummy_wav("test_dummy.wav")

url = "http://localhost:8000/analyze"
with open("test_dummy.wav", "rb") as f:
    files = {"file": ("test_dummy.wav", f, "audio/wav")}
    response = requests.post(url, files=files)
    
print("Status:", response.status_code)
print("Response:", response.text)
