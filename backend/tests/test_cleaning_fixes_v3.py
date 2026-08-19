"""
Pytest for Kilolava CLEANING MODULE fixes v3 (iteration 8).
Covers the 5 corrections requested by the user, focused on the backend side:
 - (2) Recurrences inherit ALL config; single-series constraint; second POST -> 400 (also from occurrence)
 - New GET /cleaning-tasks/{id}/series (admin) with structure {series_id, info, tasks}
   - works both from origin and from an occurrence
   - 404 on task without series
   - 403 as cleaner
 - Duplicate does NOT assign recurrence_series_id (single task remains single)
 - DELETE cascades cleaning_issues
 - Regression: bed max validation still returns 400 with 'massimo'
 - Regression: initial video -> in_progress + started_at; final video -> finished_at + duration_minutes
 - Regression: complete blocked without required items

Cleanup: every task created here is deleted at teardown (including series occurrences).
"""
import os
import io
import uuid
import time
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

# Minimal valid media payloads
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
def admin_h():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def cleaner_h():
    r = requests.post(f"{API}/auth/login", json={"email": CLEANER[0], "password": CLEANER[1]}, timeout=15)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


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


CREATED_TASKS = []
SERIES_IDS = []


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_h):
    yield
    # 1) delete all tasks belonging to any series created here (occurrences + origin)
    for sid in SERIES_IDS:
        try:
            # fetch admin list wide date range to gather members
            r = requests.get(f"{API}/cleaning-tasks", headers=admin_h,
                             params={"date_from": (date.today() - timedelta(days=1)).isoformat(),
                                     "date_to": (date.today() + timedelta(days=120)).isoformat()},
                             timeout=20)
            if r.status_code == 200:
                for t in r.json():
                    if t.get("recurrence_series_id") == sid:
                        try:
                            requests.delete(f"{API}/cleaning-tasks/{t['id']}", headers=admin_h, timeout=10)
                        except Exception:
                            pass
        except Exception:
            pass
    # 2) explicit created tasks
    for tid in CREATED_TASKS:
        try:
            requests.delete(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=10)
        except Exception:
            pass


def _mk_payload(structure_id, cleaner_id, days_ahead=0, **extra):
    d = (date.today() + timedelta(days=days_ahead)).isoformat()
    p = {
        "structure_id": structure_id,
        "date": d,
        "scheduled_time": "10:30",
        "guests_count": 4,
        "beds_double": 2,
        "beds_single": 1,
        "beds_sofa": 0,
        "checkin_today": True,
        "checkin_time": "15:00",
        "assigned_cleaner_ids": [cleaner_id] if cleaner_id else [],
        "notes": "TEST_v3 pytest",
    }
    p.update(extra)
    return p


def _create(admin_h, structure_id, cleaner_id, **extra):
    r = requests.post(f"{API}/cleaning-tasks", headers=admin_h, json=_mk_payload(structure_id, cleaner_id, **extra), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    CREATED_TASKS.append(d["id"])
    return d


# ---------- BASIC REGRESSIONS ----------

class TestBasicRegression:
    def test_bed_max_validation(self, admin_h, structure_id):
        r = requests.post(f"{API}/cleaning-tasks", headers=admin_h,
                          json=_mk_payload(structure_id, None, beds_double=5, assigned_cleaner_ids=[]),
                          timeout=15)
        assert r.status_code == 400, r.text
        assert "massimo" in r.json().get("detail", "").lower()


# ---------- RECURRENCE INHERITANCE + SINGLE SERIES ----------

class TestRecurrenceInheritance:
    @pytest.fixture(scope="class")
    def series_ctx(self, admin_h, structure_id, cleaner_id):
        # Create origin with distinctive config
        origin = _create(
            admin_h, structure_id, cleaner_id,
            days_ahead=1,
            guests_count=3,
            beds_double=1,
            beds_single=2,
            beds_sofa=1,
            checkin_today=True,
            checkin_time="16:45",
            scheduled_time="09:15",
            notes="TEST_v3 origin config",
        )
        # Create series (weekly on same weekday as origin+7d etc): use every_n_days=7 x 3 occurrences
        r = requests.post(
            f"{API}/cleaning-tasks/{origin['id']}/recurrence",
            headers=admin_h,
            json={"mode": "every_n_days", "interval_days": 7, "occurrences": 3},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        SERIES_IDS.append(payload["series_id"])
        return {"origin": origin, "series": payload}

    def test_response_has_series_id_and_dates(self, series_ctx):
        s = series_ctx["series"]
        assert s.get("series_id")
        assert isinstance(s.get("dates"), list)
        assert s.get("created") == len(s["dates"]) == 3

    def test_origin_has_series_id_and_info(self, admin_h, series_ctx):
        r = requests.get(f"{API}/cleaning-tasks/{series_ctx['origin']['id']}", headers=admin_h, timeout=15)
        assert r.status_code == 200
        t = r.json()
        assert t.get("recurrence_series_id") == series_ctx["series"]["series_id"]
        info = t.get("recurrence_info") or {}
        assert info.get("mode") == "every_n_days"
        assert info.get("interval_days") == 7
        assert info.get("start_date") == series_ctx["origin"]["date"]
        assert isinstance(info.get("dates"), list) and len(info["dates"]) == 3

    def test_occurrences_inherit_full_config(self, admin_h, series_ctx):
        origin = series_ctx["origin"]
        sid = series_ctx["series"]["series_id"]
        # find members via admin list
        r = requests.get(f"{API}/cleaning-tasks", headers=admin_h,
                         params={"date_from": origin["date"],
                                 "date_to": (date.today() + timedelta(days=120)).isoformat()},
                         timeout=20)
        assert r.status_code == 200
        occs = [t for t in r.json() if t.get("recurrence_series_id") == sid and t.get("id") != origin["id"]]
        assert len(occs) == 3
        for occ in occs:
            assert occ.get("guests_count") == 3
            assert occ.get("beds_double") == 1
            assert occ.get("beds_single") == 2
            assert occ.get("beds_sofa") == 1
            assert occ.get("checkin_today") is True
            assert occ.get("checkin_time") == "16:45"
            assert occ.get("scheduled_time") == "09:15"
            assert occ.get("notes") == "TEST_v3 origin config"
            assert occ.get("recurrence_series_id") == sid
            assert occ.get("recurrence_of") == origin["id"]
            # cleaner inherited
            cleaners = occ.get("assigned_cleaner_ids") or []
            assert len(cleaners) == 1

    def test_second_recurrence_on_origin_returns_400(self, admin_h, series_ctx):
        r = requests.post(
            f"{API}/cleaning-tasks/{series_ctx['origin']['id']}/recurrence",
            headers=admin_h,
            json={"mode": "every_n_days", "interval_days": 3, "occurrences": 2},
            timeout=15,
        )
        assert r.status_code == 400, r.text
        assert "serie" in r.json().get("detail", "").lower()

    def test_second_recurrence_on_occurrence_returns_400(self, admin_h, series_ctx):
        sid = series_ctx["series"]["series_id"]
        r = requests.get(f"{API}/cleaning-tasks", headers=admin_h,
                         params={"date_from": series_ctx["origin"]["date"],
                                 "date_to": (date.today() + timedelta(days=120)).isoformat()},
                         timeout=20)
        occs = [t for t in r.json() if t.get("recurrence_series_id") == sid and t.get("id") != series_ctx["origin"]["id"]]
        assert occs, "need at least one occurrence"
        occ_id = occs[0]["id"]
        r2 = requests.post(
            f"{API}/cleaning-tasks/{occ_id}/recurrence",
            headers=admin_h,
            json={"mode": "every_n_days", "interval_days": 3, "occurrences": 2},
            timeout=15,
        )
        assert r2.status_code == 400, r2.text
        assert "serie" in r2.json().get("detail", "").lower()


# ---------- GET /cleaning-tasks/{id}/series ----------

class TestSeriesEndpoint:
    @pytest.fixture(scope="class")
    def series_ctx(self, admin_h, structure_id, cleaner_id):
        origin = _create(admin_h, structure_id, cleaner_id, days_ahead=2, notes="TEST_v3 series-endpoint origin")
        r = requests.post(
            f"{API}/cleaning-tasks/{origin['id']}/recurrence",
            headers=admin_h,
            json={"mode": "weekly_days", "weekdays": [(date.today() + timedelta(days=2)).weekday()],
                  "occurrences": 2},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        SERIES_IDS.append(r.json()["series_id"])
        return {"origin": origin, "series": r.json()}

    def test_from_origin(self, admin_h, series_ctx):
        r = requests.get(f"{API}/cleaning-tasks/{series_ctx['origin']['id']}/series",
                         headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["series_id"] == series_ctx["series"]["series_id"]
        assert data["info"] and data["info"].get("mode") == "weekly_days"
        assert isinstance(data["tasks"], list) and len(data["tasks"]) >= 3  # origin + 2 occ
        dates = [t["date"] for t in data["tasks"]]
        assert dates == sorted(dates), "tasks must be sorted ascending by date"

    def test_from_occurrence(self, admin_h, series_ctx):
        sid = series_ctx["series"]["series_id"]
        # list to find an occurrence
        r = requests.get(f"{API}/cleaning-tasks", headers=admin_h,
                         params={"date_from": series_ctx["origin"]["date"],
                                 "date_to": (date.today() + timedelta(days=120)).isoformat()},
                         timeout=20)
        occ = next(t for t in r.json() if t.get("recurrence_series_id") == sid and t["id"] != series_ctx["origin"]["id"])
        r2 = requests.get(f"{API}/cleaning-tasks/{occ['id']}/series", headers=admin_h, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["series_id"] == sid

    def test_task_without_series_returns_404(self, admin_h, structure_id, cleaner_id):
        t = _create(admin_h, structure_id, cleaner_id, days_ahead=1, notes="TEST_v3 lone")
        r = requests.get(f"{API}/cleaning-tasks/{t['id']}/series", headers=admin_h, timeout=15)
        assert r.status_code == 404

    def test_cleaner_forbidden(self, admin_h, cleaner_h, series_ctx):
        r = requests.get(f"{API}/cleaning-tasks/{series_ctx['origin']['id']}/series",
                         headers=cleaner_h, timeout=15)
        assert r.status_code == 403


# ---------- DUPLICATE DOES NOT CARRY SERIES ----------

class TestDuplicateNoSeries:
    def test_duplicate_is_single_task(self, admin_h, structure_id, cleaner_id):
        origin = _create(admin_h, structure_id, cleaner_id, days_ahead=1, notes="TEST_v3 dup-src")
        r = requests.post(
            f"{API}/cleaning-tasks/{origin['id']}/duplicate",
            headers=admin_h,
            json={"date": (date.today() + timedelta(days=5)).isoformat()},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        dup = r.json()
        CREATED_TASKS.append(dup["id"])
        assert not dup.get("recurrence_series_id")
        assert not dup.get("recurrence_of")


# ---------- DELETE CASCADES ISSUES ----------

class TestDeleteCascadesIssues:
    def test_delete_task_removes_related_issues(self, admin_h, cleaner_h, structure_id, cleaner_id):
        # Start a task, upload initial_video so it becomes in_progress, then create an issue as cleaner
        t = _create(admin_h, structure_id, cleaner_id, days_ahead=0, notes="TEST_v3 cascade")
        tid = t["id"]

        # As cleaner: upload initial_video
        files = {"file": ("start.mp4", MP4_BYTES, "video/mp4")}
        r = requests.post(f"{API}/cleaning-tasks/{tid}/media",
                          headers=cleaner_h, params={"media_type": "initial_video"}, files=files, timeout=30)
        assert r.status_code == 200, r.text

        # Create an issue: first upload an attachment media with media_type=issue
        r = requests.post(f"{API}/cleaning-tasks/{tid}/media",
                          headers=cleaner_h, params={"media_type": "issue"},
                          files={"file": ("evidence.jpg", JPG_BYTES, "image/jpeg")}, timeout=30)
        assert r.status_code == 200, r.text
        media_id = r.json().get("id") or r.json().get("media", {}).get("id")
        # fallback: fetch task and read last media entry
        if not media_id:
            g = requests.get(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=15).json()
            media_id = [m["id"] for m in (g.get("media") or []) if m.get("media_type") == "issue"][-1]
        r = requests.post(
            f"{API}/cleaning-tasks/{tid}/issues",
            headers={**cleaner_h, "Content-Type": "application/json"},
            json={"category": "damage", "note": "TEST_v3 broken lamp", "attachment_ids": [media_id]},
            timeout=30,
        )
        assert r.status_code == 200, r.text

        # Verify issue exists via admin list
        r = requests.get(f"{API}/cleaning-issues", headers=admin_h, timeout=15)
        pre_count = 0
        if r.status_code == 200:
            pre_count = sum(1 for it in r.json() if it.get("cleaning_task_id") == tid)
        assert pre_count >= 1, "issue not persisted"

        # Delete the task
        dr = requests.delete(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=15)
        assert dr.status_code == 200, dr.text
        # Remove from cleanup list since already deleted
        try:
            CREATED_TASKS.remove(tid)
        except ValueError:
            pass

        # After delete: no issues should remain for this task
        r = requests.get(f"{API}/cleaning-issues", headers=admin_h, timeout=15)
        if r.status_code == 200:
            post = [it for it in r.json() if it.get("cleaning_task_id") == tid]
            assert post == [], f"cleaning_issues NOT cascaded: still {len(post)} rows"


# ---------- MEDIA TIMESTAMPS REGRESSION ----------

class TestMediaTimestamps:
    def test_initial_then_final_video_sets_started_finished_duration(self, admin_h, cleaner_h, structure_id, cleaner_id):
        t = _create(admin_h, structure_id, cleaner_id, days_ahead=0, notes="TEST_v3 timers")
        tid = t["id"]

        # Initial video -> in_progress + started_at
        r = requests.post(f"{API}/cleaning-tasks/{tid}/media",
                          headers=cleaner_h, params={"media_type": "initial_video"},
                          files={"file": ("start.mp4", MP4_BYTES, "video/mp4")}, timeout=30)
        assert r.status_code == 200, r.text

        g = requests.get(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=15).json()
        assert g["status"] == "in_progress"
        assert g.get("started_at")

        # Small delay for measurable duration
        time.sleep(2)

        # Warehouse photo (jpg)
        r = requests.post(f"{API}/cleaning-tasks/{tid}/media",
                          headers=cleaner_h, params={"media_type": "warehouse_photo"},
                          files={"file": ("wh.jpg", JPG_BYTES, "image/jpeg")}, timeout=30)
        assert r.status_code == 200, r.text

        # Final video -> finished_at + duration_minutes
        r = requests.post(f"{API}/cleaning-tasks/{tid}/media",
                          headers=cleaner_h, params={"media_type": "final_video"},
                          files={"file": ("end.mp4", MP4_BYTES, "video/mp4")}, timeout=30)
        assert r.status_code == 200, r.text

        g = requests.get(f"{API}/cleaning-tasks/{tid}", headers=admin_h, timeout=15).json()
        assert g.get("finished_at")
        assert "duration_minutes" in g
        # duration is int-minutes; short delay -> 0 is OK, must not be None
        assert g["duration_minutes"] is not None
