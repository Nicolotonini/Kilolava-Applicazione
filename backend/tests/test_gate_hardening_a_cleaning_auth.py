from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE A — Hardening P0: autorizzazioni Cleaning Task centralizzate (ensure_cleaning_access).
Cleaner assegnata 200; altra cleaner 403; rider/laundry/maintenance/client 403; admin/OM OK; no-token 401/403.
Fixture TESTFIX_ + cleanup completo."""
import os
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
API = os.environ["REACT_APP_BACKEND_URL"] + "/api"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

results = []


def check(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("PASS " if ok else "FAIL ") + name + (f" [{extra}]" if extra else ""))


admin_tok = requests.post(f"{API}/auth/login", json={
    "username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}).json()["access_token"]
A = {"Authorization": f"Bearer {admin_tok}"}

cleanup = {"users": [], "clients": [], "structures": [], "tasks": []}
DUMMY_JPG = ("f.jpg", b"\xff\xd8\xff\xe0fakejpg", "image/jpeg")


def mk_user(role, tag):
    r = requests.post(f"{API}/users", headers=A, json={
        "first_name": f"TESTFIX_GA_{tag}", "last_name": "GateA", "role": role,
        "password": TEST_FIXTURE_PASSWORD})
    assert r.status_code == 200, r.text
    u = r.json()
    cleanup["users"].append(u["id"])
    login = requests.post(f"{API}/auth/login", json={
        "username": u["login_username"] or u["email"], "password": TEST_FIXTURE_PASSWORD}).json()
    return u, {"Authorization": f"Bearer {login['access_token']}"}

try:
    # --- Fixtures ---
    cl = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTFIX_GA", "surname": "Cliente"}}).json()
    cleanup["clients"].append(cl["id"])
    st = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cl["id"], "name": "TESTFIX_GA Casa", "structure_type": "apartment"}).json()
    cleanup["structures"].append(st["id"])

    c1u, C1 = mk_user("cleaner", "cleaner1")
    c2u, C2 = mk_user("cleaner", "cleaner2")
    _, RD = mk_user("rider", "rider")
    _, LA = mk_user("laundry", "laundry")
    _, MA = mk_user("maintenance", "maint")
    omu, OM = mk_user("operations_manager", "om")

    pa = requests.post(f"{API}/clients/{cl['id']}/create-account", headers=A, json={
        "email": "testfix.gatea.portal@example.com", "password": TEST_FIXTURE_PASSWORD, "name": "TESTFIX_GA Portal"})
    check("Setup account portale cliente = 200", pa.status_code == 200, pa.text[:120])
    portal_login = requests.post(f"{API}/auth/login", json={
        "username": "testfix.gatea.portal@example.com", "password": TEST_FIXTURE_PASSWORD}).json()
    CL = {"Authorization": f"Bearer {portal_login['access_token']}"}
    portal_user = mdb.users.find_one({"client_id": cl["id"], "role": "client"}, {"id": 1})
    if portal_user:
        cleanup["users"].append(portal_user["id"])

    t = requests.post(f"{API}/cleaning-tasks", headers=A, json={
        "structure_id": st["id"], "date": "2026-12-20", "guests_count": 2,
        "assigned_cleaner_ids": [c1u["id"]]})
    assert t.status_code == 200, t.text
    task = t.json()
    tid = task["id"]
    cleanup["tasks"].append(tid)

    # --- 1) Cleaner ASSEGNATA: accesso consentito ---
    check("Cleaner assegnata GET detail = 200", requests.get(f"{API}/cleaning-tasks/{tid}", headers=C1).status_code == 200)
    check("Cleaner assegnata GET operational = 200", requests.get(f"{API}/cleaning-tasks/{tid}/operational", headers=C1).status_code == 200)
    check("Cleaner assegnata PUT checklist = 200",
          requests.put(f"{API}/cleaning-tasks/{tid}/checklist", headers=C1, json={"responses": {}}).status_code == 200)
    check("Cleaner assegnata POST notes = 200",
          requests.post(f"{API}/cleaning-tasks/{tid}/notes", headers=C1, json={"text": "TESTFIX nota"}).status_code == 200)
    rs = requests.put(f"{API}/cleaning-tasks/{tid}/status", headers=C1, json={"status": "assigned"})
    check("Cleaner assegnata PUT status (non-lifecycle) = 200", rs.status_code == 200, rs.text[:100])
    rs2 = requests.put(f"{API}/cleaning-tasks/{tid}/status", headers=C1, json={"status": "in_progress"})
    check("Cleaner assegnata PUT status in_progress = 400 (workflow video, non 403)", rs2.status_code == 400, rs2.text[:100])
    mt = requests.get(f"{API}/cleaning-tasks/my-tasks", headers=C1).json()
    check("Cleaner assegnata my-tasks contiene il task", any(x.get("id") == tid for x in mt))

    # --- 2) ALTRA cleaner (non assegnata): 403 su TUTTI gli endpoint singolo task ---
    eps_403 = [
        ("GET detail", lambda h: requests.get(f"{API}/cleaning-tasks/{tid}", headers=h)),
        ("GET operational", lambda h: requests.get(f"{API}/cleaning-tasks/{tid}/operational", headers=h)),
        ("PUT status", lambda h: requests.put(f"{API}/cleaning-tasks/{tid}/status", headers=h, json={"status": "assigned"})),
        ("PUT checklist", lambda h: requests.put(f"{API}/cleaning-tasks/{tid}/checklist", headers=h, json={"responses": {}})),
        ("POST notes", lambda h: requests.post(f"{API}/cleaning-tasks/{tid}/notes", headers=h, json={"text": "x"})),
        ("POST issues", lambda h: requests.post(f"{API}/cleaning-tasks/{tid}/issues", headers=h,
                                                json={"category": "other", "note": "x", "attachment_ids": []})),
        ("POST complete", lambda h: requests.post(f"{API}/cleaning-tasks/{tid}/complete", headers=h)),
        ("POST photos", lambda h: requests.post(f"{API}/cleaning-tasks/{tid}/photos?photo_type=initial", headers=h,
                                                files={"file": DUMMY_JPG})),
        ("POST media", lambda h: requests.post(f"{API}/cleaning-tasks/{tid}/media?media_type=warehouse_photo", headers=h,
                                               files={"file": DUMMY_JPG})),
    ]
    for name, fn in eps_403:
        rc = fn(C2).status_code
        check(f"Altra cleaner {name} = 403", rc == 403, f"got {rc}")
    mt2 = requests.get(f"{API}/cleaning-tasks/my-tasks", headers=C2).json()
    check("Altra cleaner my-tasks NON contiene il task", not any(x.get("id") == tid for x in mt2))

    # --- 3) Rider / Laundry / Maintenance / Client: 403 (read e write) ---
    for label, H in (("Rider", RD), ("Laundry", LA), ("Maintenance", MA), ("Client", CL)):
        check(f"{label} GET detail = 403", requests.get(f"{API}/cleaning-tasks/{tid}", headers=H).status_code == 403)
        check(f"{label} POST notes = 403",
              requests.post(f"{API}/cleaning-tasks/{tid}/notes", headers=H, json={"text": "x"}).status_code == 403)
        check(f"{label} PUT status = 403",
              requests.put(f"{API}/cleaning-tasks/{tid}/status", headers=H, json={"status": "assigned"}).status_code == 403)
        check(f"{label} GET lista cleaning-tasks = 403",
              requests.get(f"{API}/cleaning-tasks", headers=H).status_code == 403)

    # --- 4) Admin / Operations Manager: pieno accesso ---
    check("Admin GET detail = 200", requests.get(f"{API}/cleaning-tasks/{tid}", headers=A).status_code == 200)
    check("Admin PUT task = 200",
          requests.put(f"{API}/cleaning-tasks/{tid}", headers=A, json={"notes": "TESTFIX admin"}).status_code == 200)
    check("OM GET detail = 200", requests.get(f"{API}/cleaning-tasks/{tid}", headers=OM).status_code == 200)
    check("OM PUT status = 200",
          requests.put(f"{API}/cleaning-tasks/{tid}/status", headers=OM, json={"status": "assigned"}).status_code == 200)

    # --- 5) Nessun token → 401/403 ---
    rc = requests.get(f"{API}/cleaning-tasks/{tid}").status_code
    check("No token GET detail = 401/403", rc in (401, 403), f"got {rc}")
finally:
    for tid_ in cleanup["tasks"]:
        requests.delete(f"{API}/cleaning-tasks/{tid_}", headers=A)
    for uid in cleanup["users"]:
        requests.delete(f"{API}/users/{uid}", headers=A)
    for sid in cleanup["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
    for cid in cleanup["clients"]:
        requests.delete(f"{API}/clients/{cid}", headers=A)
    mdb.notifications.delete_many({"user_id": {"$in": cleanup["users"]}})
    res = {c: mdb[c].count_documents({}) for c in ("users", "clients", "structures", "cleaning_tasks")}
    tfx = mdb.users.count_documents({"first_name": {"$regex": "^TESTFIX_"}}) + \
        mdb.clients.count_documents({"private_info.name": {"$regex": "^TESTFIX_"}}) + \
        mdb.structures.count_documents({"name": {"$regex": "^TESTFIX_"}})
    print(f"cleanup done — counts: {res} — residui TESTFIX: {tfx}")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
