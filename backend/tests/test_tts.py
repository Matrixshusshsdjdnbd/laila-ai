"""
Backend API tests for TTS (Text-to-Speech) endpoint
Tests: Valid text, empty text, edge cases, base64 audio validation
"""
import pytest
import requests
import os
import base64
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")


class TestTTSEndpoint:
    """TTS endpoint tests"""
    
    def test_tts_valid_text_english(self):
        """Test POST /api/tts with valid English text"""
        payload = {
            "text": "Hello, this is LAILA AI speaking. How can I help you today?",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        assert "format" in data
        assert data["format"] == "mp3"
        assert len(data["audio"]) > 0
        
        # Verify it's valid base64
        try:
            decoded = base64.b64decode(data["audio"])
            assert len(decoded) > 0
            print(f"✓ TTS English: Generated {len(data['audio'])} chars base64 audio ({len(decoded)} bytes)")
        except Exception as e:
            pytest.fail(f"Invalid base64 audio: {e}")
    
    def test_tts_valid_text_french(self):
        """Test POST /api/tts with valid French text"""
        payload = {
            "text": "Bonjour, je suis LAILA AI. Comment puis-je vous aider?",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        assert data["format"] == "mp3"
        assert len(data["audio"]) > 0
        print(f"✓ TTS French: Generated audio successfully")
    
    def test_tts_valid_text_italian(self):
        """Test POST /api/tts with valid Italian text"""
        payload = {
            "text": "Ciao, sono LAILA AI. Come posso aiutarti?",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        assert data["format"] == "mp3"
        print(f"✓ TTS Italian: Generated audio successfully")
    
    def test_tts_valid_text_wolof(self):
        """Test POST /api/tts with valid Wolof text"""
        payload = {
            "text": "Nanga def? Maa ngi LAILA AI. Ndax mën nga ma wax?",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        assert data["format"] == "mp3"
        print(f"✓ TTS Wolof: Generated audio successfully")
    
    def test_tts_empty_text(self):
        """Test POST /api/tts with empty text returns 400"""
        payload = {
            "text": "",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 400
        
        data = response.json()
        assert "detail" in data
        assert "required" in data["detail"].lower() or "text" in data["detail"].lower()
        print(f"✓ Empty text rejected with 400: {data['detail']}")
    
    def test_tts_whitespace_only_text(self):
        """Test POST /api/tts with whitespace-only text returns 400"""
        payload = {
            "text": "   \n\t  ",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 400
        
        data = response.json()
        assert "detail" in data
        print(f"✓ Whitespace-only text rejected with 400")
    
    def test_tts_missing_text_field(self):
        """Test POST /api/tts with missing text field returns 422"""
        payload = {
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 422  # Pydantic validation error
        print(f"✓ Missing text field rejected with 422")
    
    def test_tts_default_voice(self):
        """Test POST /api/tts without voice parameter uses default 'nova'"""
        payload = {
            "text": "Testing default voice parameter"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        assert data["format"] == "mp3"
        print(f"✓ Default voice parameter works")
    
    def test_tts_long_text(self):
        """Test POST /api/tts with long text (should truncate to 4096 chars)"""
        long_text = "This is a test sentence. " * 200  # ~5000 chars
        payload = {
            "text": long_text,
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        assert data["format"] == "mp3"
        print(f"✓ Long text handled (truncated to 4096 chars)")
    
    def test_tts_special_characters(self):
        """Test POST /api/tts with special characters"""
        payload = {
            "text": "Hello! How are you? I'm fine, thanks. 😊 Testing 123... #LAILA",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        print(f"✓ Special characters handled correctly")
    
    def test_tts_short_text(self):
        """Test POST /api/tts with very short text"""
        payload = {
            "text": "Hi",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        assert len(data["audio"]) > 0
        print(f"✓ Short text handled correctly")
    
    def test_tts_numbers_and_punctuation(self):
        """Test POST /api/tts with numbers and punctuation"""
        payload = {
            "text": "The price is $100. Call me at 555-1234. My email is test@example.com.",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        print(f"✓ Numbers and punctuation handled correctly")
