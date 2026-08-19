"""Google Sheets one-way sync: Kilolava -> Google Fogli.

Kilolava is the source of truth. The spreadsheet is a human-readable mirror,
rewritten (no duplicates) at each sync. Sensitive data (door/keybox/warehouse
codes, key locations, credentials) is NEVER synced.

Configuration (backend env only):
  GOOGLE_SERVICE_ACCOUNT_JSON  -> inline JSON or path to service-account file
  GOOGLE_SHEETS_SPREADSHEET_ID -> ID of the spreadsheet shared with the SA email
"""
import os
import json
import asyncio
import logging

from fastapi import HTTPException

from core.database import db
from core.utils import now_iso

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

HEADER_COLOR = {"red": 0.949, "green": 0.306, "blue": 0.459}
WHITE = {"red": 1, "green": 1, "blue": 1}
GREEN_BG = {"red": 0.85, "green": 0.94, "blue": 0.87}
ORANGE_BG = {"red": 0.99, "green": 0.93, "blue": 0.83}
RED_BG = {"red": 0.98, "green": 0.87, "blue": 0.87}
GREY_BG = {"red": 0.94, "green": 0.94, "blue": 0.94}

CLEANING_STATUS = {"pending": "Da fare", "assigned": "Assegnata", "in_progress": "In corso", "completed": "Completata", "cancelled": "Annullata"}
LOGISTICS_STATUS = {"pending": "Da fare", "assigned": "Assegnata", "in_progress": "In corso", "completed": "Completata", "cancelled": "Annullata"}
MAINT_STATUS = {"open": "Aperta", "assigned": "Assegnata", "in_progress": "In corso", "resolved": "Risolta", "cancelled": "Annullata"}
MAINT_PRIORITY = {"low": "Bassa", "medium": "Media", "high": "Alta", "urgent": "Urgente"}
MOVEMENT_TYPES = {"prepared": "Preparato", "delivered": "Consegnato", "picked_up": "Ritirato", "returned": "Rientrato", "missing": "Mancante", "damaged": "Danneggiato"}
PRIVATE_LAUNDRY_STATES = ["Arrivato", "Lavato", "Asciugato", "Piegato", "Stirato", "Pronto", "Consegnato"]


def _get_credentials():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not raw:
        return None
    try:
        from google.oauth2 import service_account
        if raw.strip().startswith("{"):
            info = json.loads(raw)
        else:
            with open(raw) as f:
                info = json.load(f)
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    except Exception as e:
        logger.error(f"Invalid Google service account credentials: {e}")
        return None


def get_config():
    creds = _get_credentials()
    spreadsheet_id = os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID")
    missing = []
    if not creds:
        missing.append("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not spreadsheet_id:
        missing.append("GOOGLE_SHEETS_SPREADSHEET_ID")
    return {
        "configured": not missing,
        "missing": missing,
        "spreadsheet_id": spreadsheet_id,
        "service_account_email": getattr(creds, "service_account_email", None) if creds else None,
    }


async def get_status():
    cfg = get_config()
    doc = await db.integration_settings.find_one({"_id": "google_sheets"}) or {}
    return {
        "configured": cfg["configured"],
        "missing": cfg["missing"],
        "service_account_email": cfg["service_account_email"],
        "spreadsheet_id": cfg["spreadsheet_id"],
        "spreadsheet_title": doc.get("spreadsheet_title"),
        "last_sync": doc.get("last_sync"),
        "last_status": doc.get("last_status"),
        "last_error": doc.get("last_error"),
        "synced_rows": doc.get("synced_rows"),
    }


def _client_name(c):
    if not c:
        return ""
    if c.get("client_type") == "company" and c.get("company_info"):
        return c["company_info"].get("company_name") or ""
    pi = c.get("private_info") or {}
    return f"{pi.get('name', '')} {pi.get('surname', '')}".strip()


def _client_contact(c, field):
    if not c:
        return ""
    info = c.get("company_info") if c.get("client_type") == "company" else c.get("private_info")
    return (info or {}).get(field) or ""


def _date(iso):
    return (iso or "")[:10]


async def _build_tabs():
    from datetime import datetime, timezone, timedelta
    clients = await db.clients.find({}, {"_id": 0}).to_list(3000)
    structures = await db.structures.find({}, {"_id": 0}).to_list(3000)
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(3000)
    articles = await db.articles.find({}, {"_id": 0}).to_list(3000)
    keys_settings = await db.app_settings.find_one({"_id": "keys"}) or {}
    box_capacity = keys_settings.get("box_capacity", 60)

    cmap = {c["id"]: c for c in clients}
    smap = {s["id"]: s for s in structures}
    umap = {u["id"]: u.get("name", "") for u in users}
    amap = {a["id"]: a for a in articles}

    def cname(cid):
        return _client_name(cmap.get(cid))

    def sklv(sid):
        return (smap.get(sid) or {}).get("klv_code") or ""

    def sname(sid):
        return (smap.get(sid) or {}).get("name") or ""

    def s_client_name(sid):
        return cname((smap.get(sid) or {}).get("client_id"))

    structure_counts = {}
    for s in structures:
        structure_counts[s["client_id"]] = structure_counts.get(s["client_id"], 0) + 1

    # Per-client KPIs (month revenue, today's activities, open alerts)
    now_dt = datetime.now(timezone.utc)
    today = now_dt.strftime("%Y-%m-%d")
    next_day = (now_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    month_start = f"{now_dt.year}-{now_dt.month:02d}-01"
    month_end = f"{now_dt.year + 1}-01-01" if now_dt.month == 12 else f"{now_dt.year}-{now_dt.month + 1:02d}-01"

    revenue_month, today_acts, alerts = {}, {}, {}
    async for doc in db.orders.aggregate([
        {"$match": {"created_at": {"$gte": month_start, "$lt": month_end}, "status": {"$nin": ["cancelled"]}, "client_id": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$client_id", "total": {"$sum": "$total"}}},
    ]):
        revenue_month[doc["_id"]] = doc.get("total", 0) or 0
    for coll, match in [
        (db.cleaning_tasks, {"date": today}),
        (db.logistics_tasks, {"date": today}),
        (db.maintenance_issues, {"created_at": {"$gte": today, "$lt": next_day}}),
    ]:
        async for doc in coll.aggregate([{"$match": {**match, "client_id": {"$nin": [None, ""]}}}, {"$group": {"_id": "$client_id", "n": {"$sum": 1}}}]):
            today_acts[doc["_id"]] = today_acts.get(doc["_id"], 0) + doc["n"]
    open_statuses = ["pending", "assigned", "in_progress"]
    for coll, match in [
        (db.cleaning_tasks, {"date": {"$lt": today}, "status": {"$in": open_statuses}}),
        (db.logistics_tasks, {"date": {"$lt": today}, "status": {"$in": open_statuses}}),
        (db.maintenance_issues, {"priority": {"$in": ["urgent", "high"]}, "status": {"$in": ["open", "assigned", "in_progress"]}}),
    ]:
        async for doc in coll.aggregate([{"$match": {**match, "client_id": {"$nin": [None, ""]}}}, {"$group": {"_id": "$client_id", "n": {"$sum": 1}}}]):
            alerts[doc["_id"]] = alerts.get(doc["_id"], 0) + doc["n"]

    tabs = []

    # ---- Clienti ----
    rows = []
    for c in sorted(clients, key=lambda x: _client_name(x).lower()):
        rows.append([
            c["id"][:8],
            _client_name(c),
            "Azienda" if c.get("client_type") == "company" else "Privato",
            _client_contact(c, "phone"),
            _client_contact(c, "email"),
            structure_counts.get(c["id"], 0),
            revenue_month.get(c["id"], 0),
            today_acts.get(c["id"], 0),
            alerts.get(c["id"], 0),
            f"/api/files/{c['logo_path']}" if c.get("logo_path") else "",
            c.get("notes") or "",
        ])
    tabs.append({
        "title": "Clienti",
        "headers": ["ID Cliente", "Nome / Ragione Sociale", "Tipo", "Telefono", "Email", "Numero Strutture", "Fatturato mese", "Attività oggi", "Alert", "Link Logo/Foto", "Note"],
        "rows": rows,
        "currency_cols": [6],
        "widths": [90, 220, 90, 130, 200, 120, 115, 100, 70, 220, 240],
        "conditional_rules": [
            {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": "=$I2>0"}]}, "color": RED_BG},
        ],
    })

    # ---- Strutture (mirrors the new list view) ----
    rows = []
    for s in sorted(structures, key=lambda x: x.get("klv_code") or ""):
        services = s.get("services") or []
        ai = s.get("access_info") or {}
        rows.append([
            s.get("klv_code") or "",
            s.get("name") or "",
            cname(s.get("client_id")),
            s.get("address") or "",
            "cleaning" in services,
            "private_laundry" in services,
            "rental_laundry" in services,
            "consumables" in services,
            "maintenance" in services,
            bool(ai.get("kilolava_has_keys")),
            s.get("notes") or "",
        ])
    tabs.append({
        "title": "Strutture",
        "headers": ["Codice KLV", "Struttura", "Cliente", "Indirizzo", "Pulizie", "Lavanderia Privata", "Lavanderia a Noleggio", "Consumabili", "Manutenzioni", "Possiede chiavi", "Note"],
        "rows": rows,
        "checkbox_cols": [4, 5, 6, 7, 8, 9],
        "widths": [95, 180, 160, 210, 75, 130, 150, 100, 105, 115, 220],
    })

    # ---- Chiavi (NO access codes: only presence/box/slot) ----
    rows = []
    box_occupied = {"A": 0, "B": 0, "C": 0}
    for s in sorted(structures, key=lambda x: x.get("klv_code") or ""):
        ai = s.get("access_info") or {}
        has_keys = bool(ai.get("kilolava_has_keys"))
        kb = ai.get("key_boxes") or {}
        a, b, c_ = kb.get("A") or {}, kb.get("B") or {}, kb.get("C") or {}
        if has_keys:
            for letter, copy in [("A", a), ("B", b), ("C", c_)]:
                box_name = str(copy.get("box") or letter).upper()
                if copy.get("present") and box_name[:1] in box_occupied:
                    box_occupied[box_name[:1]] += 1
        complete = has_keys and bool(a.get("present")) and bool(b.get("present")) and bool(c_.get("present"))
        notes = "; ".join(filter(None, [a.get("note"), b.get("note"), c_.get("note")]))
        rows.append([
            s.get("klv_code") or "",
            s.get("name") or "",
            cname(s.get("client_id")),
            has_keys,
            bool(a.get("present")),
            str(a.get("slot") or ""),
            bool(b.get("present")),
            str(b.get("slot") or ""),
            bool(c_.get("present")),
            str(c_.get("slot") or ""),
            complete,
            notes,
        ])
    tabs.append({
        "title": "Chiavi",
        "headers": ["Codice KLV", "Nome Struttura", "Cliente", "Kilolava possiede chiavi", "Copia A presente", "Slot A", "Copia B presente", "Slot B", "Copia C presente", "Slot C", "Sistema completo", "Note"],
        "rows": rows,
        "checkbox_cols": [3, 4, 6, 8, 10],
        "widths": [95, 180, 160, 165, 125, 65, 125, 65, 125, 65, 125, 220],
        "conditional_rules": [
            {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": "=$K2=TRUE"}]}, "color": GREEN_BG},
            {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": "=AND($D2=TRUE,$K2=FALSE)"}]}, "color": RED_BG},
            {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": "=$D2=FALSE"}]}, "color": GREY_BG},
        ],
        "extra_block": {
            "start_cell": "N1",
            "values": [
                ["Box", "Capacità", "Occupati", "Liberi"],
                ["A — Addette", box_capacity, box_occupied["A"], max(0, box_capacity - box_occupied["A"])],
                ["B — Rider", box_capacity, box_occupied["B"], max(0, box_capacity - box_occupied["B"])],
                ["C — Emergenza", box_capacity, box_occupied["C"], max(0, box_capacity - box_occupied["C"])],
            ],
        },
    })

    # ---- Magazzino Strutture (balances from movements) ----
    pipeline = [
        {"$match": {"structure_id": {"$nin": [None, ""]}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": {"s": "$structure_id", "a": "$items.article_id"},
            "bal": {"$sum": {"$cond": [
                {"$eq": ["$movement_type", "delivered"]}, "$items.quantity",
                {"$cond": [
                    {"$in": ["$movement_type", ["picked_up", "returned", "missing", "damaged"]]},
                    {"$multiply": ["$items.quantity", -1]}, 0
                ]}
            ]}},
            "last": {"$max": "$created_at"},
        }},
    ]
    rows = []
    async for doc in db.movements.aggregate(pipeline):
        sid, aid = doc["_id"]["s"], doc["_id"]["a"]
        qty = doc["bal"]
        stato = "Negativo" if qty < 0 else ("Esaurito" if qty == 0 else "OK")
        rows.append([
            sklv(sid), sname(sid), s_client_name(sid),
            (amap.get(aid) or {}).get("name") or aid,
            qty, 0, stato, _date(doc.get("last")),
        ])
    rows.sort(key=lambda r: (r[0], r[3]))
    tabs.append({
        "title": "Magazzino Strutture",
        "headers": ["Codice KLV", "Struttura", "Cliente", "Articolo", "Quantità", "Soglia minima", "Stato", "Ultimo aggiornamento"],
        "rows": rows,
        "widths": [95, 180, 160, 190, 85, 105, 95, 145],
        "conditional_rules": [
            {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": "=$E2<0"}]}, "color": RED_BG},
            {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": "=$E2=0"}]}, "color": ORANGE_BG},
            {"condition": {"type": "CUSTOM_FORMULA", "values": [{"userEnteredValue": "=$E2>0"}]}, "color": GREEN_BG},
        ],
    })

    # ---- Pulizie ----
    checkin_days = set()
    async for ev in db.events.find({"event_type": "booking"}, {"_id": 0, "structure_id": 1, "start": 1}):
        if ev.get("structure_id") and ev.get("start"):
            checkin_days.add((ev["structure_id"], ev["start"][:10]))
    rows = []
    async for tsk in db.cleaning_tasks.find({}, {"_id": 0}).sort("date", -1).limit(2000):
        sid = tsk.get("structure_id")
        rows.append([
            tsk.get("date") or "",
            sklv(sid), sname(sid), cname(tsk.get("client_id")),
            umap.get(tsk.get("assigned_cleaner_id"), ""),
            "Pulizia",
            CLEANING_STATUS.get(tsk.get("status"), tsk.get("status") or ""),
            (sid, tsk.get("date")) in checkin_days,
            tsk.get("scheduled_time") or "",
            tsk.get("notes") or "",
        ])
    tabs.append({
        "title": "Pulizie",
        "headers": ["Data", "Codice KLV", "Struttura", "Cliente", "Operatore/i", "Tipo", "Stato", "Entrano oggi", "Ora check-in", "Note"],
        "rows": rows,
        "checkbox_cols": [7],
        "dropdown_cols": {6: list(CLEANING_STATUS.values())},
        "date_cols": [0],
        "widths": [95, 95, 180, 160, 140, 85, 110, 100, 95, 220],
    })

    # ---- Consegne ----
    rows = []
    async for tsk in db.logistics_tasks.find({}, {"_id": 0}).sort("date", -1).limit(2000):
        sid = tsk.get("structure_id")
        cats = {(amap.get(it.get("article_id")) or {}).get("category") for it in (tsk.get("items") or [])}
        rows.append([
            tsk.get("date") or "",
            sklv(sid), sname(sid), cname(tsk.get("client_id")),
            umap.get(tsk.get("rider_id"), ""),
            "Ritiro" if tsk.get("task_type") == "pickup" else "Consegna",
            "private_linen" in cats,
            "rental_linen" in cats,
            "consumable" in cats,
            LOGISTICS_STATUS.get(tsk.get("status"), tsk.get("status") or ""),
            tsk.get("notes") or "",
        ])
    tabs.append({
        "title": "Consegne",
        "headers": ["Data", "Codice KLV", "Struttura", "Cliente", "Rider", "Tipo", "Lavanderia Privata", "Lavanderia Noleggio", "Consumabili", "Stato", "Note"],
        "rows": rows,
        "checkbox_cols": [6, 7, 8],
        "dropdown_cols": {5: ["Consegna", "Ritiro"], 9: list(LOGISTICS_STATUS.values())},
        "date_cols": [0],
        "widths": [95, 95, 180, 160, 130, 95, 135, 145, 100, 110, 220],
    })

    # ---- Lavanderia Privata (module arrives in a future phase: headers + formats ready) ----
    rows = []
    async for job in db.private_laundry_jobs.find({}, {"_id": 0}).sort("created_at", -1).limit(2000):
        rows.append([
            cname(job.get("client_id")),
            _date(job.get("arrived_at") or job.get("created_at")),
            _date(job.get("due_date")),
            job.get("status") or "",
            job.get("final_kg") or "",
            f"/api/files/{job['weight_photo']}" if job.get("weight_photo") else "",
            bool(job.get("delivered")),
            job.get("notes") or "",
        ])
    tabs.append({
        "title": "Lavanderia Privata",
        "headers": ["Cliente", "Data arrivo", "Data prevista consegna", "Stato", "Kg finali", "Foto pesata", "Consegnato", "Note"],
        "rows": rows,
        "checkbox_cols": [6],
        "dropdown_cols": {3: PRIVATE_LAUNDRY_STATES},
        "date_cols": [1, 2],
        "number_formats": [(4, "0.0", "NUMBER")],
        "widths": [180, 100, 155, 110, 80, 220, 100, 220],
    })

    # ---- Lavanderia a Noleggio (movements) ----
    rows = []
    async for mv in db.movements.find({}, {"_id": 0}).sort("created_at", -1).limit(3000):
        for it in (mv.get("items") or []):
            aid = it.get("article_id")
            sid = mv.get("structure_id")
            rows.append([
                _date(mv.get("created_at")),
                MOVEMENT_TYPES.get(mv.get("movement_type"), mv.get("movement_type") or ""),
                (amap.get(aid) or {}).get("name") or aid or "",
                it.get("quantity") or 0,
                cname(mv.get("client_id")) or s_client_name(sid),
                sname(sid),
                sklv(sid),
                mv.get("notes") or "",
            ])
    tabs.append({
        "title": "Lavanderia a Noleggio",
        "headers": ["Data", "Tipo movimento", "Articolo", "Quantità", "Cliente", "Struttura", "Codice KLV", "Note"],
        "rows": rows,
        "dropdown_cols": {1: list(MOVEMENT_TYPES.values())},
        "date_cols": [0],
        "widths": [95, 130, 190, 85, 160, 180, 95, 220],
    })

    # ---- Manutenzioni ----
    rows = []
    async for mi in db.maintenance_issues.find({}, {"_id": 0}).sort("created_at", -1).limit(2000):
        sid = mi.get("structure_id")
        rows.append([
            _date(mi.get("created_at")),
            sklv(sid), sname(sid), cname(mi.get("client_id")) or s_client_name(sid),
            mi.get("description") or mi.get("category") or "",
            MAINT_PRIORITY.get(mi.get("priority"), mi.get("priority") or ""),
            umap.get(mi.get("assigned_to"), ""),
            MAINT_STATUS.get(mi.get("status"), mi.get("status") or ""),
            mi.get("status") == "resolved",
            mi.get("internal_notes") or "",
        ])
    tabs.append({
        "title": "Manutenzioni",
        "headers": ["Data", "Codice KLV", "Struttura", "Cliente", "Problema", "Priorità", "Tecnico", "Stato", "Completato", "Note"],
        "rows": rows,
        "checkbox_cols": [8],
        "dropdown_cols": {5: list(MAINT_PRIORITY.values()), 7: list(MAINT_STATUS.values())},
        "date_cols": [0],
        "widths": [95, 95, 180, 160, 260, 90, 130, 110, 100, 220],
    })

    return tabs


def _col_range(sheet_id, col, nrows):
    return {"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": max(nrows, 1) + 1, "startColumnIndex": col, "endColumnIndex": col + 1}


def _format_requests(sheet_id, tab, nrows, existing_cond_count):
    ncols = len(tab["headers"])
    reqs = []
    for _ in range(existing_cond_count):
        reqs.append({"deleteConditionalFormatRule": {"sheetId": sheet_id, "index": 0}})
    reqs.append({"updateSheetProperties": {"properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": 1}}, "fields": "gridProperties.frozenRowCount"}})
    reqs.append({"repeatCell": {
        "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": ncols},
        "cell": {"userEnteredFormat": {"backgroundColor": HEADER_COLOR, "textFormat": {"bold": True, "foregroundColor": WHITE}}},
        "fields": "userEnteredFormat(backgroundColor,textFormat)",
    }})
    reqs.append({"setBasicFilter": {"filter": {"range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": max(nrows, 1) + 1, "startColumnIndex": 0, "endColumnIndex": ncols}}}})
    for i, w in enumerate(tab.get("widths") or []):
        reqs.append({"updateDimensionProperties": {"range": {"sheetId": sheet_id, "dimension": "COLUMNS", "startIndex": i, "endIndex": i + 1}, "properties": {"pixelSize": w}, "fields": "pixelSize"}})
    if nrows > 0:
        for c in tab.get("checkbox_cols") or []:
            reqs.append({"setDataValidation": {"range": _col_range(sheet_id, c, nrows), "rule": {"condition": {"type": "BOOLEAN"}, "showCustomUi": True}}})
        for c, options in (tab.get("dropdown_cols") or {}).items():
            reqs.append({"setDataValidation": {"range": _col_range(sheet_id, int(c), nrows), "rule": {"condition": {"type": "ONE_OF_LIST", "values": [{"userEnteredValue": o} for o in options]}, "showCustomUi": True, "strict": False}}})
        for c in tab.get("date_cols") or []:
            reqs.append({"repeatCell": {"range": _col_range(sheet_id, c, nrows), "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE", "pattern": "dd/mm/yyyy"}}}, "fields": "userEnteredFormat.numberFormat"}})
        for c, pattern, ftype in tab.get("number_formats") or []:
            reqs.append({"repeatCell": {"range": _col_range(sheet_id, c, nrows), "cell": {"userEnteredFormat": {"numberFormat": {"type": ftype, "pattern": pattern}}}, "fields": "userEnteredFormat.numberFormat"}})
        for c in tab.get("currency_cols") or []:
            reqs.append({"repeatCell": {"range": _col_range(sheet_id, c, nrows), "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "€#,##0.00"}}}, "fields": "userEnteredFormat.numberFormat"}})
        for rule in tab.get("conditional_rules") or []:
            reqs.append({"addConditionalFormatRule": {"rule": {
                "ranges": [{"sheetId": sheet_id, "startRowIndex": 1, "endRowIndex": nrows + 1, "startColumnIndex": 0, "endColumnIndex": ncols}],
                "booleanRule": {"condition": rule["condition"], "format": {"backgroundColor": rule["color"]}},
            }, "index": 0}})
    return reqs


def _push(creds, spreadsheet_id, tabs):
    from googleapiclient.discovery import build
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    meta = service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        fields="properties(title),sheets(properties(sheetId,title),conditionalFormats)",
    ).execute()
    title = meta["properties"]["title"]
    existing = {s["properties"]["title"]: s["properties"] for s in meta.get("sheets", [])}
    cond_counts = {s["properties"]["title"]: len(s.get("conditionalFormats", [])) for s in meta.get("sheets", [])}

    add_reqs = [{"addSheet": {"properties": {"title": t["title"]}}} for t in tabs if t["title"] not in existing]
    if add_reqs:
        resp = service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": add_reqs}).execute()
        for r in resp.get("replies", []):
            p = r.get("addSheet", {}).get("properties", {})
            existing[p["title"]] = p
            cond_counts[p["title"]] = 0

    total = 0
    fmt_requests = []
    for tab in tabs:
        sheet_id = existing[tab["title"]]["sheetId"]
        service.spreadsheets().values().clear(spreadsheetId=spreadsheet_id, range=f"'{tab['title']}'").execute()
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab['title']}'!A1",
            valueInputOption="USER_ENTERED",
            body={"values": [tab["headers"]] + tab["rows"]},
        ).execute()
        extra = tab.get("extra_block")
        if extra:
            service.spreadsheets().values().update(
                spreadsheetId=spreadsheet_id,
                range=f"'{tab['title']}'!{extra['start_cell']}",
                valueInputOption="USER_ENTERED",
                body={"values": extra["values"]},
            ).execute()
        total += len(tab["rows"])
        fmt_requests += _format_requests(sheet_id, tab, len(tab["rows"]), cond_counts.get(tab["title"], 0))

    if fmt_requests:
        service.spreadsheets().batchUpdate(spreadsheetId=spreadsheet_id, body={"requests": fmt_requests}).execute()
    return {"spreadsheet_title": title, "rows": total, "tabs": [t["title"] for t in tabs]}


async def run_sync():
    cfg = get_config()
    if not cfg["configured"]:
        raise HTTPException(status_code=400, detail="Google Fogli non configurato. Variabili mancanti: " + ", ".join(cfg["missing"]))
    tabs = await _build_tabs()
    creds = _get_credentials()
    try:
        result = await asyncio.to_thread(_push, creds, cfg["spreadsheet_id"], tabs)
        await db.integration_settings.update_one(
            {"_id": "google_sheets"},
            {"$set": {"last_sync": now_iso(), "last_status": "ok", "last_error": None, "spreadsheet_title": result["spreadsheet_title"], "synced_rows": result["rows"]}},
            upsert=True,
        )
        return {"message": "Sincronizzazione completata", **result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google Sheets sync failed: {e}")
        await db.integration_settings.update_one(
            {"_id": "google_sheets"},
            {"$set": {"last_sync": now_iso(), "last_status": "error", "last_error": str(e)}},
            upsert=True,
        )
        raise HTTPException(status_code=502, detail=f"Sincronizzazione fallita: {e}")
