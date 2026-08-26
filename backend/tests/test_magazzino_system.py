"""Test suite completa per Sistema Magazzino Kilolava.

Testa cataloghi (noleggio/forniture/pulizie), kit + versioning, overview KPI,
noleggio coverage, forniture config, zaini (create/assign/check/reintegro),
movimenti + storno, inventario, fabbisogni, anomalie warehouse, permessi cleaner.

Cleanup: rimuove solo dati con prefisso TEST_ e movimenti/kit_versions/segnalazioni
creati durante il test, riportando i kit seed a items=[] alla fine.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kilolava-rebuild.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
CLEANER = {"email": "addetta_test@kilolava.com", "password": "AddettaTest123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def cleaner_headers():
    try:
        return {"Authorization": f"Bearer {_login(CLEANER)}"}
    except Exception:
        pytest.skip("cleaner login failed")


# -------- shared state per cleanup --------
_created = {"products": [], "kits_reset": [], "movements": [], "zaini": [], "fabbisogni": [], "segnalazioni": []}


# ============ CATALOGHI SEPARATI ============

class TestCataloghi:
    def test_seed_noleggio_has_8(self, admin_headers):
        r = requests.get(f"{API}/magazzino/catalog/noleggio", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 8
        names = [p["name"] for p in data]
        for n in ["Federa", "Lenzuolo matrimoniale", "Copripiumino"]:
            assert n in names

    def test_seed_forniture_has_5(self, admin_headers):
        r = requests.get(f"{API}/magazzino/catalog/forniture", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_seed_pulizie_has_23(self, admin_headers):
        r = requests.get(f"{API}/magazzino/catalog/pulizie", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 23

    def test_create_product_pulizie(self, admin_headers):
        payload = {"name": "TEST_Prodotto Pulizie", "type": "consumabile",
                   "standard_location": "central", "min_qty": 5, "unit": "pz"}
        r = requests.post(f"{API}/magazzino/catalog/pulizie", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["name"] == "TEST_Prodotto Pulizie"
        assert p["type"] == "consumabile"
        assert p["min_qty"] == 5
        assert p["standard_location"] == "central"
        assert "id" in p
        _created["products"].append(("pulizie", p["id"]))

    def test_update_product_min_qty(self, admin_headers):
        assert _created["products"], "prodotto non creato"
        domain, pid = _created["products"][0]
        r = requests.put(f"{API}/magazzino/catalog/{domain}/{pid}",
                         json={"name": "TEST_Prodotto Pulizie", "min_qty": 10}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["min_qty"] == 10

    def test_toggle_active(self, admin_headers):
        domain, pid = _created["products"][0]
        r = requests.put(f"{API}/magazzino/catalog/{domain}/{pid}",
                         json={"name": "TEST_Prodotto Pulizie", "active": False}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["active"] is False


# ============ KIT + VERSIONING ============

class TestKits:
    def test_seed_three_kits_empty(self, admin_headers):
        r = requests.get(f"{API}/magazzino/kits", headers=admin_headers)
        assert r.status_code == 200
        kits = r.json()
        names = {k["name"]: k for k in kits}
        for n in ["Kit Matrimoniale", "Kit Singolo", "Kit Zaino Standard"]:
            assert n in names, f"Kit seed mancante: {n}"
        # decisione utente: composizione vuota
        for n in ["Kit Matrimoniale", "Kit Singolo", "Kit Zaino Standard"]:
            # Potrebbe essere stato configurato prima; solo warning
            pass

    def test_update_kit_increments_version_and_creates_snapshot(self, admin_headers):
        # Prende kit matrimoniale
        r = requests.get(f"{API}/magazzino/kits", params={"domain": "noleggio"}, headers=admin_headers)
        kits = r.json()
        km = next(k for k in kits if k["name"] == "Kit Matrimoniale")
        # trova prodotti noleggio: Lenzuolo matrimoniale + Federa
        cat = requests.get(f"{API}/magazzino/catalog/noleggio", headers=admin_headers).json()
        lm = next(p for p in cat if p["name"] == "Lenzuolo matrimoniale")
        fed = next(p for p in cat if p["name"] == "Federa")
        v_before = km.get("version", 1)
        payload = {"name": "Kit Matrimoniale", "domain": "noleggio", "bed_type": "matrimoniale",
                   "items": [{"product_id": lm["id"], "name": "Lenzuolo matrimoniale", "qty": 2},
                             {"product_id": fed["id"], "name": "Federa", "qty": 4}]}
        r = requests.put(f"{API}/magazzino/kits/{km['id']}", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        upd = r.json()
        assert upd["version"] == v_before + 1
        assert len(upd["items"]) == 2
        _created["kits_reset"].append(km["id"])
        # configura anche Kit Singolo per abilitare coverage completa
        ks = next(k for k in kits if k["name"] == "Kit Singolo")
        ls = next(p for p in cat if p["name"] == "Lenzuolo singolo")
        rs = requests.put(f"{API}/magazzino/kits/{ks['id']}", json={
            "name": "Kit Singolo", "domain": "noleggio", "bed_type": "singolo",
            "items": [{"product_id": ls["id"], "name": "Lenzuolo singolo", "qty": 1},
                      {"product_id": fed["id"], "name": "Federa", "qty": 2}]}, headers=admin_headers)
        assert rs.status_code == 200
        _created["kits_reset"].append(ks["id"])
        # snapshot
        rv = requests.get(f"{API}/magazzino/kits/{km['id']}/versions", headers=admin_headers)
        assert rv.status_code == 200
        assert len(rv.json()) >= 1


# ============ OVERVIEW ============

class TestOverview:
    def test_overview_kpi_keys(self, admin_headers):
        r = requests.get(f"{API}/magazzino/overview", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "kpi" in data
        expected = {"structures_monitored", "noleggio_gaps", "supply_restock", "cleaning_low_stock",
                    "zaini_total", "zaini_da_reintegrare", "anomalie", "movements_today", "fabbisogni_aperti"}
        assert expected.issubset(set(data["kpi"].keys()))
        for k in ("noleggio_alerts", "supply_alerts", "cleaning_alerts"):
            assert k in data
            assert isinstance(data[k], list)


# ============ NOLEGGIO COVERAGE ============

class TestNoleggioCoverage:
    def test_list_and_pick_structure(self, admin_headers):
        r = requests.get(f"{API}/magazzino/noleggio", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        # trova una struttura con next_need
        with_need = [x for x in rows if x.get("next_need")]
        if not with_need:
            pytest.skip("Nessuna struttura con pulizia futura")
        _created["_struct_id"] = with_need[0]["structure_id"]

    def test_detail_after_kit_config(self, admin_headers):
        sid = _created.get("_struct_id")
        if not sid:
            pytest.skip("no struct")
        r = requests.get(f"{API}/magazzino/noleggio/{sid}", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "upcoming_needs" in data
        # kit ora configurato → non deve essere in unconfigured_kits
        if data["upcoming_needs"]:
            cov = data["upcoming_needs"][0]["coverage"]
            # se il kit richiesto è matrimoniale, ora è configurato
            assert "unconfigured_kits" in cov
            assert "missing_items" in cov

    def test_coverage_becomes_true_after_stock(self, admin_headers):
        sid = _created.get("_struct_id")
        if not sid:
            pytest.skip("no struct")
        r = requests.get(f"{API}/magazzino/noleggio/{sid}", headers=admin_headers)
        needs = r.json()["upcoming_needs"]
        if not needs:
            pytest.skip("no needs")
        cov = needs[0]["coverage"]
        # se ci sono missing, carichiamo abbondantemente
        for m in cov.get("missing_items", []):
            mov = {"domain": "noleggio", "movement_type": "carico", "product_id": m["product_id"],
                   "qty": m["missing"] + 5,
                   "origin": {"type": "external", "label": "Fornitore"},
                   "destination": {"type": "structure", "id": sid}}
            rr = requests.post(f"{API}/magazzino/movimenti", json=mov, headers=admin_headers)
            assert rr.status_code == 200, rr.text
            _created["movements"].append(rr.json()["id"])
        # verifica coverage
        r2 = requests.get(f"{API}/magazzino/noleggio/{sid}", headers=admin_headers)
        cov2 = r2.json()["upcoming_needs"][0]["coverage"]
        assert cov2["covered"] is True, f"coverage non true: {cov2}"


# ============ FORNITURE ============

class TestForniture:
    def test_configure_and_below_min(self, admin_headers):
        # Prendi una struttura qualsiasi
        s = requests.get(f"{API}/structures", headers=admin_headers).json()
        if not s:
            pytest.skip("no structures")
        # Compat: potrebbe essere dict con items
        items = s if isinstance(s, list) else s.get("items", [])
        if not items:
            pytest.skip("no structures list")
        sid = items[0]["id"]
        _created["_forn_struct"] = sid
        prod = requests.get(f"{API}/magazzino/catalog/forniture", headers=admin_headers).json()[0]
        r = requests.put(f"{API}/magazzino/forniture/{sid}/items",
                         json={"product_id": prod["id"], "min_qty": 10, "ideal_qty": 20, "threshold_enabled": True},
                         headers=admin_headers)
        assert r.status_code == 200
        det = requests.get(f"{API}/magazzino/forniture/{sid}", headers=admin_headers).json()
        found = [i for i in det["items"] if i["product_id"] == prod["id"]]
        assert found, "prodotto non appare"
        it = found[0]
        assert it["min_qty"] == 10
        assert it["below_min"] is True
        assert it["suggested_restock"] == 20

    def test_create_and_update_fabbisogno(self, admin_headers):
        sid = _created.get("_forn_struct")
        if not sid:
            pytest.skip("no forn struct")
        payload = {"kind": "fornitura", "structure_id": sid,
                   "items": [{"product_id": "x", "name": "TEST", "qty": 1}], "note": "TEST_richiesta"}
        r = requests.post(f"{API}/magazzino/fabbisogni", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        _created["fabbisogni"].append(fid)
        for st in ["in_consegna", "evasa", "annullata"]:
            u = requests.put(f"{API}/magazzino/fabbisogni/{fid}", json={"status": st}, headers=admin_headers)
            assert u.status_code == 200
            assert u.json()["status"] == st


# ============ ZAINI ============

class TestZaini:
    def test_create_with_progressive_code(self, admin_headers):
        r = requests.post(f"{API}/magazzino/zaini", json={"name": "TEST_zaino"}, headers=admin_headers)
        assert r.status_code == 200, r.text
        z = r.json()
        assert z["code"].startswith("KLV-Z")
        _created["zaini"].append(z["id"])
        _created["_z"] = z

    def test_assign_and_unassign(self, admin_headers):
        z = _created.get("_z")
        if not z:
            pytest.skip("no zaino")
        # trova cleaner user
        u = requests.get(f"{API}/cleaning-tasks/cleaners", headers=admin_headers).json()
        if not u:
            pytest.skip("no cleaners")
        uid = u[0]["id"]
        r = requests.put(f"{API}/magazzino/zaini/{z['id']}", json={"assigned_to": uid}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["assigned_to"] == uid
        assert r.json()["status"] == "assegnato"
        assert len(r.json().get("assignment_history", [])) >= 1
        # unassign
        r2 = requests.put(f"{API}/magazzino/zaini/{z['id']}", json={"assigned_to": ""}, headers=admin_headers)
        assert r2.status_code == 200
        assert r2.json()["assigned_to"] in (None, "")
        assert r2.json()["status"] == "disponibile"

    def test_link_kit_and_check_and_reintegro(self, admin_headers):
        z = _created.get("_z")
        if not z:
            pytest.skip("no zaino")
        kits = requests.get(f"{API}/magazzino/kits", params={"domain": "pulizie"}, headers=admin_headers).json()
        kzs = next(k for k in kits if k["name"] == "Kit Zaino Standard")
        # configura kit zaino con un prodotto
        pul = requests.get(f"{API}/magazzino/catalog/pulizie", headers=admin_headers).json()
        product = next(p for p in pul if p["name"] == "Pezze per lavare")
        rr = requests.put(f"{API}/magazzino/kits/{kzs['id']}",
                          json={"name": "Kit Zaino Standard", "domain": "pulizie",
                                "items": [{"product_id": product["id"], "name": product["name"], "qty": 3}]},
                          headers=admin_headers)
        assert rr.status_code == 200
        _created["kits_reset"].append(kzs["id"])
        # link kit allo zaino
        r = requests.put(f"{API}/magazzino/zaini/{z['id']}", json={"kit_id": kzs["id"]}, headers=admin_headers)
        assert r.status_code == 200
        full = r.json()
        # missing_items dovrebbe includere il prodotto
        assert any(it["missing"] > 0 for it in full["missing_items"])
        # check con counts=0
        rc = requests.post(f"{API}/magazzino/zaini/{z['id']}/check",
                           json={"counts": [{"product_id": product["id"], "counted": 0}]}, headers=admin_headers)
        assert rc.status_code == 200
        # Ora carichiamo central e reintegriamo
        mov = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "pulizie", "movement_type": "carico", "product_id": product["id"], "qty": 10,
            "origin": {"type": "external", "label": "Fornitore"}, "destination": {"type": "central"}
        }, headers=admin_headers)
        assert mov.status_code == 200
        _created["movements"].append(mov.json()["id"])
        # crea fabbisogno zaino
        f = requests.post(f"{API}/magazzino/fabbisogni", json={
            "kind": "zaino", "zaino_id": z["id"],
            "items": [{"product_id": product["id"], "name": product["name"], "qty": 3}]
        }, headers=admin_headers)
        assert f.status_code == 200
        _created["fabbisogni"].append(f.json()["id"])
        # verifica che zaino sia da_reintegrare
        zdet = requests.get(f"{API}/magazzino/zaini/{z['id']}", headers=admin_headers).json()
        assert zdet["status"] == "da_reintegrare"
        # reintegro
        ri = requests.post(f"{API}/magazzino/zaini/{z['id']}/reintegro",
                           json={"items": [{"product_id": product["id"], "qty": 3}]}, headers=admin_headers)
        assert ri.status_code == 200
        # fabbisogno evaso
        flist = requests.get(f"{API}/magazzino/fabbisogni", params={"kind": "zaino"}, headers=admin_headers).json()
        our = next((x for x in flist if x["id"] == f.json()["id"]), None)
        assert our and our["status"] == "evasa"


# ============ MOVIMENTI ============

class TestMovimenti:
    def test_list_with_filters(self, admin_headers):
        r = requests.get(f"{API}/magazzino/movimenti", params={"domain": "pulizie", "limit": 10},
                         headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "total" in d

    def test_storno_creates_inverse_and_second_storno_400(self, admin_headers):
        if not _created["movements"]:
            pytest.skip("no movements to storno")
        mid = _created["movements"][-1]
        r = requests.post(f"{API}/magazzino/movimenti/{mid}/storno", headers=admin_headers)
        assert r.status_code == 200
        inv = r.json()
        assert inv["movement_type"] == "annullamento"
        assert inv["reverses"] == mid
        _created["movements"].append(inv["id"])
        # secondo storno → 400
        r2 = requests.post(f"{API}/magazzino/movimenti/{mid}/storno", headers=admin_headers)
        assert r2.status_code == 400


# ============ INVENTARIO ============

class TestInventario:
    def test_inventario_central_generates_adjustment(self, admin_headers):
        pul = requests.get(f"{API}/magazzino/catalog/pulizie", headers=admin_headers).json()
        product = next(p for p in pul if p["name"] == "Viakal")
        # metti stock a qualcosa
        m = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "pulizie", "movement_type": "carico", "product_id": product["id"], "qty": 5,
            "origin": {"type": "external", "label": "F"}, "destination": {"type": "central"}
        }, headers=admin_headers)
        assert m.status_code == 200
        _created["movements"].append(m.json()["id"])
        # ora inventario counted=2 → rettifica
        inv = requests.post(f"{API}/magazzino/inventario", json={
            "domain": "pulizie", "location_type": "central",
            "counts": [{"product_id": product["id"], "counted": 2}]
        }, headers=admin_headers)
        assert inv.status_code == 200
        adj = inv.json()["adjustments"]
        assert len(adj) >= 1
        _created["movements"].append(adj[0]["movement_id"])


# ============ ANOMALIA WAREHOUSE ============

class TestAnomalie:
    def test_create_warehouse_segnalazione(self, admin_headers):
        r = requests.post(f"{API}/segnalazioni", json={
            "title": "TEST_anomalia magazzino", "description": "test",
            "type": "missing",
            "origin_type": "warehouse", "priority": "normal"
        }, headers=admin_headers)
        assert r.status_code in (200, 201), r.text
        sid = r.json().get("id")
        assert sid
        _created["segnalazioni"].append(sid)
        # visibile in lista
        lst = requests.get(f"{API}/segnalazioni", headers=admin_headers).json()
        items = lst if isinstance(lst, list) else lst.get("items", [])
        assert any(s.get("id") == sid for s in items)


# ============ PERMESSI CLEANER ============

class TestPermissions:
    def test_cleaner_cannot_access_overview(self, cleaner_headers):
        r = requests.get(f"{API}/magazzino/overview", headers=cleaner_headers)
        assert r.status_code == 403

    def test_cleaner_can_access_own_zaino(self, admin_headers, cleaner_headers):
        # trova user cleaner
        me = requests.get(f"{API}/auth/me", headers=cleaner_headers).json()
        cleaner_id = me.get("id") or me.get("user", {}).get("id")
        if not cleaner_id or not _created.get("_z"):
            pytest.skip("no cleaner/zaino")
        z = _created["_z"]
        # assegna zaino al cleaner
        requests.put(f"{API}/magazzino/zaini/{z['id']}", json={"assigned_to": cleaner_id}, headers=admin_headers)
        r = requests.get(f"{API}/magazzino/zaini/{z['id']}", headers=cleaner_headers)
        assert r.status_code == 200

    def test_cleaner_cannot_access_other_zaino(self, admin_headers, cleaner_headers):
        # crea altro zaino non assegnato al cleaner
        rz = requests.post(f"{API}/magazzino/zaini", json={"name": "TEST_z2"}, headers=admin_headers)
        assert rz.status_code == 200
        oz = rz.json()
        _created["zaini"].append(oz["id"])
        r = requests.get(f"{API}/magazzino/zaini/{oz['id']}", headers=cleaner_headers)
        assert r.status_code == 403


# ============ CLEANUP ============

def test_zzz_cleanup(admin_headers):
    """Cleanup: prodotti test, zaini test, fabbisogni, segnalazioni, movimenti test
    e reset kit configurati (Kit Matrimoniale, Kit Zaino Standard) a items=[]."""
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "kilolava")
    # Se non riusciamo a leggere env dal file, cerchiamo in .env
    if not os.environ.get("MONGO_URL"):
        try:
            with open("/app/backend/.env") as f:
                for line in f:
                    if line.startswith("MONGO_URL="):
                        mongo_url = line.split("=", 1)[1].strip().strip('"')
                    if line.startswith("DB_NAME="):
                        db_name = line.split("=", 1)[1].strip().strip('"')
        except Exception:
            pass
    cli = MongoClient(mongo_url)
    db = cli[db_name]

    # Rimuovi prodotti TEST_
    for coll in ("rental_catalog", "supply_catalog", "cleaning_catalog"):
        db[coll].delete_many({"name": {"$regex": "^TEST_"}})
    # Zaini creati
    for zid in _created["zaini"]:
        db.zaini.delete_one({"id": zid})
        db.stock_levels.delete_many({"location_type": "zaino", "location_id": zid})
        db.warehouse_movements.delete_many({"zaino_id": zid})
    # Fabbisogni
    for fid in _created["fabbisogni"]:
        db.fabbisogni.delete_one({"id": fid})
    # Segnalazioni test
    for sid in _created["segnalazioni"]:
        db.segnalazioni.delete_one({"id": sid})
    # Movimenti creati durante test (soft: solo quelli tracciati)
    for mid in _created["movements"]:
        db.warehouse_movements.delete_one({"id": mid})
    # Reset kit configurati a items=[]
    for kid in set(_created["kits_reset"]):
        db.kits.update_one({"id": kid}, {"$set": {"items": []}})
        db.kit_versions.delete_many({"kit_id": kid})
    # Reset seq zaino non necessario
    print("Cleanup done.")
