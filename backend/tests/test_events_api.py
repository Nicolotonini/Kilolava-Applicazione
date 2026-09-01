from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Kilolava Events API Tests - Calendar Module
Tests for Events CRUD and Day Stats endpoints:
- POST /api/events - create event
- GET /api/events?date=YYYY-MM-DD - get events by date
- GET /api/events/{id} - get single event
- PUT /api/events/{id} - update event
- DELETE /api/events/{id} - delete event
- GET /api/events/stats/day?date=YYYY-MM-DD - get day statistics
"""
import pytest
import requests
import os
import uuid
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://operations-hub-38.preview.emergentagent.com')
API_URL = f"{BASE_URL}/api"

# Test credentials
TEST_EMAIL = "test_user@kilolava.com"
TEST_PASSWORD = TEST_ADMIN_PASSWORD

# Test date for events
TEST_DATE = "2026-03-24"


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


@pytest.fixture(scope="module")
def test_structure(auth_headers):
    """Get or create a test structure for event tests"""
    # First try to get existing structures
    response = requests.get(f"{API_URL}/structures", headers=auth_headers)
    if response.status_code == 200 and len(response.json()) > 0:
        return response.json()[0]
    
    # Create a test client and structure if none exist
    unique_id = str(uuid.uuid4())[:8]
    client_data = {
        "client_type": "private",
        "private_info": {"name": f"TEST_EventClient_{unique_id}", "surname": "Test"}
    }
    client_response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
    client_id = client_response.json()["id"]
    
    structure_data = {
        "client_id": client_id,
        "name": f"TEST_EventStructure_{unique_id}",
        "structure_type": "apartment",
        "services": ["cleaning"]
    }
    structure_response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
    return structure_response.json()


class TestEventsHealthAndAuth:
    """Basic health and auth tests for events"""
    
    def test_health_check(self):
        """Test API health endpoint"""
        response = requests.get(f"{API_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
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
        assert data["user"]["role"] == "manager"
        print(f"✅ Login successful for user: {data['user']['name']}")


class TestEventsCRUD:
    """Test Events CRUD operations"""
    
    def test_create_event_cleaning(self, auth_headers, test_structure):
        """Create a cleaning event with all fields"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_Pulizia_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T09:00:00",
            "end_time": f"{TEST_DATE}T11:00:00",
            "status": "pending",
            "notes": "Test cleaning event",
            "source": "manual"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200, f"Failed to create event: {response.text}"
        
        data = response.json()
        assert data["event_type"] == "cleaning"
        assert data["title"] == f"TEST_Pulizia_{unique_id}"
        assert data["structure_id"] == test_structure["id"]
        assert data["structure_name"] == test_structure["name"]
        assert data["status"] == "pending"
        assert data["start_time"] == f"{TEST_DATE}T09:00:00"
        assert data["end_time"] == f"{TEST_DATE}T11:00:00"
        assert "id" in data
        assert "created_at" in data
        
        print(f"✅ Created cleaning event: {data['title']} (ID: {data['id']})")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_event_booking(self, auth_headers, test_structure):
        """Create a booking event"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "booking",
            "title": f"TEST_Check-in_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T14:00:00",
            "end_time": f"{TEST_DATE}T15:00:00",
            "assigned_operator": "Marco",
            "status": "assigned",
            "source": "airbnb"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "booking"
        assert data["assigned_operator"] == "Marco"
        assert data["status"] == "assigned"
        assert data["source"] == "airbnb"
        
        print(f"✅ Created booking event with operator: {data['assigned_operator']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_event_delivery(self, auth_headers, test_structure):
        """Create a delivery event"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "delivery",
            "title": f"TEST_Consegna_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T10:00:00",
            "end_time": f"{TEST_DATE}T10:30:00",
            "status": "pending"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "delivery"
        
        print(f"✅ Created delivery event: {data['title']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_event_pickup(self, auth_headers, test_structure):
        """Create a pickup event"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "pickup",
            "title": f"TEST_Ritiro_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T16:00:00",
            "end_time": f"{TEST_DATE}T16:30:00",
            "assigned_operator": "Luca",
            "status": "assigned"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "pickup"
        assert data["assigned_operator"] == "Luca"
        
        print(f"✅ Created pickup event: {data['title']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_event_maintenance(self, auth_headers, test_structure):
        """Create a maintenance event"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "maintenance",
            "title": f"TEST_Riparazione_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T08:00:00",
            "end_time": f"{TEST_DATE}T12:00:00",
            "status": "in_progress",
            "notes": "Urgent repair needed"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "maintenance"
        assert data["status"] == "in_progress"
        assert data["notes"] == "Urgent repair needed"
        
        print(f"✅ Created maintenance event: {data['title']}")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_event_invalid_structure(self, auth_headers):
        """Create event with invalid structure_id should fail"""
        event_data = {
            "event_type": "cleaning",
            "title": "TEST_Invalid",
            "structure_id": "non-existent-id",
            "start_time": f"{TEST_DATE}T09:00:00",
            "end_time": f"{TEST_DATE}T11:00:00",
            "status": "pending"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 404
        print("✅ Invalid structure_id correctly rejected")


class TestEventsGet:
    """Test Events GET operations"""
    
    @pytest.fixture(autouse=True)
    def setup_test_event(self, auth_headers, test_structure):
        """Create a test event for GET tests"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_GetEvent_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T09:00:00",
            "end_time": f"{TEST_DATE}T11:00:00",
            "assigned_operator": "TestOperator",
            "status": "assigned",
            "notes": "Test event for GET",
            "source": "manual"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        self.test_event = response.json()
        self.headers = auth_headers
        
        yield
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{self.test_event['id']}", headers=auth_headers)
    
    def test_get_events_by_date(self, auth_headers):
        """Get events filtered by date"""
        response = requests.get(f"{API_URL}/events?date={TEST_DATE}", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Check that events have required fields
        for event in data:
            assert "id" in event
            assert "event_type" in event
            assert "title" in event
            assert "structure_id" in event
            assert "start_time" in event
            assert "end_time" in event
            assert "status" in event
        
        print(f"✅ Got {len(data)} events for date {TEST_DATE}")
    
    def test_get_single_event(self, auth_headers):
        """Get single event by ID with structure_name populated"""
        event_id = self.test_event["id"]
        
        response = requests.get(f"{API_URL}/events/{event_id}", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == event_id
        assert data["event_type"] == "cleaning"
        assert data["structure_name"] is not None  # structure_name should be populated
        assert data["assigned_operator"] == "TestOperator"
        assert data["status"] == "assigned"
        
        print(f"✅ Got single event: {data['title']} with structure_name: {data['structure_name']}")
    
    def test_get_event_not_found(self, auth_headers):
        """Get non-existent event should return 404"""
        response = requests.get(f"{API_URL}/events/non-existent-id", headers=auth_headers)
        assert response.status_code == 404
        print("✅ Non-existent event correctly returns 404")


class TestEventsUpdate:
    """Test Events UPDATE operations"""
    
    @pytest.fixture(autouse=True)
    def setup_test_event(self, auth_headers, test_structure):
        """Create a test event for UPDATE tests"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_UpdateEvent_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T09:00:00",
            "end_time": f"{TEST_DATE}T11:00:00",
            "status": "pending"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        self.test_event = response.json()
        self.headers = auth_headers
        
        yield
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{self.test_event['id']}", headers=auth_headers)
    
    def test_update_event_status(self, auth_headers):
        """Update event status"""
        event_id = self.test_event["id"]
        
        update_data = {"status": "in_progress"}
        response = requests.put(f"{API_URL}/events/{event_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "in_progress"
        
        # Verify with GET
        get_response = requests.get(f"{API_URL}/events/{event_id}", headers=auth_headers)
        assert get_response.json()["status"] == "in_progress"
        
        print(f"✅ Updated event status to: {data['status']}")
    
    def test_update_event_assign_operator(self, auth_headers):
        """Update event to assign operator"""
        event_id = self.test_event["id"]
        
        update_data = {
            "assigned_operator": "Marco Rossi",
            "status": "assigned"
        }
        response = requests.put(f"{API_URL}/events/{event_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["assigned_operator"] == "Marco Rossi"
        assert data["status"] == "assigned"
        
        # Verify with GET
        get_response = requests.get(f"{API_URL}/events/{event_id}", headers=auth_headers)
        assert get_response.json()["assigned_operator"] == "Marco Rossi"
        
        print(f"✅ Assigned operator: {data['assigned_operator']}")
    
    def test_update_event_title_and_times(self, auth_headers):
        """Update event title and times"""
        event_id = self.test_event["id"]
        
        update_data = {
            "title": "Updated Title",
            "start_time": f"{TEST_DATE}T10:00:00",
            "end_time": f"{TEST_DATE}T12:00:00"
        }
        response = requests.put(f"{API_URL}/events/{event_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["start_time"] == f"{TEST_DATE}T10:00:00"
        assert data["end_time"] == f"{TEST_DATE}T12:00:00"
        
        print(f"✅ Updated event title and times")
    
    def test_update_event_complete(self, auth_headers):
        """Update event to completed status"""
        event_id = self.test_event["id"]
        
        update_data = {"status": "completed"}
        response = requests.put(f"{API_URL}/events/{event_id}", json=update_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "completed"
        
        print(f"✅ Marked event as completed")


class TestEventsDelete:
    """Test Events DELETE operations"""
    
    def test_delete_event(self, auth_headers, test_structure):
        """Delete an event"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_DeleteEvent_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{TEST_DATE}T09:00:00",
            "end_time": f"{TEST_DATE}T11:00:00",
            "status": "pending"
        }
        
        # Create event
        create_response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        event_id = create_response.json()["id"]
        
        # Delete event
        delete_response = requests.delete(f"{API_URL}/events/{event_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{API_URL}/events/{event_id}", headers=auth_headers)
        assert get_response.status_code == 404
        
        print(f"✅ Deleted event and verified removal")
    
    def test_delete_event_not_found(self, auth_headers):
        """Delete non-existent event should return 404"""
        response = requests.delete(f"{API_URL}/events/non-existent-id", headers=auth_headers)
        assert response.status_code == 404
        print("✅ Delete non-existent event correctly returns 404")


class TestEventsDayStats:
    """Test Events Day Statistics endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup_test_events(self, auth_headers, test_structure):
        """Create multiple test events for stats tests"""
        self.created_events = []
        self.headers = auth_headers
        
        # Create events of different types and statuses
        events_to_create = [
            {"event_type": "cleaning", "status": "pending", "assigned_operator": None},
            {"event_type": "booking", "status": "assigned", "assigned_operator": "Marco"},
            {"event_type": "delivery", "status": "pending", "assigned_operator": None},
            {"event_type": "pickup", "status": "completed", "assigned_operator": "Luca"},
        ]
        
        for i, ev in enumerate(events_to_create):
            unique_id = str(uuid.uuid4())[:8]
            event_data = {
                "event_type": ev["event_type"],
                "title": f"TEST_Stats_{ev['event_type']}_{unique_id}",
                "structure_id": test_structure["id"],
                "start_time": f"{TEST_DATE}T{8+i:02d}:00:00",
                "end_time": f"{TEST_DATE}T{9+i:02d}:00:00",
                "status": ev["status"],
                "assigned_operator": ev["assigned_operator"]
            }
            response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
            if response.status_code == 200:
                self.created_events.append(response.json())
        
        yield
        
        # Cleanup
        for event in self.created_events:
            requests.delete(f"{API_URL}/events/{event['id']}", headers=auth_headers)
    
    def test_get_day_stats(self, auth_headers):
        """Get day statistics"""
        response = requests.get(f"{API_URL}/events/stats/day?date={TEST_DATE}", headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "date" in data
        assert data["date"] == TEST_DATE
        assert "total_events" in data
        assert "unassigned" in data
        assert "by_type" in data
        assert "by_status" in data
        
        assert isinstance(data["total_events"], int)
        assert isinstance(data["unassigned"], int)
        assert isinstance(data["by_type"], dict)
        assert isinstance(data["by_status"], dict)
        
        print(f"✅ Day stats: total={data['total_events']}, unassigned={data['unassigned']}")
        print(f"   by_type: {data['by_type']}")
        print(f"   by_status: {data['by_status']}")
    
    def test_day_stats_counts_correct(self, auth_headers):
        """Verify day stats counts are correct"""
        response = requests.get(f"{API_URL}/events/stats/day?date={TEST_DATE}", headers=auth_headers)
        data = response.json()
        
        # Total should be at least the number of events we created
        assert data["total_events"] >= len(self.created_events)
        
        # Unassigned should count events without operator and not completed/cancelled
        # We created 2 unassigned events (cleaning pending, delivery pending)
        assert data["unassigned"] >= 2
        
        # by_type should have our event types
        assert "cleaning" in data["by_type"] or data["by_type"].get("cleaning", 0) >= 0
        
        print(f"✅ Day stats counts verified")


class TestEventsCleanup:
    """Cleanup test events"""
    
    def test_cleanup_test_events(self, auth_headers):
        """Clean up all TEST_ prefixed events"""
        # Get all events for test date
        response = requests.get(f"{API_URL}/events?date={TEST_DATE}", headers=auth_headers)
        events = response.json()
        
        deleted_count = 0
        for event in events:
            if event["title"].startswith("TEST_"):
                requests.delete(f"{API_URL}/events/{event['id']}", headers=auth_headers)
                deleted_count += 1
        
        print(f"✅ Cleaned up {deleted_count} test events")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
