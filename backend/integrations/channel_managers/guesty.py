"""Guesty adapter — Guesty Open API ufficiale.

Auth: OAuth2 client-credentials (Client ID + Client Secret) server-to-server.
Token URL: https://open-api.guesty.com/oauth2/token (form-encoded, scope=open-api).
Token valido 24h; Guesty consente MAX 5 generazioni token per client/24h →
il token viene salvato in DB sulla connessione e riusato fino a scadenza.
Endpoints: GET /v1/listings, GET /v1/reservations (filters JSON, limit/skip).
"""
import asyncio
import json
import time
from typing import List, Optional

import httpx

from integrations.token_store import save_oauth
from .base import AdapterError, BaseAdapter, NormalizedProperty, NormalizedReservation, provider_http_error

TOKEN_URL = "https://open-api.guesty.com/oauth2/token"
API = "https://open-api.guesty.com/v1"

STATUS_MAP = {
    "confirmed": "confirmed",
    "closed": "confirmed",
    "reserved": "pending",
    "awaiting_payment": "pending",
    "inquiry": "option",
    "canceled": "cancelled",
    "cancelled": "cancelled",
    "declined": "cancelled",
    "expired": "cancelled",
}


def _provider_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        return str(body.get("error_description") or body.get("message") or body.get("error") or resp.text[:200])
    except Exception:
        return resp.text[:200] or resp.reason_phrase


def _guest_name(r: dict) -> Optional[str]:
    g = r.get("guest")
    if isinstance(g, dict):
        return g.get("fullName") or g.get("firstName")
    return r.get("guestName")


def _normalize(r: dict) -> NormalizedReservation:
    raw_status = r.get("status")
    guests = r.get("guestsCount") or r.get("numberOfGuests")
    try:
        guests = int(guests) if guests is not None else None
    except (TypeError, ValueError):
        guests = None
    return NormalizedReservation(
        external_id=str(r.get("_id")),
        check_in=(r.get("checkIn") or "")[:10] or None,
        check_out=(r.get("checkOut") or "")[:10] or None,
        status=STATUS_MAP.get(str(raw_status).lower(), "unknown"),
        status_raw=str(raw_status) if raw_status else None,
        guests_count=guests,
        guest_name=_guest_name(r),
        channel=r.get("source") or r.get("integration", {}).get("platform") if isinstance(r.get("integration"), dict) else r.get("source"),
        external_property_id=str(r.get("listingId")) if r.get("listingId") else None,
        external_created_at=r.get("createdAt"),
        external_updated_at=r.get("lastUpdatedAt"),
    )


class GuestyAdapter(BaseAdapter):
    provider = "guesty"
    label = "Guesty"
    implemented = True
    mode = "Guesty Open API (OAuth2 client credentials)"
    credential_fields = [
        {"key": "client_id", "label": "Client ID (Guesty Open API)", "secret": False,
         "help": "Da Guesty → Integrations → API & Webhooks → crea un'applicazione API"},
        {"key": "client_secret", "label": "Client Secret", "secret": True,
         "help": "Mostrato da Guesty solo alla creazione. Salvato solo nel backend"},
    ]
    notes = ("API ufficiale Guesty Open API. Autenticazione server-to-server OAuth2 client-credentials. "
             "Il token (24h) viene salvato nel backend e riusato: Guesty consente max 5 generazioni "
             "token al giorno. Nessun username/password richiesto.")
    missing_requirements = []

    def _creds(self, connection: dict) -> dict:
        creds = (connection or {}).get("credentials") or {}
        missing = [k for k in ("client_id", "client_secret") if not creds.get(k)]
        if missing:
            raise AdapterError("Credenziali Guesty mancanti: " + ", ".join(missing))
        return creds

    async def _get_token(self, connection: dict, force: bool = False) -> str:
        oauth = connection.get("oauth") or {}
        now = time.time()
        if not force and oauth.get("access_token") and oauth.get("expires_at", 0) > now + 300:
            return oauth["access_token"]
        creds = self._creds(connection)
        async with httpx.AsyncClient(timeout=25) as http:
            resp = await http.post(TOKEN_URL, headers={
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            }, data={
                "grant_type": "client_credentials",
                "scope": "open-api",
                "client_id": creds["client_id"].strip(),
                "client_secret": creds["client_secret"],
            })
        if resp.status_code == 401:
            raise AdapterError(provider_http_error(self.label, "richiesta token", 401,
                               f"Client ID o Client Secret non validi ({_provider_message(resp)})"))
        if resp.status_code == 429:
            raise AdapterError(provider_http_error(self.label, "richiesta token", 429,
                               "limite di generazione token Guesty raggiunto (max 5/24h) — il token in cache verrà riusato appena disponibile, riprova più tardi"))
        if resp.status_code >= 400:
            raise AdapterError(provider_http_error(self.label, "richiesta token", resp.status_code, _provider_message(resp)))
        body = resp.json()
        token = body.get("access_token")
        if not token:
            raise AdapterError(f"{self.label}: risposta token senza access_token")
        oauth = {"access_token": token, "expires_at": now + int(body.get("expires_in", 86400)) - 300}
        connection["oauth"] = oauth
        if connection.get("id"):
            await save_oauth(connection["id"], oauth)
        return token

    async def _get(self, connection: dict, path: str, params: dict, operation: str) -> dict:
        for attempt in range(3):
            token = await self._get_token(connection, force=attempt == 1)
            async with httpx.AsyncClient(timeout=30) as http:
                resp = await http.get(f"{API}{path}", params=params, headers={
                    "Authorization": f"Bearer {token}", "Accept": "application/json",
                })
            if resp.status_code in (401, 403) and attempt == 0:
                connection["oauth"] = {}
                continue
            if resp.status_code == 429:
                retry = float(resp.headers.get("Retry-After", 2))
                if attempt < 2:
                    await asyncio.sleep(min(retry, 10))
                    continue
                raise AdapterError(provider_http_error(self.label, operation, 429, "rate limit Guesty, riprova più tardi"))
            if resp.status_code == 403:
                raise AdapterError(provider_http_error(self.label, operation, 403,
                                   f"permessi insufficienti o Open API non abilitata sull'account ({_provider_message(resp)})"))
            if resp.status_code >= 400:
                raise AdapterError(provider_http_error(self.label, operation, resp.status_code, _provider_message(resp)))
            return resp.json()
        raise AdapterError(provider_http_error(self.label, operation, 401, "token rifiutato dopo il rinnovo"))

    @staticmethod
    def _rows(data) -> list:
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("results") or data.get("data") or []
        return []

    async def test_connection(self, connection: dict) -> dict:
        checks = []
        result = {"ok": False, "provider": self.provider, "mode": self.mode, "checks": checks, "missing": []}
        try:
            await self._get_token(connection)
            checks.append({"name": "Autenticazione OAuth2", "ok": True, "detail": "Token ottenuto e salvato (riusato fino a scadenza)"})
        except AdapterError as e:
            checks.append({"name": "Autenticazione OAuth2", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            return result
        except httpx.HTTPError as e:
            msg = f"Endpoint Guesty non raggiungibile: {e}"
            checks.append({"name": "Autenticazione OAuth2", "ok": False, "detail": msg})
            result["error"] = msg
            return result
        try:
            data = await self._get(connection, "/listings", {"fields": "_id title", "limit": 100, "skip": 0}, "lettura listing")
            rows = self._rows(data)
            count = data.get("count") if isinstance(data, dict) and data.get("count") is not None else len(rows)
            checks.append({"name": "Lettura listing", "ok": True, "detail": f"{count} listing/proprietà trovati"})
            result["properties_found"] = count
            result["property_names"] = [r.get("title") for r in rows[:10]]
        except AdapterError as e:
            checks.append({"name": "Lettura listing", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            return result
        try:
            data = await self._get(connection, "/reservations", {
                "fields": "_id status checkIn lastUpdatedAt", "limit": 5, "skip": 0, "sort": "-lastUpdatedAt",
            }, "lettura prenotazioni")
            rows = self._rows(data)
            count = data.get("count") if isinstance(data, dict) and data.get("count") is not None else len(rows)
            checks.append({"name": "Lettura prenotazioni", "ok": True, "detail": f"{count} prenotazioni leggibili"})
            result["reservations_readable"] = count
            dates = sorted(filter(None, ((r.get("checkIn") or "")[:10] for r in rows)))
            if dates:
                result["last_reservation_date"] = dates[-1]
        except AdapterError as e:
            checks.append({"name": "Lettura prenotazioni", "ok": False, "detail": str(e)})
        result["ok"] = True
        return result

    async def list_properties(self, connection: dict) -> List[NormalizedProperty]:
        out, skip = [], 0
        while True:
            data = await self._get(connection, "/listings", {
                "fields": "_id title address active", "limit": 100, "skip": skip, "sort": "_id",
            }, "lettura listing")
            rows = self._rows(data)
            if not rows:
                break
            for r in rows:
                addr = r.get("address") or {}
                addr_str = addr.get("full") if isinstance(addr, dict) else None
                out.append(NormalizedProperty(external_id=str(r["_id"]), name=r.get("title") or str(r["_id"]), address=addr_str))
            if len(rows) < 100:
                break
            skip += 100
        return out

    async def fetch_reservations(
        self, connection: dict, external_property_ids: List[str], date_from: str, date_to: str
    ) -> List[NormalizedReservation]:
        filters = json.dumps([
            {"field": "checkIn", "operator": "$lt", "value": f"{date_to}T23:59:59.999Z"},
            {"field": "checkOut", "operator": "$gt", "value": f"{date_from}T00:00:00.000Z"},
        ], separators=(",", ":"))
        fields = "_id status listingId checkIn checkOut guestsCount source confirmationCode createdAt lastUpdatedAt guest"
        out, skip = [], 0
        while True:
            data = await self._get(connection, "/reservations", {
                "filters": filters, "fields": fields, "sort": "_id", "limit": 100, "skip": skip,
            }, "sincronizzazione prenotazioni")
            rows = self._rows(data)
            if not rows:
                break
            out.extend(_normalize(r) for r in rows)
            if len(rows) < 100:
                break
            skip += 100
        wanted = set(str(x) for x in external_property_ids)
        return [r for r in out if r.external_property_id in wanted] if wanted else out

    async def fetch_reservations_by_ids(self, connection: dict, items: List[dict]) -> List[NormalizedReservation]:
        out = []
        fields = "_id status listingId checkIn checkOut guestsCount source createdAt lastUpdatedAt guest"
        for item in items:
            rid = item.get("external_id")
            filters = json.dumps([{"field": "_id", "operator": "$eq", "value": rid}], separators=(",", ":"))
            try:
                data = await self._get(connection, "/reservations", {
                    "filters": filters, "fields": fields, "limit": 1, "skip": 0,
                }, "verifica prenotazione")
            except AdapterError:
                continue
            rows = self._rows(data)
            if rows:
                out.append(_normalize(rows[0]))
        return out
