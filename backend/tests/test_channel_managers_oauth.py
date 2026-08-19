"""Backend tests — Guesty/Hostaway/Octorate OAuth adapters + webhooks + regressions.

Focus:
- Providers catalog: 5 providers, all implemented=True, octorate oauth_flow.
- Real provider errors when fake credentials are used (no simulation).
- Octorate: app-settings CRUD, connect URL, callback state protection.
- Hostaway webhook receiver with Basic Auth + dedupe.
- Credentials masking + no oauth in list response.
- Regression: iCal full flow (create→test→import→link→sync→modify→sync→cancel), unique-source conflict 400.

Cleans up test connections and app_settings at teardown.
"""
import base64
import http.server
import os
import socket
import sys
import threading
import time
import uuid
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
MONGO_URL = os.environ["MONGO_URL"].strip('"')
DB_NAME = os.environ["DB_NAME"].strip('"')

CREATED_CONN_IDS: list = []


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    # Teardown: remove test connections + related data
    for cid in CREATED_CONN_IDS:
        db.cm_property_mappings.delete_many({"connection_id": cid})
        db.cm_reservations.delete_many({"connection_id": cid})
        db.cm_webhook_events.delete_many({"connection_id": cid})
        db.cm_oauth_states.delete_many({"connection_id": cid})
        db.cm_connections.delete_one({"id": cid})
    # Remove test octorate app settings (fake values)
    db.app_settings.delete_one({"_id": "octorate_app"})
    # Reset any structures that we linked
    db.structures.update_many({"booking_source": {"$in": ["ical"]}}, {"$set": {"booking_source": "manual"}})
    client.close()


def _create_conn(h, provider, name, credentials, client_id=None):
    payload = {"provider": provider, "name": name, "credentials": credentials}
    if client_id:
        payload["client_id"] = client_id
    r = requests.post(f"{API}/integrations/channel-managers", json=payload, headers=h, timeout=20)
    assert r.status_code == 200, f"create {provider}: {r.status_code} {r.text[:200]}"
    cid = r.json()["id"]
    CREATED_CONN_IDS.append(cid)
    return cid


# ---------------- Providers catalog ----------------

class TestProviders:
    def test_five_providers_all_implemented(self, h):
        r = requests.get(f"{API}/integrations/providers", headers=h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        provs = {p["provider"]: p for p in data}
        assert set(provs.keys()) == {"kross", "guesty", "hostaway", "octorate", "ical"}
        for p in ("kross", "guesty", "hostaway", "octorate", "ical"):
            assert provs[p]["implemented"] is True, f"{p} must be implemented"

    def test_octorate_oauth_flow(self, h):
        r = requests.get(f"{API}/integrations/providers", headers=h, timeout=15).json()
        octo = next(p for p in r if p["provider"] == "octorate")
        assert octo.get("oauth_flow") is True
        assert octo.get("credential_fields") == []

    def test_guesty_fields(self, h):
        r = requests.get(f"{API}/integrations/providers", headers=h, timeout=15).json()
        g = next(p for p in r if p["provider"] == "guesty")
        keys = [f["key"] for f in g["credential_fields"]]
        assert "client_id" in keys and "client_secret" in keys

    def test_hostaway_fields(self, h):
        r = requests.get(f"{API}/integrations/providers", headers=h, timeout=15).json()
        hst = next(p for p in r if p["provider"] == "hostaway")
        keys = [f["key"] for f in hst["credential_fields"]]
        assert set(["account_id", "client_secret", "webhook_login", "webhook_password"]).issubset(keys)


# ---------------- Guesty REAL error ----------------

class TestGuestyRealError:
    def test_fake_creds_returns_real_provider_error(self, h):
        cid = _create_conn(h, "guesty", "TEST_GUESTY_FAKE",
                           {"client_id": "TEST_FAKE_CLIENT_ID_KILOLAVA", "client_secret": "TEST_FAKE_SECRET_KILOLAVA"})
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=45)
        assert r.status_code == 200
        result = r.json()
        assert result["ok"] is False
        err = (result.get("error") or "") + " " + str(result.get("checks", ""))
        low = err.lower()
        # Must be REAL Guesty error, not a generic "credenziali errate"
        assert ("guesty" in low or "http" in low or "invalid" in low or "client" in low), err
        # Contains provider status code or provider message
        assert ("400" in err or "401" in err or "invalid" in low), f"expected real HTTP status: {err}"


# ---------------- Hostaway REAL error ----------------

class TestHostawayRealError:
    def test_fake_creds_returns_real_401(self, h):
        cid = _create_conn(h, "hostaway", "TEST_HOSTAWAY_FAKE",
                           {"account_id": "999999999", "client_secret": "TEST_FAKE_SECRET_KILOLAVA_XYZ"})
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=45)
        assert r.status_code == 200
        result = r.json()
        assert result["ok"] is False
        err = (result.get("error") or "") + " " + str(result.get("checks", ""))
        low = err.lower()
        assert "hostaway" in low, err
        # HTTP 401 or "Client authentication failed" from provider
        assert ("401" in err or "authentication" in low or "invalid" in low or "400" in err), err


# ---------------- Octorate flow ----------------

class TestOctorateFlow:
    def _clear_settings(self, mongo):
        mongo.app_settings.delete_one({"_id": "octorate_app"})

    def test_test_without_app_settings(self, h, mongo):
        self._clear_settings(mongo)
        cid = _create_conn(h, "octorate", "TEST_OCTORATE_NOAPP", {})
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=30)
        assert r.status_code == 200
        result = r.json()
        assert result["ok"] is False
        err = (result.get("error") or "").lower()
        assert "app octorate" in err or "credenziali app" in err, result
        # store cid on class for reuse
        TestOctorateFlow._cid = cid

    def test_connect_without_settings_400(self, h):
        cid = TestOctorateFlow._cid
        r = requests.get(f"{API}/integrations/octorate/connect/{cid}", headers=h, timeout=15)
        assert r.status_code == 400
        assert "app octorate" in r.json().get("detail", "").lower() or "credenziali" in r.json().get("detail", "").lower()

    def test_get_app_settings_secret_masked(self, h):
        # PUT then GET should never return secret in clear
        r = requests.put(f"{API}/integrations/octorate/app-settings", headers=h,
                         json={"client_id": "TEST_APP_CID", "client_secret": "TEST_APP_SECRET",
                               "redirect_uri": f"{BASE_URL}/api/integrations/octorate/callback"},
                         timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["client_secret_set"] is True
        assert "client_secret" not in data or data.get("client_secret") in (None, "")
        # GET
        g = requests.get(f"{API}/integrations/octorate/app-settings", headers=h, timeout=15)
        gd = g.json()
        assert gd["client_secret_set"] is True
        assert "client_secret" not in gd or gd.get("client_secret") in (None, "")
        assert gd["client_id"] == "TEST_APP_CID"

    def test_connect_after_settings_returns_authorize_url(self, h):
        cid = TestOctorateFlow._cid
        r = requests.get(f"{API}/integrations/octorate/connect/{cid}", headers=h, timeout=15)
        assert r.status_code == 200
        url = r.json()["authorize_url"]
        assert url.startswith("https://admin.octorate.com/octobook/identity/oauth.xhtml?")
        assert "client_id=TEST_APP_CID" in url
        assert "redirect_uri=" in url
        assert "state=" in url

    def test_test_after_settings_needs_auth(self, h):
        cid = TestOctorateFlow._cid
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=30)
        result = r.json()
        assert result["ok"] is False
        err = (result.get("error") or "").lower()
        assert "non ancora autorizzato" in err or "collega octorate" in err, result

    def test_callback_invalid_state_redirects_error(self):
        # public endpoint — allow no auth
        r = requests.get(f"{API}/integrations/octorate/callback",
                         params={"code": "fakecode", "state": "does-not-exist"},
                         timeout=15, allow_redirects=False)
        assert r.status_code in (302, 307)
        loc = r.headers.get("location", "")
        assert "octorate=error" in loc, loc

    def test_callback_missing_code(self):
        r = requests.get(f"{API}/integrations/octorate/callback",
                         params={"state": "x"}, timeout=15, allow_redirects=False)
        assert r.status_code in (302, 307)
        assert "octorate=error" in r.headers.get("location", "")


# ---------------- Hostaway webhook ----------------

class TestHostawayWebhook:
    def test_webhook_without_auth_401(self, h, mongo):
        cid = _create_conn(h, "hostaway", "TEST_HOSTAWAY_WH",
                           {"account_id": "123", "client_secret": "s",
                            "webhook_login": "kilo_user", "webhook_password": "kilo_pw"})
        TestHostawayWebhook._cid = cid
        r = requests.post(f"{API}/integrations/webhooks/hostaway/{cid}",
                          json={"event": "reservation.created"}, timeout=15)
        assert r.status_code == 401

    def test_webhook_wrong_basic_auth(self):
        cid = TestHostawayWebhook._cid
        r = requests.post(f"{API}/integrations/webhooks/hostaway/{cid}",
                          json={"event": "reservation.created"},
                          auth=("wrong", "wrong"), timeout=15)
        assert r.status_code == 401

    def test_webhook_valid_basic_auth_accepted(self):
        cid = TestHostawayWebhook._cid
        body = {"event": "reservation.updated", "reservationId": "TEST_WH_RES_1"}
        r = requests.post(f"{API}/integrations/webhooks/hostaway/{cid}",
                          json=body, auth=("kilo_user", "kilo_pw"), timeout=45)
        assert r.status_code == 200
        assert r.json().get("status") == "accepted"

    def test_webhook_duplicate_ignored(self):
        cid = TestHostawayWebhook._cid
        body = {"event": "reservation.updated", "reservationId": "TEST_WH_RES_1"}
        r = requests.post(f"{API}/integrations/webhooks/hostaway/{cid}",
                          json=body, auth=("kilo_user", "kilo_pw"), timeout=45)
        assert r.status_code == 200
        assert r.json().get("status") == "duplicate_ignored"

    def test_webhook_no_creds_configured_401(self, h):
        cid = _create_conn(h, "hostaway", "TEST_HOSTAWAY_NOWH",
                           {"account_id": "123", "client_secret": "s"})
        r = requests.post(f"{API}/integrations/webhooks/hostaway/{cid}",
                          json={"event": "x"}, auth=("a", "b"), timeout=15)
        assert r.status_code == 401
        assert "webhook" in r.json().get("detail", "").lower()


# ---------------- Credentials masking ----------------

class TestCredentialsMasking:
    def test_secret_never_in_list(self, h):
        # Ensure all connections in list have secret fields masked
        r = requests.get(f"{API}/integrations/channel-managers", headers=h, timeout=15)
        assert r.status_code == 200
        for c in r.json():
            creds = c.get("credentials") or {}
            for k, v in creds.items():
                # No plain secret should be present; secrets should be masked bullets
                if v and k in ("client_secret", "webhook_password", "password"):
                    assert v == "••••••••", f"secret {k} not masked: {v}"
            # oauth field must not be present in serialized response
            assert "oauth" not in c, f"oauth leaked in list response for {c.get('name')}"


# ---------------- Kross Real connection preserved ----------------

class TestKrossRealPreserved:
    def test_kross_real_connection_visible_untouched(self, h, mongo):
        # Real Kross connection created by main agent — verify presence but do NOT touch it
        conn = mongo.cm_connections.find_one({"provider": "kross", "name": "Kross Booking - Affitto Breve"})
        # Not fatal if absent, but expected
        if not conn:
            pytest.skip("Real Kross connection not present in DB — skipping preserve check")
        r = requests.get(f"{API}/integrations/channel-managers", headers=h, timeout=15).json()
        names = [c["name"] for c in r]
        assert "Kross Booking - Affitto Breve" in names


# ---------------- iCal regression ----------------

ICAL_DIR = Path("/app/backend/tests/_ical_tmp_oauth")
ICAL_DIR.mkdir(exist_ok=True)
ICAL_FILE = ICAL_DIR / "feed.ics"

ICS_V1 = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//kilolava-test//EN
BEGIN:VEVENT
UID:oauth-A@test
DTSTART;VALUE=DATE:__A1__
DTEND;VALUE=DATE:__A2__
SUMMARY:Ospite Alfa
END:VEVENT
BEGIN:VEVENT
UID:oauth-B@test
DTSTART;VALUE=DATE:__B1__
DTEND;VALUE=DATE:__B2__
SUMMARY:Ospite Bravo
END:VEVENT
END:VCALENDAR
"""

ICS_V2 = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//kilolava-test//EN
BEGIN:VEVENT
UID:oauth-A@test
DTSTART;VALUE=DATE:__A1__
DTEND;VALUE=DATE:__A2__
SUMMARY:Ospite Alfa modificato
END:VEVENT
END:VCALENDAR
"""


def _d(days):
    return (date.today() + timedelta(days=days)).strftime("%Y%m%d")


def _free_port():
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def ical_server():
    port = _free_port()
    ICAL_FILE.write_text(ICS_V1.replace("__A1__", _d(30)).replace("__A2__", _d(33))
                                 .replace("__B1__", _d(40)).replace("__B2__", _d(42)))

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ICAL_DIR), **kw)
        def log_message(self, *a, **kw): pass

    httpd = http.server.HTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/feed.ics"
    assert requests.get(url, timeout=5).status_code == 200
    yield {"url": url,
           "v2": lambda: ICAL_FILE.write_text(ICS_V2.replace("__A1__", _d(31)).replace("__A2__", _d(34)))}
    httpd.shutdown()


class TestICalRegression:
    def test_full_flow_and_unique_source_conflict(self, h, ical_server, mongo):
        # Create iCal connection
        cid = _create_conn(h, "ical", "TEST_ICAL_OAUTH_REG",
                           {"feed_url": ical_server["url"]})

        # Test
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=30)
        assert r.status_code == 200 and r.json().get("ok") is True, r.text

        # Import properties (creates 1 mapping)
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/import-properties",
                          headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json()["imported"] >= 1

        # Find a structure to link to — pick first that has NO current mapping
        structures = requests.get(f"{API}/structures", headers=h, timeout=15)
        if structures.status_code != 200 or not structures.json():
            pytest.skip("No structures available to link mapping")
        # find first structure without any 'linked' mapping in cm_property_mappings
        struct = None
        for s in structures.json():
            existing = mongo.cm_property_mappings.find_one({"structure_id": s["id"], "status": "linked"})
            if not existing:
                struct = s
                break
        if not struct:
            pytest.skip("All structures already have linked cm mappings")

        # Link mapping
        mappings = requests.get(f"{API}/integrations/channel-managers/{cid}/mappings",
                                headers=h, timeout=15).json()
        assert mappings
        mapping_id = mappings[0]["id"]
        r = requests.put(f"{API}/integrations/mappings/{mapping_id}",
                         json={"action": "link", "structure_id": struct["id"]},
                         headers=h, timeout=15)
        assert r.status_code == 200, r.text

        # Sync
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/sync",
                          headers=h, timeout=45)
        assert r.status_code == 200
        result = r.json()
        assert result.get("created", 0) >= 1, result

        # Modify feed → sync → updated/cancelled
        ical_server["v2"]()
        r = requests.post(f"{API}/integrations/channel-managers/{cid}/sync",
                          headers=h, timeout=45)
        assert r.status_code == 200
        result = r.json()
        assert (result.get("updated", 0) + result.get("cancelled", 0)) >= 1, result
        # No duplicates: total reservations = 2
        total_res = mongo.cm_reservations.count_documents({"connection_id": cid})
        assert total_res == 2, f"expected 2 reservations, got {total_res}"

        # Conflict: create second iCal conn, try to link to same structure -> 400
        cid2 = _create_conn(h, "ical", "TEST_ICAL_OAUTH_REG2",
                            {"feed_url": ical_server["url"]})
        requests.post(f"{API}/integrations/channel-managers/{cid2}/import-properties",
                      headers=h, timeout=30)
        m2 = requests.get(f"{API}/integrations/channel-managers/{cid2}/mappings",
                          headers=h, timeout=15).json()
        r = requests.put(f"{API}/integrations/mappings/{m2[0]['id']}",
                         json={"action": "link", "structure_id": struct["id"]},
                         headers=h, timeout=15)
        assert r.status_code == 400
        assert "fonte" in r.json()["detail"].lower() or "già" in r.json()["detail"].lower()
