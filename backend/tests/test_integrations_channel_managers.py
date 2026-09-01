from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Backend tests — Channel Manager integrations (Sistema → Integrazioni).

Covers: /api/integrations/providers, connections CRUD, credential masking,
Kross error handling with missing/fake creds, Guesty "not configured" state,
full iCal flow (create → test → import → link → sync → modify → cancel →
idempotency), conflict 400 on shared structure, delete keeps reservations,
sync does NOT touch events/cleaning collections.
"""
import os
import sys
import time
import uuid
import socket
import http.server
import threading
from datetime import date, timedelta
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://kilolava-rebuild.preview.emergentagent.com"
API = f"{BASE_URL}/api"
ADMIN = {"email": "test_user@kilolava.com", "password": TEST_ADMIN_PASSWORD}

MONGO_URL = os.environ["MONGO_URL"].strip('"')
DB_NAME = os.environ["DB_NAME"].strip('"')

# ------------- iCal test server -------------
ICAL_DIR = Path("/app/backend/tests/_ical_tmp")
ICAL_DIR.mkdir(exist_ok=True)
ICAL_FILE = ICAL_DIR / "feed.ics"

ICS_V1 = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//kilolava-test//EN
BEGIN:VEVENT
UID:evt-A@test
DTSTART;VALUE=DATE:__A_START__
DTEND;VALUE=DATE:__A_END__
SUMMARY:Ospite Alfa
END:VEVENT
BEGIN:VEVENT
UID:evt-B@test
DTSTART;VALUE=DATE:__B_START__
DTEND;VALUE=DATE:__B_END__
SUMMARY:Ospite Bravo
END:VEVENT
END:VCALENDAR
"""

# v2 — evt-A dates changed, evt-B removed (should be cancelled)
ICS_V2 = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//kilolava-test//EN
BEGIN:VEVENT
UID:evt-A@test
DTSTART;VALUE=DATE:__A2_START__
DTEND;VALUE=DATE:__A2_END__
SUMMARY:Ospite Alfa (modificato)
END:VEVENT
END:VCALENDAR
"""

def _d(days: int) -> str:
    return (date.today() + timedelta(days=days)).strftime("%Y%m%d")

def _v1() -> str:
    return (ICS_V1
            .replace("__A_START__", _d(10)).replace("__A_END__", _d(14))
            .replace("__B_START__", _d(20)).replace("__B_END__", _d(23)))

def _v2() -> str:
    return (ICS_V2
            .replace("__A2_START__", _d(11)).replace("__A2_END__", _d(15)))


def _free_port():
    with socket.socket() as s:
        s.bind(("", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def ical_server():
    port = _free_port()
    ICAL_FILE.write_text(_v1())

    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ICAL_DIR), **kw)
        def log_message(self, *a, **kw):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    url = f"http://127.0.0.1:{port}/feed.ics"
    # sanity
    r = requests.get(url, timeout=5)
    assert r.status_code == 200
    yield {"url": url, "write_v1": lambda: ICAL_FILE.write_text(_v1()),
           "write_v2": lambda: ICAL_FILE.write_text(_v2())}
    httpd.shutdown()


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed {r.status_code}: {r.text[:200]}")
    return r.json()["access_token"] if "access_token" in r.json() else r.json()["token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="module")
def structure_id(h):
    """Pick an existing KLV structure that has no booking source yet — do NOT create."""
    r = requests.get(f"{API}/structures", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json()
    # Prefer KLV-0003 (unlikely to be main-agent's iCal target); fall back to first free.
    def free(s):
        return not s.get("ical_url") and s.get("booking_source", "manual") in (None, "", "manual")
    candidate = next((s for s in items if s.get("klv_code") == "KLV-0003" and free(s)), None)
    if not candidate:
        candidate = next((s for s in items if free(s)), None)
    if not candidate:
        pytest.skip("No free structure available for booking source binding")
    return candidate["id"]


@pytest.fixture(scope="module")
def _created(h):
    ids = []
    yield ids
    # Teardown: unlink mappings then delete connections
    for cid in ids:
        try:
            requests.delete(f"{API}/integrations/channel-managers/{cid}", headers=h, timeout=10)
        except Exception:
            pass


# ------------------- 1. providers -------------------
class TestProviders:
    def test_five_providers(self, h):
        r = requests.get(f"{API}/integrations/providers", headers=h, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        by = {p["provider"]: p for p in data}
        assert set(by.keys()) == {"kross", "guesty", "hostaway", "octorate", "ical"}
        assert by["kross"]["implemented"] is True
        assert by["ical"]["implemented"] is True
        for p in ("guesty", "hostaway", "octorate"):
            assert by[p]["implemented"] is False, f"{p} should NOT be implemented"
            assert by[p]["missing_requirements"], f"{p} needs missing_requirements"


# ------------------- 2. Kross missing creds -------------------
class TestKrossErrors:
    def test_kross_missing_credentials(self, h, _created):
        r = requests.post(f"{API}/integrations/channel-managers", headers=h,
                          json={"provider": "kross", "name": "TEST_KROSS_EMPTY", "credentials": {}}, timeout=10)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        _created.append(cid)
        t = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=15)
        assert t.status_code == 200
        body = t.json()
        assert body["ok"] is False
        err = (body.get("error") or "") + " " + " ".join(c.get("detail", "") for c in body.get("checks", []))
        assert "Credenziali Kross mancanti" in err
        for k in ("hotel_id", "username", "password"):
            assert k in err, f"expected {k} in error message: {err}"

    def test_kross_fake_credentials_clear_message(self, h, _created):
        r = requests.post(f"{API}/integrations/channel-managers", headers=h,
                          json={"provider": "kross", "name": "TEST_KROSS_FAKE",
                                "credentials": {"hotel_id": "kilolavaXX", "username": "nope", "password": "wrong"}},
                          timeout=10)
        cid = r.json()["id"]
        _created.append(cid)
        t = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=60)
        assert t.status_code == 200
        body = t.json()
        assert body["ok"] is False
        text = (body.get("error") or "") + " " + " ".join(c.get("detail", "") for c in body.get("checks", []))
        assert text.strip() != ""
        assert "Errore generico" not in text
        # Must mention Kross/Login/credential/hotel
        assert any(w in text.lower() for w in ["kross", "login", "credenzial", "hotel"]), text


# ------------------- 3. Guesty not configured -------------------
class TestGuestyStub:
    def test_guesty_test_returns_not_configured(self, h, _created):
        r = requests.post(f"{API}/integrations/channel-managers", headers=h,
                          json={"provider": "guesty", "name": "TEST_GUESTY",
                                "credentials": {"client_id": "x", "client_secret": "y"}}, timeout=10)
        assert r.status_code == 200
        cid = r.json()["id"]
        _created.append(cid)
        t = requests.post(f"{API}/integrations/channel-managers/{cid}/test", headers=h, timeout=15)
        assert t.status_code == 200
        body = t.json()
        assert body["ok"] is False
        assert body.get("missing"), "Guesty test must expose missing_requirements"
        assert "non ancora attivo" in (body.get("error") or "").lower() or body.get("missing")


# ------------------- 4-8. full iCal flow -------------------
class TestICalFlow:
    conn_id = None
    mapping_id = None

    def test_01_create(self, h, ical_server, _created):
        r = requests.post(f"{API}/integrations/channel-managers", headers=h,
                          json={"provider": "ical", "name": "TEST_ICAL_FLOW",
                                "credentials": {"feed_url": ical_server["url"]}}, timeout=10)
        assert r.status_code == 200, r.text
        TestICalFlow.conn_id = r.json()["id"]
        _created.append(TestICalFlow.conn_id)

    def test_02_test_connection_ok(self, h):
        t = requests.post(f"{API}/integrations/channel-managers/{TestICalFlow.conn_id}/test",
                          headers=h, timeout=20)
        assert t.status_code == 200
        body = t.json()
        assert body["ok"] is True, body
        assert body["reservations_readable"] == 2

    def test_03_import_properties(self, h):
        r = requests.post(f"{API}/integrations/channel-managers/{TestICalFlow.conn_id}/import-properties",
                          headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["imported"] == 1
        mp = requests.get(f"{API}/integrations/channel-managers/{TestICalFlow.conn_id}/mappings",
                          headers=h, timeout=10).json()
        assert len(mp) == 1
        TestICalFlow.mapping_id = mp[0]["id"]

    def test_04_link_mapping(self, h, structure_id):
        r = requests.put(f"{API}/integrations/mappings/{TestICalFlow.mapping_id}", headers=h,
                         json={"action": "link", "structure_id": structure_id}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "linked"

    def test_05_conflict_second_link_returns_400(self, h, ical_server, structure_id, _created):
        # Create a SECOND ical connection and try linking to the SAME structure
        r = requests.post(f"{API}/integrations/channel-managers", headers=h,
                          json={"provider": "ical", "name": "TEST_ICAL_CONFLICT",
                                "credentials": {"feed_url": ical_server["url"]}}, timeout=10)
        cid2 = r.json()["id"]
        _created.append(cid2)
        requests.post(f"{API}/integrations/channel-managers/{cid2}/import-properties",
                      headers=h, timeout=15)
        mp = requests.get(f"{API}/integrations/channel-managers/{cid2}/mappings",
                          headers=h, timeout=10).json()
        conf = requests.put(f"{API}/integrations/mappings/{mp[0]['id']}", headers=h,
                            json={"action": "link", "structure_id": structure_id}, timeout=10)
        assert conf.status_code == 400
        assert "fonte prenotazioni principale" in conf.json()["detail"]

    def test_06_first_sync_created(self, h, mongo):
        events_before = mongo.events.count_documents({})
        cleaning_before = mongo.cleaning_tasks.count_documents({}) if "cleaning_tasks" in mongo.list_collection_names() else 0
        s = requests.post(f"{API}/integrations/channel-managers/{TestICalFlow.conn_id}/sync",
                          headers=h, timeout=30)
        assert s.status_code == 200, s.text
        body = s.json()
        assert body["created"] == 2, body
        assert body["errors"] == []
        # sync must NOT create events or cleaning tasks
        assert mongo.events.count_documents({}) == events_before
        cleaning_after = mongo.cleaning_tasks.count_documents({}) if "cleaning_tasks" in mongo.list_collection_names() else 0
        assert cleaning_after == cleaning_before

    def test_07_idempotent_sync(self, h):
        s = requests.post(f"{API}/integrations/channel-managers/{TestICalFlow.conn_id}/sync",
                          headers=h, timeout=30).json()
        assert s["created"] == 0
        assert s["updated"] == 0
        assert s["cancelled"] == 0
        assert s["unchanged"] == 2, s

    def test_08_modify_and_cancel(self, h, ical_server, mongo):
        ical_server["write_v2"]()
        s = requests.post(f"{API}/integrations/channel-managers/{TestICalFlow.conn_id}/sync",
                          headers=h, timeout=30).json()
        assert s["updated"] == 1, s
        assert s["cancelled"] == 1, s
        # history populated on the modified one
        modified = mongo.cm_reservations.find_one({"connection_id": TestICalFlow.conn_id,
                                                    "external_id": "evt-A@test"})
        assert modified and modified.get("history"), "history should be populated"
        cancelled = mongo.cm_reservations.find_one({"connection_id": TestICalFlow.conn_id,
                                                    "external_id": "evt-B@test"})
        assert cancelled and cancelled["status"] == "cancelled"

    def test_09_no_duplicates(self, mongo):
        docs = list(mongo.cm_reservations.find({"connection_id": TestICalFlow.conn_id}))
        keys = [d["external_id"] for d in docs]
        assert len(keys) == len(set(keys)) == 2

    def test_10_reservations_endpoint_filters(self, h, structure_id):
        r = requests.get(f"{API}/integrations/reservations",
                         params={"provider": "ical", "connection_id": TestICalFlow.conn_id},
                         headers=h, timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) == 2
        # structure_id filter
        r2 = requests.get(f"{API}/integrations/reservations",
                          params={"structure_id": structure_id, "provider": "ical"},
                          headers=h, timeout=10)
        assert r2.status_code == 200
        assert any(x["connection_id"] == TestICalFlow.conn_id for x in r2.json())
        # status filter
        r3 = requests.get(f"{API}/integrations/reservations",
                          params={"status": "cancelled", "connection_id": TestICalFlow.conn_id},
                          headers=h, timeout=10)
        assert all(x["status"] == "cancelled" for x in r3.json())
        assert len(r3.json()) == 1


# ------------------- 9. credentials masked in list -------------------
class TestMaskingAndCounts:
    def test_password_never_in_clear(self, h):
        r = requests.get(f"{API}/integrations/channel-managers", headers=h, timeout=10)
        assert r.status_code == 200
        for c in r.json():
            creds = c.get("credentials") or {}
            for k, v in creds.items():
                if v is None:
                    continue
                # secret fields must be masked
                if k in ("password", "client_secret"):
                    assert v == "••••••••", f"secret field {k} not masked: {v}"
            # any TEST_ICAL row will have positive counters after sync
            if c.get("name") == "TEST_ICAL_FLOW":
                assert c["linked_structures"] == 1
                assert c["reservations_imported"] == 2


# ------------------- 10. delete keeps reservations -------------------
class TestDeleteKeepsData:
    def test_delete_connection_keeps_reservations(self, h, mongo, ical_server, structure_id):
        # create a fresh connection, link, sync, delete → reservations must remain
        r = requests.post(f"{API}/integrations/channel-managers", headers=h,
                          json={"provider": "ical", "name": "TEST_ICAL_DELETE",
                                "credentials": {"feed_url": ical_server["url"]}}, timeout=10).json()
        cid = r["id"]
        requests.post(f"{API}/integrations/channel-managers/{cid}/import-properties", headers=h, timeout=15)
        mp = requests.get(f"{API}/integrations/channel-managers/{cid}/mappings", headers=h, timeout=10).json()
        # unlink existing link on the target structure first
        existing = list(mongo.cm_property_mappings.find({"structure_id": structure_id, "status": "linked"}))
        for m in existing:
            requests.put(f"{API}/integrations/mappings/{m['id']}", headers=h,
                         json={"action": "unlink"}, timeout=10)
        lr = requests.put(f"{API}/integrations/mappings/{mp[0]['id']}", headers=h,
                          json={"action": "link", "structure_id": structure_id}, timeout=10)
        assert lr.status_code == 200
        requests.post(f"{API}/integrations/channel-managers/{cid}/sync", headers=h, timeout=30)
        before = mongo.cm_reservations.count_documents({"connection_id": cid})
        assert before > 0
        d = requests.delete(f"{API}/integrations/channel-managers/{cid}", headers=h, timeout=10)
        assert d.status_code == 200
        after = mongo.cm_reservations.count_documents({"connection_id": cid})
        assert after == before, "reservations must be preserved after connection delete"
        # cleanup: remove the leftover docs and unlink the mapping we created (mapping is owned by deleted conn)
        mongo.cm_reservations.delete_many({"connection_id": cid})
        mongo.cm_property_mappings.delete_many({"connection_id": cid})
        # restore structure.booking_source to manual if no other mapping links it
        other = mongo.cm_property_mappings.find_one({"structure_id": structure_id, "status": "linked"})
        if not other:
            mongo.structures.update_one({"id": structure_id}, {"$set": {"booking_source": "manual"}})


# ------------------- final cleanup -------------------
def test_zzz_cleanup(h, mongo):
    """Final cleanup — remove any TEST_ residue."""
    # Delete every TEST_ connection still around
    conns = requests.get(f"{API}/integrations/channel-managers", headers=h, timeout=10).json()
    test_ids = [c["id"] for c in conns if (c.get("name") or "").startswith("TEST_")]
    for cid in test_ids:
        # unlink any linked mapping so booking_source resets
        for m in mongo.cm_property_mappings.find({"connection_id": cid, "status": "linked"}):
            requests.put(f"{API}/integrations/mappings/{m['id']}", headers=h,
                         json={"action": "unlink"}, timeout=10)
        requests.delete(f"{API}/integrations/channel-managers/{cid}", headers=h, timeout=10)
        mongo.cm_reservations.delete_many({"connection_id": cid})
        mongo.cm_property_mappings.delete_many({"connection_id": cid})
    # Ensure real KLV structures don't retain booking_source=ical from tests
    for klv in ("KLV-0001", "KLV-0002", "KLV-0003"):
        s = mongo.structures.find_one({"klv_code": klv})
        if s and s.get("booking_source") == "ical":
            # only reset if no mapping still links it
            still = mongo.cm_property_mappings.find_one({"structure_id": s["id"], "status": "linked"})
            if not still:
                mongo.structures.update_one({"id": s["id"]}, {"$set": {"booking_source": "manual"}})
