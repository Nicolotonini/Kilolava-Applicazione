from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE C–I — Hardening fasi 5,6,8,10,11,14,17,18 (backend).
C: genera-fabbisogni solo con rental_laundry + warning 'Configurazione Noleggio incompleta' (mai kit inventati)
D: ordini legacy read-only (410) + /portal/ordini canonico (fabbisogni, no db.orders)
E: chiavi — link attività, /keys/out, warning chiave non riconsegnata al completamento pulizia
F: consegna parziale — richiesta parzialmente_evasa + richiesta residuale, movimenti solo su quantità reali
G: multipli account portale per cliente + ClientContact completo
H: safe delete Cleaning Task (hard delete solo senza storico)
I: media senza ?auth= in query + require_permission su /keys/out
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

cleanup = {"users": [], "clients": [], "structures": [], "tasks": [], "fabbisogni": [], "fermate": [], "client_orders": []}
orders_before = mdb.orders.count_documents({})
pre_stock_ids = set(x.get("id") for x in mdb.stock_levels.find({}, {"_id": 0, "id": 1}))

try:
    cl = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private",
        "private_info": {"name": "TESTFIX_CI", "surname": "Cliente"},
        "contacts": [{"name": "TESTFIX Referente", "role": "Amministrazione", "phone": "+39 333 1234567",
                      "email": "testfix.ref@example.com", "notes": "nota referente"}]}).json()
    cleanup["clients"].append(cl["id"])
    # Hardening finale: NESSUN fallback (no Living/stagione impliciti) → configurazione Noleggio esplicita del Cliente
    requests.put(f"{API}/clients/{cl['id']}/noleggio-config", headers=A, json={"linea": "living", "stagione": "estivo"})

    s_rl = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cl["id"], "name": "TESTFIX_CI Noleggio OK", "structure_type": "apartment",
        "services": ["cleaning", "rental_laundry"]}).json()
    s_nr = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cl["id"], "name": "TESTFIX_CI Senza Noleggio", "structure_type": "apartment",
        "services": ["cleaning"]}).json()
    s_bad = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cl["id"], "name": "TESTFIX_CI Config Incompleta", "structure_type": "apartment",
        "services": ["cleaning", "rental_laundry"], "linea": "testfixlinea"}).json()
    s_keys = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cl["id"], "name": "TESTFIX_CI Chiavi", "structure_type": "apartment",
        "services": ["cleaning"],
        "access_info": {"kilolava_has_keys": True,
                        "key_boxes": {"A": {"enabled": True, "exists": True, "present": True}}}}).json()
    for s in (s_rl, s_nr, s_bad, s_keys):
        cleanup["structures"].append(s["id"])

    cu = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TESTFIX_CI_cleaner", "last_name": "GateCI", "role": "cleaner",
        "password": TEST_FIXTURE_PASSWORD}).json()
    cleanup["users"].append(cu["id"])
    c_login = requests.post(f"{API}/auth/login", json={
        "username": cu["login_username"] or cu["email"], "password": TEST_FIXTURE_PASSWORD}).json()
    C = {"Authorization": f"Bearer {c_login['access_token']}"}

    # ================= GATE C — genera-fabbisogni =================
    DATE_C = "2026-12-27"
    for sid in (s_rl["id"], s_nr["id"], s_bad["id"]):
        t = requests.post(f"{API}/cleaning-tasks", headers=A, json={
            "structure_id": sid, "date": DATE_C, "beds_double": 1, "guests_count": 2})
        assert t.status_code == 200, t.text
        cleanup["tasks"].append(t.json()["id"])
    g = requests.post(f"{API}/consegne/genera-fabbisogni", headers=A, json={"date": DATE_C}).json()
    check("C: genera-fabbisogni risponde con nuovi contatori",
          "senza_servizio_noleggio" in g and "configurazione_incompleta" in g, str(g))
    check("C: struttura senza rental_laundry saltata", g.get("senza_servizio_noleggio", 0) >= 1, str(g))
    check("C: config incompleta rilevata (mai kit inventati)", g.get("configurazione_incompleta", 0) >= 1, str(g))
    fab_rl = list(mdb.fabbisogni.find({"structure_id": s_rl["id"], "status": "aperta"}, {"_id": 0}))
    fab_nr = list(mdb.fabbisogni.find({"structure_id": s_nr["id"]}, {"_id": 0}))
    fab_bad = list(mdb.fabbisogni.find({"structure_id": s_bad["id"]}, {"_id": 0}))
    cleanup["fabbisogni"] += [f["id"] for f in fab_rl]
    check("C: fabbisogno creato SOLO per struttura con noleggio attivo",
          len(fab_rl) == 1 and len(fab_nr) == 0 and len(fab_bad) == 0, f"rl={len(fab_rl)} nr={len(fab_nr)} bad={len(fab_bad)}")
    check("C: fabbisogno usa Kit reali (kits_used snapshot)", bool(fab_rl and fab_rl[0].get("kits_used")))
    warn = mdb.notifications.find_one({"title": "Configurazione Noleggio incompleta", "entity_id": s_bad["id"]})
    check("C: warning OPS 'Configurazione Noleggio incompleta'", bool(warn))

    # ================= GATE D — ordini legacy read-only + /portal/ordini =================
    pa = requests.post(f"{API}/clients/{cl['id']}/create-account", headers=A, json={
        "email": "testfix.ci.portal1@example.com", "password": TEST_FIXTURE_PASSWORD, "name": "TESTFIX_CI P1"})
    check("D: account portale 1 creato", pa.status_code == 200, pa.text[:100])
    p_login = requests.post(f"{API}/auth/login", json={
        "username": "testfix.ci.portal1@example.com", "password": TEST_FIXTURE_PASSWORD}).json()
    P = {"Authorization": f"Bearer {p_login['access_token']}"}
    rc = requests.post(f"{API}/portal/orders", headers=P, json={"client_id": cl["id"], "structure_id": s_rl["id"],
                                                                "items": [], "delivery_date": "2026-12-28",
                                                                "delivery_slot": "morning"})
    check("D: POST /portal/orders legacy = 410", rc.status_code == 410, f"got {rc.status_code}")
    rc = requests.put(f"{API}/portal/orders/xyz/cancel", headers=P)
    check("D: PUT /portal/orders/../cancel legacy = 410", rc.status_code == 410, f"got {rc.status_code}")
    rc = requests.put(f"{API}/operations/orders/xyz/status", headers=A, json={"status": "confirmed"})
    check("D: PUT /operations/orders/../status legacy = 410", rc.status_code == 410, f"got {rc.status_code}")
    requests.put(f"{API}/clients/{cl['id']}/ordini-settings", headers=A,
                 json={"ordering_enabled": True, "orders_categories": ["forniture"]})
    prod = mdb.supply_catalog.find_one({}, {"_id": 0, "id": 1, "name": 1})
    ro = requests.post(f"{API}/portal/ordini", headers=P, json={
        "structure_id": s_rl["id"], "items": [{"domain": "forniture", "product_id": prod["id"], "qty": 2}],
        "date_preferred": "2026-12-29", "note": "TESTFIX ordine"})
    check("D: POST /portal/ordini (canonico) = 200", ro.status_code == 200, ro.text[:120])
    order = ro.json() if ro.status_code == 200 else {}
    if order.get("id"):
        cleanup["client_orders"].append(order["id"])
        cleanup["fabbisogni"] += order.get("richiesta_ids", [])
    lst = requests.get(f"{API}/portal/ordini", headers=P).json()
    check("D: GET /portal/ordini contiene l'ordine", any(o.get("id") == order.get("id") for o in lst))
    rich = mdb.fabbisogni.find_one({"id": {"$in": order.get("richiesta_ids", [""])}}, {"_id": 0})
    check("D: ordine -> richiesta in Consegne stage 'da_confermare'", bool(rich) and rich.get("stage") == "da_confermare")
    check("D: nessuna nuova scrittura su db.orders legacy", mdb.orders.count_documents({}) == orders_before)

    # ================= GATE G — multipli account portale + contatti =================
    pa2 = requests.post(f"{API}/clients/{cl['id']}/create-account", headers=A, json={
        "email": "testfix.ci.portal2@example.com", "password": TEST_FIXTURE_PASSWORD, "name": "TESTFIX_CI P2"})
    check("G: secondo account portale consentito = 200", pa2.status_code == 200, pa2.text[:100])
    accounts = requests.get(f"{API}/clients/{cl['id']}/portal-accounts", headers=A).json()
    check("G: GET portal-accounts lista 2 account", len(accounts) == 2, str(len(accounts)))
    p2_login = requests.post(f"{API}/auth/login", json={
        "username": "testfix.ci.portal2@example.com", "password": TEST_FIXTURE_PASSWORD})
    check("G: login secondo account = 200", p2_login.status_code == 200)
    cl_full = requests.get(f"{API}/clients/{cl['id']}", headers=A).json()
    ct = (cl_full.get("contacts") or [{}])[0]
    check("G: ClientContact completo (name/role/phone/email/notes)",
          ct.get("name") == "TESTFIX Referente" and ct.get("role") == "Amministrazione"
          and ct.get("phone") and ct.get("email") and ct.get("notes"), str(ct))
    for u in mdb.users.find({"client_id": cl["id"], "role": "client"}, {"id": 1}):
        if u["id"] not in cleanup["users"]:
            cleanup["users"].append(u["id"])

    # ================= GATE E — chiavi collegate + warning al completamento =================
    tk = requests.post(f"{API}/cleaning-tasks", headers=A, json={
        "structure_id": s_keys["id"], "date": "2026-12-30", "guests_count": 2,
        "assigned_cleaner_ids": [cu["id"]]}).json()
    cleanup["tasks"].append(tk["id"])
    mdb.cleaning_tasks.update_one({"id": tk["id"]}, {"$set": {"checklist": None, "checklist_template_id": None}})
    rk = requests.post(f"{API}/keys/{s_keys['id']}/A/ritiro", headers=C,
                       json={"note": "TESTFIX ritiro", "linked_task_id": tk["id"], "linked_task_type": "cleaning"})
    check("E: cleaner ritiro chiave A = 200", rk.status_code == 200, rk.text[:120])
    mov = rk.json() if rk.status_code == 200 else {}
    check("E: movimento chiave collegato alla pulizia",
          mov.get("linked_task_id") == tk["id"] and mov.get("linked_task_type") == "cleaning")
    kout = requests.get(f"{API}/keys/out", headers=A).json()
    check("E: /keys/out mostra chiave fuori sede con detentore",
          any(k["structure_id"] == s_keys["id"] and k["copy"] == "A" and k.get("holder_name") for k in kout), str(kout)[:150])
    check("E: /keys/out vietato al cleaner = 403", requests.get(f"{API}/keys/out", headers=C).status_code == 403)
    for mt, fname, ctype in (("initial_video", "v.mp4", "video/mp4"),
                             ("warehouse_photo", "w.jpg", "image/jpeg"),
                             ("final_video", "f.mp4", "video/mp4")):
        rm = requests.post(f"{API}/cleaning-tasks/{tk['id']}/media?media_type={mt}", headers=C,
                           files={"file": (fname, b"\x00\x00testfix", ctype)})
        assert rm.status_code == 200, f"{mt}: {rm.text}"
    rcpl = requests.post(f"{API}/cleaning-tasks/{tk['id']}/complete", headers=C)
    check("E: completamento pulizia = 200", rcpl.status_code == 200, rcpl.text[:120])
    body = rcpl.json() if rcpl.status_code == 200 else {}
    check("E: warning chiave non riconsegnata nella risposta", "key_warning" in body, str(body.get("key_warning")))
    nkw = mdb.notifications.find_one({"title": "Chiave non riconsegnata", "entity_id": tk["id"]})
    check("E: notifica OPS 'Chiave non riconsegnata'", bool(nkw))
    rr = requests.post(f"{API}/keys/{s_keys['id']}/A/riconsegna", headers=C, json={"note": "TESTFIX riconsegna"})
    check("E: cleaner riconsegna la propria chiave = 200", rr.status_code == 200, rr.text[:100])
    kout2 = requests.get(f"{API}/keys/out", headers=A).json()
    check("E: /keys/out vuota dopo riconsegna", not any(k["structure_id"] == s_keys["id"] for k in kout2))

    # ================= GATE F — consegna parziale =================
    kit = mdb.kits.find_one({"domain": "noleggio", "active": True}, {"_id": 0, "id": 1, "name": 1})
    rr1 = requests.post(f"{API}/consegne/richieste", headers=A, json={
        "structure_id": s_rl["id"], "kits": [{"kit_id": kit["id"], "qty": 2}],
        "date_needed": "2026-12-30", "note": "TESTFIX parziale"})
    assert rr1.status_code == 200, rr1.text
    rich1 = rr1.json()
    cleanup["fabbisogni"].append(rich1["id"])
    fer = requests.post(f"{API}/consegne/fermate", headers=A, json={
        "richiesta_ids": [rich1["id"]], "date": "2026-12-30"})
    assert fer.status_code == 200, fer.text
    fermata = fer.json()
    cleanup["fermate"].append(fermata["id"])
    items1 = rich1["items"]
    first_pid = items1[0]["product_id"]
    planned_first = items1[0]["qty"]
    eff = [{"richiesta_id": rich1["id"], "product_id": first_pid, "qty": max(0, planned_first - 1)}]
    done = requests.post(f"{API}/consegne/fermate/{fermata['id']}/completa", headers=A,
                         json={"effective_items": eff, "note": "TESTFIX completa parziale"})
    check("F: completa fermata con quantità ridotta = 200", done.status_code == 200, done.text[:150])
    dres = done.json() if done.status_code == 200 else {}
    check("F: risposta segnala richieste residuali", dres.get("richieste_residuali", 0) == 1, str(dres))
    r1_after = mdb.fabbisogni.find_one({"id": rich1["id"]}, {"_id": 0})
    check("F: richiesta originaria -> parzialmente_evasa", r1_after.get("status") == "parzialmente_evasa", r1_after.get("status"))
    check("F: planned/delivered/residual salvati sulla richiesta",
          bool(r1_after.get("planned_items")) and bool(r1_after.get("delivered_items")) and bool(r1_after.get("residual_items")))
    residual = mdb.fabbisogni.find_one({"parent_richiesta_id": rich1["id"]}, {"_id": 0})
    check("F: creata richiesta residuale collegata", bool(residual), str((residual or {}).get("id")))
    if residual:
        cleanup["fabbisogni"].append(residual["id"])
        res_item = next((i for i in residual["items"] if i["product_id"] == first_pid), None)
        check("F: residuale contiene SOLO il mancante (1 pezzo)", res_item and res_item["qty"] == 1, str(res_item))
        check("F: residuale stage 'da_confermare' aperta",
              residual.get("stage") == "da_confermare" and residual.get("status") == "aperta")
    movs = list(mdb.warehouse_movements.find({"delivery_id": fermata["id"]}, {"_id": 0, "product_id": 1, "qty": 1}))
    mov_first = next((m for m in movs if m["product_id"] == first_pid), None)
    check("F: movimento fisico = quantità REALMENTE consegnata",
          mov_first and mov_first["qty"] == planned_first - 1, str(mov_first))

    # ================= GATE H — safe delete Cleaning Task =================
    th = requests.post(f"{API}/cleaning-tasks", headers=A, json={
        "structure_id": s_nr["id"], "date": "2026-12-31", "guests_count": 1}).json()
    check("H: DELETE pulizia senza storico = 200",
          requests.delete(f"{API}/cleaning-tasks/{th['id']}", headers=A).status_code == 200)
    th2 = requests.post(f"{API}/cleaning-tasks", headers=A, json={
        "structure_id": s_nr["id"], "date": "2026-12-31", "guests_count": 1}).json()
    cleanup["tasks"].append(th2["id"])
    mdb.cleaning_tasks.update_one({"id": th2["id"]}, {"$set": {"status": "in_progress", "started_at": "2026-12-31T08:00:00"}})
    rd = requests.delete(f"{API}/cleaning-tasks/{th2['id']}", headers=A)
    check("H: DELETE pulizia con storico = 400 'Usa Annulla'",
          rd.status_code == 400 and "Annulla" in rd.json().get("detail", ""), rd.text[:150])
    check("H: DELETE pulizia completata (con media) = 400",
          requests.delete(f"{API}/cleaning-tasks/{tk['id']}", headers=A).status_code == 400)

    # ================= GATE I — media senza ?auth + require_permission =================
    rc = requests.get(f"{API}/files/qualsiasi/path.jpg?auth={admin_tok}")
    check("I: GET /files con token in QUERY = 401 (rifiutato)", rc.status_code == 401, f"got {rc.status_code}")
    rc = requests.get(f"{API}/files/qualsiasi/path.jpg", headers=A)
    check("I: GET /files con header Authorization != 401", rc.status_code != 401, f"got {rc.status_code}")
    check("I: /keys/out con permesso keys.read (admin) = 200", requests.get(f"{API}/keys/out", headers=A).status_code == 200)
finally:
    for tid in cleanup["tasks"]:
        requests.delete(f"{API}/cleaning-tasks/{tid}", headers=A)
        mdb.cleaning_tasks.delete_one({"id": tid})
    mdb.fabbisogni.delete_many({"id": {"$in": cleanup["fabbisogni"]}})
    mdb.fabbisogni.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.client_orders.delete_many({"id": {"$in": cleanup["client_orders"]}})
    mdb.logistics_tasks.delete_many({"id": {"$in": cleanup["fermate"]}})
    mdb.warehouse_movements.delete_many({"delivery_id": {"$in": cleanup["fermate"]}})
    mdb.stock_levels.delete_many({"location_id": {"$in": cleanup["structures"]}})
    mdb.key_movements.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.stock_levels.delete_many({"id": {"$nin": list(pre_stock_ids)}})
    for uid in cleanup["users"]:
        requests.delete(f"{API}/users/{uid}", headers=A)
        mdb.users.delete_one({"id": uid})
    for sid in cleanup["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
        mdb.structures.delete_one({"id": sid})
    for cid in cleanup["clients"]:
        requests.delete(f"{API}/clients/{cid}", headers=A)
        mdb.clients.delete_one({"id": cid})
    mdb.notifications.delete_many({"user_id": {"$in": cleanup["users"]}})
    mdb.notifications.delete_many({"$or": [{"message": {"$regex": "TESTFIX"}}, {"title": {"$regex": "TESTFIX"}},
                                           {"entity_id": {"$in": cleanup["structures"] + cleanup["tasks"] + cleanup["fermate"] + cleanup["client_orders"]}}]})
    counts = {c: mdb[c].count_documents({}) for c in ("users", "clients", "structures", "cleaning_tasks",
                                                      "fabbisogni", "logistics_tasks", "warehouse_movements",
                                                      "client_orders", "orders", "key_movements", "stock_levels")}
    tfx = sum(mdb[c].count_documents({"$or": [{"name": {"$regex": "TESTFIX"}}, {"first_name": {"$regex": "TESTFIX"}},
                                              {"structure_name": {"$regex": "TESTFIX"}}]})
              for c in ("users", "structures", "cleaning_tasks", "fabbisogni", "logistics_tasks"))
    print(f"cleanup done — counts: {counts} — residui TESTFIX: {tfx}")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
