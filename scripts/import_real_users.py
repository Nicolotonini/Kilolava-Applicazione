"""Import idempotente dei 19 utenti reali Kilolava (upsert per usr_code, mai duplicati).
Aggiorna i profili esistenti (preserva id, password, PIN, attivazione, storico)
e crea i mancanti in stato 'pending activation' senza inventare dati."""
import os
import sys
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

now = datetime.now(timezone.utc).isoformat()


def contract(ctype=None, start=None, end=None, weekly=None, transform=None, appr_end=None, notes=""):
    if ctype is None:
        return None
    return {"type": ctype, "start_date": start, "end_date": end, "weekly_hours": weekly,
            "transformation_date": transform, "apprenticeship_end": appr_end, "notes": notes}


PROFILES = [
    {"usr_code": "USR-0000", "first_name": "Nicolò", "last_name": "Tonini", "display_name": "Nicolò",
     "login_username": "nicolo.tonini@kilolava.it", "role": "admin", "extra_roles": [],
     "tipo_rapporto": "direzione", "excluded_from_planning": True, "standard_available": False,
     "phone": None, "birth_date": None, "contract": None, "admin": {}},
    {"usr_code": "USR-0001", "first_name": "Super", "last_name": "Admin", "display_name": "Super Admin",
     "login_username": "admin@kilolava.it", "role": "admin", "extra_roles": [],
     "tipo_rapporto": "account_tecnico", "excluded_from_planning": True, "standard_available": False,
     "phone": None, "birth_date": None, "contract": None, "admin": {}},
    {"usr_code": "USR-0002", "first_name": "Diana", "last_name": "Nicolao", "display_name": "Diana",
     "login_username": "diana.nicolao@kilolava.it", "role": "operations_manager", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393396460000", "birth_date": "1976-06-17",
     "contract": contract("apprendistato", "2025-12-15", None, 40, None, "2028-06-14"),
     "admin": {"tax_code": "NCLDNI76H57L407A"}},
    {"usr_code": "USR-0003", "first_name": "Adyana", "last_name": "Ensenat Sabater", "display_name": "Adyana",
     "login_username": "adyana.ensenat.sabater@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393792649250", "birth_date": "1987-12-06",
     "contract": contract("indeterminato", "2026-04-20", None, 20, "2026-07-17"),
     "admin": {"tax_code": "NSNDYN87T46Z504W"}},
    {"usr_code": "USR-0004", "first_name": "Fulvio", "last_name": "Massignan", "display_name": "Fulvio",
     "login_username": "fulvio.massignan@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393792021366", "birth_date": "1979-09-03",
     "contract": contract("determinato", "2026-06-15", "2026-09-13", 20),
     "admin": {"tax_code": "MSSFLV79P03E379X"}},
    {"usr_code": "USR-0005", "first_name": "Aurelia", "last_name": "Buzzai", "display_name": "Aurelia",
     "login_username": "aurelia.buzzai@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393314168470", "birth_date": "2001-03-16",
     "contract": contract("determinato", "2026-03-16", "2026-10-31", 20, notes="Scadenza attuale dopo rinnovo"),
     "admin": {"tax_code": "BZZRLA01C56L424X"}},
    {"usr_code": "USR-0006", "first_name": "Luisa", "last_name": "Sanapo", "display_name": "Luisa",
     "login_username": "luisa.sanapo@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393792865902", "birth_date": "1976-12-30",
     "contract": contract("determinato", "2025-08-25", "2026-09-16", 20),
     "admin": {"tax_code": "SNPLSU76T70D332E"}},
    {"usr_code": "USR-0007", "first_name": "Nicoletta", "last_name": "Odorico", "display_name": "Nicoletta",
     "login_username": "nicoletta.odorico@kilolava.it", "role": "cleaner", "extra_roles": ["laundry"],
     "tipo_rapporto": "dipendente", "phone": "+393476864556", "birth_date": "1977-10-19",
     "contract": contract("intermittente", "2026-07-14", "2026-09-30", None, notes="Ore: variabile"),
     "admin": {"tax_code": "DRCNLT77R59L424Y"}},
    {"usr_code": "USR-0008", "first_name": "Mohammad", "last_name": "Mohi", "display_name": "Mohi",
     "login_username": "mohammad.mohi@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393514974536", "birth_date": "2000-12-26",
     "contract": contract("determinato", "2026-08-10", "2026-10-15", 20),
     "admin": {"tax_code": "MHOMMM00T26Z224V"}},
    {"usr_code": "USR-0009", "first_name": "Ahmad", "last_name": "Zeeshan", "display_name": "Zeeshan",
     "login_username": "ahmad.zeeshan@kilolava.it", "role": "rider", "extra_roles": [],
     "tipo_rapporto": "collaboratore_piva", "phone": "+393518935008", "birth_date": "1995-06-12",
     "contract": contract("collaborazione", None, None, None,
                          notes="Data inizio comunicata: 24/03 - anno da confermare"),
     "admin": {"tax_code": "HMDZHN95H12Z236G", "vat_number": "IT01446400325"}},
    {"usr_code": "USR-0010", "first_name": "Shahab", "last_name": "Hayat", "display_name": "Shahab",
     "login_username": "shahab.hayat@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393508037049", "birth_date": "2007-09-10",
     "contract": contract("determinato", "2026-08-13", "2026-09-12", 30),
     "admin": {"tax_code": "HYTSHB07P10Z236W"}},
    {"usr_code": "USR-0011", "first_name": "Muhammad", "last_name": "Zubair", "display_name": "Zubair",
     "login_username": "muhammad.zubair@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393511231744", "birth_date": "1989-06-13",
     "contract": contract("determinato", "2026-08-15", "2026-10-06", 30),
     "admin": {"tax_code": "ZBRMMM89H13Z236T"}},
    {"usr_code": "USR-0012", "first_name": "Alan", "last_name": "Zigon", "display_name": "Alan",
     "login_username": "alan.zigon@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393408689120", "birth_date": "1983-03-26",
     "contract": contract("determinato", "2026-08-18", "2026-10-31", 30),
     "admin": {"tax_code": "ZGNLNA83C26L424Z"}},
    {"usr_code": "USR-0013", "first_name": "Cristiana", "last_name": "Pettirosso", "display_name": "Cristiana",
     "login_username": "cristiana.pettirosso@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393895415088", "birth_date": "1965-04-02",
     "contract": contract("determinato", "2026-08-25", "2026-10-31", 20),
     "admin": {"tax_code": "PTTCST65D42L424G"}},
    {"usr_code": "USR-0014", "first_name": "Hadi", "last_name": "Fazal", "display_name": "Fazal",
     "login_username": "hadi.fazal@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": None, "birth_date": "2005-06-01",
     "contract": contract("determinato", "2026-08-26", "2026-10-31", 30),
     "admin": {"tax_code": "FZLHDA05H01Z236X"}},
    {"usr_code": "USR-0015", "first_name": "Sameen", "last_name": "Khan", "display_name": "Sameen",
     "login_username": "sameen.khan@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393508001335", "birth_date": "2001-07-15",
     "contract": contract("determinato", "2026-08-26", "2026-10-31", 30),
     "admin": {"tax_code": "KHNSMN01L15Z200Z"}},
    {"usr_code": "USR-0016", "first_name": "Farhan", "last_name": "Gul", "display_name": "Gul",
     "login_username": "farhan.gul@kilolava.it", "role": "cleaner", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": None, "birth_date": "1993-01-24",
     "contract": contract("determinato", "2026-08-26", "2026-10-31", 30),
     "admin": {"tax_code": "GLUFHN93A24Z236F"}},
    {"usr_code": "USR-0017", "first_name": "Mohammad Ali", "last_name": "Butt", "display_name": "Ali",
     "login_username": "mohammad.ali.butt@kilolava.it", "role": "rider", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393272878312", "birth_date": "1998-02-20",
     "contract": contract("determinato", "2026-05-01", "2026-10-31", 20, notes="Scadenza attuale dopo rinnovo"),
     "admin": {"tax_code": "BTTMMM98B20Z236Z"}},
    {"usr_code": "USR-0018", "first_name": "Snezana", "last_name": "Golubovic", "display_name": "Susanna",
     "login_username": "snezana.golubovic@kilolava.it", "role": "laundry", "extra_roles": [],
     "tipo_rapporto": "dipendente", "phone": "+393519295625", "birth_date": "1963-11-11",
     "contract": contract("determinato", "2025-03-25", "2026-10-31", 20),
     "admin": {"tax_code": "GLBSZN63S51Z118E"}},
]

ADMIN_FIELDS = ("tax_code", "vat_number", "iban", "iban_holder", "admin_notes")

created, updated, errors = [], [], []

for p in PROFILES:
    clash = db.users.find_one({"usr_code": {"$ne": p["usr_code"]},
                               "$or": [{"login_username": p["login_username"]}, {"email": p["login_username"]}]})
    if clash:
        errors.append(f"{p['usr_code']}: username {p['login_username']} già usato da {clash.get('usr_code')}")
        continue

    existing = db.users.find_one({"$or": [{"usr_code": p["usr_code"]}, {"login_username": p["login_username"]}]})
    name = p["display_name"] or f"{p['first_name']} {p['last_name']}".strip()
    profile_set = {
        "usr_code": p["usr_code"],
        "first_name": p["first_name"], "last_name": p["last_name"],
        "display_name": p["display_name"], "name": name,
        "login_username": p["login_username"],
        "role": p["role"], "extra_roles": p["extra_roles"],
        "tipo_rapporto": p["tipo_rapporto"],
        "excluded_from_planning": p.get("excluded_from_planning", False),
        "standard_available": p.get("standard_available", True),
        "phone": p["phone"], "contract": p["contract"],
        "is_active": True, "updated_at": now,
    }

    if existing:
        # AGGIORNA senza toccare id, credenziali, attivazione, storico
        old_admin = existing.get("admin_data") or {}
        new_admin = {k: old_admin.get(k) for k in ADMIN_FIELDS}
        for k, v in p["admin"].items():
            new_admin[k] = v  # i null dell'import non cancellano dati esistenti
        profile_set["admin_data"] = new_admin
        anag = existing.get("anagrafica") or {}
        if p["birth_date"]:
            anag["birth_date"] = p["birth_date"]
        profile_set["anagrafica"] = anag or None
        db.users.update_one({"id": existing["id"]}, {"$set": profile_set})
        updated.append(f"{p['usr_code']} {name} (id preservato: {existing['id'][:8]}…)")
    else:
        doc = {
            "id": str(uuid.uuid4()), "email": None,
            "password_hash": None, "pin_hash": None,
            "activation": {"status": "pending"},
            "language": "it", "vehicle_type": None, "client_id": None, "notes": None,
            "anagrafica": {"birth_date": p["birth_date"]} if p["birth_date"] else None,
            "admin_data": {k: p["admin"].get(k) for k in ADMIN_FIELDS},
            "created_at": now,
        }
        doc.update(profile_set)
        db.users.insert_one(doc)
        created.append(f"{p['usr_code']} {name}")

print("=== CREATI ===")
for c in created:
    print(" +", c)
print("=== AGGIORNATI ===")
for u in updated:
    print(" ~", u)
if errors:
    print("=== ERRORI ===")
    for e in errors:
        print(" !", e)
    sys.exit(1)
print("Import completato senza errori.")
