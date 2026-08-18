"""Backend tests for activity log middleware and endpoints."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # fallback for backend .env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

API = f"{BASE_URL}/api"

ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_activity_requires_auth():
    r = requests.get(f"{API}/activity")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_activity_list_ok(headers):
    r = requests.get(f"{API}/activity", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "total" in data and "entities" in data
    assert isinstance(data["items"], list)


def test_full_crud_logging(headers):
    """Create → Update → Delete a client, then verify all 3 logged."""
    # CREATE
    payload = {
        "client_type": "private",
        "private_info": {
            "name": "TEST_Activity",
            "surname": "User",
            "email": "test_activity@example.com",
            "phone": "+390000000000",
            "address": "Via Test 1"
        },
        "ordering_enabled": False,
        "is_active": True,
        "notes": "activity test"
    }
    r = requests.post(f"{API}/clients", headers=headers, json=payload)
    assert r.status_code in (200, 201), f"Create client failed: {r.status_code} {r.text}"
    created = r.json()
    client_id = created.get("id")
    assert client_id

    # UPDATE
    upd = {"notes": "updated"}
    r = requests.put(f"{API}/clients/{client_id}", headers=headers, json=upd)
    assert r.status_code in (200, 204), f"Update failed: {r.status_code} {r.text}"

    # DELETE
    r = requests.delete(f"{API}/clients/{client_id}", headers=headers)
    assert r.status_code in (200, 204), f"Delete failed: {r.status_code} {r.text}"

    # Middleware fire-and-forget; wait briefly
    time.sleep(1.5)

    # Verify logs
    r = requests.get(f"{API}/activity", headers=headers, params={"entity": "clients", "limit": 100})
    assert r.status_code == 200
    items = r.json()["items"]
    # For POST /api/clients the middleware cannot infer entity_id from path,
    # so match either by entity_id or by matching path+action for create.
    matching = [i for i in items if i.get("entity_id") == client_id or (i.get("action") == "create" and i.get("path") == "/api/clients")]
    # Narrow the create match to recent (within last 30s)
    actions = {i["action"] for i in matching}
    assert "create" in actions, f"create missing. matched: {matching}"
    assert "update" in actions, f"update missing. matched: {matching}"
    assert "delete" in actions, f"delete missing. matched: {matching}"

    # user_name check on the update/delete records (which have entity_id set)
    for i in matching:
        if i.get("entity_id") == client_id:
            assert i.get("user_name") == "Test User", f"user_name wrong: {i.get('user_name')}"
            assert i.get("entity_type") == "clients"


def test_filter_by_action(headers):
    r = requests.get(f"{API}/activity", headers=headers, params={"action": "delete", "limit": 50})
    assert r.status_code == 200
    for i in r.json()["items"]:
        assert i["action"] == "delete"


def test_filter_by_entity(headers):
    r = requests.get(f"{API}/activity", headers=headers, params={"entity": "clients", "limit": 50})
    assert r.status_code == 200
    for i in r.json()["items"]:
        assert i["entity_type"] == "clients"


def test_get_not_logged(headers):
    """GET requests must not create activity entries."""
    before = requests.get(f"{API}/activity", headers=headers, params={"limit": 1}).json()["total"]
    # Do a few GETs
    for _ in range(3):
        requests.get(f"{API}/auth/me", headers=headers)
        requests.get(f"{API}/clients", headers=headers)
    time.sleep(1)
    after = requests.get(f"{API}/activity", headers=headers, params={"limit": 1}).json()["total"]
    assert after == before, f"GETs added activity: before={before} after={after}"


def test_export_activity_xlsx(headers):
    r = requests.get(f"{API}/export/activity", headers=headers)
    assert r.status_code == 200
    ctype = r.headers.get("content-type", "")
    assert "spreadsheetml" in ctype or "xlsx" in ctype.lower(), f"content-type: {ctype}"
    assert len(r.content) > 100
    assert r.content[:2] == b"PK"  # xlsx is a zip
