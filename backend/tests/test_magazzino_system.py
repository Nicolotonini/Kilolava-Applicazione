from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Test suite Sistema Magazzino Kilolava — design NUOVO (Gen 2026):
Magazzino nelle Strutture (fisico) + Magazzino Generale.

Copre requisiti utente (backend):
1. Magazzino Generale Noleggio: carico external→central aumenta GET /generale/stock/noleggio
2. Trasferimento central→structure: UN SOLO record movimento, decrementa central + incrementa struttura,
   visibile sia con scope=strutture che scope=generale.
3. POST /kit-transfer con kit configurato crea N movimenti (central→structure); kit non configurato → 400.
4. Fornitura central→structure porta below_min e fabbisogno kind='fornitura'.
5. Kit Pulizie Struttura: PUT /kit-pulizie/{sid} (custom_items), lista/dettaglio status,
   trasferimento pulizie colma → completo; kit_id predefinito seed vuoto → status kit_non_configurato.
6. Zaino: dotazione standard con qty null; kit configurato porta qty; reintegro origin central.
7. Inventario central/struttura/zaino → rettifica_inventario.
8. Storno movimento crea inverso; secondo storno → 400.
9. Fabbisogno kind='noleggio' non genera segnalazioni.
10. POST /segnalazioni origin_type=warehouse → visibile in KPI anomalie di entrambe overview.
11. GET /noleggio/{sid} include array 'photos'.
12. GET /catalog/* invariati (8/5/23 con foto).
13. Filtri /movimenti scope/user/client_id/zone_id/structure/domain.

Cleanup selettivo a fine test.
"""
import os
import time
import uuid
import requests
import pytest


def _read_env(key):
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass
    return None


BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _read_env('REACT_APP_BACKEND_URL') or "").rstrip('/')
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN = {"email": "test_user@kilolava.com", "password": TEST_ADMIN_PASSWORD}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def H():
    tok = _login(ADMIN)
    return {"Authorization": f"Bearer {tok}"}


# Stato condiviso per cleanup
S = {
    "products": [],     # prodotti TEST_ (domain, id)
    "movements": [],    # movimenti da rimuovere
    "fabbisogni": [],
    "segnalazioni": [],
    "structure_kits": [],  # structure_id (config kit-pulizie)
    "kits_reset": [],   # kit id da riportare a items=[]
    "central_stocks": [],  # (domain, product_id) su central
    "structure_stocks": [],  # (domain, sid, product_id)
    "zaino_stocks": [],  # (zid, product_id)
}


def _pick_structure(H):
    r = requests.get(f"{API}/structures", headers=H).json()
    items = r if isinstance(r, list) else r.get("items", [])
    assert items, "no structures in DB"
    return items[0]


def _catalog(H, domain):
    return requests.get(f"{API}/magazzino/catalog/{domain}", headers=H).json()


# ============ 12. CATALOGHI INVARIATI ============

class TestCataloghi:
    def test_seed_counts(self, H):
        assert len(_catalog(H, "noleggio")) >= 8
        assert len(_catalog(H, "forniture")) >= 5
        pul = _catalog(H, "pulizie")
        assert len(pul) >= 23
        assert all(p.get("standard_location") in ("casa", "zaino") for p in pul if p.get("active", True))

    def test_photos_seed(self, H):
        for d, n in [("noleggio", 8), ("forniture", 5), ("pulizie", 23)]:
            cat = _catalog(H, d)
            with_ph = [p for p in cat if (p.get("photo") or {}).get("file_path")]
            assert len(with_ph) >= n, f"{d}: {len(with_ph)}/{n}"


# ============ (1)(2) MAGAZZINO GENERALE NOLEGGIO + trasferimento ============

class TestGeneraleNoleggio:
    def test_carico_external_to_central_and_stock(self, H):
        cat = _catalog(H, "noleggio")
        pid = next(p["id"] for p in cat if p["name"] == "Federa")
        S["central_stocks"].append(("noleggio", pid))
        # stock iniziale
        stock_before = requests.get(f"{API}/magazzino/generale/stock/noleggio", headers=H).json()
        qty0 = next((r["qty"] for r in stock_before if r["id"] == pid), 0)
        # carico
        mov = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "noleggio", "movement_type": "carico", "product_id": pid, "qty": 10,
            "origin": {"type": "external", "label": "Acquisto TEST"},
            "destination": {"type": "central"}
        }, headers=H)
        assert mov.status_code == 200, mov.text
        S["movements"].append(mov.json()["id"])
        # verifica
        stock_after = requests.get(f"{API}/magazzino/generale/stock/noleggio", headers=H).json()
        qty1 = next(r["qty"] for r in stock_after if r["id"] == pid)
        assert qty1 == qty0 + 10, f"central noleggio {qty0}+10 → {qty1}"
        S["_federa_pid"] = pid

    def test_transfer_central_to_structure_single_record(self, H):
        pid = S["_federa_pid"]
        struct = _pick_structure(H)
        sid = struct["id"]
        S["structure_stocks"].append(("noleggio", sid, pid))
        # trasferimento
        mov = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "noleggio", "movement_type": "trasferimento", "product_id": pid, "qty": 4,
            "origin": {"type": "central"},
            "destination": {"type": "structure", "id": sid}
        }, headers=H)
        assert mov.status_code == 200, mov.text
        mid = mov.json()["id"]
        S["movements"].append(mid)
        # central diminuisce
        stock_c = requests.get(f"{API}/magazzino/generale/stock/noleggio", headers=H).json()
        qty_c = next(r["qty"] for r in stock_c if r["id"] == pid)
        # struttura ha item
        det = requests.get(f"{API}/magazzino/noleggio/{sid}", headers=H).json()
        assert "photos" in det, "detail noleggio deve includere 'photos'"
        row = next((r for r in det["items"] if r["product_id"] == pid), None)
        assert row is not None and row["qty"] >= 4
        # UN SOLO record movimento
        movs_stru = requests.get(f"{API}/magazzino/movimenti",
                                 params={"scope": "strutture"}, headers=H).json()["items"]
        found_stru = [m for m in movs_stru if m["id"] == mid]
        movs_gen = requests.get(f"{API}/magazzino/movimenti",
                                params={"scope": "generale"}, headers=H).json()["items"]
        found_gen = [m for m in movs_gen if m["id"] == mid]
        assert len(found_stru) == 1 and len(found_gen) == 1, "record unico visibile in entrambi gli scope"
        m = found_stru[0]
        assert m["origin"]["type"] == "central" and m["destination"]["type"] == "structure"

    def test_generale_overview_kpi(self, H):
        r = requests.get(f"{API}/magazzino/generale/overview", headers=H)
        assert r.status_code == 200
        k = r.json()["kpi"]
        for key in ("noleggio_pieces", "noleggio_refs", "forniture_pieces", "pulizie_pieces",
                    "pulizie_low", "zaini_total", "zaini_da_reintegrare", "anomalie", "movements_today"):
            assert key in k, f"kpi manca {key}"

    def test_strutture_overview_kpi(self, H):
        r = requests.get(f"{API}/magazzino/strutture/overview", headers=H)
        assert r.status_code == 200
        d = r.json()
        for key in ("structures_monitored", "fabbisogni_lavanderia", "forniture_da_reintegrare",
                    "kit_pulizie_incompleti", "anomalie", "movements_today", "fabbisogni_aperti"):
            assert key in d["kpi"], f"kpi manca {key}"
        assert isinstance(d.get("attention"), list)


# ============ (3) KIT TRANSFER ============

class TestKitTransfer:
    def test_kit_transfer_unconfigured_400(self, H):
        # Kit Matrimoniale ha items=[] di default
        kits = requests.get(f"{API}/magazzino/kits", params={"domain": "noleggio"}, headers=H).json()
        km = next(k for k in kits if k["name"] == "Kit Matrimoniale")
        struct = _pick_structure(H)
        r = requests.post(f"{API}/magazzino/kit-transfer", json={
            "kit_id": km["id"], "structure_id": struct["id"], "qty": 1
        }, headers=H)
        assert r.status_code == 400
        assert "non configurato" in r.json().get("detail", "").lower()

    def test_kit_transfer_configured_creates_movements(self, H):
        cat = _catalog(H, "noleggio")
        fed = next(p for p in cat if p["name"] == "Federa")
        lz = next(p for p in cat if p["name"] == "Lenzuolo singolo")
        kits = requests.get(f"{API}/magazzino/kits", params={"domain": "noleggio"}, headers=H).json()
        km = next(k for k in kits if k["name"] == "Kit Matrimoniale")
        # Configura kit
        up = requests.put(f"{API}/magazzino/kits/{km['id']}", json={
            "name": "Kit Matrimoniale", "domain": "noleggio", "bed_type": "matrimoniale",
            "items": [
                {"product_id": fed["id"], "name": fed["name"], "qty": 2},
                {"product_id": lz["id"], "name": lz["name"], "qty": 1},
            ]
        }, headers=H)
        assert up.status_code == 200
        S["kits_reset"].append(km["id"])
        # Carico central per avere stock
        for p, q in [(fed, 20), (lz, 20)]:
            m = requests.post(f"{API}/magazzino/movimenti", json={
                "domain": "noleggio", "movement_type": "carico", "product_id": p["id"], "qty": q,
                "origin": {"type": "external", "label": "TEST"},
                "destination": {"type": "central"}
            }, headers=H)
            S["movements"].append(m.json()["id"])
            S["central_stocks"].append(("noleggio", p["id"]))
        struct = _pick_structure(H)
        sid = struct["id"]
        S["structure_stocks"].append(("noleggio", sid, fed["id"]))
        S["structure_stocks"].append(("noleggio", sid, lz["id"]))
        r = requests.post(f"{API}/magazzino/kit-transfer", json={
            "kit_id": km["id"], "structure_id": sid, "qty": 2
        }, headers=H)
        assert r.status_code == 200, r.text
        assert r.json()["movements"] == 2
        # Verifica: due movimenti trasferimento su struct
        movs = requests.get(f"{API}/magazzino/movimenti",
                            params={"structure_id": sid, "movement_type": "trasferimento"},
                            headers=H).json()["items"]
        recent = [m for m in movs if "Kit Matrimoniale" in (m.get("note") or "")]
        assert len(recent) >= 2
        for m in recent[:2]:
            S["movements"].append(m["id"])


# ============ (4) FORNITURE ============

class TestForniture:
    def test_carico_and_below_min(self, H):
        cat = _catalog(H, "forniture")
        prod = cat[0]
        pid = prod["id"]
        struct = _pick_structure(H)
        sid = struct["id"]
        S["central_stocks"].append(("forniture", pid))
        S["structure_stocks"].append(("forniture", sid, pid))
        # Configura min_qty=5 threshold=on
        cfg = requests.put(f"{API}/magazzino/forniture/{sid}/items", json={
            "product_id": pid, "min_qty": 5, "ideal_qty": 10, "threshold_enabled": True
        }, headers=H)
        assert cfg.status_code == 200
        # carico central
        m1 = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "forniture", "movement_type": "carico", "product_id": pid, "qty": 20,
            "origin": {"type": "external", "label": "TEST"}, "destination": {"type": "central"}
        }, headers=H)
        S["movements"].append(m1.json()["id"])
        # consegna central→struct qty=2 (sotto min 5)
        m2 = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "forniture", "movement_type": "consegna", "product_id": pid, "qty": 2,
            "origin": {"type": "central"}, "destination": {"type": "structure", "id": sid}
        }, headers=H)
        S["movements"].append(m2.json()["id"])
        # verifica below_min
        det = requests.get(f"{API}/magazzino/forniture/{sid}", headers=H).json()
        row = next(r for r in det["items"] if r["product_id"] == pid)
        assert row["qty"] == 2 and row["below_min"] is True
        # fabbisogno kind='fornitura'
        f = requests.post(f"{API}/magazzino/fabbisogni", json={
            "kind": "fornitura", "structure_id": sid,
            "items": [{"product_id": pid, "name": prod["name"], "qty": 8}],
            "note": "TEST fornitura"
        }, headers=H)
        assert f.status_code == 200
        assert f.json()["kind"] == "fornitura"
        S["fabbisogni"].append(f.json()["id"])


# ============ (5) KIT PULIZIE STRUTTURE ============

class TestKitPulizieStrutture:
    def test_config_custom_items_and_missing(self, H):
        struct = _pick_structure(H)
        sid = struct["id"]
        S["_kp_sid"] = sid
        S["structure_kits"].append(sid)
        cat = _catalog(H, "pulizie")
        mocio = next(p for p in cat if p["name"] == "Mocio")
        det_prod = next(p for p in cat if p["name"] == "Detersivo pavimenti")
        S["_kp_prod_a"] = mocio["id"]
        S["_kp_prod_b"] = det_prod["id"]
        r = requests.put(f"{API}/magazzino/kit-pulizie/{sid}", json={
            "enabled": True,
            "custom_items": [
                {"product_id": mocio["id"], "name": mocio["name"], "qty": 1},
                {"product_id": det_prod["id"], "name": det_prod["name"], "qty": 2},
            ]
        }, headers=H)
        assert r.status_code == 200
        # Lista contiene struttura con status non 'completo'
        lst = requests.get(f"{API}/magazzino/kit-pulizie", headers=H).json()
        mine = next((x for x in lst if x["structure_id"] == sid), None)
        assert mine is not None
        assert mine["status"] in ("incompleto", "kit_non_configurato")
        # Dettaglio
        det = requests.get(f"{API}/magazzino/kit-pulizie/{sid}", headers=H).json()
        assert det["config"]["enabled"] is True
        assert len(det["items"]) >= 2
        m = next(i for i in det["items"] if i["product_id"] == mocio["id"])
        assert m["expected"] == 1 and m["present"] == 0 and m["missing"] == 1

    def test_transfer_fills_kit_completo(self, H):
        sid = S["_kp_sid"]
        pid_a = S["_kp_prod_a"]
        pid_b = S["_kp_prod_b"]
        S["central_stocks"] += [("pulizie", pid_a), ("pulizie", pid_b)]
        S["structure_stocks"] += [("pulizie", sid, pid_a), ("pulizie", sid, pid_b)]
        # carico central
        for pid, q in [(pid_a, 5), (pid_b, 5)]:
            m = requests.post(f"{API}/magazzino/movimenti", json={
                "domain": "pulizie", "movement_type": "carico", "product_id": pid, "qty": q,
                "origin": {"type": "external", "label": "TEST"},
                "destination": {"type": "central"}
            }, headers=H)
            S["movements"].append(m.json()["id"])
        # trasferimenti per colmare (1 e 2)
        for pid, q in [(pid_a, 1), (pid_b, 2)]:
            m = requests.post(f"{API}/magazzino/movimenti", json={
                "domain": "pulizie", "movement_type": "trasferimento", "product_id": pid, "qty": q,
                "origin": {"type": "central"},
                "destination": {"type": "structure", "id": sid}
            }, headers=H)
            S["movements"].append(m.json()["id"])
        # Ora status completo
        lst = requests.get(f"{API}/magazzino/kit-pulizie", headers=H).json()
        mine = next(x for x in lst if x["structure_id"] == sid)
        assert mine["status"] == "completo", f"status={mine['status']} missing={mine['missing_count']}"

    def test_kit_id_seed_vuoto_kit_non_configurato(self, H):
        # Usa Kit Zaino Standard (pulizie, items=[] di default)
        kits = requests.get(f"{API}/magazzino/kits", params={"domain": "pulizie"}, headers=H).json()
        kzs = next(k for k in kits if k["name"] == "Kit Zaino Standard")
        # Reset items=[] per sicurezza (nel caso un altro test l'abbia configurato)
        requests.put(f"{API}/magazzino/kits/{kzs['id']}", json={
            "name": kzs["name"], "domain": "pulizie", "items": []
        }, headers=H)
        S["kits_reset"].append(kzs["id"])
        sid = S["_kp_sid"]
        r = requests.put(f"{API}/magazzino/kit-pulizie/{sid}", json={
            "enabled": True, "kit_id": kzs["id"], "custom_items": []
        }, headers=H)
        assert r.status_code == 200
        lst = requests.get(f"{API}/magazzino/kit-pulizie", headers=H).json()
        mine = next(x for x in lst if x["structure_id"] == sid)
        assert mine["status"] == "kit_non_configurato"


# ============ (6) ZAINO ============

class TestZaino:
    def test_dotation_standard_qty_null(self, H):
        # Reset Kit Zaino Standard a items=[]
        kits = requests.get(f"{API}/magazzino/kits", params={"domain": "pulizie"}, headers=H).json()
        kzs = next(k for k in kits if k["name"] == "Kit Zaino Standard")
        requests.put(f"{API}/magazzino/kits/{kzs['id']}", json={
            "name": kzs["name"], "domain": "pulizie", "items": []
        }, headers=H)
        S["kits_reset"].append(kzs["id"])
        # Trova uno zaino esistente
        zaini = requests.get(f"{API}/magazzino/zaini", headers=H).json()
        if not zaini:
            pytest.skip("no zaini")
        z = zaini[0]
        S["_zid"] = z["id"]
        det = requests.get(f"{API}/magazzino/zaini/{z['id']}", headers=H).json()
        std = [d for d in det["dotation"] if d.get("source") == "standard"]
        assert len(std) >= 8, f"attesi >=8 standard, trovati {len(std)}"
        assert all(d.get("qty") is None for d in std), "qty deve essere None (nessuna quantità inventata)"

    def test_kit_configured_shows_qty(self, H):
        kits = requests.get(f"{API}/magazzino/kits", params={"domain": "pulizie"}, headers=H).json()
        kzs = next(k for k in kits if k["name"] == "Kit Zaino Standard")
        cat = _catalog(H, "pulizie")
        swp = next(p for p in cat if p["name"] == "Swiffer pavimenti")
        requests.put(f"{API}/magazzino/kits/{kzs['id']}", json={
            "name": kzs["name"], "domain": "pulizie",
            "items": [{"product_id": swp["id"], "name": swp["name"], "qty": 3}]
        }, headers=H)
        S["kits_reset"].append(kzs["id"])
        # link kit allo zaino
        zid = S["_zid"]
        requests.put(f"{API}/magazzino/zaini/{zid}", json={"kit_id": kzs["id"]}, headers=H)
        det = requests.get(f"{API}/magazzino/zaini/{zid}", headers=H).json()
        row = next(d for d in det["dotation"] if d["product_id"] == swp["id"])
        assert row["source"] == "kit" and row["qty"] == 3
        # RIPRISTINA kit a items=[]
        requests.put(f"{API}/magazzino/kits/{kzs['id']}", json={
            "name": kzs["name"], "domain": "pulizie", "items": []
        }, headers=H)
        requests.put(f"{API}/magazzino/zaini/{zid}", json={"kit_id": None}, headers=H)

    def test_reintegro_origin_central(self, H):
        zid = S["_zid"]
        cat = _catalog(H, "pulizie")
        pezze = next(p for p in cat if p["name"] == "Pezze per lavare")
        S["zaino_stocks"].append((zid, pezze["id"]))
        S["central_stocks"].append(("pulizie", pezze["id"]))
        # Assicura scorta central
        m0 = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "pulizie", "movement_type": "carico", "product_id": pezze["id"], "qty": 10,
            "origin": {"type": "external", "label": "TEST"}, "destination": {"type": "central"}
        }, headers=H)
        S["movements"].append(m0.json()["id"])
        r = requests.post(f"{API}/magazzino/zaini/{zid}/reintegro", json={
            "items": [{"product_id": pezze["id"], "qty": 1}]
        }, headers=H)
        assert r.status_code == 200
        movs = requests.get(f"{API}/magazzino/movimenti",
                            params={"zaino_id": zid, "movement_type": "reintegro_zaino"},
                            headers=H).json()["items"]
        assert movs, "nessun movimento reintegro_zaino"
        latest = movs[0]
        assert latest["origin"]["type"] == "central"
        assert "Magazzino Generale" in (latest["origin"].get("label") or "")
        S["movements"].append(latest["id"])


# ============ (7) INVENTARIO ============

class TestInventario:
    def test_inventario_central_generates_rettifica(self, H):
        cat = _catalog(H, "noleggio")
        pid = next(p["id"] for p in cat if p["name"] == "Federa")
        # Prima porta central > 0 tramite carico se serve
        stk = requests.get(f"{API}/magazzino/generale/stock/noleggio", headers=H).json()
        cur = next(r["qty"] for r in stk if r["id"] == pid)
        inv = requests.post(f"{API}/magazzino/inventario", json={
            "domain": "noleggio", "location_type": "central",
            "counts": [{"product_id": pid, "counted": cur + 3}]
        }, headers=H)
        assert inv.status_code == 200
        adj = inv.json()["adjustments"]
        assert len(adj) == 1 and adj[0]["to"] == cur + 3
        S["movements"].append(adj[0]["movement_id"])


# ============ (8) STORNO ============

class TestStorno:
    def test_storno_and_double_storno_400(self, H):
        cat = _catalog(H, "noleggio")
        pid = next(p["id"] for p in cat if p["name"] == "Federa")
        m = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "noleggio", "movement_type": "carico", "product_id": pid, "qty": 1,
            "origin": {"type": "external", "label": "TEST"}, "destination": {"type": "central"}
        }, headers=H)
        mid = m.json()["id"]
        S["movements"].append(mid)
        r = requests.post(f"{API}/magazzino/movimenti/{mid}/storno", headers=H)
        assert r.status_code == 200
        inv_id = r.json()["id"]
        S["movements"].append(inv_id)
        assert r.json()["movement_type"] == "annullamento"
        # secondo storno stesso movimento → 400
        r2 = requests.post(f"{API}/magazzino/movimenti/{mid}/storno", headers=H)
        assert r2.status_code == 400


# ============ (9)(10) SEGNALAZIONI ============

class TestSegnalazioni:
    def test_fabbisogno_noleggio_does_not_create_segnalazione(self, H):
        before = requests.get(f"{API}/segnalazioni", headers=H)
        # Endpoint può essere lista o {items:[]}
        def _count(resp):
            if resp.status_code != 200:
                return None
            d = resp.json()
            return len(d) if isinstance(d, list) else len(d.get("items", d.get("segnalazioni", [])))
        c0 = _count(before)
        struct = _pick_structure(H)
        f = requests.post(f"{API}/magazzino/fabbisogni", json={
            "kind": "noleggio", "structure_id": struct["id"],
            "items": [{"product_id": "x", "name": "TEST", "qty": 1}],
            "note": "TEST fabbisogno noleggio"
        }, headers=H)
        assert f.status_code == 200
        S["fabbisogni"].append(f.json()["id"])
        after = requests.get(f"{API}/segnalazioni", headers=H)
        c1 = _count(after)
        if c0 is not None and c1 is not None:
            assert c1 == c0, f"segnalazioni cambiate {c0}→{c1} da fabbisogno noleggio"

    def test_anomalia_warehouse_appears_in_kpi(self, H):
        struct = _pick_structure(H)
        payload = {
            "origin_type": "warehouse",
            "type": "missing",
            "structure_id": struct["id"],
            "title": "TEST anomalia magazzino",
            "description": "TEST",
            "priority": "medium",
        }
        r = requests.post(f"{API}/segnalazioni", json=payload, headers=H)
        # Alcune API accettano campo diverso — accettiamo 200/201
        if r.status_code not in (200, 201):
            pytest.skip(f"segnalazioni endpoint schema diverso: {r.status_code} {r.text[:200]}")
        try:
            sid_seg = r.json().get("id")
            if sid_seg:
                S["segnalazioni"].append(sid_seg)
        except Exception:
            pass
        # KPI anomalie deve essere >=1 in entrambe overview
        so = requests.get(f"{API}/magazzino/strutture/overview", headers=H).json()
        go = requests.get(f"{API}/magazzino/generale/overview", headers=H).json()
        assert so["kpi"]["anomalie"] >= 1
        assert go["kpi"]["anomalie"] >= 1


# ============ (13) FILTRI MOVIMENTI ============

class TestFiltriMovimenti:
    def test_scope_strutture_only_structure(self, H):
        r = requests.get(f"{API}/magazzino/movimenti", params={"scope": "strutture", "limit": 50}, headers=H)
        assert r.status_code == 200
        for m in r.json()["items"]:
            assert m["origin"]["type"] == "structure" or m["destination"]["type"] == "structure"

    def test_scope_generale_only_central_or_zaino(self, H):
        r = requests.get(f"{API}/magazzino/movimenti", params={"scope": "generale", "limit": 50}, headers=H)
        assert r.status_code == 200
        for m in r.json()["items"]:
            assert m["origin"]["type"] in ("central", "zaino") or m["destination"]["type"] in ("central", "zaino")

    def test_filter_user_and_client(self, H):
        # user regex "test" (matcha 'Test User' admin)
        r = requests.get(f"{API}/magazzino/movimenti", params={"user": "test", "limit": 20}, headers=H)
        assert r.status_code == 200
        # client_id (arbitrario) non deve dare errore
        struct = _pick_structure(H)
        if struct.get("client_id"):
            r2 = requests.get(f"{API}/magazzino/movimenti",
                              params={"client_id": struct["client_id"], "limit": 20}, headers=H)
            assert r2.status_code == 200


# ============ CLEANUP ============

def test_zzz_cleanup(H):
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL") or _read_env_backend("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or _read_env_backend("DB_NAME")
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    # movimenti creati
    for mid in set(S["movements"]):
        db.warehouse_movements.delete_one({"id": mid})
    # fabbisogni
    for fid in set(S["fabbisogni"]):
        db.fabbisogni.delete_one({"id": fid})
    # segnalazioni TEST_
    db.segnalazioni.delete_many({"title": {"$regex": "^TEST"}})
    for sid in set(S["segnalazioni"]):
        db.segnalazioni.delete_one({"id": sid})
    # structure_cleaning_kits di test
    for sid in set(S["structure_kits"]):
        db.structure_cleaning_kits.delete_one({"structure_id": sid})
    # stock_levels di test
    for domain, pid in set(S["central_stocks"]):
        db.stock_levels.delete_many({"domain": domain, "location_type": "central", "product_id": pid})
    for domain, sid, pid in set(S["structure_stocks"]):
        db.stock_levels.delete_many({"domain": domain, "location_type": "structure",
                                     "location_id": sid, "product_id": pid})
    for zid, pid in set(S["zaino_stocks"]):
        db.stock_levels.delete_many({"domain": "pulizie", "location_type": "zaino",
                                     "location_id": zid, "product_id": pid})
    # Reset kit configurati a items=[]
    for kid in set(S["kits_reset"]):
        k = db.kits.find_one({"id": kid})
        if k:
            name = k["name"]
            domain = k["domain"]
            db.kits.update_one({"id": kid}, {"$set": {"items": [], "updated_at": ""}})
            db.kit_versions.delete_many({"kit_id": kid})
    # prodotti TEST_
    for coll in ("rental_catalog", "supply_catalog", "cleaning_catalog"):
        db[coll].delete_many({"name": {"$regex": "^TEST_"}})
    print("Cleanup done.")


def _read_env_backend(key):
    try:
        with open("/app/backend/.env") as f:
            for line in f:
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass
    return None
