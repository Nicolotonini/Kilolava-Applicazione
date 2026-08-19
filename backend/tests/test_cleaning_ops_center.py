"""
Iteration 9 — CENTRO OPERATIVO PULIZIE Admin
Tests: Zones CRUD/reorder/RBAC, Structure operational_zone_id + enrichment,
multi-cleaner assign/unassign/idempotency, route-order, regression base.
Self-cleaning (TEST_ prefix).
"""
import os
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return v.rstrip("/")

BASE_URL = _load_backend_url()
assert BASE_URL, "REACT_APP_BACKEND_URL not found"

ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
CLEANER = {"email": "addetta_test@kilolava.com", "password": "AddettaTest123!"}
TEST_STRUCTURE_ID = "3d70c213-d948-47ec-9839-b5a37acc2d23"  # Appartamento Centro (KLV-0002)


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cleaner_headers():
    tok = _login(CLEANER)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cleaners(admin_headers):
    r = requests.get(f"{BASE_URL}/api/users?role=cleaner", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    lst = r.json()
    # both required cleaners must exist
    ids = {u["email"]: u["id"] for u in lst}
    anna = next((u["id"] for u in lst if u["email"] == "addetta_test@kilolava.com"), None)
    maria = next((u["id"] for u in lst if "maria" in (u.get("name") or "").lower() or "maria" in (u["email"] or "").lower()), None)
    if not maria:
        # fallback: any other cleaner id
        others = [u["id"] for u in lst if u["id"] != anna]
        maria = others[0] if others else None
    assert anna and maria, f"missing cleaners: {lst}"
    return {"anna": anna, "maria": maria}


# ================== ZONES ==================

class TestZones:
    def test_list_zones_seed_ok(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/zones", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        zones = r.json()
        # ~41 (seed); accept >=35
        assert len(zones) >= 35, f"too few zones: {len(zones)}"
        # ordered by 'order'
        orders = [z.get("order", 0) for z in zones]
        assert orders == sorted(orders)
        # last is 'Altro / Da definire'
        assert "Altro" in zones[-1]["name"], f"last zone: {zones[-1]}"
        # Cavana present
        assert any(z["name"] == "Cavana" for z in zones)

    def test_cleaner_forbidden(self, cleaner_headers):
        r = requests.get(f"{BASE_URL}/api/zones", headers=cleaner_headers, timeout=15)
        assert r.status_code == 403

    def test_create_rename_reorder_deactivate(self, admin_headers):
        # Create two TEST_ zones
        r1 = requests.post(f"{BASE_URL}/api/zones", headers=admin_headers,
                           json={"name": "TEST_ZoneA", "group": "TEST"}, timeout=15)
        assert r1.status_code == 200, r1.text
        z1 = r1.json()
        r2 = requests.post(f"{BASE_URL}/api/zones", headers=admin_headers,
                           json={"name": "TEST_ZoneB", "group": "TEST"}, timeout=15)
        assert r2.status_code == 200
        z2 = r2.json()

        try:
            # Rename
            rr = requests.put(f"{BASE_URL}/api/zones/{z1['id']}", headers=admin_headers,
                              json={"name": "TEST_ZoneA_renamed"}, timeout=15)
            assert rr.status_code == 200 and rr.json()["name"] == "TEST_ZoneA_renamed"

            # Reorder: put z2 before z1 (only within our created ids)
            ro = requests.put(f"{BASE_URL}/api/zones/reorder", headers=admin_headers,
                              json={"ids": [z2["id"], z1["id"]]}, timeout=15)
            assert ro.status_code == 200
            # After reorder, both should have order 0 and 1
            lst = requests.get(f"{BASE_URL}/api/zones?include_inactive=true", headers=admin_headers, timeout=15).json()
            by_id = {z["id"]: z for z in lst}
            assert by_id[z2["id"]]["order"] == 0
            assert by_id[z1["id"]]["order"] == 1

            # Deactivate z1
            du = requests.put(f"{BASE_URL}/api/zones/{z1['id']}", headers=admin_headers,
                              json={"active": False}, timeout=15)
            assert du.status_code == 200 and du.json()["active"] is False

            # Default list excludes inactive; include_inactive includes
            active = requests.get(f"{BASE_URL}/api/zones", headers=admin_headers, timeout=15).json()
            assert z1["id"] not in {z["id"] for z in active}
            allz = requests.get(f"{BASE_URL}/api/zones?include_inactive=true", headers=admin_headers, timeout=15).json()
            assert z1["id"] in {z["id"] for z in allz}
        finally:
            # Cleanup: hard delete via direct Mongo not exposed; instead deactivate + rename to keep clean
            for zid in (z1["id"], z2["id"]):
                requests.put(f"{BASE_URL}/api/zones/{zid}", headers=admin_headers,
                             json={"active": False, "name": "TEST_deleted"}, timeout=15)


# ================== STRUCTURE ZONE ==================

class TestStructureZone:
    def test_structure_has_zone_and_enrichment_flows(self, admin_headers):
        # Fetch existing zones and pick 'Cavana'
        zones = requests.get(f"{BASE_URL}/api/zones", headers=admin_headers, timeout=15).json()
        cavana = next(z for z in zones if z["name"] == "Cavana")

        # Ensure structure has operational_zone_id set to Cavana
        upd = requests.put(f"{BASE_URL}/api/structures/{TEST_STRUCTURE_ID}", headers=admin_headers,
                           json={"operational_zone_id": cavana["id"]}, timeout=15)
        assert upd.status_code == 200, upd.text
        assert upd.json().get("operational_zone_id") == cavana["id"]

        # GET structure returns it
        g = requests.get(f"{BASE_URL}/api/structures/{TEST_STRUCTURE_ID}", headers=admin_headers, timeout=15)
        assert g.status_code == 200
        assert g.json().get("operational_zone_id") == cavana["id"]

        # Cleaning tasks of this structure carry zone enrichment
        tasks = requests.get(f"{BASE_URL}/api/cleaning-tasks", headers=admin_headers, timeout=15).json()
        our = [t for t in tasks if t.get("structure_id") == TEST_STRUCTURE_ID]
        assert our, "no tasks for the structure"
        with_zone = [t for t in our if t.get("zone_name") == "Cavana"]
        assert with_zone, f"no task with zone_name=Cavana; sample: {our[0]}"


# ================== ASSIGN / UNASSIGN / ROUTE-ORDER ==================

@pytest.fixture()
def fresh_task(admin_headers):
    payload = {
        "structure_id": TEST_STRUCTURE_ID,
        "date": "2026-11-15",
        "guests_count": 2,
        "beds_double": 1, "beds_single": 0, "beds_sofa": 0,
        "checkin_today": False,
        "notes": "TEST_ops_center",
    }
    r = requests.post(f"{BASE_URL}/api/cleaning-tasks", headers=admin_headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    yield tid
    requests.delete(f"{BASE_URL}/api/cleaning-tasks/{tid}", headers=admin_headers, timeout=15)


class TestAssignFlow:
    def test_create_unassigned(self, fresh_task, admin_headers):
        r = requests.get(f"{BASE_URL}/api/cleaning-tasks/{fresh_task}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["status"] == "unassigned"
        assert not (j.get("assigned_cleaner_ids") or [])

    def test_assign_then_second_multi(self, fresh_task, admin_headers, cleaners):
        # Assign Anna
        a = requests.post(f"{BASE_URL}/api/cleaning-tasks/{fresh_task}/assign", headers=admin_headers,
                          json={"cleaner_id": cleaners["anna"]}, timeout=15)
        assert a.status_code == 200
        j = a.json()
        assert j["status"] == "assigned"
        assert cleaners["anna"] in (j.get("assigned_cleaner_ids") or [])

        # Idempotent: second identical assign is no-op
        a2 = requests.post(f"{BASE_URL}/api/cleaning-tasks/{fresh_task}/assign", headers=admin_headers,
                           json={"cleaner_id": cleaners["anna"]}, timeout=15)
        assert a2.status_code == 200
        assert (a2.json().get("assigned_cleaner_ids") or []).count(cleaners["anna"]) == 1

        # Assign Maria: same record, both ids present
        a3 = requests.post(f"{BASE_URL}/api/cleaning-tasks/{fresh_task}/assign", headers=admin_headers,
                           json={"cleaner_id": cleaners["maria"]}, timeout=15)
        assert a3.status_code == 200
        ids = a3.json().get("assigned_cleaner_ids") or []
        assert set(ids) == {cleaners["anna"], cleaners["maria"]}, ids

        # Not duplicated as a new task
        all_tasks = requests.get(f"{BASE_URL}/api/cleaning-tasks", headers=admin_headers, timeout=15).json()
        same = [t for t in all_tasks if t.get("id") == fresh_task]
        assert len(same) == 1

        # Unassign Anna only
        d1 = requests.delete(f"{BASE_URL}/api/cleaning-tasks/{fresh_task}/assign/{cleaners['anna']}",
                             headers=admin_headers, timeout=15)
        assert d1.status_code == 200
        assert d1.json().get("assigned_cleaner_ids") == [cleaners["maria"]]
        assert d1.json()["status"] == "assigned"

        # Unassign Maria → becomes unassigned
        d2 = requests.delete(f"{BASE_URL}/api/cleaning-tasks/{fresh_task}/assign/{cleaners['maria']}",
                             headers=admin_headers, timeout=15)
        assert d2.status_code == 200
        assert (d2.json().get("assigned_cleaner_ids") or []) == []
        assert d2.json()["status"] == "unassigned"

    def test_route_order(self, admin_headers, cleaners):
        # Create two tasks, assign both to Anna
        payloads = [
            {"structure_id": TEST_STRUCTURE_ID, "date": "2026-11-16", "guests_count": 2,
             "beds_double": 1, "beds_single": 0, "beds_sofa": 0, "notes": "TEST_route_A"},
            {"structure_id": TEST_STRUCTURE_ID, "date": "2026-11-16", "guests_count": 2,
             "beds_double": 1, "beds_single": 0, "beds_sofa": 0, "notes": "TEST_route_B"},
        ]
        ids = []
        try:
            for p in payloads:
                r = requests.post(f"{BASE_URL}/api/cleaning-tasks", headers=admin_headers, json=p, timeout=15)
                assert r.status_code == 200
                tid = r.json()["id"]
                ids.append(tid)
                a = requests.post(f"{BASE_URL}/api/cleaning-tasks/{tid}/assign", headers=admin_headers,
                                  json={"cleaner_id": cleaners["anna"]}, timeout=15)
                assert a.status_code == 200

            # Set route order: B then A
            ordered = [ids[1], ids[0]]
            r = requests.put(f"{BASE_URL}/api/cleaning-tasks/route-order", headers=admin_headers,
                             json={"cleaner_id": cleaners["anna"], "ordered_task_ids": ordered}, timeout=15)
            assert r.status_code == 200
            assert r.json()["updated"] == 2

            # Verify persistence via list
            all_tasks = requests.get(f"{BASE_URL}/api/cleaning-tasks", headers=admin_headers, timeout=15).json()
            by_id = {t["id"]: t for t in all_tasks}
            ro_b = (by_id[ids[1]].get("route_order") or {}).get(cleaners["anna"])
            ro_a = (by_id[ids[0]].get("route_order") or {}).get(cleaners["anna"])
            assert ro_b == 0 and ro_a == 1, f"route order not persisted: A={ro_a} B={ro_b}"

            # After unassign, route_order key for that cleaner is removed
            requests.delete(f"{BASE_URL}/api/cleaning-tasks/{ids[0]}/assign/{cleaners['anna']}",
                            headers=admin_headers, timeout=15)
            after = requests.get(f"{BASE_URL}/api/cleaning-tasks/{ids[0]}", headers=admin_headers, timeout=15).json()
            assert cleaners["anna"] not in (after.get("route_order") or {})
        finally:
            for tid in ids:
                requests.delete(f"{BASE_URL}/api/cleaning-tasks/{tid}", headers=admin_headers, timeout=15)


# ================== REGRESSION ==================

class TestRegression:
    def test_bed_max_validation(self, admin_headers):
        # bed_config max double=2 for KLV-0002; ask for 5 → 400 'massimo'
        r = requests.post(f"{BASE_URL}/api/cleaning-tasks", headers=admin_headers, json={
            "structure_id": TEST_STRUCTURE_ID, "date": "2026-11-17",
            "guests_count": 5, "beds_double": 5, "beds_single": 0, "beds_sofa": 0,
            "notes": "TEST_bedmax",
        }, timeout=15)
        assert r.status_code == 400
        assert "massimo" in r.text.lower(), r.text

    def test_client_portal_minimal(self):
        # Client login → /portal endpoints must not expose internal data
        tok = _login({"email": "cliente_test@kilolava.com", "password": "ClienteTest123!"})
        h = {"Authorization": f"Bearer {tok}"}
        # Portal endpoints
        r = requests.get(f"{BASE_URL}/api/portal/me", headers=h, timeout=15)
        # 200 or 404 depending on impl; must not 500
        assert r.status_code in (200, 404), r.text
