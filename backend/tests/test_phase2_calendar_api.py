from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""
Phase 2 Calendar / Auto-Generated Service Tasks Tests

Covers:
- POST /api/auth/login
- GET /api/events new fields (manually_modified, auto_generated, generated_from, rule)
- POST /api/events (booking) auto-generates checkout tasks for active services
- POST /api/events/{id}/generate-tasks idempotency + 400 for non-booking
- PUT /api/events/{id} on iCal-imported booking with time change -> manually_modified=true
- POST /api/ical/sync-all returns auto_tasks_created counts
- _auto_generate_checkout_tasks safe behavior when structure has no services
"""

import os
import uuid
import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://operations-hub-38.preview.emergentagent.com").rstrip("/")
API_URL = f"{BASE_URL}/api"

TEST_EMAIL = "test_user@kilolava.com"
TEST_PASSWORD = TEST_ADMIN_PASSWORD


# ---------------- Fixtures ----------------

@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API_URL}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Auth failed: {r.status_code}")
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def all_services_structure(auth_headers):
    """Create or reuse a structure with all four services active (cleaning, private_laundry, consumables, maintenance)."""
    uid = str(uuid.uuid4())[:8]
    client_data = {
        "client_type": "private",
        "private_info": {"name": f"TEST_P2Client_{uid}", "surname": "Phase2"},
    }
    cr = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
    assert cr.status_code in (200, 201), cr.text
    client_id = cr.json()["id"]

    structure_data = {
        "client_id": client_id,
        "name": f"TEST_P2Structure_{uid}",
        "structure_type": "apartment",
        "services": ["cleaning", "private_laundry", "consumables", "maintenance"],
    }
    sr = requests.post(f"{API_URL}/structures", json=structure_data, headers=auth_headers)
    assert sr.status_code in (200, 201), sr.text
    return sr.json()


@pytest.fixture(scope="module")
def cleaning_only_structure(auth_headers):
    uid = str(uuid.uuid4())[:8]
    client_data = {
        "client_type": "private",
        "private_info": {"name": f"TEST_P2COClient_{uid}", "surname": "CleanOnly"},
    }
    cr = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
    assert cr.status_code in (200, 201), cr.text
    client_id = cr.json()["id"]
    sr = requests.post(
        f"{API_URL}/structures",
        json={
            "client_id": client_id,
            "name": f"TEST_P2COStructure_{uid}",
            "structure_type": "apartment",
            "services": ["cleaning"],
        },
        headers=auth_headers,
    )
    assert sr.status_code in (200, 201), sr.text
    return sr.json()


@pytest.fixture(scope="module")
def no_services_structure(auth_headers):
    uid = str(uuid.uuid4())[:8]
    client_data = {
        "client_type": "private",
        "private_info": {"name": f"TEST_P2NSClient_{uid}", "surname": "NoSvcs"},
    }
    cr = requests.post(f"{API_URL}/clients", json=client_data, headers=auth_headers)
    assert cr.status_code in (200, 201), cr.text
    client_id = cr.json()["id"]
    sr = requests.post(
        f"{API_URL}/structures",
        json={
            "client_id": client_id,
            "name": f"TEST_P2NSStructure_{uid}",
            "structure_type": "apartment",
            "services": [],
        },
        headers=auth_headers,
    )
    assert sr.status_code in (200, 201), sr.text
    return sr.json()


def _booking_payload(structure_id, start_offset_days=10, nights=3, title_suffix=""):
    start = datetime.utcnow().replace(microsecond=0) + timedelta(days=start_offset_days)
    end = start + timedelta(days=nights)
    return {
        "event_type": "booking",
        "title": f"TEST_Booking_{title_suffix or uuid.uuid4().hex[:6]}",
        "structure_id": structure_id,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "status": "pending",
        "source": "manual",
    }


# ---------------- Tests ----------------

class TestAuthAndNewFields:
    def test_login_returns_access_token(self):
        r = requests.post(f"{API_URL}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and isinstance(data["access_token"], str) and len(data["access_token"]) > 10

    def test_get_events_includes_phase2_fields(self, auth_headers):
        r = requests.get(f"{API_URL}/events", headers=auth_headers)
        assert r.status_code == 200, r.text
        events = r.json()
        assert isinstance(events, list)
        if not events:
            pytest.skip("No events in DB to verify fields")
        sample = events[0]
        for f in ("manually_modified", "auto_generated", "generated_from", "rule"):
            assert f in sample, f"Missing Phase 2 field {f} in event response"
        assert sample["manually_modified"] in (True, False)
        assert sample["auto_generated"] in (True, False)


class TestBookingAutoGeneratesTasks:
    def test_create_booking_generates_all_four_tasks(self, auth_headers, all_services_structure):
        payload = _booking_payload(all_services_structure["id"], start_offset_days=20, title_suffix="ALL4")
        r = requests.post(f"{API_URL}/events", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        booking = r.json()
        booking_id = booking["id"]

        # Fetch events linked to this booking
        ev_resp = requests.get(f"{API_URL}/events", headers=auth_headers)
        assert ev_resp.status_code == 200
        linked = [e for e in ev_resp.json() if e.get("generated_from") == booking_id]
        rules = sorted([e.get("rule") for e in linked if e.get("auto_generated")])
        expected = sorted([
            "checkout_cleaning",
            "checkout_linen",
            "checkout_consumables",
            "checkout_maintenance",
        ])
        assert rules == expected, f"Expected {expected}, got {rules}. Linked: {linked}"

        # Cleanup
        requests.delete(f"{API_URL}/events/{booking_id}", headers=auth_headers)
        for t in linked:
            requests.delete(f"{API_URL}/events/{t['id']}", headers=auth_headers)

    def test_create_booking_only_cleaning_active(self, auth_headers, cleaning_only_structure):
        payload = _booking_payload(cleaning_only_structure["id"], start_offset_days=25, title_suffix="ONLYCLN")
        r = requests.post(f"{API_URL}/events", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        booking_id = r.json()["id"]

        ev_resp = requests.get(f"{API_URL}/events", headers=auth_headers)
        linked = [e for e in ev_resp.json() if e.get("generated_from") == booking_id]
        rules = [e.get("rule") for e in linked if e.get("auto_generated")]
        assert rules == ["checkout_cleaning"], f"Expected only cleaning, got {rules}"

        requests.delete(f"{API_URL}/events/{booking_id}", headers=auth_headers)
        for t in linked:
            requests.delete(f"{API_URL}/events/{t['id']}", headers=auth_headers)

    def test_create_booking_no_services_creates_no_tasks(self, auth_headers, no_services_structure):
        payload = _booking_payload(no_services_structure["id"], start_offset_days=30, title_suffix="NOSVC")
        r = requests.post(f"{API_URL}/events", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        booking_id = r.json()["id"]

        ev_resp = requests.get(f"{API_URL}/events", headers=auth_headers)
        linked = [e for e in ev_resp.json() if e.get("generated_from") == booking_id]
        assert linked == [], f"Expected no auto tasks, got {linked}"

        requests.delete(f"{API_URL}/events/{booking_id}", headers=auth_headers)


class TestRegenerateTasksEndpoint:
    def test_regenerate_idempotent(self, auth_headers, all_services_structure):
        payload = _booking_payload(all_services_structure["id"], start_offset_days=35, title_suffix="REGEN")
        r = requests.post(f"{API_URL}/events", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        booking_id = r.json()["id"]

        # First regenerate call (after creation already auto-generated)
        r1 = requests.post(f"{API_URL}/events/{booking_id}/generate-tasks", headers=auth_headers)
        assert r1.status_code == 200, r1.text
        # Should be 0 created the second time because creation already generated them
        assert r1.json()["created_count"] == 0

        # Second call also 0
        r2 = requests.post(f"{API_URL}/events/{booking_id}/generate-tasks", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json()["created_count"] == 0

        # Verify total 4 linked tasks
        ev_resp = requests.get(f"{API_URL}/events", headers=auth_headers)
        linked = [e for e in ev_resp.json() if e.get("generated_from") == booking_id and e.get("auto_generated")]
        assert len(linked) == 4

        # Cleanup
        requests.delete(f"{API_URL}/events/{booking_id}", headers=auth_headers)
        for t in linked:
            requests.delete(f"{API_URL}/events/{t['id']}", headers=auth_headers)

    def test_regenerate_non_booking_returns_400(self, auth_headers, all_services_structure):
        # Create a cleaning event (not a booking)
        payload = {
            "event_type": "cleaning",
            "title": f"TEST_NotBooking_{uuid.uuid4().hex[:6]}",
            "structure_id": all_services_structure["id"],
            "start_time": (datetime.utcnow() + timedelta(days=5)).isoformat(),
            "end_time": (datetime.utcnow() + timedelta(days=5, hours=2)).isoformat(),
            "status": "pending",
        }
        r = requests.post(f"{API_URL}/events", json=payload, headers=auth_headers)
        assert r.status_code == 200
        eid = r.json()["id"]

        rg = requests.post(f"{API_URL}/events/{eid}/generate-tasks", headers=auth_headers)
        assert rg.status_code == 400, f"Expected 400, got {rg.status_code}: {rg.text}"

        requests.delete(f"{API_URL}/events/{eid}", headers=auth_headers)

    def test_regenerate_after_deletion_recreates(self, auth_headers, all_services_structure):
        """Delete one auto task then regenerate – should recreate just that one."""
        payload = _booking_payload(all_services_structure["id"], start_offset_days=40, title_suffix="REGEN2")
        r = requests.post(f"{API_URL}/events", json=payload, headers=auth_headers)
        booking_id = r.json()["id"]

        ev_resp = requests.get(f"{API_URL}/events", headers=auth_headers)
        linked = [e for e in ev_resp.json() if e.get("generated_from") == booking_id]
        assert len(linked) == 4
        # delete the cleaning one
        cleaning_task = next(e for e in linked if e["rule"] == "checkout_cleaning")
        d = requests.delete(f"{API_URL}/events/{cleaning_task['id']}", headers=auth_headers)
        assert d.status_code in (200, 204)

        # but _task_exists_with_rule checks status != cancelled; deletion removes record so should re-create
        rg = requests.post(f"{API_URL}/events/{booking_id}/generate-tasks", headers=auth_headers)
        assert rg.status_code == 200
        assert rg.json()["created_count"] == 1
        assert rg.json()["created"][0]["rule"] == "checkout_cleaning"

        # Cleanup
        ev_resp = requests.get(f"{API_URL}/events", headers=auth_headers)
        linked = [e for e in ev_resp.json() if e.get("generated_from") == booking_id]
        requests.delete(f"{API_URL}/events/{booking_id}", headers=auth_headers)
        for t in linked:
            requests.delete(f"{API_URL}/events/{t['id']}", headers=auth_headers)


class TestICalManuallyModified:
    def test_put_ical_event_time_change_marks_manually_modified(self, auth_headers):
        """Find an existing iCal-imported event and update its time."""
        ev_resp = requests.get(f"{API_URL}/events", headers=auth_headers)
        assert ev_resp.status_code == 200
        ical_events = [e for e in ev_resp.json() if e.get("ical_uid") and not e.get("manually_modified")]
        if not ical_events:
            pytest.skip("No unmodified iCal-imported event available")

        ev = ical_events[0]
        # Shift start_time by +1 hour
        try:
            start_dt = datetime.fromisoformat(ev["start_time"].replace("Z", "+00:00"))
        except Exception:
            pytest.skip(f"Unparsable start_time: {ev['start_time']}")
        new_start = (start_dt + timedelta(hours=1)).isoformat()

        upd = requests.put(
            f"{API_URL}/events/{ev['id']}",
            json={"start_time": new_start},
            headers=auth_headers,
        )
        assert upd.status_code == 200, upd.text
        body = upd.json()
        assert body.get("manually_modified") is True, f"Expected manually_modified True, got {body}"

        # Reset manually_modified back? No way via API. Restore time.
        requests.put(
            f"{API_URL}/events/{ev['id']}",
            json={"start_time": ev["start_time"]},
            headers=auth_headers,
        )


class TestICalSyncAll:
    def test_sync_all_returns_auto_tasks_created(self, auth_headers):
        r = requests.post(f"{API_URL}/ical/sync-all", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # Expect either a list of per-structure results or a top-level summary
        # Per spec: "per-structure auto_tasks_created counts in result"
        # Accept various shapes – just confirm 'auto_tasks_created' key surfaces.
        text = str(data)
        assert "auto_tasks_created" in text, f"Response missing auto_tasks_created field: {data}"
