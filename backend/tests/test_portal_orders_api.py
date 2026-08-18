"""
Test suite for Client Portal & Orders Module
Tests: Portal endpoints, Orders CRUD, Operations endpoints, Client account management
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
MANAGER_EMAIL = "test_user@kilolava.com"
MANAGER_PASSWORD = "TestPass123!"
CLIENT_EMAIL = "mario.rossi@cliente.it"
CLIENT_PASSWORD = "Client123!"
CLIENT_ID = "eab85d0f-45c0-458f-ab88-08c442810aff"


class TestAuthSetup:
    """Authentication setup tests"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "manager"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def client_token(self):
        """Get client auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL,
            "password": CLIENT_PASSWORD
        })
        assert response.status_code == 200, f"Client login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "client"
        assert data["user"]["client_id"] == CLIENT_ID
        return data["access_token"]
    
    def test_manager_login(self, manager_token):
        """Verify manager can login"""
        assert manager_token is not None
        print("Manager login successful")
    
    def test_client_login(self, client_token):
        """Verify client can login"""
        assert client_token is not None
        print("Client login successful")


class TestClientAccountManagement:
    """Test client portal account creation (manager endpoint)"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_create_account_requires_manager(self):
        """POST /api/clients/{id}/create-account requires manager role"""
        # Without auth
        response = requests.post(f"{BASE_URL}/api/clients/{CLIENT_ID}/create-account", json={
            "email": "test@test.com", "password": "Test123!", "name": "Test"
        })
        assert response.status_code in [401, 403]
        print("Create account requires auth - PASS")
    
    def test_create_account_duplicate_email(self, manager_token):
        """POST /api/clients/{id}/create-account rejects duplicate email"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        # Try to create with existing email
        response = requests.post(f"{BASE_URL}/api/clients/{CLIENT_ID}/create-account", json={
            "email": CLIENT_EMAIL, "password": "Test123!", "name": "Test"
        }, headers=headers)
        # Should fail - email already exists
        assert response.status_code == 400
        print("Duplicate email rejected - PASS")
    
    def test_create_account_already_has_portal(self, manager_token):
        """POST /api/clients/{id}/create-account rejects if client already has portal account"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.post(f"{BASE_URL}/api/clients/{CLIENT_ID}/create-account", json={
            "email": "new_portal@test.com", "password": "Test123!", "name": "New Portal"
        }, headers=headers)
        # Should fail - client already has portal account
        assert response.status_code == 400
        assert "gia esistente" in response.json().get("detail", "").lower() or "already" in response.json().get("detail", "").lower()
        print("Already has portal account rejected - PASS")


class TestOperationsDeliveryConfig:
    """Test delivery slot configuration (manager endpoint)"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_delivery_config(self, manager_token):
        """GET /api/operations/delivery-config returns config"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/operations/delivery-config", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "weekly_slots" in data
        assert "min_lead_days" in data
        assert "max_advance_days" in data
        assert "max_orders_per_slot" in data
        print(f"Delivery config: min_lead={data['min_lead_days']}, max_advance={data['max_advance_days']}")
    
    def test_update_delivery_config(self, manager_token):
        """PUT /api/operations/delivery-config updates config"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        # Get current config
        get_res = requests.get(f"{BASE_URL}/api/operations/delivery-config", headers=headers)
        current = get_res.json()
        
        # Update with same values (to not break other tests)
        update_data = {
            "weekly_slots": current.get("weekly_slots", {
                "mon": ["09:00-12:00", "14:00-17:00"],
                "tue": ["09:00-12:00", "14:00-17:00"],
                "wed": ["09:00-12:00", "14:00-17:00"],
                "thu": ["09:00-12:00", "14:00-17:00"],
                "fri": ["09:00-12:00", "14:00-17:00"],
                "sat": [], "sun": []
            }),
            "min_lead_days": current.get("min_lead_days", 1),
            "max_advance_days": current.get("max_advance_days", 30),
            "max_orders_per_slot": current.get("max_orders_per_slot", 10),
            "blocked_dates": current.get("blocked_dates", [])
        }
        response = requests.put(f"{BASE_URL}/api/operations/delivery-config", json=update_data, headers=headers)
        assert response.status_code == 200
        assert "aggiornata" in response.json().get("message", "").lower() or "updated" in response.json().get("message", "").lower()
        print("Delivery config update - PASS")


class TestOperationsClientCatalog:
    """Test client catalog management (manager endpoint)"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_get_client_catalog(self, manager_token):
        """GET /api/operations/client-catalog/{client_id} returns catalog entries"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/operations/client-catalog/{CLIENT_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Client catalog has {len(data)} entries")
        if len(data) > 0:
            entry = data[0]
            assert "article_id" in entry
            assert "is_enabled" in entry
    
    def test_set_client_catalog(self, manager_token):
        """POST /api/operations/client-catalog sets catalog entries"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        # Get current catalog
        get_res = requests.get(f"{BASE_URL}/api/operations/client-catalog/{CLIENT_ID}", headers=headers)
        current = get_res.json()
        
        # Re-set with same entries
        entries = [{"article_id": e["article_id"], "is_enabled": e["is_enabled"], "custom_price": e.get("custom_price")} for e in current]
        response = requests.post(f"{BASE_URL}/api/operations/client-catalog", json={
            "client_id": CLIENT_ID,
            "entries": entries
        }, headers=headers)
        assert response.status_code == 200
        print(f"Client catalog set with {len(entries)} entries - PASS")


class TestOperationsOrders:
    """Test operations orders management (manager endpoint)"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_all_orders(self, manager_token):
        """GET /api/operations/orders lists all orders"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/operations/orders", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Operations: {len(data)} total orders")
    
    def test_list_orders_with_filters(self, manager_token):
        """GET /api/operations/orders with status and client_id filters"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        # Filter by client
        response = requests.get(f"{BASE_URL}/api/operations/orders", params={"client_id": CLIENT_ID}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        for order in data:
            assert order["client_id"] == CLIENT_ID
        print(f"Filtered by client: {len(data)} orders")


class TestPortalDashboard:
    """Test portal dashboard endpoint (client-facing)"""
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_portal_dashboard(self, client_token):
        """GET /api/portal/dashboard returns client-scoped data"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/dashboard", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify all expected fields
        assert "client_name" in data
        assert "ordering_enabled" in data
        assert "upcoming_cleanings" in data
        assert "completed_cleanings_count" in data
        assert "upcoming_deliveries" in data
        assert "recent_deliveries" in data
        assert "recent_orders" in data
        assert "month_total" in data
        assert "structures_count" in data
        
        print(f"Dashboard: client={data['client_name']}, ordering={data['ordering_enabled']}, structures={data['structures_count']}")
        print(f"  Upcoming cleanings: {len(data['upcoming_cleanings'])}")
        print(f"  Upcoming deliveries: {len(data['upcoming_deliveries'])}")
        print(f"  Recent orders: {len(data['recent_orders'])}")
        print(f"  Month total: €{data['month_total']}")
    
    def test_portal_dashboard_requires_client_role(self):
        """GET /api/portal/dashboard requires client role"""
        # Without auth
        response = requests.get(f"{BASE_URL}/api/portal/dashboard")
        assert response.status_code in [401, 403]
        print("Portal dashboard requires auth - PASS")


class TestPortalStructures:
    """Test portal structures endpoint (client-facing)"""
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_portal_structures(self, client_token):
        """GET /api/portal/structures returns only client's structures"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/structures", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Portal structures: {len(data)} structures")
        for s in data:
            assert "id" in s
            assert "name" in s
            assert "units" in s


class TestPortalServices:
    """Test portal services endpoint (client-facing)"""
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_portal_services_current_month(self, client_token):
        """GET /api/portal/services returns services for current month"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/services", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Portal services (current month): {len(data)} services")
    
    def test_portal_services_with_month_filter(self, client_token):
        """GET /api/portal/services with month filter"""
        headers = {"Authorization": f"Bearer {client_token}"}
        current_month = datetime.now().strftime("%Y-%m")
        response = requests.get(f"{BASE_URL}/api/portal/services", params={"month": current_month}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Portal services (month={current_month}): {len(data)} services")


class TestPortalCatalog:
    """Test portal catalog endpoint (client-facing)"""
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_portal_catalog(self, client_token):
        """GET /api/portal/catalog returns enabled articles with prices"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/catalog", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Portal catalog: {len(data)} articles")
        for art in data:
            assert "article_id" in art
            assert "name" in art
            assert "price" in art
            print(f"  - {art['name']}: €{art['price']}")


class TestPortalDeliverySlots:
    """Test portal delivery slots endpoint (client-facing)"""
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_portal_delivery_slots(self, client_token):
        """GET /api/portal/delivery-slots returns available slots respecting config"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/delivery-slots", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Portal delivery slots: {len(data)} available dates")
        for day in data[:3]:  # Show first 3
            assert "date" in day
            assert "day" in day
            assert "slots" in day
            print(f"  - {day['date']} ({day['day']}): {len(day['slots'])} slots")


class TestPortalOrders:
    """Test portal orders CRUD (client-facing)"""
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def catalog_and_slots(self, client_token):
        """Get catalog and slots for order creation"""
        headers = {"Authorization": f"Bearer {client_token}"}
        cat_res = requests.get(f"{BASE_URL}/api/portal/catalog", headers=headers)
        slot_res = requests.get(f"{BASE_URL}/api/portal/delivery-slots", headers=headers)
        return cat_res.json(), slot_res.json()
    
    def test_create_order(self, client_token, catalog_and_slots):
        """POST /api/portal/orders creates order with correct pricing"""
        headers = {"Authorization": f"Bearer {client_token}"}
        catalog, slots = catalog_and_slots
        
        if len(catalog) == 0:
            pytest.skip("No catalog items available")
        if len(slots) == 0:
            pytest.skip("No delivery slots available")
        
        # Pick first article and first available slot
        article = catalog[0]
        slot_day = slots[0]
        slot = slot_day["slots"][0]["slot"]
        
        order_data = {
            "client_id": CLIENT_ID,
            "structure_id": None,
            "items": [{"article_id": article["article_id"], "quantity": 2}],
            "delivery_date": slot_day["date"],
            "delivery_slot": slot,
            "notes": "TEST_ORDER - automated test"
        }
        
        response = requests.post(f"{BASE_URL}/api/portal/orders", json=order_data, headers=headers)
        assert response.status_code == 200, f"Create order failed: {response.text}"
        data = response.json()
        
        assert "id" in data
        assert "order_number" in data
        assert data["status"] == "submitted"
        assert data["client_id"] == CLIENT_ID
        assert len(data["items"]) == 1
        assert data["items"][0]["quantity"] == 2
        # Verify pricing
        expected_total = article["price"] * 2
        assert abs(data["total"] - expected_total) < 0.01, f"Total mismatch: {data['total']} vs {expected_total}"
        
        print(f"Created order: {data['order_number']}, total=€{data['total']}")
        return data["id"]
    
    def test_list_orders(self, client_token):
        """GET /api/portal/orders returns client's orders"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/orders", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Portal orders: {len(data)} orders")
        for order in data:
            assert order["client_id"] == CLIENT_ID
    
    def test_list_orders_with_status_filter(self, client_token):
        """GET /api/portal/orders with status filter"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/orders", params={"status": "submitted"}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        for order in data:
            assert order["status"] == "submitted"
        print(f"Submitted orders: {len(data)}")
    
    def test_order_detail(self, client_token):
        """GET /api/portal/orders/{id} returns order with delivery info"""
        headers = {"Authorization": f"Bearer {client_token}"}
        # Get list first
        list_res = requests.get(f"{BASE_URL}/api/portal/orders", headers=headers)
        orders = list_res.json()
        if len(orders) == 0:
            pytest.skip("No orders to test detail")
        
        order_id = orders[0]["id"]
        response = requests.get(f"{BASE_URL}/api/portal/orders/{order_id}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "order" in data
        assert "delivery_info" in data
        assert data["order"]["id"] == order_id
        print(f"Order detail: {data['order']['order_number']}, delivery_info={data['delivery_info']}")
    
    def test_cancel_order_submitted(self, client_token, catalog_and_slots):
        """PUT /api/portal/orders/{id}/cancel cancels draft/submitted order"""
        headers = {"Authorization": f"Bearer {client_token}"}
        catalog, slots = catalog_and_slots
        
        if len(catalog) == 0 or len(slots) == 0:
            pytest.skip("No catalog/slots for test")
        
        # Create a new order to cancel
        article = catalog[0]
        slot_day = slots[0]
        slot = slot_day["slots"][0]["slot"]
        
        create_res = requests.post(f"{BASE_URL}/api/portal/orders", json={
            "client_id": CLIENT_ID,
            "items": [{"article_id": article["article_id"], "quantity": 1}],
            "delivery_date": slot_day["date"],
            "delivery_slot": slot,
            "notes": "TEST_CANCEL - to be cancelled"
        }, headers=headers)
        order_id = create_res.json()["id"]
        
        # Cancel it
        response = requests.put(f"{BASE_URL}/api/portal/orders/{order_id}/cancel", headers=headers)
        assert response.status_code == 200
        assert "annullato" in response.json().get("message", "").lower() or "cancelled" in response.json().get("message", "").lower()
        
        # Verify status changed
        detail_res = requests.get(f"{BASE_URL}/api/portal/orders/{order_id}", headers=headers)
        assert detail_res.json()["order"]["status"] == "cancelled"
        print("Cancel submitted order - PASS")


class TestPortalReport:
    """Test portal report endpoint (client-facing)"""
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_portal_report_current_month(self, client_token):
        """GET /api/portal/report returns monthly breakdown"""
        headers = {"Authorization": f"Bearer {client_token}"}
        response = requests.get(f"{BASE_URL}/api/portal/report", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "month" in data
        assert "cleaning_count" in data
        assert "orders_count" in data
        assert "total" in data
        assert "breakdown" in data
        assert "history" in data
        
        print(f"Report for {data['month']}:")
        print(f"  Cleanings: {data['cleaning_count']}")
        print(f"  Orders: {data['orders_count']}")
        print(f"  Total: €{data['total']}")
        print(f"  History months: {len(data['history'])}")
    
    def test_portal_report_with_month_param(self, client_token):
        """GET /api/portal/report with month parameter"""
        headers = {"Authorization": f"Bearer {client_token}"}
        current_month = datetime.now().strftime("%Y-%m")
        response = requests.get(f"{BASE_URL}/api/portal/report", params={"month": current_month}, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["month"] == current_month
        print(f"Report with month param - PASS")


class TestOperationsOrderStatus:
    """Test operations order status update (manager endpoint)"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_update_order_status(self, manager_token, client_token):
        """PUT /api/operations/orders/{id}/status updates order status"""
        client_headers = {"Authorization": f"Bearer {client_token}"}
        manager_headers = {"Authorization": f"Bearer {manager_token}"}
        
        # Get catalog and slots
        cat_res = requests.get(f"{BASE_URL}/api/portal/catalog", headers=client_headers)
        slot_res = requests.get(f"{BASE_URL}/api/portal/delivery-slots", headers=client_headers)
        catalog = cat_res.json()
        slots = slot_res.json()
        
        if len(catalog) == 0 or len(slots) == 0:
            pytest.skip("No catalog/slots for test")
        
        # Create order as client
        article = catalog[0]
        slot_day = slots[0]
        slot = slot_day["slots"][0]["slot"]
        
        create_res = requests.post(f"{BASE_URL}/api/portal/orders", json={
            "client_id": CLIENT_ID,
            "items": [{"article_id": article["article_id"], "quantity": 1}],
            "delivery_date": slot_day["date"],
            "delivery_slot": slot,
            "notes": "TEST_STATUS - for status update test"
        }, headers=client_headers)
        order_id = create_res.json()["id"]
        
        # Update status as manager
        response = requests.put(f"{BASE_URL}/api/operations/orders/{order_id}/status", json={
            "status": "confirmed"
        }, headers=manager_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "confirmed"
        assert data["confirmed_at"] is not None
        print(f"Order status updated to confirmed, confirmed_at={data['confirmed_at']}")
        
        # Update to delivered
        response2 = requests.put(f"{BASE_URL}/api/operations/orders/{order_id}/status", json={
            "status": "delivered"
        }, headers=manager_headers)
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["status"] == "delivered"
        assert data2["delivered_at"] is not None
        print(f"Order status updated to delivered, delivered_at={data2['delivered_at']}")


class TestClientOrderingEnabled:
    """Test ordering_enabled field on client"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_client_has_ordering_enabled(self, manager_token):
        """GET /api/clients/{id} returns ordering_enabled field"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/clients/{CLIENT_ID}", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "ordering_enabled" in data
        print(f"Client ordering_enabled: {data['ordering_enabled']}")
    
    def test_update_ordering_enabled(self, manager_token):
        """PUT /api/clients/{id} can update ordering_enabled"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        # Get current value
        get_res = requests.get(f"{BASE_URL}/api/clients/{CLIENT_ID}", headers=headers)
        current = get_res.json()["ordering_enabled"]
        
        # Update to same value (to not break other tests)
        response = requests.put(f"{BASE_URL}/api/clients/{CLIENT_ID}", json={
            "ordering_enabled": current
        }, headers=headers)
        assert response.status_code == 200
        assert response.json()["ordering_enabled"] == current
        print(f"ordering_enabled update - PASS")


class TestCancelOrderRestrictions:
    """Test cancel order restrictions"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL, "password": MANAGER_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def client_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_cannot_cancel_confirmed_order(self, manager_token, client_token):
        """PUT /api/portal/orders/{id}/cancel fails for confirmed orders"""
        client_headers = {"Authorization": f"Bearer {client_token}"}
        manager_headers = {"Authorization": f"Bearer {manager_token}"}
        
        # Get catalog and slots
        cat_res = requests.get(f"{BASE_URL}/api/portal/catalog", headers=client_headers)
        slot_res = requests.get(f"{BASE_URL}/api/portal/delivery-slots", headers=client_headers)
        catalog = cat_res.json()
        slots = slot_res.json()
        
        if len(catalog) == 0 or len(slots) == 0:
            pytest.skip("No catalog/slots for test")
        
        # Create order
        article = catalog[0]
        slot_day = slots[0]
        slot = slot_day["slots"][0]["slot"]
        
        create_res = requests.post(f"{BASE_URL}/api/portal/orders", json={
            "client_id": CLIENT_ID,
            "items": [{"article_id": article["article_id"], "quantity": 1}],
            "delivery_date": slot_day["date"],
            "delivery_slot": slot,
            "notes": "TEST_CANCEL_RESTRICT - for cancel restriction test"
        }, headers=client_headers)
        order_id = create_res.json()["id"]
        
        # Confirm as manager
        requests.put(f"{BASE_URL}/api/operations/orders/{order_id}/status", json={
            "status": "confirmed"
        }, headers=manager_headers)
        
        # Try to cancel as client - should fail
        response = requests.put(f"{BASE_URL}/api/portal/orders/{order_id}/cancel", headers=client_headers)
        assert response.status_code == 400
        assert "non annullabile" in response.json().get("detail", "").lower() or "cannot" in response.json().get("detail", "").lower()
        print("Cannot cancel confirmed order - PASS")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
