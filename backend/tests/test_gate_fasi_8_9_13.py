from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE FASI 8+9+13 — Prenotazioni→Pulizie, Pulizie→Fabbisogno/Anomalia→Segnalazione, AI proposta→conferma. Fixture + cleanup."""
import os
import uuid
from datetime import datetime, timedelta
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
C = {"clients": [], "structures": [], "products": [], "kits": [], "events": [], "tasks": [], "fabb": [], "actions": [], "segn": [], "issues": []}

try:
    today = datetime.now().strftime("%Y-%m-%d")
    yest = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    c = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTGATE8", "surname": "Book"}}).json()
    C["clients"].append(c["id"])
    s = requests.post(f"{API}/structures", headers=A, json={
        "client_id": c["id"], "name": "TESTGATE8 Casa", "structure_type": "apartment",
        "check_in_time": "15:00", "check_out_time": "10:00",
        "bed_config": {"beds_double": 1, "beds_single": 1, "sofa_beds": 0}}).json()
    C["structures"].append(s["id"])
    # config noleggio CLIENTE: stagione dal config, MAI dal calendario
    requests.put(f"{API}/clients/{c['id']}/noleggio-config", headers=A, json={"linea": "living", "stagione": "estivo"})
    p = requests.post(f"{API}/magazzino/catalog/noleggio", headers=A, json={"name": "TESTGATE8 Lenzuolo"}).json()
    C["products"].append(p["id"])
    k = requests.post(f"{API}/magazzino/kits", headers=A, json={
        "name": "TESTGATE8 Kit Matrimoniale Living Estivo", "domain": "noleggio", "linea": "living",
        "stagione": "estivo", "bed_type": "matrimoniale", "items": [{"product_id": p["id"], "qty": 2}]}).json()
    C["kits"].append(k["id"])

    # ---- FASE 8: booking checkout oggi + booking checkin oggi ----
    b1 = requests.post(f"{API}/events", headers=A, json={
        "event_type": "booking", "title": "TESTGATE8 Soggiorno", "structure_id": s["id"],
        "start_time": f"{yest}T15:00:00", "end_time": f"{today}T10:00:00", "guests_count": 2}).json()
    C["events"].append(b1["id"])
    b2 = requests.post(f"{API}/events", headers=A, json={
        "event_type": "booking", "title": "TESTGATE8 Nuovo arrivo", "structure_id": s["id"],
        "start_time": f"{today}T15:00:00", "end_time": f"{(datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')}T10:00:00"}).json()
    C["events"].append(b2["id"])

    g = requests.post(f"{API}/cleaning-tasks/genera-da-soggiorni", headers=A, json={"date": today})
    check("Genera pulizie da soggiorni = 200", g.status_code == 200, g.text[:140])
    gd = g.json()
    check("1 pulizia creata dal checkout", gd.get("created") == 1, str(gd))
    ev = mdb.events.find_one({"id": b1["id"]})
    task = mdb.cleaning_tasks.find_one({"id": ev.get("cleaning_task_id")}) if ev.get("cleaning_task_id") else None
    check("Evento collegato alla pulizia (cleaning_task_id)", bool(task))
    if task:
        C["tasks"].append(task["id"])
    check("Pulizia con letti dalla struttura + checkin_today 15:00",
          task and task.get("beds_double") == 1 and task.get("beds_single") == 1
          and task.get("checkin_today") is True and task.get("checkin_time") == "15:00"
          and task.get("booking_event_id") == b1["id"], str({k2: task.get(k2) for k2 in ("beds_double", "checkin_today", "checkin_time")} if task else None))
    g2 = requests.post(f"{API}/cleaning-tasks/genera-da-soggiorni", headers=A, json={"date": today}).json()
    check("Idempotente: secondo run 0 create", g2.get("created") == 0, str(g2))

    # ---- FASE 9: pulizia → fabbisogno (delta vs stock struttura, stagione dal config cliente) ----
    requests.post(f"{API}/magazzino/movimenti", headers=A, json={
        "domain": "noleggio", "movement_type": "carico", "product_id": p["id"], "qty": 10,
        "origin": {"type": "external", "label": "Acquisto"}, "destination": {"type": "central"}, "note": "TESTGATE8"})
    f = requests.post(f"{API}/consegne/genera-fabbisogni", headers=A, json={"date": today})
    check("Genera fabbisogni = 200", f.status_code == 200, f.text[:140])
    fd = f.json()
    check("1 fabbisogno creato dalla pulizia", fd.get("created") == 1, str(fd))
    fab = mdb.fabbisogni.find_one({"source.type": "fabbisogno_pulizia", "source_id": task["id"]})
    if fab:
        C["fabb"].append(fab["id"])
    check("Fabbisogno: kit estivo dal CONFIG cliente (non dal calendario)",
          fab and fab.get("kits_used") and all("estivo" in (ku.get("kit_name") or "").lower() for ku in fab["kits_used"]), str((fab or {}).get("kits_used")))
    check("Fabbisogno items = delta pieno (struttura a 0, qty > 0)",
          fab and len(fab.get("items", [])) > 0 and all(i.get("qty", 0) > 0 for i in fab["items"]))
    check("Fabbisogno stage da_verificare con finestra check-in",
          fab and fab.get("stage") == "da_verificare" and "15:00" in (fab.get("time_window") or ""))

    # ---- FASE 9/11: anomalia in pulizia → Segnalazione ----
    iss = requests.post(f"{API}/cleaning-tasks/{task['id']}/issues", headers=A, json={
        "category": "missing", "note": "TESTGATE8 manca set asciugamani", "severity": "medium"})
    check("Anomalia pulizia registrata = 200", iss.status_code == 200, iss.text[:120])
    segn = mdb.segnalazioni.find_one({"structure_id": s["id"]})
    if not segn:
        print("DEBUG segnalazioni tot:", mdb.segnalazioni.count_documents({}),
              "| docs:", list(mdb.segnalazioni.find({}, {"_id": 0, "id": 1, "structure_id": 1, "title": 1}).limit(3)),
              "| s_id:", s["id"], "| issue resp:", iss.text[:200])
    if segn:
        C["segn"].append(segn["id"])
    check("Segnalazione creata nel Centro Segnalazioni (origine pulizia)",
          segn is not None and segn.get("origin_type") == "cleaning" and segn.get("status") == "da_valutare",
          str((segn or {}).get("origin_type")))

    # ---- FASE 13: AI proposta → conferma → stessa API layer ----
    action_id = str(uuid.uuid4())
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    admin_user = mdb.users.find_one({"login_username": TEST_ADMIN_USERNAME}, {"id": 1})
    mdb.assistant_actions.insert_one({
        "id": action_id, "session_id": "TESTGATE8", "user_id": admin_user["id"],
        "type": "crea_pulizia", "payload": {"structure_id": s["id"], "date": tomorrow},
        "preview": [], "status": "proposed", "result": None, "created_at": datetime.now().isoformat()})
    C["actions"].append(action_id)
    ex = requests.post(f"{API}/assistant/actions/{action_id}/execute", headers=A)
    check("AI: azione proposta eseguita solo su conferma = 200", ex.status_code == 200, ex.text[:140])
    act = mdb.assistant_actions.find_one({"id": action_id})
    created_task_id = ((act or {}).get("result") or {}).get("entity_id")
    if created_task_id:
        C["tasks"].append(created_task_id)
    check("AI: pulizia creata TRAMITE la stessa API (/cleaning-tasks)",
          act["status"] == "executed" and created_task_id and mdb.cleaning_tasks.count_documents({"id": created_task_id}) == 1)
    ex2 = requests.post(f"{API}/assistant/actions/{action_id}/execute", headers=A)
    check("AI: doppia esecuzione bloccata = 400", ex2.status_code == 400)
    a2 = str(uuid.uuid4())
    mdb.assistant_actions.insert_one({"id": a2, "session_id": "TESTGATE8", "user_id": admin_user["id"],
                                      "type": "crea_pulizia", "payload": {"structure_id": s["id"], "date": tomorrow},
                                      "preview": [], "status": "proposed", "result": None, "created_at": datetime.now().isoformat()})
    C["actions"].append(a2)
    check("AI: annulla proposta = 200", requests.post(f"{API}/assistant/actions/{a2}/cancel", headers=A).status_code == 200)
    check("AI: esecuzione dopo annullo bloccata = 400/404",
          requests.post(f"{API}/assistant/actions/{a2}/execute", headers=A).status_code in (400, 404))
    # scoping: cleaner non accede all'assistente
    cl = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE8_cl", "last_name": "A", "role": "cleaner", "password": TEST_FIXTURE_PASSWORD}).json()
    CLtok = requests.post(f"{API}/auth/login", json={"username": cl["login_username"], "password": TEST_FIXTURE_PASSWORD}).json()["access_token"]
    check("Cleaner GET /assistant/sessions = 403",
          requests.get(f"{API}/assistant/sessions", headers={"Authorization": f"Bearer {CLtok}"}).status_code == 403)
    requests.delete(f"{API}/users/{cl['id']}", headers=A)
finally:
    mdb.assistant_actions.delete_many({"session_id": "TESTGATE8"})
    for sid in C["segn"]:
        mdb.segnalazioni.delete_one({"id": sid})
    mdb.cleaning_issues.delete_many({"note": {"$regex": "TESTGATE8"}})
    for fid in C["fabb"]:
        mdb.fabbisogni.delete_one({"id": fid})
    for tid in set(C["tasks"]):
        mdb.cleaning_tasks.delete_one({"id": tid})
    for eid in C["events"]:
        requests.delete(f"{API}/events/{eid}", headers=A)
    for pid in C["products"]:
        mdb.warehouse_movements.delete_many({"product_id": pid})
        mdb.stock_levels.delete_many({"product_id": pid})
    for kid in C["kits"]:
        requests.delete(f"{API}/magazzino/kits/{kid}", headers=A)
    for pid in C["products"]:
        requests.delete(f"{API}/magazzino/catalog/noleggio/{pid}", headers=A)
    for sid in C["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
    for cid in C["clients"]:
        requests.delete(f"{API}/clients/{cid}", headers=A)
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
