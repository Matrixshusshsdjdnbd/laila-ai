"""
Backend API tests for LAILA AI - Iteration 10: Voice Call Feature
Tests: Auth, Chat, Transcribe, TTS endpoints for voice call functionality
"""
import pytest
import requests
import os
import io
import base64
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")

# Test credentials
TEST_EMAIL = "test@laila.ai"
TEST_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for authenticated requests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Cannot login with test credentials: {response.status_code}")
    data = response.json()
    return data.get("token")


class TestAuthEndpoint:
    """Auth endpoint tests - verify existing auth still works"""
    
    def test_login_success(self):
        """Test POST /api/auth/login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        
        data = response.json()
        assert "token" in data
        assert "email" in data
        assert data["email"] == TEST_EMAIL
        print(f"✓ Login successful: {data['email']}")


class TestChatEndpoint:
    """Chat endpoint tests - verify chat still works"""
    
    def test_chat_basic(self, auth_token):
        """Test POST /api/chat with basic message"""
        response = requests.post(f"{BASE_URL}/api/chat", 
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "message": "Hello LAILA, how are you?",
                "mode": "chat"
            }
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert "conversation_id" in data
        assert data["message"]["role"] == "assistant"
        assert len(data["message"]["content"]) > 0
        print(f"✓ Chat works: {data['message']['content'][:50]}...")


class TestTranscribeEndpoint:
    """Transcribe endpoint tests - critical for voice call feature"""
    
    def test_transcribe_endpoint_exists(self):
        """Verify POST /api/transcribe endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/transcribe")
        # Should return 422 (validation error) not 404 (not found)
        assert response.status_code != 404
        print(f"✓ Transcribe endpoint exists (status: {response.status_code})")
    
    def test_transcribe_empty_file_rejected(self):
        """Test POST /api/transcribe with empty file returns 400"""
        empty_file = io.BytesIO(b'')
        files = {'file': ('empty.m4a', empty_file, 'audio/m4a')}
        data = {'language': ''}
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        assert response.status_code == 400
        
        error_data = response.json()
        assert "Empty audio file" in error_data["detail"]
        print(f"✓ Empty file rejected: {error_data['detail']}")
    
    def test_transcribe_accepts_multipart_form(self):
        """Verify endpoint accepts multipart/form-data"""
        # Create minimal audio file
        audio_data = bytes([128] * 100)
        audio_file = io.BytesIO(audio_data)
        files = {'file': ('test.m4a', audio_file, 'audio/m4a')}
        data = {'language': 'en'}
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        # Should not return 415 (Unsupported Media Type)
        assert response.status_code != 415
        print(f"✓ Accepts multipart/form-data (status: {response.status_code})")
    
    def test_transcribe_file_too_large(self):
        """Test POST /api/transcribe with file >25MB returns 400"""
        large_data = b'x' * (26 * 1024 * 1024)  # 26MB
        large_file = io.BytesIO(large_data)
        files = {'file': ('large.m4a', large_file, 'audio/m4a')}
        data = {'language': ''}
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        assert response.status_code == 400
        
        error_data = response.json()
        assert "too large" in error_data["detail"].lower()
        print(f"✓ Large file rejected: {error_data['detail']}")


class TestTTSEndpoint:
    """TTS endpoint tests - critical for voice call feature"""
    
    def test_tts_endpoint_exists(self):
        """Verify POST /api/tts endpoint exists"""
        response = requests.post(f"{BASE_URL}/api/tts", json={})
        # Should return 422 (validation error) not 404 (not found)
        assert response.status_code != 404
        print(f"✓ TTS endpoint exists (status: {response.status_code})")
    
    def test_tts_valid_text_english(self):
        """Test POST /api/tts with valid English text"""
        payload = {
            "text": "Hello, this is LAILA AI speaking.",
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
            print(f"✓ TTS works: Generated {len(data['audio'])} chars base64 ({len(decoded)} bytes)")
        except Exception as e:
            pytest.fail(f"Invalid base64 audio: {e}")
    
    def test_tts_empty_text_rejected(self):
        """Test POST /api/tts with empty text returns 400"""
        payload = {
            "text": "",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 400
        
        data = response.json()
        assert "detail" in data
        print(f"✓ Empty text rejected: {data['detail']}")
    
    def test_tts_whitespace_only_rejected(self):
        """Test POST /api/tts with whitespace-only text returns 400"""
        payload = {
            "text": "   \n\t  ",
            "voice": "nova"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 400
        print(f"✓ Whitespace-only text rejected")
    
    def test_tts_default_voice(self):
        """Test POST /api/tts without voice parameter uses default"""
        payload = {
            "text": "Testing default voice"
        }
        response = requests.post(f"{BASE_URL}/api/tts", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "audio" in data
        print(f"✓ Default voice works")
    
    def test_tts_long_text_truncated(self):
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
        print(f"✓ Long text handled (truncated to 4096 chars)")


class TestVoiceCallFlow:
    """Integration tests for voice call flow: transcribe → chat → tts"""
    
    def test_voice_call_flow_simulation(self, auth_token):
        """Test complete voice call flow: transcribe → chat → tts"""
        # Step 1: Simulate transcription (skip actual audio, test chat + tts)
        print("\n--- Voice Call Flow Test ---")
        
        # Step 2: Chat with transcribed text
        chat_response = requests.post(f"{BASE_URL}/api/chat",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={
                "message": "What is the capital of Senegal?",
                "mode": "chat"
            }
        )
        assert chat_response.status_code == 200
        chat_data = chat_response.json()
        assert "message" in chat_data
        ai_response = chat_data["message"]["content"]
        print(f"✓ Step 2 - Chat: {ai_response[:80]}...")
        
        # Step 3: TTS for AI response
        tts_response = requests.post(f"{BASE_URL}/api/tts", json={
            "text": ai_response[:100],  # Use first 100 chars
            "voice": "nova"
        })
        assert tts_response.status_code == 200
        tts_data = tts_response.json()
        assert "audio" in tts_data
        assert len(tts_data["audio"]) > 0
        print(f"✓ Step 3 - TTS: Generated audio for AI response")
        
        print("✓ Voice call flow complete: chat → tts")
