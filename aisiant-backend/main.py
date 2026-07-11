import os
import json
import requests
import librosa
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

app = FastAPI(title="AISIANT Audio Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Supabase from System Env (Render) or .env.local (Local)
def get_env_var(key):
    # 1. Try system environment variable (Render)
    if os.environ.get(key):
        return os.environ.get(key)
        
    # 2. Try falling back to .env.local (Local)
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith(key + '='):
                    return line.strip().split('=', 1)[1]
    return None

SUPABASE_URL = get_env_var("VITE_SUPABASE_URL")
SUPABASE_KEY = get_env_var("VITE_SUPABASE_ANON_KEY")
GROQ_API_KEY = get_env_var("GROQ_API_KEY")

supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Load Local Embedding Model
print("Loading sentence-transformer model for RAG...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

class ChatRequest(BaseModel):
    message: str
    projectContext: dict
    analysisData: dict

@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        content = await file.read()
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as f:
            f.write(content)
            
        y, sr = librosa.load(temp_path, sr=None)
        
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
        
        rms = librosa.feature.rms(y=y)
        avg_rms = float(np.mean(rms))
        dbfs = 20 * np.log10(avg_rms + 1e-6)
        
        cent = librosa.feature.spectral_centroid(y=y, sr=sr)
        avg_cent = float(np.mean(cent))
        
        peak = float(np.max(np.abs(y)))
        peak_db = 20 * np.log10(peak + 1e-6)
        
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
    # 1. RAG Retrieval - Find relevant mixing knowledge
    rag_context = ""
    try:
        if supabase:
            # Create embedding of the user's question
            query_embedding = embedding_model.encode(request.message).tolist()
            
            # Query Supabase via Postgres RPC function we will create
            res = supabase.rpc('match_knowledge', {
                'query_embedding': query_embedding,
                'match_threshold': 0.3,
                'match_count': 2
            }).execute()
            
            if res.data and len(res.data) > 0:
                rag_context = "REFERENCE KNOWLEDGE DATABASE:\n"
                for match in res.data:
                    rag_context += f"- {match['title']}: {match['content']}\n"
    except Exception as e:
        print("RAG Search failed:", e)

    # 2. Build the System Prompt
    system_prompt = f"""You are Lil Uzi, an expert Grammy-winning mixing engineer and music co-producer.
    The user is working on a track called '{request.projectContext.get('title', 'Untitled')}' 
    (Genre: {request.projectContext.get('genre', 'Unknown')}).
    
    DSP AUDIO ANALYSIS DATA FOR THIS PROJECT:
    {json.dumps(request.analysisData, indent=2)}
    
    {rag_context}
    
    INSTRUCTIONS:
    Use the DSP Analysis AND the Reference Knowledge Database (if provided) to give highly specific, technical advice. 
    Do not give generic advice. Mention specific DB levels, frequencies, or plugins.
    Keep your response concise, formatting it beautifully with Markdown (bolding, lists, etc).
    """

    groq_payload = {
        "model": "llama3-70b-8192",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.message}
        ],
        "stream": False
    }

    try:
        if not GROQ_API_KEY:
            return {"error": "GROQ_API_KEY is not set in your environment variables!"}
            
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }
        response = requests.post("https://api.groq.com/openai/v1/chat/completions", json=groq_payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        return {"reply": data["choices"][0]["message"]["content"]}
    except Exception as e:
        return {"error": "Failed to connect to Groq. (Error: " + str(e) + ")"}
