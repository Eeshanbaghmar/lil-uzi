import os
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client

# Manually parse the .env.local file from the React frontend
def load_env():
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    keys = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    k, v = line.strip().split('=', 1)
                    keys[k] = v
    return keys

env_vars = load_env()
SUPABASE_URL = env_vars.get("VITE_SUPABASE_URL")
SUPABASE_KEY = env_vars.get("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Could not find VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in ../.env.local")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Load the local embedding model (downloads it on first run - very small)
print("Loading sentence-transformer model (all-MiniLM-L6-v2)...")
model = SentenceTransformer('all-MiniLM-L6-v2')

# Our "Expert Knowledge Base"
knowledge = [
    {
        "title": "Vocal EQ Fundamentals",
        "content": "To fix muddy vocals, cut between 200Hz - 350Hz. To add presence and bite, boost around 3kHz - 5kHz. To add air, use a high shelf boost around 10kHz. Always high-pass vocals around 80Hz to remove rumble."
    },
    {
        "title": "808 and Kick Clashing",
        "content": "If the kick and 808 are clashing (frequency masking), sidechain compress the 808 to the kick. Also, find the fundamental frequency of the kick (usually 50-70Hz) and make a slight EQ cut on the 808 at that exact frequency."
    },
    {
        "title": "Mastering Loudness Targets",
        "content": "For modern Trap and Hip-Hop, masters are typically pushed to -8 LUFS to -6 LUFS. For Streaming platforms (Spotify, Apple), the normalization target is -14 LUFS, but most commercial tracks still master much louder. True Peak should be kept at -1.0 dB to prevent clipping after encoding."
    },
    {
        "title": "FabFilter Pro-C2 Vocal Settings",
        "content": "For aggressive pop/trap vocals using FabFilter Pro-C2: Ratio 4:1, Fast Attack (around 1ms-5ms) to catch transients, and Fast Release (50ms) to keep it upfront. Aim for 3-6dB of gain reduction."
    },
    {
        "title": "Stereo Width on Bass",
        "content": "Never widen sub-bass frequencies (below 120Hz). Keep sub frequencies strictly in mono to ensure phase coherence and punch on club systems. You can use a stereo widener on the higher harmonics of an 808 (above 200Hz) if you want it to feel wider."
    }
]

print(f"Seeding {len(knowledge)} knowledge documents into Supabase...")

for doc in knowledge:
    # Generate the 384-dimensional vector embedding
    vector = model.encode(doc["content"]).tolist()
    
    # Insert into Supabase
    data, count = supabase.table('knowledge_base').insert({
        "title": doc["title"],
        "content": doc["content"],
        "embedding": vector
    }).execute()
    
    print(f"Inserted: {doc['title']}")

print("Seed complete! Uzi is now much smarter.")
