"""Sistema Magazzino Kilolava: Noleggio Strutture, Forniture, Magazzino Pulizie, Zaini Operativi, Movimenti."""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from core.database import db
from core.utils import now_iso

DOMAINS = ["noleggio", "forniture", "pulizie"]
CATALOG_COLL = {"noleggio": "rental_catalog", "forniture": "supply_catalog", "pulizie": "cleaning_catalog"}
MOVEMENT_TYPES = ["carico", "scarico", "trasferimento", "consegna", "ritiro", "consumo_pulizia",
                  "reintegro_zaino", "rettifica_inventario", "danneggiato", "mancante", "reso", "annullamento", "altro"]
ZAINO_STATUSES = ["disponibile", "assegnato", "da_reintegrare", "in_manutenzione", "fuori_uso"]
LOCATION_TYPES = ["central", "structure", "zaino", "external"]

SEED_RENTAL = ["Federa", "Lenzuolo singolo", "Lenzuolo matrimoniale", "Copripiumino", "Telo", "Viso", "Bidet", "Tappetino"]
SEED_SUPPLY = [
    {"name": "Carta igienica", "category": "Consumabili bagno"},
    {"name": "Sapone", "category": "Consumabili bagno"},
    {"name": "Caff\u00e8", "category": "Consumabili cucina"},
    {"name": "Scottex", "category": "Consumabili cucina"},
    {"name": "Welcome kit", "category": "Welcome kit"},
]
SEED_CLEANING = [
    ("Scopa", "attrezzatura", "casa"),
    ("Scovazzera", "attrezzatura", "casa"),
    ("Mocio", "attrezzatura", "casa"),
    ("Aspirapolvere", "attrezzatura", "casa"),
    ("Swiffer pavimenti", "attrezzatura", "zaino"),
    ("Swiffer mobili", "attrezzatura", "zaino"),
    ("Ricariche Swiffer pavimenti", "consumabile", "zaino"),
    ("Ricariche Swiffer mobili", "consumabile", "zaino"),
    ("Nuovi fiocchi", "consumabile", "casa"),
    ("Pezze per lavare", "consumabile", "zaino"),
    ("Glizzi", "consumabile", "zaino"),
    ("Panno vetri", "consumabile", "zaino"),
    ("Viakal", "consumabile", "casa"),
    ("Chanteclaire", "consumabile", "casa"),
    ("Detersivo pavimenti", "consumabile", "casa"),
    ("Ammoniaca con acqua", "consumabile", "casa"),
    ("Aceto", "consumabile", "casa"),
    ("Candeggina", "consumabile", "casa"),
    ("WC Net", "consumabile", "casa"),
    ("Spugnetta per i muri", "consumabile", "casa"),
    ("Spazzolino da denti per le fughe", "consumabile", "zaino"),
    ("Spazzolone per piatti per gli scarichi", "consumabile", "zaino"),
    ("Mangiapolvere", "consumabile", "casa"),
]

_deps = {}


def init_magazzino_deps(**kwargs):
    _deps.update(kwargs)


async def seed_magazzino():
    now = now_iso()
    if await db.rental_catalog.count_documents({}) == 0:
        await db.rental_catalog.insert_many([
            {"id": str(uuid.uuid4()), "name": n, "sku": "", "category": "Biancheria", "unit": "pz",
             "photo": None, "cost": None, "active": True, "notes": "", "created_at": now, "updated_at": now}
            for n in SEED_RENTAL])
    if await db.supply_catalog.count_documents({}) == 0:
        await db.supply_catalog.insert_many([
            {"id": str(uuid.uuid4()), "name": s["name"], "sku": "", "category": s["category"], "unit": "pz",
             "photo": None, "cost": None, "active": True, "notes": "",
             "default_min": None, "default_ideal": None, "resp_category": None,
             "created_at": now, "updated_at": now}
            for s in SEED_SUPPLY])
    if await db.cleaning_catalog.count_documents({}) == 0:
        await db.cleaning_catalog.insert_many([
            {"id": str(uuid.uuid4()), "name": n, "sku": "", "category": "Pulizie", "unit": "pz",
             "photo": None, "cost": None, "active": True, "notes": "",
             "type": t, "standard_location": loc, "min_qty": None,
             "created_at": now, "updated_at": now}
            for n, t, loc in SEED_CLEANING])
    # Migrazione: il magazzino pulizie centrale non esiste più (prodotti solo nelle case e negli zaini)
    await db.cleaning_catalog.update_many({"standard_location": "central"}, {"$set": {"standard_location": "casa"}})
    await db.stock_levels.delete_many({"domain": "pulizie", "location_type": "central"})
    seed_kits = [
        ("Kit Matrimoniale", "noleggio", "matrimoniale"),
        ("Kit Singolo", "noleggio", "singolo"),
        ("Kit Zaino Standard", "pulizie", None),
    ]
    for name, domain, bed_type in seed_kits:
        if not await db.kits.find_one({"name": name}):
            await db.kits.insert_one({
                "id": str(uuid.uuid4()), "name": name, "domain": domain, "bed_type": bed_type,
                "items": [], "active": True, "version": 1, "notes": "",
                "created_at": now, "updated_at": now})
    await db.warehouse_movements.create_index([("at", -1)])
    await db.warehouse_movements.create_index([("structure_id", 1)])
    await db.warehouse_movements.create_index([("zaino_id", 1)])
    await db.stock_levels.create_index([("domain", 1), ("location_type", 1), ("location_id", 1), ("product_id", 1)], unique=True)
    await db.zaini.create_index([("code", 1)], unique=True)


# ---------- helpers ----------

async def get_product(domain: str, product_id: str) -> Optional[dict]:
    return await db[CATALOG_COLL[domain]].find_one({"id": product_id}, {"_id": 0})


async def adjust_stock(domain: str, location_type: str, location_id: Optional[str], product_id: str, delta: int):
    key = {"domain": domain, "location_type": location_type, "location_id": location_id or None, "product_id": product_id}
    await db.stock_levels.update_one(key, {"$inc": {"qty": delta}, "$set": {"updated_at": now_iso()},
                                           "$setOnInsert": {"id": str(uuid.uuid4())}}, upsert=True)


async def stock_map(domain: str, location_type: str, location_id: Optional[str]) -> dict:
    rows = await db.stock_levels.find({"domain": domain, "location_type": location_type,
                                       "location_id": location_id or None}, {"_id": 0}).to_list(500)
    return {r["product_id"]: r for r in rows}


def _loc_tracked(loc: dict) -> bool:
    return (loc or {}).get("type") in ("central", "structure", "zaino")


async def apply_movement(*, domain: str, movement_type: str, product: dict, qty: int,
                         origin: dict, destination: dict, user: dict, note: str = "",
                         structure_id: str = None, zaino_id: str = None, reverses: str = None) -> dict:
    now = now_iso()
    mov = {
        "id": str(uuid.uuid4()), "at": now, "domain": domain, "movement_type": movement_type,
        "product_id": product["id"], "product_name": product["name"], "qty": qty,
        "origin": origin or {"type": "external", "label": "Esterno"},
        "destination": destination or {"type": "external", "label": "Esterno"},
        "structure_id": structure_id, "zaino_id": zaino_id,
        "user_id": (user or {}).get("id"), "user_name": (user or {}).get("name", ""),
        "note": note or "", "reversed_by": None, "reverses": reverses,
        "created_at": now,
    }
    if _loc_tracked(mov["origin"]):
        await adjust_stock(domain, mov["origin"]["type"], mov["origin"].get("id"), product["id"], -qty)
    if _loc_tracked(mov["destination"]):
        await adjust_stock(domain, mov["destination"]["type"], mov["destination"].get("id"), product["id"], qty)
    await db.warehouse_movements.insert_one(mov)
    mov.pop("_id", None)
    return mov


async def structure_label(structure_id: str) -> dict:
    s = await db.structures.find_one({"id": structure_id}, {"_id": 0, "id": 1, "name": 1, "klv_code": 1, "client_id": 1})
    return s or {"id": structure_id, "name": "Struttura", "klv_code": None}


async def noleggio_kits() -> dict:
    kits = await db.kits.find({"domain": "noleggio", "active": True}, {"_id": 0}).to_list(20)
    by_bed = {}
    for k in kits:
        if k.get("bed_type"):
            by_bed[k["bed_type"]] = k
    return by_bed


def task_kit_needs(task: dict, by_bed: dict) -> List[dict]:
    """Kit richiesti da una pulizia in base ai letti."""
    needs = []
    dbl = task.get("beds_double") or 0
    sng = (task.get("beds_single") or 0)
    sofa = (task.get("beds_sofa") or 0)
    if dbl and by_bed.get("matrimoniale"):
        needs.append({"kit": by_bed["matrimoniale"], "qty": dbl})
    single_kit = by_bed.get("singolo")
    sofa_kit = by_bed.get("divano") or single_kit
    if sng and single_kit:
        needs.append({"kit": single_kit, "qty": sng})
    if sofa and sofa_kit:
        existing = next((n for n in needs if n["kit"]["id"] == sofa_kit["id"]), None)
        if existing:
            existing["qty"] += sofa
        else:
            needs.append({"kit": sofa_kit, "qty": sofa})
    return needs


def evaluate_coverage(needs: List[dict], stock: dict) -> dict:
    """Confronta i kit richiesti con lo stock articoli della struttura."""
    unconfigured = [n["kit"]["name"] for n in needs if not n["kit"].get("items")]
    required_items = {}
    for n in needs:
        for it in n["kit"].get("items") or []:
            required_items.setdefault(it["product_id"], {"product_id": it["product_id"], "name": it.get("name", ""), "qty": 0})
            required_items[it["product_id"]]["qty"] += it["qty"] * n["qty"]
    missing = []
    for pid, req in required_items.items():
        have = (stock.get(pid) or {}).get("qty", 0)
        if have < req["qty"]:
            missing.append({**req, "available": have, "missing": req["qty"] - have})
    covered = len(missing) == 0 and len(unconfigured) == 0
    return {
        "kits_needed": [{"kit_id": n["kit"]["id"], "kit_name": n["kit"]["name"], "qty": n["qty"],
                         "configured": bool(n["kit"].get("items"))} for n in needs],
        "required_items": list(required_items.values()),
        "missing_items": missing,
        "unconfigured_kits": unconfigured,
        "covered": covered if needs else True,
    }


async def upcoming_tasks_by_structure(structure_id: Optional[str] = None, limit_days: int = 30):
    today = _deps["local_today"]()
    q = {"date": {"$gte": today}, "status": {"$in": ["unassigned", "assigned", "in_progress"]}}
    if structure_id:
        q["structure_id"] = structure_id
    tasks = await db.cleaning_tasks.find(q, {"_id": 0, "id": 1, "date": 1, "structure_id": 1, "structure_name": 1,
                                             "beds_double": 1, "beds_single": 1, "beds_sofa": 1, "scheduled_time": 1}) \
        .sort("date", 1).to_list(500)
    by_struct = {}
    for t in tasks:
        if t.get("structure_id"):
            by_struct.setdefault(t["structure_id"], []).append(t)
    return by_struct


# ---------- pydantic ----------

class ProductPayload(BaseModel):
    name: str
    sku: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    cost: Optional[float] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
    type: Optional[str] = None
    standard_location: Optional[str] = None
    min_qty: Optional[int] = None
    default_min: Optional[int] = None
    default_ideal: Optional[int] = None
    resp_category: Optional[str] = None


class KitPayload(BaseModel):
    name: str
    domain: str
    bed_type: Optional[str] = None
    items: List[dict] = []
    active: Optional[bool] = True
    notes: Optional[str] = None


class MovementCreate(BaseModel):
    domain: str
    movement_type: str
    product_id: str
    qty: int
    origin: Optional[dict] = None
    destination: Optional[dict] = None
    note: Optional[str] = None


class ZainoCreate(BaseModel):
    name: Optional[str] = None
    kit_id: Optional[str] = None
    notes: Optional[str] = None


class ZainoUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    kit_id: Optional[str] = None
    overrides: Optional[List[dict]] = None
    notes: Optional[str] = None


class CheckPayload(BaseModel):
    counts: List[dict]


class ReintegroPayload(BaseModel):
    items: List[dict]


class InventoryPayload(BaseModel):
    domain: str
    location_type: str
    location_id: Optional[str] = None
    counts: List[dict]
    note: Optional[str] = None


class SupplyItemConfig(BaseModel):
    product_id: str
    min_qty: Optional[int] = None
    ideal_qty: Optional[int] = None
    threshold_enabled: Optional[bool] = None


class CleaningItemConfig(BaseModel):
    product_id: str
    min_qty: Optional[int] = None


class FabbisognoCreate(BaseModel):
    kind: str
    structure_id: Optional[str] = None
    zaino_id: Optional[str] = None
    items: List[dict]
    date_needed: Optional[str] = None
    note: Optional[str] = None
    cleaning_task_id: Optional[str] = None
    responsibility: Optional[str] = None


class FabbisognoUpdate(BaseModel):
    status: str


def create_magazzino_router(get_current_user, is_ops_user):
    router = APIRouter(prefix="/magazzino", tags=["magazzino"])

    def require_ops(user):
        if not is_ops_user(user):
            raise HTTPException(status_code=403, detail="Non autorizzato")

    # ---------- Cataloghi ----------

    @router.get("/catalog/{domain}")
    async def list_catalog(domain: str, include_inactive: bool = False, current_user: dict = Depends(get_current_user)):
        if domain not in DOMAINS:
            raise HTTPException(status_code=400, detail="Dominio non valido")
        q = {} if include_inactive else {"active": True}
        return await db[CATALOG_COLL[domain]].find(q, {"_id": 0}).sort("name", 1).to_list(500)

    @router.post("/catalog/{domain}")
    async def create_product(domain: str, data: ProductPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if domain not in DOMAINS:
            raise HTTPException(status_code=400, detail="Dominio non valido")
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), "name": data.name.strip(), "sku": data.sku or "",
               "category": data.category or "", "unit": data.unit or "pz", "photo": None,
               "cost": data.cost, "active": True, "notes": data.notes or "",
               "created_at": now, "updated_at": now}
        if domain == "pulizie":
            doc["type"] = data.type if data.type in ("attrezzatura", "consumabile") else "consumabile"
            doc["standard_location"] = data.standard_location if data.standard_location in ("casa", "zaino") else "casa"
            doc["min_qty"] = data.min_qty
        if domain == "forniture":
            doc["default_min"] = data.default_min
            doc["default_ideal"] = data.default_ideal
            doc["resp_category"] = data.resp_category
        await db[CATALOG_COLL[domain]].insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/catalog/{domain}/{product_id}")
    async def update_product(domain: str, product_id: str, data: ProductPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if domain not in DOMAINS:
            raise HTTPException(status_code=400, detail="Dominio non valido")
        upd = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        upd["updated_at"] = now_iso()
        r = await db[CATALOG_COLL[domain]].update_one({"id": product_id}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Prodotto non trovato")
        return await db[CATALOG_COLL[domain]].find_one({"id": product_id}, {"_id": 0})

    @router.post("/catalog/{domain}/{product_id}/photo")
    async def upload_product_photo(domain: str, product_id: str, file: UploadFile = File(...),
                                   current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if domain not in DOMAINS:
            raise HTTPException(status_code=400, detail="Dominio non valido")
        p = await get_product(domain, product_id)
        if not p:
            raise HTTPException(status_code=404, detail="Prodotto non trovato")
        ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "png"
        content_type = file.content_type or "image/png"
        path = f"kilolava/magazzino/products/{product_id}.{ext}"
        data = await file.read()
        _deps["put_object"](path, data, content_type)
        photo = {"file_path": path, "content_type": content_type, "kind": "image"}
        await db[CATALOG_COLL[domain]].update_one({"id": product_id}, {"$set": {"photo": photo, "updated_at": now_iso()}})
        return {"ok": True, "photo": photo}

    # ---------- Kit ----------

    @router.get("/kits")
    async def list_kits(domain: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        q = {"domain": domain} if domain else {}
        return await db.kits.find(q, {"_id": 0}).sort("name", 1).to_list(100)

    @router.post("/kits")
    async def create_kit(data: KitPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if data.domain not in DOMAINS:
            raise HTTPException(status_code=400, detail="Dominio non valido")
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), "name": data.name.strip(), "domain": data.domain,
               "bed_type": data.bed_type, "items": data.items or [], "active": True,
               "version": 1, "notes": data.notes or "", "created_at": now, "updated_at": now}
        await db.kits.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/kits/{kit_id}")
    async def update_kit(kit_id: str, data: KitPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        kit = await db.kits.find_one({"id": kit_id}, {"_id": 0})
        if not kit:
            raise HTTPException(status_code=404, detail="Kit non trovato")
        # Versionamento: snapshot della versione precedente, lo storico non cambia
        await db.kit_versions.insert_one({
            "id": str(uuid.uuid4()), "kit_id": kit_id, "version": kit.get("version", 1),
            "snapshot": kit, "saved_at": now_iso(), "saved_by": current_user.get("name", "")})
        upd = {"name": data.name.strip(), "bed_type": data.bed_type, "items": data.items or [],
               "notes": data.notes or "", "updated_at": now_iso()}
        if data.active is not None:
            upd["active"] = data.active
        await db.kits.update_one({"id": kit_id}, {"$set": upd, "$inc": {"version": 1}})
        return await db.kits.find_one({"id": kit_id}, {"_id": 0})

    @router.get("/kits/{kit_id}/versions")
    async def kit_versions(kit_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        return await db.kit_versions.find({"kit_id": kit_id}, {"_id": 0}).sort("saved_at", -1).to_list(50)

    # ---------- Panoramica ----------

    @router.get("/overview")
    async def overview(current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        today = _deps["local_today"]()
        by_bed = await noleggio_kits()
        by_struct = await upcoming_tasks_by_structure()
        noleggio_gaps = 0
        noleggio_structures = []
        for sid, tasks in by_struct.items():
            stock = await stock_map("noleggio", "structure", sid)
            cov = evaluate_coverage(task_kit_needs(tasks[0], by_bed), stock)
            if not cov["covered"]:
                noleggio_gaps += 1
                noleggio_structures.append({"structure_id": sid, "structure_name": tasks[0].get("structure_name"),
                                            "date": tasks[0]["date"], "missing": cov["missing_items"],
                                            "unconfigured": cov["unconfigured_kits"]})
        supply_rows = await db.stock_levels.find({"domain": "forniture", "threshold_enabled": True}, {"_id": 0}).to_list(1000)
        reintegri = [r for r in supply_rows if r.get("min_qty") is not None and r.get("qty", 0) < r["min_qty"]]
        cleaning_rows = await db.stock_levels.find({"domain": "pulizie", "location_type": "structure",
                                                    "min_qty": {"$ne": None}}, {"_id": 0}).to_list(2000)
        low_by_struct = {}
        for r in cleaning_rows:
            if r.get("location_id") and r.get("qty", 0) < r["min_qty"]:
                low_by_struct[r["location_id"]] = low_by_struct.get(r["location_id"], 0) + 1
        low_structs = {s["id"]: s async for s in db.structures.find(
            {"id": {"$in": list(low_by_struct.keys())}}, {"_id": 0, "id": 1, "name": 1})}
        zaini = await db.zaini.find({}, {"_id": 0, "status": 1}).to_list(200)
        anomalie = await db.segnalazioni.count_documents({"origin_type": "warehouse", "status": {"$nin": ["risolta", "chiusa"]}})
        mov_today = await db.warehouse_movements.count_documents({"at": {"$gte": today}})
        monitored = len(set(list(by_struct.keys()) +
                            [r["location_id"] for r in await db.stock_levels.find({"domain": {"$in": ["forniture", "pulizie"]}, "location_type": "structure"}, {"_id": 0, "location_id": 1}).to_list(2000) if r.get("location_id")]))
        fabb_aperti = await db.fabbisogni.count_documents({"status": "aperta"})
        return {
            "kpi": {
                "structures_monitored": monitored,
                "noleggio_gaps": noleggio_gaps,
                "supply_restock": len(reintegri),
                "cleaning_low_stock": len(low_by_struct),
                "zaini_total": len(zaini),
                "zaini_da_reintegrare": len([z for z in zaini if z["status"] == "da_reintegrare"]),
                "anomalie": anomalie,
                "movements_today": mov_today,
                "fabbisogni_aperti": fabb_aperti,
            },
            "noleggio_alerts": noleggio_structures[:8],
            "supply_alerts": reintegri[:8],
            "cleaning_alerts": [{"structure_id": sid, "name": (low_structs.get(sid) or {}).get("name", "Struttura"),
                                 "missing_count": cnt} for sid, cnt in list(low_by_struct.items())[:8]],
        }

    # ---------- Noleggio Strutture ----------

    @router.get("/noleggio")
    async def noleggio_list(zone_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        by_bed = await noleggio_kits()
        by_struct = await upcoming_tasks_by_structure()
        stock_rows = await db.stock_levels.find({"domain": "noleggio", "location_type": "structure"}, {"_id": 0}).to_list(2000)
        struct_ids = sorted(set([r["location_id"] for r in stock_rows if r.get("location_id")] + list(by_struct.keys())))
        sq = {"id": {"$in": struct_ids}}
        if zone_id:
            sq["operational_zone_id"] = zone_id
        structures = await db.structures.find(sq, {"_id": 0, "id": 1, "name": 1, "klv_code": 1, "client_id": 1, "operational_zone_id": 1}).sort("name", 1).to_list(500)
        client_ids = [s.get("client_id") for s in structures if s.get("client_id")]
        clients = {c["id"]: c async for c in db.clients.find({"id": {"$in": client_ids}}, {"_id": 0})}
        out = []
        for s in structures:
            stock = {r["product_id"]: r for r in stock_rows if r.get("location_id") == s["id"]}
            tasks = by_struct.get(s["id"], [])
            cov = evaluate_coverage(task_kit_needs(tasks[0], by_bed), stock) if tasks else None
            cl = clients.get(s.get("client_id"))
            out.append({
                "structure_id": s["id"], "structure_name": s["name"], "klv_code": s.get("klv_code"),
                "client_name": _deps["get_client_display_name"](cl) if cl else None,
                "zone_id": s.get("operational_zone_id"),
                "total_items": sum(r.get("qty", 0) for r in stock.values()),
                "next_need": {"date": tasks[0]["date"], "coverage": cov} if tasks else None,
                "last_check": None,
            })
        return out

    @router.get("/noleggio/{structure_id}")
    async def noleggio_detail(structure_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        s = await structure_label(structure_id)
        by_bed = await noleggio_kits()
        stock = await stock_map("noleggio", "structure", structure_id)
        catalog = await db.rental_catalog.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(200)
        items = [{"product_id": p["id"], "name": p["name"], "unit": p.get("unit", "pz"),
                  "qty": (stock.get(p["id"]) or {}).get("qty", 0), "photo": p.get("photo")} for p in catalog]
        tasks = (await upcoming_tasks_by_structure(structure_id)).get(structure_id, [])
        needs = []
        for t in tasks[:10]:
            cov = evaluate_coverage(task_kit_needs(t, by_bed), stock)
            needs.append({"task_id": t["id"], "date": t["date"], "scheduled_time": t.get("scheduled_time"),
                          "beds": {"double": t.get("beds_double") or 0, "single": t.get("beds_single") or 0,
                                   "sofa": t.get("beds_sofa") or 0}, "coverage": cov})
        movements = await db.warehouse_movements.find({"domain": "noleggio", "structure_id": structure_id}, {"_id": 0}) \
            .sort("at", -1).to_list(30)
        richieste = await db.fabbisogni.find({"structure_id": structure_id, "kind": "noleggio", "status": "aperta"}, {"_id": 0}).to_list(20)
        cl = await db.clients.find_one({"id": s.get("client_id")}, {"_id": 0}) if s.get("client_id") else None
        return {"structure": {**s, "client_name": _deps["get_client_display_name"](cl) if cl else None},
                "items": items, "upcoming_needs": needs, "movements": movements, "open_requests": richieste}

    # ---------- Forniture / Consumabili ----------

    @router.get("/forniture")
    async def forniture_list(zone_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        rows = await db.stock_levels.find({"domain": "forniture", "location_type": "structure"}, {"_id": 0}).to_list(2000)
        struct_ids = sorted(set(r["location_id"] for r in rows if r.get("location_id")))
        sq = {"id": {"$in": struct_ids}}
        if zone_id:
            sq["operational_zone_id"] = zone_id
        structures = await db.structures.find(sq, {"_id": 0, "id": 1, "name": 1, "klv_code": 1, "client_id": 1}).sort("name", 1).to_list(500)
        client_ids = [s.get("client_id") for s in structures if s.get("client_id")]
        clients = {c["id"]: c async for c in db.clients.find({"id": {"$in": client_ids}}, {"_id": 0})}
        out = []
        for s in structures:
            mine = [r for r in rows if r.get("location_id") == s["id"]]
            below = [r for r in mine if r.get("threshold_enabled") and r.get("min_qty") is not None and r.get("qty", 0) < r["min_qty"]]
            cl = clients.get(s.get("client_id"))
            out.append({"structure_id": s["id"], "structure_name": s["name"], "klv_code": s.get("klv_code"),
                        "client_name": _deps["get_client_display_name"](cl) if cl else None,
                        "items_count": len(mine), "below_min": len(below),
                        "restock_qty": sum(max(0, (r.get("ideal_qty") or r.get("min_qty") or 0) - r.get("qty", 0)) for r in below)})
        return out

    @router.get("/forniture/{structure_id}")
    async def forniture_detail(structure_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        s = await structure_label(structure_id)
        stock = await stock_map("forniture", "structure", structure_id)
        catalog = {p["id"]: p async for p in db.supply_catalog.find({}, {"_id": 0})}
        cfg = await _deps["get_effective_config"](structure_id)
        items = []
        for pid, r in sorted(stock.items(), key=lambda kv: (catalog.get(kv[0]) or {}).get("name", "")):
            p = catalog.get(pid) or {"name": "Prodotto rimosso"}
            resp = None
            cat_key = p.get("resp_category") or _deps["suggest_category"]("missing", p.get("name", ""))
            if cat_key:
                resp = _deps["resolve_responsibility"](cfg, cat_key, p.get("name", ""))
            below = r.get("threshold_enabled") and r.get("min_qty") is not None and r.get("qty", 0) < r["min_qty"]
            items.append({
                "product_id": pid, "name": p.get("name"), "unit": p.get("unit", "pz"), "photo": p.get("photo"),
                "qty": r.get("qty", 0), "min_qty": r.get("min_qty"), "ideal_qty": r.get("ideal_qty"),
                "threshold_enabled": bool(r.get("threshold_enabled")),
                "below_min": bool(below),
                "suggested_restock": max(0, (r.get("ideal_qty") or r.get("min_qty") or 0) - r.get("qty", 0)) if below else 0,
                "responsibility": resp,
            })
        movements = await db.warehouse_movements.find({"domain": "forniture", "structure_id": structure_id}, {"_id": 0}).sort("at", -1).to_list(30)
        richieste = await db.fabbisogni.find({"structure_id": structure_id, "kind": "fornitura", "status": "aperta"}, {"_id": 0}).to_list(20)
        # Storico fotografico: stesse foto magazzino caricate a fine Pulizia (stesso media record)
        photos = []
        tasks = await db.cleaning_tasks.find({"structure_id": structure_id, "media.media_type": "warehouse_photo"},
                                             {"_id": 0, "date": 1, "media": 1, "cleaner_name": 1}).sort("date", -1).to_list(15)
        for t in tasks:
            for m in t.get("media", []):
                if m.get("media_type") == "warehouse_photo":
                    photos.append({"id": m.get("id"), "kind": "image", "file_path": m.get("file_path"),
                                   "date": t.get("date"), "uploaded_by_name": m.get("uploaded_by_name") or t.get("cleaner_name")})
        cl = await db.clients.find_one({"id": s.get("client_id")}, {"_id": 0}) if s.get("client_id") else None
        return {"structure": {**s, "client_name": _deps["get_client_display_name"](cl) if cl else None},
                "items": items, "movements": movements, "open_requests": richieste, "photos": photos[:20]}

    @router.put("/forniture/{structure_id}/items")
    async def configure_supply_item(structure_id: str, data: SupplyItemConfig, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        p = await get_product("forniture", data.product_id)
        if not p:
            raise HTTPException(status_code=404, detail="Prodotto non trovato")
        key = {"domain": "forniture", "location_type": "structure", "location_id": structure_id, "product_id": data.product_id}
        upd = {"updated_at": now_iso()}
        if data.min_qty is not None:
            upd["min_qty"] = data.min_qty
        if data.ideal_qty is not None:
            upd["ideal_qty"] = data.ideal_qty
        if data.threshold_enabled is not None:
            upd["threshold_enabled"] = data.threshold_enabled
        await db.stock_levels.update_one(key, {"$set": upd, "$setOnInsert": {"id": str(uuid.uuid4()), "qty": 0}}, upsert=True)
        return {"ok": True}

    # ---------- Magazzino Pulizie ----------

    @router.get("/pulizie")
    async def pulizie_list(zone_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        rows = await db.stock_levels.find({"domain": "pulizie", "location_type": "structure"}, {"_id": 0}).to_list(2000)
        struct_ids = sorted(set(r["location_id"] for r in rows if r.get("location_id")))
        sq = {"id": {"$in": struct_ids}}
        if zone_id:
            sq["operational_zone_id"] = zone_id
        structures = await db.structures.find(sq, {"_id": 0, "id": 1, "name": 1, "klv_code": 1, "client_id": 1}).sort("name", 1).to_list(500)
        client_ids = [s.get("client_id") for s in structures if s.get("client_id")]
        clients = {c["id"]: c async for c in db.clients.find({"id": {"$in": client_ids}}, {"_id": 0})}
        out = []
        for s in structures:
            mine = [r for r in rows if r.get("location_id") == s["id"]]
            low = [r for r in mine if r.get("min_qty") is not None and r.get("qty", 0) < r["min_qty"]]
            cl = clients.get(s.get("client_id"))
            out.append({"structure_id": s["id"], "structure_name": s["name"], "klv_code": s.get("klv_code"),
                        "client_name": _deps["get_client_display_name"](cl) if cl else None,
                        "items_count": len(mine), "missing_count": len(low),
                        "missing_qty": sum(max(0, (r.get("min_qty") or 0) - r.get("qty", 0)) for r in low)})
        return out

    @router.get("/pulizie/{structure_id}")
    async def pulizie_detail(structure_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        s = await structure_label(structure_id)
        stock = await stock_map("pulizie", "structure", structure_id)
        catalog = {p["id"]: p async for p in db.cleaning_catalog.find({}, {"_id": 0})}
        items = []
        for pid, r in sorted(stock.items(), key=lambda kv: (catalog.get(kv[0]) or {}).get("name", "")):
            p = catalog.get(pid) or {"name": "Prodotto rimosso"}
            below = r.get("min_qty") is not None and r.get("qty", 0) < r["min_qty"]
            items.append({
                "product_id": pid, "name": p.get("name"), "type": p.get("type"),
                "unit": p.get("unit", "pz"), "photo": p.get("photo"),
                "qty": r.get("qty", 0), "min_qty": r.get("min_qty"),
                "below_min": bool(below),
                "missing": max(0, (r.get("min_qty") or 0) - r.get("qty", 0)) if below else 0,
            })
        movements = await db.warehouse_movements.find({"domain": "pulizie", "structure_id": structure_id}, {"_id": 0}).sort("at", -1).to_list(30)
        richieste = await db.fabbisogni.find({"structure_id": structure_id, "kind": "pulizie", "status": "aperta"}, {"_id": 0}).to_list(20)
        cl = await db.clients.find_one({"id": s.get("client_id")}, {"_id": 0}) if s.get("client_id") else None
        return {"structure": {**s, "client_name": _deps["get_client_display_name"](cl) if cl else None},
                "items": items, "movements": movements, "open_requests": richieste}

    @router.put("/pulizie/{structure_id}/items")
    async def configure_cleaning_item(structure_id: str, data: CleaningItemConfig, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        p = await get_product("pulizie", data.product_id)
        if not p:
            raise HTTPException(status_code=404, detail="Prodotto non trovato")
        key = {"domain": "pulizie", "location_type": "structure", "location_id": structure_id, "product_id": data.product_id}
        upd = {"updated_at": now_iso()}
        if data.min_qty is not None:
            upd["min_qty"] = data.min_qty
        await db.stock_levels.update_one(key, {"$set": upd, "$setOnInsert": {"id": str(uuid.uuid4()), "qty": 0}}, upsert=True)
        return {"ok": True}

    # ---------- Zaini ----------

    @router.get("/zaini")
    async def zaini_list(current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        zaini = await db.zaini.find({}, {"_id": 0}).sort("code", 1).to_list(200)
        for z in zaini:
            z["missing_count"] = len(await _zaino_missing(z))
        return zaini

    @router.get("/zaini/mine")
    async def my_zaino(current_user: dict = Depends(get_current_user)):
        z = await db.zaini.find_one({"assigned_to": current_user["id"]}, {"_id": 0})
        if not z:
            return None
        return await _zaino_full(z)

    @router.post("/zaini")
    async def create_zaino(data: ZainoCreate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        seq_doc = await db.app_settings.find_one_and_update(
            {"_id": "zaino_seq"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
        seq = (seq_doc or {}).get("seq", 1)
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), "code": f"KLV-Z{seq:03d}", "name": data.name or "",
               "assigned_to": None, "assigned_to_name": None, "status": "disponibile",
               "assigned_at": None, "last_check_at": None, "notes": data.notes or "",
               "kit_id": data.kit_id, "overrides": [], "tracker_id": None,
               "assignment_history": [], "created_at": now, "updated_at": now}
        await db.zaini.insert_one(doc)
        doc.pop("_id", None)
        return doc

    async def _zaino_expected(z: dict) -> List[dict]:
        expected = {}
        # Dotazione standard: gli articoli "da zaino" del catalogo devono esserci sempre
        std = await db.cleaning_catalog.find({"active": True, "standard_location": "zaino"}, {"_id": 0}).to_list(200)
        for p in std:
            expected[p["id"]] = {"product_id": p["id"], "name": p["name"], "qty": 1,
                                 "photo": p.get("photo"), "source": "standard"}
        if z.get("kit_id"):
            kit = await db.kits.find_one({"id": z["kit_id"]}, {"_id": 0})
            for it in (kit or {}).get("items") or []:
                p = await get_product("pulizie", it["product_id"])
                expected[it["product_id"]] = {"product_id": it["product_id"],
                                              "name": it.get("name") or (p or {}).get("name", ""),
                                              "qty": it["qty"], "photo": (p or {}).get("photo"), "source": "kit"}
        for ov in z.get("overrides") or []:
            if ov.get("qty", 0) <= 0:
                expected.pop(ov["product_id"], None)
            else:
                p = await get_product("pulizie", ov["product_id"])
                expected[ov["product_id"]] = {"product_id": ov["product_id"],
                                              "name": ov.get("name") or (p or {}).get("name", ""),
                                              "qty": ov["qty"], "photo": (p or {}).get("photo"), "source": "override"}
        return list(expected.values())

    async def _zaino_missing(z: dict) -> List[dict]:
        expected = await _zaino_expected(z)
        stock = await stock_map("pulizie", "zaino", z["id"])
        missing = []
        for e in expected:
            have = (stock.get(e["product_id"]) or {}).get("qty", 0)
            if have < e["qty"]:
                missing.append({**e, "present": have, "missing": e["qty"] - have})
        return missing

    async def _zaino_full(z: dict) -> dict:
        expected = await _zaino_expected(z)
        stock = await stock_map("pulizie", "zaino", z["id"])
        rows = []
        seen = set()
        for e in expected:
            have = (stock.get(e["product_id"]) or {}).get("qty", 0)
            rows.append({**e, "present": have, "missing": max(0, e["qty"] - have)})
            seen.add(e["product_id"])
        for pid, r in stock.items():
            if pid not in seen and r.get("qty", 0) != 0:
                p = await get_product("pulizie", pid)
                rows.append({"product_id": pid, "name": (p or {}).get("name", "Prodotto"), "qty": None,
                             "photo": (p or {}).get("photo"),
                             "present": r.get("qty", 0), "missing": 0, "extra": True})
        movements = await db.warehouse_movements.find({"zaino_id": z["id"]}, {"_id": 0}).sort("at", -1).to_list(30)
        return {**z, "dotation": rows, "missing_items": [r for r in rows if r.get("missing", 0) > 0],
                "movements": movements}

    @router.get("/zaini/{zaino_id}")
    async def zaino_detail(zaino_id: str, current_user: dict = Depends(get_current_user)):
        z = await db.zaini.find_one({"id": zaino_id}, {"_id": 0})
        if not z:
            raise HTTPException(status_code=404, detail="Zaino non trovato")
        if not is_ops_user(current_user) and z.get("assigned_to") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        return await _zaino_full(z)

    @router.put("/zaini/{zaino_id}")
    async def update_zaino(zaino_id: str, data: ZainoUpdate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        z = await db.zaini.find_one({"id": zaino_id}, {"_id": 0})
        if not z:
            raise HTTPException(status_code=404, detail="Zaino non trovato")
        upd = {"updated_at": now_iso()}
        now = now_iso()
        if data.name is not None:
            upd["name"] = data.name
        if data.notes is not None:
            upd["notes"] = data.notes
        if data.kit_id is not None:
            upd["kit_id"] = data.kit_id or None
        if data.overrides is not None:
            upd["overrides"] = data.overrides
        if data.assigned_to is not None:
            history = z.get("assignment_history") or []
            if z.get("assigned_to") and history and history[-1].get("to") is None:
                history[-1]["to"] = now
            if data.assigned_to:
                u = await db.users.find_one({"id": data.assigned_to}, {"_id": 0, "id": 1, "name": 1})
                if not u:
                    raise HTTPException(status_code=404, detail="Utente non trovato")
                upd["assigned_to"] = u["id"]
                upd["assigned_to_name"] = u.get("name", "")
                upd["assigned_at"] = now
                upd["status"] = "assegnato"
                history.append({"user_id": u["id"], "name": u.get("name", ""), "from": now, "to": None,
                                "by": current_user.get("name", "")})
            else:
                upd["assigned_to"] = None
                upd["assigned_to_name"] = None
                upd["assigned_at"] = None
                upd["status"] = "disponibile"
            upd["assignment_history"] = history
        if data.status is not None:
            if data.status not in ZAINO_STATUSES:
                raise HTTPException(status_code=400, detail="Stato non valido")
            upd["status"] = data.status
        await db.zaini.update_one({"id": zaino_id}, {"$set": upd})
        z2 = await db.zaini.find_one({"id": zaino_id}, {"_id": 0})
        return await _zaino_full(z2)

    @router.post("/zaini/{zaino_id}/check")
    async def check_zaino(zaino_id: str, data: CheckPayload, current_user: dict = Depends(get_current_user)):
        z = await db.zaini.find_one({"id": zaino_id}, {"_id": 0})
        if not z:
            raise HTTPException(status_code=404, detail="Zaino non trovato")
        if not is_ops_user(current_user) and z.get("assigned_to") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        stock = await stock_map("pulizie", "zaino", zaino_id)
        adjustments = []
        for c in data.counts:
            pid = c.get("product_id")
            counted = int(c.get("counted", 0))
            current = (stock.get(pid) or {}).get("qty", 0)
            if counted != current:
                p = await get_product("pulizie", pid) or {"id": pid, "name": "Prodotto"}
                mov = await apply_movement(
                    domain="pulizie", movement_type="rettifica_inventario", product=p,
                    qty=abs(counted - current),
                    origin={"type": "zaino", "id": zaino_id, "label": z["code"]} if counted < current else {"type": "external", "label": "Rettifica"},
                    destination={"type": "zaino", "id": zaino_id, "label": z["code"]} if counted > current else {"type": "external", "label": "Rettifica"},
                    user=current_user, note=f"Controllo zaino: sistema {current}, contati {counted}",
                    zaino_id=zaino_id)
                adjustments.append(mov)
        missing = await _zaino_missing({**z})
        new_status = z["status"]
        if missing and z["status"] in ("assegnato", "disponibile", "da_reintegrare"):
            new_status = "da_reintegrare" if z.get("assigned_to") else z["status"]
        elif not missing and z["status"] == "da_reintegrare":
            new_status = "assegnato" if z.get("assigned_to") else "disponibile"
        await db.zaini.update_one({"id": zaino_id}, {"$set": {"last_check_at": now_iso(), "status": new_status, "updated_at": now_iso()}})
        return {"adjustments": len(adjustments), "missing_items": missing, "status": new_status}

    @router.post("/zaini/{zaino_id}/reintegro")
    async def reintegro_zaino(zaino_id: str, data: ReintegroPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        z = await db.zaini.find_one({"id": zaino_id}, {"_id": 0})
        if not z:
            raise HTTPException(status_code=404, detail="Zaino non trovato")
        movs = []
        for it in data.items:
            qty = int(it.get("qty", 0))
            if qty <= 0:
                continue
            p = await get_product("pulizie", it["product_id"])
            if not p:
                continue
            mov = await apply_movement(
                domain="pulizie", movement_type="reintegro_zaino", product=p, qty=qty,
                origin={"type": "external", "label": "Acquisto / Scorta"},
                destination={"type": "zaino", "id": zaino_id, "label": z["code"]},
                user=current_user, note="Reintegro zaino", zaino_id=zaino_id)
            movs.append(mov)
        missing = await _zaino_missing(z)
        if not missing:
            new_status = "assegnato" if z.get("assigned_to") else "disponibile"
            await db.zaini.update_one({"id": zaino_id}, {"$set": {"status": new_status, "updated_at": now_iso()}})
        await db.fabbisogni.update_many({"zaino_id": zaino_id, "kind": "zaino", "status": "aperta"},
                                        {"$set": {"status": "evasa", "updated_at": now_iso()}})
        return {"movements": len(movs), "missing_items": missing}

    # ---------- Movimenti ----------

    @router.get("/movimenti")
    async def list_movements(
        domain: Optional[str] = None, movement_type: Optional[str] = None,
        structure_id: Optional[str] = None, zaino_id: Optional[str] = None,
        product: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None,
        page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
        current_user: dict = Depends(get_current_user),
    ):
        require_ops(current_user)
        q = {}
        if domain:
            q["domain"] = domain
        if movement_type:
            q["movement_type"] = movement_type
        if structure_id:
            q["structure_id"] = structure_id
        if zaino_id:
            q["zaino_id"] = zaino_id
        if product:
            q["product_name"] = {"$regex": product, "$options": "i"}
        if date_from or date_to:
            rng = {}
            if date_from:
                rng["$gte"] = date_from
            if date_to:
                rng["$lte"] = date_to + "T23:59:59"
            q["at"] = rng
        total = await db.warehouse_movements.count_documents(q)
        items = await db.warehouse_movements.find(q, {"_id": 0}).sort("at", -1).skip((page - 1) * limit).limit(limit).to_list(limit)
        return {"items": items, "total": total}

    @router.post("/movimenti")
    async def create_movement(data: MovementCreate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if data.domain not in DOMAINS:
            raise HTTPException(status_code=400, detail="Dominio non valido")
        if data.movement_type not in MOVEMENT_TYPES:
            raise HTTPException(status_code=400, detail="Tipo movimento non valido")
        if data.qty <= 0:
            raise HTTPException(status_code=400, detail="Quantità non valida")
        p = await get_product(data.domain, data.product_id)
        if not p:
            raise HTTPException(status_code=404, detail="Prodotto non trovato")
        origin = data.origin or {"type": "external", "label": "Esterno"}
        destination = data.destination or {"type": "external", "label": "Esterno"}
        for loc in (origin, destination):
            if loc.get("type") == "structure" and loc.get("id"):
                s = await structure_label(loc["id"])
                loc["label"] = s.get("name")
            if loc.get("type") == "zaino" and loc.get("id"):
                zz = await db.zaini.find_one({"id": loc["id"]}, {"_id": 0, "code": 1})
                loc["label"] = (zz or {}).get("code", "Zaino")
            if loc.get("type") == "central":
                loc["label"] = "Magazzino Pulizie" if data.domain == "pulizie" else "Magazzino centrale"
        mov = await apply_movement(
            domain=data.domain, movement_type=data.movement_type, product=p, qty=data.qty,
            origin=origin, destination=destination, user=current_user, note=data.note or "",
            structure_id=origin.get("id") if origin.get("type") == "structure" else destination.get("id") if destination.get("type") == "structure" else None,
            zaino_id=origin.get("id") if origin.get("type") == "zaino" else destination.get("id") if destination.get("type") == "zaino" else None)
        return mov

    @router.post("/movimenti/{movement_id}/storno")
    async def storno_movement(movement_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        mov = await db.warehouse_movements.find_one({"id": movement_id}, {"_id": 0})
        if not mov:
            raise HTTPException(status_code=404, detail="Movimento non trovato")
        if mov.get("reversed_by"):
            raise HTTPException(status_code=400, detail="Movimento già stornato")
        p = await get_product(mov["domain"], mov["product_id"]) or {"id": mov["product_id"], "name": mov["product_name"]}
        inverse = await apply_movement(
            domain=mov["domain"], movement_type="annullamento", product=p, qty=mov["qty"],
            origin=mov["destination"], destination=mov["origin"], user=current_user,
            note=f"Storno movimento del {mov['at'][:16]}", structure_id=mov.get("structure_id"),
            zaino_id=mov.get("zaino_id"), reverses=movement_id)
        await db.warehouse_movements.update_one({"id": movement_id}, {"$set": {"reversed_by": inverse["id"]}})
        return inverse

    # ---------- Inventario ----------

    @router.post("/inventario")
    async def do_inventory(data: InventoryPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if data.domain not in DOMAINS or data.location_type not in LOCATION_TYPES:
            raise HTTPException(status_code=400, detail="Parametri non validi")
        if data.domain == "pulizie" and data.location_type == "central":
            raise HTTPException(status_code=400, detail="Il magazzino pulizie centrale non esiste: usa una casa o uno zaino")
        stock = await stock_map(data.domain, data.location_type, data.location_id)
        label = {"central": "Magazzino Pulizie", "structure": None, "zaino": None}.get(data.location_type)
        if data.location_type == "structure" and data.location_id:
            label = (await structure_label(data.location_id)).get("name")
        if data.location_type == "zaino" and data.location_id:
            zz = await db.zaini.find_one({"id": data.location_id}, {"_id": 0, "code": 1})
            label = (zz or {}).get("code")
        adjustments = []
        for c in data.counts:
            pid = c.get("product_id")
            counted = int(c.get("counted", 0))
            current = (stock.get(pid) or {}).get("qty", 0)
            if counted == current:
                continue
            p = await get_product(data.domain, pid) or {"id": pid, "name": "Prodotto"}
            loc = {"type": data.location_type, "id": data.location_id, "label": label}
            mov = await apply_movement(
                domain=data.domain, movement_type="rettifica_inventario", product=p,
                qty=abs(counted - current),
                origin=loc if counted < current else {"type": "external", "label": "Rettifica"},
                destination=loc if counted > current else {"type": "external", "label": "Rettifica"},
                user=current_user,
                note=(data.note or "") + f" | Inventario: sistema {current}, contati {counted}",
                structure_id=data.location_id if data.location_type == "structure" else None,
                zaino_id=data.location_id if data.location_type == "zaino" else None)
            adjustments.append({"product_id": pid, "from": current, "to": counted, "movement_id": mov["id"]})
        return {"adjustments": adjustments}

    # ---------- Fabbisogni / Richieste operative ----------

    @router.get("/fabbisogni")
    async def list_fabbisogni(status: Optional[str] = None, kind: Optional[str] = None,
                              current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        q = {}
        if status:
            q["status"] = status
        if kind:
            q["kind"] = kind
        return await db.fabbisogni.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)

    @router.post("/fabbisogni")
    async def create_fabbisogno(data: FabbisognoCreate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if data.kind not in ("noleggio", "fornitura", "zaino", "pulizie"):
            raise HTTPException(status_code=400, detail="Tipo non valido")
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), "kind": data.kind, "structure_id": data.structure_id,
               "zaino_id": data.zaino_id, "items": data.items, "date_needed": data.date_needed,
               "responsibility": data.responsibility, "status": "aperta", "note": data.note or "",
               "cleaning_task_id": data.cleaning_task_id,
               "created_by": current_user["id"], "created_by_name": current_user.get("name", ""),
               "created_at": now, "updated_at": now,
               "structure_name": None, "klv_code": None, "client_id": None, "zaino_code": None}
        if data.structure_id:
            s = await structure_label(data.structure_id)
            doc.update({"structure_name": s.get("name"), "klv_code": s.get("klv_code"), "client_id": s.get("client_id")})
        if data.zaino_id:
            zz = await db.zaini.find_one({"id": data.zaino_id}, {"_id": 0, "code": 1})
            doc["zaino_code"] = (zz or {}).get("code")
            await db.zaini.update_one({"id": data.zaino_id}, {"$set": {"status": "da_reintegrare", "updated_at": now}})
        await db.fabbisogni.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @router.put("/fabbisogni/{fab_id}")
    async def update_fabbisogno(fab_id: str, data: FabbisognoUpdate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if data.status not in ("aperta", "in_consegna", "evasa", "annullata"):
            raise HTTPException(status_code=400, detail="Stato non valido")
        r = await db.fabbisogni.update_one({"id": fab_id}, {"$set": {"status": data.status, "updated_at": now_iso()}})
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Richiesta non trovata")
        return await db.fabbisogni.find_one({"id": fab_id}, {"_id": 0})

    return router
