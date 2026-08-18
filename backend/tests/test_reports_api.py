"""
Test suite for Reports & Analytics module endpoints
Tests: /api/reports/dashboard, /api/reports/clients-summary, /api/reports/operations, /api/reports/inventory
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin authentication token"""
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed: {response.status_code}")
    return response.json().get("access_token")


@pytest.fixture
def auth_headers(admin_token):
    """Headers with admin auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestReportsDashboard:
    """Tests for /api/reports/dashboard endpoint"""

    def test_dashboard_returns_200(self, auth_headers):
        """Dashboard endpoint returns 200 for admin"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers)
        assert response.status_code == 200
        print("✓ Dashboard endpoint returns 200")

    def test_dashboard_response_structure(self, auth_headers):
        """Dashboard response has required fields"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard", headers=auth_headers)
        data = response.json()
        
        # Check top-level fields
        assert "period" in data
        assert "active_clients" in data
        assert "revenue_estimated" in data
        assert "orders_total" in data
        assert "cleaning" in data
        assert "logistics" in data
        assert "maintenance" in data
        
        # Check nested structures
        assert "start" in data["period"]
        assert "end" in data["period"]
        assert "total" in data["cleaning"]
        assert "completed" in data["cleaning"]
        assert "total" in data["logistics"]
        assert "deliveries" in data["logistics"]
        assert "pickups" in data["logistics"]
        assert "total" in data["maintenance"]
        assert "open" in data["maintenance"]
        assert "resolved" in data["maintenance"]
        print("✓ Dashboard response has all required fields")

    def test_dashboard_with_month_param(self, auth_headers):
        """Dashboard accepts month parameter"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard?month=2026-02",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"]["start"] == "2026-02-01"
        assert data["period"]["end"] == "2026-03-01"
        print("✓ Dashboard month parameter works correctly")

    def test_dashboard_with_custom_date_range(self, auth_headers):
        """Dashboard accepts custom date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/dashboard?date_from=2026-01-01&date_to=2026-03-31",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"]["start"] == "2026-01-01"
        assert data["period"]["end"] == "2026-03-31"
        print("✓ Dashboard custom date range works correctly")

    def test_dashboard_unauthorized_without_token(self):
        """Dashboard returns 403 without auth token"""
        response = requests.get(f"{BASE_URL}/api/reports/dashboard")
        assert response.status_code in [401, 403]
        print("✓ Dashboard requires authentication")


class TestReportsClientsSummary:
    """Tests for /api/reports/clients-summary endpoint"""

    def test_clients_summary_returns_200(self, auth_headers):
        """Clients summary endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/clients-summary", headers=auth_headers)
        assert response.status_code == 200
        print("✓ Clients summary endpoint returns 200")

    def test_clients_summary_returns_list(self, auth_headers):
        """Clients summary returns a list"""
        response = requests.get(f"{BASE_URL}/api/reports/clients-summary", headers=auth_headers)
        data = response.json()
        assert isinstance(data, list)
        print("✓ Clients summary returns a list")

    def test_clients_summary_item_structure(self, auth_headers):
        """Each client summary item has required fields"""
        response = requests.get(f"{BASE_URL}/api/reports/clients-summary", headers=auth_headers)
        data = response.json()
        
        if len(data) > 0:
            item = data[0]
            assert "client_id" in item
            assert "client_name" in item
            assert "cleaning_count" in item
            assert "logistics_count" in item
            assert "order_count" in item
            assert "revenue" in item
            print("✓ Client summary items have required fields")
        else:
            print("⚠ No client data to verify structure (empty list)")

    def test_clients_summary_with_month_param(self, auth_headers):
        """Clients summary accepts month parameter"""
        response = requests.get(
            f"{BASE_URL}/api/reports/clients-summary?month=2026-03",
            headers=auth_headers
        )
        assert response.status_code == 200
        print("✓ Clients summary month parameter works")


class TestReportsOperations:
    """Tests for /api/reports/operations endpoint"""

    def test_operations_returns_200(self, auth_headers):
        """Operations endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/operations", headers=auth_headers)
        assert response.status_code == 200
        print("✓ Operations endpoint returns 200")

    def test_operations_response_structure(self, auth_headers):
        """Operations response has required fields"""
        response = requests.get(f"{BASE_URL}/api/reports/operations", headers=auth_headers)
        data = response.json()
        
        assert "period" in data
        assert "cleaning" in data
        assert "logistics" in data
        assert "maintenance" in data
        
        # Check nested structures
        assert "by_status" in data["cleaning"]
        assert "overdue" in data["cleaning"]
        assert "by_status" in data["logistics"]
        assert "overdue" in data["logistics"]
        assert "by_status" in data["maintenance"]
        assert "by_category" in data["maintenance"]
        print("✓ Operations response has all required fields")

    def test_operations_with_month_param(self, auth_headers):
        """Operations accepts month parameter"""
        response = requests.get(
            f"{BASE_URL}/api/reports/operations?month=2026-03",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"]["start"] == "2026-03-01"
        print("✓ Operations month parameter works correctly")


class TestReportsInventory:
    """Tests for /api/reports/inventory endpoint"""

    def test_inventory_returns_200(self, auth_headers):
        """Inventory endpoint returns 200"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory", headers=auth_headers)
        assert response.status_code == 200
        print("✓ Inventory endpoint returns 200")

    def test_inventory_response_structure(self, auth_headers):
        """Inventory response has required fields"""
        response = requests.get(f"{BASE_URL}/api/reports/inventory", headers=auth_headers)
        data = response.json()
        
        assert "period" in data
        assert "total_movements" in data
        assert "by_type" in data
        assert "top_items" in data
        assert "low_stock" in data
        
        # Verify types
        assert isinstance(data["total_movements"], int)
        assert isinstance(data["by_type"], dict)
        assert isinstance(data["top_items"], list)
        assert isinstance(data["low_stock"], list)
        print("✓ Inventory response has all required fields")

    def test_inventory_with_custom_date_range(self, auth_headers):
        """Inventory accepts custom date range"""
        response = requests.get(
            f"{BASE_URL}/api/reports/inventory?date_from=2026-01-01&date_to=2026-12-31",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["period"]["start"] == "2026-01-01"
        assert data["period"]["end"] == "2026-12-31"
        print("✓ Inventory custom date range works correctly")


class TestReportsPermissions:
    """Tests for reports endpoint permissions"""

    def test_reports_require_ops_role(self):
        """Reports endpoints require admin or operations_manager role"""
        # Try with cleaner credentials (should fail)
        login_resp = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "maria.bianchi@kilolava.com", "password": "CleanPass123!"}
        )
        
        if login_resp.status_code != 200:
            pytest.skip("Cleaner login failed - cannot test permissions")
        
        cleaner_token = login_resp.json().get("access_token")
        headers = {"Authorization": f"Bearer {cleaner_token}"}
        
        # All reports endpoints should return 403 for cleaner
        endpoints = [
            "/api/reports/dashboard",
            "/api/reports/clients-summary",
            "/api/reports/operations",
            "/api/reports/inventory"
        ]
        
        for endpoint in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
            assert response.status_code == 403, f"{endpoint} should return 403 for cleaner"
        
        print("✓ Reports endpoints correctly restrict access to ops roles only")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
