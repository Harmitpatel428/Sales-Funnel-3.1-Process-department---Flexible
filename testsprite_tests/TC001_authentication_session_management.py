import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}

def test_authentication_session_management():
    # Test data
    valid_user = {"email": "testuser@example.com", "password": "correct_password"}
    invalid_user = {"email": "testuser@example.com", "password": "wrong_password"}
    new_password = "New_Secure_Password1!"

    session = requests.Session()
    try:
        # 1. Attempt login with valid credentials
        resp = session.post(
            f"{BASE_URL}/api/auth/login", json=valid_user, headers=HEADERS, timeout=TIMEOUT
        )
        assert resp.status_code == 200, f"Login failed with valid credentials: {resp.text}"
        login_data = resp.json()
        assert "token" in login_data and login_data["token"], "No session token received on login"
        token = login_data["token"]

        auth_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 2. Attempt login with invalid credentials
        resp_invalid = requests.post(
            f"{BASE_URL}/api/auth/login", json=invalid_user, headers=HEADERS, timeout=TIMEOUT
        )
        assert resp_invalid.status_code == 401 or resp_invalid.status_code == 400, "Invalid login did not fail as expected"

        # 3. Validate session token usage by accessing protected endpoint (e.g. password update)
        update_payload = {"oldPassword": valid_user["password"], "newPassword": new_password}
        resp_update_pw = session.put(
            f"{BASE_URL}/api/auth/password",
            json=update_payload,
            headers=auth_headers,
            timeout=TIMEOUT,
        )
        assert resp_update_pw.status_code == 200, f"Password update failed: {resp_update_pw.text}"

        # 4. Verify that after password update, old password no longer works:
        resp_old_pw_login = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": valid_user["email"], "password": valid_user["password"]},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_old_pw_login.status_code == 401 or resp_old_pw_login.status_code == 400, "Old password login succeeded unexpectedly"

        # 5. Verify login with new password works
        resp_new_pw_login = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": valid_user["email"], "password": new_password},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        assert resp_new_pw_login.status_code == 200, f"Login with new password failed: {resp_new_pw_login.text}"
        new_login_data = resp_new_pw_login.json()
        assert "token" in new_login_data and new_login_data["token"], "No session token received on login with new password"

        # 6. Logout via API
        new_token = new_login_data["token"]
        logout_headers = {"Authorization": f"Bearer {new_token}", "Content-Type": "application/json"}
        resp_logout = requests.post(f"{BASE_URL}/api/auth/logout", headers=logout_headers, timeout=TIMEOUT)
        assert resp_logout.status_code == 200, f"Logout failed: {resp_logout.text}"

        # 7. Access protected resource after logout to confirm token invalidation
        resp_post_logout = requests.put(
            f"{BASE_URL}/api/auth/password",
            json={"oldPassword": new_password, "newPassword": valid_user["password"]},
            headers=logout_headers,
            timeout=TIMEOUT,
        )
        assert resp_post_logout.status_code in (401, 403), "Access with logged out token succeeded unexpectedly"

        # 8. Reset password back to original for idempotency if allowed by server after logout failure or via another login
        resp_login_reset = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": valid_user["email"], "password": new_password},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        if resp_login_reset.status_code == 200:
            reset_token = resp_login_reset.json().get("token")
            if reset_token:
                reset_headers = {"Authorization": f"Bearer {reset_token}", "Content-Type": "application/json"}
                reset_pw_payload = {"oldPassword": new_password, "newPassword": valid_user["password"]}
                requests.put(
                    f"{BASE_URL}/api/auth/password",
                    json=reset_pw_payload,
                    headers=reset_headers,
                    timeout=TIMEOUT,
                )

    finally:
        session.close()


test_authentication_session_management()
