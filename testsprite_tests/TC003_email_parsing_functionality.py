import requests

BASE_URL = "http://localhost:3000"
EMAIL_PARSE_ENDPOINT = f"{BASE_URL}/api/email/parse"
TIMEOUT = 30

def test_email_parsing_functionality():
    # Sample raw email content for parsing
    raw_email = (
        "From: sender@example.com\r\n"
        "To: recipient@example.com\r\n"
        "Subject: Test Email Parsing\r\n"
        "Date: Wed, 15 Jun 2022 16:02:00 +0000\r\n"
        "\r\n"
        "This is a test email body.\r\n"
        "Best regards,\r\n"
        "Sender"
    )
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "rawEmail": raw_email
    }

    try:
        response = requests.post(EMAIL_PARSE_ENDPOINT, json=payload, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        assert False, f"Request failed: {e}"

    parsed_data = response.json()

    # Assertions based on expected parsing result structure
    assert isinstance(parsed_data, dict), "Parsed data should be a dictionary"
    assert "from" in parsed_data, "'from' field missing in parsed data"
    assert "to" in parsed_data, "'to' field missing in parsed data"
    assert "subject" in parsed_data, "'subject' field missing in parsed data"
    assert "date" in parsed_data, "'date' field missing in parsed data"
    assert "body" in parsed_data, "'body' field missing in parsed data"

    assert parsed_data["from"] == "sender@example.com", "Incorrect 'from' field parsing"
    assert parsed_data["to"] == "recipient@example.com", "Incorrect 'to' field parsing"
    assert parsed_data["subject"] == "Test Email Parsing", "Incorrect 'subject' field parsing"
    assert parsed_data["date"] == "Wed, 15 Jun 2022 16:02:00 +0000", "Incorrect 'date' field parsing"
    assert "This is a test email body." in parsed_data["body"], "Email body text missing or incorrect"

test_email_parsing_functionality()