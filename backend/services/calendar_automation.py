"""
Calendar automation service.
- Auto-generates the 4 service tasks (cleaning, linen change, consumables,
  maintenance check) when a booking checkout is created or imported.
- Provides idempotency helpers used by the events route.
"""
import uuid
import logging
from datetime import datetime, timedelta

from core.database import db
from core.utils import now_iso
from core.enums import AutomationRule, EventStatus

logger = logging.getLogger(__name__)


# Map AutomationRule -> (event_type, title_prefix, services_required, default_duration_min)
# A task is created only if the structure has at least one of `services_required` active.
CHECKOUT_TASK_DEFINITIONS = [
    {
        "rule": AutomationRule.CHECKOUT_CLEANING,
        "event_type": "cleaning",
        "title_prefix": "Pulizia",
        "services_required": ["cleaning"],
        "default_duration_min": 60,
    },
    {
        "rule": AutomationRule.CHECKOUT_LINEN,
        "event_type": "delivery",
        "title_prefix": "Cambio biancheria",
        "services_required": ["private_laundry", "rental_laundry"],
        "default_duration_min": 30,
    },
    {
        "rule": AutomationRule.CHECKOUT_CONSUMABLES,
        "event_type": "delivery",
        "title_prefix": "Reintegro consumabili",
        "services_required": ["consumables"],
        "default_duration_min": 20,
    },
    {
        "rule": AutomationRule.CHECKOUT_MAINTENANCE,
        "event_type": "maintenance",
        "title_prefix": "Check manutenzione",
        "services_required": ["maintenance"],
        "default_duration_min": 30,
    },
]


async def task_exists_with_rule(generated_from: str, rule: str) -> bool:
    """True if an auto-generated active task already exists for the given booking + rule."""
    existing = await db.events.find_one({
        "generated_from": generated_from,
        "rule": rule,
        "status": {"$nin": ["cancelled"]},
    }, {"_id": 0, "id": 1})
    return existing is not None


async def auto_generate_checkout_tasks(booking: dict) -> list:
    """
    Given a booking event document, create the 4 service tasks at checkout
    (cleaning, linen change, consumables, maintenance check) for any service
    actively configured on the structure. Returns list of task documents created.
    Skips tasks that already exist (idempotent).
    """
    structure_id = booking.get("structure_id")
    if not structure_id:
        return []
    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0})
    if not structure:
        return []
    active_services = set(structure.get("services") or [])
    if not active_services:
        return []

    unit_id = booking.get("unit_id")
    unit = None
    if unit_id:
        unit = await db.units.find_one({"id": unit_id}, {"_id": 0})

    cleaning_cfg = (unit or {}).get("cleaning_config") or {}
    cleaning_time = cleaning_cfg.get("estimated_cleaning_time", 60)

    prop_name = structure.get("name", "")
    if unit:
        prop_name = f"{structure['name']} / {unit.get('name', '')}"

    end_time_str = booking.get("end_time", "")
    if not end_time_str:
        return []

    if "T" in end_time_str:
        checkout_dt = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
    else:
        checkout_dt = datetime.fromisoformat(f"{end_time_str}T11:00:00+00:00")

    now = now_iso()
    created_tasks = []
    booking_id = booking.get("id")
    if not booking_id:
        return []

    base_start = checkout_dt + timedelta(minutes=30)

    for definition in CHECKOUT_TASK_DEFINITIONS:
        if not any(s in active_services for s in definition["services_required"]):
            continue
        if await task_exists_with_rule(booking_id, definition["rule"]):
            continue

        duration = (
            cleaning_time
            if definition["rule"] == AutomationRule.CHECKOUT_CLEANING
            else definition["default_duration_min"]
        )
        task_start = base_start
        task_end = task_start + timedelta(minutes=duration)

        task = {
            "id": str(uuid.uuid4()),
            "event_type": definition["event_type"],
            "title": f"{definition['title_prefix']} - {prop_name}",
            "structure_id": structure_id,
            "unit_id": unit_id,
            "start_time": task_start.isoformat(),
            "end_time": task_end.isoformat(),
            "assigned_operator": None,
            "status": EventStatus.PENDING,
            "notes": f"Auto: checkout {booking.get('title', '')}",
            "source": "automation",
            "generated_from": booking_id,
            "auto_generated": True,
            "rule": definition["rule"],
            "created_at": now,
            "updated_at": now,
        }
        await db.events.insert_one(task)
        task.pop("_id", None)
        created_tasks.append(task)

    return created_tasks
