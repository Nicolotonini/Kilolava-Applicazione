"""Pytest per il Centro Gestione Segnalazioni (iteration 13)."""
import os
import time
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
ADDETTA = {"email": "addetta_test@kilolava.com", "password": "AddettaTest123!"}
CLIENT = {"email": "cliente_test@kilolava.com", "password": "ClienteTest123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} → {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def addetta_h():
    return {"Authorization": f"Bearer {_login(ADDETTA)}"}


@pytest.fixture(scope="module")
def client_h():
    return {"Authorization": f"Bearer {_login(CLIENT)}"}


@pytest.fixture(scope="module")
def some_structure(admin_h):
    r = requests.get(f"{API}/structures", headers=admin_h, timeout=30)
    assert r.status_code == 200
    structs = r.json()
    # struct with client_id preferably KLV-0002 for Kilolava default rules
    s = next((x for x in structs if x.get("client_id")), None)
    assert s, "Nessuna struttura con cliente"
    return s


CREATED_SEG_IDS = []
CREATED_STRUCT_CONFIGS = set()
CREATED_CLIENT_CONFIGS = set()


# ---------------- BADGE / COUNTERS ----------------

def test_badge(admin_h):
    r = requests.get(f"{API}/segnalazioni/badge", headers=admin_h, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "active" in j and "urgent" in j
    assert isinstance(j["active"], int)


def test_counters_structure(admin_h):
    r = requests.get(f"{API}/segnalazioni/counters", headers=admin_h, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert set(j["types"].keys()) >= {"missing", "damage", "malfunction", "other", "all"}
    assert "da_valutare" in j["kpi"]
    assert "resolved_month" in j["kpi"]
    assert "urgent" in j["kpi"]


def test_list_with_pagination(admin_h):
    r = requests.get(f"{API}/segnalazioni?page=1&limit=10", headers=admin_h, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "items" in j and "total" in j
    assert isinstance(j["items"], list)


# ---------------- CREATE + DETAIL ----------------

def test_create_missing_carta_igienica(admin_h, some_structure):
    payload = {
        "title": "TEST Manca carta igienica",
        "description": "Serve carta igienica bagno",
        "type": "missing",
        "priority": "normal",
        "structure_id": some_structure["id"],
    }
    r = requests.post(f"{API}/segnalazioni", headers=admin_h, json=payload, timeout=30)
    assert r.status_code == 200, r.text
    seg = r.json()
    CREATED_SEG_IDS.append(seg["id"])
    assert seg["category_key"] == "consumabili_bagno", f"suggested category wrong: {seg}"
    assert seg["status"] == "da_valutare"
    assert seg["origin_type"] == "manager"
    assert seg["responsibility"] and seg["responsibility"]["party"] == "kilolava"
    return seg


def test_get_detail_suggested_action(admin_h):
    assert CREATED_SEG_IDS, "prerequisite create test failed"
    sid = CREATED_SEG_IDS[0]
    r = requests.get(f"{API}/segnalazioni/{sid}", headers=admin_h, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["suggested_action"] and d["suggested_action"]["type"] == "delivery"
    assert "tasks" in d
    assert "timeline" in d


def test_triage_moves_to_aperta(admin_h):
    sid = CREATED_SEG_IDS[0]
    r = requests.post(f"{API}/segnalazioni/{sid}/triage", headers=admin_h, json={}, timeout=30)
    assert r.status_code == 200
    assert r.json()["status"] == "aperta"


def test_update_priority_urgent_reflects_in_badge(admin_h):
    sid = CREATED_SEG_IDS[0]
    before = requests.get(f"{API}/segnalazioni/badge", headers=admin_h, timeout=30).json()["urgent"]
    r = requests.put(f"{API}/segnalazioni/{sid}", headers=admin_h, json={"priority": "urgent"}, timeout=30)
    assert r.status_code == 200
    after = requests.get(f"{API}/segnalazioni/badge", headers=admin_h, timeout=30).json()["urgent"]
    assert after >= before + 1


def test_change_category_recomputes_responsibility(admin_h):
    sid = CREATED_SEG_IDS[0]
    r = requests.put(f"{API}/segnalazioni/{sid}", headers=admin_h,
                     json={"category_key": "biancheria"}, timeout=30)
    assert r.status_code == 200
    d = requests.get(f"{API}/segnalazioni/{sid}", headers=admin_h, timeout=30).json()
    assert d["responsibility"]["party"] == "kilolava"


# ---------------- TASKS ----------------

def test_create_delivery_task_creates_logistics_task(admin_h):
    sid = CREATED_SEG_IDS[0]
    r = requests.post(f"{API}/segnalazioni/{sid}/tasks", headers=admin_h,
                     json={"type": "delivery", "title": "TEST Consegna carta"}, timeout=30)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["linked_id"]
    # Verify logistics_task exists
    rl = requests.get(f"{API}/logistics/tasks", headers=admin_h, timeout=30)
    assert rl.status_code == 200
    lts = rl.json() if isinstance(rl.json(), list) else rl.json().get("items", [])
    matching = [x for x in lts if x.get("id") == t["linked_id"]]
    assert matching, f"logistics task {t['linked_id']} non trovata"
    assert matching[0].get("source") == "segnalazione"


def test_create_internal_task_with_assignee(admin_h):
    sid = CREATED_SEG_IDS[0]
    users = requests.get(f"{API}/segnalazioni/assignees", headers=admin_h, timeout=30).json()
    assert users, "Nessun assignee disponibile"
    r = requests.post(f"{API}/segnalazioni/{sid}/tasks", headers=admin_h,
                     json={"type": "internal", "title": "TEST Task interno",
                           "assignee_id": users[0]["id"], "priority": "high",
                           "due_date": "2026-08-25"}, timeout=30)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t["assignee_id"] == users[0]["id"]
    assert t["priority"] == "high"


def test_create_notify_client_task_completes_and_publishes(admin_h):
    sid = CREATED_SEG_IDS[0]
    r = requests.post(f"{API}/segnalazioni/{sid}/tasks", headers=admin_h,
                     json={"type": "notify_client", "title": "TEST Notifica",
                           "client_message": "Test messaggio cliente"}, timeout=30)
    assert r.status_code == 200
    t = r.json()
    assert t["status"] == "completata"
    d = requests.get(f"{API}/segnalazioni/{sid}", headers=admin_h, timeout=30).json()
    assert d["published_to_client"] is True


def test_task_wait_requires_reason(admin_h):
    sid = CREATED_SEG_IDS[0]
    # create fresh internal task to manipulate status
    r = requests.post(f"{API}/segnalazioni/{sid}/tasks", headers=admin_h,
                     json={"type": "internal", "title": "TEST Wait task"}, timeout=30)
    task_id = r.json()["id"]
    r1 = requests.put(f"{API}/segnalazioni/tasks/{task_id}", headers=admin_h,
                      json={"status": "in_corso"}, timeout=30)
    assert r1.status_code == 200
    d = requests.get(f"{API}/segnalazioni/{sid}", headers=admin_h, timeout=30).json()
    assert d["op_status"] == "in_corso"
    r2 = requests.put(f"{API}/segnalazioni/tasks/{task_id}", headers=admin_h,
                      json={"status": "in_attesa"}, timeout=30)
    assert r2.status_code == 400
    r3 = requests.put(f"{API}/segnalazioni/tasks/{task_id}", headers=admin_h,
                      json={"status": "in_attesa", "waiting_reason": "ricambio"}, timeout=30)
    assert r3.status_code == 200
    d2 = requests.get(f"{API}/segnalazioni/{sid}", headers=admin_h, timeout=30).json()
    assert d2["op_status"] == "in_attesa"


# ---------------- RESOLVE / CLOSE / REOPEN ----------------

def test_resolve_close_reopen(admin_h, some_structure):
    payload = {"title": "TEST Resolve flow", "type": "other", "priority": "normal",
               "structure_id": some_structure["id"]}
    seg = requests.post(f"{API}/segnalazioni", headers=admin_h, json=payload, timeout=30).json()
    CREATED_SEG_IDS.append(seg["id"])
    sid = seg["id"]

    r = requests.post(f"{API}/segnalazioni/{sid}/resolve", headers=admin_h, timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "risolta"
    assert r.json()["resolved_at"]

    # Risolte non contate nei types counters
    counters = requests.get(f"{API}/segnalazioni/counters", headers=admin_h, timeout=30).json()
    # can't assert precise count but resolved shouldn't inflate types["all"]

    r = requests.post(f"{API}/segnalazioni/{sid}/close", headers=admin_h, timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "chiusa"

    r = requests.post(f"{API}/segnalazioni/{sid}/reopen", headers=admin_h, timeout=30)
    assert r.status_code == 200 and r.json()["status"] == "aperta"


# ---------------- MULTIPLE ACTIONS ----------------

def test_multiple_tasks_on_same_seg(admin_h, some_structure):
    payload = {"title": "TEST Multi actions", "type": "damage",
               "description": "Sedia rotta TEST", "priority": "normal",
               "structure_id": some_structure["id"]}
    seg = requests.post(f"{API}/segnalazioni", headers=admin_h, json=payload, timeout=30).json()
    CREATED_SEG_IDS.append(seg["id"])
    sid = seg["id"]
    r1 = requests.post(f"{API}/segnalazioni/{sid}/tasks", headers=admin_h,
                       json={"type": "maintenance", "title": "TEST Interv."}, timeout=30)
    r2 = requests.post(f"{API}/segnalazioni/{sid}/tasks", headers=admin_h,
                       json={"type": "notify_client", "title": "TEST Notify"}, timeout=30)
    assert r1.status_code == 200 and r2.status_code == 200
    d = requests.get(f"{API}/segnalazioni/{sid}", headers=admin_h, timeout=30).json()
    assert len(d["tasks"]) >= 2


# ---------------- CONFIG HIERARCHY ----------------

def test_config_structure_override(admin_h, some_structure):
    sid_struct = some_structure["id"]
    CREATED_STRUCT_CONFIGS.add(sid_struct)
    # override dotazioni -> kilolava (default è client)
    r = requests.put(f"{API}/segnalazioni/config/structure/{sid_struct}", headers=admin_h,
                     json={"supply": {"dotazioni": "kilolava"}}, timeout=30)
    assert r.status_code == 200
    eff = requests.get(f"{API}/segnalazioni/config/structure/{sid_struct}",
                       headers=admin_h, timeout=30).json()
    assert eff["effective"]["supply"]["dotazioni"] == "kilolava"


def test_item_exception(admin_h, some_structure):
    sid_struct = some_structure["id"]
    CREATED_STRUCT_CONFIGS.add(sid_struct)
    r = requests.put(f"{API}/segnalazioni/config/structure/{sid_struct}", headers=admin_h,
                     json={"supply": {"dotazioni": "kilolava"},
                           "item_exceptions": [{"name": "capsule caffè", "party": "client"}]},
                     timeout=30)
    assert r.status_code == 200
    # Create segnalazione for capsule caffè - should get item exception → client
    payload = {"title": "TEST Mancano capsule caffè", "type": "missing", "priority": "normal",
               "structure_id": sid_struct}
    seg = requests.post(f"{API}/segnalazioni", headers=admin_h, json=payload, timeout=30).json()
    CREATED_SEG_IDS.append(seg["id"])
    assert seg["responsibility"]["party"] == "client"
    assert seg["responsibility"]["source"] == "item"


# ---------------- AUTOMATION MODE ----------------

def test_automatica_mode(admin_h, some_structure):
    sid_struct = some_structure["id"]
    CREATED_STRUCT_CONFIGS.add(sid_struct)
    r = requests.put(f"{API}/segnalazioni/config/structure/{sid_struct}", headers=admin_h,
                     json={"mode": "automatica",
                           "automations": {"missing_kilolava": True, "damage": False}},
                     timeout=30)
    assert r.status_code == 200
    # missing → auto opened
    p1 = {"title": "TEST AUTO Manca carta igienica", "type": "missing", "priority": "normal",
          "structure_id": sid_struct}
    seg1 = requests.post(f"{API}/segnalazioni", headers=admin_h, json=p1, timeout=30).json()
    CREATED_SEG_IDS.append(seg1["id"])
    assert seg1["status"] == "aperta", f"Expected aperta got {seg1['status']}"
    assert seg1.get("automation")
    d1 = requests.get(f"{API}/segnalazioni/{seg1['id']}", headers=admin_h, timeout=30).json()
    delivery_tasks = [t for t in d1["tasks"] if t["type"] == "delivery"]
    assert delivery_tasks, "Delivery task auto non creato"

    # damage → automation off → resta da_valutare
    p2 = {"title": "TEST AUTO Sedia rotta", "type": "damage", "priority": "normal",
          "structure_id": sid_struct}
    seg2 = requests.post(f"{API}/segnalazioni", headers=admin_h, json=p2, timeout=30).json()
    CREATED_SEG_IDS.append(seg2["id"])
    assert seg2["status"] == "da_valutare"

    # restore config
    requests.put(f"{API}/segnalazioni/config/structure/{sid_struct}", headers=admin_h,
                 json={"mode": "inherit", "supply": {}, "maintenance": {},
                       "automations": {}, "item_exceptions": []}, timeout=30)


# ---------------- ADDETTA FLOW ----------------

def test_addetta_report_creates_segnalazione(addetta_h, admin_h):
    # find addetta task
    r = requests.get(f"{API}/cleaning-tasks/my-tasks", headers=addetta_h, timeout=30)
    if r.status_code != 200 or not r.json():
        pytest.skip("Nessuna cleaning task per addetta")
    tasks = r.json()
    task = tasks[0] if isinstance(tasks, list) else (tasks.get("items") or [None])[0]
    if not task:
        pytest.skip("Nessuna task")
    tid = task["id"]
    payload = {"category": "missing", "note": "TEST Manca sapone (test)", "severity": "medium",
               "attachment_ids": []}
    r = requests.post(f"{API}/cleaning-tasks/{tid}/issues", headers=addetta_h,
                      json=payload, timeout=30)
    assert r.status_code == 200, r.text
    issue = r.json()
    # verify in centro segnalazioni
    time.sleep(0.5)
    r2 = requests.get(f"{API}/segnalazioni?search=TEST Manca sapone", headers=admin_h, timeout=30)
    assert r2.status_code == 200
    items = r2.json()["items"]
    seg = next((s for s in items if s.get("id") == issue["id"]), None)
    assert seg, "Segnalazione non registrata nel centro"
    assert seg["origin_type"] == "cleaning"
    assert seg["cleaning_task_id"] == tid
    CREATED_SEG_IDS.append(seg["id"])


# ---------------- PORTAL (Cliente) ----------------

def test_portal_client(client_h):
    r = requests.get(f"{API}/segnalazioni/portal", headers=client_h, timeout=30)
    assert r.status_code == 200
    segs = r.json()
    assert isinstance(segs, list)
    for s in segs:
        # no internal fields
        assert "timeline" not in s
        assert "message" in s
        assert "status_label" in s


def test_my_tasks(admin_h):
    r = requests.get(f"{API}/segnalazioni/my-tasks", headers=admin_h, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "active" in j and "done" in j


# ---------------- PULIZIE: NO BLOCK ON HOURS ----------------

def test_assign_over_capacity_never_blocks(admin_h):
    # find cleaners
    users = requests.get(f"{API}/users", headers=admin_h, timeout=30).json()
    cleaners = [u for u in users if u.get("role") == "cleaner" and u.get("is_active")]
    if not cleaners:
        pytest.skip("Nessun cleaner")
    cleaner = cleaners[0]
    # get board for a date with tasks
    board = requests.get(f"{API}/cleaning-board?date=2026-08-24", headers=admin_h, timeout=30)
    assert board.status_code == 200
    tasks = board.json().get("tasks", []) or board.json().get("cleaning_tasks", [])
    # fallback: use direct API
    if not tasks:
        r = requests.get(f"{API}/cleaning-tasks?date=2026-08-24", headers=admin_h, timeout=30)
        if r.status_code == 200:
            tasks = r.json()
    if not tasks:
        pytest.skip("Nessuna pulizia per la data")
    # Assign all tasks to same cleaner - none should return 4xx
    ok = 0
    for t in tasks[:8]:
        r = requests.post(f"{API}/cleaning-tasks/{t['id']}/assign", headers=admin_h,
                          json={"cleaner_id": cleaner["id"]}, timeout=30)
        assert r.status_code == 200, f"Assign returned {r.status_code}: {r.text}"
        ok += 1
    assert ok >= 1


# ---------------- CLEANUP ----------------

def test_zz_cleanup(admin_h, some_structure):
    """Cleanup TEST_ segnalazioni + restore struct config."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if mongo_url and db_name:
        c = MongoClient(mongo_url)
        db = c[db_name]
        for sid in CREATED_SEG_IDS:
            db.segnalazioni.delete_one({"id": sid})
            db.segnalazione_tasks.delete_many({"segnalazione_id": sid})
            db.logistics_tasks.delete_many({"segnalazione_id": sid})
            db.maintenance_issues.delete_many({"segnalazione_id": sid})
        # restore
        requests.put(f"{API}/segnalazioni/config/structure/{some_structure['id']}",
                     headers=admin_h,
                     json={"mode": "inherit", "supply": {}, "maintenance": {},
                           "automations": {}, "item_exceptions": []}, timeout=30)
