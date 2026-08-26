"""SPIKE TECNICO TRACKER — Test Samsung SmartTag via SmartThings REST API ufficiale.

Metodo: API pubblica documentata https://api.smartthings.com/v1 con Personal Access Token.
Scopo: verificare EMPIRICAMENTE se latitude/longitude/timestamp di uno SmartTag
sono ottenibili da backend. NESSUN dato finto: se le coordinate non arrivano, lo dice.

Uso:
  export SMARTTHINGS_TOKEN=<Personal Access Token da https://account.smartthings.com/tokens>
  python3 /app/spike_tracker/samsung_smarttag_test.py

Scopes richiesti sul token: r:devices:* (e opzionale r:locations:*).
NOTA: i PAT creati dopo il 30/12/2024 scadono dopo 24 ore (limite ufficiale Samsung).
"""
import json
import os
import sys

import httpx

BASE = "https://api.smartthings.com/v1"
TOKEN = os.environ.get("SMARTTHINGS_TOKEN")

if not TOKEN:
    print("ERRORE: variabile ambiente SMARTTHINGS_TOKEN mancante.")
    print("Genera un Personal Access Token su https://account.smartthings.com/tokens")
    print("con scope 'r:devices:*' e lancialo così:")
    print("  SMARTTHINGS_TOKEN=xxx python3 /app/spike_tracker/samsung_smarttag_test.py")
    sys.exit(1)

HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def get(path):
    r = httpx.get(f"{BASE}{path}", headers=HEADERS, timeout=30)
    print(f"GET {path} -> HTTP {r.status_code}")
    if r.status_code == 401:
        print("  Token non valido o scaduto (i PAT nuovi durano 24h).")
        sys.exit(1)
    if r.status_code == 403:
        print("  403: scope insufficiente o risorsa non esposta all'API pubblica.")
        return None
    r.raise_for_status()
    return r.json()


def is_smarttag(dev):
    hay = " ".join(str(dev.get(k, "")) for k in ("name", "label", "deviceTypeName", "presentationId", "deviceManufacturerCode")).lower()
    caps = {c["id"] for comp in dev.get("components", []) for c in comp.get("capabilities", [])}
    return "smarttag" in hay or "tag.searchingStatus" in caps or "tag.factoryReset" in caps


def main():
    print("=== 1. Autenticazione + elenco device ===")
    data = get("/devices")
    devices = data.get("items", []) if data else []
    print(f"Device totali sull'account: {len(devices)}")

    tags = [d for d in devices if is_smarttag(d)]
    print(f"SmartTag identificati: {len(tags)}")
    if not tags:
        print("Nessuno SmartTag trovato: il tag va prima associato all'account nell'app SmartThings.")
        for d in devices:
            print(f"  - {d.get('label') or d.get('name')} ({d.get('deviceTypeName')})")
        return

    print("\n=== 2. Lettura stato per ogni SmartTag ===")
    for d in tags:
        did = d["deviceId"]
        caps = sorted({c["id"] for comp in d.get("components", []) for c in comp.get("capabilities", [])})
        print(f"\nSamsung SmartTag:")
        print(f"Nome: {d.get('label') or d.get('name')}")
        print(f"ID: {did}")
        print(f"Capabilities dichiarate: {caps}")

        status = get(f"/devices/{did}/status")
        main_comp = (status or {}).get("components", {}).get("main", {})
        geo = main_comp.get("geolocation") or {}
        lat = (geo.get("latitude") or {}).get("value")
        lng = (geo.get("longitude") or {}).get("value")
        ts = (geo.get("lastUpdateTime") or {}).get("value") or (geo.get("latitude") or {}).get("timestamp")
        batt = ((main_comp.get("battery") or {}).get("battery") or {}).get("value")

        print(f"Latitude: {lat if lat is not None else 'NON DISPONIBILE via API'}")
        print(f"Longitude: {lng if lng is not None else 'NON DISPONIBILE via API'}")
        print(f"Last location: {ts if ts else 'NON DISPONIBILE via API'}")
        print(f"Battery: {batt if batt is not None else 'NON DISPONIBILE via API'}")
        print(f"Method/API used: SmartThings REST API /v1/devices/{{id}}/status (PAT)")

        if lat is None or lng is None:
            print("ESITO: lo SmartTag è visibile come DEVICE, ma le coordinate SmartThings Find")
            print("       NON sono esposte dall'API pubblica (capability geolocation vuota).")
        else:
            print("ESITO: coordinate ottenute via API ufficiale.")
        print("--- status raw (main component) ---")
        print(json.dumps(main_comp, indent=2)[:2000])


if __name__ == "__main__":
    main()
