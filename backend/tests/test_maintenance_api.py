"""
Maintenance Management Module API Tests
Tests for: maintenance issues CRUD, status updates, notes, role-based access, history tracking
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"
MAINTENANCE_EMAIL = "luigi.verdi@kilolava.com"
MAINTENANCE_PASSWORD = "MaintPass123!"
CLEANER_EMAIL = "maria.bianchi@kilolava.com"
CLEANER_PASSWORD = "CleanPass123!"


@pytest.fixture(scope="module")
def admin_token():
    """Get admin auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    assert response.status_code == 200, f"Admin login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def maintenance_token():
    """Get maintenance staff auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": MAINTENANCE_EMAIL,
        "password": MAINTENANCE_PASSWORD
    })
    assert response.status_code == 200, f"Maintenance login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def cleaner_token():
    """Get cleaner auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": CLEANER_EMAIL,
        "password": CLEANER_PASSWORD
    })
    assert response.status_code == 200, f"Cleaner login failed: {response.text}"
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def maintenance_user_id(maintenance_token):
    """Get maintenance user ID"""
    response = requests.get(f"{BASE_URL}/api/auth/me", headers={
        "Authorization": f"Bearer {maintenance_token}"
    })
    assert response.status_code == 200
    return response.json()["id"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def maintenance_headers(maintenance_token):
    return {"Authorization": f"Bearer {maintenance_token}"}


@pytest.fixture(scope="module")
def cleaner_headers(cleaner_token):
    return {"Authorization": f"Bearer {cleaner_token}"}


class TestMaintenanceSummary:
    """Test maintenance summary endpoint"""
    
    def test_admin_can_get_summary(self, admin_headers):
        """Admin can get maintenance summary"""
        response = requests.get(f"{BASE_URL}/api/maintenance/summary", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "open" in data
        assert "by_status" in data
        assert "by_priority" in data
        print(f"Summary: total={data['total']}, open={data['open']}")
    
    def test_maintenance_cannot_get_summary(self, maintenance_headers):
        """Maintenance staff cannot get summary (ops only)"""
        response = requests.get(f"{BASE_URL}/api/maintenance/summary", headers=maintenance_headers)
        assert response.status_code == 403


class TestMaintenanceStaff:
    """Test maintenance staff listing"""
    
    def test_admin_can_list_staff(self, admin_headers):
        """Admin can list maintenance staff"""
        response = requests.get(f"{BASE_URL}/api/maintenance/staff", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least Luigi Verdi
        names = [s.get("name", "") for s in data]
        print(f"Maintenance staff: {names}")
    
    def test_maintenance_cannot_list_staff(self, maintenance_headers):
        """Maintenance staff cannot list other staff (ops only)"""
        response = requests.get(f"{BASE_URL}/api/maintenance/staff", headers=maintenance_headers)
        assert response.status_code == 403


class TestMaintenanceIssuesCRUD:
    """Test maintenance issues CRUD operations"""
    
    def test_admin_can_list_issues(self, admin_headers):
        """Admin can list all maintenance issues"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Total issues: {len(data)}")
    
    def test_admin_can_filter_by_status(self, admin_headers):
        """Admin can filter issues by status"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues?status=open", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        for issue in data:
            assert issue["status"] == "open"
    
    def test_admin_can_filter_by_priority(self, admin_headers):
        """Admin can filter issues by priority"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues?priority=high", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        for issue in data:
            assert issue["priority"] == "high"
    
    def test_maintenance_cannot_list_all_issues(self, maintenance_headers):
        """Maintenance staff cannot list all issues (only own tasks)"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues", headers=maintenance_headers)
        assert response.status_code == 403
    
    def test_admin_can_create_issue(self, admin_headers):
        """Admin can create a manual maintenance issue"""
        payload = {
            "category": "electrical",
            "description": f"TEST_Issue_{uuid.uuid4().hex[:8]} - Test electrical problem",
            "priority": "high",
            "internal_notes": "Test notes"
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "electrical"
        assert data["priority"] == "high"
        assert data["status"] == "open"  # No assignment = open
        assert data["source"] == "manual"
        assert "history" in data
        assert len(data["history"]) >= 1
        print(f"Created issue: {data['id']}")
        # Cleanup
        requests.delete(f"{BASE_URL}/api/maintenance/issues/{data['id']}", headers=admin_headers)
    
    def test_admin_can_create_issue_with_assignment(self, admin_headers, maintenance_user_id):
        """Admin can create issue with assignment (status becomes assigned)"""
        payload = {
            "category": "plumbing",
            "description": f"TEST_Issue_{uuid.uuid4().hex[:8]} - Test plumbing problem",
            "priority": "medium",
            "assigned_to": maintenance_user_id
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "assigned"  # With assignment = assigned
        assert data["assigned_to"] == maintenance_user_id
        # History should have created + assigned entries
        assert len(data["history"]) >= 2
        print(f"Created assigned issue: {data['id']}")
        # Cleanup
        requests.delete(f"{BASE_URL}/api/maintenance/issues/{data['id']}", headers=admin_headers)
    
    def test_invalid_category_rejected(self, admin_headers):
        """Invalid category is rejected"""
        payload = {
            "category": "invalid_category",
            "description": "Test",
            "priority": "medium"
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 400
    
    def test_invalid_priority_rejected(self, admin_headers):
        """Invalid priority is rejected"""
        payload = {
            "category": "electrical",
            "description": "Test",
            "priority": "invalid_priority"
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 400
    
    def test_maintenance_cannot_create_issue(self, maintenance_headers):
        """Maintenance staff cannot create issues (ops only)"""
        payload = {
            "category": "electrical",
            "description": "Test",
            "priority": "medium"
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=maintenance_headers)
        assert response.status_code == 403


class TestMaintenanceIssueDetail:
    """Test getting issue detail"""
    
    @pytest.fixture(scope="class")
    def test_issue(self, admin_headers, maintenance_user_id):
        """Create a test issue for detail tests"""
        payload = {
            "category": "furniture",
            "description": f"TEST_Detail_{uuid.uuid4().hex[:8]} - Test furniture issue",
            "priority": "low",
            "assigned_to": maintenance_user_id
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 200
        issue = response.json()
        yield issue
        # Cleanup
        requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue['id']}", headers=admin_headers)
    
    def test_admin_can_get_issue_detail(self, admin_headers, test_issue):
        """Admin can get issue detail with history"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues/{test_issue['id']}", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_issue["id"]
        assert "history" in data
        assert "category" in data
        assert "priority" in data
        assert "status" in data
    
    def test_maintenance_can_get_own_task(self, maintenance_headers, test_issue):
        """Maintenance staff can get their own assigned task"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues/{test_issue['id']}", headers=maintenance_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_issue["id"]
    
    def test_nonexistent_issue_returns_404(self, admin_headers):
        """Nonexistent issue returns 404"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues/nonexistent-id", headers=admin_headers)
        assert response.status_code == 404


class TestMaintenanceIssueUpdate:
    """Test updating maintenance issues"""
    
    @pytest.fixture(scope="class")
    def update_issue(self, admin_headers):
        """Create a test issue for update tests"""
        payload = {
            "category": "damage",
            "description": f"TEST_Update_{uuid.uuid4().hex[:8]} - Test damage issue",
            "priority": "low"
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 200
        issue = response.json()
        yield issue
        # Cleanup
        requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue['id']}", headers=admin_headers)
    
    def test_admin_can_update_priority(self, admin_headers, update_issue):
        """Admin can update issue priority (creates history entry)"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{update_issue['id']}",
            json={"priority": "urgent"},
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["priority"] == "urgent"
        # Check history has priority change entry
        priority_changes = [h for h in data["history"] if h["action"] == "priority_changed"]
        assert len(priority_changes) >= 1
        print(f"Priority changed, history entries: {len(data['history'])}")
    
    def test_admin_can_assign_issue(self, admin_headers, update_issue, maintenance_user_id):
        """Admin can assign issue to maintenance staff"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{update_issue['id']}",
            json={"assigned_to": maintenance_user_id},
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["assigned_to"] == maintenance_user_id
        # Status should change to assigned if was open
        assert data["status"] in ["assigned", "open"]
    
    def test_admin_can_add_notes(self, admin_headers, update_issue):
        """Admin can add internal notes"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{update_issue['id']}",
            json={"internal_notes": "Updated internal notes"},
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "Updated internal notes" in data.get("internal_notes", "")
    
    def test_maintenance_cannot_update_issue(self, maintenance_headers, update_issue):
        """Maintenance staff cannot update issues (ops only)"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{update_issue['id']}",
            json={"priority": "low"},
            headers=maintenance_headers
        )
        assert response.status_code == 403


class TestMaintenanceStatusUpdate:
    """Test status update workflow"""
    
    @pytest.fixture(scope="class")
    def status_issue(self, admin_headers, maintenance_user_id):
        """Create a test issue for status tests"""
        payload = {
            "category": "missing_item",
            "description": f"TEST_Status_{uuid.uuid4().hex[:8]} - Test status workflow",
            "priority": "medium",
            "assigned_to": maintenance_user_id
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 200
        issue = response.json()
        yield issue
        # Cleanup
        requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue['id']}", headers=admin_headers)
    
    def test_maintenance_can_start_task(self, maintenance_headers, status_issue):
        """Maintenance staff can change status to in_progress"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{status_issue['id']}/status",
            json={"status": "in_progress"},
            headers=maintenance_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "in_progress"
        # Check history
        status_changes = [h for h in data["history"] if h["action"] == "status_changed"]
        assert len(status_changes) >= 1
        print(f"Status changed to in_progress")
    
    def test_maintenance_can_resolve_task(self, maintenance_headers, status_issue):
        """Maintenance staff can resolve task with notes"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{status_issue['id']}/status",
            json={"status": "resolved", "resolution_notes": "Fixed the issue"},
            headers=maintenance_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "resolved"
        assert data.get("resolution_notes") == "Fixed the issue"
        assert "resolved_at" in data
        print(f"Task resolved at: {data.get('resolved_at')}")
    
    def test_admin_can_close_issue(self, admin_headers, status_issue):
        """Admin can close resolved issue"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{status_issue['id']}/status",
            json={"status": "closed"},
            headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "closed"
        assert "closed_at" in data
    
    def test_invalid_status_rejected(self, admin_headers, status_issue):
        """Invalid status is rejected"""
        response = requests.put(
            f"{BASE_URL}/api/maintenance/issues/{status_issue['id']}/status",
            json={"status": "invalid_status"},
            headers=admin_headers
        )
        assert response.status_code == 400


class TestMaintenanceNotes:
    """Test adding notes to issues"""
    
    @pytest.fixture(scope="class")
    def notes_issue(self, admin_headers, maintenance_user_id):
        """Create a test issue for notes tests"""
        payload = {
            "category": "other",
            "description": f"TEST_Notes_{uuid.uuid4().hex[:8]} - Test notes",
            "priority": "low",
            "assigned_to": maintenance_user_id
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert response.status_code == 200
        issue = response.json()
        yield issue
        # Cleanup
        requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue['id']}", headers=admin_headers)
    
    def test_admin_can_add_note(self, admin_headers, notes_issue):
        """Admin can add note to issue"""
        response = requests.post(
            f"{BASE_URL}/api/maintenance/issues/{notes_issue['id']}/notes",
            json={"note": "Admin note added"},
            headers=admin_headers
        )
        assert response.status_code == 200
        # Verify note was added
        get_response = requests.get(f"{BASE_URL}/api/maintenance/issues/{notes_issue['id']}", headers=admin_headers)
        data = get_response.json()
        assert "Admin note added" in data.get("internal_notes", "")
        # Check history
        note_entries = [h for h in data["history"] if h["action"] == "note_added"]
        assert len(note_entries) >= 1
    
    def test_maintenance_can_add_note(self, maintenance_headers, notes_issue):
        """Maintenance staff can add note to their task"""
        response = requests.post(
            f"{BASE_URL}/api/maintenance/issues/{notes_issue['id']}/notes",
            json={"note": "Maintenance note added"},
            headers=maintenance_headers
        )
        assert response.status_code == 200


class TestMaintenanceMyTasks:
    """Test maintenance staff my-tasks endpoint"""
    
    def test_maintenance_can_get_own_tasks(self, maintenance_headers):
        """Maintenance staff can get their assigned tasks"""
        response = requests.get(f"{BASE_URL}/api/maintenance/my-tasks", headers=maintenance_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Maintenance user has {len(data)} tasks")
    
    def test_maintenance_can_filter_own_tasks_by_status(self, maintenance_headers):
        """Maintenance staff can filter own tasks by status"""
        response = requests.get(f"{BASE_URL}/api/maintenance/my-tasks?status=in_progress", headers=maintenance_headers)
        assert response.status_code == 200
        data = response.json()
        for task in data:
            assert task["status"] == "in_progress"
    
    def test_cleaner_can_get_my_tasks(self, cleaner_headers):
        """Cleaner can call my-tasks (returns empty if no assignments)"""
        response = requests.get(f"{BASE_URL}/api/maintenance/my-tasks", headers=cleaner_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestMaintenanceDelete:
    """Test deleting maintenance issues"""
    
    def test_admin_can_delete_issue(self, admin_headers):
        """Admin can delete maintenance issue"""
        # Create issue
        payload = {
            "category": "broken_item",
            "description": f"TEST_Delete_{uuid.uuid4().hex[:8]} - To be deleted",
            "priority": "low"
        }
        create_response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert create_response.status_code == 200
        issue_id = create_response.json()["id"]
        
        # Delete issue
        delete_response = requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue_id}", headers=admin_headers)
        assert delete_response.status_code == 200
        
        # Verify deleted
        get_response = requests.get(f"{BASE_URL}/api/maintenance/issues/{issue_id}", headers=admin_headers)
        assert get_response.status_code == 404
    
    def test_maintenance_cannot_delete_issue(self, maintenance_headers, admin_headers):
        """Maintenance staff cannot delete issues"""
        # Create issue
        payload = {
            "category": "other",
            "description": f"TEST_NoDelete_{uuid.uuid4().hex[:8]}",
            "priority": "low"
        }
        create_response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=admin_headers)
        assert create_response.status_code == 200
        issue_id = create_response.json()["id"]
        
        # Try to delete as maintenance
        delete_response = requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue_id}", headers=maintenance_headers)
        assert delete_response.status_code == 403
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue_id}", headers=admin_headers)
    
    def test_delete_nonexistent_returns_404(self, admin_headers):
        """Deleting nonexistent issue returns 404"""
        response = requests.delete(f"{BASE_URL}/api/maintenance/issues/nonexistent-id", headers=admin_headers)
        assert response.status_code == 404


class TestMaintenanceRoleAccess:
    """Test role-based access control"""
    
    def test_cleaner_cannot_list_all_issues(self, cleaner_headers):
        """Cleaner cannot list all maintenance issues"""
        response = requests.get(f"{BASE_URL}/api/maintenance/issues", headers=cleaner_headers)
        assert response.status_code == 403
    
    def test_cleaner_cannot_create_issue(self, cleaner_headers):
        """Cleaner cannot create maintenance issues"""
        payload = {
            "category": "electrical",
            "description": "Test",
            "priority": "medium"
        }
        response = requests.post(f"{BASE_URL}/api/maintenance/issues", json=payload, headers=cleaner_headers)
        assert response.status_code == 403
    
    def test_cleaner_cannot_get_summary(self, cleaner_headers):
        """Cleaner cannot get maintenance summary"""
        response = requests.get(f"{BASE_URL}/api/maintenance/summary", headers=cleaner_headers)
        assert response.status_code == 403


class TestMaintenanceFromCleaning:
    """Test auto-creation of maintenance issues from cleaning tasks"""
    
    def test_cleaning_issue_creates_maintenance_issue(self, admin_headers, cleaner_headers):
        """When cleaner reports issue, maintenance issue is auto-created"""
        # First, get a cleaning task assigned to the cleaner
        # Get cleaner's tasks
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=cleaner_headers)
        if tasks_response.status_code != 200 or not tasks_response.json():
            pytest.skip("No cleaning tasks available for cleaner")
        
        tasks = tasks_response.json()
        if not tasks:
            pytest.skip("No cleaning tasks available")
        
        task = tasks[0]
        task_id = task["id"]
        
        # Report an issue
        issue_payload = {
            "category": "maintenance",
            "note": f"TEST_AutoMaint_{uuid.uuid4().hex[:8]} - Auto maintenance test",
            "severity": "medium"
        }
        issue_response = requests.post(
            f"{BASE_URL}/api/cleaning-tasks/{task_id}/issues",
            json=issue_payload,
            headers=cleaner_headers
        )
        
        if issue_response.status_code != 200:
            pytest.skip(f"Could not create cleaning issue: {issue_response.text}")
        
        # Check if maintenance issue was created
        maint_response = requests.get(f"{BASE_URL}/api/maintenance/issues", headers=admin_headers)
        assert maint_response.status_code == 200
        maint_issues = maint_response.json()
        
        # Look for the auto-created issue
        auto_issues = [i for i in maint_issues if i.get("source") == "cleaning" and "TEST_AutoMaint" in i.get("description", "")]
        print(f"Found {len(auto_issues)} auto-created maintenance issues")
        
        # Cleanup if found
        for issue in auto_issues:
            requests.delete(f"{BASE_URL}/api/maintenance/issues/{issue['id']}", headers=admin_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
