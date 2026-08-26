"""Backend tests for Consegne (logistics hub), Lavanderia Privata, Manutenzioni (iteration 18).

Cover: fabbisogno→richiesta linkage, fermata aggregation, rider assignment/route-order,
completion generating warehouse movements (no duplication), cancellation, stock warnings,
private laundry weight+photo GATE, price default+client override, maintenance flow with
segnalazione linkage, materials logistics request, mandatory hold reason & resolution note.
"""
import io
import os
import time
import uuid

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"
ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
RIDER = {"email": "rider_test@kilolava.com", "password": "RiderTest123!"}

STATE = {}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["access_token"] if "access_token" in r.json() else r.json()["token"]


@pytest.fixture(scope="module")
def admin():
    t = _login(ADMIN)
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {t}"
    return s


@pytest.fixture(scope="module")
def rider():
    t = _login(RIDER)
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {t}"
    return s


@pytest.fixture(scope="module")
def rider_user_id(admin):
    r = admin.get(f"{API}/users", timeout=15)
    if r.status_code == 200:
        for u in r.json():
            if u.get("email") == RIDER["email"]:
                return u["id"]
    # fallback: /users/me from rider session
    return None


# ------------------------------------------------------------------
# Section: Login + Overview
# ------------------------------------------------------------------

def test_01_admin_login_and_overview(admin):
    r = admin.get(f"{API}/consegne/overview", timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    kpi = body.get("kpi", {})
    for k in ("da_organizzare", "programmate_oggi", "in_corso", "urgenti", "completate_oggi", "in_ritardo"):
        assert k in kpi, f"kpi mancante {k}: {kpi}"
    assert isinstance(body.get("attention"), list)


# ------------------------------------------------------------------
# Section: Fabbisogno (Magazzino) → Richiesta logistica (Consegne)
# ------------------------------------------------------------------

def _pick_structure(admin):
    r = admin.get(f"{API}/structures", timeout=15)
    assert r.status_code == 200
    lst = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert lst, "nessuna struttura disponibile"
    # prefer one with client_id
    for s in lst:
        if s.get("client_id"):
            return s
    return lst[0]


def _pick_product(admin, domain):
    r = admin.get(f"{API}/magazzino/catalog/{domain}", timeout=15)
    assert r.status_code == 200
    lst = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert lst, f"catalog {domain} vuoto"
    return lst[0]


def test_02_fabbisogno_noleggio_appare_in_consegne(admin):
    s = _pick_structure(admin)
    STATE["structure"] = s
    prod = _pick_product(admin, "noleggio")
    STATE["prod_nol"] = prod
    payload = {"kind": "noleggio", "structure_id": s["id"],
               "items": [{"product_id": prod["id"], "name": prod.get("name", "Prod"), "qty": 2}]}
    r = admin.post(f"{API}/magazzino/fabbisogni", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    fab = r.json()
    STATE["fab_noleggio_id"] = fab["id"]
    assert fab["status"] == "aperta"
    # Deve comparire in consegne/richieste
    r2 = admin.get(f"{API}/consegne/richieste", timeout=15)
    assert r2.status_code == 200
    ids = [x["id"] for x in r2.json()]
    assert fab["id"] in ids
    # E in proposte, raggruppata per struttura
    r3 = admin.get(f"{API}/consegne/proposte", timeout=15)
    assert r3.status_code == 200
    groups = r3.json()
    grp = next((g for g in groups if g.get("structure_id") == s["id"]), None)
    assert grp, "gruppo per struttura non trovato in proposte"
    assert "noleggio" in grp["kinds"]


def test_03_fabbisogno_fornitura_stessa_struttura_stesso_gruppo(admin):
    s = STATE["structure"]
    prod = _pick_product(admin, "forniture")
    STATE["prod_forn"] = prod
    payload = {"kind": "fornitura", "structure_id": s["id"],
               "items": [{"product_id": prod["id"], "name": prod.get("name", "Prod"), "qty": 1}]}
    r = admin.post(f"{API}/magazzino/fabbisogni", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    STATE["fab_forn_id"] = r.json()["id"]
    # nessuna duplicazione + gruppo con 2 kinds
    r3 = admin.get(f"{API}/consegne/proposte", timeout=15)
    grp = next((g for g in r3.json() if g.get("structure_id") == s["id"]), None)
    assert grp
    assert set(grp["kinds"]) >= {"noleggio", "fornitura"}
    assert len(grp["richieste"]) >= 2


def test_04_richiesta_manuale(admin):
    s = STATE["structure"]
    payload = {"structure_id": s["id"], "items": [{"name": "Extra manuale", "qty": 1}], "priority": "normal"}
    r = admin.post(f"{API}/consegne/richieste", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    STATE["fab_manuale_id"] = d["id"]
    assert d["status"] == "aperta"
    assert d["kind"] == "manuale"


# ------------------------------------------------------------------
# Section: Fermata create/assignment/route
# ------------------------------------------------------------------

def test_05_carica_stock_centrale_per_completamento(admin):
    """Assicurati che ci sia stock centrale per i prodotti che consegneremo."""
    for key in ("prod_nol", "prod_forn"):
        prod = STATE[key]
        domain = "noleggio" if key == "prod_nol" else "forniture"
        r = admin.post(f"{API}/magazzino/movimenti", json={
            "domain": domain, "movement_type": "carico", "product_id": prod["id"], "qty": 50,
            "origin": {"type": "external", "label": "Fornitore TEST"},
            "destination": {"type": "central", "label": "Magazzino Generale"},
            "note": "TEST setup stock"}, timeout=20)
        assert r.status_code == 200, f"carico {domain}: {r.text}"


def test_06_crea_fermata_aggregata(admin):
    ids = [STATE["fab_noleggio_id"], STATE["fab_forn_id"], STATE["fab_manuale_id"]]
    today = time.strftime("%Y-%m-%d")
    STATE["today"] = today
    payload = {"richiesta_ids": ids, "date": today}
    r = admin.post(f"{API}/consegne/fermate", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    ferm = r.json()
    STATE["fermata_id"] = ferm["id"]
    # 3 lines separate per category
    cats = [ln["category"] for ln in ferm["lines"]]
    assert len(cats) == 3
    assert set(cats) >= {"noleggio", "fornitura", "manuale"}
    # Le richieste ora sono in_consegna
    r2 = admin.get(f"{API}/consegne/richieste?status=in_consegna", timeout=15)
    fids = [x["id"] for x in r2.json()]
    for fid in ids:
        assert fid in fids


def test_07_assegna_rider(admin, rider, rider_user_id):
    # get rider_id via list users
    rid = rider_user_id
    if not rid:
        me = rider.get(f"{API}/users/me", timeout=10)
        assert me.status_code == 200
        rid = me.json()["id"]
    STATE["rider_id"] = rid
    r = admin.put(f"{API}/consegne/fermate/{STATE['fermata_id']}", json={"rider_id": rid}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "assigned"
    assert d.get("rider_id") == rid
    assert d.get("rider_name")
    # rider vede la fermata
    r2 = rider.get(f"{API}/consegne/mie-fermate?date={STATE['today']}", timeout=15)
    assert r2.status_code == 200
    assert any(f["id"] == STATE["fermata_id"] for f in r2.json())


def test_08_route_order(admin):
    """Crea seconda fermata assegnata allo stesso rider, poi ordina."""
    # nuova richiesta manuale + fermata
    s = STATE["structure"]
    r0 = admin.post(f"{API}/consegne/richieste", json={
        "structure_id": s["id"], "items": [{"name": "Route test", "qty": 1}]}, timeout=15)
    assert r0.status_code == 200
    fab_id = r0.json()["id"]
    STATE["fab_route_id"] = fab_id
    r1 = admin.post(f"{API}/consegne/fermate", json={
        "richiesta_ids": [fab_id], "date": STATE["today"], "rider_id": STATE["rider_id"]}, timeout=15)
    assert r1.status_code == 200
    fid2 = r1.json()["id"]
    STATE["fermata2_id"] = fid2
    r2 = admin.put(f"{API}/consegne/fermate/route-order", json={
        "rider_id": STATE["rider_id"], "date": STATE["today"],
        "ordered_ids": [fid2, STATE["fermata_id"]]}, timeout=15)
    assert r2.status_code == 200
    # verifica ordini
    r3 = admin.get(f"{API}/consegne/fermate?date={STATE['today']}&rider_id={STATE['rider_id']}", timeout=15)
    m = {t["id"]: t.get("route_order") for t in r3.json()}
    assert m[fid2] == 1
    assert m[STATE["fermata_id"]] == 2


# ------------------------------------------------------------------
# Section: Completamento e stock
# ------------------------------------------------------------------

def _stock_qty(admin, domain, location_type, prod_id, location_id=None):
    url = f"{API}/magazzino/stock/{domain}?location_type={location_type}"
    if location_id:
        url += f"&location_id={location_id}"
    r = admin.get(url, timeout=15)
    if r.status_code != 200:
        return None
    lst = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    for x in lst:
        if x.get("product_id") == prod_id or x.get("id") == prod_id:
            return x.get("qty", 0)
    return 0


def test_09_completa_fermata_genera_movimenti(admin, rider):
    fid = STATE["fermata_id"]
    prod = STATE["prod_nol"]
    s = STATE["structure"]
    pre_central = _stock_qty(admin, "noleggio", "central", prod["id"])
    pre_struct = _stock_qty(admin, "noleggio", "structure", prod["id"], location_id=s["id"])
    # start + completa come rider
    r0 = rider.put(f"{API}/consegne/fermate/{fid}/start", timeout=15)
    assert r0.status_code == 200, r0.text
    r = rider.post(f"{API}/consegne/fermate/{fid}/completa", json={"note": "TEST completamento"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["movements"] >= 2, f"expected movements >=2, got {body}"
    # fermata deve essere completed con movement_ids
    detail = admin.get(f"{API}/consegne/fermate/{fid}", timeout=15).json()
    assert detail["status"] == "completed"
    assert detail.get("completed_at")
    assert len(detail.get("movement_ids") or []) >= 2
    # NESSUN doppio movimento per delivery_id/product
    movs = detail.get("movements") or []
    seen = {}
    for m in movs:
        key = (m.get("product_id"), m.get("delivery_id"))
        seen[key] = seen.get(key, 0) + 1
    assert all(v == 1 for v in seen.values()), f"duplicazione movimenti: {seen}"
    # stock centrale ↓, struttura ↑
    post_central = _stock_qty(admin, "noleggio", "central", prod["id"])
    post_struct = _stock_qty(admin, "noleggio", "structure", prod["id"], location_id=s["id"])
    assert post_central is None or pre_central is None or post_central < pre_central
    assert post_struct is None or pre_struct is None or post_struct > pre_struct
    # richieste passate a evasa
    r2 = admin.get(f"{API}/consegne/richieste?status=evasa", timeout=15)
    ids = [x["id"] for x in r2.json()]
    assert STATE["fab_noleggio_id"] in ids


def test_10_annullamento_fermata(admin):
    fid = STATE["fermata2_id"]
    r = admin.put(f"{API}/consegne/fermate/{fid}", json={"status": "cancelled"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "cancelled"
    # richiesta torna aperta
    r2 = admin.get(f"{API}/consegne/richieste?status=aperta", timeout=15)
    ids = [x["id"] for x in r2.json()]
    assert STATE["fab_route_id"] in ids
    # nessun movimento con delivery_id
    detail = admin.get(f"{API}/consegne/fermate/{fid}", timeout=15).json()
    assert len(detail.get("movements") or []) == 0


def test_11_warning_stock_qty_enorme(admin):
    s = STATE["structure"]
    prod = STATE["prod_nol"]
    r = admin.post(f"{API}/magazzino/fabbisogni", json={
        "kind": "noleggio", "structure_id": s["id"],
        "items": [{"product_id": prod["id"], "name": prod.get("name"), "qty": 99999}]}, timeout=15)
    assert r.status_code == 200
    STATE["fab_warning_id"] = r.json()["id"]
    r2 = admin.get(f"{API}/consegne/richieste", timeout=15)
    row = next((x for x in r2.json() if x["id"] == STATE["fab_warning_id"]), None)
    assert row is not None
    assert row.get("stock_ok") is False
    avail = row.get("availability") or []
    assert any(a.get("ok") is False for a in avail)


# ------------------------------------------------------------------
# Section: Lavanderia Privata
# ------------------------------------------------------------------

def test_20_lavanderia_flow_full(admin, rider):
    # trova un cliente reale
    r = admin.get(f"{API}/clients", timeout=15)
    clients = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert clients
    client = clients[0]
    STATE["client_id"] = client["id"]
    # crea job
    r = admin.post(f"{API}/lavanderia/jobs", json={"client_id": client["id"], "bags": 2, "note": "TEST"}, timeout=15)
    assert r.status_code == 200, r.text
    job = r.json()
    STATE["laundry_job_id"] = job["id"]
    assert job["status"] == "da_lavorare"
    assert job["consegnabile"] is False
    # marca pronta senza peso → crea richiesta logistica
    r = admin.post(f"{API}/lavanderia/jobs/{job['id']}/pronta", json={}, timeout=15)
    assert r.status_code == 200, r.text
    j2 = r.json()
    assert j2["status"] == "pronta"
    assert j2.get("richiesta_id")
    STATE["laundry_fab_id"] = j2["richiesta_id"]
    # richiesta visibile in consegne con laundry.consegnabile false
    rr = admin.get(f"{API}/consegne/richieste", timeout=15)
    row = next((x for x in rr.json() if x["id"] == j2["richiesta_id"]), None)
    assert row and row.get("laundry")
    assert row["laundry"]["consegnabile"] is False
    # GATE: creare fermata deve fallire
    r_gate = admin.post(f"{API}/consegne/fermate", json={
        "richiesta_ids": [j2["richiesta_id"]], "date": STATE["today"]}, timeout=15)
    assert r_gate.status_code == 400
    assert "Pesatura" in r_gate.text or "pesatura" in r_gate.text.lower()
    # imposta peso
    r = admin.put(f"{API}/lavanderia/jobs/{job['id']}/peso", json={"final_weight_kg": 7.5}, timeout=15)
    assert r.status_code == 200, r.text
    j3 = r.json()
    assert j3.get("price_per_kg") == 3.0
    assert j3.get("total_price") == 22.5
    assert j3.get("consegnabile") is False  # manca foto
    # foto bilancia
    img = ("bilancia.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fakejpeg"), "image/jpeg")
    r = admin.post(f"{API}/lavanderia/jobs/{job['id']}/foto-bilancia",
                   files={"file": img}, timeout=20)
    assert r.status_code == 200, r.text
    # ora consegnabile
    j4 = admin.get(f"{API}/lavanderia/jobs?status=pronta", timeout=15).json()
    row = next((x for x in j4 if x["id"] == job["id"]), None)
    assert row and row["consegnabile"] is True
    # crea fermata → OK; assegna rider e completa
    r = admin.post(f"{API}/consegne/fermate", json={
        "richiesta_ids": [j2["richiesta_id"]], "date": STATE["today"], "rider_id": STATE["rider_id"]}, timeout=15)
    assert r.status_code == 200, r.text
    lav_fid = r.json()["id"]
    rider.put(f"{API}/consegne/fermate/{lav_fid}/start", timeout=15)
    r = rider.post(f"{API}/consegne/fermate/{lav_fid}/completa", json={}, timeout=30)
    assert r.status_code == 200, r.text
    # job deve essere consegnata
    hist = admin.get(f"{API}/lavanderia/history", timeout=15).json()
    delivered = next((x for x in hist if x["id"] == job["id"]), None)
    assert delivered
    assert delivered["status"] == "consegnata"
    assert delivered.get("delivery_id") == lav_fid
    assert delivered.get("final_weight_kg") == 7.5
    assert delivered.get("total_price") == 22.5


def test_21_lavanderia_prezzi(admin):
    # PUT settings a 3.5
    r = admin.put(f"{API}/lavanderia/settings", json={"price_per_kg": 3.5}, timeout=15)
    assert r.status_code == 200
    r = admin.get(f"{API}/lavanderia/settings", timeout=15)
    assert r.json()["price_per_kg"] == 3.5
    # override cliente 2.5
    cid = STATE["client_id"]
    r = admin.put(f"{API}/lavanderia/client-price/{cid}", json={"price_per_kg": 2.5}, timeout=15)
    assert r.status_code == 200
    # crea nuovo job + pronta + peso → deve usare 2.5 sorgente cliente
    r = admin.post(f"{API}/lavanderia/jobs", json={"client_id": cid, "bags": 1, "note": "TEST prezzo"}, timeout=15)
    jid = r.json()["id"]
    STATE["laundry_price_job_id"] = jid
    admin.post(f"{API}/lavanderia/jobs/{jid}/pronta", json={}, timeout=15)
    r = admin.put(f"{API}/lavanderia/jobs/{jid}/peso", json={"final_weight_kg": 4.0}, timeout=15)
    j = r.json()
    assert j["price_per_kg"] == 2.5
    assert j["price_source"] == "cliente"
    assert j["total_price"] == 10.0
    # ripristina: settings 3.0, override null
    admin.put(f"{API}/lavanderia/settings", json={"price_per_kg": 3.0}, timeout=15)
    admin.put(f"{API}/lavanderia/client-price/{cid}", json={"price_per_kg": None}, timeout=15)


# ------------------------------------------------------------------
# Section: Manutenzioni
# ------------------------------------------------------------------

def test_30_manutenzione_da_segnalazione(admin):
    s = STATE["structure"]
    # crea segnalazione (type in {missing,damage,malfunction,other}, priority ok)
    r = admin.post(f"{API}/segnalazioni", json={
        "title": "TEST rubinetto rotto", "description": "gocciola",
        "type": "malfunction", "priority": "normal", "structure_id": s["id"]}, timeout=15)
    assert r.status_code == 200, r.text
    seg = r.json()
    STATE["seg_id"] = seg["id"]
    # crea task maintenance
    r = admin.post(f"{API}/segnalazioni/{seg['id']}/tasks", json={
        "type": "maintenance", "title": "TEST intervento riparazione"}, timeout=15)
    assert r.status_code == 200, r.text
    task = r.json()
    assert task.get("linked_id")
    STATE["maint_id"] = task["linked_id"]
    # segnalazione non chiusa
    seg2 = admin.get(f"{API}/segnalazioni/{seg['id']}", timeout=15).json()
    assert seg2["status"] not in ("risolta", "chiusa")


def test_31_manutenzione_start_hold_materials(admin):
    mid = STATE["maint_id"]
    # start
    r = admin.put(f"{API}/maintenance/issues/{mid}/start", timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "in_progress"
    # hold senza motivo valido
    r = admin.put(f"{API}/maintenance/issues/{mid}/hold", json={"reason": "invalid_reason"}, timeout=15)
    assert r.status_code == 400
    # hold con motivo valido
    r = admin.put(f"{API}/maintenance/issues/{mid}/hold", json={"reason": "materiale", "note": "attesa pezzo"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "on_hold"
    assert r.json().get("hold_reason", {}).get("reason") == "materiale"
    # materiali con da_portare
    r = admin.put(f"{API}/maintenance/issues/{mid}/materials", json={
        "materials": [{"description": "Guarnizione", "qty": 2, "available": False, "to_bring": True}]}, timeout=15)
    assert r.status_code == 200
    # materials-request
    r = admin.post(f"{API}/maintenance/issues/{mid}/materials-request", timeout=15)
    assert r.status_code == 200, r.text
    fab = r.json()
    STATE["maint_fab_id"] = fab["id"]
    assert fab["kind"] == "manutenzione"
    # visibile in consegne/richieste
    rr = admin.get(f"{API}/consegne/richieste", timeout=15).json()
    assert any(x["id"] == fab["id"] for x in rr)
    # secondo POST → 400
    r2 = admin.post(f"{API}/maintenance/issues/{mid}/materials-request", timeout=15)
    assert r2.status_code == 400


def test_32_manutenzione_complete_richiede_note(admin):
    mid = STATE["maint_id"]
    # senza resolution_notes → 400
    r = admin.put(f"{API}/maintenance/issues/{mid}/complete", json={"resolution_notes": ""}, timeout=15)
    assert r.status_code == 400
    # con note → 200
    r = admin.put(f"{API}/maintenance/issues/{mid}/complete", json={"resolution_notes": "Sostituita guarnizione"}, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "completed"
    # segnalazione collegata → risolta
    seg = admin.get(f"{API}/segnalazioni/{STATE['seg_id']}", timeout=15).json()
    assert seg["status"] == "risolta"
    # history contiene azioni
    actions = [h.get("action") for h in (d.get("history") or [])]
    for exp in ("started", "on_hold", "materials", "completed"):
        assert exp in actions, f"manca {exp} in history: {actions}"


def test_33_manutenzione_manual_and_cancel(admin):
    # secondo intervento creato manualmente
    r = admin.post(f"{API}/maintenance/issues", json={
        "title": "TEST manuale", "description": "test", "category": "plumbing", "priority": "medium"}, timeout=15)
    assert r.status_code == 200, r.text
    mid2 = r.json()["id"]
    STATE["maint2_id"] = mid2
    # /status con on_hold → 400 (deve usare hold)
    r = admin.put(f"{API}/maintenance/issues/{mid2}/status", json={"status": "on_hold"}, timeout=15)
    assert r.status_code == 400
    # cancel OK
    r = admin.put(f"{API}/maintenance/issues/{mid2}/cancel", json={"reason": "TEST"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


# ------------------------------------------------------------------
# Section: Cleanup dei dati di test
# ------------------------------------------------------------------

def test_99_cleanup(admin):
    """Rimuove dati di test creati; non tocca dati reali (strutture/clienti/stock)."""
    # annulla richieste ancora aperte
    for key in ("fab_warning_id", "fab_route_id"):
        fid = STATE.get(key)
        if fid:
            admin.put(f"{API}/consegne/richieste/{fid}/annulla", timeout=10)
    # annulla laundry job "pronta" residuo (test_price)
    jid = STATE.get("laundry_price_job_id")
    if jid:
        admin.put(f"{API}/lavanderia/jobs/{jid}", json={"status": "annullata"}, timeout=10)
    # cancella intervento manutenzione completato non è possibile: ok, resta come storico
    # elimina segnalazione TEST se possibile
    seg_id = STATE.get("seg_id")
    if seg_id:
        admin.delete(f"{API}/segnalazioni/{seg_id}", timeout=10)
    # ripristina prezzo standard 3.0 (fatto in test_21 già)
    admin.put(f"{API}/lavanderia/settings", json={"price_per_kg": 3.0}, timeout=10)
    assert True
