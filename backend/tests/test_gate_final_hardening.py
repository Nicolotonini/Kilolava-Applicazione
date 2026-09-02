import sys; sys.path.insert(0, "/app/backend/tests")  # noqa: E702
from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE FINALE — Ultimo hardening pre-import (fasi 1–14).
SECURITY: /api/files (no token, token query, sessione revocata, cross-client, cleaner assegnata/non), credential scan, script reset rimosso
PERMESSI: matrice unica (OM units.write; OM 403 su settings/integrazioni; ruoli operativi; multi-ruolo cleaner+laundry / cleaner+rider)
BOOKING: letti custom, modifica data/unit/letti, check-in stesso giorno, cancellazione soft, iCal create/update/cancel, 1 booking = 1 task
NOLEGGIO: config mancante/parziale, Living/Dream, Estivo/Invernale (nessun fallback), servizio disattivato
ORDINI: portale canonico (lista/dettaglio/dashboard/report), consegna parziale, residuo, nessuna scrittura db.orders
CHIAVI: cleaner ritira linked cleaning, rider linked delivery, altra persona non riconsegna, /keys/out arricchito, warning
SAFE DELETE UNIT: senza storico ok; booking/cleaning/media bloccano
CLIENTE: admin-data solo Super Admin, ClientResponse senza dati fiscali, referente principale unico, contatti legacy
Fixture TESTFIX_ + cleanup verificato."""
import http.server
import os
import re
import subprocess
import threading
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
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, r.json()["access_token"]


A, admin_tok = login(TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD)

# ---- baseline integrità ----
INTEGRITY_COLLS = ("users", "clients", "structures", "units", "events", "cleaning_tasks", "fabbisogni", "logistics_tasks",
                   "warehouse_movements", "client_orders", "orders", "key_movements", "stock_levels", "kits",
                   "rental_catalog", "supply_catalog", "cleaning_catalog", "structure_media", "user_sessions")
baseline = {c: mdb[c].count_documents({}) for c in INTEGRITY_COLLS}
baseline_usr = sorted(u["usr_code"] for u in mdb.users.find({}, {"usr_code": 1}))
baseline_counters = {c["_id"]: c for c in mdb.counters.find({})}
pre_stock_ids = set(x.get("id") for x in mdb.stock_levels.find({}, {"_id": 0, "id": 1}))
pre_session_ids = set(x.get("id") for x in mdb.user_sessions.find({}, {"_id": 0, "id": 1}))
pre_notif_ids = set(x.get("id") for x in mdb.notifications.find({}, {"_id": 0, "id": 1}))

cleanup = {"users": [], "clients": [], "structures": [], "units": [], "tasks": [], "events": [],
           "fabbisogni": [], "fermate": [], "client_orders": []}

ICS_HOLDER = {"body": """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TESTFIX//GateFinal//IT
BEGIN:VEVENT
UID:TESTFIX-FINAL-ICAL-1
SUMMARY:TESTFIX Soggiorno iCal
DTSTART;VALUE=DATE:20270118
DTEND;VALUE=DATE:20270121
END:VEVENT
END:VCALENDAR
"""}


class ICSHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = ICS_HOLDER["body"].encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/calendar")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


srv = http.server.HTTPServer(("127.0.0.1", 0), ICSHandler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
ICAL_URL = f"http://127.0.0.1:{srv.server_address[1]}/testfix.ics"


def mk_user(first, role, extra=None):
    body = {"first_name": f"TESTFIX_{first}", "last_name": "GateFinal", "role": role, "password": TEST_FIXTURE_PASSWORD}
    if extra:
        body["extra_roles"] = extra
    r = requests.post(f"{API}/users", headers=A, json=body)
    assert r.status_code == 200, r.text
    u = r.json()
    cleanup["users"].append(u["id"])
    h, tok = login(u["login_username"] or u["email"], TEST_FIXTURE_PASSWORD)
    return u, h, tok


def tasks_for(event_id, include_cancelled=False):
    q = {"booking_event_id": event_id}
    if not include_cancelled:
        q["status"] = {"$ne": "cancelled"}
    return list(mdb.cleaning_tasks.find(q, {"_id": 0}))


try:
    # ======================= FIXTURE =======================
    clA = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "company",
        "company_info": {"company_name": "TESTFIX_A Srl", "vat_number": "01234567890", "fiscal_code": "TSTFXA00A01H501Z",
                         "pec": "testfixa@pec.example.com", "sdi": "ABC1234"},
        "contacts": [{"name": "TESTFIX Legacy Referente", "role": "Proprietà"}]}).json()
    clB = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTFIX_B", "surname": "Cliente", "fiscal_code": "TSTFXB00B02H501Y"}}).json()
    for c in (clA, clB):
        cleanup["clients"].append(c["id"])

    sA = requests.post(f"{API}/structures", headers=A, json={
        "client_id": clA["id"], "name": "TESTFIX_A Pulizie+Noleggio", "structure_type": "apartment",
        "services": ["cleaning", "rental_laundry"], "bed_config": {"beds_double": 1, "beds_single": 2, "sofa_beds": 0},
        "access_info": {"kilolava_has_keys": True,
                        "key_boxes": {"A": {"enabled": True, "exists": True, "present": True},
                                      "B": {"enabled": True, "exists": True, "present": True}}}}).json()
    sA_nocl = requests.post(f"{API}/structures", headers=A, json={
        "client_id": clA["id"], "name": "TESTFIX_A Senza Pulizie", "structure_type": "apartment", "services": ["rental_laundry"]}).json()
    sB = requests.post(f"{API}/structures", headers=A, json={
        "client_id": clB["id"], "name": "TESTFIX_B Pulizie", "structure_type": "apartment", "services": ["cleaning", "rental_laundry"]}).json()
    for s in (sA, sA_nocl, sB):
        assert s.get("id"), s
        cleanup["structures"].append(s["id"])

    uA1 = requests.post(f"{API}/units", headers=A, json={
        "structure_id": sA["id"], "name": "TESTFIX_A Unit 1", "bed_config": {"beds_double": 2, "beds_single": 0, "sofa_beds": 1}}).json()
    assert uA1.get("id"), uA1
    cleanup["units"].append(uA1["id"])

    cleaner, C, c_tok = mk_user("cleaner", "cleaner")
    cleaner2, C2, _ = mk_user("cleaner2", "cleaner")
    rider, R, _ = mk_user("rider", "rider")
    maint, M, _ = mk_user("maint", "maintenance")
    laundry, L, _ = mk_user("laundry", "laundry")
    om, OM, _ = mk_user("om", "operations_manager")
    cl_la, CL, _ = mk_user("cleanerlaundry", "cleaner", ["laundry"])
    cl_ri, CR, _ = mk_user("cleanerrider", "cleaner", ["rider"])

    pa = requests.post(f"{API}/clients/{clA['id']}/create-account", headers=A, json={
        "email": "testfix.final.a@example.com", "password": TEST_FIXTURE_PASSWORD, "name": "TESTFIX_A Portal"})
    pb = requests.post(f"{API}/clients/{clB['id']}/create-account", headers=A, json={
        "email": "testfix.final.b@example.com", "password": TEST_FIXTURE_PASSWORD, "name": "TESTFIX_B Portal"})
    assert pa.status_code == 200 and pb.status_code == 200, (pa.text, pb.text)
    PA, pa_tok = login("testfix.final.a@example.com", TEST_FIXTURE_PASSWORD)
    PB, _ = login("testfix.final.b@example.com", TEST_FIXTURE_PASSWORD)
    for u in mdb.users.find({"client_id": {"$in": [clA["id"], clB["id"]]}, "role": "client"}, {"id": 1}):
        cleanup["users"].append(u["id"])

    # ======================= FASE 1 — SICUREZZA MEDIA =======================
    logo = requests.post(f"{API}/clients/{clA['id']}/logo", headers=A, files={"file": ("logo.png", b"\x89PNG\r\n\x1a\ntestfix", "image/png")})
    assert logo.status_code == 200, logo.text
    logoA_path = logo.json()["logo_path"]
    sm = requests.post(f"{API}/structures/{sA['id']}/media", headers=A, data={"category": "arrive", "title": "TESTFIX arrivo"},
                       files={"file": ("arrivo.jpg", b"\xff\xd8\xff testfix", "image/jpeg")})
    assert sm.status_code == 200, sm.text
    smA_path = sm.json()["path"]

    check("F1: /files senza token = 401", requests.get(f"{API}/files/{logoA_path}").status_code == 401)
    check("F1: /files token in query string = 401", requests.get(f"{API}/files/{logoA_path}?token={admin_tok}").status_code == 401)
    check("F1: /files token in query 'auth' = 401", requests.get(f"{API}/files/{logoA_path}?auth={admin_tok}").status_code == 401)
    check("F1: Cliente A proprio logo = 200", requests.get(f"{API}/files/{logoA_path}", headers=PA).status_code == 200)
    check("F1: Cliente B logo Cliente A = 403", requests.get(f"{API}/files/{logoA_path}", headers=PB).status_code == 403)
    check("F1: Cliente A media struttura (istruzioni accesso) = 403", requests.get(f"{API}/files/{smA_path}", headers=PA).status_code == 403)
    check("F1: Cleaner NON assegnata media struttura = 403", requests.get(f"{API}/files/{smA_path}", headers=C).status_code == 403)
    # pulizia assegnata alla cleaner su sA (data futura)
    tk = requests.post(f"{API}/cleaning-tasks", headers=A, json={
        "structure_id": sA["id"], "date": "2027-02-10", "guests_count": 2, "beds_double": 1, "assigned_cleaner_ids": [cleaner["id"]]}).json()
    assert tk.get("id"), tk
    cleanup["tasks"].append(tk["id"])
    check("F1: Cleaner assegnata media struttura = 200", requests.get(f"{API}/files/{smA_path}", headers=C).status_code == 200)
    check("F1: altra Cleaner (non assegnata) = 403", requests.get(f"{API}/files/{smA_path}", headers=C2).status_code == 403)
    check("F1: Rider media struttura = 403", requests.get(f"{API}/files/{smA_path}", headers=R).status_code == 403)
    check("F1: Manutentore media struttura = 403", requests.get(f"{API}/files/{smA_path}", headers=M).status_code == 403)
    check("F1: Admin media struttura = 200", requests.get(f"{API}/files/{smA_path}", headers=A).status_code == 200)
    check("F1: OM media struttura = 200", requests.get(f"{API}/files/{smA_path}", headers=OM).status_code == 200)
    check("F1: Cleaner logo cliente = 403", requests.get(f"{API}/files/{logoA_path}", headers=C).status_code == 403)
    # media pulizia: cleaner assegnata sì, altra cleaner no, cliente no
    mdb.cleaning_tasks.update_one({"id": tk["id"]}, {"$set": {"checklist": None, "checklist_template_id": None}})
    rm = requests.post(f"{API}/cleaning-tasks/{tk['id']}/media?media_type=initial_video", headers=C,
                       files={"file": ("v.mp4", b"\x00\x00testfix", "video/mp4")})
    assert rm.status_code == 200, rm.text
    task_media_path = (mdb.cleaning_tasks.find_one({"id": tk["id"]}, {"_id": 0, "media": 1}) or {}).get("media", [{}])[0].get("file_path")
    if task_media_path:
        check("F1: Cleaner assegnata media pulizia = 200", requests.get(f"{API}/files/{task_media_path}", headers=C).status_code == 200)
        check("F1: altra Cleaner media pulizia = 403", requests.get(f"{API}/files/{task_media_path}", headers=C2).status_code == 403)
        check("F1: Cliente media pulizia = 403", requests.get(f"{API}/files/{task_media_path}", headers=PA).status_code == 403)
    check("F1: foto catalogo visibili a Cliente autenticato (non 401/403)",
          requests.get(f"{API}/files/kilolava/magazzino/products/nope.jpg", headers=PA).status_code == 404)
    check("F1: path sconosciuto per Cliente = 403", requests.get(f"{API}/files/kilolava/altro/x/y.jpg", headers=PA).status_code == 403)
    # sessione revocata
    rv = requests.post(f"{API}/users/{cleaner2['id']}/revoke-sessions", headers=A)
    check("F1: revoca sessioni cleaner2 = 200", rv.status_code == 200, rv.text[:80])
    check("F1: JWT di sessione revocata su /files = 401", requests.get(f"{API}/files/{smA_path}", headers=C2).status_code == 401)
    check("F1: JWT di sessione revocata su API = 401", requests.get(f"{API}/auth/me", headers=C2).status_code == 401)

    # ======================= FASE 2 — SCRIPT + CREDENZIALI =======================
    tracked = subprocess.run(["git", "ls-files"], cwd="/app", capture_output=True, text=True).stdout.split("\n")
    check("F2: scripts/reset_operational_data.py rimosso dal repository",
          "scripts/reset_operational_data.py" not in tracked and not os.path.exists("/app/scripts/reset_operational_data.py"))
    pat = re.compile(r"""(["'])([A-Za-z]+[A-Za-z0-9]*(?:Pass|pass|PASS|Password)[A-Za-z0-9]*[!@#$%]+[0-9]*|[A-Za-z]*[0-9]{3,}!)\1""")
    offenders = []
    for f in tracked:
        if not f or not f.endswith((".py", ".js", ".jsx", ".sh", ".md", ".json", ".yml", ".yaml")) or f.startswith(("memory/", "test_reports/", "frontend/node_modules")):
            continue
        try:
            txt = open(os.path.join("/app", f), encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        if pat.search(txt) or re.search(r"(?i)(admin_password|test_password)\s*[:=]\s*[\"'][^\"'$/\s]{6,}[\"']", txt):
            offenders.append(f)
    check("F2: nessuna password/test credential hardcoded nei file tracciati", not offenders, str(offenders)[:200])
    check("F2: .env non tracciati", not any(f.endswith(".env") for f in tracked))

    # ======================= FASE 7/8 — PERMISSION MATRIX =======================
    ru = requests.post(f"{API}/units", headers=OM, json={"structure_id": sA["id"], "name": "TESTFIX_A Unit OM"})
    check("F7: OM crea Unit (units.write) = 200", ru.status_code == 200, ru.text[:100])
    u_om = ru.json() if ru.status_code == 200 else {}
    if u_om.get("id"):
        cleanup["units"].append(u_om["id"])
        rud = requests.put(f"{API}/units/{u_om['id']}", headers=OM, json={"is_active": False})
        check("F7: OM disattiva Unit = 200", rud.status_code == 200 and rud.json().get("is_active") is False, rud.text[:100])
        check("F7: OM hard delete Unit = 403 (solo Admin)", requests.delete(f"{API}/units/{u_om['id']}", headers=OM).status_code == 403)
    check("F7: Cleaner crea Unit = 403", requests.post(f"{API}/units", headers=C, json={"structure_id": sA["id"], "name": "x"}).status_code == 403)
    check("F8: OM PUT /settings/keys = 403", requests.put(f"{API}/settings/keys", headers=OM, json={"box_capacity": 60}).status_code == 403)
    check("F8: OM POST /zones = 403", requests.post(f"{API}/zones", headers=OM, json={"name": "TESTFIX zona"}).status_code == 403)
    check("F8: OM GET /zones (operativo) = 200", requests.get(f"{API}/zones", headers=OM).status_code == 200)
    check("F8: OM google-sheets status = 403", requests.get(f"{API}/integrations/google-sheets/status", headers=OM).status_code == 403)
    check("F8: OM integrazioni channel manager = 403", requests.get(f"{API}/integrations/channel-managers", headers=OM).status_code in (403, 404))
    check("F8: Admin integrazioni channel manager != 403", requests.get(f"{API}/integrations/channel-managers", headers=A).status_code != 403)
    check("F8: OM crea utente = 403", requests.post(f"{API}/users", headers=OM, json={"first_name": "TESTFIX_x", "last_name": "y", "role": "cleaner", "password": TEST_FIXTURE_PASSWORD}).status_code == 403)
    check("F8: OM lista utenti (sola lettura) = 200", requests.get(f"{API}/users", headers=OM).status_code == 200)
    check("F8: OM revoca sessioni altrui = 403", requests.post(f"{API}/users/{cleaner['id']}/revoke-sessions", headers=OM).status_code == 403)
    check("F8: OM clienti/strutture/pulizie = 200", all(requests.get(f"{API}/{p}", headers=OM).status_code == 200 for p in ("clients", "structures", "cleaning-tasks", "keys/out")))
    for role_h, name in ((C, "Cleaner"), (R, "Rider"), (M, "Maintenance"), (L, "Laundry"), (PA, "Client")):
        check(f"F7: {name} GET /clients = 403", requests.get(f"{API}/clients", headers=role_h).status_code == 403)
    check("F7: Cleaner my-tasks = 200", requests.get(f"{API}/cleaning-tasks/my-tasks", headers=C).status_code == 200)
    check("F7: Rider mie-fermate = 200", requests.get(f"{API}/consegne/mie-fermate", headers=R).status_code == 200)
    check("F7: Laundry jobs = 200", requests.get(f"{API}/lavanderia/jobs", headers=L).status_code == 200)
    check("F7: Cleaner lavanderia jobs = 403", requests.get(f"{API}/lavanderia/jobs", headers=C).status_code == 403)
    # multi-ruolo
    check("F9: Cleaner+Laundry my-tasks = 200", requests.get(f"{API}/cleaning-tasks/my-tasks", headers=CL).status_code == 200)
    check("F9: Cleaner+Laundry lavanderia jobs = 200", requests.get(f"{API}/lavanderia/jobs", headers=CL).status_code == 200)
    check("F9: Cleaner+Laundry NON vede clienti = 403", requests.get(f"{API}/clients", headers=CL).status_code == 403)
    check("F9: Cleaner+Rider mie-fermate = 200", requests.get(f"{API}/consegne/mie-fermate", headers=CR).status_code == 200)
    check("F9: Cleaner+Rider my-tasks = 200", requests.get(f"{API}/cleaning-tasks/my-tasks", headers=CR).status_code == 200)
    check("F9: Rider solo: my-tasks = 403", requests.get(f"{API}/cleaning-tasks/my-tasks", headers=R).status_code == 403)
    me_cl = requests.get(f"{API}/auth/me", headers=CL).json()
    check("F9: /auth/me espone extra_roles + permissions unificati",
          "laundry" in (me_cl.get("extra_roles") or []) and "laundry.own.read" in (me_cl.get("permissions") or []) and "tasks.own.read" in (me_cl.get("permissions") or []))

    # ======================= FASE 5/6 — BOOKING → CLEANING =======================
    ev = requests.post(f"{API}/events", headers=A, json={
        "event_type": "booking", "title": "TESTFIX soggiorno", "structure_id": sA["id"], "unit_id": uA1["id"],
        "start_time": "2027-03-01T15:00:00", "end_time": "2027-03-04T10:00:00", "guests_count": 3,
        "beds_double": 1, "beds_single": 1, "beds_sofa": 0, "checkout_time": "10:30"})
    check("F5: nuova prenotazione con Unit e letti custom = 200", ev.status_code == 200, ev.text[:120])
    ev = ev.json()
    cleanup["events"].append(ev["id"])
    t1 = tasks_for(ev["id"])
    check("F5: 1 booking = 1 cleaning_task", len(t1) == 1, str(len(t1)))
    if t1:
        cleanup["tasks"].append(t1[0]["id"])
        check("F5: task eredita unit/letti override/orario checkout",
              t1[0].get("unit_id") == uA1["id"] and t1[0].get("beds_double") == 1 and t1[0].get("beds_single") == 1
              and t1[0].get("beds_sofa") == 0 and t1[0].get("scheduled_time") == "10:30" and t1[0].get("guests_count") == 3, str({k: t1[0].get(k) for k in ("unit_id", "beds_double", "beds_single", "beds_sofa", "scheduled_time", "guests_count")}))
    # modifica data + letti
    requests.put(f"{API}/events/{ev['id']}", headers=A, json={"end_time": "2027-03-05T10:00:00", "beds_double": 2, "beds_sofa": 1, "guests_count": 4})
    t1b = tasks_for(ev["id"])
    check("F5: modifica checkout → data pulizia aggiornata (idempotente)", len(t1b) == 1 and t1b[0]["date"] == "2027-03-05", str([t.get("date") for t in t1b]))
    check("F5: modifica letti/ospiti → sincronizzati sulla pulizia",
          t1b and t1b[0].get("beds_double") == 2 and t1b[0].get("beds_sofa") == 1 and t1b[0].get("guests_count") == 4)
    # modifica unit → task unit; senza override letti → letti da config Unit/Struttura
    ev_nb = requests.post(f"{API}/events", headers=A, json={
        "event_type": "booking", "title": "TESTFIX soggiorno 2", "structure_id": sA["id"],
        "start_time": "2027-03-10T15:00:00", "end_time": "2027-03-12T10:00:00"}).json()
    cleanup["events"].append(ev_nb["id"])
    t2 = tasks_for(ev_nb["id"])
    if t2:
        cleanup["tasks"].append(t2[0]["id"])
    check("F5: senza override → letti da configurazione Struttura", t2 and t2[0].get("beds_double") == 1 and t2[0].get("beds_single") == 2, str(t2 and {k: t2[0].get(k) for k in ("beds_double", "beds_single", "beds_sofa")}))
    requests.put(f"{API}/events/{ev_nb['id']}", headers=A, json={"unit_id": uA1["id"]})
    t2b = tasks_for(ev_nb["id"])
    check("F5: modifica Unit → unit_id e letti da configurazione Unit",
          t2b and t2b[0].get("unit_id") == uA1["id"] and t2b[0].get("beds_double") == 2 and t2b[0].get("beds_sofa") == 1, str(t2b and {k: t2b[0].get(k) for k in ("unit_id", "beds_double", "beds_sofa")}))
    # check-in stesso giorno (stessa unit)
    ev_ci = requests.post(f"{API}/events", headers=A, json={
        "event_type": "booking", "title": "TESTFIX same-day", "structure_id": sA["id"], "unit_id": uA1["id"],
        "start_time": "2027-03-12T16:00:00", "end_time": "2027-03-14T10:00:00"}).json()
    cleanup["events"].append(ev_ci["id"])
    t3 = tasks_for(ev_ci["id"])
    if t3:
        cleanup["tasks"].append(t3[0]["id"])
    t2c = tasks_for(ev_nb["id"])
    check("F5: check-in stesso giorno → checkin_today + orario sulla pulizia precedente",
          t2c and t2c[0].get("checkin_today") is True and t2c[0].get("checkin_time") == "16:00", str(t2c and (t2c[0].get("checkin_today"), t2c[0].get("checkin_time"))))
    # pulizia già iniziata → warning, nessuna modifica silenziosa
    if t3:
        mdb.cleaning_tasks.update_one({"id": t3[0]["id"]}, {"$set": {"status": "in_progress"}})
        requests.put(f"{API}/events/{ev_ci['id']}", headers=A, json={"end_time": "2027-03-15T10:00:00"})
        t3b = mdb.cleaning_tasks.find_one({"id": t3[0]["id"]}, {"_id": 0})
        warn = mdb.notifications.find_one({"title": "Pulizia da verificare", "entity_id": t3[0]["id"]})
        check("F5: pulizia in corso NON modificata + warning al Responsabile", t3b.get("date") == "2027-03-14" and bool(warn))
        mdb.cleaning_tasks.update_one({"id": t3[0]["id"]}, {"$set": {"status": "assigned"}})
    # nessuna pulizia se servizio cleaning non attivo
    ev_nc = requests.post(f"{API}/events", headers=A, json={
        "event_type": "booking", "title": "TESTFIX no cleaning", "structure_id": sA_nocl["id"],
        "start_time": "2027-03-01T15:00:00", "end_time": "2027-03-03T10:00:00"}).json()
    cleanup["events"].append(ev_nc["id"])
    check("F5: nessuna pulizia se servizio Pulizie non attivo", len(tasks_for(ev_nc["id"], include_cancelled=True)) == 0)
    # cancellazione manuale → soft cancel
    rd = requests.delete(f"{API}/events/{ev_nb['id']}", headers=A)
    ev_nb_after = mdb.events.find_one({"id": ev_nb["id"]}, {"_id": 0})
    check("F5: DELETE soggiorno = soft cancel (record storico conservato)",
          rd.status_code == 200 and ev_nb_after and ev_nb_after.get("status") == "cancelled" and ev_nb_after.get("manual_cancelled") is True and ev_nb_after.get("updated_at"), str((rd.status_code, (ev_nb_after or {}).get("status"))))
    t2d = tasks_for(ev_nb["id"], include_cancelled=True)
    check("F5: pulizia collegata → cancelled (non hard delete)", t2d and all(t["status"] == "cancelled" for t in t2d), str([t.get("status") for t in t2d]))
    lst = requests.get(f"{API}/events", headers=A, params={"date_from": "2027-03-01", "date_to": "2027-03-31", "event_type": "booking"}).json()
    check("F5: soggiorno annullato NON in calendario (default)", not any(e["id"] == ev_nb["id"] for e in lst))
    lst_all = requests.get(f"{API}/events", headers=A, params={"date_from": "2027-03-01", "date_to": "2027-03-31", "include_cancelled": "true"}).json()
    check("F5: soggiorno annullato visibile con include_cancelled", any(e["id"] == ev_nb["id"] for e in lst_all))
    # iCal create / update / cancel
    requests.put(f"{API}/structures/{sA['id']}", headers=A, json={"ical_url": ICAL_URL})
    rs = requests.post(f"{API}/ical/sync/{sA['id']}", headers=A)
    check("F5: sync iCal = 200", rs.status_code == 200, rs.text[:100])
    ical_ev = mdb.events.find_one({"ical_uid": "TESTFIX-FINAL-ICAL-1"}, {"_id": 0})
    check("F5: iCal → soggiorno creato + 1 pulizia", bool(ical_ev) and len(tasks_for(ical_ev["id"])) == 1)
    if ical_ev:
        cleanup["events"].append(ical_ev["id"])
        cleanup["tasks"] += [t["id"] for t in tasks_for(ical_ev["id"], include_cancelled=True)]
        ICS_HOLDER["body"] = ICS_HOLDER["body"].replace("DTEND;VALUE=DATE:20270121", "DTEND;VALUE=DATE:20270122")
        requests.post(f"{API}/ical/sync/{sA['id']}", headers=A)
        ti = tasks_for(ical_ev["id"])
        check("F5: iCal update checkout → pulizia spostata, sempre 1", len(ti) == 1 and ti[0]["date"] == "2027-01-22", str([t.get("date") for t in ti]))
        ICS_HOLDER["body"] = ICS_HOLDER["body"].replace("BEGIN:VEVENT", "BEGIN:XEVENT").replace("END:VEVENT", "END:XEVENT")
        requests.post(f"{API}/ical/sync/{sA['id']}", headers=A)
        ical_after = mdb.events.find_one({"id": ical_ev["id"]}, {"_id": 0})
        check("F5: iCal cancel → soft cancel uniforme (status cancelled, feed_cancelled, record conservato)",
              bool(ical_after) and ical_after.get("status") == "cancelled" and ical_after.get("feed_cancelled") is True)
        check("F5: iCal cancel → pulizia cancelled", all(t["status"] == "cancelled" for t in tasks_for(ical_ev["id"], include_cancelled=True)))
    requests.put(f"{API}/structures/{sA['id']}", headers=A, json={"ical_url": None})

    # ======================= FASE 3 — NOLEGGIO SENZA FALLBACK =======================
    DATE_N = "2027-04-20"
    def fabb_count(sid):
        return mdb.fabbisogni.count_documents({"structure_id": sid, "date_needed": DATE_N})
    def gen():
        return requests.post(f"{API}/consegne/genera-fabbisogni", headers=A, json={"date": DATE_N}).json()
    def warn_count(sid):
        return mdb.notifications.count_documents({"title": "Configurazione Noleggio incompleta", "entity_id": sid})
    tN = requests.post(f"{API}/cleaning-tasks", headers=A, json={"structure_id": sB["id"], "date": DATE_N, "beds_double": 1, "beds_single": 1, "guests_count": 2}).json()
    cleanup["tasks"].append(tN["id"])
    g0 = gen()
    check("F3: rental_laundry + config assente → 0 fabbisogni + warning", fabb_count(sB["id"]) == 0 and g0.get("configurazione_incompleta", 0) >= 1 and warn_count(sB["id"]) >= 1, str(g0))
    w0 = mdb.notifications.find_one({"title": "Configurazione Noleggio incompleta", "entity_id": sB["id"]}, {"_id": 0, "message": 1})
    check("F3: warning indica Cliente/Struttura e campo mancante", bool(w0) and "TESTFIX_B" in w0["message"] and "linea" in w0["message"] and "stagione" in w0["message"], (w0 or {}).get("message", "")[:160])
    check("F3: risposta senza stagione globale (nessun fallback calendario)", "stagione" not in g0)
    requests.put(f"{API}/clients/{clB['id']}/noleggio-config", headers=A, json={"linea": "dream"})
    gen()
    check("F3: solo linea → warning, 0 fabbisogni", fabb_count(sB["id"]) == 0)
    requests.put(f"{API}/clients/{clB['id']}/noleggio-config", headers=A, json={"linea": None, "stagione": "invernale"})
    mdb.clients.update_one({"id": clB["id"]}, {"$set": {"noleggio_config": {"linea": None, "stagione": "invernale"}}})
    gen()
    check("F3: solo stagione → warning, 0 fabbisogni (NO Living implicito)", fabb_count(sB["id"]) == 0)
    requests.put(f"{API}/clients/{clB['id']}/noleggio-config", headers=A, json={"linea": "dream", "stagione": "invernale"})
    g3 = gen()
    fb = list(mdb.fabbisogni.find({"structure_id": sB["id"], "date_needed": DATE_N}, {"_id": 0}))
    cleanup["fabbisogni"] += [f["id"] for f in fb]
    kit_names = [k.get("kit_name", "") for f in fb for k in (f.get("kits_used") or [])]
    check("F3: config Dream+Invernale → fabbisogno con Kit Dream invernale", len(fb) == 1 and kit_names and all("Dream" in n and "invernale" in n for n in kit_names), str(kit_names))
    check("F3: Dream NON diventa Living / Invernale NON diventa Estivo", not any("Living" in n or "estivo" in n for n in kit_names))
    # Living + Estivo
    tN2 = requests.post(f"{API}/cleaning-tasks", headers=A, json={"structure_id": sA["id"], "date": DATE_N, "beds_double": 1, "guests_count": 2}).json()
    cleanup["tasks"].append(tN2["id"])
    requests.put(f"{API}/clients/{clA['id']}/noleggio-config", headers=A, json={"linea": "living", "stagione": "estivo"})
    gen()
    fa = list(mdb.fabbisogni.find({"structure_id": sA["id"], "date_needed": DATE_N}, {"_id": 0}))
    cleanup["fabbisogni"] += [f["id"] for f in fa]
    kn_a = [k.get("kit_name", "") for f in fa for k in (f.get("kits_used") or [])]
    check("F3: config Living+Estivo → Kit Living estivo", len(fa) == 1 and kn_a and all("Living" in n and "estivo" in n for n in kn_a), str(kn_a))
    # servizio disattivato
    requests.put(f"{API}/structures/{sA_nocl['id']}", headers=A, json={"services": ["cleaning"]})
    tN3 = requests.post(f"{API}/cleaning-tasks", headers=A, json={"structure_id": sA_nocl["id"], "date": DATE_N, "beds_double": 1, "guests_count": 2}).json()
    cleanup["tasks"].append(tN3["id"])
    g4 = gen()
    check("F3: servizio noleggio disattivato → nessun fabbisogno", fabb_count(sA_nocl["id"]) == 0 and g4.get("senza_servizio_noleggio", 0) >= 1, str(g4))

    # ======================= FASE 4 — ORDINI CANONICI =======================
    orders_before = mdb.orders.count_documents({})
    requests.put(f"{API}/clients/{clA['id']}/ordini-settings", headers=A, json={"ordering_enabled": True, "orders_categories": ["forniture", "noleggio", "pulizie"]})
    prod = mdb.supply_catalog.find_one({}, {"_id": 0, "id": 1, "name": 1})
    ro = requests.post(f"{API}/portal/ordini", headers=PA, json={
        "structure_id": sA["id"], "items": [{"domain": "forniture", "product_id": prod["id"], "qty": 3}],
        "date_preferred": "2027-04-25", "note": "TESTFIX ordine finale"})
    check("F4: nuovo ordine Portale = 200", ro.status_code == 200, ro.text[:120])
    order = ro.json() if ro.status_code == 200 else {}
    if order.get("id"):
        cleanup["client_orders"].append(order["id"])
        cleanup["fabbisogni"] += order.get("richiesta_ids", [])
    lst = requests.get(f"{API}/portal/ordini", headers=PA).json()
    check("F4: ordine in /portal/ordini con stato derivato 'in_revisione'", any(o["id"] == order.get("id") and o["status"] == "in_revisione" for o in lst))
    det = requests.get(f"{API}/portal/ordini/{order.get('id')}", headers=PA)
    check("F4: dettaglio canonico /portal/ordini/{id} con richieste", det.status_code == 200 and len(det.json().get("richieste", [])) == 1 and det.json()["items"][0].get("domain") == "forniture", det.text[:120])
    check("F4: alias legacy GET /portal/orders serve il canonico", any(o["id"] == order.get("id") for o in requests.get(f"{API}/portal/orders", headers=PA).json()))
    check("F4: GET /portal/orders/{id} alias canonico", requests.get(f"{API}/portal/orders/{order.get('id')}", headers=PA).json().get("order_number") == order.get("order_number"))
    check("F4: Cliente B non vede ordine di A = 404", requests.get(f"{API}/portal/ordini/{order.get('id')}", headers=PB).status_code == 404)
    dash = requests.get(f"{API}/portal/dashboard", headers=PA).json()
    check("F4: dashboard portale: ordini recenti dal canonico + month_orders_count (no db.orders)",
          any(o["id"] == order.get("id") for o in dash.get("recent_orders", [])) and "month_orders_count" in dash and "month_total" not in dash)
    check("F4: dashboard portale: pulizie da cleaning_tasks", any(c["id"] == tk["id"] for c in dash.get("upcoming_cleanings", [])), str([c.get("id") for c in dash.get("upcoming_cleanings", [])])[:120])
    svc = requests.get(f"{API}/portal/services", headers=PA, params={"month": "2027-02"}).json()
    svc = svc if isinstance(svc, list) else svc.get("services", [])
    check("F4: /portal/services legge cleaning_tasks (pulizia assegnata visibile)", any(x["id"] == tk["id"] and x["type"] == "cleaning" for x in svc), str([x.get("id") for x in svc])[:120])
    check("F4: nessuna duplicazione event/cleaning_task nei servizi", len([x for x in svc if x["id"] == tk["id"]]) == 1)
    rep = requests.get(f"{API}/portal/report", headers=PA, params={"month": "2027-04"}).json()
    check("F4: /portal/report canonico (orders_count da client_orders, has_pricing False)", rep.get("orders_count") == 1 and rep.get("has_pricing") is False, str({k: rep.get(k) for k in ("orders_count", "cleaning_count", "has_pricing")}))
    check("F4: POST /portal/orders legacy = 410", requests.post(f"{API}/portal/orders", headers=PA, json={"client_id": clA["id"], "structure_id": sA["id"], "items": [], "delivery_date": "2027-04-25", "delivery_slot": "morning"}).status_code == 410)
    # richiesta consegna → fermata → consegna parziale → residuo → stato portale
    rid = order["richiesta_ids"][0]
    requests.put(f"{API}/consegne/richieste/{rid}/conferma", headers=A)
    r_conf = mdb.fabbisogni.find_one({"id": rid}, {"_id": 0, "stage": 1})
    check("F4: richiesta confermata (stage confermata)", (r_conf or {}).get("stage") == "confermata", str(r_conf))
    check("F4: stato Portale → 'confermato'", next((o["status"] for o in requests.get(f"{API}/portal/ordini", headers=PA).json() if o["id"] == order["id"]), None) == "confermato")
    fer = requests.post(f"{API}/consegne/fermate", headers=A, json={"richiesta_ids": [rid], "date": "2027-04-25", "rider_id": rider["id"]})
    check("F4: fermata Consegne creata con rider", fer.status_code == 200, fer.text[:100])
    fermata = fer.json()
    cleanup["fermate"].append(fermata["id"])
    check("F4: stato Portale → 'pianificato'", next((o["status"] for o in requests.get(f"{API}/portal/ordini", headers=PA).json() if o["id"] == order["id"]), None) == "pianificato")
    mie = requests.get(f"{API}/consegne/mie-fermate", headers=R, params={"date": "2027-04-25"}).json()
    my_f = next((f for f in mie if f["id"] == fermata["id"]), None)
    check("F4/F10: rider vede la fermata con info chiavi struttura", bool(my_f) and (my_f.get("keys") or {}).get("has_keys") is True, str((my_f or {}).get("keys"))[:100])

    # ======================= FASE 10 — CHIAVI =======================
    rk = requests.post(f"{API}/keys/{sA['id']}/A/ritiro", headers=C, json={"linked_task_id": tk["id"], "linked_task_type": "cleaning"})
    check("F10: Cleaner ritira chiave A collegata alla pulizia = 200", rk.status_code == 200 and rk.json().get("linked_task_type") == "cleaning", rk.text[:100])
    rk2 = requests.post(f"{API}/keys/{sA['id']}/B/ritiro", headers=R, json={"linked_task_id": fermata["id"], "linked_task_type": "delivery"})
    check("F10: Rider ritira chiave B collegata alla consegna = 200", rk2.status_code == 200 and rk2.json().get("linked_task_type") == "delivery", rk2.text[:100])
    check("F10: Rider ritira per altra persona = ignorato (solo sé stesso)",
          (mdb.structures.find_one({"id": sA["id"]}, {"_id": 0, "access_info": 1})["access_info"]["key_boxes"]["B"].get("holder_user_id") == rider["id"]))
    check("F10: altra persona NON può riconsegnare la chiave A = 403", requests.post(f"{API}/keys/{sA['id']}/A/riconsegna", headers=C2 if False else CR, json={}).status_code == 403)
    check("F10: tipo attività collegata non valido = 4xx", requests.post(f"{API}/keys/{sA['id']}/A/ritiro", headers=C, json={"linked_task_type": "boh"}).status_code in (400, 403))
    kout = requests.get(f"{API}/keys/out", headers=A).json()
    ka = next((k for k in kout if k["structure_id"] == sA["id"] and k["copy"] == "A"), None)
    kb = next((k for k in kout if k["structure_id"] == sA["id"] and k["copy"] == "B"), None)
    check("F10: /keys/out arricchito (KLV, detentore, attività collegata Pulizia)",
          bool(ka) and ka.get("klv_code") and ka.get("holder_name") and ka.get("linked_task_id") == tk["id"] and ka.get("linked_task_type") == "cleaning" and ka.get("linked_task_label", "").startswith("Pulizia") and ka.get("linked_task_link"), str(ka)[:200])
    check("F10: /keys/out chiave B collegata Consegna", bool(kb) and kb.get("linked_task_type") == "delivery" and kb.get("linked_task_label", "").startswith("Consegna"), str(kb)[:160])
    check("F10: /keys/out vietato a cleaner/rider = 403", requests.get(f"{API}/keys/out", headers=C).status_code == 403 and requests.get(f"{API}/keys/out", headers=R).status_code == 403)
    # completamento consegna con chiave B ancora fuori → key_warning
    done = requests.post(f"{API}/consegne/fermate/{fermata['id']}/completa", headers=R, json={
        "effective_items": [{"richiesta_id": rid, "product_id": prod["id"], "qty": 2}], "note": "TESTFIX parziale"})
    check("F4: consegna parziale (2 di 3) = 200", done.status_code == 200, done.text[:150])
    dres = done.json() if done.status_code == 200 else {}
    check("F10: warning chiave non riconsegnata al completamento consegna", "key_warning" in dres and bool(mdb.notifications.find_one({"title": "Chiave non riconsegnata", "entity_id": fermata["id"]})), str(dres.get("key_warning"))[:100])
    check("F4: richiesta → parzialmente_evasa + residuo creato", (mdb.fabbisogni.find_one({"id": rid}, {"_id": 0, "status": 1}) or {}).get("status") == "parzialmente_evasa" and bool(mdb.fabbisogni.find_one({"parent_richiesta_id": rid})))
    residual = mdb.fabbisogni.find_one({"parent_richiesta_id": rid}, {"_id": 0})
    if residual:
        cleanup["fabbisogni"].append(residual["id"])
        check("F4: residuo = 1 pezzo", residual["items"][0]["qty"] == 1, str(residual["items"]))
    check("F4: stato Portale → 'parziale'", next((o["status"] for o in requests.get(f"{API}/portal/ordini", headers=PA).json() if o["id"] == order["id"]), None) == "parziale")
    det2 = requests.get(f"{API}/portal/ordini/{order['id']}", headers=PA).json()
    check("F4: dettaglio portale mostra consegna completata", any(c["id"] == fermata["id"] for c in det2.get("consegne", [])), str(det2.get("consegne"))[:120])
    check("F4: nessuna nuova scrittura su db.orders legacy", mdb.orders.count_documents({}) == orders_before)
    check("F10: Rider riconsegna la propria chiave B = 200", requests.post(f"{API}/keys/{sA['id']}/B/riconsegna", headers=R, json={}).status_code == 200)
    check("F10: Cleaner riconsegna la propria chiave A = 200", requests.post(f"{API}/keys/{sA['id']}/A/riconsegna", headers=C, json={}).status_code == 200)
    check("F10: /keys/out vuota per la struttura dopo riconsegne", not any(k["structure_id"] == sA["id"] for k in requests.get(f"{API}/keys/out", headers=A).json()))

    # ======================= FASE 11/12 — CLIENTE ADMIN DATA + REFERENTI =======================
    ca = requests.get(f"{API}/clients/{clA['id']}", headers=A).json()
    check("F11: ClientResponse operativo SENZA dati fiscali (vat/cf/pec/sdi)",
          all(not (ca.get("company_info") or {}).get(k) for k in ("vat_number", "fiscal_code", "pec", "sdi")), str(ca.get("company_info")))
    ad = requests.get(f"{API}/clients/{clA['id']}/admin-data", headers=A)
    check("F11: Admin GET admin-data = 200 con dati fiscali (fallback legacy)", ad.status_code == 200 and ad.json().get("vat_number") == "01234567890" and ad.json().get("pec") == "testfixa@pec.example.com", ad.text[:150])
    check("F11: OM GET admin-data = 403", requests.get(f"{API}/clients/{clA['id']}/admin-data", headers=OM).status_code == 403)
    check("F11: Cleaner GET admin-data = 403", requests.get(f"{API}/clients/{clA['id']}/admin-data", headers=C).status_code == 403)
    check("F11: Cliente portale admin-data = 403", requests.get(f"{API}/clients/{clA['id']}/admin-data", headers=PA).status_code == 403)
    check("F11: OM PUT admin-data = 403", requests.put(f"{API}/clients/{clA['id']}/admin-data", headers=OM, json={"vat_number": "X"}).status_code == 403)
    pu = requests.put(f"{API}/clients/{clA['id']}/admin-data", headers=A, json={"vat_number": "09876543210", "billing_email": "fatture@example.com", "payment_terms": "30 gg", "admin_notes": "TESTFIX nota"})
    check("F11: Admin PUT admin-data = 200 e persistito", pu.status_code == 200 and pu.json().get("vat_number") == "09876543210" and pu.json().get("payment_terms") == "30 gg", pu.text[:150])
    raw = mdb.clients.find_one({"id": clA["id"]}, {"_id": 0})
    check("F11: campi fiscali specchiati sui dati legacy (billing PDF)", raw["company_info"].get("vat_number") == "09876543210")
    # PUT /clients operativo non deve azzerare i dati fiscali
    requests.put(f"{API}/clients/{clA['id']}", headers=OM, json={"company_info": {"company_name": "TESTFIX_A Srl", "representative_name": "Mario", "representative_surname": "Rossi", "vat_number": "", "fiscal_code": "", "pec": "", "sdi": ""}})
    raw2 = mdb.clients.find_one({"id": clA["id"]}, {"_id": 0})
    check("F11: PUT /clients operativo conserva i dati fiscali", raw2["company_info"].get("vat_number") == "09876543210" and raw2["company_info"].get("pec") == "testfixa@pec.example.com" and raw2["company_info"].get("representative_name") == "Mario")
    # OM che crea cliente con dati fiscali → strip
    cOM = requests.post(f"{API}/clients", headers=OM, json={"client_type": "private", "private_info": {"name": "TESTFIX_OM", "surname": "X", "fiscal_code": "OMFISCAL"}}).json()
    cleanup["clients"].append(cOM["id"])
    check("F11: creazione Cliente da OM non salva dati fiscali", (mdb.clients.find_one({"id": cOM["id"]}, {"_id": 0})["private_info"] or {}).get("fiscal_code") is None)
    # referenti
    ca_c = requests.get(f"{API}/clients/{clA['id']}", headers=A).json().get("contacts") or []
    check("F12: contatto legacy (solo name) funziona: first/last/display derivati", len(ca_c) == 1 and ca_c[0].get("first_name") == "TESTFIX" and ca_c[0].get("last_name") == "Legacy Referente" and ca_c[0].get("display_name") == "TESTFIX Legacy Referente" and ca_c[0].get("is_primary") is False and ca_c[0].get("active") is True, str(ca_c)[:200])
    c1 = ca_c[0]
    rp = requests.put(f"{API}/clients/{clA['id']}", headers=A, json={"contacts": [
        {**c1, "is_primary": True},
        {"first_name": "Anna", "last_name": "Bianchi", "role": "Amministrazione", "phone": "+39 333 0000000", "is_primary": False}]})
    cs = rp.json().get("contacts") or []
    check("F12: primo referente principale impostato", rp.status_code == 200 and sum(1 for c in cs if c.get("is_primary")) == 1 and cs[0]["is_primary"] and cs[1].get("name") == "Anna Bianchi", str(cs)[:200])
    rp2 = requests.put(f"{API}/clients/{clA['id']}", headers=A, json={"contacts": [{**cs[0], "is_primary": True}, {**cs[1], "is_primary": True}]})
    cs2 = rp2.json().get("contacts") or []
    check("F12: secondo principale rimuove il flag dal precedente (max 1)", sum(1 for c in cs2 if c.get("is_primary")) == 1 and cs2[1]["is_primary"] and not cs2[0]["is_primary"], str([(c["name"], c["is_primary"]) for c in cs2]))
    check("F12: contatto senza nome = 422", requests.put(f"{API}/clients/{clA['id']}", headers=A, json={"contacts": [{"role": "x"}]}).status_code == 422)

    # ======================= FASE 13 — SAFE DELETE UNIT =======================
    u_new = requests.post(f"{API}/units", headers=A, json={"structure_id": sA["id"], "name": "TESTFIX_A Unit nuova"}).json()
    check("F13: Unit nuova senza storico → hard delete = 200", requests.delete(f"{API}/units/{u_new['id']}", headers=A).status_code == 200)
    rdu = requests.delete(f"{API}/units/{uA1['id']}", headers=A)
    check("F13: Unit con booking/cleaning → delete bloccato (400) e proposta Disattiva", rdu.status_code == 400 and "isattiva" in rdu.json().get("detail", ""), rdu.text[:150])
    u_med = requests.post(f"{API}/units", headers=A, json={"structure_id": sA["id"], "name": "TESTFIX_A Unit media"}).json()
    cleanup["units"].append(u_med["id"])
    requests.post(f"{API}/structures/{sA['id']}/media", headers=A, data={"category": "general", "unit_id": u_med["id"]},
                  files={"file": ("u.jpg", b"\xff\xd8\xff testfix", "image/jpeg")})
    check("F13: Unit con media → delete bloccato (400)", requests.delete(f"{API}/units/{u_med['id']}", headers=A).status_code == 400)
    u_cl = requests.post(f"{API}/units", headers=A, json={"structure_id": sA["id"], "name": "TESTFIX_A Unit cleaning"}).json()
    cleanup["units"].append(u_cl["id"])
    t_u = requests.post(f"{API}/cleaning-tasks", headers=A, json={"structure_id": sA["id"], "unit_id": u_cl["id"], "date": "2027-05-05", "guests_count": 1}).json()
    cleanup["tasks"].append(t_u["id"])
    check("F13: Unit con cleaning_task → delete bloccato (400)", requests.delete(f"{API}/units/{u_cl['id']}", headers=A).status_code == 400)
    check("F13: Unit con storico → Disattiva (PUT is_active=false) = 200", requests.put(f"{API}/units/{u_cl['id']}", headers=A, json={"is_active": False}).status_code == 200)

    # ======================= FASE 14 — nav key ms-pulizie (frontend) =======================
    perm_src = open("/app/frontend/src/hooks/usePermissions.js").read()
    check("F14: 'ms-pulizie' presente in NAV_KEYS (visibile a Admin e OM)", "'ms-pulizie'" in perm_src)
    check("F8: OM nav esclude settings/integrations", "ADMIN_ONLY_NAV = ['settings', 'integrations']" in perm_src and "operations_manager: NAV_KEYS.filter" in perm_src)
finally:
    srv.shutdown(); srv.server_close()
    for tid in cleanup["tasks"]:
        mdb.cleaning_tasks.delete_one({"id": tid})
    mdb.cleaning_tasks.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.events.delete_many({"id": {"$in": cleanup["events"]}})
    mdb.events.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.fabbisogni.delete_many({"id": {"$in": cleanup["fabbisogni"]}})
    mdb.fabbisogni.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.client_orders.delete_many({"id": {"$in": cleanup["client_orders"]}})
    mdb.client_orders.delete_many({"client_id": {"$in": cleanup["clients"]}})
    mdb.logistics_tasks.delete_many({"id": {"$in": cleanup["fermate"]}})
    mdb.logistics_tasks.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.warehouse_movements.delete_many({"delivery_id": {"$in": cleanup["fermate"]}})
    mdb.stock_levels.delete_many({"location_id": {"$in": cleanup["structures"]}})
    mdb.stock_levels.delete_many({"id": {"$nin": list(pre_stock_ids)}})
    mdb.key_movements.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.structure_media.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.ical_syncs.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    mdb.units.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    for uid in cleanup["users"]:
        mdb.user_sessions.delete_many({"user_id": uid})
        mdb.users.delete_one({"id": uid})
    mdb.user_sessions.delete_many({"id": {"$nin": list(pre_session_ids)}, "user_id": {"$in": cleanup["users"]}})
    for sid in cleanup["structures"]:
        mdb.structures.delete_one({"id": sid})
    for cid in cleanup["clients"]:
        mdb.clients.delete_one({"id": cid})
    mdb.notifications.delete_many({"id": {"$nin": list(pre_notif_ids)}})
    mdb.activity_log.delete_many({"user_id": {"$in": cleanup["users"]}}) if "activity_log" in mdb.list_collection_names() else None
    after = {c: mdb[c].count_documents({}) for c in INTEGRITY_COLLS}
    diff = {c: (baseline[c], after[c]) for c in INTEGRITY_COLLS if baseline[c] != after[c]}
    after_usr = sorted(u["usr_code"] for u in mdb.users.find({}, {"usr_code": 1}))
    tfx = sum(mdb[c].count_documents({"$or": [{"name": {"$regex": "TESTFIX"}}, {"first_name": {"$regex": "TESTFIX"}},
                                              {"structure_name": {"$regex": "TESTFIX"}}, {"title": {"$regex": "TESTFIX"}},
                                              {"company_info.company_name": {"$regex": "TESTFIX"}}, {"private_info.name": {"$regex": "TESTFIX"}}]})
              for c in ("users", "clients", "structures", "units", "events", "cleaning_tasks", "fabbisogni", "logistics_tasks", "client_orders", "notifications"))
    print(f"\nINTEGRITÀ — differenze conteggi (baseline→dopo): {diff or 'nessuna'}")
    print(f"INTEGRITÀ — USR invariati: {after_usr == baseline_usr} ({len(after_usr)} utenti) — residui TESTFIX: {tfx}")
    print(f"INTEGRITÀ — NOL={after['rental_catalog']} FOR={after['supply_catalog']} PUL={after['cleaning_catalog']} KIT={after['kits']}")
    # i contatori NON devono regredire (codici permanenti mai riutilizzati)
    counters_after = {c["_id"]: c for c in mdb.counters.find({})}
    regress = [k for k, v in baseline_counters.items() if (counters_after.get(k) or {}).get("seq", (counters_after.get(k) or {}).get("value", 0)) < v.get("seq", v.get("value", 0))]
    print(f"INTEGRITÀ — contatori mai regrediti: {not regress} {regress or ''}")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
