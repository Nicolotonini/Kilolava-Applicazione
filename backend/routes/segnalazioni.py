"""Centro Gestione Segnalazioni Kilolava."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Query
from pydantic import BaseModel

from core.database import db
from core.utils import now_iso

TYPES = ["missing", "damage", "malfunction", "other"]
TYPE_LABELS = {"missing": "Mancanza", "damage": "Rottura / Danno", "malfunction": "Malfunzionamento", "other": "Anomalia / Altro"}
PRIORITIES = ["low", "normal", "high", "urgent"]
STATUSES = ["da_valutare", "aperta", "risolta", "chiusa"]
OP_STATUSES = ["da_valutare", "aperta", "in_corso", "in_attesa", "risolta", "chiusa"]
TASK_TYPES = ["delivery", "maintenance", "notify_client", "internal"]
TASK_STATUSES = ["da_fare", "in_corso", "in_attesa", "completata", "annullata"]
WAIT_REASONS = ["cliente", "materiale", "ricambio", "fornitore", "autorizzazione", "altro"]
ORIGIN_TYPES = ["cleaning", "cleaner", "maintenance", "rider", "manager", "client", "warehouse", "delivery", "other", "automation"]

SUPPLY_CATEGORIES = {
    "consumabili_bagno": "Consumabili bagno",
    "consumabili_cucina": "Consumabili cucina",
    "biancheria": "Biancheria",
    "welcome_kit": "Welcome kit / Ricariche",
    "dotazioni": "Dotazioni appartamento",
    "piccoli_elettrodomestici": "Piccoli elettrodomestici",
    "arredi": "Arredi",
    "altro_forniture": "Altro",
}
MAINT_CATEGORIES = {
    "idraulica": "Idraulica",
    "elettrica": "Elettrica",
    "elettrodomestici": "Elettrodomestici",
    "climatizzazione": "Climatizzazione",
    "serrature": "Serrature / Accessi",
    "arredi_manutenzione": "Arredi",
    "piccole_manutenzioni": "Piccole manutenzioni",
    "altro_manutenzioni": "Altro",
}
ALL_CATEGORIES = {**SUPPLY_CATEGORIES, **MAINT_CATEGORIES}

AUTOMATION_KEYS = {
    "missing_kilolava": "Mancanze consumabili Kilolava",
    "biancheria_kilolava": "Biancheria Kilolava",
    "notify_client_supplies": "Notifica Cliente per dotazioni a suo carico",
    "damage": "Rotture / Danni",
    "malfunction": "Malfunzionamenti",
    "other": "Anomalie",
}

DEFAULT_COMPANY_CONFIG = {
    "mode": "assistita",
    "supply": {
        "consumabili_bagno": "kilolava", "consumabili_cucina": "kilolava", "biancheria": "kilolava",
        "welcome_kit": "kilolava", "dotazioni": "client", "piccoli_elettrodomestici": "client",
        "arredi": "client", "altro_forniture": "kilolava",
    },
    "maintenance": {
        "idraulica": "kilolava", "elettrica": "kilolava", "elettrodomestici": "da_valutare",
        "climatizzazione": "da_valutare", "serrature": "kilolava", "arredi_manutenzione": "client",
        "piccole_manutenzioni": "kilolava", "altro_manutenzioni": "da_valutare",
    },
    "automations": {k: False for k in AUTOMATION_KEYS},
}

KEYWORDS = [
    ("carta igienica", "consumabili_bagno"), ("sapone", "consumabili_bagno"), ("shampoo", "consumabili_bagno"),
    ("bagnoschiuma", "consumabili_bagno"), ("carta", "consumabili_bagno"),
    ("caff", "consumabili_cucina"), ("capsul", "consumabili_cucina"), ("zucchero", "consumabili_cucina"),
    ("t\u00e8", "consumabili_cucina"), ("scottex", "consumabili_cucina"),
    ("asciugaman", "biancheria"), ("lenzuol", "biancheria"), ("feder", "biancheria"), ("copripiumino", "biancheria"),
    ("tovagli", "biancheria"), ("accappatoi", "biancheria"),
    ("welcome", "welcome_kit"), ("kit", "welcome_kit"),
    ("phon", "piccoli_elettrodomestici"), ("asciugacapelli", "piccoli_elettrodomestici"),
    ("bollitore", "piccoli_elettrodomestici"), ("tostapane", "piccoli_elettrodomestici"), ("ferro da stiro", "piccoli_elettrodomestici"),
    ("bicchier", "dotazioni"), ("piatt", "dotazioni"), ("pentol", "dotazioni"), ("padell", "dotazioni"),
    ("posate", "dotazioni"), ("telecomando", "dotazioni"), ("stovigli", "dotazioni"),
    ("rubinett", "idraulica"), ("scarico", "idraulica"), ("perdita", "idraulica"), ("perde", "idraulica"),
    ("doccia", "idraulica"), ("wc", "idraulica"), ("sciacquone", "idraulica"), ("lavandino", "idraulica"),
    ("lampadin", "elettrica"), ("presa", "elettrica"), ("corrente", "elettrica"), ("interruttore", "elettrica"), ("luce", "elettrica"),
    ("lavatrice", "elettrodomestici"), ("lavastoviglie", "elettrodomestici"), ("frigo", "elettrodomestici"),
    ("forno", "elettrodomestici"), ("microonde", "elettrodomestici"),
    ("aria condizionata", "climatizzazione"), ("condizionator", "climatizzazione"), ("caldaia", "climatizzazione"),
    ("riscaldamento", "climatizzazione"), ("termosifone", "climatizzazione"), ("clima", "climatizzazione"),
    ("serratur", "serrature"), ("chiave", "serrature"), ("porta blindata", "serrature"), ("citofono", "serrature"),
    ("anta", "arredi_manutenzione"), ("sedia", "arredi_manutenzione"), ("tavolo", "arredi_manutenzione"),
    ("armadio", "arredi_manutenzione"), ("cassett", "arredi_manutenzione"), ("divano", "arredi_manutenzione"),
    ("mobile", "arredi_manutenzione"), ("letto", "arredi_manutenzione"),
]

_deps = {}


def init_segnalazioni_deps(**kwargs):
    _deps.update(kwargs)


def _now_local_month_start():
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Europe/Rome")).strftime("%Y-%m-01")


def suggest_category(seg_type: str, text: str) -> Optional[str]:
    t = (text or "").lower()
    supply_first = seg_type == "missing"
    matches = [(kw, cat) for kw, cat in KEYWORDS if kw in t]
    if not matches:
        return None
    if supply_first:
        for kw, cat in matches:
            if cat in SUPPLY_CATEGORIES:
                return cat
    else:
        for kw, cat in matches:
            if cat in MAINT_CATEGORIES:
                return cat
    return matches[0][1]


async def get_company_config() -> dict:
    doc = await db.app_settings.find_one({"_id": "segnalazioni"}) or {}
    cfg = {
        "mode": doc.get("mode") or DEFAULT_COMPANY_CONFIG["mode"],
        "supply": {**DEFAULT_COMPANY_CONFIG["supply"], **(doc.get("supply") or {})},
        "maintenance": {**DEFAULT_COMPANY_CONFIG["maintenance"], **(doc.get("maintenance") or {})},
        "automations": {**DEFAULT_COMPANY_CONFIG["automations"], **(doc.get("automations") or {})},
    }
    return cfg


def _overlay(base: dict, override: dict, sources: dict = None, level: str = None) -> dict:
    out = dict(base)
    for k, v in (override or {}).items():
        if v not in (None, "", "inherit"):
            out[k] = v
            if sources is not None:
                sources[k] = level
    return out


async def get_effective_config(structure_id: Optional[str], client_id: Optional[str] = None) -> dict:
    cfg = await get_company_config()
    supply_sources = {k: "default" for k in cfg["supply"]}
    maint_sources = {k: "default" for k in cfg["maintenance"]}
    item_exceptions = []
    struct = None
    if structure_id:
        struct = await db.structures.find_one({"id": structure_id}, {"_id": 0, "segnalazioni_config": 1, "client_id": 1})
        if struct and not client_id:
            client_id = struct.get("client_id")
    if client_id:
        cl = await db.clients.find_one({"id": client_id}, {"_id": 0, "segnalazioni_config": 1})
        c = (cl or {}).get("segnalazioni_config") or {}
        if c.get("mode") and c["mode"] != "inherit":
            cfg["mode"] = c["mode"]
        cfg["supply"] = _overlay(cfg["supply"], c.get("supply"), supply_sources, "client")
        cfg["maintenance"] = _overlay(cfg["maintenance"], c.get("maintenance"), maint_sources, "client")
        for k, v in (c.get("automations") or {}).items():
            if v is not None:
                cfg["automations"][k] = v
        item_exceptions.extend(c.get("item_exceptions") or [])
    s = (struct or {}).get("segnalazioni_config") or {}
    if s.get("mode") and s["mode"] != "inherit":
        cfg["mode"] = s["mode"]
    cfg["supply"] = _overlay(cfg["supply"], s.get("supply"), supply_sources, "structure")
    cfg["maintenance"] = _overlay(cfg["maintenance"], s.get("maintenance"), maint_sources, "structure")
    for k, v in (s.get("automations") or {}).items():
        if v is not None:
            cfg["automations"][k] = v
    item_exceptions = (s.get("item_exceptions") or []) + item_exceptions
    cfg["item_exceptions"] = item_exceptions
    cfg["supply_sources"] = supply_sources
    cfg["maintenance_sources"] = maint_sources
    return cfg


def resolve_responsibility(cfg: dict, category_key: Optional[str], text: str) -> Optional[dict]:
    t = (text or "").lower()
    for exc in cfg.get("item_exceptions") or []:
        name = (exc.get("name") or "").lower().strip()
        if name and name in t:
            return {"party": exc.get("party"), "source": "item", "item": exc.get("name")}
    if not category_key:
        return None
    if category_key in SUPPLY_CATEGORIES:
        return {"party": cfg["supply"].get(category_key, "da_valutare"),
                "source": (cfg.get("supply_sources") or {}).get(category_key, "default")}
    if category_key in MAINT_CATEGORIES:
        return {"party": cfg["maintenance"].get(category_key, "da_valutare"),
                "source": (cfg.get("maintenance_sources") or {}).get(category_key, "default")}
    return None


def suggested_action(seg_type: str, party: Optional[str]) -> Optional[dict]:
    if not party or party == "da_valutare":
        return None
    if seg_type == "missing":
        if party == "kilolava":
            return {"type": "delivery", "label": "Crea consegna"}
        return {"type": "notify_client", "label": "Notifica Cliente"}
    if seg_type in ("damage", "malfunction"):
        if party == "kilolava":
            return {"type": "maintenance", "label": "Crea intervento"}
        return {"type": "notify_client", "label": "Notifica Cliente"}
    return None


def automation_key_for(seg_type: str, category_key: Optional[str], party: Optional[str]) -> Optional[str]:
    if seg_type == "missing":
        if party == "kilolava":
            return "biancheria_kilolava" if category_key == "biancheria" else "missing_kilolava"
        if party == "client":
            return "notify_client_supplies"
        return None
    return {"damage": "damage", "malfunction": "malfunction", "other": "other"}.get(seg_type)


def tl(user, event, detail=None, auto=False):
    return {"at": now_iso(), "by": (user or {}).get("id"), "by_name": "Kilolava" if auto else (user or {}).get("name", ""),
            "event": event, "detail": detail, "auto": auto}


async def recompute_seg(seg_id: str):
    seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0, "status": 1})
    if not seg:
        return
    status = seg.get("status")
    tasks = await db.segnalazione_tasks.find({"segnalazione_id": seg_id}, {"_id": 0, "status": 1, "assignee_name": 1}).to_list(50)
    op = status
    if status == "aperta":
        st = [t.get("status") for t in tasks]
        if "in_corso" in st:
            op = "in_corso"
        elif "in_attesa" in st:
            op = "in_attesa"
    names = sorted({t.get("assignee_name") for t in tasks if t.get("assignee_name")})
    await db.segnalazioni.update_one({"id": seg_id}, {"$set": {"op_status": op, "assignee_names": names, "updated_at": now_iso()}})


async def sync_linked_task(t: dict) -> dict:
    """Aggiorna lo stato del task leggendo il record collegato (manutenzione/consegna)."""
    if t.get("status") in ("completata", "annullata"):
        return t
    new_status = None
    if t.get("type") == "maintenance" and t.get("linked_id"):
        m = await db.maintenance_issues.find_one({"id": t["linked_id"]}, {"_id": 0, "status": 1})
        if m:
            ms = m.get("status")
            if ms in ("completed", "resolved", "closed"):
                new_status = "completata"
            elif ms == "in_progress":
                new_status = "in_corso"
            elif ms == "on_hold":
                new_status = "in_attesa"
            elif ms == "cancelled":
                new_status = "annullata"
    elif t.get("type") == "delivery" and t.get("linked_id"):
        d = await db.logistics_tasks.find_one({"id": t["linked_id"]}, {"_id": 0, "status": 1})
        if d:
            ds = d.get("status")
            if ds == "completed":
                new_status = "completata"
            elif ds == "in_progress":
                new_status = "in_corso"
            elif ds == "cancelled":
                new_status = "annullata"
    if new_status and new_status != t.get("status"):
        upd = {"status": new_status, "updated_at": now_iso()}
        if new_status == "completata":
            upd["completed_at"] = now_iso()
        await db.segnalazione_tasks.update_one({"id": t["id"]}, {"$set": upd})
        t = {**t, **upd}
        await recompute_seg(t["segnalazione_id"])
    return t


async def _execute_automation(seg: dict, action: dict, rule_key: str):
    """Esegue l'azione automatica autorizzata. Ritorna il task creato."""
    now = now_iso()
    task = {
        "id": str(uuid.uuid4()), "segnalazione_id": seg["id"], "type": action["type"],
        "title": action["label"] + f" — {seg.get('title', '')}"[:120],
        "assignee_id": None, "assignee_name": None,
        "priority": seg.get("priority", "normal"), "due_date": None, "due_time": None,
        "note": "Creato automaticamente da Kilolava", "status": "da_fare", "waiting_reason": None,
        "attachments": [], "linked_id": None,
        "created_at": now, "completed_at": None, "updated_at": now, "auto": True,
    }
    if action["type"] == "delivery":
        delivery = await _build_delivery_doc(seg, title=f"Reintegro: {seg.get('title', '')}"[:120], due_date=None)
        await db.logistics_tasks.insert_one(delivery)
        task["linked_id"] = delivery["id"]
        task["title"] = f"Consegna: {seg.get('title', '')}"[:120]
    elif action["type"] == "notify_client":
        await _notify_client_users(seg, seg.get("title") or "Segnalazione dalla tua struttura")
        task["status"] = "completata"
        task["completed_at"] = now
        task["title"] = f"Notifica Cliente: {seg.get('title', '')}"[:120]
        seg["published_to_client"] = True
        seg["client_message"] = seg.get("title")
    await db.segnalazione_tasks.insert_one(task)
    task.pop("_id", None)
    return task


async def _build_delivery_doc(seg: dict, title: str, due_date: Optional[str], rider_id: Optional[str] = None):
    now = now_iso()
    address = None
    access = None
    if seg.get("structure_id"):
        s = await db.structures.find_one({"id": seg["structure_id"]}, {"_id": 0, "address": 1, "access_details": 1})
        if s:
            address = s.get("address")
            access = s.get("access_details")
    return {
        "id": str(uuid.uuid4()), "task_type": "delivery",
        "status": "assigned" if rider_id else "unassigned",
        "date": due_date or _deps["local_today"](),
        "time_window_start": None, "time_window_end": None,
        "client_id": seg.get("client_id"), "structure_id": seg.get("structure_id"), "unit_id": seg.get("unit_id"),
        "address": address, "latitude": None, "longitude": None,
        "rider_id": rider_id, "route_order": 0,
        "items": [{"article_id": None, "article_name": title, "quantity": 1}],
        "notes": f"Da Segnalazione: {seg.get('title', '')}",
        "access_details": access, "problem_notes": None, "completion_notes": None, "confirmation_photo": None,
        "source": "segnalazione", "segnalazione_id": seg["id"],
        "created_at": now, "updated_at": now, "started_at": None, "completed_at": None,
    }


async def _notify_client_users(seg: dict, message: str):
    if not seg.get("client_id"):
        return
    users = await db.users.find({"client_id": seg["client_id"], "role": "client", "is_active": True}, {"_id": 0, "id": 1}).to_list(10)
    for u in users:
        await _deps["create_notification"](
            u["id"], "Segnalazione dalla tua struttura",
            f"{seg.get('structure_name') or ''}: {message[:120]}",
            "segnalazione_published", "normal", "segnalazione", seg["id"])


async def process_new_segnalazione(seg: dict, user: Optional[dict]):
    """Pipeline comune: suggerimento categoria, responsabilità, modalità/automazione."""
    cfg = await get_effective_config(seg.get("structure_id"), seg.get("client_id"))
    if not seg.get("category_key"):
        seg["category_key"] = suggest_category(seg.get("type"), f"{seg.get('title', '')} {seg.get('description', '')}")
    resp = resolve_responsibility(cfg, seg.get("category_key"), f"{seg.get('title', '')} {seg.get('description', '')}")
    seg["responsibility"] = resp
    seg["mode"] = cfg["mode"]
    seg["status"] = "da_valutare"
    seg["op_status"] = "da_valutare"
    if cfg["mode"] == "automatica" and resp:
        rule = automation_key_for(seg.get("type"), seg.get("category_key"), resp.get("party"))
        action = suggested_action(seg.get("type"), resp.get("party"))
        if rule and action and cfg["automations"].get(rule) and action["type"] in ("delivery", "notify_client"):
            seg["status"] = "aperta"
            seg["op_status"] = "aperta"
            seg["automation"] = {"rule": rule, "rule_label": AUTOMATION_KEYS.get(rule), "executed_at": now_iso()}
            seg["timeline"].append(tl(None, "automazione", f"Gestita automaticamente — regola: {AUTOMATION_KEYS.get(rule)}", auto=True))
            task = await _execute_automation(seg, action, rule)
            seg["timeline"].append(tl(None, "task_creato", f"{task['title']}", auto=True))
            await _deps["notify_ops_users"](
                "Segnalazione gestita automaticamente",
                f"{TYPE_LABELS.get(seg.get('type'), '')}: {seg.get('title', '')[:60]} — regola {AUTOMATION_KEYS.get(rule)}",
                "segnalazione_auto", "normal", "segnalazione", seg["id"])
    return seg


def build_segnalazione(*, title, description, seg_type, priority, origin_type, user,
                       structure=None, client_name=None, cleaning_task_id=None, unit_id=None,
                       date=None, attachments=None, origin_label=None) -> dict:
    now = now_iso()
    return {
        "id": str(uuid.uuid4()),
        "title": (title or "").strip()[:120] or "Segnalazione",
        "description": description or "",
        "type": seg_type if seg_type in TYPES else "other",
        "priority": priority if priority in PRIORITIES else "normal",
        "status": "da_valutare", "op_status": "da_valutare",
        "origin_type": origin_type, "origin_label": origin_label,
        "cleaning_task_id": cleaning_task_id,
        "structure_id": (structure or {}).get("id"),
        "structure_name": (structure or {}).get("name"),
        "klv_code": (structure or {}).get("klv_code"),
        "client_id": (structure or {}).get("client_id"),
        "client_name": client_name,
        "unit_id": unit_id, "date": date,
        "category_key": None, "responsibility": None, "mode": None,
        "attachments": attachments or [], "resolution_media": [],
        "published_to_client": False, "client_message": None,
        "assignee_names": [],
        "reported_by": (user or {}).get("id"), "reporter_name": (user or {}).get("name", ""),
        "timeline": [tl(user, "creata", f"Origine: {origin_label or origin_type}")],
        "automation": None,
        "created_at": now, "updated_at": now, "resolved_at": None, "closed_at": None,
    }


async def register_from_cleaning(issue: dict, user: dict) -> dict:
    """Chiamata da report_cleaning_issue in server.py: la Pulizia è solo un'origine."""
    date_label = issue.get("date") or ""
    klv = issue.get("klv_code") or ""
    seg = build_segnalazione(
        title=issue.get("note", ""), description=issue.get("note", ""),
        seg_type=issue.get("category"),
        priority={"low": "low", "medium": "normal", "high": "high"}.get(issue.get("severity"), "normal"),
        origin_type="cleaning", origin_label=f"Pulizia {klv} del {date_label}".strip(),
        user=user,
        structure={"id": issue.get("structure_id"), "name": issue.get("structure_name"),
                   "klv_code": issue.get("klv_code"), "client_id": issue.get("client_id")},
        cleaning_task_id=issue.get("cleaning_task_id"), unit_id=issue.get("unit_id"),
        date=issue.get("date"), attachments=issue.get("attachments") or [],
    )
    seg["id"] = issue.get("id") or seg["id"]
    if seg.get("client_id"):
        cl = await db.clients.find_one({"id": seg["client_id"]}, {"_id": 0})
        if cl and _deps.get("get_client_display_name"):
            seg["client_name"] = _deps["get_client_display_name"](cl)
    if seg["attachments"]:
        seg["timeline"].append(tl(user, "media", f"{len(seg['attachments'])} allegati caricati"))
    seg = await process_new_segnalazione(seg, user)
    await db.segnalazioni.insert_one(seg)
    seg.pop("_id", None)
    return seg


async def migrate_cleaning_issues():
    """Migrazione one-shot idempotente: cleaning_issues -> segnalazioni."""
    status_map = {"open": "da_valutare", "acknowledged": "aperta", "to_delivery": "aperta",
                  "maintenance_created": "aperta", "resolved": "risolta", "closed": "chiusa"}
    legacy_cat = {"broken_item": "damage", "missing_supplies": "missing", "maintenance": "malfunction",
                  "electrical": "malfunction", "plumbing": "malfunction", "furniture": "damage", "missing_item": "missing"}
    docs = await db.cleaning_issues.find({"migrated_to_segnalazioni": {"$ne": True}}, {"_id": 0}).to_list(5000)
    for d in docs:
        existing = await db.segnalazioni.find_one({"id": d["id"]}, {"_id": 0, "id": 1})
        if existing:
            await db.cleaning_issues.update_one({"id": d["id"]}, {"$set": {"migrated_to_segnalazioni": True}})
            continue
        cat = d.get("category")
        seg_type = cat if cat in TYPES else legacy_cat.get(cat, "other")
        status = status_map.get(d.get("status"), "da_valutare")
        client_name = None
        if d.get("client_id"):
            cl = await db.clients.find_one({"id": d["client_id"]}, {"_id": 0})
            if cl and _deps.get("get_client_display_name"):
                client_name = _deps["get_client_display_name"](cl)
        seg = {
            "id": d["id"],
            "title": (d.get("note") or "Segnalazione")[:120],
            "description": d.get("note") or "",
            "type": seg_type,
            "priority": {"low": "low", "medium": "normal", "high": "high"}.get(d.get("severity"), "normal"),
            "status": status, "op_status": status,
            "origin_type": "cleaning",
            "origin_label": f"Pulizia {d.get('klv_code') or ''} del {d.get('date') or ''}".strip(),
            "cleaning_task_id": d.get("cleaning_task_id"),
            "structure_id": d.get("structure_id"), "structure_name": d.get("structure_name"),
            "klv_code": d.get("klv_code"), "client_id": d.get("client_id"), "client_name": client_name,
            "unit_id": d.get("unit_id"), "date": d.get("date"),
            "category_key": None, "responsibility": None, "mode": None,
            "attachments": d.get("attachments") or [], "resolution_media": [],
            "published_to_client": d.get("published_to_client", False), "client_message": None,
            "assignee_names": [],
            "reported_by": d.get("reported_by"), "reporter_name": d.get("reporter_name", ""),
            "timeline": [{"at": d.get("created_at") or now_iso(), "by": d.get("reported_by"),
                          "by_name": d.get("reporter_name", ""), "event": "creata",
                          "detail": "Migrata dallo storico segnalazioni Pulizie", "auto": False}]
                        + [{"at": a.get("at"), "by": a.get("by"), "by_name": a.get("by_name", ""),
                            "event": "azione", "detail": a.get("action"), "auto": False} for a in (d.get("actions") or [])],
            "automation": None,
            "created_at": d.get("created_at") or now_iso(), "updated_at": now_iso(),
            "resolved_at": d.get("closed_at") if status == "risolta" else None,
            "closed_at": d.get("closed_at") if status == "chiusa" else None,
            "maintenance_issue_id": d.get("maintenance_issue_id"),
        }
        cfg = await get_effective_config(seg.get("structure_id"), seg.get("client_id"))
        seg["category_key"] = suggest_category(seg_type, seg["description"])
        seg["responsibility"] = resolve_responsibility(cfg, seg["category_key"], seg["description"])
        seg["mode"] = cfg["mode"]
        await db.segnalazioni.insert_one(seg)
        if d.get("maintenance_issue_id"):
            t_now = now_iso()
            await db.segnalazione_tasks.insert_one({
                "id": str(uuid.uuid4()), "segnalazione_id": seg["id"], "type": "maintenance",
                "title": f"Intervento: {seg['title']}"[:120], "assignee_id": None, "assignee_name": None,
                "priority": seg["priority"], "due_date": None, "due_time": None, "note": "Migrato da azione storica",
                "status": "da_fare", "waiting_reason": None, "attachments": [],
                "linked_id": d["maintenance_issue_id"], "created_at": t_now, "completed_at": None, "updated_at": t_now,
            })
        await db.cleaning_issues.update_one({"id": d["id"]}, {"$set": {"migrated_to_segnalazioni": True}})
    await db.segnalazioni.create_index([("status", 1), ("type", 1)])
    await db.segnalazioni.create_index([("created_at", -1)])
    await db.segnalazioni.create_index([("structure_id", 1)])
    await db.segnalazioni.create_index([("client_id", 1)])
    await db.segnalazione_tasks.create_index([("segnalazione_id", 1)])
    await db.segnalazione_tasks.create_index([("assignee_id", 1), ("status", 1)])
    return len(docs)


# ================= Pydantic =================

class SegnalazioneCreate(BaseModel):
    title: str
    description: str = ""
    type: str
    priority: str = "normal"
    structure_id: Optional[str] = None
    client_id: Optional[str] = None
    origin_type: Optional[str] = None
    origin_label: Optional[str] = None


class SegnalazioneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    priority: Optional[str] = None
    category_key: Optional[str] = None


class TriageRequest(BaseModel):
    type: Optional[str] = None
    priority: Optional[str] = None
    category_key: Optional[str] = None


class TaskCreate(BaseModel):
    type: str
    title: str
    assignee_id: Optional[str] = None
    priority: str = "normal"
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    note: Optional[str] = None
    client_message: Optional[str] = None


class TaskUpdate(BaseModel):
    status: Optional[str] = None
    waiting_reason: Optional[str] = None
    note: Optional[str] = None
    assignee_id: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    resolution_note: Optional[str] = None


class PublishRequest(BaseModel):
    message: Optional[str] = None


class ConfigPayload(BaseModel):
    mode: Optional[str] = None
    supply: Optional[dict] = None
    maintenance: Optional[dict] = None
    automations: Optional[dict] = None
    item_exceptions: Optional[list] = None


LIST_FIELDS = {"_id": 0, "description": 0, "timeline": 0, "resolution_media": 0}


def create_segnalazioni_router(get_current_user, is_ops_user):
    router = APIRouter(prefix="/segnalazioni", tags=["segnalazioni"])

    def require_ops(user):
        if not is_ops_user(user):
            raise HTTPException(status_code=403, detail="Non autorizzato")

    # ---------- static routes first ----------

    @router.get("/badge")
    async def badge(current_user: dict = Depends(get_current_user)):
        if not is_ops_user(current_user):
            return {"active": 0, "urgent": 0}
        active_q = {"status": {"$nin": ["risolta", "chiusa"]}}
        active = await db.segnalazioni.count_documents(active_q)
        urgent = await db.segnalazioni.count_documents({**active_q, "priority": "urgent"})
        return {"active": active, "urgent": urgent}

    @router.get("/counters")
    async def counters(type: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        active_q = {"status": {"$nin": ["risolta", "chiusa"]}}
        pipeline = [{"$match": active_q}, {"$group": {"_id": "$type", "n": {"$sum": 1}}}]
        by_type = {r["_id"]: r["n"] async for r in db.segnalazioni.aggregate(pipeline)}
        types = {t: by_type.get(t, 0) for t in TYPES}
        types["all"] = sum(types.values())
        st_match = {} if not type or type == "all" else {"type": type}
        pipeline2 = [{"$match": st_match}, {"$group": {"_id": "$op_status", "n": {"$sum": 1}}}]
        by_status = {r["_id"]: r["n"] async for r in db.segnalazioni.aggregate(pipeline2)}
        statuses = {s: by_status.get(s, 0) for s in OP_STATUSES}
        month_start = _now_local_month_start()
        kpi = {
            "da_valutare": await db.segnalazioni.count_documents({"op_status": "da_valutare"}),
            "in_corso": await db.segnalazioni.count_documents({"op_status": "in_corso"}),
            "in_attesa": await db.segnalazioni.count_documents({"op_status": "in_attesa"}),
            "aperte": await db.segnalazioni.count_documents({"op_status": "aperta"}),
            "urgent": await db.segnalazioni.count_documents({**active_q, "priority": "urgent"}),
            "resolved_month": await db.segnalazioni.count_documents({"resolved_at": {"$gte": month_start}}),
        }
        return {"types": types, "statuses": statuses, "kpi": kpi}

    @router.get("/assignees")
    async def assignees(current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        users = await db.users.find(
            {"role": {"$in": ["admin", "operations_manager", "maintenance", "rider"]}, "is_active": True},
            {"_id": 0, "id": 1, "name": 1, "role": 1}).sort("name", 1).to_list(100)
        return users

    @router.get("/my-tasks")
    async def my_tasks(current_user: dict = Depends(get_current_user)):
        tasks = await db.segnalazione_tasks.find(
            {"assignee_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
        out = []
        for t in tasks:
            t = await sync_linked_task(t)
            if t.get("status") == "annullata":
                continue
            seg = await db.segnalazioni.find_one({"id": t["segnalazione_id"]},
                                                 {"_id": 0, "title": 1, "structure_name": 1, "klv_code": 1, "type": 1})
            t["segnalazione"] = seg
            out.append(t)
        active = [t for t in out if t.get("status") in ("da_fare", "in_corso", "in_attesa")]
        done = [t for t in out if t.get("status") == "completata"][:20]
        return {"active": active, "done": done}

    @router.get("/portal")
    async def portal_segnalazioni(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") != "client" or not current_user.get("client_id"):
            raise HTTPException(status_code=403, detail="Non autorizzato")
        segs = await db.segnalazioni.find(
            {"client_id": current_user["client_id"], "published_to_client": True},
            {"_id": 0, "id": 1, "title": 1, "client_message": 1, "structure_name": 1,
             "type": 1, "status": 1, "created_at": 1, "resolved_at": 1}
        ).sort("created_at", -1).to_list(50)
        for s in segs:
            s["status_label"] = {"risolta": "Risolta", "chiusa": "Risolta"}.get(s["status"], "In gestione")
            s["message"] = s.pop("client_message", None) or s.get("title")
        return segs

    # ---------- config ----------

    @router.get("/config")
    async def get_config(current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        cfg = await get_company_config()
        return {**cfg, "categories": {"supply": SUPPLY_CATEGORIES, "maintenance": MAINT_CATEGORIES},
                "automation_labels": AUTOMATION_KEYS}

    @router.put("/config")
    async def put_config(data: ConfigPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        upd = {k: v for k, v in data.model_dump(exclude_none=True).items() if k != "item_exceptions"}
        await db.app_settings.update_one({"_id": "segnalazioni"}, {"$set": upd}, upsert=True)
        return await get_company_config()

    @router.get("/config/client/{client_id}")
    async def get_client_config(client_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        cl = await db.clients.find_one({"id": client_id}, {"_id": 0, "segnalazioni_config": 1})
        if cl is None:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        return {"config": cl.get("segnalazioni_config") or {}, "effective": await get_effective_config(None, client_id),
                "categories": {"supply": SUPPLY_CATEGORIES, "maintenance": MAINT_CATEGORIES},
                "automation_labels": AUTOMATION_KEYS}

    @router.put("/config/client/{client_id}")
    async def put_client_config(client_id: str, data: ConfigPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        await db.clients.update_one({"id": client_id}, {"$set": {"segnalazioni_config": data.model_dump()}})
        return {"ok": True}

    @router.get("/config/structure/{structure_id}")
    async def get_structure_config(structure_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        s = await db.structures.find_one({"id": structure_id}, {"_id": 0, "segnalazioni_config": 1})
        if s is None:
            raise HTTPException(status_code=404, detail="Struttura non trovata")
        return {"config": s.get("segnalazioni_config") or {}, "effective": await get_effective_config(structure_id),
                "categories": {"supply": SUPPLY_CATEGORIES, "maintenance": MAINT_CATEGORIES},
                "automation_labels": AUTOMATION_KEYS}

    @router.put("/config/structure/{structure_id}")
    async def put_structure_config(structure_id: str, data: ConfigPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        await db.structures.update_one({"id": structure_id}, {"$set": {"segnalazioni_config": data.model_dump()}})
        return {"ok": True}

    # ---------- tasks ----------

    @router.put("/tasks/{task_id}")
    async def update_task(task_id: str, data: TaskUpdate, current_user: dict = Depends(get_current_user)):
        t = await db.segnalazione_tasks.find_one({"id": task_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Task non trovato")
        if not is_ops_user(current_user) and t.get("assignee_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        upd = {"updated_at": now_iso()}
        tl_events = []
        if data.status:
            if data.status not in TASK_STATUSES:
                raise HTTPException(status_code=400, detail="Stato non valido")
            if data.status == "in_attesa" and not (data.waiting_reason or t.get("waiting_reason")):
                raise HTTPException(status_code=400, detail="Indica il motivo dell'attesa")
            upd["status"] = data.status
            if data.status == "completata":
                upd["completed_at"] = now_iso()
            if data.status != "in_attesa":
                upd["waiting_reason"] = None
            tl_events.append(("task_stato", f"{t.get('title', '')}: {data.status.replace('_', ' ')}"
                              + (f" · {data.waiting_reason}" if data.status == "in_attesa" and data.waiting_reason else "")))
        if data.waiting_reason is not None:
            upd["waiting_reason"] = data.waiting_reason
        if data.note is not None:
            upd["note"] = data.note
        if data.resolution_note is not None:
            upd["resolution_note"] = data.resolution_note
            tl_events.append(("task_nota", f"Nota finale: {data.resolution_note[:80]}"))
        if data.priority:
            upd["priority"] = data.priority
        if data.due_date is not None:
            upd["due_date"] = data.due_date or None
        if data.due_time is not None:
            upd["due_time"] = data.due_time or None
        if data.assignee_id is not None:
            if data.assignee_id:
                u = await db.users.find_one({"id": data.assignee_id}, {"_id": 0, "id": 1, "name": 1})
                if not u:
                    raise HTTPException(status_code=404, detail="Utente non trovato")
                upd["assignee_id"] = u["id"]
                upd["assignee_name"] = u.get("name", "")
                tl_events.append(("task_assegnato", f"{t.get('title', '')} → {u.get('name', '')}"))
                await _deps["create_notification"](u["id"], "Nuovo task assegnato", t.get("title", ""),
                                                   "segnalazione_task", "normal", "segnalazione", t["segnalazione_id"])
            else:
                upd["assignee_id"] = None
                upd["assignee_name"] = None
        await db.segnalazione_tasks.update_one({"id": task_id}, {"$set": upd})
        if tl_events:
            await db.segnalazioni.update_one({"id": t["segnalazione_id"]},
                                             {"$push": {"timeline": {"$each": [tl(current_user, e, d) for e, d in tl_events]}}})
        await recompute_seg(t["segnalazione_id"])
        out = await db.segnalazione_tasks.find_one({"id": task_id}, {"_id": 0})
        return out

    @router.post("/tasks/{task_id}/media")
    async def upload_task_media(task_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
        t = await db.segnalazione_tasks.find_one({"id": task_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Task non trovato")
        if not is_ops_user(current_user) and t.get("assignee_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        content_type = file.content_type or "application/octet-stream"
        kind = "video" if content_type.startswith("video") else "image"
        ext = file.filename.split(".")[-1] if "." in (file.filename or "") else ("mp4" if kind == "video" else "jpg")
        path = f"{_deps['app_name']}/segnalazioni/{t['segnalazione_id']}/soluzione_{uuid.uuid4()}.{ext}"
        data = await file.read()
        result = _deps["put_object"](path, data, content_type)
        entry = {"id": str(uuid.uuid4()), "kind": kind, "file_path": result["path"],
                 "uploaded_by_name": current_user.get("name", ""), "at": now_iso(), "task_id": task_id}
        await db.segnalazione_tasks.update_one({"id": task_id}, {"$push": {"attachments": entry}})
        await db.segnalazioni.update_one({"id": t["segnalazione_id"]},
                                         {"$push": {"resolution_media": entry,
                                                    "timeline": tl(current_user, "media_soluzione", "Foto/video soluzione caricato")}})
        return entry

    # ---------- collection ----------

    @router.get("")
    async def list_segnalazioni(
        type: Optional[str] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        structure_id: Optional[str] = None,
        client_id: Optional[str] = None,
        assignee: Optional[str] = None,
        origin: Optional[str] = None,
        search: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user),
    ):
        require_ops(current_user)
        q = {}
        if type and type != "all":
            q["type"] = type
        if status == "active" or not status:
            q["status"] = {"$nin": ["risolta", "chiusa"]}
        elif status != "all":
            q["op_status"] = status
        if priority:
            q["priority"] = priority
        if structure_id:
            q["structure_id"] = structure_id
        if client_id:
            q["client_id"] = client_id
        if assignee:
            q["assignee_names"] = assignee
        if origin:
            q["origin_type"] = origin
        if search:
            q["$or"] = [{"title": {"$regex": search, "$options": "i"}},
                        {"structure_name": {"$regex": search, "$options": "i"}},
                        {"klv_code": {"$regex": search, "$options": "i"}}]
        if date_from or date_to:
            rng = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to + "T23:59:59"
            q["created_at"] = rng
        total = await db.segnalazioni.count_documents(q)
        items = await db.segnalazioni.find(q, LIST_FIELDS).sort("created_at", -1)\
            .skip((page - 1) * limit).limit(limit).to_list(limit)
        return {"items": items, "total": total, "page": page, "limit": limit}

    @router.post("")
    async def create_segnalazione(data: SegnalazioneCreate, current_user: dict = Depends(get_current_user)):
        if data.type not in TYPES:
            raise HTTPException(status_code=400, detail="Tipo non valido")
        role = current_user.get("role")
        origin = data.origin_type if data.origin_type in ORIGIN_TYPES else \
            {"admin": "manager", "operations_manager": "manager", "cleaner": "cleaner",
             "maintenance": "maintenance", "rider": "rider", "client": "client"}.get(role, "other")
        structure = None
        client_name = None
        if data.structure_id:
            structure = await db.structures.find_one({"id": data.structure_id},
                                                     {"_id": 0, "id": 1, "name": 1, "klv_code": 1, "client_id": 1})
        elif data.client_id:
            structure = {"id": None, "name": None, "klv_code": None, "client_id": data.client_id}
        cid = (structure or {}).get("client_id")
        if cid:
            cl = await db.clients.find_one({"id": cid}, {"_id": 0})
            if cl and _deps.get("get_client_display_name"):
                client_name = _deps["get_client_display_name"](cl)
        seg = build_segnalazione(
            title=data.title, description=data.description, seg_type=data.type, priority=data.priority,
            origin_type=origin, origin_label=data.origin_label or {"manager": "Manager/Admin", "client": "Cliente",
                                              "maintenance": "Manutentore", "rider": "Rider",
                                              "warehouse": "Magazzino", "delivery": "Consegna"}.get(origin, origin),
            user=current_user, structure=structure, client_name=client_name,
        )
        seg = await process_new_segnalazione(seg, current_user)
        await db.segnalazioni.insert_one(seg)
        seg.pop("_id", None)
        if seg["status"] == "da_valutare":
            await _deps["notify_ops_users"](
                "Nuova segnalazione",
                f"{TYPE_LABELS.get(seg['type'], '')}: {seg['title'][:60]}",
                "segnalazione_nuova", "important" if seg["priority"] in ("high", "urgent") else "normal",
                "segnalazione", seg["id"])
        return seg

    # ---------- detail ----------

    @router.get("/{seg_id}")
    async def get_segnalazione(seg_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})
        if not seg:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        tasks = await db.segnalazione_tasks.find({"segnalazione_id": seg_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
        tasks = [await sync_linked_task(t) for t in tasks]
        seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})
        cfg = await get_effective_config(seg.get("structure_id"), seg.get("client_id"))
        resp = resolve_responsibility(cfg, seg.get("category_key"), f"{seg.get('title', '')} {seg.get('description', '')}")
        seg["responsibility"] = resp
        seg["mode"] = cfg["mode"]
        action = suggested_action(seg.get("type"), (resp or {}).get("party"))
        real_tasks = [t for t in tasks if t.get("status") != "annullata"]
        # L'azione suggerita NON deve duplicare attività già esistenti dello stesso tipo
        if action and any(t.get("type") == action["type"] for t in real_tasks):
            action = None
        cleaning = None
        if seg.get("cleaning_task_id"):
            cleaning = await db.cleaning_tasks.find_one({"id": seg["cleaning_task_id"]},
                                                        {"_id": 0, "id": 1, "date": 1, "status": 1})
        return {**seg, "tasks": tasks, "suggested_action": action,
                "all_tasks_done": len(real_tasks) > 0 and all(t.get("status") == "completata" for t in real_tasks),
                "cleaning_task": cleaning,
                "categories": {"supply": SUPPLY_CATEGORIES, "maintenance": MAINT_CATEGORIES}}

    @router.put("/{seg_id}")
    async def update_segnalazione(seg_id: str, data: SegnalazioneUpdate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})
        if not seg:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        upd = {"updated_at": now_iso()}
        events = []
        if data.title is not None:
            upd["title"] = data.title.strip()[:120]
        if data.description is not None:
            upd["description"] = data.description
        if data.type and data.type in TYPES and data.type != seg.get("type"):
            upd["type"] = data.type
            events.append(("tipo", f"Tipo: {TYPE_LABELS.get(data.type)}"))
        if data.priority and data.priority in PRIORITIES and data.priority != seg.get("priority"):
            upd["priority"] = data.priority
            events.append(("priorita", f"Priorità: {data.priority}"))
        if data.category_key is not None:
            upd["category_key"] = data.category_key or None
            if data.category_key:
                cfg = await get_effective_config(seg.get("structure_id"), seg.get("client_id"))
                upd["responsibility"] = resolve_responsibility(cfg, data.category_key, seg.get("description", ""))
                events.append(("categoria", f"Categoria: {ALL_CATEGORIES.get(data.category_key, data.category_key)}"))
        push = {"timeline": {"$each": [tl(current_user, e, d) for e, d in events]}} if events else None
        op = {"$set": upd}
        if push:
            op["$push"] = push
        await db.segnalazioni.update_one({"id": seg_id}, op)
        return await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})

    @router.post("/{seg_id}/triage")
    async def triage(seg_id: str, data: TriageRequest, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})
        if not seg:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        upd = {"status": "aperta", "op_status": "aperta", "updated_at": now_iso()}
        if data.type and data.type in TYPES:
            upd["type"] = data.type
        if data.priority and data.priority in PRIORITIES:
            upd["priority"] = data.priority
        if data.category_key is not None:
            upd["category_key"] = data.category_key or None
            cfg = await get_effective_config(seg.get("structure_id"), seg.get("client_id"))
            upd["responsibility"] = resolve_responsibility(cfg, data.category_key, seg.get("description", ""))
        await db.segnalazioni.update_one({"id": seg_id},
                                         {"$set": upd, "$push": {"timeline": tl(current_user, "presa_in_carico", "Valutata e aperta")}})
        await recompute_seg(seg_id)
        return await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})

    @router.post("/{seg_id}/tasks")
    async def create_task(seg_id: str, data: TaskCreate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})
        if not seg:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        if data.type not in TASK_TYPES:
            raise HTTPException(status_code=400, detail="Tipo task non valido")
        now = now_iso()
        assignee = None
        if data.assignee_id:
            assignee = await db.users.find_one({"id": data.assignee_id}, {"_id": 0, "id": 1, "name": 1, "role": 1})
            if not assignee:
                raise HTTPException(status_code=404, detail="Assegnatario non trovato")
        task = {
            "id": str(uuid.uuid4()), "segnalazione_id": seg_id, "type": data.type,
            "title": data.title.strip()[:120],
            "assignee_id": (assignee or {}).get("id"), "assignee_name": (assignee or {}).get("name"),
            "priority": data.priority if data.priority in PRIORITIES else "normal",
            "due_date": data.due_date, "due_time": data.due_time,
            "note": data.note or "", "status": "da_fare", "waiting_reason": None,
            "attachments": [], "linked_id": None,
            "created_at": now, "completed_at": None, "updated_at": now,
        }
        events = [tl(current_user, "task_creato", f"{task['title']}")]
        if data.type == "maintenance":
            maint = {
                "id": str(uuid.uuid4()), "source": "segnalazione",
                "title": task["title"], "materials": [], "started_at": None,
                "cleaning_task_id": seg.get("cleaning_task_id"), "cleaning_issue_id": seg_id,
                "segnalazione_id": seg_id,
                "client_id": seg.get("client_id"), "structure_id": seg.get("structure_id"), "unit_id": seg.get("unit_id"),
                "category": "maintenance" if seg.get("type") == "malfunction" else "damage" if seg.get("type") == "damage" else "other",
                "description": f"{task['title']}\n{seg.get('description', '')}".strip(),
                "priority": {"low": "low", "normal": "medium", "high": "high", "urgent": "urgent"}.get(task["priority"], "medium"),
                "status": "assigned" if assignee else "open",
                "assigned_to": (assignee or {}).get("id"), "scheduled_date": data.due_date,
                "internal_notes": data.note or "", "resolution_notes": "",
                "photos": [{"type": "issue", "path": a.get("file_path")} for a in (seg.get("attachments") or [])],
                "history": [{"action": "created", "by": current_user["id"], "by_name": current_user.get("name", ""),
                             "at": now, "detail": "Creata dal Centro Segnalazioni"}],
                "reported_by": seg.get("reported_by"), "reporter_name": seg.get("reporter_name", ""),
                "created_at": now, "updated_at": now,
            }
            await db.maintenance_issues.insert_one(maint)
            task["linked_id"] = maint["id"]
            events.append(tl(current_user, "intervento", "Intervento manutenzione creato"))
        elif data.type == "delivery":
            rider_id = (assignee or {}).get("id") if (assignee or {}).get("role") == "rider" else None
            delivery = await _build_delivery_doc(seg, title=task["title"], due_date=data.due_date, rider_id=rider_id)
            await db.logistics_tasks.insert_one(delivery)
            task["linked_id"] = delivery["id"]
            events.append(tl(current_user, "consegna", "Consegna creata"))
        elif data.type == "notify_client":
            msg = data.client_message or data.note or task["title"]
            await _notify_client_users(seg, msg)
            task["status"] = "completata"
            task["completed_at"] = now
            await db.segnalazioni.update_one({"id": seg_id},
                                             {"$set": {"published_to_client": True, "client_message": msg}})
            events.append(tl(current_user, "notifica_cliente", f"Cliente notificato: {msg[:80]}"))
        await db.segnalazione_tasks.insert_one(task)
        task.pop("_id", None)
        set_upd = {"updated_at": now}
        if seg.get("status") == "da_valutare":
            set_upd["status"] = "aperta"
            events.insert(0, tl(current_user, "presa_in_carico", "Valutata e aperta"))
        await db.segnalazioni.update_one({"id": seg_id}, {"$set": set_upd, "$push": {"timeline": {"$each": events}}})
        if assignee and data.type != "notify_client":
            await _deps["create_notification"](assignee["id"], "Nuovo task assegnato",
                                               f"{task['title']} — {seg.get('structure_name') or ''}",
                                               "segnalazione_task", "important" if task["priority"] in ("high", "urgent") else "normal",
                                               "segnalazione", seg_id)
        await recompute_seg(seg_id)
        return task

    @router.post("/{seg_id}/media")
    async def upload_seg_media(seg_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
        seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0, "id": 1})
        if not seg:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        content_type = file.content_type or "application/octet-stream"
        kind = "video" if content_type.startswith("video") else "image"
        ext = file.filename.split(".")[-1] if "." in (file.filename or "") else ("mp4" if kind == "video" else "jpg")
        path = f"{_deps['app_name']}/segnalazioni/{seg_id}/problema_{uuid.uuid4()}.{ext}"
        data = await file.read()
        result = _deps["put_object"](path, data, content_type)
        entry = {"id": str(uuid.uuid4()), "kind": kind, "file_path": result["path"]}
        await db.segnalazioni.update_one({"id": seg_id},
                                         {"$push": {"attachments": entry,
                                                    "timeline": tl(current_user, "media", "Media problema caricato")}})
        return entry

    @router.post("/{seg_id}/resolve")
    async def resolve_seg(seg_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        now = now_iso()
        r = await db.segnalazioni.update_one(
            {"id": seg_id},
            {"$set": {"status": "risolta", "op_status": "risolta", "resolved_at": now, "updated_at": now},
             "$push": {"timeline": tl(current_user, "risolta", "Segnalazione risolta")}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        return await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})

    @router.post("/{seg_id}/close")
    async def close_seg(seg_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        now = now_iso()
        r = await db.segnalazioni.update_one(
            {"id": seg_id},
            {"$set": {"status": "chiusa", "op_status": "chiusa", "closed_at": now, "updated_at": now},
             "$push": {"timeline": tl(current_user, "chiusa", "Segnalazione chiusa / archiviata")}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        return await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})

    @router.post("/{seg_id}/reopen")
    async def reopen_seg(seg_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        now = now_iso()
        r = await db.segnalazioni.update_one(
            {"id": seg_id},
            {"$set": {"status": "aperta", "op_status": "aperta", "resolved_at": None, "closed_at": None, "updated_at": now},
             "$push": {"timeline": tl(current_user, "riaperta", "Segnalazione riaperta")}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        await recompute_seg(seg_id)
        return await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})

    @router.post("/{seg_id}/publish-client")
    async def publish_client(seg_id: str, data: PublishRequest, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        seg = await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})
        if not seg:
            raise HTTPException(status_code=404, detail="Segnalazione non trovata")
        msg = (data.message or seg.get("title") or "").strip()
        await db.segnalazioni.update_one(
            {"id": seg_id},
            {"$set": {"published_to_client": True, "client_message": msg, "updated_at": now_iso()},
             "$push": {"timeline": tl(current_user, "notifica_cliente", f"Pubblicata al Cliente: {msg[:80]}")}})
        await _notify_client_users(seg, msg)
        return await db.segnalazioni.find_one({"id": seg_id}, {"_id": 0})

    return router
