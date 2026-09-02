from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE FASE 7 — Chiavi: ritiri e riconsegne tracciate (registro key_movements). Fixture + cleanup totale."""
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

_pre_notif_ids = set(x.get("id") for x in mdb.notifications.find({}, {"_id": 0, "id": 1}))
C = {"clients": [], "structures": [], "users": []}


def kb(sid, copy):
    s = mdb.structures.find_one({"id": sid}, {"access_info": 1})
    return ((s.get("access_info") or {}).get("key_boxes") or {}).get(copy) or {}


try:
    c = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTGATE7", "surname": "Keys"}}).json()
    C["clients"].append(c["id"])
    s = requests.post(f"{API}/structures", headers=A, json={
        "client_id": c["id"], "name": "TESTGATE7 Casa", "structure_type": "apartment",
        "access_info": {"kilolava_has_keys": True, "key_boxes": {
            "A": {"exists": True, "present": True, "box": "A", "slot": "12"},
            "B": {"exists": True, "present": True, "box": "B", "slot": "12"},
            "C": {"exists": False, "present": False, "box": "C", "slot": ""},
        }}}).json()
    C["structures"].append(s["id"])
    cl = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE7_cl", "last_name": "K", "role": "cleaner", "password": TEST_FIXTURE_PASSWORD}).json()
    C["users"].append(cl["id"])
    CL = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={
        "username": cl["login_username"], "password": TEST_FIXTURE_PASSWORD}).json()["access_token"]}
    rd = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE7_rd", "last_name": "K", "role": "rider", "password": TEST_FIXTURE_PASSWORD}).json()
    C["users"].append(rd["id"])
    RD = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={
        "username": rd["login_username"], "password": TEST_FIXTURE_PASSWORD}).json()["access_token"]}

    # 1. Ops registra ritiro copia A per la cleaner
    r = requests.post(f"{API}/keys/{s['id']}/A/ritiro", headers=A, json={"holder_user_id": cl["id"], "note": "pulizia mattina"})
    check("Ops ritiro copia A per cleaner = 200", r.status_code == 200, r.text[:120])
    st = kb(s["id"], "A")
    check("Copia A fuori sede con detentore e out_since",
          st.get("present") is False and st.get("holder_user_id") == cl["id"] and st.get("holder_name") and st.get("out_since"))
    check("Movimento 'ritiro' registrato nel log",
          mdb.key_movements.count_documents({"structure_id": s["id"], "copy": "A", "action": "ritiro"}) == 1)

    # 2. Doppio ritiro bloccato
    r = requests.post(f"{API}/keys/{s['id']}/A/ritiro", headers=A, json={"holder_user_id": rd["id"]})
    check("Doppio ritiro = 400 'già fuori sede'", r.status_code == 400 and "fuori sede" in r.json()["detail"], r.text[:120])

    # 3. Riconsegna: solo il detentore (o ops)
    r = requests.post(f"{API}/keys/{s['id']}/A/riconsegna", headers=RD, json={})
    check("Rider NON detentore riconsegna = 403", r.status_code == 403)
    r = requests.post(f"{API}/keys/{s['id']}/A/riconsegna", headers=CL, json={"note": "fine turno"})
    check("Cleaner detentrice riconsegna = 200", r.status_code == 200, r.text[:120])
    st = kb(s["id"], "A")
    check("Copia A rientrata (present, holder azzerato)",
          st.get("present") is True and not st.get("holder_user_id") and not st.get("out_since"))
    check("Movimento 'riconsegna' registrato",
          mdb.key_movements.count_documents({"structure_id": s["id"], "copy": "A", "action": "riconsegna"}) == 1)

    # 4. Self-service keys.own: il rider ritira per sé (holder forzato a sé stesso) — regola finale:
    #    copia B solo con la PROPRIA Fermata (linked_task obbligatorio) sulla stessa struttura
    check("Rider ritiro copia B senza attività collegata = 400",
          requests.post(f"{API}/keys/{s['id']}/B/ritiro", headers=RD, json={}).status_code == 400)
    prod7 = mdb.supply_catalog.find_one({}, {"_id": 0, "id": 1})
    ric7 = requests.post(f"{API}/consegne/richieste", headers=A, json={"structure_id": s["id"], "kind": "forniture",
                                                                        "items": [{"product_id": prod7["id"], "qty": 1}], "date_needed": "2027-09-01"}).json()
    fer7 = requests.post(f"{API}/consegne/fermate", headers=A, json={"richiesta_ids": [ric7["id"]], "date": "2027-09-01", "rider_id": rd["id"]}).json()
    r = requests.post(f"{API}/keys/{s['id']}/B/ritiro", headers=RD, json={"holder_user_id": cl["id"], "linked_task_id": fer7["id"], "linked_task_type": "delivery"})
    check("Rider ritiro copia B = 200 (self)", r.status_code == 200, r.text[:120])
    check("Holder forzato al rider (ignora holder_user_id altrui)", kb(s["id"], "B").get("holder_user_id") == rd["id"])
    r = requests.post(f"{API}/keys/{s['id']}/B/riconsegna", headers=A, json={"note": "rientro ops"})
    check("Ops può riconsegnare qualsiasi copia = 200", r.status_code == 200)

    # 5. Copia mancante / non valida
    r = requests.post(f"{API}/keys/{s['id']}/C/ritiro", headers=A, json={})
    check("Copia C mancante = 400", r.status_code == 400 and "mancante" in r.json()["detail"].lower())
    check("Copia X non valida = 400", requests.post(f"{API}/keys/{s['id']}/X/ritiro", headers=A, json={}).status_code == 400)

    # 6. Log movimenti: ops sì, operativi no
    log = requests.get(f"{API}/keys/movements", headers=A, params={"structure_id": s["id"]})
    check("GET /keys/movements (ops) = 4 movimenti", log.status_code == 200 and len(log.json()) == 4, str(len(log.json())))
    check("Log ordinato dal più recente", log.json()[0]["action"] == "riconsegna")
    check("Cleaner GET /keys/movements = 403", requests.get(f"{API}/keys/movements", headers=CL).status_code == 403)

    # 7. Fase 4: struttura con storico chiavi non eliminabile
    r = requests.delete(f"{API}/structures/{s['id']}", headers=A)
    check("DELETE struttura con movimenti chiavi = 400", r.status_code == 400 and "chiavi" in r.json()["detail"].lower(), r.text[:140])
finally:
    for sid in C["structures"]:
        mdb.key_movements.delete_many({"structure_id": sid})
        mdb.logistics_tasks.delete_many({"structure_id": sid})
        mdb.fabbisogni.delete_many({"structure_id": sid})
    for uid in C["users"]:
        requests.delete(f"{API}/users/{uid}", headers=A)
    for sid in C["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
    for cid in C["clients"]:
        if requests.delete(f"{API}/clients/{cid}", headers=A).status_code != 200:
            mdb.clients.delete_one({"id": cid})  # fixture TEST_GATE7: rimozione fisica
    mdb.notifications.delete_many({"id": {"$nin": list(_pre_notif_ids)}})
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
