from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Iteration 26 — Test suite Gestione Storni Movimenti (motore unico /api/magazzino/*).

Copre:
 - MOV-XXXXX su ogni movimento
 - POST /movimenti/{id}/storno con body {motivo, nota?}: motivo obbligatorio (422/400) e nota
   obbligatoria se motivo=altro
 - Storno completo: movimento inverso movement_type=storno, origin/destination invertiti,
   qty identica, reverses+reversal_of, delivery_id ereditato
 - Originale IMMUTATO: qty/origin/destination/at/user_name identici, status=stornato + metadata
 - Doppio storno -> 400 {error: gia_stornato, reversal_code}
 - Storno di uno storno -> 400
 - POST /movimenti con movement_type=storno/annullamento -> 400
 - Controllo giacenza: 409 {error: stock_insufficiente, available, required}
 - GET /movimenti/{id o code} con reversal_movement/original_movement
 - GET /movimenti?state=validi|stornati
 - Lista arricchita con reverses_code
 - Flusso CONSEGNA -> movimento -> storno con delivery_id ereditato
 - Fermata completata non annullabile
 - Storno Generale->Zaino
 - Registro Attività contiene la POST storno
 - Permessi (senza token 401/403)
 - Cataloghi intatti (regressione)

Uso:
    pytest /app/backend/tests/test_iter26_storni.py -v --tb=short \
        --junitxml=/app/test_reports/pytest/iter26.xml
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://kilolava-rebuild.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD

STATE = {
    "token": None, "h": None,
    "client_id": None, "structure_id": None, "zaino_id": None,
    "richiesta_id": None, "fermata_id": None,
    "product_nol": None, "product_pul": None,
    "carico_mov_id": None, "carico_mov_code": None,
    "storno_mov_id": None, "storno_mov_code": None,
    "consegna_mov_id": None,
    "transfer_mov_id": None,
    "created_movement_ids": [],  # per audit-log check
    "cleanup_mov_ids_to_storno": [],
}


@pytest.fixture(scope="module", autouse=True)
def _login():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token: {r.json()}"
    STATE["token"] = tok
    STATE["h"] = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def h():
    return STATE["h"]


# ---------------- Cataloghi (regressione) ----------------
def test_00_cataloghi_intatti():
    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/noleggio", headers=h(), timeout=30)
    assert r.status_code == 200 and len(r.json()) == 23
    STATE["product_nol"] = r.json()[0]
    assert STATE["product_nol"]["code"].startswith("NOL-")

    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/pulizie", headers=h(), timeout=30)
    assert r.status_code == 200 and len(r.json()) == 23
    STATE["product_pul"] = r.json()[0]

    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/forniture", headers=h(), timeout=30)
    assert r.status_code == 200 and len(r.json()) == 8

    r = requests.get(f"{BASE_URL}/api/magazzino/kits?domain=noleggio", headers=h(), timeout=30)
    assert r.status_code == 200 and len(r.json()) == 8


# ---------------- Seed cliente + struttura + zaino ----------------
def test_01_seed_client_structure_zaino():
    r = requests.post(f"{BASE_URL}/api/clients", headers=h(), json={
        "client_type": "private",
        "private_info": {"first_name": "TEST_ITER26", "last_name": "Cliente"},
        "notes": "TEST ITER26 - da eliminare", "is_active": True,
    }, timeout=30)
    assert r.status_code in (200, 201), r.text
    STATE["client_id"] = r.json()["id"]

    r = requests.post(f"{BASE_URL}/api/structures", headers=h(), json={
        "client_id": STATE["client_id"],
        "name": "TEST_ITER26_STRUCT", "structure_type": "apartment",
        "address": "Via Test 26",
    }, timeout=30)
    assert r.status_code in (200, 201), r.text
    STATE["structure_id"] = r.json()["id"]

    r = requests.post(f"{BASE_URL}/api/magazzino/zaini", headers=h(), json={
        "name": "TEST_ITER26_ZAINO", "notes": "TEST ITER26",
    }, timeout=30)
    assert r.status_code == 200, r.text
    STATE["zaino_id"] = r.json()["id"]


# ---------------- Carico + verifica code MOV-XXXXX ----------------
def test_10_carico_ha_code_mov():
    p = STATE["product_nol"]
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "noleggio", "movement_type": "carico",
        "product_id": p["id"], "qty": 10,
        "origin": {"type": "external", "label": "Esterno"},
        "destination": {"type": "central", "label": "Magazzino centrale"},
        "note": "TEST ITER26 carico",
    }, timeout=30)
    assert r.status_code == 200, r.text
    mov = r.json()
    assert mov.get("code", "").startswith("MOV-"), f"Codice MOV mancante: {mov}"
    assert mov.get("status") == "valido"
    assert mov.get("product_code") == p["code"]
    STATE["carico_mov_id"] = mov["id"]
    STATE["carico_mov_code"] = mov["code"]
    STATE["created_movement_ids"].append(mov["id"])


# ---------------- POST /movimenti con movement_type=storno -> 400 ----------------
def test_11_create_movement_storno_forbidden():
    p = STATE["product_nol"]
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "noleggio", "movement_type": "storno",
        "product_id": p["id"], "qty": 1,
        "origin": {"type": "central"}, "destination": {"type": "external"},
    }, timeout=30)
    assert r.status_code == 400
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "noleggio", "movement_type": "annullamento",
        "product_id": p["id"], "qty": 1,
        "origin": {"type": "central"}, "destination": {"type": "external"},
    }, timeout=30)
    assert r.status_code == 400


# ---------------- Storno con motivo obbligatorio + nota per altro ----------------
def test_20_storno_senza_motivo_ko():
    # motivo mancante -> Pydantic 422
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['carico_mov_id']}/storno",
                      headers=h(), json={}, timeout=30)
    assert r.status_code in (400, 422), f"expected 400/422 got {r.status_code}: {r.text}"

    # motivo invalido -> 400
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['carico_mov_id']}/storno",
                      headers=h(), json={"motivo": "not_a_motive"}, timeout=30)
    assert r.status_code == 400


def test_21_storno_altro_senza_nota_ko():
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['carico_mov_id']}/storno",
                      headers=h(), json={"motivo": "altro"}, timeout=30)
    assert r.status_code == 400
    assert "nota" in r.text.lower() or "altro" in r.text.lower()


# ---------------- Storno completo carico ----------------
def test_22_storno_carico_ok():
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['carico_mov_id']}/storno",
                      headers=h(),
                      json={"motivo": "quantita_errata"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    inv = body["storno"]
    assert inv["movement_type"] == "storno"
    assert inv["qty"] == 10
    assert inv.get("reverses") == STATE["carico_mov_id"]
    assert inv.get("reversal_of") == STATE["carico_mov_id"]
    # origin/destination invertiti
    assert inv["origin"]["type"] == "central"
    assert inv["destination"]["type"] == "external"
    assert inv.get("code", "").startswith("MOV-")
    STATE["storno_mov_id"] = inv["id"]
    STATE["storno_mov_code"] = inv["code"]
    STATE["created_movement_ids"].append(inv["id"])


def test_23_originale_immutato_e_metadati():
    r = requests.get(f"{BASE_URL}/api/magazzino/movimenti/{STATE['carico_mov_id']}",
                     headers=h(), timeout=30)
    assert r.status_code == 200
    m = r.json()
    assert m["qty"] == 10
    assert m["origin"]["type"] == "external"
    assert m["destination"]["type"] == "central"
    assert m.get("status") == "stornato"
    assert m.get("stornato_at")
    assert m.get("reversal_movement_id") == STATE["storno_mov_id"]
    assert m.get("reversed_by") == STATE["storno_mov_id"]
    assert m.get("storno_motivo") == "quantita_errata"
    # reversal_movement enrichment
    rm = m.get("reversal_movement")
    assert rm and rm.get("code") == STATE["storno_mov_code"]


def test_24_get_by_code_and_reverse_link():
    r = requests.get(f"{BASE_URL}/api/magazzino/movimenti/{STATE['storno_mov_code']}",
                     headers=h(), timeout=30)
    assert r.status_code == 200
    m = r.json()
    assert m["id"] == STATE["storno_mov_id"]
    om = m.get("original_movement")
    assert om and om.get("code") == STATE["carico_mov_code"]


# ---------------- Doppio storno -> 400 ----------------
def test_25_doppio_storno_400():
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['carico_mov_id']}/storno",
                      headers=h(), json={"motivo": "quantita_errata"}, timeout=30)
    assert r.status_code == 400
    d = r.json().get("detail")
    assert isinstance(d, dict), f"detail deve essere dict, got {d}"
    assert d.get("error") == "gia_stornato"
    assert d.get("reversal_code") == STATE["storno_mov_code"]


# ---------------- Storno di uno storno -> 400 ----------------
def test_26_storno_di_storno_400():
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['storno_mov_id']}/storno",
                      headers=h(), json={"motivo": "quantita_errata"}, timeout=30)
    assert r.status_code == 400


# ---------------- Filtro state=validi|stornati e reverses_code in list ----------------
def test_30_filtro_state():
    r = requests.get(f"{BASE_URL}/api/magazzino/movimenti",
                     params={"state": "stornati", "limit": 200}, headers=h(), timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    ids = [m["id"] for m in items]
    assert STATE["carico_mov_id"] in ids, "originale stornato deve comparire in state=stornati"
    # tutti quelli in questo filtro devono avere reversed_by valorizzato
    for m in items:
        assert m.get("reversed_by")

    r = requests.get(f"{BASE_URL}/api/magazzino/movimenti",
                     params={"state": "validi", "limit": 200}, headers=h(), timeout=30)
    assert r.status_code == 200
    ids_valid = [m["id"] for m in r.json()["items"]]
    assert STATE["carico_mov_id"] not in ids_valid, "originale stornato NON deve comparire in validi"
    assert STATE["storno_mov_id"] in ids_valid, "movimento di storno è valido"


def test_31_reverses_code_in_list():
    # trova il movimento di storno nella lista e verifica reverses_code
    r = requests.get(f"{BASE_URL}/api/magazzino/movimenti",
                     params={"movement_type": "storno", "limit": 50}, headers=h(), timeout=30)
    assert r.status_code == 200
    found = next((m for m in r.json()["items"] if m["id"] == STATE["storno_mov_id"]), None)
    assert found and found.get("reverses_code") == STATE["carico_mov_code"]


# ---------------- Controllo giacenza -> 409 ----------------
def test_40_stock_insufficiente_409():
    """Carico 10 su central; transfer 10 central->struttura; scarico 8 struttura->esterno;
    poi storno del transfer deve dare 409 perché in struttura ne restano 2 < 10."""
    p = STATE["product_nol"]
    # baseline centrale
    r_bal = requests.get(f"{BASE_URL}/api/magazzino/generale/stock/noleggio", headers=h(), timeout=30)
    bal_before = next(x["qty"] for x in r_bal.json() if x["id"] == p["id"])

    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "noleggio", "movement_type": "carico", "product_id": p["id"], "qty": 10,
        "origin": {"type": "external"}, "destination": {"type": "central"},
        "note": "TEST ITER26 stock-carico",
    }, timeout=30)
    assert r.status_code == 200
    STATE["cleanup_mov_ids_to_storno"].append(r.json()["id"])
    STATE["created_movement_ids"].append(r.json()["id"])

    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "noleggio", "movement_type": "trasferimento", "product_id": p["id"], "qty": 10,
        "origin": {"type": "central"},
        "destination": {"type": "structure", "id": STATE["structure_id"]},
        "note": "TEST ITER26 stock-transfer",
    }, timeout=30)
    assert r.status_code == 200
    STATE["transfer_mov_id"] = r.json()["id"]
    STATE["created_movement_ids"].append(r.json()["id"])

    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "noleggio", "movement_type": "scarico", "product_id": p["id"], "qty": 8,
        "origin": {"type": "structure", "id": STATE["structure_id"]},
        "destination": {"type": "external"},
        "note": "TEST ITER26 stock-scarico",
    }, timeout=30)
    assert r.status_code == 200
    STATE["cleanup_mov_ids_to_storno"].append(r.json()["id"])
    STATE["created_movement_ids"].append(r.json()["id"])

    # storno del transfer -> 409
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['transfer_mov_id']}/storno",
                      headers=h(), json={"motivo": "struttura_errata"}, timeout=30)
    assert r.status_code == 409, f"atteso 409 stock_insufficiente, got {r.status_code} {r.text}"
    d = r.json().get("detail")
    assert isinstance(d, dict)
    assert d.get("error") == "stock_insufficiente"
    assert d.get("available") == 2
    assert d.get("required") == 10

    # verifica: NESSUN movimento di storno creato per il transfer
    r_g = requests.get(f"{BASE_URL}/api/magazzino/movimenti/{STATE['transfer_mov_id']}",
                       headers=h(), timeout=30)
    m = r_g.json()
    assert m.get("status") != "stornato"
    assert not m.get("reversed_by"), "nessuno storno deve essere stato registrato"


# ---------------- FLUSSO CONSEGNA -> movimento -> storno con delivery_id ----------------
def test_50_flusso_consegna_movimento_storno():
    p = STATE["product_nol"]
    # Precarico central per avere stock da consegnare
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "noleggio", "movement_type": "carico", "product_id": p["id"], "qty": 5,
        "origin": {"type": "external"}, "destination": {"type": "central"},
        "note": "TEST ITER26 preload consegna",
    }, timeout=30)
    assert r.status_code == 200
    STATE["created_movement_ids"].append(r.json()["id"])
    STATE["cleanup_mov_ids_to_storno"].append(r.json()["id"])
    # richiesta fabbisogno kind=noleggio (POST /consegne/richieste crea kind=manuale e non genera movimenti)
    r = requests.post(f"{BASE_URL}/api/magazzino/fabbisogni", headers=h(), json={
        "kind": "noleggio", "structure_id": STATE["structure_id"],
        "items": [{"product_id": p["id"], "name": p["name"], "qty": 2}],
        "note": "TEST ITER26 fabbisogno",
    }, timeout=30)
    assert r.status_code == 200, r.text
    STATE["richiesta_id"] = r.json()["id"]

    # fermata
    r = requests.post(f"{BASE_URL}/api/consegne/fermate", headers=h(), json={
        "richiesta_ids": [STATE["richiesta_id"]],
        "date": "2026-01-15",
    }, timeout=30)
    assert r.status_code == 200, r.text
    STATE["fermata_id"] = r.json()["id"]

    # completa (crea movimento consegna con delivery_id=fermata_id)
    r = requests.post(f"{BASE_URL}/api/consegne/fermate/{STATE['fermata_id']}/completa",
                      headers=h(), json={"note": "TEST ITER26"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("movements", 0) >= 1

    # trova il movimento di consegna
    r = requests.get(f"{BASE_URL}/api/magazzino/movimenti",
                     params={"structure_id": STATE["structure_id"], "movement_type": "consegna", "limit": 20},
                     headers=h(), timeout=30)
    consegna_movs = [m for m in r.json()["items"] if m.get("delivery_id") == STATE["fermata_id"]]
    assert consegna_movs, "movimento consegna non trovato con delivery_id"
    STATE["consegna_mov_id"] = consegna_movs[0]["id"]
    STATE["created_movement_ids"].append(STATE["consegna_mov_id"])

    # fermata completata NON annullabile
    r = requests.put(f"{BASE_URL}/api/consegne/fermate/{STATE['fermata_id']}", headers=h(),
                     json={"status": "cancelled"}, timeout=30)
    assert r.status_code == 400
    assert "completata" in r.text.lower()

    # storno del movimento consegna con motivo consegna_annullata
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['consegna_mov_id']}/storno",
                      headers=h(), json={"motivo": "consegna_annullata"}, timeout=30)
    assert r.status_code == 200, r.text
    inv = r.json()["storno"]
    assert inv.get("delivery_id") == STATE["fermata_id"], "delivery_id ereditato nello storno"
    STATE["created_movement_ids"].append(inv["id"])


# ---------------- STORNO Generale->Zaino ----------------
def test_60_storno_central_to_zaino():
    p = STATE["product_pul"]
    # preload central pulizie
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "pulizie", "movement_type": "carico", "product_id": p["id"], "qty": 5,
        "origin": {"type": "external"}, "destination": {"type": "central"},
        "note": "TEST ITER26 preload central pulizie",
    }, timeout=30)
    assert r.status_code == 200
    STATE["cleanup_mov_ids_to_storno"].append(r.json()["id"])
    STATE["created_movement_ids"].append(r.json()["id"])

    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h(), json={
        "domain": "pulizie", "movement_type": "trasferimento", "product_id": p["id"], "qty": 3,
        "origin": {"type": "central"},
        "destination": {"type": "zaino", "id": STATE["zaino_id"]},
        "note": "TEST ITER26 central->zaino",
    }, timeout=30)
    assert r.status_code == 200
    tid = r.json()["id"]
    STATE["created_movement_ids"].append(tid)

    # storna
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{tid}/storno", headers=h(),
                      json={"motivo": "errore_inserimento"}, timeout=30)
    assert r.status_code == 200, r.text
    STATE["created_movement_ids"].append(r.json()["storno"]["id"])
    # verifica: zaino stock torna 0
    rs = requests.get(f"{BASE_URL}/api/magazzino/zaini/{STATE['zaino_id']}/stock",
                      headers=h(), timeout=30)
    if rs.status_code == 200:
        items = rs.json() if isinstance(rs.json(), list) else rs.json().get("items", [])
        row = next((x for x in items if x.get("product_id") == p["id"]), None)
        if row:
            assert row.get("qty", 0) == 0


# ---------------- Registro Attività ----------------
def test_70_activity_log_contains_storno():
    r = requests.get(f"{BASE_URL}/api/activity", headers=h(),
                     params={"limit": 200}, timeout=30)
    assert r.status_code == 200
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    # cerca almeno una entry con path .../storno
    stornos = [a for a in items
               if "storno" in str(a.get("path", "")) or "storno" in str(a.get("action", ""))
               or "storno" in str(a.get("url", ""))]
    assert stornos, f"Nessuna attività di storno trovata in {len(items)} record"


# ---------------- Permessi: senza token 401/403 ----------------
def test_80_storno_senza_token():
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{STATE['carico_mov_id']}/storno",
                      json={"motivo": "altro", "nota": "x"}, timeout=30)
    assert r.status_code in (401, 403)


# ---------------- Report netto ----------------
def test_90_report_netto_ok():
    """Dopo carico 10 e storno, il stock netto per il primo articolo NOL torna
    al baseline del test 40 - lo verifichiamo indirettamente controllando che
    il carico originale e il suo storno esistano entrambi nello storico."""
    r = requests.get(f"{BASE_URL}/api/magazzino/movimenti",
                     params={"limit": 200}, headers=h(), timeout=30)
    assert r.status_code == 200
    items = r.json()["items"]
    ids = {m["id"] for m in items}
    assert STATE["carico_mov_id"] in ids and STATE["storno_mov_id"] in ids


# ---------------- Cleanup ----------------
def test_zz_cleanup():
    # storna tutti i carichi/movimenti tracciabili di TEST ITER26 non ancora stornati
    for mid in STATE["cleanup_mov_ids_to_storno"]:
        try:
            requests.post(f"{BASE_URL}/api/magazzino/movimenti/{mid}/storno",
                          headers=h(), json={"motivo": "errore_inserimento"}, timeout=15)
        except Exception:
            pass
    # elimina struttura, cliente
    if STATE["structure_id"]:
        r = requests.delete(f"{BASE_URL}/api/structures/{STATE['structure_id']}",
                            headers=h(), timeout=30)
        assert r.status_code in (200, 204, 404)
    if STATE["client_id"]:
        r = requests.delete(f"{BASE_URL}/api/clients/{STATE['client_id']}",
                            headers=h(), timeout=30)
        assert r.status_code in (200, 204, 404)
    # zaino: no DELETE endpoint by design
