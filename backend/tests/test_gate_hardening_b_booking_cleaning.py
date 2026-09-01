from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD  # noqa: E402
"""GATE B — Hardening Fase 3: Prenotazione (events booking) → Pulizia (cleaning_tasks) automatica e idempotente.
Casi: creazione, no-service, idempotenza, cambio checkout, cancellazione, multi-unit, check-in stesso giorno,
task già in corso (warning, non toccata), ramo iCal. Fixture TESTFIX_ + cleanup completo."""
import http.server
import os
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


admin_tok = requests.post(f"{API}/auth/login", json={
    "username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}).json()["access_token"]
A = {"Authorization": f"Bearer {admin_tok}"}

cleanup = {"clients": [], "structures": [], "units": [], "events": [], "tasks": []}


def tasks_for(event_id, include_cancelled=False):
    q = {"booking_event_id": event_id}
    if not include_cancelled:
        q["status"] = {"$ne": "cancelled"}
    return list(mdb.cleaning_tasks.find(q, {"_id": 0}))


ICS_HOLDER = {"body": """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//TESTFIX//GateB//IT
BEGIN:VEVENT
UID:TESTFIX-GATEB-ICAL-1
SUMMARY:TESTFIX Soggiorno iCal
DTSTART;VALUE=DATE:20261218
DTEND;VALUE=DATE:20261221
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

try:
    cl = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTFIX_GB", "surname": "Cliente"}}).json()
    cleanup["clients"].append(cl["id"])
    s1 = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cl["id"], "name": "TESTFIX_GB Con Pulizie", "structure_type": "apartment",
        "services": ["cleaning"], "check_in_time": "15:00", "check_out_time": "10:00"}).json()
    cleanup["structures"].append(s1["id"])
    s2 = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cl["id"], "name": "TESTFIX_GB Senza Pulizie", "structure_type": "apartment",
        "services": []}).json()
    cleanup["structures"].append(s2["id"])
    u1 = requests.post(f"{API}/units", headers=A, json={"structure_id": s1["id"], "name": "TESTFIX_U1"}).json()
    u2 = requests.post(f"{API}/units", headers=A, json={"structure_id": s1["id"], "name": "TESTFIX_U2"}).json()
    cleanup["units"] += [u1.get("id"), u2.get("id")]

    def mk_booking(structure_id, start, end, unit_id=None, title="TESTFIX Soggiorno"):
        r = requests.post(f"{API}/events", headers=A, json={
            "event_type": "booking", "title": title, "structure_id": structure_id,
            "unit_id": unit_id, "start_time": start, "end_time": end, "guests_count": 2})
        assert r.status_code == 200, r.text
        ev = r.json()
        cleanup["events"].append(ev["id"])
        return ev

    # --- 1) Struttura SENZA servizio cleaning: nessuna pulizia generata ---
    ev_ns = mk_booking(s2["id"], "2026-12-01T15:00:00", "2026-12-05T10:00:00")
    check("No-service: nessuna pulizia creata", len(tasks_for(ev_ns["id"])) == 0)

    # --- 2) Creazione soggiorno -> pulizia automatica al checkout ---
    ev1 = mk_booking(s1["id"], "2026-12-05T15:00:00", "2026-12-10T10:00:00")
    t1 = tasks_for(ev1["id"])
    check("Creazione: 1 pulizia generata", len(t1) == 1, f"got {len(t1)}")
    t1 = t1[0] if t1 else {}
    cleanup["tasks"].append(t1.get("id"))
    check("Pulizia: data = checkout", t1.get("date") == "2026-12-10", str(t1.get("date")))
    check("Pulizia: orario = check_out_time struttura", t1.get("scheduled_time") == "10:00", str(t1.get("scheduled_time")))
    check("Pulizia: link booking_event_id", t1.get("booking_event_id") == ev1["id"])
    ev1_db = mdb.events.find_one({"id": ev1["id"]}, {"_id": 0, "cleaning_task_id": 1})
    check("Evento: link cleaning_task_id", ev1_db.get("cleaning_task_id") == t1.get("id"))

    # --- 3) Idempotenza: modifica titolo + genera-da-soggiorni non duplicano ---
    requests.put(f"{API}/events/{ev1['id']}", headers=A, json={"title": "TESTFIX Rinominato"})
    check("Idempotenza su PUT: ancora 1 pulizia", len(tasks_for(ev1["id"])) == 1)
    g = requests.post(f"{API}/cleaning-tasks/genera-da-soggiorni", headers=A, json={"date": "2026-12-10"}).json()
    check("genera-da-soggiorni: created=0 (già esistente)", g.get("created") == 0, str(g))
    check("Idempotenza batch: ancora 1 pulizia", len(tasks_for(ev1["id"])) == 1)

    # --- 4) Cambio data checkout (pulizia non iniziata) -> stessa pulizia, data aggiornata ---
    requests.put(f"{API}/events/{ev1['id']}", headers=A, json={"end_time": "2026-12-12T10:00:00"})
    t1b = tasks_for(ev1["id"])
    check("Cambio checkout: nessun duplicato", len(t1b) == 1)
    check("Cambio checkout: stessa pulizia, data aggiornata",
          t1b and t1b[0]["id"] == t1["id"] and t1b[0]["date"] == "2026-12-12", str(t1b[0].get("date") if t1b else None))

    # --- 5) Check-in stesso giorno: nuovo soggiorno che inizia il giorno del checkout ---
    ev2 = mk_booking(s1["id"], "2026-12-12T16:30:00", "2026-12-15T10:00:00")
    t1c = tasks_for(ev1["id"])[0]
    check("Check-in stesso giorno: flag checkin_today=true", t1c.get("checkin_today") is True)
    check("Check-in stesso giorno: checkin_time dal nuovo soggiorno", t1c.get("checkin_time") == "16:30", str(t1c.get("checkin_time")))
    t2 = tasks_for(ev2["id"])
    check("Nuovo soggiorno: propria pulizia al suo checkout", len(t2) == 1 and t2[0]["date"] == "2026-12-15")
    cleanup["tasks"].append(t2[0]["id"] if t2 else None)

    # --- 6) Multi-unit: 2 soggiorni stesso giorno su unità diverse -> 2 pulizie distinte ---
    evu1 = mk_booking(s1["id"], "2026-12-16T15:00:00", "2026-12-20T10:00:00", unit_id=u1.get("id"))
    evu2 = mk_booking(s1["id"], "2026-12-16T15:00:00", "2026-12-20T10:00:00", unit_id=u2.get("id"))
    tu1, tu2 = tasks_for(evu1["id"]), tasks_for(evu2["id"])
    check("Multi-unit: 1 pulizia per unità (U1)", len(tu1) == 1 and tu1[0].get("unit_id") == u1.get("id"))
    check("Multi-unit: 1 pulizia per unità (U2)", len(tu2) == 1 and tu2[0].get("unit_id") == u2.get("id"))
    check("Multi-unit: pulizie distinte", tu1 and tu2 and tu1[0]["id"] != tu2[0]["id"])
    cleanup["tasks"] += [tu1[0]["id"] if tu1 else None, tu2[0]["id"] if tu2 else None]

    # --- 7) Cancellazione soggiorno -> pulizia cancelled (mai hard delete) ---
    requests.delete(f"{API}/events/{evu2['id']}", headers=A)
    tu2_after = tasks_for(evu2["id"], include_cancelled=True)
    check("Cancellazione: pulizia esiste ancora (no hard delete)", len(tu2_after) == 1)
    check("Cancellazione: status=cancelled", tu2_after and tu2_after[0]["status"] == "cancelled")

    # --- 8) Pulizia già in corso + checkout spostato -> warning, task NON toccata ---
    mdb.cleaning_tasks.update_one({"id": tu1[0]["id"]}, {"$set": {"status": "in_progress", "started_at": "2026-12-20T08:00:00"}})
    n_before = mdb.notifications.count_documents({"entity_id": tu1[0]["id"]})
    requests.put(f"{API}/events/{evu1['id']}", headers=A, json={"end_time": "2026-12-21T10:00:00"})
    tu1_after = mdb.cleaning_tasks.find_one({"id": tu1[0]["id"]}, {"_id": 0})
    check("In corso + checkout spostato: data NON modificata", tu1_after["date"] == "2026-12-20", tu1_after["date"])
    check("In corso + checkout spostato: status invariato", tu1_after["status"] == "in_progress")
    n_after = mdb.notifications.count_documents({"entity_id": tu1[0]["id"]})
    check("In corso + checkout spostato: warning agli OPS", n_after > n_before, f"{n_before}->{n_after}")

    # --- 9) Ramo iCal: feed crea soggiorno -> pulizia automatica; cancellazione dal feed -> cancelled ---
    ru = requests.put(f"{API}/structures/{s1['id']}", headers=A, json={"ical_url": ICAL_URL})
    check("Setup iCal url = 200", ru.status_code == 200, ru.text[:100])
    rs = requests.post(f"{API}/ical/sync/{s1['id']}", headers=A)
    check("Sync iCal = 200", rs.status_code == 200, rs.text[:150])
    ical_ev = mdb.events.find_one({"ical_uid": "TESTFIX-GATEB-ICAL-1"}, {"_id": 0})
    check("iCal: soggiorno creato", bool(ical_ev))
    if ical_ev:
        cleanup["events"].append(ical_ev["id"])
        ti = tasks_for(ical_ev["id"])
        check("iCal: pulizia generata al checkout", len(ti) == 1 and ti[0]["date"] == "2026-12-21", str([x.get('date') for x in ti]))
        if ti:
            cleanup["tasks"].append(ti[0]["id"])
        # feed vuoto -> evento con dati kilolava (cleaning_task_id) => feed_cancelled + pulizia cancelled
        ICS_HOLDER["body"] = ICS_HOLDER["body"].replace("BEGIN:VEVENT", "BEGIN:XEVENT").replace("END:VEVENT", "END:XEVENT")
        rs2 = requests.post(f"{API}/ical/sync/{s1['id']}", headers=A)
        check("Re-sync feed vuoto = 200", rs2.status_code == 200)
        ical_ev2 = mdb.events.find_one({"id": ical_ev["id"]}, {"_id": 0})
        check("iCal cancellato: evento feed_cancelled (non hard delete, ha pulizia)", bool(ical_ev2 and ical_ev2.get("feed_cancelled")))
        ti2 = tasks_for(ical_ev["id"], include_cancelled=True)
        check("iCal cancellato: pulizia -> cancelled", ti2 and ti2[0]["status"] == "cancelled", str([x.get("status") for x in ti2]))
finally:
    srv.shutdown()
    for tid in [t for t in cleanup["tasks"] if t]:
        requests.delete(f"{API}/cleaning-tasks/{tid}", headers=A)
    mdb.cleaning_tasks.delete_many({"booking_event_id": {"$in": cleanup["events"]}})
    for eid in cleanup["events"]:
        mdb.events.delete_one({"id": eid})
    for uid in [u for u in cleanup["units"] if u]:
        requests.delete(f"{API}/units/{uid}", headers=A)
        mdb.units.delete_one({"id": uid})
    for sid in cleanup["structures"]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
        mdb.structures.delete_one({"id": sid})
    for cid in cleanup["clients"]:
        requests.delete(f"{API}/clients/{cid}", headers=A)
        mdb.clients.delete_one({"id": cid})
    mdb.notifications.delete_many({"title": {"$regex": "TESTFIX"}})
    mdb.notifications.delete_many({"message": {"$regex": "TESTFIX"}})
    mdb.ical_syncs.delete_many({"structure_id": {"$in": cleanup["structures"]}})
    res = {c: mdb[c].count_documents({}) for c in ("clients", "structures", "units", "events", "cleaning_tasks")}
    tfx = sum(mdb[c].count_documents({"$or": [{"name": {"$regex": "TESTFIX"}}, {"title": {"$regex": "TESTFIX"}}]})
              for c in ("structures", "units", "events", "cleaning_tasks"))
    print(f"cleanup done — counts: {res} — residui TESTFIX: {tfx}")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
