from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Test iCal Sync API endpoints for Kilolava
Tests: POST /api/ical/sync/{structure_id}, POST /api/ical/sync-all, GET /api/ical/status
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')

# Test credentials
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = TEST_ADMIN_PASSWORD

# Structure IDs from the test data
STRUCTURE_WITH_ICAL = "3d70c213-d948-47ec-9839-b5a37acc2d23"  # Appartamento Centro
STRUCTURE_WITHOUT_ICAL = "3e046175-55c0-4956-904e-f4a4d914cb22"  # Test Structure for Units


class AuthHelper:
    """Helper class to manage authentication"""
    _token = None
    
    @classmethod
    def get_token(cls):
        if cls._token is None:
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            })
            if response.status_code == 200:
                data = response.json()
                # API returns access_token, not token
                cls._token = data.get("access_token") or data.get("token")
            else:
                raise Exception(f"Authentication failed: {response.status_code} - {response.text}")
        return cls._token
    
    @classmethod
    def get_headers(cls):
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {cls.get_token()}"
        }


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    return AuthHelper.get_token()


@pytest.fixture(scope="module")
def authenticated_client():
    """Session with auth header"""
    session = requests.Session()
    session.headers.update(AuthHelper.get_headers())
    return session


class TestIcalSyncSingleStructure:
    """Tests for POST /api/ical/sync/{structure_id}"""
    
    def test_sync_structure_with_ical_url_success(self, authenticated_client):
        """Test syncing a structure that has an iCal URL configured"""
        response = authenticated_client.post(f"{BASE_URL}/api/ical/sync/{STRUCTURE_WITH_ICAL}")
        
        # Should return 200 OK
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "structure_id" in data, "Response should contain structure_id"
        assert "source" in data, "Response should contain source"
        assert "created" in data, "Response should contain created count"
        assert "updated" in data, "Response should contain updated count"
        assert "removed" in data, "Response should contain removed count"
        assert "events_in_feed" in data, "Response should contain events_in_feed count"
        assert "status" in data, "Response should contain status"
        
        # Verify source detection (should be booking_com based on URL)
        assert data["source"] == "booking_com", f"Expected source 'booking_com', got '{data['source']}'"
        assert data["status"] == "success", f"Expected status 'success', got '{data['status']}'"
        
        print(f"Sync result: created={data['created']}, updated={data['updated']}, removed={data['removed']}, events_in_feed={data['events_in_feed']}")
    
    def test_sync_structure_without_ical_url_returns_400(self, authenticated_client):
        """Test syncing a structure that has no iCal URL configured returns 400"""
        response = authenticated_client.post(f"{BASE_URL}/api/ical/sync/{STRUCTURE_WITHOUT_ICAL}")
        
        # Should return 400 Bad Request
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "detail" in data, "Response should contain error detail"
        print(f"Error message: {data['detail']}")
    
    def test_sync_nonexistent_structure_returns_404(self, authenticated_client):
        """Test syncing a non-existent structure returns 404"""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = authenticated_client.post(f"{BASE_URL}/api/ical/sync/{fake_id}")
        
        # Should return 404 Not Found
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
    
    def test_sync_idempotent_no_duplicates(self, authenticated_client):
        """Test that running sync twice doesn't create duplicate events"""
        # First sync
        response1 = authenticated_client.post(f"{BASE_URL}/api/ical/sync/{STRUCTURE_WITH_ICAL}")
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Second sync - should not create new events (already synced)
        response2 = authenticated_client.post(f"{BASE_URL}/api/ical/sync/{STRUCTURE_WITH_ICAL}")
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Second sync should have 0 created (events already exist)
        assert data2["created"] == 0, f"Expected 0 created on second sync, got {data2['created']}"
        print(f"First sync: created={data1['created']}, Second sync: created={data2['created']} (idempotent)")


class TestIcalSyncAll:
    """Tests for POST /api/ical/sync-all"""
    
    def test_sync_all_structures_success(self, authenticated_client):
        """Test syncing all structures with iCal URLs"""
        response = authenticated_client.post(f"{BASE_URL}/api/ical/sync-all")
        
        # Should return 200 OK
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "message" in data, "Response should contain message"
        assert "total_created" in data, "Response should contain total_created"
        assert "total_updated" in data, "Response should contain total_updated"
        assert "total_removed" in data, "Response should contain total_removed"
        assert "results" in data, "Response should contain results array"
        
        # Results should be a list
        assert isinstance(data["results"], list), "Results should be a list"
        
        print(f"Sync all result: total_created={data['total_created']}, total_updated={data['total_updated']}, total_removed={data['total_removed']}, structures_synced={len(data['results'])}")
        
        # Each result should have structure info
        for result in data["results"]:
            assert "structure_id" in result, "Each result should have structure_id"
            assert "status" in result, "Each result should have status"


class TestIcalStatus:
    """Tests for GET /api/ical/status"""
    
    def test_get_ical_status_success(self, authenticated_client):
        """Test getting iCal sync status for all structures"""
        response = authenticated_client.get(f"{BASE_URL}/api/ical/status")
        
        # Should return 200 OK
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Should be a list
        assert isinstance(data, list), "Response should be a list"
        
        # Each item should have required fields
        for item in data:
            assert "structure_id" in item, "Each item should have structure_id"
            assert "structure_name" in item, "Each item should have structure_name"
            assert "ical_url" in item, "Each item should have ical_url"
            assert "source" in item, "Each item should have source"
            assert "imported_events" in item, "Each item should have imported_events count"
            assert "last_sync" in item, "Each item should have last_sync info"
        
        print(f"Found {len(data)} structures with iCal URLs configured")
        for item in data:
            print(f"  - {item['structure_name']}: {item['imported_events']} events, source={item['source']}")


class TestIcalPermissions:
    """Tests for permission checks on iCal endpoints"""
    
    def test_sync_without_auth_returns_401_or_403(self, api_client):
        """Test that sync without auth returns 401 or 403"""
        # Remove auth header if present
        headers = {"Content-Type": "application/json"}
        response = requests.post(f"{BASE_URL}/api/ical/sync/{STRUCTURE_WITH_ICAL}", headers=headers)
        
        # Either 401 (no token) or 403 (invalid/no permission) is acceptable
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
    
    def test_sync_all_without_auth_returns_401_or_403(self, api_client):
        """Test that sync-all without auth returns 401 or 403"""
        headers = {"Content-Type": "application/json"}
        response = requests.post(f"{BASE_URL}/api/ical/sync-all", headers=headers)
        
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"
    
    def test_status_without_auth_returns_401_or_403(self, api_client):
        """Test that status without auth returns 401 or 403"""
        headers = {"Content-Type": "application/json"}
        response = requests.get(f"{BASE_URL}/api/ical/status", headers=headers)
        
        assert response.status_code in [401, 403], f"Expected 401 or 403, got {response.status_code}"


class TestIcalEventCreation:
    """Tests for verifying events are created correctly"""
    
    def test_events_have_booking_com_source(self, authenticated_client):
        """Test that imported events have source=booking_com"""
        # First ensure we have synced
        authenticated_client.post(f"{BASE_URL}/api/ical/sync/{STRUCTURE_WITH_ICAL}")
        
        # Get events for the structure
        response = authenticated_client.get(f"{BASE_URL}/api/events", params={
            "structure_id": STRUCTURE_WITH_ICAL
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        events = response.json()
        # Find events with source=booking_com (imported from iCal)
        booking_events = [e for e in events if e.get("source") == "booking_com"]
        
        print(f"Found {len(booking_events)} events with source=booking_com out of {len(events)} total events")
        
        # Verify at least some events have booking_com source
        assert len(booking_events) > 0, "Should have at least one event with source=booking_com"
        
        # Verify event structure
        for event in booking_events[:3]:  # Check first 3
            assert event.get("event_type") == "booking", f"Expected event_type 'booking', got '{event.get('event_type')}'"
            print(f"  Event: {event.get('title')} | {event.get('start_time')} - {event.get('end_time')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
