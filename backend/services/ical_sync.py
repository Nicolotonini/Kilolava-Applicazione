"""
iCal sync service — fetch external feeds, upsert booking events,
trigger auto task generation, and respect manually_modified events.
"""
import uuid
import httpx
from datetime import datetime
from icalendar import Calendar as ICalendar

from core.database import db
from core.utils import now_iso
from services.calendar_automation import auto_generate_checkout_tasks


def detect_ical_source(url: str) -> str:
    url_lower = (url or "").lower()
    if "airbnb" in url_lower:
        return "airbnb"
    if "booking.com" in url_lower or "booking" in url_lower:
        return "booking_com"
    return "other_ical"


async def sync_structure_ical(structure_id: str, ical_url: str, user_id: str) -> dict:
    """Fetch and parse an iCal feed, create/update/remove booking events."""
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
        {"_id": 0, "id": 1, "ical_uid": 1, "start_time": 1, "end_time": 1, "title": 1, "manually_modified": 1}
    ).to_list(5000)
    existing_map = {e["ical_uid"]: e for e in existing}

    created = 0
    updated = 0
    removed = 0
    auto_tasks_created = 0
    skipped_manual = 0
    now = now_iso()

    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0, "name": 1, "client_id": 1})
    structure_name = structure.get("name", "") if structure else ""

    for uid, fe in feed_events.items():
        title = fe["summary"]
        if title in ("CLOSED - Not available", "Not available", "Closed"):
            title = f"Prenotazione {source.replace('_', ' ').title()}"

        if uid in existing_map:
            ex = existing_map[uid]
            if ex.get("manually_modified"):
                skipped_manual += 1
                ex_full = await db.events.find_one({"id": ex["id"]}, {"_id": 0})
                if ex_full:
                    new_tasks = await auto_generate_checkout_tasks(ex_full)
                    auto_tasks_created += len(new_tasks)
                continue
            if ex.get("start_time") != fe["start"] or ex.get("end_time") != fe["end"] or ex.get("title") != title:
                await db.events.update_one(
                    {"id": ex["id"]},
                    {"$set": {"start_time": fe["start"], "end_time": fe["end"], "title": title, "updated_at": now}}
                )
                updated += 1
            ex_full = await db.events.find_one({"id": ex["id"]}, {"_id": 0})
            if ex_full:
                new_tasks = await auto_generate_checkout_tasks(ex_full)
                auto_tasks_created += len(new_tasks)
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
                "notes": f"Importato da {source.replace('_', ' ').title()} - UID: {uid}",
                "source": source,
                "ical_uid": uid,
                "auto_generated": False,
                "manually_modified": False,
                "generated_from": None,
                "rule": None,
                "created_at": now,
                "updated_at": now,
            }
            await db.events.insert_one(event_doc)
            created += 1
            new_tasks = await auto_generate_checkout_tasks(event_doc)
            auto_tasks_created += len(new_tasks)

    feed_uids = set(feed_events.keys())
    for uid, ex in existing_map.items():
        if uid not in feed_uids:
            if ex.get("manually_modified"):
                skipped_manual += 1
                continue
            await db.events.delete_many({"generated_from": ex["id"], "auto_generated": True})
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
        "auto_tasks_created": auto_tasks_created,
        "skipped_manual": skipped_manual,
        "status": "success",
        "error": None,
    }
    await db.ical_syncs.insert_one(sync_record)
    sync_record.pop("_id", None)
    return sync_record
