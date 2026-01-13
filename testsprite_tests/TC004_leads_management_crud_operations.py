import requests

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_leads_management_crud_operations():
    # Authenticate first to get a session token (assumed /api/auth/login endpoint with POST)
    login_url = f"{BASE_URL}/api/auth/login"
    login_payload = {
        "username": "testuser",
        "password": "testpassword"
    }
    headers = {"Content-Type": "application/json"}
    session = requests.Session()
    try:
        login_resp = session.post(login_url, json=login_payload, headers=headers, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        assert "token" in login_data or "accessToken" in login_data, "No session token in login response"
        token = login_data.get("token") or login_data.get("accessToken")
        auth_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        # 1. CREATE a lead
        create_url = f"{BASE_URL}/api/leads"
        lead_payload = {
            "name": "Test Lead",
            "email": "lead@example.com",
            "phone": "1234567890",
            "status": "new",
            "source": "web",
            "company": "Test Company",
            "title": "Manager",
            "notes": "Initial test lead"
        }
        create_resp = session.post(create_url, json=lead_payload, headers=auth_headers, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Lead creation failed with status {create_resp.status_code}"
        lead_data = create_resp.json()
        assert "id" in lead_data, "Created lead response missing id"
        lead_id = lead_data["id"]

        # 2. READ the lead
        read_url = f"{BASE_URL}/api/leads/{lead_id}"
        read_resp = session.get(read_url, headers=auth_headers, timeout=TIMEOUT)
        assert read_resp.status_code == 200, f"Lead retrieval failed with status {read_resp.status_code}"
        read_data = read_resp.json()
        for key in lead_payload:
            assert read_data.get(key) == lead_payload[key], f"Lead data mismatch on {key}"

        # 3. UPDATE the lead
        update_url = f"{BASE_URL}/api/leads/{lead_id}"
        update_payload = {
            "status": "contacted",
            "notes": "Lead has been contacted"
        }
        update_resp = session.put(update_url, json=update_payload, headers=auth_headers, timeout=TIMEOUT)
        assert update_resp.status_code == 200, f"Lead update failed with status {update_resp.status_code}"
        updated_lead = update_resp.json()
        assert updated_lead.get("status") == "contacted", "Lead status was not updated"
        assert updated_lead.get("notes") == "Lead has been contacted", "Lead notes were not updated"

        # 4. DELETE the lead
        delete_url = f"{BASE_URL}/api/leads/{lead_id}"
        delete_resp = session.delete(delete_url, headers=auth_headers, timeout=TIMEOUT)
        assert delete_resp.status_code == 204, f"Lead deletion failed with status {delete_resp.status_code}"

        # Confirm lead deletion
        confirm_resp = session.get(read_url, headers=auth_headers, timeout=TIMEOUT)
        assert confirm_resp.status_code == 404, "Deleted lead still retrievable"

    finally:
        # Cleanup in case lead still exists (best effort)
        if 'lead_id' in locals():
            try:
                session.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=auth_headers, timeout=TIMEOUT)
            except Exception:
                pass

test_leads_management_crud_operations()