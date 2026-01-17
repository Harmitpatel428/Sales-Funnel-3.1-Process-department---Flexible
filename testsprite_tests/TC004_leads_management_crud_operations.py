import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    # Add authentication header here if required, e.g., "Authorization": "Bearer <token>"
}

def test_leads_management_crud_operations():
    lead_data_create = {
        "name": "Test Lead",
        "email": "test.lead@example.com",
        "phone": "+1234567890",
        "company": "Test Company",
        "status": "new",
        "source": "web",
        "notes": "Initial test lead creation"
    }
    lead_data_update = {
        "name": "Updated Test Lead",
        "email": "updated.lead@example.com",
        "phone": "+1987654321",
        "company": "Updated Test Company",
        "status": "contacted",
        "source": "email",
        "notes": "Updated notes for test lead"
    }

    lead_id = None
    try:
        # Create lead (POST /api/leads)
        response_create = requests.post(
            f"{BASE_URL}/api/leads",
            json=lead_data_create,
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert response_create.status_code == 201 or response_create.status_code == 200, \
            f"Lead creation failed: {response_create.status_code} {response_create.text}"
        created_lead = response_create.json()
        assert "id" in created_lead, "Created lead response missing 'id'"
        lead_id = created_lead["id"]

        # Read lead (GET /api/leads/{id})
        response_read = requests.get(
            f"{BASE_URL}/api/leads/{lead_id}",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert response_read.status_code == 200, f"Lead read failed: {response_read.status_code} {response_read.text}"
        read_lead = response_read.json()
        assert read_lead["id"] == lead_id, "Lead ID mismatch on read"
        for key in lead_data_create:
            assert read_lead.get(key) == lead_data_create[key], f"Mismatch in read field {key}"

        # Update lead (PUT /api/leads/{id})
        response_update = requests.put(
            f"{BASE_URL}/api/leads/{lead_id}",
            json=lead_data_update,
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert response_update.status_code == 200, f"Lead update failed: {response_update.status_code} {response_update.text}"
        updated_lead = response_update.json()
        assert updated_lead["id"] == lead_id, "Lead ID mismatch on update"
        for key in lead_data_update:
            assert updated_lead.get(key) == lead_data_update[key], f"Mismatch in updated field {key}"

        # Confirm update by reading again
        response_read_after_update = requests.get(
            f"{BASE_URL}/api/leads/{lead_id}",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert response_read_after_update.status_code == 200, f"Lead read after update failed: {response_read_after_update.status_code} {response_read_after_update.text}"
        read_after_update = response_read_after_update.json()
        for key in lead_data_update:
            assert read_after_update.get(key) == lead_data_update[key], f"Mismatch in read-after-update field {key}"

        # Delete lead (DELETE /api/leads/{id})
        response_delete = requests.delete(
            f"{BASE_URL}/api/leads/{lead_id}",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert response_delete.status_code == 200 or response_delete.status_code == 204, \
            f"Lead delete failed: {response_delete.status_code} {response_delete.text}"

        # Confirm deletion by attempting to read
        response_read_after_delete = requests.get(
            f"{BASE_URL}/api/leads/{lead_id}",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert response_read_after_delete.status_code == 404, \
            f"Deleted lead still accessible: {response_read_after_delete.status_code} {response_read_after_delete.text}"

    finally:
        # Cleanup: try to delete lead if still exists
        if lead_id is not None:
            try:
                requests.delete(f"{BASE_URL}/api/leads/{lead_id}", headers=HEADERS, timeout=TIMEOUT)
            except Exception:
                pass

test_leads_management_crud_operations()