from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Kilolava API Tests - v2.0.0 Data Model
Tests for Clients, Structures, and Units with new schema:
- Clients: client_type (private/company), private_info, company_info
- Structures: structure_type, services array
- Units: bed_config, kit_config, stock_config, logistics_config, cleaning_config
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://operations-hub-38.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test credentials
TEST_EMAIL = "test_user@kilolava.com"
TEST_PASSWORD = TEST_ADMIN_PASSWORD


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{API_URL}/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Authentication failed: {response.status_code}")


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }


class TestHealthAndAuth:
    """Health check and authentication tests"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{API_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "kilolava"
        assert data["version"] == "2.0.0"
        print(f"✅ Health check passed: {data}")
    
    def test_login_success(self):
        """Test login with valid credentials"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["role"] == "manager"
        print(f"✅ Login successful for user: {data['user']['name']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{API_URL}/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("✅ Invalid login correctly rejected")
    
    def test_get_me(self, auth_headers):
        """Test get current user"""
        response = requests.get(f"{API_URL}/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_EMAIL
        assert data["role"] == "manager"
        print(f"✅ Get me successful: {data['name']}")


class TestPrivateClientCRUD:
    """Test private client CRUD operations with new data model"""
    
    @pytest.fixture(autouse=True)
    def setup(self, auth_headers):
        self.headers = auth_headers
        self.created_client_id = None
    
    def test_create_private_client(self, auth_headers):
        """Create a private client with private_info fields"""
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "client_type": "private",
            "private_info": {
                "name": f"TEST_Mario_{unique_id}",
                "surname": "Rossi",
                "address": "Via Roma 1, Milano",
                "fiscal_code": "RSSMRA80A01H501Z",
                "phone": "+39 333 1234567",
                "email": f"test_mario_{unique_id}@example.com",
                "sdi": "0000000"
            },
            "notes": "Test private client",
            "is_active": True
        }
        
        response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create client: {response.text}"
        
        data = response.json()
        assert data["client_type"] == "private"
        assert data["private_info"]["name"] == f"TEST_Mario_{unique_id}"
        assert data["private_info"]["surname"] == "Rossi"
        assert data["display_name"] == f"TEST_Mario_{unique_id} Rossi"
        assert data["phone"] == "+39 333 1234567"
        assert data["structure_count"] == 0
        
        # Store for cleanup
        self.__class__.created_client_id = data["id"]
        print(f"✅ Created private client: {data['display_name']} (ID: {data['id']})")
        
        # Verify with GET
        get_response = requests.get(f"{API_URL}/clients/{data['id']}", headers=auth_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["client_type"] == "private"
        assert get_data["private_info"]["fiscal_code"] == "RSSMRA80A01H501Z"
        print("✅ GET verification passed")
        
        return data["id"]
    
    def test_get_all_clients(self, auth_headers):
        """Get all clients with display_name, phone, email, structure_count"""
        response = requests.get(f"{API_URL}/clients", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Check that each client has required fields
        for client in data:
            assert "id" in client
            assert "client_type" in client
            assert "display_name" in client
            assert "structure_count" in client
            assert client["client_type"] in ["private", "company"]
        
        print(f"✅ Got {len(data)} clients")
    
    def test_update_private_client(self, auth_headers):
        """Update a private client"""
        # First create a client
        unique_id = str(uuid.uuid4())[:8]
        create_data = {
            "client_type": "private",
            "private_info": {
                "name": f"TEST_Update_{unique_id}",
                "surname": "Test",
                "phone": "+39 111 1111111"
            }
        }
        create_response = requests.post(f"{API_URL}/clients", json=create_data, headers=auth_headers)
        assert create_response.status_code == 200
        client_id = create_response.json()["id"]
        
        # Update the client
        update_data = {
            "private_info": {
                "name": f"TEST_Updated_{unique_id}",
                "surname": "Updated",
                "phone": "+39 222 2222222",
                "email": "updated@example.com"
            },
            "notes": "Updated notes"
        }
        
        response = requests.put(f"{API_URL}/clients/{client_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["private_info"]["name"] == f"TEST_Updated_{unique_id}"
        assert data["private_info"]["surname"] == "Updated"
        assert data["phone"] == "+39 222 2222222"
        assert data["notes"] == "Updated notes"
        
        # Verify with GET
        get_response = requests.get(f"{API_URL}/clients/{client_id}", headers=auth_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["private_info"]["email"] == "updated@example.com"
        
        print(f"✅ Updated private client: {data['display_name']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/clients/{client_id}", headers=auth_headers)


class TestCompanyClientCRUD:
    """Test company client CRUD operations"""
    
    def test_create_company_client(self, auth_headers):
        """Create a company client with company_info fields"""
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "client_type": "company",
            "company_info": {
                "company_name": f"TEST_Pulizie SRL {unique_id}",
                "representative_name": "Giuseppe",
                "representative_surname": "Verdi",
                "vat_number": "IT12345678901",
                "fiscal_code": "12345678901",
                "sdi": "ABCDEFG",
                "address": "Via Milano 10, Roma",
                "phone": "+39 06 12345678",
                "email": f"test_company_{unique_id}@example.com",
                "pec": f"test_pec_{unique_id}@pec.it"
            },
            "notes": "Test company client",
            "is_active": True
        }
        
        response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create company client: {response.text}"
        
        data = response.json()
        assert data["client_type"] == "company"
        assert data["company_info"]["company_name"] == f"TEST_Pulizie SRL {unique_id}"
        assert data["company_info"]["vat_number"] == "IT12345678901"
        assert data["display_name"] == f"TEST_Pulizie SRL {unique_id}"
        assert data["phone"] == "+39 06 12345678"
        assert data["email"] == f"test_company_{unique_id}@example.com"
        
        print(f"✅ Created company client: {data['display_name']}")
        
        # Verify with GET
        get_response = requests.get(f"{API_URL}/clients/{data['id']}", headers=auth_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["company_info"]["pec"] == f"test_pec_{unique_id}@pec.it"
        
        # Cleanup
        requests.delete(f"{API_URL}/clients/{data['id']}", headers=auth_headers)
        print("✅ Company client cleanup successful")
    
    def test_change_client_type(self, auth_headers):
        """Test changing client type from private to company"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create as private
        create_data = {
            "client_type": "private",
            "private_info": {
                "name": f"TEST_TypeChange_{unique_id}",
                "surname": "Test"
            }
        }
        create_response = requests.post(f"{API_URL}/clients", json=create_data, headers=auth_headers)
        assert create_response.status_code == 200
        client_id = create_response.json()["id"]
        
        # Update to company
        update_data = {
            "client_type": "company",
            "company_info": {
                "company_name": f"TEST_Changed Company {unique_id}",
                "representative_name": "Test",
                "representative_surname": "User"
            }
        }
        
        response = requests.put(f"{API_URL}/clients/{client_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["client_type"] == "company"
        assert data["company_info"]["company_name"] == f"TEST_Changed Company {unique_id}"
        
        print(f"✅ Changed client type to company: {data['display_name']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/clients/{client_id}", headers=auth_headers)


class TestDeleteClientConstraints:
    """Test client deletion with structure constraints"""
    
    def test_delete_client_with_structures_fails(self, auth_headers):
        """Delete client with structures should fail"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create client
        client_data = {
            "client_type": "private",
            "private_info": {"name": f"TEST_DeleteFail_{unique_id}", "surname": "Test"}
        }
        client_response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
        assert client_response.status_code == 200
        client_id = client_response.json()["id"]
        
        # Create structure for this client
        structure_data = {
            "client_id": client_id,
            "name": f"TEST_Structure_{unique_id}",
            "structure_type": "apartment",
            "services": ["cleaning"]
        }
        structure_response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
        assert structure_response.status_code == 200
        structure_id = structure_response.json()["id"]
        
        # Try to delete client - should fail
        delete_response = requests.delete(f"{API_URL}/clients/{client_id}", headers=auth_headers)
        assert delete_response.status_code == 400
        assert "strutture associate" in delete_response.json()["detail"].lower()
        
        print("✅ Delete client with structures correctly rejected")
        
        # Cleanup - delete structure first, then client
        requests.delete(f"{API_URL}/structures/{structure_id}", headers=auth_headers)
        requests.delete(f"{API_URL}/clients/{client_id}", headers=auth_headers)
    
    def test_delete_client_without_structures_succeeds(self, auth_headers):
        """Delete client without structures should succeed"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create client
        client_data = {
            "client_type": "private",
            "private_info": {"name": f"TEST_DeleteOK_{unique_id}", "surname": "Test"}
        }
        client_response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
        assert client_response.status_code == 200
        client_id = client_response.json()["id"]
        
        # Delete client - should succeed
        delete_response = requests.delete(f"{API_URL}/clients/{client_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{API_URL}/clients/{client_id}", headers=auth_headers)
        assert get_response.status_code == 404
        
        print("✅ Delete client without structures succeeded")


class TestStructureCRUD:
    """Test structure CRUD with structure_type and services"""
    
    @pytest.fixture
    def test_client(self, auth_headers):
        """Create a test client for structure tests"""
        unique_id = str(uuid.uuid4())[:8]
        client_data = {
            "client_type": "private",
            "private_info": {"name": f"TEST_StructureClient_{unique_id}", "surname": "Test"}
        }
        response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
        client_id = response.json()["id"]
        yield client_id
        # Cleanup
        requests.delete(f"{API_URL}/clients/{client_id}", headers=auth_headers)
    
    def test_create_apartment_structure(self, auth_headers, test_client):
        """Create apartment structure with services"""
        structure_data = {
            "client_id": test_client,
            "name": "TEST_Appartamento Centro",
            "structure_type": "apartment",
            "address": "Via Roma 1, Milano",
            "access_type": "keybox",
            "access_details": "Codice: 1234",
            "services": ["cleaning", "private_laundry"],
            "notes": "Test apartment",
            "is_active": True
        }
        
        response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["structure_type"] == "apartment"
        assert data["services"] == ["cleaning", "private_laundry"]
        assert data["has_multiple_units"] == False  # apartment doesn't have multiple units
        assert data["unit_count"] == 0
        
        print(f"✅ Created apartment structure: {data['name']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/structures/{data['id']}", headers=auth_headers)
    
    def test_create_guesthouse_structure(self, auth_headers, test_client):
        """Create guesthouse structure - should have has_multiple_units=True"""
        structure_data = {
            "client_id": test_client,
            "name": "TEST_B&B Centro",
            "structure_type": "guesthouse",
            "address": "Via Milano 10, Roma",
            "access_type": "keys",
            "services": ["cleaning", "rental_laundry", "consumables"],
            "is_active": True
        }
        
        response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["structure_type"] == "guesthouse"
        assert data["has_multiple_units"] == True  # guesthouse has multiple units
        assert "cleaning" in data["services"]
        assert "rental_laundry" in data["services"]
        
        print(f"✅ Created guesthouse structure with has_multiple_units=True")
        
        # Cleanup
        requests.delete(f"{API_URL}/structures/{data['id']}", headers=auth_headers)
    
    def test_create_hotel_structure(self, auth_headers, test_client):
        """Create hotel structure - should have has_multiple_units=True"""
        structure_data = {
            "client_id": test_client,
            "name": "TEST_Hotel Centrale",
            "structure_type": "hotel",
            "services": ["cleaning", "rental_laundry", "consumables", "maintenance"],
            "is_active": True
        }
        
        response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["structure_type"] == "hotel"
        assert data["has_multiple_units"] == True
        
        print(f"✅ Created hotel structure with has_multiple_units=True")
        
        # Cleanup
        requests.delete(f"{API_URL}/structures/{data['id']}", headers=auth_headers)
    
    def test_get_structures_by_client(self, auth_headers, test_client):
        """Get structures filtered by client_id"""
        # Create a structure
        structure_data = {
            "client_id": test_client,
            "name": "TEST_Filter Structure",
            "structure_type": "office",
            "services": ["cleaning"]
        }
        create_response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
        structure_id = create_response.json()["id"]
        
        # Get structures by client
        response = requests.get(f"{API_URL}/structures?client_id={test_client}", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) >= 1
        assert all(s["client_id"] == test_client for s in data)
        
        print(f"✅ Got {len(data)} structures for client")
        
        # Cleanup
        requests.delete(f"{API_URL}/structures/{structure_id}", headers=auth_headers)
    
    def test_update_structure_type_and_services(self, auth_headers, test_client):
        """Update structure type and services"""
        # Create structure
        structure_data = {
            "client_id": test_client,
            "name": "TEST_Update Structure",
            "structure_type": "apartment",
            "services": ["cleaning"]
        }
        create_response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
        structure_id = create_response.json()["id"]
        
        # Update
        update_data = {
            "structure_type": "guesthouse",
            "services": ["cleaning", "private_laundry", "maintenance"]
        }
        
        response = requests.put(f"{API_URL}/structures/{structure_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["structure_type"] == "guesthouse"
        assert data["has_multiple_units"] == True
        assert set(data["services"]) == {"cleaning", "private_laundry", "maintenance"}
        
        print(f"✅ Updated structure type and services")
        
        # Cleanup
        requests.delete(f"{API_URL}/structures/{structure_id}", headers=auth_headers)


class TestUnitCRUD:
    """Test unit CRUD with all configuration sections"""
    
    @pytest.fixture
    def test_structure(self, auth_headers):
        """Create a test client and guesthouse structure for unit tests"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create client
        client_data = {
            "client_type": "private",
            "private_info": {"name": f"TEST_UnitClient_{unique_id}", "surname": "Test"}
        }
        client_response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
        client_id = client_response.json()["id"]
        
        # Create guesthouse structure (supports multiple units)
        structure_data = {
            "client_id": client_id,
            "name": f"TEST_Guesthouse_{unique_id}",
            "structure_type": "guesthouse",
            "services": ["cleaning", "rental_laundry"]
        }
        structure_response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
        structure_id = structure_response.json()["id"]
        
        yield {"client_id": client_id, "structure_id": structure_id}
        
        # Cleanup - delete all units first
        units_response = requests.get(f"{API_URL}/units?structure_id={structure_id}", headers=auth_headers)
        for unit in units_response.json():
            requests.delete(f"{API_URL}/units/{unit['id']}", headers=auth_headers)
        
        requests.delete(f"{API_URL}/structures/{structure_id}", headers=auth_headers)
        requests.delete(f"{API_URL}/clients/{client_id}", headers=auth_headers)
    
    def test_create_unit_with_full_config(self, auth_headers, test_structure):
        """Create unit with all configuration sections"""
        unit_data = {
            "structure_id": test_structure["structure_id"],
            "name": "TEST_Camera 1",
            "unit_type": "room",
            "bed_config": {
                "capacity_total": 4,
                "beds_double": 1,
                "beds_single": 2,
                "sofa_beds": 0
            },
            "kit_config": {
                "kit_double_per_set": 2,
                "kit_single_per_set": 4
            },
            "stock_config": {
                "target_kit_sets": 3,
                "minimum_threshold": 1
            },
            "logistics_config": {
                "logistics_mode": "fixed",
                "pickup_days": ["mon", "wed", "fri"],
                "pickup_time_window": "09:00-12:00"
            },
            "cleaning_config": {
                "checklist_template_id": "template_001",
                "estimated_cleaning_time": 60,
                "complexity_level": "medium"
            },
            "notes": "Test unit with full config",
            "is_active": True
        }
        
        response = requests.post(f"{API_URL}/units", json=unit_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["name"] == "TEST_Camera 1"
        assert data["unit_type"] == "room"
        assert data["bed_config"]["capacity_total"] == 4
        assert data["bed_config"]["beds_double"] == 1
        assert data["kit_config"]["kit_double_per_set"] == 2
        assert data["stock_config"]["target_kit_sets"] == 3
        assert data["logistics_config"]["logistics_mode"] == "fixed"
        assert data["logistics_config"]["pickup_days"] == ["mon", "wed", "fri"]
        assert data["cleaning_config"]["estimated_cleaning_time"] == 60
        assert data["cleaning_config"]["complexity_level"] == "medium"
        
        print(f"✅ Created unit with full configuration: {data['name']}")
        
        # Verify with GET
        get_response = requests.get(f"{API_URL}/units/{data['id']}", headers=auth_headers)
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["bed_config"]["beds_single"] == 2
        assert get_data["logistics_config"]["pickup_time_window"] == "09:00-12:00"
        
        print("✅ GET verification passed - all configs persisted")
    
    def test_get_units_by_structure(self, auth_headers, test_structure):
        """Get units filtered by structure_id"""
        # Create a unit
        unit_data = {
            "structure_id": test_structure["structure_id"],
            "name": "TEST_Filter Unit",
            "unit_type": "apartment"
        }
        requests.post(f"{API_URL}/units", json=unit_data, headers=auth_headers)
        
        # Get units by structure
        response = requests.get(f"{API_URL}/units?structure_id={test_structure['structure_id']}", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) >= 1
        assert all(u["structure_id"] == test_structure["structure_id"] for u in data)
        
        print(f"✅ Got {len(data)} units for structure")
    
    def test_update_unit_config(self, auth_headers, test_structure):
        """Update unit configuration sections"""
        # Create unit
        unit_data = {
            "structure_id": test_structure["structure_id"],
            "name": "TEST_Update Unit",
            "unit_type": "room",
            "bed_config": {"capacity_total": 2, "beds_double": 1, "beds_single": 0, "sofa_beds": 0},
            "cleaning_config": {"estimated_cleaning_time": 30, "complexity_level": "low"}
        }
        create_response = requests.post(f"{API_URL}/units", json=unit_data, headers=auth_headers)
        unit_id = create_response.json()["id"]
        
        # Update
        update_data = {
            "name": "TEST_Updated Unit",
            "bed_config": {
                "capacity_total": 4,
                "beds_double": 2,
                "beds_single": 0,
                "sofa_beds": 0
            },
            "cleaning_config": {
                "estimated_cleaning_time": 90,
                "complexity_level": "high"
            }
        }
        
        response = requests.put(f"{API_URL}/units/{unit_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == "TEST_Updated Unit"
        assert data["bed_config"]["capacity_total"] == 4
        assert data["bed_config"]["beds_double"] == 2
        assert data["cleaning_config"]["estimated_cleaning_time"] == 90
        assert data["cleaning_config"]["complexity_level"] == "high"
        
        print(f"✅ Updated unit configuration")
        
        # Verify with GET
        get_response = requests.get(f"{API_URL}/units/{unit_id}", headers=auth_headers)
        get_data = get_response.json()
        assert get_data["bed_config"]["beds_double"] == 2
        assert get_data["cleaning_config"]["complexity_level"] == "high"


class TestDashboardStats:
    """Test dashboard statistics endpoint"""
    
    def test_get_dashboard_stats(self, auth_headers):
        """Get dashboard statistics"""
        response = requests.get(f"{API_URL}/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "total_clients" in data
        assert "total_structures" in data
        assert "total_units" in data
        assert isinstance(data["total_clients"], int)
        assert isinstance(data["total_structures"], int)
        assert isinstance(data["total_units"], int)
        
        print(f"✅ Dashboard stats: {data['total_clients']} clients, {data['total_structures']} structures, {data['total_units']} units")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_data(self, auth_headers):
        """Clean up all TEST_ prefixed data"""
        # Get all clients
        clients_response = requests.get(f"{API_URL}/clients", headers=auth_headers)
        clients = clients_response.json()
        
        deleted_count = 0
        for client in clients:
            if client["display_name"].startswith("TEST_"):
                # First delete all structures for this client
                structures_response = requests.get(f"{API_URL}/structures?client_id={client['id']}", headers=auth_headers)
                for structure in structures_response.json():
                    # Delete all units for this structure
                    units_response = requests.get(f"{API_URL}/units?structure_id={structure['id']}", headers=auth_headers)
                    for unit in units_response.json():
                        requests.delete(f"{API_URL}/units/{unit['id']}", headers=auth_headers)
                    requests.delete(f"{API_URL}/structures/{structure['id']}", headers=auth_headers)
                
                # Now delete the client
                requests.delete(f"{API_URL}/clients/{client['id']}", headers=auth_headers)
                deleted_count += 1
        
        print(f"✅ Cleaned up {deleted_count} test clients")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
