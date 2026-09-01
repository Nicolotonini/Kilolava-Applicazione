from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Logistics Module API Tests
Tests for: Tasks CRUD, Assignment, Status Updates, Photo Upload, Day Summary, Riders CRUD, My-Tasks, Bulk Reorder
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
MANAGER_EMAIL = "test_user@kilolava.com"
MANAGER_PASSWORD = TEST_ADMIN_PASSWORD
RIDER_EMAIL = "rider1@kilolava.com"
RIDER_PASSWORD = "Rider123!"

# Test date for logistics tasks
TEST_DATE = "2026-03-24"


class TestLogisticsSetup:
    """Setup and authentication tests"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        """Get manager authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200, f"Manager login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def rider_token(self):
        """Get rider authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Rider login failed: {response.text}")
        return response.json()["access_token"]
    
    def test_manager_login(self, manager_token):
        """Test manager can login"""
        assert manager_token is not None
        print(f"Manager token obtained: {manager_token[:20]}...")
    
    def test_rider_login(self, rider_token):
        """Test rider can login"""
        assert rider_token is not None
        print(f"Rider token obtained: {rider_token[:20]}...")


class TestLogisticsTasks:
    """Logistics Tasks CRUD tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def created_task_id(self, auth_headers):
        """Create a test task and return its ID"""
        task_data = {
            "task_type": "delivery",
            "date": TEST_DATE,
            "address": "Via Test 123, Roma",
            "latitude": 41.9028,
            "longitude": 12.4964,
            "time_window_start": "09:00",
            "time_window_end": "12:00",
            "notes": "TEST_logistics_task",
            "items": [{"article_id": "", "quantity": 2, "item_type": "deliver"}],
            "source": "manual"
        }
        response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        assert response.status_code == 200, f"Create task failed: {response.text}"
        task = response.json()
        print(f"Created test task: {task['id']}")
        return task["id"]
    
    def test_get_tasks_list(self, auth_headers):
        """Test GET /api/logistics/tasks - list all tasks"""
        response = requests.get(f"{BASE_URL}/api/logistics/tasks", headers=auth_headers)
        assert response.status_code == 200
        tasks = response.json()
        assert isinstance(tasks, list)
        print(f"Found {len(tasks)} logistics tasks")
    
    def test_get_tasks_by_date(self, auth_headers):
        """Test GET /api/logistics/tasks?date=YYYY-MM-DD - filter by date"""
        response = requests.get(f"{BASE_URL}/api/logistics/tasks", params={"date": TEST_DATE}, headers=auth_headers)
        assert response.status_code == 200
        tasks = response.json()
        assert isinstance(tasks, list)
        # All returned tasks should have the specified date
        for task in tasks:
            assert task["date"] == TEST_DATE
        print(f"Found {len(tasks)} tasks for date {TEST_DATE}")
    
    def test_create_task_delivery(self, auth_headers):
        """Test POST /api/logistics/tasks - create delivery task"""
        task_data = {
            "task_type": "delivery",
            "date": TEST_DATE,
            "address": "Via Nuova 456, Milano",
            "latitude": 45.4642,
            "longitude": 9.1900,
            "time_window_start": "14:00",
            "time_window_end": "17:00",
            "notes": "TEST_delivery_task",
            "items": [{"article_id": "", "quantity": 3, "item_type": "deliver"}],
            "source": "manual"
        }
        response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        assert response.status_code == 200
        task = response.json()
        
        # Verify response structure
        assert "id" in task
        assert task["task_type"] == "delivery"
        assert task["date"] == TEST_DATE
        assert task["status"] == "unassigned"  # No rider assigned
        assert task["address"] == "Via Nuova 456, Milano"
        assert task["latitude"] == 45.4642
        assert task["longitude"] == 9.1900
        print(f"Created delivery task: {task['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task['id']}", headers=auth_headers)
    
    def test_create_task_pickup(self, auth_headers):
        """Test POST /api/logistics/tasks - create pickup task"""
        task_data = {
            "task_type": "pickup",
            "date": TEST_DATE,
            "address": "Via Ritiro 789, Napoli",
            "notes": "TEST_pickup_task",
            "items": [{"article_id": "", "quantity": 5, "item_type": "pickup"}],
            "source": "manual"
        }
        response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        assert response.status_code == 200
        task = response.json()
        
        assert task["task_type"] == "pickup"
        assert task["status"] == "unassigned"
        print(f"Created pickup task: {task['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task['id']}", headers=auth_headers)
    
    def test_create_task_mixed(self, auth_headers):
        """Test POST /api/logistics/tasks - create mixed task"""
        task_data = {
            "task_type": "mixed",
            "date": TEST_DATE,
            "address": "Via Mista 101, Torino",
            "notes": "TEST_mixed_task",
            "items": [
                {"article_id": "", "quantity": 2, "item_type": "deliver"},
                {"article_id": "", "quantity": 3, "item_type": "pickup"}
            ],
            "source": "manual"
        }
        response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        assert response.status_code == 200
        task = response.json()
        
        assert task["task_type"] == "mixed"
        assert len(task["items"]) == 2
        print(f"Created mixed task: {task['id']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task['id']}", headers=auth_headers)
    
    def test_update_task(self, auth_headers, created_task_id):
        """Test PUT /api/logistics/tasks/{id} - update task"""
        update_data = {
            "notes": "TEST_updated_notes",
            "time_window_start": "10:00",
            "time_window_end": "13:00"
        }
        response = requests.put(f"{BASE_URL}/api/logistics/tasks/{created_task_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        task = response.json()
        
        assert task["notes"] == "TEST_updated_notes"
        assert task["time_window_start"] == "10:00"
        assert task["time_window_end"] == "13:00"
        print(f"Updated task: {created_task_id}")
    
    def test_delete_task(self, auth_headers):
        """Test DELETE /api/logistics/tasks/{id} - delete task"""
        # Create a task to delete
        task_data = {
            "task_type": "delivery",
            "date": TEST_DATE,
            "address": "Via Delete 999",
            "notes": "TEST_to_delete"
        }
        create_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Delete the task
        delete_response = requests.delete(f"{BASE_URL}/api/logistics/tasks/{task_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/logistics/tasks", params={"date": TEST_DATE}, headers=auth_headers)
        tasks = get_response.json()
        task_ids = [t["id"] for t in tasks]
        assert task_id not in task_ids
        print(f"Deleted task: {task_id}")


class TestTaskAssignment:
    """Task assignment tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def rider_id(self, auth_headers):
        """Get a rider ID for assignment tests"""
        response = requests.get(f"{BASE_URL}/api/logistics/riders", headers=auth_headers)
        assert response.status_code == 200
        riders = response.json()
        if not riders:
            pytest.skip("No riders available for assignment tests")
        return riders[0]["id"]
    
    def test_assign_task(self, auth_headers, rider_id):
        """Test PUT /api/logistics/tasks/{id}/assign - assign task to rider"""
        # Create a task
        task_data = {
            "task_type": "delivery",
            "date": TEST_DATE,
            "address": "Via Assign 123",
            "notes": "TEST_assign_task"
        }
        create_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Assign to rider
        assign_response = requests.put(
            f"{BASE_URL}/api/logistics/tasks/{task_id}/assign",
            json={"rider_id": rider_id},
            headers=auth_headers
        )
        assert assign_response.status_code == 200
        task = assign_response.json()
        
        assert task["rider_id"] == rider_id
        assert task["status"] == "assigned"
        assert task["rider_name"] is not None
        print(f"Assigned task {task_id} to rider {rider_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task_id}", headers=auth_headers)
    
    def test_assign_with_route_order(self, auth_headers, rider_id):
        """Test assignment with route order"""
        # Create a task
        task_data = {
            "task_type": "pickup",
            "date": TEST_DATE,
            "address": "Via Route 456",
            "notes": "TEST_route_order"
        }
        create_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        assert create_response.status_code == 200
        task_id = create_response.json()["id"]
        
        # Assign with route order
        assign_response = requests.put(
            f"{BASE_URL}/api/logistics/tasks/{task_id}/assign",
            json={"rider_id": rider_id, "route_order": 5},
            headers=auth_headers
        )
        assert assign_response.status_code == 200
        task = assign_response.json()
        
        assert task["route_order"] == 5
        print(f"Assigned task with route_order=5")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task_id}", headers=auth_headers)


class TestTaskStatus:
    """Task status update tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    @pytest.fixture(scope="class")
    def rider_id(self, auth_headers):
        """Get a rider ID"""
        response = requests.get(f"{BASE_URL}/api/logistics/riders", headers=auth_headers)
        assert response.status_code == 200
        riders = response.json()
        if not riders:
            pytest.skip("No riders available")
        return riders[0]["id"]
    
    def test_status_in_progress(self, auth_headers, rider_id):
        """Test PUT /api/logistics/tasks/{id}/status - set in_progress"""
        # Create and assign task
        task_data = {"task_type": "delivery", "date": TEST_DATE, "address": "Via Status 1", "notes": "TEST_status"}
        create_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        task_id = create_response.json()["id"]
        requests.put(f"{BASE_URL}/api/logistics/tasks/{task_id}/assign", json={"rider_id": rider_id}, headers=auth_headers)
        
        # Update status to in_progress
        status_response = requests.put(
            f"{BASE_URL}/api/logistics/tasks/{task_id}/status",
            json={"status": "in_progress"},
            headers=auth_headers
        )
        assert status_response.status_code == 200
        task = status_response.json()
        
        assert task["status"] == "in_progress"
        assert task["started_at"] is not None
        print(f"Task status updated to in_progress")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task_id}", headers=auth_headers)
    
    def test_status_completed(self, auth_headers, rider_id):
        """Test PUT /api/logistics/tasks/{id}/status - set completed with notes"""
        # Create and assign task
        task_data = {"task_type": "delivery", "date": TEST_DATE, "address": "Via Complete 2", "notes": "TEST_complete"}
        create_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        task_id = create_response.json()["id"]
        requests.put(f"{BASE_URL}/api/logistics/tasks/{task_id}/assign", json={"rider_id": rider_id}, headers=auth_headers)
        requests.put(f"{BASE_URL}/api/logistics/tasks/{task_id}/status", json={"status": "in_progress"}, headers=auth_headers)
        
        # Complete with notes
        status_response = requests.put(
            f"{BASE_URL}/api/logistics/tasks/{task_id}/status",
            json={"status": "completed", "completion_notes": "Consegnato al portiere"},
            headers=auth_headers
        )
        assert status_response.status_code == 200
        task = status_response.json()
        
        assert task["status"] == "completed"
        assert task["completed_at"] is not None
        assert task["completion_notes"] == "Consegnato al portiere"
        print(f"Task completed with notes")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task_id}", headers=auth_headers)
    
    def test_status_problem(self, auth_headers, rider_id):
        """Test PUT /api/logistics/tasks/{id}/status - report problem"""
        # Create and assign task
        task_data = {"task_type": "delivery", "date": TEST_DATE, "address": "Via Problem 3", "notes": "TEST_problem"}
        create_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json=task_data, headers=auth_headers)
        task_id = create_response.json()["id"]
        requests.put(f"{BASE_URL}/api/logistics/tasks/{task_id}/assign", json={"rider_id": rider_id}, headers=auth_headers)
        
        # Report problem
        status_response = requests.put(
            f"{BASE_URL}/api/logistics/tasks/{task_id}/status",
            json={"status": "problem", "problem_notes": "Indirizzo non trovato"},
            headers=auth_headers
        )
        assert status_response.status_code == 200
        task = status_response.json()
        
        assert task["status"] == "problem"
        assert task["problem_notes"] == "Indirizzo non trovato"
        print(f"Task problem reported")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task_id}", headers=auth_headers)


class TestDaySummary:
    """Day summary tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_day_summary(self, auth_headers):
        """Test GET /api/logistics/day-summary - get day summary"""
        response = requests.get(
            f"{BASE_URL}/api/logistics/day-summary",
            params={"date": TEST_DATE},
            headers=auth_headers
        )
        assert response.status_code == 200
        summary = response.json()
        
        assert "date" in summary
        assert summary["date"] == TEST_DATE
        assert "total_tasks" in summary
        assert "by_status" in summary
        assert "by_rider" in summary
        assert isinstance(summary["by_status"], dict)
        assert isinstance(summary["by_rider"], list)
        print(f"Day summary: {summary['total_tasks']} tasks, statuses: {summary['by_status']}")


class TestRiders:
    """Riders CRUD tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_riders(self, auth_headers):
        """Test GET /api/logistics/riders - list all riders"""
        response = requests.get(f"{BASE_URL}/api/logistics/riders", headers=auth_headers)
        assert response.status_code == 200
        riders = response.json()
        assert isinstance(riders, list)
        
        # Verify rider structure
        if riders:
            rider = riders[0]
            assert "id" in rider
            assert "name" in rider
            assert "email" in rider
            assert "active_tasks" in rider
            assert "completed_today" in rider
        print(f"Found {len(riders)} riders")
    
    def test_create_rider(self, auth_headers):
        """Test POST /api/logistics/riders - create new rider"""
        unique_email = f"test_rider_{uuid.uuid4().hex[:8]}@kilolava.com"
        rider_data = {
            "name": "TEST Rider",
            "email": unique_email,
            "password": "TestRider123!",
            "phone": "+39 333 1234567",
            "vehicle_type": "Scooter"
        }
        response = requests.post(f"{BASE_URL}/api/logistics/riders", json=rider_data, headers=auth_headers)
        assert response.status_code == 200
        rider = response.json()
        
        assert rider["name"] == "TEST Rider"
        assert rider["email"] == unique_email
        assert rider["phone"] == "+39 333 1234567"
        assert rider["vehicle_type"] == "Scooter"
        print(f"Created rider: {rider['id']}")
        
        # Cleanup - delete the rider
        requests.delete(f"{BASE_URL}/api/logistics/riders/{rider['id']}", headers=auth_headers)
    
    def test_create_rider_duplicate_email(self, auth_headers):
        """Test POST /api/logistics/riders - duplicate email should fail"""
        rider_data = {
            "name": "Duplicate Rider",
            "email": RIDER_EMAIL,  # Already exists
            "password": "TestRider123!"
        }
        response = requests.post(f"{BASE_URL}/api/logistics/riders", json=rider_data, headers=auth_headers)
        assert response.status_code == 400
        assert "già registrata" in response.json()["detail"].lower() or "already" in response.json()["detail"].lower()
        print("Duplicate email correctly rejected")
    
    def test_update_rider(self, auth_headers):
        """Test PUT /api/logistics/riders/{id} - update rider"""
        # Create a rider to update
        unique_email = f"update_rider_{uuid.uuid4().hex[:8]}@kilolava.com"
        create_response = requests.post(f"{BASE_URL}/api/logistics/riders", json={
            "name": "Update Test",
            "email": unique_email,
            "password": "TestRider123!"
        }, headers=auth_headers)
        assert create_response.status_code == 200
        rider_id = create_response.json()["id"]
        
        # Update the rider
        update_response = requests.put(
            f"{BASE_URL}/api/logistics/riders/{rider_id}",
            json={"name": "Updated Name", "vehicle_type": "Furgone"},
            headers=auth_headers
        )
        assert update_response.status_code == 200
        rider = update_response.json()
        
        assert rider["name"] == "Updated Name"
        assert rider["vehicle_type"] == "Furgone"
        print(f"Updated rider: {rider_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/riders/{rider_id}", headers=auth_headers)
    
    def test_delete_rider(self, auth_headers):
        """Test DELETE /api/logistics/riders/{id} - delete rider"""
        # Create a rider to delete
        unique_email = f"delete_rider_{uuid.uuid4().hex[:8]}@kilolava.com"
        create_response = requests.post(f"{BASE_URL}/api/logistics/riders", json={
            "name": "Delete Test",
            "email": unique_email,
            "password": "TestRider123!"
        }, headers=auth_headers)
        assert create_response.status_code == 200
        rider_id = create_response.json()["id"]
        
        # Delete the rider
        delete_response = requests.delete(f"{BASE_URL}/api/logistics/riders/{rider_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/logistics/riders", headers=auth_headers)
        riders = get_response.json()
        rider_ids = [r["id"] for r in riders]
        assert rider_id not in rider_ids
        print(f"Deleted rider: {rider_id}")


class TestMyTasks:
    """Rider's own tasks tests"""
    
    @pytest.fixture(scope="class")
    def rider_headers(self):
        """Get rider auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD
        })
        if response.status_code != 200:
            pytest.skip(f"Rider login failed: {response.text}")
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_get_my_tasks(self, rider_headers):
        """Test GET /api/logistics/my-tasks - get rider's own tasks"""
        response = requests.get(
            f"{BASE_URL}/api/logistics/my-tasks",
            params={"date": TEST_DATE},
            headers=rider_headers
        )
        assert response.status_code == 200
        tasks = response.json()
        assert isinstance(tasks, list)
        print(f"Rider has {len(tasks)} tasks for {TEST_DATE}")
    
    def test_my_tasks_default_date(self, rider_headers):
        """Test GET /api/logistics/my-tasks - default to today"""
        response = requests.get(f"{BASE_URL}/api/logistics/my-tasks", headers=rider_headers)
        assert response.status_code == 200
        tasks = response.json()
        assert isinstance(tasks, list)
        print(f"Rider has {len(tasks)} tasks for today")


class TestBulkReorder:
    """Bulk reorder tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_bulk_reorder(self, auth_headers):
        """Test PUT /api/logistics/reorder - bulk reorder tasks"""
        # Create two tasks
        task1_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json={
            "task_type": "delivery", "date": TEST_DATE, "address": "Via Reorder 1", "notes": "TEST_reorder_1"
        }, headers=auth_headers)
        task2_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json={
            "task_type": "delivery", "date": TEST_DATE, "address": "Via Reorder 2", "notes": "TEST_reorder_2"
        }, headers=auth_headers)
        
        task1_id = task1_response.json()["id"]
        task2_id = task2_response.json()["id"]
        
        # Reorder
        reorder_response = requests.put(
            f"{BASE_URL}/api/logistics/reorder",
            json={"items": [
                {"task_id": task1_id, "route_order": 10},
                {"task_id": task2_id, "route_order": 20}
            ]},
            headers=auth_headers
        )
        assert reorder_response.status_code == 200
        
        # Verify order
        tasks_response = requests.get(f"{BASE_URL}/api/logistics/tasks", params={"date": TEST_DATE}, headers=auth_headers)
        tasks = tasks_response.json()
        task1 = next((t for t in tasks if t["id"] == task1_id), None)
        task2 = next((t for t in tasks if t["id"] == task2_id), None)
        
        assert task1["route_order"] == 10
        assert task2["route_order"] == 20
        print("Bulk reorder successful")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task1_id}", headers=auth_headers)
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task2_id}", headers=auth_headers)


class TestPhotoUpload:
    """Photo upload tests"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get manager auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": MANAGER_EMAIL,
            "password": MANAGER_PASSWORD
        })
        assert response.status_code == 200
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_photo_upload(self, auth_headers):
        """Test POST /api/logistics/tasks/{id}/photo - upload confirmation photo"""
        # Create a task
        task_response = requests.post(f"{BASE_URL}/api/logistics/tasks", json={
            "task_type": "delivery", "date": TEST_DATE, "address": "Via Photo 1", "notes": "TEST_photo"
        }, headers=auth_headers)
        task_id = task_response.json()["id"]
        
        # Create a simple test image (1x1 pixel PNG)
        import base64
        # Minimal valid PNG
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )
        
        # Upload photo
        files = {"file": ("test.png", png_data, "image/png")}
        # Remove Content-Type from headers for multipart
        upload_headers = {"Authorization": auth_headers["Authorization"]}
        upload_response = requests.post(
            f"{BASE_URL}/api/logistics/tasks/{task_id}/photo",
            files=files,
            headers=upload_headers
        )
        assert upload_response.status_code == 200
        result = upload_response.json()
        assert "path" in result
        print(f"Photo uploaded: {result['path']}")
        
        # Verify task has photo
        task_get = requests.get(f"{BASE_URL}/api/logistics/tasks", params={"date": TEST_DATE}, headers=auth_headers)
        tasks = task_get.json()
        task = next((t for t in tasks if t["id"] == task_id), None)
        assert task["confirmation_photo"] is not None
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/logistics/tasks/{task_id}", headers=auth_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
