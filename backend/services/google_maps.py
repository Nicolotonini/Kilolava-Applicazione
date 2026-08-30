"""Google Maps server-side: Routes API (computeRoutes / computeRouteMatrix) + Geocoding API.

Chiave SOLO backend (GOOGLE_MAPS_SERVER_API_KEY). Nessun fallback alle API legacy:
se Google non risponde le funzioni ritornano None e chi chiama NON inventa dati.
"""
import os

import httpx

KEY = os.environ.get("GOOGLE_MAPS_SERVER_API_KEY")
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def _latlng(p):
    return {"location": {"latLng": {"latitude": p[0], "longitude": p[1]}}}


def _sec(v):
    try:
        return int(str(v).rstrip("s"))
    except (ValueError, TypeError):
        return None


async def geocode_address(address: str):
    """Ritorna {lat, lng, formatted_address, place_id} oppure None."""
    if not KEY or not address:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as cl:
            r = await cl.get(GEOCODE_URL, params={"address": address, "key": KEY, "region": "it"})
            d = r.json()
            if d.get("status") == "OK" and d.get("results"):
                res = d["results"][0]
                loc = res["geometry"]["location"]
                return {"lat": loc["lat"], "lng": loc["lng"],
                        "formatted_address": res.get("formatted_address"), "place_id": res.get("place_id")}
    except (httpx.HTTPError, KeyError, ValueError):
        pass
    return None


async def route_matrix(origins, destinations, mode="DRIVE"):
    """origins/destinations: liste di (lat, lng).
    Ritorna dict {(origin_idx, dest_idx): {"seconds", "meters"} | None} oppure None se l'API non risponde."""
    if not KEY or not origins or not destinations:
        return None
    body = {"origins": [{"waypoint": _latlng(p)} for p in origins],
            "destinations": [{"waypoint": _latlng(p)} for p in destinations],
            "travelMode": mode}
    try:
        async with httpx.AsyncClient(timeout=15) as cl:
            r = await cl.post(MATRIX_URL, json=body, headers={
                "X-Goog-Api-Key": KEY,
                "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition"})
            if r.status_code != 200:
                return None
            out = {}
            for e in r.json():
                k = (e.get("originIndex", 0), e.get("destinationIndex", 0))
                if e.get("condition") == "ROUTE_EXISTS":
                    out[k] = {"seconds": _sec(e.get("duration")) or 0, "meters": e.get("distanceMeters", 0)}
                else:
                    out[k] = None
            return out
    except httpx.HTTPError:
        return None


async def compute_route(origin, destination, waypoints=None, mode="DRIVE"):
    """origin/destination/waypoints: (lat, lng).
    Ritorna {polyline, distance_meters, duration_seconds, legs:[{distance_meters, duration_seconds}]} oppure None."""
    if not KEY or not origin or not destination:
        return None
    body = {"origin": _latlng(origin), "destination": _latlng(destination), "travelMode": mode}
    if waypoints:
        body["intermediates"] = [_latlng(p) for p in waypoints]
    try:
        async with httpx.AsyncClient(timeout=20) as cl:
            r = await cl.post(ROUTES_URL, json=body, headers={
                "X-Goog-Api-Key": KEY,
                "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters"})
            if r.status_code != 200 or not r.json().get("routes"):
                return None
            rt = r.json()["routes"][0]
            return {"polyline": rt.get("polyline", {}).get("encodedPolyline"),
                    "distance_meters": rt.get("distanceMeters", 0),
                    "duration_seconds": _sec(rt.get("duration")) or 0,
                    "legs": [{"distance_meters": leg.get("distanceMeters", 0),
                              "duration_seconds": _sec(leg.get("duration")) or 0}
                             for leg in rt.get("legs", [])]}
    except httpx.HTTPError:
        return None
