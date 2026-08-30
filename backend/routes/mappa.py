"""Mappa Operativa — localizzazione del personale in servizio.
La posizione arriva dalla geolocalizzazione del DISPOSITIVO (browser), attiva
solo durante l'attività lavorativa (inizia/termina giornata, giro, intervento).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core.database import db
from core.utils import now_iso

_deps = {}


def init_mappa_deps(**kwargs):
    _deps.update(kwargs)


class StartPayload(BaseModel):
    session_type: str = "giornata"


class PingPayload(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    battery: Optional[int] = None


TRACKED_ROLES = ("cleaner", "rider", "maintenance")
LIVE_SECONDS = 120
RECENT_SECONDS = 600


def _seconds_ago(ts: Optional[str]) -> Optional[int]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int((datetime.now(timezone.utc) - dt).total_seconds())
    except Exception:
        return None


def create_mappa_router(get_current_user, is_ops_user):
    router = APIRouter(tags=["mappa"])

    def require_ops(user):
        if not is_ops_user(user):
            raise HTTPException(status_code=403, detail="Accesso non autorizzato")

    @router.post("/posizione/start")
    async def start_session(data: StartPayload, current_user: dict = Depends(get_current_user)):
        now = now_iso()
        await db.user_locations.update_one(
            {"user_id": current_user["id"]},
            {"$set": {
                "user_id": current_user["id"], "name": current_user.get("name", ""),
                "role": current_user.get("role", ""), "active": True,
                "session_type": data.session_type, "session_started_at": now,
                "session_ended_at": None, "updated_at": now,
            }},
            upsert=True,
        )
        return {"ok": True, "active": True, "session_type": data.session_type}

    @router.post("/posizione/stop")
    async def stop_session(current_user: dict = Depends(get_current_user)):
        now = now_iso()
        await db.user_locations.update_one(
            {"user_id": current_user["id"]},
            {"$set": {"active": False, "session_ended_at": now, "updated_at": now}},
        )
        return {"ok": True, "active": False}

    @router.post("/posizione/ping")
    async def ping(data: PingPayload, current_user: dict = Depends(get_current_user)):
        doc = await db.user_locations.find_one({"user_id": current_user["id"]}, {"_id": 0, "active": 1})
        if not doc or not doc.get("active"):
            raise HTTPException(status_code=400, detail="Localizzazione non attiva: avvia prima la giornata/il giro")
        now = now_iso()
        await db.user_locations.update_one(
            {"user_id": current_user["id"]},
            {"$set": {
                "latitude": data.latitude, "longitude": data.longitude,
                "accuracy": data.accuracy, "speed": data.speed, "battery": data.battery,
                "timestamp": now, "updated_at": now,
            }},
        )
        return {"ok": True}

    @router.get("/posizione/me")
    async def my_status(current_user: dict = Depends(get_current_user)):
        doc = await db.user_locations.find_one({"user_id": current_user["id"]}, {"_id": 0})
        return {
            "active": bool(doc and doc.get("active")),
            "session_type": (doc or {}).get("session_type"),
            "session_started_at": (doc or {}).get("session_started_at"),
            "last_ping": (doc or {}).get("timestamp"),
        }

    @router.get("/mappa/personale")
    async def personale(current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        today = _deps["local_today"]()
        users = await db.users.find({"role": {"$in": list(TRACKED_ROLES)}, "is_active": {"$ne": False}},
                                    {"_id": 0, "id": 1, "name": 1, "role": 1, "phone": 1}).to_list(300)
        locs = {loc["user_id"]: loc async for loc in db.user_locations.find({}, {"_id": 0})}

        cleaning_today = await db.cleaning_tasks.find(
            {"date": today, "status": {"$nin": ["cancelled"]}},
            {"_id": 0, "id": 1, "assigned_cleaner_ids": 1, "status": 1, "scheduled_time": 1, "structure_id": 1}).to_list(500)
        fermate_today = await db.logistics_tasks.find(
            {"date": today, "status": {"$nin": ["cancelled"]}},
            {"_id": 0, "id": 1, "rider_id": 1, "status": 1, "route_order": 1, "structure_id": 1, "destination_label": 1}).to_list(500)
        maint_open = await db.maintenance_issues.find(
            {"status": {"$in": ["assigned", "in_progress", "on_hold"]}},
            {"_id": 0, "id": 1, "assigned_to": 1, "status": 1, "title": 1, "structure_id": 1}).to_list(500)

        struct_ids = {t.get("structure_id") for t in cleaning_today + fermate_today + maint_open if t.get("structure_id")}
        structs = {}
        if struct_ids:
            async for s in db.structures.find({"id": {"$in": list(struct_ids)}}, {"_id": 0, "id": 1, "name": 1, "klv_code": 1}):
                structs[s["id"]] = f"{s['klv_code']} · {s['name']}" if s.get("klv_code") else s["name"]

        def sname(t):
            return structs.get(t.get("structure_id")) or t.get("destination_label") or ""

        out = []
        for u in users:
            loc = locs.get(u["id"], {})
            sec = _seconds_ago(loc.get("timestamp"))
            active = bool(loc.get("active"))
            freshness = "offline"
            if active:
                if sec is None or loc.get("latitude") is None:
                    freshness = "gps_off"
                elif sec <= LIVE_SECONDS:
                    freshness = "live"
                elif sec <= RECENT_SECONDS:
                    freshness = "recente"
                else:
                    freshness = "non_aggiornata"
            current_activity = None
            next_activity = None
            stats = None
            if u["role"] == "cleaner":
                mine = [t for t in cleaning_today if u["id"] in (t.get("assigned_cleaner_ids") or [])]
                mine.sort(key=lambda t: t.get("scheduled_time") or "99")
                cur = next((t for t in mine if t["status"] == "in_progress"), None)
                nxt = next((t for t in mine if t["status"] in ("unassigned", "assigned", "pending", "todo")), None)
                if cur:
                    current_activity = {"label": f"Pulizia {sname(cur)}", "type": "cleaning", "id": cur["id"]}
                if nxt:
                    next_activity = {"label": f"{sname(nxt)}{' · ' + nxt['scheduled_time'] if nxt.get('scheduled_time') else ''}", "type": "cleaning", "id": nxt["id"]}
                done = len([t for t in mine if t["status"] in ("completed", "done")])
                stats = {"done": done, "total": len(mine)}
            elif u["role"] == "rider":
                mine = [t for t in fermate_today if t.get("rider_id") == u["id"]]
                mine.sort(key=lambda t: t.get("route_order") or 0)
                cur = next((t for t in mine if t["status"] == "in_progress"), None)
                nxt = next((t for t in mine if t["status"] == "assigned"), None)
                if cur:
                    current_activity = {"label": f"Fermata {sname(cur)}", "type": "fermata", "id": cur["id"]}
                if nxt:
                    next_activity = {"label": sname(nxt), "type": "fermata", "id": nxt["id"]}
                done = len([t for t in mine if t["status"] == "completed"])
                stats = {"done": done, "total": len(mine)}
            elif u["role"] == "maintenance":
                mine = [m for m in maint_open if m.get("assigned_to") == u["id"]]
                cur = next((m for m in mine if m["status"] == "in_progress"), None)
                if cur:
                    current_activity = {"label": cur.get("title") or f"Intervento {sname(cur)}", "type": "maintenance", "id": cur["id"]}
                elif mine:
                    next_activity = {"label": mine[0].get("title") or sname(mine[0]), "type": "maintenance", "id": mine[0]["id"]}
                stats = {"open": len(mine)}
            out.append({
                "user_id": u["id"], "name": u["name"], "role": u["role"], "phone": u.get("phone"),
                "active": active, "freshness": freshness, "seconds_ago": sec,
                "session_type": loc.get("session_type"),
                "latitude": loc.get("latitude"), "longitude": loc.get("longitude"),
                "accuracy": loc.get("accuracy"), "speed": loc.get("speed"), "battery": loc.get("battery"),
                "timestamp": loc.get("timestamp"),
                "current_activity": current_activity, "next_activity": next_activity, "stats": stats,
            })
        return out

    @router.get("/mappa/giro/{rider_id}")
    async def giro_rider(rider_id: str, current_user: dict = Depends(get_current_user)):
        require_ops(current_user)
        today = _deps["local_today"]()
        fermate = await db.logistics_tasks.find(
            {"rider_id": rider_id, "date": today, "status": {"$nin": ["cancelled"]}},
            {"_id": 0, "id": 1, "status": 1, "route_order": 1, "structure_id": 1, "destination_label": 1, "address": 1}).to_list(100)
        fermate.sort(key=lambda t: t.get("route_order") or 0)
        struct_ids = [f["structure_id"] for f in fermate if f.get("structure_id")]
        structs = {}
        if struct_ids:
            async for s in db.structures.find({"id": {"$in": struct_ids}}, {"_id": 0, "id": 1, "name": 1, "latitude": 1, "longitude": 1, "address": 1}):
                structs[s["id"]] = s
        out = []
        for f in fermate:
            s = structs.get(f.get("structure_id"), {})
            out.append({
                "id": f["id"], "status": f["status"], "route_order": f.get("route_order"),
                "destination": s.get("name") or f.get("destination_label") or "—",
                "address": f.get("address") or s.get("address"),
                "latitude": s.get("latitude"), "longitude": s.get("longitude"),
            })
        return out

    return router
