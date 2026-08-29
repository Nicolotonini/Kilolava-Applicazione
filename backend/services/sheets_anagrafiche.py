"""
Anagrafiche Google Sheets — Import (con anteprima e conferma) + Backup automatico.
Kilolava è la fonte ufficiale. Import = onboarding/proposta modifiche. Backup = output read-only.
OAuth utente (token in db.google_tokens). Nessun dato sensibile nei fogli.
"""
import asyncio
import os
import re
import uuid
from datetime import datetime, timezone, timedelta

from core.database import db
from core.utils import now_iso

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

IMPORT_TABS = {
    "clienti": "CLIENTI",
    "strutture": "STRUTTURE & UNITÀ",
    "servizi": "SERVIZI STRUTTURE",
    "dipendenti": "DIPENDENTI / COLLABORATORI",
}

CLIENTI_HEADERS = ["Codice Cliente", "Tipo Cliente", "Nome", "Cognome", "Ragione Sociale", "Referente",
                   "Codice Fiscale", "Partita IVA", "SDI", "PEC", "Email", "Telefono", "Indirizzo",
                   "CAP", "Città", "Provincia", "Note", "Attivo"]
STRUTTURE_HEADERS = ["Codice Cliente", "Codice Struttura", "Nome Struttura", "Tipo Struttura", "Ha Unità",
                     "Codice Unità", "Nome Unità", "Indirizzo", "CAP", "Città", "Piano", "Interno",
                     "Rione / Zona", "Capienza", "Letti Matrimoniali", "Letti Singoli", "Divani Letto",
                     "Durata Prevista Pulizia (min)", "Note"]
SERVIZI_HEADERS = ["Codice Struttura", "Pulizie", "Lavanderia Privata", "Lavanderia a Noleggio",
                   "Forniture / Consumabili", "Manutenzioni", "Kit Pulizie Struttura", "Note Servizi"]
DIPENDENTI_HEADERS = ["Codice Utente", "Nome", "Cognome", "Ruolo", "Telefono", "Email", "Lingua",
                      "Stato", "Ore Massime", "Disponibilità Standard", "Codice Zaino", "Note Operative"]

ROLE_IT = {"admin": "Admin", "operations_manager": "Responsabile Operativo", "cleaner": "Operatrice Pulizie",
           "rider": "Rider", "maintenance": "Manutentore", "client": "Cliente"}
ROLE_FROM_IT = {v.lower(): k for k, v in ROLE_IT.items()}

STRUCTURE_TYPES_IT = {"apartment": "Appartamento", "b_and_b": "B&B", "villa": "Villa", "room_rental": "Affittacamere",
                      "hotel": "Hotel", "office": "Ufficio", "other": "Altro"}
STRUCTURE_TYPE_FROM_IT = {v.lower(): k for k, v in STRUCTURE_TYPES_IT.items()}

SERVICE_COLS = [("Pulizie", "cleaning"), ("Lavanderia Privata", "private_laundry"),
                ("Lavanderia a Noleggio", "linen_rental"), ("Forniture / Consumabili", "consumables"),
                ("Manutenzioni", "maintenance")]

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CODE_RES = {"client": re.compile(r"^CLI-\d{1,6}$"), "structure": re.compile(r"^KLV-\d{1,6}$"), "user": re.compile(r"^USR-\d{1,6}$")}


# ---------------- OAuth / client ----------------

def oauth_config():
    return {
        "client_id": os.environ.get("GOOGLE_OAUTH_CLIENT_ID"),
        "client_secret": os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET"),
        "redirect_uri": os.environ.get("GOOGLE_OAUTH_REDIRECT_URI"),
        "import_id": os.environ.get("GOOGLE_SHEETS_IMPORT_ID"),
        "backup_id": os.environ.get("GOOGLE_SHEETS_BACKUP_ID"),
    }


async def get_token_doc():
    return await db.google_tokens.find_one({"id": "sheets"}, {"_id": 0})


async def get_creds():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    tok = await get_token_doc()
    if not tok:
        return None
    cfg = oauth_config()
    creds = Credentials(
        token=tok.get("access_token"), refresh_token=tok.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cfg["client_id"], client_secret=cfg["client_secret"], scopes=SCOPES,
    )
    expires_at = tok.get("expires_at")
    needs_refresh = True
    if expires_at:
        try:
            exp = datetime.fromisoformat(expires_at)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            needs_refresh = datetime.now(timezone.utc) >= exp - timedelta(minutes=2)
        except Exception:
            pass
    if needs_refresh and creds.refresh_token:
        await asyncio.to_thread(creds.refresh, GoogleRequest())
        await db.google_tokens.update_one({"id": "sheets"}, {"$set": {
            "access_token": creds.token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=3500)).isoformat(),
        }})
    return creds


async def get_service():
    from googleapiclient.discovery import build
    creds = await get_creds()
    if not creds:
        return None
    return await asyncio.to_thread(build, "sheets", "v4", credentials=creds, cache_discovery=False)


async def _read_tab(service, spreadsheet_id, tab):
    def _do():
        return service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id, range=f"'{tab}'!A1:Z2000").execute().get("values", [])
    try:
        return await asyncio.to_thread(_do)
    except Exception:
        return []


async def _get_sheet_titles(service, spreadsheet_id):
    def _do():
        meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
        return {s["properties"]["title"]: s["properties"]["sheetId"] for s in meta.get("sheets", [])}
    return await asyncio.to_thread(_do)


async def _ensure_tabs(service, spreadsheet_id, tabs_with_headers, checkbox_cols=None):
    """Crea le tab mancanti, scrive intestazioni, congela riga 1, bold, filtri."""
    titles = await _get_sheet_titles(service, spreadsheet_id)
    requests = []
    for title in tabs_with_headers:
        if title not in titles:
            requests.append({"addSheet": {"properties": {"title": title, "gridProperties": {"frozenRowCount": 1}}}})
    if requests:
        await asyncio.to_thread(lambda: service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id, body={"requests": requests}).execute())
        titles = await _get_sheet_titles(service, spreadsheet_id)

    fmt_requests = []
    for title, headers in tabs_with_headers.items():
        sheet_id = titles[title]
        await asyncio.to_thread(lambda t=title, h=headers: service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id, range=f"'{t}'!A1",
            valueInputOption="RAW", body={"values": [h]}).execute())
        fmt_requests += [
            {"updateSheetProperties": {"properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": 1}},
                                       "fields": "gridProperties.frozenRowCount"}},
            {"repeatCell": {"range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                            "cell": {"userEnteredFormat": {"textFormat": {"bold": True}}},
                            "fields": "userEnteredFormat.textFormat.bold"}},
            {"setBasicFilter": {"filter": {"range": {"sheetId": sheet_id, "startRowIndex": 0,
                                                     "startColumnIndex": 0, "endColumnIndex": len(headers)}}}},
            {"autoResizeDimensions": {"dimensions": {"sheetId": sheet_id, "dimension": "COLUMNS",
                                                     "startIndex": 0, "endIndex": len(headers)}}},
        ]
    if fmt_requests:
        await asyncio.to_thread(lambda: service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id, body={"requests": fmt_requests}).execute())
    return titles


async def setup_import_sheet():
    cfg = oauth_config()
    service = await get_service()
    if not service or not cfg["import_id"]:
        raise RuntimeError("Google Sheets non connesso")
    await _ensure_tabs(service, cfg["import_id"], {
        IMPORT_TABS["clienti"]: CLIENTI_HEADERS,
        IMPORT_TABS["strutture"]: STRUTTURE_HEADERS,
        IMPORT_TABS["servizi"]: SERVIZI_HEADERS,
        IMPORT_TABS["dipendenti"]: DIPENDENTI_HEADERS,
    })
    return {"ok": True}


# ---------------- Codici stabili ----------------

async def _next_code(collection, field, prefix):
    max_seq = 0
    rx = re.compile(rf"^{re.escape(prefix)}-?(\d+)$")
    async for doc in collection.find({field: {"$regex": f"^{re.escape(prefix)}"}}, {"_id": 0, field: 1}):
        m = rx.match(doc.get(field) or "")
        if m:
            max_seq = max(max_seq, int(m.group(1)))
    return max_seq


async def ensure_codes():
    """Assegna codici operativi stabili ai record esistenti che non li hanno."""
    seq = await _next_code(db.clients, "code", "CLI")
    async for c in db.clients.find({"$or": [{"code": {"$exists": False}}, {"code": None}]}, {"_id": 0, "id": 1}).sort("created_at", 1):
        seq += 1
        await db.clients.update_one({"id": c["id"]}, {"$set": {"code": f"CLI-{seq:04d}"}})
    seq = await _next_code(db.units, "code", "KLV-U")
    async for u in db.units.find({"$or": [{"code": {"$exists": False}}, {"code": None}]}, {"_id": 0, "id": 1}).sort("created_at", 1):
        seq += 1
        await db.units.update_one({"id": u["id"]}, {"$set": {"code": f"KLV-U{seq:04d}"}})
    seq = await _next_code(db.users, "code", "USR")
    async for u in db.users.find({"$or": [{"code": {"$exists": False}}, {"code": None}]}, {"_id": 0, "id": 1}).sort("created_at", 1):
        seq += 1
        await db.users.update_one({"id": u["id"]}, {"$set": {"code": f"USR-{seq:04d}"}})


# ---------------- Parsing helpers ----------------

def parse_bool(v, default=None):
    s = str(v or "").strip().lower()
    if s in ("sì", "si", "s", "true", "x", "1", "yes", "y", "vero"):
        return True
    if s in ("no", "n", "false", "0", ""):
        return False if s == "no" or s == "false" or s == "0" or s == "n" else default
    return None  # invalido


def parse_int(v):
    s = str(v or "").strip()
    if s == "":
        return None
    try:
        n = int(float(s.replace(",", ".")))
        return n
    except Exception:
        raise ValueError(f"numero non valido: {v}")


def rows_to_dicts(values, headers):
    if not values:
        return []
    head = [h.strip() for h in values[0]]
    idx = {}
    for want in headers:
        for i, h in enumerate(head):
            if h.lower() == want.lower():
                idx[want] = i
                break
    out = []
    for rn, row in enumerate(values[1:], start=2):
        if not any(str(c).strip() for c in row):
            continue
        d = {"_row": rn}
        for want in headers:
            i = idx.get(want)
            d[want] = str(row[i]).strip() if i is not None and i < len(row) else ""
        out.append(d)
    return out


# ---------------- Diff / preview ----------------

def _client_fields_from_row(r):
    tipo = (r["Tipo Cliente"] or "Privato").strip().lower()
    client_type = "company" if tipo in ("azienda", "company") else "private"
    active = parse_bool(r["Attivo"], default=True)
    common_addr = ", ".join([x for x in [r["Indirizzo"], r["CAP"], r["Città"], r["Provincia"]] if x]) or None
    if client_type == "company":
        info = {
            "company_name": r["Ragione Sociale"], "representative_name": r["Referente"] or r["Nome"],
            "representative_surname": r["Cognome"], "vat_number": r["Partita IVA"] or None,
            "fiscal_code": r["Codice Fiscale"] or None, "sdi": r["SDI"] or "0000000",
            "address": common_addr, "phone": r["Telefono"] or None, "email": r["Email"] or None,
            "pec": r["PEC"] or None,
        }
        flat = {"client_type": client_type, "company_info": info, "notes": r["Note"] or None, "is_active": active}
        label = r["Ragione Sociale"] or f"{r['Nome']} {r['Cognome']}".strip()
    else:
        info = {
            "name": r["Nome"], "surname": r["Cognome"], "address": common_addr,
            "fiscal_code": r["Codice Fiscale"] or None, "phone": r["Telefono"] or None,
            "email": r["Email"] or None, "sdi": r["SDI"] or "0000000",
        }
        flat = {"client_type": client_type, "private_info": info, "notes": r["Note"] or None, "is_active": active}
        label = f"{r['Nome']} {r['Cognome']}".strip()
    return flat, label


CLIENT_CMP_FIELDS = [
    ("client_type", "Tipo"), ("notes", "Note"), ("is_active", "Attivo"),
    ("_info.name", "Nome"), ("_info.surname", "Cognome"), ("_info.company_name", "Ragione Sociale"),
    ("_info.representative_name", "Referente"), ("_info.fiscal_code", "Codice Fiscale"),
    ("_info.vat_number", "Partita IVA"), ("_info.sdi", "SDI"), ("_info.pec", "PEC"),
    ("_info.email", "Email"), ("_info.phone", "Telefono"), ("_info.address", "Indirizzo"),
]


def _get_path(doc, path):
    if path.startswith("_info."):
        info = doc.get("company_info") if doc.get("client_type") == "company" else doc.get("private_info")
        return (info or {}).get(path[6:])
    return doc.get(path)


def _norm(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "SÌ" if v else "NO"
    return str(v).strip()


async def _snapshot_get(key):
    doc = await db.sheets_snapshots.find_one({"key": key}, {"_id": 0})
    return (doc or {}).get("values", {})


async def _snapshot_set(key, values):
    await db.sheets_snapshots.update_one({"key": key}, {"$set": {"key": key, "values": values, "updated_at": now_iso()}}, upsert=True)


def _diff_changes(cmp_fields, existing, new_doc, snap):
    changes = []
    for path, label in cmp_fields:
        old = _norm(_get_path(existing, path))
        new = _norm(_get_path(new_doc, path))
        if old == new:
            continue
        snap_val = _norm(snap.get(path)) if snap else None
        conflict = bool(snap and snap_val is not None and old != snap_val and new != snap_val)
        changes.append({"field": path, "label": label, "old": old, "new": new, "conflict": conflict})
    return changes


def _snapshot_values(cmp_fields, doc):
    return {path: _norm(_get_path(doc, path)) for path, _ in cmp_fields}


STRUCT_CMP = [("name", "Nome"), ("structure_type", "Tipo"), ("address", "Indirizzo"), ("floor", "Piano"),
              ("interior", "Interno"), ("zone_name", "Rione / Zona"), ("capacity", "Capienza"),
              ("beds_double", "Letti Matrimoniali"), ("beds_single", "Letti Singoli"), ("beds_sofa", "Divani Letto"),
              ("expected_cleaning_minutes", "Durata Pulizia"), ("notes", "Note"), ("client_code", "Cliente")]

UNIT_CMP = [("name", "Nome Unità"), ("notes", "Note")]

USER_CMP = [("name", "Nome"), ("phone", "Telefono"), ("email", "Email"), ("role", "Ruolo"),
            ("language", "Lingua"), ("is_active", "Stato"), ("max_hours", "Ore Massime"),
            ("availability_notes", "Disponibilità"), ("operational_notes", "Note Operative")]


async def build_preview(user):
    cfg = oauth_config()
    service = await get_service()
    if not service or not cfg["import_id"]:
        raise RuntimeError("Google Sheets non connesso")
    await ensure_codes()

    raw_clients = rows_to_dicts(await _read_tab(service, cfg["import_id"], IMPORT_TABS["clienti"]), CLIENTI_HEADERS)
    raw_structs = rows_to_dicts(await _read_tab(service, cfg["import_id"], IMPORT_TABS["strutture"]), STRUTTURE_HEADERS)
    raw_services = rows_to_dicts(await _read_tab(service, cfg["import_id"], IMPORT_TABS["servizi"]), SERVIZI_HEADERS)
    raw_users = rows_to_dicts(await _read_tab(service, cfg["import_id"], IMPORT_TABS["dipendenti"]), DIPENDENTI_HEADERS)

    items = []
    errors = []
    zones = {}
    zones_by_id = {}
    async for z in db.operational_zones.find({}, {"_id": 0}):
        zones[z["name"].strip().lower()] = z
        zones_by_id[z["id"]] = z

    db_clients = {c.get("code"): c for c in await db.clients.find({}, {"_id": 0}).to_list(2000) if c.get("code")}
    db_structs = {s.get("klv_code"): s for s in await db.structures.find({}, {"_id": 0}).to_list(2000) if s.get("klv_code")}
    db_units = {u.get("code"): u for u in await db.units.find({}, {"_id": 0}).to_list(5000) if u.get("code")}
    db_users_by_code = {u.get("code"): u for u in await db.users.find({}, {"_id": 0, "password": 0, "hashed_password": 0}).to_list(1000) if u.get("code")}
    db_users_by_email = {u.get("email", "").lower(): u for u in db_users_by_code.values() if u.get("email")}

    sheet_client_codes = set()
    # ---- CLIENTI ----
    seen = set()
    for r in raw_clients:
        code = r["Codice Cliente"].strip().upper()
        if not code:
            errors.append({"tab": "CLIENTI", "row": r["_row"], "level": "error", "msg": "Codice Cliente mancante"})
            continue
        if not CODE_RES["client"].match(code):
            errors.append({"tab": "CLIENTI", "row": r["_row"], "level": "error", "msg": f"Codice Cliente non valido: {code} (formato atteso CLI-0001)"})
            continue
        if code in seen:
            errors.append({"tab": "CLIENTI", "row": r["_row"], "level": "error", "msg": f"Codice Cliente duplicato nel foglio: {code}"})
            continue
        seen.add(code)
        sheet_client_codes.add(code)
        flat, label = _client_fields_from_row(r)
        item = {"key": f"client:{code}", "entity": "Cliente", "code": code, "label": label or code,
                "action": None, "changes": [], "warnings": [], "row": r["_row"]}
        if parse_bool(r["Attivo"], default=True) is None:
            errors.append({"tab": "CLIENTI", "row": r["_row"], "level": "error", "msg": f"Valore Attivo non valido: {r['Attivo']}"})
            continue
        if r["Email"] and not EMAIL_RE.match(r["Email"]):
            item["warnings"].append(f"Email non valida: {r['Email']}")
        existing = db_clients.get(code)
        if not existing:
            item["action"] = "create"
            item["new_doc"] = flat
        else:
            snap = await _snapshot_get(f"client:{code}")
            changes = _diff_changes(CLIENT_CMP_FIELDS, existing, flat, snap)
            if not changes:
                item["action"] = "unchanged"
            else:
                deact = next((c for c in changes if c["field"] == "is_active" and c["new"] == "NO"), None)
                item["action"] = "deactivate" if deact and len(changes) == 1 else "update"
                item["changes"] = changes
                item["new_doc"] = flat
                item["existing_id"] = existing["id"]
        items.append(item)

    # ---- STRUTTURE & UNITÀ ----
    by_struct = {}
    for r in raw_structs:
        scode = r["Codice Struttura"].strip().upper()
        if not scode:
            errors.append({"tab": "STRUTTURE", "row": r["_row"], "level": "error", "msg": "Codice Struttura mancante"})
            continue
        by_struct.setdefault(scode, []).append(r)

    for scode, rows in by_struct.items():
        r0 = rows[0]
        if not CODE_RES["structure"].match(scode):
            errors.append({"tab": "STRUTTURE", "row": r0["_row"], "level": "error", "msg": f"Codice Struttura non valido: {scode} (formato atteso KLV-0001)"})
            continue
        ccode = r0["Codice Cliente"].strip().upper()
        incoerenti = [r for r in rows if r["Codice Cliente"].strip().upper() != ccode or (r["Nome Struttura"].strip() and r["Nome Struttura"].strip() != r0["Nome Struttura"].strip())]
        if incoerenti:
            errors.append({"tab": "STRUTTURE", "row": incoerenti[0]["_row"], "level": "error",
                           "msg": f"Codice Struttura {scode} usato con Cliente/Nome incoerenti"})
            continue
        client = db_clients.get(ccode)
        client_in_sheet = ccode in sheet_client_codes
        if not ccode:
            errors.append({"tab": "STRUTTURE", "row": r0["_row"], "level": "error", "msg": f"{scode}: Codice Cliente mancante"})
            continue
        if not client and not client_in_sheet:
            errors.append({"tab": "STRUTTURE", "row": r0["_row"], "level": "error",
                           "msg": f"{scode}: Codice Cliente inesistente ({ccode})"})
            continue
        ha_unita = parse_bool(r0["Ha Unità"], default=False)
        unit_rows = [r for r in rows if r["Codice Unità"].strip()]
        if not ha_unita and unit_rows:
            errors.append({"tab": "STRUTTURE", "row": unit_rows[0]["_row"], "level": "error",
                           "msg": f"{scode}: 'Ha Unità'=NO ma sono indicate Unità"})
            continue
        try:
            capienza = parse_int(r0["Capienza"])
            bd = parse_int(r0["Letti Matrimoniali"]); bs = parse_int(r0["Letti Singoli"]); bso = parse_int(r0["Divani Letto"])
            durata = parse_int(r0["Durata Prevista Pulizia (min)"])
        except ValueError as e:
            errors.append({"tab": "STRUTTURE", "row": r0["_row"], "level": "error", "msg": f"{scode}: {e}"})
            continue
        if any(x is not None and x < 0 for x in (capienza, bd, bs, bso, durata)):
            errors.append({"tab": "STRUTTURE", "row": r0["_row"], "level": "error", "msg": f"{scode}: valori numerici negativi"})
            continue
        tipo_raw = r0["Tipo Struttura"].strip().lower()
        stype = STRUCTURE_TYPE_FROM_IT.get(tipo_raw, tipo_raw if tipo_raw in STRUCTURE_TYPES_IT else "apartment")
        zone_raw = r0["Rione / Zona"].strip()
        zone = zones.get(zone_raw.lower()) if zone_raw else None
        addr = ", ".join([x for x in [r0["Indirizzo"], r0["CAP"], r0["Città"]] if x]) or None

        new_doc = {"name": r0["Nome Struttura"], "structure_type": stype, "address": addr,
                   "floor": r0["Piano"] or None, "interior": r0["Interno"] or None,
                   "zone_name": zone["name"] if zone else (zone_raw or None),
                   "zone_id": zone["id"] if zone else None,
                   "capacity": capienza, "beds_double": bd, "beds_single": bs, "beds_sofa": bso,
                   "expected_cleaning_minutes": durata, "notes": r0["Note"] or None,
                   "client_code": ccode, "has_units": bool(ha_unita)}
        item = {"key": f"structure:{scode}", "entity": "Struttura", "code": scode,
                "label": f"{scode} · {r0['Nome Struttura']}", "action": None, "changes": [], "warnings": [], "row": r0["_row"]}
        if zone_raw and not zone and zones:
            item["warnings"].append(f"Rione non riconosciuto: {zone_raw}")
        if not zone_raw:
            item["warnings"].append("Rione non compilato")
        existing = db_structs.get(scode)
        if not existing:
            item["action"] = "create"
            item["new_doc"] = new_doc
        else:
            bc = existing.get("bed_config") or {}
            existing_flat = {"name": existing.get("name"), "structure_type": existing.get("structure_type"),
                             "address": existing.get("address"), "floor": existing.get("floor"),
                             "interior": existing.get("interior"),
                             "zone_name": (zones_by_id.get(existing.get("operational_zone_id")) or {}).get("name") or existing.get("zone_name") or existing.get("zone"),
                             "capacity": bc.get("capacity_persons") or bc.get("capacity_total"),
                             "beds_double": bc.get("beds_double"), "beds_single": bc.get("beds_single"),
                             "beds_sofa": bc.get("sofa_beds"), "expected_cleaning_minutes": existing.get("expected_cleaning_minutes"),
                             "notes": existing.get("notes")}
            cl = await db.clients.find_one({"id": existing.get("client_id")}, {"_id": 0, "code": 1})
            existing_flat["client_code"] = (cl or {}).get("code")
            snap = await _snapshot_get(f"structure:{scode}")
            changes = _diff_changes([(f, l) for f, l in STRUCT_CMP], existing_flat, new_doc, snap)
            if changes:
                item["action"] = "update"
                item["changes"] = changes
                item["new_doc"] = new_doc
                item["existing_id"] = existing["id"]
            else:
                item["action"] = "unchanged"
        items.append(item)

        # Unità della struttura
        seen_units = set()
        for r in unit_rows:
            ucode = r["Codice Unità"].strip().upper()
            if ucode in seen_units:
                errors.append({"tab": "STRUTTURE", "row": r["_row"], "level": "error", "msg": f"Codice Unità duplicato: {ucode}"})
                continue
            seen_units.add(ucode)
            u_new = {"name": r["Nome Unità"] or ucode, "notes": r["Note"] or None}
            u_item = {"key": f"unit:{ucode}", "entity": "Unità", "code": ucode,
                      "label": f"{ucode} · {u_new['name']} ({scode})", "action": None, "changes": [],
                      "warnings": [], "row": r["_row"], "parent_structure": scode}
            u_existing = db_units.get(ucode)
            if not u_existing:
                u_item["action"] = "create"
                u_item["new_doc"] = u_new
            else:
                snap = await _snapshot_get(f"unit:{ucode}")
                changes = _diff_changes(UNIT_CMP, u_existing, u_new, snap)
                if changes:
                    u_item["action"] = "update"
                    u_item["changes"] = changes
                    u_item["new_doc"] = u_new
                    u_item["existing_id"] = u_existing["id"]
                else:
                    u_item["action"] = "unchanged"
            items.append(u_item)

    # ---- SERVIZI STRUTTURE ----
    for r in raw_services:
        scode = r["Codice Struttura"].strip().upper()
        if not scode:
            continue
        existing = db_structs.get(scode)
        in_sheet = f"structure:{scode}" in {i["key"] for i in items}
        if not existing and not in_sheet:
            errors.append({"tab": "SERVIZI", "row": r["_row"], "level": "error", "msg": f"Servizi per Struttura inesistente: {scode}"})
            continue
        new_services = []
        invalid = False
        for col, svc in SERVICE_COLS:
            b = parse_bool(r[col], default=False)
            if b is None:
                errors.append({"tab": "SERVIZI", "row": r["_row"], "level": "error", "msg": f"{scode}: valore SÌ/NO non valido in {col}"})
                invalid = True
                break
            if b:
                new_services.append(svc)
        if invalid:
            continue
        kit_b = parse_bool(r["Kit Pulizie Struttura"], default=None)
        item = {"key": f"services:{scode}", "entity": "Servizi", "code": scode,
                "label": f"Servizi {scode}", "action": None, "changes": [], "warnings": [], "row": r["_row"],
                "new_doc": {"services": new_services, "kit_enabled": kit_b, "note": r["Note Servizi"] or None}}
        if existing:
            old_services = sorted([s for s in (existing.get("services") or []) if s in dict(SERVICE_COLS).values()])
            if sorted(new_services) != old_services or kit_b is not None:
                kit_cfg = await db.structure_cleaning_kits.find_one({"structure_id": existing["id"]}, {"_id": 0, "enabled": 1})
                kit_old = bool((kit_cfg or {}).get("enabled", True))
                changes = []
                if sorted(new_services) != old_services:
                    changes.append({"field": "services", "label": "Servizi attivi",
                                    "old": ", ".join(old_services) or "—", "new": ", ".join(sorted(new_services)) or "—", "conflict": False})
                if kit_b is not None and kit_b != kit_old:
                    changes.append({"field": "kit_enabled", "label": "Kit Pulizie", "old": _norm(kit_old), "new": _norm(kit_b), "conflict": False})
                if changes:
                    item["action"] = "update"
                    item["changes"] = changes
                    item["existing_id"] = existing["id"]
                else:
                    item["action"] = "unchanged"
            else:
                item["action"] = "unchanged"
        else:
            item["action"] = "create"
        items.append(item)

    # ---- DIPENDENTI ----
    seen_u = set()
    for r in raw_users:
        code = r["Codice Utente"].strip().upper()
        if not code:
            errors.append({"tab": "DIPENDENTI", "row": r["_row"], "level": "error", "msg": "Codice Utente mancante"})
            continue
        if not CODE_RES["user"].match(code):
            errors.append({"tab": "DIPENDENTI", "row": r["_row"], "level": "error", "msg": f"Codice Utente non valido: {code} (formato atteso USR-0001)"})
            continue
        if code in seen_u:
            errors.append({"tab": "DIPENDENTI", "row": r["_row"], "level": "error", "msg": f"Codice Utente duplicato: {code}"})
            continue
        seen_u.add(code)
        role_raw = r["Ruolo"].strip().lower()
        role = ROLE_FROM_IT.get(role_raw) or (role_raw if role_raw in ROLE_IT else None)
        if not role:
            errors.append({"tab": "DIPENDENTI", "row": r["_row"], "level": "error", "msg": f"{code}: ruolo inesistente '{r['Ruolo']}'"})
            continue
        stato = parse_bool(r["Stato"] if r["Stato"].lower() not in ("attivo", "disattivo") else ("SÌ" if r["Stato"].lower() == "attivo" else "NO"), default=True)
        if stato is None:
            errors.append({"tab": "DIPENDENTI", "row": r["_row"], "level": "error", "msg": f"{code}: Stato non valido"})
            continue
        if r["Email"] and not EMAIL_RE.match(r["Email"]):
            errors.append({"tab": "DIPENDENTI", "row": r["_row"], "level": "error", "msg": f"{code}: email non valida"})
            continue
        try:
            max_h = parse_int(r["Ore Massime"])
        except ValueError:
            errors.append({"tab": "DIPENDENTI", "row": r["_row"], "level": "error", "msg": f"{code}: Ore Massime non valide"})
            continue
        full_name = f"{r['Nome']} {r['Cognome']}".strip()
        new_doc = {"name": full_name, "phone": r["Telefono"] or None, "email": (r["Email"] or "").lower() or None,
                   "role": role, "language": r["Lingua"] or None, "is_active": stato, "max_hours": max_h,
                   "availability_notes": r["Disponibilità Standard"] or None,
                   "operational_notes": r["Note Operative"] or None, "zaino_code": r["Codice Zaino"] or None}
        item = {"key": f"user:{code}", "entity": "Dipendente", "code": code, "label": full_name or code,
                "action": None, "changes": [], "warnings": [], "row": r["_row"]}
        existing = db_users_by_code.get(code) or (db_users_by_email.get(new_doc["email"]) if new_doc["email"] else None)
        if existing and not existing.get("code"):
            pass
        if not existing:
            item["action"] = "create"
            item["new_doc"] = new_doc
            item["warnings"].append("Anagrafica creata SENZA account di accesso: l'attivazione credenziali si gestisce in Utenti & Ruoli")
        else:
            snap = await _snapshot_get(f"user:{code}")
            existing_flat = {k: existing.get(k) for k, _ in USER_CMP}
            changes = _diff_changes(USER_CMP, existing_flat, new_doc, snap)
            if changes:
                deact = next((c for c in changes if c["field"] == "is_active" and c["new"] == "NO"), None)
                item["action"] = "deactivate" if deact and len(changes) == 1 else "update"
                item["changes"] = changes
                item["new_doc"] = new_doc
                item["existing_id"] = existing["id"]
            else:
                item["action"] = "unchanged"
        items.append(item)

    # ---- Record noti spariti dal foglio (mai cancellare) ----
    sheet_keys = {i["key"] for i in items}
    async for snap in db.sheets_snapshots.find({}, {"_id": 0, "key": 1}):
        if snap["key"] not in sheet_keys:
            ent, code = snap["key"].split(":", 1)
            items.append({"key": snap["key"], "entity": {"client": "Cliente", "structure": "Struttura", "unit": "Unità", "user": "Dipendente", "services": "Servizi"}.get(ent, ent),
                          "code": code, "label": code, "action": "missing", "changes": [],
                          "warnings": ["Record non più presente nel foglio — NON verrà eliminato da Kilolava"], "row": None})

    summary = {
        "nuovi": {}, "modificati": {}, "invariati": 0, "errori": len(errors),
        "disattivazioni": len([i for i in items if i["action"] == "deactivate"]),
        "conflitti": len([i for i in items if any(c.get("conflict") for c in i.get("changes", []))]),
    }
    for i in items:
        if i["action"] == "create":
            summary["nuovi"][i["entity"]] = summary["nuovi"].get(i["entity"], 0) + 1
        elif i["action"] in ("update", "deactivate"):
            summary["modificati"][i["entity"]] = summary["modificati"].get(i["entity"], 0) + 1
        elif i["action"] == "unchanged":
            summary["invariati"] += 1

    preview = {"id": str(uuid.uuid4()), "created_at": now_iso(), "created_by": user["id"],
               "created_by_name": user.get("name", ""), "items": items, "errors": errors, "summary": summary}
    await db.sheets_previews.insert_one({**preview})
    preview.pop("_id", None)
    return preview


# ---------------- Apply (con conferma Admin) ----------------

async def _audit(user, entity, code, action, changes=None):
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()), "timestamp": now_iso(),
        "user_id": user["id"], "user_name": user.get("name", ""), "role": user.get("role", ""),
        "method": "IMPORT", "path": "/google-sheets/import", "status": 200,
        "entity_type": entity, "entity_id": code, "action": action,
        "origin": "Google Sheets Import",
        "changes": [{"field": c["label"], "old": c["old"], "new": c["new"]} for c in (changes or [])],
    })


async def apply_preview(preview_id, decisions, user):
    preview = await db.sheets_previews.find_one({"id": preview_id}, {"_id": 0})
    if not preview:
        raise RuntimeError("Anteprima non trovata o scaduta")
    stats = {"creati": 0, "modificati": 0, "disattivati": 0, "saltati": 0}
    now = now_iso()

    def decision(item):
        d = (decisions or {}).get(item["key"], {})
        return d if isinstance(d, dict) else {}

    # ordine: clienti → strutture → unità → servizi → dipendenti
    order = {"Cliente": 0, "Struttura": 1, "Unità": 2, "Servizi": 3, "Dipendente": 4}
    items = sorted([i for i in preview["items"] if i["action"] in ("create", "update", "deactivate")],
                   key=lambda i: order.get(i["entity"], 9))

    zones_by_id = {z["id"]: z async for z in db.operational_zones.find({}, {"_id": 0})}
    client_ids = {}   # code -> id (anche appena creati)
    struct_ids = {}
    async for c in db.clients.find({"code": {"$ne": None}}, {"_id": 0, "id": 1, "code": 1}):
        client_ids[c["code"]] = c["id"]
    async for s in db.structures.find({"klv_code": {"$ne": None}}, {"_id": 0, "id": 1, "klv_code": 1}):
        struct_ids[s["klv_code"]] = s["id"]

    for item in items:
        d = decision(item)
        if d.get("apply") is False:
            stats["saltati"] += 1
            continue
        fields_pref = d.get("fields", {})
        new_doc = item.get("new_doc") or {}
        # rispetta i conflitti risolti "mantieni Kilolava"
        skip_fields = {f for f, choice in fields_pref.items() if choice == "kilolava"}

        if item["entity"] == "Cliente":
            code = item["code"]
            if item["action"] == "create":
                doc = {"id": str(uuid.uuid4()), "code": code, **new_doc, "ordering_enabled": False,
                       "created_at": now, "updated_at": now}
                await db.clients.insert_one(doc)
                client_ids[code] = doc["id"]
                stats["creati"] += 1
                await _audit(user, "cliente", code, "create")
            else:
                upd = {"updated_at": now}
                for c in item["changes"]:
                    if c["field"] in skip_fields:
                        continue
                    if c["field"].startswith("_info."):
                        info_key = "company_info" if new_doc.get("client_type") == "company" else "private_info"
                        upd[f"{info_key}.{c['field'][6:]}"] = _get_path(new_doc, c["field"])
                    else:
                        upd[c["field"]] = new_doc.get(c["field"])
                await db.clients.update_one({"id": item["existing_id"]}, {"$set": upd})
                stats["disattivati" if item["action"] == "deactivate" else "modificati"] += 1
                await _audit(user, "cliente", code, item["action"], item["changes"])
            cl = await db.clients.find_one({"code": code}, {"_id": 0})
            await _snapshot_set(f"client:{code}", _snapshot_values(CLIENT_CMP_FIELDS, cl))

        elif item["entity"] == "Struttura":
            scode = item["code"]
            client_id = client_ids.get(new_doc.get("client_code"))
            if item["action"] == "create":
                if not client_id:
                    stats["saltati"] += 1
                    continue
                doc = {"id": str(uuid.uuid4()), "klv_code": scode, "client_id": client_id,
                       "name": new_doc["name"], "structure_type": new_doc["structure_type"],
                       "address": new_doc.get("address"), "floor": new_doc.get("floor"),
                       "interior": new_doc.get("interior"), "zone_name": new_doc.get("zone_name"),
                       "operational_zone_id": new_doc.get("zone_id"),
                       "has_units": new_doc.get("has_units", False),
                       "expected_cleaning_minutes": new_doc.get("expected_cleaning_minutes"),
                       "bed_config": {"capacity_persons": new_doc.get("capacity"),
                                      "beds_double": new_doc.get("beds_double"),
                                      "beds_single": new_doc.get("beds_single"),
                                      "sofa_beds": new_doc.get("beds_sofa")},
                       "services": [], "custom_services": [], "notes": new_doc.get("notes"),
                       "is_active": True, "access_type": "keybox",
                       "created_at": now, "updated_at": now}
                await db.structures.insert_one(doc)
                struct_ids[scode] = doc["id"]
                try:
                    seq = int(scode.split("-")[-1])
                    await db.counters.update_one({"_id": "klv_structure", "seq": {"$lt": seq}}, {"$set": {"seq": seq}})
                except (ValueError, IndexError):
                    pass
                stats["creati"] += 1
                await _audit(user, "struttura", scode, "create")
            else:
                upd = {"updated_at": now}
                for c in item["changes"]:
                    f = c["field"]
                    if f in skip_fields:
                        continue
                    if f == "client_code":
                        if client_ids.get(new_doc.get("client_code")):
                            upd["client_id"] = client_ids[new_doc["client_code"]]
                    elif f == "capacity":
                        upd["bed_config.capacity_persons"] = new_doc.get("capacity")
                    elif f == "beds_double":
                        upd["bed_config.beds_double"] = new_doc.get("beds_double")
                    elif f == "beds_single":
                        upd["bed_config.beds_single"] = new_doc.get("beds_single")
                    elif f == "beds_sofa":
                        upd["bed_config.sofa_beds"] = new_doc.get("beds_sofa")
                    elif f == "zone_name":
                        upd["zone_name"] = new_doc.get("zone_name")
                        upd["operational_zone_id"] = new_doc.get("zone_id")
                    else:
                        upd[f] = new_doc.get(f)
                await db.structures.update_one({"id": item["existing_id"]}, {"$set": upd})
                stats["modificati"] += 1
                await _audit(user, "struttura", scode, "update", item["changes"])
            s = await db.structures.find_one({"klv_code": scode}, {"_id": 0})
            bc = s.get("bed_config") or {}
            cl = await db.clients.find_one({"id": s.get("client_id")}, {"_id": 0, "code": 1})
            await _snapshot_set(f"structure:{scode}", _snapshot_values(STRUCT_CMP, {
                **s, "zone_name": (zones_by_id.get(s.get("operational_zone_id")) or {}).get("name") or s.get("zone_name") or s.get("zone"),
                "capacity": bc.get("capacity_persons"),
                "beds_double": bc.get("beds_double"), "beds_single": bc.get("beds_single"),
                "beds_sofa": bc.get("sofa_beds"), "client_code": (cl or {}).get("code")}))

        elif item["entity"] == "Unità":
            ucode = item["code"]
            struct_id = struct_ids.get(item.get("parent_structure"))
            if item["action"] == "create":
                if not struct_id:
                    stats["saltati"] += 1
                    continue
                doc = {"id": str(uuid.uuid4()), "code": ucode, "structure_id": struct_id,
                       "name": new_doc["name"], "unit_type": "room", "notes": new_doc.get("notes"),
                       "is_active": True, "created_at": now, "updated_at": now}
                await db.units.insert_one(doc)
                await db.structures.update_one({"id": struct_id}, {"$set": {"has_units": True, "updated_at": now}})
                stats["creati"] += 1
                await _audit(user, "unita", ucode, "create")
            else:
                upd = {"updated_at": now}
                for c in item["changes"]:
                    if c["field"] not in skip_fields:
                        upd[c["field"]] = new_doc.get(c["field"])
                await db.units.update_one({"id": item["existing_id"]}, {"$set": upd})
                stats["modificati"] += 1
                await _audit(user, "unita", ucode, "update", item["changes"])
            u = await db.units.find_one({"code": ucode}, {"_id": 0})
            await _snapshot_set(f"unit:{ucode}", _snapshot_values(UNIT_CMP, u))

        elif item["entity"] == "Servizi":
            scode = item["code"]
            struct_id = struct_ids.get(scode)
            if not struct_id:
                stats["saltati"] += 1
                continue
            svc = item["new_doc"]
            base = await db.structures.find_one({"id": struct_id}, {"_id": 0, "services": 1})
            managed = {s for _, s in SERVICE_COLS}
            extra = [s for s in (base or {}).get("services", []) if s not in managed]
            await db.structures.update_one({"id": struct_id}, {"$set": {
                "services": extra + svc["services"], "updated_at": now}})
            if svc.get("kit_enabled") is not None:
                await db.structure_cleaning_kits.update_one(
                    {"structure_id": struct_id},
                    {"$set": {"structure_id": struct_id, "enabled": svc["kit_enabled"]},
                     "$setOnInsert": {"id": str(uuid.uuid4()), "kit_id": None, "custom_items": []}},
                    upsert=True)
            stats["modificati" if item["action"] == "update" else "creati"] += 1
            await _audit(user, "servizi_struttura", scode, item["action"], item.get("changes"))
            await _snapshot_set(f"services:{scode}", {"services": ", ".join(sorted(svc["services"]))})

        elif item["entity"] == "Dipendente":
            code = item["code"]
            if item["action"] == "create":
                doc = {"id": str(uuid.uuid4()), "code": code, "name": new_doc["name"],
                       "email": new_doc.get("email") or f"{code.lower()}@anagrafica.kilolava.local",
                       "phone": new_doc.get("phone"), "role": new_doc["role"],
                       "language": new_doc.get("language"), "is_active": new_doc.get("is_active", True),
                       "max_hours": new_doc.get("max_hours"),
                       "availability_notes": new_doc.get("availability_notes"),
                       "operational_notes": new_doc.get("operational_notes"),
                       "login_enabled": False, "hashed_password": None,
                       "created_at": now, "updated_at": now}
                await db.users.insert_one(doc)
                stats["creati"] += 1
                await _audit(user, "utente", code, "create")
            else:
                upd = {"updated_at": now, "code": code}
                for c in item["changes"]:
                    if c["field"] not in skip_fields:
                        upd[c["field"]] = new_doc.get(c["field"])
                await db.users.update_one({"id": item["existing_id"]}, {"$set": upd})
                stats["disattivati" if item["action"] == "deactivate" else "modificati"] += 1
                await _audit(user, "utente", code, item["action"], item["changes"])
            u = await db.users.find_one({"code": code}, {"_id": 0, "hashed_password": 0})
            if u:
                await _snapshot_set(f"user:{code}", _snapshot_values(USER_CMP, u))

    history = {"id": str(uuid.uuid4()), "at": now, "user_id": user["id"], "user_name": user.get("name", ""),
               "type": "import", "creati": stats["creati"], "modificati": stats["modificati"],
               "disattivati": stats["disattivati"], "saltati": stats["saltati"],
               "warnings": len([i for i in preview["items"] if i.get("warnings")]),
               "errori": len(preview.get("errors", [])), "esito": "success"}
    await db.sheets_sync_history.insert_one({**history})
    history.pop("_id", None)
    await db.sheets_previews.delete_one({"id": preview_id})
    return {"ok": True, "stats": stats, "history": history}


# ---------------- Backup (Kilolava → Google Sheet, read-only logico) ----------------

def _yn(v):
    return "SÌ" if v else "NO"


async def run_backup(user_name="Automatico"):
    cfg = oauth_config()
    service = await get_service()
    if not service or not cfg["backup_id"]:
        raise RuntimeError("Google Sheets non connesso")
    await ensure_codes()
    now = now_iso()

    clients = await db.clients.find({}, {"_id": 0}).sort("code", 1).to_list(3000)
    structures = await db.structures.find({}, {"_id": 0}).sort("klv_code", 1).to_list(3000)
    units = await db.units.find({}, {"_id": 0}).to_list(5000)
    users = await db.users.find({}, {"_id": 0, "hashed_password": 0, "password": 0}).sort("code", 1).to_list(1000)
    kits = {k["structure_id"]: k async for k in db.structure_cleaning_kits.find({}, {"_id": 0})}
    zaini = {z.get("assigned_to"): z.get("code") async for z in db.zaini.find({}, {"_id": 0}) if z.get("assigned_to")}
    zones_by_id = {z["id"]: z async for z in db.operational_zones.find({}, {"_id": 0})}
    cmap = {c["id"]: c for c in clients}

    cli_rows = [CLIENTI_HEADERS]
    for c in clients:
        info = c.get("company_info") if c.get("client_type") == "company" else c.get("private_info")
        info = info or {}
        cli_rows.append([
            c.get("code") or "", "Azienda" if c.get("client_type") == "company" else "Privato",
            info.get("name") or info.get("representative_name") or "", info.get("surname") or info.get("representative_surname") or "",
            info.get("company_name") or "", info.get("representative_name") or "",
            info.get("fiscal_code") or "", info.get("vat_number") or "", info.get("sdi") or "",
            info.get("pec") or "", info.get("email") or "", info.get("phone") or "",
            info.get("address") or "", "", "", "", c.get("notes") or "", _yn(c.get("is_active", True)),
        ])

    str_rows = [STRUTTURE_HEADERS]
    units_by_struct = {}
    for u in units:
        units_by_struct.setdefault(u.get("structure_id"), []).append(u)
    for s in structures:
        bc = s.get("bed_config") or {}
        client_code = (cmap.get(s.get("client_id")) or {}).get("code", "")
        base = [client_code, s.get("klv_code") or "", s.get("name") or "",
                STRUCTURE_TYPES_IT.get(s.get("structure_type"), s.get("structure_type") or ""),
                _yn(bool(units_by_struct.get(s["id"]))), "", "",
                s.get("address") or "", "", "", s.get("floor") or "", s.get("interior") or "",
                (zones_by_id.get(s.get("operational_zone_id")) or {}).get("name") or s.get("zone_name") or s.get("zone") or "",
                bc.get("capacity_persons") or bc.get("capacity_total") or "",
                bc.get("beds_double") or "", bc.get("beds_single") or "", bc.get("sofa_beds") or "",
                s.get("expected_cleaning_minutes") or "", s.get("notes") or ""]
        s_units = units_by_struct.get(s["id"], [])
        if not s_units:
            str_rows.append(base)
        else:
            for u in s_units:
                row = list(base)
                row[5] = u.get("code") or ""
                row[6] = u.get("name") or ""
                str_rows.append(row)

    svc_rows = [SERVIZI_HEADERS]
    for s in structures:
        svcs = s.get("services") or []
        kit = kits.get(s["id"])
        svc_rows.append([
            s.get("klv_code") or "", _yn("cleaning" in svcs), _yn("private_laundry" in svcs),
            _yn("linen_rental" in svcs), _yn("consumables" in svcs), _yn("maintenance" in svcs),
            _yn(bool(kit and kit.get("enabled"))), "",
        ])

    usr_rows = [DIPENDENTI_HEADERS]
    for u in users:
        parts = (u.get("name") or "").split(" ", 1)
        usr_rows.append([
            u.get("code") or "", parts[0], parts[1] if len(parts) > 1 else "",
            ROLE_IT.get(u.get("role"), u.get("role") or ""), u.get("phone") or "", u.get("email") or "",
            u.get("language") or "IT", "Attivo" if u.get("is_active", True) else "Disattivo",
            u.get("max_hours") or "", u.get("availability_notes") or "",
            zaini.get(u["id"]) or "", u.get("operational_notes") or "",
        ])

    tabs = {
        "Clienti": cli_rows, "Strutture & Unità": str_rows,
        "Servizi Strutture": svc_rows, "Dipendenti / Collaboratori": usr_rows,
    }
    await _ensure_tabs(service, cfg["backup_id"], {t: rows[0] for t, rows in tabs.items()})
    for title, rows in tabs.items():
        await asyncio.to_thread(lambda t=title: service.spreadsheets().values().clear(
            spreadsheetId=cfg["backup_id"], range=f"'{t}'!A2:Z10000").execute())
        await asyncio.to_thread(lambda t=title, r=rows: service.spreadsheets().values().update(
            spreadsheetId=cfg["backup_id"], range=f"'{t}'!A1",
            valueInputOption="RAW", body={"values": r}).execute())

    rec = {"id": str(uuid.uuid4()), "at": now, "type": "backup", "user_name": user_name,
           "clienti": len(clients), "strutture": len(structures), "unita": len(units),
           "dipendenti": len(users), "esito": "success"}
    await db.sheets_sync_history.insert_one({**rec})
    rec.pop("_id", None)
    return rec


async def auto_backup_job():
    """Backup automatico giornaliero (scheduler)."""
    tok = await get_token_doc()
    if not tok:
        return
    try:
        await run_backup("Automatico")
    except Exception:
        await db.sheets_sync_history.insert_one({
            "id": str(uuid.uuid4()), "at": now_iso(), "type": "backup",
            "user_name": "Automatico", "esito": "error"})

