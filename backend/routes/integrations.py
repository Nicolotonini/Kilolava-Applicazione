"""API routes — Channel Manager integrations (Sistema → Integrazioni)."""
import base64
import hashlib
import hmac as hmac_mod
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from core.database import db
from core.utils import now_iso
from integrations.channel_managers import get_adapter, provider_catalog
from integrations.channel_managers.base import AdapterError
from integrations.channel_managers.octorate import OctorateAdapter, get_app_settings
from integrations.sync_service import _upsert_reservation, sync_connection
from integrations.token_store import save_oauth

SECRET_MASK = "••••••••"


def _extract_reservation_id(payload: dict):
    rid = payload.get("reservationId")
    if rid:
        return rid
    res = payload.get("reservation")
    if isinstance(res, dict):
        return res.get("id")
    return None


def _mask_credentials(provider: str, creds: dict) -> dict:
    try:
        adapter = get_adapter(provider)
    except AdapterError:
        return {}
    out = {}
    for f in adapter.credential_fields:
        v = (creds or {}).get(f["key"])
        if not v:
            out[f["key"]] = None
        elif f.get("secret"):
            out[f["key"]] = SECRET_MASK
        elif f["key"] == "username":
            s = str(v)
            out[f["key"]] = s[:2] + "···" if len(s) > 3 else "···"
        else:
            out[f["key"]] = v
    return out


class ConnectionCreate(BaseModel):
    provider: str
    name: str
    client_id: Optional[str] = None
    credentials: dict = {}


class ConnectionUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
    credentials: Optional[dict] = None
    enabled: Optional[bool] = None
    auto_sync: Optional[bool] = None


class MappingUpdate(BaseModel):
    action: str  # link | ignore | unlink
    structure_id: Optional[str] = None


class OctorateAppSettings(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    redirect_uri: Optional[str] = None


def create_integrations_router(get_current_user, is_ops_user):
    router = APIRouter(prefix="/integrations")

    def _require_ops(user: dict):
        if not is_ops_user(user):
            raise HTTPException(status_code=403, detail="Non autorizzato")

    async def _get_connection(connection_id: str) -> dict:
        conn = await db.cm_connections.find_one({"id": connection_id}, {"_id": 0})
        if not conn:
            raise HTTPException(status_code=404, detail="Connessione non trovata")
        return conn

    async def _serialize_connection(conn: dict) -> dict:
        linked = await db.cm_property_mappings.count_documents({"connection_id": conn["id"], "status": "linked"})
        to_link = await db.cm_property_mappings.count_documents({"connection_id": conn["id"], "status": "unlinked"})
        properties_imported = await db.cm_property_mappings.count_documents({"connection_id": conn["id"]})
        reservations = await db.cm_reservations.count_documents({"connection_id": conn["id"]})
        client_name = None
        if conn.get("client_id"):
            c = await db.clients.find_one({"id": conn["client_id"]}, {"_id": 0, "client_type": 1, "private_info": 1, "company_info": 1})
            if c:
                if c.get("client_type") == "company":
                    client_name = (c.get("company_info") or {}).get("company_name")
                else:
                    pi = c.get("private_info") or {}
                    client_name = f"{pi.get('name', '') or pi.get('first_name', '')} {pi.get('surname', '') or pi.get('last_name', '')}".strip()
        return {
            "id": conn["id"],
            "provider": conn["provider"],
            "name": conn.get("name"),
            "client_id": conn.get("client_id"),
            "client_name": client_name,
            "status": conn.get("status", "disconnected"),
            "enabled": conn.get("enabled", True),
            "auto_sync": conn.get("auto_sync", True),
            "credentials": _mask_credentials(conn["provider"], conn.get("credentials")),
            "last_sync": conn.get("last_sync"),
            "last_sync_result": conn.get("last_sync_result"),
            "last_test": conn.get("last_test"),
            "last_test_at": conn.get("last_test_at"),
            "linked_structures": linked,
            "properties_to_link": to_link,
            "properties_imported": properties_imported,
            "reservations_imported": reservations,
            "oauth_connected": bool((conn.get("oauth") or {}).get("refresh_token") or (conn.get("oauth") or {}).get("access_token")),
            "webhook_path": f"/api/integrations/webhooks/hostaway/{conn['id']}" if conn["provider"] == "hostaway" else None,
            "created_at": conn.get("created_at"),
        }

    @router.get("/providers")
    async def list_providers(current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        return provider_catalog()

    @router.get("/channel-managers")
    async def list_connections(current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        conns = await db.cm_connections.find({}, {"_id": 0}).sort("created_at", 1).to_list(200)
        return [await _serialize_connection(c) for c in conns]

    @router.post("/channel-managers")
    async def create_connection(data: ConnectionCreate, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        try:
            adapter = get_adapter(data.provider)
        except AdapterError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not data.name.strip():
            raise HTTPException(status_code=400, detail="Nome account obbligatorio")
        now = now_iso()
        conn = {
            "id": str(uuid.uuid4()),
            "provider": data.provider,
            "name": data.name.strip(),
            "client_id": data.client_id or None,
            "credentials": data.credentials or {},
            "status": "not_configured" if not adapter.implemented else "disconnected",
            "enabled": True,
            "auto_sync": True,
            "created_at": now,
            "updated_at": now,
        }
        await db.cm_connections.insert_one(conn)
        conn.pop("_id", None)
        return await _serialize_connection(conn)

    @router.put("/channel-managers/{connection_id}")
    async def update_connection(connection_id: str, data: ConnectionUpdate, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        conn = await _get_connection(connection_id)
        updates = {"updated_at": now_iso()}
        if data.name is not None:
            updates["name"] = data.name.strip()
        if data.client_id is not None:
            updates["client_id"] = data.client_id or None
        if data.enabled is not None:
            updates["enabled"] = data.enabled
        if data.auto_sync is not None:
            updates["auto_sync"] = data.auto_sync
        if data.credentials:
            merged = dict(conn.get("credentials") or {})
            for k, v in data.credentials.items():
                if v not in (None, "", SECRET_MASK):
                    merged[k] = v
            updates["credentials"] = merged
            updates["status"] = "disconnected"
        await db.cm_connections.update_one({"id": connection_id}, {"$set": updates})
        return await _serialize_connection(await _get_connection(connection_id))

    @router.delete("/channel-managers/{connection_id}")
    async def delete_connection(connection_id: str, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        await _get_connection(connection_id)
        # Le prenotazioni importate e le strutture Kilolava NON vengono eliminate.
        # I mapping della connessione vengono rimossi (ripristinando booking_source dove serve).
        linked = await db.cm_property_mappings.find(
            {"connection_id": connection_id, "status": "linked"}, {"_id": 0, "structure_id": 1}
        ).to_list(500)
        await db.cm_property_mappings.delete_many({"connection_id": connection_id})
        await db.cm_webhook_events.delete_many({"connection_id": connection_id})
        for m in linked:
            sid = m.get("structure_id")
            if not sid:
                continue
            other = await db.cm_property_mappings.find_one({"structure_id": sid, "status": "linked"}, {"_id": 0, "id": 1})
            if not other:
                await db.structures.update_one({"id": sid}, {"$set": {"booking_source": "manual"}})
        await db.cm_connections.delete_one({"id": connection_id})
        return {"deleted": True, "note": "Prenotazioni importate e strutture conservate"}

    @router.post("/channel-managers/{connection_id}/test")
    async def test_connection(connection_id: str, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        conn = await _get_connection(connection_id)
        adapter = get_adapter(conn["provider"])
        result = await adapter.test_connection(conn)
        if result.get("ok"):
            status = "warning" if any(not c.get("ok") for c in result.get("checks", [])) else "connected"
        else:
            status = "not_configured" if not adapter.implemented else "error"
        await db.cm_connections.update_one(
            {"id": connection_id},
            {"$set": {"last_test": result, "last_test_at": now_iso(), "status": status}},
        )
        return result

    @router.post("/channel-managers/{connection_id}/import-properties")
    async def import_properties(connection_id: str, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        conn = await _get_connection(connection_id)
        adapter = get_adapter(conn["provider"])
        try:
            props = await adapter.list_properties(conn)
        except AdapterError as e:
            raise HTTPException(status_code=400, detail=str(e))
        now = now_iso()
        for p in props:
            existing = await db.cm_property_mappings.find_one(
                {"connection_id": connection_id, "external_id": p.external_id}, {"_id": 0, "id": 1}
            )
            if existing:
                await db.cm_property_mappings.update_one(
                    {"connection_id": connection_id, "external_id": p.external_id},
                    {"$set": {"external_name": p.name, "external_address": p.address, "updated_at": now}},
                )
            else:
                await db.cm_property_mappings.insert_one({
                    "id": str(uuid.uuid4()),
                    "connection_id": connection_id,
                    "provider": conn["provider"],
                    "external_id": p.external_id,
                    "external_name": p.name,
                    "external_address": p.address,
                    "structure_id": None,
                    "klv_code": None,
                    "status": "unlinked",
                    "created_at": now,
                    "updated_at": now,
                })
        return {"imported": len(props)}

    @router.get("/channel-managers/{connection_id}/mappings")
    async def list_mappings(connection_id: str, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        await _get_connection(connection_id)
        mappings = await db.cm_property_mappings.find({"connection_id": connection_id}, {"_id": 0}).to_list(500)
        sids = [m["structure_id"] for m in mappings if m.get("structure_id")]
        structures = {}
        if sids:
            async for s in db.structures.find({"id": {"$in": sids}}, {"_id": 0, "id": 1, "name": 1, "klv_code": 1}):
                structures[s["id"]] = s
        for m in mappings:
            s = structures.get(m.get("structure_id"))
            m["structure_name"] = s.get("name") if s else None
        return mappings

    @router.put("/mappings/{mapping_id}")
    async def update_mapping(mapping_id: str, data: MappingUpdate, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        mapping = await db.cm_property_mappings.find_one({"id": mapping_id}, {"_id": 0})
        if not mapping:
            raise HTTPException(status_code=404, detail="Mapping non trovato")
        now = now_iso()
        warning = None

        if data.action == "link":
            if not data.structure_id:
                raise HTTPException(status_code=400, detail="Seleziona una struttura Kilolava da collegare")
            structure = await db.structures.find_one({"id": data.structure_id}, {"_id": 0, "id": 1, "name": 1, "klv_code": 1, "ical_url": 1})
            if not structure:
                raise HTTPException(status_code=404, detail="Struttura non trovata")
            conflict = await db.cm_property_mappings.find_one({
                "structure_id": data.structure_id, "status": "linked", "id": {"$ne": mapping_id},
            }, {"_id": 0, "connection_id": 1, "provider": 1, "external_name": 1})
            if conflict:
                conflict_conn = await db.cm_connections.find_one({"id": conflict["connection_id"]}, {"_id": 0, "name": 1})
                raise HTTPException(status_code=400, detail=(
                    f"La struttura {structure.get('klv_code') or structure['name']} ha già una fonte "
                    f"prenotazioni principale: {conflict.get('provider')} — "
                    f"{(conflict_conn or {}).get('name', 'account')} ({conflict.get('external_name')}). "
                    "Scollegala prima per evitare prenotazioni duplicate."
                ))
            if structure.get("ical_url"):
                warning = ("La struttura ha anche un feed iCal legacy attivo: la connessione API diventa la fonte "
                           "principale (priorità API → iCal → Manuale). Valuta di rimuovere il feed per evitare duplicati.")
            await db.cm_property_mappings.update_one({"id": mapping_id}, {"$set": {
                "structure_id": structure["id"], "klv_code": structure.get("klv_code"),
                "status": "linked", "updated_at": now,
            }})
            await db.structures.update_one({"id": structure["id"]}, {"$set": {"booking_source": mapping["provider"]}})
            await db.cm_reservations.update_many(
                {"connection_id": mapping["connection_id"], "external_property_id": mapping["external_id"]},
                {"$set": {"structure_id": structure["id"], "klv_code": structure.get("klv_code")}},
            )
        elif data.action == "ignore":
            await db.cm_property_mappings.update_one({"id": mapping_id}, {"$set": {"status": "ignored", "updated_at": now}})
        elif data.action == "unlink":
            old_sid = mapping.get("structure_id")
            await db.cm_property_mappings.update_one({"id": mapping_id}, {"$set": {
                "structure_id": None, "klv_code": None, "status": "unlinked", "updated_at": now,
            }})
            if old_sid:
                other = await db.cm_property_mappings.find_one({"structure_id": old_sid, "status": "linked"}, {"_id": 0, "id": 1})
                if not other:
                    await db.structures.update_one({"id": old_sid}, {"$set": {"booking_source": "manual"}})
        else:
            raise HTTPException(status_code=400, detail="Azione non valida (link | ignore | unlink)")

        updated = await db.cm_property_mappings.find_one({"id": mapping_id}, {"_id": 0})
        if updated.get("structure_id"):
            s = await db.structures.find_one({"id": updated["structure_id"]}, {"_id": 0, "name": 1})
            updated["structure_name"] = s.get("name") if s else None
        if warning:
            updated["warning"] = warning
        return updated

    @router.post("/channel-managers/{connection_id}/sync")
    async def sync_now(connection_id: str, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        conn = await _get_connection(connection_id)
        return await sync_connection(conn, trigger="manual")

    @router.get("/reservations")
    async def list_imported_reservations(
        provider: Optional[str] = None,
        connection_id: Optional[str] = None,
        structure_id: Optional[str] = None,
        status: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        current_user: dict = Depends(get_current_user),
    ):
        _require_ops(current_user)
        query = {}
        if provider:
            query["provider"] = provider
        if connection_id:
            query["connection_id"] = connection_id
        if structure_id:
            query["structure_id"] = structure_id
        if status:
            query["status"] = status
        if date_from:
            query["check_out"] = {"$gte": date_from}
        if date_to:
            query["check_in"] = {"$lte": date_to}
        rows = await db.cm_reservations.find(query, {"_id": 0}).sort("check_in", -1).to_list(500)
        sids = list({r["structure_id"] for r in rows if r.get("structure_id")})
        structures = {}
        if sids:
            async for s in db.structures.find({"id": {"$in": sids}}, {"_id": 0, "id": 1, "name": 1, "klv_code": 1}):
                structures[s["id"]] = s
        for r in rows:
            s = structures.get(r.get("structure_id"))
            r["structure_name"] = s.get("name") if s else None
            if not r.get("klv_code") and s:
                r["klv_code"] = s.get("klv_code")
        return rows

    # ---------------- Octorate: credenziali app globali + flusso OAuth ----------------

    @router.get("/octorate/app-settings")
    async def octorate_app_settings(current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        app = await get_app_settings()
        return {
            "client_id": app.get("client_id"),
            "client_secret_set": bool(app.get("client_secret")),
            "redirect_uri": app.get("redirect_uri"),
        }

    @router.put("/octorate/app-settings")
    async def update_octorate_app_settings(data: OctorateAppSettings, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        updates = {}
        if data.client_id is not None:
            updates["client_id"] = data.client_id.strip() or None
        if data.client_secret not in (None, "", SECRET_MASK):
            updates["client_secret"] = data.client_secret
        if data.redirect_uri is not None:
            updates["redirect_uri"] = data.redirect_uri.strip() or None
        if updates:
            await db.app_settings.update_one({"_id": "octorate_app"}, {"$set": updates}, upsert=True)
        app = await get_app_settings()
        return {
            "client_id": app.get("client_id"),
            "client_secret_set": bool(app.get("client_secret")),
            "redirect_uri": app.get("redirect_uri"),
        }

    @router.get("/octorate/connect/{connection_id}")
    async def octorate_connect(connection_id: str, current_user: dict = Depends(get_current_user)):
        _require_ops(current_user)
        conn = await _get_connection(connection_id)
        if conn["provider"] != "octorate":
            raise HTTPException(status_code=400, detail="La connessione non è Octorate")
        adapter: OctorateAdapter = get_adapter("octorate")
        app = await get_app_settings()
        state = str(uuid.uuid4())
        try:
            url = adapter.build_authorize_url(app, state)
        except AdapterError as e:
            raise HTTPException(status_code=400, detail=str(e))
        await db.cm_oauth_states.insert_one({
            "state": state, "connection_id": connection_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"authorize_url": url}

    @router.get("/octorate/callback")
    async def octorate_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
        # Endpoint pubblico: è il redirect del browser da Octorate. Protetto dallo state monouso.
        def back(status: str, reason: str = ""):
            suffix = f"&reason={reason[:120]}" if reason else ""
            return RedirectResponse(f"/integrations?octorate={status}{suffix}")
        if error:
            return back("error", error)
        if not code or not state:
            return back("error", "code o state mancanti")
        record = await db.cm_oauth_states.find_one({"state": state})
        if not record:
            return back("error", "state non valido o già usato")
        await db.cm_oauth_states.delete_one({"state": state})
        created = datetime.fromisoformat(record["created_at"])
        if datetime.now(timezone.utc) - created > timedelta(minutes=15):
            return back("error", "sessione OAuth scaduta, riprova")
        conn = await db.cm_connections.find_one({"id": record["connection_id"]}, {"_id": 0})
        if not conn:
            return back("error", "connessione non trovata")
        adapter: OctorateAdapter = get_adapter("octorate")
        app = await get_app_settings()
        try:
            oauth = await adapter.exchange_code(app, code)
        except AdapterError as e:
            await db.cm_connections.update_one({"id": conn["id"]}, {"$set": {"status": "error", "last_test": {"ok": False, "checks": [], "error": str(e)}}})
            return back("error", "scambio token fallito")
        await save_oauth(conn["id"], oauth)
        await db.cm_connections.update_one({"id": conn["id"]}, {"$set": {"status": "connected", "updated_at": now_iso()}})
        return back("connected")

    # ---------------- Hostaway: webhook receiver (reservation created/updated) ----------------

    @router.post("/webhooks/hostaway/{connection_id}")
    async def hostaway_webhook(connection_id: str, request: Request):
        conn = await db.cm_connections.find_one({"id": connection_id}, {"_id": 0})
        if not conn or conn["provider"] != "hostaway":
            raise HTTPException(status_code=404, detail="Connessione webhook non trovata")
        creds = conn.get("credentials") or {}
        login, password = creds.get("webhook_login"), creds.get("webhook_password")
        if not login or not password:
            raise HTTPException(status_code=401, detail="Webhook non abilitato: configura webhook login/password sulla connessione Hostaway")
        auth = request.headers.get("authorization", "")
        ok = False
        if auth.lower().startswith("basic "):
            try:
                raw = base64.b64decode(auth.split(" ", 1)[1]).decode()
                user, pwd = raw.split(":", 1)
                ok = hmac_mod.compare_digest(user, login) and hmac_mod.compare_digest(pwd, password)
            except Exception:
                ok = False
        if not ok:
            raise HTTPException(status_code=401, detail="Autenticazione webhook non valida")
        raw_body = await request.body()
        try:
            payload = await request.json()
        except Exception:
            payload = {"raw": raw_body.decode(errors="replace")}
        dedupe = hashlib.sha256(raw_body + connection_id.encode()).hexdigest()
        existing = await db.cm_webhook_events.find_one({"dedupe_key": dedupe}, {"_id": 0, "dedupe_key": 1})
        if existing:
            return {"status": "duplicate_ignored"}
        event = payload.get("event") or payload.get("eventType") or "unknown"
        rid = _extract_reservation_id(payload)
        inbox = {
            "dedupe_key": dedupe, "connection_id": connection_id, "provider": "hostaway",
            "event": str(event), "reservation_id": str(rid) if rid else None,
            "received_at": now_iso(), "processed": False, "error": None,
        }
        await db.cm_webhook_events.insert_one(inbox)
        if rid:
            adapter = get_adapter("hostaway")
            try:
                rows = await adapter.fetch_reservations_by_ids(conn, [{"external_id": str(rid)}])
                if rows:
                    n = rows[0]
                    mapping = await db.cm_property_mappings.find_one({
                        "connection_id": connection_id, "external_id": str(n.external_property_id), "status": "linked",
                    }, {"_id": 0})
                    await _upsert_reservation(
                        conn, n,
                        mapping.get("structure_id") if mapping else None,
                        mapping.get("klv_code") if mapping else None,
                    )
                    await db.cm_webhook_events.update_one({"dedupe_key": dedupe}, {"$set": {"processed": True}})
            except AdapterError as e:
                await db.cm_webhook_events.update_one({"dedupe_key": dedupe}, {"$set": {"error": str(e)}})
        return {"status": "accepted"}

    return router
