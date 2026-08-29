"""Router Anagrafiche Google Sheets: OAuth connect, import con anteprima, backup."""
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from core.database import db
from core.utils import now_iso
from services import sheets_anagrafiche as svc

logger = logging.getLogger(__name__)


class ApplyPayload(BaseModel):
    preview_id: str
    decisions: dict = {}


def create_sheets_anagrafiche_router(get_current_user, is_ops_user):
    router = APIRouter(tags=["sheets-anagrafiche"])

    def require_admin(user):
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Solo l'Admin può gestire le anagrafiche Google Sheets")

    @router.get("/sheets-anagrafiche/status")
    async def status(current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        cfg = svc.oauth_config()
        tok = await svc.get_token_doc()
        last_import = await db.sheets_sync_history.find_one({"type": "import"}, {"_id": 0}, sort=[("at", -1)])
        last_backup = await db.sheets_sync_history.find_one({"type": "backup", "esito": "success"}, {"_id": 0}, sort=[("at", -1)])
        return {
            "configured": bool(cfg["client_id"] and cfg["import_id"] and cfg["backup_id"]),
            "connected": bool(tok),
            "connected_email": (tok or {}).get("account_email"),
            "import_url": f"https://docs.google.com/spreadsheets/d/{cfg['import_id']}" if cfg["import_id"] else None,
            "backup_url": f"https://docs.google.com/spreadsheets/d/{cfg['backup_id']}" if cfg["backup_id"] else None,
            "last_import": last_import,
            "last_backup": last_backup,
        }

    @router.get("/sheets-anagrafiche/connect-url")
    async def connect_url(current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        cfg = svc.oauth_config()
        if not cfg["client_id"]:
            raise HTTPException(status_code=400, detail="Credenziali OAuth non configurate")
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config({
            "web": {"client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token"}
        }, scopes=svc.SCOPES, redirect_uri=cfg["redirect_uri"])
        url, state = flow.authorization_url(access_type="offline", prompt="consent")
        await db.oauth_states.insert_one({"state": state, "user_id": current_user["id"], "created_at": now_iso()})
        return {"url": url}

    @router.get("/oauth/sheets/callback")
    async def oauth_callback(code: str = None, state: str = None, error: str = None):
        frontend = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "").split("/api/")[0]
        if error or not code or not state:
            return RedirectResponse(f"{frontend}/integrations?sheets=error")
        st = await db.oauth_states.find_one({"state": state})
        if not st:
            return RedirectResponse(f"{frontend}/integrations?sheets=error")
        await db.oauth_states.delete_one({"state": state})
        cfg = svc.oauth_config()
        import warnings
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config({
            "web": {"client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token"}
        }, scopes=svc.SCOPES, redirect_uri=cfg["redirect_uri"])
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                flow.fetch_token(code=code)
        except Exception:
            logger.exception("OAuth Sheets: fetch_token fallito")
            return RedirectResponse(f"{frontend}/integrations?sheets=error")
        creds = flow.credentials
        await db.google_tokens.update_one({"id": "sheets"}, {"$set": {
            "id": "sheets", "access_token": creds.token, "refresh_token": creds.refresh_token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=3500)).isoformat(),
            "connected_at": now_iso(),
        }}, upsert=True)
        try:
            await svc.setup_import_sheet()
        except Exception:
            logger.exception("OAuth Sheets: setup foglio import fallito (non bloccante)")
        return RedirectResponse(f"{frontend}/integrations?sheets=connected")

    @router.post("/sheets-anagrafiche/disconnect")
    async def disconnect(current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        await db.google_tokens.delete_one({"id": "sheets"})
        return {"ok": True}

    @router.post("/sheets-anagrafiche/setup-import")
    async def setup_import(current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        try:
            return await svc.setup_import_sheet()
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.post("/sheets-anagrafiche/preview")
    async def preview(current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        try:
            return await svc.build_preview(current_user)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Errore lettura foglio: {e}")

    @router.post("/sheets-anagrafiche/apply")
    async def apply(data: ApplyPayload, current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        try:
            return await svc.apply_preview(data.preview_id, data.decisions, current_user)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.delete("/sheets-anagrafiche/preview/{preview_id}")
    async def cancel_preview(preview_id: str, current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        await db.sheets_previews.delete_one({"id": preview_id})
        return {"ok": True}

    @router.post("/sheets-anagrafiche/backup")
    async def backup(current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        try:
            return await svc.run_backup(current_user.get("name", "Admin"))
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.get("/sheets-anagrafiche/history")
    async def history(current_user: dict = Depends(get_current_user)):
        require_admin(current_user)
        rows = await db.sheets_sync_history.find({}, {"_id": 0}).sort("at", -1).to_list(30)
        return rows

    return router
