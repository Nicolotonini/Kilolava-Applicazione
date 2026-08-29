"""
iCal sync service — fetch external feeds, upsert booking events (soggiorni).
I dati iCal aggiornano SOLO: uid, date check-in/check-out, titolo, cancellazione.
NON toccano mai i dati Kilolava (persone, letti, note, pulizia collegata, ecc.).
Idempotente per UID. Se le date cambiano su un soggiorno con dati operativi,
viene impostato `dates_changed` per l'alert al Manager.
"""
import uuid
import httpx

from core.database import db
from core.utils import now_iso


def detect_ical_source(url: str) -> str:
    url_lower = (url or "").lower()
    if "airbnb" in url_lower:
        return "airbnb"
    if "booking.com" in url_lower or "booking" in url_lower:
        return "booking_com"
    return "other_ical"


def _has_kilolava_data(ev: dict) -> bool:
    return bool(
        ev.get("cleaning_task_id") or ev.get("guests_count")
        or ev.get("beds_double") or ev.get("beds_single") or ev.get("beds_sofa")
        or ev.get("notes")
    )


async def sync_structure_ical(structure_id: str, ical_url: str, user_id: str) -> dict:
    """Fetch and parse an iCal feed, create/update/remove booking events."""
    from icalendar import Calendar as ICalendar
    source = detect_ical_source(ical_url)

    async with httpx.AsyncClient(timeout=30.0) as http_client:
        resp = await http_client.get(ical_url)
        resp.raise_for_status()
        ical_text = resp.text

    cal = ICalendar.from_ical(ical_text)

    feed_events = {}
    for component in cal.walk():
        if component.name != "VEVENT":
            continue
        uid = str(component.get("UID", ""))
        if not uid:
            continue
        summary = str(component.get("SUMMARY", "Prenotazione"))
        dtstart = component.get("DTSTART")
        dtend = component.get("DTEND")
        if not dtstart:
            continue
        start_dt = dtstart.dt
        end_dt = dtend.dt if dtend else start_dt
        start_str = start_dt.strftime("%Y-%m-%d") if hasattr(start_dt, 'strftime') else str(start_dt)
        end_str = end_dt.strftime("%Y-%m-%d") if hasattr(end_dt, 'strftime') else str(end_dt)
        feed_events[uid] = {
            "uid": uid, "summary": summary, "start": start_str, "end": end_str,
        }

    existing = await db.events.find(
        {"structure_id": structure_id, "ical_uid": {"$exists": True, "$ne": None}},
        {"_id": 0}
    ).to_list(5000)
    existing_map = {e["ical_uid"]: e for e in existing}

    created = 0
    updated = 0
    removed = 0
    skipped_manual = 0
    now = now_iso()

    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0, "name": 1, "client_id": 1, "check_in_time": 1, "check_out_time": 1})
    structure_name = structure.get("name", "") if structure else ""

    for uid, fe in feed_events.items():
        title = fe["summary"]
        if title in ("CLOSED - Not available", "Not available", "Closed"):
            title = "Soggiorno"

        if uid in existing_map:
            ex = existing_map[uid]
            if ex.get("manually_modified"):
                skipped_manual += 1
                continue
            dates_changed = ex.get("start_time") != fe["start"] or ex.get("end_time") != fe["end"]
            if dates_changed or ex.get("title") != title:
                upd = {"start_time": fe["start"], "end_time": fe["end"], "title": title, "updated_at": now}
                # Alert per il Manager: date modificate su un soggiorno con dati operativi Kilolava
                if dates_changed and _has_kilolava_data(ex):
                    upd["dates_changed"] = {
                        "old_start": ex.get("start_time"), "old_end": ex.get("end_time"),
                        "new_start": fe["start"], "new_end": fe["end"], "at": now,
                    }
                await db.events.update_one({"id": ex["id"]}, {"$set": upd})
                updated += 1
        else:
            event_id = str(uuid.uuid4())
            event_doc = {
                "id": event_id,
                "event_type": "booking",
                "title": title,
                "structure_id": structure_id,
                "unit_id": None,
                "start_time": fe["start"],
                "end_time": fe["end"],
                "assigned_operator": None,
                "status": "pending",
                "notes": None,
                "source": source,
                "ical_uid": uid,
                "auto_generated": False,
                "manually_modified": False,
                "generated_from": None,
                "rule": None,
                "guests_count": None,
                "beds_double": None,
                "beds_single": None,
                "beds_sofa": None,
                "checkin_time": (structure or {}).get("check_in_time"),
                "checkout_time": (structure or {}).get("check_out_time"),
                "cleaning_task_id": None,
                "dates_changed": None,
                "feed_cancelled": None,
                "created_at": now,
                "updated_at": now,
            }
            await db.events.insert_one(event_doc)
            created += 1

    feed_uids = set(feed_events.keys())
    for uid, ex in existing_map.items():
        if uid not in feed_uids:
            if ex.get("manually_modified"):
                skipped_manual += 1
                continue
            if _has_kilolava_data(ex):
                # NON cancellare i dati Kilolava: segna come cancellata dal feed e lascia decidere al Manager
                if not ex.get("feed_cancelled"):
                    await db.events.update_one({"id": ex["id"]}, {"$set": {
                        "status": "cancelled", "feed_cancelled": True, "updated_at": now}})
                    removed += 1
            else:
                await db.events.delete_one({"id": ex["id"]})
                removed += 1

    sync_record = {
        "id": str(uuid.uuid4()),
        "structure_id": structure_id,
        "structure_name": structure_name,
        "source": source,
        "ical_url": ical_url,
        "synced_at": now,
        "synced_by": user_id,
        "events_in_feed": len(feed_events),
        "created": created,
        "updated": updated,
        "removed": removed,
        "skipped_manual": skipped_manual,
        "status": "success",
        "error": None,
    }
    await db.ical_syncs.insert_one(sync_record)
    sync_record.pop("_id", None)
    return sync_record


async def auto_sync_all_ical() -> dict:
    """Sync automatico (scheduler, ogni 5 minuti). Idempotente, senza duplicati."""
    structures = await db.structures.find(
        {"ical_url": {"$exists": True, "$nin": [None, ""]}},
        {"_id": 0, "id": 1, "ical_url": 1}
    ).to_list(200)
    ok, errors = 0, 0
    for s in structures:
        try:
            await sync_structure_ical(s["id"], s["ical_url"], "scheduler")
            ok += 1
        except Exception:
            errors += 1
    return {"synced": ok, "errors": errors, "at": now_iso()}
