from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE FASE 6 — Quantità reali Rider: consegna con quantità effettive + ritiri tracciati sul giro. Fixture + cleanup totale."""
import os
from datetime import datetime
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
C = {"clients": [], "structures": [], "products": [], "users": [], "kits": [], "fermate": [], "fabbisogni": []}


def stock(loc_type, loc_id, pid):
    r = mdb.stock_levels.find_one({"domain": "noleggio", "location_type": loc_type, "location_id": loc_id, "product_id": pid})
    return (r or {}).get("qty", 0)


try:
    today = datetime.now().strftime("%Y-%m-%d")
    c = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTGATE6", "surname": "Rider"}}).json()
    C["clients"].append(c["id"])
    s = requests.post(f"{API}/structures", headers=A, json={
        "client_id": c["id"], "name": "TESTGATE6 Casa", "structure_type": "apartment"}).json()
    C["structures"].append(s["id"])
    p = requests.post(f"{API}/magazzino/catalog/noleggio", headers=A, json={"name": "TESTGATE6 Lenzuola"}).json()
    C["products"].append(p["id"])
    k = requests.post(f"{API}/magazzino/kits", headers=A, json={
        "name": "TESTGATE6 Kit", "domain": "noleggio", "items": [{"product_id": p["id"], "qty": 4}]}).json()
    C["kits"].append(k["id"])
    rider = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE6_rider", "last_name": "R", "role": "rider", "password": TEST_FIXTURE_PASSWORD}).json()
    C["users"].append(rider["id"])
    R = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={
        "username": rider["login_username"], "password": TEST_FIXTURE_PASSWORD}).json()["access_token"]}

    # carico iniziale magazzino
    requests.post(f"{API}/magazzino/movimenti", headers=A, json={
        "domain": "noleggio", "movement_type": "carico", "product_id": p["id"], "qty": 10,
        "origin": {"type": "external", "label": "Acquisto"}, "destination": {"type": "central"}, "note": "TESTGATE6"})

    # richiesta da kit (kind noleggio) + fermata assegnata al rider
    ric = requests.post(f"{API}/consegne/richieste", headers=A, json={
        "structure_id": s["id"], "kits": [{"kit_id": k["id"], "qty": 1}], "date_needed": today})
    check("Richiesta noleggio da kit = 200", ric.status_code == 200, ric.text[:120])
    ric = ric.json()
    C["fabbisogni"].append(ric["id"])
    fer = requests.post(f"{API}/consegne/fermate", headers=A, json={
        "richiesta_ids": [ric["id"]], "date": today, "rider_id": rider["id"]})
    check("Fermata creata e assegnata = 200", fer.status_code == 200, fer.text[:120])
    fer = fer.json()
    C["fermate"].append(fer["id"])

    # il rider vede la fermata e la avvia
    mie = requests.get(f"{API}/consegne/mie-fermate", headers=R, params={"date": today}).json()
    check("Rider vede la propria fermata", any(f["id"] == fer["id"] for f in mie))
    check("Start fermata (rider) = 200", requests.put(f"{API}/consegne/fermate/{fer['id']}/start", headers=R).status_code == 200)

    # rider estraneo non può completare
    r2 = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE6_r2", "last_name": "R", "role": "rider", "password": TEST_FIXTURE_PASSWORD}).json()
    C["users"].append(r2["id"])
    R2 = {"Authorization": "Bearer " + requests.post(f"{API}/auth/login", json={
        "username": r2["login_username"], "password": TEST_FIXTURE_PASSWORD}).json()["access_token"]}
    check("Rider estraneo completa = 403",
          requests.post(f"{API}/consegne/fermate/{fer['id']}/completa", headers=R2, json={}).status_code == 403)

    # completamento con QUANTITÀ REALI (3 invece di 4) + RITIRO sporco (2)
    comp = requests.post(f"{API}/consegne/fermate/{fer['id']}/completa", headers=R, json={
        "note": "TESTGATE6 giro",
        "effective_items": [{"richiesta_id": ric["id"], "product_id": p["id"], "qty": 3}],
        "ritiri": [{"product_id": p["id"], "qty": 2, "domain": "noleggio"}],
    })
    check("Completa con effective_items + ritiri = 200", comp.status_code == 200, comp.text[:120])
    check("Movimenti creati = 2 (consegna + ritiro)", comp.json().get("movements") == 2, str(comp.json()))

    # verifiche motore unico
    check("Stock centrale = 9 (10 - 3 consegnati + 2 ritirati)", stock("central", None, p["id"]) == 9, str(stock("central", None, p["id"])))
    check("Stock struttura = 1 (3 consegnati - 2 ritirati)", stock("structure", s["id"], p["id"]) == 1, str(stock("structure", s["id"], p["id"])))
    movs = list(mdb.warehouse_movements.find({"delivery_id": fer["id"]}))
    cons = [m for m in movs if m["movement_type"] == "consegna"]
    rit = [m for m in movs if m["movement_type"] == "ritiro"]
    check("Movimento consegna qty reale = 3", len(cons) == 1 and cons[0]["qty"] == 3)
    check("Movimento ritiro qty = 2, struttura -> centrale",
          len(rit) == 1 and rit[0]["qty"] == 2 and rit[0]["origin"]["type"] == "structure" and rit[0]["destination"]["type"] == "central")
    check("Movimenti eseguiti dal rider (user_id)", all(m.get("user_id") == rider["id"] for m in movs))

    task = mdb.logistics_tasks.find_one({"id": fer["id"]})
    check("Fermata completed con effective_items salvati",
          task["status"] == "completed" and task.get("effective_items") and task["effective_items"][0]["qty"] == 3)
    check("Ritiri salvati sulla fermata (tracciati sul giro)",
          task.get("ritiri") and task["ritiri"][0]["qty"] == 2 and task["ritiri"][0].get("movement_id"))
    fab = mdb.fabbisogni.find_one({"id": ric["id"]})
    # consegna 3 su 4 pianificati = consegna parziale (regola canonica: residuo in nuova richiesta)
    check("Fabbisogno parzialmente evaso (3/4) + residuo", fab["status"] == "parzialmente_evasa"
          and bool(mdb.fabbisogni.find_one({"parent_richiesta_id": ric["id"]})))
    for r_ in mdb.fabbisogni.find({"parent_richiesta_id": ric["id"]}, {"id": 1}):
        C["fabbisogni"].append(r_["id"])

    # dettaglio fermata (ops) espone i movimenti del giro
    det = requests.get(f"{API}/consegne/fermate/{fer['id']}", headers=A).json()
    check("Dettaglio fermata mostra 2 movimenti collegati", len(det.get("movements", [])) == 2)
finally:
    for fid in C["fermate"]:
        mdb.logistics_tasks.delete_one({"id": fid})
    for rid in C["fabbisogni"]:
        mdb.fabbisogni.delete_one({"id": rid})
    for pid in C["products"]:
        mdb.warehouse_movements.delete_many({"product_id": pid})
        mdb.stock_levels.delete_many({"product_id": pid})
    for kid in C["kits"]:
        requests.delete(f"{API}/magazzino/kits/{kid}", headers=A)
    for pid in C["products"]:
        requests.delete(f"{API}/magazzino/catalog/noleggio/{pid}", headers=A)
    for uid in C["users"]:
        requests.delete(f"{API}/users/{uid}", headers=A)
    mdb.notifications.delete_many({"id": {"$nin": list(_pre_notif_ids)}})
    for sid in C["structures"]:
        if requests.delete(f"{API}/structures/{sid}", headers=A).status_code != 200:
            mdb.structures.delete_one({"id": sid})  # fixture TESTGATE: rimozione fisica
    for cid in C["clients"]:
        if requests.delete(f"{API}/clients/{cid}", headers=A).status_code != 200:
            mdb.clients.delete_one({"id": cid})
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
