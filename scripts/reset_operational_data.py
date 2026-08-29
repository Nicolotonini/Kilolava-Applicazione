"""Reset controllato dati operativi Kilolava — eseguito una tantum su autorizzazione utente.
Elimina dati operativi/test, preserva: sistema, config, cataloghi, kit, rioni,
checklist template, listini, integrazioni (Google Sheets token), unico account Admin.
Uso: python /app/scripts/reset_operational_data.py [--dry-run]
"""
import asyncio
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from motor.motor_asyncio import AsyncIOMotorClient

DRY = "--dry-run" in sys.argv

KEEP_ADMIN_EMAIL = "test_user@kilolava.com"

# Collection interamente operative/test: svuotate completamente
WIPE = [
    "activity_logs", "cleaning_groups", "cleaning_issues", "cleaning_tasks",
    "client_catalog", "clients", "cm_oauth_states", "cm_property_mappings",
    "cm_reservations", "cm_webhook_events", "documents", "events", "fabbisogni",
    "ical_syncs", "laundry_jobs", "logistics_tasks", "maintenance_issues",
    "notifications", "oauth_states", "orders", "segnalazione_tasks", "segnalazioni",
    "sheets_previews", "sheets_snapshots", "sheets_sync_history", "stock_levels",
    "structure_cleaning_kits", "structure_media", "structures", "units",
    "user_locations", "warehouse_movements", "zaini",
]

# Preservate: app_settings, articles(azzerate qty), board_layouts(solo admin),
# checklist_templates, cleaning_catalog, cm_connections, counters(reset),
# delivery_config, google_tokens, kit_versions, kits, operational_zones,
# rental_catalog, supply_catalog, users(solo admin)


async def counts(db):
    out = {}
    for n in sorted(await db.list_collection_names()):
        out[n] = await db[n].count_documents({})
    return out


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    report = {"at": datetime.now(timezone.utc).isoformat(), "dry_run": DRY}
    report["before"] = await counts(db)

    admin = await db.users.find_one({"email": KEEP_ADMIN_EMAIL, "role": "admin"}, {"_id": 0, "id": 1, "email": 1})
    assert admin, f"ADMIN {KEEP_ADMIN_EMAIL} NON TROVATO — reset annullato per sicurezza"

    if not DRY:
        for coll in WIPE:
            await db[coll].delete_many({})
        # Utenti: mantieni SOLO l'account Admin
        await db.users.delete_many({"email": {"$ne": KEEP_ADMIN_EMAIL}})
        # Layout board solo per utenti rimasti
        kept_ids = [u["id"] async for u in db.users.find({}, {"_id": 0, "id": 1})]
        await db.board_layouts.delete_many({"user_id": {"$nin": kept_ids}})
        # Catalogo legacy 'articles': mantieni anagrafica, azzera quantità operative
        await db.articles.update_many({}, {"$set": {"quantity_available": 0}})
        # Contatori legati a entità eliminate
        await db.counters.update_one({"_id": "klv_structure"}, {"$set": {"seq": 0}})
        await db.app_settings.update_one({"_id": "zaino_seq"}, {"$set": {"seq": 0}})

    # ---- Controllo integrità: riferimenti orfani nelle collection rimaste ----
    orphans = []
    kept_user_ids = {u["id"] async for u in db.users.find({}, {"_id": 0, "id": 1})}
    async for b in db.board_layouts.find({}, {"_id": 0, "user_id": 1}):
        if b.get("user_id") not in kept_user_ids:
            orphans.append(f"board_layouts.user_id={b.get('user_id')}")
    article_ids = {a["id"] async for a in db.articles.find({}, {"_id": 0, "id": 1})}
    async for cc in db.client_catalog.find({}, {"_id": 0, "id": 1}):
        orphans.append(f"client_catalog residuo id={cc['id']}")
    for coll in WIPE:
        n = await db[coll].count_documents({})
        if n:
            orphans.append(f"{coll}: {n} record residui")
    # kit -> referenze a catalogo (se presenti campi *_id verso cataloghi)
    catalog_ids = set(article_ids)
    for cat in ("rental_catalog", "supply_catalog", "cleaning_catalog"):
        catalog_ids |= {c["id"] async for c in db[cat].find({}, {"_id": 0, "id": 1})}
    async for k in db.kits.find({}, {"_id": 0}):
        for it in k.get("items", []):
            ref = it.get("product_id") or it.get("article_id") or it.get("item_id")
            if ref and ref not in catalog_ids:
                orphans.append(f"kits '{k.get('name')}' riferimento catalogo inesistente: {ref}")

    report["after"] = await counts(db)
    report["orphans"] = orphans
    report["kept_admin"] = admin["email"]
    print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
    with open("/app/database_export/reset_report.json", "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)


asyncio.run(main())
