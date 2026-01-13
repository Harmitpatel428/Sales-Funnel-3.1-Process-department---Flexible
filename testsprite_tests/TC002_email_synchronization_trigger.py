import requests

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_email_synchronization_trigger():
    login_url = f"{BASE_URL}/api/auth/login"
    email_sync_url = f"{BASE_URL}/api/email/sync"

    valid_credentials = {
        "email": "testuser@example.com",
        "password": "correct_password"
    }
    invalid_credentials = {
        "email": "testuser@example.com",
        "password": "wrong_password"
    }

    headers = {"Content-Type": "application/json"}

    # 1. Login with valid credentials to get a valid session token
    resp_login_valid = requests.post(login_url, json=valid_credentials, headers=headers, timeout=TIMEOUT)
    assert resp_login_valid.status_code == 200, f"Valid login failed: {resp_login_valid.text}"
    token = resp_login_valid.json().get("token")
    assert token and isinstance(token, str), "No token received on valid login"

    auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # 2. Trigger email sync with valid token, expecting success
    resp_sync_valid = requests.post(email_sync_url, headers=auth_headers, timeout=TIMEOUT)
    assert resp_sync_valid.status_code == 200, f"Email sync trigger failed with valid token: {resp_sync_valid.text}"
    # Assuming API returns JSON with success status
    json_sync = resp_sync_valid.json()
    assert json_sync.get("status") == "success" or json_sync.get("message"), \
        f"Unexpected response content on valid email sync: {json_sync}"

    # 3. Attempt email sync with invalid token, expect auth failure (401 or 403)
    invalid_auth_headers = {"Authorization": "Bearer invalid_token_123", "Content-Type": "application/json"}
    resp_sync_invalid_token = requests.post(email_sync_url, headers=invalid_auth_headers, timeout=TIMEOUT)
    assert resp_sync_invalid_token.status_code in (401, 403), \
        f"Email sync did not fail as expected with invalid token: {resp_sync_invalid_token.status_code}"

    # 4. Attempt login with invalid credentials, expect failure (401)
    resp_login_invalid = requests.post(login_url, json=invalid_credentials, headers=headers, timeout=TIMEOUT)
    assert resp_login_invalid.status_code == 401, f"Login succeeded with invalid credentials: {resp_login_invalid.text}"

test_email_synchronization_trigger()