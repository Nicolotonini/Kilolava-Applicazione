"""
APScheduler initialization + scheduled task definitions.
The overdue task check runs every 30 minutes and notifies ops users
plus the assigned operator (if any) for any operational task that
is past its end_time and not yet completed.
"""
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from core.database import db
from core.enums import EventStatus

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")

OVERDUE_OPERATIONAL_TYPES = ["cleaning", "delivery", "pickup", "maintenance"]
OVERDUE_NOTIFY_INTERVAL_HOURS = 6


async def check_overdue_tasks(create_notification, notify_ops_users) -> dict:
    """
    Find operational tasks (cleaning/delivery/pickup/maintenance) whose end_time is in the past
    and that are still pending/assigned/in_progress, then notify the assigned operator (if any)
    + ops users. Avoid duplicate notifications via `overdue_notified_at`.

    `create_notification` and `notify_ops_users` are passed in to avoid circular imports
    with the legacy server.py module.
    """
    now_dt = datetime.now(timezone.utc)
    now_str = now_dt.isoformat()
    cutoff = (now_dt - timedelta(hours=OVERDUE_NOTIFY_INTERVAL_HOURS)).isoformat()

    query = {
        "event_type": {"$in": OVERDUE_OPERATIONAL_TYPES},
        "status": {"$in": [EventStatus.PENDING, EventStatus.ASSIGNED, EventStatus.IN_PROGRESS]},
        "end_time": {"$lt": now_str},
        "$or": [
            {"overdue_notified_at": {"$exists": False}},
            {"overdue_notified_at": None},
            {"overdue_notified_at": {"$lt": cutoff}},
        ],
    }
    overdue_tasks = await db.events.find(query, {"_id": 0}).to_list(500)

    notified_count = 0
    for task in overdue_tasks:
        title = f"Task in ritardo: {task.get('title', '')}"
        msg = (
            f"Il task del {task.get('end_time', '')[:10]} è ancora in stato "
            f"{task.get('status', 'pending')} e non è stato completato."
        )
        op_name = task.get("assigned_operator")
        if op_name:
            user = await db.users.find_one({"name": op_name}, {"_id": 0, "id": 1})
            if user:
                await create_notification(
                    user["id"], title, msg, "task_overdue", "important", "event", task["id"]
                )
        await notify_ops_users(title, msg, "task_overdue", "important", "event", task["id"])
        await db.events.update_one(
            {"id": task["id"]}, {"$set": {"overdue_notified_at": now_str}}
        )
        notified_count += 1

    return {"checked_at": now_str, "overdue_found": len(overdue_tasks), "notified": notified_count}


def start_scheduler(job_callable, ical_sync_callable=None, daily_backup_callable=None):
    """Start the scheduler: overdue check, iCal auto-sync, backup anagrafiche notturno. Idempotent."""
    if scheduler.running:
        return
    scheduler.add_job(
        job_callable,
        IntervalTrigger(minutes=30),
        id="check_overdue_tasks",
        name="Check overdue operational tasks",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    if ical_sync_callable:
        scheduler.add_job(
            ical_sync_callable,
            IntervalTrigger(minutes=5),
            id="ical_auto_sync",
            name="Sync automatico iCal (5 min)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    if daily_backup_callable:
        from apscheduler.triggers.cron import CronTrigger
        scheduler.add_job(
            daily_backup_callable,
            CronTrigger(hour=3, minute=0, timezone="Europe/Rome"),
            id="sheets_daily_backup",
            name="Backup anagrafiche Google Sheets (03:00)",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
    scheduler.start()
    logger.info("Scheduler started (overdue 30min, iCal sync 5min)")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
