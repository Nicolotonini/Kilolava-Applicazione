"""Iteration 4 tests: key_boxes persistence, client logo, google-sheets endpoints,
sheets_sync._build_tabs 9-tab shape & sensitive-code exclusion."""
import os
import io
import sys
import asyncio
import pathlib
import struct
import zlib

import pytest
import requests

# Load REACT_APP_BACKEND_URL from frontend/.env if not set
if not os.environ.get("REACT_APP_BACKEND_URL"):
    envp = pathlib.Path("/app/frontend/.env")
    if envp.exists():
        for line in envp.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                os.environ["REACT_APP_BACKEND_URL"] = line.split("=", 1)[1].strip()

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASS = "TestPass123!"

# Ensure backend module is importable for direct call tests
sys.path.insert(0, "/app/backend")

# Load backend/.env for MONGO_URL / DB_NAME before importing services
_benv = pathlib.Path("/app/backend/.env")
if _benv.exists():
    for line in _benv.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


# ---------- helpers ----------
def _tiny_png_bytes():
    """Return a valid 1x1 PNG."""
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def klv0002_id(auth):
    r = requests.get(f"{BASE_URL}/api/structures", headers=auth, timeout=30)
    assert r.status_code == 200
    for s in r.json():
        if s.get("klv_code") == "KLV-0002":
            return s["id"]
    pytest.skip("KLV-0002 not present in DB")


# ---------- Google Sheets endpoints ----------
class TestGoogleSheetsIntegration:
    def test_status_unconfigured(self, auth):
        r = requests.get(f"{BASE_URL}/api/integrations/google-sheets/status", headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["configured"] is False
        missing = set(data.get("missing") or [])
        assert "GOOGLE_SERVICE_ACCOUNT_JSON" in missing
        assert "GOOGLE_SHEETS_SPREADSHEET_ID" in missing

    def test_sync_graceful_400(self, auth):
        r = requests.post(f"{BASE_URL}/api/integrations/google-sheets/sync", headers=auth, timeout=30)
        assert r.status_code == 400, r.text
        detail = (r.json().get("detail") or "").lower()
        assert "google fogli" in detail or "non configurato" in detail

    def test_status_and_sync_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/integrations/google-sheets/status", timeout=30)
        assert r.status_code in (401, 403)
        r = requests.post(f"{BASE_URL}/api/integrations/google-sheets/sync", timeout=30)
        assert r.status_code in (401, 403)


# ---------- key_boxes persistence ----------
class TestKeyBoxesPersistence:
    def test_key_boxes_returned_on_klv0002(self, auth, klv0002_id):
        r = requests.get(f"{BASE_URL}/api/structures/{klv0002_id}", headers=auth, timeout=30)
        assert r.status_code == 200
        s = r.json()
        ai = s.get("access_info") or {}
        kb = ai.get("key_boxes") or {}
        # main agent said A/B present slot 2, C missing
        assert set(kb.keys()) >= {"A", "B", "C"}, f"key_boxes keys: {list(kb.keys())}"

    def test_put_key_boxes_persists(self, auth, klv0002_id):
        r = requests.get(f"{BASE_URL}/api/structures/{klv0002_id}", headers=auth, timeout=30)
        original = (r.json().get("access_info") or {})
        # Build a full access_info payload keeping originals + explicit key_boxes
        payload_ai = {
            **original,
            "kilolava_has_keys": True,
            "key_boxes": {
                "A": {"box": 1, "slot": 7, "present": True, "note": "TEST_A"},
                "B": {"box": 1, "slot": 8, "present": True, "note": "TEST_B"},
                "C": {"box": None, "slot": None, "present": False, "note": "TEST_C_missing"},
            },
        }
        put = requests.put(
            f"{BASE_URL}/api/structures/{klv0002_id}",
            headers=auth,
            json={"access_info": payload_ai},
            timeout=30,
        )
        assert put.status_code == 200, put.text
        # Reload
        r2 = requests.get(f"{BASE_URL}/api/structures/{klv0002_id}", headers=auth, timeout=30)
        kb = (r2.json().get("access_info") or {}).get("key_boxes") or {}
        assert kb.get("A", {}).get("slot") == 7
        assert kb.get("A", {}).get("present") is True
        assert kb.get("B", {}).get("slot") == 8
        assert kb.get("C", {}).get("present") is False
        assert kb.get("C", {}).get("note") == "TEST_C_missing"

        # Restore original access_info
        requests.put(
            f"{BASE_URL}/api/structures/{klv0002_id}",
            headers=auth,
            json={"access_info": original},
            timeout=30,
        )


# ---------- Client logo endpoints ----------
class TestClientLogo:
    @pytest.fixture(scope="class")
    def test_client_id(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/clients",
            headers=auth,
            json={
                "client_type": "private",
                "private_info": {"name": "TESTLOGO", "surname": "User", "phone": "0000", "email": "testlogo@example.com"},
                "is_active": True,
            },
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        cid = r.json()["id"]
        yield cid
        requests.delete(f"{BASE_URL}/api/clients/{cid}", headers=auth, timeout=30)

    def test_upload_and_get_logo(self, auth, test_client_id):
        files = {"file": ("logo.png", _tiny_png_bytes(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/clients/{test_client_id}/logo", headers=auth, files=files, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("logo_path")

        # GET single
        g = requests.get(f"{BASE_URL}/api/clients/{test_client_id}", headers=auth, timeout=30)
        assert g.status_code == 200
        assert g.json().get("logo_path")

        # GET list should also include logo_path
        gl = requests.get(f"{BASE_URL}/api/clients", headers=auth, timeout=30)
        assert gl.status_code == 200
        entry = next((c for c in gl.json() if c["id"] == test_client_id), None)
        assert entry is not None
        assert entry.get("logo_path")

    def test_reject_non_image(self, auth, test_client_id):
        files = {"file": ("bad.txt", b"not an image", "text/plain")}
        r = requests.post(f"{BASE_URL}/api/clients/{test_client_id}/logo", headers=auth, files=files, timeout=30)
        assert r.status_code == 400, r.text

    def test_delete_logo(self, auth, test_client_id):
        # ensure uploaded first (idempotent)
        files = {"file": ("logo.png", _tiny_png_bytes(), "image/png")}
        requests.post(f"{BASE_URL}/api/clients/{test_client_id}/logo", headers=auth, files=files, timeout=30)
        d = requests.delete(f"{BASE_URL}/api/clients/{test_client_id}/logo", headers=auth, timeout=30)
        assert d.status_code == 200, d.text
        g = requests.get(f"{BASE_URL}/api/clients/{test_client_id}", headers=auth, timeout=30)
        assert g.json().get("logo_path") in (None, "")


# ---------- sheets_sync._build_tabs offline ----------
class TestSheetsSyncBuildTabs:
    def test_9_tabs_and_no_sensitive_codes(self):
        from services.sheets_sync import _build_tabs
        tabs = asyncio.get_event_loop().run_until_complete(_build_tabs()) if False else asyncio.run(_build_tabs())
        titles = [t["title"] for t in tabs]
        expected = ["Clienti", "Strutture", "Chiavi", "Magazzino Strutture", "Pulizie",
                    "Consegne", "Lavanderia Privata", "Lavanderia a Noleggio", "Manutenzioni"]
        assert titles == expected, f"Got tabs: {titles}"

        # Sensitive codes must never appear in Strutture / Chiavi rows
        # KLV-0002 has door_code=1234, keybox_code=5678 per main agent
        SENSITIVE = ["1234", "5678"]
        for tab in tabs:
            if tab["title"] not in ("Strutture", "Chiavi"):
                continue
            for row in tab["rows"]:
                joined = " ".join(str(cell) for cell in row)
                for code in SENSITIVE:
                    assert code not in joined, f"Sensitive code {code} leaked in tab {tab['title']}: {row}"

        # Chiavi headers should not mention door/keybox codes
        chiavi = next(t for t in tabs if t["title"] == "Chiavi")
        joined_headers = " ".join(chiavi["headers"]).lower()
        for forbidden in ["door", "codice porta", "keybox", "codice cassetta"]:
            assert forbidden not in joined_headers, f"forbidden term '{forbidden}' in Chiavi headers"
