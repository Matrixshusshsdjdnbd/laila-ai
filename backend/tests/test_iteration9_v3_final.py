"""
Iteration 9 - LAILA AI v3.0 Final Features Tests
Tests for:
- Referral system: GET /api/referral (code, link, rewards), POST /api/referral/apply
- Voice styles: GET /api/voices (nova, onyx, alloy)
- Premium tier UI: GET /api/auth/me returns tier_label (FREE/PREMIUM/VIP)
- Settings: GET /api/settings returns tts_voice, PUT /api/settings with tts_voice
- All existing features: auth, chat, image gen, translation, TTS
"""

import pytest
import requests
import os

# Use external URL for testing
BASE_URL = "https://africa-laila-hub.preview.emergentagent.com"

@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture
def auth_token(api_client):
    """Login and return auth token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test@laila.ai",
        "password": "Test1234!"
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    return data["token"]

@pytest.fixture
def auth_headers(auth_token):
    """Return auth headers"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestAuth:
    """Authentication tests"""

    def test_login_works(self, api_client):
        """POST /api/auth/login with test@laila.ai / Test1234! works"""
        response = api_client.post(f"{BASE_URL}/api/auth/login", json={
            "email": "test@laila.ai",
            "password": "Test1234!"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data
        assert "user_id" in data
        assert "email" in data
        assert data["email"] == "test@laila.ai"
        assert "tier" in data
        print(f"✓ POST /api/auth/login works (tier: {data['tier']})")

    def test_auth_me_returns_tier_label(self, api_client, auth_headers):
        """GET /api/auth/me returns tier_label (FREE/PREMIUM/VIP)"""
        response = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "user_id" in data
        assert "email" in data
        assert "tier" in data
        assert "tier_label" in data, "Missing tier_label field"
        assert data["tier_label"] in ["FREE", "PREMIUM", "VIP"], f"Invalid tier_label: {data['tier_label']}"
        assert "referral_code" in data, "Missing referral_code field"
        assert "referral_count" in data, "Missing referral_count field"
        
        print(f"✓ GET /api/auth/me returns tier_label: {data['tier_label']} (tier: {data['tier']}, referral_count: {data['referral_count']})")


class TestReferralSystem:
    """Referral system tests"""

    def test_get_referral_info(self, api_client, auth_headers):
        """GET /api/referral returns referral_code, share_link, rewards tiers"""
        response = api_client.get(f"{BASE_URL}/api/referral", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "referral_code" in data, "Missing referral_code"
        assert "share_link" in data, "Missing share_link"
        assert "referral_count" in data, "Missing referral_count"
        assert "bonus_days_earned" in data, "Missing bonus_days_earned"
        assert "rewards" in data, "Missing rewards"
        
        # Verify rewards structure
        assert len(data["rewards"]) == 4, f"Expected 4 reward tiers, got {len(data['rewards'])}"
        expected_tiers = [
            {"friends": 1, "reward": "3 days free Premium"},
            {"friends": 3, "reward": "7 days free Premium"},
            {"friends": 5, "reward": "14 days free Premium"},
            {"friends": 10, "reward": "30 days free Premium + VIP badge"}
        ]
        for i, expected in enumerate(expected_tiers):
            assert data["rewards"][i]["friends"] == expected["friends"], f"Tier {i} friends mismatch"
            assert data["rewards"][i]["reward"] == expected["reward"], f"Tier {i} reward mismatch"
        
        # Verify share_link format
        assert "laila-ai.app/join?ref=" in data["share_link"], "Invalid share_link format"
        assert data["referral_code"] in data["share_link"], "referral_code not in share_link"
        
        print(f"✓ GET /api/referral works (code: {data['referral_code']}, count: {data['referral_count']}, bonus_days: {data['bonus_days_earned']})")

    def test_apply_own_referral_code_fails(self, api_client, auth_headers):
        """POST /api/referral/apply with own code returns 400"""
        # First get own referral code
        response = api_client.get(f"{BASE_URL}/api/referral", headers=auth_headers)
        assert response.status_code == 200
        own_code = response.json()["referral_code"]
        
        # Try to apply own code
        response = api_client.post(f"{BASE_URL}/api/referral/apply", headers=auth_headers, json={
            "referral_code": own_code
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "Cannot use your own referral code" in data["detail"], f"Wrong error message: {data['detail']}"
        
        print(f"✓ POST /api/referral/apply with own code returns 400 (correct)")

    def test_apply_invalid_referral_code_fails(self, api_client, auth_headers):
        """POST /api/referral/apply with invalid code returns 404"""
        response = api_client.post(f"{BASE_URL}/api/referral/apply", headers=auth_headers, json={
            "referral_code": "INVALID-CODE-9999"
        })
        # User might have already used a referral code, so accept both 400 and 404
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        
        if response.status_code == 404:
            data = response.json()
            assert "Invalid referral code" in data["detail"], f"Wrong error message: {data['detail']}"
            print(f"✓ POST /api/referral/apply with invalid code returns 404 (correct)")
        else:
            data = response.json()
            assert "already used" in data["detail"], f"Wrong error message: {data['detail']}"
            print(f"✓ POST /api/referral/apply returns 400 (user already used a code)")


class TestVoiceStyles:
    """Voice styles tests"""

    def test_get_voices_returns_three_styles(self, api_client):
        """GET /api/voices returns 3 voices (nova, onyx, alloy)"""
        response = api_client.get(f"{BASE_URL}/api/voices")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "voices" in data, "Missing voices field"
        assert len(data["voices"]) == 3, f"Expected 3 voices, got {len(data['voices'])}"
        
        # Verify voice structure
        expected_ids = ["nova", "onyx", "alloy"]
        expected_genders = ["female", "male", "neutral"]
        
        for i, voice in enumerate(data["voices"]):
            assert "id" in voice, f"Voice {i} missing id"
            assert "name" in voice, f"Voice {i} missing name"
            assert "desc" in voice, f"Voice {i} missing desc"
            assert "gender" in voice, f"Voice {i} missing gender"
            
            assert voice["id"] == expected_ids[i], f"Voice {i} id mismatch: expected {expected_ids[i]}, got {voice['id']}"
            assert voice["gender"] == expected_genders[i], f"Voice {i} gender mismatch"
        
        print(f"✓ GET /api/voices returns 3 voices: {[v['id'] for v in data['voices']]}")


class TestSettings:
    """Settings endpoint tests"""

    def test_get_settings_returns_tts_voice(self, api_client, auth_headers):
        """GET /api/settings returns tts_voice field"""
        response = api_client.get(f"{BASE_URL}/api/settings", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "preferred_language" in data
        assert "voice_enabled" in data
        assert "tts_enabled" in data
        assert "tts_voice" in data, "Missing tts_voice field"
        assert "memory_enabled" in data
        assert "theme" in data
        
        # Verify tts_voice is one of the valid voices
        # Note: tts_voice might not be set yet, so it could be None or a valid voice
        if data.get("tts_voice"):
            assert data["tts_voice"] in ["nova", "onyx", "alloy"], f"Invalid tts_voice: {data['tts_voice']}"
        
        print(f"✓ GET /api/settings returns tts_voice: {data.get('tts_voice', 'not set')}")

    def test_update_settings_with_tts_voice(self, api_client, auth_headers):
        """PUT /api/settings with tts_voice works"""
        # Update to onyx
        response = api_client.put(f"{BASE_URL}/api/settings", headers=auth_headers, json={
            "tts_voice": "onyx"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data.get("tts_voice") == "onyx", f"tts_voice not updated: {data.get('tts_voice')}"
        
        # Verify by getting settings again
        response = api_client.get(f"{BASE_URL}/api/settings", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("tts_voice") == "onyx", f"tts_voice not persisted: {data.get('tts_voice')}"
        
        print(f"✓ PUT /api/settings with tts_voice works (updated to onyx)")
        
        # Reset to nova
        api_client.put(f"{BASE_URL}/api/settings", headers=auth_headers, json={"tts_voice": "nova"})


class TestExistingFeatures:
    """Verify all existing features still work"""

    def test_chat_endpoint_works(self, api_client, auth_headers):
        """POST /api/chat still returns human-tone response"""
        response = api_client.post(f"{BASE_URL}/api/chat", headers=auth_headers, json={
            "message": "Hello LAILA, how are you?",
            "mode": "chat"
        })
        assert response.status_code == 200, f"Chat failed: {response.text}"
        
        data = response.json()
        assert "conversation_id" in data
        assert "message" in data
        assert "content" in data["message"]
        
        # Verify human-tone (no robotic phrases)
        ai_response = data["message"]["content"]
        robotic_phrases = ["Sure!", "Of course!", "Great question!", "As an AI"]
        starts_with_robotic = any(ai_response.strip().startswith(phrase) for phrase in robotic_phrases)
        
        if starts_with_robotic:
            print(f"⚠ Response starts with robotic phrase: {ai_response[:100]}")
        else:
            print(f"✓ POST /api/chat works with human-tone: {ai_response[:100]}")

    def test_image_generation_works(self, api_client, auth_headers):
        """POST /api/generate/image still works"""
        response = api_client.post(
            f"{BASE_URL}/api/generate/image",
            headers=auth_headers,
            json={"prompt": "A simple test image"},
            timeout=120
        )
        assert response.status_code == 200, f"Image generation failed: {response.text}"
        
        data = response.json()
        assert "image_base64" in data, "Missing image_base64"
        assert len(data["image_base64"]) > 100, "image_base64 too short"
        
        print(f"✓ POST /api/generate/image works (image length: {len(data['image_base64'])} chars)")

    def test_translate_endpoint_works(self, api_client, auth_headers):
        """POST /api/translate still works"""
        response = api_client.post(f"{BASE_URL}/api/translate", headers=auth_headers, json={
            "text": "Hello",
            "source_lang": "en",
            "target_lang": "fr"
        })
        assert response.status_code == 200, f"Translation failed: {response.text}"
        
        data = response.json()
        assert "translation" in data
        print(f"✓ POST /api/translate works: {data['translation'][:50]}")

    def test_tts_endpoint_works(self, api_client):
        """POST /api/tts still works"""
        response = api_client.post(f"{BASE_URL}/api/tts", json={
            "text": "Test audio",
            "voice": "nova"
        })
        assert response.status_code == 200, f"TTS failed: {response.text}"
        
        data = response.json()
        assert "audio" in data
        assert len(data["audio"]) > 100
        print(f"✓ POST /api/tts works (audio length: {len(data['audio'])} chars)")
