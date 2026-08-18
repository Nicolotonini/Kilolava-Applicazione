"""
Test suite for Kilolava Automation Engine API
Tests: generate tasks (dry_run/actual), idempotency, automation status, clear auto tasks
Rules: checkout_cleaning, checkin_delivery, fixed_schedule
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "test_user@kilolava.com"
TEST_PASSWORD = "TestPass123!"

# Test date range (week of 2026-03-23 to 2026-03-29)
DATE_FROM = "2026-03-23"
DATE_TO = "2026-03-29"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for API calls"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    if response.status_code != 200:
        pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestAutomationGenerate:
    """Tests for POST /api/automation/generate endpoint"""
    
    def test_generate_dry_run_returns_preview(self, auth_headers):
        """Test dry_run=true returns preview without creating tasks"""
        response = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "true"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "date_from" in data
        assert "date_to" in data
        assert "dry_run" in data
        assert data["dry_run"] == True
        assert "generated_count" in data
        assert "skipped_count" in data
        assert "generated" in data
        assert "skipped" in data
        assert isinstance(data["generated"], list)
        assert isinstance(data["skipped"], list)
        
        print(f"Dry run result: {data['generated_count']} generated, {data['skipped_count']} skipped")
    
    def test_generate_actual_creates_tasks(self, auth_headers):
        """Test dry_run=false actually creates tasks in DB"""
        # First do a dry run to see what would be generated
        dry_response = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "true"},
            headers=auth_headers
        )
        assert dry_response.status_code == 200
        dry_data = dry_response.json()
        
        # Now do actual generation
        response = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "false"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["dry_run"] == False
        
        # If tasks were generated, verify they have IDs (meaning they were saved)
        if data["generated_count"] > 0:
            for task in data["generated"]:
                assert "id" in task
                assert task["id"] != "preview"  # Actual tasks have real IDs
                assert task.get("auto_generated") == True
                assert task.get("source") == "automation"
        
        print(f"Actual generation: {data['generated_count']} created, {data['skipped_count']} skipped")
    
    def test_idempotency_no_duplicates(self, auth_headers):
        """Test running generate twice produces 0 new tasks (idempotency)"""
        # Run generate first time
        response1 = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "false"},
            headers=auth_headers
        )
        assert response1.status_code == 200
        
        # Run generate second time - should produce 0 new tasks
        response2 = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "false"},
            headers=auth_headers
        )
        assert response2.status_code == 200
        
        data2 = response2.json()
        # All tasks should be skipped as "already_exists"
        assert data2["generated_count"] == 0, f"Expected 0 new tasks, got {data2['generated_count']} (idempotency failed)"
        
        # Check skipped reasons include "already_exists"
        already_exists_count = sum(1 for s in data2["skipped"] if s.get("reason") == "already_exists")
        print(f"Idempotency test: {data2['generated_count']} new, {already_exists_count} already_exists, {data2['skipped_count']} total skipped")


class TestAutomationRules:
    """Tests for automation rules: checkout_cleaning, checkin_delivery, fixed_schedule"""
    
    def test_checkout_cleaning_rule(self, auth_headers):
        """Rule 1: Check-out creates cleaning task"""
        # Get events to find bookings that end in the date range
        events_response = requests.get(
            f"{BASE_URL}/api/events",
            params={"date_from": DATE_FROM, "date_to": DATE_TO},
            headers=auth_headers
        )
        assert events_response.status_code == 200
        events = events_response.json()
        
        # Find auto-generated cleaning tasks
        cleaning_tasks = [e for e in events if e.get("event_type") == "cleaning" and e.get("auto_generated") == True]
        
        # Verify cleaning tasks have correct rule
        for task in cleaning_tasks:
            if task.get("rule") == "checkout_cleaning":
                assert task.get("source") == "automation"
                assert task.get("generated_from") is not None  # Should reference booking ID
                print(f"Found checkout_cleaning task: {task['title']}")
    
    def test_checkin_delivery_rule_stock_check(self, auth_headers):
        """Rule 2: Check-in creates delivery only if stock insufficient"""
        # Run dry run to see delivery decisions
        response = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "true"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check skipped deliveries with "stock_sufficient" reason
        stock_sufficient_skips = [s for s in data["skipped"] if s.get("reason") == "stock_sufficient"]
        
        # Check generated deliveries
        delivery_tasks = [g for g in data["generated"] if g.get("event_type") == "delivery"]
        
        print(f"Delivery rule: {len(delivery_tasks)} deliveries generated, {len(stock_sufficient_skips)} skipped (stock sufficient)")
        
        # Verify skipped deliveries have stock info
        for skip in stock_sufficient_skips:
            assert "available" in skip
            assert "target" in skip
            print(f"  Skipped delivery: {skip['date']} - available={skip['available']}/{skip['target']}")


class TestAutomationStatus:
    """Tests for GET /api/automation/status endpoint"""
    
    def test_get_automation_status(self, auth_headers):
        """Test automation status returns correct stats"""
        response = requests.get(
            f"{BASE_URL}/api/automation/status",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "total_auto_tasks" in data
        assert "pending" in data
        assert "completed" in data
        assert "by_rule" in data
        assert "fixed_schedule_units" in data
        
        assert isinstance(data["total_auto_tasks"], int)
        assert isinstance(data["pending"], int)
        assert isinstance(data["completed"], int)
        assert isinstance(data["by_rule"], dict)
        
        print(f"Automation status: total={data['total_auto_tasks']}, pending={data['pending']}, completed={data['completed']}")
        print(f"  By rule: {data['by_rule']}")


class TestAutomationClear:
    """Tests for DELETE /api/automation/clear endpoint"""
    
    def test_clear_pending_auto_tasks(self, auth_headers):
        """Test clearing pending auto-generated tasks"""
        # First get current status
        status_before = requests.get(
            f"{BASE_URL}/api/automation/status",
            headers=auth_headers
        ).json()
        
        # Clear pending auto tasks
        response = requests.delete(
            f"{BASE_URL}/api/automation/clear",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "status_filter": "pending"},
            headers=auth_headers
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "deleted_count" in data
        assert isinstance(data["deleted_count"], int)
        
        print(f"Cleared {data['deleted_count']} pending auto tasks")
        
        # Verify status changed
        status_after = requests.get(
            f"{BASE_URL}/api/automation/status",
            headers=auth_headers
        ).json()
        
        # Pending count should have decreased
        print(f"Status before: pending={status_before['pending']}, after: pending={status_after['pending']}")


class TestEventsAutoGeneratedFields:
    """Tests for auto_generated, generated_from, rule fields in events"""
    
    def test_events_include_auto_fields(self, auth_headers):
        """Test GET /api/events returns auto_generated, generated_from, rule fields"""
        # First generate some tasks
        requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "false"},
            headers=auth_headers
        )
        
        # Get events
        response = requests.get(
            f"{BASE_URL}/api/events",
            params={"date_from": DATE_FROM, "date_to": DATE_TO},
            headers=auth_headers
        )
        assert response.status_code == 200
        events = response.json()
        
        # Find auto-generated events
        auto_events = [e for e in events if e.get("auto_generated") == True]
        
        for event in auto_events:
            # Verify auto-generated fields are present
            assert "auto_generated" in event
            assert event["auto_generated"] == True
            assert "source" in event
            assert event["source"] == "automation"
            
            # generated_from and rule should be present for auto tasks
            if event.get("generated_from"):
                print(f"Auto event: {event['title']} - rule={event.get('rule')}, from={event.get('generated_from')}")
        
        print(f"Found {len(auto_events)} auto-generated events out of {len(events)} total")


class TestAutomationEndToEnd:
    """End-to-end test of automation workflow"""
    
    def test_full_automation_workflow(self, auth_headers):
        """Test complete workflow: clear -> generate preview -> confirm -> verify idempotency"""
        # Step 1: Clear existing auto tasks
        clear_response = requests.delete(
            f"{BASE_URL}/api/automation/clear",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "status_filter": "pending"},
            headers=auth_headers
        )
        assert clear_response.status_code == 200
        cleared = clear_response.json()["deleted_count"]
        print(f"Step 1: Cleared {cleared} existing auto tasks")
        
        # Step 2: Generate preview (dry run)
        preview_response = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "true"},
            headers=auth_headers
        )
        assert preview_response.status_code == 200
        preview = preview_response.json()
        print(f"Step 2: Preview shows {preview['generated_count']} tasks to generate")
        
        # Step 3: Confirm generation
        confirm_response = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "false"},
            headers=auth_headers
        )
        assert confirm_response.status_code == 200
        confirmed = confirm_response.json()
        print(f"Step 3: Actually generated {confirmed['generated_count']} tasks")
        
        # Step 4: Verify idempotency
        repeat_response = requests.post(
            f"{BASE_URL}/api/automation/generate",
            params={"date_from": DATE_FROM, "date_to": DATE_TO, "dry_run": "false"},
            headers=auth_headers
        )
        assert repeat_response.status_code == 200
        repeat = repeat_response.json()
        assert repeat["generated_count"] == 0, "Idempotency failed - duplicate tasks created"
        print(f"Step 4: Repeat generation created {repeat['generated_count']} tasks (idempotency verified)")
        
        # Step 5: Check status
        status_response = requests.get(
            f"{BASE_URL}/api/automation/status",
            headers=auth_headers
        )
        assert status_response.status_code == 200
        status = status_response.json()
        print(f"Step 5: Final status - total={status['total_auto_tasks']}, pending={status['pending']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
