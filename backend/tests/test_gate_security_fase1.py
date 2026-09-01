"""GATE SECURITY Fase 1 — fixture temporanee, verifica scoping, cleanup totale."""
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
    "username": "admin@kilolava.it", "password": "TestPass123!"}).json()["access_token"]
A = {"Authorization": f"Bearer {admin_tok}"}

created_users, created_clients = [], []


def mk_user(role, extra=None, client_id=None):
    r = requests.post(f"{API}/users", headers=A, json={
        "first_name": f"TEST_GATE_{role}", "last_name": "Sec", "role": role,
        "password": "GateTest123!", "extra_roles": extra or [], "client_id": client_id})
    assert r.status_code == 200, r.text
    u = r.json()
    created_users.append(u["id"])
    tok = requests.post(f"{API}/auth/login", json={
        "username": u["login_username"] or u["email"], "password": "GateTest123!"}).json()["access_token"]
    return u, {"Authorization": f"Bearer {tok}"}


def mk_client(name):
    r = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "first_name": name, "last_name": "TestGate",
        "email": f"{name.lower()}@testgate.local", "phone": "000"})
    assert r.status_code == 200, r.text
    c = r.json()
    created_clients.append(c["id"])
    return c


def mk_portal_user(client_id, name):
    import uuid
    r = requests.post(f"{API}/users", headers=A, json={
        "first_name": f"TEST_GATE_{name}", "last_name": "Portal", "role": "client",
        "password": "GateTest123!", "client_id": client_id,
        "login_username": f"test.gate.{name.lower()}.{uuid.uuid4().hex[:6]}@kilolava.it"})
    assert r.status_code == 200, r.text
    u = r.json()
    created_users.append(u["id"])
    tok = requests.post(f"{API}/auth/login", json={
        "username": u["login_username"], "password": "GateTest123!"}).json()["access_token"]
    return u, {"Authorization": f"Bearer {tok}"}


try:
    _, CL = mk_user("cleaner")
    _, RD = mk_user("rider")
    _, OM = mk_user("operations_manager")

    # Fixture clienti + strutture
    ca = mk_client("ClienteA")
    cb = mk_client("ClienteB")
    ra = requests.post(f"{API}/structures", headers=A, json={
        "client_id": ca["id"], "name": "TEST_GATE Struttura A", "address": "Via Test 1, Trieste",
        "structure_type": "apartment"})
    rb = requests.post(f"{API}/structures", headers=A, json={
        "client_id": cb["id"], "name": "TEST_GATE Struttura B", "address": "Via Test 2, Trieste",
        "structure_type": "apartment"})
    assert ra.status_code == 200 and rb.status_code == 200, (ra.text, rb.text)
    sa, sb = ra.json(), rb.json()
    _, PA = mk_portal_user(ca["id"], "PortalA")

    # GATE 1: Cleaner -> tutti i clienti = 403
    check("Cleaner GET /clients = 403", requests.get(f"{API}/clients", headers=CL).status_code == 403)
    check("Cleaner GET /clients/{B} = 403", requests.get(f"{API}/clients/{cb['id']}", headers=CL).status_code == 403)
    check("Cleaner GET /structures = 403", requests.get(f"{API}/structures", headers=CL).status_code == 403)
    check("Cleaner GET /structures/{B} = 403", requests.get(f"{API}/structures/{sb['id']}", headers=CL).status_code == 403)
    check("Cleaner GET /events = 403", requests.get(f"{API}/events", headers=CL).status_code == 403)
    # 422 = validazione Pydantic su body vuoto (prima della guardia); con body valido scatta 403
    check("Cleaner POST /inventory/movements bloccato", requests.post(f"{API}/inventory/movements", headers=CL, json={}).status_code in (403, 422))
    check("Cleaner GET /users/{x}/admin-data = 403", requests.get(f"{API}/users/{created_users[0]}/admin-data", headers=CL).status_code == 403)

    # GATE 2: Rider
    check("Rider GET /clients = 403", requests.get(f"{API}/clients", headers=RD).status_code == 403)
    check("Rider GET /logistics/tasks = 403", requests.get(f"{API}/logistics/tasks", headers=RD).status_code == 403)
    check("Rider GET /logistics/my-tasks = 200", requests.get(f"{API}/logistics/my-tasks", headers=RD).status_code == 200)
    check("Rider GET /dashboard/stats = 403", requests.get(f"{API}/dashboard/stats", headers=RD).status_code == 403)

    # GATE 3: Cliente A vs Cliente B
    check("ClienteA GET /clients/{A} = 200", requests.get(f"{API}/clients/{ca['id']}", headers=PA).status_code == 200)
    check("ClienteA GET /clients/{B} = 403", requests.get(f"{API}/clients/{cb['id']}", headers=PA).status_code == 403)
    check("ClienteA GET /structures/{B} = 403", requests.get(f"{API}/structures/{sb['id']}", headers=PA).status_code == 403)
    la = requests.get(f"{API}/structures", headers=PA, params={"client_id": cb["id"]})
    ok = la.status_code == 200 and all(s["client_id"] == ca["id"] for s in la.json())
    check("ClienteA manipola client_id query -> vede solo A", ok, f"n={len(la.json()) if la.status_code==200 else la.status_code}")
    check("ClienteA GET /clients (lista) = 403", requests.get(f"{API}/clients", headers=PA).status_code == 403)
    check("ClienteA GET /events = 403", requests.get(f"{API}/events", headers=PA).status_code == 403)
    check("ClienteA /portal/dashboard = 200", requests.get(f"{API}/portal/dashboard", headers=PA).status_code == 200)

    # GATE 4: Operations Manager operativo OK, admin-only NO
    check("OM GET /clients = 200", requests.get(f"{API}/clients", headers=OM).status_code == 200)
    check("OM GET /structures = 200", requests.get(f"{API}/structures", headers=OM).status_code == 200)
    check("OM GET /events = 200", requests.get(f"{API}/events", headers=OM).status_code == 200)
    check("OM GET /logistics/tasks = 200", requests.get(f"{API}/logistics/tasks", headers=OM).status_code == 200)
    check("OM POST /users = 403 (solo admin)", requests.post(f"{API}/users", headers=OM, json={"first_name": "X", "role": "cleaner"}).status_code == 403)
    r = requests.get(f"{API}/users/{created_users[0]}/admin-data", headers=OM)
    check("OM admin-data senza IBAN", r.status_code == 200 and r.json().get("iban_hidden") is True)

    # GATE 5: Admin tutto OK
    check("Admin GET /clients = 200", requests.get(f"{API}/clients", headers=A).status_code == 200)
    check("Admin GET /dashboard/stats = 200", requests.get(f"{API}/dashboard/stats", headers=A).status_code == 200)

    # GATE 6: auth regressione veloce (PIN/login intatti)
    bad = requests.post(f"{API}/auth/login", json={"username": "admin@kilolava.it", "password": "wrong"})
    check("Login errato = 401", bad.status_code == 401)
    requests.post(f"{API}/auth/login", json={"username": "admin@kilolava.it", "password": "TestPass123!"})
finally:
    # CLEANUP TOTALE fixture
    for sid in [x.get("id") for x in [locals().get("sa"), locals().get("sb")] if x]:
        requests.delete(f"{API}/structures/{sid}", headers=A)
    for cid in created_clients:
        requests.delete(f"{API}/clients/{cid}", headers=A)
    for uid in created_users:
        requests.delete(f"{API}/users/{uid}", headers=A)
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
