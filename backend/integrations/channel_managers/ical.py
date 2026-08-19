"""iCal fallback adapter — one feed URL per connection, mapped to one structure."""
from typing import List
from urllib.parse import urlparse

import httpx
from icalendar import Calendar as ICalendar

from .base import AdapterError, BaseAdapter, NormalizedProperty, NormalizedReservation

FEED_ID = "feed"


def _parse_feed(text: str) -> List[NormalizedReservation]:
    cal = ICalendar.from_ical(text)
    out = []
    for component in cal.walk():
        if component.name != "VEVENT":
            continue
        uid = str(component.get("UID", ""))
        dtstart = component.get("DTSTART")
        if not uid or not dtstart:
            continue
        dtend = component.get("DTEND")
        start_dt = dtstart.dt
        end_dt = dtend.dt if dtend else start_dt
        start = start_dt.strftime("%Y-%m-%d") if hasattr(start_dt, "strftime") else str(start_dt)[:10]
        end = end_dt.strftime("%Y-%m-%d") if hasattr(end_dt, "strftime") else str(end_dt)[:10]
        summary = str(component.get("SUMMARY", "")) or None
        out.append(NormalizedReservation(
            external_id=uid,
            check_in=start,
            check_out=end,
            status="confirmed",
            status_raw=summary,
            guest_name=summary,
            external_property_id=FEED_ID,
        ))
    return out


async def _fetch_text(url: str) -> str:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


class ICalAdapter(BaseAdapter):
    provider = "ical"
    label = "iCal (fallback)"
    implemented = True
    mode = "Feed iCal"
    credential_fields = [
        {"key": "feed_url", "label": "URL feed iCal", "secret": False,
         "help": "URL export iCal fornito dal gestionale o dal portale (Airbnb, Booking, Kross...)"},
    ]
    notes = ("Fallback quando non è disponibile una connessione API. Un feed corrisponde a una sola "
             "struttura. Le prenotazioni assenti dal feed vengono marcate come cancellate.")
    missing_requirements = []

    def _url(self, creds: dict) -> str:
        url = (creds or {}).get("feed_url", "").strip()
        if not url or not url.lower().startswith(("http://", "https://")):
            raise AdapterError("URL feed iCal mancante o non valido")
        return url

    async def test_connection(self, credentials: dict) -> dict:
        checks = []
        result = {"ok": False, "provider": self.provider, "mode": self.mode, "checks": checks, "missing": []}
        try:
            url = self._url(credentials)
        except AdapterError as e:
            checks.append({"name": "Configurazione", "ok": False, "detail": str(e)})
            result["error"] = str(e)
            return result
        try:
            text = await _fetch_text(url)
            checks.append({"name": "Download feed", "ok": True, "detail": "Feed raggiungibile"})
        except httpx.HTTPStatusError as e:
            checks.append({"name": "Download feed", "ok": False,
                           "detail": f"Il server del feed ha risposto {e.response.status_code}"})
            result["error"] = f"HTTP {e.response.status_code} dal feed"
            return result
        except httpx.HTTPError as e:
            checks.append({"name": "Download feed", "ok": False, "detail": f"Feed non raggiungibile: {e}"})
            result["error"] = str(e)
            return result
        try:
            reservations = _parse_feed(text)
        except Exception as e:
            checks.append({"name": "Parsing iCal", "ok": False, "detail": f"Contenuto non valido: {e}"})
            result["error"] = "Il contenuto scaricato non è un calendario iCal valido"
            return result
        checks.append({"name": "Parsing iCal", "ok": True,
                       "detail": f"{len(reservations)} prenotazioni/blocchi nel feed"})
        result["reservations_readable"] = len(reservations)
        dates = sorted(filter(None, (r.check_in for r in reservations)))
        if dates:
            result["last_reservation_date"] = dates[-1]
        result["ok"] = True
        return result

    async def list_properties(self, credentials: dict) -> List[NormalizedProperty]:
        url = self._url(credentials)
        host = urlparse(url).netloc or "feed"
        return [NormalizedProperty(external_id=FEED_ID, name=f"Feed iCal ({host})")]

    async def fetch_reservations(
        self, credentials: dict, external_property_ids: List[str], date_from: str, date_to: str
    ) -> List[NormalizedReservation]:
        url = self._url(credentials)
        try:
            text = await _fetch_text(url)
        except httpx.HTTPError as e:
            raise AdapterError(f"Feed iCal non raggiungibile: {e}")
        try:
            reservations = _parse_feed(text)
        except Exception as e:
            raise AdapterError(f"Feed iCal non valido: {e}")
        return [r for r in reservations if not (r.check_out and r.check_out < date_from)]
