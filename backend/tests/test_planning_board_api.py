from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Kilolava Planning Board API Tests - Property-Based Calendar
Tests for Events API with date range queries and multi-day events:
- GET /api/events?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD - date range query
- POST /api/events - create multi-day booking events with sources
- PUT /api/events/{id} - update event status and operator
- DELETE /api/events/{id} - delete event
- Verify color coding sources (airbnb, booking_com, direct)
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

# Test week dates (week of 2026-03-23)
WEEK_START = "2026-03-23"
WEEK_END = "2026-03-29"


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
    response = requests.get(f"{API_URL}/structures", headers=auth_headers)
    if response.status_code == 200 and len(response.json()) > 0:
        return response.json()[0]
    
    # Create a test client and structure if none exist
    unique_id = str(uuid.uuid4())[:8]
    client_data = {
        "client_type": "private",
        "private_info": {"name": f"TEST_PlanningClient_{unique_id}", "surname": "Test"}
    }
    client_response = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
    client_id = client_response.json()["id"]
    
    structure_data = {
        "client_id": client_id,
        "name": f"TEST_PlanningStructure_{unique_id}",
        "structure_type": "apartment",
        "services": ["cleaning"]
    }
    structure_response = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
    return structure_response.json()


class TestDateRangeQuery:
    """Test Events date range query (date_from/date_to)"""
    
    def test_get_events_date_range(self, auth_headers):
        """GET /api/events?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD works"""
        response = requests.get(
            f"{API_URL}/events?date_from={WEEK_START}&date_to={WEEK_END}",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Should return events that overlap with the date range
        print(f"✅ Date range query returned {len(data)} events for {WEEK_START} to {WEEK_END}")
        
        # Verify events have required fields
        for event in data:
            assert "id" in event
            assert "event_type" in event
            assert "title" in event
            assert "structure_id" in event
            assert "start_time" in event
            assert "end_time" in event
            assert "status" in event
    
    def test_date_range_includes_multi_day_events(self, auth_headers):
        """Date range query includes events that span multiple days"""
        response = requests.get(
            f"{API_URL}/events?date_from={WEEK_START}&date_to={WEEK_END}",
            headers=auth_headers
        )
        data = response.json()
        
        # Find multi-day events (end_time date > start_time date)
        multi_day_events = []
        for ev in data:
            start_date = ev["start_time"][:10]
            end_date = ev["end_time"][:10]
            if start_date != end_date:
                multi_day_events.append(ev)
        
        print(f"✅ Found {len(multi_day_events)} multi-day events in date range")
        
        # Verify multi-day events have correct structure
        for ev in multi_day_events:
            assert ev["event_type"] == "booking", "Multi-day events should be bookings"
            print(f"   - {ev['title']}: {ev['start_time'][:10]} to {ev['end_time'][:10]}")
    
    def test_date_range_includes_events_starting_before(self, auth_headers, test_structure):
        """Events starting before range but ending within should be included"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create event starting before week but ending within
        event_data = {
            "event_type": "booking",
            "title": f"TEST_SpanBefore_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-20T14:00:00",  # Before week start
            "end_time": "2026-03-25T10:00:00",    # Within week
            "status": "pending",
            "source": "direct"
        }
        
        create_response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert create_response.status_code == 200
        event_id = create_response.json()["id"]
        
        try:
            # Query the week range
            response = requests.get(
                f"{API_URL}/events?date_from={WEEK_START}&date_to={WEEK_END}",
                headers=auth_headers
            )
            data = response.json()
            
            # Find our event
            found = any(ev["id"] == event_id for ev in data)
            assert found, "Event starting before range but ending within should be included"
            print("✅ Event spanning into range from before is included")
        finally:
            requests.delete(f"{API_URL}/events/{event_id}", headers=auth_headers)
    
    def test_date_range_includes_events_ending_after(self, auth_headers, test_structure):
        """Events starting within range but ending after should be included"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Create event starting within week but ending after
        event_data = {
            "event_type": "booking",
            "title": f"TEST_SpanAfter_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-27T14:00:00",  # Within week
            "end_time": "2026-04-02T10:00:00",    # After week end
            "status": "pending",
            "source": "booking_com"
        }
        
        create_response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert create_response.status_code == 200
        event_id = create_response.json()["id"]
        
        try:
            # Query the week range
            response = requests.get(
                f"{API_URL}/events?date_from={WEEK_START}&date_to={WEEK_END}",
                headers=auth_headers
            )
            data = response.json()
            
            # Find our event
            found = any(ev["id"] == event_id for ev in data)
            assert found, "Event starting within range but ending after should be included"
            print("✅ Event spanning out of range is included")
        finally:
            requests.delete(f"{API_URL}/events/{event_id}", headers=auth_headers)


class TestBookingSources:
    """Test booking events with different sources for color coding"""
    
    def test_create_airbnb_booking(self, auth_headers, test_structure):
        """Create booking with airbnb source (should be red/rose)"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "booking",
            "title": f"TEST_Airbnb_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{WEEK_START}T15:00:00",
            "end_time": "2026-03-25T10:00:00",
            "status": "pending",
            "source": "airbnb"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["source"] == "airbnb"
        assert data["event_type"] == "booking"
        print(f"✅ Created Airbnb booking: {data['title']} (source: {data['source']})")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_booking_com_booking(self, auth_headers, test_structure):
        """Create booking with booking_com source (should be blue)"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "booking",
            "title": f"TEST_BookingCom_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{WEEK_START}T15:00:00",
            "end_time": "2026-03-26T10:00:00",
            "status": "pending",
            "source": "booking_com"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["source"] == "booking_com"
        print(f"✅ Created Booking.com booking: {data['title']} (source: {data['source']})")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_direct_booking(self, auth_headers, test_structure):
        """Create booking with direct source (should be gray)"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "booking",
            "title": f"TEST_Direct_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": f"{WEEK_START}T15:00:00",
            "end_time": "2026-03-24T10:00:00",
            "status": "pending",
            "source": "direct"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["source"] == "direct"
        print(f"✅ Created Direct booking: {data['title']} (source: {data['source']})")
        
        # Cleanup
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)


class TestEventTypeColors:
    """Test different event types for color coding"""
    
    def test_create_cleaning_event(self, auth_headers, test_structure):
        """Create cleaning event (should be green)"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_Cleaning_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-24T09:00:00",
            "end_time": "2026-03-24T11:00:00",
            "status": "pending"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "cleaning"
        print(f"✅ Created cleaning event (green): {data['title']}")
        
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_maintenance_event(self, auth_headers, test_structure):
        """Create maintenance event (should be orange)"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "maintenance",
            "title": f"TEST_Maintenance_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-24T14:00:00",
            "end_time": "2026-03-24T16:00:00",
            "status": "pending"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "maintenance"
        print(f"✅ Created maintenance event (orange): {data['title']}")
        
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_delivery_event(self, auth_headers, test_structure):
        """Create delivery event (should be blue - logistics)"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "delivery",
            "title": f"TEST_Delivery_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-24T08:00:00",
            "end_time": "2026-03-24T09:00:00",
            "status": "pending"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "delivery"
        print(f"✅ Created delivery event (blue): {data['title']}")
        
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)
    
    def test_create_pickup_event(self, auth_headers, test_structure):
        """Create pickup event (should be blue - logistics)"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "pickup",
            "title": f"TEST_Pickup_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-24T17:00:00",
            "end_time": "2026-03-24T18:00:00",
            "status": "pending"
        }
        
        response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        assert response.status_code == 200
        
        data = response.json()
        assert data["event_type"] == "pickup"
        print(f"✅ Created pickup event (blue): {data['title']}")
        
        requests.delete(f"{API_URL}/events/{data['id']}", headers=auth_headers)


class TestEventUpdateAndDelete:
    """Test event update and delete operations"""
    
    def test_update_event_status(self, auth_headers, test_structure):
        """PUT /api/events/{id} - update event status"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_UpdateStatus_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-24T09:00:00",
            "end_time": "2026-03-24T11:00:00",
            "status": "pending"
        }
        
        create_response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        event_id = create_response.json()["id"]
        
        try:
            # Update status
            update_response = requests.put(
                f"{API_URL}/events/{event_id}",
                json={"status": "in_progress"},
                headers=auth_headers
            )
            assert update_response.status_code == 200
            assert update_response.json()["status"] == "in_progress"
            
            # Verify with GET
            get_response = requests.get(f"{API_URL}/events/{event_id}", headers=auth_headers)
            assert get_response.json()["status"] == "in_progress"
            
            print(f"✅ Updated event status to in_progress")
        finally:
            requests.delete(f"{API_URL}/events/{event_id}", headers=auth_headers)
    
    def test_update_event_operator(self, auth_headers, test_structure):
        """PUT /api/events/{id} - update event operator"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_UpdateOperator_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-24T09:00:00",
            "end_time": "2026-03-24T11:00:00",
            "status": "pending"
        }
        
        create_response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        event_id = create_response.json()["id"]
        
        try:
            # Update operator
            update_response = requests.put(
                f"{API_URL}/events/{event_id}",
                json={"assigned_operator": "Marco Rossi", "status": "assigned"},
                headers=auth_headers
            )
            assert update_response.status_code == 200
            assert update_response.json()["assigned_operator"] == "Marco Rossi"
            assert update_response.json()["status"] == "assigned"
            
            print(f"✅ Updated event operator to Marco Rossi")
        finally:
            requests.delete(f"{API_URL}/events/{event_id}", headers=auth_headers)
    
    def test_delete_event(self, auth_headers, test_structure):
        """DELETE /api/events/{id} - delete event"""
        unique_id = str(uuid.uuid4())[:8]
        event_data = {
            "event_type": "cleaning",
            "title": f"TEST_Delete_{unique_id}",
            "structure_id": test_structure["id"],
            "start_time": "2026-03-24T09:00:00",
            "end_time": "2026-03-24T11:00:00",
            "status": "pending"
        }
        
        create_response = requests.post(f"{API_URL}/events", json=event_data, headers=auth_headers)
        event_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{API_URL}/events/{event_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = requests.get(f"{API_URL}/events/{event_id}", headers=auth_headers)
        assert get_response.status_code == 404
        
        print(f"✅ Deleted event and verified removal")


class TestCleanup:
    """Cleanup test events"""
    
    def test_cleanup_test_events(self, auth_headers):
        """Clean up all TEST_ prefixed events"""
        response = requests.get(
            f"{API_URL}/events?date_from=2026-03-01&date_to=2026-04-30",
            headers=auth_headers
        )
        events = response.json()
        
        deleted_count = 0
        for event in events:
            if event["title"].startswith("TEST_"):
                requests.delete(f"{API_URL}/events/{event['id']}", headers=auth_headers)
                deleted_count += 1
        
        print(f"✅ Cleaned up {deleted_count} test events")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
