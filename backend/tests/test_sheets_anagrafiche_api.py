"""Integration tests: /api/sheets-anagrafiche/* endpoints (no OAuth completed)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
ADDETTA = {"email": "addetta_test@kilolava.com", "password": "AddettaTest123!"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def addetta_headers():
    return {"Authorization": f"Bearer {_login(ADDETTA)}"}


# ---- Admin flow (no google connection) ----

def test_status_admin(admin_headers):
    r = requests.get(f"{BASE_URL}/api/sheets-anagrafiche/status", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is True
    assert d["connected"] is False
    assert d["import_url"].startswith("https://docs.google.com/spreadsheets/d/")
    assert d["backup_url"].startswith("https://docs.google.com/spreadsheets/d/")


def test_connect_url_admin(admin_headers):
    r = requests.get(f"{BASE_URL}/api/sheets-anagrafiche/connect-url", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    url = r.json()["url"]
    assert url.startswith("https://accounts.google.com/o/oauth2/auth")


def test_preview_without_connection(admin_headers):
    r = requests.post(f"{BASE_URL}/api/sheets-anagrafiche/preview", headers=admin_headers, timeout=15)
    assert r.status_code == 400
    assert "non connesso" in r.json().get("detail", "").lower() or "google" in r.json().get("detail", "").lower()


def test_backup_without_connection(admin_headers):
    r = requests.post(f"{BASE_URL}/api/sheets-anagrafiche/backup", headers=admin_headers, timeout=15)
    assert r.status_code == 400


def test_setup_import_without_connection(admin_headers):
    r = requests.post(f"{BASE_URL}/api/sheets-anagrafiche/setup-import", headers=admin_headers, timeout=15)
    assert r.status_code == 400


def test_history_admin(admin_headers):
    r = requests.get(f"{BASE_URL}/api/sheets-anagrafiche/history", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_apply_nonexistent_preview(admin_headers):
    r = requests.post(f"{BASE_URL}/api/sheets-anagrafiche/apply",
                      headers=admin_headers,
                      json={"preview_id": "does-not-exist", "decisions": {}},
                      timeout=15)
    assert r.status_code == 400
    assert "anteprima" in r.json().get("detail", "").lower()


# ---- Non-admin (addetta) -> 403 on every endpoint ----

@pytest.mark.parametrize("method,path,body", [
    ("GET", "/api/sheets-anagrafiche/status", None),
    ("GET", "/api/sheets-anagrafiche/connect-url", None),
    ("GET", "/api/sheets-anagrafiche/history", None),
    ("POST", "/api/sheets-anagrafiche/preview", None),
    ("POST", "/api/sheets-anagrafiche/backup", None),
    ("POST", "/api/sheets-anagrafiche/setup-import", None),
    ("POST", "/api/sheets-anagrafiche/apply", {"preview_id": "x", "decisions": {}}),
    ("POST", "/api/sheets-anagrafiche/disconnect", None),
])
def test_addetta_forbidden(addetta_headers, method, path, body):
    url = f"{BASE_URL}{path}"
    if method == "GET":
        r = requests.get(url, headers=addetta_headers, timeout=15)
    else:
        r = requests.post(url, headers=addetta_headers, json=body or {}, timeout=15)
    assert r.status_code == 403, f"{method} {path} -> {r.status_code} (expected 403)"
