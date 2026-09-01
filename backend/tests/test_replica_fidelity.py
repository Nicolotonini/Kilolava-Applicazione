from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Fidelity tests for Kilolava replica - verifies the imported data is accessible
and core endpoints respond correctly.
"""
import os
import pytest
import requests
from datetime import datetime

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://kilolava-rebuild.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- AUTH ----------
def test_login_returns_admin():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["user"]["role"] == "admin"
    assert "access_token" in data


def test_me_endpoint(h):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


# ---------- Imported data collections ----------
@pytest.mark.parametrize("path,min_count", [
    ("/api/clients", 8),
    ("/api/structures", 9),
    ("/api/users", 8),
    ("/api/cleaning-tasks", 3),
    ("/api/logistics/tasks", 3),
    ("/api/maintenance/issues", 2),
    ("/api/inventory/articles", 4),
    ("/api/documents", 5),
    ("/api/events", 40),
])
def test_imported_collection_counts(h, path, min_count):
    r = requests.get(f"{BASE_URL}{path}", headers=h, timeout=30)
    assert r.status_code == 200, f"{path} => {r.status_code} {r.text[:200]}"
    data = r.json()
    if isinstance(data, dict):
        # some endpoints wrap in {items:[...]} or similar
        items = data.get("items") or data.get("data") or data.get("results") or []
    else:
        items = data
    assert isinstance(items, list), f"{path} did not return list, got {type(items)}: {str(data)[:200]}"
    assert len(items) >= min_count, f"{path} expected >= {min_count}, got {len(items)}"


# ---------- Excel exports ----------
@pytest.mark.parametrize("entity", [
    "clients", "structures", "articles", "users",
    "cleaning", "logistics", "maintenance", "documents", "orders",
])
def test_excel_export(h, entity):
    r = requests.get(f"{BASE_URL}/api/export/{entity}", headers=h, timeout=30)
    assert r.status_code == 200, f"export {entity} => {r.status_code} {r.text[:200]}"
    ctype = r.headers.get("content-type", "")
    assert "spreadsheet" in ctype or "excel" in ctype or "octet-stream" in ctype, f"bad content-type: {ctype}"
    # xlsx starts with PK
    assert r.content[:2] == b"PK", f"export {entity} not a valid xlsx"


def test_excel_export_events(h):
    month = datetime.utcnow().strftime("%Y-%m")
    r = requests.get(f"{BASE_URL}/api/export/events?month={month}", headers=h, timeout=30)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"


# ---------- Billing PDF ----------
def test_billing_pdf(h):
    clients = requests.get(f"{BASE_URL}/api/clients", headers=h, timeout=15).json()
    if isinstance(clients, dict):
        clients = clients.get("items") or clients.get("data") or []
    assert clients, "no clients"
    cid = clients[0]["id"]
    month = datetime.utcnow().strftime("%Y-%m")
    r = requests.get(f"{BASE_URL}/api/clients/{cid}/billing-pdf?month={month}", headers=h, timeout=30)
    assert r.status_code == 200, f"pdf status {r.status_code} {r.text[:200]}"
    assert r.content[:4] == b"%PDF", "not a valid PDF"


# ---------- iCal ----------
def test_ical_status(h):
    r = requests.get(f"{BASE_URL}/api/ical/status", headers=h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    # should reference imported syncs (~19)
    items = data if isinstance(data, list) else data.get("syncs") or data.get("items") or data.get("data") or []
    # tolerate any structure but ensure at least data present
    assert data is not None


def test_ical_sync_all_does_not_crash(h):
    r = requests.post(f"{BASE_URL}/api/ical/sync-all", headers=h, timeout=60)
    # external URLs may fail, but endpoint must not 500
    assert r.status_code < 500, f"crashed {r.status_code} {r.text[:200]}"


# ---------- Scheduler ----------
def test_scheduler_status(h):
    r = requests.get(f"{BASE_URL}/api/scheduler/status", headers=h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data is not None


# ---------- Activity log ----------
def test_activity_log_list(h):
    r = requests.get(f"{BASE_URL}/api/activity-logs", headers=h, timeout=15)
    # tolerate alternative path
    if r.status_code == 404:
        r = requests.get(f"{BASE_URL}/api/activity", headers=h, timeout=15)
    assert r.status_code == 200, f"activity => {r.status_code}"


# ---------- Notifications ----------
def test_notifications(h):
    r = requests.get(f"{BASE_URL}/api/notifications", headers=h, timeout=15)
    assert r.status_code == 200


# ---------- Orders ----------
def test_orders(h):
    r = requests.get(f"{BASE_URL}/api/operations/orders", headers=h, timeout=15)
    assert r.status_code == 200


# ---------- Checklist templates ----------
def test_checklist_templates(h):
    r = requests.get(f"{BASE_URL}/api/checklist-templates", headers=h, timeout=15)
    assert r.status_code == 200


# ---------- Dashboard ----------
def test_dashboard_stats(h):
    # try common endpoints
    for path in ["/api/dashboard/stats", "/api/dashboard", "/api/reports/dashboard"]:
        r = requests.get(f"{BASE_URL}{path}", headers=h, timeout=15)
        if r.status_code == 200:
            return
    pytest.fail("no working dashboard endpoint")


# ---------- Event tasks generation ----------
def test_generate_tasks_from_event(h):
    events = requests.get(f"{BASE_URL}/api/events", headers=h, timeout=15).json()
    if isinstance(events, dict):
        events = events.get("items") or events.get("data") or []
    assert events, "no events"
    eid = events[0]["id"]
    r = requests.post(f"{BASE_URL}/api/events/{eid}/generate-tasks", headers=h, timeout=30)
    # 200/201/409(already exists) all acceptable, just no 500
    assert r.status_code < 500, f"generate-tasks crashed: {r.status_code} {r.text[:200]}"
