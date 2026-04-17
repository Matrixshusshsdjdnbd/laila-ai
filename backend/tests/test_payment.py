"""
Backend Payment/Premium tests for LAILA AI - Iteration 6
Tests: GET /api/payment/plans, POST /api/payment/initiate, GET /api/payment/status, GET /api/payment/history
Tests: User tier upgrade to premium after payment
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

# Test user credentials from test_credentials.md
TEST_EMAIL = "test@laila.ai"
TEST_PASSWORD = "Test1234!"

# Create unique test user for payment tests
PAYMENT_TEST_EMAIL = f"test_payment_{int(time.time())}@laila.ai"
PAYMENT_TEST_PASSWORD = "PayTest123!"


class TestPaymentPlans:
    """Test GET /api/payment/plans"""
    
    def test_get_plans_returns_3_plans(self):
        """Test /api/payment/plans returns 3 subscription plans"""
        response = requests.get(f"{BASE_URL}/api/payment/plans")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "plans" in data, "Response should have 'plans' field"
        assert "free_limit" in data, "Response should have 'free_limit' field"
        
        plans = data["plans"]
        assert len(plans) == 3, f"Expected 3 plans, got {len(plans)}"
        
        # Verify plan structure
        for plan in plans:
            assert "id" in plan, "Plan missing 'id'"
            assert "name" in plan, "Plan missing 'name'"
            assert "price" in plan, "Plan missing 'price'"
            assert "currency" in plan, "Plan missing 'currency'"
            assert "duration_days" in plan, "Plan missing 'duration_days'"
            assert "description" in plan, "Plan missing 'description'"
        
        print(f"✓ GET /api/payment/plans returns {len(plans)} plans")
        print(f"  Free limit: {data['free_limit']} messages/day")
    
    def test_plans_have_correct_ids(self):
        """Test plans have expected IDs: weekly, monthly, yearly"""
        response = requests.get(f"{BASE_URL}/api/payment/plans")
        assert response.status_code == 200
        
        data = response.json()
        plan_ids = [p["id"] for p in data["plans"]]
        
        assert "weekly" in plan_ids, "Missing 'weekly' plan"
        assert "monthly" in plan_ids, "Missing 'monthly' plan"
        assert "yearly" in plan_ids, "Missing 'yearly' plan"
        
        print(f"✓ Plans have correct IDs: {plan_ids}")
    
    def test_plans_have_correct_prices_fcfa(self):
        """Test plans have expected prices in FCFA"""
        response = requests.get(f"{BASE_URL}/api/payment/plans")
        assert response.status_code == 200
        
        data = response.json()
        plans_by_id = {p["id"]: p for p in data["plans"]}
        
        # Verify prices from problem statement
        assert plans_by_id["weekly"]["price"] == 500, "Weekly plan should be 500 FCFA"
        assert plans_by_id["monthly"]["price"] == 1500, "Monthly plan should be 1500 FCFA"
        assert plans_by_id["yearly"]["price"] == 12000, "Yearly plan should be 12000 FCFA"
        
        # Verify currency
        for plan in data["plans"]:
            assert plan["currency"] == "FCFA", f"Currency should be FCFA, got {plan['currency']}"
        
        print(f"✓ Plans have correct prices:")
        print(f"  Weekly: {plans_by_id['weekly']['price']} FCFA")
        print(f"  Monthly: {plans_by_id['monthly']['price']} FCFA")
        print(f"  Yearly: {plans_by_id['yearly']['price']} FCFA")
    
    def test_plans_have_correct_durations(self):
        """Test plans have expected duration_days"""
        response = requests.get(f"{BASE_URL}/api/payment/plans")
        assert response.status_code == 200
        
        data = response.json()
        plans_by_id = {p["id"]: p for p in data["plans"]}
        
        assert plans_by_id["weekly"]["duration_days"] == 7, "Weekly should be 7 days"
        assert plans_by_id["monthly"]["duration_days"] == 30, "Monthly should be 30 days"
        assert plans_by_id["yearly"]["duration_days"] == 365, "Yearly should be 365 days"
        
        print(f"✓ Plans have correct durations (7, 30, 365 days)")


class TestPaymentInitiate:
    """Test POST /api/payment/initiate"""
    
    @classmethod
    def setup_class(cls):
        """Create test user and login"""
        # Register new user for payment tests
        register_payload = {
            "email": PAYMENT_TEST_EMAIL,
            "password": PAYMENT_TEST_PASSWORD,
            "name": "Payment Test User"
        }
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        
        if reg_response.status_code == 200:
            data = reg_response.json()
            cls.auth_token = data["token"]
            cls.user_id = data["user_id"]
            print(f"✓ Test user created: {PAYMENT_TEST_EMAIL}")
        else:
            # User might already exist, try login
            login_payload = {"email": PAYMENT_TEST_EMAIL, "password": PAYMENT_TEST_PASSWORD}
            login_response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
            if login_response.status_code == 200:
                data = login_response.json()
                cls.auth_token = data["token"]
                cls.user_id = data["user_id"]
                print(f"✓ Logged in as: {PAYMENT_TEST_EMAIL}")
            else:
                pytest.fail(f"Could not create or login test user: {reg_response.text}")
    
    def test_initiate_payment_requires_auth(self):
        """Test /api/payment/initiate requires authentication"""
        payload = {
            "plan_id": "monthly",
            "payment_method": "wave",
            "phone_number": "+221770000000"
        }
        response = requests.post(f"{BASE_URL}/api/payment/initiate", json=payload)
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        
        print(f"✓ Payment initiate requires auth (401 without token)")
    
    def test_initiate_payment_invalid_plan_fails(self):
        """Test payment with invalid plan_id returns 400"""
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        payload = {
            "plan_id": "invalid_plan",
            "payment_method": "wave"
        }
        response = requests.post(f"{BASE_URL}/api/payment/initiate", json=payload, headers=headers)
        assert response.status_code == 400, f"Expected 400 for invalid plan, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "invalid plan" in data["detail"].lower()
        
        print(f"✓ Invalid plan rejected: {data['detail']}")
    
    def test_initiate_payment_invalid_method_fails(self):
        """Test payment with invalid payment_method returns 400"""
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        payload = {
            "plan_id": "monthly",
            "payment_method": "invalid_method"
        }
        response = requests.post(f"{BASE_URL}/api/payment/initiate", json=payload, headers=headers)
        assert response.status_code == 400, f"Expected 400 for invalid method, got {response.status_code}"
        
        data = response.json()
        assert "detail" in data
        assert "invalid payment method" in data["detail"].lower()
        
        print(f"✓ Invalid payment method rejected: {data['detail']}")
    
    def test_initiate_payment_wave_success(self):
        """Test payment initiation with Wave (mock mode auto-completes)"""
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        payload = {
            "plan_id": "monthly",
            "payment_method": "wave",
            "phone_number": "+221770000000"
        }
        response = requests.post(f"{BASE_URL}/api/payment/initiate", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "payment_id" in data, "Missing payment_id"
        assert "user_id" in data, "Missing user_id"
        assert "plan_id" in data, "Missing plan_id"
        assert "amount" in data, "Missing amount"
        assert "currency" in data, "Missing currency"
        assert "payment_method" in data, "Missing payment_method"
        assert "status" in data, "Missing status"
        
        # In mock mode, payment should be completed immediately
        assert data["status"] == "completed", f"Mock payment should be completed, got {data['status']}"
        assert data["plan_id"] == "monthly"
        assert data["amount"] == 1500
        assert data["currency"] == "FCFA"
        assert data["payment_method"] == "wave"
        
        # Store payment_id for status check
        pytest.payment_id_wave = data["payment_id"]
        
        print(f"✓ Wave payment initiated and completed (mock mode)")
        print(f"  Payment ID: {data['payment_id']}")
        print(f"  Amount: {data['amount']} {data['currency']}")
    
    def test_initiate_payment_orange_money_success(self):
        """Test payment initiation with Orange Money"""
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        payload = {
            "plan_id": "weekly",
            "payment_method": "orange_money",
            "phone_number": "+221770000001"
        }
        response = requests.post(f"{BASE_URL}/api/payment/initiate", json=payload, headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["status"] == "completed", "Mock payment should be completed"
        assert data["plan_id"] == "weekly"
        assert data["amount"] == 500
        assert data["payment_method"] == "orange_money"
        
        pytest.payment_id_orange = data["payment_id"]
        
        print(f"✓ Orange Money payment initiated and completed (mock mode)")
        print(f"  Payment ID: {data['payment_id']}")
    
    def test_payment_upgrades_user_to_premium(self):
        """Test successful payment upgrades user tier to premium"""
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        
        # Check user tier after payment
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_response.status_code == 200, f"Failed to get user data: {me_response.status_code}"
        
        user_data = me_response.json()
        assert "tier" in user_data, "Missing tier field"
        assert user_data["tier"] == "premium", f"User should be premium after payment, got {user_data['tier']}"
        
        print(f"✓ User upgraded to premium tier after payment")
        print(f"  Tier: {user_data['tier']}")


class TestPaymentStatus:
    """Test GET /api/payment/status/{payment_id}"""
    
    def test_payment_status_requires_auth(self):
        """Test /api/payment/status requires authentication"""
        response = requests.get(f"{BASE_URL}/api/payment/status/test_payment_id")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        
        print(f"✓ Payment status requires auth")
    
    def test_payment_status_not_found(self):
        """Test payment status with nonexistent payment_id returns 404"""
        # Use existing test user
        login_payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/payment/status/nonexistent_payment_id", headers=headers)
        assert response.status_code == 404, f"Expected 404 for nonexistent payment, got {response.status_code}"
        
        print(f"✓ Nonexistent payment returns 404")
    
    def test_payment_status_success(self):
        """Test payment status returns payment details"""
        if not hasattr(pytest, 'payment_id_wave'):
            pytest.skip("No payment_id from previous test")
        
        # Login as payment test user
        login_payload = {"email": PAYMENT_TEST_EMAIL, "password": PAYMENT_TEST_PASSWORD}
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/payment/status/{pytest.payment_id_wave}", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "payment_id" in data
        assert "status" in data
        assert "plan_id" in data
        assert "amount" in data
        assert data["payment_id"] == pytest.payment_id_wave
        assert data["status"] == "completed"
        
        print(f"✓ Payment status retrieved successfully")
        print(f"  Status: {data['status']}")


class TestPaymentHistory:
    """Test GET /api/payment/history"""
    
    def test_payment_history_requires_auth(self):
        """Test /api/payment/history requires authentication"""
        response = requests.get(f"{BASE_URL}/api/payment/history")
        assert response.status_code == 401, f"Expected 401 without auth, got {response.status_code}"
        
        print(f"✓ Payment history requires auth")
    
    def test_payment_history_returns_user_payments(self):
        """Test payment history returns list of user's payments"""
        # Login as payment test user
        login_payload = {"email": PAYMENT_TEST_EMAIL, "password": PAYMENT_TEST_PASSWORD}
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/payment/history", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "payments" in data, "Response should have 'payments' field"
        assert isinstance(data["payments"], list), "Payments should be a list"
        
        # Should have at least 2 payments from previous tests (Wave + Orange Money)
        assert len(data["payments"]) >= 2, f"Expected at least 2 payments, got {len(data['payments'])}"
        
        # Verify payment structure
        for payment in data["payments"]:
            assert "payment_id" in payment
            assert "plan_id" in payment
            assert "amount" in payment
            assert "status" in payment
            assert "payment_method" in payment
            assert "created_at" in payment
        
        print(f"✓ Payment history retrieved: {len(data['payments'])} payments")
        for p in data["payments"][:3]:  # Show first 3
            print(f"  - {p['plan_id']}: {p['amount']} {p['currency']} via {p['payment_method']} ({p['status']})")
    
    def test_payment_history_empty_for_new_user(self):
        """Test payment history is empty for user with no payments"""
        # Create new user
        new_email = f"test_no_payments_{int(time.time())}@laila.ai"
        register_payload = {
            "email": new_email,
            "password": "TestPass123!",
            "name": "No Payments User"
        }
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=register_payload)
        assert reg_response.status_code == 200
        token = reg_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/payment/history", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data["payments"]) == 0, "New user should have no payment history"
        
        print(f"✓ New user has empty payment history")


class TestExistingEndpointsRegression:
    """Verify existing endpoints still work after payment feature addition"""
    
    def test_auth_register_still_works(self):
        """Test POST /api/auth/register still works"""
        email = f"test_reg_{int(time.time())}@laila.ai"
        payload = {"email": email, "password": "TestPass123!", "name": "Test"}
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Register broken: {response.status_code}"
        
        data = response.json()
        assert "token" in data
        assert data["tier"] == "free", "New users should start as free tier"
        
        print(f"✓ POST /api/auth/register still works")
    
    def test_auth_login_still_works(self):
        """Test POST /api/auth/login still works"""
        payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        assert response.status_code == 200, f"Login broken: {response.status_code}"
        
        data = response.json()
        assert "token" in data
        
        print(f"✓ POST /api/auth/login still works")
    
    def test_chat_endpoint_still_works(self):
        """Test POST /api/chat still works"""
        # Login first
        login_payload = {"email": TEST_EMAIL, "password": TEST_PASSWORD}
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json=login_payload)
        assert login_response.status_code == 200
        token = login_response.json()["token"]
        
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"message": "Hello LAILA, test message", "mode": "chat"}
        response = requests.post(f"{BASE_URL}/api/chat", json=payload, headers=headers)
        assert response.status_code == 200, f"Chat broken: {response.status_code}"
        
        data = response.json()
        assert "message" in data
        
        print(f"✓ POST /api/chat still works")


# Cleanup
class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_note(self):
        """Note about test data cleanup"""
        print(f"✓ Test users created:")
        print(f"  - {PAYMENT_TEST_EMAIL} (with payments)")
        print(f"  Note: Manual cleanup may be needed if DELETE endpoint not implemented")
