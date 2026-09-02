from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Iter32 — Fase 39 Auth/Users backend regression.

Copre: login username kilolava + legacy email, brute force lockout, creazione utenti
(con/senza password), prima attivazione (monouso), PIN login (device authorized/lock),
sessioni (revoke), dispositivi, force-reactivation, reset-password, admin-data
(admin vs ops_manager vs cleaner), indicatore admin_data_status, contract validation,
tipo_rapporto, excluded_from_planning (cleaner + rider), /auth/register disabilitata,
USR-0000 pending + USR-0001 active, login_username univoco.

Tutti gli utenti creati sono TEST_iter32_* e vengono eliminati in teardown.
"""

import os
import re
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

ADMIN_USER = TEST_ADMIN_USERNAME
ADMIN_EMAIL_LEGACY = "test_user@kilolava.com"
ADMIN_PASS = TEST_ADMIN_PASSWORD

ADMIN_DEV = f"dev-admin-iter32-{uuid.uuid4().hex[:8]}"


# ---------- Fixtures ----------

@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={
        "username": ADMIN_USER, "password": ADMIN_PASS,
        "device_id": ADMIN_DEV, "device_name": "pytest-iter32-admin"})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


CREATED_USER_IDS: list[str] = []


@pytest.fixture(scope="session", autouse=True)
def cleanup(admin_h, s):
    yield
    # Cleanup: force-delete every TEST_iter32 user created during the run
    for uid in list(CREATED_USER_IDS):
        # Attempt hard delete; if history exists, deactivate instead
        r = s.delete(f"{API}/users/{uid}", headers=admin_h)
        if r.status_code == 400:
            s.put(f"{API}/users/{uid}/toggle-active", headers=admin_h)
    # Ensure admin has no PIN set / no lingering lock (test A2 potentially sets PIN via set-pin? we don't)
    # Nothing to remove on admin here.


def _mk_admin_headers_fresh():
    """Return a NEW admin token (used after actions revoke the primary session)."""
    r = requests.post(f"{API}/auth/login", json={
        "username": ADMIN_USER, "password": ADMIN_PASS,
        "device_id": ADMIN_DEV, "device_name": "pytest-iter32-admin"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_user(admin_h, s, suffix, role="cleaner", password=None, tipo_rapporto="dipendente",
                 first="Test", extra=None):
    body = {
        "first_name": first, "last_name": f"Iter32{suffix}",
        "role": role, "tipo_rapporto": tipo_rapporto,
    }
    if password:
        body["password"] = password
    if extra:
        body.update(extra)
    r = s.post(f"{API}/users", headers=admin_h, json=body)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    data = r.json()
    CREATED_USER_IDS.append(data["id"])
    return data


# ---------- 1. LOGIN ----------

class TestLogin:
    def test_login_username_kilolava(self, s):
        r = s.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": ADMIN_PASS,
            "device_id": ADMIN_DEV, "device_name": "pytest-iter32-admin"})
        assert r.status_code == 200
        data = r.json()
        assert data["access_token"]
        assert "pin_set" in data
        assert "device_authorized" in data
        assert data["device_authorized"] is True
        assert data["user"]["role"] == "admin"

    def test_login_legacy_email(self, s):
        r = s.post(f"{API}/auth/login", json={
            "username": ADMIN_EMAIL_LEGACY, "password": ADMIN_PASS,
            "device_id": ADMIN_DEV})
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={
            "username": ADMIN_USER, "password": TEST_FIXTURE_PASSWORD + "-wrong",
            "device_id": ADMIN_DEV})
        assert r.status_code == 401


# ---------- 2. BRUTE FORCE ----------

class TestBruteForce:
    def test_lockout_after_5_failures(self, s):
        fake = f"utente.finto-{uuid.uuid4().hex[:8]}@kilolava.it"
        codes = []
        for _ in range(5):
            r = s.post(f"{API}/auth/login", json={
                "username": fake, "password": "wrong", "device_id": "x"})
            codes.append(r.status_code)
        # 6th attempt must be locked (429)
        r = s.post(f"{API}/auth/login", json={
            "username": fake, "password": "wrong", "device_id": "x"})
        assert r.status_code == 429, f"expected 429 after 5 failures, got {r.status_code} (previous: {codes})"


# ---------- 3. CREATE USER (with/without password) ----------

class TestCreateUser:
    def test_create_without_password_returns_activation_code(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"NoPwd{uuid.uuid4().hex[:6]}", role="cleaner")
        assert u.get("activation_code"), "atteso activation_code monouso"
        assert re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", u["activation_code"])
        assert u.get("login_username", "").endswith("@kilolava.it")
        assert u["activation_status"] == "pending"
        assert u.get("usr_code", "").startswith("USR-")

    def test_create_with_password_active(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"Pwd{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD)
        assert u["activation_status"] == "active"
        assert "activation_code" not in u or not u.get("activation_code")

    def test_create_duplicate_usr_code_400(self, admin_h, s):
        r = s.post(f"{API}/users", headers=admin_h, json={
            "first_name": "TEST", "last_name": "DupUSR",
            "role": "cleaner", "usr_code": "USR-0001"})
        assert r.status_code == 400


# ---------- 4. ACTIVATION FLOW ----------

class TestActivation:
    def test_activate_wrong_code(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"Act{uuid.uuid4().hex[:6]}", role="cleaner")
        r = s.post(f"{API}/auth/activate", json={
            "username": u["login_username"], "code": "WRON-GXXX",
            "new_password": TEST_FIXTURE_PASSWORD + "-new", "pin": "123456", "device_id": "dev-act-bad"})
        assert r.status_code == 401

    def test_activate_success_then_reuse_fails(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"Act{uuid.uuid4().hex[:6]}", role="cleaner")
        code = u["activation_code"]
        username = u["login_username"]
        dev = f"dev-act-{uuid.uuid4().hex[:8]}"

        r = s.post(f"{API}/auth/activate", json={
            "username": username, "code": code,
            "new_password": TEST_FIXTURE_PASSWORD, "pin": "234567",
            "device_id": dev, "device_name": "act-device"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["access_token"]
        assert data["pin_set"] is True
        assert data["device_authorized"] is True

        # Login now works with new password
        r2 = s.post(f"{API}/auth/login", json={
            "username": username, "password": TEST_FIXTURE_PASSWORD,
            "device_id": dev})
        assert r2.status_code == 200

        # Second use of same code must fail (401)
        r3 = s.post(f"{API}/auth/activate", json={
            "username": username, "code": code,
            "new_password": TEST_FIXTURE_PASSWORD, "pin": "234567",
            "device_id": dev})
        assert r3.status_code == 401

    def test_activate_invalid_pin_400(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"ActPin{uuid.uuid4().hex[:6]}", role="cleaner")
        r = s.post(f"{API}/auth/activate", json={
            "username": u["login_username"], "code": u["activation_code"],
            "new_password": TEST_FIXTURE_PASSWORD, "pin": "12", "device_id": "dev-pin-x"})
        # PIN validated only AFTER code check, so with valid code we hit 400
        assert r.status_code == 400


# ---------- 5. PIN LOGIN ----------

class TestPinLogin:
    @pytest.fixture(scope="class")
    def activated(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"Pin{uuid.uuid4().hex[:6]}", role="cleaner")
        dev = f"dev-pin-{uuid.uuid4().hex[:8]}"
        r = s.post(f"{API}/auth/activate", json={
            "username": u["login_username"], "code": u["activation_code"],
            "new_password": TEST_FIXTURE_PASSWORD, "pin": "654321",
            "device_id": dev, "device_name": "pin-device"})
        assert r.status_code == 200
        return {"username": u["login_username"], "pin": "654321", "device_id": dev,
                "password": TEST_FIXTURE_PASSWORD, "user_id": u["id"]}

    def test_pin_login_ok(self, s, activated):
        r = s.post(f"{API}/auth/pin-login", json={
            "username": activated["username"], "pin": activated["pin"],
            "device_id": activated["device_id"]})
        assert r.status_code == 200, r.text
        assert r.json()["pin_set"] is True

    def test_pin_login_new_device_403(self, s, activated):
        r = s.post(f"{API}/auth/pin-login", json={
            "username": activated["username"], "pin": activated["pin"],
            "device_id": f"new-device-{uuid.uuid4().hex[:8]}"})
        assert r.status_code == 403

    def test_pin_lock_after_5_and_password_resets(self, s, activated):
        for _ in range(5):
            r = s.post(f"{API}/auth/pin-login", json={
                "username": activated["username"], "pin": "000000",
                "device_id": activated["device_id"]})
            assert r.status_code == 401
        # 6th -> lock 429
        r = s.post(f"{API}/auth/pin-login", json={
            "username": activated["username"], "pin": activated["pin"],
            "device_id": activated["device_id"]})
        assert r.status_code in (401, 429), r.text
        # Password login resets the lock
        rp = s.post(f"{API}/auth/login", json={
            "username": activated["username"], "password": activated["password"],
            "device_id": activated["device_id"]})
        assert rp.status_code == 200
        # Now PIN login should work again
        rp2 = s.post(f"{API}/auth/pin-login", json={
            "username": activated["username"], "pin": activated["pin"],
            "device_id": activated["device_id"]})
        assert rp2.status_code == 200


# ---------- 6. SESSIONS + DEVICES ----------

class TestSessionsDevices:
    def test_revoke_sessions_invalidates_token(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"Sess{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD)
        dev = f"dev-sess-{uuid.uuid4().hex[:8]}"
        r = s.post(f"{API}/auth/login", json={
            "username": u["login_username"], "password": TEST_FIXTURE_PASSWORD,
            "device_id": dev})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        # Verify token works
        me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        # Admin revokes sessions
        rr = s.post(f"{API}/users/{u['id']}/revoke-sessions", headers=admin_h)
        assert rr.status_code == 200
        assert rr.json()["revoked"] >= 1
        # Token now invalid
        me2 = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me2.status_code == 401
        assert "revocata" in me2.json().get("detail", "").lower()

    def test_list_and_delete_devices(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"Dev{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD)
        dev = f"dev-list-{uuid.uuid4().hex[:8]}"
        r = s.post(f"{API}/auth/login", json={
            "username": u["login_username"], "password": TEST_FIXTURE_PASSWORD,
            "device_id": dev, "device_name": "list-dev"})
        assert r.status_code == 200
        # GET devices
        gd = s.get(f"{API}/users/{u['id']}/devices", headers=admin_h)
        assert gd.status_code == 200
        payload = gd.json()
        assert "devices" in payload
        assert any(d.get("device_id") == dev for d in payload["devices"])
        assert payload["active_sessions"] >= 1
        # DELETE device
        dd = s.delete(f"{API}/users/{u['id']}/devices/{dev}", headers=admin_h)
        assert dd.status_code == 200
        # Now PIN login (no PIN set anyway) or another device check
        # Sessions of that device revoked
        gd2 = s.get(f"{API}/users/{u['id']}/devices", headers=admin_h)
        assert gd2.json()["active_sessions"] == 0


# ---------- 7. FORCE REACTIVATION ----------

class TestForceReactivation:
    def test_force_reactivation_flow(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"FR{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD)
        # Force reactivation
        r = s.post(f"{API}/users/{u['id']}/force-reactivation", headers=admin_h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("activation_code")
        assert re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}", data["activation_code"])
        # Login with old password -> 403 pending activation
        rl = s.post(f"{API}/auth/login", json={
            "username": u["login_username"], "password": TEST_FIXTURE_PASSWORD,
            "device_id": "x"})
        assert rl.status_code == 403
        assert "attivar" in rl.json().get("detail", "").lower()

    def test_force_reactivation_self_400(self, admin_h, s):
        me = s.get(f"{API}/auth/me", headers=admin_h).json()
        r = s.post(f"{API}/users/{me['id']}/force-reactivation", headers=admin_h)
        assert r.status_code == 400


# ---------- 8. RESET PASSWORD REVOKES ----------

class TestResetPassword:
    def test_reset_revokes_sessions(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"RP{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD)
        dev = f"dev-rp-{uuid.uuid4().hex[:8]}"
        r = s.post(f"{API}/auth/login", json={
            "username": u["login_username"], "password": TEST_FIXTURE_PASSWORD,
            "device_id": dev})
        tok = r.json()["access_token"]
        # Reset password
        rp = s.post(f"{API}/users/{u['id']}/reset-password", headers=admin_h,
                    json={"new_password": TEST_FIXTURE_PASSWORD + "-new"})
        assert rp.status_code == 200
        # Old token invalid
        me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 401


# ---------- 9. ADMIN DATA ----------

class TestAdminData:
    def test_admin_full_access_incl_iban(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"AD{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD)
        # Update
        put = s.put(f"{API}/users/{u['id']}/admin-data", headers=admin_h, json={
            "tax_code": "RSSMRA80A01H501U", "iban": "IT60X0542811101000000123456",
            "iban_holder": "Mario Rossi", "admin_notes": "test"})
        assert put.status_code == 200
        d = put.json()
        assert d["iban_hidden"] is False
        assert d["iban"] == "IT60X0542811101000000123456"
        assert d["status"] == "completi"
        # Not leaked in list
        lst = s.get(f"{API}/users", headers=admin_h).json()
        for x in lst:
            for k in ("tax_code", "vat_number", "iban", "iban_holder", "admin_notes", "admin_data"):
                assert k not in x, f"{k} leaked in list"
        # Not leaked in single-user GET
        one = s.get(f"{API}/users/{u['id']}", headers=admin_h).json()
        for k in ("tax_code", "vat_number", "iban", "iban_holder", "admin_notes", "admin_data"):
            assert k not in one, f"{k} leaked in GET /users/{{id}}"
        # Audit: last event 'user.admin_data_update' with only field-names as values
        aud = s.get(f"{API}/users/{u['id']}/audit", headers=admin_h).json()
        act = next((x for x in aud if x["action"] == "user.admin_data_update"), None)
        assert act, "audit user.admin_data_update mancante"
        for k, v in (act.get("details") or {}).items():
            assert v in ("impostato", "modificato", "rimosso"), f"audit leak? {k}={v}"
            # Never contain the actual iban / tax_code value
            assert "IT60" not in str(v)
            assert "RSSMRA" not in str(v)

    def test_ops_manager_iban_hidden_and_put_403(self, admin_h, s):
        ops = _create_user(admin_h, s, suffix=f"Ops{uuid.uuid4().hex[:6]}",
                           role="operations_manager", password=TEST_FIXTURE_PASSWORD)
        target = _create_user(admin_h, s, suffix=f"Tgt{uuid.uuid4().hex[:6]}",
                              role="cleaner", password=TEST_FIXTURE_PASSWORD)
        # Populate admin_data as admin
        s.put(f"{API}/users/{target['id']}/admin-data", headers=admin_h, json={
            "tax_code": "AAABBB80A01H501U", "iban": "IT99Z1234"})
        # Login as ops
        rl = s.post(f"{API}/auth/login", json={
            "username": ops["login_username"], "password": TEST_FIXTURE_PASSWORD,
            "device_id": "dev-ops"})
        assert rl.status_code == 200
        ops_h = {"Authorization": f"Bearer {rl.json()['access_token']}"}
        # GET returns iban_hidden=true and NO iban/iban_holder
        g = s.get(f"{API}/users/{target['id']}/admin-data", headers=ops_h)
        assert g.status_code == 200
        d = g.json()
        assert d["iban_hidden"] is True
        assert "iban" not in d
        assert "iban_holder" not in d
        assert d["can_edit"] is False
        assert d.get("tax_code") == "AAABBB80A01H501U"
        # PUT 403
        p = s.put(f"{API}/users/{target['id']}/admin-data", headers=ops_h, json={"tax_code": "X"})
        assert p.status_code == 403

    def test_cleaner_admin_data_403(self, admin_h, s):
        cl = _create_user(admin_h, s, suffix=f"Cl{uuid.uuid4().hex[:6]}",
                          role="cleaner", password=TEST_FIXTURE_PASSWORD)
        rl = s.post(f"{API}/auth/login", json={
            "username": cl["login_username"], "password": TEST_FIXTURE_PASSWORD,
            "device_id": "dev-cl"})
        cl_h = {"Authorization": f"Bearer {rl.json()['access_token']}"}
        me = rl.json()["user"]
        g = s.get(f"{API}/users/{me['id']}/admin-data", headers=cl_h)
        assert g.status_code == 403


# ---------- 10. admin_data_status indicator ----------

class TestAdminDataStatus:
    def test_dipendente_missing_da_completare(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"Ind{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD, tipo_rapporto="dipendente")
        one = s.get(f"{API}/users/{u['id']}", headers=admin_h).json()
        assert one["admin_data_status"] == "da_completare"
        s.put(f"{API}/users/{u['id']}/admin-data", headers=admin_h,
              json={"tax_code": "AAA", "iban": "IT01"})
        one2 = s.get(f"{API}/users/{u['id']}", headers=admin_h).json()
        assert one2["admin_data_status"] == "completi"

    def test_piva_requires_vat(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"PIVA{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD, tipo_rapporto="collaboratore_piva")
        s.put(f"{API}/users/{u['id']}/admin-data", headers=admin_h,
              json={"tax_code": "AAA", "iban": "IT01"})
        one = s.get(f"{API}/users/{u['id']}", headers=admin_h).json()
        assert one["admin_data_status"] == "da_completare"
        s.put(f"{API}/users/{u['id']}/admin-data", headers=admin_h,
              json={"vat_number": "12345678901"})
        one2 = s.get(f"{API}/users/{u['id']}", headers=admin_h).json()
        assert one2["admin_data_status"] == "completi"


# ---------- 11. CONTRACT / TIPO_RAPPORTO ----------

class TestContract:
    def test_determinato_needs_end_date(self, admin_h, s):
        r = s.post(f"{API}/users", headers=admin_h, json={
            "first_name": "TEST", "last_name": f"Det{uuid.uuid4().hex[:6]}",
            "role": "cleaner", "tipo_rapporto": "dipendente",
            "contract": {"type": "determinato"}})
        assert r.status_code == 400

    def test_apprendistato_stored(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"App{uuid.uuid4().hex[:6]}", role="cleaner",
                         password=TEST_FIXTURE_PASSWORD, extra={"contract": {
                             "type": "apprendistato", "weekly_hours": 30,
                             "transformation_date": "2027-01-01",
                             "apprenticeship_end": "2028-01-01"}})
        one = s.get(f"{API}/users/{u['id']}", headers=admin_h).json()
        c = one["contract"]
        assert c["type"] == "apprendistato"
        assert c["weekly_hours"] == 30
        assert c["transformation_date"] == "2027-01-01"
        assert c["apprenticeship_end"] == "2028-01-01"

    def test_contract_status_from_end_date(self, admin_h, s):
        from datetime import date, timedelta
        end = (date.today() - timedelta(days=1)).isoformat()
        u = _create_user(admin_h, s, suffix=f"Exp{uuid.uuid4().hex[:6]}", role="cleaner",
                         password=TEST_FIXTURE_PASSWORD, extra={"contract": {"type": "determinato", "end_date": end}})
        one = s.get(f"{API}/users/{u['id']}", headers=admin_h).json()
        assert one["contract_status"] == "scaduto"

    def test_invalid_tipo_rapporto(self, admin_h, s):
        r = s.post(f"{API}/users", headers=admin_h, json={
            "first_name": "TEST", "last_name": "BadTipo",
            "role": "cleaner", "tipo_rapporto": "freelance_alien"})
        assert r.status_code == 400


# ---------- 12. EXCLUDED_FROM_PLANNING ----------

class TestExcludedPlanning:
    def test_cleaner_excluded_not_in_cleaning_lists(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"ExCl{uuid.uuid4().hex[:6]}",
                         role="cleaner", password=TEST_FIXTURE_PASSWORD,
                         extra={"excluded_from_planning": True})
        lst = s.get(f"{API}/cleaning-tasks/cleaners", headers=admin_h).json()
        ids = [c.get("id") for c in (lst if isinstance(lst, list) else lst.get("cleaners", []))]
        assert u["id"] not in ids
        # cleaning-board cleaners list
        from datetime import date
        cb = s.get(f"{API}/cleaning-board", headers=admin_h, params={"date": date.today().isoformat()})
        assert cb.status_code == 200
        assert u["id"] not in [c["id"] for c in cb.json().get("cleaners", [])]

    def test_rider_excluded_not_in_riders(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"ExRd{uuid.uuid4().hex[:6]}",
                         role="rider", password=TEST_FIXTURE_PASSWORD,
                         extra={"excluded_from_planning": True})
        lst = s.get(f"{API}/logistics/riders", headers=admin_h).json()
        rows = lst if isinstance(lst, list) else lst.get("riders", [])
        assert u["id"] not in [r.get("id") or r.get("user_id") for r in rows]


# ---------- 13. PUBLIC REGISTER DISABLED / USR ----------

class TestPublicRegister:
    def test_register_disabled(self, s):
        r = s.post(f"{API}/auth/register", json={
            "email": "TEST_reg@example.com", "password": "Whatever1!",
            "name": "Ext", "role": "cleaner"})
        assert r.status_code == 403


# ---------- 14. REGRESSION LIST / USR / login_username uniqueness ----------

class TestRegression:
    def test_usr_0000_and_0001_present(self, admin_h, s):
        lst = s.get(f"{API}/users", headers=admin_h).json()
        codes = {u.get("usr_code"): u for u in lst if u.get("usr_code")}
        assert "USR-0000" in codes, "USR-0000 (Nicolò Tonini) mancante"
        assert "USR-0001" in codes, "USR-0001 (Super Admin tecnico) mancante"
        assert codes["USR-0000"]["activation_status"] == "pending"
        assert codes["USR-0001"]["activation_status"] == "active"
        # Ordered by usr_code ascending
        just_ordered = sorted([u.get("usr_code") or "USR-9999" for u in lst])
        actual = [u.get("usr_code") or "USR-9999" for u in lst]
        assert actual == just_ordered

    def test_login_username_uniqueness_on_put(self, admin_h, s):
        u1 = _create_user(admin_h, s, suffix=f"LU1{uuid.uuid4().hex[:6]}", role="cleaner", password=TEST_FIXTURE_PASSWORD)
        u2 = _create_user(admin_h, s, suffix=f"LU2{uuid.uuid4().hex[:6]}", role="cleaner", password=TEST_FIXTURE_PASSWORD)
        r = s.put(f"{API}/users/{u2['id']}", headers=admin_h,
                  json={"login_username": u1["login_username"]})
        assert r.status_code == 400

    def test_login_username_invalid_format(self, admin_h, s):
        u = _create_user(admin_h, s, suffix=f"LUF{uuid.uuid4().hex[:6]}", role="cleaner", password=TEST_FIXTURE_PASSWORD)
        r = s.put(f"{API}/users/{u['id']}", headers=admin_h,
                  json={"login_username": "not-an-email"})
        assert r.status_code == 400

    def test_service_status_and_audit_admin(self, admin_h, s):
        me = s.get(f"{API}/auth/me", headers=admin_h).json()
        st = s.get(f"{API}/users/{me['id']}/service-status", headers=admin_h)
        assert st.status_code == 200
        aud = s.get(f"{API}/users/{me['id']}/audit", headers=admin_h)
        assert aud.status_code == 200
