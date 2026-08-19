"""Kross Booking adapter.

Uses the same v5 JSON API consumed by the official Kross mobile app
(https://apiapp.krossbooking.com/v5) through the public krossApy client.
This is NOT the official partner API: the official contract requires the
Kross partner program / support. The adapter is transparent about this.
Read-only: only login, get_properties, search/dashboard/get_reservation are used.
"""
import asyncio
import time
from datetime import date, timedelta
from typing import List, Optional

from krossApy import KrossAPI
from krossApy.data.Errors import ConfigurationError, KrossAPIError, LoginError

from .base import AdapterError, BaseAdapter, NormalizedProperty, NormalizedReservation


def _pick(d: dict, *keys):
    for k in keys:
        v = d.get(k)
        if v not in (None, ""):
            return v
    return None


def _normalize_status(raw) -> str:
    if raw in (None, ""):
        return "unknown"
    up = str(raw).upper()
    if "CANC" in up:
        return "cancelled"
    if "NOSHOW" in up or ("NO" in up and "SHOW" in up):
        return "no_show"
    if "CONF" in up or up in ("OK", "BOOKED"):
        return "confirmed"
    if "WAIT" in up or "ATTESA" in up or "PAY" in up or "PEND" in up:
        return "pending"
    if "OPT" in up or "OPZ" in up:
        return "option"
    return "unknown"


def _walk_stubs(payload, acc=None) -> list:
    """Collect every dict containing an id_reservation key, at any nesting level."""
    if acc is None:
        acc = []
    if isinstance(payload, dict):
        if payload.get("id_reservation") is not None:
            acc.append(payload)
        for v in payload.values():
            _walk_stubs(v, acc)
    elif isinstance(payload, list):
        for v in payload:
            _walk_stubs(v, acc)
    return acc


def _date_str(v) -> Optional[str]:
    if v in (None, ""):
        return None
    return str(v)[:10]


def _to_normalized(r: dict, external_id: str) -> NormalizedReservation:
    guests = _pick(r, "n_beds", "n_guests", "guests", "pax")
    try:
        guests = int(guests) if guests is not None else None
    except (TypeError, ValueError):
        guests = None
    status_raw = _pick(r, "cod_reservation_status", "name_reservation_status", "status")
    prop = _pick(r, "id_property")
    return NormalizedReservation(
        external_id=str(external_id),
        check_in=_date_str(_pick(r, "arrival", "date_arrival", "checkin", "check_in")),
        check_out=_date_str(_pick(r, "departure", "date_departure", "checkout", "check_out")),
        status=_normalize_status(status_raw),
        status_raw=str(status_raw) if status_raw is not None else None,
        guests_count=guests,
        guest_name=_pick(r, "label", "guest_name", "name_guest", "owner"),
        channel=_pick(r, "name_channel", "channel", "cod_channel"),
        external_property_id=str(prop) if prop is not None else None,
        external_updated_at=_pick(r, "last_update", "date_last_update", "date_reservation"),
    )


def _extract_properties(data) -> List[NormalizedProperty]:
    items = []
    if isinstance(data, dict):
        for key in ("properties", "list", "items", "data"):
            if isinstance(data.get(key), list):
                items = data[key]
                break
        else:
            if data.get("id_property") is not None:
                items = [data]
    elif isinstance(data, list):
        items = data
    out = []
    for p in items:
        if not isinstance(p, dict):
            continue
        pid = _pick(p, "id_property", "id")
        if pid is None:
            continue
        name = _pick(p, "name", "name_property", "label") or f"Proprietà {pid}"
        out.append(NormalizedProperty(external_id=str(pid), name=str(name), raw={}))
    return out


class KrossAdapter(BaseAdapter):
    provider = "kross"
    label = "Kross Booking"
    implemented = True
    mode = "API app Kross v5 (non ufficiale)"
    credential_fields = [
        {"key": "hotel_id", "label": "Hotel ID", "secret": False,
         "help": "Codice account Kross, visibile nell'URL quando accedi (es. 'urbanauts')"},
        {"key": "username", "label": "Username", "secret": False,
         "help": "Lo stesso username usato per accedere a Kross"},
        {"key": "password", "label": "Password", "secret": True,
         "help": "Salvata solo nel backend, mai mostrata dopo il salvataggio"},
    ]
    notes = ("Usa la stessa API v5 dell'app mobile ufficiale Kross. Non è l'API ufficiale partner: "
             "Kross può modificarla senza preavviso. Per l'API ufficiale contattare il supporto "
             "Kross / partner program (partner.krossbooking.com) e richiedere il contratto di "
             "integrazione read-only. Stato attuale: configurazione API da verificare con Kross.")
    missing_requirements = []

    def _client(self, creds: dict) -> KrossAPI:
        creds = creds or {}
        missing = [k for k in ("hotel_id", "username", "password") if not creds.get(k)]
        if missing:
            raise AdapterError("Credenziali Kross mancanti: " + ", ".join(missing))
        api = KrossAPI(str(creds["hotel_id"]).strip())
        api.login(
            str(creds["username"]).strip(),
            creds["password"],
            device_id=f"kilolava-{creds['hotel_id']}",
            deviceName="Kilolava",
            deviceSystem="linux",
        )
        return api

    def _search_candidates(self, id_property, date_from: str, date_to: str) -> list:
        return [
            {"id_property": id_property, "arrival_from": date_from, "arrival_to": date_to, "page": 0},
            {"id_property": id_property, "date_from": date_from, "date_to": date_to, "page": 0},
        ]

    def _try_search(self, api: KrossAPI, id_property, date_from: str, date_to: str) -> Optional[list]:
        for payload in self._search_candidates(id_property, date_from, date_to):
            try:
                resp = api.search_reservations(**payload)
                stubs = _walk_stubs(resp)
                if stubs:
                    return stubs
            except (KrossAPIError, ConfigurationError):
                continue
        return None

    def _bucket_stubs(self, api: KrossAPI, id_property, day: str, bucket: str) -> list:
        try:
            return _walk_stubs(api.get_dashboard_bucket(bucket, int(id_property), day))
        except (KrossAPIError, ConfigurationError, ValueError, TypeError):
            return []

    # ---------- test connection ----------
    async def test_connection(self, connection: dict) -> dict:
        return await asyncio.to_thread(self._test_sync, (connection or {}).get("credentials") or {})

    def _test_sync(self, creds: dict) -> dict:
        checks = []
        result = {"ok": False, "provider": self.provider, "mode": self.mode, "checks": checks, "missing": []}
        try:
            api = self._client(creds)
        except AdapterError as e:
            checks.append({"name": "Credenziali", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            result["missing"] = [str(e)]
            return result
        except LoginError:
            checks.append({"name": "Autenticazione", "ok": False,
                           "detail": "Login rifiutato da Kross: verifica Hotel ID, username e password"})
            result["error"] = "Login rifiutato da Kross (credenziali o Hotel ID errati)"
            return result
        except (KrossAPIError, ConfigurationError) as e:
            checks.append({"name": "Autenticazione", "ok": False,
                           "detail": f"Endpoint Kross non raggiungibile o risposta inattesa: {e}"})
            result["error"] = str(e)
            return result
        try:
            checks.append({"name": "Autenticazione", "ok": True,
                           "detail": f"Account '{creds.get('hotel_id')}' riconosciuto, token ottenuto"})
            try:
                props = _extract_properties(api.get_properties())
                checks.append({"name": "Lettura proprietà", "ok": True,
                               "detail": f"{len(props)} strutture/listing trovati"})
                result["properties_found"] = len(props)
                result["property_names"] = [p.name for p in props[:10]]
            except (KrossAPIError, ConfigurationError) as e:
                checks.append({"name": "Lettura proprietà", "ok": False,
                               "detail": f"Errore lettura proprietà: {e}"})
                result["error"] = str(e)
                return result

            stubs, strategy = self._probe(api, props)
            if stubs:
                dates = sorted(filter(None, (_date_str(_pick(s, "arrival", "date_arrival")) for s in stubs)))
                checks.append({"name": "Lettura prenotazioni", "ok": True,
                               "detail": f"{len(stubs)} prenotazioni leggibili (strategia: {strategy})"})
                result["reservations_readable"] = len(stubs)
                if dates:
                    result["last_reservation_date"] = dates[-1]
            else:
                checks.append({"name": "Lettura prenotazioni", "ok": False,
                               "detail": ("Nessuna prenotazione leggibile nel periodo di test (±7 giorni). "
                                          "Può essere normale se non ci sono prenotazioni recenti; "
                                          "riprova dopo il mapping con 'Sincronizza ora'.")})
                result["reservations_readable"] = 0
            result["ok"] = True
            return result
        finally:
            api.session.close()

    def _probe(self, api: KrossAPI, props: List[NormalizedProperty]):
        d_from = (date.today() - timedelta(days=7)).isoformat()
        d_to = (date.today() + timedelta(days=7)).isoformat()
        for p in props[:3]:
            stubs = self._try_search(api, p.external_id, d_from, d_to)
            if stubs:
                return stubs, "search-reservation"
        today = date.today().isoformat()
        collected = []
        for p in props[:3]:
            for bucket in ("arrivals", "stays", "departures"):
                collected.extend(self._bucket_stubs(api, p.external_id, today, bucket))
            if collected:
                return collected, "dashboard"
        return [], None

    # ---------- properties ----------
    async def list_properties(self, connection: dict) -> List[NormalizedProperty]:
        credentials = (connection or {}).get("credentials") or {}
        def run():
            api = self._client(credentials)
            try:
                return _extract_properties(api.get_properties())
            finally:
                api.session.close()
        try:
            return await asyncio.to_thread(run)
        except LoginError:
            raise AdapterError("Login rifiutato da Kross (credenziali o Hotel ID errati)")
        except (KrossAPIError, ConfigurationError) as e:
            raise AdapterError(f"Errore Kross durante la lettura proprietà: {e}")

    # ---------- reservations ----------
    async def fetch_reservations(
        self, connection: dict, external_property_ids: List[str], date_from: str, date_to: str
    ) -> List[NormalizedReservation]:
        credentials = (connection or {}).get("credentials") or {}
        try:
            return await asyncio.to_thread(
                self._fetch_sync, credentials, external_property_ids, date_from, date_to
            )
        except LoginError:
            raise AdapterError("Login rifiutato da Kross (credenziali o Hotel ID errati)")
        except (KrossAPIError, ConfigurationError) as e:
            raise AdapterError(f"Errore Kross durante la sincronizzazione: {e}")

    def _fetch_sync(self, creds, external_property_ids, date_from, date_to):
        api = self._client(creds)
        try:
            found = {}
            for pid in external_property_ids:
                stubs = self._try_search(api, pid, date_from, date_to)
                if stubs is None:
                    stubs = []
                    d = date.fromisoformat(date_from)
                    end = date.fromisoformat(date_to)
                    while d <= end:
                        stubs.extend(self._bucket_stubs(api, pid, d.isoformat(), "arrivals"))
                        time.sleep(0.12)
                        d += timedelta(days=1)
                    stubs.extend(self._bucket_stubs(api, pid, date.today().isoformat(), "stays"))
                for s in stubs:
                    rid = s.get("id_reservation")
                    if rid is not None:
                        found.setdefault(str(rid), (s, str(pid)))
            return self._details(api, found)
        finally:
            api.session.close()

    def _details(self, api: KrossAPI, found: dict) -> List[NormalizedReservation]:
        out = []
        for rid, (stub, pid) in found.items():
            src = stub
            try:
                detail = api.get_reservation(int(rid))
                if isinstance(detail, dict) and detail:
                    src = detail
            except (KrossAPIError, ConfigurationError, ValueError, TypeError):
                pass
            n = _to_normalized(src, rid)
            if not n.external_property_id:
                n.external_property_id = pid
            out.append(n)
            time.sleep(0.08)
        return out

    async def fetch_reservations_by_ids(
        self, connection: dict, items: List[dict]
    ) -> List[NormalizedReservation]:
        credentials = (connection or {}).get("credentials") or {}
        external_ids = [i.get("external_id") for i in items]
        def run():
            api = self._client(credentials)
            try:
                out = []
                for rid in external_ids:
                    try:
                        detail = api.get_reservation(int(rid))
                        if isinstance(detail, dict) and detail:
                            out.append(_to_normalized(detail, rid))
                    except (KrossAPIError, ConfigurationError, ValueError, TypeError):
                        continue
                    time.sleep(0.08)
                return out
            finally:
                api.session.close()
        try:
            return await asyncio.to_thread(run)
        except LoginError:
            raise AdapterError("Login rifiutato da Kross (credenziali o Hotel ID errati)")
