import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_authentication_session_management():
    session = requests.Session()
    try:
        # 1. Login with default credentials
        login_payload = {
            "email": "default_user@example.com",
            "password": "default_password"
        }
        login_resp = session.post(f"{BASE_URL}/api/auth/login", json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        login_data = login_resp.json()
        assert "token" in login_data or "sessionId" in login_data, "Login response missing token/sessionId"
        
        # Store auth token or session cookie if provided
        if "token" in login_data:
            token = login_data["token"]
            session.headers.update({"Authorization": f"Bearer {token}"})
        
        # 2. Access a protected endpoint to verify session validity
        dashboard_resp = session.get(f"{BASE_URL}/api/dashboard", timeout=TIMEOUT)
        assert dashboard_resp.status_code == 200, "Failed to access protected dashboard endpoint after login"
        
        # 3. Update password
        update_password_payload = {
            "oldPassword": "default_password",
            "newPassword": "NewPassword123!"
        }
        password_resp = session.put(f"{BASE_URL}/api/auth/password", json=update_password_payload, timeout=TIMEOUT)
        assert password_resp.status_code == 200, f"Password update failed: {password_resp.text}"
        
        # 4. Logout
        logout_resp = session.post(f"{BASE_URL}/api/auth/logout", timeout=TIMEOUT)
        assert logout_resp.status_code == 200, f"Logout failed: {logout_resp.text}"
        
        # 5. Verify session is invalid after logout
        dashboard_resp_after_logout = session.get(f"{BASE_URL}/api/dashboard", timeout=TIMEOUT)
        assert dashboard_resp_after_logout.status_code in (401, 403), "Session still valid after logout"

        # 6. Revert password back to default for test repeatability (login needed)
        relogin_payload = {
            "email": "default_user@example.com",
            "password": "NewPassword123!"
        }
        relogin_resp = session.post(f"{BASE_URL}/api/auth/login", json=relogin_payload, timeout=TIMEOUT)
        assert relogin_resp.status_code == 200, f"Re-login failed for reverting password: {relogin_resp.text}"
        
        if "token" in relogin_resp.json():
            relogin_token = relogin_resp.json()["token"]
            session.headers.update({"Authorization": f"Bearer {relogin_token}"})
        else:
            session.headers.pop("Authorization", None)
        
        revert_password_payload = {
            "oldPassword": "NewPassword123!",
            "newPassword": "default_password"
        }
        revert_password_resp = session.put(f"{BASE_URL}/api/auth/password", json=revert_password_payload, timeout=TIMEOUT)
        assert revert_password_resp.status_code == 200, f"Reverting password failed: {revert_password_resp.text}"

    finally:
        # Cleanup: Logout to invalidate session if still logged in
        try:
            session.post(f"{BASE_URL}/api/auth/logout", timeout=TIMEOUT)
        except Exception:
            pass

test_authentication_session_management()