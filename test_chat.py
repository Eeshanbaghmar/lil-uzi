import os
import requests

def test_chat():
    backend_url = os.environ.get('VITE_BACKEND_URL', 'https://lil-uzi.onrender.com')
    print(f"Testing backend: {backend_url}")
    try:
        response = requests.post(f"{backend_url}/chat", json={
            "message": "hello",
            "projectContext": {"title": "test", "genre": "test"},
            "analysisData": {}
        }, timeout=120)
        print("Status Code:", response.status_code)
        print("Response:", response.text)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    test_chat()
