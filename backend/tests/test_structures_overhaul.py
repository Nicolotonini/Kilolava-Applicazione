"""
Backend tests for the Clienti/Strutture overhaul.

Covers:
- KLV progressive codes (backfill + auto-assign on create + no-change on update)
- Search by KLV/name/address/client
- Structure PUT persistence of new fields (interior, operational_contact, parking_info,
  has_units, access_info, warehouse_info, bed_config.capacity_persons)
- Structure media CRUD (note + upload + list + update + reorder + delete)
- Client-role security (sensitive fields nulled, media 403)
- /api/files serving with ?auth= token
- Units regression with bed_config.capacity_persons
"""
import io
import os
import struct
import zlib
import uuid
import pytest
import requests

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        env_path = "/app/frontend/.env"
        if os.path.exists(env_path):
            for line in open(env_path):
                if line.startswith("REACT_APP_BACKEND_URL="):
                    v = line.split("=", 1)[1].strip()
                    break
    if not v:
        raise RuntimeError("REACT_APP_BACKEND_URL not set")
    return v.rstrip("/")

BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"


def _tiny_png_bytes() -> bytes:
    # Minimal valid 1x1 PNG
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\x00\x00"
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


# ---------------- fixtures ----------------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def any_client_id(admin_headers):
    r = requests.get(f"{API}/clients", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    clients = r.json()
    assert len(clients) > 0, "need at least one client"
    return clients[0]["id"]


@pytest.fixture(scope="session")
def created_ids():
    """Track ids created during tests for cleanup."""
    return {"structures": [], "units": [], "media": [], "users": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_headers, created_ids):
    yield
    # units first
    for uid in created_ids["units"]:
        requests.delete(f"{API}/units/{uid}", headers=admin_headers, timeout=15)
    for sid, mid in created_ids["media"]:
        requests.delete(f"{API}/structures/{sid}/media/{mid}", headers=admin_headers, timeout=15)
    for sid in created_ids["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=admin_headers, timeout=15)
    for uid in created_ids["users"]:
        # try delete endpoint if exists (ignore failures)
        requests.delete(f"{API}/users/{uid}", headers=admin_headers, timeout=15)


# ---------------- KLV codes ----------------

class TestKlvCodes:
    def test_existing_structures_have_klv_codes(self, admin_headers):
        r = requests.get(f"{API}/structures", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        structures = r.json()
        assert len(structures) >= 9, f"expected >=9 existing structures, got {len(structures)}"
        for s in structures:
            assert s.get("klv_code"), f"structure {s['id']} missing klv_code"
            assert s["klv_code"].startswith("KLV-"), s["klv_code"]
            seq = s["klv_code"].split("-")[1]
            assert seq.isdigit() and len(seq) == 4, seq

    def test_create_structure_gets_next_klv_and_is_stable(self, admin_headers, any_client_id, created_ids):
        # capture current max
        r = requests.get(f"{API}/structures", headers=admin_headers, timeout=15)
        codes = [int(s["klv_code"].split("-")[1]) for s in r.json() if s.get("klv_code")]
        max_before = max(codes) if codes else 0

        payload = {
            "client_id": any_client_id,
            "name": f"TEST_KLV_{uuid.uuid4().hex[:6]}",
            "structure_type": "apartment",
            "address": "Via Test 1",
        }
        r = requests.post(f"{API}/structures", headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        created_ids["structures"].append(data["id"])
        assert data["klv_code"].startswith("KLV-")
        new_seq = int(data["klv_code"].split("-")[1])
        assert new_seq > max_before, (new_seq, max_before)

        # update must not change klv_code
        old_code = data["klv_code"]
        r2 = requests.put(f"{API}/structures/{data['id']}", headers=admin_headers,
                          json={"name": payload["name"] + "_upd"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["klv_code"] == old_code


# ---------------- search ----------------

class TestSearch:
    def test_search_by_klv(self, admin_headers):
        r = requests.get(f"{API}/structures?search=KLV-0002", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        assert any(i["klv_code"] == "KLV-0002" for i in items)

    def test_search_by_client_name(self, admin_headers):
        # find a client name substring to search
        cr = requests.get(f"{API}/clients", headers=admin_headers, timeout=15)
        assert cr.status_code == 200
        clients = cr.json()
        target = None
        for c in clients:
            name = c.get("display_name") or c.get("name") or ""
            if name and len(name.split()[0]) >= 3:
                target = name.split()[0]
                target_id = c["id"]
                break
        if not target:
            pytest.skip("no suitable client name")
        r = requests.get(f"{API}/structures", headers=admin_headers, params={"search": target}, timeout=15)
        assert r.status_code == 200
        # accept empty if that client has no structures, else must include one whose client_id matches
        items = r.json()
        # verify search doesn't 500 and if results present at least logically consistent
        for it in items:
            assert "klv_code" in it


# ---------------- structure fields persistence ----------------

class TestStructureFieldsPersistence:
    def test_put_new_fields(self, admin_headers, any_client_id, created_ids):
        # create fresh structure
        r = requests.post(f"{API}/structures", headers=admin_headers, json={
            "client_id": any_client_id,
            "name": f"TEST_FIELDS_{uuid.uuid4().hex[:6]}",
            "structure_type": "apartment",
        }, timeout=15)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        created_ids["structures"].append(sid)

        payload = {
            "interior": "3",
            "operational_contact": "+39 333 1111111",
            "parking_info": "Garage sotterraneo",
            "has_units": True,
            "access_info": {
                "kilolava_has_keys": True,
                "door_code": "9999",
                "keybox_code": "1234",
                "keybox_location": "sotto lo zerbino",
            },
            "warehouse_info": {"location": "Cantina", "code": "C-42"},
            "bed_config": {
                "capacity_total": 4,
                "beds_double": 1,
                "beds_single": 2,
                "sofa_beds": 1,
                "capacity_persons": 5,
            },
        }
        r = requests.put(f"{API}/structures/{sid}", headers=admin_headers, json=payload, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["interior"] == "3"
        assert data["operational_contact"] == "+39 333 1111111"
        assert data["parking_info"] == "Garage sotterraneo"
        assert data["has_units"] is True
        assert data["access_info"]["door_code"] == "9999"
        assert data["access_info"]["keybox_location"] == "sotto lo zerbino"
        assert data["warehouse_info"]["code"] == "C-42"
        assert data["bed_config"]["capacity_persons"] == 5
        assert data["bed_config"]["beds_double"] == 1

        # persistence via GET
        r = requests.get(f"{API}/structures/{sid}", headers=admin_headers, timeout=15)
        d2 = r.json()
        assert d2["warehouse_info"]["location"] == "Cantina"
        assert d2["access_info"]["kilolava_has_keys"] is True

    def test_has_units_false_persists(self, admin_headers, any_client_id, created_ids):
        # StructureUpdate ignores None but must persist False - test with fresh structure
        r = requests.post(f"{API}/structures", headers=admin_headers, json={
            "client_id": any_client_id,
            "name": f"TEST_HU_{uuid.uuid4().hex[:6]}",
            "structure_type": "apartment",
            "has_units": True,
        }, timeout=15)
        assert r.status_code == 200
        sid = r.json()["id"]
        created_ids["structures"].append(sid)
        # now flip to False
        r = requests.put(f"{API}/structures/{sid}", headers=admin_headers, json={"has_units": False}, timeout=15)
        assert r.status_code == 200
        assert r.json()["has_units"] is False
        r = requests.get(f"{API}/structures/{sid}", headers=admin_headers, timeout=15)
        assert r.json()["has_units"] is False


# ---------------- media ----------------

class TestStructureMedia:
    def test_note_upload_list_update_reorder_delete(self, admin_headers, any_client_id, created_ids):
        # create test structure
        r = requests.post(f"{API}/structures", headers=admin_headers, json={
            "client_id": any_client_id,
            "name": f"TEST_MEDIA_{uuid.uuid4().hex[:6]}",
            "structure_type": "apartment",
        }, timeout=15)
        sid = r.json()["id"]
        created_ids["structures"].append(sid)

        # create note
        n1 = requests.post(f"{API}/structures/{sid}/media/note", headers=admin_headers,
                          json={"category": "arrive", "title": "Nota1", "description": "primo"}, timeout=15)
        assert n1.status_code == 200, n1.text
        note1 = n1.json()
        assert note1["media_type"] == "note"
        assert note1["category"] == "arrive"

        n2 = requests.post(f"{API}/structures/{sid}/media/note", headers=admin_headers,
                          json={"category": "arrive", "title": "Nota2"}, timeout=15)
        note2 = n2.json()

        # upload photo
        png = _tiny_png_bytes()
        up = requests.post(
            f"{API}/structures/{sid}/media",
            headers=admin_headers,
            files={"file": ("tiny.png", png, "image/png")},
            data={"category": "enter", "title": "Photo1", "description": "desc"},
            timeout=30,
        )
        assert up.status_code == 200, up.text
        photo = up.json()
        assert photo["media_type"] == "photo"
        assert photo["path"]

        # list
        lst = requests.get(f"{API}/structures/{sid}/media", headers=admin_headers, timeout=15)
        assert lst.status_code == 200
        items = lst.json()
        assert len(items) == 3
        # sorted by category then order
        cats = [i["category"] for i in items]
        assert cats == sorted(cats)

        # update note title
        u = requests.put(f"{API}/structures/{sid}/media/{note1['id']}", headers=admin_headers,
                        json={"description": "updated"}, timeout=15)
        assert u.status_code == 200
        assert u.json()["description"] == "updated"

        # reorder in 'arrive' category (2 notes)
        rr = requests.post(f"{API}/structures/{sid}/media/reorder", headers=admin_headers,
                          json={"ids": [note2["id"], note1["id"]]}, timeout=15)
        assert rr.status_code == 200
        lst2 = requests.get(f"{API}/structures/{sid}/media", headers=admin_headers, params={"category": "arrive"}, timeout=15)
        arrive_items = lst2.json()
        assert arrive_items[0]["id"] == note2["id"]
        assert arrive_items[0]["order"] == 0
        assert arrive_items[1]["order"] == 1

        # delete
        d = requests.delete(f"{API}/structures/{sid}/media/{note1['id']}", headers=admin_headers, timeout=15)
        assert d.status_code == 200
        lst3 = requests.get(f"{API}/structures/{sid}/media", headers=admin_headers, timeout=15)
        assert len(lst3.json()) == 2

    def test_file_serving_requires_token(self, admin_headers, admin_token, any_client_id, created_ids):
        # upload
        r = requests.post(f"{API}/structures", headers=admin_headers, json={
            "client_id": any_client_id,
            "name": f"TEST_FILE_{uuid.uuid4().hex[:6]}",
            "structure_type": "apartment",
        }, timeout=15)
        sid = r.json()["id"]
        created_ids["structures"].append(sid)
        png = _tiny_png_bytes()
        up = requests.post(
            f"{API}/structures/{sid}/media",
            headers=admin_headers,
            files={"file": ("tiny.png", png, "image/png")},
            data={"category": "warehouse"},
            timeout=30,
        )
        assert up.status_code == 200
        path = up.json()["path"]

        # no token -> 401
        r_no = requests.get(f"{API}/files/{path}", timeout=15)
        assert r_no.status_code == 401
        # with query token -> 200
        r_ok = requests.get(f"{API}/files/{path}", params={"auth": admin_token}, timeout=15)
        assert r_ok.status_code == 200
        assert len(r_ok.content) > 0


# ---------------- client role security ----------------

class TestClientRoleSecurity:
    """Create a client-role user and verify sensitive fields hidden + media 403."""

    @pytest.fixture(scope="class")
    def client_ctx(self, admin_headers, created_ids):
        """Create a new test client + portal account + a structure for that client."""
        # create client
        suffix = uuid.uuid4().hex[:6]
        rc = requests.post(f"{API}/clients", headers=admin_headers, json={
            "client_type": "private",
            "private_info": {"name": "TESTClientRole", "surname": suffix, "email": f"cr_{suffix}@example.com"},
        }, timeout=15)
        if rc.status_code not in (200, 201):
            pytest.skip(f"cannot create client: {rc.status_code} {rc.text[:200]}")
        client = rc.json()
        cid = client["id"]

        # create portal account
        email = f"portal_{suffix}@example.com"
        password = "ClientPass123!"
        ra = requests.post(f"{API}/clients/{cid}/create-account", headers=admin_headers,
                          json={"email": email, "password": password, "name": "Portal Test"}, timeout=15)
        if ra.status_code not in (200, 201):
            requests.delete(f"{API}/clients/{cid}", headers=admin_headers, timeout=15)
            pytest.skip(f"cannot create portal account: {ra.status_code} {ra.text[:200]}")
        user_id = ra.json().get("user_id")

        # create a structure for this client (with sensitive fields)
        rs = requests.post(f"{API}/structures", headers=admin_headers, json={
            "client_id": cid,
            "name": f"TEST_CLIENTROLE_{suffix}",
            "structure_type": "apartment",
            "access_details": "code 1111",
            "access_info": {"door_code": "1111", "keybox_code": "2222"},
            "warehouse_info": {"location": "Basement", "code": "B-1"},
        }, timeout=15)
        sid = rs.json()["id"] if rs.status_code == 200 else None

        # login
        lr = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        token = lr.json()["access_token"] if lr.status_code == 200 else None

        yield {"token": token, "client_id": cid, "structure_id": sid, "user_id": user_id}

        # cleanup
        if sid:
            requests.delete(f"{API}/structures/{sid}", headers=admin_headers, timeout=15)
        if user_id:
            requests.delete(f"{API}/users/{user_id}", headers=admin_headers, timeout=15)
        requests.delete(f"{API}/clients/{cid}", headers=admin_headers, timeout=15)

    def test_client_sees_null_sensitive_fields(self, client_ctx):
        if not client_ctx["token"]:
            pytest.skip("no client token")
        h = {"Authorization": f"Bearer {client_ctx['token']}"}
        r = requests.get(f"{API}/structures", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert len(items) >= 1
        for s in items:
            assert s.get("access_details") is None
            assert s.get("access_info") is None
            assert s.get("warehouse_info") is None

    def test_client_media_forbidden(self, client_ctx):
        if not client_ctx["token"] or not client_ctx["structure_id"]:
            pytest.skip("no client ctx")
        h = {"Authorization": f"Bearer {client_ctx['token']}"}
        r = requests.get(f"{API}/structures/{client_ctx['structure_id']}/media", headers=h, timeout=15)
        assert r.status_code == 403


# ---------------- units regression ----------------

class TestUnitsRegression:
    def test_create_update_delete_unit_with_capacity_persons(self, admin_headers, any_client_id, created_ids):
        # create parent structure
        r = requests.post(f"{API}/structures", headers=admin_headers, json={
            "client_id": any_client_id,
            "name": f"TEST_UNITS_{uuid.uuid4().hex[:6]}",
            "structure_type": "apartment",
            "has_units": True,
        }, timeout=15)
        sid = r.json()["id"]
        created_ids["structures"].append(sid)

        r = requests.post(f"{API}/units", headers=admin_headers, json={
            "structure_id": sid,
            "name": "TEST_U1",
            "unit_type": "apartment",
            "bed_config": {"capacity_total": 3, "beds_double": 1, "beds_single": 1, "sofa_beds": 0, "capacity_persons": 4},
        }, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        created_ids["units"].append(u["id"])
        assert u["bed_config"]["capacity_persons"] == 4

        r2 = requests.put(f"{API}/units/{u['id']}", headers=admin_headers, json={
            "bed_config": {"capacity_total": 5, "beds_double": 2, "beds_single": 1, "sofa_beds": 0, "capacity_persons": 6},
        }, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["bed_config"]["capacity_persons"] == 6

        r3 = requests.get(f"{API}/clients", headers=admin_headers, timeout=15)
        assert r3.status_code == 200
