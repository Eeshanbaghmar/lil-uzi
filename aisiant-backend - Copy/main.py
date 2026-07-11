import os
import io
import json
import requests
import librosa
import numpy as np
from fastapi import FastAPI, File, UploadFile, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="AISIANT Audio Backend")

# Allow CORS for local React dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    projectContext: dict
    analysisData: dict

@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """
    Receives an audio file (stem or master), runs Librosa DSP analysis,
    and returns a structured JSON report.
    """
    try:
        # Read the uploaded file into memory
        content = await file.read()
        
        # In a real heavy-duty app, we'd save it to a temp file, but for small stems
        # we can load it from memory via librosa (using soundfile under the hood).
        # We save it temporarily to ensure librosa can read it properly.
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(content)
            
        # Load audio using librosa
        y, sr = librosa.load(temp_path, sr=None)
        
        # 1. Calculate Tempo (BPM)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
        
        # 2. Calculate RMS (Loudness proxy)
        rms = librosa.feature.rms(y=y)
        avg_rms = float(np.mean(rms))
        # Convert RMS to roughly LUFS/dBFS relative
        dbfs = 20 * np.log10(avg_rms + 1e-6)
        
        # 3. Spectral Centroid (Brightness/Timbre)
        cent = librosa.feature.spectral_centroid(y=y, sr=sr)
        avg_cent = float(np.mean(cent))
        
        # 4. Peak Amplitude
        peak = float(np.max(np.abs(y)))
        peak_db = 20 * np.log10(peak + 1e-6)
        
        # Clean up temp file
        os.remove(temp_path)
        
        return {
            "filename": file.filename,
            "bpm": round(bpm, 1),
            "rms_db": round(dbfs, 2),
            "peak_db": round(peak_db, 2),
            "spectral_centroid": round(avg_cent, 2),
            "status": "success"
        }

    except Exception as e:
        return {"error": str(e), "status": "failed"}


@app.post("/chat")
async def chat_with_ollama(request: ChatRequest):
    """
    Takes user message and context, wraps it in a RAG prompt, 
    and asks local Ollama for advice.
    """
    # Build the system prompt
    system_prompt = f"""You are Lil Uzi, an expert Grammy-winning mixing engineer and music co-producer.
    The user is working on a track called '{request.projectContext.get('title', 'Untitled')}' 
    (Genre: {request.projectContext.get('genre', 'Unknown')}).
    
    Here is the DSP audio analysis data for their stems:
    {json.dumps(request.analysisData, indent=2)}
    
    Use ONLY the supplied analysis and context to give highly specific, technical advice. 
    Do not give generic advice. Mention specific DB levels, frequencies, or plugins.
    Keep your response concise, formatting it beautifully with Markdown (bolding, lists, etc).
    """

    ollama_payload = {
        "model": "llama3", # Assuming they have llama3 installed locally
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.message}
        ],
        "stream": False
    }

    try:
        # Call local Ollama API (default port 11434)
        response = requests.post("http://localhost:11434/api/chat", json=ollama_payload)
        response.raise_for_status()
        data = response.json()
        return {"reply": data.get("message", {}).get("content", "I am thinking...")}
    except Exception as e:
        return {"error": "Failed to connect to local Ollama. Is it running? (Error: " + str(e) + ")"}
