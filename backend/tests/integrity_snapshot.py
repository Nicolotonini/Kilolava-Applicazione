"""Snapshot integrità dati (solo lettura): conteggi, codici permanenti, residui fixture."""
import os
import asyncio
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
COLLS = ["users", "clients", "structures", "units", "events", "cleaning_tasks", "fabbisogni", "logistics_tasks",
         "warehouse_movements", "key_movements", "stock_levels", "client_orders", "orders", "rental_catalog",
         "supply_catalog", "cleaning_catalog", "kits", "notifications", "structure_media", "maintenance_issues",
         "segnalazioni", "laundry_jobs", "cleaning_issues", "documents", "operational_zones", "user_sessions"]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    for c in COLLS:
        print(c, await db[c].count_documents({}))
    print("NOL", sorted([p["code"] async for p in db.rental_catalog.find({}, {"_id": 0, "code": 1})]))
    print("FOR", sorted([p["code"] async for p in db.supply_catalog.find({}, {"_id": 0, "code": 1})]))
    print("PUL", len([p["code"] async for p in db.cleaning_catalog.find({}, {"_id": 0, "code": 1})]))
    print("KIT", sorted([k.get("code") or k.get("name") async for k in db.kits.find({}, {"_id": 0, "code": 1, "name": 1})]))
    print("USR", sorted([(u["usr_code"], u.get("first_name")) async for u in db.users.find({}, {"_id": 0, "usr_code": 1, "first_name": 1})]))
    print("CLI", [(c.get("cli_code"), (c.get("private_info") or {}).get("name"), (c.get("company_info") or {}).get("company_name"))
                  async for c in db.clients.find({}, {"_id": 0, "cli_code": 1, "private_info.name": 1, "company_info.company_name": 1})])
    print("KLV", [(s.get("klv_code"), s.get("name")) async for s in db.structures.find({}, {"_id": 0, "klv_code": 1, "name": 1})])
    print("counters", [c async for c in db.counters.find({})])
    rx = {"$regex": "TEST|test|Test|FIX|Demo|demo"}
    for c, f in (("users", "first_name"), ("clients", "company_info.company_name"), ("clients", "private_info.name"),
                 ("structures", "name"), ("units", "name"), ("rental_catalog", "name"), ("supply_catalog", "name"),
                 ("cleaning_catalog", "name"), ("kits", "name"), ("operational_zones", "name")):
        n = await db[c].count_documents({f: rx})
        if n:
            print("RESIDUI?", c, f, n, [d async for d in db[c].find({f: rx}, {"_id": 0, "id": 1, f: 1, "code": 1, "usr_code": 1, "cli_code": 1, "klv_code": 1})][:12])


asyncio.run(main())
