import sys; sys.path.insert(0, "/app/backend/tests")
from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
import requests
import sys
import json
from datetime import datetime

class KilolavaAPITester:
    def __init__(self, base_url="https://operations-hub-38.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data storage
        self.test_client_id = None
        self.test_structure_id = None
        self.test_unit_id = None

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, auth_required=True):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if auth_required and self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                try:
                    error_detail = response.json().get('detail', 'Unknown error')
                    details += f", Error: {error_detail}"
                except:
                    details += f", Response: {response.text[:100]}"

            self.log_test(name, success, details)
            
            if success:
                try:
                    return response.json()
                except:
                    return {}
            return None

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return None

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "health", 200, auth_required=False)

    def test_register(self):
        """Test user registration"""
        timestamp = datetime.now().strftime('%H%M%S')
        register_data = {
            "email": f"test_manager_{timestamp}@kilolava.com",
            "password": "TestPassword123!",
            "name": f"Test Manager {timestamp}",
            "role": "manager",
            "language": "it"
        }
        
        response = self.run_test("User Registration", "POST", "auth/register", 200, register_data, auth_required=False)
        if response:
            self.token = response.get('access_token')
            self.user_id = response.get('user', {}).get('id')
            return True
        return False

    def test_login(self):
        """Test user login with existing test user"""
        login_data = {
            "email": "test_user@kilolava.com",
            "password": TEST_ADMIN_PASSWORD
        }
        
        response = self.run_test("User Login", "POST", "auth/login", 200, login_data, auth_required=False)
        if response:
            self.token = response.get('access_token')
            self.user_id = response.get('user', {}).get('id')
            return True
        return False

    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        return self.run_test("Dashboard Stats", "GET", "dashboard/stats", 200) is not None

    def test_client_crud(self):
        """Test client CRUD operations with new v2.0.0 data model"""
        # Create client with new structure
        client_data = {
            "name": "Test Property Manager",
            "type": "property_manager",
            "contact_info": {
                "phone": "+39 123 456 7890",
                "email": "testclient@kilolava.com"
            },
            "active_services": ["cleaning", "laundry", "logistics"],
            "pricing_override_enabled": True,
            "operational_mode": "dynamic",
            "notes": "Test client for API testing with expanded data model",
            "is_active": True
        }
        
        response = self.run_test("Create Client", "POST", "clients", 200, client_data)
        if not response:
            return False
        
        self.test_client_id = response.get('id')
        
        # Verify client has correct structure
        if not response.get('type') == 'property_manager':
            self.log_test("Client Type Verification", False, "Client type not set correctly")
            return False
        
        # Read clients
        if not self.run_test("Get All Clients", "GET", "clients", 200):
            return False
        
        # Read specific client
        client_response = self.run_test("Get Client by ID", "GET", f"clients/{self.test_client_id}", 200)
        if not client_response:
            return False
        
        # Verify structure count is 0 initially
        if client_response.get('structure_count') != 0:
            self.log_test("Client Structure Count", False, f"Expected 0, got {client_response.get('structure_count')}")
            return False
        
        # Update client
        update_data = {
            "name": "Updated Test Property Manager",
            "type": "business",
            "active_services": ["cleaning", "consumables"],
            "operational_mode": "fixed",
            "notes": "Updated notes for testing"
        }
        if not self.run_test("Update Client", "PUT", f"clients/{self.test_client_id}", 200, update_data):
            return False
        
        return True

    def test_structure_crud(self):
        """Test structure CRUD operations with new v2.0.0 data model"""
        if not self.test_client_id:
            self.log_test("Structure CRUD", False, "No client ID available")
            return False
        
        # Create structure with new access model
        structure_data = {
            "client_id": self.test_client_id,
            "name": "Test Apartment Building",
            "address": "Via Milano 10, Roma",
            "access_type": "keybox",
            "access_details": "Keybox code: 1234",
            "ical_url": "https://example.com/calendar.ics",
            "notes": "Test structure for API testing with access configuration",
            "is_active": True
        }
        
        response = self.run_test("Create Structure", "POST", "structures", 200, structure_data)
        if not response:
            return False
        
        self.test_structure_id = response.get('id')
        
        # Verify structure has correct access type
        if not response.get('access_type') == 'keybox':
            self.log_test("Structure Access Type", False, "Access type not set correctly")
            return False
        
        # Read structures
        if not self.run_test("Get All Structures", "GET", "structures", 200):
            return False
        
        # Read structures filtered by client
        if not self.run_test("Get Structures by Client", "GET", f"structures?client_id={self.test_client_id}", 200):
            return False
        
        # Read specific structure
        structure_response = self.run_test("Get Structure by ID", "GET", f"structures/{self.test_structure_id}", 200)
        if not structure_response:
            return False
        
        # Verify unit count is 0 initially
        if structure_response.get('unit_count') != 0:
            self.log_test("Structure Unit Count", False, f"Expected 0, got {structure_response.get('unit_count')}")
            return False
        
        # Update structure
        update_data = {
            "name": "Updated Test Apartment Building",
            "access_type": "code",
            "access_details": "Door code: 5678"
        }
        if not self.run_test("Update Structure", "PUT", f"structures/{self.test_structure_id}", 200, update_data):
            return False
        
        return True

    def test_unit_crud(self):
        """Test unit CRUD operations with new v2.0.0 expanded configuration model"""
        if not self.test_structure_id:
            self.log_test("Unit CRUD", False, "No structure ID available")
            return False
        
        # Create unit with all configuration sections
        unit_data = {
            "structure_id": self.test_structure_id,
            "name": "Test Apartment 2A",
            "unit_type": "apartment",
            "bed_config": {
                "capacity_total": 4,
                "beds_double": 1,
                "beds_single": 2,
                "sofa_beds": 1
            },
            "kit_config": {
                "kit_double_per_set": 2,
                "kit_single_per_set": 4
            },
            "stock_config": {
                "target_kit_sets": 5,
                "minimum_threshold": 2
            },
            "logistics_config": {
                "logistics_mode": "fixed",
                "pickup_days": ["mon", "wed", "fri"],
                "pickup_time_window": "09:00-12:00"
            },
            "cleaning_config": {
                "checklist_template_id": "template_001",
                "estimated_cleaning_time": 90,
                "complexity_level": "high"
            },
            "notes": "Test unit with full configuration for API testing",
            "is_active": True
        }
        
        response = self.run_test("Create Unit", "POST", "units", 200, unit_data)
        if not response:
            return False
        
        self.test_unit_id = response.get('id')
        
        # Verify unit configurations
        if not response.get('bed_config', {}).get('capacity_total') == 4:
            self.log_test("Unit Bed Config", False, "Bed configuration not saved correctly")
            return False
        
        if not response.get('logistics_config', {}).get('logistics_mode') == 'fixed':
            self.log_test("Unit Logistics Config", False, "Logistics configuration not saved correctly")
            return False
        
        # Read units
        if not self.run_test("Get All Units", "GET", "units", 200):
            return False
        
        # Read units filtered by structure
        if not self.run_test("Get Units by Structure", "GET", f"units?structure_id={self.test_structure_id}", 200):
            return False
        
        # Read specific unit
        unit_response = self.run_test("Get Unit by ID", "GET", f"units/{self.test_unit_id}", 200)
        if not unit_response:
            return False
        
        # Verify all configurations are preserved
        bed_config = unit_response.get('bed_config', {})
        if bed_config.get('beds_double') != 1 or bed_config.get('beds_single') != 2:
            self.log_test("Unit Config Persistence", False, "Bed configuration not persisted correctly")
            return False
        
        # Update unit with partial configuration changes
        update_data = {
            "name": "Updated Test Apartment 2A",
            "bed_config": {
                "capacity_total": 6,
                "beds_double": 2,
                "beds_single": 2,
                "sofa_beds": 0
            },
            "cleaning_config": {
                "estimated_cleaning_time": 120,
                "complexity_level": "medium"
            }
        }
        if not self.run_test("Update Unit", "PUT", f"units/{self.test_unit_id}", 200, update_data):
            return False
        
        return True

    def test_delete_operations(self):
        """Test delete operations with constraints"""
        # Try to delete client with structures (should fail)
        if self.test_client_id:
            response = self.run_test("Delete Client with Structures (should fail)", "DELETE", f"clients/{self.test_client_id}", 400)
            # This should fail, so success means we got the expected 400 error
        
        # Try to delete structure with units (should fail)
        if self.test_structure_id:
            response = self.run_test("Delete Structure with Units (should fail)", "DELETE", f"structures/{self.test_structure_id}", 400)
            # This should fail, so success means we got the expected 400 error
        
        # Delete unit (should succeed)
        if self.test_unit_id:
            if self.run_test("Delete Unit", "DELETE", f"units/{self.test_unit_id}", 200):
                self.test_unit_id = None
        
        # Now delete structure (should succeed)
        if self.test_structure_id:
            if self.run_test("Delete Structure", "DELETE", f"structures/{self.test_structure_id}", 200):
                self.test_structure_id = None
        
        # Finally delete client (should succeed)
        if self.test_client_id:
            if self.run_test("Delete Client", "DELETE", f"clients/{self.test_client_id}", 200):
                self.test_client_id = None
        
        return True

    def run_all_tests(self):
        """Run all API tests"""
        print(f"🚀 Starting Kilolava API Tests")
        print(f"📍 Base URL: {self.base_url}")
        print("=" * 50)
        
        # Health check
        self.test_health_check()
        
        # Authentication tests
        if not self.test_login():
            print("❌ Login failed, stopping tests")
            return False
        
        # Dashboard tests
        self.test_dashboard_stats()
        
        # CRUD tests
        self.test_client_crud()
        self.test_structure_crud()
        self.test_unit_crud()
        
        # Delete operations
        self.test_delete_operations()
        
        # Print results
        print("=" * 50)
        print(f"📊 Tests completed: {self.tests_passed}/{self.tests_run}")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed")
            return False

def main():
    tester = KilolavaAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())