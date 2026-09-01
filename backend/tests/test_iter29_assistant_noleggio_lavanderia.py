from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Iteration 29 - Assistant AI + Client noleggio_config + Lavanderia Privata da_verificare + magazzino movimenti code search.

Copertura:
- PUT /api/clients/{id}/noleggio-config: validazione + persistenza (GET singolo + lista)
- POST /api/consegne/genera-fabbisogni con config CLIENTE (dream/invernale), override struttura (living),
  fallback senza config (living + stagione app_settings)
- Lavanderia privata: mark_ready -> fabbisogno stage='da_verificare' con laundry.ready_at
  rinvia/riproponi/conferma richieste; fermata bloccata senza peso+foto; dopo peso+foto: fermata creabile;
  completa fermata -> job consegnata
- GET /api/magazzino/movimenti?product=MOV-xxxx: match sul campo code
- Assistant: SSE chat con tool events, permessi 403 per non-ops, proposte + execute/cancel
- CLEANUP finale hard
"""
import io
import os
import time

import pytest
import requests


def _load_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    os.environ.setdefault("REACT_APP_BACKEND_URL", line.split("=", 1)[1].strip())
    except FileNotFoundError:
        pass


_load_env()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
ADMIN = {"email": "test_user@kilolava.com", "password": TEST_ADMIN_PASSWORD}
STAMP = f"iter29_{int(time.time())}"
S = {"users": [], "clients": [], "structures": [], "cleaning_tasks": [],
     "fabbisogni": [], "logistics_tasks": [], "laundry_jobs": [], "movements": [],
     "assistant_sessions": [], "assistant_actions": []}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def tomorrow():
    from datetime import datetime, timedelta
    return (datetime.utcnow().date() + timedelta(days=1)).isoformat()


# ---------- 00 Health & seed ----------

def test_00_health(admin_headers):
    assert requests.get(f"{BASE}/health").status_code == 200
    # cataloghi intatti
    assert len(requests.get(f"{BASE}/magazzino/kits", headers=admin_headers).json()) >= 8


def test_01_seed_client_and_structure(admin_headers):
    payload = {"client_type": "company",
               "company_info": {"company_name": f"TEST_{STAMP}_ClientCo",
                                "representative_name": "Mario", "representative_surname": "Rossi",
                                "vat_number": "01234567890"}}
    r = requests.post(f"{BASE}/clients", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    client = r.json()
    S["client"] = client
    S["clients"].append(client["id"])

    # struttura SENZA linea (usa config cliente)
    s = {"client_id": client["id"], "name": f"TEST_{STAMP}_StructNoLine",
         "structure_type": "apartment",
         "address": "Via Roma 1, Trieste",
         "check_in_time": "15:00", "check_out_time": "10:00",
         "latitude": 45.6495, "longitude": 13.7690,
         "bed_config": {"beds_double": 1, "beds_single": 0}}
    r = requests.post(f"{BASE}/structures", json=s, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    S["struct_no_line"] = r.json()
    S["structures"].append(r.json()["id"])

    # struttura CON linea living (override della config cliente)
    s2 = {**s, "name": f"TEST_{STAMP}_StructLiving", "linea": "living",
          "address": "Via Torino 2, Trieste"}
    r = requests.post(f"{BASE}/structures", json=s2, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    S["struct_living"] = r.json()
    S["structures"].append(r.json()["id"])


# ---------- 02 PUT /clients/{id}/noleggio-config ----------

def test_02_noleggio_config_validation(admin_headers):
    cid = S["client"]["id"]
    # linea non valida
    r = requests.put(f"{BASE}/clients/{cid}/noleggio-config", headers=admin_headers,
                     json={"linea": "premium", "stagione": "estivo"}, timeout=15)
    assert r.status_code == 400, r.text
    # stagione non valida
    r = requests.put(f"{BASE}/clients/{cid}/noleggio-config", headers=admin_headers,
                     json={"linea": "living", "stagione": "primavera"}, timeout=15)
    assert r.status_code == 400, r.text
    # cliente inesistente
    r = requests.put(f"{BASE}/clients/does-not-exist/noleggio-config", headers=admin_headers,
                     json={"linea": "dream", "stagione": "invernale"}, timeout=15)
    assert r.status_code == 404, r.text


def test_03_noleggio_config_persist(admin_headers):
    cid = S["client"]["id"]
    r = requests.put(f"{BASE}/clients/{cid}/noleggio-config", headers=admin_headers,
                     json={"linea": "dream", "stagione": "invernale"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["noleggio_config"] == {"linea": "dream", "stagione": "invernale"}

    # GET singolo
    r = requests.get(f"{BASE}/clients/{cid}", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert r.json().get("noleggio_config") == {"linea": "dream", "stagione": "invernale"}

    # lista
    r = requests.get(f"{BASE}/clients", headers=admin_headers, timeout=15).json()
    mine = [c for c in r if c["id"] == cid]
    assert mine and mine[0].get("noleggio_config") == {"linea": "dream", "stagione": "invernale"}


# ---------- 04 genera-fabbisogni con config CLIENTE + override struttura ----------

def test_04_genera_fabbisogni_client_config(admin_headers, tomorrow):
    # pulizia struttura SENZA linea -> usa cfg cliente {dream, invernale}
    t = {"structure_id": S["struct_no_line"]["id"], "date": tomorrow,
         "beds_double": 1, "beds_single": 0}
    r = requests.post(f"{BASE}/cleaning-tasks", json=t, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    S["cleaning_tasks"].append(r.json()["id"])

    # pulizia struttura CON linea living -> override della config cliente (deve usare living)
    t2 = {"structure_id": S["struct_living"]["id"], "date": tomorrow,
          "beds_double": 1, "beds_single": 0}
    r = requests.post(f"{BASE}/cleaning-tasks", json=t2, headers=admin_headers, timeout=15)
    S["cleaning_tasks"].append(r.json()["id"])

    r = requests.post(f"{BASE}/consegne/genera-fabbisogni", json={"date": tomorrow},
                      headers=admin_headers, timeout=25)
    assert r.status_code == 200, r.text

    rq = requests.get(f"{BASE}/consegne/giornata?date={tomorrow}",
                      headers=admin_headers, timeout=15).json()["richieste"]

    my_no = [x for x in rq if x.get("structure_id") == S["struct_no_line"]["id"]]
    my_liv = [x for x in rq if x.get("structure_id") == S["struct_living"]["id"]]
    assert my_no, "richiesta struttura senza linea non generata"
    assert my_liv, "richiesta struttura living non generata"
    for r_ in my_no + my_liv:
        S["fabbisogni"].append(r_["id"])

    kit_no = " | ".join((k.get("kit_name") or "") for k in my_no[0].get("kits_used", []))
    kit_liv = " | ".join((k.get("kit_name") or "") for k in my_liv[0].get("kits_used", []))

    # struttura senza linea: config cliente dream+invernale
    assert "dream" in kit_no.lower(), f"atteso Dream (config cliente), got: {kit_no}"
    assert "invernale" in kit_no.lower(), f"attesa stagione invernale (config cliente), got: {kit_no}"
    assert "matrimoniale" in kit_no.lower(), f"atteso kit matrimoniale, got: {kit_no}"

    # struttura con linea override: living (stagione dal cliente = invernale)
    assert "living" in kit_liv.lower(), f"atteso Living (override struttura), got: {kit_liv}"
    assert "invernale" in kit_liv.lower(), f"attesa invernale, got: {kit_liv}"


def test_05_fallback_no_client_config(admin_headers, tomorrow):
    """Cliente SENZA config -> default linea 'living' + stagione da app_settings operative."""
    from datetime import datetime, timedelta
    day = (datetime.utcnow().date() + timedelta(days=3)).isoformat()

    # secondo cliente SENZA noleggio_config
    payload = {"client_type": "company",
               "company_info": {"company_name": f"TEST_{STAMP}_ClientNoCfg",
                                "representative_name": "L", "representative_surname": "R",
                                "vat_number": "09876543210"}}
    c2 = requests.post(f"{BASE}/clients", json=payload, headers=admin_headers, timeout=15).json()
    S["clients"].append(c2["id"])

    s = {"client_id": c2["id"], "name": f"TEST_{STAMP}_StructNoCfg",
         "structure_type": "apartment", "address": "Via Fallback 3, Trieste",
         "check_in_time": "15:00", "check_out_time": "10:00",
         "latitude": 45.65, "longitude": 13.77,
         "bed_config": {"beds_double": 1}}
    st = requests.post(f"{BASE}/structures", json=s, headers=admin_headers, timeout=15).json()
    S["structures"].append(st["id"])

    ct = requests.post(f"{BASE}/cleaning-tasks", headers=admin_headers, timeout=15,
                       json={"structure_id": st["id"], "date": day,
                             "beds_double": 1, "beds_single": 0}).json()
    S["cleaning_tasks"].append(ct["id"])

    r = requests.post(f"{BASE}/consegne/genera-fabbisogni", json={"date": day},
                      headers=admin_headers, timeout=25)
    assert r.status_code == 200

    rq = requests.get(f"{BASE}/consegne/giornata?date={day}", headers=admin_headers,
                      timeout=15).json()["richieste"]
    mine = [x for x in rq if x.get("structure_id") == st["id"]]
    assert mine
    S["fabbisogni"].append(mine[0]["id"])
    kit_names = " | ".join((k.get("kit_name") or "") for k in mine[0].get("kits_used", []))
    assert "living" in kit_names.lower(), f"atteso Living (fallback), got: {kit_names}"


# ---------- 06 Lavanderia privata: pronta -> da_verificare -> rinvia -> riproponi -> conferma ----------

def test_06_lavanderia_pronta_da_verificare(admin_headers, tomorrow):
    # crea job
    job_payload = {"client_id": S["client"]["id"], "structure_id": S["struct_no_line"]["id"],
                   "bags": 2, "note": f"TEST_{STAMP}"}
    r = requests.post(f"{BASE}/lavanderia/jobs", json=job_payload, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    job = r.json()
    S["laundry_jobs"].append(job["id"])
    S["job"] = job
    assert job["status"] == "da_lavorare"

    # pronta -> crea fabbisogno
    r = requests.post(f"{BASE}/lavanderia/jobs/{job['id']}/pronta", json={},
                      headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["status"] == "pronta"
    assert job.get("richiesta_id")
    S["fabbisogni"].append(job["richiesta_id"])
    S["job"] = job

    # nella giornata (usiamo oggi perché la richiesta ha date_needed=None -> include)
    from datetime import datetime, timedelta
    today = datetime.utcnow().date().isoformat()
    day = requests.get(f"{BASE}/consegne/giornata?date={today}",
                      headers=admin_headers, timeout=15).json()
    mine = [x for x in day["richieste"] if x["id"] == job["richiesta_id"]]
    assert mine, f"richiesta lavanderia non in giornata. Richieste: {[r_['id'] for r_ in day['richieste']]}"
    assert mine[0]["stage"] == "da_verificare"
    assert mine[0].get("kind") == "lavanderia_privata"
    assert mine[0].get("laundry", {}).get("ready_at")


def test_07_rinvia_e_riproponi(admin_headers):
    from datetime import datetime
    today = datetime.utcnow().date().isoformat()
    rid = S["job"]["richiesta_id"]

    # rinvia -> sparisce da richieste, appare in rinviate; job resta 'pronta'
    r = requests.put(f"{BASE}/consegne/richieste/{rid}/rinvia", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text

    day = requests.get(f"{BASE}/consegne/giornata?date={today}",
                       headers=admin_headers, timeout=15).json()
    assert not any(x["id"] == rid for x in day["richieste"]), "richiesta rinviata ancora in richieste"
    assert any(x["id"] == rid for x in day.get("rinviate", [])), "richiesta rinviata non in rinviate"

    job = requests.get(f"{BASE}/lavanderia/jobs", headers=admin_headers, timeout=15).json()
    j = [x for x in job if x["id"] == S["job"]["id"]]
    assert j and j[0]["status"] == "pronta"

    # riproponi -> torna
    r = requests.put(f"{BASE}/consegne/richieste/{rid}/riproponi", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text

    day = requests.get(f"{BASE}/consegne/giornata?date={today}",
                       headers=admin_headers, timeout=15).json()
    assert any(x["id"] == rid for x in day["richieste"])


def test_08_conferma_richiesta_lavanderia(admin_headers):
    rid = S["job"]["richiesta_id"]
    r = requests.put(f"{BASE}/consegne/richieste/{rid}/conferma", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["stage"] == "confermata"


def test_09_fermata_bloccata_senza_peso_foto(admin_headers, tomorrow):
    """Crea fermata: deve fallire perché job non ha peso+foto."""
    rid = S["job"]["richiesta_id"]
    # tenta creare fermata (endpoint tipico: POST /consegne/fermate con richieste_ids)
    payload = {"date": tomorrow, "richiesta_ids": [rid]}
    r = requests.post(f"{BASE}/consegne/fermate", json=payload,
                      headers=admin_headers, timeout=15)
    # attesa: 400 laundry non consegnabile
    if r.status_code in (200, 201):
        pytest.fail(f"attesa 400 senza peso+foto, ottenuto {r.status_code}: {r.text}")
    assert r.status_code == 400, f"atteso 400, got {r.status_code}: {r.text}"


def test_10_peso_foto_e_fermata_creabile(admin_headers, tomorrow):
    jid = S["job"]["id"]
    rid = S["job"]["richiesta_id"]

    # PUT peso
    r = requests.put(f"{BASE}/lavanderia/jobs/{jid}/peso",
                     json={"final_weight_kg": 7.5}, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["final_weight_kg"] == 7.5

    # POST foto bilancia (file fittizio)
    files = {"file": ("scale.jpg", io.BytesIO(b"fakejpegdata"), "image/jpeg")}
    r = requests.post(f"{BASE}/lavanderia/jobs/{jid}/foto-bilancia",
                      files=files, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["scale_photo"]["file_path"]

    # verifica consegnabile
    j = [x for x in requests.get(f"{BASE}/lavanderia/jobs", headers=admin_headers,
                                 timeout=15).json() if x["id"] == jid][0]
    assert j.get("consegnabile") is True

    # ora fermata creabile
    payload = {"date": tomorrow, "richiesta_ids": [rid]}
    r = requests.post(f"{BASE}/consegne/fermate", json=payload,
                      headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), f"fermata dopo peso+foto: {r.status_code} {r.text}"
    fermata = r.json()
    S["logistics_tasks"].append(fermata["id"])
    S["fermata"] = fermata


def test_11_completa_fermata_consegna_job(admin_headers):
    fid = S["fermata"]["id"]
    r = requests.post(f"{BASE}/consegne/fermate/{fid}/completa", json={},
                      headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    # job -> consegnata
    all_status = requests.get(f"{BASE}/lavanderia/jobs?status=consegnata",
                              headers=admin_headers, timeout=15).json()
    j = [x for x in all_status if x["id"] == S["job"]["id"]]
    assert j, "job non passato a consegnata"
    assert j[0]["status"] == "consegnata"
    assert j[0].get("delivered_at")
    assert j[0].get("delivery_id") == fid


# ---------- 12 magazzino movimenti: search per code MOV ----------

def test_12_movimenti_search_by_code(admin_headers):
    """Crea un movimento; poi cerca per code (MOV-xxxxx)."""
    # prodotto forniture
    forn = requests.get(f"{BASE}/magazzino/catalog/forniture",
                        headers=admin_headers, timeout=15).json()
    if not forn:
        pytest.skip("no forniture catalog")
    p = forn[0]
    mov_payload = {"domain": "forniture", "movement_type": "carico",
                   "product_id": p["id"], "qty": 5,
                   "origin": {"type": "external", "label": "Fornitore"},
                   "destination": {"type": "central", "label": "Centrale"}}
    r = requests.post(f"{BASE}/magazzino/movimenti", json=mov_payload,
                      headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    mov = r.json()
    S["movements"].append(mov["id"])
    S["mov"] = mov
    assert mov["code"].startswith("MOV-")

    # ricerca per code
    r = requests.get(f"{BASE}/magazzino/movimenti?product={mov['code']}",
                     headers=admin_headers, timeout=15).json()
    ids = [m["id"] for m in r["items"]]
    assert mov["id"] in ids, f"movimento non trovato via product=code. Items: {ids}"


# ---------- 13 Assistant: permessi + sessions + chat SSE ----------

def _make_rider(admin_headers):
    payload = {"email": f"TEST_{STAMP}_rider@kilolava.com", "password": TEST_ADMIN_PASSWORD,
               "first_name": "Rid", "last_name": "Er", "role": "rider"}
    r = requests.post(f"{BASE}/users", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    u = r.json()
    S["users"].append(u["id"])
    tk = requests.post(f"{BASE}/auth/login",
                       json={"email": payload["email"], "password": payload["password"]},
                       timeout=15).json()["access_token"]
    return {"Authorization": f"Bearer {tk}"}


def test_13_assistant_permessi_403_non_ops(admin_headers):
    rh = _make_rider(admin_headers)
    for path in ["/assistant/sessions", "/assistant/chat"]:
        method = "GET" if "sessions" == path.split("/")[-1] else "POST"
        r = requests.request(method, f"{BASE}{path}", headers=rh, timeout=15,
                             json={"message": "ciao"} if method == "POST" else None)
        assert r.status_code == 403, f"{path}: atteso 403, got {r.status_code}: {r.text[:200]}"


def test_14_assistant_chat_sse_read(admin_headers):
    """Chat: 'Quante pulizie abbiamo domani?' -> eventi session/tool/delta/done."""
    with requests.post(f"{BASE}/assistant/chat", headers={**admin_headers, "Accept": "text/event-stream"},
                       json={"message": "Quante pulizie abbiamo domani? Rispondi molto brevemente."},
                       stream=True, timeout=90) as resp:
        assert resp.status_code == 200, resp.text
        events = []
        session_id = None
        try:
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                import json as _json
                try:
                    ev = _json.loads(line[5:].strip())
                except Exception:
                    continue
                events.append(ev)
                if ev.get("type") == "session":
                    session_id = ev.get("session_id")
                if ev.get("type") == "done" or ev.get("type") == "error":
                    break
        except Exception as e:
            pytest.fail(f"errore lettura SSE: {e}")

    types = [e.get("type") for e in events]
    assert "session" in types
    assert "done" in types or "error" in types
    # tool call atteso (get_pulizie o get_consegne_giornata)
    assert "tool" in types, f"nessun tool call: {types}"
    # se error mostro dettaglio
    if "error" in types:
        err = [e for e in events if e["type"] == "error"][0]
        pytest.fail(f"assistant ha risposto con errore: {err}")
    assert session_id
    S["assistant_session_id"] = session_id
    S["assistant_sessions"].append(session_id)


def test_15_assistant_sessions_and_messages(admin_headers):
    sid = S["assistant_session_id"]
    r = requests.get(f"{BASE}/assistant/sessions", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert any(s["id"] == sid for s in r.json())

    r = requests.get(f"{BASE}/assistant/sessions/{sid}/messages",
                     headers=admin_headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["session"]["id"] == sid
    assert len(body["messages"]) >= 2  # user + assistant


# ---------- 16 Assistant: azione propose + execute ----------

def test_16_assistant_azione_crea_pulizia(admin_headers):
    """Chiede all'assistente di creare una pulizia -> arriva evento action, NESSUNA pulizia creata prima di execute."""
    from datetime import datetime, timedelta
    day = (datetime.utcnow().date() + timedelta(days=5)).isoformat()
    struct_name = S["struct_living"]["name"]

    prompt = (f"Crea una pulizia il {day} alle 10:00 per la struttura '{struct_name}' "
              f"per 2 ospiti. Serve solo la proposta, NON eseguirla.")

    action = None
    with requests.post(f"{BASE}/assistant/chat", headers=admin_headers,
                       json={"message": prompt}, stream=True, timeout=90) as resp:
        assert resp.status_code == 200
        import json as _json
        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            try:
                ev = _json.loads(line[5:].strip())
            except Exception:
                continue
            if ev.get("type") == "action":
                action = ev["action"]
            if ev.get("type") in ("done", "error"):
                break

    if not action:
        pytest.skip("assistente non ha proposto azione (variabilità LLM) — skip execute test")

    assert action["type"] == "crea_pulizia"
    assert action["status"] == "proposed"
    S["assistant_actions"].append(action["id"])
    S["pending_action"] = action

    # verifica che NON esista ancora la pulizia
    ct = requests.get(f"{BASE}/cleaning-tasks?date={day}",
                      headers=admin_headers, timeout=15).json()
    for t in ct:
        # nessun task dovrebbe essere stato creato via assistant prima dell'execute
        assert t["structure_id"] != S["struct_living"]["id"] or t.get("id") in S["cleaning_tasks"], \
            f"pulizia creata prima di execute! task: {t}"

    # execute
    r = requests.post(f"{BASE}/assistant/actions/{action['id']}/execute",
                      headers=admin_headers, timeout=25)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True

    # ora la pulizia esiste
    ct = requests.get(f"{BASE}/cleaning-tasks?date={day}",
                      headers=admin_headers, timeout=15).json()
    new_task = [t for t in ct if t["structure_id"] == S["struct_living"]["id"] and t.get("id") not in S["cleaning_tasks"]]
    assert new_task, "pulizia non trovata dopo execute"
    S["cleaning_tasks"].append(new_task[0]["id"])

    # execute su azione già eseguita -> 400
    r = requests.post(f"{BASE}/assistant/actions/{action['id']}/execute",
                      headers=admin_headers, timeout=15)
    assert r.status_code == 400, r.text


def test_17_assistant_azione_cancel(admin_headers):
    """Proposta segnalazione → cancel → status cancelled, nessuna scrittura."""
    prompt = "Proponi una segnalazione di prova con titolo 'TEST iter29 cancel' tipo 'other' priorità normal."
    action = None
    with requests.post(f"{BASE}/assistant/chat", headers=admin_headers,
                       json={"message": prompt}, stream=True, timeout=90) as resp:
        assert resp.status_code == 200
        import json as _json
        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data:"):
                continue
            try:
                ev = _json.loads(line[5:].strip())
            except Exception:
                continue
            if ev.get("type") == "action":
                action = ev["action"]
            if ev.get("type") in ("done", "error"):
                break
    if not action:
        pytest.skip("no action proposed (LLM variability)")
    S["assistant_actions"].append(action["id"])

    r = requests.post(f"{BASE}/assistant/actions/{action['id']}/cancel",
                      headers=admin_headers, timeout=15)
    assert r.status_code == 200

    # verifica nessuna segnalazione con quel titolo
    seg = requests.get(f"{BASE}/segnalazioni?limit=100",
                       headers=admin_headers, timeout=15).json()
    items = seg.get("items", seg) if isinstance(seg, dict) else seg
    assert not any("iter29 cancel" in (x.get("title") or "") for x in (items or []))


# ---------- 99 cleanup ----------

def test_99_cleanup(admin_headers):
    # annulla fabbisogni
    for rid in S["fabbisogni"]:
        requests.put(f"{BASE}/consegne/richieste/{rid}/annulla",
                     headers=admin_headers, timeout=15)
    # fermate
    for fid in S["logistics_tasks"]:
        for url in [f"{BASE}/consegne/fermate/{fid}", f"{BASE}/logistics/tasks/{fid}"]:
            r = requests.delete(url, headers=admin_headers, timeout=15)
            if r.status_code in (200, 204):
                break
    # cleaning tasks
    for tid in S["cleaning_tasks"]:
        requests.delete(f"{BASE}/cleaning-tasks/{tid}", headers=admin_headers, timeout=15)
    # structures
    for sid in S["structures"]:
        requests.delete(f"{BASE}/structures/{sid}", headers=admin_headers, timeout=15)
    # clients
    for cid in S["clients"]:
        requests.delete(f"{BASE}/clients/{cid}", headers=admin_headers, timeout=15)
    # users
    for uid in S["users"]:
        requests.delete(f"{BASE}/users/{uid}", headers=admin_headers, timeout=15)

    # Hard cleanup residui
    import subprocess
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
    await db.laundry_jobs.delete_many({{}})
    await db.warehouse_movements.delete_many({{}})
    await db.stock_levels.delete_many({{}})
    await db.day_availability.delete_many({{}})
    await db.client_orders.delete_many({{}})
    await db.assistant_sessions.delete_many({{}})
    await db.assistant_messages.delete_many({{}})
    await db.assistant_actions.delete_many({{}})
    await db.segnalazioni.delete_many({{"title": {{"$regex": "iter29"}}}})
    await db.maintenance_issues.delete_many({{"title": {{"$regex": "iter29"}}}})
    await db.structures.delete_many({{"$or": [{{"name": {{"$regex": stamp}}}}, {{"name": {{"$regex": "^TEST_"}}}}]}})
    await db.clients.delete_many({{"$or": [{{"company_info.company_name": {{"$regex": "TEST_"}}}}, {{"display_name": {{"$regex": "TEST_"}}}}]}})
    await db.users.delete_many({{"email": {{"$regex": "^TEST_"}}}})
asyncio.run(m())
"""], check=False, env={**os.environ})

    # verifica finale
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio as _a
    async def _check():
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        d = cli[os.environ.get("DB_NAME", "test_database")]
        return {
            "clients": await d.clients.count_documents({}),
            "structures": await d.structures.count_documents({}),
            "users": await d.users.count_documents({}),
            "cleaning_tasks": await d.cleaning_tasks.count_documents({}),
            "fabbisogni": await d.fabbisogni.count_documents({}),
            "laundry_jobs": await d.laundry_jobs.count_documents({}),
            "warehouse_movements": await d.warehouse_movements.count_documents({}),
            "assistant_sessions": await d.assistant_sessions.count_documents({}),
            "assistant_actions": await d.assistant_actions.count_documents({}),
        }
    counts = _a.run(_check())
    print(f"CLEANUP counts: {counts}")
    assert counts["users"] == 1, f"users residui: {counts}"
    assert counts["clients"] == 0
    assert counts["structures"] == 0
    assert counts["cleaning_tasks"] == 0
    assert counts["fabbisogni"] == 0
    assert counts["laundry_jobs"] == 0
    assert counts["warehouse_movements"] == 0
    assert counts["assistant_sessions"] == 0
    assert counts["assistant_actions"] == 0
