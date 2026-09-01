from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Test that all catalog products have photos uploaded and files serve correctly."""
import os
import requests
import pytest

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kilolava-rebuild.preview.emergentagent.com').rstrip('/')

EMAIL = "test_user@kilolava.com"
PASSWORD = TEST_ADMIN_PASSWORD


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("cat,expected", [("noleggio", 23), ("forniture", 8), ("pulizie", 23)])
def test_catalog_photos_present(headers, token, cat, expected):
    r = requests.get(f"{BASE_URL}/api/magazzino/catalog/{cat}?include_inactive=true", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == expected, f"Expected {expected} {cat} items, got {len(items)}"
    missing = [it.get("codice") for it in items if not (it.get("photo") and it["photo"].get("file_path"))]
    assert not missing, f"Missing photos for {cat}: {missing}"

    # sample first item file
    sample = items[0]
    fp = sample["photo"]["file_path"]
    rf = requests.get(f"{BASE_URL}/api/files/{fp}?auth={token}", timeout=30)
    assert rf.status_code == 200, f"file fetch fail for {sample.get('codice')}: {rf.status_code}"
    ct = rf.headers.get("content-type", "")
    assert ct.startswith("image/"), f"unexpected content-type {ct} for {sample.get('codice')}"
    assert len(rf.content) > 1000


def test_kit_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/magazzino/kits", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    kits = r.json()
    assert len(kits) == 8, f"expected 8 kits got {len(kits)}: {[k.get('codice') for k in kits]}"
    target = next((k for k in kits if k.get("code") == "KIT-NOL-0001"), None)
    assert target is not None, f"KIT-NOL-0001 not found in {[k.get('code') for k in kits]}"
    # kits list already includes composition
    comp = target.get("items") or target.get("composizione")
    assert comp and len(comp) > 0, f"empty composition for KIT-NOL-0001, keys={list(target.keys())}"
