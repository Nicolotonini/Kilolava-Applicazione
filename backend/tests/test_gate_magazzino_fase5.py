from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE FASE 5 — Magazzino: motore unico, movimenti immutabili, storno, rettifica, legacy dismesso. Fixture + cleanup totale."""
import os
from datetime import datetime, timedelta
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
API = os.environ["REACT_APP_BACKEND_URL"] + "/api"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

results = []
NOTE = "TESTGATE5"


def check(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("PASS " if ok else "FAIL ") + name + (f" [{extra}]" if extra else ""))


admin_tok = requests.post(f"{API}/auth/login", json={
    "username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}).json()["access_token"]
A = {"Authorization": f"Bearer {admin_tok}"}

cleanup = {"clients": [], "structures": [], "products": [], "users": []}


def stock(loc_type, loc_id, pid):
    r = mdb.stock_levels.find_one({"domain": "noleggio", "location_type": loc_type, "location_id": loc_id, "product_id": pid})
    return (r or {}).get("qty", 0)


try:
    c = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTGATE5", "surname": "Mag"}}).json()
    cleanup["clients"].append(c["id"])
    s = requests.post(f"{API}/structures", headers=A, json={
        "client_id": c["id"], "name": "TESTGATE5 Casa", "structure_type": "apartment"}).json()
    cleanup["structures"].append(s["id"])
    p = requests.post(f"{API}/magazzino/catalog/noleggio", headers=A, json={"name": "TESTGATE5 Lenzuolo"}).json()
    cleanup["products"].append(p["id"])

    central = {"type": "central"}
    struct = {"type": "structure", "id": s["id"]}
    ext = {"type": "external", "label": "Acquisto"}

    # 1. CARICO esterno -> centrale
    m1 = requests.post(f"{API}/magazzino/movimenti", headers=A, json={
        "domain": "noleggio", "movement_type": "carico", "product_id": p["id"], "qty": 10,
        "origin": ext, "destination": central, "note": NOTE})
    check("Carico 10 -> centrale = 200 con codice MOV", m1.status_code == 200 and (m1.json().get("code") or "").startswith("MOV-"), m1.text[:100])
    check("Stock centrale = 10", stock("central", None, p["id"]) == 10, str(stock("central", None, p["id"])))

    # 2. TRASFERIMENTO centrale -> struttura
    m2 = requests.post(f"{API}/magazzino/movimenti", headers=A, json={
        "domain": "noleggio", "movement_type": "trasferimento", "product_id": p["id"], "qty": 4,
        "origin": central, "destination": struct, "note": NOTE}).json()
    check("Trasferimento 4: centrale 6 / struttura 4",
          stock("central", None, p["id"]) == 6 and stock("structure", s["id"], p["id"]) == 4)

    # 3. STORNO del trasferimento: movimento inverso collegato, originale IMMUTABILE
    st = requests.post(f"{API}/magazzino/movimenti/{m2['id']}/storno", headers=A, json={"motivo": "errore_inserimento"})
    check("Storno trasferimento = 200", st.status_code == 200, st.text[:120])
    check("Stock ripristinato: centrale 10 / struttura 0",
          stock("central", None, p["id"]) == 10 and stock("structure", s["id"], p["id"]) == 0)
    orig = mdb.warehouse_movements.find_one({"id": m2["id"]})
    check("Originale immutabile (qty/tipo/origini invariati)",
          orig["qty"] == 4 and orig["movement_type"] == "trasferimento"
          and orig["origin"]["type"] == "central" and orig["destination"]["type"] == "structure")
    check("Originale collegato allo storno (reversed_by + status stornato)",
          orig.get("reversed_by") == st.json()["storno"]["id"] and orig.get("status") == "stornato")
    inv = mdb.warehouse_movements.find_one({"id": st.json()["storno"]["id"]})
    check("Storno = movimento inverso collegato (reverses)", inv.get("reverses") == m2["id"] and inv["movement_type"] == "storno")
    r2 = requests.post(f"{API}/magazzino/movimenti/{m2['id']}/storno", headers=A, json={"motivo": "errore_inserimento"})
    check("Doppio storno = 400", r2.status_code == 400)
    r3 = requests.post(f"{API}/magazzino/movimenti/{inv['id']}/storno", headers=A, json={"motivo": "errore_inserimento"})
    check("Storno dello storno = 400", r3.status_code == 400)

    # 4. Nuovo trasferimento + RETTIFICA inventario
    requests.post(f"{API}/magazzino/movimenti", headers=A, json={
        "domain": "noleggio", "movement_type": "trasferimento", "product_id": p["id"], "qty": 5,
        "origin": central, "destination": struct, "note": NOTE})
    inv_r = requests.post(f"{API}/magazzino/inventario", headers=A, json={
        "domain": "noleggio", "location_type": "structure", "location_id": s["id"],
        "counts": [{"product_id": p["id"], "counted": 3}], "note": NOTE})
    adj = inv_r.json().get("adjustments", [])
    check("Rettifica inventario: adjustment 5->3 registrato", inv_r.status_code == 200 and len(adj) == 1 and adj[0]["from"] == 5 and adj[0]["to"] == 3, inv_r.text[:120])
    check("Stock struttura dopo rettifica = 3", stock("structure", s["id"], p["id"]) == 3)
    rett = mdb.warehouse_movements.find_one({"id": adj[0]["movement_id"]})
    check("Rettifica = movimento dedicato (rettifica_inventario, qty 2)",
          rett and rett["movement_type"] == "rettifica_inventario" and rett["qty"] == 2)

    # 5. Consistenza: ricalcolo giacenze dai movimenti == stock_levels
    def recompute(loc_type, loc_id):
        tot = 0
        for m in mdb.warehouse_movements.find({"product_id": p["id"]}):
            o, d = m.get("origin") or {}, m.get("destination") or {}
            if o.get("type") == loc_type and (o.get("id") or None) == loc_id:
                tot -= m["qty"]
            if d.get("type") == loc_type and (d.get("id") or None) == loc_id:
                tot += m["qty"]
        return tot
    check("Consistenza centrale: movimenti == stock_levels",
          recompute("central", None) == stock("central", None, p["id"]), f"{recompute('central', None)} vs {stock('central', None, p['id'])}")
    check("Consistenza struttura: movimenti == stock_levels",
          recompute("structure", s["id"]) == stock("structure", s["id"], p["id"]))

    # 6. LEGACY dismesso (motore unico)
    legacy_body = {"movement_type": "delivered", "date": "2026-06-15", "items": [{"article_id": "x", "quantity": 1}]}
    rl = requests.post(f"{API}/inventory/movements", headers=A, json=legacy_body)
    check("Legacy POST /inventory/movements = 410 (admin)", rl.status_code == 410, str(rl.status_code))
    rl2 = requests.delete(f"{API}/inventory/movements/qualsiasi", headers=A)
    check("Legacy DELETE /inventory/movements = 410 (immutabilità)", rl2.status_code == 410, str(rl2.status_code))
    cu = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE5_cl", "last_name": "Mag", "role": "cleaner", "password": TEST_FIXTURE_PASSWORD}).json()
    cleanup["users"].append(cu["id"])
    cl_tok = requests.post(f"{API}/auth/login", json={"username": cu["login_username"], "password": TEST_FIXTURE_PASSWORD}).json()["access_token"]
    CL = {"Authorization": f"Bearer {cl_tok}"}
    check("Cleaner POST legacy = 403 (guardia prima del 410)",
          requests.post(f"{API}/inventory/movements", headers=CL, json=legacy_body).status_code == 403)
    check("Cleaner POST /magazzino/movimenti = 403",
          requests.post(f"{API}/magazzino/movimenti", headers=CL, json={
              "domain": "noleggio", "movement_type": "carico", "product_id": p["id"], "qty": 1}).status_code == 403)
    check("Nessun documento nel registro legacy (db.movements)", mdb.movements.count_documents({}) == 0)

    # 7. Report e overview sul motore unico
    today = datetime.now().strftime("%Y-%m-%d")
    tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    rep = requests.get(f"{API}/reports/inventory", headers=A, params={"date_from": today, "date_to": tomorrow}).json()
    check("Report inventory legge warehouse_movements (>=5 movimenti)",
          rep.get("total_movements", 0) >= 5 and "trasferimento" in rep.get("by_type", {}) and "storno" in rep.get("by_type", {}), str(rep.get("by_type")))
    check("Report top_items dal motore unico", any(t.get("article_id") == p["id"] for t in rep.get("top_items", [])))
    check("GET /clients/overview = 200 (pipeline stock_levels)", requests.get(f"{API}/clients/overview", headers=A).status_code == 200)
    check("GET /dashboard/overview = 200 (pipeline stock_levels)", requests.get(f"{API}/dashboard/overview", headers=A).status_code == 200)

    # giacenza negativa -> alert overview
    mdb.stock_levels.update_one({"domain": "noleggio", "location_type": "structure", "location_id": s["id"], "product_id": p["id"]},
                                {"$set": {"qty": -1}})
    ov = requests.get(f"{API}/dashboard/overview", headers=A).json()
    neg = [a for a in ov.get("attention", []) if a.get("type") == "negative_stock"]
    check("Alert giacenza negativa da stock_levels", len(neg) == 1 and neg[0]["count"] >= 1, str(neg))
finally:
    # CLEANUP TOTALE fixture (movimenti di test inclusi: sono fixture, non storico reale)
    mdb.warehouse_movements.delete_many({"note": {"$regex": NOTE}})
    for pid in cleanup["products"]:
        mdb.warehouse_movements.delete_many({"product_id": pid})
        mdb.stock_levels.delete_many({"product_id": pid})
        requests.delete(f"{API}/magazzino/catalog/noleggio/{pid}", headers=A)
    for uid in cleanup["users"]:
        requests.delete(f"{API}/users/{uid}", headers=A)
    for sid in cleanup["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
    for cid in cleanup["clients"]:
        requests.delete(f"{API}/clients/{cid}", headers=A)
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
