import sys; sys.path.insert(0, "/app/backend/tests")  # noqa: E702
from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE — Ultimo fix mirato pre-import.
CHIAVI backend: copia A=cleaning (Cleaner, propria pulizia, stessa struttura), B=delivery (Rider, propria fermata),
C=solo Ops; linked_task obbligatorio/validato per i ruoli operativi; riconsegna solo del detentore; movimenti append-only.
ORDINI: timeline Cliente canonica (/clients/{id}/activity) con ordini client_orders, nessun db.orders.
AUTH: sessione valida + is_active=false → 401.  PERMESSI: has_permission delega a effective_permissions; extra_roles ok.
Fixture TESTFIX_ con cleanup verificato."""
import os
import re
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


def login(username, password):
    r = requests.post(f"{API}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"login {username}: {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


A = login(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD)
COLLS = ("users", "clients", "structures", "units", "events", "cleaning_tasks", "fabbisogni", "logistics_tasks",
         "warehouse_movements", "client_orders", "orders", "key_movements", "stock_levels", "kits",
         "rental_catalog", "supply_catalog", "cleaning_catalog", "notifications")
baseline = {c: mdb[c].count_documents({}) for c in COLLS}
baseline_usr = sorted(u["usr_code"] for u in mdb.users.find({}, {"usr_code": 1}))
pre_notif = set(x.get("id") for x in mdb.notifications.find({}, {"_id": 0, "id": 1}))
pre_stock = set(x.get("id") for x in mdb.stock_levels.find({}, {"_id": 0, "id": 1}))
pre_counters = {c["_id"]: c.get("seq", 0) for c in mdb.counters.find({})}
cleanup = {"users": [], "clients": [], "structures": [], "tasks": [], "fabbisogni": [], "fermate": [], "client_orders": []}

KEYS = {"kilolava_has_keys": True, "key_boxes": {c: {"enabled": True, "exists": True, "present": True} for c in "ABC"}}


def mk_user(first, role, extra=None):
    body = {"first_name": f"TESTFIX_{first}", "last_name": "KeyFix", "role": role, "password": TEST_FIXTURE_PASSWORD}
    if extra:
        body["extra_roles"] = extra
    r = requests.post(f"{API}/users", headers=A, json=body)
    assert r.status_code == 200, r.text
    u = r.json()
    cleanup["users"].append(u["id"])
    return u, login(u["login_username"], TEST_FIXTURE_PASSWORD)


def boxes(sid):
    return mdb.structures.find_one({"id": sid}, {"_id": 0, "access_info": 1})["access_info"]["key_boxes"]


def ritiro(h, sid, copy, tid=None, ttype=None, holder=None):
    body = {}
    if tid is not None:
        body["linked_task_id"] = tid
    if ttype is not None:
        body["linked_task_type"] = ttype
    if holder:
        body["holder_user_id"] = holder
    return requests.post(f"{API}/keys/{sid}/{copy}/ritiro", headers=h, json=body)


def riconsegna(h, sid, copy):
    return requests.post(f"{API}/keys/{sid}/{copy}/riconsegna", headers=h, json={})


try:
    cl = requests.post(f"{API}/clients", headers=A, json={"client_type": "private", "private_info": {"name": "TESTFIX_KeyFix", "surname": "Cliente"}}).json()
    cleanup["clients"].append(cl["id"])
    s1 = requests.post(f"{API}/structures", headers=A, json={"client_id": cl["id"], "name": "TESTFIX_KeyFix S1", "structure_type": "apartment",
                                                             "services": ["cleaning", "rental_laundry"], "access_info": KEYS}).json()
    s2 = requests.post(f"{API}/structures", headers=A, json={"client_id": cl["id"], "name": "TESTFIX_KeyFix S2", "structure_type": "apartment",
                                                             "services": ["cleaning", "rental_laundry"], "access_info": KEYS}).json()
    for s in (s1, s2):
        assert s.get("id"), s
        cleanup["structures"].append(s["id"])
    cleaner1, C1 = mk_user("cleaner1", "cleaner")
    cleaner2, C2 = mk_user("cleaner2", "cleaner")
    rider1, R1 = mk_user("rider1", "rider")
    rider2, R2 = mk_user("rider2", "rider")
    om, OM = mk_user("om", "operations_manager")
    multi, CR = mk_user("cleanerrider", "cleaner", ["rider"])
    inactive, IN = mk_user("inactive", "cleaner")

    t1 = requests.post(f"{API}/cleaning-tasks", headers=A, json={"structure_id": s1["id"], "date": "2027-08-01", "guests_count": 2, "assigned_cleaner_ids": [cleaner1["id"]]}).json()
    t2 = requests.post(f"{API}/cleaning-tasks", headers=A, json={"structure_id": s2["id"], "date": "2027-08-01", "guests_count": 2, "assigned_cleaner_ids": [cleaner1["id"]]}).json()
    t_multi = requests.post(f"{API}/cleaning-tasks", headers=A, json={"structure_id": s2["id"], "date": "2027-08-02", "guests_count": 2, "assigned_cleaner_ids": [multi["id"]]}).json()
    for t in (t1, t2, t_multi):
        assert t.get("id"), t
        cleanup["tasks"].append(t["id"])
    # fermate: F1 su S1 (rider1), F2 su S2 (rider1)
    prod = mdb.supply_catalog.find_one({}, {"_id": 0, "id": 1})
    fermate = {}
    for key, s in (("F1", s1), ("F2", s2)):
        ric = requests.post(f"{API}/consegne/richieste", headers=A, json={"structure_id": s["id"], "kind": "forniture",
                                                                           "items": [{"product_id": prod["id"], "qty": 1}], "date_needed": "2027-08-01"})
        assert ric.status_code == 200, ric.text
        cleanup["fabbisogni"].append(ric.json()["id"])
        fer = requests.post(f"{API}/consegne/fermate", headers=A, json={"richiesta_ids": [ric.json()["id"]], "date": "2027-08-01", "rider_id": rider1["id"]})
        assert fer.status_code == 200, fer.text
        fermate[key] = fer.json()
        cleanup["fermate"].append(fer.json()["id"])
    F1, F2 = fermate["F1"], fermate["F2"]

    # ================= CHIAVI — CLEANER =================
    check("Cleaner: copia A + propria Pulizia + stessa Struttura = 200",
          ritiro(C1, s1["id"], "A", t1["id"], "cleaning").status_code == 200)
    check("Cleaner: stato chiave A aggiornato (holder = cleaner1, out_since)",
          boxes(s1["id"])["A"].get("present") is False and boxes(s1["id"])["A"].get("holder_user_id") == cleaner1["id"] and boxes(s1["id"])["A"].get("out_since"))
    check("Cleaner: copia B = 403", ritiro(C1, s1["id"], "B", F1["id"], "delivery").status_code == 403)
    check("Cleaner: copia C = 403", ritiro(C1, s1["id"], "C", t1["id"], "cleaning").status_code == 403)
    check("Cleaner: Pulizia non assegnata (cleaner2) = 403", ritiro(C2, s1["id"], "A", t1["id"], "cleaning").status_code == 403)
    check("Cleaner: Pulizia di altra Struttura = 403", ritiro(C1, s2["id"], "A", t1["id"], "cleaning").status_code == 403)
    check("Cleaner: struttura senza Pulizia assegnata, task di altra struttura = 403", ritiro(C2, s2["id"], "A", t2["id"], "cleaning").status_code == 403)
    r_missing = ritiro(C1, s2["id"], "A")
    check("Cleaner: linked_task mancante = 400", r_missing.status_code == 400, r_missing.text[:80])
    r_inex = ritiro(C1, s2["id"], "A", "non-esiste", "cleaning")
    check("Cleaner: linked_task inesistente = 404", r_inex.status_code == 404, r_inex.text[:80])
    check("Cleaner: linked_task_type errato (delivery su copia A) = 403", ritiro(C1, s2["id"], "A", t2["id"], "delivery").status_code == 403)
    check("Cleaner: linked_task_type non valido = 4xx", ritiro(C1, s2["id"], "A", t2["id"], "boh").status_code in (400, 403))
    check("Cleaner: copia A già fuori (ritiro doppio) = 400", ritiro(C1, s1["id"], "A", t1["id"], "cleaning").status_code == 400)
    mv = mdb.key_movements.find_one({"structure_id": s1["id"], "copy": "A", "action": "ritiro"}, {"_id": 0})
    check("Cleaner: movimento ritiro registrato con attività collegata",
          bool(mv) and mv.get("linked_task_id") == t1["id"] and mv.get("linked_task_type") == "cleaning" and mv.get("holder_user_id") == cleaner1["id"], str(mv)[:160])

    # ================= CHIAVI — RIDER =================
    check("Rider: copia B + propria Fermata + stessa Struttura = 200", ritiro(R1, s1["id"], "B", F1["id"], "delivery").status_code == 200)
    check("Rider: copia A = 403", ritiro(R1, s2["id"], "A", t2["id"], "cleaning").status_code == 403)
    check("Rider: copia C = 403", ritiro(R1, s2["id"], "C", F2["id"], "delivery").status_code == 403)
    check("Rider: Fermata non assegnata (rider2) = 403", ritiro(R2, s2["id"], "B", F2["id"], "delivery").status_code == 403)
    check("Rider: Fermata di altra Struttura = 403", ritiro(R1, s2["id"], "B", F1["id"], "delivery").status_code == 403)
    check("Rider: task mancante = 400", ritiro(R1, s2["id"], "B").status_code == 400)
    check("Rider: task inesistente = 404", ritiro(R1, s2["id"], "B", "nope", "delivery").status_code == 404)
    check("Rider: holder_user_id di terzi ignorato (solo sé stesso)", boxes(s1["id"])["B"].get("holder_user_id") == rider1["id"])
    # multi-ruolo cleaner+rider: A con propria pulizia OK, B con fermata non sua 403
    check("Cleaner+Rider: copia A con propria Pulizia = 200", ritiro(CR, s2["id"], "A", t_multi["id"], "cleaning").status_code == 200)
    check("Cleaner+Rider: copia B con Fermata non sua = 403", ritiro(CR, s2["id"], "B", F2["id"], "delivery").status_code == 403)

    # ================= CHIAVI — OPS / ADMIN =================
    check("Admin: copia C manuale senza attività = 200", ritiro(A, s2["id"], "C").status_code == 200)
    check("Admin: riconsegna manuale copia C = 200", riconsegna(A, s2["id"], "C").status_code == 200)
    check("OM: copia C manuale per un altro detentore = 200", ritiro(OM, s2["id"], "C", holder=cleaner2["id"]).status_code == 200)
    check("OM: copia B con attività collegata inesistente = 404", ritiro(OM, s2["id"], "B", "nope", "delivery").status_code == 404)
    check("OM: copia B con attività di altra struttura = 403", ritiro(OM, s2["id"], "B", F1["id"], "delivery").status_code == 403)
    check("OM: copia B con attività coerente (non strict) = 200", ritiro(OM, s2["id"], "B", F2["id"], "delivery").status_code == 200)
    kout = requests.get(f"{API}/keys/out", headers=OM).json()
    check("/keys/out elenca A(S1) B(S1) A(S2) B(S2) C(S2)",
          {(k["structure_id"], k["copy"]) for k in kout if k["structure_id"] in (s1["id"], s2["id"])} == {(s1["id"], "A"), (s1["id"], "B"), (s2["id"], "A"), (s2["id"], "B"), (s2["id"], "C")})

    # ================= RICONSEGNA =================
    n_mov_before = mdb.key_movements.count_documents({"structure_id": {"$in": [s1["id"], s2["id"]]}})
    check("Riconsegna: altro Cleaner = 403", riconsegna(C2, s1["id"], "A").status_code == 403)
    check("Riconsegna: altro Rider = 403", riconsegna(R2, s1["id"], "B").status_code == 403)
    check("Riconsegna: Cleaner+Rider non detentore = 403", riconsegna(CR, s1["id"], "A").status_code == 403)
    check("Riconsegna: detentore corretto (cleaner1, A) = 200", riconsegna(C1, s1["id"], "A").status_code == 200)
    check("Riconsegna: detentore corretto (rider1, B) = 200", riconsegna(R1, s1["id"], "B").status_code == 200)
    check("Riconsegna: stato chiave aggiornato (present, holder null)",
          boxes(s1["id"])["A"].get("present") is True and not boxes(s1["id"])["A"].get("holder_user_id") and boxes(s1["id"])["B"].get("present") is True)
    check("Riconsegna: copia già in sede (Admin) = 400", riconsegna(A, s1["id"], "A").status_code == 400)
    check("Riconsegna: copia già in sede (Cleaner non detentore) = 403", riconsegna(C1, s1["id"], "A").status_code == 403)
    n_mov_after = mdb.key_movements.count_documents({"structure_id": {"$in": [s1["id"], s2["id"]]}})
    ric_mv = mdb.key_movements.find_one({"structure_id": s1["id"], "copy": "A", "action": "riconsegna"}, {"_id": 0})
    check("Riconsegna: movimenti append-only (+2, nessuna cancellazione) con detentore precedente/attività/timestamp",
          n_mov_after == n_mov_before + 2 and bool(ric_mv) and ric_mv.get("holder_user_id") == cleaner1["id"]
          and ric_mv.get("linked_task_id") == t1["id"] and ric_mv.get("at"), str(ric_mv)[:200])
    check("Riconsegna: il movimento di ritiro originale è ancora presente", mdb.key_movements.count_documents({"id": mv["id"]}) == 1 if mv else False)
    hist = requests.get(f"{API}/keys/movements", headers=A, params={"structure_id": s1["id"]})
    check("Storico chiavi struttura leggibile (append-only)", hist.status_code == 200 and len(hist.json()) >= 4, str(hist.status_code))
    # riconsegne finali per pulizia stato
    riconsegna(CR, s2["id"], "A"); riconsegna(A, s2["id"], "B"); riconsegna(A, s2["id"], "C")

    # ================= ORDINI — timeline Cliente canonica =================
    orders_before = mdb.orders.count_documents({})
    requests.put(f"{API}/clients/{cl['id']}/ordini-settings", headers=A, json={"ordering_enabled": True, "orders_categories": ["forniture"]})
    pa = requests.post(f"{API}/clients/{cl['id']}/create-account", headers=A, json={"email": "testfix.keyfix@example.com", "password": TEST_FIXTURE_PASSWORD, "name": "TESTFIX KeyFix Portal"})
    assert pa.status_code == 200, pa.text
    cleanup["users"] += [u["id"] for u in mdb.users.find({"client_id": cl["id"], "role": "client"}, {"id": 1})]
    PA = login("testfix.keyfix@example.com", TEST_FIXTURE_PASSWORD)
    ro = requests.post(f"{API}/portal/ordini", headers=PA, json={"structure_id": s1["id"], "items": [{"domain": "forniture", "product_id": prod["id"], "qty": 2}], "date_preferred": "2027-08-10"})
    check("Ordine Portale creato = 200", ro.status_code == 200, ro.text[:100])
    order = ro.json()
    cleanup["client_orders"].append(order["id"]); cleanup["fabbisogni"] += order.get("richiesta_ids", [])
    check("Ordine compare nel Portale", any(o["id"] == order["id"] for o in requests.get(f"{API}/portal/ordini", headers=PA).json()))
    defin = requests.get(f"{API}/consegne/richieste", headers=A, params={"status": "aperta"})
    check("Ordine compare nelle Consegne (richiesta da confermare)", defin.status_code == 200 and any(r["id"] in order["richiesta_ids"] for r in defin.json()), str(defin.status_code))
    act = requests.get(f"{API}/clients/{cl['id']}/activity", headers=A)
    check("GET /clients/{id}/activity = 200", act.status_code == 200, act.text[:100])
    acts = act.json() if act.status_code == 200 else []
    check("Timeline Cliente contiene l'ordine canonico (type=order, status in_revisione)",
          any(a["type"] == "order" and a["id"] == order["id"] and a["status"] == "in_revisione" and order["order_number"] in a["detail"] for a in acts))
    check("Timeline Cliente contiene Pulizie e Consegne", any(a["type"] == "cleaning" and a["id"] == t1["id"] for a in acts) and any(a["type"] == "logistics" and a["id"] == F1["id"] for a in acts))
    check("Timeline: campi id/type/label/date/status/link", all(k in acts[0] for k in ("id", "type", "label", "date", "status", "link")) if acts else False)
    check("Timeline Cliente: OM = 200, Cleaner = 403, Cliente portale = 403",
          requests.get(f"{API}/clients/{cl['id']}/activity", headers=OM).status_code == 200
          and requests.get(f"{API}/clients/{cl['id']}/activity", headers=C1).status_code == 403
          and requests.get(f"{API}/clients/{cl['id']}/activity", headers=PA).status_code == 403)
    check("Nessuna scrittura db.orders legacy", mdb.orders.count_documents({}) == orders_before)
    src_fe = open("/app/frontend/src/pages/ClientDetailPage.js").read() + open("/app/frontend/src/lib/api.js").read()
    check("Frontend moderno non legge più /operations/orders", "getOrders: (params = {}) => api.get('/operations/orders'" not in src_fe and "/operations/orders" not in open("/app/frontend/src/pages/ClientDetailPage.js").read())

    # ================= AUTH — utente disattivato =================
    check("Utente attivo con sessione valida = 200", requests.get(f"{API}/auth/me", headers=IN).status_code == 200)
    mdb.users.update_one({"id": inactive["id"]}, {"$set": {"is_active": False}})  # simula sessione NON revocata
    r_in = requests.get(f"{API}/auth/me", headers=IN)
    check("Sessione valida + is_active=false = 401 (defense in depth)", r_in.status_code == 401 and "disattivato" in r_in.text, f"{r_in.status_code} {r_in.text[:60]}")
    check("Sessione valida + is_active=false su /files = 401", requests.get(f"{API}/files/kilolava/magazzino/products/x.jpg", headers=IN).status_code == 401)
    check("Login utente disattivato = 403 (flusso login invariato)",
          requests.post(f"{API}/auth/login", json={"username": inactive["login_username"], "password": TEST_FIXTURE_PASSWORD}).status_code == 403)

    # ================= PERMESSI — matrice unica =================
    src = open("/app/backend/server.py").read()
    body = re.search(r"def has_permission\(user: dict, permission: str\) -> bool:\n(.*?)\n\n", src, re.S).group(1)
    check("has_permission delega a effective_permissions (nessuna matrice divergente)", "effective_permissions(user)" in body and "ROLE_PERMISSIONS.get" not in body)
    check("extra_roles: Cleaner+Rider vede fermate e pulizie",
          requests.get(f"{API}/consegne/mie-fermate", headers=CR).status_code == 200 and requests.get(f"{API}/cleaning-tasks/my-tasks", headers=CR).status_code == 200)
    me = requests.get(f"{API}/auth/me", headers=CR).json()
    check("/auth/me permissions = unione ruoli (tasks.own + logistics.own + keys.own)",
          all(p in me.get("permissions", []) for p in ("tasks.own.read", "logistics.own.read", "keys.own.write")))
finally:
    mdb.cleaning_tasks.delete_many({"id": {"$in": cleanup["tasks"]}})
    mdb.cleaning_tasks.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.fabbisogni.delete_many({"id": {"$in": cleanup["fabbisogni"]}})
    mdb.fabbisogni.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.logistics_tasks.delete_many({"id": {"$in": cleanup["fermate"]}})
    mdb.logistics_tasks.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.client_orders.delete_many({"client_id": {"$in": cleanup["clients"]}})
    mdb.warehouse_movements.delete_many({"delivery_id": {"$in": cleanup["fermate"]}})
    mdb.stock_levels.delete_many({"id": {"$nin": list(pre_stock)}})
    mdb.key_movements.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.structure_media.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.events.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.units.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.zaini.delete_many({"rider_id": {"$in": cleanup["users"]}}) if "zaini" in mdb.list_collection_names() else None
    for uid in cleanup["users"]:
        mdb.user_sessions.delete_many({"user_id": uid})
        mdb.user_devices.delete_many({"user_id": uid})
        mdb.users.delete_one({"id": uid})
    mdb.structures.delete_many({"id": {"$in": cleanup["structures"]}})
    mdb.clients.delete_many({"id": {"$in": cleanup["clients"]}})
    mdb.notifications.delete_many({"id": {"$nin": list(pre_notif)}})
    after = {c: mdb[c].count_documents({}) for c in COLLS}
    diff = {c: (baseline[c], after[c]) for c in COLLS if baseline[c] != after[c]}
    after_usr = sorted(u["usr_code"] for u in mdb.users.find({}, {"usr_code": 1}))
    tfx = sum(mdb[c].count_documents({"$or": [{"name": {"$regex": "TESTFIX|TESTGATE"}}, {"first_name": {"$regex": "TESTFIX|TESTGATE"}},
                                              {"private_info.name": {"$regex": "TESTFIX|TESTGATE"}}, {"structure_name": {"$regex": "TESTFIX|TESTGATE"}}]})
              for c in ("users", "clients", "structures", "cleaning_tasks", "logistics_tasks", "client_orders", "notifications"))
    regress = [k for k, v in pre_counters.items() if next((c.get("seq", 0) for c in mdb.counters.find({"_id": k})), 0) < v]
    print(f"\nINTEGRITÀ — differenze conteggi: {diff or 'nessuna'} — USR invariati: {after_usr == baseline_usr} — residui TESTFIX/TESTGATE: {tfx} — contatori regrediti: {regress or 'nessuno'}")
    print(f"INTEGRITÀ — NOL={after['rental_catalog']} FOR={after['supply_catalog']} PUL={after['cleaning_catalog']} KIT={after['kits']}")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
