from testenv import TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
"""GATE FASE 2 — Permission Matrix definitiva: coerenza sidebar/UI/API per ogni ruolo. Fixture temporanee + cleanup."""
import os
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
API = os.environ["REACT_APP_BACKEND_URL"] + "/api"

results = []


def check(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("PASS " if ok else "FAIL ") + name + (f" [{extra}]" if extra else ""))


admin_tok = requests.post(f"{API}/auth/login", json={
    "username": TEST_ADMIN_USERNAME, "password": TEST_ADMIN_PASSWORD}).json()["access_token"]
A = {"Authorization": f"Bearer {admin_tok}"}

created_users = []


def mk_user(role, extra=None):
    r = requests.post(f"{API}/users", headers=A, json={
        "first_name": f"TEST_GATE2_{role}", "last_name": "Matrix", "role": role,
        "password": TEST_FIXTURE_PASSWORD, "extra_roles": extra or []})
    assert r.status_code == 200, r.text
    u = r.json()
    created_users.append(u["id"])
    login = requests.post(f"{API}/auth/login", json={
        "username": u["login_username"] or u["email"], "password": TEST_FIXTURE_PASSWORD}).json()
    return u, {"Authorization": f"Bearer {login['access_token']}"}, login


try:
    # GATE 1: Laundry — vede SOLO Lavorazioni (+segnalazione propria), tutto il resto 403
    lu, L, _ = mk_user("laundry")
    check("Laundry GET /lavanderia/jobs = 200", requests.get(f"{API}/lavanderia/jobs", headers=L).status_code == 200)
    check("Laundry GET /lavanderia/history = 403 (ops-only)", requests.get(f"{API}/lavanderia/history", headers=L).status_code == 403)
    check("Laundry GET /clients = 403", requests.get(f"{API}/clients", headers=L).status_code == 403)
    check("Laundry GET /dashboard/stats = 403", requests.get(f"{API}/dashboard/stats", headers=L).status_code == 403)
    check("Laundry GET /users = 403", requests.get(f"{API}/users", headers=L).status_code == 403)
    check("Laundry GET /segnalazioni (lista ops) = 403", requests.get(f"{API}/segnalazioni", headers=L).status_code == 403)
    check("Laundry GET /activity = 403", requests.get(f"{API}/activity", headers=L).status_code == 403)

    # GATE 2: permissions unificati ruolo+extra_roles nel login/me
    cu, C, login_resp = mk_user("cleaner", extra=["rider"])
    perms = (login_resp.get("user") or {}).get("permissions") or []
    if not perms:
        me = requests.get(f"{API}/auth/me", headers=C)
        perms = me.json().get("permissions", []) if me.status_code == 200 else []
    check("Multi-ruolo: permessi cleaner presenti", "tasks.own.read" in perms, str(perms))
    check("Multi-ruolo: permessi rider (extra) presenti", "logistics.own.read" in perms)
    check("Multi-ruolo: keys.own presenti", "keys.own.read" in perms)

    # GATE 3: OM — ogni voce sidebar visibile ha API accessibile (matrice ↔ nav ↔ API)
    om, OM, _ = mk_user("operations_manager")
    om_endpoints = [
        ("dashboard", "/dashboard/stats"),
        ("mappa", "/mappa/personale"),
        ("assistant", "/assistant/sessions"),
        ("clients", "/clients"),
        ("structures", "/structures"),
        ("calendar", "/events"),
        ("cleaning", "/cleaning-tasks"),
        ("segnalazioni", "/segnalazioni"),
        ("consegne", "/consegne/giornata?date=2026-06-15"),
        ("magazzino-strutture", "/magazzino/strutture/overview"),
        ("magazzino-generale", "/magazzino/generale/overview"),
        ("lavanderia-privata", "/lavanderia/jobs"),
        ("maintenance", "/maintenance/issues"),
        ("documents", "/documents"),
        ("reports", "/reports/dashboard"),
        ("users (read)", "/users?internal=1"),
        ("cataloghi", "/magazzino/catalog/noleggio"),
        ("kit", "/magazzino/kits"),
        ("activity", "/activity"),
        ("keys settings (read, operativo)", "/settings/keys"),
    ]
    for label, ep in om_endpoints:
        rc = requests.get(f"{API}{ep}", headers=OM).status_code
        check(f"OM nav '{label}' -> GET {ep} = 200", rc == 200, f"got {rc}")
    # Hardening finale: OM NON è Super Admin tecnico → integrazioni/impostazioni tecniche = 403
    check("OM integrazioni (google-sheets status) = 403",
          requests.get(f"{API}/integrations/google-sheets/status", headers=OM).status_code == 403)
    check("OM PUT /settings/keys = 403", requests.put(f"{API}/settings/keys", headers=OM, json={"box_capacity": 60}).status_code == 403)
    check("OM POST /users = 403 (mutazioni utenti solo admin)",
          requests.post(f"{API}/users", headers=OM, json={"first_name": "X", "role": "cleaner"}).status_code == 403)

    # GATE 4: ruoli operativi non entrano nel backoffice
    ru, R, _ = mk_user("rider")
    check("Rider GET /reports/dashboard = 403", requests.get(f"{API}/reports/dashboard", headers=R).status_code == 403)
    check("Rider GET /settings/keys = 403", requests.get(f"{API}/settings/keys", headers=R).status_code == 403)
    check("Rider GET /activity = 403", requests.get(f"{API}/activity", headers=R).status_code == 403)
finally:
    for uid in created_users:
        requests.delete(f"{API}/users/{uid}", headers=A)
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
