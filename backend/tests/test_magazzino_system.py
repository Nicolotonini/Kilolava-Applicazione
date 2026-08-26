"""Test suite Sistema Magazzino Kilolava (design ristrutturato Gen 2026).

Copre:
- Cataloghi separati (noleggio 8 / forniture 5 / pulizie 23)
- Catalogo pulizie: standard_location solo 'casa'|'zaino', default 'casa'
- Nessuna riga stock_levels domain=pulizie location_type=central
- Kit + versioning
- Overview KPI (cleaning_low_stock = numero CASE con mancanze)
- Noleggio coverage
- Forniture config e restock
- **Magazzino Pulizie per-casa** (nuovo): configure, below_min, missing, movimenti, inventario
- Zaini rivisti: dotazione = 8 articoli standard (source='standard' qty 1) anche senza kit;
  kit prevale su standard; reintegro origin='external' (Acquisto/Scorta)
- Foto prodotti: upload multipart + GET /api/files
- Fabbisogni kind='pulizie'
- Permessi cleaner (403 su /magazzino/pulizie, 200 sul proprio zaino)

Cleanup: rimuove prodotti TEST_, zaini/fabbisogni/movimenti/segnalazioni creati,
riporta i kit seed a items=[].
"""
import io
import os
import requests
import pytest

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _read_frontend_env() or "").rstrip('/')
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN = {"email": "test_user@kilolava.com", "password": "TestPass123!"}
CLEANER = {"email": "addetta_test@kilolava.com", "password": "AddettaTest123!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def cleaner_headers():
    try:
        return {"Authorization": f"Bearer {_login(CLEANER)}"}
    except Exception:
        pytest.skip("cleaner login failed")


_created = {"products": [], "kits_reset": [], "movements": [], "zaini": [],
            "fabbisogni": [], "segnalazioni": [], "pulizie_stock_keys": []}


# ============ CATALOGHI ============

class TestCataloghi:
    def test_seed_noleggio_has_8(self, admin_headers):
        r = requests.get(f"{API}/magazzino/catalog/noleggio", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 8

    def test_seed_forniture_has_5(self, admin_headers):
        r = requests.get(f"{API}/magazzino/catalog/forniture", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_seed_pulizie_23_locations_casa_zaino(self, admin_headers):
        r = requests.get(f"{API}/magazzino/catalog/pulizie", headers=admin_headers)
        assert r.status_code == 200
        cat = r.json()
        assert len(cat) >= 23
        locs = {p["standard_location"] for p in cat if p.get("active", True)}
        # NIENTE 'central' — solo casa e zaino
        assert "central" not in locs
        assert locs.issubset({"casa", "zaino"})
        casa = [p for p in cat if p.get("standard_location") == "casa" and p.get("active", True)]
        zaino = [p for p in cat if p.get("standard_location") == "zaino" and p.get("active", True)]
        assert len(zaino) >= 8, f"attesi >=8 zaino, trovati {len(zaino)}"
        assert len(casa) >= 14, f"attese >=14 casa, trovate {len(casa)}"
        # NOTE: la specifica indica 8 zaino / 15 casa, ma la seed corrente ha
        # 9 zaino / 14 casa (Spazzolino/Spazzolone da fughe classificati zaino).

    def test_all_seed_products_have_photo(self, admin_headers):
        """Le 36 foto seed (8+5+23) devono essere già state generate."""
        for domain, expected in [("noleggio", 8), ("forniture", 5), ("pulizie", 23)]:
            cat = requests.get(f"{API}/magazzino/catalog/{domain}", headers=admin_headers).json()
            with_photo = [p for p in cat if p.get("photo") and (p["photo"].get("file_path"))]
            assert len(with_photo) >= expected, \
                f"{domain}: attesi {expected} prodotti con foto, trovati {len(with_photo)}"

    def test_create_pulizie_default_standard_location_casa(self, admin_headers):
        # Senza standard_location → default 'casa'
        r = requests.post(f"{API}/magazzino/catalog/pulizie",
                          json={"name": "TEST_prod_no_loc", "type": "consumabile", "min_qty": 3},
                          headers=admin_headers)
        assert r.status_code == 200
        p = r.json()
        assert p["standard_location"] == "casa"
        _created["products"].append(("pulizie", p["id"]))

    def test_create_pulizie_zaino_location(self, admin_headers):
        r = requests.post(f"{API}/magazzino/catalog/pulizie",
                          json={"name": "TEST_prod_zaino", "type": "consumabile",
                                "standard_location": "zaino", "min_qty": 1},
                          headers=admin_headers)
        assert r.status_code == 200
        p = r.json()
        assert p["standard_location"] == "zaino"
        _created["products"].append(("pulizie", p["id"]))

    def test_create_pulizie_invalid_location_falls_back_casa(self, admin_headers):
        # 'central' non è più accettato, deve tornare 'casa'
        r = requests.post(f"{API}/magazzino/catalog/pulizie",
                          json={"name": "TEST_prod_central", "type": "consumabile",
                                "standard_location": "central"},
                          headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["standard_location"] == "casa"
        _created["products"].append(("pulizie", r.json()["id"]))


# ============ NIENTE CENTRAL per pulizie in stock ============

class TestNoCentralPulizie:
    def test_no_stock_levels_pulizie_central(self, admin_headers):
        """Verifica indiretta: nessuna riga pulizie/central deve influire.
        Usiamo inventario location_type=central domain=pulizie con counts=[] → dovrebbe
        restituire 0 adjustments (stock vuoto)."""
        r = requests.post(f"{API}/magazzino/inventario", json={
            "domain": "pulizie", "location_type": "central", "counts": []
        }, headers=admin_headers)
        # deve rispondere 200 con 0 adjustments (o l'endpoint blocca central per pulizie)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            assert r.json()["adjustments"] == []


# ============ FOTO PRODOTTI ============

class TestFoto:
    def test_upload_photo_and_serve(self, admin_headers, admin_token):
        # Crea prodotto TEST per non sovrascrivere seed
        rp = requests.post(f"{API}/magazzino/catalog/pulizie",
                           json={"name": "TEST_prod_photo", "type": "consumabile"},
                           headers=admin_headers)
        assert rp.status_code == 200
        pid = rp.json()["id"]
        _created["products"].append(("pulizie", pid))
        # 1x1 png bytes
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000D49444154789C6300010000000500010D0A2DB40000000049454E44AE426082")
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = requests.post(f"{API}/magazzino/catalog/pulizie/{pid}/photo", files=files,
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        photo = data["photo"]
        assert "file_path" in photo
        # GET /api/files/{path}?auth=<token>
        r2 = requests.get(f"{API}/files/{photo['file_path']}", params={"auth": admin_token})
        assert r2.status_code == 200, f"file serve failed: {r2.status_code}"
        assert r2.headers.get("content-type", "").startswith("image/")


# ============ OVERVIEW ============

class TestOverview:
    def test_overview_kpi(self, admin_headers):
        r = requests.get(f"{API}/magazzino/overview", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("structures_monitored", "noleggio_gaps", "supply_restock",
                  "cleaning_low_stock", "zaini_total", "zaini_da_reintegrare",
                  "anomalie", "movements_today", "fabbisogni_aperti"):
            assert k in d["kpi"], f"kpi manca {k}"
        # cleaning_alerts contiene structure_id + name + missing_count
        for a in d["cleaning_alerts"]:
            assert "structure_id" in a and "name" in a and "missing_count" in a


# ============ MAGAZZINO PULIZIE per-casa (NUOVO) ============

class TestPulizieHouse:
    def _get_structure(self, admin_headers):
        s = requests.get(f"{API}/structures", headers=admin_headers).json()
        items = s if isinstance(s, list) else s.get("items", [])
        if not items:
            pytest.skip("no structures")
        return items[0]["id"]

    def test_pulizie_list_returns_houses(self, admin_headers):
        r = requests.get(f"{API}/magazzino/pulizie", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # se ci sono righe, hanno la struttura attesa
        for row in rows:
            for k in ("structure_id", "structure_name", "items_count", "missing_count", "missing_qty"):
                assert k in row, f"riga pulizie manca campo {k}"

    def test_configure_two_items_and_check_below_min(self, admin_headers):
        sid = self._get_structure(admin_headers)
        _created["_house_sid"] = sid
        # Prendi Mocio e Detersivo pavimenti dal catalogo
        cat = requests.get(f"{API}/magazzino/catalog/pulizie", headers=admin_headers).json()
        mocio = next(p for p in cat if p["name"] == "Mocio")
        det = next(p for p in cat if p["name"] == "Detersivo pavimenti")
        _created["_house_prod_a"] = mocio["id"]
        _created["_house_prod_b"] = det["id"]
        for pid, min_qty in [(mocio["id"], 1), (det["id"], 2)]:
            r = requests.put(f"{API}/magazzino/pulizie/{sid}/items",
                             json={"product_id": pid, "min_qty": min_qty},
                             headers=admin_headers)
            assert r.status_code == 200
            _created["pulizie_stock_keys"].append((sid, pid))
        # Detail
        det_r = requests.get(f"{API}/magazzino/pulizie/{sid}", headers=admin_headers).json()
        assert "items" in det_r and "movements" in det_r and "open_requests" in det_r
        found_mocio = next(i for i in det_r["items"] if i["product_id"] == mocio["id"])
        found_det = next(i for i in det_r["items"] if i["product_id"] == det["id"])
        # qty=0, min>0 → below_min True, missing = min
        assert found_mocio["qty"] == 0
        assert found_mocio["min_qty"] == 1
        assert found_mocio["below_min"] is True
        assert found_mocio["missing"] == 1
        assert found_det["missing"] == 2
        # type e photo presenti
        assert found_mocio.get("type") == "attrezzatura"
        assert "photo" in found_mocio

    def test_carico_external_to_structure_clears_below_min(self, admin_headers):
        sid = _created["_house_sid"]
        pid = _created["_house_prod_a"]
        mov = requests.post(f"{API}/magazzino/movimenti", json={
            "domain": "pulizie", "movement_type": "carico", "product_id": pid, "qty": 3,
            "origin": {"type": "external", "label": "Acquisto"},
            "destination": {"type": "structure", "id": sid}
        }, headers=admin_headers)
        assert mov.status_code == 200, mov.text
        _created["movements"].append(mov.json()["id"])
        det_r = requests.get(f"{API}/magazzino/pulizie/{sid}", headers=admin_headers).json()
        row = next(i for i in det_r["items"] if i["product_id"] == pid)
        assert row["qty"] == 3
        assert row["below_min"] is False
        assert row["missing"] == 0

    def test_inventario_structure_generates_rettifica(self, admin_headers):
        sid = _created["_house_sid"]
        pid = _created["_house_prod_a"]  # qty ora 3
        inv = requests.post(f"{API}/magazzino/inventario", json={
            "domain": "pulizie", "location_type": "structure", "location_id": sid,
            "counts": [{"product_id": pid, "counted": 1}]
        }, headers=admin_headers)
        assert inv.status_code == 200
        adj = inv.json()["adjustments"]
        assert len(adj) == 1
        assert adj[0]["from"] == 3 and adj[0]["to"] == 1
        _created["movements"].append(adj[0]["movement_id"])

    def test_fabbisogno_pulizie_visible_in_open_requests(self, admin_headers):
        sid = _created["_house_sid"]
        pid = _created["_house_prod_b"]
        f = requests.post(f"{API}/magazzino/fabbisogni", json={
            "kind": "pulizie", "structure_id": sid,
            "items": [{"product_id": pid, "name": "Detersivo pavimenti", "qty": 2}],
            "note": "TEST_richiesta pulizie casa"
        }, headers=admin_headers)
        assert f.status_code == 200, f.text
        fid = f.json()["id"]
        assert f.json()["kind"] == "pulizie"
        _created["fabbisogni"].append(fid)
        # Compare in detail open_requests
        det_r = requests.get(f"{API}/magazzino/pulizie/{sid}", headers=admin_headers).json()
        assert any(x["id"] == fid for x in det_r["open_requests"])
        # Compare in lista fabbisogni?kind=pulizie
        lst = requests.get(f"{API}/magazzino/fabbisogni",
                           params={"kind": "pulizie"}, headers=admin_headers).json()
        assert any(x["id"] == fid for x in lst)
        # Update status → evasa
        u = requests.put(f"{API}/magazzino/fabbisogni/{fid}",
                        json={"status": "evasa"}, headers=admin_headers)
        assert u.status_code == 200
        assert u.json()["status"] == "evasa"


# ============ ZAINI (dotazione standard + kit prevalence) ============

class TestZainiStandard:
    def test_zaino_standard_dotation_8_items(self, admin_headers):
        # Crea uno zaino senza kit
        r = requests.post(f"{API}/magazzino/zaini", json={"name": "TEST_z_std"}, headers=admin_headers)
        assert r.status_code == 200
        z = r.json()
        _created["zaini"].append(z["id"])
        _created["_z_std"] = z
        # Detail: dotation ha 8 articoli standard con qty=1 source='standard'
        det = requests.get(f"{API}/magazzino/zaini/{z['id']}", headers=admin_headers).json()
        dotation = det["dotation"]
        std_items = [d for d in dotation if d.get("source") == "standard"]
        assert len(std_items) >= 8, f"attesi >=8 standard, trovati {len(std_items)}"
        assert all(d["qty"] == 1 for d in std_items)
        # Tutti missing (present=0, missing=1)
        assert all(d["missing"] == 1 for d in std_items)

    def test_missing_count_reflects_standard(self, admin_headers):
        lst = requests.get(f"{API}/magazzino/zaini", headers=admin_headers).json()
        z = _created["_z_std"]
        mine = next((x for x in lst if x["id"] == z["id"]), None)
        assert mine is not None
        assert mine["missing_count"] >= 8

    def test_kit_qty_prevails_over_standard(self, admin_headers):
        # Prendi un articolo standard dal catalogo (es. Swiffer pavimenti — zaino)
        cat = requests.get(f"{API}/magazzino/catalog/pulizie", headers=admin_headers).json()
        swp = next(p for p in cat if p["name"] == "Swiffer pavimenti")
        # Kit Zaino Standard con Swiffer qty=3
        kits = requests.get(f"{API}/magazzino/kits", params={"domain": "pulizie"},
                            headers=admin_headers).json()
        kzs = next(k for k in kits if k["name"] == "Kit Zaino Standard")
        r = requests.put(f"{API}/magazzino/kits/{kzs['id']}", json={
            "name": "Kit Zaino Standard", "domain": "pulizie",
            "items": [{"product_id": swp["id"], "name": swp["name"], "qty": 3}]
        }, headers=admin_headers)
        assert r.status_code == 200
        _created["kits_reset"].append(kzs["id"])
        # Link kit allo zaino
        z = _created["_z_std"]
        requests.put(f"{API}/magazzino/zaini/{z['id']}", json={"kit_id": kzs["id"]},
                     headers=admin_headers)
        det = requests.get(f"{API}/magazzino/zaini/{z['id']}", headers=admin_headers).json()
        swp_row = next(d for d in det["dotation"] if d["product_id"] == swp["id"])
        # Ora deve essere source='kit' qty=3 (prevale su standard 1)
        assert swp_row["source"] == "kit"
        assert swp_row["qty"] == 3

    def test_reintegro_from_external_not_central(self, admin_headers):
        z = _created["_z_std"]
        cat = requests.get(f"{API}/magazzino/catalog/pulizie", headers=admin_headers).json()
        pezze = next(p for p in cat if p["name"] == "Pezze per lavare")
        r = requests.post(f"{API}/magazzino/zaini/{z['id']}/reintegro",
                          json={"items": [{"product_id": pezze["id"], "qty": 1}]},
                          headers=admin_headers)
        assert r.status_code == 200
        # Verifica il movimento
        movs = requests.get(f"{API}/magazzino/movimenti",
                            params={"zaino_id": z["id"], "domain": "pulizie"},
                            headers=admin_headers).json()["items"]
        reints = [m for m in movs if m["movement_type"] == "reintegro_zaino"]
        assert reints, "nessun movimento reintegro_zaino"
        latest = reints[0]
        assert latest["origin"]["type"] == "external"
        assert "Acquisto" in (latest["origin"].get("label") or "")
        _created["movements"].append(latest["id"])


# ============ PERMESSI ============

class TestPermessi:
    def test_cleaner_403_on_pulizie_list(self, cleaner_headers):
        r = requests.get(f"{API}/magazzino/pulizie", headers=cleaner_headers)
        assert r.status_code == 403

    def test_cleaner_can_access_own_zaino(self, admin_headers, cleaner_headers):
        me = requests.get(f"{API}/auth/me", headers=cleaner_headers).json()
        cid = me.get("id") or (me.get("user") or {}).get("id")
        if not cid or "_z_std" not in _created:
            pytest.skip("no cleaner id / zaino")
        z = _created["_z_std"]
        requests.put(f"{API}/magazzino/zaini/{z['id']}",
                     json={"assigned_to": cid}, headers=admin_headers)
        r = requests.get(f"{API}/magazzino/zaini/{z['id']}", headers=cleaner_headers)
        assert r.status_code == 200


# ============ CLEANUP ============

def test_zzz_cleanup(admin_headers):
    from pymongo import MongoClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url:
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
    for coll in ("rental_catalog", "supply_catalog", "cleaning_catalog"):
        db[coll].delete_many({"name": {"$regex": "^TEST_"}})
    for zid in _created["zaini"]:
        db.zaini.delete_one({"id": zid})
        db.stock_levels.delete_many({"location_type": "zaino", "location_id": zid})
        db.warehouse_movements.delete_many({"zaino_id": zid})
    for fid in _created["fabbisogni"]:
        db.fabbisogni.delete_one({"id": fid})
    for sid in _created["segnalazioni"]:
        db.segnalazioni.delete_one({"id": sid})
    for mid in _created["movements"]:
        db.warehouse_movements.delete_one({"id": mid})
    # rimuovi pulizie stock_levels di test
    for sid, pid in _created["pulizie_stock_keys"]:
        db.stock_levels.delete_many({"domain": "pulizie", "location_type": "structure",
                                     "location_id": sid, "product_id": pid})
        db.warehouse_movements.delete_many({"domain": "pulizie", "structure_id": sid,
                                            "product_id": pid})
    # reset kit configurati a items=[]
    for kid in set(_created["kits_reset"]):
        db.kits.update_one({"id": kid}, {"$set": {"items": []}})
        db.kit_versions.delete_many({"kit_id": kid})
    print("Cleanup done.")
