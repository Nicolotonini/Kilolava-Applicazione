"""Lavanderia Privata — modulo semplice: Da lavorare → Pronta → (peso + foto bilancia) → Consegnata."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from core.database import db
from core.utils import now_iso

_deps = {}

APP_NAME = "kilolava"
STATUSES = ["da_lavorare", "pronta", "consegnata", "annullata"]
DEFAULT_PRICE = 3.0


def init_lavanderia_deps(**kwargs):
    _deps.update(kwargs)


async def _default_price() -> float:
    s = await db.app_settings.find_one({"id": "lavanderia_privata"}, {"_id": 0})
    try:
        return float((s or {}).get("price_per_kg", DEFAULT_PRICE))
    except (TypeError, ValueError):
        return DEFAULT_PRICE


async def _price_for_client(client_id: Optional[str]):
    if client_id:
        c = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if c and c.get("private_laundry_price_per_kg") is not None:
            try:
                return float(c["private_laundry_price_per_kg"]), "cliente"
            except (TypeError, ValueError):
                pass
    return await _default_price(), "standard"


def _job_out(j: dict) -> dict:
    out = dict(j)
    out["consegnabile"] = bool(j.get("final_weight_kg") and j.get("scale_photo"))
    return out


class JobCreate(BaseModel):
    client_id: str
    structure_id: Optional[str] = None
    bags: Optional[int] = None
    note: Optional[str] = None
    arrived_at: Optional[str] = None


class JobUpdate(BaseModel):
    bags: Optional[int] = None
    note: Optional[str] = None
    status: Optional[str] = None


class ProntaPayload(BaseModel):
    note: Optional[str] = None


class PesoPayload(BaseModel):
    final_weight_kg: float
    note: Optional[str] = None


class SettingsPayload(BaseModel):
    price_per_kg: float


class ClientPricePayload(BaseModel):
    price_per_kg: Optional[float] = None


def create_lavanderia_router(get_current_user, is_ops_user):
    router = APIRouter(tags=["lavanderia"])

    def require_ops(user):
        if not is_ops_user(user):
            raise HTTPException(status_code=403, detail="Non autorizzato")

    async def _enrich(j: dict) -> dict:
        out = _job_out(j)
        if j.get("client_id") and not out.get("client_name"):
            c = await db.clients.find_one({"id": j["client_id"]}, {"_id": 0})
            out["client_name"] = _deps["get_client_display_name"](c) if c else None
        return out

    @router.get("/jobs")
    async def list_jobs(status: Optional[str] = None, client_id: Optional[str] = None,
                        current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        q = {}
        if status:
            q["status"] = status
        else:
            q["status"] = {"$in": ["da_lavorare", "pronta"]}
        if client_id:
            q["client_id"] = client_id
        jobs = await db.laundry_jobs.find(q, {"_id": 0}).sort("arrived_at", -1).to_list(300)
        return [await _enrich(j) for j in jobs]

    @router.get("/history")
    async def history(client_id: Optional[str] = None, structure_id: Optional[str] = None,
                      date_from: Optional[str] = None, date_to: Optional[str] = None,
                      current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        q = {"status": "consegnata"}
        if client_id:
            q["client_id"] = client_id
        if structure_id:
            q["structure_id"] = structure_id
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        if rng:
            q["delivered_at"] = rng
        jobs = await db.laundry_jobs.find(q, {"_id": 0}).sort("delivered_at", -1).to_list(500)
        return [await _enrich(j) for j in jobs]

    @router.post("/jobs")
    async def create_job(data: JobCreate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        now = now_iso()
        c = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
        if not c:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        s = await db.structures.find_one({"id": data.structure_id}, {"_id": 0, "name": 1, "klv_code": 1}) if data.structure_id else None
        job = {
            "id": str(uuid.uuid4()), "status": "da_lavorare",
            "client_id": data.client_id, "client_name": _deps["get_client_display_name"](c),
            "structure_id": data.structure_id, "structure_name": (s or {}).get("name"),
            "arrived_at": data.arrived_at or now, "bags": data.bags, "note": data.note or "",
            "photos": [], "registered_by": current_user["id"], "registered_by_name": current_user.get("name", ""),
            "ready_at": None, "ready_by": None,
            "final_weight_kg": None, "scale_photo": None, "weighed_at": None, "weighed_by": None, "weigh_note": None,
            "price_per_kg": None, "price_source": None, "total_price": None,
            "richiesta_id": None, "delivery_id": None, "delivered_at": None, "rider_id": None, "rider_name": None,
            "created_at": now, "updated_at": now,
        }
        await db.laundry_jobs.insert_one(job)
        job.pop("_id", None)
        return _job_out(job)

    @router.put("/jobs/{job_id}")
    async def update_job(job_id: str, data: JobUpdate, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        job = await db.laundry_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            raise HTTPException(status_code=404, detail="Lavorazione non trovata")
        upd = {"updated_at": now_iso()}
        if data.bags is not None:
            upd["bags"] = data.bags
        if data.note is not None:
            upd["note"] = data.note
        if data.status is not None:
            if data.status != "annullata":
                raise HTTPException(status_code=400, detail="Da qui è possibile solo annullare")
            upd["status"] = "annullata"
            if job.get("richiesta_id"):
                await db.fabbisogni.update_one({"id": job["richiesta_id"], "status": {"$in": ["aperta", "in_consegna"]}},
                                               {"$set": {"status": "annullata", "updated_at": now_iso()}})
        await db.laundry_jobs.update_one({"id": job_id}, {"$set": upd})
        return _job_out(await db.laundry_jobs.find_one({"id": job_id}, {"_id": 0}))

    @router.post("/jobs/{job_id}/pronta")
    async def mark_ready(job_id: str, data: ProntaPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        job = await db.laundry_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            raise HTTPException(status_code=404, detail="Lavorazione non trovata")
        if job["status"] != "da_lavorare":
            raise HTTPException(status_code=400, detail="La lavorazione non è in stato Da lavorare")
        now = now_iso()
        # Richiesta logistica: la biancheria pronta entra in Consegne → Da organizzare
        s = await db.structures.find_one({"id": job.get("structure_id")}, {"_id": 0, "name": 1, "klv_code": 1}) if job.get("structure_id") else None
        fab = {
            "id": str(uuid.uuid4()), "kind": "lavanderia_privata",
            "structure_id": job.get("structure_id"), "structure_name": (s or {}).get("name"),
            "klv_code": (s or {}).get("klv_code"), "zaino_id": None, "zaino_code": None,
            "client_id": job["client_id"], "client_name": job.get("client_name"),
            "destination_label": job.get("client_name"),
            "items": [{"name": "Biancheria privata" + (f" — {job['bags']} sacchi" if job.get("bags") else ""), "qty": 1}],
            "date_needed": None, "time_window": None, "priority": "normal",
            "status": "aperta", "stage": "da_verificare", "snoozed": False,
            "note": data.note or "", "source": {"type": "lavanderia", "id": job_id}, "source_id": job_id,
            "fermata_id": None, "created_by": current_user["id"], "created_by_name": current_user.get("name", ""),
            "created_at": now, "updated_at": now,
        }
        await db.fabbisogni.insert_one(fab)
        await db.laundry_jobs.update_one({"id": job_id}, {"$set": {
            "status": "pronta", "ready_at": now, "ready_by": current_user["id"],
            "ready_by_name": current_user.get("name", ""), "richiesta_id": fab["id"],
            "note": (job.get("note") or "") if not data.note else ((job.get("note") or "") + "\n" + data.note).strip(),
            "updated_at": now}})
        return _job_out(await db.laundry_jobs.find_one({"id": job_id}, {"_id": 0}))

    @router.put("/jobs/{job_id}/peso")
    async def set_weight(job_id: str, data: PesoPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        job = await db.laundry_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            raise HTTPException(status_code=404, detail="Lavorazione non trovata")
        if job["status"] not in ("da_lavorare", "pronta"):
            raise HTTPException(status_code=400, detail="Lavorazione non pesabile in questo stato")
        if data.final_weight_kg <= 0:
            raise HTTPException(status_code=400, detail="Peso non valido")
        now = now_iso()
        price, source = await _price_for_client(job.get("client_id"))
        total = round(data.final_weight_kg * price, 2)
        await db.laundry_jobs.update_one({"id": job_id}, {"$set": {
            "final_weight_kg": data.final_weight_kg, "weighed_at": now, "weighed_by": current_user["id"],
            "weighed_by_name": current_user.get("name", ""), "weigh_note": data.note or "",
            "price_per_kg": price, "price_source": source, "total_price": total, "updated_at": now}})
        if job.get("richiesta_id"):
            await db.fabbisogni.update_one({"id": job["richiesta_id"]}, {"$set": {
                "items": [{"name": f"Biancheria privata — {data.final_weight_kg:.2f} kg", "qty": 1}],
                "updated_at": now}})
        return _job_out(await db.laundry_jobs.find_one({"id": job_id}, {"_id": 0}))

    @router.post("/jobs/{job_id}/foto-bilancia")
    async def upload_scale_photo(job_id: str, file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        job = await db.laundry_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            raise HTTPException(status_code=404, detail="Lavorazione non trovata")
        ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "jpg"
        path = f"{APP_NAME}/lavanderia/{job_id}/bilancia_{uuid.uuid4()}.{ext}"
        content = await file.read()
        _deps["put_object"](path, content, file.content_type or "image/jpeg")
        now = now_iso()
        photo = {"id": str(uuid.uuid4()), "kind": "image", "file_path": path,
                 "content_type": file.content_type or "image/jpeg",
                 "uploaded_at": now, "uploaded_by": current_user["id"], "uploaded_by_name": current_user.get("name", "")}
        await db.laundry_jobs.update_one({"id": job_id}, {"$set": {"scale_photo": photo, "updated_at": now}})
        return {"ok": True, "scale_photo": photo}

    @router.get("/settings")
    async def get_settings(current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        return {"price_per_kg": await _default_price()}

    @router.put("/settings")
    async def set_settings(data: SettingsPayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        await db.app_settings.update_one({"id": "lavanderia_privata"},
                                         {"$set": {"price_per_kg": data.price_per_kg, "updated_at": now_iso()}}, upsert=True)
        return {"price_per_kg": data.price_per_kg}

    @router.put("/client-price/{client_id}")
    async def set_client_price(client_id: str, data: ClientPricePayload, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        c = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1})
        if not c:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        await db.clients.update_one({"id": client_id},
                                    {"$set": {"private_laundry_price_per_kg": data.price_per_kg, "updated_at": now_iso()}})
        return {"client_id": client_id, "price_per_kg": data.price_per_kg}

    return router
