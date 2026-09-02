"""Test suite Google Sheets Anagrafiche — import (preview+apply) e backup.
Google API MOCKATA (_read_tab / get_service): copre i 30 casi obbligatori a livello logico.
Il flusso OAuth reale e la lettura/scrittura dei fogli veri richiedono autorizzazione dell'utente.
ESEGUIRE SERIALE: python -m pytest tests/test_sheets_anagrafiche.py -v -o addopts=''
Cleanup selettivo a fine modulo (codici CLI-9xxx / KLV-9xxx / USR-9xxx / KLV-U9xxx).
"""
import asyncio
import sys
import os

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(LOOP)

from services import sheets_anagrafiche as svc  # noqa: E402
from core.database import db  # noqa: E402

import pytest  # noqa: E402


def run(coro):
    return LOOP.run_until_complete(coro)


ADMIN_USER = {"id": "test-sheets-admin", "name": "TestSheets", "role": "admin"}

# ---- Sheet fittizio in memoria ----
SHEET = {}


def reset_sheet():
    SHEET.clear()
    SHEET[svc.IMPORT_TABS["clienti"]] = [svc.CLIENTI_HEADERS]
    SHEET[svc.IMPORT_TABS["strutture"]] = [svc.STRUTTURE_HEADERS]
    SHEET[svc.IMPORT_TABS["servizi"]] = [svc.SERVIZI_HEADERS]
    SHEET[svc.IMPORT_TABS["dipendenti"]] = [svc.DIPENDENTI_HEADERS]


def add_row(tab_key, values_by_header):
    headers = SHEET[svc.IMPORT_TABS[tab_key]][0]
    SHEET[svc.IMPORT_TABS[tab_key]].append([str(values_by_header.get(h, "")) for h in headers])


class FakeSheetsService:
    """Registra le scritture del backup senza toccare Google."""
    def __init__(self):
        self.tabs = {}
        self.writes = {}
        self._next_id = 100

    def spreadsheets(self):
        fake = self

        class _Values:
            def update(self, spreadsheetId=None, range=None, valueInputOption=None, body=None):
                fake.writes[range] = body["values"]
                return _Exec({})

            def clear(self, spreadsheetId=None, range=None):
                return _Exec({})

            def get(self, spreadsheetId=None, range=None):
                tab = range.split("!")[0].strip("'")
                return _Exec({"values": SHEET.get(tab, [])})

        class _Sheets:
            def values(self):
                return _Values()

            def get(self, spreadsheetId=None):
                return _Exec({"sheets": [{"properties": {"title": t, "sheetId": i}}
                                         for t, i in fake.tabs.items()]})

            def batchUpdate(self, spreadsheetId=None, body=None):
                for req in (body or {}).get("requests", []):
                    if "addSheet" in req:
                        title = req["addSheet"]["properties"]["title"]
                        fake.tabs[title] = fake._next_id
                        fake._next_id += 1
                return _Exec({})

        class _Exec:
            def __init__(self, data):
                self._data = data

            def execute(self):
                return self._data

        return _Sheets()


FAKE = FakeSheetsService()


async def fake_get_service():
    return FAKE


async def fake_read_tab(service, spreadsheet_id, tab):
    return SHEET.get(tab, [])


svc.get_service = fake_get_service
svc._read_tab = fake_read_tab

TEST_KEYS = ["client:CLI-9001", "client:CLI-9002", "structure:KLV-9001", "structure:KLV-9002",
             "unit:KLV-U9001", "unit:KLV-U9002", "services:KLV-9001", "user:USR-9001", "user:USR-9002"]

_state = {}


@pytest.fixture(scope="module", autouse=True)
def setup_teardown():
    async def _pre():
        _state["counter_before"] = ((await db.counters.find_one({"_id": "klv_structure"})) or {}).get("seq", 0)
        _state["zone"] = await db.operational_zones.find_one({"is_active": {"$ne": False}}, {"_id": 0})
        await _cleanup()
    run(_pre())
    yield
    run(_cleanup(restore_counter=True))


async def _cleanup(restore_counter=False):
    await db.clients.delete_many({"code": {"$regex": "^CLI-9"}})
    await db.structures.delete_many({"klv_code": {"$regex": "^KLV-9"}})
    await db.units.delete_many({"code": {"$regex": "^KLV-U9"}})
    await db.users.delete_many({"code": {"$regex": "^USR-9"}})
    await db.sheets_snapshots.delete_many({"key": {"$in": TEST_KEYS}})
    await db.sheets_previews.delete_many({"created_by": ADMIN_USER["id"]})
    await db.sheets_sync_history.delete_many({"user_name": "TestSheets"})
    await db.activity_logs.delete_many({"user_id": ADMIN_USER["id"]})
    # Il contatore KLV NON si riporta indietro: i codici KLV sono permanenti e mai riutilizzabili


def base_client_row(**over):
    d = {"Codice Cliente": "CLI-9001", "Tipo Cliente": "Privato", "Nome": "Sheet", "Cognome": "Tester",
         "Email": "sheet.tester@example.com", "Telefono": "3331112233", "Indirizzo": "Via Test 1",
         "CAP": "34100", "Città": "Trieste", "Provincia": "TS", "Note": "riga di test", "Attivo": "SÌ"}
    d.update(over)
    return d


def base_struct_row(**over):
    d = {"Codice Cliente": "CLI-9001", "Codice Struttura": "KLV-9001", "Nome Struttura": "Casa Sheet Test",
         "Tipo Struttura": "Appartamento", "Ha Unità": "NO", "Indirizzo": "Via Prova 2", "CAP": "34100",
         "Città": "Trieste", "Capienza": "4", "Letti Matrimoniali": "1", "Letti Singoli": "2",
         "Divani Letto": "0", "Durata Prevista Pulizia (min)": "90"}
    d.update(over)
    return d


def base_user_row(**over):
    d = {"Codice Utente": "USR-9001", "Nome": "Paola", "Cognome": "Prova", "Ruolo": "Operatrice Pulizie",
         "Telefono": "3401234567", "Email": "paola.prova@example.com", "Lingua": "IT", "Stato": "Attivo",
         "Ore Massime": "6"}
    d.update(over)
    return d


def items_by_code(preview, code):
    return [i for i in preview["items"] if i["code"] == code]


def errors_of(preview, needle):
    return [e for e in preview["errors"] if needle in e["msg"]]


# ---------- CLIENTI ----------

def test_01_new_client_preview_create():
    reset_sheet()
    add_row("clienti", base_client_row())
    p = run(svc.build_preview(ADMIN_USER))
    it = items_by_code(p, "CLI-9001")
    assert len(it) == 1 and it[0]["action"] == "create"
    _state["p1"] = p


def test_02_apply_creates_client_with_audit_and_history():
    p = _state["p1"]
    res = run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    assert res["ok"] and res["stats"]["creati"] >= 1
    c = run(db.clients.find_one({"code": "CLI-9001"}, {"_id": 0}))
    assert c and c["client_type"] == "private" and c["private_info"]["phone"] == "3331112233"
    log = run(db.activity_logs.find_one({"user_id": ADMIN_USER["id"], "entity_id": "CLI-9001", "origin": "Google Sheets Import"}))
    assert log, "audit mancante nel Registro Attività"
    h = run(db.sheets_sync_history.find_one({"user_name": "TestSheets", "type": "import"}))
    assert h and h["esito"] == "success"
    snap = run(db.sheets_snapshots.find_one({"key": "client:CLI-9001"}))
    assert snap, "snapshot non salvato"


def test_03_second_identical_import_all_unchanged():
    p = run(svc.build_preview(ADMIN_USER))
    it = items_by_code(p, "CLI-9001")
    assert it[0]["action"] == "unchanged"
    actionable = [i for i in p["items"] if i["action"] in ("create", "update", "deactivate") and i["code"].endswith("-9001")]
    assert actionable == []
    run(db.sheets_previews.delete_one({"id": p["id"]}))


def test_04_update_client_phone():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    p = run(svc.build_preview(ADMIN_USER))
    it = items_by_code(p, "CLI-9001")[0]
    assert it["action"] == "update"
    assert any(c["field"] == "_info.phone" and c["new"] == "3339998877" for c in it["changes"])
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    c = run(db.clients.find_one({"code": "CLI-9001"}, {"_id": 0}))
    assert c["private_info"]["phone"] == "3339998877"


def test_05_duplicate_client_code_error():
    reset_sheet()
    add_row("clienti", base_client_row())
    add_row("clienti", base_client_row(Nome="Doppione"))
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "duplicato"), "duplicato non rilevato"
    run(db.sheets_previews.delete_one({"id": p["id"]}))


def test_06_missing_and_bad_code_errors():
    reset_sheet()
    add_row("clienti", base_client_row(**{"Codice Cliente": ""}))
    add_row("clienti", base_client_row(**{"Codice Cliente": "CLIX-1", "Nome": "Malformato"}))
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "Codice Cliente mancante")
    assert errors_of(p, "non valido")
    run(db.sheets_previews.delete_one({"id": p["id"]}))


def test_07_invalid_attivo_error_and_bad_email_warning():
    reset_sheet()
    add_row("clienti", base_client_row(Attivo="FORSE"))
    add_row("clienti", base_client_row(**{"Codice Cliente": "CLI-9002", "Nome": "Mail", "Email": "non-una-mail"}))
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "Attivo non valido")
    it = items_by_code(p, "CLI-9002")[0]
    assert any("Email non valida" in w for w in it["warnings"])
    run(db.sheets_previews.delete_one({"id": p["id"]}))


def test_08_deactivate_proposal_not_delete():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877", Attivo="NO"))
    p = run(svc.build_preview(ADMIN_USER))
    it = items_by_code(p, "CLI-9001")[0]
    assert it["action"] == "deactivate"
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    c = run(db.clients.find_one({"code": "CLI-9001"}, {"_id": 0}))
    assert c is not None, "il cliente NON deve essere cancellato"
    assert c["is_active"] is False
    # riattiva per i test successivi
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    p2 = run(svc.build_preview(ADMIN_USER))
    run(svc.apply_preview(p2["id"], {}, ADMIN_USER))


# ---------- STRUTTURE & UNITÀ ----------

def test_09_structure_without_units():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    zone_name = (_state.get("zone") or {}).get("name", "")
    add_row("strutture", base_struct_row(**{"Rione / Zona": zone_name}))
    p = run(svc.build_preview(ADMIN_USER))
    st = items_by_code(p, "KLV-9001")
    assert len(st) == 1 and st[0]["action"] == "create"
    assert not any(i["entity"] == "Unità" for i in p["items"] if i.get("parent_structure") == "KLV-9001")
    res = run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    assert res["stats"]["creati"] >= 1
    s = run(db.structures.find_one({"klv_code": "KLV-9001"}, {"_id": 0}))
    assert s and s["has_units"] is False and s["bed_config"]["capacity_persons"] == 4
    assert run(db.units.count_documents({"structure_id": s["id"]})) == 0
    cl = run(db.clients.find_one({"code": "CLI-9001"}, {"_id": 0}))
    assert s["client_id"] == cl["id"]
    if _state.get("zone"):
        assert s.get("operational_zone_id") == _state["zone"]["id"], "rione riconosciuto deve mappare operational_zone_id"


def test_10_klv_counter_bumped():
    seq = run(db.counters.find_one({"_id": "klv_structure"}))["seq"]
    assert seq >= 9001, f"contatore KLV non aggiornato: {seq}"


def test_11_multi_row_same_structure_multiple_units():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    r = base_struct_row(**{"Codice Struttura": "KLV-9002", "Nome Struttura": "B&B Sheet", "Ha Unità": "SÌ",
                           "Codice Unità": "KLV-U9001", "Nome Unità": "Camera 1"})
    add_row("strutture", r)
    r2 = dict(r)
    r2.update({"Codice Unità": "KLV-U9002", "Nome Unità": "Camera 2"})
    add_row("strutture", r2)
    p = run(svc.build_preview(ADMIN_USER))
    st = [i for i in p["items"] if i["code"] == "KLV-9002" and i["entity"] == "Struttura"]
    units = [i for i in p["items"] if i["entity"] == "Unità" and i.get("parent_structure") == "KLV-9002"]
    assert len(st) == 1, "stesse righe codice = UNA sola struttura"
    assert len(units) == 2
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    s = run(db.structures.find_one({"klv_code": "KLV-9002"}, {"_id": 0}))
    assert s and run(db.units.count_documents({"structure_id": s["id"]})) == 2


def test_12_units_with_ha_unita_no_error():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    add_row("strutture", base_struct_row(**{"Ha Unità": "NO", "Codice Unità": "KLV-U9099", "Nome Unità": "Fantasma"}))
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "'Ha Unità'=NO")
    run(db.sheets_previews.delete_one({"id": p["id"]}))


def test_13_structure_unknown_client_error():
    reset_sheet()
    add_row("strutture", base_struct_row(**{"Codice Cliente": "CLI-8888", "Codice Struttura": "KLV-9003"}))
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "Codice Cliente inesistente")
    run(db.sheets_previews.delete_one({"id": p["id"]}))


def test_14_bad_numbers_and_negative_error():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    add_row("strutture", base_struct_row(Capienza="quattro"))
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "numero non valido")
    run(db.sheets_previews.delete_one({"id": p["id"]}))
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    add_row("strutture", base_struct_row(**{"Letti Singoli": "-2"}))
    p2 = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p2, "negativi")
    run(db.sheets_previews.delete_one({"id": p2["id"]}))


def test_15_unknown_zone_warning():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3339998877"))
    add_row("strutture", base_struct_row(**{"Rione / Zona": "ZonaInventata9"}))
    p = run(svc.build_preview(ADMIN_USER))
    it = [i for i in p["items"] if i["code"] == "KLV-9001" and i["entity"] == "Struttura"][0]
    assert any("Rione non riconosciuto" in w for w in it["warnings"])
    run(db.sheets_previews.delete_one({"id": p["id"]}))


# ---------- SERVIZI ----------

def test_16_services_update():
    reset_sheet()
    add_row("servizi", {"Codice Struttura": "KLV-9001", "Pulizie": "SÌ", "Lavanderia Privata": "NO",
                        "Lavanderia a Noleggio": "SÌ", "Forniture / Consumabili": "NO",
                        "Manutenzioni": "SÌ", "Kit Pulizie Struttura": "SÌ"})
    p = run(svc.build_preview(ADMIN_USER))
    it = [i for i in p["items"] if i["key"] == "services:KLV-9001"]
    assert it and it[0]["action"] == "update"
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    s = run(db.structures.find_one({"klv_code": "KLV-9001"}, {"_id": 0}))
    assert set(s["services"]) >= {"cleaning", "linen_rental", "maintenance"}
    assert "private_laundry" not in s["services"]
    kit = run(db.structure_cleaning_kits.find_one({"structure_id": s["id"]}, {"_id": 0}))
    assert kit and kit["enabled"] is True


def test_17_services_invalid_value_and_unknown_structure():
    reset_sheet()
    add_row("servizi", {"Codice Struttura": "KLV-9001", "Pulizie": "BOH"})
    add_row("servizi", {"Codice Struttura": "KLV-7777", "Pulizie": "SÌ"})
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "SÌ/NO non valido")
    assert errors_of(p, "Struttura inesistente")
    run(db.sheets_previews.delete_one({"id": p["id"]}))


# ---------- DIPENDENTI ----------

def test_18_new_user_no_password_no_login():
    reset_sheet()
    add_row("dipendenti", base_user_row())
    p = run(svc.build_preview(ADMIN_USER))
    it = items_by_code(p, "USR-9001")[0]
    assert it["action"] == "create"
    assert any("SENZA account" in w for w in it["warnings"])
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    u = run(db.users.find_one({"code": "USR-9001"}, {"_id": 0}))
    assert u and u["role"] == "cleaner" and u["name"] == "Paola Prova"
    assert u.get("hashed_password") is None and u.get("login_enabled") is False


def test_19_user_bad_role_dup_code_errors():
    reset_sheet()
    add_row("dipendenti", base_user_row(Ruolo="Astronauta"))
    add_row("dipendenti", base_user_row(**{"Codice Utente": "USR-9002"}))
    add_row("dipendenti", base_user_row(**{"Codice Utente": "USR-9002", "Nome": "Doppia"}))
    p = run(svc.build_preview(ADMIN_USER))
    assert errors_of(p, "ruolo inesistente")
    assert errors_of(p, "Codice Utente duplicato")
    run(db.sheets_previews.delete_one({"id": p["id"]}))


def test_20_user_deactivate():
    reset_sheet()
    add_row("dipendenti", base_user_row(Stato="Disattivo"))
    p = run(svc.build_preview(ADMIN_USER))
    it = items_by_code(p, "USR-9001")[0]
    assert it["action"] == "deactivate"
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    u = run(db.users.find_one({"code": "USR-9001"}, {"_id": 0}))
    assert u is not None and u["is_active"] is False


# ---------- REGOLE GLOBALI ----------

def test_21_missing_from_sheet_never_deleted():
    reset_sheet()  # foglio vuoto: tutti i record noti risultano 'missing'
    p = run(svc.build_preview(ADMIN_USER))
    miss = [i for i in p["items"] if i["key"] == "client:CLI-9001"]
    assert miss and miss[0]["action"] == "missing"
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    assert run(db.clients.find_one({"code": "CLI-9001"})) is not None, "MAI cancellare per assenza dal foglio"


def test_22_decision_apply_false_skips():
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3220000000"))
    p = run(svc.build_preview(ADMIN_USER))
    res = run(svc.apply_preview(p["id"], {"client:CLI-9001": {"apply": False}}, ADMIN_USER))
    assert res["stats"]["saltati"] >= 1
    c = run(db.clients.find_one({"code": "CLI-9001"}, {"_id": 0}))
    assert c["private_info"]["phone"] == "3339998877", "modifica saltata non deve applicarsi"


def test_23_conflict_detection_and_keep_kilolava():
    # modifica manuale in Kilolava (diversa da snapshot) + valore ancora diverso nel foglio → conflitto
    run(db.clients.update_one({"code": "CLI-9001"}, {"$set": {"private_info.phone": "3111111111"}}))
    reset_sheet()
    add_row("clienti", base_client_row(Telefono="3222222222"))
    p = run(svc.build_preview(ADMIN_USER))
    it = items_by_code(p, "CLI-9001")[0]
    ch = next(c for c in it["changes"] if c["field"] == "_info.phone")
    assert ch["conflict"] is True, "conflitto Kilolava-vs-foglio non rilevato"
    run(svc.apply_preview(p["id"], {"client:CLI-9001": {"apply": True, "fields": {"_info.phone": "kilolava"}}}, ADMIN_USER))
    c = run(db.clients.find_one({"code": "CLI-9001"}, {"_id": 0}))
    assert c["private_info"]["phone"] == "3111111111", "'Mantieni Kilolava' deve preservare il valore Kilolava"


def test_24_cancel_preview_nothing_applied():
    reset_sheet()
    add_row("clienti", base_client_row(**{"Codice Cliente": "CLI-9002", "Nome": "Annullato", "Email": "ok@example.com"}))
    p = run(svc.build_preview(ADMIN_USER))
    run(db.sheets_previews.delete_one({"id": p["id"]}))  # equivale a DELETE /preview/{id}
    with pytest.raises(RuntimeError):
        run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    assert run(db.clients.find_one({"code": "CLI-9002"})) is None


def test_25_client_and_structure_created_together():
    reset_sheet()
    add_row("clienti", base_client_row(**{"Codice Cliente": "CLI-9002", "Nome": "Insieme", "Email": "insieme@example.com"}))
    add_row("strutture", base_struct_row(**{"Codice Cliente": "CLI-9002", "Codice Struttura": "KLV-9003",
                                            "Nome Struttura": "Casa Insieme"}))
    p = run(svc.build_preview(ADMIN_USER))
    assert not errors_of(p, "inesistente"), "cliente nuovo nello stesso foglio deve essere accettato"
    run(svc.apply_preview(p["id"], {}, ADMIN_USER))
    cl = run(db.clients.find_one({"code": "CLI-9002"}, {"_id": 0}))
    s = run(db.structures.find_one({"klv_code": "KLV-9003"}, {"_id": 0}))
    assert cl and s and s["client_id"] == cl["id"]
    run(db.structures.delete_one({"klv_code": "KLV-9003"}))
    run(db.sheets_snapshots.delete_one({"key": "structure:KLV-9003"}))


# ---------- BACKUP ----------

def test_26_backup_writes_4_tabs_no_sensitive_data():
    rec = run(svc.run_backup("TestSheets"))
    assert rec["esito"] == "success" and rec["clienti"] >= 1
    written_tabs = {r.split("!")[0].strip("'") for r in FAKE.writes}
    assert {"Clienti", "Strutture & Unità", "Servizi Strutture", "Dipendenti / Collaboratori"} <= written_tabs
    all_cells = [str(cell) for values in FAKE.writes.values() for row in values for cell in row]
    joined = " ".join(all_cells)
    assert "$2b$" not in joined and "$2a$" not in joined, "hash password nel backup!"
    assert "hashed_password" not in joined
    cli_values = next(v for r, v in FAKE.writes.items() if r.startswith("'Clienti'"))
    assert any(row[0] == "CLI-9001" for row in cli_values[1:]), "cliente di test assente dal backup"
    assert cli_values[0] == svc.CLIENTI_HEADERS
    # struttura multi-unità: una riga per unità con codice unità valorizzato
    str_values = next(v for r, v in FAKE.writes.items() if r.startswith("'Strutture"))
    rows_9002 = [row for row in str_values[1:] if row[1] == "KLV-9002"]
    assert len(rows_9002) == 2 and {row[5] for row in rows_9002} == {"KLV-U9001", "KLV-U9002"}
    h = run(db.sheets_sync_history.find_one({"user_name": "TestSheets", "type": "backup"}))
    assert h and h["esito"] == "success"


def test_27_ensure_codes_idempotent_no_duplicates():
    run(svc.ensure_codes())
    run(svc.ensure_codes())
    for coll, field in ((db.clients, "code"), (db.units, "code"), (db.users, "code")):
        pipeline = [{"$match": {field: {"$ne": None}}},
                    {"$group": {"_id": f"${field}", "n": {"$sum": 1}}},
                    {"$match": {"n": {"$gt": 1}}}]
        dups = run(coll.aggregate(pipeline).to_list(10))
        assert dups == [], f"codici duplicati in {coll.name}: {dups}"
