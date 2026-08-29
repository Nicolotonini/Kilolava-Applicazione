"""
Empty-state verification after controlled reset (iteration 20).
Verifies:
  - login admin works (only account)
  - operational data counts are 0
  - catalogs preserved (non-empty)
  - google sheets connection preserved (connected=true)
  - create client + delete client works on empty DB and cleans up
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://kilolava-rebuild.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data or "token" in data, f"no token in response: {data}"
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


def _get(path, headers, params=None):
    return requests.get(f"{API}{path}", headers=headers, params=params, timeout=20)


# ---- login ----
def test_login_admin_works(token):
    assert token and isinstance(token, str) and len(token) > 10


def test_auth_me_returns_admin(h):
    r = _get("/auth/me", h)
    assert r.status_code == 200
    body = r.json()
    assert body.get("email") == ADMIN_EMAIL
    assert body.get("role") == "admin"


# ---- users: only 1 admin ----
def test_only_one_user_exists(h):
    r = _get("/users", h)
    if r.status_code == 404:
        pytest.skip("/users endpoint not exposed")
    assert r.status_code == 200, r.text
    users = r.json()
    users = users if isinstance(users, list) else users.get("users", users.get("items", []))
    assert len(users) == 1, f"expected 1 user, got {len(users)}: {[u.get('email') for u in users]}"
    assert users[0].get("email") == ADMIN_EMAIL


# ---- operational data all zero ----
@pytest.mark.parametrize("path,label", [
    ("/clients", "clients"),
    ("/structures", "structures"),
    ("/units", "units"),
    ("/events", "events"),
])
def test_operational_lists_empty(h, path, label):
    r = _get(path, h)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text}"
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", body.get("data", []))
    assert len(items) == 0, f"{label} should be empty, got {len(items)}"


def test_notifications_empty(h):
    r = _get("/notifications", h)
    if r.status_code == 404:
        pytest.skip("no /notifications endpoint")
    assert r.status_code == 200
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", body.get("notifications", []))
    assert len(items) == 0


def test_magazzino_movimenti_empty(h):
    r = _get("/magazzino/movimenti", h)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) == 0, f"warehouse_movements should be empty, got {len(items)}"


def test_segnalazioni_empty(h):
    r = _get("/segnalazioni", h)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) == 0


def test_segnalazioni_badge_zero(h):
    r = _get("/segnalazioni/badge", h)
    assert r.status_code == 200
    body = r.json()
    # badge should be 0 or empty
    total = body.get("total", body.get("count", 0)) if isinstance(body, dict) else 0
    assert total == 0, f"badge not zero: {body}"


# ---- catalogs preserved ----
def test_rental_catalog_preserved(h):
    r = _get("/magazzino/catalog/noleggio", h)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) >= 8, f"rental_catalog expected >=8, got {len(items)}"


def test_supply_catalog_preserved(h):
    r = _get("/magazzino/catalog/forniture", h)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) >= 5


def test_cleaning_catalog_preserved(h):
    r = _get("/magazzino/catalog/pulizie", h)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) >= 23


def test_kits_preserved(h):
    r = _get("/magazzino/kits", h)
    assert r.status_code == 200
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) >= 3


def test_zones_preserved(h):
    r = _get("/zones", h)
    assert r.status_code == 200
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) >= 40


# ---- google sheets preserved ----
def test_sheets_anagrafiche_connected(h):
    r = _get("/sheets-anagrafiche/status", h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("connected") is True, f"sheets connection lost: {body}"


# ---- dashboard KPI 0 ----
def test_dashboard_stats_all_zero(h):
    r = _get("/dashboard/stats", h)
    assert r.status_code == 200, r.text
    stats = r.json()
    # Numeric fields should all be 0
    for k, v in stats.items():
        if isinstance(v, (int, float)) and k not in ("threshold", "days"):
            assert v == 0, f"dashboard KPI {k}={v}, expected 0"


# ---- create + delete client (test cleanup) ----
def test_create_and_delete_client(h):
    payload = {
        "client_type": "private",
        "private_info": {"name": "TEST_RESET_VERIFICA", "surname": "Auto", "phone": "+390000000000"},
        "is_active": True,
    }
    r = requests.post(f"{API}/clients", json=payload, headers=h, timeout=15)
    assert r.status_code in (200, 201), f"create client failed: {r.status_code} {r.text}"
    created = r.json()
    cid = created.get("id") or created.get("_id")
    assert cid, f"no id returned: {created}"

    # verify persisted
    r2 = _get(f"/clients/{cid}", h)
    assert r2.status_code == 200

    # delete
    r3 = requests.delete(f"{API}/clients/{cid}", headers=h, timeout=15)
    assert r3.status_code in (200, 204), f"delete failed: {r3.status_code} {r3.text}"

    # verify gone
    r4 = _get(f"/clients/{cid}", h)
    assert r4.status_code in (404, 400), f"client not fully deleted: {r4.status_code}"


# ---- final cleanup check ----
def test_final_clients_empty(h):
    r = _get("/clients", h)
    assert r.status_code == 200
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", [])
    assert len(items) == 0, f"DB not clean at end of tests: {[c.get('name') for c in items]}"
