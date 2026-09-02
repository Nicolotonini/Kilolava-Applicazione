from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Test Users/Roles/Permissions API for Kilolava
Tests: User CRUD, role-based access, toggle active, permissions endpoint
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD
RIDER_EMAIL = "rider1@kilolava.com"
RIDER_PASSWORD = TEST_FIXTURE_PASSWORD
CLIENT_EMAIL = "mario.rossi@cliente.it"
CLIENT_PASSWORD = TEST_FIXTURE_PASSWORD


class TestUsersRolesAPI:
    """Test Users/Roles/Permissions API endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data, "No access_token in response"
        return data["access_token"]
    
    @pytest.fixture(scope="class")
    def admin_headers(self, admin_token):
        """Admin auth headers"""
        return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def rider_token(self):
        """Get rider auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Rider login failed: {response.text}")
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def rider_headers(self, rider_token):
        """Rider auth headers"""
        return {"Authorization": f"Bearer {rider_token}", "Content-Type": "application/json"}
    
    @pytest.fixture(scope="class")
    def client_token(self):
        """Get client auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL,
            "password": CLIENT_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Client login failed: {response.text}")
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def client_headers(self, client_token):
        """Client auth headers"""
        return {"Authorization": f"Bearer {client_token}", "Content-Type": "application/json"}
    
    # ============== AUTH TESTS ==============
    
    def test_admin_login_returns_correct_role(self):
        """Admin login returns user with admin/manager role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        # Role should be admin or manager (legacy)
        assert data["user"]["role"] in ["admin", "manager"]
        assert data["user"]["email"] == ADMIN_EMAIL
        print(f"Admin login successful, role: {data['user']['role']}")
    
    def test_rider_login_returns_rider_role(self):
        """Rider login returns user with rider role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Rider user not found: {response.text}")
        data = response.json()
        assert data["user"]["role"] == "rider"
        print(f"Rider login successful, role: {data['user']['role']}")
    
    def test_client_login_returns_client_role(self):
        """Client login returns user with client role"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLIENT_EMAIL,
            "password": CLIENT_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Client user not found: {response.text}")
        data = response.json()
        assert data["user"]["role"] == "client"
        print(f"Client login successful, role: {data['user']['role']}")
    
    # ============== GET USERS TESTS ==============
    
    def test_get_users_as_admin(self, admin_headers):
        """Admin can list all users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0
        # Verify user structure
        user = users[0]
        assert "id" in user
        assert "email" in user
        assert "role" in user
        assert "is_active" in user
        print(f"GET /api/users returned {len(users)} users")
    
    def test_get_users_filter_by_role(self, admin_headers):
        """Admin can filter users by role"""
        response = requests.get(f"{BASE_URL}/api/users?role=rider", headers=admin_headers)
        assert response.status_code == 200
        users = response.json()
        for user in users:
            assert user["role"] == "rider"
        print(f"Filtered by role=rider: {len(users)} users")
    
    def test_get_users_filter_by_active(self, admin_headers):
        """Admin can filter users by active status"""
        response = requests.get(f"{BASE_URL}/api/users?is_active=true", headers=admin_headers)
        assert response.status_code == 200
        users = response.json()
        for user in users:
            assert user["is_active"] == True
        print(f"Filtered by is_active=true: {len(users)} users")
    
    def test_get_users_search(self, admin_headers):
        """Admin can search users by name/email"""
        response = requests.get(f"{BASE_URL}/api/users?search=test", headers=admin_headers)
        assert response.status_code == 200
        users = response.json()
        print(f"Search 'test': {len(users)} users found")
    
    def test_get_users_as_rider_forbidden(self, rider_headers):
        """Rider cannot list users (403)"""
        response = requests.get(f"{BASE_URL}/api/users", headers=rider_headers)
        assert response.status_code == 403
        print("Rider correctly denied access to /api/users")
    
    def test_get_users_as_client_forbidden(self, client_headers):
        """Client cannot list users (403)"""
        response = requests.get(f"{BASE_URL}/api/users", headers=client_headers)
        assert response.status_code == 403
        print("Client correctly denied access to /api/users")
    
    # ============== CREATE USER TESTS ==============
    
    def test_create_user_cleaner(self, admin_headers):
        """Admin can create a new cleaner user"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "first_name": "Test",
            "last_name": f"Cleaner{unique_id}",
            "email": f"test_cleaner_{unique_id}@kilolava.com",
            "password": TEST_ADMIN_PASSWORD,
            "role": "cleaner",
            "phone": "+39123456789",
            "notes": "Test cleaner user"
        }
        response = requests.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Create user failed: {response.text}"
        user = response.json()
        assert user["email"] == payload["email"]
        assert user["role"] == "cleaner"
        assert user["first_name"] == "Test"
        assert user["is_active"] == True
        print(f"Created cleaner user: {user['id']}")
        
        # Cleanup - delete the user
        delete_response = requests.delete(f"{BASE_URL}/api/users/{user['id']}", headers=admin_headers)
        assert delete_response.status_code == 200
        print(f"Cleaned up test user: {user['id']}")
    
    def test_create_user_rider(self, admin_headers):
        """Admin can create a new rider user with vehicle_type"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "first_name": "Test",
            "last_name": f"Rider{unique_id}",
            "email": f"test_rider_{unique_id}@kilolava.com",
            "password": TEST_ADMIN_PASSWORD,
            "role": "rider",
            "phone": "+39123456789",
            "vehicle_type": "Furgone"
        }
        response = requests.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        assert response.status_code == 200, f"Create rider failed: {response.text}"
        user = response.json()
        assert user["role"] == "rider"
        assert user["vehicle_type"] == "Furgone"
        print(f"Created rider user with vehicle_type: {user['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/users/{user['id']}", headers=admin_headers)
    
    def test_create_user_duplicate_email_rejected(self, admin_headers):
        """Creating user with duplicate email is rejected"""
        payload = {
            "first_name": "Duplicate",
            "last_name": "User",
            "email": ADMIN_EMAIL,  # Already exists
            "password": TEST_ADMIN_PASSWORD,
            "role": "cleaner"
        }
        response = requests.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        assert response.status_code == 400
        assert "registrata" in response.json().get("detail", "").lower() or "email" in response.json().get("detail", "").lower()
        print("Duplicate email correctly rejected")
    
    def test_create_user_invalid_role_rejected(self, admin_headers):
        """Creating user with invalid role is rejected"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "first_name": "Invalid",
            "last_name": "Role",
            "email": f"invalid_role_{unique_id}@kilolava.com",
            "password": TEST_ADMIN_PASSWORD,
            "role": "superadmin"  # Invalid role
        }
        response = requests.post(f"{BASE_URL}/api/users", json=payload, headers=admin_headers)
        assert response.status_code == 400
        print("Invalid role correctly rejected")
    
    def test_create_user_as_rider_forbidden(self, rider_headers):
        """Rider cannot create users"""
        payload = {
            "first_name": "Test",
            "last_name": "User",
            "email": "test_forbidden@kilolava.com",
            "password": TEST_ADMIN_PASSWORD,
            "role": "cleaner"
        }
        response = requests.post(f"{BASE_URL}/api/users", json=payload, headers=rider_headers)
        assert response.status_code == 403
        print("Rider correctly denied user creation")
    
    # ============== UPDATE USER TESTS ==============
    
    def test_update_user(self, admin_headers):
        """Admin can update user details"""
        # First create a user
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "first_name": "Update",
            "last_name": f"Test{unique_id}",
            "email": f"update_test_{unique_id}@kilolava.com",
            "password": TEST_ADMIN_PASSWORD,
            "role": "cleaner"
        }
        create_response = requests.post(f"{BASE_URL}/api/users", json=create_payload, headers=admin_headers)
        assert create_response.status_code == 200
        user = create_response.json()
        user_id = user["id"]
        
        # Update the user
        update_payload = {
            "first_name": "Updated",
            "last_name": "Name",
            "phone": "+39999888777",
            "notes": "Updated notes"
        }
        update_response = requests.put(f"{BASE_URL}/api/users/{user_id}", json=update_payload, headers=admin_headers)
        assert update_response.status_code == 200
        updated_user = update_response.json()
        assert updated_user["first_name"] == "Updated"
        assert updated_user["last_name"] == "Name"
        assert updated_user["phone"] == "+39999888777"
        print(f"Updated user: {user_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)
    
    # ============== TOGGLE ACTIVE TESTS ==============
    
    def test_toggle_user_active(self, admin_headers):
        """Admin can toggle user active status"""
        # Create a user
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "first_name": "Toggle",
            "last_name": f"Test{unique_id}",
            "email": f"toggle_test_{unique_id}@kilolava.com",
            "password": TEST_ADMIN_PASSWORD,
            "role": "cleaner"
        }
        create_response = requests.post(f"{BASE_URL}/api/users", json=create_payload, headers=admin_headers)
        assert create_response.status_code == 200
        user = create_response.json()
        user_id = user["id"]
        assert user["is_active"] == True
        
        # Toggle to inactive
        toggle_response = requests.put(f"{BASE_URL}/api/users/{user_id}/toggle-active", headers=admin_headers)
        assert toggle_response.status_code == 200
        toggle_data = toggle_response.json()
        assert toggle_data["is_active"] == False
        print(f"Toggled user {user_id} to inactive")
        
        # Toggle back to active
        toggle_response2 = requests.put(f"{BASE_URL}/api/users/{user_id}/toggle-active", headers=admin_headers)
        assert toggle_response2.status_code == 200
        assert toggle_response2.json()["is_active"] == True
        print(f"Toggled user {user_id} back to active")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)
    
    # ============== DELETE USER TESTS ==============
    
    def test_delete_user(self, admin_headers):
        """Admin can delete a user"""
        # Create a user
        unique_id = str(uuid.uuid4())[:8]
        create_payload = {
            "first_name": "Delete",
            "last_name": f"Test{unique_id}",
            "email": f"delete_test_{unique_id}@kilolava.com",
            "password": TEST_ADMIN_PASSWORD,
            "role": "cleaner"
        }
        create_response = requests.post(f"{BASE_URL}/api/users", json=create_payload, headers=admin_headers)
        assert create_response.status_code == 200
        user = create_response.json()
        user_id = user["id"]
        
        # Delete the user
        delete_response = requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)
        assert delete_response.status_code == 200
        print(f"Deleted user: {user_id}")
        
        # Verify user is deleted
        get_response = requests.get(f"{BASE_URL}/api/users/{user_id}", headers=admin_headers)
        assert get_response.status_code == 404
        print("Verified user no longer exists")
    
    def test_delete_user_as_rider_forbidden(self, rider_headers, admin_headers):
        """Rider cannot delete users"""
        # Get any user ID
        users_response = requests.get(f"{BASE_URL}/api/users", headers=admin_headers)
        users = users_response.json()
        if len(users) > 0:
            user_id = users[0]["id"]
            delete_response = requests.delete(f"{BASE_URL}/api/users/{user_id}", headers=rider_headers)
            assert delete_response.status_code == 403
            print("Rider correctly denied user deletion")
    
    # ============== PERMISSIONS ENDPOINT TESTS ==============
    
    def test_get_roles_and_permissions(self, admin_headers):
        """Get available roles and permissions"""
        response = requests.get(f"{BASE_URL}/api/permissions/roles", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "roles" in data
        assert "permissions" in data
        assert "admin" in data["roles"]
        assert "rider" in data["roles"]
        assert "cleaner" in data["roles"]
        assert "client" in data["roles"]
        print(f"Available roles: {data['roles']}")
    
    # ============== AUTH/ME ENDPOINT TESTS ==============
    
    def test_auth_me_returns_user_info(self, admin_headers):
        """GET /api/auth/me returns current user info"""
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers)
        assert response.status_code == 200
        user = response.json()
        assert user["email"] == ADMIN_EMAIL
        assert "role" in user
        assert "permissions" in user
        print(f"Auth/me returned user: {user['email']}, role: {user['role']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
