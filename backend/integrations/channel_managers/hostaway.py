"""Hostaway adapter — Hostaway Public API ufficiale.

Auth: OAuth2 client-credentials (Account ID + Client Secret/API key).
Token URL: POST https://api.hostaway.com/v1/accessTokens (form, scope=general).
Token valido 24 mesi → salvato in DB e riusato, MAI rigenerato a ogni chiamata.
Endpoints: GET /v1/listings, GET /v1/reservations, GET /v1/reservations/{id}.
Webhook: predisposto receiver per reservation created/updated (Basic Auth).
"""
import time
from typing import List, Optional

import httpx

from integrations.token_store import save_oauth
from .base import AdapterError, BaseAdapter, NormalizedProperty, NormalizedReservation, provider_http_error

API = "https://api.hostaway.com"

STATUS_MAP = {
    "new": "confirmed",
    "modified": "confirmed",
    "confirmed": "confirmed",
    "ownerstay": "confirmed",
    "cancelled": "cancelled",
    "declined": "cancelled",
    "expired": "cancelled",
    "inquirydenied": "cancelled",
    "inquirytimedout": "cancelled",
    "inquirynotpossible": "cancelled",
    "pending": "pending",
    "awaitingpayment": "pending",
    "inquiry": "option",
    "inquirypreapproved": "option",
    "unknown": "unknown",
}


def _provider_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        return str(body.get("message") or body.get("error_description") or body.get("error") or resp.text[:200])
    except Exception:
        return resp.text[:200] or resp.reason_phrase


def _normalize(r: dict) -> NormalizedReservation:
    raw_status = r.get("status")
    guests = r.get("numberOfGuests") or r.get("adults")
    try:
        guests = int(guests) if guests is not None else None
    except (TypeError, ValueError):
        guests = None
    listing = r.get("listingMapId") or r.get("listingId")
    return NormalizedReservation(
        external_id=str(r.get("id")),
        check_in=(r.get("arrivalDate") or "")[:10] or None,
        check_out=(r.get("departureDate") or "")[:10] or None,
        status=STATUS_MAP.get(str(raw_status).lower(), "unknown"),
        status_raw=str(raw_status) if raw_status else None,
        guests_count=guests,
        guest_name=r.get("guestName"),
        channel=r.get("channelName"),
        external_property_id=str(listing) if listing is not None else None,
        external_created_at=r.get("insertedOn"),
        external_updated_at=r.get("updatedOn"),
    )


class HostawayAdapter(BaseAdapter):
    provider = "hostaway"
    label = "Hostaway"
    implemented = True
    mode = "Hostaway Public API (OAuth2 client credentials)"
    credential_fields = [
        {"key": "account_id", "label": "Account ID", "secret": False,
         "help": "Da Hostaway → Settings → Hostaway API"},
        {"key": "client_secret", "label": "Client Secret / API key", "secret": True,
         "help": "Credenziale API ufficiale Hostaway. Salvata solo nel backend"},
        {"key": "webhook_login", "label": "Webhook login (opzionale)", "secret": False,
         "help": "Username Basic Auth da configurare anche nel webhook Hostaway"},
        {"key": "webhook_password", "label": "Webhook password (opzionale)", "secret": True,
         "help": "Password Basic Auth del webhook. Configurala uguale su Hostaway"},
    ]
    notes = ("API ufficiale Hostaway Public API. Token OAuth2 client-credentials valido 24 mesi, "
             "salvato nel backend e riusato. Webhook predisposto: registra su Hostaway "
             "(Settings → Integrations → Add Webhook) l'URL webhook mostrato sulla connessione, "
             "con gli stessi login/password webhook, eventi reservation created/updated.")
    missing_requirements = []

    def _creds(self, connection: dict) -> dict:
        creds = (connection or {}).get("credentials") or {}
        missing = [k for k in ("account_id", "client_secret") if not creds.get(k)]
        if missing:
            raise AdapterError("Credenziali Hostaway mancanti: " + ", ".join(missing))
        return creds

    async def _get_token(self, connection: dict, force: bool = False) -> str:
        oauth = connection.get("oauth") or {}
        now = time.time()
        if not force and oauth.get("access_token") and oauth.get("expires_at", 0) > now + 60:
            return oauth["access_token"]
        creds = self._creds(connection)
        async with httpx.AsyncClient(timeout=25) as http:
            resp = await http.post(f"{API}/v1/accessTokens", headers={
                "Cache-Control": "no-cache",
                "Content-Type": "application/x-www-form-urlencoded",
            }, data={
                "grant_type": "client_credentials",
                "client_id": str(creds["account_id"]).strip(),
                "client_secret": creds["client_secret"],
                "scope": "general",
            })
        if resp.status_code in (401, 403):
            raise AdapterError(provider_http_error(self.label, "richiesta token", resp.status_code,
                               f"Account ID o Client Secret non validi ({_provider_message(resp)})"))
        if resp.status_code >= 400:
            raise AdapterError(provider_http_error(self.label, "richiesta token", resp.status_code, _provider_message(resp)))
        body = resp.json()
        token = body.get("access_token")
        if not token:
            raise AdapterError(f"{self.label}: risposta token senza access_token — {str(body)[:150]}")
        oauth = {"access_token": token, "expires_at": now + int(body.get("expires_in", 24 * 30 * 24 * 3600)) - 60}
        connection["oauth"] = oauth
        if connection.get("id"):
            await save_oauth(connection["id"], oauth)
        return token

    async def _get(self, connection: dict, path: str, params: dict, operation: str) -> dict:
        for attempt in range(2):
            token = await self._get_token(connection, force=attempt == 1)
            async with httpx.AsyncClient(timeout=30) as http:
                resp = await http.get(f"{API}{path}", params=params, headers={
                    "Authorization": f"Bearer {token}", "Accept": "application/json",
                })
            if resp.status_code == 403 and attempt == 0:
                connection["oauth"] = {}
                continue
            if resp.status_code == 429:
                raise AdapterError(provider_http_error(self.label, operation, 429,
                                   "rate limit Hostaway (15 req/10s per IP, 20 req/10s per account) — riprova a breve"))
            if resp.status_code >= 400:
                raise AdapterError(provider_http_error(self.label, operation, resp.status_code, _provider_message(resp)))
            return resp.json()
        raise AdapterError(provider_http_error(self.label, operation, 403, "token rifiutato anche dopo il rinnovo — verifica autorizzazioni account"))

    async def test_connection(self, connection: dict) -> dict:
        checks = []
        result = {"ok": False, "provider": self.provider, "mode": self.mode, "checks": checks, "missing": []}
        try:
            await self._get_token(connection)
            checks.append({"name": "Autenticazione OAuth2", "ok": True,
                           "detail": f"Account {((connection.get('credentials') or {}).get('account_id'))} riconosciuto, token salvato (valido 24 mesi)"})
        except AdapterError as e:
            checks.append({"name": "Autenticazione OAuth2", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            return result
        except httpx.HTTPError as e:
            msg = f"Endpoint Hostaway non raggiungibile: {e}"
            checks.append({"name": "Autenticazione OAuth2", "ok": False, "detail": msg})
            result["error"] = msg
            return result
        try:
            data = await self._get(connection, "/v1/listings", {"limit": 100, "offset": 0}, "lettura listing")
            items = data.get("result") or []
            count = data.get("count") if data.get("count") is not None else len(items)
            checks.append({"name": "Lettura listing", "ok": True, "detail": f"{count} listing trovati"})
            result["properties_found"] = count
            result["property_names"] = [i.get("name") or i.get("internalListingName") for i in items[:10]]
        except AdapterError as e:
            checks.append({"name": "Lettura listing", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            return result
        try:
            data = await self._get(connection, "/v1/reservations", {"limit": 10}, "lettura prenotazioni")
            items = data.get("result") or []
            count = data.get("count") if data.get("count") is not None else len(items)
            checks.append({"name": "Lettura prenotazioni", "ok": True, "detail": f"{count} prenotazioni leggibili"})
            result["reservations_readable"] = count
            dates = sorted(filter(None, ((i.get("arrivalDate") or "")[:10] for i in items)))
            if dates:
                result["last_reservation_date"] = dates[-1]
        except AdapterError as e:
            checks.append({"name": "Lettura prenotazioni", "ok": False, "detail": str(e)})
        result["ok"] = True
        return result

    async def list_properties(self, connection: dict) -> List[NormalizedProperty]:
        out, offset = [], 0
        while True:
            data = await self._get(connection, "/v1/listings", {"limit": 100, "offset": offset}, "lettura listing")
            items = data.get("result") or []
            if not items:
                break
            for i in items:
                out.append(NormalizedProperty(
                    external_id=str(i["id"]),
                    name=i.get("name") or i.get("internalListingName") or str(i["id"]),
                    address=i.get("address"),
                ))
            if len(items) < 100:
                break
            offset += 100
        return out

    async def fetch_reservations(
        self, connection: dict, external_property_ids: List[str], date_from: str, date_to: str
    ) -> List[NormalizedReservation]:
        out = []
        for pid in external_property_ids:
            after_id: Optional[int] = None
            while True:
                params = {
                    "limit": 100, "listingId": pid, "sortOrder": "updatedOn",
                    "arrivalEndDate": date_to,
                }
                if after_id is not None:
                    params["afterId"] = after_id
                data = await self._get(connection, "/v1/reservations", params, "sincronizzazione prenotazioni")
                items = data.get("result") or []
                if not items:
                    break
                for r in items:
                    n = _normalize(r)
                    if n.check_out and n.check_out < date_from:
                        continue
                    out.append(n)
                if len(items) < 100:
                    break
                after_id = items[-1].get("id")
        return out

    async def fetch_reservations_by_ids(self, connection: dict, items: List[dict]) -> List[NormalizedReservation]:
        out = []
        for item in items:
            rid = item.get("external_id")
            try:
                data = await self._get(connection, f"/v1/reservations/{rid}", {}, "verifica prenotazione")
            except AdapterError:
                continue
            r = data.get("result")
            if isinstance(r, dict) and r.get("id") is not None:
                out.append(_normalize(r))
        return out

    async def fetch_reservation_by_id(self, connection: dict, external_id: str) -> Optional[NormalizedReservation]:
        rows = await self.fetch_reservations_by_ids(connection, [{"external_id": external_id}])
        return rows[0] if rows else None
