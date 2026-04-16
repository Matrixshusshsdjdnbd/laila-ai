"""
Backend API tests for LAILA AI
Tests: Health check, Chat, Translation, Generate, Conversations, Messages, Delete
"""
import pytest
import requests
import os
import time
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")

DEVICE_ID = "TEST_device_pytest"

class TestHealthCheck:
    """API health check"""
    
    def test_health_endpoint(self):
        """Test GET /api/ returns LAILA AI message"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "LAILA AI" in data["message"]
        print(f"✓ Health check passed: {data['message']}")


class TestChatEndpoint:
    """Chat endpoint tests"""
    
    def test_chat_create_new_conversation(self):
        """Test POST /api/chat creates new conversation and returns AI response"""
        payload = {
            "message": "Hello LAILA, what can you help me with?",
            "device_id": DEVICE_ID,
            "mode": "chat"
        }
        response = requests.post(f"{BASE_URL}/api/chat", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "conversation_id" in data
        assert "message" in data
        assert data["message"]["role"] == "assistant"
        assert len(data["message"]["content"]) > 0
        
        # Store conversation_id for other tests
        pytest.conversation_id = data["conversation_id"]
        print(f"✓ Chat created conversation: {data['conversation_id']}")
        print(f"✓ AI response length: {len(data['message']['content'])} chars")
    
    def test_chat_continue_conversation(self):
        """Test continuing existing conversation"""
        if not hasattr(pytest, 'conversation_id'):
            pytest.skip("No conversation_id from previous test")
        
        payload = {
            "message": "Tell me more about work opportunities",
            "conversation_id": pytest.conversation_id,
            "device_id": DEVICE_ID,
            "mode": "work"
        }
        response = requests.post(f"{BASE_URL}/api/chat", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["conversation_id"] == pytest.conversation_id
        assert data["message"]["role"] == "assistant"
        print(f"✓ Continued conversation successfully")
    
    def test_chat_missing_fields(self):
        """Test chat with missing required fields"""
        payload = {"message": "test"}  # missing device_id
        response = requests.post(f"{BASE_URL}/api/chat", json=payload)
        assert response.status_code == 422  # Validation error
        print(f"✓ Validation error for missing fields: {response.status_code}")


class TestTranslateEndpoint:
    """Translation endpoint tests"""
    
    def test_translate_french_to_english(self):
        """Test translation from French to English"""
        payload = {
            "text": "Bonjour, comment allez-vous?",
            "source_lang": "fr",
            "target_lang": "en",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "translation" in data
        assert len(data["translation"]) > 0
        assert data["source_lang"] == "fr"
        assert data["target_lang"] == "en"
        print(f"✓ Translation FR->EN: {data['translation'][:50]}...")
    
    def test_translate_english_to_wolof(self):
        """Test translation from English to Wolof"""
        payload = {
            "text": "Hello, how are you?",
            "source_lang": "en",
            "target_lang": "wo",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "translation" in data
        assert len(data["translation"]) > 0
        print(f"✓ Translation EN->WO successful")
    
    def test_translate_missing_fields(self):
        """Test translation with missing fields"""
        payload = {"text": "test"}  # missing langs and device_id
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        assert response.status_code == 422
        print(f"✓ Validation error for missing fields")


class TestGenerateEndpoint:
    """Content generation endpoint tests"""
    
    def test_generate_cv(self):
        """Test CV generation"""
        payload = {
            "type": "cv",
            "details": "Name: John Doe, Skills: Python, FastAPI, React. Experience: 3 years software developer",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "conversation_id" in data
        assert "message" in data
        assert data["message"]["role"] == "assistant"
        assert len(data["message"]["content"]) > 100  # CV should be substantial
        
        pytest.generate_conv_id = data["conversation_id"]
        print(f"✓ CV generated: {len(data['message']['content'])} chars")
    
    def test_generate_job_ideas(self):
        """Test job ideas generation"""
        payload = {
            "type": "job_ideas",
            "details": "I have skills in mobile app development and speak French and English",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert len(data["message"]["content"]) > 50
        print(f"✓ Job ideas generated")
    
    def test_generate_business_ideas(self):
        """Test business ideas generation"""
        payload = {
            "type": "business_ideas",
            "details": "I have a smartphone and $100 capital",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        print(f"✓ Business ideas generated")
    
    def test_generate_homework(self):
        """Test homework help generation"""
        payload = {
            "type": "homework",
            "details": "Solve: 2x + 5 = 15",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        print(f"✓ Homework help generated")
    
    def test_generate_social_media(self):
        """Test social media content generation"""
        payload = {
            "type": "social_media",
            "details": "Instagram post about African tech innovation",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        print(f"✓ Social media content generated")
    
    def test_generate_professional_message(self):
        """Test professional message generation"""
        payload = {
            "type": "professional_message",
            "details": "Email to apply for software developer position",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        print(f"✓ Professional message generated")
    
    def test_generate_invalid_type(self):
        """Test generation with invalid type"""
        payload = {
            "type": "invalid_type",
            "details": "test",
            "device_id": DEVICE_ID
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 400
        print(f"✓ Invalid type rejected with 400")


class TestConversationsEndpoint:
    """Conversations list endpoint tests"""
    
    def test_list_conversations(self):
        """Test GET /api/conversations returns array"""
        response = requests.get(f"{BASE_URL}/api/conversations?device_id={DEVICE_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert "conversations" in data
        assert isinstance(data["conversations"], list)
        assert len(data["conversations"]) > 0  # Should have conversations from previous tests
        
        # Verify conversation structure
        conv = data["conversations"][0]
        assert "id" in conv
        assert "title" in conv
        assert "mode" in conv
        assert "last_message" in conv
        assert "created_at" in conv
        assert "updated_at" in conv
        
        print(f"✓ Found {len(data['conversations'])} conversations")
    
    def test_list_conversations_empty_device(self):
        """Test listing conversations for device with no history"""
        response = requests.get(f"{BASE_URL}/api/conversations?device_id=nonexistent_device")
        assert response.status_code == 200
        
        data = response.json()
        assert "conversations" in data
        assert len(data["conversations"]) == 0
        print(f"✓ Empty device returns empty array")


class TestMessagesEndpoint:
    """Messages endpoint tests"""
    
    def test_get_messages(self):
        """Test GET /api/conversations/{id}/messages returns messages array"""
        if not hasattr(pytest, 'conversation_id'):
            pytest.skip("No conversation_id from chat tests")
        
        response = requests.get(f"{BASE_URL}/api/conversations/{pytest.conversation_id}/messages")
        assert response.status_code == 200
        
        data = response.json()
        assert "messages" in data
        assert isinstance(data["messages"], list)
        assert len(data["messages"]) > 0
        
        # Verify message structure
        msg = data["messages"][0]
        assert "id" in msg
        assert "role" in msg
        assert "content" in msg
        assert "created_at" in msg
        assert msg["role"] in ["user", "assistant"]
        
        print(f"✓ Found {len(data['messages'])} messages in conversation")
    
    def test_get_messages_nonexistent_conversation(self):
        """Test getting messages for nonexistent conversation"""
        response = requests.get(f"{BASE_URL}/api/conversations/nonexistent_id/messages")
        assert response.status_code == 200
        
        data = response.json()
        assert "messages" in data
        assert len(data["messages"]) == 0
        print(f"✓ Nonexistent conversation returns empty messages")


class TestDeleteConversation:
    """Delete conversation endpoint tests"""
    
    def test_delete_conversation(self):
        """Test DELETE /api/conversations/{id} returns status deleted"""
        if not hasattr(pytest, 'generate_conv_id'):
            pytest.skip("No conversation to delete")
        
        conv_id = pytest.generate_conv_id
        response = requests.delete(f"{BASE_URL}/api/conversations/{conv_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "status" in data
        assert data["status"] == "deleted"
        
        # Verify conversation is actually deleted
        messages_response = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages")
        assert messages_response.status_code == 200
        messages_data = messages_response.json()
        assert len(messages_data["messages"]) == 0
        
        print(f"✓ Conversation deleted successfully")
    
    def test_delete_nonexistent_conversation(self):
        """Test deleting nonexistent conversation"""
        response = requests.delete(f"{BASE_URL}/api/conversations/nonexistent_id")
        assert response.status_code == 200  # Should still return 200
        
        data = response.json()
        assert data["status"] == "deleted"
        print(f"✓ Delete nonexistent conversation returns success")


# Cleanup
class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_conversations(self):
        """Delete all test conversations"""
        response = requests.get(f"{BASE_URL}/api/conversations?device_id={DEVICE_ID}")
        if response.status_code == 200:
            data = response.json()
            for conv in data["conversations"]:
                requests.delete(f"{BASE_URL}/api/conversations/{conv['id']}")
        print(f"✓ Cleanup completed")
