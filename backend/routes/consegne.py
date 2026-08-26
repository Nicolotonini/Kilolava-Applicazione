"""Consegne — centro logistico Kilolava: richieste logistiche e fermate.

CONSEGNA = operazione logistica. MOVIMENTO = variazione stock (generato al completamento).
Le richieste logistiche vivono nella collection `fabbisogni` (unico concetto, niente doppioni).
Le fermate vivono nella collection `logistics_tasks` (estese con lines/richiesta_ids/movement_ids).
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from core.database import db
from core.utils import now_iso
from routes.magazzino import apply_movement, get_product, stock_map

_deps = {}

KIND_DOMAIN = {"noleggio": "noleggio", "fornitura": "forniture", "pulizie": "pulizie", "zaino": "pulizie"}
KIND_LABELS = {"noleggio": "Lavanderia a Noleggio", "fornitura": "Forniture", "pulizie": "Kit Pulizie",
               "zaino": "Zaino", "lavanderia_privata": "Lavanderia Privata",
               "manutenzione": "Materiale Manutenzione", "manuale": "Manuale"}
ACTIVE = ["unassigned", "assigned", "in_progress", "problem"]


def init_consegne_deps(**kwargs):
    _deps.update(kwargs)


async def migrate_fermate():
    """Le consegne legacy diventano Fermate: aggiunge lines/richiesta_ids senza perdere nulla."""
    async for t in db.logistics_tasks.find({"lines": {"$exists": False}}, {"_id": 0, "id": 1, "items": 1}):
        items = [{"name": it.get("article_name") or it.get("article_id") or "Articolo", "qty": it.get("quantity", 1)}
                 for it in (t.get("items") or [])]
        lines = [{"category": "altro", "richiesta_id": None, "items": items}] if items else []
        await db.logistics_tasks.update_one({"id": t["id"]}, {"$set": {
            "lines": lines, "richiesta_ids": [], "movement_ids": [], "priority": "normal"}})


class RichiestaCreate(BaseModel):
    structure_id: Optional[str] = None
    client_id: Optional[str] = None
    destination_label: Optional[str] = None
    items: List[dict]
    date_needed: Optional[str] = None
    time_window: Optional[str] = None
    priority: str = "normal"
    note: Optional[str] = None


class FermataCreate(BaseModel):
    richiesta_ids: List[str] = []
    date: str
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    rider_id: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None


class FermataUpdate(BaseModel):
    date: Optional[str] = None
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    rider_id: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class AggiungiRichiesta(BaseModel):
    richiesta_id: str


class RouteOrderPayload(BaseModel):
    rider_id: str
    date: str
    ordered_ids: List[str]


class ProblemaPayload(BaseModel):
    note: str


class CompletaPayload(BaseModel):
    note: Optional[str] = None
    effective_items: Optional[List[dict]] = None


def create_consegne_router(get_current_user, is_ops_user):
    router = APIRouter(tags=["consegne"])

    def require_ops(user):
        if not is_ops_user(user):
            raise HTTPException(status_code=403, detail="Non autorizzato")

    # ---------- Richieste logistiche ----------

    async def _laundry_info(f: dict):
        if f.get("kind") != "lavanderia_privata" or not f.get("source_id"):
            return None
        job = await db.laundry_jobs.find_one({"id": f["source_id"]}, {"_id": 0, "final_weight_kg": 1, "scale_photo": 1, "status": 1})
        if not job:
            return None
        return {"job_id": f["source_id"], "weight_kg": job.get("final_weight_kg"),
                "weighed": bool(job.get("final_weight_kg")), "has_scale_photo": bool(job.get("scale_photo")),
                "consegnabile": bool(job.get("final_weight_kg") and job.get("scale_photo"))}

    async def _availability(f: dict):
        domain = KIND_DOMAIN.get(f.get("kind"))
        if not domain:
            return None, True
        central = await stock_map(domain, "central", None)
        avail, ok = [], True
        for it in f.get("items") or []:
            have = (central.get(it["product_id"]) or {}).get("qty", 0) if it.get("product_id") else None
            item_ok = True if have is None else have >= it.get("qty", 0)
            ok = ok and item_ok
            avail.append({"name": it.get("name"), "qty": it.get("qty"), "central": have, "ok": item_ok})
        return avail, ok

    async def _enrich_richiesta(f: dict) -> dict:
        out = dict(f)
        out["kind_label"] = KIND_LABELS.get(f.get("kind"), f.get("kind"))
        out["destination"] = f.get("structure_name") or f.get("zaino_code") or f.get("destination_label") or f.get("client_name") or "—"
        if f.get("client_id") and not out.get("client_name"):
            c = await db.clients.find_one({"id": f["client_id"]}, {"_id": 0})
            out["client_name"] = _deps["get_client_display_name"](c) if c else None
        out["laundry"] = await _laundry_info(f)
        out["availability"], out["stock_ok"] = await _availability(f)
        return out

    @router.get("/richieste")
    async def list_richieste(status: Optional[str] = None, kind: Optional[str] = None,
                             current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        q = {"status": status} if status else {"status": {"$in": ["aperta", "in_consegna"]}}
        if kind:
            q["kind"] = kind
        rows = await db.fabbisogni.find(q, {"_id": 0}).sort([("date_needed", 1), ("created_at", 1)]).to_list(500)
        return [await _enrich_richiesta(f) for f in rows]

    @router.post("/richieste")
    async def create_richiesta(data: RichiestaCreate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        if not data.items:
            raise HTTPException(status_code=400, detail="Inserisci almeno un articolo")
        now = now_iso()
        doc = {"id": str(uuid.uuid4()), "kind": "manuale", "structure_id": data.structure_id,
               "structure_name": None, "klv_code": None, "zaino_id": None, "zaino_code": None,
               "client_id": data.client_id, "client_name": None,
               "destination_label": data.destination_label,
               "items": data.items, "date_needed": data.date_needed, "time_window": data.time_window,
               "priority": data.priority if data.priority in ("low", "normal", "high", "urgent") else "normal",
               "status": "aperta", "note": data.note or "", "source": {"type": "manuale"}, "source_id": None,
               "fermata_id": None, "created_by": current_user["id"], "created_by_name": current_user.get("name", ""),
               "created_at": now, "updated_at": now}
        if data.structure_id:
            s = await db.structures.find_one({"id": data.structure_id}, {"_id": 0, "name": 1, "klv_code": 1, "client_id": 1})
            if s:
                doc.update({"structure_name": s["name"], "klv_code": s.get("klv_code"),
                            "client_id": doc["client_id"] or s.get("client_id")})
        if doc.get("client_id"):
            c = await db.clients.find_one({"id": doc["client_id"]}, {"_id": 0})
            doc["client_name"] = _deps["get_client_display_name"](c) if c else None
        await db.fabbisogni.insert_one(doc)
        doc.pop("_id", None)
        return await _enrich_richiesta(doc)

    @router.get("/proposte")
    async def proposte(current_user: dict = Depends(get_current_user)):
        """Raggruppa le richieste aperte per destinazione: una fermata proposta per visita fisica."""
        require_ops(current_user)
        rows = await db.fabbisogni.find({"status": "aperta"}, {"_id": 0}).sort("created_at", 1).to_list(500)
        prio_rank = {"low": 0, "normal": 1, "high": 2, "urgent": 3}
        groups = {}
        for f in rows:
            key = f.get("structure_id") or f.get("zaino_id") or f.get("client_id") or f.get("destination_label") or f["id"]
            g = groups.setdefault(key, {
                "key": key, "structure_id": f.get("structure_id"), "zaino_id": f.get("zaino_id"),
                "client_id": f.get("client_id"), "klv_code": f.get("klv_code"),
                "destination": f.get("structure_name") or f.get("zaino_code") or f.get("destination_label") or f.get("client_name") or "—",
                "richieste": [], "kinds": [], "priority": "low", "date_needed": None})
            g["richieste"].append(await _enrich_richiesta(f))
            if f.get("kind") not in g["kinds"]:
                g["kinds"].append(f.get("kind"))
            if prio_rank.get(f.get("priority", "normal"), 1) > prio_rank.get(g["priority"], 0):
                g["priority"] = f.get("priority", "normal")
            if f.get("date_needed") and (not g["date_needed"] or f["date_needed"] < g["date_needed"]):
                g["date_needed"] = f["date_needed"]
        out = list(groups.values())
        for g in out:
            g["kind_labels"] = [KIND_LABELS.get(k, k) for k in g["kinds"]]
        out.sort(key=lambda g: (-prio_rank.get(g["priority"], 1), g["date_needed"] or "9999"))
        return out

    @router.put("/richieste/{richiesta_id}/annulla")
    async def annulla_richiesta(richiesta_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        f = await db.fabbisogni.find_one({"id": richiesta_id}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail="Richiesta non trovata")
        if f.get("status") == "evasa":
            raise HTTPException(status_code=400, detail="Richiesta già evasa")
        now = now_iso()
        if f.get("status") == "in_consegna" and f.get("fermata_id"):
            await db.logistics_tasks.update_one({"id": f["fermata_id"]}, {
                "$pull": {"lines": {"richiesta_id": richiesta_id}, "richiesta_ids": richiesta_id},
                "$set": {"updated_at": now}})
        await db.fabbisogni.update_one({"id": richiesta_id},
                                       {"$set": {"status": "annullata", "fermata_id": None, "updated_at": now}})
        return {"ok": True}

    # ---------- Fermate ----------

    async def _enrich_fermata(t: dict) -> dict:
        out = dict(t)
        out.pop("items", None)
        if t.get("structure_id") and not out.get("structure_name"):
            s = await db.structures.find_one({"id": t["structure_id"]}, {"_id": 0, "name": 1, "klv_code": 1})
            out["structure_name"] = (s or {}).get("name")
            out["klv_code"] = (s or {}).get("klv_code")
        if t.get("client_id") and not out.get("client_name"):
            c = await db.clients.find_one({"id": t["client_id"]}, {"_id": 0})
            out["client_name"] = _deps["get_client_display_name"](c) if c else None
        if t.get("rider_id") and not out.get("rider_name"):
            r = await db.users.find_one({"id": t["rider_id"]}, {"_id": 0, "name": 1})
            out["rider_name"] = (r or {}).get("name")
        out["destination"] = out.get("structure_name") or t.get("destination_label") or out.get("client_name") or "—"
        for line in out.get("lines") or []:
            line["category_label"] = KIND_LABELS.get(line.get("category"), line.get("category", "Altro").title())
        return out

    async def _laundry_gate(f: dict):
        if f.get("kind") != "lavanderia_privata":
            return
        job = await db.laundry_jobs.find_one({"id": f.get("source_id")}, {"_id": 0, "final_weight_kg": 1, "scale_photo": 1})
        if not job or not job.get("final_weight_kg") or not job.get("scale_photo"):
            raise HTTPException(status_code=400, detail="⚠ Pesatura necessaria prima della consegna: peso finale e foto bilancia obbligatori")

    def _line_from(f: dict) -> dict:
        return {"category": f["kind"], "richiesta_id": f["id"], "items": f.get("items") or [],
                "laundry_job_id": f.get("source_id") if f["kind"] == "lavanderia_privata" else None,
                "zaino_id": f.get("zaino_id")}

    @router.get("/fermate")
    async def list_fermate(date: Optional[str] = None, status: Optional[str] = None,
                           rider_id: Optional[str] = None, active: Optional[bool] = None,
                           date_from: Optional[str] = None, date_to: Optional[str] = None,
                           current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        q = {}
        if date:
            q["date"] = date
        if status:
            q["status"] = {"$in": status.split(",")}
        elif active:
            q["status"] = {"$in": ACTIVE}
        if rider_id:
            q["rider_id"] = rider_id
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to
        if rng:
            q["date"] = rng
        rows = await db.logistics_tasks.find(q, {"_id": 0}).sort([("date", -1), ("route_order", 1)]).to_list(400)
        return [await _enrich_fermata(t) for t in rows]

    @router.put("/fermate/route-order")
    async def set_route_order(data: RouteOrderPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        now = now_iso()
        for idx, fid in enumerate(data.ordered_ids):
            await db.logistics_tasks.update_one({"id": fid, "rider_id": data.rider_id, "date": data.date},
                                                {"$set": {"route_order": idx + 1, "updated_at": now}})
        return {"ok": True}

    @router.get("/fermate-compatibili")
    async def fermate_compatibili(structure_id: Optional[str] = None, client_id: Optional[str] = None,
                                  current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        q = {"status": {"$in": ["unassigned", "assigned"]}}
        if structure_id:
            q["structure_id"] = structure_id
        elif client_id:
            q["client_id"] = client_id
        else:
            return []
        rows = await db.logistics_tasks.find(q, {"_id": 0}).sort("date", 1).to_list(20)
        return [await _enrich_fermata(t) for t in rows]

    @router.post("/fermate")
    async def create_fermata(data: FermataCreate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        richieste = await db.fabbisogni.find({"id": {"$in": data.richiesta_ids}, "status": "aperta"}, {"_id": 0}).to_list(50)
        if data.richiesta_ids and len(richieste) != len(set(data.richiesta_ids)):
            raise HTTPException(status_code=400, detail="Una o più richieste non sono disponibili")
        struct_ids = set(f.get("structure_id") for f in richieste if f.get("structure_id"))
        if len(struct_ids) > 1:
            raise HTTPException(status_code=400, detail="Le richieste devono avere la stessa destinazione")
        for f in richieste:
            await _laundry_gate(f)
        now = now_iso()
        base = richieste[0] if richieste else {}
        structure_id = next(iter(struct_ids), None)
        address = None
        if structure_id:
            s = await db.structures.find_one({"id": structure_id}, {"_id": 0, "address": 1})
            address = (s or {}).get("address")
        doc = {
            "id": str(uuid.uuid4()), "task_type": "delivery",
            "status": "assigned" if data.rider_id else "unassigned",
            "date": data.date, "time_window_start": data.time_window_start, "time_window_end": data.time_window_end,
            "client_id": base.get("client_id"), "structure_id": structure_id, "unit_id": None,
            "address": address, "latitude": None, "longitude": None,
            "rider_id": data.rider_id, "route_order": 0,
            "items": [], "lines": [_line_from(f) for f in richieste],
            "richiesta_ids": [f["id"] for f in richieste], "movement_ids": [],
            "notes": data.notes, "access_details": None, "problem_notes": None, "completion_notes": None,
            "confirmation_photo": None, "source": "consegne",
            "priority": data.priority or max((f.get("priority", "normal") for f in richieste),
                                             key=lambda p: {"low": 0, "normal": 1, "high": 2, "urgent": 3}.get(p, 1), default="normal"),
            "destination_label": base.get("destination_label") or base.get("zaino_code"),
            "created_at": now, "updated_at": now, "started_at": None, "completed_at": None,
        }
        await db.logistics_tasks.insert_one(doc)
        for f in richieste:
            await db.fabbisogni.update_one({"id": f["id"]}, {"$set": {"status": "in_consegna", "fermata_id": doc["id"], "updated_at": now}})
        if data.rider_id:
            await _deps["create_notification"](data.rider_id, "Fermata assegnata",
                                               f"Consegna {data.date}", "logistics_assigned", "normal", "logistics_task", doc["id"])
        doc.pop("_id", None)
        return await _enrich_fermata(doc)

    @router.get("/fermate/{fermata_id}")
    async def get_fermata(fermata_id: str, current_user: dict = Depends(get_current_user)):
        t = await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Fermata non trovata")
        if not is_ops_user(current_user) and t.get("rider_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        out = await _enrich_fermata(t)
        out["movements"] = await db.warehouse_movements.find({"delivery_id": fermata_id}, {"_id": 0}).sort("at", -1).to_list(50)
        out["richieste"] = await db.fabbisogni.find({"id": {"$in": t.get("richiesta_ids") or []}}, {"_id": 0}).to_list(20)
        return out

    @router.post("/fermate/{fermata_id}/richieste")
    async def aggiungi_richiesta(fermata_id: str, data: AggiungiRichiesta, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        t = await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0})
        if not t or t.get("status") in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Fermata non modificabile")
        f = await db.fabbisogni.find_one({"id": data.richiesta_id, "status": "aperta"}, {"_id": 0})
        if not f:
            raise HTTPException(status_code=404, detail="Richiesta non disponibile")
        if t.get("structure_id") and f.get("structure_id") and f["structure_id"] != t["structure_id"]:
            raise HTTPException(status_code=400, detail="La richiesta ha una destinazione diversa dalla fermata")
        await _laundry_gate(f)
        now = now_iso()
        await db.logistics_tasks.update_one({"id": fermata_id}, {
            "$push": {"lines": _line_from(f), "richiesta_ids": f["id"]},
            "$set": {"updated_at": now, "structure_id": t.get("structure_id") or f.get("structure_id"),
                     "client_id": t.get("client_id") or f.get("client_id")}})
        await db.fabbisogni.update_one({"id": f["id"]}, {"$set": {"status": "in_consegna", "fermata_id": fermata_id, "updated_at": now}})
        return await _enrich_fermata(await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0}))

    @router.delete("/fermate/{fermata_id}/richieste/{richiesta_id}")
    async def rimuovi_richiesta(fermata_id: str, richiesta_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        now = now_iso()
        await db.logistics_tasks.update_one({"id": fermata_id}, {
            "$pull": {"lines": {"richiesta_id": richiesta_id}, "richiesta_ids": richiesta_id},
            "$set": {"updated_at": now}})
        await db.fabbisogni.update_one({"id": richiesta_id, "status": "in_consegna"},
                                       {"$set": {"status": "aperta", "fermata_id": None, "updated_at": now}})
        return {"ok": True}

    @router.put("/fermate/{fermata_id}")
    async def update_fermata(fermata_id: str, data: FermataUpdate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        t = await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Fermata non trovata")
        now = now_iso()
        upd = {"updated_at": now}
        payload = data.model_dump(exclude_unset=True)
        for k in ("date", "time_window_start", "time_window_end", "notes", "priority"):
            if k in payload:
                upd[k] = payload[k]
        if "rider_id" in payload:
            upd["rider_id"] = payload["rider_id"] or None
            if t["status"] in ("unassigned", "assigned"):
                upd["status"] = "assigned" if payload["rider_id"] else "unassigned"
            if payload["rider_id"] and payload["rider_id"] != t.get("rider_id"):
                await _deps["create_notification"](payload["rider_id"], "Fermata assegnata",
                                                   f"Consegna {upd.get('date', t.get('date'))}",
                                                   "logistics_assigned", "normal", "logistics_task", fermata_id)
        if payload.get("status") == "cancelled":
            if t["status"] == "completed":
                raise HTTPException(status_code=400, detail="Fermata già completata")
            upd["status"] = "cancelled"
            upd["cancelled_at"] = now
            await db.fabbisogni.update_many({"id": {"$in": t.get("richiesta_ids") or []}, "status": "in_consegna"},
                                            {"$set": {"status": "aperta", "fermata_id": None, "updated_at": now}})
        await db.logistics_tasks.update_one({"id": fermata_id}, {"$set": upd})
        return await _enrich_fermata(await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0}))

    @router.put("/fermate/{fermata_id}/start")
    async def start_fermata(fermata_id: str, current_user: dict = Depends(get_current_user)):
        t = await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Fermata non trovata")
        if not is_ops_user(current_user) and t.get("rider_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        if t["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Fermata non avviabile")
        now = now_iso()
        await db.logistics_tasks.update_one({"id": fermata_id}, {"$set": {"status": "in_progress", "started_at": now, "updated_at": now}})
        return {"ok": True}

    @router.put("/fermate/{fermata_id}/problema")
    async def problema_fermata(fermata_id: str, data: ProblemaPayload, current_user: dict = Depends(get_current_user)):
        t = await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Fermata non trovata")
        if not is_ops_user(current_user) and t.get("rider_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        if t["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Fermata già chiusa")
        await db.logistics_tasks.update_one({"id": fermata_id}, {"$set": {
            "status": "problem", "problem_notes": data.note, "updated_at": now_iso()}})
        return {"ok": True}

    @router.post("/fermate/{fermata_id}/foto")
    async def foto_fermata(fermata_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
        t = await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Fermata non trovata")
        if not is_ops_user(current_user) and t.get("rider_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "jpg"
        path = f"kilolava/consegne/{fermata_id}/{uuid.uuid4()}.{ext}"
        content = await file.read()
        _deps["put_object"](path, content, file.content_type or "image/jpeg")
        await db.logistics_tasks.update_one({"id": fermata_id}, {"$set": {"confirmation_photo": path, "updated_at": now_iso()}})
        return {"ok": True, "path": path}

    @router.post("/fermate/{fermata_id}/completa")
    async def completa_fermata(fermata_id: str, data: CompletaPayload, current_user: dict = Depends(get_current_user)):
        t = await db.logistics_tasks.find_one({"id": fermata_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Fermata non trovata")
        if not is_ops_user(current_user) and t.get("rider_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        if t["status"] in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail="Fermata già chiusa")
        now = now_iso()
        movement_ids = []
        overrides = {(o.get("richiesta_id"), o.get("product_id")): o.get("qty")
                     for o in (data.effective_items or []) if o.get("product_id")}

        def eff_qty(line, it):
            q = overrides.get((line.get("richiesta_id"), it.get("product_id")))
            return q if q is not None else it.get("qty", 1)

        dest_label = t.get("structure_id") and (await db.structures.find_one({"id": t["structure_id"]}, {"_id": 0, "name": 1}) or {}).get("name")
        for line in t.get("lines") or []:
            cat = line.get("category")
            domain = KIND_DOMAIN.get(cat)
            if cat == "lavanderia_privata" and line.get("laundry_job_id"):
                await db.laundry_jobs.update_one({"id": line["laundry_job_id"]}, {"$set": {
                    "status": "consegnata", "delivered_at": now, "delivery_id": fermata_id,
                    "rider_id": current_user["id"], "rider_name": current_user.get("name", ""), "updated_at": now}})
                continue
            if not domain:
                continue
            if cat == "zaino" and line.get("zaino_id"):
                z = await db.zaini.find_one({"id": line["zaino_id"]}, {"_id": 0})
                for it in line.get("items") or []:
                    if not it.get("product_id"):
                        continue
                    q = eff_qty(line, it)
                    if q <= 0:
                        continue
                    product = await get_product(domain, it["product_id"]) or {"id": it["product_id"], "name": it.get("name", "")}
                    mov = await apply_movement(domain=domain, movement_type="reintegro_zaino", product=product, qty=q,
                                               origin={"type": "central", "label": "Magazzino Generale"},
                                               destination={"type": "zaino", "id": line["zaino_id"], "label": (z or {}).get("code", "Zaino")},
                                               user=current_user, zaino_id=line["zaino_id"],
                                               note="Consegna reintegro zaino", delivery_id=fermata_id)
                    movement_ids.append(mov["id"])
                if z:
                    await db.zaini.update_one({"id": line["zaino_id"]}, {"$set": {
                        "status": "assegnato" if z.get("assigned_to") else "disponibile", "updated_at": now}})
                continue
            if not t.get("structure_id"):
                continue
            for it in line.get("items") or []:
                if not it.get("product_id"):
                    continue
                q = eff_qty(line, it)
                if q <= 0:
                    continue
                product = await get_product(domain, it["product_id"]) or {"id": it["product_id"], "name": it.get("name", "")}
                mov = await apply_movement(domain=domain, movement_type="consegna", product=product, qty=q,
                                           origin={"type": "central", "label": "Magazzino Generale"},
                                           destination={"type": "structure", "id": t["structure_id"], "label": dest_label or "Struttura"},
                                           user=current_user, structure_id=t["structure_id"],
                                           note="Consegna completata", delivery_id=fermata_id)
                movement_ids.append(mov["id"])
        await db.fabbisogni.update_many({"id": {"$in": t.get("richiesta_ids") or []}},
                                        {"$set": {"status": "evasa", "updated_at": now}})
        await db.logistics_tasks.update_one({"id": fermata_id}, {"$set": {
            "status": "completed", "completed_at": now, "completion_notes": data.note or t.get("completion_notes"),
            "effective_items": data.effective_items or None,
            "movement_ids": (t.get("movement_ids") or []) + movement_ids, "updated_at": now}})
        return {"ok": True, "movements": len(movement_ids)}

    # ---------- Rider ----------

    @router.get("/mie-fermate")
    async def mie_fermate(date: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        d = date or _deps["local_today"]()
        rows = await db.logistics_tasks.find({"rider_id": current_user["id"], "date": d}, {"_id": 0}).sort("route_order", 1).to_list(100)
        out = []
        for t in rows:
            e = await _enrich_fermata(t)
            e.pop("movement_ids", None)
            out.append(e)
        return out

    # ---------- Panoramica ----------

    @router.get("/overview")
    async def overview(current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        today = _deps["local_today"]()
        aperte = await db.fabbisogni.find({"status": "aperta"}, {"_id": 0}).to_list(500)
        fermate_oggi = await db.logistics_tasks.find({"date": today}, {"_id": 0}).to_list(300)
        in_corso = await db.logistics_tasks.count_documents({"status": "in_progress"})
        urgenti = await db.logistics_tasks.count_documents({"status": {"$in": ACTIVE}, "priority": "urgent"}) + \
            len([f for f in aperte if f.get("priority") == "urgent"])
        in_ritardo = await db.logistics_tasks.count_documents({"status": {"$in": ACTIVE}, "date": {"$lt": today}}) + \
            len([f for f in aperte if f.get("date_needed") and f["date_needed"] < today])

        attention = []
        overdue = await db.logistics_tasks.find({"status": {"$in": ACTIVE}, "date": {"$lt": today}}, {"_id": 0}).sort("date", 1).to_list(5)
        for t in overdue:
            e = await _enrich_fermata(t)
            attention.append({"type": "fermata", "id": t["id"],
                              "text": f"{e['destination']} → fermata del {t.get('date')} in ritardo"})
        for f in aperte:
            if f.get("priority") == "urgent" or (f.get("date_needed") and f["date_needed"] <= today):
                dest = f.get("structure_name") or f.get("destination_label") or f.get("client_name") or f.get("zaino_code") or "—"
                attention.append({"type": "richiesta", "id": f["id"],
                                  "text": f"{dest} → {KIND_LABELS.get(f['kind'], f['kind'])}" +
                                          (f" entro {f['date_needed']}" if f.get("date_needed") else " (urgente)")})
        pronte = await db.laundry_jobs.find({"status": "pronta"}, {"_id": 0}).to_list(100)
        for j in pronte:
            if not (j.get("final_weight_kg") and j.get("scale_photo")):
                attention.append({"type": "lavanderia", "id": j["id"],
                                  "text": f"{j.get('client_name', 'Cliente')} → Lavanderia Privata pronta, pesatura da fare"})
        non_assegnate = [t for t in fermate_oggi if t.get("status") == "unassigned"]
        for t in non_assegnate[:5]:
            e = await _enrich_fermata(t)
            attention.append({"type": "fermata", "id": t["id"], "text": f"{e['destination']} → fermata di oggi non assegnata"})
        riders = {}
        for t in fermate_oggi:
            if t.get("rider_id"):
                r = riders.setdefault(t["rider_id"], {"total": 0, "done": 0})
                r["total"] += 1
                if t.get("status") == "completed":
                    r["done"] += 1
        for rid, r in riders.items():
            if r["total"] - r["done"] > 0:
                u = await db.users.find_one({"id": rid}, {"_id": 0, "name": 1})
                attention.append({"type": "rider", "id": rid,
                                  "text": f"{(u or {}).get('name', 'Rider')} → {r['total'] - r['done']} fermate ancora da completare"})
        return {
            "kpi": {
                "da_organizzare": len(aperte),
                "programmate_oggi": len([t for t in fermate_oggi if t.get("status") in ACTIVE]),
                "in_corso": in_corso,
                "urgenti": urgenti,
                "completate_oggi": len([t for t in fermate_oggi if t.get("status") == "completed"]),
                "in_ritardo": in_ritardo,
            },
            "attention": attention[:12],
        }

    return router
