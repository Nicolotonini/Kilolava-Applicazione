"""Octorate adapter — Octorate Connect API ufficiale con OAuth 2.0 authorization code.

Authorize URL (login utente Octorate): https://admin.octorate.com/octobook/identity/oauth.xhtml
Token exchange: POST https://api.octorate.com/connect/rest/v1/identity/token
  form: client_id, client_secret, code, grant_type=code, redirect_uri (contratto OpenAPI ufficiale)
Refresh: POST https://api.octorate.com/connect/rest/v1/identity/refresh
  form: client_id, client_secret, refresh_token (contratto OpenAPI ufficiale)
Endpoints: GET /rest/v1/accommodation, GET /rest/v1/reservation/{accommodation},
GET /rest/v1/reservation/{accommodation}/{id} (dal contratto OpenAPI ufficiale Octorate).
Le credenziali app (client_id/secret/redirect) sono GLOBALI dell'integrazione Kilolava
e vivono in db.app_settings (_id: octorate_app), non richieste per singolo cliente.
"""
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlencode

import httpx

from core.database import db
from integrations.token_store import save_oauth
from .base import AdapterError, BaseAdapter, NormalizedProperty, NormalizedReservation, provider_http_error

AUTHORIZE_URL = "https://admin.octorate.com/octobook/identity/oauth.xhtml"
API_BASE = "https://api.octorate.com/connect"

STATUS_MAP = {
    "CONFIRMED": "confirmed",
    "ACTIVE": "confirmed",
    "COMPLETED": "confirmed",
    "WAITING": "pending",
    "DEPOSIT_IN_WAITING": "pending",
    "PROPOSAL": "option",
    "PROPOSAL_EXPIRED": "cancelled",
    "CANCELLED": "cancelled",
}


async def get_app_settings() -> dict:
    return await db.app_settings.find_one({"_id": "octorate_app"}) or {}


def _provider_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        return str(body.get("message") or body.get("detail") or body.get("error") or resp.text[:200])
    except Exception:
        return resp.text[:200] or resp.reason_phrase


def _normalize(r: dict) -> NormalizedReservation:
    raw_status = r.get("status")
    guests = r.get("totalGuest")
    try:
        guests = int(guests) if guests is not None else None
    except (TypeError, ValueError):
        guests = None
    acc = r.get("accommodation")
    acc_id = acc.get("id") if isinstance(acc, dict) else acc
    return NormalizedReservation(
        external_id=str(r.get("id")),
        check_in=(r.get("checkin") or "")[:10] or None,
        check_out=(r.get("checkout") or "")[:10] or None,
        status=STATUS_MAP.get(str(raw_status).upper(), "unknown"),
        status_raw=str(raw_status) if raw_status else None,
        guests_count=guests,
        guest_name=r.get("guestsList"),
        channel=r.get("channelName"),
        external_property_id=str(acc_id) if acc_id is not None else None,
        external_created_at=r.get("createTime"),
        external_updated_at=r.get("updateTime"),
    )


class OctorateAdapter(BaseAdapter):
    provider = "octorate"
    label = "Octorate"
    implemented = True
    oauth_flow = True
    mode = "Octorate Connect API (OAuth 2.0 authorization code)"
    credential_fields = []
    notes = ("API ufficiale Octorate Connect. Il collegamento avviene via OAuth 2.0: crea la "
             "connessione e poi clicca \"Collega Octorate\" — verrai portato al login Octorate per "
             "autorizzare Kilolava. Richiede le credenziali app globali (Client ID, Client Secret, "
             "Redirect URI whitelistata da Octorate) configurate una sola volta in \"App Octorate\".")
    missing_requirements = []

    def build_authorize_url(self, app_settings: dict, state: str) -> str:
        missing = [k for k in ("client_id", "client_secret", "redirect_uri") if not app_settings.get(k)]
        if missing:
            raise AdapterError(
                "Credenziali app Octorate mancanti: " + ", ".join(missing) +
                ". Configurale in Integrazioni → App Octorate (fornite da Octorate al partner, "
                "con Redirect URI whitelistata da Octorate)."
            )
        query = urlencode({
            "client_id": app_settings["client_id"],
            "redirect_uri": app_settings["redirect_uri"],
            "state": state,
        })
        return f"{AUTHORIZE_URL}?{query}"

    async def exchange_code(self, app_settings: dict, code: str) -> dict:
        async with httpx.AsyncClient(timeout=25) as http:
            resp = await http.post(f"{API_BASE}/rest/v1/identity/token", data={
                "client_id": app_settings["client_id"],
                "client_secret": app_settings["client_secret"],
                "code": code,
                "grant_type": "code",
                "redirect_uri": app_settings["redirect_uri"],
            }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        if resp.status_code >= 400:
            raise AdapterError(provider_http_error(self.label, "scambio authorization code", resp.status_code, _provider_message(resp)))
        body = resp.json()
        if not body.get("access_token"):
            raise AdapterError(f"{self.label}: risposta token senza access_token")
        return {
            "access_token": body["access_token"],
            "refresh_token": body.get("refresh_token"),
            "expire_date": body.get("expireDate"),
        }

    async def _refresh(self, connection: dict) -> str:
        oauth = connection.get("oauth") or {}
        refresh_token = oauth.get("refresh_token")
        if not refresh_token:
            raise AdapterError("Octorate non collegato: esegui \"Collega Octorate\" per autorizzare Kilolava via OAuth")
        app = await get_app_settings()
        async with httpx.AsyncClient(timeout=25) as http:
            resp = await http.post(f"{API_BASE}/rest/v1/identity/refresh", data={
                "client_id": app.get("client_id"),
                "client_secret": app.get("client_secret"),
                "refresh_token": refresh_token,
            }, headers={"Content-Type": "application/x-www-form-urlencoded"})
        if resp.status_code >= 400:
            raise AdapterError(provider_http_error(self.label, "rinnovo access token", resp.status_code,
                               f"{_provider_message(resp)} — se il refresh token è stato invalidato, riesegui \"Collega Octorate\""))
        body = resp.json()
        oauth.update({
            "access_token": body.get("access_token"),
            "expire_date": body.get("expireDate"),
            "refresh_token": body.get("refresh_token") or refresh_token,
        })
        connection["oauth"] = oauth
        if connection.get("id"):
            await save_oauth(connection["id"], oauth)
        return oauth["access_token"]

    def _token_valid(self, oauth: dict) -> bool:
        if not oauth.get("access_token"):
            return False
        exp = oauth.get("expire_date")
        if not exp:
            return True
        try:
            dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
            return dt > datetime.now(timezone.utc)
        except ValueError:
            return True

    async def _get_token(self, connection: dict, force: bool = False) -> str:
        oauth = connection.get("oauth") or {}
        if not force and self._token_valid(oauth):
            return oauth["access_token"]
        return await self._refresh(connection)

    async def _get(self, connection: dict, path: str, params: dict, operation: str):
        for attempt in range(2):
            token = await self._get_token(connection, force=attempt == 1)
            async with httpx.AsyncClient(timeout=30) as http:
                resp = await http.get(f"{API_BASE}{path}", params=params, headers={
                    "Authorization": f"Bearer {token}", "Accept": "application/json",
                })
            if resp.status_code == 401 and attempt == 0:
                continue
            if resp.status_code == 403:
                raise AdapterError(provider_http_error(self.label, operation, 403,
                                   f"accesso negato o quota API esaurita ({_provider_message(resp)})"))
            if resp.status_code >= 400:
                raise AdapterError(provider_http_error(self.label, operation, resp.status_code, _provider_message(resp)))
            return resp.json()
        raise AdapterError(provider_http_error(self.label, operation, 401, "token rifiutato anche dopo il refresh — riesegui \"Collega Octorate\""))

    async def test_connection(self, connection: dict) -> dict:
        checks = []
        result = {"ok": False, "provider": self.provider, "mode": self.mode, "checks": checks, "missing": []}
        app = await get_app_settings()
        missing_app = [k for k in ("client_id", "client_secret", "redirect_uri") if not app.get(k)]
        if missing_app:
            msg = "Credenziali app Octorate mancanti: " + ", ".join(missing_app) + " (configura \"App Octorate\")"
            checks.append({"name": "Configurazione app", "ok": False, "detail": msg})
            result["error"] = msg
            result["missing"] = missing_app
            return result
        checks.append({"name": "Configurazione app", "ok": True, "detail": "Client ID / Secret / Redirect URI configurati"})
        oauth = connection.get("oauth") or {}
        if not oauth.get("refresh_token") and not oauth.get("access_token"):
            msg = "Account non ancora autorizzato: clicca \"Collega Octorate\" per completare il flusso OAuth"
            checks.append({"name": "Autorizzazione OAuth", "ok": False, "detail": msg})
            result["error"] = msg
            result["missing"] = ["Autorizzazione OAuth dell'account Octorate"]
            return result
        try:
            await self._get_token(connection)
            checks.append({"name": "Autorizzazione OAuth", "ok": True, "detail": "Access token valido (rinnovo automatico via refresh token)"})
        except AdapterError as e:
            checks.append({"name": "Autorizzazione OAuth", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            return result
        try:
            data = await self._get(connection, "/rest/v1/accommodation", {}, "lettura accommodation")
            items = data if isinstance(data, list) else []
            checks.append({"name": "Lettura proprietà", "ok": True, "detail": f"{len(items)} accommodation accessibili"})
            result["properties_found"] = len(items)
            result["property_names"] = [i.get("name") for i in items[:10]]
            if items:
                acc_id = items[0].get("id")
                today = datetime.now(timezone.utc).date()
                res = await self._get(connection, f"/rest/v1/reservation/{acc_id}", {
                    "type": "CHECKIN", "startDate": str(today), "endDate": str(today.replace(year=today.year + 1)),
                    "size": 10, "page": 0,
                }, "lettura prenotazioni")
                rows = res if isinstance(res, list) else []
                checks.append({"name": "Lettura prenotazioni", "ok": True, "detail": f"{len(rows)} prenotazioni leggibili (probe prima accommodation)"})
                result["reservations_readable"] = len(rows)
                dates = sorted(filter(None, ((r.get("checkin") or "")[:10] for r in rows)))
                if dates:
                    result["last_reservation_date"] = dates[-1]
        except AdapterError as e:
            checks.append({"name": "Lettura dati", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            return result
        result["ok"] = True
        return result

    async def list_properties(self, connection: dict) -> List[NormalizedProperty]:
        out, page = [], 0
        while True:
            data = await self._get(connection, "/rest/v1/accommodation", {"page": page}, "lettura accommodation")
            items = data if isinstance(data, list) else []
            if not items:
                break
            for i in items:
                out.append(NormalizedProperty(
                    external_id=str(i["id"]),
                    name=i.get("name") or str(i["id"]),
                ))
            if len(items) < 20:
                break
            page += 1
            if page > 50:
                break
        return out

    async def fetch_reservations(
        self, connection: dict, external_property_ids: List[str], date_from: str, date_to: str
    ) -> List[NormalizedReservation]:
        out = []
        for pid in external_property_ids:
            page = 0
            while True:
                data = await self._get(connection, f"/rest/v1/reservation/{pid}", {
                    "type": "CHECKIN", "startDate": date_from, "endDate": date_to,
                    "size": 100, "page": page,
                }, "sincronizzazione prenotazioni")
                rows = data if isinstance(data, list) else []
                if not rows:
                    break
                for r in rows:
                    n = _normalize(r)
                    if not n.external_property_id:
                        n.external_property_id = str(pid)
                    out.append(n)
                if len(rows) < 100:
                    break
                page += 1
        return out

    async def fetch_reservations_by_ids(self, connection: dict, items: List[dict]) -> List[NormalizedReservation]:
        out = []
        for item in items:
            rid = item.get("external_id")
            pid = item.get("external_property_id")
            if not pid:
                continue
            try:
                data = await self._get(connection, f"/rest/v1/reservation/{pid}/{rid}", {}, "verifica prenotazione")
            except AdapterError:
                continue
            if isinstance(data, dict) and data.get("id") is not None:
                n = _normalize(data)
                if not n.external_property_id:
                    n.external_property_id = str(pid)
                out.append(n)
        return out
