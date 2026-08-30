"""Iteration 27 — Mappa Operativa + GPS obbligatorio backend tests.

Tests:
  - Auth on /api/mappa/personale (admin 200, non-ops 403, unauth 401/403)
  - Sessioni: start/ping/stop/me + 400 su ping senza start
  - Freshness live/recente/non_aggiornata/gps_off/offline
  - Cleanup completo utenti test + user_locations
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASS = "TestPass123!"

TEST_RIDER = {
    "email": "TEST_iter27_rider@kilolava.com",
    "password": "TestPass123!",
    "first_name": "TEST27",
    "last_name": "Rider",
    "role": "rider",
    "phone": "+39000000000",
}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def rider_ctx(admin_token):
    """Create a test rider, yield (token, user_id), cleanup at teardown."""
    h = {"Authorization": f"Bearer {admin_token}"}
    # Cleanup any leftover
    existing = requests.get(f"{API}/users", headers=h, timeout=15)
    if existing.status_code == 200:
        for u in existing.json():
            if u.get("email") == TEST_RIDER["email"]:
                requests.delete(f"{API}/users/{u['id']}", headers=h, timeout=15)

    r = requests.post(f"{API}/users", json=TEST_RIDER, headers=h, timeout=15)
    assert r.status_code in (200, 201), f"create rider failed: {r.status_code} {r.text}"
    user = r.json()
    uid = user["id"]

    token = _login(TEST_RIDER["email"], TEST_RIDER["password"])
    yield token, uid

    # Teardown: stop session, delete user_locations, delete user
    try:
        requests.post(f"{API}/posizione/stop", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    except Exception:
        pass
    requests.delete(f"{API}/users/{uid}", headers=h, timeout=15)


# === Auth on /mappa/personale ===

def test_mappa_personale_admin_ok(admin_token):
    r = requests.get(f"{API}/mappa/personale", headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_mappa_personale_no_token():
    r = requests.get(f"{API}/mappa/personale", timeout=15)
    assert r.status_code in (401, 403)


def test_mappa_personale_rider_forbidden(rider_ctx):
    token, _ = rider_ctx
    r = requests.get(f"{API}/mappa/personale", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 403


# === Sessioni ===

def test_ping_without_start_400(rider_ctx):
    token, _ = rider_ctx
    h = {"Authorization": f"Bearer {token}"}
    # Ensure no active session
    requests.post(f"{API}/posizione/stop", headers=h, timeout=15)
    r = requests.post(f"{API}/posizione/ping", headers=h,
                      json={"latitude": 45.6495, "longitude": 13.7768, "accuracy": 12}, timeout=15)
    assert r.status_code == 400, f"expected 400 got {r.status_code} {r.text}"


def test_session_lifecycle_and_freshness(admin_token, rider_ctx):
    token, uid = rider_ctx
    hu = {"Authorization": f"Bearer {token}"}
    ha = {"Authorization": f"Bearer {admin_token}"}

    # Start
    r = requests.post(f"{API}/posizione/start", headers=hu, json={"session_type": "giro"}, timeout=15)
    assert r.status_code == 200 and r.json().get("active") is True

    # Ping Trieste
    r = requests.post(f"{API}/posizione/ping", headers=hu,
                      json={"latitude": 45.6495, "longitude": 13.7768, "accuracy": 12, "battery": 88}, timeout=15)
    assert r.status_code == 200

    # /posizione/me
    r = requests.get(f"{API}/posizione/me", headers=hu, timeout=15)
    me = r.json()
    assert me["active"] is True and me["last_ping"] is not None

    # Admin sees rider live
    r = requests.get(f"{API}/mappa/personale", headers=ha, timeout=15)
    assert r.status_code == 200
    rows = [x for x in r.json() if x["user_id"] == uid]
    assert len(rows) == 1
    row = rows[0]
    assert row["freshness"] == "live"
    assert row["active"] is True
    assert abs(row["latitude"] - 45.6495) < 1e-4
    assert abs(row["longitude"] - 13.7768) < 1e-4
    assert row["seconds_ago"] is not None and row["seconds_ago"] < 60

    # Manipulate timestamp -> recente (5 min ago)
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL") or os.environ["MONGO_URL"])
    dbn = os.environ.get("DB_NAME", "test_database")
    coll = mc[dbn]["user_locations"]

    def _set_ts(minutes_ago):
        ts = (datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")
        coll.update_one({"user_id": uid}, {"$set": {"timestamp": ts}})

    _set_ts(5)
    time.sleep(0.5)
    row = next(x for x in requests.get(f"{API}/mappa/personale", headers=ha).json() if x["user_id"] == uid)
    assert row["freshness"] == "recente", f"got {row['freshness']} sec={row['seconds_ago']}"

    _set_ts(15)
    row = next(x for x in requests.get(f"{API}/mappa/personale", headers=ha).json() if x["user_id"] == uid)
    assert row["freshness"] == "non_aggiornata", f"got {row['freshness']}"

    # gps_off: remove latitude/timestamp
    coll.update_one({"user_id": uid}, {"$unset": {"latitude": "", "longitude": "", "timestamp": ""}})
    row = next(x for x in requests.get(f"{API}/mappa/personale", headers=ha).json() if x["user_id"] == uid)
    assert row["freshness"] == "gps_off", f"got {row['freshness']}"

    # Stop -> offline
    r = requests.post(f"{API}/posizione/stop", headers=hu, timeout=15)
    assert r.status_code == 200 and r.json().get("active") is False
    row = next(x for x in requests.get(f"{API}/mappa/personale", headers=ha).json() if x["user_id"] == uid)
    assert row["freshness"] == "offline"
    assert row["active"] is False

    # Ping after stop -> 400
    r = requests.post(f"{API}/posizione/ping", headers=hu,
                      json={"latitude": 45.6495, "longitude": 13.7768}, timeout=15)
    assert r.status_code == 400

    mc.close()


# === Regressione ===

@pytest.mark.parametrize("path", [
    "/health",
    "/inventory/articles",
    "/structures",
    "/clients",
])
def test_regression_endpoints(admin_token, path):
    h = {"Authorization": f"Bearer {admin_token}"} if path != "/health" else {}
    r = requests.get(f"{API}{path}", headers=h, timeout=20)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:120]}"


def test_regression_catalog_counts(admin_token):
    """Cataloghi reali: 23 NOL / 8 FOR / 23 PUL"""
    h = {"Authorization": f"Bearer {admin_token}"}
    counts = {}
    for domain, expected in [("noleggio", 23), ("forniture", 8), ("pulizie", 23)]:
        r = requests.get(f"{API}/magazzino/catalog/{domain}", headers=h, timeout=20)
        assert r.status_code == 200, f"/catalog/{domain} -> {r.status_code}"
        counts[domain] = len(r.json())
    assert counts["noleggio"] == 23, f"NOL={counts['noleggio']}"
    assert counts["forniture"] == 8, f"FOR={counts['forniture']}"
    assert counts["pulizie"] == 23, f"PUL={counts['pulizie']}"


def test_regression_kits_count(admin_token):
    h = {"Authorization": f"Bearer {admin_token}"}
    r = requests.get(f"{API}/kits", headers=h, timeout=20)
    if r.status_code == 404:
        pytest.skip("kits endpoint not exposed")
    assert r.status_code == 200
    assert len(r.json()) == 8, f"kits count={len(r.json())}"
