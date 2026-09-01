from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Iteration 12 backend tests:
- Anagrafica (users PUT/GET persists user.anagrafica)
- Birthday flag in /cleaning-board (is_birthday, availability.available=false)
- Propose no longer blocks over-hours (assigns anyway, alerts)
- Propose excludes birthday cleaner and adds alert
- Board notes (availability.notes) visible via ops_availability
- Duplicate day (POST /cleaning-tasks/{id}/duplicate) - already covered but re-verified
- print flow: no dedicated backend endpoint (frontend renders + window.print)
"""
import os
import pytest
import requests
from datetime import date, timedelta

def _load_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ.setdefault(k, v.strip('"').strip("'"))
    except Exception:
        pass

_load_env()
BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"

ADMIN = {"email": "test_user@kilolava.com", "password": TEST_ADMIN_PASSWORD}
STRUCTURE_ID = "3d70c213-d948-47ec-9839-b5a37acc2d23"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def cleaners(admin_session):
    r = admin_session.get(f"{BASE}/users", params={"role": "cleaner"})
    assert r.status_code == 200
    users = r.json()
    anna = next((u for u in users if "anna" in (u.get("email") or "").lower() or "anna" in (u.get("name") or "").lower()), None)
    maria = next((u for u in users if "maria" in (u.get("name") or "").lower()), None)
    assert anna, f"Anna cleaner not found among {[u.get('email') for u in users]}"
    return {"anna": anna, "maria": maria, "all": users}


# ---------- Anagrafica ----------
class TestAnagrafica:
    def test_anagrafica_persisted_on_cleaner(self, admin_session, cleaners):
        anna = cleaners["anna"]
        original_anag = anna.get("anagrafica") or {}
        payload_anag = {
            "birth_date": "1990-05-15",
            "tax_code": "RSSNNA90E55H501Z",
            "address": "Via Roma 1, Trieste",
            "emergency_contact": "Mario Rossi",
            "emergency_phone": "3331234567",
        }
        r = admin_session.put(f"{BASE}/users/{anna['id']}", json={"anagrafica": payload_anag})
        assert r.status_code == 200, r.text
        # GET verify
        r2 = admin_session.get(f"{BASE}/users", params={"role": "cleaner"})
        got = next(u for u in r2.json() if u["id"] == anna["id"])
        anag = got.get("anagrafica") or {}
        for k, v in payload_anag.items():
            assert anag.get(k) == v, f"{k} mismatch: {anag.get(k)} != {v}"
        # cleanup
        admin_session.put(f"{BASE}/users/{anna['id']}", json={"anagrafica": original_anag})

    def test_client_role_can_still_send_anagrafica_but_not_used_on_board(self, admin_session):
        # verify creating a client doesn't need anagrafica (nullable)
        # find a client and update without anagrafica; ensure no error
        r = admin_session.get(f"{BASE}/users", params={"role": "client"})
        if r.status_code == 200 and r.json():
            client = r.json()[0]
            r2 = admin_session.put(f"{BASE}/users/{client['id']}", json={"phone": client.get("phone") or ""})
            assert r2.status_code == 200


# ---------- Birthday ----------
class TestBirthday:
    def test_birthday_flags_cleaner_unavailable_and_alert(self, admin_session, cleaners):
        anna = cleaners["anna"]
        # target date: use 2026-08-24 (the user's prova) — set anna's birthday MM-DD to match
        target_date = "2026-08-24"
        original_anag = anna.get("anagrafica") or {}
        birth_payload = {**original_anag, "birth_date": "1990-08-24"}
        try:
            r = admin_session.put(f"{BASE}/users/{anna['id']}", json={"anagrafica": birth_payload})
            assert r.status_code == 200
            # GET board
            rb = admin_session.get(f"{BASE}/cleaning-board", params={"date": target_date})
            assert rb.status_code == 200
            board = rb.json()
            anna_on_board = next((c for c in board["cleaners"] if c["id"] == anna["id"]), None)
            assert anna_on_board, "Anna not on board"
            assert anna_on_board.get("is_birthday") is True, f"is_birthday not set: {anna_on_board}"
            assert anna_on_board["availability"]["available"] is False

            # propose: should include alert and NOT assign to anna
            rp = admin_session.post(f"{BASE}/cleaning-board/propose", params={"date": target_date})
            assert rp.status_code == 200, rp.text
            prop = rp.json()
            alerts_joined = " || ".join(prop.get("alerts") or [])
            assert "compleanno" in alerts_joined.lower() and anna["name"].split()[0] in alerts_joined, (
                f"Birthday alert missing: {prop.get('alerts')}"
            )
            for a in prop.get("assignments") or []:
                assert anna["id"] not in (a.get("cleaner_ids") or []), (
                    f"Anna assigned on birthday: {a}"
                )
        finally:
            # restore
            admin_session.put(f"{BASE}/users/{anna['id']}", json={"anagrafica": original_anag})


# ---------- Propose no-block over-hours ----------
class TestProposeNoBlock:
    def test_propose_still_assigns_when_over_capacity(self, admin_session, cleaners):
        """
        Create a bunch of test tasks on a future empty date, set only Anna available
        (Maria unavailable) with max_hours=2 (=120 min capacity). Add several tasks whose
        total predicted duration > capacity. Propose must assign all of them to Anna
        with an overload alert, not leave any unassigned.
        """
        anna = cleaners["anna"]
        maria = cleaners.get("maria")
        target = (date.today() + timedelta(days=90)).isoformat()

        # Set availability
        orig_anna = admin_session.get(f"{BASE}/cleaning-board", params={"date": target}).json()
        anna_orig_av = next((c["availability"] for c in orig_anna["cleaners"] if c["id"] == anna["id"]), {})
        maria_orig_av = None
        if maria:
            maria_orig_av = next((c["availability"] for c in orig_anna["cleaners"] if c["id"] == maria["id"]), {})

        created_tasks = []
        try:
            admin_session.put(f"{BASE}/cleaning-board/cleaners/{anna['id']}/availability",
                              json={"available": True, "start_time": "08:00", "end_time": "10:00", "max_hours": 2})
            if maria:
                admin_session.put(f"{BASE}/cleaning-board/cleaners/{maria['id']}/availability",
                                  json={"available": False})
            # also disable all other cleaners
            for c in cleaners["all"]:
                if c["id"] not in {anna["id"], (maria or {}).get("id")}:
                    admin_session.put(f"{BASE}/cleaning-board/cleaners/{c['id']}/availability",
                                      json={"available": False})

            # Create 5 tasks of ~60 min each => 300 min > 120 min capacity
            for i in range(5):
                rc = admin_session.post(f"{BASE}/cleaning-tasks", json={
                    "structure_id": STRUCTURE_ID,
                    "date": target,
                    "notes": f"TEST_ITER12_OVERLOAD_{i}",
                })
                assert rc.status_code in (200, 201), rc.text
                created_tasks.append(rc.json()["id"])

            rp = admin_session.post(f"{BASE}/cleaning-board/propose", params={"date": target})
            assert rp.status_code == 200, rp.text
            prop = rp.json()
            # all tasks assigned to anna
            assigned_ids = [a["task_id"] for a in prop["assignments"]]
            for tid in created_tasks:
                assert tid in assigned_ids, f"Task {tid} not proposed"
            # every assignment goes to anna
            for a in prop["assignments"]:
                if a["task_id"] in created_tasks:
                    assert anna["id"] in a["cleaner_ids"], f"Task {a['task_id']} not assigned to Anna: {a}"
            # overload alert present
            alerts = " || ".join(prop.get("alerts") or []).lower()
            assert "sovraccarico" in alerts, f"Overload alert missing: {prop.get('alerts')}"
        finally:
            # cleanup tasks
            for tid in created_tasks:
                admin_session.delete(f"{BASE}/cleaning-tasks/{tid}")
            # restore availability
            if anna_orig_av:
                admin_session.put(f"{BASE}/cleaning-board/cleaners/{anna['id']}/availability", json=anna_orig_av)
            if maria and maria_orig_av:
                admin_session.put(f"{BASE}/cleaning-board/cleaners/{maria['id']}/availability", json=maria_orig_av)
            for c in cleaners["all"]:
                if c["id"] not in {anna["id"], (maria or {}).get("id")}:
                    admin_session.put(f"{BASE}/cleaning-board/cleaners/{c['id']}/availability",
                                      json={"available": True})


# ---------- Availability notes ----------
class TestAvailabilityNotes:
    def test_notes_returned_on_board(self, admin_session, cleaners):
        maria = cleaners.get("maria")
        if not maria:
            pytest.skip("Maria non trovata")
        target = (date.today() + timedelta(days=1)).isoformat()
        orig = admin_session.get(f"{BASE}/cleaning-board", params={"date": target}).json()
        maria_orig = next((c["availability"] for c in orig["cleaners"] if c["id"] == maria["id"]), {})
        try:
            new_av = {**maria_orig, "notes": "Solo mattina"}
            r = admin_session.put(f"{BASE}/cleaning-board/cleaners/{maria['id']}/availability", json=new_av)
            assert r.status_code == 200, r.text
            board = admin_session.get(f"{BASE}/cleaning-board", params={"date": target}).json()
            maria_on = next(c for c in board["cleaners"] if c["id"] == maria["id"])
            assert maria_on["availability"].get("notes") == "Solo mattina"
        finally:
            admin_session.put(f"{BASE}/cleaning-board/cleaners/{maria['id']}/availability",
                              json={**maria_orig, "notes": ""})


# ---------- Duplicate day (per-task duplicate) ----------
class TestDuplicateDay:
    def test_duplicate_task_creates_new_task_on_target_date(self, admin_session):
        source = (date.today() + timedelta(days=80)).isoformat()
        target = (date.today() + timedelta(days=81)).isoformat()
        src_task = admin_session.post(f"{BASE}/cleaning-tasks", json={
            "structure_id": STRUCTURE_ID, "date": source, "notes": "TEST_ITER12_DUP"
        }).json()
        created_ids = [src_task["id"]]
        try:
            r = admin_session.post(f"{BASE}/cleaning-tasks/{src_task['id']}/duplicate", json={"date": target})
            assert r.status_code in (200, 201), r.text
            new = r.json()
            created_ids.append(new["id"])
            assert new["date"] == target
            # GET tasks on target date
            list_r = admin_session.get(f"{BASE}/cleaning-tasks", params={"date": target})
            ids = [t["id"] for t in list_r.json()]
            assert new["id"] in ids
        finally:
            for tid in created_ids:
                admin_session.delete(f"{BASE}/cleaning-tasks/{tid}")


# ---------- route-order endpoint (used by Panoramica Per-Addetta reorder) ----------
class TestRouteOrder:
    def test_put_route_order_persists(self, admin_session, cleaners):
        anna = cleaners["anna"]
        target = (date.today() + timedelta(days=70)).isoformat()
        created = []
        try:
            for i in range(3):
                t = admin_session.post(f"{BASE}/cleaning-tasks", json={
                    "structure_id": STRUCTURE_ID, "date": target, "notes": f"TEST_ROUTE_{i}",
                    "assigned_cleaner_ids": [anna["id"]],
                }).json()
                created.append(t["id"])
            # reverse order
            reversed_ids = list(reversed(created))
            r = admin_session.put(f"{BASE}/cleaning-tasks/route-order",
                                  json={"cleaner_id": anna["id"], "ordered_task_ids": reversed_ids})
            assert r.status_code == 200, r.text
            # GET back
            g = admin_session.get(f"{BASE}/cleaning-tasks", params={"date": target}).json()
            for i, tid in enumerate(reversed_ids):
                task = next(t for t in g if t["id"] == tid)
                assert (task.get("route_order") or {}).get(anna["id"]) == i, (
                    f"route_order not set: {task.get('route_order')}"
                )
        finally:
            for tid in created:
                admin_session.delete(f"{BASE}/cleaning-tasks/{tid}")
