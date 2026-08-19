"""Channel Manager sync engine — normalizza e fa upsert delle prenotazioni in cm_reservations.

Non tocca events/calendario e NON genera pulizie (step successivo).
Chiave stabile anti-duplicati: connection_id + external_id (provider incluso nella connection).
"""
import logging
import uuid
from datetime import date, timedelta

from core.database import db
from core.utils import now_iso
from integrations.channel_managers import get_adapter
from integrations.channel_managers.base import AdapterError

logger = logging.getLogger(__name__)

TRACK_FIELDS = ["check_in", "check_out", "status", "guests_count", "guest_name", "channel", "structure_id"]


async def _upsert_reservation(connection: dict, n, structure_id, klv_code) -> str:
    key = {"connection_id": connection["id"], "external_id": str(n.external_id)}
    now = now_iso()
    fields = {
        "provider": connection["provider"],
        "connection_id": connection["id"],
        "connection_name": connection.get("name"),
        "external_id": str(n.external_id),
        "structure_id": structure_id,
        "klv_code": klv_code,
        "check_in": n.check_in,
        "check_out": n.check_out,
        "status": n.status,
        "status_raw": n.status_raw,
        "guests_count": n.guests_count,
        "guest_name": n.guest_name,
        "channel": n.channel,
        "external_property_id": n.external_property_id,
        "external_updated_at": n.external_updated_at,
        "last_synced_at": now,
    }
    existing = await db.cm_reservations.find_one(key, {"_id": 0})
    if not existing:
        await db.cm_reservations.insert_one({**fields, "id": str(uuid.uuid4()), "first_seen_at": now, "history": []})
        return "created"
    changes = {}
    for f in TRACK_FIELDS:
        if (existing.get(f) or None) != (fields.get(f) or None):
            changes[f] = {"from": existing.get(f), "to": fields.get(f)}
    if not changes:
        await db.cm_reservations.update_one(key, {"$set": {"last_synced_at": now}})
        return "unchanged"
    await db.cm_reservations.update_one(key, {
        "$set": fields,
        "$push": {"history": {"$each": [{"at": now, "changes": changes}], "$slice": -30}},
    })
    if fields["status"] == "cancelled" and existing.get("status") != "cancelled":
        return "cancelled"
    return "updated"


async def _mark_cancelled(connection: dict, stored: dict):
    now = now_iso()
    await db.cm_reservations.update_one(
        {"connection_id": connection["id"], "external_id": stored["external_id"]},
        {
            "$set": {"status": "cancelled", "status_raw": "removed_from_feed", "last_synced_at": now},
            "$push": {"history": {"$each": [{"at": now, "changes": {"status": {"from": stored.get("status"), "to": "cancelled"}}}], "$slice": -30}},
        },
    )


async def _store_result(connection_id: str, result: dict, status: str):
    await db.cm_connections.update_one(
        {"id": connection_id},
        {"$set": {"last_sync": result["synced_at"], "last_sync_result": result, "status": status}},
    )


async def sync_connection(connection: dict, trigger: str = "manual") -> dict:
    conn_id = connection["id"]
    adapter = get_adapter(connection["provider"])
    result = {
        "connection_id": conn_id, "provider": connection["provider"], "trigger": trigger,
        "created": 0, "updated": 0, "cancelled": 0, "unchanged": 0, "errors": [],
        "synced_at": now_iso(),
    }
    if not adapter.implemented:
        result["errors"].append(f"{adapter.label}: adapter non ancora attivo (nessuna API simulata)")
        await _store_result(conn_id, result, "not_configured")
        return result
    mappings = await db.cm_property_mappings.find(
        {"connection_id": conn_id, "status": "linked"}, {"_id": 0}
    ).to_list(500)
    if not mappings:
        result["errors"].append("Nessuna struttura collegata: importa le proprietà ed esegui il mapping prima di sincronizzare")
        await _store_result(conn_id, result, "warning")
        return result

    map_by_ext = {str(m["external_id"]): m for m in mappings}
    past = int(connection.get("sync_past_days") or 7)
    future = int(connection.get("sync_future_days") or 60)
    date_from = (date.today() - timedelta(days=past)).isoformat()
    date_to = (date.today() + timedelta(days=future)).isoformat()

    try:
        normalized = await adapter.fetch_reservations(
            connection, list(map_by_ext.keys()), date_from, date_to
        )
    except AdapterError as e:
        result["errors"].append(str(e))
        await _store_result(conn_id, result, "error")
        return result
    except Exception as e:
        logger.exception("CM sync failed for %s", conn_id)
        result["errors"].append(f"Errore imprevisto di sincronizzazione: {e}")
        await _store_result(conn_id, result, "error")
        return result

    seen = set()
    for n in normalized:
        seen.add(str(n.external_id))
        mapping = map_by_ext.get(str(n.external_property_id))
        if mapping is None and len(mappings) == 1:
            mapping = mappings[0]
        structure_id = mapping.get("structure_id") if mapping else None
        klv_code = mapping.get("klv_code") if mapping else None
        outcome = await _upsert_reservation(connection, n, structure_id, klv_code)
        result[outcome] += 1

    # Prenotazioni attive salvate ma non più presenti nella finestra sincronizzata
    missing = await db.cm_reservations.find({
        "connection_id": conn_id,
        "status": {"$nin": ["cancelled"]},
        "check_out": {"$gte": (date.today() - timedelta(days=3)).isoformat()},
        "check_in": {"$lte": date_to},
        "external_id": {"$nin": list(seen)},
    }, {"_id": 0}).to_list(1000)

    if missing:
        if connection["provider"] == "ical":
            for m in missing:
                await _mark_cancelled(connection, m)
                result["cancelled"] += 1
        else:
            try:
                refreshed = await adapter.fetch_reservations_by_ids(
                    connection,
                    [{"external_id": m["external_id"], "external_property_id": m.get("external_property_id")} for m in missing],
                )
                for n in refreshed:
                    mapping = map_by_ext.get(str(n.external_property_id))
                    if mapping is None and len(mappings) == 1:
                        mapping = mappings[0]
                    outcome = await _upsert_reservation(
                        connection, n,
                        mapping.get("structure_id") if mapping else None,
                        mapping.get("klv_code") if mapping else None,
                    )
                    if outcome in ("cancelled", "updated", "created"):
                        result[outcome] += 1
            except AdapterError as e:
                result["errors"].append(f"Verifica prenotazioni mancanti non riuscita: {e}")

    status = "error" if result["errors"] else "connected"
    await _store_result(conn_id, result, status)
    return result


async def sync_all_connections() -> dict:
    """Scheduled auto-sync for enabled connections (predisposto anche per webhook futuri)."""
    summary = {"synced": 0, "skipped": 0, "errors": 0}
    connections = await db.cm_connections.find({"enabled": {"$ne": False}}, {"_id": 0}).to_list(200)
    for conn in connections:
        try:
            adapter = get_adapter(conn["provider"])
        except AdapterError:
            summary["skipped"] += 1
            continue
        if not adapter.implemented or conn.get("auto_sync") is False:
            summary["skipped"] += 1
            continue
        linked = await db.cm_property_mappings.count_documents({"connection_id": conn["id"], "status": "linked"})
        if linked == 0:
            summary["skipped"] += 1
            continue
        try:
            res = await sync_connection(conn, trigger="auto")
            summary["synced"] += 1
            if res["errors"]:
                summary["errors"] += 1
        except Exception:
            logger.exception("Auto-sync failed for connection %s", conn.get("id"))
            summary["errors"] += 1
    logger.info("CM auto-sync summary: %s", summary)
    return summary
