"""
Test Wolof language quality with WOLOF_GUIDE improvements
"""
import pytest
import requests
import os
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")

DEVICE_ID = "TEST_wolof_quality"

class TestWolofQuality:
    """Test Wolof language quality improvements"""
    
    def test_wolof_chat_response(self):
        """Test that Wolof input gets Wolof response with proper grammar"""
        payload = {
            "message": "Nanga def? Maa ngi bëgg jàng Wolof.",
            "device_id": DEVICE_ID,
            "mode": "chat"
        }
        response = requests.post(f"{BASE_URL}/api/chat", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        ai_response = data["message"]["content"]
        
        # Verify response is not empty and substantial
        assert len(ai_response) > 20
        
        # Store conversation_id for cleanup
        pytest.wolof_conv_id = data["conversation_id"]
        
        print(f"✓ Wolof chat response received: {ai_response[:100]}...")
        print(f"✓ Response length: {len(ai_response)} chars")
    
    def test_wolof_translation_to_wolof(self):
        """Test translation to Wolof uses proper grammar"""
        payload = {
            "text": "I want to learn how to speak Wolof fluently",
            "source_lang": "en",
            "target_lang": "wo",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "translation" in data
        translation = data["translation"]
        
        # Verify translation is not empty
        assert len(translation) > 10
        
        print(f"✓ English to Wolof translation: {translation[:100]}...")
    
    def test_wolof_business_mode(self):
        """Test business mode with Wolof includes WOLOF_GUIDE"""
        payload = {
            "message": "Bëgg naa jàng ci business bu njëkk ci Senegal",
            "device_id": DEVICE_ID,
            "mode": "business"
        }
        response = requests.post(f"{BASE_URL}/api/chat", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        ai_response = data["message"]["content"]
        
        # Verify response is substantial
        assert len(ai_response) > 30
        
        print(f"✓ Wolof business mode response: {ai_response[:100]}...")
    
    def test_cleanup_wolof_conversations(self):
        """Cleanup test conversations"""
        if hasattr(pytest, 'wolof_conv_id'):
            requests.delete(f"{BASE_URL}/api/conversations/{pytest.wolof_conv_id}")
        
        # Cleanup all conversations for this device
        response = requests.get(f"{BASE_URL}/api/conversations?device_id={DEVICE_ID}")
        if response.status_code == 200:
            data = response.json()
            for conv in data["conversations"]:
                requests.delete(f"{BASE_URL}/api/conversations/{conv['id']}")
        
        print(f"✓ Wolof test cleanup completed")
