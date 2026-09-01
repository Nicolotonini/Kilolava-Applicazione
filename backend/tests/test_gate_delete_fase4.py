from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE FASE 4 — Disattivazione vs hard delete: Clienti, Strutture, Unità, Prodotti, Kit. Fixture temporanee + cleanup."""
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

cleanup = {"clients": [], "structures": [], "units": [], "users": [], "kits": [], "tasks": [], "events": [], "products": []}

try:
    # --- CLIENTE ---
    c = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTGATE4", "surname": "Del"}}).json()
    cleanup["clients"].append(c["id"])
    # con account portale -> 400
    pu = requests.post(f"{API}/clients/{c['id']}/create-account", headers=A, json={
        "email": "tg4.portal@testgate.it", "password": TEST_FIXTURE_PASSWORD, "name": "TG4 Portal"})
    check("Setup account portale = 200", pu.status_code == 200, pu.text[:100])
    rd = requests.delete(f"{API}/clients/{c['id']}", headers=A)
    check("DELETE cliente con account portale = 400 'Usa Disattiva'",
          rd.status_code == 400 and "Disattiva" in rd.json()["detail"] and "Account portale" in rd.json()["detail"], rd.text[:160])
    portal_user = mdb.users.find_one({"client_id": c["id"], "role": "client"}, {"id": 1})
    if portal_user:
        cleanup["users"].append(portal_user["id"])
        requests.delete(f"{API}/users/{portal_user['id']}", headers=A)
    # con struttura -> 400
    s = requests.post(f"{API}/structures", headers=A, json={
        "client_id": c["id"], "name": "TESTGATE4 Casa", "structure_type": "apartment"}).json()
    cleanup["structures"].append(s["id"])
    rd = requests.delete(f"{API}/clients/{c['id']}", headers=A)
    check("DELETE cliente con struttura = 400 'Strutture'",
          rd.status_code == 400 and "Strutture" in rd.json()["detail"])

    # --- STRUTTURA ---
    t = requests.post(f"{API}/cleaning-tasks", headers=A, json={
        "structure_id": s["id"], "date": "2026-06-20", "guests_count": 2})
    check("Setup pulizia su struttura = 200", t.status_code == 200, t.text[:100])
    task_id = t.json().get("id")
    cleanup["tasks"].append(task_id)
    rd = requests.delete(f"{API}/structures/{s['id']}", headers=A)
    check("DELETE struttura con pulizia = 400 'Pulizie ... Usa Disattiva'",
          rd.status_code == 400 and "Pulizie" in rd.json()["detail"] and "Disattiva" in rd.json()["detail"], rd.text[:160])
    requests.delete(f"{API}/cleaning-tasks/{task_id}", headers=A)
    cleanup["tasks"].remove(task_id)

    # --- UNITÀ ---
    u = requests.post(f"{API}/units", headers=A, json={"structure_id": s["id"], "name": "TG4 Unit"}).json()
    cleanup["units"].append(u["id"])
    ev = requests.post(f"{API}/events", headers=A, json={
        "event_type": "booking", "title": "TG4 Booking", "structure_id": s["id"], "unit_id": u["id"],
        "start_time": "2026-06-21T14:00:00", "end_time": "2026-06-23T10:00:00"})
    check("Setup evento su unità = 200", ev.status_code == 200, ev.text[:100])
    ev_id = ev.json().get("id")
    cleanup["events"].append(ev_id)
    rd = requests.delete(f"{API}/units/{u['id']}", headers=A)
    check("DELETE unità con evento = 400 'Prenotazioni/Eventi'",
          rd.status_code == 400 and "Eventi" in rd.json()["detail"], rd.text[:160])
    requests.delete(f"{API}/events/{ev_id}", headers=A)
    cleanup["events"].remove(ev_id)
    rd = requests.delete(f"{API}/units/{u['id']}", headers=A)
    check("DELETE unità senza storico = 200", rd.status_code == 200)
    if rd.status_code == 200:
        cleanup["units"].remove(u["id"])

    # struttura ora con evento eliminato e senza unità: l'evento è stato cancellato,
    # ma la struttura ha ancora storico? (evento rimosso, task rimosso) -> deve essere eliminabile
    rd = requests.delete(f"{API}/structures/{s['id']}", headers=A)
    check("DELETE struttura senza storico = 200", rd.status_code == 200, rd.text[:160])
    if rd.status_code == 200:
        cleanup["structures"].remove(s["id"])
    rd = requests.delete(f"{API}/clients/{c['id']}", headers=A)
    check("DELETE cliente senza storico = 200", rd.status_code == 200, rd.text[:160])
    if rd.status_code == 200:
        cleanup["clients"].remove(c["id"])

    # --- KIT ---
    k = requests.post(f"{API}/magazzino/kits", headers=A, json={
        "name": "TESTGATE4 Kit", "domain": "noleggio", "items": []})
    check("Setup kit = 200", k.status_code == 200, k.text[:100])
    kit = k.json()
    cleanup["kits"].append(kit["id"])
    # riferimento fittizio in fabbisogni -> 409
    fix_id = "TESTGATE4-FABB"
    mdb.fabbisogni.insert_one({"id": fix_id, "kit_id": kit["id"], "kind": "noleggio", "status": "aperta", "note": "fixture gate4"})
    rd = requests.delete(f"{API}/magazzino/kits/{kit['id']}", headers=A)
    check("DELETE kit utilizzato = 409 'puoi disattivarlo'",
          rd.status_code == 409 and "disattivar" in rd.json()["detail"].lower(), rd.text[:160])
    mdb.fabbisogni.delete_one({"id": fix_id})
    rd = requests.delete(f"{API}/magazzino/kits/{kit['id']}", headers=A)
    check("DELETE kit mai utilizzato = 200", rd.status_code == 200, rd.text[:160])
    if rd.status_code == 200:
        cleanup["kits"].remove(kit["id"])
        check("Kit versions ripulite", mdb.kit_versions.count_documents({"kit_id": kit["id"]}) == 0)

    # --- PRODOTTO (regressione safe-delete esistente) ---
    p = requests.post(f"{API}/magazzino/catalog/forniture", headers=A, json={"name": "TESTGATE4 Prod"}).json()
    cleanup["products"].append(p["id"])
    rd = requests.delete(f"{API}/magazzino/catalog/forniture/{p['id']}", headers=A)
    check("DELETE prodotto mai usato = 200", rd.status_code == 200, rd.text[:120])
    if rd.status_code == 200:
        cleanup["products"].remove(p["id"])

    # --- Disattivazione disponibile ---
    c2 = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTGATE4", "surname": "Dis"}}).json()
    cleanup["clients"].append(c2["id"])
    ru = requests.put(f"{API}/clients/{c2['id']}", headers=A, json={"is_active": False})
    check("Disattivazione cliente via PUT is_active", ru.status_code == 200 and ru.json().get("is_active") is False)
    rd = requests.delete(f"{API}/clients/{c2['id']}", headers=A)
    check("Cliente disattivato senza storico resta eliminabile = 200", rd.status_code == 200)
    if rd.status_code == 200:
        cleanup["clients"].remove(c2["id"])
finally:
    for eid in cleanup["events"]:
        requests.delete(f"{API}/events/{eid}", headers=A)
    for tid in cleanup["tasks"]:
        requests.delete(f"{API}/cleaning-tasks/{tid}", headers=A)
    for uid in cleanup["units"]:
        requests.delete(f"{API}/units/{uid}", headers=A)
    for kid in cleanup["kits"]:
        requests.delete(f"{API}/magazzino/kits/{kid}", headers=A)
    for pid in cleanup["products"]:
        requests.delete(f"{API}/magazzino/catalog/forniture/{pid}", headers=A)
    for uid in cleanup["users"]:
        requests.delete(f"{API}/users/{uid}", headers=A)
    for sid in cleanup["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
    for cid in cleanup["clients"]:
        requests.delete(f"{API}/clients/{cid}", headers=A)
    mdb.fabbisogni.delete_many({"note": "fixture gate4"})
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
