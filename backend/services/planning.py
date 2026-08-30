"""Motori di pianificazione Kilolava (v1: regole + scoring deterministico).

CleaningPlanningService  -> proposta organizzazione Pulizie (timeline per operatrice)
DeliveryRoutingService   -> proposta giri Consegne (fermate ordinate per rider, km/tempi)
TravelService            -> tempi di viaggio: Google Distance Matrix se abilitata, altrimenti stima deterministica

Il sistema PROPONE: la conferma è sempre del Responsabile.
"""
import math

from core.database import db

SPEED_KMH = {"driving": 22, "walking": 4.5}
ROUTE_FACTOR = 1.35
STOP_OVERHEAD_MIN = {"driving": 4, "walking": 2}
DEFAULT_STOP_SERVICE_MIN = 10
CHECKIN_BUFFER_MIN = 15

_travel_cache = {}


async def get_operative_settings():
    s = await db.app_settings.find_one({"_id": "operative"}) or {}
    return {
        "stagione": s.get("stagione", "estivo"),
        "sede_address": s.get("sede_address", ""),
        "sede_lat": s.get("sede_lat"),
        "sede_lng": s.get("sede_lng"),
    }


def haversine_km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


async def travel_estimate(origin, dest, mode="driving"):
    """Google Routes API (computeRouteMatrix). Ritorna (minuti, km) oppure None se Google non risponde.
    NESSUN dato inventato e nessun fallback alle API legacy: chi chiama gestisce l'assenza del dato."""
    if not origin or not dest or origin[0] is None or dest[0] is None:
        return None
    key = (round(origin[0], 4), round(origin[1], 4), round(dest[0], 4), round(dest[1], 4), mode)
    if key in _travel_cache:
        return _travel_cache[key]
    from services.google_maps import route_matrix
    m = await route_matrix([origin], [dest], mode="DRIVE" if mode == "driving" else "WALK")
    el = (m or {}).get((0, 0))
    if not el:
        return None
    result = (max(1, round(el["seconds"] / 60)) + STOP_OVERHEAD_MIN[mode], round(el["meters"] / 1000, 1))
    _travel_cache[key] = result
    return result


def hhmm_to_min(s):
    try:
        h, m = str(s).split(":")[:2]
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        return None


def min_to_hhmm(m):
    m = max(0, int(round(m)))
    return f"{m // 60:02d}:{m % 60:02d}"


PRIO_RANK = {"low": 0, "normal": 1, "high": 2, "urgent": 3}


async def merged_day_availability(date: str, role: str):
    """Disponibilità del giorno = standard utente sovrascritta dall'override giornaliero (mai viceversa)."""
    users = await db.users.find({"role": role, "is_active": {"$ne": False}},
                                {"_id": 0, "id": 1, "name": 1, "ops_availability": 1, "anagrafica": 1}).to_list(200)
    overrides = {o["user_id"]: o async for o in db.day_availability.find({"date": date, "role": role}, {"_id": 0})}
    out = []
    for u in users:
        base = {"available": True, "start_time": "08:30", "end_time": "16:30", "max_hours": 8, "notes": ""}
        base.update({k: v for k, v in (u.get("ops_availability") or {}).items() if v is not None})
        ov = overrides.get(u["id"])
        merged = dict(base)
        if ov:
            for k in ("available", "day_off", "start_time", "end_time", "max_hours", "note", "vehicle"):
                if ov.get(k) is not None:
                    merged["notes" if k == "note" else k] = ov[k]
            if ov.get("day_off"):
                merged["available"] = False
        birth = (u.get("anagrafica") or {}).get("birth_date") or ""
        is_birthday = bool(birth) and len(birth) >= 10 and birth[5:10] == date[5:10]
        if is_birthday and not ov:
            merged["available"] = False
        out.append({"id": u["id"], "name": u["name"], "availability": merged,
                    "day_off": bool(ov.get("day_off")) if ov else (is_birthday or merged.get("available") is False and False),
                    "has_override": bool(ov), "is_birthday": is_birthday,
                    "vehicle": (ov or {}).get("vehicle")})
    return out


async def _gps_state(user_ids):
    """Stato GPS sintetico per utenti in servizio (per pannelli disponibilità)."""
    from datetime import datetime, timezone
    out = {}
    async for loc in db.user_locations.find({"user_id": {"$in": user_ids}, "active": True}, {"_id": 0}):
        sec = None
        if loc.get("timestamp"):
            try:
                ts = datetime.fromisoformat(loc["timestamp"].replace("Z", "+00:00"))
                sec = int((datetime.now(timezone.utc) - ts).total_seconds())
            except ValueError:
                sec = None
        out[loc["user_id"]] = "live" if (sec is not None and sec <= 120) else ("recente" if (sec is not None and sec <= 600) else "attivo")
    return out


# ================= CLEANING PLANNING =================

async def cleaning_propose(date: str, board: dict):
    settings = await get_operative_settings()
    sede = (settings["sede_lat"], settings["sede_lng"]) if settings["sede_lat"] else None
    tasks = [t for t in board["tasks"] if t.get("status") not in ("cancelled", "completed")]
    struct_ids = list({t["structure_id"] for t in tasks if t.get("structure_id")})
    structs = {s["id"]: s async for s in db.structures.find(
        {"id": {"$in": struct_ids}}, {"_id": 0, "id": 1, "latitude": 1, "longitude": 1, "check_out_time": 1})}

    def pos_of(t):
        s = structs.get(t.get("structure_id")) or {}
        return (s.get("latitude"), s.get("longitude")) if s.get("latitude") is not None else None

    def earliest_of(t):
        s = structs.get(t.get("structure_id")) or {}
        return hhmm_to_min(t.get("scheduled_time")) or hhmm_to_min(s.get("check_out_time")) or hhmm_to_min("10:00")

    def deadline_of(t):
        if t.get("checkin_today") and t.get("checkin_time"):
            return (hhmm_to_min(t["checkin_time"]) or 960) - CHECKIN_BUFFER_MIN
        return None

    cleaners = [c for c in board["cleaners"] if c["availability"].get("available", True)]
    alerts = [f"{c['name']}: giorno libero / non disponibile oggi" for c in board["cleaners"]
              if not c["availability"].get("available", True)]
    if not cleaners:
        return {"date": date, "assignments": [], "per_cleaner": [], "alerts": alerts + ["Nessuna operatrice disponibile in questa giornata"],
                "unassigned_count": len([t for t in tasks if not (t.get("assigned_cleaner_ids") or [])])}

    state = {}
    for c in cleaners:
        av = c["availability"]
        start = hhmm_to_min(av.get("start_time")) or hhmm_to_min("08:30")
        state[c["id"]] = {
            "cleaner": c, "time": start, "start": start,
            "end_limit": hhmm_to_min(av.get("end_time")) or hhmm_to_min("18:00"),
            "capacity": int((av.get("max_hours") or 8) * 60),
            "pos": sede, "load": 0, "travel": 0, "zones": set(), "schedule": [],
        }

    async def schedule_task(st, t, locked=False):
        tr = await travel_estimate(st["pos"], pos_of(t), "driving") if st["pos"] and pos_of(t) else None
        travel_min = tr[0] if tr else (10 if st["schedule"] else 0)
        dur = t.get("predicted_duration_minutes") or 60
        start = max(st["time"] + travel_min, earliest_of(t))
        end = start + dur
        st["time"], st["pos"] = end, pos_of(t) or st["pos"]
        st["load"] += dur
        st["travel"] += travel_min
        if t.get("zone_name"):
            st["zones"].add(t["zone_name"])
        dl = deadline_of(t)
        entry = {"task_id": t["id"], "structure_name": t.get("structure_name"), "klv_code": t.get("klv_code"),
                 "zone_name": t.get("zone_name"), "start": min_to_hhmm(start), "end": min_to_hhmm(end),
                 "travel_min": travel_min, "duration_min": dur, "locked": locked,
                 "checkin_time": t.get("checkin_time") if t.get("checkin_today") else None,
                 "early_checkin": bool(t.get("early_checkin"))}
        st["schedule"].append(entry)
        if dl is not None and end > dl:
            alerts.append(f"{st['cleaner']['name']}: {t.get('structure_name')} rischia il check-in {t.get('checkin_time')} (fine prevista {min_to_hhmm(end)})")
        return entry

    # 1) le pulizie già assegnate restano bloccate (l'Admin ha deciso): entrano nella timeline
    fixed, pending = [], []
    for t in tasks:
        (fixed if (t.get("assigned_cleaner_ids") or t.get("assigned_cleaner_id")) else pending).append(t)
    fixed.sort(key=lambda t: (deadline_of(t) or 9999, earliest_of(t)))
    for t in fixed:
        cid = next((c for c in (t.get("assigned_cleaner_ids") or [t.get("assigned_cleaner_id")]) if c in state), None)
        if cid:
            await schedule_task(state[cid], t, locked=True)

    # 2) proposta per le pulizie da assegnare: check-in anticipati prima, poi scadenze, priorità, zona
    pending.sort(key=lambda t: (0 if t.get("early_checkin") else 1, deadline_of(t) or 9999,
                                -PRIO_RANK.get(t.get("priority", "normal"), 1), t.get("zone_name") or "zzz"))
    assignments = []
    for t in pending:
        dur = t.get("predicted_duration_minutes") or 60
        dl = deadline_of(t)
        best, best_score = None, None
        for cid, st in state.items():
            travel_min = 10
            if st["pos"] and pos_of(t):
                tr = await travel_estimate(st["pos"], pos_of(t), "driving")
                if tr:
                    travel_min = tr[0]
            start = max(st["time"] + travel_min, earliest_of(t))
            end = start + dur
            score = end + travel_min * 1.5
            if dl is not None and end > dl:
                score += 2000
            if st["load"] + dur > st["capacity"]:
                score += 400
            if end > st["end_limit"]:
                score += 300
            if t.get("zone_name") and t["zone_name"] in st["zones"]:
                score -= 25
            if best_score is None or score < best_score:
                best, best_score = cid, score
        st = state[best]
        entry = await schedule_task(st, t)
        assignments.append({
            "task_id": t["id"], "structure_name": t.get("structure_name"), "klv_code": t.get("klv_code"),
            "zone_name": t.get("zone_name"), "predicted_duration_minutes": dur,
            "checkin_time": t.get("checkin_time") if t.get("checkin_today") else None,
            "early_checkin": bool(t.get("early_checkin")),
            "start": entry["start"], "end": entry["end"],
            "cleaner_ids": [best], "cleaner_names": [st["cleaner"]["name"]],
        })
        if st["load"] > st["capacity"]:
            alerts.append(f"{st['cleaner']['name']}: sovraccarico previsto ({st['load']} min su {st['capacity']} disponibili)")
        if t.get("early_checkin") and dur >= 120:
            alerts.append(f"{t.get('structure_name')}: check-in anticipato {t.get('checkin_time')} — valuta 2 operatrici")

    threshold = board.get("rest_threshold_days", 5)
    for cid, st in state.items():
        if st["cleaner"].get("consecutive_days", 0) >= threshold and st["schedule"]:
            alerts.append(f"{st['cleaner']['name']} è al {st['cleaner']['consecutive_days']}° giorno consecutivo: valuta riposo")
    per_cleaner = [{
        "cleaner_id": cid, "name": st["cleaner"]["name"],
        "start_time": min_to_hhmm(st["start"]), "end_time": min_to_hhmm(st["time"]) if st["schedule"] else None,
        "count": len(st["schedule"]), "total_minutes": st["load"], "travel_minutes": st["travel"],
        "capacity_minutes": st["capacity"], "schedule": st["schedule"],
        "zones": sorted(z for z in st["zones"] if z),
        "consecutive_days": st["cleaner"].get("consecutive_days", 0),
    } for cid, st in state.items() if st["schedule"]]
    return {"date": date, "assignments": assignments, "per_cleaner": per_cleaner,
            "alerts": list(dict.fromkeys(alerts)), "unassigned_count": len(pending)}


# ================= DELIVERY ROUTING =================

async def delivery_propose(date: str):
    settings = await get_operative_settings()
    sede = (settings["sede_lat"], settings["sede_lng"]) if settings["sede_lat"] else None
    riders = await merged_day_availability(date, "rider")
    gps = await _gps_state([r["id"] for r in riders])
    available = [r for r in riders if r["availability"].get("available", True)]
    alerts = [f"{r['name']}: giorno libero / non disponibile oggi" for r in riders if not r["availability"].get("available", True)]

    fermate = await db.logistics_tasks.find(
        {"date": date, "status": {"$in": ["unassigned", "assigned"]}}, {"_id": 0}).sort("route_order", 1).to_list(200)
    google_missing = False
    struct_ids = list({f["structure_id"] for f in fermate if f.get("structure_id")})
    structs = {s["id"]: s async for s in db.structures.find(
        {"id": {"$in": struct_ids}}, {"_id": 0, "id": 1, "name": 1, "klv_code": 1, "latitude": 1, "longitude": 1, "address": 1})}

    # Geocoding on-demand delle strutture senza coordinate (persistito, stessa logica di /giro-percorso)
    from services.google_maps import geocode_address
    from core.utils import now_iso
    for sid, s in structs.items():
        if s.get("latitude") is None and (s.get("address") or "").strip():
            addr = s["address"].strip()
            g = await geocode_address(addr) or await geocode_address(f"{addr}, Trieste, Italia")
            if g:
                s["latitude"], s["longitude"] = g["lat"], g["lng"]
                await db.structures.update_one({"id": sid}, {"$set": {
                    "latitude": g["lat"], "longitude": g["lng"],
                    "geocoded_at": now_iso(), "geocode_formatted": g.get("formatted_address")}})

    def pos_of(f):
        if f.get("latitude") is not None:
            return (f["latitude"], f["longitude"])
        s = structs.get(f.get("structure_id")) or {}
        return (s.get("latitude"), s.get("longitude")) if s.get("latitude") is not None else None

    def dest_of(f):
        s = structs.get(f.get("structure_id")) or {}
        return {"destination": s.get("name") or f.get("destination_label") or "—", "klv_code": s.get("klv_code")}

    if not available:
        return {"date": date, "riders": [], "unassigned": [{"fermata_id": f["id"], **dest_of(f)} for f in fermate],
                "alerts": alerts + ["Nessun rider disponibile in questa giornata"]}

    state = {}
    for r in available:
        av = r["availability"]
        start = hhmm_to_min(av.get("start_time")) or hhmm_to_min("09:00")
        state[r["id"]] = {"rider": r, "time": start, "start": start,
                          "end_limit": hhmm_to_min(av.get("end_time")) or hhmm_to_min("18:00"),
                          "pos": sede, "km": 0.0, "travel": 0, "stops": []}

    def deadline_of(f):
        return hhmm_to_min(f.get("time_window_end")) or hhmm_to_min((f.get("checkin_time") or "")) and (hhmm_to_min(f.get("checkin_time")) - CHECKIN_BUFFER_MIN)

    fermate.sort(key=lambda f: (deadline_of(f) or 9999, -PRIO_RANK.get(f.get("priority", "normal"), 1)))
    unassigned = []
    for f in fermate:
        p = pos_of(f)
        dl = deadline_of(f)
        best, best_score, best_tr = None, None, None
        for rid, st in state.items():
            tr = None
            if st["pos"] and p:
                tr = await travel_estimate(st["pos"], p, "driving")
                if tr is None:
                    google_missing = True
            arrival = st["time"] + (tr[0] if tr else 0)
            win_start = hhmm_to_min(f.get("time_window_start"))
            if win_start:
                arrival = max(arrival, win_start)
            score = arrival + len(st["stops"]) * 6
            if dl is not None and arrival + DEFAULT_STOP_SERVICE_MIN > dl:
                score += 2000
            if arrival > st["end_limit"]:
                score += 500
            if best_score is None or score < best_score:
                best, best_score, best_tr = rid, score, tr
        if best is None:
            unassigned.append({"fermata_id": f["id"], **dest_of(f)})
            continue
        st = state[best]
        arrival = st["time"] + (best_tr[0] if best_tr else 0)
        win_start = hhmm_to_min(f.get("time_window_start"))
        if win_start:
            arrival = max(arrival, win_start)
        st["stops"].append({
            "fermata_id": f["id"], **dest_of(f), "eta": min_to_hhmm(arrival),
            "travel_min": best_tr[0] if best_tr else None, "km": best_tr[1] if best_tr else None,
            "time_window_end": f.get("time_window_end"), "priority": f.get("priority", "normal"),
            "lines": [l.get("category") for l in (f.get("lines") or [])],
        })
        if dl is not None and arrival + DEFAULT_STOP_SERVICE_MIN > dl:
            alerts.append(f"{st['rider']['name']}: {dest_of(f)['destination']} rischia la finestra oraria (arrivo {min_to_hhmm(arrival)})")
        st["time"] = arrival + DEFAULT_STOP_SERVICE_MIN
        if best_tr:
            st["km"] += best_tr[1]
            st["travel"] += best_tr[0]
        st["pos"] = p or st["pos"]

    riders_out = []
    for rid, st in state.items():
        back = None
        if st["stops"] and sede and st["pos"]:
            back = await travel_estimate(st["pos"], sede, "driving")
            if back is None:
                google_missing = True
        back = back or (0, 0.0)
        riders_out.append({
            "rider_id": rid, "name": st["rider"]["name"], "gps": gps.get(rid),
            "start_time": min_to_hhmm(st["start"]),
            "end_time": min_to_hhmm(st["time"] + back[0]) if st["stops"] else None,
            "stops": st["stops"], "km_total": round(st["km"] + back[1], 1),
            "travel_min_total": st["travel"] + back[0],
            "total_min": (st["time"] + back[0] - st["start"]) if st["stops"] else 0,
        })
    if google_missing:
        alerts.append("Percorso temporaneamente non disponibile: Google Maps non risponde — tempi, km ed ETA non calcolati")
        for r in riders_out:
            for s in r["stops"]:
                s["eta"], s["travel_min"], s["km"] = None, None, None
            r["km_total"], r["travel_min_total"], r["end_time"], r["total_min"] = None, None, None, None
    return {"date": date, "sede": {"address": settings["sede_address"], "latitude": settings["sede_lat"], "longitude": settings["sede_lng"]},
            "riders": riders_out, "unassigned": unassigned, "alerts": list(dict.fromkeys(alerts)),
            "route_data_available": not google_missing}
