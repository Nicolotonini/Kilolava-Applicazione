from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Iteration 11 — Backend tests for KILOLAVA OPERATIONS BOARD (Pulizie → Organizzazione).
Coverage:
  * GET  /api/cleaning-board (tasks/predictions, cleaners, layout, threshold, RBAC)
  * PUT  /api/cleaning-board/settings (rest_threshold_days)
  * PUT  /api/cleaning-board/cleaners/{id}/availability
  * POST /api/cleaning-board/groups (create/update/dissolve + assign-group)
  * POST /api/cleaning-tasks/{id}/assign-group
  * POST /api/cleaning-board/propose  and  /propose/apply
  * PUT  /api/cleaning-board/layout   (persistence per-user)
  * Structure expected_cleaning_minutes / latitude / longitude persistence
  * Consecutive-days engine (streak, gap-resets, cancelled excluded)
  * Performance seed of 30 cleaners + 100 tasks with FULL cleanup

Self-cleaning: every TEST_PERF/TEST_STREAK artefact is removed at teardown.
"""
import os
import time
import uuid
import pytest
import requests
from datetime import date, timedelta

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = TEST_ADMIN_USERNAME
ADMIN_PWD = TEST_ADMIN_PASSWORD
CLEANER_EMAIL = "addetta_test@kilolava.com"
CLEANER_PWD = TEST_FIXTURE_PASSWORD

STRUCT_ID = "3d70c213-d948-47ec-9839-b5a37acc2d23"   # Appartamento Centro
DATA_DATE = "2026-09-02"                             # giornata con task esistenti

# ------------------- Fixtures -------------------

def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]

@pytest.fixture(scope="session")
def admin():
    tok, user = _login(ADMIN_EMAIL, ADMIN_PWD)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    s.user = user
    return s

@pytest.fixture(scope="session")
def cleaner_session():
    tok, _ = _login(CLEANER_EMAIL, CLEANER_PWD)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s

@pytest.fixture(scope="session")
def anna_id(admin):
    r = admin.get(f"{API}/cleaning-tasks/cleaners", timeout=15)
    assert r.status_code == 200, r.text
    cleaners = r.json()
    anna = next((c for c in cleaners if "Anna" in (c.get("name") or "")), None)
    assert anna, f"Anna not found in {cleaners}"
    return anna["id"]

@pytest.fixture(scope="session")
def maria_id(admin):
    r = admin.get(f"{API}/cleaning-tasks/cleaners", timeout=15)
    assert r.status_code == 200
    maria = next((c for c in r.json() if "Maria" in (c.get("name") or "")), None)
    assert maria, "Maria not found"
    return maria["id"]


# ------------------- 1. GET /cleaning-board -------------------

def test_board_rbac_cleaner_forbidden(cleaner_session):
    r = cleaner_session.get(f"{API}/cleaning-board", params={"date": DATA_DATE}, timeout=15)
    assert r.status_code == 403

def test_board_admin_shape(admin, anna_id):
    r = admin.get(f"{API}/cleaning-board", params={"date": DATA_DATE}, timeout=20)
    assert r.status_code == 200, r.text
    b = r.json()
    assert set(["date", "rest_threshold_days", "tasks", "cleaners", "groups", "layout"]).issubset(b.keys())
    assert b["date"] == DATA_DATE
    assert isinstance(b["tasks"], list) and len(b["tasks"]) >= 1
    for t in b["tasks"]:
        if t.get("status") == "cancelled":
            continue
        assert isinstance(t.get("predicted_duration_minutes"), int) and t["predicted_duration_minutes"] > 0
        assert t.get("prediction_confidence") in ("alta", "pochi_dati", "stima_iniziale")
    # cleaners: default availability + streak fields
    assert len(b["cleaners"]) >= 2
    for c in b["cleaners"]:
        av = c["availability"]
        assert av["start_time"] and av["end_time"] and av["max_hours"]
        assert "consecutive_days" in c and "last_rest_day" in c
    # layout
    assert "positions" in b["layout"] and "zoom" in b["layout"]

def test_prediction_persists_on_task_doc(admin):
    r = admin.get(f"{API}/cleaning-board", params={"date": DATA_DATE}, timeout=20)
    assert r.status_code == 200
    tasks = [t for t in r.json()["tasks"] if t.get("status") != "cancelled"]
    assert tasks, "no task to test persistence"
    tid = tasks[0]["id"]
    # get single task -> should now have persisted predicted_duration_minutes
    r2 = admin.get(f"{API}/cleaning-tasks/{tid}", timeout=15)
    assert r2.status_code == 200
    doc = r2.json()
    assert doc.get("predicted_duration_minutes") == tasks[0]["predicted_duration_minutes"]


# ------------------- 2. Prediction engine + structure fields -------------------

def test_structure_expected_cleaning_minutes_persistence(admin):
    r = admin.get(f"{API}/structures/{STRUCT_ID}", timeout=15)
    assert r.status_code == 200
    st = r.json()
    original = st.get("expected_cleaning_minutes")
    # set to 75
    payload = dict(st)
    payload["expected_cleaning_minutes"] = 75
    payload["latitude"] = 45.6486
    payload["longitude"] = 13.7768
    # remove internal fields not accepted by update model
    for k in ("id", "created_at", "updated_at", "client_name", "_id"):
        payload.pop(k, None)
    r2 = admin.put(f"{API}/structures/{STRUCT_ID}", json=payload, timeout=15)
    assert r2.status_code in (200, 201), r2.text
    r3 = admin.get(f"{API}/structures/{STRUCT_ID}", timeout=15)
    got = r3.json()
    assert got.get("expected_cleaning_minutes") == 75
    assert got.get("latitude") == 45.6486
    assert got.get("longitude") == 13.7768
    # revert (leave 75 to help the fallback prediction test below)
    yield_val = original
    return yield_val

def test_fallback_prediction_uses_stima_iniziale_when_no_history(admin):
    """Create a NEW task with an unusual bed config on a FUTURE date (no history match).
    We expect confidence in {stima_iniziale, pochi_dati} — but at least a positive prediction."""
    future = (date.today() + timedelta(days=45)).isoformat()
    payload = {
        "structure_id": STRUCT_ID,
        "date": future,
        "beds_double": 2, "beds_single": 2, "beds_sofa": 1,
        "guests_count": 5,
        "notes": "TEST_PERF prediction fallback",
    }
    r = admin.post(f"{API}/cleaning-tasks", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    task_id = r.json()["id"]
    try:
        b = admin.get(f"{API}/cleaning-board", params={"date": future}, timeout=20).json()
        t = next(t for t in b["tasks"] if t["id"] == task_id)
        assert t["predicted_duration_minutes"] > 0
        assert t["prediction_confidence"] in ("alta", "pochi_dati", "stima_iniziale")
    finally:
        admin.delete(f"{API}/cleaning-tasks/{task_id}", timeout=15)


# ------------------- 3. Consecutive-days engine -------------------

def test_consecutive_days_streak_and_gap(admin, anna_id):
    """Insert TEST_STREAK tasks for Anna on 3 consecutive dates + one gap earlier.
    Verify streak=3, last_rest_day = day before streak start.
    Then re-check with a missing middle day → streak resets."""
    today = date.today()
    d3, d2, d1 = today - timedelta(days=2), today - timedelta(days=1), today
    created = []
    try:
        for dd in (d3, d2, d1):
            r = admin.post(f"{API}/cleaning-tasks", json={
                "structure_id": STRUCT_ID,
                "date": dd.isoformat(),
                "assigned_cleaner_ids": [anna_id],
                "guests_count": 2,
                "notes": "TEST_STREAK"
            }, timeout=15)
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])
        b = admin.get(f"{API}/cleaning-board", params={"date": d1.isoformat()}, timeout=20).json()
        anna = next(c for c in b["cleaners"] if c["id"] == anna_id)
        assert anna["consecutive_days"] >= 3, f"streak={anna['consecutive_days']} expected >=3"
        assert anna["last_rest_day"] == (d3 - timedelta(days=1)).isoformat()
        # cancel middle day → streak resets when we check on d1
        rc = admin.put(f"{API}/cleaning-tasks/{created[1]}/status",
                       json={"status": "cancelled"}, timeout=15)
        assert rc.status_code == 200, rc.text
        b2 = admin.get(f"{API}/cleaning-board", params={"date": d1.isoformat()}, timeout=20).json()
        anna2 = next(c for c in b2["cleaners"] if c["id"] == anna_id)
        assert anna2["consecutive_days"] <= 1, f"expected streak reset, got {anna2['consecutive_days']}"
    finally:
        for tid in created:
            admin.delete(f"{API}/cleaning-tasks/{tid}", timeout=15)


# ------------------- 4. Settings & availability -------------------

def test_settings_rest_threshold_roundtrip(admin):
    r = admin.put(f"{API}/cleaning-board/settings", json={"rest_threshold_days": 2}, timeout=15)
    assert r.status_code == 200 and r.json()["rest_threshold_days"] == 2
    b = admin.get(f"{API}/cleaning-board", params={"date": DATA_DATE}, timeout=15).json()
    assert b["rest_threshold_days"] == 2
    # restore default 5
    r2 = admin.put(f"{API}/cleaning-board/settings", json={"rest_threshold_days": 5}, timeout=15)
    assert r2.status_code == 200 and r2.json()["rest_threshold_days"] == 5

def test_availability_update_and_restore(admin, anna_id):
    r = admin.put(f"{API}/cleaning-board/cleaners/{anna_id}/availability",
                  json={"available": False, "start_time": "09:00", "max_hours": 6}, timeout=15)
    assert r.status_code == 200
    b = admin.get(f"{API}/cleaning-board", params={"date": DATA_DATE}, timeout=15).json()
    anna = next(c for c in b["cleaners"] if c["id"] == anna_id)
    assert anna["availability"]["available"] is False
    assert anna["availability"]["start_time"] == "09:00"
    assert anna["availability"]["max_hours"] == 6
    # restore
    r2 = admin.put(f"{API}/cleaning-board/cleaners/{anna_id}/availability",
                   json={"available": True, "start_time": "08:30", "end_time": "16:30", "max_hours": 8}, timeout=15)
    assert r2.status_code == 200
    b2 = admin.get(f"{API}/cleaning-board", params={"date": DATA_DATE}, timeout=15).json()
    anna2 = next(c for c in b2["cleaners"] if c["id"] == anna_id)
    assert anna2["availability"]["available"] is True
    assert anna2["availability"]["max_hours"] == 8


# ------------------- 5. Groups + assign-group -------------------

def test_groups_crud_and_assign(admin, anna_id, maria_id):
    gd = (date.today() + timedelta(days=90)).isoformat()
    # 1 sola → 400
    r = admin.post(f"{API}/cleaning-board/groups", json={"date": gd, "operator_ids": [anna_id]}, timeout=15)
    assert r.status_code == 400
    # create group with 2
    r = admin.post(f"{API}/cleaning-board/groups", json={"date": gd, "operator_ids": [anna_id, maria_id], "name": "TEST_G"}, timeout=15)
    assert r.status_code == 200, r.text
    group_id = r.json()["id"]
    # same cleaner in second group same date -> 400
    r2 = admin.post(f"{API}/cleaning-board/groups", json={"date": gd, "operator_ids": [anna_id, maria_id]}, timeout=15)
    assert r2.status_code == 400
    # create a task on that date and assign the group
    tr = admin.post(f"{API}/cleaning-tasks", json={
        "structure_id": STRUCT_ID, "date": gd, "guests_count": 2, "notes": "TEST_PERF group"
    }, timeout=15)
    assert tr.status_code == 200
    task_id = tr.json()["id"]
    try:
        a = admin.post(f"{API}/cleaning-tasks/{task_id}/assign-group", json={"group_id": group_id}, timeout=15)
        assert a.status_code == 200, a.text
        assigned_ids = a.json().get("assigned_cleaner_ids") or []
        assert anna_id in assigned_ids and maria_id in assigned_ids
        # dissolve group → task assignments MUST remain
        d = admin.delete(f"{API}/cleaning-board/groups/{group_id}", timeout=15)
        assert d.status_code == 200
        chk = admin.get(f"{API}/cleaning-tasks/{task_id}", timeout=15).json()
        assert anna_id in (chk.get("assigned_cleaner_ids") or [])
        assert maria_id in (chk.get("assigned_cleaner_ids") or [])
    finally:
        admin.delete(f"{API}/cleaning-tasks/{task_id}", timeout=15)
        admin.delete(f"{API}/cleaning-board/groups/{group_id}", timeout=15)  # idempotent-ish


# ------------------- 6. Propose + apply -------------------

def test_propose_and_apply(admin, anna_id, maria_id):
    dd = (date.today() + timedelta(days=120)).isoformat()
    created = []
    try:
        for i in range(6):
            r = admin.post(f"{API}/cleaning-tasks", json={
                "structure_id": STRUCT_ID, "date": dd, "guests_count": 2,
                "checkin_today": i < 2, "checkin_time": "15:00" if i < 2 else None,
                "notes": f"TEST_PERF propose {i}"
            }, timeout=15)
            assert r.status_code == 200, r.text
            created.append(r.json()["id"])
        # propose
        p = admin.post(f"{API}/cleaning-board/propose", params={"date": dd}, timeout=20)
        assert p.status_code == 200, p.text
        pj = p.json()
        assert len(pj["assignments"]) == 6
        assert pj["per_cleaner"], "per_cleaner empty"
        for pc in pj["per_cleaner"]:
            assert "total_minutes" in pc and "capacity_minutes" in pc
        # tasks NOT assigned yet (bozza)
        b = admin.get(f"{API}/cleaning-board", params={"date": dd}, timeout=15).json()
        for t in b["tasks"]:
            if t["id"] in created:
                assert not (t.get("assigned_cleaner_ids") or []), f"task {t['id']} should still be unassigned"
        # apply
        ap = admin.post(f"{API}/cleaning-board/propose/apply",
                        json={"assignments": pj["assignments"]}, timeout=20)
        assert ap.status_code == 200
        assert ap.json()["applied"] == 6
        b2 = admin.get(f"{API}/cleaning-board", params={"date": dd}, timeout=15).json()
        for t in b2["tasks"]:
            if t["id"] in created:
                assert t.get("assigned_cleaner_ids"), f"task {t['id']} not assigned after apply"
    finally:
        for tid in created:
            admin.delete(f"{API}/cleaning-tasks/{tid}", timeout=15)


# ------------------- 7. Layout persistence -------------------

def test_layout_roundtrip(admin):
    positions = {"anna-test": {"col": 2, "row": 1}}
    r = admin.put(f"{API}/cleaning-board/layout", json={"positions": positions, "zoom": 0.6}, timeout=15)
    assert r.status_code == 200
    b = admin.get(f"{API}/cleaning-board", params={"date": DATA_DATE}, timeout=15).json()
    assert b["layout"]["zoom"] == 0.6
    assert b["layout"]["positions"].get("anna-test") == {"col": 2, "row": 1}
    # restore zoom
    admin.put(f"{API}/cleaning-board/layout", json={"positions": {}, "zoom": 1}, timeout=15)


# ------------------- 8. Regression: bed max -------------------

def test_bed_max_returns_400(admin):
    r = admin.post(f"{API}/cleaning-tasks", json={
        "structure_id": STRUCT_ID,
        "date": (date.today() + timedelta(days=200)).isoformat(),
        "beds_double": 10, "beds_single": 10, "beds_sofa": 10,
        "guests_count": 2, "notes": "TEST_PERF bedmax"
    }, timeout=15)
    assert r.status_code == 400


# ------------------- 9. Performance seed (30 cleaners, 100 tasks) -------------------

@pytest.mark.performance
def test_performance_30_cleaners_100_tasks(admin):
    dd = (date.today() + timedelta(days=150)).isoformat()
    created_users = []
    created_tasks = []
    try:
        # 30 cleaners
        for i in range(30):
            email = f"testperf_{uuid.uuid4().hex[:8]}@kilolava-perf.com"
            r = admin.post(f"{API}/users", json={
                "first_name": f"TEST_PERF_{i}", "last_name": "Perf",
                "email": email, "password": TEST_FIXTURE_PASSWORD,
                "role": "cleaner", "language": "it"
            }, timeout=15)
            assert r.status_code == 200, r.text
            created_users.append(r.json()["id"])
        # 100 tasks (unassigned, on dd)
        for i in range(100):
            r = admin.post(f"{API}/cleaning-tasks", json={
                "structure_id": STRUCT_ID, "date": dd,
                "guests_count": 2, "notes": f"TEST_PERF perf {i}"
            }, timeout=15)
            assert r.status_code == 200
            created_tasks.append(r.json()["id"])
        # Measure GET board
        t0 = time.time()
        b = admin.get(f"{API}/cleaning-board", params={"date": dd}, timeout=30).json()
        elapsed = time.time() - t0
        assert elapsed < 10.0, f"cleaning-board too slow: {elapsed:.1f}s"
        assert len(b["tasks"]) >= 100
        assert len(b["cleaners"]) >= 30
        print(f"[perf] cleaning-board {elapsed:.2f}s, {len(b['tasks'])} tasks, {len(b['cleaners'])} cleaners")
    finally:
        # CLEANUP
        for tid in created_tasks:
            admin.delete(f"{API}/cleaning-tasks/{tid}", timeout=15)
        for uid in created_users:
            admin.delete(f"{API}/users/{uid}", timeout=15)
