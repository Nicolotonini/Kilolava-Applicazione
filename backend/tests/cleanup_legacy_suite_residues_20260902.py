"""Rimozione residui fixture lasciati dalla suite pytest legacy (eseguita il 2026-09-02).
Filtri ESPLICITI su codici/nomi/creazione odierna: mai dati reali (19 utenti USR-0000..0018, CLI-0029, cataloghi, 8 kit, zone reali)."""
import os
import asyncio
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
BASE_USR = [f"USR-{i:04d}" for i in range(0, 19)]
TODAY = "2026-09-02T00:20"
NOTIF_BASE_LAST = "2026-09-01T13:48:45.187400+00:00"  # created_at della 35ª notifica reale (baseline)


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    R = {}
    extra_users = [u["id"] async for u in db.users.find({"usr_code": {"$nin": BASE_USR}, "created_at": {"$gte": TODAY}}, {"id": 1})]
    extra_clients = [c["id"] async for c in db.clients.find({"cli_code": {"$ne": "CLI-0029"}, "created_at": {"$gte": TODAY}}, {"id": 1})]
    structs = [s["id"] async for s in db.structures.find({"created_at": {"$gte": TODAY}}, {"id": 1})]
    assert await db.structures.count_documents({}) == len(structs), "strutture non odierne presenti: STOP"
    assert await db.clients.count_documents({"cli_code": {"$ne": "CLI-0029"}}) == len(extra_clients), "clienti extra non odierni: STOP"
    assert await db.users.count_documents({"usr_code": {"$nin": BASE_USR}}) == len(extra_users), "utenti extra non odierni: STOP"
    R["users"] = (await db.users.delete_many({"id": {"$in": extra_users}})).deleted_count
    R["user_sessions"] = (await db.user_sessions.delete_many({"user_id": {"$in": extra_users}})).deleted_count
    R["user_devices"] = (await db.user_devices.delete_many({"user_id": {"$in": extra_users}})).deleted_count
    R["zaini"] = (await db.zaini.delete_many({"created_at": {"$gte": TODAY}})).deleted_count
    R["clients"] = (await db.clients.delete_many({"id": {"$in": extra_clients}})).deleted_count
    R["structures"] = (await db.structures.delete_many({"id": {"$in": structs}})).deleted_count
    R["units"] = (await db.units.delete_many({})).deleted_count  # baseline 0
    R["events"] = (await db.events.delete_many({})).deleted_count  # baseline 0
    R["cleaning_tasks"] = (await db.cleaning_tasks.delete_many({})).deleted_count  # baseline 0
    R["fabbisogni"] = (await db.fabbisogni.delete_many({})).deleted_count  # baseline 0
    R["logistics_tasks"] = (await db.logistics_tasks.delete_many({})).deleted_count  # baseline 0
    R["warehouse_movements"] = (await db.warehouse_movements.delete_many({})).deleted_count  # baseline 0
    R["stock_levels"] = (await db.stock_levels.delete_many({})).deleted_count  # baseline 0
    R["maintenance_issues"] = (await db.maintenance_issues.delete_many({})).deleted_count  # baseline 0
    R["segnalazione_tasks"] = (await db.segnalazione_tasks.delete_many({"created_at": {"$gte": TODAY}})).deleted_count
    R["rental_catalog"] = (await db.rental_catalog.delete_many({"code": {"$nin": [f"NOL-{i:04d}" for i in range(1, 24)]}})).deleted_count
    R["kits"] = (await db.kits.delete_many({"code": {"$nin": [f"KIT-NOL-{i:04d}" for i in range(1, 9)]}})).deleted_count
    R["zones_today"] = (await db.operational_zones.delete_many({"created_at": {"$gte": TODAY}})).deleted_count
    R["notifications"] = (await db.notifications.delete_many({"created_at": {"$gt": NOTIF_BASE_LAST}})).deleted_count
    R["ical_syncs"] = (await db.ical_syncs.delete_many({})).deleted_count
    R["structure_media"] = (await db.structure_media.delete_many({})).deleted_count
    R["client_orders"] = (await db.client_orders.delete_many({})).deleted_count  # baseline 0
    R["key_movements"] = (await db.key_movements.delete_many({})).deleted_count  # baseline 0
    print("RIMOSSI:", R)
    for c in ["users", "clients", "structures", "units", "events", "cleaning_tasks", "fabbisogni", "logistics_tasks",
              "warehouse_movements", "stock_levels", "rental_catalog", "supply_catalog", "cleaning_catalog", "kits",
              "notifications", "operational_zones", "checklist_templates", "maintenance_issues", "client_orders", "orders"]:
        print(c, await db[c].count_documents({}))
    print("USR", sorted(u["usr_code"] for u in [x async for x in db.users.find({}, {"usr_code": 1})]))
    print("counters", [c async for c in db.counters.find({})])


asyncio.run(main())
