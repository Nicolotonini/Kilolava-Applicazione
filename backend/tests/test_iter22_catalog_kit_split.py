from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Iteration 22 tests — Cataloghi Prodotti (3 domains) + Kit separati + delete flow.

Copre:
- GET catalog noleggio/forniture/pulizie con campioni
- 8 kit KIT-NOL, nessun Zaino Standard
- Delete CASO A (mai usato) → 200
- Delete CASO B (usato in kit) → 409
- Codici monotoni non riusati
- Redirect logico non testabile qui (frontend)
- Cleanup counter alla fine
"""
import os
import pytest
import requests
from pathlib import Path


def _load_env():
    for p in (Path("/app/frontend/.env"), Path("/app/backend/.env")):
        if p.exists():
            for line in p.read_text().splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"'))


_load_env()
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
EMAIL = "test_user@kilolava.com"
PASS = TEST_ADMIN_PASSWORD


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASS}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- GET catalogs ----------

def test_noleggio_catalog_23(h):
    r = requests.get(f"{BASE}/api/magazzino/catalog/noleggio",
                     params={"include_inactive": "true"}, headers=h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    codes = [p["code"] for p in data if p.get("code", "").startswith("NOL-")]
    assert len(codes) == 23, f"Expected 23 NOL, got {len(codes)}"
    assert "NOL-0001" in codes and "NOL-0023" in codes
    for p in data:
        if p.get("code", "").startswith("NOL-"):
            assert p.get("materiale") == "Cotone"
            assert p.get("unit") == "pz"
            assert p.get("cost") is None
            assert p.get("prezzo_standard") is None
            assert p.get("photo") is None


def test_forniture_catalog_8(h):
    r = requests.get(f"{BASE}/api/magazzino/catalog/forniture",
                     params={"include_inactive": "true"}, headers=h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = [p for p in data if (p.get("code") or "").startswith("FOR-")]
    assert len(items) == 8
    by = {p["code"]: p for p in items}
    assert by["FOR-0001"]["name"] == "Carta igienica"
    assert by["FOR-0001"]["category"] == "Bagno"
    assert by["FOR-0001"]["unit"] == "pz"
    assert by["FOR-0006"]["name"] == "Sacchetti immondizia"
    assert by["FOR-0006"]["unit"] == "rotolo"
    assert "Cucina" in (by["FOR-0006"]["category"] or "") or "Casa" in (by["FOR-0006"]["category"] or "")
    assert by["FOR-0008"]["name"] == "Zucchero"
    for p in items:
        assert p.get("cost") is None
        assert p.get("prezzo_standard") is None
        assert p.get("photo") is None
    # order sequential by 'ordine' field ascending
    ordini = [p.get("ordine") for p in items]
    assert ordini == sorted(ordini)


def test_pulizie_catalog_23(h):
    r = requests.get(f"{BASE}/api/magazzino/catalog/pulizie",
                     params={"include_inactive": "true"}, headers=h, timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = [p for p in data if (p.get("code") or "").startswith("PUL-")]
    assert len(items) == 23
    by = {p["code"]: p for p in items}
    assert by["PUL-0001"]["name"] == "Scopa"
    assert by["PUL-0001"]["type"] == "attrezzatura_durevole"
    assert by["PUL-0010"]["name"].lower().startswith("pezze")
    assert by["PUL-0010"]["type"] == "materiale"
    assert by["PUL-0013"]["name"] == "Viakal"
    assert by["PUL-0013"]["type"] == "consumabile"
    assert "Spazzolino" in by["PUL-0021"]["name"]
    assert "Spazzolone" in by["PUL-0022"]["name"]
    for p in items:
        assert p.get("cost") is None
        assert p.get("prezzo_standard") is None
        assert p.get("photo") is None


# ---------- Kits ----------

def test_kits_only_8_kitnol(h):
    r = requests.get(f"{BASE}/api/magazzino/kits", headers=h, timeout=15)
    assert r.status_code == 200
    kits = r.json()
    assert len(kits) == 8, f"Expected exactly 8 kits, got {len(kits)}: {[k.get('name') for k in kits]}"
    for k in kits:
        assert (k.get("code") or "").startswith("KIT-NOL-"), f"unexpected kit: {k}"
        assert k.get("domain") == "noleggio"
        assert "zaino" not in (k.get("name", "").lower())
    codes = sorted(k["code"] for k in kits)
    assert codes == [f"KIT-NOL-{i:04d}" for i in range(1, 9)]


# ---------- Delete CASO A: mai usato ----------

def test_delete_case_a_never_used_and_counter_monotonic(h):
    # Create FOR-0009
    r = requests.post(f"{BASE}/api/magazzino/catalog/forniture",
                      json={"name": "TEST_DELETE_ME", "unit": "pz"}, headers=h, timeout=15)
    assert r.status_code == 200, r.text
    p1 = r.json()
    assert p1["code"] == "FOR-0009", p1
    # Delete → 200
    rd = requests.delete(f"{BASE}/api/magazzino/catalog/forniture/{p1['id']}", headers=h, timeout=15)
    assert rd.status_code == 200, rd.text
    # Verify gone
    r2 = requests.get(f"{BASE}/api/magazzino/catalog/forniture",
                      params={"include_inactive": "true"}, headers=h, timeout=15)
    assert not any(x.get("id") == p1["id"] for x in r2.json())
    # Monotonic: next POST must be FOR-0010 (never re-use 0009)
    r3 = requests.post(f"{BASE}/api/magazzino/catalog/forniture",
                       json={"name": "TEST_DELETE_ME2", "unit": "pz"}, headers=h, timeout=15)
    assert r3.status_code == 200
    p2 = r3.json()
    assert p2["code"] == "FOR-0010", f"code should be FOR-0010 (monotonic), got {p2['code']}"
    # Cleanup
    rc = requests.delete(f"{BASE}/api/magazzino/catalog/forniture/{p2['id']}", headers=h, timeout=15)
    assert rc.status_code == 200
    # Reset counter for_code to 8 via internal admin endpoint? Fallback: direct mongo
    # We'll reset counter via mongo in dedicated cleanup test at bottom.


def test_delete_case_a_pulizie_monotonic(h):
    r1 = requests.post(f"{BASE}/api/magazzino/catalog/pulizie",
                       json={"name": "TEST_PUL", "type": "materiale", "unit": "pz"}, headers=h, timeout=15)
    assert r1.status_code == 200
    p1 = r1.json()
    assert p1["code"] == "PUL-0024"
    rd = requests.delete(f"{BASE}/api/magazzino/catalog/pulizie/{p1['id']}", headers=h, timeout=15)
    assert rd.status_code == 200
    r2 = requests.post(f"{BASE}/api/magazzino/catalog/pulizie",
                       json={"name": "TEST_PUL2", "type": "materiale", "unit": "pz"}, headers=h, timeout=15)
    assert r2.status_code == 200
    p2 = r2.json()
    assert p2["code"] == "PUL-0025", f"expected PUL-0025 (monotonic), got {p2['code']}"
    rc = requests.delete(f"{BASE}/api/magazzino/catalog/pulizie/{p2['id']}", headers=h, timeout=15)
    assert rc.status_code == 200


# ---------- Delete CASO B: usato in kit ----------

def test_delete_case_b_nol0001_used_in_kit(h):
    r = requests.get(f"{BASE}/api/magazzino/catalog/noleggio",
                     params={"include_inactive": "true"}, headers=h, timeout=15)
    by = {p["code"]: p for p in r.json() if p.get("code")}
    nol1 = by["NOL-0001"]
    nol15 = by["NOL-0015"]
    for target in (nol1, nol15):
        rd = requests.delete(f"{BASE}/api/magazzino/catalog/noleggio/{target['id']}", headers=h, timeout=15)
        assert rd.status_code == 409, f"expected 409 for {target['code']}, got {rd.status_code}: {rd.text}"
        detail = rd.json().get("detail", "")
        assert "utilizzato" in detail.lower() or "kilolava" in detail.lower(), detail
    # Verify still there and active
    r2 = requests.get(f"{BASE}/api/magazzino/catalog/noleggio",
                      params={"include_inactive": "true"}, headers=h, timeout=15)
    by2 = {p["code"]: p for p in r2.json() if p.get("code")}
    assert "NOL-0001" in by2 and by2["NOL-0001"]["active"] is True
    assert "NOL-0015" in by2


# ---------- Kit senza codice se domain != noleggio ----------

def test_kit_domain_nonnoleggio_no_code(h):
    r = requests.post(f"{BASE}/api/magazzino/kits",
                      json={"name": "TEST_KIT_DEL", "domain": "forniture", "items": []},
                      headers=h, timeout=15)
    assert r.status_code == 200, r.text
    k = r.json()
    assert not (k.get("code") or "").startswith("KIT-NOL"), f"forniture kit should NOT have KIT-NOL code: {k}"
    # cleanup via mongo
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    async def _rm():
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        d = cli[os.environ["DB_NAME"]]
        await d.kits.delete_one({"id": k["id"]})
    asyncio.get_event_loop().run_until_complete(_rm())


# ---------- Final cleanup: restore counters ----------

def test_zzz_cleanup_counters():
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio

    async def _run():
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        d = cli[os.environ["DB_NAME"]]
        # remove any TEST_ residuals
        for coll in ("supply_catalog", "cleaning_catalog", "rental_catalog", "kits"):
            await d[coll].delete_many({"name": {"$regex": "^TEST_"}})
        # I contatori NON si azzerano MAI: codici FOR/PUL/NOL/KIT-NOL permanenti e mai riutilizzabili
        # verify counts
        rc = await d.rental_catalog.count_documents({})
        sc = await d.supply_catalog.count_documents({})
        cc = await d.cleaning_catalog.count_documents({})
        kc = await d.kits.count_documents({})
        return rc, sc, cc, kc

    rc, sc, cc, kc = asyncio.get_event_loop().run_until_complete(_run())
    assert rc == 23, f"rental_catalog={rc}"
    assert sc == 8, f"supply_catalog={sc}"
    assert cc == 23, f"cleaning_catalog={cc}"
    assert kc == 8, f"kits={kc}"
