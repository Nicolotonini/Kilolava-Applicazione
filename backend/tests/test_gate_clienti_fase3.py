"""GATE FASE 3 — Clienti: codici CLI permanenti, referenti, scoping. Fixture temporanee + cleanup."""
import os
import re
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

created_clients, created_users = [], []

try:
    # GATE 1: creazione cliente -> cli_code progressivo CLI-XXXX
    r1 = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private",
        "private_info": {"name": "TESTGATE3", "surname": "Uno", "email": "tg3.uno@test.local", "phone": "000"},
    })
    check("POST /clients = 200", r1.status_code == 200, r1.text[:120])
    c1 = r1.json()
    created_clients.append(c1["id"])
    code1 = c1.get("cli_code") or ""
    check("cli_code formato CLI-XXXX", bool(re.fullmatch(r"CLI-\d{4}", code1)), code1)

    r2 = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "company",
        "company_info": {"company_name": "TESTGATE3 Srl", "email": "tg3.srl@test.local"},
        "contacts": [{"name": "Mario Referente", "role": "Amministrazione", "phone": "111"}],
    })
    c2 = r2.json()
    created_clients.append(c2["id"])
    code2 = c2.get("cli_code") or ""
    n1, n2 = int(code1.split("-")[1]), int(code2.split("-")[1])
    check("cli_code progressivo (secondo > primo)", n2 == n1 + 1, f"{code1} -> {code2}")
    check("contacts alla creazione con id assegnato",
          len(c2.get("contacts", [])) == 1 and bool(c2["contacts"][0].get("id")), str(c2.get("contacts")))

    # GATE 2: ricerca per CLI code
    rs = requests.get(f"{API}/clients", headers=A, params={"search": code2})
    found = [c["id"] for c in rs.json()]
    check("GET /clients?search=CLI trova il cliente", c2["id"] in found and c1["id"] not in found)

    # GATE 3: referenti via PUT (aggiunta, modifica, rimozione)
    ct = c2["contacts"][0]
    ru = requests.put(f"{API}/clients/{c2['id']}", headers=A, json={
        "contacts": [ct, {"name": "Luigi Operativo", "email": "luigi@test.local"}]})
    cs = ru.json().get("contacts", [])
    check("PUT contacts: aggiunta secondo referente", len(cs) == 2 and all(x.get("id") for x in cs))
    ru2 = requests.put(f"{API}/clients/{c2['id']}", headers=A, json={
        "contacts": [{**ct, "role": "Direzione"}]})
    cs2 = ru2.json().get("contacts", [])
    check("PUT contacts: rimozione+modifica (resta 1, id stabile)",
          len(cs2) == 1 and cs2[0]["id"] == ct["id"] and cs2[0]["role"] == "Direzione")

    # GATE 4: GET dettaglio espone cli_code + contacts
    rg = requests.get(f"{API}/clients/{c2['id']}", headers=A).json()
    check("GET /clients/{id} espone cli_code e contacts", rg.get("cli_code") == code2 and len(rg.get("contacts", [])) == 1)

    # GATE 5: OM può creare/modificare clienti (matrice clients.write), operativi no
    ru_om = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE3_om", "last_name": "Cli", "role": "operations_manager", "password": "GateTest123!"})
    om = ru_om.json()
    created_users.append(om["id"])
    om_tok = requests.post(f"{API}/auth/login", json={"username": om["login_username"], "password": "GateTest123!"}).json()["access_token"]
    OM = {"Authorization": f"Bearer {om_tok}"}
    r3 = requests.post(f"{API}/clients", headers=OM, json={
        "client_type": "private", "private_info": {"name": "TESTGATE3", "surname": "OM"}})
    check("OM POST /clients = 200", r3.status_code == 200, str(r3.status_code))
    if r3.status_code == 200:
        created_clients.append(r3.json()["id"])
    check("OM PUT /clients = 200", requests.put(f"{API}/clients/{c1['id']}", headers=OM, json={"notes": "nota OM"}).status_code == 200)
    check("OM DELETE /clients = 403 (solo admin)", requests.delete(f"{API}/clients/{c1['id']}", headers=OM).status_code == 403)

    rc = requests.post(f"{API}/users", headers=A, json={
        "first_name": "TEST_GATE3_cl", "last_name": "Cli", "role": "cleaner", "password": "GateTest123!"})
    cl = rc.json()
    created_users.append(cl["id"])
    cl_tok = requests.post(f"{API}/auth/login", json={"username": cl["login_username"], "password": "GateTest123!"}).json()["access_token"]
    CL = {"Authorization": f"Bearer {cl_tok}"}
    check("Cleaner POST /clients = 403", requests.post(f"{API}/clients", headers=CL, json={"client_type": "private"}).status_code == 403)
    check("Cleaner PUT /clients = 403", requests.put(f"{API}/clients/{c1['id']}", headers=CL, json={"notes": "x"}).status_code == 403)

    # GATE 6: cli_code mai riusato — dopo delete il counter NON torna indietro
    rd = requests.delete(f"{API}/clients/{created_clients[-1]}", headers=A)
    check("DELETE cliente test = 200", rd.status_code == 200)
    if rd.status_code == 200:
        created_clients.pop()
    r4 = requests.post(f"{API}/clients", headers=A, json={
        "client_type": "private", "private_info": {"name": "TESTGATE3", "surname": "Quattro"}})
    c4 = r4.json()
    created_clients.append(c4["id"])
    n4 = int(c4["cli_code"].split("-")[1])
    check("cli_code mai riusato dopo delete", n4 > n2 + 1 or n4 == n2 + 2, f"{code2} -> {c4['cli_code']}")
finally:
    for cid in created_clients:
        requests.delete(f"{API}/clients/{cid}", headers=A)
    for uid in created_users:
        requests.delete(f"{API}/users/{uid}", headers=A)
    print("cleanup done")

fails = [n for n, ok, _ in results if not ok]
print(f"\nTOTALE: {len(results) - len(fails)}/{len(results)} PASS")
if fails:
    print("FAILED:", fails)
