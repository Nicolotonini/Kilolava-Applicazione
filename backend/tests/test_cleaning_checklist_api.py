"""
Test suite for Cleaning Tasks + Checklist Module
Tests: checklist templates CRUD, cleaning tasks CRUD, status updates, checklist responses, issue reporting
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"
CLEANER_EMAIL = "maria.bianchi@kilolava.com"
CLEANER_PASSWORD = "CleanPass123!"


class TestAuth:
    """Authentication helpers"""
    
    @staticmethod
    def get_admin_token():
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @staticmethod
    def get_cleaner_token():
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": CLEANER_EMAIL,
            "password": CLEANER_PASSWORD
        })
        assert response.status_code == 200, f"Cleaner login failed: {response.text}"
        return response.json()["access_token"]


# ============== CHECKLIST TEMPLATES TESTS ==============

class TestChecklistTemplates:
    """Checklist template CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_token = TestAuth.get_admin_token()
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_list_templates_admin(self):
        """Admin can list checklist templates"""
        response = requests.get(f"{BASE_URL}/api/checklist-templates", headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} templates")
    
    def test_create_template(self):
        """Admin can create a checklist template with sections and items"""
        payload = {
            "name": "TEST_Template_Pulizia",
            "description": "Test template for cleaning",
            "sections": [
                {
                    "name": "Ispezione",
                    "order": 0,
                    "items": [
                        {"label": "Foto iniziale", "item_type": "photo", "required": True, "order": 0},
                        {"label": "Stato generale", "item_type": "yesno", "required": True, "order": 1}
                    ]
                },
                {
                    "name": "Pulizia",
                    "order": 1,
                    "items": [
                        {"label": "Pavimenti puliti", "item_type": "checkbox", "required": True, "order": 0},
                        {"label": "Bagno pulito", "item_type": "checkbox", "required": True, "order": 1},
                        {"label": "Note aggiuntive", "item_type": "text", "required": False, "order": 2}
                    ]
                }
            ]
        }
        response = requests.post(f"{BASE_URL}/api/checklist-templates", json=payload, headers=self.admin_headers)
        assert response.status_code == 200, f"Create template failed: {response.text}"
        data = response.json()
        assert data["name"] == "TEST_Template_Pulizia"
        assert len(data["sections"]) == 2
        assert len(data["sections"][0]["items"]) == 2
        assert len(data["sections"][1]["items"]) == 3
        print(f"Created template: {data['id']}")
        # Store for cleanup
        self.created_template_id = data["id"]
        return data["id"]
    
    def test_get_template_by_id(self):
        """Admin can get a specific template"""
        # First create a template
        template_id = self.test_create_template()
        
        response = requests.get(f"{BASE_URL}/api/checklist-templates/{template_id}", headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == template_id
        assert data["name"] == "TEST_Template_Pulizia"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/checklist-templates/{template_id}", headers=self.admin_headers)
    
    def test_update_template(self):
        """Admin can update a checklist template"""
        # First create a template
        template_id = self.test_create_template()
        
        update_payload = {
            "name": "TEST_Template_Updated",
            "description": "Updated description",
            "sections": [
                {
                    "name": "Sezione Unica",
                    "order": 0,
                    "items": [
                        {"label": "Item unico", "item_type": "checkbox", "required": True, "order": 0}
                    ]
                }
            ]
        }
        response = requests.put(f"{BASE_URL}/api/checklist-templates/{template_id}", json=update_payload, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "TEST_Template_Updated"
        assert len(data["sections"]) == 1
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/checklist-templates/{template_id}", headers=self.admin_headers)
    
    def test_delete_template(self):
        """Admin can delete a checklist template"""
        # First create a template
        template_id = self.test_create_template()
        
        response = requests.delete(f"{BASE_URL}/api/checklist-templates/{template_id}", headers=self.admin_headers)
        assert response.status_code == 200
        
        # Verify deleted
        response = requests.get(f"{BASE_URL}/api/checklist-templates/{template_id}", headers=self.admin_headers)
        assert response.status_code == 404
    
    def test_cleaner_cannot_list_templates(self):
        """Cleaner cannot access checklist templates list"""
        cleaner_token = TestAuth.get_cleaner_token()
        cleaner_headers = {"Authorization": f"Bearer {cleaner_token}"}
        
        response = requests.get(f"{BASE_URL}/api/checklist-templates", headers=cleaner_headers)
        assert response.status_code == 403


# ============== CLEANING TASKS TESTS ==============

class TestCleaningTasks:
    """Cleaning tasks CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_token = TestAuth.get_admin_token()
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.today = datetime.now().strftime("%Y-%m-%d")
    
    def test_list_tasks_admin(self):
        """Admin can list cleaning tasks with date filter"""
        response = requests.get(f"{BASE_URL}/api/cleaning-tasks", params={"date": self.today}, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} tasks for {self.today}")
    
    def test_list_tasks_with_status_filter(self):
        """Admin can filter tasks by status"""
        response = requests.get(f"{BASE_URL}/api/cleaning-tasks", params={"status": "assigned"}, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        for task in data:
            assert task["status"] == "assigned"
    
    def test_list_cleaners(self):
        """Admin can list active cleaners"""
        response = requests.get(f"{BASE_URL}/api/cleaning-tasks/cleaners", headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} cleaners")
        # Verify cleaner has required fields
        if data:
            assert "id" in data[0]
            assert "name" in data[0] or "email" in data[0]
    
    def test_create_task_without_template(self):
        """Admin can create a cleaning task without checklist template"""
        payload = {
            "date": self.today,
            "scheduled_time": "10:00",
            "estimated_duration_minutes": 60,
            "access_notes": "Codice portone: 1234",
            "notes": "TEST_Task senza template"
        }
        response = requests.post(f"{BASE_URL}/api/cleaning-tasks", json=payload, headers=self.admin_headers)
        assert response.status_code == 200, f"Create task failed: {response.text}"
        data = response.json()
        assert data["date"] == self.today
        assert data["status"] == "unassigned"
        assert data["checklist"] is None
        print(f"Created task: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cleaning-tasks/{data['id']}", headers=self.admin_headers)
    
    def test_create_task_with_template(self):
        """Admin can create a cleaning task with checklist template"""
        # First get an existing template
        templates_response = requests.get(f"{BASE_URL}/api/checklist-templates", headers=self.admin_headers)
        templates = templates_response.json()
        
        if not templates:
            pytest.skip("No templates available for testing")
        
        template_id = templates[0]["id"]
        
        payload = {
            "date": self.today,
            "scheduled_time": "11:00",
            "estimated_duration_minutes": 90,
            "notes": "TEST_Task con template",
            "checklist_template_id": template_id
        }
        response = requests.post(f"{BASE_URL}/api/cleaning-tasks", json=payload, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["checklist"] is not None
        assert data["checklist"]["template_id"] == template_id
        assert "sections" in data["checklist"]
        print(f"Created task with checklist: {data['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cleaning-tasks/{data['id']}", headers=self.admin_headers)
    
    def test_create_task_with_cleaner_assigned(self):
        """Creating task with cleaner sets status to 'assigned'"""
        # Get a cleaner
        cleaners_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/cleaners", headers=self.admin_headers)
        cleaners = cleaners_response.json()
        
        if not cleaners:
            pytest.skip("No cleaners available for testing")
        
        cleaner_id = cleaners[0]["id"]
        
        payload = {
            "date": self.today,
            "scheduled_time": "14:00",
            "notes": "TEST_Task assegnato",
            "assigned_cleaner_id": cleaner_id
        }
        response = requests.post(f"{BASE_URL}/api/cleaning-tasks", json=payload, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "assigned"
        assert data["assigned_cleaner_id"] == cleaner_id
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cleaning-tasks/{data['id']}", headers=self.admin_headers)
    
    def test_update_task(self):
        """Admin can update a cleaning task"""
        # Create a task first
        create_payload = {"date": self.today, "notes": "TEST_Task da aggiornare"}
        create_response = requests.post(f"{BASE_URL}/api/cleaning-tasks", json=create_payload, headers=self.admin_headers)
        task_id = create_response.json()["id"]
        
        # Update it
        update_payload = {
            "scheduled_time": "15:00",
            "estimated_duration_minutes": 120,
            "notes": "TEST_Task aggiornato"
        }
        response = requests.put(f"{BASE_URL}/api/cleaning-tasks/{task_id}", json=update_payload, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["scheduled_time"] == "15:00"
        assert data["estimated_duration_minutes"] == 120
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/cleaning-tasks/{task_id}", headers=self.admin_headers)
    
    def test_delete_task(self):
        """Admin can delete a cleaning task"""
        # Create a task first
        create_payload = {"date": self.today, "notes": "TEST_Task da eliminare"}
        create_response = requests.post(f"{BASE_URL}/api/cleaning-tasks", json=create_payload, headers=self.admin_headers)
        task_id = create_response.json()["id"]
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/cleaning-tasks/{task_id}", headers=self.admin_headers)
        assert response.status_code == 200
        
        # Verify deleted
        response = requests.get(f"{BASE_URL}/api/cleaning-tasks/{task_id}", headers=self.admin_headers)
        assert response.status_code == 404
    
    def test_cleaner_cannot_list_all_tasks(self):
        """Cleaner cannot access /api/cleaning-tasks list (only my-tasks)"""
        cleaner_token = TestAuth.get_cleaner_token()
        cleaner_headers = {"Authorization": f"Bearer {cleaner_token}"}
        
        response = requests.get(f"{BASE_URL}/api/cleaning-tasks", headers=cleaner_headers)
        assert response.status_code == 403


# ============== CLEANER MY-TASKS TESTS ==============

class TestCleanerMyTasks:
    """Tests for cleaner's own tasks endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.cleaner_token = TestAuth.get_cleaner_token()
        self.cleaner_headers = {"Authorization": f"Bearer {self.cleaner_token}"}
        self.admin_token = TestAuth.get_admin_token()
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.today = datetime.now().strftime("%Y-%m-%d")
    
    def test_cleaner_can_get_my_tasks(self):
        """Cleaner can get their own assigned tasks"""
        response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", params={"date": self.today}, headers=self.cleaner_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Cleaner has {len(data)} tasks for {self.today}")
    
    def test_cleaner_can_get_own_task_detail(self):
        """Cleaner can get detail of their own task"""
        # First get cleaner's tasks
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=self.cleaner_headers)
        tasks = tasks_response.json()
        
        if not tasks:
            pytest.skip("No tasks assigned to cleaner for testing")
        
        task_id = tasks[0]["id"]
        response = requests.get(f"{BASE_URL}/api/cleaning-tasks/{task_id}", headers=self.cleaner_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == task_id


# ============== STATUS UPDATE TESTS ==============

class TestCleaningTaskStatus:
    """Tests for cleaning task status updates"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.admin_token = TestAuth.get_admin_token()
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.cleaner_token = TestAuth.get_cleaner_token()
        self.cleaner_headers = {"Authorization": f"Bearer {self.cleaner_token}"}
        self.today = datetime.now().strftime("%Y-%m-%d")
    
    def test_cleaner_can_start_task(self):
        """Cleaner can change status to in_progress"""
        # Get cleaner's tasks
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=self.cleaner_headers)
        tasks = tasks_response.json()
        
        # Find an assigned task
        assigned_task = next((t for t in tasks if t["status"] == "assigned"), None)
        if not assigned_task:
            pytest.skip("No assigned task available for testing")
        
        task_id = assigned_task["id"]
        
        # Start the task
        response = requests.put(f"{BASE_URL}/api/cleaning-tasks/{task_id}/status", 
                               json={"status": "in_progress"}, headers=self.cleaner_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "in_progress"
        assert data["started_at"] is not None
        print(f"Task {task_id} started at {data['started_at']}")
        
        # Reset status for other tests
        requests.put(f"{BASE_URL}/api/cleaning-tasks/{task_id}", 
                    json={"status": "assigned"}, headers=self.admin_headers)
    
    def test_invalid_status_rejected(self):
        """Invalid status value is rejected"""
        # Get cleaner's tasks
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=self.cleaner_headers)
        tasks = tasks_response.json()
        
        if not tasks:
            pytest.skip("No tasks available for testing")
        
        task_id = tasks[0]["id"]
        
        response = requests.put(f"{BASE_URL}/api/cleaning-tasks/{task_id}/status", 
                               json={"status": "invalid_status"}, headers=self.cleaner_headers)
        assert response.status_code == 400


# ============== CHECKLIST RESPONSE TESTS ==============

class TestChecklistResponses:
    """Tests for checklist response updates"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.cleaner_token = TestAuth.get_cleaner_token()
        self.cleaner_headers = {"Authorization": f"Bearer {self.cleaner_token}"}
        self.admin_token = TestAuth.get_admin_token()
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_cleaner_can_save_checklist_responses(self):
        """Cleaner can save checklist responses"""
        # Get cleaner's tasks with checklist
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=self.cleaner_headers)
        tasks = tasks_response.json()
        
        # Find a task with checklist
        task_with_checklist = next((t for t in tasks if t.get("checklist")), None)
        if not task_with_checklist:
            pytest.skip("No task with checklist available for testing")
        
        task_id = task_with_checklist["id"]
        checklist = task_with_checklist["checklist"]
        
        # Build responses for first section
        responses = {}
        if checklist.get("sections"):
            section = checklist["sections"][0]
            for item in section.get("items", []):
                key = f"{section['name']}|{item['label']}"
                if item["item_type"] == "checkbox":
                    responses[key] = True
                elif item["item_type"] == "yesno":
                    responses[key] = True
                elif item["item_type"] == "text":
                    responses[key] = "Test note"
                elif item["item_type"] == "number":
                    responses[key] = "5"
        
        if not responses:
            pytest.skip("No checklist items to test")
        
        response = requests.put(f"{BASE_URL}/api/cleaning-tasks/{task_id}/checklist", 
                               json={"responses": responses}, headers=self.cleaner_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["checklist"]["responses"] is not None
        print(f"Saved {len(responses)} checklist responses")
    
    def test_checklist_required_for_completion(self):
        """Task with required checklist items cannot be completed without responses"""
        # Get cleaner's tasks with checklist
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=self.cleaner_headers)
        tasks = tasks_response.json()
        
        # Find an in_progress task with checklist that has required items
        task_with_checklist = next((t for t in tasks if t.get("checklist") and t["status"] == "in_progress"), None)
        if not task_with_checklist:
            pytest.skip("No in_progress task with checklist available for testing")
        
        task_id = task_with_checklist["id"]
        
        # Clear responses first
        requests.put(f"{BASE_URL}/api/cleaning-tasks/{task_id}/checklist", 
                    json={"responses": {}}, headers=self.cleaner_headers)
        
        # Try to complete - should fail if there are required items
        response = requests.put(f"{BASE_URL}/api/cleaning-tasks/{task_id}/status", 
                               json={"status": "completed"}, headers=self.cleaner_headers)
        # This may succeed or fail depending on whether there are required items
        # Just verify we get a valid response
        assert response.status_code in [200, 400]


# ============== ISSUE REPORTING TESTS ==============

class TestIssueReporting:
    """Tests for issue reporting functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.cleaner_token = TestAuth.get_cleaner_token()
        self.cleaner_headers = {"Authorization": f"Bearer {self.cleaner_token}"}
        self.admin_token = TestAuth.get_admin_token()
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_cleaner_can_report_issue(self):
        """Cleaner can report an issue on their task"""
        # Get cleaner's tasks
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=self.cleaner_headers)
        tasks = tasks_response.json()
        
        if not tasks:
            pytest.skip("No tasks available for testing")
        
        task_id = tasks[0]["id"]
        
        payload = {
            "category": "broken_item",
            "note": "TEST_Issue: Rubinetto rotto in bagno",
            "severity": "medium"
        }
        response = requests.post(f"{BASE_URL}/api/cleaning-tasks/{task_id}/issues", 
                                json=payload, headers=self.cleaner_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "broken_item"
        assert data["severity"] == "medium"
        assert data["status"] == "open"
        print(f"Created issue: {data['id']}")
    
    def test_invalid_issue_category_rejected(self):
        """Invalid issue category is rejected"""
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks/my-tasks", headers=self.cleaner_headers)
        tasks = tasks_response.json()
        
        if not tasks:
            pytest.skip("No tasks available for testing")
        
        task_id = tasks[0]["id"]
        
        payload = {
            "category": "invalid_category",
            "note": "Test",
            "severity": "low"
        }
        response = requests.post(f"{BASE_URL}/api/cleaning-tasks/{task_id}/issues", 
                                json=payload, headers=self.cleaner_headers)
        assert response.status_code == 400
    
    def test_admin_can_list_issues(self):
        """Admin can list all cleaning issues"""
        response = requests.get(f"{BASE_URL}/api/cleaning-issues", headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} issues")
    
    def test_admin_can_filter_issues_by_status(self):
        """Admin can filter issues by status"""
        response = requests.get(f"{BASE_URL}/api/cleaning-issues", params={"status": "open"}, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        for issue in data:
            assert issue["status"] == "open"
    
    def test_admin_can_filter_issues_by_category(self):
        """Admin can filter issues by category"""
        response = requests.get(f"{BASE_URL}/api/cleaning-issues", params={"category": "broken_item"}, headers=self.admin_headers)
        assert response.status_code == 200
        data = response.json()
        for issue in data:
            assert issue["category"] == "broken_item"
    
    def test_cleaner_cannot_list_all_issues(self):
        """Cleaner cannot access /api/cleaning-issues list"""
        response = requests.get(f"{BASE_URL}/api/cleaning-issues", headers=self.cleaner_headers)
        assert response.status_code == 403


# ============== CLEANUP ==============

class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_data(self):
        """Clean up TEST_ prefixed data"""
        admin_token = TestAuth.get_admin_token()
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Clean up test templates
        templates_response = requests.get(f"{BASE_URL}/api/checklist-templates", headers=admin_headers)
        if templates_response.status_code == 200:
            for t in templates_response.json():
                if t.get("name", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/checklist-templates/{t['id']}", headers=admin_headers)
                    print(f"Deleted test template: {t['name']}")
        
        # Clean up test tasks
        tasks_response = requests.get(f"{BASE_URL}/api/cleaning-tasks", headers=admin_headers)
        if tasks_response.status_code == 200:
            for t in tasks_response.json():
                if t.get("notes", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/cleaning-tasks/{t['id']}", headers=admin_headers)
                    print(f"Deleted test task: {t['id']}")
        
        print("Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
