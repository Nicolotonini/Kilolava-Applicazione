"""
E2E pytest for Kilolava CLEANING MODULE v2 (iteration 7).
Focus:
 - Bed limits (400 with clear message)
 - DELETE /cleaning-tasks/{id} works for admin + 404 (regression: route decorator was missing)
 - GET /cleaning-tasks/my-tasks default returns today AND future (regression: was only today)
 - Cleaner cannot PUT (planning) and cannot access others' tasks (403)
 - Media upload initial/final video timer (started_at, finished_at, duration_minutes)
 - warehouse_photo rejects video content-type
 - Complete blocks with detail listing missing (photo/video)
 - Issues: damage without attachments -> 400; with attachment -> ok; admin create_maintenance action
 - Duplicate + Recurrence (weekly_days, every_n_days)
 - Cliente portal minimal fields
Cleanup: all TEST_ tasks created are deleted at teardown.
"""
import os
import io
import time
import uuid
import pytest
import requests
from datetime import date, timedelta

def _read_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not configured")
    return url.rstrip("/")

BASE = _read_backend_url()
API = f"{BASE}/api"

ADMIN = ("test_user@kilolava.com", "TestPass123!")
CLEANER = ("addetta_test@kilolava.com", "AddettaTest123!")
CLIENT = ("cliente_test@kilolava.com", "ClienteTest123!")

# small valid media payloads
JPG_BYTES = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb0043000806060706050807070709090808"
    "0a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434"
    "1f27393d38323c2e333432ffdb0043010909090c0b0c180d0d1832211c213232323232323232"
    "323232323232323232323232323232323232323232323232323232323232323232323232323232"
    "3232323232323232ffc00011080001000103012200021101031101ffc4001f00000105010101"
    "01010100000000000000000102030405060708090a0bffc400b5100002010303020403050504"
    "0400000102037700010203110405213112410613516107227114328191a1082342b1c11552d1"
    "f02433627282090a161718191a25262728292a3435363738393a434445464748494a53545556"
    "5758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2"
    "a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3"
    "e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda000c03010002110311003f00fbfc28a28aff00"
    "d9"
)
MP4_BYTES = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + os.urandom(512)


# ---------- fixtures ----------

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def cleaner_token():
    r = requests.post(f"{API}/auth/login", json={"email": CLEANER[0], "password": CLEANER[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def client_token():
    r = requests.post(f"{API}/auth/login", json={"email": CLIENT[0], "password": CLIENT[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def cleaner_h(cleaner_token):
    return {"Authorization": f"Bearer {cleaner_token}"}


@pytest.fixture(scope="session")
def client_h(client_token):
    return {"Authorization": f"Bearer {client_token}"}


@pytest.fixture(scope="session")
def structure_id(admin_h):
    r = requests.get(f"{API}/structures", headers=admin_h, timeout=15)
    assert r.status_code == 200
    for s in r.json():
        if s.get("klv_code") == "KLV-0002":
            return s["id"]
    pytest.skip("KLV-0002 not found")


@pytest.fixture(scope="session")
def cleaner_id(admin_h):
    r = requests.get(f"{API}/cleaning-tasks/cleaners", headers=admin_h, timeout=15)
    assert r.status_code == 200
    for c in r.json():
        if c.get("email") == CLEANER[0]:
            return c["id"]
    pytest.skip("cleaner user not found")


@pytest.fixture(scope="session", autouse=True)
def setup_bed_config(admin_h, structure_id):
    """Ensure bed_config: max 2 double, 2 single, 1 sofa; min 1 double."""
    payload = {"bed_config": {
        "capacity_total": 5, "beds_double": 2, "beds_single": 2, "sofa_beds": 1,
        "capacity_persons": 4, "beds_double_min": 1, "beds_single_min": 0, "sofa_beds_min": 0,
    }}
    r = requests.put(f"{API}/structures/{structure_id}", headers=admin_h, json=payload, timeout=15)
    assert r.status_code in (200, 204)
    yield


# collect created task ids for cleanup
CREATED_TASKS = []


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_h):
    yield
    for tid in CREATED_TASKS:
        try:
            requests.delete(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=10)
        except Exception:
            pass


def _create_task(admin_h, structure_id, cleaner_id, **overrides):
    payload = {
        "structure_id": structure_id,
        "date": date.today().isoformat(),
        "guests_count": 4,
        "beds_double": 2,
        "beds_single": 1,
        "beds_sofa": 0,
        "checkin_today": True,
        "checkin_time": "15:00",
        "assigned_cleaner_ids": [cleaner_id],
        "notes": "TEST_ pytest task",
    }
    payload.update(overrides)
    r = requests.post(f"{API}/cleaning-tasks", headers=admin_h, json=payload, timeout=15)
    return r


# ---------- tests ----------

class TestBedLimits:
    def test_over_max_beds_returns_400_with_clear_message(self, admin_h, structure_id):
        r = _create_task(admin_h, structure_id, None, beds_double=3, assigned_cleaner_ids=[])
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        assert "massimo" in detail.lower() or "max" in detail.lower(), detail

    def test_valid_beds_creates_task_assigned(self, admin_h, structure_id, cleaner_id):
        r = _create_task(admin_h, structure_id, cleaner_id)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "assigned"
        assert d.get("checklist") is not None
        CREATED_TASKS.append(d["id"])


class TestDeleteRegression:
    def test_admin_delete_task_works(self, admin_h, structure_id, cleaner_id):
        r = _create_task(admin_h, structure_id, cleaner_id)
        assert r.status_code == 200
        tid = r.json()["id"]
        dr = requests.delete(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=15)
        assert dr.status_code == 200, dr.text
        # confirm gone
        gr = requests.get(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=15)
        assert gr.status_code == 404

    def test_delete_nonexistent_returns_404(self, admin_h):
        r = requests.delete(f"{API}/cleaning-tasks/{uuid.uuid4()}", headers=admin_h, timeout=15)
        assert r.status_code == 404


class TestMyTasksRegression:
    def test_my_tasks_default_includes_today_and_future(self, admin_h, cleaner_h, structure_id, cleaner_id):
        today = date.today().isoformat()
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        r1 = _create_task(admin_h, structure_id, cleaner_id, date=today)
        r2 = _create_task(admin_h, structure_id, cleaner_id, date=tomorrow)
        assert r1.status_code == 200 and r2.status_code == 200
        t1 = r1.json()["id"]; t2 = r2.json()["id"]
        CREATED_TASKS.extend([t1, t2])

        r = requests.get(f"{API}/cleaning-tasks/my-tasks", headers=cleaner_h, timeout=15)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert t1 in ids, "today task missing from my-tasks default"
        assert t2 in ids, "future task missing (regression: was only today)"


class TestCleanerPermissions:
    def test_cleaner_cannot_put_task(self, admin_h, cleaner_h, structure_id, cleaner_id):
        r = _create_task(admin_h, structure_id, cleaner_id)
        assert r.status_code == 200
        tid = r.json()["id"]; CREATED_TASKS.append(tid)
        pr = requests.put(f"{API}/cleaning-tasks/{tid}", headers=cleaner_h,
                          json={"guests_count": 9}, timeout=15)
        assert pr.status_code == 403, pr.text

    def test_cleaner_cannot_access_other_task(self, admin_h, cleaner_h, structure_id):
        # Task with NO cleaner assignment -> cleaner should not access
        r = _create_task(admin_h, structure_id, None, assigned_cleaner_ids=[])
        assert r.status_code == 200
        tid = r.json()["id"]; CREATED_TASKS.append(tid)
        gr = requests.get(f"{API}/cleaning-tasks/{tid}", headers=cleaner_h, timeout=15)
        assert gr.status_code == 403


class TestMediaFlow:
    @pytest.fixture(scope="class")
    def task_id(self, admin_h, structure_id, cleaner_id):
        r = _create_task(admin_h, structure_id, cleaner_id)
        assert r.status_code == 200
        tid = r.json()["id"]; CREATED_TASKS.append(tid)
        return tid

    def test_final_before_initial_returns_400(self, cleaner_h, task_id):
        files = {"file": ("f.mp4", MP4_BYTES, "video/mp4")}
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/media?media_type=final_video",
                          headers=cleaner_h, files=files, timeout=30)
        assert r.status_code == 400, r.text

    def test_initial_video_starts_timer(self, cleaner_h, task_id):
        files = {"file": ("i.mp4", MP4_BYTES, "video/mp4")}
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/media?media_type=initial_video",
                          headers=cleaner_h, files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") == "in_progress"
        assert d.get("started_at")

    def test_warehouse_photo_rejects_video(self, cleaner_h, task_id):
        files = {"file": ("wh.mp4", MP4_BYTES, "video/mp4")}
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/media?media_type=warehouse_photo",
                          headers=cleaner_h, files=files, timeout=30)
        assert r.status_code == 400, r.text

    def test_complete_blocks_missing_items(self, cleaner_h, task_id):
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/complete", headers=cleaner_h, timeout=15)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "")
        # must mention missing items (magazzino / video finale / checklist)
        low = detail.lower() if isinstance(detail, str) else str(detail).lower()
        assert ("magazzino" in low) or ("video" in low) or ("checklist" in low), detail

    def test_full_completion_flow(self, admin_h, cleaner_h, task_id):
        # fill required checklist
        gr = requests.get(f"{API}/cleaning-tasks/{task_id}", headers=cleaner_h, timeout=15)
        task = gr.json()
        responses = {}
        for sec in (task.get("checklist") or {}).get("sections", []):
            for item in sec.get("items", []):
                if item.get("required"):
                    responses[f"{sec['name']}|{item['label']}"] = True
        r = requests.put(f"{API}/cleaning-tasks/{task_id}/checklist", headers=cleaner_h,
                         json={"responses": responses}, timeout=15)
        assert r.status_code == 200, r.text

        # warehouse photo
        files = {"file": ("wh.jpg", JPG_BYTES, "image/jpeg")}
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/media?media_type=warehouse_photo",
                          headers=cleaner_h, files=files, timeout=30)
        assert r.status_code == 200

        # small wait so duration_minutes has a chance to be >=0
        time.sleep(1)

        # final video
        files = {"file": ("fin.mp4", MP4_BYTES, "video/mp4")}
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/media?media_type=final_video",
                          headers=cleaner_h, files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("finished_at")
        assert d.get("duration_minutes") is not None

        # complete
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/complete", headers=cleaner_h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "completed"


class TestIssues:
    @pytest.fixture(scope="class")
    def task_id(self, admin_h, structure_id, cleaner_id):
        r = _create_task(admin_h, structure_id, cleaner_id)
        assert r.status_code == 200
        tid = r.json()["id"]; CREATED_TASKS.append(tid)
        # start it so cleaner can operate
        files = {"file": ("i.mp4", MP4_BYTES, "video/mp4")}
        # cleaner header - need it here; can't easily since fixture scope; get via login
        tok = requests.post(f"{API}/auth/login",
                            json={"email": CLEANER[0], "password": CLEANER[1]},
                            timeout=10).json()["access_token"]
        requests.post(f"{API}/cleaning-tasks/{tid}/media?media_type=initial_video",
                      headers={"Authorization": f"Bearer {tok}"}, files=files, timeout=30)
        return tid

    def test_damage_without_attachments_returns_400(self, cleaner_h, task_id):
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/issues", headers=cleaner_h,
                          json={"category": "damage", "note": "Sedia rotta"}, timeout=15)
        assert r.status_code == 400, r.text

    def test_damage_with_attachment_ok_and_admin_action(self, cleaner_h, admin_h, task_id):
        # upload issue media
        files = {"file": ("iss.jpg", JPG_BYTES, "image/jpeg")}
        r = requests.post(f"{API}/cleaning-tasks/{task_id}/media?media_type=issue",
                          headers=cleaner_h, files=files, timeout=30)
        assert r.status_code == 200, r.text
        mid = r.json()["id"]

        r = requests.post(f"{API}/cleaning-tasks/{task_id}/issues", headers=cleaner_h,
                          json={"category": "damage", "note": "Sedia rotta",
                                "attachment_ids": [mid]}, timeout=15)
        assert r.status_code == 200, r.text
        issue = r.json()
        assert issue["category"] == "damage"
        assert len(issue.get("attachments", [])) >= 1
        iid = issue["id"]

        # admin action -> create_maintenance
        r = requests.post(f"{API}/cleaning-issues/{iid}/action", headers=admin_h,
                          json={"action": "create_maintenance"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("status") == "maintenance_created"
        assert d.get("maintenance_issue_id")


class TestDuplicateRecurrence:
    def test_duplicate_and_weekly_recurrence_and_every_n(self, admin_h, structure_id, cleaner_id):
        r = _create_task(admin_h, structure_id, cleaner_id)
        assert r.status_code == 200
        tid = r.json()["id"]; CREATED_TASKS.append(tid)

        # duplicate on tomorrow
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        dr = requests.post(f"{API}/cleaning-tasks/{tid}/duplicate", headers=admin_h,
                           json={"date": tomorrow}, timeout=15)
        assert dr.status_code == 200, dr.text
        dup = dr.json()
        assert dup["date"] == tomorrow
        # checklist reset (no responses)
        cl = dup.get("checklist") or {}
        assert not cl.get("responses"), "duplicate must have empty responses"
        CREATED_TASKS.append(dup["id"])

        # weekly_days recurrence occurrences=3
        rr = requests.post(f"{API}/cleaning-tasks/{tid}/recurrence", headers=admin_h,
                           json={"mode": "weekly_days", "weekdays": [0, 3], "occurrences": 3},
                           timeout=15)
        assert rr.status_code == 200, rr.text
        rjson = rr.json()
        assert rjson["created"] == 3
        # fetch the created tasks to cleanup
        for d in rjson.get("dates", []):
            g = requests.get(f"{API}/cleaning-tasks?date={d}", headers=admin_h, timeout=15)
            if g.status_code == 200:
                for t in g.json():
                    if t.get("structure_id") == structure_id and t["id"] not in CREATED_TASKS:
                        CREATED_TASKS.append(t["id"])

        # every_n_days
        rr = requests.post(f"{API}/cleaning-tasks/{tid}/recurrence", headers=admin_h,
                           json={"mode": "every_n_days", "every_n_days": 2, "occurrences": 2},
                           timeout=15)
        assert rr.status_code == 200, rr.text
        assert rr.json()["created"] == 2
        for d in rr.json().get("dates", []):
            g = requests.get(f"{API}/cleaning-tasks?date={d}", headers=admin_h, timeout=15)
            if g.status_code == 200:
                for t in g.json():
                    if t.get("structure_id") == structure_id and t["id"] not in CREATED_TASKS:
                        CREATED_TASKS.append(t["id"])


class TestClientPortal:
    def test_client_only_sees_minimal_fields(self, client_h):
        r = requests.get(f"{API}/portal/my-structures-today", headers=client_h, timeout=15)
        assert r.status_code == 200, r.text
        allowed = {"structure_id", "name", "address", "cleaning_status", "guests_count"}
        for s in r.json():
            extra = set(s.keys()) - allowed
            assert not extra, f"client sees forbidden fields: {extra}"
            # explicit denies
            for forbidden in ("duration_minutes", "media", "keybox_code", "warehouse_info",
                              "checklist", "started_at", "finished_at"):
                assert forbidden not in s
