import requests

BASE_URL = "http://localhost:3001"
TIMEOUT = 30

def test_email_parsing_functionality():
    parse_email_url = f"{BASE_URL}/api/email/parse"
    # Sample raw email data for parsing
    sample_email = {
        "rawEmail": """From: sender@example.com
To: receiver@example.com
Subject: Test Email Parsing
Date: Fri, 13 Jan 2026 10:00:00 +0000

This is a test email for parsing functionality."""
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(parse_email_url, json=sample_email, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to parse email failed: {e}"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    json_resp = response.json()
    # Validate structure and expected keys in the parsing result
    expected_keys = {"from", "to", "subject", "date", "body", "headers"}
    assert isinstance(json_resp, dict), "Response JSON is not a dictionary"
    assert expected_keys.issubset(json_resp.keys()), f"Response JSON missing expected keys: {expected_keys - json_resp.keys()}"
    # Basic validation of parsed content values
    assert json_resp["from"] == "sender@example.com"
    assert json_resp["to"] == "receiver@example.com"
    assert json_resp["subject"] == "Test Email Parsing"
    assert "This is a test email for parsing functionality." in json_resp["body"]

test_email_parsing_functionality()
