"""Iteration 21: Lavanderia a Noleggio real catalog (23 items) + 8 real Kits.

Tests the seed content, ordering, code assignment, versioning and cleans up any
TEST_ documents / counter drift at the end.
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def mdb():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


# --- Catalog: 23 NOL articles with expected ordering ------------------------

EXPECTED_NAMES = {
    "NOL-0001": "Federa Living",
    "NOL-0002": "Federa Dream",
    "NOL-0003": "Lenzuolo matrimoniale Living",
    "NOL-0004": "Lenzuolo matrimoniale Dream",
    "NOL-0005": "Lenzuolo singolo Living",
    "NOL-0006": "Lenzuolo singolo Dream",
    "NOL-0007": "Copripiumino singolo Dream",
    "NOL-0008": "Copripiumino matrimoniale Dream",
    "NOL-0009": "Asciugamano piccolo Living",
    "NOL-0010": "Asciugamano piccolo Dream",
    "NOL-0011": "Asciugamano medio Living",
    "NOL-0012": "Asciugamano medio Dream",
    "NOL-0013": "Asciugamano grande Living",
    "NOL-0014": "Asciugamano grande Dream",
    "NOL-0015": "Tappetino bagno",
    "NOL-0016": "Tovagliolo bianco",
    "NOL-0017": "Coprimacchia 100x100 bianco",
    "NOL-0018": "Coprimacchia 100x100 noce",
    "NOL-0019": "Coprimacchia 120x120 Folk fiocco marrone",
    "NOL-0020": "Coprimacchia 120x120 bianco",
    "NOL-0021": "Tovaglia 150x150 Opus tortora",
    "NOL-0022": "Tovaglia 150x150 bianco",
    "NOL-0023": "Tovaglia 180x180 bianco",
}


class TestNolCatalog:
    def test_catalog_23_items_expected_codes_and_defaults(self, H):
        r = requests.get(f"{BASE_URL}/api/magazzino/catalog/noleggio",
                         params={"include_inactive": "true"}, headers=H, timeout=30)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert len(rows) == 23, f"expected 23 rows got {len(rows)}"
        by_code = {p["code"]: p for p in rows}
        assert set(by_code.keys()) == set(EXPECTED_NAMES.keys())
        for code, name in EXPECTED_NAMES.items():
            p = by_code[code]
            assert p["name"] == name, f"{code} name mismatch: {p['name']}"
            assert p["materiale"] == "Cotone", f"{code} materiale != Cotone"
            assert p["unit"] == "pz"
            assert p.get("cost") is None
            assert p.get("prezzo_standard") is None
            assert p.get("photo") is None
            assert "Rigatino" not in p["name"]

    def test_catalog_visual_order(self, H):
        r = requests.get(f"{BASE_URL}/api/magazzino/catalog/noleggio",
                         params={"include_inactive": "true"}, headers=H, timeout=30)
        codes = [p["code"] for p in r.json()]
        expected_order = [f"NOL-{i:04d}" for i in range(1, 24)]
        assert codes == expected_order, f"visual order wrong: {codes}"

    def test_sample_fields(self, H):
        r = requests.get(f"{BASE_URL}/api/magazzino/catalog/noleggio",
                         params={"include_inactive": "true"}, headers=H, timeout=30)
        by_code = {p["code"]: p for p in r.json()}
        p = by_code["NOL-0001"]
        assert (p["category"], p["tipologia"], p["misura"], p["linea"]) == \
               ("Biancheria letto", "Federa", "Standard", "Living")
        p = by_code["NOL-0015"]
        assert (p["category"], p["tipologia"], p["misura"]) == ("Biancheria bagno", "Tappetino", "Bagno")
        assert (p.get("linea") or "") == ""
        p = by_code["NOL-0019"]
        assert p["category"] == "Tovagliato"
        assert p["tipologia"] == "Coprimacchia"
        assert p["misura"] == "120x120"
        assert p["linea"] == "Folk"
        assert p["colore"] == "Fiocco marrone"
        p = by_code["NOL-0023"]
        assert p["name"] == "Tovaglia 180x180 bianco"


# --- Kits: exactly 8 KIT-NOL kits with expected composition -----------------

EXPECTED_KITS = {
    "KIT-NOL-0001": ("matrimoniale", "Living", "estivo",
                     {"NOL-0003": 1, "NOL-0004": 1, "NOL-0001": 2, "NOL-0009": 2,
                      "NOL-0011": 2, "NOL-0013": 2, "NOL-0015": 1}),
    "KIT-NOL-0002": ("matrimoniale", "Living", "invernale",
                     {"NOL-0003": 1, "NOL-0008": 1, "NOL-0001": 2, "NOL-0009": 2,
                      "NOL-0011": 2, "NOL-0013": 2, "NOL-0015": 1}),
    "KIT-NOL-0003": ("singolo", "Living", "estivo",
                     {"NOL-0005": 1, "NOL-0006": 1, "NOL-0001": 1, "NOL-0009": 1,
                      "NOL-0011": 1, "NOL-0013": 1, "NOL-0015": 1}),
    "KIT-NOL-0004": ("singolo", "Living", "invernale",
                     {"NOL-0005": 1, "NOL-0007": 1, "NOL-0001": 1, "NOL-0009": 1,
                      "NOL-0011": 1, "NOL-0013": 1, "NOL-0015": 1}),
    "KIT-NOL-0005": ("matrimoniale", "Dream", "estivo",
                     {"NOL-0003": 1, "NOL-0004": 1, "NOL-0002": 2, "NOL-0010": 2,
                      "NOL-0012": 2, "NOL-0014": 2, "NOL-0015": 1}),
    "KIT-NOL-0006": ("matrimoniale", "Dream", "invernale",
                     {"NOL-0003": 1, "NOL-0008": 1, "NOL-0002": 2, "NOL-0010": 2,
                      "NOL-0012": 2, "NOL-0014": 2, "NOL-0015": 1}),
    "KIT-NOL-0007": ("singolo", "Dream", "estivo",
                     {"NOL-0005": 1, "NOL-0006": 1, "NOL-0002": 1, "NOL-0010": 1,
                      "NOL-0012": 1, "NOL-0014": 1, "NOL-0015": 1}),
    "KIT-NOL-0008": ("singolo", "Dream", "invernale",
                     {"NOL-0005": 1, "NOL-0007": 1, "NOL-0002": 1, "NOL-0010": 1,
                      "NOL-0012": 1, "NOL-0014": 1, "NOL-0015": 1}),
}


class TestNolKits:
    def test_8_kits_correct_composition(self, H):
        r = requests.get(f"{BASE_URL}/api/magazzino/kits",
                         params={"domain": "noleggio"}, headers=H, timeout=30)
        assert r.status_code == 200
        kits = r.json()
        assert len(kits) == 8, f"expected 8 kits got {len(kits)}"
        by_code = {k["code"]: k for k in kits}
        assert set(by_code.keys()) == set(EXPECTED_KITS.keys())
        for code, (bed, linea, stag, comp) in EXPECTED_KITS.items():
            k = by_code[code]
            assert k["bed_type"] == bed, f"{code} bed_type"
            assert k["linea"] == linea, f"{code} linea"
            assert k["stagione"] == stag, f"{code} stagione"
            # KIT-NOL-0001 may have version > 1 if versioning test already ran and
            # restored the composition; per user rules only current composition matters.
            if code != "KIT-NOL-0001":
                assert k["version"] == 1, f"{code} version != 1 (got {k['version']})"
            assert len(k["items"]) == 7, f"{code} not 7 items"
            got = {it["code"]: it["qty"] for it in k["items"]}
            assert got == comp, f"{code} composition mismatch: {got} vs {comp}"


# --- Auto-code NOL-0024 on POST, then cleanup -------------------------------

class TestAutoCodeAndCleanup:
    _created_product_id = None
    _kit_test_id = None

    def test_post_catalog_gets_nol_0024_and_ordering(self, H, mdb):
        payload = {"name": "TEST_Coprimacchia verifica", "category": "Tovagliato",
                   "tipologia": "Coprimacchia", "misura": "90x90", "ordine": 18}
        r = requests.post(f"{BASE_URL}/api/magazzino/catalog/noleggio",
                          json=payload, headers=H, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["code"] == "NOL-0024", f"expected NOL-0024 got {doc['code']}"
        TestAutoCodeAndCleanup._created_product_id = doc["id"]
        # verify appears next to Coprimacchia by ordine (position between NOL-0018 and NOL-0019)
        r2 = requests.get(f"{BASE_URL}/api/magazzino/catalog/noleggio",
                          params={"include_inactive": "true"}, headers=H, timeout=30)
        codes = [p["code"] for p in r2.json()]
        i_new = codes.index("NOL-0024")
        # ordine=18 → same as NOL-0018 (ordine 18); should be in Tovagliato group,
        # before NOL-0019 (ordine 19) and after Biancheria bagno group.
        i18 = codes.index("NOL-0018")
        i19 = codes.index("NOL-0019")
        assert i18 < i_new < i19 or (i_new == i18 + 1), f"placement odd: {codes}"

    def test_post_kit_gets_kit_nol_0009(self, H):
        payload = {"name": "TEST_Kit verifica", "domain": "noleggio",
                   "bed_type": "singolo", "linea": "Living", "stagione": "estivo", "items": []}
        r = requests.post(f"{BASE_URL}/api/magazzino/kits",
                          json=payload, headers=H, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["code"] == "KIT-NOL-0009", f"expected KIT-NOL-0009 got {doc['code']}"
        TestAutoCodeAndCleanup._kit_test_id = doc["id"]

    def test_zzz_cleanup_all(self, H, mdb):
        # Delete test product
        if TestAutoCodeAndCleanup._created_product_id:
            mdb.rental_catalog.delete_one({"code": "NOL-0024"})
        # Delete test kit
        if TestAutoCodeAndCleanup._kit_test_id:
            mdb.kits.delete_one({"code": "KIT-NOL-0009"})
        # Reset counters
        mdb.counters.update_one({"_id": "nol_code"}, {"$set": {"seq": 23}})
        mdb.counters.update_one({"_id": "kit_nol_code"}, {"$set": {"seq": 8}})
        # Verify final counts
        assert mdb.rental_catalog.count_documents({}) == 23
        assert mdb.kits.count_documents({"domain": "noleggio"}) == 8
        assert mdb.counters.find_one({"_id": "nol_code"})["seq"] == 23
        assert mdb.counters.find_one({"_id": "kit_nol_code"})["seq"] == 8


# --- Kit versioning: modify KIT-NOL-0001, verify v2 snapshot v1 intact, then restore

class TestKitVersioning:
    def test_kit_version_snapshot_and_restore(self, H, mdb):
        r = requests.get(f"{BASE_URL}/api/magazzino/kits",
                         params={"domain": "noleggio"}, headers=H, timeout=30)
        k = next(x for x in r.json() if x["code"] == "KIT-NOL-0001")
        kit_id = k["id"]
        original_items = k["items"]
        original_version = k["version"]

        # Modify: bump tappetino (NOL-0015) qty to 2
        new_items = []
        for it in original_items:
            new_items.append({"product_id": it["product_id"], "code": it["code"],
                              "name": it["name"],
                              "qty": 2 if it["code"] == "NOL-0015" else it["qty"]})
        payload = {"name": k["name"], "domain": "noleggio", "bed_type": k["bed_type"],
                   "linea": k["linea"], "stagione": k["stagione"], "items": new_items}
        r2 = requests.put(f"{BASE_URL}/api/magazzino/kits/{kit_id}", json=payload, headers=H, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["version"] == original_version + 1

        # Verify snapshot v1 exists with ORIGINAL composition
        r3 = requests.get(f"{BASE_URL}/api/magazzino/kits/{kit_id}/versions", headers=H, timeout=30)
        assert r3.status_code == 200
        versions = r3.json()
        v1 = next((v for v in versions if v["version"] == original_version), None)
        assert v1 is not None, f"snapshot for v{original_version} missing: {versions}"
        snap_items = {it["code"]: it["qty"] for it in v1["snapshot"]["items"]}
        orig_items = {it["code"]: it["qty"] for it in original_items}
        assert snap_items == orig_items, f"snapshot mismatch: {snap_items} vs {orig_items}"
        # In particular tappetino qty in the snapshot must be 1
        assert snap_items["NOL-0015"] == 1

        # RESTORE composition
        payload_restore = {"name": k["name"], "domain": "noleggio", "bed_type": k["bed_type"],
                           "linea": k["linea"], "stagione": k["stagione"],
                           "items": [{"product_id": it["product_id"], "code": it["code"],
                                      "name": it["name"], "qty": it["qty"]} for it in original_items]}
        r4 = requests.put(f"{BASE_URL}/api/magazzino/kits/{kit_id}", json=payload_restore, headers=H, timeout=30)
        assert r4.status_code == 200
        cur = r4.json()
        cur_items = {it["code"]: it["qty"] for it in cur["items"]}
        assert cur_items == orig_items, "restore did not bring back original items"
        assert cur_items["NOL-0015"] == 1
