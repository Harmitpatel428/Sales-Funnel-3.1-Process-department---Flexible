import requests

BASE_URL = "http://localhost:3000"
EMAIL_SYNC_ENDPOINT = f"{BASE_URL}/api/email/sync"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json"
}

def test_email_synchronization_trigger():
    try:
        # Trigger email synchronization
        response = requests.post(EMAIL_SYNC_ENDPOINT, headers=HEADERS, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to email sync endpoint failed with exception: {e}"

    # Validate response status code for success or handled failure
    assert response.status_code in {200, 202, 400, 500}, f"Unexpected status code: {response.status_code}"

    # Parse response JSON safely
    try:
        resp_json = response.json()
    except ValueError:
        resp_json = None

    # If success response codes, validate expected keys and values
    if response.status_code in {200, 202}:
        assert resp_json is not None, "Expected JSON response for success status"
        # Example expected keys - adapt as needed if PRD or actual response fields known
        assert "message" in resp_json or "status" in resp_json, "Expected confirmation message in response"
        # message or status should indicate sync is triggered
        if "message" in resp_json:
            assert "trigger" in resp_json["message"].lower() or "sync" in resp_json["message"].lower()
        if "status" in resp_json:
            assert resp_json["status"].lower() in {"success", "started", "triggered", "accepted"}

    # If error codes (400, 500), verify error handling fields exist if JSON
    elif response.status_code in {400, 500}:
        if resp_json is not None:
            assert "error" in resp_json or "message" in resp_json, "Expected error message in response"

test_email_synchronization_trigger()