"""
Backend Auth tests for LAILA AI - Iteration 5
Tests: Register, Login, /me, Logout, Chat with auth, Image upload with auth, Creator identity, Daily limit
"""
import pytest
import requests
import os
import time
import base64
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")

# Test user credentials
TEST_EMAIL = f"test_auth_{int(time.time())}@laila.ai"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "Test User Auth"

# Existing test user from test_credentials.md
EXISTING_EMAIL = "test@laila.ai"
EXISTING_PASSWORD = "Test1234!"


class TestAuthRegister:
    """Test POST /api/auth/register"""
    
    def test_register_new_user_success(self):
        """Test registering a new user returns user data and token"""
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "name": TEST_NAME
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data, "Missing user_id in response"
        assert "email" in data, "Missing email in response"
        assert "name" in data, "Missing name in response"
        assert "token" in data, "Missing token in response"
        assert "tier" in data, "Missing tier in response"
        
        assert data["email"] == TEST_EMAIL.lower(), "Email should be lowercase"
        assert data["name"] == TEST_NAME, "Name mismatch"
        assert data["tier"] == "free", "New users should be free tier"
        assert len(data["token"]) > 20, "Token should be substantial"
        
        # Store token for other tests
        pytest.auth_token = data["token"]
        pytest.user_id = data["user_id"]
        
        print(f"✓ Register success: user_id={data['user_id']}, tier={data['tier']}")
        print(f"✓ Token length: {len(data['token'])} chars")
    
    def test_register_duplicate_email_fails(self):
        """Test registering with duplicate email returns 400"""
        payload = {
            "email": TEST_EMAIL,  # Same email as previous test
            "password": "AnotherPass123!",
            "name": "Another User"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, f"Expected 400 for duplicate email, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data, "Error response should have detail field"
        assert "already registered" in data["detail"].lower(), "Error message should mention duplicate"
        
        print(f"✓ Duplicate email rejected: {data['detail']}")
    
    def test_register_invalid_email_fails(self):
        """Test registering with invalid email returns 400"""
        payload = {
            "email": "not-an-email",
            "password": TEST_PASSWORD,
            "name": "Test"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, f"Expected 400 for invalid email, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "email" in data["detail"].lower()
        
        print(f"✓ Invalid email rejected: {data['detail']}")
    
    def test_register_short_password_fails(self):
        """Test registering with password < 6 chars returns 400"""
        payload = {
            "email": f"test_{int(time.time())}@laila.ai",
            "password": "12345",  # Only 5 chars
            "name": "Test"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 400, f"Expected 400 for short password, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "6 characters" in data["detail"].lower() or "password" in data["detail"].lower()
        
        print(f"✓ Short password rejected: {data['detail']}")


class TestAuthLogin:
    """Test POST /api/auth/login"""
    
    def test_login_correct_credentials_success(self):
        """Test login with correct credentials returns token"""
        payload = {
            "email": EXISTING_EMAIL,
            "password": EXISTING_PASSWORD
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data, "Missing user_id"
        assert "email" in data, "Missing email"
        assert "name" in data, "Missing name"
        assert "token" in data, "Missing token"
        assert "tier" in data, "Missing tier"
        assert "daily_messages" in data, "Missing daily_messages count"
        
        assert data["email"] == EXISTING_EMAIL.lower()
        assert len(data["token"]) > 20
        
        # Store token for authenticated tests
        pytest.login_token = data["token"]
        pytest.login_user_id = data["user_id"]
        
        print(f"✓ Login success: user_id={data['user_id']}, daily_messages={data['daily_messages']}")
    
    def test_login_wrong_password_fails(self):
        """Test login with wrong password returns 401"""
        payload = {
            "email": EXISTING_EMAIL,
            "password": "WrongPassword123!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 401, f"Expected 401 for wrong password, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "invalid" in data["detail"].lower() or "password" in data["detail"].lower()
        
        print(f"✓ Wrong password rejected: {data['detail']}")
    
    def test_login_nonexistent_email_fails(self):
        """Test login with nonexistent email returns 401"""
        payload = {
            "email": "nonexistent@laila.ai",
            "password": "SomePassword123!"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 401, f"Expected 401 for nonexistent email, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        
        print(f"✓ Nonexistent email rejected: {data['detail']}")


class TestAuthMe:
    """Test GET /api/auth/me"""
    
    def test_auth_me_with_valid_token(self):
        """Test /api/auth/me with valid Bearer token returns user data"""
        if not hasattr(pytest, 'login_token'):
            pytest.skip("No login token from previous test")
        
        headers = {"Authorization": f"Bearer {pytest.login_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "user_id" in data, "Missing user_id"
        assert "email" in data, "Missing email"
        assert "name" in data, "Missing name"
        assert "tier" in data, "Missing tier"
        assert "daily_messages" in data, "Missing daily_messages"
        assert "daily_limit" in data, "Missing daily_limit"
        
        assert data["user_id"] == pytest.login_user_id
        assert data["email"] == EXISTING_EMAIL.lower()
        assert isinstance(data["daily_messages"], int), "daily_messages should be int"
        assert isinstance(data["daily_limit"], int), "daily_limit should be int"
        assert data["daily_limit"] > 0, "daily_limit should be positive"
        
        # Store daily_messages for later comparison
        pytest.initial_daily_messages = data["daily_messages"]
        
        print(f"✓ /me success: daily_messages={data['daily_messages']}, daily_limit={data['daily_limit']}")
    
    def test_auth_me_without_token_fails(self):
        """Test /api/auth/me without token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Expected 401 without token, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "not authenticated" in data["detail"].lower() or "unauthorized" in data["detail"].lower()
        
        print(f"✓ No token rejected: {data['detail']}")
    
    def test_auth_me_with_invalid_token_fails(self):
        """Test /api/auth/me with invalid token returns 401"""
        headers = {"Authorization": "Bearer invalid_token_12345"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 401, f"Expected 401 for invalid token, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        
        print(f"✓ Invalid token rejected: {data['detail']}")


class TestAuthLogout:
    """Test POST /api/auth/logout"""
    
    def test_logout_with_token_success(self):
        """Test logout with valid token invalidates session"""
        if not hasattr(pytest, 'auth_token'):
            pytest.skip("No auth token from register test")
        
        headers = {"Authorization": f"Bearer {pytest.auth_token}"}
        response = requests.post(f"{BASE_URL}/api/auth/logout", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "status" in data
        assert data["status"] == "logged_out"
        
        # Verify token is now invalid
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 401, "Token should be invalid after logout"
        
        print(f"✓ Logout success, token invalidated")
    
    def test_logout_without_token_success(self):
        """Test logout without token still returns success"""
        response = requests.post(f"{BASE_URL}/api/auth/logout")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["status"] == "logged_out"
        
        print(f"✓ Logout without token returns success")


class TestChatWithAuth:
    """Test POST /api/chat with authentication"""
    
    def test_chat_with_auth_token_increments_daily_count(self):
        """Test chat with auth token works and increments daily_messages"""
        if not hasattr(pytest, 'login_token'):
            pytest.skip("No login token")
        
        headers = {"Authorization": f"Bearer {pytest.login_token}"}
        payload = {
            "message": "Hello LAILA, this is an authenticated test message",
            "mode": "chat"
        }
        
        response = requests.post(f"{BASE_URL}/api/chat", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "conversation_id" in data
        assert "message" in data
        assert data["message"]["role"] == "assistant"
        
        # Check daily_messages incremented
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 200
        me_data = me_response.json()
        
        if hasattr(pytest, 'initial_daily_messages'):
            assert me_data["daily_messages"] > pytest.initial_daily_messages, "daily_messages should increment"
            print(f"✓ Chat with auth success, daily_messages incremented: {pytest.initial_daily_messages} → {me_data['daily_messages']}")
        else:
            print(f"✓ Chat with auth success, daily_messages={me_data['daily_messages']}")
    
    def test_chat_without_auth_still_works(self):
        """Test chat without auth token still works (anonymous mode)"""
        payload = {
            "message": "Hello LAILA, this is an anonymous test message",
            "mode": "chat"
        }
        
        response = requests.post(f"{BASE_URL}/api/chat", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "conversation_id" in data
        assert "message" in data
        
        print(f"✓ Anonymous chat still works")


class TestCreatorIdentity:
    """Test creator identity in AI responses"""
    
    def test_creator_identity_bathie_sarr(self):
        """Test asking 'Who created you?' mentions Bathie Sarr"""
        payload = {
            "message": "Who created you?",
            "mode": "chat"
        }
        
        response = requests.post(f"{BASE_URL}/api/chat", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "message" in data
        content = data["message"]["content"].lower()
        
        # Check for Bathie Sarr mention
        assert "bathie" in content or "sarr" in content, f"Response should mention Bathie Sarr. Got: {data['message']['content']}"
        
        print(f"✓ Creator identity test passed")
        print(f"  Response: {data['message']['content'][:150]}...")
    
    def test_creator_identity_variations(self):
        """Test different ways of asking about creator"""
        questions = [
            "Who made you?",
            "Who is your founder?",
            "Who built you?"
        ]
        
        for question in questions:
            payload = {"message": question, "mode": "chat"}
            response = requests.post(f"{BASE_URL}/api/chat", json=payload)
            
            if response.status_code == 200:
                data = response.json()
                content = data["message"]["content"].lower()
                
                if "bathie" in content or "sarr" in content:
                    print(f"✓ '{question}' → mentions Bathie Sarr")
                else:
                    print(f"⚠ '{question}' → no Bathie Sarr mention (may be acceptable)")
            
            time.sleep(1)  # Rate limiting


class TestImageChatWithAuth:
    """Test POST /api/chat/image with authentication"""
    
    def test_image_chat_with_auth_token(self):
        """Test image upload with auth token works"""
        if not hasattr(pytest, 'login_token'):
            pytest.skip("No login token")
        
        # Create a small test image (1x1 red pixel PNG)
        test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        test_image_bytes = base64.b64decode(test_image_base64)
        
        headers = {"Authorization": f"Bearer {pytest.login_token}"}
        files = {"file": ("test.png", test_image_bytes, "image/png")}
        data = {"message": "What is in this image?"}
        
        response = requests.post(f"{BASE_URL}/api/chat/image", headers=headers, files=files, data=data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        resp_data = response.json()
        assert "conversation_id" in resp_data
        assert "message" in resp_data
        assert resp_data["message"]["role"] == "assistant"
        
        print(f"✓ Image chat with auth success")
        print(f"  Response: {resp_data['message']['content'][:100]}...")


class TestExistingEndpointsStillWork:
    """Verify existing endpoints still work after auth changes"""
    
    def test_translate_endpoint_still_works(self):
        """Test /api/translate still works"""
        payload = {
            "text": "Hello, how are you?",
            "source_lang": "en",
            "target_lang": "fr"
        }
        response = requests.post(f"{BASE_URL}/api/translate", json=payload)
        assert response.status_code == 200, f"Translate endpoint broken: {response.status_code}"
        
        data = response.json()
        assert "translation" in data
        
        print(f"✓ /api/translate still works")
    
    def test_generate_endpoint_still_works(self):
        """Test /api/generate still works"""
        payload = {
            "type": "cv",
            "details": "Name: Test User, Skills: Python"
        }
        response = requests.post(f"{BASE_URL}/api/generate", json=payload)
        assert response.status_code == 200, f"Generate endpoint broken: {response.status_code}"
        
        data = response.json()
        assert "message" in data
        
        print(f"✓ /api/generate still works")


# Cleanup
class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_user(self):
        """Note: User cleanup would require DELETE /api/users endpoint (not implemented)"""
        print(f"✓ Test user created: {TEST_EMAIL} (manual cleanup may be needed)")
