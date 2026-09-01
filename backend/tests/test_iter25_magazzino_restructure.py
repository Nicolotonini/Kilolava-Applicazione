from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Iteration 25 — Test suite per la riorganizzazione moduli Magazzino.

Copre:
- Sidebar/menu impliciti (via API): overview strutture senza kit_pulizie_incompleti
- Redirect (frontend, verificato con Playwright a parte)
- Cataloghi intatti (regressione: 23 NOL, 8 FOR, 23 PUL, 8 KIT-NOL)
- product_code presente nei movimenti / stock / dettagli
- Motore unico movimenti (/api/magazzino/movimenti): carico, transfer, storno, doppio storno = 400
- Rettifica inventario
- Kit transfer central->structure
- Zaino creation (KLV-Z0XX) + dotation codes
- Cleanup: strutture / clienti / zaini di test creati; storno dei movimenti creati

Uso:
    pytest /app/backend/tests/test_iter25_magazzino_restructure.py -v \
        --tb=short --junitxml=/app/test_reports/pytest/iter25.xml
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # frontend .env has it; hardcode from review request if the env var is missing at pytest runtime
    BASE_URL = "https://kilolava-rebuild.preview.emergentagent.com"

ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD

# Shared state across tests (module scoped fixtures below)
STATE = {
    "token": None,
    "client_id": None,
    "structure_id": None,
    "zaino_id": None,
    "movements_to_reverse": [],  # list of mov ids we should reverse to zero out stock
    "kit_transfer_movs": [],
    "storno_movs": [],  # storno movements created (won't be reversed)
    "inventory_mov": None,
}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    STATE["token"] = tok
    return tok


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Cataloghi intatti (regressione) ----------------

def test_catalog_noleggio_23(h):
    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/noleggio", headers=h, timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 23, f"Expected 23 NOL, got {len(items)}"
    codes = sorted([i["code"] for i in items])
    assert codes[0] == "NOL-0001" and codes[-1] == "NOL-0023"


def test_catalog_forniture_8(h):
    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/forniture", headers=h, timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 8, f"Expected 8 FOR, got {len(items)}"
    for i in items:
        assert i.get("code", "").startswith("FOR-")


def test_catalog_pulizie_23(h):
    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/pulizie", headers=h, timeout=30)
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 23, f"Expected 23 PUL, got {len(items)}"
    for i in items:
        assert i.get("code", "").startswith("PUL-")


def test_kits_noleggio_8(h):
    r = requests.get(f"{BASE_URL}/api/magazzino/kits?domain=noleggio", headers=h, timeout=30)
    assert r.status_code == 200
    kits = r.json()
    assert len(kits) == 8, f"Expected 8 KIT-NOL, got {len(kits)}"
    for k in kits:
        assert k.get("code", "").startswith("KIT-NOL-"), k.get("code")


# ---------------- Overview strutture: NIENTE kit_pulizie_incompleti ----------------

def test_strutture_overview_no_kit_pulizie(h):
    r = requests.get(f"{BASE_URL}/api/magazzino/strutture/overview", headers=h, timeout=30)
    assert r.status_code == 200
    body = r.json()
    kpi = body.get("kpi", {})
    assert "kit_pulizie_incompleti" not in kpi, f"KPI kit_pulizie_incompleti dovrebbe essere rimossa: {kpi}"
    # KPI attese presenti
    for k in ("structures_monitored", "fabbisogni_lavanderia", "forniture_da_reintegrare",
              "anomalie", "movements_today"):
        assert k in kpi, f"Missing KPI: {k}"


# ---------------- Legacy /api/inventory endpoint (opzionale) ----------------

def test_legacy_inventory_articles_empty_or_404(h):
    # La collection legacy 'articles' è stata svuotata: se l'endpoint esiste, deve tornare []
    r = requests.get(f"{BASE_URL}/api/inventory", headers=h, timeout=30)
    if r.status_code == 404:
        return  # ok endpoint rimosso
    if r.status_code == 200:
        data = r.json()
        # accept list or dict with items
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) == 0, f"Collection legacy 'articles' non vuota: {len(items)} items"


# ---------------- Seed dati di test (client + structure) ----------------

def test_create_test_client(h):
    r = requests.post(f"{BASE_URL}/api/clients", headers=h, json={
        "client_type": "private",
        "private_info": {"first_name": "TEST_ITER25", "last_name": "Cliente"},
        "notes": "TEST ITER25 - da eliminare",
        "is_active": True,
    }, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    STATE["client_id"] = r.json()["id"]


def test_create_test_structure(h):
    assert STATE["client_id"]
    r = requests.post(f"{BASE_URL}/api/structures", headers=h, json={
        "client_id": STATE["client_id"],
        "name": "TEST_ITER25_STRUCT",
        "structure_type": "apartment",
        "address": "Via Test 1",
    }, timeout=30)
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    STATE["structure_id"] = r.json()["id"]
    # KLV code presente
    assert r.json().get("klv_code"), "Structure should have klv_code"


# ---------------- Motore movimenti unico ----------------

def _first_product(h, domain):
    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/{domain}", headers=h, timeout=30)
    r.raise_for_status()
    return r.json()[0]


def test_carico_central_movimento_ha_product_code(h):
    p = _first_product(h, "noleggio")
    assert p["code"].startswith("NOL-")
    # baseline stock
    r0 = requests.get(f"{BASE_URL}/api/magazzino/generale/stock/noleggio", headers=h, timeout=30)
    base_qty = next(x["qty"] for x in r0.json() if x["id"] == p["id"])

    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h, json={
        "domain": "noleggio", "movement_type": "carico",
        "product_id": p["id"], "qty": 10,
        "origin": {"type": "external", "label": "Esterno"},
        "destination": {"type": "central", "label": "Magazzino centrale"},
        "note": "TEST ITER25 - carico",
    }, timeout=30)
    assert r.status_code == 200, r.text
    mov = r.json()
    assert mov.get("product_code") == p["code"], f"product_code mancante o errato: {mov.get('product_code')}"
    STATE["movements_to_reverse"].append(mov["id"])

    # verify stock aumentato
    r1 = requests.get(f"{BASE_URL}/api/magazzino/generale/stock/noleggio", headers=h, timeout=30)
    new_qty = next(x["qty"] for x in r1.json() if x["id"] == p["id"])
    assert new_qty == base_qty + 10, f"stock non aggiornato: {base_qty} -> {new_qty}"

    # verify che comparire nella list dei movimenti con product_code
    r2 = requests.get(f"{BASE_URL}/api/magazzino/movimenti?domain=noleggio&limit=10", headers=h, timeout=30)
    assert r2.status_code == 200
    found = next((m for m in r2.json()["items"] if m["id"] == mov["id"]), None)
    assert found, "movement non presente in list"
    assert found.get("product_code") == p["code"]


def test_transfer_central_to_structure(h):
    assert STATE["structure_id"]
    p = _first_product(h, "noleggio")
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h, json={
        "domain": "noleggio", "movement_type": "trasferimento",
        "product_id": p["id"], "qty": 4,
        "origin": {"type": "central"},
        "destination": {"type": "structure", "id": STATE["structure_id"]},
        "note": "TEST ITER25 - transfer",
    }, timeout=30)
    assert r.status_code == 200, r.text
    mov = r.json()
    STATE["movements_to_reverse"].append(mov["id"])
    assert mov.get("product_code") == p["code"]
    # struttura stock aggiornato
    r2 = requests.get(f"{BASE_URL}/api/magazzino/noleggio/{STATE['structure_id']}", headers=h, timeout=30)
    assert r2.status_code == 200
    body = r2.json()
    it = next((x for x in body["items"] if x["product_id"] == p["id"]), None)
    assert it and it["qty"] == 4
    assert it.get("code") == p["code"], "codice NOL mancante in noleggio detail"
    # klv_code visibile in header
    assert body["structure"].get("klv_code"), "klv_code manca in noleggio detail header"


def test_storno_and_double_storno_400(h):
    # storna il carico iniziale
    if not STATE["movements_to_reverse"]:
        pytest.skip("nessun movimento da stornare")
    mov_id = STATE["movements_to_reverse"][0]
    r = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{mov_id}/storno", headers=h, timeout=30)
    assert r.status_code == 200, r.text
    inv = r.json()
    assert inv["movement_type"] == "annullamento"
    assert inv.get("reverses") == mov_id
    STATE["storno_movs"].append(inv["id"])
    # secondo storno -> 400
    r2 = requests.post(f"{BASE_URL}/api/magazzino/movimenti/{mov_id}/storno", headers=h, timeout=30)
    assert r2.status_code == 400, f"secondo storno dovrebbe essere 400 got {r2.status_code}"


def test_inventario_rettifica(h):
    p = _first_product(h, "noleggio")
    # stock corrente
    r0 = requests.get(f"{BASE_URL}/api/magazzino/generale/stock/noleggio", headers=h, timeout=30)
    cur = next(x["qty"] for x in r0.json() if x["id"] == p["id"])
    target = cur + 3
    r = requests.post(f"{BASE_URL}/api/magazzino/inventario", headers=h, json={
        "domain": "noleggio", "location_type": "central",
        "counts": [{"product_id": p["id"], "counted": target}],
        "note": "TEST ITER25 - inventario",
    }, timeout=30)
    assert r.status_code == 200, r.text
    adj = r.json()["adjustments"]
    assert len(adj) == 1 and adj[0]["from"] == cur and adj[0]["to"] == target
    STATE["inventory_mov"] = adj[0]["movement_id"]
    STATE["storno_movs"].append(adj[0]["movement_id"])  # we'll storna at cleanup
    # verifica stock aggiornato
    r2 = requests.get(f"{BASE_URL}/api/magazzino/generale/stock/noleggio", headers=h, timeout=30)
    now = next(x["qty"] for x in r2.json() if x["id"] == p["id"])
    assert now == target


def test_kit_transfer(h):
    # prendo primo KIT-NOL configurato con items
    r = requests.get(f"{BASE_URL}/api/magazzino/kits?domain=noleggio", headers=h, timeout=30)
    kits = [k for k in r.json() if k.get("items")]
    assert kits, "Nessun KIT-NOL con items"
    kit = kits[0]
    # servono stock centrali sufficienti per ciascun componente
    for it in kit["items"]:
        requests.post(f"{BASE_URL}/api/magazzino/movimenti", headers=h, json={
            "domain": "noleggio", "movement_type": "carico",
            "product_id": it["product_id"], "qty": max(it["qty"] * 2, 5),
            "origin": {"type": "external"},
            "destination": {"type": "central"},
            "note": "TEST ITER25 - preload kit",
        }, timeout=30)

    r2 = requests.post(f"{BASE_URL}/api/magazzino/kit-transfer", headers=h, json={
        "kit_id": kit["id"], "structure_id": STATE["structure_id"], "qty": 1,
    }, timeout=30)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    # response: {"ok": True, "movements": <int>} — un movimento per componente
    count = body.get("movements") if isinstance(body, dict) else len(body or [])
    assert count == len(kit["items"]), f"Attesi {len(kit['items'])} movimenti, ottenuti {count}"
    # verifica dai movimenti che i product_code siano presenti
    r3 = requests.get(
        f"{BASE_URL}/api/magazzino/movimenti?structure_id={STATE['structure_id']}&domain=noleggio&limit=50",
        headers=h, timeout=30)
    assert r3.status_code == 200
    for m in r3.json()["items"][:count]:
        assert m.get("product_code", "").startswith("NOL-"), m


def test_zaino_create_and_codes(h):
    r = requests.post(f"{BASE_URL}/api/magazzino/zaini", headers=h, json={
        "name": "TEST_ITER25_ZAINO", "notes": "TEST",
    }, timeout=30)
    assert r.status_code == 200, r.text
    z = r.json()
    STATE["zaino_id"] = z["id"]
    assert z["code"].startswith("KLV-Z"), f"code atteso KLV-Z00X, got {z['code']}"

    # detail: dotation deve avere campo code per gli items standard
    r2 = requests.get(f"{BASE_URL}/api/magazzino/zaini/{z['id']}", headers=h, timeout=30)
    assert r2.status_code == 200
    dot = r2.json().get("dotation", [])
    # se il catalogo pulizie ha items con standard_location=zaino, dotation non è vuota e ha 'code'
    if dot:
        for row in dot:
            # code può essere None se il prodotto non ha code, ma la chiave deve esserci
            assert "code" in row, f"campo 'code' mancante in dotation row: {row}"


# ---------------- Cleanup: stornare movimenti e cancellare struttura/cliente ----------------

def test_zzz_cleanup(h):
    # storna tutti i movimenti creati (che non siano già stornati)
    for mid in STATE["movements_to_reverse"][1:] + STATE["kit_transfer_movs"]:
        try:
            requests.post(f"{BASE_URL}/api/magazzino/movimenti/{mid}/storno", headers=h, timeout=20)
        except Exception:
            pass
    # elimina struttura di test
    if STATE["structure_id"]:
        r = requests.delete(f"{BASE_URL}/api/structures/{STATE['structure_id']}", headers=h, timeout=30)
        assert r.status_code in (200, 204, 404), f"delete structure: {r.status_code} {r.text}"
    # elimina cliente di test
    if STATE["client_id"]:
        r = requests.delete(f"{BASE_URL}/api/clients/{STATE['client_id']}", headers=h, timeout=30)
        assert r.status_code in (200, 204, 404), f"delete client: {r.status_code} {r.text}"
    # zaino: nessun DELETE endpoint => segnalato nel report
    print(f"\n[cleanup] Zaino di test lasciato in DB: {STATE.get('zaino_id')} (no DELETE endpoint)")
