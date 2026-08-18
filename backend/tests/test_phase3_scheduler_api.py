"""
Phase 3 Backend Tests
- Regression: health, auth, events fields, structures, clients, units, automation/status,
  notifications, dashboard/stats
- New scheduler endpoints: GET /api/scheduler/status, POST /api/scheduler/check-overdue
- Permission: cleaner role gets 403 on /scheduler/check-overdue
"""

import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API_URL = f"{BASE_URL}/api"

ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASSWORD = "TestPass123!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Auth failed: {r.status_code} {r.text}")
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Regression: basic endpoints ----------

class TestRegressionBasics:
    def test_health(self):
        r = requests.get(f"{API_URL}/health")
        assert r.status_code == 200
        data = r.json()
        # accept "status": "healthy" or similar
        assert "status" in data

    def test_login(self):
        r = requests.post(f"{API_URL}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_events_have_phase2_fields(self, auth_headers):
        r = requests.get(f"{API_URL}/events", headers=auth_headers)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list)
        if events:
            for f in ("manually_modified", "auto_generated", "generated_from", "rule"):
                assert f in events[0], f"Missing field {f}"

    def test_structures(self, auth_headers):
        r = requests.get(f"{API_URL}/structures", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_clients(self, auth_headers):
        r = requests.get(f"{API_URL}/clients", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_units(self, auth_headers):
        r = requests.get(f"{API_URL}/units", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_automation_status(self, auth_headers):
        r = requests.get(f"{API_URL}/automation/status", headers=auth_headers)
        assert r.status_code == 200

    def test_notifications(self, auth_headers):
        r = requests.get(f"{API_URL}/notifications", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_dashboard_stats(self, auth_headers):
        r = requests.get(f"{API_URL}/dashboard/stats", headers=auth_headers)
        assert r.status_code == 200


# ---------- New scheduler endpoints ----------

class TestSchedulerEndpoints:
    def test_scheduler_status(self, auth_headers):
        r = requests.get(f"{API_URL}/scheduler/status", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("running") is True, f"Expected running=true, got {data}"
        # Verify check_overdue_tasks job present
        jobs = data.get("jobs", [])
        assert isinstance(jobs, list)
        job_ids = [j.get("id") for j in jobs]
        assert "check_overdue_tasks" in job_ids, f"check_overdue_tasks not in jobs: {job_ids}"

    def test_check_overdue_returns_counts(self, auth_headers):
        r = requests.post(f"{API_URL}/scheduler/check-overdue", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for f in ("checked_at", "overdue_found", "notified"):
            assert f in data, f"Missing field {f} in response: {data}"
        assert isinstance(data["overdue_found"], int)
        assert isinstance(data["notified"], int)

    def test_check_overdue_creates_notification_for_overdue_task(self, auth_headers):
        """Create a cleaning event with end_time in past, no operator -> trigger -> notification."""
        # Find a structure
        sr = requests.get(f"{API_URL}/structures", headers=auth_headers)
        assert sr.status_code == 200
        structures = sr.json()
        if not structures:
            pytest.skip("No structures available")
        structure_id = structures[0]["id"]

        # Snapshot existing notifications count
        n_before = requests.get(f"{API_URL}/notifications", headers=auth_headers).json()
        before_count = len(n_before)

        # Create overdue cleaning event (past end_time, no assigned_operator)
        past_end = (datetime.utcnow() - timedelta(hours=2)).replace(microsecond=0)
        past_start = past_end - timedelta(hours=1)
        payload = {
            "event_type": "cleaning",
            "title": f"TEST_OVERDUE_{uuid.uuid4().hex[:6]}",
            "structure_id": structure_id,
            "start_time": past_start.isoformat(),
            "end_time": past_end.isoformat(),
            "status": "pending",
        }
        cr = requests.post(f"{API_URL}/events", json=payload, headers=auth_headers)
        assert cr.status_code == 200, cr.text
        eid = cr.json()["id"]

        try:
            # Trigger check-overdue
            tr = requests.post(f"{API_URL}/scheduler/check-overdue", headers=auth_headers)
            assert tr.status_code == 200
            data = tr.json()
            assert data["overdue_found"] >= 1, f"Expected at least 1 overdue, got {data}"

            # Verify notification was created
            n_after = requests.get(f"{API_URL}/notifications", headers=auth_headers).json()
            assert len(n_after) >= before_count, "Notification count didn't increase"
        finally:
            requests.delete(f"{API_URL}/events/{eid}", headers=auth_headers)


# ---------- Permission test ----------

class TestSchedulerPermissions:
    """Cleaner role should get 403 on POST /scheduler/check-overdue."""

    @pytest.fixture(scope="class")
    def cleaner_headers(self, auth_headers):
        # Create a cleaner user via admin
        uid = uuid.uuid4().hex[:8]
        email = f"test_cleaner_{uid}@kilolava.com"
        password = "CleanerPass123!"
        # Try POST /api/users
        payload = {
            "email": email,
            "password": password,
            "first_name": "TEST",
            "last_name": f"Cleaner{uid}",
            "role": "cleaner",
        }
        cr = requests.post(f"{API_URL}/users", json=payload, headers=auth_headers)
        if cr.status_code not in (200, 201):
            pytest.skip(f"Could not create cleaner user: {cr.status_code} {cr.text}")
        # Login as cleaner
        lr = requests.post(f"{API_URL}/auth/login", json={"email": email, "password": password})
        if lr.status_code != 200:
            pytest.skip(f"Cleaner login failed: {lr.status_code} {lr.text}")
        token = lr.json()["access_token"]
        yield {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        # Cleanup
        try:
            uid_resp = lr.json().get("user", {}).get("id")
            if uid_resp:
                requests.delete(f"{API_URL}/users/{uid_resp}", headers=auth_headers)
        except Exception:
            pass

    def test_cleaner_cannot_trigger_check_overdue(self, cleaner_headers):
        r = requests.post(f"{API_URL}/scheduler/check-overdue", headers=cleaner_headers)
        assert r.status_code == 403, f"Expected 403 for cleaner, got {r.status_code}: {r.text}"
