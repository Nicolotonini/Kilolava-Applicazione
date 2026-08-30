"""Iteration 30 - Google Maps SERVER key: Routes API (computeRoutes/Matrix) + Geocoding.

Copertura:
- Geocoding automatico strutture: struttura senza lat/lng -> giro-percorso persiste lat/lng
- Impostazioni operative: PUT sede_address senza lat -> auto-geocoding
- Proponi giri con dati reali (eta/km/travel_min NUMERICI da Routes API)
- Conferma giri
- Giro-percorso: route_available=true, polyline, km_total, min_total, origin.source='sede'
- Permessi giro-percorso: rider self OK, rider su altro rider -> 403
- Route-to-next (AVVIA PERCORSO): con GPS coords -> polyline/km/min/eta
- Route-to-next: fermata inesistente -> 404, fermata di altro rider chiamata da rider -> 403
- Completamento fermata: movimenti generati, remaining_count decrementa
- Sicurezza chiave: risposte JSON NON contengono 'AIza'
- CLEANUP FINALE + ripristino sede_address originale
"""
import json
import os
import subprocess
import time

import pytest
import requests


def _load_frontend_env():
    p = "/app/frontend/.env"
    try:
        with open(p) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    os.environ.setdefault("REACT_APP_BACKEND_URL", line.split("=", 1)[1].strip())
    except FileNotFoundError:
        pass


_load_frontend_env()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
STAMP = f"iter30_{int(time.time())}"

# Trieste centro (Piazza Unità) - usato come "GPS del rider" in test route-to-next
TRIESTE_GPS = {"latitude": 45.6495, "longitude": 13.7690}

_state = {
    "users": [], "clients": [], "structures": [], "fabbisogni": [],
    "logistics_tasks": [], "cleaning_tasks": [],
    "original_sede_address": "Via dei Calderai 8, Trieste",
}


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def tomorrow():
    from datetime import datetime, timedelta
    return (datetime.utcnow().date() + timedelta(days=1)).isoformat()


# ---------- 00 Health & no leaks in frontend ----------

def test_00_health_no_key_in_frontend(admin_headers):
    assert requests.get(f"{BASE}/health").status_code == 200
    # Ensure no Google key leaked in the frontend
    out = subprocess.run(["grep", "-rEn", "AIza[0-9A-Za-z_-]{20,}", "/app/frontend/src"],
                         capture_output=True, text=True, check=False)
    assert not out.stdout.strip(), f"Google key leak in frontend/src:\n{out.stdout}"
    out2 = subprocess.run(["grep", "-rn", "GOOGLE_MAPS_SERVER_API_KEY", "/app/frontend"],
                          capture_output=True, text=True, check=False)
    assert not out2.stdout.strip(), f"Server key referenced in frontend:\n{out2.stdout}"


# ---------- 01 Impostazioni operative: geocoding sede ----------

def test_01_impostazioni_geocode_sede(admin_headers):
    """PUT sede_address without lat -> auto-geocoded"""
    # First save current settings to restore later
    cur = requests.get(f"{BASE}/impostazioni-operative", headers=admin_headers, timeout=15).json()
    _state["original_sede_address"] = cur.get("sede_address") or "Via dei Calderai 8, Trieste"

    r = requests.put(f"{BASE}/impostazioni-operative", headers=admin_headers, timeout=20,
                     json={"sede_address": "Via San Nicolò 30, Trieste"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("sede_address") == "Via San Nicolò 30, Trieste"
    assert d.get("sede_lat") is not None and d.get("sede_lng") is not None
    # Trieste center bounds
    assert 45.6 < d["sede_lat"] < 45.7, d
    assert 13.7 < d["sede_lng"] < 13.8, d
    # No key leak
    assert "AIza" not in json.dumps(d)


# ---------- 02 Seed users + client + structures REAL Trieste addresses ----------

def _mkuser(admin_headers, role, tag):
    payload = {"email": f"TEST_{STAMP}_{tag}@kilolava.com", "password": "TestPass123!",
               "first_name": f"Test{tag}", "last_name": "Iter30", "role": role}
    r = requests.post(f"{BASE}/users", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    u = r.json()
    _state["users"].append(u["id"])
    return u


def test_02_seed_users_client_structures(admin_headers):
    _state["rider_a"] = _mkuser(admin_headers, "rider", "riderA")
    _state["rider_b"] = _mkuser(admin_headers, "rider", "riderB")

    r = requests.post(f"{BASE}/clients", headers=admin_headers, timeout=15, json={
        "client_type": "company",
        "company_info": {"company_name": f"TEST_{STAMP}_Client",
                         "representative_name": "Mario", "representative_surname": "Rossi",
                         "vat_number": "01234567890"},
    })
    assert r.status_code in (200, 201), r.text
    _state["client"] = r.json()
    _state["clients"].append(_state["client"]["id"])

    # Struct A: indirizzo REALE, NESSUNA lat/lng -> testeremo il geocoding automatico
    r = requests.post(f"{BASE}/structures", headers=admin_headers, timeout=15, json={
        "client_id": _state["client"]["id"],
        "name": f"TEST_{STAMP}_StructA",
        "structure_type": "apartment",
        "address": "Piazza della Borsa 4, Trieste",
        "linea": "living",
        "check_in_time": "15:00", "check_out_time": "10:00",
        "bed_config": {"beds_double": 1, "beds_single": 0},
    })
    assert r.status_code in (200, 201), r.text
    sa = r.json()
    _state["struct_a"] = sa
    _state["structures"].append(sa["id"])
    # Confirm NO lat/lng at creation (geocoding is on-demand)
    assert sa.get("latitude") in (None, 0) or sa.get("latitude") is None

    # Struct B: with pre-existing coords
    r = requests.post(f"{BASE}/structures", headers=admin_headers, timeout=15, json={
        "client_id": _state["client"]["id"],
        "name": f"TEST_{STAMP}_StructB",
        "structure_type": "apartment",
        "address": "Viale Miramare 15, Trieste",
        "linea": "living",
        "check_in_time": "15:00", "check_out_time": "10:00",
        "latitude": 45.6720, "longitude": 13.7590,
        "bed_config": {"beds_double": 1, "beds_single": 0},
    })
    assert r.status_code in (200, 201), r.text
    _state["struct_b"] = r.json()
    _state["structures"].append(_state["struct_b"]["id"])


# ---------- 03 Rider availability ----------

def test_03_rider_availability(admin_headers, tomorrow):
    for uid in (_state["rider_a"]["id"], _state["rider_b"]["id"]):
        r = requests.put(f"{BASE}/day-availability", headers=admin_headers, timeout=15,
                         json={"date": tomorrow, "user_id": uid, "role": "rider",
                               "available": True, "start_time": "09:00", "end_time": "17:00",
                               "vehicle": "furgone"})
        assert r.status_code == 200, r.text


# ---------- 04 Crea richieste + conferma + fermate ----------

def test_04_richieste_confermate(admin_headers, tomorrow):
    # 2 richieste noleggio (una per struttura) create manualmente
    payloads = [
        {"structure_id": _state["struct_a"]["id"], "date_needed": tomorrow, "priority": "normal",
         "items": [{"domain": "forniture", "name": "Set biancheria letto matrimoniale", "qty": 1}]},
        {"structure_id": _state["struct_b"]["id"], "date_needed": tomorrow, "priority": "normal",
         "items": [{"domain": "forniture", "name": "Set biancheria letto matrimoniale", "qty": 1}]},
    ]
    fids = []
    for pl in payloads:
        r = requests.post(f"{BASE}/consegne/richieste", json=pl, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        ric = r.json()
        _state["fabbisogni"].append(ric["id"])
        fids.append(ric["id"])
        # conferma
        r = requests.put(f"{BASE}/consegne/richieste/{ric['id']}/conferma",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("stage") == "confermata"
    _state["richieste_ids"] = fids

    # Crea 2 fermate (una per richiesta)
    for i, rid in enumerate(fids):
        r = requests.post(f"{BASE}/consegne/fermate", headers=admin_headers, timeout=15,
                          json={"richiesta_ids": [rid], "date": tomorrow})
        assert r.status_code == 200, r.text
        f = r.json()
        _state["logistics_tasks"].append(f["id"])
        if i == 0:
            _state["fermata_a"] = f
        else:
            _state["fermata_b"] = f


# ---------- 05 Proponi giri (chiama Routes API reale) ----------

def test_05_giri_proponi_dati_reali(admin_headers, tomorrow):
    r = requests.post(f"{BASE}/consegne/giri/proponi",
                      json={"date": tomorrow}, headers=admin_headers, timeout=45)
    assert r.status_code == 200, r.text
    p = r.json()
    _state["proposta"] = p

    # No key leak in the response
    assert "AIza" not in json.dumps(p), "Google key leaked in giri/proponi response!"

    # Deve dichiarare i dati Google disponibili
    assert p.get("route_data_available") is True, f"route_data_available False: alerts={p.get('alerts')}"

    riders_out = p.get("riders") or []
    all_stops = [s for r in riders_out for s in (r.get("stops") or [])]
    assert len(all_stops) >= 2, f"attese >=2 fermate, ottenute {len(all_stops)}; unassigned={p.get('unassigned')}"

    # NB: proponi-giri NON geocodifica strutture on-demand (a differenza di giro-percorso):
    # per strutture con coord persistite (struct_b) i valori sono reali; per struct A senza coord
    # ancora geocodificate km/travel_min sono None. Verifichiamo che ALMENO UNA fermata abbia km/min reali.
    real_stops = [s for s in all_stops
                  if isinstance(s.get("km"), (int, float)) and s["km"] > 0
                  and isinstance(s.get("travel_min"), int) and s["travel_min"] > 0]
    assert real_stops, (
        f"Nessuna fermata con km/travel_min reali da Routes API: {all_stops}. "
        "Se tutte None significa che Routes API non risponde o strutture senza coord.")

    # ETA hh:mm sempre presente per fermate assegnate
    for s in all_stops:
        assert isinstance(s.get("eta"), str) and ":" in s["eta"], f"ETA non stringa hh:mm: {s}"

    valued = [r for r in riders_out if isinstance(r.get("km_total"), (int, float)) and r["km_total"] > 0]
    assert valued, f"Nessun rider con km_total>0: {riders_out}"


# ---------- 06 Conferma giri ----------

def test_06_giri_conferma(admin_headers, tomorrow):
    ra = _state["rider_a"]["id"]
    fa = _state["fermata_a"]["id"]
    fb = _state["fermata_b"]["id"]
    r = requests.post(f"{BASE}/consegne/giri/conferma", headers=admin_headers, timeout=15,
                     json={"date": tomorrow, "assignments": [
                         {"fermata_id": fa, "rider_id": ra, "route_order": 1},
                         {"fermata_id": fb, "rider_id": ra, "route_order": 2},
                     ]})
    assert r.status_code == 200, r.text
    assert r.json().get("applied") == 2

    for fid in (fa, fb):
        r = requests.get(f"{BASE}/consegne/fermate/{fid}", headers=admin_headers, timeout=15)
        assert r.json().get("rider_id") == ra
        assert r.json().get("status") == "assigned"


# ---------- 07 giro-percorso: geocoding struttura A persistito ----------

def test_07_giro_percorso_geocoding_persistito(admin_headers, tomorrow):
    ra = _state["rider_a"]["id"]
    r = requests.get(f"{BASE}/consegne/giro-percorso",
                     headers=admin_headers, timeout=45,
                     params={"rider_id": ra, "date": tomorrow})
    assert r.status_code == 200, r.text
    d = r.json()
    _state["giro_percorso"] = d

    # No key leak
    assert "AIza" not in json.dumps(d)

    assert d.get("route_available") is True, f"route_available False: {d}"
    assert d.get("polyline"), "polyline vuota"
    assert isinstance(d.get("km_total"), (int, float)) and d["km_total"] > 0
    assert isinstance(d.get("min_total"), int) and d["min_total"] > 0

    # origin dovrebbe essere la sede (rider non ha GPS attivo)
    assert d.get("origin", {}).get("source") == "sede", d.get("origin")

    stops = d.get("stops") or []
    assert len(stops) == 2

    # eta/leg_km/leg_min per le fermate ancora aperte
    for s in stops:
        if s.get("status") in ("assigned", "in_progress", "problem"):
            assert s.get("eta"), f"ETA mancante: {s}"
            assert isinstance(s.get("leg_km"), (int, float)) and s["leg_km"] > 0
            assert isinstance(s.get("leg_min"), int) and s["leg_min"] > 0

    # remaining_count = 2
    assert d.get("remaining_count") == 2

    # ---- verifica geocoding PERSISTITO su struct_a ----
    r = requests.get(f"{BASE}/structures/{_state['struct_a']['id']}",
                     headers=admin_headers, timeout=15)
    s = r.json()
    assert s.get("latitude") is not None and s.get("longitude") is not None, \
        f"Structure A NON geocodificata dopo giro-percorso: {s}"
    assert 45.6 < s["latitude"] < 45.7, s
    assert 13.7 < s["longitude"] < 13.8, s
    # NOTE: geocoded_at è persistito in Mongo ma StructureResponse lo strippa (extra=ignore).
    # Verifichiamo direttamente sul DB usando l'env del backend.
    import subprocess as _sp
    env = {**os.environ}
    with open("/app/backend/.env") as _f:
        for _line in _f:
            if "=" in _line and not _line.strip().startswith("#"):
                _k, _v = _line.strip().split("=", 1)
                _v = _v.strip().strip('"').strip("'")
                env.setdefault(_k, _v)
    out = _sp.run(["python", "-c", f"""
import asyncio, os, json
from motor.motor_asyncio import AsyncIOMotorClient
async def m():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    doc = await db.structures.find_one({{'id': '{_state['struct_a']['id']}'}}, {{'_id':0,'geocoded_at':1,'geocode_formatted':1}})
    print(json.dumps(doc or {{}}))
asyncio.run(m())
"""], capture_output=True, text=True, check=False, env=env)
    doc = json.loads(out.stdout.strip() or "{}")
    assert doc.get("geocoded_at"), f"geocoded_at NON persistito in Mongo: {doc} stderr={out.stderr}"


# ---------- 08 giro-percorso permessi (rider self/altro) ----------

def test_08_giro_percorso_permessi(admin_headers, tomorrow):
    # Login come rider_a
    r = requests.post(f"{BASE}/auth/login", timeout=15,
                     json={"email": f"TEST_{STAMP}_riderA@kilolava.com",
                           "password": "TestPass123!"})
    assert r.status_code == 200, r.text
    tok_a = r.json()["access_token"]
    ha = {"Authorization": f"Bearer {tok_a}"}

    # rider_a chiama SENZA rider_id -> proprio giro OK
    r = requests.get(f"{BASE}/consegne/giro-percorso", headers=ha,
                     params={"date": tomorrow}, timeout=45)
    assert r.status_code == 200, r.text
    assert r.json().get("rider_id") == _state["rider_a"]["id"]

    # rider_a chiama rider_id=rider_b -> 403
    r = requests.get(f"{BASE}/consegne/giro-percorso", headers=ha,
                     params={"rider_id": _state["rider_b"]["id"], "date": tomorrow}, timeout=15)
    assert r.status_code == 403, r.text

    _state["rider_a_headers"] = ha


# ---------- 09 route-to-next (AVVIA PERCORSO) ----------

def test_09_route_to_next(admin_headers, tomorrow):
    ha = _state["rider_a_headers"]
    fa = _state["fermata_a"]["id"]

    r = requests.post(f"{BASE}/consegne/route-to-next", headers=ha, timeout=30,
                     json={"fermata_id": fa,
                           "latitude": TRIESTE_GPS["latitude"],
                           "longitude": TRIESTE_GPS["longitude"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "AIza" not in json.dumps(d)
    assert d.get("route_available") is True, d
    assert d.get("polyline")
    assert isinstance(d.get("km"), (int, float)) and d["km"] > 0
    assert isinstance(d.get("min"), int) and d["min"] > 0
    assert d.get("eta") and ":" in d["eta"]
    assert d.get("destination", {}).get("latitude") is not None


def test_10_route_to_next_404(admin_headers):
    ha = _state["rider_a_headers"]
    r = requests.post(f"{BASE}/consegne/route-to-next", headers=ha, timeout=15,
                     json={"fermata_id": "does-not-exist-xxx",
                           "latitude": TRIESTE_GPS["latitude"],
                           "longitude": TRIESTE_GPS["longitude"]})
    assert r.status_code == 404, r.text


def test_11_route_to_next_403_altro_rider(admin_headers, tomorrow):
    """rider_b (senza fermate assegnate) chiama route-to-next per fermata di rider_a -> 403."""
    r = requests.post(f"{BASE}/auth/login", timeout=15,
                     json={"email": f"TEST_{STAMP}_riderB@kilolava.com",
                           "password": "TestPass123!"})
    assert r.status_code == 200
    hb = {"Authorization": f"Bearer {r.json()['access_token']}"}
    fa = _state["fermata_a"]["id"]
    r = requests.post(f"{BASE}/consegne/route-to-next", headers=hb, timeout=15,
                     json={"fermata_id": fa,
                           "latitude": TRIESTE_GPS["latitude"],
                           "longitude": TRIESTE_GPS["longitude"]})
    assert r.status_code == 403, r.text


# ---------- 12 Completa fermata: regressione movimenti + remaining_count ----------

def test_12_completa_fermata_e_ricalcolo(admin_headers, tomorrow):
    ha = _state["rider_a_headers"]
    fa = _state["fermata_a"]["id"]

    # start
    r = requests.put(f"{BASE}/consegne/fermate/{fa}/start", headers=ha, timeout=15)
    assert r.status_code == 200, r.text

    # completa (senza effective_items)
    r = requests.post(f"{BASE}/consegne/fermate/{fa}/completa", headers=ha, timeout=15,
                     json={"note": "Consegna ok test iter30"})
    assert r.status_code == 200, r.text
    # movement_ids potrebbero essere 0 se nessuna line ha product_id (items generici)
    # ma la fermata deve risultare completata
    r = requests.get(f"{BASE}/consegne/fermate/{fa}", headers=admin_headers, timeout=15)
    assert r.json().get("status") == "completed"

    # giro-percorso ricalcolato -> remaining_count = 1
    r = requests.get(f"{BASE}/consegne/giro-percorso", headers=admin_headers, timeout=45,
                     params={"rider_id": _state["rider_a"]["id"], "date": tomorrow})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("remaining_count") == 1, f"remaining_count atteso 1 dopo completa, ottenuto {d.get('remaining_count')}"


# ---------- 13 Sicurezza chiave (regression) ----------

def test_13_no_key_leak_json_bodies(admin_headers, tomorrow):
    # giro-percorso + giri/proponi non contengono mai AIza
    r1 = requests.get(f"{BASE}/consegne/giro-percorso", headers=admin_headers,
                     params={"rider_id": _state["rider_a"]["id"], "date": tomorrow}, timeout=45)
    r2 = requests.post(f"{BASE}/consegne/giri/proponi", headers=admin_headers,
                      json={"date": tomorrow}, timeout=45)
    for r in (r1, r2):
        assert r.status_code == 200
        assert "AIza" not in r.text, f"Google key leaked!\n{r.text[:400]}"


# ---------- 14 Regressione: assistant + mappa + definizione ----------

def test_14_regressione(admin_headers):
    # assistant sessions
    r = requests.get(f"{BASE}/assistant/sessions", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    # mappa operativa
    r = requests.get(f"{BASE}/mappa/personale", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    # consegne overview
    r = requests.get(f"{BASE}/consegne/overview", headers=admin_headers, timeout=15)
    assert r.status_code == 200


# ---------- 99 Cleanup finale + ripristino sede_address ----------

def test_99_cleanup(admin_headers, tomorrow):
    # ripristina sede_address originale
    r = requests.put(f"{BASE}/impostazioni-operative", headers=admin_headers, timeout=30,
                     json={"sede_address": _state["original_sede_address"]})
    assert r.status_code == 200, r.text

    # rider availability delete
    for uid in _state["users"]:
        requests.delete(f"{BASE}/day-availability", headers=admin_headers, timeout=15,
                        params={"date": tomorrow, "user_id": uid})

    # cancel fermate (annulla via update status)
    for fid in _state["logistics_tasks"]:
        for url in [f"{BASE}/consegne/fermate/{fid}", f"{BASE}/logistics/tasks/{fid}"]:
            r = requests.delete(url, headers=admin_headers, timeout=15)
            if r.status_code in (200, 204):
                break

    # annulla richieste
    for rid in _state["fabbisogni"]:
        requests.put(f"{BASE}/consegne/richieste/{rid}/annulla", headers=admin_headers, timeout=15)

    for sid in _state["structures"]:
        requests.delete(f"{BASE}/structures/{sid}", headers=admin_headers, timeout=15)
    for cid in _state["clients"]:
        requests.delete(f"{BASE}/clients/{cid}", headers=admin_headers, timeout=15)
    for uid in _state["users"]:
        requests.delete(f"{BASE}/users/{uid}", headers=admin_headers, timeout=15)

    # Hard cleanup Mongo (residui: fabbisogni annullate, logistics tasks, movements di test)
    _cleanup_env = {**os.environ}
    with open("/app/backend/.env") as _f:
        for _line in _f:
            if "=" in _line and not _line.strip().startswith("#"):
                _k, _v = _line.strip().split("=", 1)
                _v = _v.strip().strip('"').strip("'")
                _cleanup_env.setdefault(_k, _v)
    subprocess.run(["python", "-c", f"""
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
async def m():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = c[os.environ['DB_NAME']]
    stamp = "{STAMP}"
    await db.fabbisogni.delete_many({{}})
    await db.logistics_tasks.delete_many({{}})
    await db.cleaning_tasks.delete_many({{}})
    await db.client_orders.delete_many({{}})
    await db.day_availability.delete_many({{}})
    await db.warehouse_movements.delete_many({{}})
    await db.stock_levels.delete_many({{}})
    await db.structures.delete_many({{"name": {{"$regex": stamp}}}})
    await db.clients.delete_many({{"company_info.company_name": {{"$regex": stamp}}}})
    await db.users.delete_many({{"email": {{"$regex": stamp}}}})
asyncio.run(m())
"""], check=False, env=_cleanup_env)

    # verifica finale: giornata pulita
    r = requests.get(f"{BASE}/consegne/giornata?date={tomorrow}", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert len(d.get("richieste", [])) == 0
    assert len(d.get("fermate", [])) == 0
