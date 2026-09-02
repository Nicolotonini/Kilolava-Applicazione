from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""Iteration 31 — Modulo Utenti Interni: CRUD, ruoli, contratti, disponibilità, permessi, audit, GPS."""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        for line in open("/app/frontend/.env"):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except (OSError, IOError):
        pass
    return ""


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "test_user@kilolava.com"
ADMIN_PASS = TEST_ADMIN_PASSWORD

TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
TOMORROW = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
DAY_20 = (datetime.now(timezone.utc) + timedelta(days=20)).strftime("%Y-%m-%d")
DAY_3 = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
YESTERDAY = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")


# ---- session/fixtures ----
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        return None
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_tok():
    tok = _login(ADMIN_EMAIL, ADMIN_PASS)
    assert tok, "Admin login failed"
    return tok


@pytest.fixture(scope="module")
def created(admin_tok):
    """Registry per cleanup finale: user_ids create dai test, task_ids, richieste, fermate."""
    reg = {"users": [], "cleaning_tasks": [], "logistics_tasks": [], "fabbisogni": [], "structures": [], "clients": []}
    yield reg
    # cleanup via motor async
    import asyncio
    import motor.motor_asyncio

    env = {}
    try:
        for line in open("/app/backend/.env"):
            if "=" in line:
                k, v = line.strip().split("=", 1)
                env[k] = v.strip('"').strip("'")
    except (OSError, IOError):
        return

    async def _cleanup():
        client = motor.motor_asyncio.AsyncIOMotorClient(env.get("MONGO_URL", "mongodb://localhost:27017"))
        db = client[env.get("DB_NAME", "test_database")]
        uids = reg["users"]
        # storico test
        await db.day_availability.delete_many({"user_id": {"$in": uids}})
        await db.cleaning_tasks.delete_many({"assigned_cleaner_ids": {"$in": uids}})
        await db.logistics_tasks.delete_many({"rider_id": {"$in": uids}})
        await db.fabbisogni.delete_many({"structure_id": {"$in": reg["structures"]}})
        await db.fabbisogni.delete_many({"created_by": {"$in": uids}})
        await db.structures.delete_many({"id": {"$in": reg["structures"]}})
        await db.clients.delete_many({"id": {"$in": reg["clients"]}})
        await db.segnalazioni.delete_many({"reported_by": {"$in": uids}})
        await db.laundry_jobs.delete_many({"registered_by": {"$in": uids}})
        await db.users.delete_many({"id": {"$in": uids}})
        client.close()

    try:
        asyncio.run(_cleanup())
    except (RuntimeError, Exception) as e:
        print("cleanup err:", e)


def _create_user(admin_tok, email_suffix, role, **kw):
    payload = {
        "email": f"test_iter31_{email_suffix}@kilolava.com",
        "password": TEST_ADMIN_PASSWORD,
        "first_name": f"Test{email_suffix.title()}",
        "last_name": "Iter31",
        "role": role,
        "language": "it",
    }
    payload.update(kw)
    r = requests.post(f"{API}/users", json=payload, headers=_h(admin_tok), timeout=15)
    return r


# ===================== CASO A: admin info =====================
def test_caso_a_admin_has_usr_code_and_defaults(admin_tok):
    r = requests.get(f"{API}/users", params={"internal": True}, headers=_h(admin_tok), timeout=15)
    assert r.status_code == 200
    users = r.json()
    admin = next((u for u in users if u["email"] == ADMIN_EMAIL), None)
    assert admin is not None, "Admin non trovato in /users?internal=1"
    assert admin.get("usr_code") == "USR-0001", f"Admin USR: {admin.get('usr_code')}"
    assert admin.get("standard_available") is True
    contract = admin.get("contract") or {}
    assert contract.get("type") == "indeterminato"
    # response contains audit fields
    for k in ("usr_code", "extra_roles", "standard_available", "contract", "contract_status", "last_login"):
        assert k in admin, f"Manca campo {k}"


# ===================== CASO A2: POST /users validazioni =====================
def test_caso_a2_create_determinato_without_end_date_400(admin_tok):
    r = _create_user(admin_tok, "det_noend", "cleaner", contract={"type": "determinato"})
    assert r.status_code == 400
    assert "Data fine" in r.json().get("detail", "")


def test_caso_a2_create_cleaner_determinato_ok_and_usr_progressivo(admin_tok, created):
    r = _create_user(admin_tok, "clean1", "cleaner", contract={"type": "determinato", "start_date": TODAY, "end_date": DAY_20})
    assert r.status_code == 200 or r.status_code == 201, r.text
    u = r.json()
    created["users"].append(u["id"])
    assert u["usr_code"].startswith("USR-")
    # progressivo: numero > USR-0001
    assert int(u["usr_code"].split("-")[1]) >= 2
    assert u["contract_status"] == "scade_30", f"contract_status={u.get('contract_status')}"


def test_caso_a2_create_rider_with_extra_cleaner_ok(admin_tok, created):
    r = _create_user(admin_tok, "rider_multi", "rider", extra_roles=["cleaner"], contract={"type": "indeterminato", "start_date": TODAY})
    assert r.status_code in (200, 201), r.text
    u = r.json()
    created["users"].append(u["id"])
    assert "cleaner" in (u.get("extra_roles") or [])


def test_caso_a2_extra_roles_invalid_400(admin_tok):
    r = _create_user(admin_tok, "badextra", "rider", extra_roles=["bogus_role"])
    assert r.status_code == 400
    assert "Ruolo aggiuntivo non valido" in r.json().get("detail", "")


def test_caso_a2_duplicate_email_400(admin_tok, created):
    # Riprova stesso email di clean1
    r = _create_user(admin_tok, "clean1", "cleaner")
    assert r.status_code == 400
    assert "gia registrata" in r.json().get("detail", "").lower() or "gi" in r.json().get("detail", "").lower()


def test_caso_a2_get_user_all_fields(admin_tok, created):
    uid = created["users"][0]
    r = requests.get(f"{API}/users/{uid}", headers=_h(admin_tok), timeout=10)
    assert r.status_code == 200
    d = r.json()
    for k in ("usr_code", "extra_roles", "standard_available", "contract", "contract_status", "last_login"):
        assert k in d


# ===================== CASO B: contract_status =====================
def test_caso_b_contract_status_scade7(admin_tok, created):
    r = _create_user(admin_tok, "det_7d", "cleaner", contract={"type": "determinato", "end_date": DAY_3})
    assert r.status_code in (200, 201)
    u = r.json()
    created["users"].append(u["id"])
    assert u["contract_status"] == "scade_7", f"got {u['contract_status']}"


def test_caso_b_contract_status_scaduto_but_active(admin_tok, created):
    r = _create_user(admin_tok, "det_expired", "cleaner", contract={"type": "determinato", "end_date": YESTERDAY})
    assert r.status_code in (200, 201)
    u = r.json()
    created["users"].append(u["id"])
    assert u["contract_status"] == "scaduto"
    assert u["is_active"] is True, "L'utente scaduto DEVE restare attivo (no disattivazione automatica)"


# ===================== CASO C: standard_available + day_availability =====================
def test_caso_c_rider_giorno_libero_non_proposto(admin_tok, created):
    # Crea rider dedicato
    r = _create_user(admin_tok, "rider_c", "rider", contract={"type": "indeterminato"})
    assert r.status_code in (200, 201)
    rider_id = r.json()["id"]
    created["users"].append(rider_id)

    # Prima: rider disponibile → deve comparire in /logistics/riders
    lr = requests.get(f"{API}/logistics/riders", headers=_h(admin_tok), timeout=10)
    assert lr.status_code == 200
    ids = [x["id"] for x in lr.json()]
    assert rider_id in ids

    # Imposta day_availability day_off oggi
    da = requests.post(f"{API}/day-availability",
                       json={"user_id": rider_id, "role": "rider", "date": TODAY, "day_off": True},
                       headers=_h(admin_tok), timeout=10)
    # potrebbe essere PUT o POST — best effort
    if da.status_code >= 400:
        da = requests.put(f"{API}/day-availability",
                          json={"user_id": rider_id, "role": "rider", "date": TODAY, "day_off": True},
                          headers=_h(admin_tok), timeout=10)

    # /consegne/giri/proponi: rider con day_off non deve comparire tra i disponibili
    pr = requests.post(f"{API}/consegne/giri/proponi", json={"date": TODAY}, headers=_h(admin_tok), timeout=20)
    assert pr.status_code == 200, pr.text
    riders_out = [r["rider_id"] for r in pr.json().get("riders", [])]
    assert rider_id not in riders_out, f"Rider {rider_id} con day_off NON deve comparire in proponi oggi"


# ===================== CASO D: multi-ruolo =====================
def test_caso_d_multiruolo_appare_in_entrambi(admin_tok, created):
    # rider + extra cleaner
    r = _create_user(admin_tok, "multi_d", "rider", extra_roles=["cleaner"])
    assert r.status_code in (200, 201)
    uid = r.json()["id"]
    created["users"].append(uid)

    lr = requests.get(f"{API}/logistics/riders", headers=_h(admin_tok), timeout=10)
    ids = [x["id"] for x in lr.json()]
    assert uid in ids, "Multi-role deve comparire come rider"

    # /users?role=cleaner deve includerlo (via extra_roles)
    cr = requests.get(f"{API}/users", params={"role": "cleaner"}, headers=_h(admin_tok), timeout=10)
    assert cr.status_code == 200
    cids = [x["id"] for x in cr.json()]
    assert uid in cids, "Multi-role deve comparire tra cleaner (via extra_roles)"


def test_caso_d_standard_unavailable_not_shown(admin_tok, created):
    r = _create_user(admin_tok, "off_std", "rider", standard_available=False)
    assert r.status_code in (200, 201)
    uid = r.json()["id"]
    created["users"].append(uid)

    lr = requests.get(f"{API}/logistics/riders", headers=_h(admin_tok), timeout=10)
    ids = [x["id"] for x in lr.json()]
    assert uid not in ids, "standard_available=False → NON deve comparire in /logistics/riders"


# ===================== CASO E: disattivazione =====================
def test_caso_e_disattivato_no_login_no_riders(admin_tok, created):
    r = _create_user(admin_tok, "toggle_e", "rider")
    uid = r.json()["id"]
    created["users"].append(uid)

    # Toggle
    t = requests.put(f"{API}/users/{uid}/toggle-active", headers=_h(admin_tok), timeout=10)
    assert t.status_code == 200
    assert t.json()["is_active"] is False

    # Non in /logistics/riders
    lr = requests.get(f"{API}/logistics/riders", headers=_h(admin_tok), timeout=10)
    assert uid not in [x["id"] for x in lr.json()]

    # Login con disattivato → 403
    lg = requests.post(f"{API}/auth/login",
                       json={"email": f"test_iter31_toggle_e@kilolava.com", "password": TEST_ADMIN_PASSWORD}, timeout=10)
    assert lg.status_code == 403, f"expected 403 for deactivated, got {lg.status_code}"


# ===================== CASO F: delete + no-reuse USR =====================
def test_caso_f_delete_and_usr_not_reused(admin_tok, created):
    # crea utente senza storico → delete OK
    r = _create_user(admin_tok, "delete_f", "cleaner")
    uid = r.json()["id"]
    usr_code_deleted = r.json()["usr_code"]
    dr = requests.delete(f"{API}/users/{uid}", headers=_h(admin_tok), timeout=10)
    assert dr.status_code == 200

    # Crea nuovo utente → deve avere USR successivo, non riusato
    r2 = _create_user(admin_tok, "post_delete_f", "cleaner")
    assert r2.status_code in (200, 201)
    new_uid = r2.json()["id"]
    new_code = r2.json()["usr_code"]
    created["users"].append(new_uid)
    assert new_code != usr_code_deleted, "USR non deve essere riusato"
    assert int(new_code.split("-")[1]) > int(usr_code_deleted.split("-")[1])


def test_caso_f_delete_with_history_400(admin_tok, created):
    # Crea rider e assegnagli una fermata (dopo aver creato client+structure+richiesta)
    r = _create_user(admin_tok, "rider_hist", "rider")
    rid = r.json()["id"]
    created["users"].append(rid)

    # client
    cr = requests.post(f"{API}/clients",
                       json={"name": "TEST_iter31_Client", "primary_contact_name": "Test", "contact_email": "c_iter31@example.com"},
                       headers=_h(admin_tok), timeout=10)
    if cr.status_code >= 400:
        pytest.skip(f"cannot create client: {cr.text}")
    cid = cr.json()["id"]
    created["clients"].append(cid)

    # structure
    sr = requests.post(f"{API}/structures",
                       json={"client_id": cid, "name": "TEST_iter31_Struct", "type": "apartment",
                             "address": "Via dei Calderai 8, Trieste"},
                       headers=_h(admin_tok), timeout=10)
    if sr.status_code >= 400:
        pytest.skip(f"cannot create structure: {sr.text}")
    sid = sr.json()["id"]
    created["structures"].append(sid)

    # richiesta
    rq = requests.post(f"{API}/consegne/richieste",
                       json={"structure_id": sid, "items": [{"name": "Test item", "qty": 1}], "date_needed": TODAY},
                       headers=_h(admin_tok), timeout=10)
    if rq.status_code >= 400:
        pytest.skip(f"cannot create richiesta: {rq.text}")
    riq = rq.json()
    # conferma
    requests.put(f"{API}/consegne/richieste/{riq['id']}/conferma", headers=_h(admin_tok), timeout=10)
    created["fabbisogni"].append(riq["id"])

    # fermata assegnata al rider
    fm = requests.post(f"{API}/consegne/fermate",
                       json={"richiesta_ids": [riq["id"]], "date": TODAY, "rider_id": rid},
                       headers=_h(admin_tok), timeout=10)
    if fm.status_code >= 400:
        pytest.skip(f"cannot create fermata: {fm.text}")
    created["logistics_tasks"].append(fm.json()["id"])

    # ora DELETE deve fallire con 400
    dr = requests.delete(f"{API}/users/{rid}", headers=_h(admin_tok), timeout=10)
    assert dr.status_code == 400, f"expected 400 for user with history, got {dr.status_code}: {dr.text}"
    assert "storico" in dr.json().get("detail", "").lower()


# ===================== CASO G: permessi cleaner/laundry =====================
def test_caso_g_cleaner_forbidden(admin_tok, created):
    r = _create_user(admin_tok, "cln_perm", "cleaner")
    uid = r.json()["id"]
    created["users"].append(uid)
    tok = _login(f"test_iter31_cln_perm@kilolava.com", TEST_ADMIN_PASSWORD)
    assert tok, "cleaner login failed"

    r1 = requests.post(f"{API}/magazzino/movimenti/fake-id/storno",
                       json={"motivo": "errore"}, headers=_h(tok), timeout=10)
    assert r1.status_code == 403, f"cleaner storno should be 403, got {r1.status_code}"

    r2 = requests.get(f"{API}/assistant/sessions", headers=_h(tok), timeout=10)
    assert r2.status_code == 403

    r3 = requests.get(f"{API}/users", headers=_h(tok), timeout=10)
    assert r3.status_code == 403


def test_caso_g_laundry_permissions(admin_tok, created):
    r = _create_user(admin_tok, "lndry", "laundry")
    if r.status_code >= 400:
        pytest.skip(f"cannot create laundry user: {r.text}")
    uid = r.json()["id"]
    created["users"].append(uid)
    tok = _login(f"test_iter31_lndry@kilolava.com", TEST_ADMIN_PASSWORD)
    assert tok

    # GET jobs → 200
    r1 = requests.get(f"{API}/lavanderia/jobs", headers=_h(tok), timeout=10)
    assert r1.status_code == 200, r1.text

    # GET history → 403 (ops only)
    r2 = requests.get(f"{API}/lavanderia/history", headers=_h(tok), timeout=10)
    assert r2.status_code == 403

    # GET magazzino/movimenti → 403
    r3 = requests.get(f"{API}/magazzino/movimenti", headers=_h(tok), timeout=10)
    assert r3.status_code == 403

    # POST segnalazione → 200
    r4 = requests.post(f"{API}/segnalazioni",
                       json={"title": "Test laundry segn", "type": "other", "priority": "normal"},
                       headers=_h(tok), timeout=10)
    assert r4.status_code == 200, r4.text


# ===================== CASO H: service-status + audit =====================
def test_caso_h_service_status(admin_tok, created):
    # utente senza sessione: in_service=false, gps_state=off
    uid = created["users"][0]
    r = requests.get(f"{API}/users/{uid}/service-status", headers=_h(admin_tok), timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d["in_service"] is False
    assert d["gps_state"] == "off"


def test_caso_h_service_status_cleaner_403(admin_tok, created):
    # crea cleaner e prova a chiamare service-status
    r = _create_user(admin_tok, "svc_403", "cleaner")
    uid = r.json()["id"]
    created["users"].append(uid)
    tok = _login(f"test_iter31_svc_403@kilolava.com", TEST_ADMIN_PASSWORD)
    r2 = requests.get(f"{API}/users/{uid}/service-status", headers=_h(tok), timeout=10)
    assert r2.status_code == 403


def test_caso_h_audit_after_update(admin_tok, created):
    uid = created["users"][0]
    # cambia extra_roles
    r = requests.put(f"{API}/users/{uid}", json={"extra_roles": ["rider"]}, headers=_h(admin_tok), timeout=10)
    assert r.status_code == 200
    ar = requests.get(f"{API}/users/{uid}/audit", headers=_h(admin_tok), timeout=10)
    assert ar.status_code == 200
    events = ar.json()
    assert len(events) >= 1
    actions = [e["action"] for e in events]
    assert "user.update" in actions or "user.create" in actions


# ===================== CASO D2: warning sovrapposizione =====================
def test_caso_d2_warning_sovrapposizione(admin_tok, created):
    # Utente multi-ruolo (rider + cleaner)
    r = _create_user(admin_tok, "multi_d2", "rider", extra_roles=["cleaner"])
    uid = r.json()["id"]
    created["users"].append(uid)

    # client + structure
    cr = requests.post(f"{API}/clients",
                       json={"name": "TEST_iter31_D2_Client", "primary_contact_name": "T", "contact_email": "d2@example.com"},
                       headers=_h(admin_tok), timeout=10)
    if cr.status_code >= 400:
        pytest.skip("cannot create client for D2")
    cid = cr.json()["id"]
    created["clients"].append(cid)
    sr = requests.post(f"{API}/structures",
                       json={"client_id": cid, "name": "TEST_iter31_D2_Struct", "type": "apartment",
                             "address": "Via San Nicolò 30, Trieste"},
                       headers=_h(admin_tok), timeout=10)
    if sr.status_code >= 400:
        pytest.skip("cannot create struct for D2")
    sid = sr.json()["id"]
    created["structures"].append(sid)

    # cleaning task assegnata al multi-role per oggi
    ct = requests.post(f"{API}/cleaning-tasks",
                       json={"structure_id": sid, "date": TODAY, "scheduled_time": "10:00",
                             "assigned_cleaner_ids": [uid], "predicted_duration_minutes": 60},
                       headers=_h(admin_tok), timeout=10)
    if ct.status_code >= 400:
        pytest.skip(f"cannot create cleaning task: {ct.text}")
    created["cleaning_tasks"].append(ct.json()["id"])

    # richiesta + fermata unassigned
    rq = requests.post(f"{API}/consegne/richieste",
                       json={"structure_id": sid, "items": [{"name": "Item d2", "qty": 1}], "date_needed": TODAY},
                       headers=_h(admin_tok), timeout=10)
    if rq.status_code >= 400:
        pytest.skip(f"cannot create richiesta: {rq.text}")
    riq = rq.json()
    requests.put(f"{API}/consegne/richieste/{riq['id']}/conferma", headers=_h(admin_tok), timeout=10)
    fm = requests.post(f"{API}/consegne/fermate",
                       json={"richiesta_ids": [riq["id"]], "date": TODAY},
                       headers=_h(admin_tok), timeout=10)
    if fm.status_code >= 400:
        pytest.skip(f"cannot create fermata: {fm.text}")
    fid = fm.json()["id"]
    created["logistics_tasks"].append(fid)

    # Conferma giro con assignment sul rider multi-role → warning atteso
    cnf = requests.post(f"{API}/consegne/giri/conferma",
                        json={"date": TODAY, "assignments": [{"fermata_id": fid, "rider_id": uid, "route_order": 1}]},
                        headers=_h(admin_tok), timeout=15)
    assert cnf.status_code == 200, cnf.text
    body = cnf.json()
    assert "warnings" in body
    assert any("Sovrapposizione" in w for w in body["warnings"]), f"warnings: {body['warnings']}"


# ===================== Reset password + last_login =====================
def test_reset_password_short_400(admin_tok, created):
    uid = created["users"][0]
    r = requests.post(f"{API}/users/{uid}/reset-password", json={"new_password": "short"},
                      headers=_h(admin_tok), timeout=10)
    assert r.status_code == 400


def test_reset_password_ok_and_last_login(admin_tok, created):
    # crea utente dedicato per non compromettere gli altri
    r = _create_user(admin_tok, "reset_ok", "cleaner")
    uid = r.json()["id"]
    email = "test_iter31_reset_ok@kilolava.com"
    created["users"].append(uid)

    # reset password come admin
    rr = requests.post(f"{API}/users/{uid}/reset-password",
                       json={"new_password": TEST_FIXTURE_PASSWORD + "-new"}, headers=_h(admin_tok), timeout=10)
    assert rr.status_code == 200

    # login con vecchia password fallisce
    old = requests.post(f"{API}/auth/login", json={"email": email, "password": TEST_ADMIN_PASSWORD}, timeout=10)
    assert old.status_code == 401

    # login con nuova → 200 e last_login aggiornato
    new = requests.post(f"{API}/auth/login", json={"email": email, "password": TEST_FIXTURE_PASSWORD + "-new"}, timeout=10)
    assert new.status_code == 200

    ur = requests.get(f"{API}/users/{uid}", headers=_h(admin_tok), timeout=10)
    assert ur.json().get("last_login")


def test_reset_password_non_admin_403(admin_tok, created):
    # cleaner non può resettare
    r = _create_user(admin_tok, "cln_reset_403", "cleaner")
    uid_cleaner = r.json()["id"]
    created["users"].append(uid_cleaner)
    tok = _login("test_iter31_cln_reset_403@kilolava.com", TEST_ADMIN_PASSWORD)
    target = created["users"][0]
    rr = requests.post(f"{API}/users/{target}/reset-password",
                       json={"new_password": TEST_FIXTURE_PASSWORD + "-new"}, headers=_h(tok), timeout=10)
    assert rr.status_code == 403


# ===================== PUT /users validations =====================
def test_put_users_role_change_internal_to_client_400(admin_tok, created):
    uid = created["users"][0]  # è cleaner
    r = requests.put(f"{API}/users/{uid}", json={"role": "client"}, headers=_h(admin_tok), timeout=10)
    assert r.status_code == 400


def test_put_users_contract_determinato_no_end_date_400(admin_tok, created):
    uid = created["users"][0]
    r = requests.put(f"{API}/users/{uid}",
                     json={"contract": {"type": "determinato", "start_date": TODAY}},
                     headers=_h(admin_tok), timeout=10)
    assert r.status_code == 400


# ===================== REGRESSIONE minima =====================
def test_regressione_admin_can_access_key_endpoints(admin_tok):
    endpoints = ["/cleaning-tasks", "/assistant/sessions"]
    for ep in endpoints:
        r = requests.get(f"{API}{ep}", headers=_h(admin_tok), timeout=10)
        assert r.status_code == 200, f"regressione: {ep} → {r.status_code}"
