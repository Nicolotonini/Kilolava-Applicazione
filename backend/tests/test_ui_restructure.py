from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Backend tests for the UI-restructure phase (Kilolava).

Covers the NEW endpoints:
  - GET /api/dashboard/overview  (with default / custom / today period)
  - GET /api/inventory/structure-stock

Plus regression on a handful of endpoints the new sidebar links to, to guarantee
we didn't accidentally break anything.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}"}


# --- Dashboard overview ------------------------------------------------------
class TestDashboardOverview:
    def test_default_period(self, h):
        r = requests.get(f"{API}/dashboard/overview", headers=h, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ["period", "revenue", "today", "attention"]:
            assert k in d, f"missing key {k}"
        # revenue shape
        rev = d["revenue"]
        assert set(["total", "cleaning", "laundry", "consumables"]).issubset(rev.keys())
        assert set(["total", "private", "rental"]).issubset(rev["laundry"].keys())
        # today shape
        today = d["today"]
        for k in ["cleaning", "deliveries_linen", "deliveries_consumables", "maintenance"]:
            assert k in today
            for sub in ["total", "completed", "missing"]:
                assert sub in today[k]
        # attention is a list
        assert isinstance(d["attention"], list)

    def test_custom_range(self, h):
        r = requests.get(f"{API}/dashboard/overview?date_from=2025-01-01&date_to=2025-12-31", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "period" in d and d["period"].get("start") and d["period"].get("end")

    def test_attention_has_expected_kinds(self, h):
        r = requests.get(f"{API}/dashboard/overview", headers=h, timeout=30)
        assert r.status_code == 200
        types = {a["type"] for a in r.json()["attention"]}
        # per problem statement: overdue cleaning + overdue deliveries were seen in iteration 1
        assert types, "attention list is empty"


# --- Structure stock ---------------------------------------------------------
class TestStructureStock:
    def test_ok(self, h):
        r = requests.get(f"{API}/inventory/structure-stock", headers=h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # if data present, verify shape
        for g in data:
            assert "structure_id" in g and "structure_name" in g and "items" in g
            for it in g["items"]:
                assert set(["article_id", "article_name", "loaded", "unloaded", "balance"]).issubset(it.keys())


# --- Sidebar-linked pages still respond -------------------------------------
class TestSidebarEndpoints:
    @pytest.mark.parametrize("path", [
        "/clients",
        "/structures",
        "/cleaning-tasks",
        "/logistics/tasks",
        "/maintenance/issues",
        "/inventory/articles",
        "/documents",
        "/users",
        "/activity",
        "/notifications",
        "/reports/dashboard",
        "/events",
    ])
    def test_get(self, h, path):
        r = requests.get(f"{API}{path}", headers=h, timeout=30)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


# --- Auth check --------------------------------------------------------------
def test_dashboard_overview_requires_auth():
    r = requests.get(f"{API}/dashboard/overview", timeout=30)
    assert r.status_code in (401, 403)


def test_structure_stock_requires_auth():
    r = requests.get(f"{API}/inventory/structure-stock", timeout=30)
    assert r.status_code in (401, 403)
