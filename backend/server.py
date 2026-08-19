from fastapi import FastAPI, APIRouter, HTTPException, Depends, File, UploadFile, Query, Header, Form
from fastapi import status as http_status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("Europe/Rome")


def local_today() -> str:
    return datetime.now(BUSINESS_TZ).strftime("%Y-%m-%d")
import jwt
from passlib.context import CryptContext
import requests as http_requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Shared core modules
from core.database import db, client  # noqa: E402
from core.utils import now_iso  # noqa: E402
from core.enums import (  # noqa: E402
    UserRole, ALL_ROLES, OPS_ROLES,
    StructureType, StructureService,
    EventType, EventStatus, AutomationRule,
)

# Services (recently migrated logic)
from services.calendar_automation import (  # noqa: E402
    CHECKOUT_TASK_DEFINITIONS,
    task_exists_with_rule as _task_exists_with_rule,
    auto_generate_checkout_tasks as _auto_generate_checkout_tasks,
)
from services.ical_sync import (  # noqa: E402
    detect_ical_source as _detect_ical_source,
    sync_structure_ical as _sync_structure_ical,
)
from services import scheduler_service  # noqa: E402

# Security
SECRET_KEY = os.environ.get('JWT_SECRET', 'kilolava-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app
app = FastAPI(title="Kilolava API", version="2.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============== ENUMS ==============

ROLE_PERMISSIONS = {
    "admin": ["*"],
    "operations_manager": [
        "clients.read", "clients.write", "structures.read", "structures.write",
        "units.read", "units.write", "calendar.read", "calendar.write",
        "logistics.read", "logistics.write", "inventory.read", "inventory.write",
        "orders.read", "orders.write", "automation.read", "automation.write",
        "portal_ops.read", "portal_ops.write",
    ],
    "cleaner": ["tasks.own.read", "tasks.own.write"],
    "rider": ["logistics.own.read", "logistics.own.write"],
    "maintenance": ["maintenance.own.read", "maintenance.own.write"],
    "client": ["portal.read", "portal.write"],
}


OPS_ROLES = OPS_ROLES  # kept as legacy module-level alias for non-migrated code

class ClientType:
    PRIVATE = "private"
    COMPANY = "company"

class AccessType:
    KEYBOX = "keybox"
    KEYS = "keys"
    CODE = "code"

class UnitType:
    APARTMENT = "apartment"
    ROOM = "room"
    OFFICE = "office"
    OTHER = "other"

class LogisticsMode:
    DYNAMIC = "dynamic"
    FIXED = "fixed"

class ComplexityLevel:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

# ============== AUTH MODELS ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str = ""
    last_name: str = ""
    name: Optional[str] = None  # Legacy compat, computed from first+last
    role: str = UserRole.CLIENT
    language: str = "it"
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    first_name: str = ""
    last_name: str = ""
    name: str = ""
    role: str
    language: str = "it"
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None
    client_id: Optional[str] = None
    is_active: bool = True
    notes: Optional[str] = None
    permissions: List[str] = []
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ============== CLIENT MODELS ==============

# Private client info
class PrivateClientInfo(BaseModel):
    name: str = ""
    surname: str = ""
    address: Optional[str] = None
    fiscal_code: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    sdi: str = "0000000"

# Company client info
class CompanyClientInfo(BaseModel):
    company_name: str = ""
    representative_name: str = ""
    representative_surname: str = ""
    vat_number: Optional[str] = None
    fiscal_code: Optional[str] = None
    sdi: str = "0000000"
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    pec: Optional[str] = None

class ClientCreate(BaseModel):
    client_type: str = ClientType.PRIVATE
    private_info: Optional[PrivateClientInfo] = None
    company_info: Optional[CompanyClientInfo] = None
    notes: Optional[str] = None
    is_active: bool = True
    ordering_enabled: bool = False

class ClientUpdate(BaseModel):
    client_type: Optional[str] = None
    private_info: Optional[PrivateClientInfo] = None
    company_info: Optional[CompanyClientInfo] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    ordering_enabled: Optional[bool] = None

class ClientResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    client_type: str
    private_info: Optional[PrivateClientInfo] = None
    company_info: Optional[CompanyClientInfo] = None
    display_name: str = ""
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    ordering_enabled: bool = False
    has_portal_account: bool = False
    structure_count: int = 0
    logo_path: Optional[str] = None
    created_at: str
    updated_at: str

# ============== STRUCTURE MODELS ==============

class StructureCreate(BaseModel):
    client_id: str
    name: str
    structure_type: str = StructureType.APARTMENT
    address: Optional[str] = None
    floor: Optional[str] = None
    interior: Optional[str] = None
    operational_contact: Optional[str] = None
    parking_info: Optional[str] = None
    has_units: Optional[bool] = None
    access_type: str = AccessType.KEYBOX
    access_details: Optional[str] = None
    access_info: Optional[dict] = None  # {kilolava_has_keys, door_code, keybox_code, keybox_location, key_boxes}
    warehouse_info: Optional[dict] = None  # {location, code}
    ical_url: Optional[str] = None
    ical_source: Optional[str] = None  # airbnb, booking_com
    services: List[str] = []
    custom_services: List[str] = []  # user-defined additional services
    cleaning_template_id: Optional[str] = None
    check_in_time: Optional[str] = None  # e.g. "15:00"
    check_out_time: Optional[str] = None  # e.g. "10:00"
    bed_config: Optional[dict] = None  # {capacity_total, beds_double, beds_single, sofa_beds, capacity_persons}
    notes: Optional[str] = None
    is_active: bool = True

class StructureUpdate(BaseModel):
    name: Optional[str] = None
    structure_type: Optional[str] = None
    address: Optional[str] = None
    floor: Optional[str] = None
    interior: Optional[str] = None
    operational_contact: Optional[str] = None
    parking_info: Optional[str] = None
    has_units: Optional[bool] = None
    access_type: Optional[str] = None
    access_details: Optional[str] = None
    access_info: Optional[dict] = None
    warehouse_info: Optional[dict] = None
    ical_url: Optional[str] = None
    ical_source: Optional[str] = None
    services: Optional[List[str]] = None
    custom_services: Optional[List[str]] = None
    cleaning_template_id: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    bed_config: Optional[dict] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class StructureResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    client_id: str
    client_name: Optional[str] = None
    klv_code: Optional[str] = None
    name: str
    structure_type: str
    address: Optional[str] = None
    floor: Optional[str] = None
    interior: Optional[str] = None
    operational_contact: Optional[str] = None
    parking_info: Optional[str] = None
    access_type: str
    access_details: Optional[str] = None
    access_info: Optional[dict] = None
    warehouse_info: Optional[dict] = None
    ical_url: Optional[str] = None
    ical_source: Optional[str] = None
    services: List[str] = []
    custom_services: List[str] = []
    cleaning_template_id: Optional[str] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    bed_config: Optional[dict] = None
    notes: Optional[str] = None
    is_active: bool
    unit_count: int = 0
    has_units: bool = False
    has_multiple_units: bool = False
    created_at: str
    updated_at: str

# ============== UNIT MODELS ==============

class BedConfiguration(BaseModel):
    capacity_total: int = 0
    beds_double: int = 0
    beds_single: int = 0
    sofa_beds: int = 0
    capacity_persons: int = 0

class KitConfiguration(BaseModel):
    kit_double_per_set: int = 0
    kit_single_per_set: int = 0

class StockConfiguration(BaseModel):
    target_kit_sets: int = 3
    minimum_threshold: int = 1

class LogisticsConfiguration(BaseModel):
    logistics_mode: str = LogisticsMode.DYNAMIC
    pickup_days: List[str] = []  # mon, tue, wed, thu, fri, sat, sun
    pickup_time_window: Optional[str] = None  # e.g., "09:00-12:00"

class CleaningConfiguration(BaseModel):
    checklist_template_id: Optional[str] = None
    estimated_cleaning_time: int = 60  # minutes
    complexity_level: str = ComplexityLevel.MEDIUM

class UnitCreate(BaseModel):
    structure_id: str
    name: str
    unit_type: str = UnitType.APARTMENT
    bed_config: Optional[BedConfiguration] = None
    kit_config: Optional[KitConfiguration] = None
    stock_config: Optional[StockConfiguration] = None
    logistics_config: Optional[LogisticsConfiguration] = None
    cleaning_config: Optional[CleaningConfiguration] = None
    notes: Optional[str] = None
    is_active: bool = True

class UnitUpdate(BaseModel):
    name: Optional[str] = None
    unit_type: Optional[str] = None
    bed_config: Optional[BedConfiguration] = None
    kit_config: Optional[KitConfiguration] = None
    stock_config: Optional[StockConfiguration] = None
    logistics_config: Optional[LogisticsConfiguration] = None
    cleaning_config: Optional[CleaningConfiguration] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class UnitResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    structure_id: str
    structure_name: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    name: str
    unit_type: str
    bed_config: Optional[BedConfiguration] = None
    kit_config: Optional[KitConfiguration] = None
    stock_config: Optional[StockConfiguration] = None
    logistics_config: Optional[LogisticsConfiguration] = None
    cleaning_config: Optional[CleaningConfiguration] = None
    notes: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str

# ============== HELPER FUNCTIONS ==============

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token non valido")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if user is None:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token scaduto")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")

def serialize_config(config):
    """Convert Pydantic model to dict for MongoDB storage"""
    if config is None:
        return None
    if isinstance(config, BaseModel):
        return config.model_dump()
    return config


def has_permission(user: dict, permission: str) -> bool:
    role = user.get("role", "")
    perms = ROLE_PERMISSIONS.get(role, [])
    if "*" in perms:
        return True
    return permission in perms


def is_ops_user(user: dict) -> bool:
    return user.get("role") in OPS_ROLES


def _build_user_response(user: dict) -> UserResponse:
    """Build UserResponse from a raw user document."""
    first = user.get("first_name", "")
    last = user.get("last_name", "")
    name = user.get("name", "")
    if not first and not last and name:
        parts = name.split(" ", 1)
        first = parts[0]
        last = parts[1] if len(parts) > 1 else ""
    display_name = f"{first} {last}".strip() or name or user.get("email", "")
    role = user.get("role", "client")
    # Migrate legacy "manager" role
    if role == "manager":
        role = "admin"
    return UserResponse(
        id=user["id"], email=user.get("email", ""),
        first_name=first, last_name=last, name=display_name,
        role=role, language=user.get("language", "it"),
        phone=user.get("phone"), vehicle_type=user.get("vehicle_type"),
        client_id=user.get("client_id"), is_active=user.get("is_active", True),
        notes=user.get("notes"),
        permissions=ROLE_PERMISSIONS.get(role, []),
        created_at=user.get("created_at", ""),
    )

# ============== OBJECT STORAGE ==============

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "kilolava"
_storage_key = None

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = http_requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = http_requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = http_requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    user_id = str(uuid.uuid4())
    now = now_iso()
    first = user_data.first_name or (user_data.name.split(" ", 1)[0] if user_data.name else "")
    last = user_data.last_name or (user_data.name.split(" ", 1)[1] if user_data.name and " " in user_data.name else "")
    display_name = f"{first} {last}".strip() or user_data.name or user_data.email
    
    user_doc = {
        "id": user_id, "email": user_data.email,
        "password_hash": get_password_hash(user_data.password),
        "first_name": first, "last_name": last, "name": display_name,
        "role": user_data.role, "language": user_data.language,
        "phone": user_data.phone, "vehicle_type": user_data.vehicle_type,
        "client_id": user_data.client_id, "is_active": True,
        "notes": user_data.notes,
        "created_at": now, "updated_at": now,
    }
    await db.users.insert_one(user_doc)
    access_token = create_access_token({"sub": user_id})
    return TokenResponse(access_token=access_token, user=_build_user_response(user_doc))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(login_data: UserLogin):
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email o password non validi")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disattivato")
    access_token = create_access_token({"sub": user["id"]})
    return TokenResponse(access_token=access_token, user=_build_user_response(user))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return _build_user_response(current_user)

@api_router.put("/auth/me")
async def update_me(
    language: Optional[str] = None,
    name: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    update_data = {"updated_at": now_iso()}
    if language:
        update_data["language"] = language
    if name:
        update_data["name"] = name
        parts = name.split(" ", 1)
        update_data["first_name"] = parts[0]
        update_data["last_name"] = parts[1] if len(parts) > 1 else ""
    
    await db.users.update_one({"id": current_user["id"]}, {"$set": update_data})
    updated_user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return _build_user_response(updated_user)

# ============== CLIENT ENDPOINTS ==============

def get_client_display_name(client: dict) -> str:
    """Get display name based on client type"""
    client_type = client.get("client_type", "private")
    if client_type == "company":
        company_info = client.get("company_info", {})
        return company_info.get("company_name", "")
    else:
        private_info = client.get("private_info", {})
        name = private_info.get("name", "")
        surname = private_info.get("surname", "")
        return f"{name} {surname}".strip()

def get_client_phone(client: dict) -> Optional[str]:
    """Get phone based on client type"""
    client_type = client.get("client_type", "private")
    if client_type == "company":
        return client.get("company_info", {}).get("phone")
    return client.get("private_info", {}).get("phone")

def get_client_email(client: dict) -> Optional[str]:
    """Get email based on client type"""
    client_type = client.get("client_type", "private")
    if client_type == "company":
        return client.get("company_info", {}).get("email")
    return client.get("private_info", {}).get("email")

@api_router.post("/clients", response_model=ClientResponse)
async def create_client(client_data: ClientCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    client_id = str(uuid.uuid4())
    now = now_iso()
    
    client_doc = {
        "id": client_id,
        "client_type": client_data.client_type,
        "private_info": serialize_config(client_data.private_info) if client_data.private_info else None,
        "company_info": serialize_config(client_data.company_info) if client_data.company_info else None,
        "notes": client_data.notes,
        "is_active": client_data.is_active,
        "ordering_enabled": client_data.ordering_enabled,
        "created_at": now,
        "updated_at": now
    }
    
    await db.clients.insert_one(client_doc)
    
    display_name = get_client_display_name(client_doc)
    phone = get_client_phone(client_doc)
    email = get_client_email(client_doc)
    
    return ClientResponse(
        id=client_id,
        client_type=client_data.client_type,
        private_info=client_data.private_info,
        company_info=client_data.company_info,
        display_name=display_name,
        phone=phone,
        email=email,
        notes=client_data.notes,
        is_active=client_data.is_active,
        ordering_enabled=client_data.ordering_enabled,
        structure_count=0,
        created_at=now,
        updated_at=now
    )

@api_router.post("/clients/{client_id}/logo")
async def upload_client_logo(
    client_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in [UserRole.MANAGER, UserRole.OPS_MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image"):
        raise HTTPException(status_code=400, detail="Il file deve essere un'immagine")
    data = await file.read()
    path = f"{APP_NAME}/clients/{client_id}/logo_{uuid.uuid4()}.{ext}"
    result = put_object(path, data, content_type)
    await db.clients.update_one({"id": client_id}, {"$set": {"logo_path": result["path"], "updated_at": now_iso()}})
    return {"logo_path": result["path"]}

@api_router.delete("/clients/{client_id}/logo")
async def delete_client_logo(client_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER, UserRole.OPS_MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.clients.update_one({"id": client_id}, {"$set": {"logo_path": None, "updated_at": now_iso()}})
    return {"message": "Logo rimosso"}

@api_router.get("/clients", response_model=List[ClientResponse])
async def get_clients(
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    client_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if client_type:
        query["client_type"] = client_type
    if search:
        query["$or"] = [
            {"private_info.name": {"$regex": search, "$options": "i"}},
            {"private_info.surname": {"$regex": search, "$options": "i"}},
            {"company_info.company_name": {"$regex": search, "$options": "i"}},
            {"private_info.email": {"$regex": search, "$options": "i"}},
            {"company_info.email": {"$regex": search, "$options": "i"}},
        ]
    
    clients = await db.clients.find(query, {"_id": 0}).to_list(1000)
    
    client_ids = [c["id"] for c in clients]
    pipeline = [
        {"$match": {"client_id": {"$in": client_ids}}},
        {"$group": {"_id": "$client_id", "count": {"$sum": 1}}}
    ]
    counts = {doc["_id"]: doc["count"] async for doc in db.structures.aggregate(pipeline)}
    # Check portal accounts
    portal_users = await db.users.find({"role": UserRole.CLIENT, "client_id": {"$in": client_ids}}, {"_id": 0, "client_id": 1}).to_list(1000)
    portal_set = {u["client_id"] for u in portal_users if u.get("client_id")}
    
    result = []
    for client_doc in clients:
        private_info = None
        if client_doc.get("private_info"):
            private_info = PrivateClientInfo(**client_doc["private_info"])
        company_info = None
        if client_doc.get("company_info"):
            company_info = CompanyClientInfo(**client_doc["company_info"])
        
        result.append(ClientResponse(
            id=client_doc["id"],
            client_type=client_doc.get("client_type", "private"),
            private_info=private_info,
            company_info=company_info,
            display_name=get_client_display_name(client_doc),
            phone=get_client_phone(client_doc),
            email=get_client_email(client_doc),
            notes=client_doc.get("notes"),
            is_active=client_doc.get("is_active", True),
            ordering_enabled=client_doc.get("ordering_enabled", False),
            has_portal_account=client_doc["id"] in portal_set,
            structure_count=counts.get(client_doc["id"], 0),
            logo_path=client_doc.get("logo_path"),
            created_at=client_doc["created_at"],
            updated_at=client_doc["updated_at"]
        ))
    
    return result

class KeysSettingsUpdate(BaseModel):
    box_capacity: int = 60

@api_router.get("/settings/keys")
async def get_keys_settings(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = await db.app_settings.find_one({"_id": "keys"}) or {}
    return {"box_capacity": doc.get("box_capacity", 60)}

@api_router.put("/settings/keys")
async def update_keys_settings(data: KeysSettingsUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER, UserRole.OPS_MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    capacity = max(1, data.box_capacity)
    await db.app_settings.update_one({"_id": "keys"}, {"$set": {"box_capacity": capacity}}, upsert=True)
    return {"box_capacity": capacity}

@api_router.get("/integrations/google-sheets/status")
async def google_sheets_status(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    from services.sheets_sync import get_status
    return await get_status()

@api_router.post("/integrations/google-sheets/sync")
async def google_sheets_sync(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER, UserRole.OPS_MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    from services.sheets_sync import run_sync
    return await run_sync()

@api_router.get("/clients/overview")
async def clients_overview(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    now_dt = datetime.now(timezone.utc)
    today = now_dt.strftime("%Y-%m-%d")
    next_day = (now_dt + timedelta(days=1)).strftime("%Y-%m-%d")
    month_start = f"{now_dt.year}-{now_dt.month:02d}-01"
    if now_dt.month == 12:
        month_end = f"{now_dt.year + 1}-01-01"
    else:
        month_end = f"{now_dt.year}-{now_dt.month + 1:02d}-01"

    stats = {}

    def entry(cid):
        return stats.setdefault(cid, {"revenue_month": 0, "today_activities": 0, "alerts": 0})

    # Revenue this month (orders, not cancelled)
    async for doc in db.orders.aggregate([
        {"$match": {"created_at": {"$gte": month_start, "$lt": month_end}, "status": {"$nin": ["cancelled"]}, "client_id": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$client_id", "total": {"$sum": "$total"}}},
    ]):
        entry(doc["_id"])["revenue_month"] = doc.get("total", 0) or 0

    # Today's activities: cleaning + deliveries scheduled today, maintenance opened today
    for coll, match in [
        (db.cleaning_tasks, {"date": today}),
        (db.logistics_tasks, {"date": today}),
        (db.maintenance_issues, {"created_at": {"$gte": today, "$lt": next_day}}),
    ]:
        async for doc in coll.aggregate([
            {"$match": {**match, "client_id": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$client_id", "n": {"$sum": 1}}},
        ]):
            entry(doc["_id"])["today_activities"] += doc["n"]

    # Alerts: overdue tasks, urgent open maintenance, negative structure stock
    open_statuses = ["pending", "assigned", "in_progress"]
    for coll, match in [
        (db.cleaning_tasks, {"date": {"$lt": today}, "status": {"$in": open_statuses}}),
        (db.logistics_tasks, {"date": {"$lt": today}, "status": {"$in": open_statuses}}),
        (db.maintenance_issues, {"priority": {"$in": ["urgent", "high"]}, "status": {"$in": ["open", "assigned", "in_progress"]}}),
    ]:
        async for doc in coll.aggregate([
            {"$match": {**match, "client_id": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$client_id", "n": {"$sum": 1}}},
        ]):
            entry(doc["_id"])["alerts"] += doc["n"]

    neg_pipeline = [
        {"$match": {"structure_id": {"$nin": [None, ""]}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": {"s": "$structure_id", "a": "$items.article_id"},
            "bal": {"$sum": {"$cond": [
                {"$eq": ["$movement_type", "delivered"]}, "$items.quantity",
                {"$cond": [
                    {"$in": ["$movement_type", ["picked_up", "returned", "missing", "damaged"]]},
                    {"$multiply": ["$items.quantity", -1]}, 0
                ]}
            ]}},
        }},
        {"$match": {"bal": {"$lt": 0}}},
        {"$group": {"_id": "$_id.s"}},
    ]
    neg_structure_ids = [d["_id"] async for d in db.movements.aggregate(neg_pipeline)]
    if neg_structure_ids:
        async for s in db.structures.find({"id": {"$in": neg_structure_ids}}, {"_id": 0, "client_id": 1}):
            if s.get("client_id"):
                entry(s["client_id"])["alerts"] += 1

    return stats

@api_router.get("/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: str, current_user: dict = Depends(get_current_user)):
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    
    structure_count = await db.structures.count_documents({"client_id": client_id})
    has_portal = await db.users.find_one({"role": UserRole.CLIENT, "client_id": client_id}) is not None
    
    private_info = None
    if client.get("private_info"):
        private_info = PrivateClientInfo(**client["private_info"])
    company_info = None
    if client.get("company_info"):
        company_info = CompanyClientInfo(**client["company_info"])
    
    return ClientResponse(
        id=client["id"],
        client_type=client.get("client_type", "private"),
        private_info=private_info,
        company_info=company_info,
        display_name=get_client_display_name(client),
        phone=get_client_phone(client),
        email=get_client_email(client),
        notes=client.get("notes"),
        is_active=client.get("is_active", True),
        ordering_enabled=client.get("ordering_enabled", False),
        has_portal_account=has_portal,
        structure_count=structure_count,
        logo_path=client.get("logo_path"),
        created_at=client["created_at"],
        updated_at=client["updated_at"]
    )

@api_router.put("/clients/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: str,
    client_data: ClientUpdate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in [UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    
    update_data = {"updated_at": now_iso()}
    for key, value in client_data.model_dump(exclude_unset=True).items():
        if value is not None:
            if key in ["private_info", "company_info"]:
                update_data[key] = serialize_config(value)
            else:
                update_data[key] = value
    
    await db.clients.update_one({"id": client_id}, {"$set": update_data})
    
    updated_client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    structure_count = await db.structures.count_documents({"client_id": client_id})
    
    private_info = None
    if updated_client.get("private_info"):
        private_info = PrivateClientInfo(**updated_client["private_info"])
    company_info = None
    if updated_client.get("company_info"):
        company_info = CompanyClientInfo(**updated_client["company_info"])
    
    return ClientResponse(
        id=updated_client["id"],
        client_type=updated_client.get("client_type", "private"),
        private_info=private_info,
        company_info=company_info,
        display_name=get_client_display_name(updated_client),
        phone=get_client_phone(updated_client),
        email=get_client_email(updated_client),
        notes=updated_client.get("notes"),
        is_active=updated_client.get("is_active", True),
        ordering_enabled=updated_client.get("ordering_enabled", False),
        structure_count=structure_count,
        logo_path=updated_client.get("logo_path"),
        created_at=updated_client["created_at"],
        updated_at=updated_client["updated_at"]
    )

@api_router.delete("/clients/{client_id}")
async def delete_client(client_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    client = await db.clients.find_one({"id": client_id})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    
    structure_count = await db.structures.count_documents({"client_id": client_id})
    if structure_count > 0:
        raise HTTPException(status_code=400, detail="Impossibile eliminare: il cliente ha strutture associate")
    
    await db.clients.delete_one({"id": client_id})
    return {"message": "Cliente eliminato"}

# ============== STRUCTURE ENDPOINTS ==============

SENSITIVE_STRUCTURE_FIELDS = ["access_details", "access_info", "warehouse_info"]

async def next_klv_code() -> str:
    doc = await db.counters.find_one_and_update(
        {"_id": "klv_structure"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return f"KLV-{doc['seq']:04d}"

async def ensure_klv_codes():
    """Assign progressive KLV codes to structures missing one (chronological order). Idempotent."""
    max_seq = 0
    async for s in db.structures.find({"klv_code": {"$exists": True, "$ne": None}}, {"_id": 0, "klv_code": 1}):
        try:
            max_seq = max(max_seq, int(s["klv_code"].split("-")[1]))
        except (IndexError, ValueError):
            pass
    counter = await db.counters.find_one({"_id": "klv_structure"})
    if not counter or counter.get("seq", 0) < max_seq:
        await db.counters.update_one({"_id": "klv_structure"}, {"$set": {"seq": max_seq}}, upsert=True)
    missing = await db.structures.find({"$or": [{"klv_code": {"$exists": False}}, {"klv_code": None}]}, {"_id": 0, "id": 1}).sort("created_at", 1).to_list(2000)
    for s in missing:
        code = await next_klv_code()
        await db.structures.update_one({"id": s["id"]}, {"$set": {"klv_code": code}})

def build_structure_response(structure: dict, client_name: Optional[str], unit_count: int, current_user: dict) -> StructureResponse:
    stype = structure.get("structure_type", StructureType.APARTMENT)
    has_units = structure.get("has_units")
    if has_units is None:
        has_units = unit_count > 0 or stype in [StructureType.GUESTHOUSE, StructureType.HOTEL]
    data = {
        "id": structure["id"],
        "client_id": structure["client_id"],
        "client_name": client_name,
        "klv_code": structure.get("klv_code"),
        "name": structure["name"],
        "structure_type": stype,
        "address": structure.get("address"),
        "floor": structure.get("floor"),
        "interior": structure.get("interior"),
        "operational_contact": structure.get("operational_contact"),
        "parking_info": structure.get("parking_info"),
        "access_type": structure.get("access_type", AccessType.KEYBOX),
        "access_details": structure.get("access_details"),
        "access_info": structure.get("access_info"),
        "warehouse_info": structure.get("warehouse_info"),
        "ical_url": structure.get("ical_url"),
        "ical_source": structure.get("ical_source"),
        "services": structure.get("services", []),
        "custom_services": structure.get("custom_services", []),
        "cleaning_template_id": structure.get("cleaning_template_id"),
        "check_in_time": structure.get("check_in_time"),
        "check_out_time": structure.get("check_out_time"),
        "bed_config": structure.get("bed_config"),
        "notes": structure.get("notes"),
        "is_active": structure.get("is_active", True),
        "unit_count": unit_count,
        "has_units": bool(has_units),
        "has_multiple_units": bool(has_units),
        "created_at": structure["created_at"],
        "updated_at": structure["updated_at"],
    }
    if current_user.get("role") == "client":
        for f in SENSITIVE_STRUCTURE_FIELDS:
            data[f] = None
    return StructureResponse(**data)

@api_router.post("/structures", response_model=StructureResponse)
async def create_structure(structure_data: StructureCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER, UserRole.OPS_MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    client = await db.clients.find_one({"id": structure_data.client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    
    structure_id = str(uuid.uuid4())
    now = now_iso()
    klv_code = await next_klv_code()
    
    structure_doc = {
        "id": structure_id,
        "klv_code": klv_code,
        **structure_data.model_dump(),
        "created_at": now,
        "updated_at": now
    }
    
    await db.structures.insert_one({**structure_doc})
    return build_structure_response(structure_doc, get_client_display_name(client), 0, current_user)

@api_router.get("/structures", response_model=List[StructureResponse])
async def get_structures(
    client_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if client_id:
        query["client_id"] = client_id
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        or_clauses = [
            {"name": {"$regex": search, "$options": "i"}},
            {"address": {"$regex": search, "$options": "i"}},
            {"klv_code": {"$regex": search, "$options": "i"}},
        ]
        matching_client_ids = []
        async for c in db.clients.find({"$or": [
            {"private_info.name": {"$regex": search, "$options": "i"}},
            {"private_info.surname": {"$regex": search, "$options": "i"}},
            {"company_info.company_name": {"$regex": search, "$options": "i"}},
        ]}, {"_id": 0, "id": 1}):
            matching_client_ids.append(c["id"])
        if matching_client_ids:
            or_clauses.append({"client_id": {"$in": matching_client_ids}})
        query["$or"] = or_clauses
    
    structures = await db.structures.find(query, {"_id": 0}).to_list(1000)
    
    # Batch fetch clients and unit counts
    client_ids = list(set(s["client_id"] for s in structures))
    structure_ids = [s["id"] for s in structures]
    
    clients_map = {}
    if client_ids:
        clients_cursor = db.clients.find({"id": {"$in": client_ids}}, {"_id": 0})
        async for c in clients_cursor:
            clients_map[c["id"]] = c
    
    # Get unit counts
    pipeline = [
        {"$match": {"structure_id": {"$in": structure_ids}}},
        {"$group": {"_id": "$structure_id", "count": {"$sum": 1}}}
    ]
    unit_counts = {doc["_id"]: doc["count"] async for doc in db.units.aggregate(pipeline)}
    
    result = []
    for structure in structures:
        client_doc = clients_map.get(structure["client_id"], {})
        result.append(build_structure_response(
            structure,
            get_client_display_name(client_doc) if client_doc else None,
            unit_counts.get(structure["id"], 0),
            current_user,
        ))
    
    return result

@api_router.get("/structures/{structure_id}", response_model=StructureResponse)
async def get_structure(structure_id: str, current_user: dict = Depends(get_current_user)):
    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")
    
    client = await db.clients.find_one({"id": structure["client_id"]}, {"_id": 0})
    unit_count = await db.units.count_documents({"structure_id": structure_id})
    return build_structure_response(structure, get_client_display_name(client) if client else None, unit_count, current_user)

@api_router.put("/structures/{structure_id}", response_model=StructureResponse)
async def update_structure(
    structure_id: str,
    structure_data: StructureUpdate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in [UserRole.MANAGER, UserRole.OPS_MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")
    
    update_data = {"updated_at": now_iso()}
    for key, value in structure_data.model_dump(exclude_unset=True).items():
        if value is not None:
            update_data[key] = value
    
    await db.structures.update_one({"id": structure_id}, {"$set": update_data})
    
    updated_structure = await db.structures.find_one({"id": structure_id}, {"_id": 0})
    client = await db.clients.find_one({"id": updated_structure["client_id"]}, {"_id": 0})
    unit_count = await db.units.count_documents({"structure_id": structure_id})
    return build_structure_response(updated_structure, get_client_display_name(client) if client else None, unit_count, current_user)

@api_router.delete("/structures/{structure_id}")
async def delete_structure(structure_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    structure = await db.structures.find_one({"id": structure_id})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")
    
    unit_count = await db.units.count_documents({"structure_id": structure_id})
    if unit_count > 0:
        raise HTTPException(status_code=400, detail="Impossibile eliminare: la struttura ha unità associate")
    
    await db.structures.delete_one({"id": structure_id})
    return {"message": "Struttura eliminata"}

# ============== STRUCTURE MEDIA (foto/video/istruzioni) ==============

MEDIA_CATEGORIES = ["arrive", "enter", "warehouse", "general"]

class MediaNoteCreate(BaseModel):
    category: str = "general"
    title: Optional[str] = None
    description: Optional[str] = None
    unit_id: Optional[str] = None

class MediaUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit_id: Optional[str] = None

class MediaReorder(BaseModel):
    ids: List[str]

def _require_ops(current_user: dict):
    if current_user["role"] not in [UserRole.MANAGER, UserRole.OPS_MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")

@api_router.get("/structures/{structure_id}/media")
async def list_structure_media(
    structure_id: str,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") == "client":
        raise HTTPException(status_code=403, detail="Non autorizzato")
    q = {"structure_id": structure_id}
    if category:
        q["category"] = category
    items = await db.structure_media.find(q, {"_id": 0}).sort([("category", 1), ("order", 1), ("created_at", 1)]).to_list(500)
    return items

@api_router.post("/structures/{structure_id}/media")
async def upload_structure_media(
    structure_id: str,
    file: UploadFile = File(...),
    category: str = Form("general"),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    unit_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    _require_ops(current_user)
    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0, "id": 1})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")
    if category not in MEDIA_CATEGORIES:
        category = "general"
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    content_type = file.content_type or "application/octet-stream"
    media_type = "video" if content_type.startswith("video") else "photo"
    path = f"{APP_NAME}/structures/{structure_id}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, content_type)
    order = await db.structure_media.count_documents({"structure_id": structure_id, "category": category})
    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "structure_id": structure_id,
        "unit_id": unit_id or None,
        "category": category,
        "media_type": media_type,
        "content_type": content_type,
        "path": result["path"],
        "title": title,
        "description": description,
        "order": order,
        "created_at": now,
        "updated_at": now,
    }
    await db.structure_media.insert_one({**doc})
    return doc

@api_router.post("/structures/{structure_id}/media/note")
async def create_structure_note(
    structure_id: str,
    data: MediaNoteCreate,
    current_user: dict = Depends(get_current_user)
):
    _require_ops(current_user)
    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0, "id": 1})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")
    category = data.category if data.category in MEDIA_CATEGORIES else "general"
    order = await db.structure_media.count_documents({"structure_id": structure_id, "category": category})
    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "structure_id": structure_id,
        "unit_id": data.unit_id or None,
        "category": category,
        "media_type": "note",
        "content_type": None,
        "path": None,
        "title": data.title,
        "description": data.description,
        "order": order,
        "created_at": now,
        "updated_at": now,
    }
    await db.structure_media.insert_one({**doc})
    return doc

@api_router.put("/structures/{structure_id}/media/{media_id}")
async def update_structure_media(
    structure_id: str,
    media_id: str,
    data: MediaUpdate,
    current_user: dict = Depends(get_current_user)
):
    _require_ops(current_user)
    media = await db.structure_media.find_one({"id": media_id, "structure_id": structure_id}, {"_id": 0})
    if not media:
        raise HTTPException(status_code=404, detail="Contenuto non trovato")
    update = {"updated_at": now_iso()}
    payload = data.model_dump(exclude_unset=True)
    for k, v in payload.items():
        update[k] = v
    await db.structure_media.update_one({"id": media_id}, {"$set": update})
    updated = await db.structure_media.find_one({"id": media_id}, {"_id": 0})
    return updated

@api_router.post("/structures/{structure_id}/media/reorder")
async def reorder_structure_media(
    structure_id: str,
    data: MediaReorder,
    current_user: dict = Depends(get_current_user)
):
    _require_ops(current_user)
    for idx, mid in enumerate(data.ids):
        await db.structure_media.update_one({"id": mid, "structure_id": structure_id}, {"$set": {"order": idx}})
    return {"message": "Ordine aggiornato"}

@api_router.delete("/structures/{structure_id}/media/{media_id}")
async def delete_structure_media(
    structure_id: str,
    media_id: str,
    current_user: dict = Depends(get_current_user)
):
    _require_ops(current_user)
    result = await db.structure_media.delete_one({"id": media_id, "structure_id": structure_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contenuto non trovato")
    return {"message": "Contenuto eliminato"}

# ============== UNIT ENDPOINTS ==============

def parse_unit_configs(unit: dict) -> dict:
    """Parse unit configuration fields from MongoDB document"""
    configs = {}
    
    if unit.get("bed_config"):
        configs["bed_config"] = BedConfiguration(**unit["bed_config"])
    if unit.get("kit_config"):
        configs["kit_config"] = KitConfiguration(**unit["kit_config"])
    if unit.get("stock_config"):
        configs["stock_config"] = StockConfiguration(**unit["stock_config"])
    if unit.get("logistics_config"):
        configs["logistics_config"] = LogisticsConfiguration(**unit["logistics_config"])
    if unit.get("cleaning_config"):
        configs["cleaning_config"] = CleaningConfiguration(**unit["cleaning_config"])
    
    return configs

@api_router.post("/units", response_model=UnitResponse)
async def create_unit(unit_data: UnitCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    structure = await db.structures.find_one({"id": unit_data.structure_id}, {"_id": 0})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")
    
    client = await db.clients.find_one({"id": structure["client_id"]}, {"_id": 0})
    
    unit_id = str(uuid.uuid4())
    now = now_iso()
    
    # Set default configs if not provided
    bed_config = unit_data.bed_config or BedConfiguration()
    kit_config = unit_data.kit_config or KitConfiguration()
    stock_config = unit_data.stock_config or StockConfiguration()
    logistics_config = unit_data.logistics_config or LogisticsConfiguration()
    cleaning_config = unit_data.cleaning_config or CleaningConfiguration()
    
    unit_doc = {
        "id": unit_id,
        "structure_id": unit_data.structure_id,
        "name": unit_data.name,
        "unit_type": unit_data.unit_type,
        "bed_config": serialize_config(bed_config),
        "kit_config": serialize_config(kit_config),
        "stock_config": serialize_config(stock_config),
        "logistics_config": serialize_config(logistics_config),
        "cleaning_config": serialize_config(cleaning_config),
        "notes": unit_data.notes,
        "is_active": unit_data.is_active,
        "created_at": now,
        "updated_at": now
    }
    
    await db.units.insert_one(unit_doc)
    
    return UnitResponse(
        id=unit_id,
        structure_id=unit_data.structure_id,
        structure_name=structure["name"],
        client_id=structure["client_id"],
        client_name=get_client_display_name(client) if client else None,
        name=unit_data.name,
        unit_type=unit_data.unit_type,
        bed_config=bed_config,
        kit_config=kit_config,
        stock_config=stock_config,
        logistics_config=logistics_config,
        cleaning_config=cleaning_config,
        notes=unit_data.notes,
        is_active=unit_data.is_active,
        created_at=now,
        updated_at=now
    )

@api_router.get("/units", response_model=List[UnitResponse])
async def get_units(
    structure_id: Optional[str] = None,
    client_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    unit_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if structure_id:
        query["structure_id"] = structure_id
    if is_active is not None:
        query["is_active"] = is_active
    if unit_type:
        query["unit_type"] = unit_type
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    
    # If filtering by client_id, first get all structures for that client
    if client_id:
        structures = await db.structures.find({"client_id": client_id}, {"_id": 0, "id": 1}).to_list(1000)
        structure_ids = [s["id"] for s in structures]
        query["structure_id"] = {"$in": structure_ids}
    
    units = await db.units.find(query, {"_id": 0}).to_list(1000)
    
    # Batch fetch structures and clients
    structure_ids = list(set(u["structure_id"] for u in units))
    structures_map = {}
    clients_map = {}
    
    if structure_ids:
        structures_cursor = db.structures.find({"id": {"$in": structure_ids}}, {"_id": 0})
        async for s in structures_cursor:
            structures_map[s["id"]] = s
        
        client_ids = list(set(s["client_id"] for s in structures_map.values()))
        if client_ids:
            clients_cursor = db.clients.find({"id": {"$in": client_ids}}, {"_id": 0})
            async for c in clients_cursor:
                clients_map[c["id"]] = get_client_display_name(c)
    
    result = []
    for unit in units:
        structure = structures_map.get(unit["structure_id"], {})
        configs = parse_unit_configs(unit)
        
        result.append(UnitResponse(
            id=unit["id"],
            structure_id=unit["structure_id"],
            structure_name=structure.get("name"),
            client_id=structure.get("client_id"),
            client_name=clients_map.get(structure.get("client_id")),
            name=unit["name"],
            unit_type=unit.get("unit_type", UnitType.APARTMENT),
            bed_config=configs.get("bed_config"),
            kit_config=configs.get("kit_config"),
            stock_config=configs.get("stock_config"),
            logistics_config=configs.get("logistics_config"),
            cleaning_config=configs.get("cleaning_config"),
            notes=unit.get("notes"),
            is_active=unit.get("is_active", True),
            created_at=unit["created_at"],
            updated_at=unit["updated_at"]
        ))
    
    return result

@api_router.get("/units/{unit_id}", response_model=UnitResponse)
async def get_unit(unit_id: str, current_user: dict = Depends(get_current_user)):
    unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")
    
    structure = await db.structures.find_one({"id": unit["structure_id"]}, {"_id": 0})
    client = None
    if structure:
        client = await db.clients.find_one({"id": structure["client_id"]}, {"_id": 0})
    
    configs = parse_unit_configs(unit)
    
    return UnitResponse(
        id=unit["id"],
        structure_id=unit["structure_id"],
        structure_name=structure["name"] if structure else None,
        client_id=structure["client_id"] if structure else None,
        client_name=get_client_display_name(client) if client else None,
        name=unit["name"],
        unit_type=unit.get("unit_type", UnitType.APARTMENT),
        bed_config=configs.get("bed_config"),
        kit_config=configs.get("kit_config"),
        stock_config=configs.get("stock_config"),
        logistics_config=configs.get("logistics_config"),
        cleaning_config=configs.get("cleaning_config"),
        notes=unit.get("notes"),
        is_active=unit.get("is_active", True),
        created_at=unit["created_at"],
        updated_at=unit["updated_at"]
    )

@api_router.put("/units/{unit_id}", response_model=UnitResponse)
async def update_unit(
    unit_id: str,
    unit_data: UnitUpdate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in [UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")
    
    update_data = {"updated_at": now_iso()}
    for key, value in unit_data.model_dump(exclude_unset=True).items():
        if value is not None:
            if key in ["bed_config", "kit_config", "stock_config", "logistics_config", "cleaning_config"]:
                update_data[key] = serialize_config(value)
            else:
                update_data[key] = value
    
    await db.units.update_one({"id": unit_id}, {"$set": update_data})
    
    updated_unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
    structure = await db.structures.find_one({"id": updated_unit["structure_id"]}, {"_id": 0})
    client = None
    if structure:
        client = await db.clients.find_one({"id": structure["client_id"]}, {"_id": 0})
    
    configs = parse_unit_configs(updated_unit)
    
    return UnitResponse(
        id=updated_unit["id"],
        structure_id=updated_unit["structure_id"],
        structure_name=structure["name"] if structure else None,
        client_id=structure["client_id"] if structure else None,
        client_name=get_client_display_name(client) if client else None,
        name=updated_unit["name"],
        unit_type=updated_unit.get("unit_type", UnitType.APARTMENT),
        bed_config=configs.get("bed_config"),
        kit_config=configs.get("kit_config"),
        stock_config=configs.get("stock_config"),
        logistics_config=configs.get("logistics_config"),
        cleaning_config=configs.get("cleaning_config"),
        notes=updated_unit.get("notes"),
        is_active=updated_unit.get("is_active", True),
        created_at=updated_unit["created_at"],
        updated_at=updated_unit["updated_at"]
    )

@api_router.delete("/units/{unit_id}")
async def delete_unit(unit_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    unit = await db.units.find_one({"id": unit_id})
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")
    
    await db.units.delete_one({"id": unit_id})
    return {"message": "Unità eliminata"}

# ============== DASHBOARD STATS ==============

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    total_clients = await db.clients.count_documents({"is_active": True})
    total_structures = await db.structures.count_documents({"is_active": True})
    total_units = await db.units.count_documents({"is_active": True})
    
    return {
        "total_clients": total_clients,
        "total_structures": total_structures,
        "total_units": total_units
    }

# ============== EVENT MODELS ==============

class EventCreate(BaseModel):
    event_type: str
    title: str
    structure_id: str
    unit_id: Optional[str] = None
    start_time: str
    end_time: str
    assigned_operator: Optional[str] = None
    status: str = EventStatus.PENDING
    notes: Optional[str] = None
    source: Optional[str] = None

class EventUpdate(BaseModel):
    event_type: Optional[str] = None
    title: Optional[str] = None
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    assigned_operator: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    source: Optional[str] = None

class EventResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    event_type: str
    title: str
    structure_id: str
    unit_id: Optional[str] = None
    structure_name: Optional[str] = None
    unit_name: Optional[str] = None
    start_time: str
    end_time: str
    assigned_operator: Optional[str] = None
    status: str
    notes: Optional[str] = None
    source: Optional[str] = None
    ical_uid: Optional[str] = None
    auto_generated: bool = False
    manually_modified: bool = False
    generated_from: Optional[str] = None
    rule: Optional[str] = None
    created_at: str
    updated_at: str

# ============== EVENT ENDPOINTS ==============

@api_router.get("/events")
async def get_events(
    date: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    structure_id: Optional[str] = None,
    event_type: Optional[str] = None,
    status: Optional[str] = None,
    unassigned_only: bool = False,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if date_from and date_to:
        range_start = f"{date_from}T00:00:00"
        range_end = f"{date_to}T23:59:59"
        query["$or"] = [
            {"start_time": {"$gte": range_start, "$lte": range_end}},
            {"end_time": {"$gte": range_start, "$lte": range_end}},
            {"$and": [{"start_time": {"$lte": range_start}}, {"end_time": {"$gte": range_end}}]}
        ]
    elif date:
        day_start = f"{date}T00:00:00"
        day_end = f"{date}T23:59:59"
        query["$or"] = [
            {"start_time": {"$gte": day_start, "$lte": day_end}},
            {"end_time": {"$gte": day_start, "$lte": day_end}},
            {"$and": [{"start_time": {"$lte": day_start}}, {"end_time": {"$gte": day_end}}]}
        ]
    if structure_id:
        query["structure_id"] = structure_id
    if event_type:
        query["event_type"] = event_type
    if status:
        query["status"] = status
    if unassigned_only:
        query["$and"] = query.get("$and", [])
        query.setdefault("assigned_operator", {"$in": [None, ""]})

    events = await db.events.find(query, {"_id": 0}).sort("start_time", 1).to_list(500)

    structure_ids = list(set(e["structure_id"] for e in events if e.get("structure_id")))
    unit_ids = list(set(e["unit_id"] for e in events if e.get("unit_id")))

    struct_map = {}
    if structure_ids:
        async for s in db.structures.find({"id": {"$in": structure_ids}}, {"_id": 0, "id": 1, "name": 1}):
            struct_map[s["id"]] = s["name"]

    unit_map = {}
    if unit_ids:
        async for u in db.units.find({"id": {"$in": unit_ids}}, {"_id": 0, "id": 1, "name": 1}):
            unit_map[u["id"]] = u["name"]

    result = []
    for ev in events:
        result.append(EventResponse(
            id=ev["id"],
            event_type=ev["event_type"],
            title=ev["title"],
            structure_id=ev["structure_id"],
            unit_id=ev.get("unit_id"),
            structure_name=struct_map.get(ev["structure_id"]),
            unit_name=unit_map.get(ev.get("unit_id", ""), None),
            start_time=ev["start_time"],
            end_time=ev["end_time"],
            assigned_operator=ev.get("assigned_operator"),
            status=ev.get("status", EventStatus.PENDING),
            notes=ev.get("notes"),
            source=ev.get("source"),
            ical_uid=ev.get("ical_uid"),
            auto_generated=ev.get("auto_generated", False),
            manually_modified=ev.get("manually_modified", False),
            generated_from=ev.get("generated_from"),
            rule=ev.get("rule"),
            created_at=ev["created_at"],
            updated_at=ev["updated_at"]
        ))
    return result


@api_router.post("/events", response_model=EventResponse)
async def create_event(
    event_data: EventCreate,
    current_user: dict = Depends(get_current_user)
):
    structure = await db.structures.find_one({"id": event_data.structure_id}, {"_id": 0, "id": 1, "name": 1})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")

    unit_name = None
    if event_data.unit_id:
        unit = await db.units.find_one({"id": event_data.unit_id}, {"_id": 0, "id": 1, "name": 1})
        if unit:
            unit_name = unit["name"]

    now = now_iso()
    event_id = str(uuid.uuid4())
    event_doc = {
        "id": event_id,
        "event_type": event_data.event_type,
        "title": event_data.title,
        "structure_id": event_data.structure_id,
        "unit_id": event_data.unit_id,
        "start_time": event_data.start_time,
        "end_time": event_data.end_time,
        "assigned_operator": event_data.assigned_operator,
        "status": event_data.status,
        "notes": event_data.notes,
        "source": event_data.source,
        "created_at": now,
        "updated_at": now,
    }
    await db.events.insert_one(event_doc)

    # Auto-generate the 4 checkout service tasks for new bookings (manual or otherwise)
    if event_data.event_type == "booking":
        try:
            await _auto_generate_checkout_tasks(event_doc)
        except Exception as e:
            logging.error(f"Auto-task generation failed for booking {event_id}: {e}")

    return EventResponse(
        id=event_id,
        event_type=event_data.event_type,
        title=event_data.title,
        structure_id=event_data.structure_id,
        unit_id=event_data.unit_id,
        structure_name=structure["name"],
        unit_name=unit_name,
        start_time=event_data.start_time,
        end_time=event_data.end_time,
        assigned_operator=event_data.assigned_operator,
        status=event_data.status,
        notes=event_data.notes,
        source=event_data.source,
        created_at=now,
        updated_at=now,
    )


@api_router.post("/events/{event_id}/generate-tasks")
async def regenerate_booking_tasks(event_id: str, current_user: dict = Depends(get_current_user)):
    """Manually (re)generate the 4 service tasks for a single booking."""
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    if ev.get("event_type") != "booking":
        raise HTTPException(status_code=400, detail="Solo le prenotazioni supportano la generazione automatica")
    created_tasks = await _auto_generate_checkout_tasks(ev)
    return {
        "booking_id": event_id,
        "created_count": len(created_tasks),
        "created": created_tasks,
    }


@api_router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(event_id: str, current_user: dict = Depends(get_current_user)):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evento non trovato")

    struct = await db.structures.find_one({"id": ev["structure_id"]}, {"_id": 0, "id": 1, "name": 1})
    unit_name = None
    if ev.get("unit_id"):
        unit = await db.units.find_one({"id": ev["unit_id"]}, {"_id": 0, "id": 1, "name": 1})
        if unit:
            unit_name = unit["name"]

    return EventResponse(
        id=ev["id"],
        event_type=ev["event_type"],
        title=ev["title"],
        structure_id=ev["structure_id"],
        unit_id=ev.get("unit_id"),
        structure_name=struct["name"] if struct else None,
        unit_name=unit_name,
        start_time=ev["start_time"],
        end_time=ev["end_time"],
        assigned_operator=ev.get("assigned_operator"),
        status=ev.get("status", EventStatus.PENDING),
        notes=ev.get("notes"),
        source=ev.get("source"),
        ical_uid=ev.get("ical_uid"),
        auto_generated=ev.get("auto_generated", False),
        manually_modified=ev.get("manually_modified", False),
        generated_from=ev.get("generated_from"),
        rule=ev.get("rule"),
        created_at=ev["created_at"],
        updated_at=ev["updated_at"]
    )


@api_router.put("/events/{event_id}", response_model=EventResponse)
async def update_event(
    event_id: str,
    event_data: EventUpdate,
    current_user: dict = Depends(get_current_user)
):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evento non trovato")

    update_data = {"updated_at": now_iso()}
    payload = event_data.model_dump(exclude_unset=True)
    for key, value in payload.items():
        if value is not None:
            update_data[key] = value

    # If this is an iCal-imported booking and times/title changed, mark as manually modified
    # so the next iCal sync does not overwrite the local edits.
    if ev.get("ical_uid"):
        time_changed = (
            ("start_time" in payload and payload["start_time"] != ev.get("start_time")) or
            ("end_time" in payload and payload["end_time"] != ev.get("end_time"))
        )
        if time_changed:
            update_data["manually_modified"] = True

    await db.events.update_one({"id": event_id}, {"$set": update_data})

    updated_ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    struct = await db.structures.find_one({"id": updated_ev["structure_id"]}, {"_id": 0, "id": 1, "name": 1})
    unit_name = None
    if updated_ev.get("unit_id"):
        unit = await db.units.find_one({"id": updated_ev["unit_id"]}, {"_id": 0, "id": 1, "name": 1})
        if unit:
            unit_name = unit["name"]

    return EventResponse(
        id=updated_ev["id"],
        event_type=updated_ev["event_type"],
        title=updated_ev["title"],
        structure_id=updated_ev["structure_id"],
        unit_id=updated_ev.get("unit_id"),
        structure_name=struct["name"] if struct else None,
        unit_name=unit_name,
        start_time=updated_ev["start_time"],
        end_time=updated_ev["end_time"],
        assigned_operator=updated_ev.get("assigned_operator"),
        status=updated_ev.get("status", EventStatus.PENDING),
        notes=updated_ev.get("notes"),
        source=updated_ev.get("source"),
        ical_uid=updated_ev.get("ical_uid"),
        auto_generated=updated_ev.get("auto_generated", False),
        manually_modified=updated_ev.get("manually_modified", False),
        generated_from=updated_ev.get("generated_from"),
        rule=updated_ev.get("rule"),
        created_at=updated_ev["created_at"],
        updated_at=updated_ev["updated_at"]
    )


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.events.delete_one({"id": event_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    return {"message": "Evento eliminato"}


@api_router.get("/events/stats/day")
async def get_day_stats(
    date: str,
    current_user: dict = Depends(get_current_user)
):
    day_start = f"{date}T00:00:00"
    day_end = f"{date}T23:59:59"
    date_query = {
        "$or": [
            {"start_time": {"$gte": day_start, "$lte": day_end}},
            {"end_time": {"$gte": day_start, "$lte": day_end}},
        ]
    }

    total = await db.events.count_documents(date_query)
    unassigned = await db.events.count_documents({**date_query, "assigned_operator": {"$in": [None, ""]}})

    pipeline = [
        {"$match": date_query},
        {"$group": {"_id": "$event_type", "count": {"$sum": 1}}}
    ]
    by_type = {}
    async for doc in db.events.aggregate(pipeline):
        by_type[doc["_id"]] = doc["count"]

    pipeline_status = [
        {"$match": date_query},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    by_status = {}
    async for doc in db.events.aggregate(pipeline_status):
        by_status[doc["_id"]] = doc["count"]

    return {
        "date": date,
        "total_events": total,
        "unassigned": unassigned,
        "by_type": by_type,
        "by_status": by_status,
    }


# ============== HEALTH CHECK ==============

# ============== AUTOMATION ENGINE ==============
# AutomationRule, CHECKOUT_TASK_DEFINITIONS, _task_exists_with_rule, and
# _auto_generate_checkout_tasks live in services/calendar_automation.py.


async def _get_unit_or_structure_info(structure_id, unit_id=None):
    """Get the unit config (or structure as pseudo-unit for apartments)."""
    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0})
    if not structure:
        return None, None, None

    # Get client for logistics mode
    client = await db.clients.find_one({"id": structure["client_id"]}, {"_id": 0})

    if unit_id:
        unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
        return structure, unit, client
    else:
        # For apartments, treat structure as single unit — find first unit or use defaults
        unit = await db.units.find_one({"structure_id": structure_id}, {"_id": 0})
        return structure, unit, client


async def _count_available_kits(structure_id, unit_id, check_date):
    """Count kit sets available: target_kit_sets - kits_in_use (active bookings overlap)."""
    unit = None
    if unit_id:
        unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
    else:
        unit = await db.units.find_one({"structure_id": structure_id}, {"_id": 0})

    if not unit:
        return 3, 3, 1  # defaults: available, target, threshold

    stock = unit.get("stock_config") or {}
    target = stock.get("target_kit_sets", 3)
    threshold = stock.get("minimum_threshold", 1)

    # Count overlapping bookings on check_date as "kits in use"
    day_start = f"{check_date}T00:00:00"
    day_end = f"{check_date}T23:59:59"
    query = {
        "event_type": "booking",
        "status": {"$nin": ["cancelled"]},
        "$or": [
            {"start_time": {"$lte": day_end}, "end_time": {"$gte": day_start}},
        ]
    }
    if unit_id:
        query["unit_id"] = unit_id
    else:
        query["structure_id"] = structure_id
        query["unit_id"] = {"$in": [None, ""]}

    active_bookings = await db.events.count_documents(query)
    available = max(target - active_bookings, 0)
    return available, target, threshold


async def _task_exists(generated_from, task_type, task_date):
    """Check if an auto-generated task already exists to avoid duplicates."""
    day_start = f"{task_date}T00:00:00"
    day_end = f"{task_date}T23:59:59"
    existing = await db.events.find_one({
        "generated_from": generated_from,
        "event_type": task_type,
        "start_time": {"$gte": day_start, "$lte": day_end},
        "status": {"$nin": ["cancelled"]},
    }, {"_id": 0, "id": 1})
    return existing is not None


def _get_cleaning_window(checkout_time_str, cleaning_time_min=60):
    """Calculate cleaning time window after checkout."""
    checkout = datetime.fromisoformat(checkout_time_str.replace("Z", "+00:00"))
    # Cleaning starts 30 min after checkout
    clean_start = checkout + timedelta(minutes=30)
    clean_end = clean_start + timedelta(minutes=cleaning_time_min)
    return clean_start.isoformat(), clean_end.isoformat()


# CHECKOUT_TASK_DEFINITIONS, _task_exists_with_rule and _auto_generate_checkout_tasks
# now live in services/calendar_automation.py and are imported at the top of this file.


@api_router.post("/automation/generate")
async def generate_tasks(
    date_from: str,
    date_to: str,
    dry_run: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Generate operational tasks from bookings for a date range."""
    range_start = f"{date_from}T00:00:00"
    range_end = f"{date_to}T23:59:59"

    # Find all bookings in the range
    bookings = await db.events.find({
        "event_type": "booking",
        "status": {"$nin": ["cancelled"]},
        "$or": [
            {"start_time": {"$gte": range_start, "$lte": range_end}},
            {"end_time": {"$gte": range_start, "$lte": range_end}},
            {"$and": [{"start_time": {"$lte": range_start}}, {"end_time": {"$gte": range_end}}]},
        ]
    }, {"_id": 0}).to_list(500)

    generated = []
    skipped = []
    now = now_iso()

    for booking in bookings:
        structure_id = booking["structure_id"]
        unit_id = booking.get("unit_id")
        structure, unit, client = await _get_unit_or_structure_info(structure_id, unit_id)
        if not structure:
            continue

        logistics = (unit or {}).get("logistics_config") or {}
        cleaning_cfg = (unit or {}).get("cleaning_config") or {}
        cleaning_time = cleaning_cfg.get("estimated_cleaning_time", 60)
        logistics_mode = logistics.get("logistics_mode", "dynamic")

        # Determine property name for task titles
        prop_name = structure["name"]
        if unit:
            prop_name = f"{structure['name']} / {unit.get('name', '')}"

        # ── RULE 1: CHECK-OUT → CLEANING ──
        checkout_date = booking["end_time"][:10]
        if date_from <= checkout_date <= date_to:
            if not await _task_exists(booking["id"], "cleaning", checkout_date):
                clean_start, clean_end = _get_cleaning_window(booking["end_time"], cleaning_time)

                task = {
                    "event_type": "cleaning",
                    "title": f"Pulizia - {prop_name}",
                    "structure_id": structure_id,
                    "unit_id": unit_id,
                    "start_time": clean_start,
                    "end_time": clean_end,
                    "status": EventStatus.PENDING,
                    "notes": f"Auto: checkout {booking.get('title', '')}. Kit reset richiesto.",
                    "source": "automation",
                    "generated_from": booking["id"],
                    "auto_generated": True,
                    "rule": AutomationRule.CHECKOUT_CLEANING,
                }

                if logistics_mode == "fixed":
                    task["notes"] += f" Giorni fissi: {', '.join(logistics.get('pickup_days', []))}"

                if not dry_run:
                    task["id"] = str(uuid.uuid4())
                    task["created_at"] = now
                    task["updated_at"] = now
                    await db.events.insert_one(task)
                generated.append({**task, "_id": None, "id": task.get("id", "preview")})
            else:
                skipped.append({"booking_id": booking["id"], "type": "cleaning", "date": checkout_date, "reason": "already_exists"})

        # ── RULE 2: CHECK-IN → CONDITIONAL DELIVERY ──
        checkin_date = booking["start_time"][:10]
        if date_from <= checkin_date <= date_to:
            available, target, threshold = await _count_available_kits(structure_id, unit_id, checkin_date)

            if available < threshold:
                if not await _task_exists(booking["id"], "delivery", checkin_date):
                    # Schedule delivery before check-in
                    checkin_dt = datetime.fromisoformat(booking["start_time"].replace("Z", "+00:00"))
                    delivery_start = checkin_dt - timedelta(hours=3)
                    delivery_end = checkin_dt - timedelta(hours=1)

                    kits_needed = target - available

                    task = {
                        "event_type": "delivery",
                        "title": f"Consegna kit ({kits_needed}) - {prop_name}",
                        "structure_id": structure_id,
                        "unit_id": unit_id,
                        "start_time": delivery_start.isoformat(),
                        "end_time": delivery_end.isoformat(),
                        "status": EventStatus.PENDING,
                        "notes": f"Auto: check-in {booking.get('title', '')}. Kit disponibili: {available}/{target}. Necessari: {kits_needed}.",
                        "source": "automation",
                        "generated_from": booking["id"],
                        "auto_generated": True,
                        "rule": AutomationRule.CHECKIN_DELIVERY,
                    }

                    if not dry_run:
                        task["id"] = str(uuid.uuid4())
                        task["created_at"] = now
                        task["updated_at"] = now
                        await db.events.insert_one(task)
                    generated.append({**task, "_id": None, "id": task.get("id", "preview")})
                else:
                    skipped.append({"booking_id": booking["id"], "type": "delivery", "date": checkin_date, "reason": "already_exists"})
            else:
                skipped.append({"booking_id": booking["id"], "type": "delivery", "date": checkin_date, "reason": "stock_sufficient", "available": available, "target": target})

    # ── RULE 3: FIXED SCHEDULE TASKS ──
    # Find units with fixed logistics mode and generate pickup tasks on their scheduled days
    fixed_units = await db.units.find({
        "logistics_config.logistics_mode": "fixed",
        "logistics_config.pickup_days": {"$exists": True, "$ne": []}
    }, {"_id": 0}).to_list(200)

    day_map = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}
    current_date = datetime.fromisoformat(f"{date_from}T00:00:00+00:00")
    end_date = datetime.fromisoformat(f"{date_to}T23:59:59+00:00")

    while current_date <= end_date:
        current_weekday = current_date.weekday()
        date_str = current_date.strftime("%Y-%m-%d")

        for u in fixed_units:
            pickup_days = u.get("logistics_config", {}).get("pickup_days", [])
            time_window = u.get("logistics_config", {}).get("pickup_time_window", "09:00-12:00")
            pickup_day_nums = [day_map.get(d, -1) for d in pickup_days]

            if current_weekday in pickup_day_nums:
                struct = await db.structures.find_one({"id": u["structure_id"]}, {"_id": 0, "name": 1})
                u_name = f"{struct['name'] if struct else ''} / {u.get('name', '')}"

                # Pickup task
                if not await _task_exists(f"fixed_{u['id']}", "pickup", date_str):
                    parts = time_window.split("-") if time_window else ["09:00", "12:00"]
                    start_t = parts[0] if parts else "09:00"
                    end_t = parts[1] if len(parts) > 1 else "12:00"

                    task = {
                        "event_type": "pickup",
                        "title": f"Ritiro programmato - {u_name}",
                        "structure_id": u["structure_id"],
                        "unit_id": u["id"],
                        "start_time": f"{date_str}T{start_t}:00",
                        "end_time": f"{date_str}T{end_t}:00",
                        "status": EventStatus.PENDING,
                        "notes": "Auto: ritiro a programma fisso.",
                        "source": "automation",
                        "generated_from": f"fixed_{u['id']}",
                        "auto_generated": True,
                        "rule": AutomationRule.FIXED_SCHEDULE,
                    }
                    if not dry_run:
                        task["id"] = str(uuid.uuid4())
                        task["created_at"] = now
                        task["updated_at"] = now
                        await db.events.insert_one(task)
                    generated.append({**task, "_id": None, "id": task.get("id", "preview")})

        current_date += timedelta(days=1)

    # Clean _id from responses
    for g in generated:
        g.pop("_id", None)

    return {
        "date_from": date_from,
        "date_to": date_to,
        "dry_run": dry_run,
        "generated_count": len(generated),
        "skipped_count": len(skipped),
        "generated": generated,
        "skipped": skipped,
    }


@api_router.get("/automation/status")
async def get_automation_status(current_user: dict = Depends(get_current_user)):
    """Get stats about auto-generated tasks."""
    total_auto = await db.events.count_documents({"auto_generated": True})
    pending_auto = await db.events.count_documents({"auto_generated": True, "status": EventStatus.PENDING})
    completed_auto = await db.events.count_documents({"auto_generated": True, "status": EventStatus.COMPLETED})

    # Count by rule
    pipeline = [
        {"$match": {"auto_generated": True}},
        {"$group": {"_id": "$rule", "count": {"$sum": 1}}}
    ]
    by_rule = {}
    async for doc in db.events.aggregate(pipeline):
        by_rule[doc["_id"]] = doc["count"]

    # Fixed schedule units count
    fixed_count = await db.units.count_documents({"logistics_config.logistics_mode": "fixed"})

    return {
        "total_auto_tasks": total_auto,
        "pending": pending_auto,
        "completed": completed_auto,
        "by_rule": by_rule,
        "fixed_schedule_units": fixed_count,
    }


@api_router.delete("/automation/clear")
async def clear_auto_tasks(
    date_from: str,
    date_to: str,
    status_filter: str = "pending",
    current_user: dict = Depends(get_current_user)
):
    """Clear auto-generated pending tasks for a date range."""
    query = {
        "auto_generated": True,
        "start_time": {"$gte": f"{date_from}T00:00:00", "$lte": f"{date_to}T23:59:59"},
    }
    if status_filter != "all":
        query["status"] = status_filter

    result = await db.events.delete_many(query)
    return {"deleted_count": result.deleted_count}


@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "kilolava", "version": "4.0.0"}


# ============== INVENTORY MODULE ==============

class ArticleCategory:
    RENTAL_LINEN = "rental_linen"
    CONSUMABLE = "consumable"
    KIT_COMPONENT = "kit_component"

class MovementType:
    PREPARED = "prepared"
    DELIVERED = "delivered"
    PICKED_UP = "picked_up"
    RETURNED = "returned"
    MISSING = "missing"
    DAMAGED = "damaged"
    RESTOCKED = "restocked"

ARTICLE_CATEGORIES = ["rental_linen", "consumable", "kit_component"]
MOVEMENT_TYPES = ["prepared", "delivered", "picked_up", "returned", "missing", "damaged", "restocked"]
# Movements that add stock
STOCK_IN = {"returned", "restocked"}
# Movements that subtract stock
STOCK_OUT = {"prepared", "delivered", "missing", "damaged"}


class ArticleCreate(BaseModel):
    name: str
    category: str
    unit_type: str = "pz"
    standard_price: float = 0.0
    quantity_available: int = 0
    minimum_threshold: int = 0
    is_active: bool = True
    notes: Optional[str] = None

class ArticleUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    unit_type: Optional[str] = None
    standard_price: Optional[float] = None
    quantity_available: Optional[int] = None
    minimum_threshold: Optional[int] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class ArticleResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    category: str
    unit_type: str
    standard_price: float
    quantity_available: int
    minimum_threshold: int
    is_active: bool
    below_threshold: bool = False
    notes: Optional[str] = None
    created_at: str
    updated_at: str


class MovementItemInput(BaseModel):
    article_id: str
    quantity: int

class MovementCreate(BaseModel):
    movement_type: str
    date: str
    client_id: Optional[str] = None
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    items: List[MovementItemInput]
    notes: Optional[str] = None

class MovementItemResponse(BaseModel):
    article_id: str
    article_name: Optional[str] = None
    quantity: int

class MovementResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    movement_type: str
    date: str
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    structure_id: Optional[str] = None
    structure_name: Optional[str] = None
    unit_id: Optional[str] = None
    unit_name: Optional[str] = None
    items: List[MovementItemResponse]
    notes: Optional[str] = None
    created_at: str
    updated_at: str


class ClientPricingCreate(BaseModel):
    client_id: str
    article_id: str
    custom_price: float

class ClientPricingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    client_id: str
    client_name: Optional[str] = None
    article_id: str
    article_name: Optional[str] = None
    custom_price: float
    standard_price: Optional[float] = None
    created_at: str
    updated_at: str


# --- ARTICLES CRUD ---

@api_router.get("/inventory/articles")
async def list_articles(
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    below_threshold: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if category:
        query["category"] = category
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        query["name"] = {"$regex": search, "$options": "i"}

    articles = await db.articles.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    result = []
    for a in articles:
        bt = a.get("quantity_available", 0) < a.get("minimum_threshold", 0)
        if below_threshold is True and not bt:
            continue
        if below_threshold is False and bt:
            continue
        result.append(ArticleResponse(
            id=a["id"], name=a["name"], category=a.get("category", "consumable"),
            unit_type=a.get("unit_type", "pz"), standard_price=a.get("standard_price", 0),
            quantity_available=a.get("quantity_available", 0),
            minimum_threshold=a.get("minimum_threshold", 0),
            is_active=a.get("is_active", True), below_threshold=bt,
            notes=a.get("notes"), created_at=a["created_at"], updated_at=a["updated_at"],
        ))
    return result


@api_router.post("/inventory/articles", response_model=ArticleResponse)
async def create_article(data: ArticleCreate, current_user: dict = Depends(get_current_user)):
    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()), **data.model_dump(),
        "created_at": now, "updated_at": now,
    }
    await db.articles.insert_one(doc)
    bt = doc["quantity_available"] < doc["minimum_threshold"]
    return ArticleResponse(**{k: v for k, v in doc.items() if k != "_id"}, below_threshold=bt)


@api_router.put("/inventory/articles/{article_id}", response_model=ArticleResponse)
async def update_article(article_id: str, data: ArticleUpdate, current_user: dict = Depends(get_current_user)):
    existing = await db.articles.find_one({"id": article_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    update = {"updated_at": now_iso()}
    for k, v in data.model_dump(exclude_unset=True).items():
        if v is not None:
            update[k] = v
    await db.articles.update_one({"id": article_id}, {"$set": update})
    a = await db.articles.find_one({"id": article_id}, {"_id": 0})
    bt = a["quantity_available"] < a["minimum_threshold"]
    return ArticleResponse(**a, below_threshold=bt)


@api_router.delete("/inventory/articles/{article_id}")
async def delete_article(article_id: str, current_user: dict = Depends(get_current_user)):
    r = await db.articles.delete_one({"id": article_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    return {"message": "Articolo eliminato"}


# --- MOVEMENTS ---

@api_router.get("/inventory/movements")
async def list_movements(
    movement_type: Optional[str] = None,
    client_id: Optional[str] = None,
    structure_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    article_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if movement_type:
        query["movement_type"] = movement_type
    if client_id:
        query["client_id"] = client_id
    if structure_id:
        query["structure_id"] = structure_id
    if unit_id:
        query["unit_id"] = unit_id
    if article_id:
        query["items.article_id"] = article_id
    if date_from:
        query.setdefault("date", {})["$gte"] = date_from
    if date_to:
        query.setdefault("date", {})["$lte"] = date_to

    movements = await db.movements.find(query, {"_id": 0}).sort("date", -1).to_list(limit)

    # Resolve names
    art_ids = set()
    cl_ids = set()
    st_ids = set()
    un_ids = set()
    for m in movements:
        for it in m.get("items", []):
            art_ids.add(it["article_id"])
        if m.get("client_id"):
            cl_ids.add(m["client_id"])
        if m.get("structure_id"):
            st_ids.add(m["structure_id"])
        if m.get("unit_id"):
            un_ids.add(m["unit_id"])

    art_map = {}
    if art_ids:
        async for a in db.articles.find({"id": {"$in": list(art_ids)}}, {"_id": 0, "id": 1, "name": 1}):
            art_map[a["id"]] = a["name"]
    cl_map = {}
    if cl_ids:
        async for c in db.clients.find({"id": {"$in": list(cl_ids)}}, {"_id": 0}):
            cl_map[c["id"]] = get_client_display_name(c)
    st_map = {}
    if st_ids:
        async for s in db.structures.find({"id": {"$in": list(st_ids)}}, {"_id": 0, "id": 1, "name": 1}):
            st_map[s["id"]] = s["name"]
    un_map = {}
    if un_ids:
        async for u in db.units.find({"id": {"$in": list(un_ids)}}, {"_id": 0, "id": 1, "name": 1}):
            un_map[u["id"]] = u["name"]

    result = []
    for m in movements:
        items = [MovementItemResponse(article_id=it["article_id"], article_name=art_map.get(it["article_id"]), quantity=it["quantity"]) for it in m.get("items", [])]
        result.append(MovementResponse(
            id=m["id"], movement_type=m["movement_type"], date=m["date"],
            client_id=m.get("client_id"), client_name=cl_map.get(m.get("client_id", "")),
            structure_id=m.get("structure_id"), structure_name=st_map.get(m.get("structure_id", "")),
            unit_id=m.get("unit_id"), unit_name=un_map.get(m.get("unit_id", "")),
            items=items, notes=m.get("notes"),
            created_at=m["created_at"], updated_at=m["updated_at"],
        ))
    return result


@api_router.post("/inventory/movements", response_model=MovementResponse)
async def create_movement(data: MovementCreate, current_user: dict = Depends(get_current_user)):
    now = now_iso()
    mov_id = str(uuid.uuid4())
    items_raw = [it.model_dump() for it in data.items]

    doc = {
        "id": mov_id, "movement_type": data.movement_type, "date": data.date,
        "client_id": data.client_id, "structure_id": data.structure_id, "unit_id": data.unit_id,
        "items": items_raw, "notes": data.notes,
        "created_at": now, "updated_at": now,
    }
    await db.movements.insert_one(doc)

    # Update stock
    for it in data.items:
        delta = it.quantity if data.movement_type in STOCK_IN else -it.quantity
        await db.articles.update_one({"id": it.article_id}, {"$inc": {"quantity_available": delta}})

    # Resolve names for response
    art_map = {}
    art_ids = [it.article_id for it in data.items]
    if art_ids:
        async for a in db.articles.find({"id": {"$in": art_ids}}, {"_id": 0, "id": 1, "name": 1}):
            art_map[a["id"]] = a["name"]
    cl_name = None
    if data.client_id:
        c = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
        if c:
            cl_name = get_client_display_name(c)
    st_name = None
    if data.structure_id:
        s = await db.structures.find_one({"id": data.structure_id}, {"_id": 0, "id": 1, "name": 1})
        if s:
            st_name = s["name"]
    un_name = None
    if data.unit_id:
        u = await db.units.find_one({"id": data.unit_id}, {"_id": 0, "id": 1, "name": 1})
        if u:
            un_name = u["name"]

    items_resp = [MovementItemResponse(article_id=it["article_id"], article_name=art_map.get(it["article_id"]), quantity=it["quantity"]) for it in items_raw]
    return MovementResponse(
        id=mov_id, movement_type=data.movement_type, date=data.date,
        client_id=data.client_id, client_name=cl_name,
        structure_id=data.structure_id, structure_name=st_name,
        unit_id=data.unit_id, unit_name=un_name,
        items=items_resp, notes=data.notes,
        created_at=now, updated_at=now,
    )


@api_router.delete("/inventory/movements/{movement_id}")
async def delete_movement(movement_id: str, current_user: dict = Depends(get_current_user)):
    mov = await db.movements.find_one({"id": movement_id}, {"_id": 0})
    if not mov:
        raise HTTPException(status_code=404, detail="Movimento non trovato")
    # Reverse stock change
    for it in mov.get("items", []):
        delta = -it["quantity"] if mov["movement_type"] in STOCK_IN else it["quantity"]
        await db.articles.update_one({"id": it["article_id"]}, {"$inc": {"quantity_available": delta}})
    await db.movements.delete_one({"id": movement_id})
    return {"message": "Movimento eliminato"}


# --- MONTHLY REGISTER ---

@api_router.get("/inventory/register")
async def monthly_register(
    month: str,
    client_id: Optional[str] = None,
    structure_id: Optional[str] = None,
    unit_id: Optional[str] = None,
    article_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # month format: "2026-03"
    date_from = f"{month}-01"
    parts = month.split("-")
    y, m = int(parts[0]), int(parts[1])
    if m == 12:
        date_to = f"{y+1}-01-01"
    else:
        date_to = f"{y}-{str(m+1).zfill(2)}-01"

    query = {"date": {"$gte": date_from, "$lt": date_to}}
    if client_id:
        query["client_id"] = client_id
    if structure_id:
        query["structure_id"] = structure_id
    if unit_id:
        query["unit_id"] = unit_id
    if article_id:
        query["items.article_id"] = article_id
    if movement_type:
        query["movement_type"] = movement_type

    movements = await db.movements.find(query, {"_id": 0}).sort("date", 1).to_list(1000)

    # Build summary
    totals_by_article = {}
    totals_by_type = {}
    for mov in movements:
        mt = mov["movement_type"]
        totals_by_type[mt] = totals_by_type.get(mt, 0) + 1
        for it in mov.get("items", []):
            aid = it["article_id"]
            if aid not in totals_by_article:
                totals_by_article[aid] = {"in": 0, "out": 0}
            if mt in STOCK_IN:
                totals_by_article[aid]["in"] += it["quantity"]
            elif mt in STOCK_OUT:
                totals_by_article[aid]["out"] += it["quantity"]

    # Resolve article names
    art_map = {}
    if totals_by_article:
        async for a in db.articles.find({"id": {"$in": list(totals_by_article.keys())}}, {"_id": 0, "id": 1, "name": 1}):
            art_map[a["id"]] = a["name"]

    article_summary = []
    for aid, totals in totals_by_article.items():
        article_summary.append({"article_id": aid, "article_name": art_map.get(aid, aid), "total_in": totals["in"], "total_out": totals["out"], "net": totals["in"] - totals["out"]})

    return {
        "month": month,
        "total_movements": len(movements),
        "totals_by_type": totals_by_type,
        "article_summary": article_summary,
        "movement_count": len(movements),
    }


# --- KIT CALCULATOR ---

@api_router.get("/inventory/kit-calc/{unit_id}")
async def calculate_kit(unit_id: str, current_user: dict = Depends(get_current_user)):
    unit = await db.units.find_one({"id": unit_id}, {"_id": 0})
    if not unit:
        raise HTTPException(status_code=404, detail="Unità non trovata")

    bed = unit.get("bed_config") or {}
    kit = unit.get("kit_config") or {}
    stock = unit.get("stock_config") or {}

    beds_double = bed.get("beds_double", 0)
    beds_single = bed.get("beds_single", 0)
    sofa_beds = bed.get("sofa_beds", 0)

    kit_double_per_set = kit.get("kit_double_per_set", 1)
    kit_single_per_set = kit.get("kit_single_per_set", 1)

    target_sets = stock.get("target_kit_sets", 3)

    # Per set
    double_kits_per_set = beds_double * kit_double_per_set
    single_kits_per_set = (beds_single + sofa_beds) * kit_single_per_set
    total_items_per_set = double_kits_per_set + single_kits_per_set

    # Total needed
    total_double = double_kits_per_set * target_sets
    total_single = single_kits_per_set * target_sets

    struct = await db.structures.find_one({"id": unit.get("structure_id")}, {"_id": 0, "name": 1})

    return {
        "unit_id": unit_id,
        "unit_name": unit.get("name", ""),
        "structure_name": struct.get("name", "") if struct else "",
        "bed_config": {"double": beds_double, "single": beds_single, "sofa": sofa_beds},
        "per_set": {"double_kits": double_kits_per_set, "single_kits": single_kits_per_set, "total_items": total_items_per_set},
        "target_sets": target_sets,
        "total_needed": {"double_kits": total_double, "single_kits": total_single, "total": total_double + total_single},
    }


# --- CLIENT PRICING ---

@api_router.get("/inventory/pricing")
async def list_pricing(client_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if client_id:
        query["client_id"] = client_id
    docs = await db.pricing.find(query, {"_id": 0}).to_list(500)

    art_ids = list(set(d["article_id"] for d in docs))
    cl_ids = list(set(d["client_id"] for d in docs))
    art_map = {}
    art_price_map = {}
    if art_ids:
        async for a in db.articles.find({"id": {"$in": art_ids}}, {"_id": 0, "id": 1, "name": 1, "standard_price": 1}):
            art_map[a["id"]] = a["name"]
            art_price_map[a["id"]] = a.get("standard_price", 0)
    cl_map = {}
    if cl_ids:
        async for c in db.clients.find({"id": {"$in": cl_ids}}, {"_id": 0}):
            cl_map[c["id"]] = get_client_display_name(c)

    return [ClientPricingResponse(
        id=d["id"], client_id=d["client_id"], client_name=cl_map.get(d["client_id"]),
        article_id=d["article_id"], article_name=art_map.get(d["article_id"]),
        custom_price=d["custom_price"], standard_price=art_price_map.get(d["article_id"]),
        created_at=d["created_at"], updated_at=d["updated_at"],
    ) for d in docs]


@api_router.post("/inventory/pricing", response_model=ClientPricingResponse)
async def create_pricing(data: ClientPricingCreate, current_user: dict = Depends(get_current_user)):
    # Upsert
    existing = await db.pricing.find_one({"client_id": data.client_id, "article_id": data.article_id}, {"_id": 0})
    now = now_iso()
    if existing:
        await db.pricing.update_one({"id": existing["id"]}, {"$set": {"custom_price": data.custom_price, "updated_at": now}})
        pid = existing["id"]
    else:
        pid = str(uuid.uuid4())
        await db.pricing.insert_one({"id": pid, **data.model_dump(), "created_at": now, "updated_at": now})

    art = await db.articles.find_one({"id": data.article_id}, {"_id": 0, "name": 1, "standard_price": 1})
    cl = await db.clients.find_one({"id": data.client_id}, {"_id": 0})
    return ClientPricingResponse(
        id=pid, client_id=data.client_id, client_name=get_client_display_name(cl) if cl else None,
        article_id=data.article_id, article_name=art["name"] if art else None,
        custom_price=data.custom_price, standard_price=art.get("standard_price") if art else None,
        created_at=now, updated_at=now,
    )


@api_router.delete("/inventory/pricing/{pricing_id}")
async def delete_pricing(pricing_id: str, current_user: dict = Depends(get_current_user)):
    r = await db.pricing.delete_one({"id": pricing_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Pricing non trovato")
    return {"message": "Pricing eliminato"}


# --- INVENTORY STATS ---

@api_router.get("/inventory/stats")
async def inventory_stats(current_user: dict = Depends(get_current_user)):
    total = await db.articles.count_documents({})
    active = await db.articles.count_documents({"is_active": True})

    # Below threshold
    pipeline = [
        {"$match": {"is_active": True}},
        {"$project": {"below": {"$lt": ["$quantity_available", "$minimum_threshold"]}}},
        {"$match": {"below": True}},
        {"$count": "count"}
    ]
    below = 0
    async for doc in db.articles.aggregate(pipeline):
        below = doc["count"]

    # Total value
    value_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": None, "total": {"$sum": {"$multiply": ["$quantity_available", "$standard_price"]}}}}
    ]
    total_value = 0
    async for doc in db.articles.aggregate(value_pipeline):
        total_value = doc["total"]

    # By category
    cat_pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}, "total_qty": {"$sum": "$quantity_available"}}}
    ]
    by_category = {}
    async for doc in db.articles.aggregate(cat_pipeline):
        by_category[doc["_id"]] = {"count": doc["count"], "total_qty": doc["total_qty"]}

    return {
        "total_articles": total,
        "active_articles": active,
        "below_threshold": below,
        "total_value": round(total_value, 2),
        "by_category": by_category,
    }

# ============== LOGISTICS MODULE ==============

class TaskType:
    DELIVERY = "delivery"
    PICKUP = "pickup"
    MIXED = "mixed"

class TaskStatus:
    UNASSIGNED = "unassigned"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    PROBLEM = "problem"

TASK_TYPES = ["delivery", "pickup", "mixed"]
TASK_STATUSES = ["unassigned", "assigned", "in_progress", "completed", "problem"]

class LogisticsItemInput(BaseModel):
    article_id: str
    article_name: Optional[str] = None
    quantity: int = 1
    item_type: str = "deliver"  # deliver or pickup

class LogisticsTaskCreate(BaseModel):
    task_type: str = TaskType.DELIVERY
    date: str
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    client_id: Optional[str] = None
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rider_id: Optional[str] = None
    route_order: int = 0
    items: List[LogisticsItemInput] = []
    notes: Optional[str] = None
    access_details: Optional[str] = None
    source: str = "manual"

class LogisticsTaskUpdate(BaseModel):
    task_type: Optional[str] = None
    date: Optional[str] = None
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    client_id: Optional[str] = None
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rider_id: Optional[str] = None
    route_order: Optional[int] = None
    items: Optional[List[LogisticsItemInput]] = None
    notes: Optional[str] = None
    access_details: Optional[str] = None

class TaskAssignment(BaseModel):
    rider_id: str
    route_order: Optional[int] = None

class TaskStatusUpdate(BaseModel):
    status: str
    problem_notes: Optional[str] = None
    completion_notes: Optional[str] = None

class LogisticsItemResponse(BaseModel):
    article_id: str
    article_name: Optional[str] = None
    quantity: int
    item_type: str = "deliver"

class LogisticsTaskResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    task_type: str
    status: str
    date: str
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    structure_id: Optional[str] = None
    structure_name: Optional[str] = None
    unit_id: Optional[str] = None
    unit_name: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    rider_id: Optional[str] = None
    rider_name: Optional[str] = None
    route_order: int = 0
    items: List[LogisticsItemResponse] = []
    notes: Optional[str] = None
    access_details: Optional[str] = None
    problem_notes: Optional[str] = None
    completion_notes: Optional[str] = None
    confirmation_photo: Optional[str] = None
    source: str = "manual"
    created_at: str
    updated_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

class RiderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None
    is_active: bool = True
    active_tasks: int = 0
    completed_today: int = 0

class RiderCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None

class RiderUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None
    is_active: Optional[bool] = None


async def _enrich_task(task: dict) -> LogisticsTaskResponse:
    """Enrich a raw task doc with names from related collections."""
    client_name = None
    structure_name = None
    unit_name = None
    rider_name = None

    if task.get("client_id"):
        c = await db.clients.find_one({"id": task["client_id"]}, {"_id": 0})
        if c:
            client_name = get_client_display_name(c)
    if task.get("structure_id"):
        s = await db.structures.find_one({"id": task["structure_id"]}, {"_id": 0})
        if s:
            structure_name = s.get("name")
    if task.get("unit_id"):
        u = await db.units.find_one({"id": task["unit_id"]}, {"_id": 0})
        if u:
            unit_name = u.get("name")
    if task.get("rider_id"):
        r = await db.users.find_one({"id": task["rider_id"]}, {"_id": 0})
        if r:
            rider_name = r.get("name")

    items = []
    for it in task.get("items", []):
        art_name = it.get("article_name")
        if not art_name and it.get("article_id"):
            art = await db.articles.find_one({"id": it["article_id"]}, {"_id": 0})
            if art:
                art_name = art.get("name")
        items.append(LogisticsItemResponse(
            article_id=it.get("article_id", ""),
            article_name=art_name,
            quantity=it.get("quantity", 1),
            item_type=it.get("item_type", "deliver"),
        ))

    return LogisticsTaskResponse(
        id=task["id"],
        task_type=task.get("task_type", "delivery"),
        status=task.get("status", "unassigned"),
        date=task.get("date", ""),
        time_window_start=task.get("time_window_start"),
        time_window_end=task.get("time_window_end"),
        client_id=task.get("client_id"),
        client_name=client_name,
        structure_id=task.get("structure_id"),
        structure_name=structure_name,
        unit_id=task.get("unit_id"),
        unit_name=unit_name,
        address=task.get("address"),
        latitude=task.get("latitude"),
        longitude=task.get("longitude"),
        rider_id=task.get("rider_id"),
        rider_name=rider_name,
        route_order=task.get("route_order", 0),
        items=items,
        notes=task.get("notes"),
        access_details=task.get("access_details"),
        problem_notes=task.get("problem_notes"),
        completion_notes=task.get("completion_notes"),
        confirmation_photo=task.get("confirmation_photo"),
        source=task.get("source", "manual"),
        created_at=task.get("created_at", ""),
        updated_at=task.get("updated_at", ""),
        started_at=task.get("started_at"),
        completed_at=task.get("completed_at"),
    )


# --- LOGISTICS TASKS CRUD ---

@api_router.get("/logistics/tasks")
async def list_logistics_tasks(
    date: Optional[str] = None,
    rider_id: Optional[str] = None,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    task_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {}
    if date:
        query["date"] = date
    if rider_id:
        query["rider_id"] = rider_id
    if status:
        query["status"] = status
    if client_id:
        query["client_id"] = client_id
    if task_type:
        query["task_type"] = task_type

    tasks = await db.logistics_tasks.find(query, {"_id": 0}).sort([("date", 1), ("route_order", 1)]).to_list(500)
    return [await _enrich_task(t) for t in tasks]


@api_router.post("/logistics/tasks", response_model=LogisticsTaskResponse)
async def create_logistics_task(
    data: LogisticsTaskCreate,
    current_user: dict = Depends(get_current_user),
):
    now = now_iso()
    # Auto-fill address from structure if not provided
    address = data.address
    lat = data.latitude
    lng = data.longitude
    access = data.access_details
    if data.structure_id and not address:
        s = await db.structures.find_one({"id": data.structure_id}, {"_id": 0})
        if s:
            address = s.get("address")
            access = access or s.get("access_details")

    items_data = [it.model_dump() for it in data.items]
    # Enrich article names
    for it in items_data:
        if it.get("article_id") and not it.get("article_name"):
            art = await db.articles.find_one({"id": it["article_id"]}, {"_id": 0})
            if art:
                it["article_name"] = art.get("name")

    status = TaskStatus.ASSIGNED if data.rider_id else TaskStatus.UNASSIGNED

    doc = {
        "id": str(uuid.uuid4()),
        "task_type": data.task_type,
        "status": status,
        "date": data.date,
        "time_window_start": data.time_window_start,
        "time_window_end": data.time_window_end,
        "client_id": data.client_id,
        "structure_id": data.structure_id,
        "unit_id": data.unit_id,
        "address": address,
        "latitude": lat,
        "longitude": lng,
        "rider_id": data.rider_id,
        "route_order": data.route_order,
        "items": items_data,
        "notes": data.notes,
        "access_details": access,
        "problem_notes": None,
        "completion_notes": None,
        "confirmation_photo": None,
        "source": data.source,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
    }
    await db.logistics_tasks.insert_one(doc)
    return await _enrich_task(doc)


@api_router.put("/logistics/tasks/{task_id}", response_model=LogisticsTaskResponse)
async def update_logistics_task(
    task_id: str,
    data: LogisticsTaskUpdate,
    current_user: dict = Depends(get_current_user),
):
    task = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    update_data = {"updated_at": now_iso()}
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            if key == "items":
                update_data[key] = [it.model_dump() if isinstance(it, BaseModel) else it for it in value]
            else:
                update_data[key] = value

    await db.logistics_tasks.update_one({"id": task_id}, {"$set": update_data})
    updated = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    return await _enrich_task(updated)


@api_router.delete("/logistics/tasks/{task_id}")
async def delete_logistics_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
):
    result = await db.logistics_tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task non trovato")
    return {"message": "Task eliminato"}


@api_router.put("/logistics/tasks/{task_id}/assign", response_model=LogisticsTaskResponse)
async def assign_logistics_task(
    task_id: str,
    assignment: TaskAssignment,
    current_user: dict = Depends(get_current_user),
):
    task = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    update = {
        "rider_id": assignment.rider_id,
        "status": TaskStatus.ASSIGNED,
        "updated_at": now_iso(),
    }
    if assignment.route_order is not None:
        update["route_order"] = assignment.route_order

    await db.logistics_tasks.update_one({"id": task_id}, {"$set": update})
    updated = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    # Notify rider
    if assignment.rider_id:
        enriched = await _enrich_task(updated)
        tt = {"delivery": "Consegna", "pickup": "Ritiro", "mixed": "Consegna/Ritiro"}.get(updated.get("task_type", ""), "Task")
        await create_notification(
            assignment.rider_id,
            f"{tt} assegnata",
            f"{tt} per {enriched.get('client_name', '')} - {updated.get('date', '')}",
            "logistics_assigned", "normal", "logistics_task", task_id
        )
    return await _enrich_task(updated)
async def update_task_status(
    task_id: str,
    status_update: TaskStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    task = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    update = {"status": status_update.status, "updated_at": now_iso()}
    if status_update.status == TaskStatus.IN_PROGRESS:
        update["started_at"] = now_iso()
    elif status_update.status == TaskStatus.COMPLETED:
        update["completed_at"] = now_iso()
    if status_update.problem_notes:
        update["problem_notes"] = status_update.problem_notes
    if status_update.completion_notes:
        update["completion_notes"] = status_update.completion_notes

    await db.logistics_tasks.update_one({"id": task_id}, {"$set": update})
    updated = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    return await _enrich_task(updated)


@api_router.post("/logistics/tasks/{task_id}/photo")
async def upload_task_photo(
    task_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    task = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    path = f"{APP_NAME}/photos/{task_id}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "image/jpeg")
    storage_path = result["path"]

    await db.logistics_tasks.update_one(
        {"id": task_id},
        {"$set": {"confirmation_photo": storage_path, "updated_at": now_iso()}}
    )
    return {"path": storage_path}


@api_router.get("/files/{file_path:path}")
async def serve_file(
    file_path: str,
    authorization: Optional[str] = Header(None),
    auth: Optional[str] = Query(None),
):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Token non valido")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")
    data, content_type = get_object(file_path)
    return Response(content=data, media_type=content_type)


# --- LOGISTICS DAY SUMMARY ---

@api_router.get("/logistics/day-summary")
async def logistics_day_summary(
    date: str,
    current_user: dict = Depends(get_current_user),
):
    tasks = await db.logistics_tasks.find({"date": date}, {"_id": 0}).to_list(500)
    total = len(tasks)
    by_status = {}
    by_rider = {}
    for t in tasks:
        s = t.get("status", "unassigned")
        by_status[s] = by_status.get(s, 0) + 1
        rid = t.get("rider_id")
        if rid:
            if rid not in by_rider:
                r = await db.users.find_one({"id": rid}, {"_id": 0})
                by_rider[rid] = {"name": r.get("name") if r else "?", "total": 0, "completed": 0}
            by_rider[rid]["total"] += 1
            if t.get("status") == TaskStatus.COMPLETED:
                by_rider[rid]["completed"] += 1

    return {
        "date": date,
        "total_tasks": total,
        "by_status": by_status,
        "by_rider": list(by_rider.values()),
    }


# --- RIDERS MANAGEMENT ---

@api_router.get("/logistics/riders")
async def list_riders(current_user: dict = Depends(get_current_user)):
    riders = await db.users.find({"role": UserRole.RIDER}, {"_id": 0, "password_hash": 0}).to_list(100)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = []
    for r in riders:
        active_count = await db.logistics_tasks.count_documents({
            "rider_id": r["id"],
            "status": {"$in": [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS]},
        })
        completed_today = await db.logistics_tasks.count_documents({
            "rider_id": r["id"],
            "date": today,
            "status": TaskStatus.COMPLETED,
        })
        result.append(RiderResponse(
            id=r["id"],
            name=r.get("name", ""),
            email=r.get("email", ""),
            phone=r.get("phone"),
            vehicle_type=r.get("vehicle_type"),
            is_active=r.get("is_active", True),
            active_tasks=active_count,
            completed_today=completed_today,
        ))
    return result


@api_router.post("/logistics/riders", response_model=RiderResponse)
async def create_rider(data: RiderCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")

    rider_id = str(uuid.uuid4())
    now = now_iso()
    doc = {
        "id": rider_id,
        "email": data.email,
        "password_hash": get_password_hash(data.password),
        "name": data.name,
        "role": UserRole.RIDER,
        "language": "it",
        "phone": data.phone,
        "vehicle_type": data.vehicle_type,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(doc)
    return RiderResponse(id=rider_id, name=data.name, email=data.email, phone=data.phone, vehicle_type=data.vehicle_type)


@api_router.put("/logistics/riders/{rider_id}", response_model=RiderResponse)
async def update_rider(rider_id: str, data: RiderUpdate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    rider = await db.users.find_one({"id": rider_id, "role": UserRole.RIDER}, {"_id": 0})
    if not rider:
        raise HTTPException(status_code=404, detail="Rider non trovato")

    update_data = {"updated_at": now_iso()}
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            update_data[key] = value

    await db.users.update_one({"id": rider_id}, {"$set": update_data})
    updated = await db.users.find_one({"id": rider_id}, {"_id": 0, "password_hash": 0})
    return RiderResponse(
        id=updated["id"],
        name=updated.get("name", ""),
        email=updated.get("email", ""),
        phone=updated.get("phone"),
        vehicle_type=updated.get("vehicle_type"),
        is_active=updated.get("is_active", True),
    )


@api_router.delete("/logistics/riders/{rider_id}")
async def delete_rider(rider_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    result = await db.users.delete_one({"id": rider_id, "role": UserRole.RIDER})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rider non trovato")
    # Unassign any tasks
    await db.logistics_tasks.update_many(
        {"rider_id": rider_id, "status": {"$in": [TaskStatus.ASSIGNED]}},
        {"$set": {"rider_id": None, "status": TaskStatus.UNASSIGNED, "updated_at": now_iso()}}
    )
    return {"message": "Rider eliminato"}


# --- RIDER'S OWN VIEW ---

@api_router.get("/logistics/my-tasks")
async def get_my_tasks(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"rider_id": current_user["id"]}
    if date:
        query["date"] = date
    else:
        query["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    tasks = await db.logistics_tasks.find(query, {"_id": 0}).sort("route_order", 1).to_list(100)
    return [await _enrich_task(t) for t in tasks]


# --- BULK REORDER ---

class ReorderItem(BaseModel):
    task_id: str
    route_order: int

class BulkReorder(BaseModel):
    items: List[ReorderItem]

@api_router.put("/logistics/reorder")
async def reorder_tasks(data: BulkReorder, current_user: dict = Depends(get_current_user)):
    for item in data.items:
        await db.logistics_tasks.update_one(
            {"id": item.task_id},
            {"$set": {"route_order": item.route_order, "updated_at": now_iso()}}
        )
    return {"message": f"Riordinati {len(data.items)} task"}


# ============== ORDERS & PORTAL MODULE ==============

ORDER_STATUSES = ["draft", "submitted", "confirmed", "in_preparation", "assigned", "delivered", "completed", "cancelled"]
ORDER_STATUS_LABELS = {
    "draft": "Bozza", "submitted": "Inviato", "confirmed": "Confermato",
    "in_preparation": "In preparazione", "assigned": "Assegnato",
    "delivered": "Consegnato", "completed": "Completato", "cancelled": "Annullato",
}
SERVICE_CATEGORIES = ["cleaning", "private_laundry", "linen_rental", "consumables", "maintenance", "extras"]

class OrderItemInput(BaseModel):
    article_id: str
    article_name: Optional[str] = None
    quantity: int = 1
    unit_price: Optional[float] = None

class OrderCreate(BaseModel):
    client_id: str
    structure_id: Optional[str] = None
    items: List[OrderItemInput]
    delivery_date: str
    delivery_slot: str
    notes: Optional[str] = None

class OrderStatusUpdate(BaseModel):
    status: str

class OrderItemResponse(BaseModel):
    article_id: str
    article_name: str = ""
    quantity: int = 1
    unit_price: float = 0.0
    total: float = 0.0

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    order_number: str
    client_id: str
    client_name: str = ""
    structure_id: Optional[str] = None
    structure_name: Optional[str] = None
    status: str
    items: List[OrderItemResponse] = []
    delivery_date: str
    delivery_slot: str
    notes: Optional[str] = None
    subtotal: float = 0.0
    total: float = 0.0
    logistics_task_id: Optional[str] = None
    created_at: str
    updated_at: str
    confirmed_at: Optional[str] = None
    delivered_at: Optional[str] = None

class DeliverySlotConfig(BaseModel):
    weekly_slots: dict = {
        "mon": ["09:00-12:00", "14:00-17:00"],
        "tue": ["09:00-12:00", "14:00-17:00"],
        "wed": ["09:00-12:00", "14:00-17:00"],
        "thu": ["09:00-12:00", "14:00-17:00"],
        "fri": ["09:00-12:00", "14:00-17:00"],
        "sat": [], "sun": []
    }
    min_lead_days: int = 2
    max_advance_days: int = 30
    max_orders_per_slot: int = 10
    blocked_dates: List[str] = []

class ClientCatalogEntry(BaseModel):
    article_id: str
    is_enabled: bool = True
    custom_price: Optional[float] = None

class ClientCatalogBulk(BaseModel):
    client_id: str
    entries: List[ClientCatalogEntry]

class ClientAccountCreate(BaseModel):
    email: EmailStr
    password: str
    name: str


async def _generate_order_number():
    now = datetime.now(timezone.utc)
    year = now.year
    count = await db.orders.count_documents({"order_number": {"$regex": f"^ORD-{year}"}})
    return f"ORD-{year}-{(count + 1):04d}"


async def _build_order_response(order: dict) -> OrderResponse:
    client_name = ""
    structure_name = None
    if order.get("client_id"):
        c = await db.clients.find_one({"id": order["client_id"]}, {"_id": 0})
        if c:
            client_name = get_client_display_name(c)
    if order.get("structure_id"):
        s = await db.structures.find_one({"id": order["structure_id"]}, {"_id": 0})
        if s:
            structure_name = s.get("name")
    items = []
    for it in order.get("items", []):
        items.append(OrderItemResponse(
            article_id=it.get("article_id", ""),
            article_name=it.get("article_name", ""),
            quantity=it.get("quantity", 1),
            unit_price=it.get("unit_price", 0),
            total=it.get("total", 0),
        ))
    return OrderResponse(
        id=order["id"], order_number=order.get("order_number", ""),
        client_id=order.get("client_id", ""), client_name=client_name,
        structure_id=order.get("structure_id"), structure_name=structure_name,
        status=order.get("status", "draft"), items=items,
        delivery_date=order.get("delivery_date", ""), delivery_slot=order.get("delivery_slot", ""),
        notes=order.get("notes"), subtotal=order.get("subtotal", 0), total=order.get("total", 0),
        logistics_task_id=order.get("logistics_task_id"),
        created_at=order.get("created_at", ""), updated_at=order.get("updated_at", ""),
        confirmed_at=order.get("confirmed_at"), delivered_at=order.get("delivered_at"),
    )


# --- CLIENT ACCOUNT MANAGEMENT (manager) ---

@api_router.post("/clients/{client_id}/create-account")
async def create_client_account(client_id: str, data: ClientAccountCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    client = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email gia registrata")
    existing_account = await db.users.find_one({"role": UserRole.CLIENT, "client_id": client_id})
    if existing_account:
        raise HTTPException(status_code=400, detail="Account portale gia esistente per questo cliente")

    user_id = str(uuid.uuid4())
    now = now_iso()
    doc = {
        "id": user_id, "email": data.email,
        "password_hash": get_password_hash(data.password),
        "name": data.name, "role": UserRole.CLIENT,
        "language": "it", "client_id": client_id,
        "created_at": now, "updated_at": now,
    }
    await db.users.insert_one(doc)
    return {"message": "Account portale creato", "user_id": user_id, "email": data.email}


# --- DELIVERY SLOT CONFIG (manager) ---

@api_router.get("/operations/delivery-config")
async def get_delivery_config(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    config = await db.delivery_config.find_one({"_key": "global"}, {"_id": 0})
    if not config:
        default = DeliverySlotConfig()
        return default.model_dump()
    config.pop("_key", None)
    return config

@api_router.put("/operations/delivery-config")
async def update_delivery_config(data: DeliverySlotConfig, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = data.model_dump()
    doc["_key"] = "global"
    doc["updated_at"] = now_iso()
    await db.delivery_config.update_one({"_key": "global"}, {"$set": doc}, upsert=True)
    return {"message": "Configurazione aggiornata"}


# --- CLIENT CATALOG (manager) ---

@api_router.get("/operations/client-catalog/{client_id}")
async def get_client_catalog(client_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    entries = await db.client_catalog.find({"client_id": client_id}, {"_id": 0}).to_list(500)
    return entries

@api_router.post("/operations/client-catalog")
async def set_client_catalog(data: ClientCatalogBulk, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    await db.client_catalog.delete_many({"client_id": data.client_id})
    docs = []
    for entry in data.entries:
        docs.append({
            "id": str(uuid.uuid4()),
            "client_id": data.client_id,
            "article_id": entry.article_id,
            "is_enabled": entry.is_enabled,
            "custom_price": entry.custom_price,
            "updated_at": now_iso(),
        })
    if docs:
        await db.client_catalog.insert_many(docs)
    return {"message": f"Catalogo aggiornato con {len(docs)} articoli"}


# --- ORDERS MANAGEMENT (manager) ---

@api_router.get("/operations/orders")
async def list_all_orders(
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    query = {}
    if status:
        query["status"] = status
    if client_id:
        query["client_id"] = client_id
    if date_from or date_to:
        dq = {}
        if date_from:
            dq["$gte"] = date_from
        if date_to:
            dq["$lte"] = date_to
        query["delivery_date"] = dq

    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _build_order_response(o) for o in orders]

@api_router.put("/operations/orders/{order_id}/status")
async def update_order_status_manager(order_id: str, data: OrderStatusUpdate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")

    update = {"status": data.status, "updated_at": now_iso()}
    if data.status == "confirmed":
        update["confirmed_at"] = now_iso()
    elif data.status == "delivered":
        update["delivered_at"] = now_iso()

    await db.orders.update_one({"id": order_id}, {"$set": update})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    # Notify client about order status change
    if updated.get("client_id"):
        client_users = await db.users.find({"client_id": updated["client_id"], "role": UserRole.CLIENT, "is_active": True}, {"_id": 0, "id": 1}).to_list(10)
        status_labels = {"confirmed": "confermato", "processing": "in lavorazione", "shipped": "spedito", "delivered": "consegnato", "cancelled": "annullato"}
        label = status_labels.get(data.status, data.status)
        for cu in client_users:
            await create_notification(
                cu["id"],
                f"Ordine {label}",
                f"Il tuo ordine #{updated.get('order_number', '')} e stato {label}",
                "order_status", "normal", "order", order_id
            )
    return await _build_order_response(updated)


# --- PORTAL ENDPOINTS (client-facing, scoped) ---

def _require_client(user: dict):
    if user["role"] != UserRole.CLIENT or not user.get("client_id"):
        raise HTTPException(status_code=403, detail="Accesso portale non autorizzato")
    return user["client_id"]


@api_router.get("/portal/dashboard")
async def portal_dashboard(current_user: dict = Depends(get_current_user)):
    cid = _require_client(current_user)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    month_start = today[:8] + "01"

    # Client info
    client = await db.clients.find_one({"id": cid}, {"_id": 0})
    client_name = get_client_display_name(client) if client else ""
    ordering_enabled = client.get("ordering_enabled", False) if client else False

    # Structures
    structures = await db.structures.find({"client_id": cid}, {"_id": 0}).to_list(100)
    structure_ids = [s["id"] for s in structures]

    # Upcoming cleanings (events with type cleaning, date >= today)
    upcoming_cleanings = await db.events.find({
        "structure_id": {"$in": structure_ids},
        "event_type": "cleaning",
        "start_time": {"$gte": today},
        "status": {"$ne": "cancelled"},
    }, {"_id": 0}).sort("start_time", 1).limit(5).to_list(5)

    # Completed cleanings this month
    completed_cleanings = await db.events.count_documents({
        "structure_id": {"$in": structure_ids},
        "event_type": "cleaning",
        "status": "completed",
        "start_time": {"$gte": month_start, "$lte": today},
    })

    # Upcoming deliveries
    upcoming_deliveries = await db.logistics_tasks.find({
        "client_id": cid,
        "date": {"$gte": today},
        "status": {"$nin": ["completed", "cancelled"]},
    }, {"_id": 0}).sort("date", 1).limit(5).to_list(5)

    # Recent completed deliveries
    recent_deliveries = await db.logistics_tasks.find({
        "client_id": cid,
        "status": "completed",
    }, {"_id": 0}).sort("completed_at", -1).limit(5).to_list(5)

    # Recent orders
    recent_orders = await db.orders.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)

    # Month total from orders
    month_orders = await db.orders.find({
        "client_id": cid,
        "delivery_date": {"$gte": month_start},
        "status": {"$nin": ["cancelled", "draft"]},
    }, {"_id": 0}).to_list(500)
    month_total = sum(o.get("total", 0) for o in month_orders)

    return {
        "client_name": client_name,
        "ordering_enabled": ordering_enabled,
        "upcoming_cleanings": [{
            "id": e["id"], "title": e.get("title", "Pulizia"),
            "date": e.get("start_time", "")[:10],
            "structure_name": next((s["name"] for s in structures if s["id"] == e.get("structure_id")), ""),
            "status": e.get("status", ""),
        } for e in upcoming_cleanings],
        "completed_cleanings_count": completed_cleanings,
        "upcoming_deliveries": [{
            "id": d["id"], "task_type": d.get("task_type"),
            "date": d.get("date"), "address": d.get("address"),
            "status": d.get("status"),
            "structure_name": next((s["name"] for s in structures if s["id"] == d.get("structure_id")), ""),
            "items_count": len(d.get("items", [])),
        } for d in upcoming_deliveries],
        "recent_deliveries": [{
            "id": d["id"], "task_type": d.get("task_type"),
            "date": d.get("date"), "completed_at": d.get("completed_at"),
            "items_count": len(d.get("items", [])),
        } for d in recent_deliveries],
        "recent_orders": [await _build_order_response(o) for o in recent_orders],
        "month_total": month_total,
        "structures_count": len(structures),
    }


@api_router.get("/portal/structures")
async def portal_structures(current_user: dict = Depends(get_current_user)):
    cid = _require_client(current_user)
    structures = await db.structures.find({"client_id": cid}, {"_id": 0}).to_list(100)
    result = []
    for s in structures:
        units = await db.units.find({"structure_id": s["id"]}, {"_id": 0}).to_list(50)
        result.append({
            "id": s["id"], "name": s["name"], "address": s.get("address"),
            "structure_type": s.get("structure_type"),
            "units": [{"id": u["id"], "name": u["name"]} for u in units],
        })
    return result


@api_router.get("/portal/services")
async def portal_services(
    month: Optional[str] = None,
    structure_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    cid = _require_client(current_user)
    structures = await db.structures.find({"client_id": cid}, {"_id": 0}).to_list(100)
    structure_ids = [s["id"] for s in structures]
    if structure_id and structure_id in structure_ids:
        structure_ids = [structure_id]

    now = datetime.now(timezone.utc)
    if month:
        m_start = month + "-01"
        parts = month.split("-")
        y, m = int(parts[0]), int(parts[1])
        if m == 12:
            m_end = f"{y+1}-01-01"
        else:
            m_end = f"{y}-{m+1:02d}-01"
    else:
        m_start = now.strftime("%Y-%m-01")
        m_end = (now.replace(day=28) + timedelta(days=4)).replace(day=1).strftime("%Y-%m-%d")

    # Cleanings
    cleanings = await db.events.find({
        "structure_id": {"$in": structure_ids},
        "event_type": {"$in": ["cleaning", "checkin", "checkout"]},
        "start_time": {"$gte": m_start, "$lt": m_end},
    }, {"_id": 0}).sort("start_time", 1).to_list(500)

    struct_map = {s["id"]: s["name"] for s in structures}

    services = []
    for e in cleanings:
        services.append({
            "id": e["id"], "type": e.get("event_type", "cleaning"),
            "title": e.get("title", ""),
            "date": e.get("start_time", "")[:10],
            "structure_id": e.get("structure_id"),
            "structure_name": struct_map.get(e.get("structure_id"), ""),
            "status": e.get("status", ""),
        })

    # Deliveries
    deliveries = await db.logistics_tasks.find({
        "client_id": cid,
        "date": {"$gte": m_start, "$lt": m_end},
    }, {"_id": 0}).sort("date", 1).to_list(500)

    for d in deliveries:
        services.append({
            "id": d["id"], "type": d.get("task_type", "delivery"),
            "title": f"{'Consegna' if d.get('task_type') == 'delivery' else 'Ritiro' if d.get('task_type') == 'pickup' else 'Consegna/Ritiro'}",
            "date": d.get("date", ""),
            "structure_id": d.get("structure_id"),
            "structure_name": struct_map.get(d.get("structure_id"), ""),
            "status": d.get("status", ""),
            "items_count": len(d.get("items", [])),
        })

    services.sort(key=lambda x: x.get("date", ""))
    return services


@api_router.get("/portal/catalog")
async def portal_catalog(current_user: dict = Depends(get_current_user)):
    cid = _require_client(current_user)
    client = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not client or not client.get("ordering_enabled"):
        raise HTTPException(status_code=403, detail="Ordini non abilitati")

    # Get client-specific catalog
    catalog_entries = await db.client_catalog.find({"client_id": cid, "is_enabled": True}, {"_id": 0}).to_list(500)
    enabled_ids = {e["article_id"]: e for e in catalog_entries}

    if not enabled_ids:
        # If no catalog configured, return all articles with standard prices
        articles = await db.articles.find({}, {"_id": 0}).to_list(500)
        return [{
            "article_id": a["id"], "name": a["name"],
            "category": a.get("category", ""), "unit_type": a.get("unit_type", "pz"),
            "price": a.get("standard_price", 0),
        } for a in articles]

    article_ids = list(enabled_ids.keys())
    articles = await db.articles.find({"id": {"$in": article_ids}}, {"_id": 0}).to_list(500)

    result = []
    for a in articles:
        entry = enabled_ids.get(a["id"], {})
        price = entry.get("custom_price") if entry.get("custom_price") is not None else a.get("standard_price", 0)
        result.append({
            "article_id": a["id"], "name": a["name"],
            "category": a.get("category", ""), "unit_type": a.get("unit_type", "pz"),
            "price": price,
        })
    return result


@api_router.get("/portal/delivery-slots")
async def portal_delivery_slots(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    cid = _require_client(current_user)
    config = await db.delivery_config.find_one({"_key": "global"}, {"_id": 0})
    if not config:
        config = DeliverySlotConfig().model_dump()

    weekly = config.get("weekly_slots", {})
    min_lead = config.get("min_lead_days", 2)
    max_advance = config.get("max_advance_days", 30)
    max_per_slot = config.get("max_orders_per_slot", 10)
    blocked = set(config.get("blocked_dates", []))

    today = datetime.now(timezone.utc).date()
    start = today + timedelta(days=min_lead)
    end = today + timedelta(days=max_advance)

    if date_from:
        df = datetime.strptime(date_from, "%Y-%m-%d").date()
        if df > start:
            start = df
    if date_to:
        dt = datetime.strptime(date_to, "%Y-%m-%d").date()
        if dt < end:
            end = dt

    day_names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
    available = []
    d = start
    while d <= end:
        ds = d.strftime("%Y-%m-%d")
        if ds in blocked:
            d += timedelta(days=1)
            continue
        day_name = day_names[d.weekday()]
        slots = weekly.get(day_name, [])
        if not slots:
            d += timedelta(days=1)
            continue
        # Check capacity per slot
        day_slots = []
        for slot in slots:
            count = await db.orders.count_documents({
                "delivery_date": ds, "delivery_slot": slot,
                "status": {"$nin": ["cancelled", "draft"]},
            })
            if count < max_per_slot:
                day_slots.append({"slot": slot, "available": max_per_slot - count})
        if day_slots:
            available.append({"date": ds, "day": day_name, "slots": day_slots})
        d += timedelta(days=1)

    return available


@api_router.post("/portal/orders")
async def create_order(data: OrderCreate, current_user: dict = Depends(get_current_user)):
    cid = _require_client(current_user)
    if cid != data.client_id:
        raise HTTPException(status_code=403, detail="Non autorizzato")

    client = await db.clients.find_one({"id": cid}, {"_id": 0})
    if not client or not client.get("ordering_enabled"):
        raise HTTPException(status_code=403, detail="Ordini non abilitati")

    # Build items with prices
    catalog_entries = {e["article_id"]: e async for e in db.client_catalog.find({"client_id": cid}, {"_id": 0})}
    items_data = []
    subtotal = 0.0
    for item in data.items:
        art = await db.articles.find_one({"id": item.article_id}, {"_id": 0})
        art_name = art.get("name", "") if art else item.article_name or ""
        # Price: custom > item override > standard
        cat_entry = catalog_entries.get(item.article_id, {})
        price = item.unit_price or (cat_entry.get("custom_price") if cat_entry.get("custom_price") is not None else (art.get("standard_price", 0) if art else 0))
        line_total = price * item.quantity
        items_data.append({
            "article_id": item.article_id,
            "article_name": art_name,
            "quantity": item.quantity,
            "unit_price": price,
            "total": line_total,
        })
        subtotal += line_total

    order_number = await _generate_order_number()
    now = now_iso()
    doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "client_id": cid,
        "structure_id": data.structure_id,
        "status": "submitted",
        "items": items_data,
        "delivery_date": data.delivery_date,
        "delivery_slot": data.delivery_slot,
        "notes": data.notes,
        "subtotal": subtotal,
        "total": subtotal,
        "logistics_task_id": None,
        "created_at": now,
        "updated_at": now,
        "confirmed_at": None,
        "delivered_at": None,
    }
    await db.orders.insert_one(doc)
    # Notify ops about new order
    await notify_ops_users(
        "Nuovo ordine ricevuto",
        f"Ordine #{order_number} - {len(items_data)} articoli, consegna {data.delivery_date}",
        "order_created", "important", "order", doc["id"]
    )
    return await _build_order_response(doc)


@api_router.get("/portal/orders")
async def portal_orders(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    cid = _require_client(current_user)
    query = {"client_id": cid}
    if status:
        query["status"] = status
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [await _build_order_response(o) for o in orders]


@api_router.get("/portal/orders/{order_id}")
async def portal_order_detail(order_id: str, current_user: dict = Depends(get_current_user)):
    cid = _require_client(current_user)
    order = await db.orders.find_one({"id": order_id, "client_id": cid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    result = await _build_order_response(order)
    # Add delivery task info if linked
    delivery_info = None
    if order.get("logistics_task_id"):
        task = await db.logistics_tasks.find_one({"id": order["logistics_task_id"]}, {"_id": 0})
        if task:
            delivery_info = {"status": task.get("status"), "rider_name": None}
            if task.get("rider_id"):
                r = await db.users.find_one({"id": task["rider_id"]}, {"_id": 0})
                if r:
                    delivery_info["rider_name"] = r.get("name")
    return {"order": result, "delivery_info": delivery_info}


@api_router.put("/portal/orders/{order_id}/cancel")
async def cancel_order(order_id: str, current_user: dict = Depends(get_current_user)):
    cid = _require_client(current_user)
    order = await db.orders.find_one({"id": order_id, "client_id": cid}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    if order["status"] not in ["draft", "submitted"]:
        raise HTTPException(status_code=400, detail="Ordine non annullabile in questo stato")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "cancelled", "updated_at": now_iso()}})
    return {"message": "Ordine annullato"}


@api_router.get("/portal/report")
async def portal_report(
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    cid = _require_client(current_user)
    now = datetime.now(timezone.utc)
    if month:
        m_start = month + "-01"
        parts = month.split("-")
        y, m_num = int(parts[0]), int(parts[1])
    else:
        m_start = now.strftime("%Y-%m-01")
        y, m_num = now.year, now.month

    if m_num == 12:
        m_end = f"{y+1}-01-01"
    else:
        m_end = f"{y}-{m_num+1:02d}-01"

    structures = await db.structures.find({"client_id": cid}, {"_id": 0}).to_list(100)
    structure_ids = [s["id"] for s in structures]

    # Count cleanings
    cleaning_count = await db.events.count_documents({
        "structure_id": {"$in": structure_ids},
        "event_type": "cleaning",
        "start_time": {"$gte": m_start, "$lt": m_end},
        "status": {"$ne": "cancelled"},
    })

    # Orders this month
    orders = await db.orders.find({
        "client_id": cid,
        "delivery_date": {"$gte": m_start, "$lt": m_end},
        "status": {"$nin": ["cancelled", "draft"]},
    }, {"_id": 0}).to_list(500)

    # Breakdown by article category
    breakdown = {}
    for o in orders:
        for item in o.get("items", []):
            art = await db.articles.find_one({"id": item["article_id"]}, {"_id": 0})
            cat = art.get("category", "other") if art else "other"
            cat_label = {
                "rental_linen": "linen_rental", "consumable": "consumables",
                "kit_component": "linen_rental",
            }.get(cat, cat)
            if cat_label not in breakdown:
                breakdown[cat_label] = {"count": 0, "total": 0.0}
            breakdown[cat_label]["count"] += item.get("quantity", 1)
            breakdown[cat_label]["total"] += item.get("total", 0)

    total = sum(o.get("total", 0) for o in orders)

    # Previous months (last 6)
    history = []
    for offset in range(1, 7):
        hm = m_num - offset
        hy = y
        while hm < 1:
            hm += 12
            hy -= 1
        hm_start = f"{hy}-{hm:02d}-01"
        if hm == 12:
            hm_end = f"{hy+1}-01-01"
        else:
            hm_end = f"{hy}-{hm+1:02d}-01"
        h_orders = await db.orders.find({
            "client_id": cid,
            "delivery_date": {"$gte": hm_start, "$lt": hm_end},
            "status": {"$nin": ["cancelled", "draft"]},
        }, {"_id": 0, "total": 1}).to_list(500)
        h_total = sum(o.get("total", 0) for o in h_orders)
        h_count = len(h_orders)
        history.append({"month": f"{hy}-{hm:02d}", "total": h_total, "orders": h_count})

    return {
        "month": f"{y}-{m_num:02d}",
        "cleaning_count": cleaning_count,
        "orders_count": len(orders),
        "total": total,
        "breakdown": breakdown,
        "history": history,
    }


# ============== USER MANAGEMENT (Admin) ==============

class UserManageCreate(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str = ""
    role: str
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None

class UserManageUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    vehicle_type: Optional[str] = None
    client_id: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@api_router.get("/users")
async def list_users(
    role: Optional[str] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    query = {}
    if role:
        query["role"] = role
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"first_name": {"$regex": search, "$options": "i"}},
            {"last_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return [_build_user_response(u) for u in users]


@api_router.get("/users/{user_id}")
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return _build_user_response(user)


@api_router.post("/users")
async def create_user(data: UserManageCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if data.role not in ALL_ROLES:
        raise HTTPException(status_code=400, detail=f"Ruolo non valido: {data.role}")
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email gia registrata")

    user_id = str(uuid.uuid4())
    now = now_iso()
    display_name = f"{data.first_name} {data.last_name}".strip()
    doc = {
        "id": user_id, "email": data.email,
        "password_hash": get_password_hash(data.password),
        "first_name": data.first_name, "last_name": data.last_name,
        "name": display_name, "role": data.role,
        "language": "it", "phone": data.phone,
        "vehicle_type": data.vehicle_type, "client_id": data.client_id,
        "is_active": True, "notes": data.notes,
        "created_at": now, "updated_at": now,
    }
    await db.users.insert_one(doc)
    return _build_user_response(doc)


@api_router.put("/users/{user_id}")
async def update_user(user_id: str, data: UserManageUpdate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    update_data = {"updated_at": now_iso()}
    for key, val in data.model_dump(exclude_unset=True).items():
        if val is not None:
            update_data[key] = val

    if "first_name" in update_data or "last_name" in update_data:
        fn = update_data.get("first_name", user.get("first_name", ""))
        ln = update_data.get("last_name", user.get("last_name", ""))
        update_data["name"] = f"{fn} {ln}".strip()

    await db.users.update_one({"id": user_id}, {"$set": update_data})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return _build_user_response(updated)


@api_router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(user_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    new_status = not user.get("is_active", True)
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": new_status, "updated_at": now_iso()}})
    return {"is_active": new_status, "message": f"Utente {'attivato' if new_status else 'disattivato'}"}


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Solo admin puo eliminare utenti")
    if user_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="Non puoi eliminare il tuo account")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return {"message": "Utente eliminato"}


@api_router.get("/permissions/roles")
async def get_roles_and_permissions(current_user: dict = Depends(get_current_user)):
    return {
        "roles": ALL_ROLES,
        "permissions": ROLE_PERMISSIONS,
    }


# ============== CLEANING TASKS + CHECKLIST MODULE ==============

class CleaningTaskStatus:
    UNASSIGNED = "unassigned"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ISSUE_REPORTED = "issue_reported"
    NEEDS_REVIEW = "needs_review"
    CANCELLED = "cancelled"

CLEANING_TASK_STATUSES = [
    "unassigned", "assigned", "in_progress", "completed", "issue_reported", "needs_review", "cancelled"
]

# Nuove categorie segnalazione (4 tipi ufficiali) — le legacy restano valide per i dati esistenti
CLEANING_REPORT_CATEGORIES = ["missing", "damage", "malfunction", "other"]
REPORT_CATEGORIES_REQUIRING_MEDIA = ["damage", "malfunction"]
ISSUE_CATEGORIES = CLEANING_REPORT_CATEGORIES + ["broken_item", "missing_supplies", "maintenance", "electrical", "plumbing", "furniture", "missing_item"]

CHECKLIST_ITEM_TYPES = ["checkbox", "yesno", "text", "number", "photo", "conditional"]


# --- Checklist Templates ---

@api_router.get("/checklist-templates")
async def list_checklist_templates(
    structure_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    query = {}
    if structure_id:
        query["$or"] = [{"structure_id": structure_id}, {"structure_id": None}, {"structure_id": ""}]
    templates = await db.checklist_templates.find(query, {"_id": 0}).to_list(500)
    return templates


@api_router.get("/checklist-templates/{template_id}")
async def get_checklist_template(template_id: str, current_user: dict = Depends(get_current_user)):
    t = await db.checklist_templates.find_one({"id": template_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return t


class ChecklistItemModel(BaseModel):
    label: str
    item_type: str = "checkbox"
    required: bool = False
    order: int = 0
    condition_parent: Optional[str] = None
    condition_value: Optional[str] = None

class ChecklistSectionModel(BaseModel):
    name: str
    order: int = 0
    items: List[ChecklistItemModel] = []

class ChecklistTemplateCreate(BaseModel):
    name: str
    description: str = ""
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    sections: List[ChecklistSectionModel] = []

@api_router.post("/checklist-templates")
async def create_checklist_template(data: ChecklistTemplateCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    now = now_iso()
    template = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description,
        "structure_id": data.structure_id,
        "unit_id": data.unit_id,
        "sections": [s.model_dump() for s in data.sections],
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.checklist_templates.insert_one(template)
    template.pop("_id", None)
    return template


@api_router.put("/checklist-templates/{template_id}")
async def update_checklist_template(template_id: str, data: ChecklistTemplateCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    existing = await db.checklist_templates.find_one({"id": template_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Template non trovato")
    update = {
        "name": data.name,
        "description": data.description,
        "structure_id": data.structure_id,
        "unit_id": data.unit_id,
        "sections": [s.model_dump() for s in data.sections],
        "updated_at": now_iso(),
    }
    await db.checklist_templates.update_one({"id": template_id}, {"$set": update})
    updated = await db.checklist_templates.find_one({"id": template_id}, {"_id": 0})
    return updated


@api_router.delete("/checklist-templates/{template_id}")
async def delete_checklist_template(template_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    result = await db.checklist_templates.delete_one({"id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return {"message": "Template eliminato"}


# --- Cleaning Tasks ---

class CleaningTaskCreate(BaseModel):
    client_id: Optional[str] = None
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    assigned_cleaner_id: Optional[str] = None
    assigned_cleaner_ids: Optional[List[str]] = None
    date: str
    scheduled_time: Optional[str] = None
    estimated_duration_minutes: Optional[int] = None
    guests_count: Optional[int] = None
    beds_double: Optional[int] = None
    beds_single: Optional[int] = None
    beds_sofa: Optional[int] = None
    checkin_today: Optional[bool] = None
    checkin_time: Optional[str] = None
    access_notes: Optional[str] = None
    notes: Optional[str] = None
    checklist_template_id: Optional[str] = None


class CleaningTaskUpdate(BaseModel):
    structure_id: Optional[str] = None
    assigned_cleaner_id: Optional[str] = None
    assigned_cleaner_ids: Optional[List[str]] = None
    date: Optional[str] = None
    scheduled_time: Optional[str] = None
    estimated_duration_minutes: Optional[int] = None
    guests_count: Optional[int] = None
    beds_double: Optional[int] = None
    beds_single: Optional[int] = None
    beds_sofa: Optional[int] = None
    checkin_today: Optional[bool] = None
    checkin_time: Optional[str] = None
    access_notes: Optional[str] = None
    notes: Optional[str] = None
    checklist_template_id: Optional[str] = None
    status: Optional[str] = None


def _cleaner_ids_of(task: dict) -> list:
    ids = list(task.get("assigned_cleaner_ids") or [])
    if task.get("assigned_cleaner_id") and task["assigned_cleaner_id"] not in ids:
        ids.append(task["assigned_cleaner_id"])
    return ids


def _cleaner_can_access(task: dict, user: dict) -> bool:
    return user["id"] in _cleaner_ids_of(task)


async def _validate_beds(structure_id: Optional[str], beds: dict):
    """Enforce structure bed capacity (max) and configured minimum."""
    if not structure_id:
        return
    s = await db.structures.find_one({"id": structure_id}, {"_id": 0, "name": 1, "bed_config": 1})
    bc = (s or {}).get("bed_config") or {}
    if not bc:
        return
    rules = [
        ("beds_double", "beds_double", "beds_double_min", "matrimoniali"),
        ("beds_single", "beds_single", "beds_single_min", "singoli"),
        ("beds_sofa", "sofa_beds", "sofa_beds_min", "divani letto"),
    ]
    for field, max_key, min_key, label in rules:
        val = beds.get(field)
        if val is None:
            continue
        try:
            val = int(val)
        except (TypeError, ValueError):
            continue
        mx = int(bc.get(max_key) or 0)
        mn = int(bc.get(min_key) or 0)
        if mx and val > mx:
            raise HTTPException(status_code=400, detail=f"La struttura ha massimo {mx} {label}: non puoi selezionarne {val}")
        if mn and val < mn:
            raise HTTPException(status_code=400, detail=f"La struttura prevede minimo {mn} {label}")


async def _enrich_cleaning_task(task: dict) -> dict:
    """Add display names for linked entities."""
    if task.get("client_id"):
        c = await db.clients.find_one({"id": task["client_id"]}, {"_id": 0, "private_info": 1, "company_info": 1, "client_type": 1})
        if c:
            if c.get("client_type") == "company":
                task["client_name"] = (c.get("company_info") or {}).get("company_name", "")
            else:
                pi = c.get("private_info") or {}
                task["client_name"] = f"{pi.get('first_name', '')} {pi.get('last_name', '')}".strip()
    if task.get("structure_id"):
        s = await db.structures.find_one({"id": task["structure_id"]}, {"_id": 0, "name": 1, "address": 1, "klv_code": 1})
        if s:
            task["structure_name"] = s.get("name", "")
            task["structure_address"] = s.get("address", "")
            task["klv_code"] = s.get("klv_code")
    if task.get("unit_id"):
        u = await db.units.find_one({"id": task["unit_id"]}, {"_id": 0, "name": 1})
        if u:
            task["unit_name"] = u.get("name", "")
    cleaner_ids = _cleaner_ids_of(task)
    if cleaner_ids:
        names = []
        async for cl in db.users.find({"id": {"$in": cleaner_ids}}, {"_id": 0, "id": 1, "name": 1, "first_name": 1, "last_name": 1}):
            names.append(cl.get("name") or f"{cl.get('first_name', '')} {cl.get('last_name', '')}".strip())
        task["cleaner_names"] = names
        task["cleaner_name"] = ", ".join(names)
    task["open_issues_count"] = len([i for i in (task.get("issues") or []) if i.get("status", "open") == "open"])
    if task.get("client_id"):
        c = await db.clients.find_one({"id": task["client_id"]}, {"_id": 0, "client_type": 1, "private_info": 1, "company_info": 1})
        if c:
            if c.get("client_type") == "company":
                task["client_name"] = (c.get("company_info") or {}).get("company_name")
            else:
                pi = c.get("private_info") or {}
                task["client_name"] = f"{pi.get('name', '') or pi.get('first_name', '')} {pi.get('surname', '') or pi.get('last_name', '')}".strip()
    return task


@api_router.get("/cleaning-tasks")
async def list_cleaning_tasks(
    date: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    status: Optional[str] = None,
    assigned_cleaner_id: Optional[str] = None,
    client_id: Optional[str] = None,
    structure_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    query = {}
    if date:
        query["date"] = date
    if date_from and date_to:
        query["date"] = {"$gte": date_from, "$lte": date_to}
    elif date_from:
        query["date"] = {"$gte": date_from}
    elif date_to:
        query["date"] = {"$lte": date_to}
    if status:
        query["status"] = status
    if assigned_cleaner_id:
        query["assigned_cleaner_id"] = assigned_cleaner_id
    if client_id:
        query["client_id"] = client_id
    if structure_id:
        query["structure_id"] = structure_id
    tasks = await db.cleaning_tasks.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    enriched = []
    for t in tasks:
        enriched.append(await _enrich_cleaning_task(t))
    return enriched


@api_router.get("/cleaning-tasks/my-tasks")
async def my_cleaning_tasks(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get cleaning tasks assigned to current cleaner."""
    query = {"$or": [{"assigned_cleaner_id": current_user["id"]}, {"assigned_cleaner_ids": current_user["id"]}]}
    if date:
        query["date"] = date
    else:
        query["date"] = {"$gte": local_today()}
    tasks = await db.cleaning_tasks.find(query, {"_id": 0}).sort([("date", 1), ("scheduled_time", 1), ("created_at", 1)]).to_list(100)
    enriched = []
    for t in tasks:
        enriched.append(await _enrich_cleaning_task(t))
    return enriched


@api_router.get("/cleaning-tasks/cleaners")
async def list_cleaners(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    cleaners = await db.users.find(
        {"role": UserRole.CLEANER, "is_active": True}, {"_id": 0, "id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}
    ).to_list(200)
    for c in cleaners:
        if not c.get("name"):
            c["name"] = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or c.get("email", "")
    return cleaners


@api_router.get("/cleaning-tasks/{task_id}")
async def get_cleaning_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    # Cleaners can only see their own tasks
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return await _enrich_cleaning_task(task)


@api_router.post("/cleaning-tasks")
async def create_cleaning_task(data: CleaningTaskCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    now = now_iso()
    cleaner_ids = list(dict.fromkeys((data.assigned_cleaner_ids or []) + ([data.assigned_cleaner_id] if data.assigned_cleaner_id else [])))
    status = CleaningTaskStatus.ASSIGNED if cleaner_ids else CleaningTaskStatus.UNASSIGNED
    await _validate_beds(data.structure_id, {"beds_double": data.beds_double, "beds_single": data.beds_single, "beds_sofa": data.beds_sofa})

    # Checklist: template esplicito → template della struttura → template standard Kilolava
    template_id = data.checklist_template_id
    client_id = data.client_id
    if data.structure_id:
        s = await db.structures.find_one({"id": data.structure_id}, {"_id": 0, "cleaning_template_id": 1, "client_id": 1})
        if s:
            if not template_id:
                template_id = s.get("cleaning_template_id")
            if not client_id:
                client_id = s.get("client_id")
    if not template_id:
        std = await db.checklist_templates.find_one({"key": "standard_kilolava"}, {"_id": 0, "id": 1})
        if std:
            template_id = std["id"]
    checklist_data = None
    if template_id:
        tmpl = await db.checklist_templates.find_one({"id": template_id}, {"_id": 0})
        if tmpl:
            checklist_data = {
                "template_id": tmpl["id"],
                "template_name": tmpl["name"],
                "sections": tmpl["sections"],
                "responses": {},
            }

    task = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "structure_id": data.structure_id,
        "unit_id": data.unit_id,
        "assigned_cleaner_id": cleaner_ids[0] if cleaner_ids else None,
        "assigned_cleaner_ids": cleaner_ids,
        "date": data.date,
        "scheduled_time": data.scheduled_time,
        "estimated_duration_minutes": data.estimated_duration_minutes,
        "guests_count": data.guests_count,
        "beds_double": data.beds_double or 0,
        "beds_single": data.beds_single or 0,
        "beds_sofa": data.beds_sofa or 0,
        "checkin_today": bool(data.checkin_today),
        "checkin_time": data.checkin_time,
        "access_notes": data.access_notes,
        "notes": data.notes,
        "checklist_template_id": template_id,
        "checklist": checklist_data,
        "photos": [],
        "media": [],
        "task_notes": [],
        "issues": [],
        "history": [{"action": "created", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now}],
        "status": status,
        "started_at": None,
        "started_by": None,
        "finished_at": None,
        "duration_minutes": None,
        "completed_at": None,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.cleaning_tasks.insert_one(task)
    task.pop("_id", None)
    enriched = await _enrich_cleaning_task(task)
    for cid in cleaner_ids:
        await create_notification(
            cid,
            "Nuova pulizia assegnata",
            f"Pulizia per {enriched.get('structure_name', '')} il {data.date}" + (f" alle {data.scheduled_time}" if data.scheduled_time else ""),
            "cleaning_assigned", "normal", "cleaning_task", task["id"]
        )
    return enriched


@api_router.put("/cleaning-tasks/{task_id}")
async def update_cleaning_task(task_id: str, data: CleaningTaskUpdate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    existing = await db.cleaning_tasks.find_one({"id": task_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Task non trovato")

    update = {"updated_at": now_iso()}
    target_structure = data.structure_id if data.structure_id is not None else existing.get("structure_id")
    beds_check = {
        "beds_double": data.beds_double if data.beds_double is not None else existing.get("beds_double"),
        "beds_single": data.beds_single if data.beds_single is not None else existing.get("beds_single"),
        "beds_sofa": data.beds_sofa if data.beds_sofa is not None else existing.get("beds_sofa"),
    }
    if any(getattr(data, f) is not None for f in ("beds_double", "beds_single", "beds_sofa", "structure_id")):
        await _validate_beds(target_structure, beds_check)
    for field in ["structure_id", "assigned_cleaner_id", "date", "scheduled_time", "estimated_duration_minutes",
                  "guests_count", "beds_double", "beds_single", "beds_sofa", "checkin_today", "checkin_time",
                  "access_notes", "notes", "status"]:
        val = getattr(data, field, None)
        if val is not None:
            update[field] = val
    new_cleaner_ids = None
    if data.assigned_cleaner_ids is not None:
        new_cleaner_ids = list(dict.fromkeys(data.assigned_cleaner_ids))
        update["assigned_cleaner_ids"] = new_cleaner_ids
        update["assigned_cleaner_id"] = new_cleaner_ids[0] if new_cleaner_ids else None
        if new_cleaner_ids and existing.get("status") == CleaningTaskStatus.UNASSIGNED:
            update["status"] = CleaningTaskStatus.ASSIGNED
    # If assigning a cleaner and status is unassigned, auto-set to assigned
    if data.assigned_cleaner_id and existing.get("status") == CleaningTaskStatus.UNASSIGNED:
        update["status"] = CleaningTaskStatus.ASSIGNED

    # Handle checklist template change
    if data.checklist_template_id is not None:
        update["checklist_template_id"] = data.checklist_template_id
        if data.checklist_template_id:
            tmpl = await db.checklist_templates.find_one({"id": data.checklist_template_id}, {"_id": 0})
            if tmpl:
                update["checklist"] = {
                    "template_id": tmpl["id"],
                    "template_name": tmpl["name"],
                    "sections": tmpl["sections"],
                    "responses": existing.get("checklist", {}).get("responses", {}),
                }

    await db.cleaning_tasks.update_one({"id": task_id}, {"$set": update})
    updated = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    # Notify cleaner if newly assigned
    prev_ids = set(_cleaner_ids_of(existing))
    for cid in set(_cleaner_ids_of(updated)) - prev_ids:
        enriched = await _enrich_cleaning_task(dict(updated))
        await create_notification(
            cid,
            "Pulizia assegnata",
            f"Ti e stata assegnata una pulizia per {enriched.get('structure_name', '')} il {updated.get('date', '')}",
            "cleaning_assigned", "normal", "cleaning_task", task_id
        )
    return await _enrich_cleaning_task(updated)


@api_router.delete("/cleaning-tasks/{task_id}")
async def delete_cleaning_task(task_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    result = await db.cleaning_tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task non trovato")
    await db.cleaning_issues.delete_many({"cleaning_task_id": task_id})
    return {"message": "Task eliminato"}


# --- Cleaning Task Status Update (for cleaners) ---

class CleaningStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None

@api_router.put("/cleaning-tasks/{task_id}/status")
async def update_cleaning_task_status(task_id: str, data: CleaningStatusUpdate, current_user: dict = Depends(get_current_user)):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if data.status not in CLEANING_TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Stato non valido")
    if current_user["role"] == UserRole.CLEANER and data.status in (CleaningTaskStatus.IN_PROGRESS, CleaningTaskStatus.COMPLETED, CleaningTaskStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="La pulizia inizia con il video iniziale e si completa con 'Completa pulizia'")

    update = {"status": data.status, "updated_at": now_iso()}
    if data.status == CleaningTaskStatus.IN_PROGRESS and not task.get("started_at"):
        update["started_at"] = now_iso()
    if data.status == CleaningTaskStatus.COMPLETED:
        # Check required checklist items
        checklist = task.get("checklist")
        if checklist:
            responses = checklist.get("responses", {})
            for section in checklist.get("sections", []):
                for item in section.get("items", []):
                    if item.get("required"):
                        key = f"{section['name']}|{item['label']}"
                        resp = responses.get(key)
                        if resp is None or resp == "" or resp is False:
                            raise HTTPException(status_code=400, detail=f"Item obbligatorio non completato: {item['label']}")
        # Check required photos (informational, not blocking)
        update["completed_at"] = now_iso()
    if data.notes:
        update["completion_notes"] = data.notes

    await db.cleaning_tasks.update_one({"id": task_id}, {"$set": update})
    updated = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    return await _enrich_cleaning_task(updated)


# --- Checklist Response (cleaner fills in) ---

class ChecklistResponseUpdate(BaseModel):
    responses: dict  # key = "sectionName|itemLabel", value = response

@api_router.put("/cleaning-tasks/{task_id}/checklist")
async def update_checklist_response(task_id: str, data: ChecklistResponseUpdate, current_user: dict = Depends(get_current_user)):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if not task.get("checklist"):
        raise HTTPException(status_code=400, detail="Nessuna checklist associata")

    # Merge responses
    existing_responses = task["checklist"].get("responses", {})
    existing_responses.update(data.responses)
    await db.cleaning_tasks.update_one(
        {"id": task_id},
        {"$set": {"checklist.responses": existing_responses, "updated_at": now_iso()}}
    )
    updated = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    return await _enrich_cleaning_task(updated)


# --- Photo Upload ---

@api_router.post("/cleaning-tasks/{task_id}/photos")
async def upload_cleaning_photo(
    task_id: str,
    photo_type: str = Query(..., description="initial, final, issue, checklist"),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    path = f"{APP_NAME}/cleaning/{task_id}/{photo_type}_{uuid.uuid4()}.{ext}"
    file_data = await file.read()
    result = put_object(path, file_data, file.content_type or "image/jpeg")
    storage_path = result["path"]

    photo_entry = {
        "id": str(uuid.uuid4()),
        "photo_type": photo_type,
        "file_path": storage_path,
        "uploaded_by": current_user["id"],
        "uploaded_at": now_iso(),
    }
    await db.cleaning_tasks.update_one(
        {"id": task_id},
        {"$push": {"photos": photo_entry}, "$set": {"updated_at": now_iso()}}
    )
    return photo_entry


# --- Issue Reporting ---

class CleaningIssueCreate(BaseModel):
    category: str  # missing, damage, malfunction, other (+ legacy)
    note: str = ""
    severity: str = "medium"  # low, medium, high
    attachment_ids: List[str] = []  # id di media già caricati con media_type=issue

@api_router.post("/cleaning-tasks/{task_id}/issues")
async def report_cleaning_issue(
    task_id: str,
    data: CleaningIssueCreate,
    current_user: dict = Depends(get_current_user),
):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if data.category not in ISSUE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria non valida")

    media_by_id = {m["id"]: m for m in (task.get("media") or [])}
    attachments = [media_by_id[mid] for mid in data.attachment_ids if mid in media_by_id]
    if data.category in REPORT_CATEGORIES_REQUIRING_MEDIA and not attachments:
        label = "Rottura / Danno" if data.category == "damage" else "Malfunzionamento / Manutenzione"
        raise HTTPException(status_code=400, detail=f"Per una segnalazione '{label}' serve almeno 1 foto o 1 video")
    if not data.note.strip():
        raise HTTPException(status_code=400, detail="Inserisci una breve descrizione")

    structure = None
    if task.get("structure_id"):
        structure = await db.structures.find_one({"id": task["structure_id"]}, {"_id": 0, "name": 1, "klv_code": 1})

    now = now_iso()
    issue = {
        "id": str(uuid.uuid4()),
        "cleaning_task_id": task_id,
        "client_id": task.get("client_id"),
        "structure_id": task.get("structure_id"),
        "structure_name": (structure or {}).get("name"),
        "klv_code": (structure or {}).get("klv_code"),
        "unit_id": task.get("unit_id"),
        "date": task.get("date"),
        "category": data.category,
        "note": data.note,
        "severity": data.severity,
        "attachments": [{"id": a["id"], "kind": a.get("kind"), "file_path": a["file_path"]} for a in attachments],
        "photo_path": attachments[0]["file_path"] if attachments else None,
        "status": "open",
        "published_to_client": False,
        "actions": [],
        "reported_by": current_user["id"],
        "reporter_name": current_user.get("name", ""),
        "created_at": now,
    }
    await db.cleaning_issues.insert_one(issue)
    issue.pop("_id", None)
    await db.cleaning_tasks.update_one(
        {"id": task_id},
        {"$push": {"issues": {"id": issue["id"], "category": data.category, "note": data.note, "severity": data.severity,
                              "status": "open", "reporter_name": current_user.get("name", ""),
                              "attachments_count": len(attachments), "created_at": now}},
         "$set": {"updated_at": now}}
    )
    # La destinazione (consegna / manutenzione / cliente) la decide Admin, NON l'addetta.
    enriched_task = await _enrich_cleaning_task(dict(task))
    cat_labels = {"missing": "Mancanza", "damage": "Rottura/Danno", "malfunction": "Malfunzionamento", "other": "Anomalia"}
    await notify_ops_users(
        "Nuova segnalazione da pulizia",
        f"{cat_labels.get(data.category, data.category)}: {data.note[:60]}" + (f" - {enriched_task.get('structure_name', '')}" if enriched_task.get('structure_name') else ''),
        "issue_from_cleaning", "important", "cleaning_issue", issue["id"]
    )
    return issue


@api_router.post("/cleaning-issues/{issue_id}/photo")
async def upload_issue_photo(
    issue_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    issue = await db.cleaning_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Segnalazione non trovata")

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    path = f"{APP_NAME}/issues/{issue_id}/{uuid.uuid4()}.{ext}"
    file_data = await file.read()
    result = put_object(path, file_data, file.content_type or "image/jpeg")
    storage_path = result["path"]

    await db.cleaning_issues.update_one({"id": issue_id}, {"$set": {"photo_path": storage_path}})
    return {"path": storage_path}


@api_router.get("/cleaning-issues")
async def list_cleaning_issues(
    status: Optional[str] = None,
    category: Optional[str] = None,
    structure_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    query = {}
    if status:
        query["status"] = status
    if category:
        query["category"] = category
    if structure_id:
        query["structure_id"] = structure_id
    issues = await db.cleaning_issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return issues


# --- Flusso operativo Pulizie v2: media/video timer, note, completamento, ricorrenze ---

CLEANING_MEDIA_TYPES = ["initial_video", "final_video", "warehouse_photo", "note", "issue", "photo"]


@api_router.post("/cleaning-tasks/{task_id}/media")
async def upload_cleaning_media(
    task_id: str,
    media_type: str = Query(...),
    note_id: Optional[str] = Query(None),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if media_type not in CLEANING_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail="Tipo media non valido")
    if task.get("status") in (CleaningTaskStatus.COMPLETED, CleaningTaskStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="La pulizia è già chiusa")

    content_type = file.content_type or "application/octet-stream"
    kind = "video" if content_type.startswith("video") else "image"
    if media_type in ("initial_video", "final_video") and kind != "video":
        raise HTTPException(status_code=400, detail="È richiesto un video (non una foto)")
    if media_type == "warehouse_photo" and kind != "image":
        raise HTTPException(status_code=400, detail="È richiesta una foto del magazzino")
    if media_type == "final_video" and not task.get("started_at"):
        raise HTTPException(status_code=400, detail="Carica prima il video iniziale dell'appartamento")

    ext = file.filename.split(".")[-1] if "." in (file.filename or "") else ("mp4" if kind == "video" else "jpg")
    path = f"{APP_NAME}/cleaning/{task_id}/{media_type}_{uuid.uuid4()}.{ext}"
    file_data = await file.read()
    result = put_object(path, file_data, content_type)

    now = now_iso()
    entry = {
        "id": str(uuid.uuid4()),
        "media_type": media_type,
        "kind": kind,
        "file_path": result["path"],
        "structure_id": task.get("structure_id"),
        "date": task.get("date"),
        "uploaded_by": current_user["id"],
        "uploaded_by_name": current_user.get("name", ""),
        "uploaded_at": now,
    }
    update_set = {"updated_at": now}
    history_entry = None
    timer = {}
    if media_type == "initial_video" and not task.get("started_at"):
        update_set.update({
            "started_at": now,
            "started_by": current_user["id"],
            "started_by_name": current_user.get("name", ""),
            "status": CleaningTaskStatus.IN_PROGRESS,
        })
        history_entry = {"action": "started_via_initial_video", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now}
        timer = {"started_at": now, "status": CleaningTaskStatus.IN_PROGRESS}
    elif media_type == "final_video":
        started = task.get("started_at")
        duration = None
        try:
            duration = int((datetime.fromisoformat(now) - datetime.fromisoformat(started)).total_seconds() / 60)
        except (TypeError, ValueError):
            pass
        update_set.update({"finished_at": now, "duration_minutes": duration,
                           "finished_by": current_user["id"], "finished_by_name": current_user.get("name", "")})
        history_entry = {"action": "timer_stopped_via_final_video", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now}
        timer = {"finished_at": now, "duration_minutes": duration}

    push = {"media": entry}
    if history_entry:
        push["history"] = history_entry
    await db.cleaning_tasks.update_one({"id": task_id}, {"$push": push, "$set": update_set})
    if note_id:
        await db.cleaning_tasks.update_one(
            {"id": task_id},
            {"$push": {"task_notes.$[n].media": {"id": entry["id"], "kind": kind, "file_path": entry["file_path"]}}},
            array_filters=[{"n.id": note_id}],
        )
    return {**entry, **timer}


class CleaningNoteCreate(BaseModel):
    text: str = ""


@api_router.post("/cleaning-tasks/{task_id}/notes")
async def add_cleaning_note(task_id: str, data: CleaningNoteCreate, current_user: dict = Depends(get_current_user)):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    note = {
        "id": str(uuid.uuid4()),
        "text": data.text,
        "media": [],
        "by": current_user["id"],
        "by_name": current_user.get("name", ""),
        "at": now_iso(),
    }
    await db.cleaning_tasks.update_one({"id": task_id}, {"$push": {"task_notes": note}, "$set": {"updated_at": note["at"]}})
    return note


def _checklist_missing_required(task: dict) -> int:
    checklist = task.get("checklist")
    if not checklist:
        return 0
    responses = checklist.get("responses", {})
    missing = 0
    for section in checklist.get("sections", []):
        for item in section.get("items", []):
            if item.get("required"):
                key = f"{section['name']}|{item['label']}"
                resp = responses.get(key)
                if resp is None or resp == "" or resp is False:
                    missing += 1
    return missing


@api_router.post("/cleaning-tasks/{task_id}/complete")
async def complete_cleaning_task(task_id: str, current_user: dict = Depends(get_current_user)):
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if task.get("status") == CleaningTaskStatus.COMPLETED:
        return await _enrich_cleaning_task(task)

    media = task.get("media") or []
    has = lambda t: any(m.get("media_type") == t for m in media)  # noqa: E731
    missing = []
    if not has("initial_video"):
        missing.append("il video iniziale dell'appartamento")
    checklist_missing = _checklist_missing_required(task)
    if checklist_missing:
        missing.append(f"la checklist ({checklist_missing} voci obbligatorie da completare)")
    if not has("warehouse_photo"):
        missing.append("la foto del Magazzino Struttura")
    if not has("final_video"):
        missing.append("il video finale dell'appartamento")
    if missing:
        raise HTTPException(status_code=400, detail="Non puoi completare la pulizia: manca " + "; ".join(missing))

    now = now_iso()
    await db.cleaning_tasks.update_one({"id": task_id}, {
        "$set": {"status": CleaningTaskStatus.COMPLETED, "completed_at": now, "updated_at": now,
                 "completed_by": current_user["id"], "completed_by_name": current_user.get("name", "")},
        "$push": {"history": {"action": "completed", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now}},
    })
    updated = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    return await _enrich_cleaning_task(updated)


def _copy_task_for_date(source: dict, date: str, user: dict) -> dict:
    now = now_iso()
    checklist = None
    if source.get("checklist"):
        checklist = {**source["checklist"], "responses": {}}
    return {
        "id": str(uuid.uuid4()),
        "client_id": source.get("client_id"),
        "structure_id": source.get("structure_id"),
        "unit_id": source.get("unit_id"),
        "assigned_cleaner_id": source.get("assigned_cleaner_id"),
        "assigned_cleaner_ids": source.get("assigned_cleaner_ids") or [],
        "date": date,
        "scheduled_time": source.get("scheduled_time"),
        "estimated_duration_minutes": source.get("estimated_duration_minutes"),
        "guests_count": source.get("guests_count"),
        "beds_double": source.get("beds_double") or 0,
        "beds_single": source.get("beds_single") or 0,
        "beds_sofa": source.get("beds_sofa") or 0,
        "checkin_today": source.get("checkin_today", False),
        "checkin_time": source.get("checkin_time"),
        "access_notes": source.get("access_notes"),
        "notes": source.get("notes"),
        "checklist_template_id": source.get("checklist_template_id"),
        "checklist": checklist,
        "photos": [], "media": [], "task_notes": [], "issues": [],
        "history": [{"action": "created", "by": user["id"], "by_name": user.get("name", ""), "at": now}],
        "status": CleaningTaskStatus.ASSIGNED if _cleaner_ids_of(source) else CleaningTaskStatus.UNASSIGNED,
        "started_at": None, "started_by": None, "finished_at": None,
        "duration_minutes": None, "completed_at": None,
        "created_by": user["id"], "created_at": now, "updated_at": now,
    }


class DuplicateTaskRequest(BaseModel):
    date: str


@api_router.post("/cleaning-tasks/{task_id}/duplicate")
async def duplicate_cleaning_task(task_id: str, data: DuplicateTaskRequest, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    source = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=404, detail="Task non trovato")
    copy = _copy_task_for_date(source, data.date, current_user)
    await db.cleaning_tasks.insert_one(copy)
    copy.pop("_id", None)
    return await _enrich_cleaning_task(copy)


class RecurrenceRequest(BaseModel):
    mode: str  # weekly_days | every_n_days
    weekdays: List[int] = []  # 0 = lunedì ... 6 = domenica
    interval_days: int = 7
    until_date: Optional[str] = None
    occurrences: Optional[int] = None


@api_router.post("/cleaning-tasks/{task_id}/recurrence")
async def create_cleaning_recurrence(task_id: str, data: RecurrenceRequest, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    source = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not source:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if source.get("recurrence_series_id"):
        raise HTTPException(status_code=400, detail="Questa pulizia fa già parte di una serie ricorrente: non puoi creare una seconda serie")
    if data.mode not in ("weekly_days", "every_n_days"):
        raise HTTPException(status_code=400, detail="Modalità ricorrenza non valida")
    if not data.until_date and not data.occurrences:
        raise HTTPException(status_code=400, detail="Indica una data di fine oppure il numero di occorrenze")

    start = datetime.fromisoformat(source["date"]).date()
    limit_date = datetime.fromisoformat(data.until_date).date() if data.until_date else start + timedelta(days=365)
    max_occ = min(int(data.occurrences or 60), 60)
    dates = []
    if data.mode == "every_n_days":
        step = max(1, int(data.interval_days or 7))
        d = start + timedelta(days=step)
        while d <= limit_date and len(dates) < max_occ:
            dates.append(d.isoformat())
            d += timedelta(days=step)
    else:
        weekdays = sorted(set(data.weekdays)) or [start.weekday()]
        d = start + timedelta(days=1)
        while d <= limit_date and len(dates) < max_occ:
            if d.weekday() in weekdays:
                dates.append(d.isoformat())
            d += timedelta(days=1)

    series_id = str(uuid.uuid4())
    created = []
    for date_str in dates:
        copy = _copy_task_for_date(source, date_str, current_user)
        copy["recurrence_of"] = task_id
        copy["recurrence_series_id"] = series_id
        await db.cleaning_tasks.insert_one(copy)
        created.append(date_str)
    recurrence_info = {
        "series_id": series_id,
        "mode": data.mode,
        "weekdays": sorted(set(data.weekdays)) if data.mode == "weekly_days" else [],
        "interval_days": int(data.interval_days or 7) if data.mode == "every_n_days" else None,
        "until_date": data.until_date,
        "occurrences": data.occurrences,
        "start_date": source["date"],
        "dates": created,
        "created_by": current_user["id"],
        "created_at": now_iso(),
    }
    await db.cleaning_tasks.update_one(
        {"id": task_id},
        {"$set": {"recurrence_series_id": series_id, "recurrence_info": recurrence_info, "updated_at": now_iso()}}
    )
    return {"created": len(created), "dates": created, "series_id": series_id}


@api_router.get("/cleaning-tasks/{task_id}/series")
async def cleaning_task_series(task_id: str, current_user: dict = Depends(get_current_user)):
    """Info della serie ricorrente a cui appartiene la pulizia."""
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0, "recurrence_series_id": 1})
    if not task or not task.get("recurrence_series_id"):
        raise HTTPException(status_code=404, detail="Questa pulizia non appartiene a una serie ricorrente")
    sid = task["recurrence_series_id"]
    origin = await db.cleaning_tasks.find_one(
        {"recurrence_series_id": sid, "recurrence_info": {"$exists": True}}, {"_id": 0, "recurrence_info": 1, "date": 1}
    )
    tasks = await db.cleaning_tasks.find(
        {"recurrence_series_id": sid},
        {"_id": 0, "id": 1, "date": 1, "status": 1, "scheduled_time": 1, "structure_id": 1}
    ).sort("date", 1).to_list(100)
    return {"series_id": sid, "info": (origin or {}).get("recurrence_info"), "tasks": tasks}


@api_router.get("/cleaning-tasks/{task_id}/operational")
async def cleaning_task_operational(task_id: str, current_user: dict = Depends(get_current_user)):
    """Info operative per l'addetta: dove andare, come arrivare, come entrare, magazzino."""
    task = await db.cleaning_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task non trovato")
    if current_user["role"] == UserRole.CLEANER and not _cleaner_can_access(task, current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if current_user["role"] not in (UserRole.CLEANER,) and not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    result = {"structure": None, "media": {"arrive": [], "enter": [], "warehouse": []}}
    sid = task.get("structure_id")
    if not sid:
        return result
    s = await db.structures.find_one({"id": sid}, {"_id": 0})
    if not s:
        return result
    ai = s.get("access_info") or {}
    result["structure"] = {
        "id": s["id"],
        "name": s.get("name"),
        "klv_code": s.get("klv_code"),
        "address": s.get("address"),
        "floor": s.get("floor"),
        "access_type": s.get("access_type"),
        "access_details": s.get("access_details"),
        "door_code": ai.get("door_code"),
        "keybox_code": ai.get("keybox_code"),
        "keybox_location": ai.get("keybox_location"),
        "key_boxes": ai.get("key_boxes"),
        "kilolava_has_keys": ai.get("kilolava_has_keys"),
        "warehouse_info": s.get("warehouse_info") or {},
    }
    media = await db.structure_media.find(
        {"structure_id": sid, "category": {"$in": ["arrive", "enter", "warehouse"]}}, {"_id": 0}
    ).sort([("category", 1), ("order", 1)]).to_list(300)
    for m in media:
        result["media"].setdefault(m.get("category", "arrive"), []).append(m)
    return result


class IssueActionRequest(BaseModel):
    action: str  # add_to_delivery | create_maintenance | publish_client | close
    note: Optional[str] = None


@api_router.post("/cleaning-issues/{issue_id}/action")
async def cleaning_issue_action(issue_id: str, data: IssueActionRequest, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    issue = await db.cleaning_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Segnalazione non trovata")
    now = now_iso()
    action_entry = {"action": data.action, "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "note": data.note}
    updates = {}
    if data.action == "add_to_delivery":
        updates["status"] = "to_delivery"
    elif data.action == "create_maintenance":
        maint = {
            "id": str(uuid.uuid4()),
            "source": "cleaning",
            "cleaning_task_id": issue.get("cleaning_task_id"),
            "cleaning_issue_id": issue_id,
            "client_id": issue.get("client_id"),
            "structure_id": issue.get("structure_id"),
            "unit_id": issue.get("unit_id"),
            "category": "maintenance" if issue.get("category") in ("malfunction",) else "damage" if issue.get("category") == "damage" else "other",
            "description": issue.get("note", ""),
            "priority": {"low": "low", "medium": "medium", "high": "high"}.get(issue.get("severity"), "medium"),
            "status": "open",
            "assigned_to": None, "scheduled_date": None,
            "internal_notes": data.note or "", "resolution_notes": "",
            "photos": [{"type": "issue", "path": a.get("file_path")} for a in (issue.get("attachments") or [])],
            "history": [{"action": "created", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": "Creata da segnalazione pulizia"}],
            "reported_by": issue.get("reported_by"),
            "reporter_name": issue.get("reporter_name", ""),
            "created_at": now, "updated_at": now,
        }
        await db.maintenance_issues.insert_one(maint)
        updates["status"] = "maintenance_created"
        updates["maintenance_issue_id"] = maint["id"]
    elif data.action == "publish_client":
        updates["published_to_client"] = True
        if issue.get("client_id"):
            client_users = await db.users.find({"client_id": issue["client_id"], "role": UserRole.CLIENT, "is_active": True}, {"_id": 0, "id": 1}).to_list(10)
            for cu in client_users:
                await create_notification(
                    cu["id"],
                    "Segnalazione dalla tua struttura",
                    f"{issue.get('structure_name') or ''}: {issue.get('note', '')[:80]}",
                    "issue_published", "normal", "cleaning_issue", issue_id
                )
    elif data.action == "close":
        updates["status"] = "closed"
        updates["closed_at"] = now
    else:
        raise HTTPException(status_code=400, detail="Azione non valida")
    await db.cleaning_issues.update_one({"id": issue_id}, {"$set": updates, "$push": {"actions": action_entry}})
    if "status" in updates and issue.get("cleaning_task_id"):
        await db.cleaning_tasks.update_one(
            {"id": issue["cleaning_task_id"], "issues.id": issue_id},
            {"$set": {"issues.$.status": updates["status"]}}
        )
    updated = await db.cleaning_issues.find_one({"id": issue_id}, {"_id": 0})
    return updated


@api_router.get("/portal/my-structures-today")
async def portal_my_structures_today(current_user: dict = Depends(get_current_user)):
    """Vista Cliente minimale: stato pulizia odierna per struttura (nessun dato interno)."""
    if current_user.get("role") != UserRole.CLIENT or not current_user.get("client_id"):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    today = local_today()
    structures = await db.structures.find({"client_id": current_user["client_id"]}, {"_id": 0, "id": 1, "name": 1, "address": 1}).to_list(100)
    out = []
    for s in structures:
        tasks = await db.cleaning_tasks.find(
            {"structure_id": s["id"], "date": today, "status": {"$ne": CleaningTaskStatus.CANCELLED}},
            {"_id": 0, "status": 1, "guests_count": 1, "completed_at": 1}
        ).to_list(20)
        status = None
        guests = None
        if any(t.get("status") == CleaningTaskStatus.IN_PROGRESS for t in tasks):
            status = "in_cleaning"
        elif any(t.get("status") in (CleaningTaskStatus.ASSIGNED, CleaningTaskStatus.UNASSIGNED, CleaningTaskStatus.NEEDS_REVIEW, CleaningTaskStatus.ISSUE_REPORTED) for t in tasks):
            status = "to_clean"
        else:
            completed = [t for t in tasks if t.get("status") == CleaningTaskStatus.COMPLETED]
            if completed:
                status = "ready"
                guests = completed[-1].get("guests_count")
        out.append({"structure_id": s["id"], "name": s.get("name"), "address": s.get("address"),
                    "cleaning_status": status, "guests_count": guests})
    return out


@api_router.put("/cleaning-issues/{issue_id}")
async def update_cleaning_issue(issue_id: str, current_user: dict = Depends(get_current_user)):
    """Toggle issue status between open/acknowledged/resolved."""
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    issue = await db.cleaning_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Segnalazione non trovata")
    current_status = issue.get("status", "open")
    next_map = {"open": "acknowledged", "acknowledged": "resolved", "resolved": "open"}
    new_status = next_map.get(current_status, "acknowledged")
    await db.cleaning_issues.update_one({"id": issue_id}, {"$set": {"status": new_status}})
    return {"status": new_status}


# ============== MAINTENANCE MODULE ==============

MAINT_STATUSES = ["open", "assigned", "in_progress", "resolved", "closed"]
MAINT_PRIORITIES = ["low", "medium", "high", "urgent"]
MAINT_CATEGORIES = ["electrical", "plumbing", "furniture", "damage", "missing_item", "broken_item", "missing_supplies", "maintenance", "other"]


async def _enrich_maint_issue(issue: dict) -> dict:
    if issue.get("client_id"):
        c = await db.clients.find_one({"id": issue["client_id"]}, {"_id": 0, "private_info": 1, "company_info": 1, "client_type": 1})
        if c:
            if c.get("client_type") == "company":
                issue["client_name"] = (c.get("company_info") or {}).get("company_name", "")
            else:
                pi = c.get("private_info") or {}
                issue["client_name"] = f"{pi.get('first_name', '')} {pi.get('last_name', '')}".strip()
    if issue.get("structure_id"):
        s = await db.structures.find_one({"id": issue["structure_id"]}, {"_id": 0, "name": 1, "address": 1})
        if s:
            issue["structure_name"] = s.get("name", "")
            issue["structure_address"] = s.get("address", "")
    if issue.get("unit_id"):
        u = await db.units.find_one({"id": issue["unit_id"]}, {"_id": 0, "name": 1})
        if u:
            issue["unit_name"] = u.get("name", "")
    if issue.get("assigned_to"):
        usr = await db.users.find_one({"id": issue["assigned_to"]}, {"_id": 0, "name": 1, "first_name": 1, "last_name": 1})
        if usr:
            issue["assigned_name"] = usr.get("name") or f"{usr.get('first_name', '')} {usr.get('last_name', '')}".strip()
    return issue


# --- Maintenance Issues CRUD ---

@api_router.get("/maintenance/issues")
async def list_maintenance_issues(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    structure_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    query = {}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if category:
        query["category"] = category
    if structure_id:
        query["structure_id"] = structure_id
    if assigned_to:
        query["assigned_to"] = assigned_to
    issues = await db.maintenance_issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    enriched = []
    for i in issues:
        enriched.append(await _enrich_maint_issue(i))
    return enriched


@api_router.get("/maintenance/my-tasks")
async def my_maintenance_tasks(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"assigned_to": current_user["id"]}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$nin": ["closed"]}
    issues = await db.maintenance_issues.find(query, {"_id": 0}).sort([("priority_order", -1), ("created_at", -1)]).to_list(200)
    enriched = []
    for i in issues:
        enriched.append(await _enrich_maint_issue(i))
    return enriched


@api_router.get("/maintenance/staff")
async def list_maintenance_staff(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    staff = await db.users.find(
        {"role": UserRole.MAINTENANCE, "is_active": True}, {"_id": 0, "id": 1, "name": 1, "first_name": 1, "last_name": 1, "email": 1}
    ).to_list(200)
    for s in staff:
        if not s.get("name"):
            s["name"] = f"{s.get('first_name', '')} {s.get('last_name', '')}".strip() or s.get("email", "")
    return staff


@api_router.get("/maintenance/issues/{issue_id}")
async def get_maintenance_issue(issue_id: str, current_user: dict = Depends(get_current_user)):
    issue = await db.maintenance_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue non trovato")
    if current_user["role"] == UserRole.MAINTENANCE and issue.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return await _enrich_maint_issue(issue)


class MaintenanceIssueCreate(BaseModel):
    client_id: Optional[str] = None
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    category: str = "other"
    description: str = ""
    priority: str = "medium"
    assigned_to: Optional[str] = None
    scheduled_date: Optional[str] = None
    internal_notes: str = ""


@api_router.post("/maintenance/issues")
async def create_maintenance_issue(data: MaintenanceIssueCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if data.category not in MAINT_CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria non valida")
    if data.priority not in MAINT_PRIORITIES:
        raise HTTPException(status_code=400, detail="Priorita non valida")

    now = now_iso()
    priority_order = {"low": 0, "medium": 1, "high": 2, "urgent": 3}.get(data.priority, 1)
    status = "assigned" if data.assigned_to else "open"

    issue = {
        "id": str(uuid.uuid4()),
        "source": "manual",
        "cleaning_task_id": None,
        "cleaning_issue_id": None,
        "client_id": data.client_id,
        "structure_id": data.structure_id,
        "unit_id": data.unit_id,
        "category": data.category,
        "description": data.description,
        "priority": data.priority,
        "priority_order": priority_order,
        "status": status,
        "assigned_to": data.assigned_to,
        "scheduled_date": data.scheduled_date,
        "internal_notes": data.internal_notes,
        "resolution_notes": "",
        "photos": [],
        "history": [{"action": "created", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": "Creazione manuale"}],
        "reported_by": current_user["id"],
        "reporter_name": current_user.get("name", ""),
        "created_at": now,
        "updated_at": now,
    }
    if data.assigned_to:
        usr = await db.users.find_one({"id": data.assigned_to}, {"_id": 0, "name": 1})
        issue["history"].append({"action": "assigned", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": f"Assegnato a {usr.get('name', '') if usr else ''}"})

    await db.maintenance_issues.insert_one(issue)
    issue.pop("_id", None)
    enriched = await _enrich_maint_issue(issue)
    # Notify assigned maintenance staff
    if data.assigned_to:
        cat_label = data.category.replace("_", " ").title()
        await create_notification(
            data.assigned_to,
            "Nuovo intervento assegnato",
            f"{cat_label}: {data.description[:60]}{'...' if len(data.description) > 60 else ''}" + (f" - {enriched.get('structure_name', '')}" if enriched.get('structure_name') else ''),
            "maintenance_assigned", "important" if data.priority in ["high", "urgent"] else "normal", "maintenance_issue", issue["id"]
        )
    return enriched


class MaintenanceIssueUpdate(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    scheduled_date: Optional[str] = None
    internal_notes: Optional[str] = None


@api_router.put("/maintenance/issues/{issue_id}")
async def update_maintenance_issue(issue_id: str, data: MaintenanceIssueUpdate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    issue = await db.maintenance_issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue non trovato")

    now = now_iso()
    update = {"updated_at": now}
    history_entries = []

    for field in ["category", "description", "internal_notes", "scheduled_date"]:
        val = getattr(data, field, None)
        if val is not None:
            update[field] = val

    if data.priority is not None and data.priority != issue.get("priority"):
        if data.priority not in MAINT_PRIORITIES:
            raise HTTPException(status_code=400, detail="Priorita non valida")
        update["priority"] = data.priority
        update["priority_order"] = {"low": 0, "medium": 1, "high": 2, "urgent": 3}.get(data.priority, 1)
        history_entries.append({"action": "priority_changed", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": f"Priorita: {issue.get('priority')} -> {data.priority}"})

    if data.assigned_to is not None and data.assigned_to != issue.get("assigned_to"):
        update["assigned_to"] = data.assigned_to or None
        if data.assigned_to:
            usr = await db.users.find_one({"id": data.assigned_to}, {"_id": 0, "name": 1})
            name = usr.get("name", "") if usr else ""
            history_entries.append({"action": "assigned", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": f"Assegnato a {name}"})
            if issue.get("status") == "open":
                update["status"] = "assigned"
                history_entries.append({"action": "status_changed", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": "Stato: open -> assigned"})
        else:
            history_entries.append({"action": "unassigned", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": "Rimosso assegnatario"})

    ops = {"$set": update}
    if history_entries:
        ops["$push"] = {"history": {"$each": history_entries}}
    await db.maintenance_issues.update_one({"id": issue_id}, ops)
    updated = await db.maintenance_issues.find_one({"id": issue_id}, {"_id": 0})
    # Notify if newly assigned
    if data.assigned_to and data.assigned_to != issue.get("assigned_to"):
        enriched = await _enrich_maint_issue(updated)
        await create_notification(
            data.assigned_to,
            "Intervento assegnato",
            f"{updated.get('category', '').replace('_', ' ').title()}: {updated.get('description', '')[:60]}" + (f" - {enriched.get('structure_name', '')}" if enriched.get('structure_name') else ''),
            "maintenance_assigned", "important", "maintenance_issue", issue_id
        )
    return await _enrich_maint_issue(updated)


@api_router.delete("/maintenance/issues/{issue_id}")
async def delete_maintenance_issue(issue_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    result = await db.maintenance_issues.delete_one({"id": issue_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Issue non trovato")
    return {"message": "Issue eliminato"}


# --- Status Update (ops + maintenance staff) ---

class MaintStatusUpdate(BaseModel):
    status: str
    resolution_notes: Optional[str] = None
    notes: Optional[str] = None

@api_router.put("/maintenance/issues/{issue_id}/status")
async def update_maint_status(issue_id: str, data: MaintStatusUpdate, current_user: dict = Depends(get_current_user)):
    issue = await db.maintenance_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue non trovato")
    if current_user["role"] == UserRole.MAINTENANCE and issue.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    if data.status not in MAINT_STATUSES:
        raise HTTPException(status_code=400, detail="Stato non valido")

    now = now_iso()
    old_status = issue.get("status", "open")
    update = {"status": data.status, "updated_at": now}
    history_entry = {"action": "status_changed", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": f"Stato: {old_status} -> {data.status}"}

    if data.resolution_notes:
        update["resolution_notes"] = data.resolution_notes
    if data.notes:
        update["internal_notes"] = (issue.get("internal_notes", "") + "\n" + data.notes).strip()

    if data.status == "resolved":
        update["resolved_at"] = now
    if data.status == "closed":
        update["closed_at"] = now

    await db.maintenance_issues.update_one(
        {"id": issue_id},
        {"$set": update, "$push": {"history": history_entry}}
    )
    updated = await db.maintenance_issues.find_one({"id": issue_id}, {"_id": 0})
    return await _enrich_maint_issue(updated)


# --- Photo Upload for Maintenance ---

@api_router.post("/maintenance/issues/{issue_id}/photo")
async def upload_maint_photo(
    issue_id: str,
    photo_type: str = Query("after", description="issue or after"),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    issue = await db.maintenance_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue non trovato")
    if current_user["role"] == UserRole.MAINTENANCE and issue.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Non autorizzato")

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    path = f"{APP_NAME}/maintenance/{issue_id}/{photo_type}_{uuid.uuid4()}.{ext}"
    file_data = await file.read()
    result = put_object(path, file_data, file.content_type or "image/jpeg")
    storage_path = result["path"]

    photo_entry = {"type": photo_type, "path": storage_path, "uploaded_at": now_iso(), "uploaded_by": current_user["id"]}
    now = now_iso()
    await db.maintenance_issues.update_one(
        {"id": issue_id},
        {"$push": {"photos": photo_entry, "history": {"action": "photo_added", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": f"Foto {photo_type} aggiunta"}},
         "$set": {"updated_at": now}}
    )
    return photo_entry


# --- Add Note ---

class MaintNoteAdd(BaseModel):
    note: str

@api_router.post("/maintenance/issues/{issue_id}/notes")
async def add_maint_note(issue_id: str, data: MaintNoteAdd, current_user: dict = Depends(get_current_user)):
    issue = await db.maintenance_issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue non trovato")
    if current_user["role"] == UserRole.MAINTENANCE and issue.get("assigned_to") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Non autorizzato")

    now = now_iso()
    existing = issue.get("internal_notes", "")
    new_notes = (existing + "\n" + f"[{current_user.get('name', '')}] {data.note}").strip()
    await db.maintenance_issues.update_one(
        {"id": issue_id},
        {"$set": {"internal_notes": new_notes, "updated_at": now},
         "$push": {"history": {"action": "note_added", "by": current_user["id"], "by_name": current_user.get("name", ""), "at": now, "detail": data.note[:100]}}}
    )
    return {"message": "Nota aggiunta"}


# --- Summary for Dashboard ---

@api_router.get("/maintenance/summary")
async def maintenance_summary(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    pipeline = [
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    status_counts = {}
    async for doc in db.maintenance_issues.aggregate(pipeline):
        status_counts[doc["_id"]] = doc["count"]

    priority_pipeline = [
        {"$match": {"status": {"$nin": ["closed", "resolved"]}}},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
    ]
    priority_counts = {}
    async for doc in db.maintenance_issues.aggregate(priority_pipeline):
        priority_counts[doc["_id"]] = doc["count"]

    total = sum(status_counts.values())
    open_count = sum(v for k, v in status_counts.items() if k not in ["closed", "resolved"])
    return {
        "total": total,
        "open": open_count,
        "by_status": status_counts,
        "by_priority": priority_counts,
    }


# ============== NOTIFICATIONS MODULE ==============

NOTIFICATION_PRIORITIES = ["normal", "important", "urgent"]

async def create_notification(
    recipient_id: str,
    title: str,
    message: str,
    notification_type: str,
    priority: str = "normal",
    entity_type: str = None,
    entity_id: str = None,
):
    """Create a notification for a specific user."""
    notif = {
        "id": str(uuid.uuid4()),
        "recipient_id": recipient_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "priority": priority,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "read": False,
        "created_at": now_iso(),
    }
    await db.notifications.insert_one(notif)
    return notif


async def notify_ops_users(title: str, message: str, notification_type: str, priority: str = "normal", entity_type: str = None, entity_id: str = None):
    """Send notification to all admin and operations_manager users."""
    ops = await db.users.find(
        {"role": {"$in": [UserRole.ADMIN, UserRole.OPS_MANAGER]}, "is_active": True},
        {"_id": 0, "id": 1}
    ).to_list(50)
    for u in ops:
        await create_notification(u["id"], title, message, notification_type, priority, entity_type, entity_id)


@api_router.get("/notifications")
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    skip: int = 0,
    current_user: dict = Depends(get_current_user),
):
    query = {"recipient_id": current_user["id"]}
    if unread_only:
        query["read"] = False
    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return notifications


@api_router.get("/notifications/unread-count")
async def unread_count(current_user: dict = Depends(get_current_user)):
    count = await db.notifications.count_documents({"recipient_id": current_user["id"], "read": False})
    return {"count": count}


@api_router.put("/notifications/{notification_id}/read")
async def mark_as_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"id": notification_id, "recipient_id": current_user["id"]},
        {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    return {"message": "ok"}


@api_router.put("/notifications/mark-all-read")
async def mark_all_read(current_user: dict = Depends(get_current_user)):
    await db.notifications.update_many(
        {"recipient_id": current_user["id"], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "ok"}


@api_router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.delete_one({"id": notification_id, "recipient_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notifica non trovata")
    return {"message": "ok"}


# ============== REPORTING & ANALYTICS MODULE ==============

def _date_range(month: str = None, date_from: str = None, date_to: str = None):
    """Return (start, end) date strings for filtering."""
    if date_from and date_to:
        return date_from, date_to
    if month:
        y, m = int(month[:4]), int(month[5:7])
        start = f"{y}-{m:02d}-01"
        if m == 12:
            end = f"{y + 1}-01-01"
        else:
            end = f"{y}-{m + 1:02d}-01"
        return start, end
    now = datetime.now(timezone.utc)
    start = f"{now.year}-{now.month:02d}-01"
    if now.month == 12:
        end = f"{now.year + 1}-01-01"
    else:
        end = f"{now.year}-{now.month + 1:02d}-01"
    return start, end


@api_router.get("/inventory/structure-stock")
async def get_structure_stock(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    pipeline = [
        {"$match": {"structure_id": {"$nin": [None, ""]}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": {"structure_id": "$structure_id", "article_id": "$items.article_id"},
            "loaded": {"$sum": {"$cond": [{"$eq": ["$movement_type", "delivered"]}, "$items.quantity", 0]}},
            "unloaded": {"$sum": {"$cond": [{"$in": ["$movement_type", ["picked_up", "returned", "missing", "damaged"]]}, "$items.quantity", 0]}},
        }},
    ]
    rows = [doc async for doc in db.movements.aggregate(pipeline)]
    st_ids = list({r["_id"]["structure_id"] for r in rows})
    art_ids = list({r["_id"]["article_id"] for r in rows})
    st_map = {s["id"]: s["name"] async for s in db.structures.find({"id": {"$in": st_ids}}, {"_id": 0, "id": 1, "name": 1})}
    art_map = {a["id"]: a["name"] async for a in db.articles.find({"id": {"$in": art_ids}}, {"_id": 0, "id": 1, "name": 1})}
    grouped = {}
    for r in rows:
        sid = r["_id"]["structure_id"]
        g = grouped.setdefault(sid, {"structure_id": sid, "structure_name": st_map.get(sid, "Struttura"), "items": [], "has_negative": False})
        balance = r["loaded"] - r["unloaded"]
        g["items"].append({
            "article_id": r["_id"]["article_id"],
            "article_name": art_map.get(r["_id"]["article_id"], ""),
            "loaded": r["loaded"],
            "unloaded": r["unloaded"],
            "balance": balance,
        })
        if balance < 0:
            g["has_negative"] = True
    result = sorted(grouped.values(), key=lambda g: g["structure_name"].lower())
    for g in result:
        g["items"].sort(key=lambda i: i["article_name"].lower())
    return result


@api_router.get("/dashboard/overview")
async def dashboard_overview(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    start, end = _date_range(None, date_from, date_to)

    # Revenue (per-service economics arrive in a later phase; orders = consumables catalog)
    order_q = {"created_at": {"$gte": start, "$lt": end}, "status": {"$nin": ["cancelled"]}}
    order_revenue = 0
    async for doc in db.orders.aggregate([{"$match": order_q}, {"$group": {"_id": None, "total": {"$sum": "$total"}}}]):
        order_revenue = doc.get("total", 0) or 0
    revenue = {
        "total": order_revenue,
        "cleaning": 0,
        "laundry": {"total": 0, "private": 0, "rental": 0},
        "consumables": order_revenue,
    }

    # Today's operations
    now_dt = datetime.now(timezone.utc)
    today = now_dt.strftime("%Y-%m-%d")
    next_day = (now_dt + timedelta(days=1)).strftime("%Y-%m-%d")

    cl_total = await db.cleaning_tasks.count_documents({"date": today})
    cl_done = await db.cleaning_tasks.count_documents({"date": today, "status": "completed"})

    log_tasks = await db.logistics_tasks.find({"date": today}, {"_id": 0, "status": 1, "items": 1}).to_list(2000)
    item_art_ids = list({it.get("article_id") for t in log_tasks for it in (t.get("items") or []) if it.get("article_id")})
    art_cat = {}
    if item_art_ids:
        async for a in db.articles.find({"id": {"$in": item_art_ids}}, {"_id": 0, "id": 1, "category": 1}):
            art_cat[a["id"]] = a.get("category")
    linen = {"total": 0, "completed": 0}
    consum = {"total": 0, "completed": 0}
    for t in log_tasks:
        cats = {art_cat.get(it.get("article_id")) for it in (t.get("items") or [])}
        bucket = consum if ("consumable" in cats and "rental_linen" not in cats) else linen
        bucket["total"] += 1
        if t.get("status") == "completed":
            bucket["completed"] += 1

    maint_q = {"created_at": {"$gte": today, "$lt": next_day}}
    mt_total = await db.maintenance_issues.count_documents(maint_q)
    mt_done = await db.maintenance_issues.count_documents({**maint_q, "status": "resolved"})

    today_block = {
        "date": today,
        "cleaning": {"total": cl_total, "completed": cl_done, "missing": cl_total - cl_done},
        "deliveries_linen": {"total": linen["total"], "completed": linen["completed"], "missing": linen["total"] - linen["completed"]},
        "deliveries_consumables": {"total": consum["total"], "completed": consum["completed"], "missing": consum["total"] - consum["completed"]},
        "maintenance": {"total": mt_total, "completed": mt_done, "missing": mt_total - mt_done},
    }

    # Attention list
    attention = []
    neg_pipeline = [
        {"$match": {"structure_id": {"$nin": [None, ""]}}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": {"s": "$structure_id", "a": "$items.article_id"},
            "bal": {"$sum": {"$cond": [
                {"$eq": ["$movement_type", "delivered"]}, "$items.quantity",
                {"$cond": [
                    {"$in": ["$movement_type", ["picked_up", "returned", "missing", "damaged"]]},
                    {"$multiply": ["$items.quantity", -1]}, 0
                ]}
            ]}},
        }},
        {"$match": {"bal": {"$lt": 0}}},
        {"$group": {"_id": "$_id.s"}},
    ]
    neg_ids = [d["_id"] async for d in db.movements.aggregate(neg_pipeline)]
    if neg_ids:
        names = [s["name"] async for s in db.structures.find({"id": {"$in": neg_ids}}, {"_id": 0, "name": 1}).limit(3)]
        attention.append({"type": "negative_stock", "severity": "danger", "count": len(neg_ids), "detail": ", ".join(names), "link": "/structure-inventory"})

    below = await db.articles.count_documents({"is_active": True, "minimum_threshold": {"$gt": 0}, "$expr": {"$lte": ["$quantity_available", "$minimum_threshold"]}})
    if below:
        attention.append({"type": "below_threshold", "severity": "warning", "count": below, "detail": None, "link": "/inventory?tab=articles"})

    open_statuses = ["pending", "assigned", "in_progress"]
    cl_overdue = await db.cleaning_tasks.count_documents({"date": {"$lt": today}, "status": {"$in": open_statuses}})
    if cl_overdue:
        attention.append({"type": "overdue_cleaning", "severity": "danger", "count": cl_overdue, "detail": None, "link": "/cleaning"})
    lg_overdue = await db.logistics_tasks.count_documents({"date": {"$lt": today}, "status": {"$in": open_statuses}})
    if lg_overdue:
        attention.append({"type": "overdue_deliveries", "severity": "danger", "count": lg_overdue, "detail": None, "link": "/logistics"})
    mt_urgent = await db.maintenance_issues.count_documents({"priority": {"$in": ["urgent", "high"]}, "status": {"$in": ["open", "assigned", "in_progress"]}})
    if mt_urgent:
        attention.append({"type": "urgent_maintenance", "severity": "warning", "count": mt_urgent, "detail": None, "link": "/maintenance"})
    new_orders = await db.orders.count_documents({"status": "submitted"})
    if new_orders:
        attention.append({"type": "orders_to_verify", "severity": "info", "count": new_orders, "detail": None, "link": "/logistics"})

    return {"period": {"start": start, "end": end}, "revenue": revenue, "today": today_block, "attention": attention}


@api_router.get("/reports/dashboard")
async def report_dashboard(
    month: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    start, end = _date_range(month, date_from, date_to)
    dq = {"date": {"$gte": start, "$lt": end}}

    active_clients = await db.clients.count_documents({"is_active": True})

    cleaning_total = await db.cleaning_tasks.count_documents({**dq})
    cleaning_completed = await db.cleaning_tasks.count_documents({**dq, "status": "completed"})
    cleaning_in_progress = await db.cleaning_tasks.count_documents({**dq, "status": "in_progress"})

    logistics_total = await db.logistics_tasks.count_documents({**dq})
    logistics_completed = await db.logistics_tasks.count_documents({**dq, "status": "completed"})
    deliveries = await db.logistics_tasks.count_documents({**dq, "task_type": "delivery"})
    pickups = await db.logistics_tasks.count_documents({**dq, "task_type": "pickup"})

    orders_total = await db.orders.count_documents({"created_at": {"$gte": start, "$lt": end}})
    order_revenue_pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}, "status": {"$nin": ["cancelled"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}},
    ]
    order_revenue = 0
    async for doc in db.orders.aggregate(order_revenue_pipeline):
        order_revenue = doc.get("total", 0)

    maint_total = await db.maintenance_issues.count_documents({"created_at": {"$gte": start, "$lt": end}})
    maint_resolved = await db.maintenance_issues.count_documents({"created_at": {"$gte": start, "$lt": end}, "status": "resolved"})
    maint_open = await db.maintenance_issues.count_documents({"created_at": {"$gte": start, "$lt": end}, "status": {"$in": ["open", "assigned"]}})

    return {
        "period": {"start": start, "end": end},
        "active_clients": active_clients,
        "revenue_estimated": order_revenue,
        "orders_total": orders_total,
        "cleaning": {"total": cleaning_total, "completed": cleaning_completed, "in_progress": cleaning_in_progress},
        "logistics": {"total": logistics_total, "completed": logistics_completed, "deliveries": deliveries, "pickups": pickups},
        "maintenance": {"total": maint_total, "resolved": maint_resolved, "open": maint_open},
    }


@api_router.get("/reports/client/{client_id}")
async def report_client(
    client_id: str,
    month: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user) and current_user.get("client_id") != client_id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    start, end = _date_range(month, date_from, date_to)

    client = await db.clients.find_one({"id": client_id}, {"_id": 0, "private_info": 1, "company_info": 1, "client_type": 1})
    if not client:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    if client.get("client_type") == "company":
        client_name = (client.get("company_info") or {}).get("company_name", "")
    else:
        pi = client.get("private_info") or {}
        client_name = f"{pi.get('first_name', '')} {pi.get('last_name', '')}".strip()

    dq = {"date": {"$gte": start, "$lt": end}, "client_id": client_id}

    cleaning_count = await db.cleaning_tasks.count_documents(dq)
    cleaning_completed = await db.cleaning_tasks.count_documents({**dq, "status": "completed"})

    logistics_count = await db.logistics_tasks.count_documents(dq)
    deliveries = await db.logistics_tasks.count_documents({**dq, "task_type": "delivery"})
    pickups = await db.logistics_tasks.count_documents({**dq, "task_type": "pickup"})

    maint_count = await db.maintenance_issues.count_documents({"created_at": {"$gte": start, "$lt": end}, "client_id": client_id})

    order_pipeline = [
        {"$match": {"client_id": client_id, "created_at": {"$gte": start, "$lt": end}, "status": {"$nin": ["cancelled"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
    ]
    order_stats = {"total": 0, "count": 0}
    async for doc in db.orders.aggregate(order_pipeline):
        order_stats = {"total": doc.get("total", 0), "count": doc.get("count", 0)}

    inv_pipeline = [
        {"$match": {"date": {"$gte": start, "$lt": end}, "client_id": client_id}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.article_id", "total_qty": {"$sum": "$items.quantity"}, "article_name": {"$first": "$items.article_name"}}},
        {"$sort": {"total_qty": -1}},
        {"$limit": 10},
    ]
    top_items = []
    async for doc in db.inventory_movements.aggregate(inv_pipeline):
        top_items.append({"article_id": doc["_id"], "article_name": doc.get("article_name", ""), "quantity": doc["total_qty"]})

    return {
        "period": {"start": start, "end": end},
        "client_id": client_id,
        "client_name": client_name,
        "summary": {
            "total_services": cleaning_count + logistics_count + maint_count,
            "estimated_revenue": order_stats["total"],
        },
        "breakdown": {
            "cleaning": {"count": cleaning_count, "completed": cleaning_completed},
            "logistics": {"count": logistics_count, "deliveries": deliveries, "pickups": pickups},
            "orders": {"count": order_stats["count"], "revenue": order_stats["total"]},
            "maintenance": {"count": maint_count},
        },
        "top_items": top_items,
    }


@api_router.get("/reports/inventory")
async def report_inventory(
    month: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    start, end = _date_range(month, date_from, date_to)

    top_pipeline = [
        {"$match": {"date": {"$gte": start, "$lt": end}}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.article_id", "total_qty": {"$sum": "$items.quantity"}, "article_name": {"$first": "$items.article_name"}}},
        {"$sort": {"total_qty": -1}},
        {"$limit": 15},
    ]
    top_items = []
    async for doc in db.inventory_movements.aggregate(top_pipeline):
        top_items.append({"article_id": doc["_id"], "name": doc.get("article_name", ""), "quantity": doc["total_qty"]})

    type_pipeline = [
        {"$match": {"date": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": "$movement_type", "count": {"$sum": 1}}},
    ]
    by_type = {}
    async for doc in db.inventory_movements.aggregate(type_pipeline):
        by_type[doc["_id"]] = doc["count"]

    total_movements = await db.inventory_movements.count_documents({"date": {"$gte": start, "$lt": end}})

    low_stock = await db.articles.find(
        {"$expr": {"$lte": ["$quantity_available", "$minimum_threshold"]}},
        {"_id": 0, "id": 1, "name": 1, "quantity_available": 1, "minimum_threshold": 1}
    ).to_list(50)

    return {
        "period": {"start": start, "end": end},
        "total_movements": total_movements,
        "by_type": by_type,
        "top_items": top_items,
        "low_stock": low_stock,
    }


@api_router.get("/reports/operations")
async def report_operations(
    month: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    start, end = _date_range(month, date_from, date_to)
    dq = {"date": {"$gte": start, "$lt": end}}

    cl_status_pipeline = [
        {"$match": dq},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    cleaning_by_status = {}
    async for doc in db.cleaning_tasks.aggregate(cl_status_pipeline):
        cleaning_by_status[doc["_id"]] = doc["count"]

    lg_status_pipeline = [
        {"$match": dq},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    logistics_by_status = {}
    async for doc in db.logistics_tasks.aggregate(lg_status_pipeline):
        logistics_by_status[doc["_id"]] = doc["count"]

    mt_status_pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    maint_by_status = {}
    async for doc in db.maintenance_issues.aggregate(mt_status_pipeline):
        maint_by_status[doc["_id"]] = doc["count"]

    mt_cat_pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]
    maint_by_category = {}
    async for doc in db.maintenance_issues.aggregate(mt_cat_pipeline):
        maint_by_category[doc["_id"]] = doc["count"]

    cl_overdue = await db.cleaning_tasks.count_documents({
        "date": {"$lt": start}, "status": {"$nin": ["completed", "needs_review"]}
    })
    lg_overdue = await db.logistics_tasks.count_documents({
        "date": {"$lt": start}, "status": {"$nin": ["completed", "cancelled"]}
    })

    return {
        "period": {"start": start, "end": end},
        "cleaning": {"by_status": cleaning_by_status, "overdue": cl_overdue},
        "logistics": {"by_status": logistics_by_status, "overdue": lg_overdue},
        "maintenance": {"by_status": maint_by_status, "by_category": maint_by_category},
    }


@api_router.get("/reports/clients-summary")
async def report_clients_summary(
    month: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    start, end = _date_range(month, date_from, date_to)

    clients = await db.clients.find({"is_active": True}, {"_id": 0, "id": 1, "private_info": 1, "company_info": 1, "client_type": 1}).to_list(200)
    result = []
    for c in clients:
        cid = c["id"]
        if c.get("client_type") == "company":
            name = (c.get("company_info") or {}).get("company_name", "")
        else:
            pi = c.get("private_info") or {}
            name = f"{pi.get('name', '') or pi.get('first_name', '')} {pi.get('surname', '') or pi.get('last_name', '')}".strip()

        dq = {"date": {"$gte": start, "$lt": end}, "client_id": cid}
        cleaning = await db.cleaning_tasks.count_documents(dq)
        logistics = await db.logistics_tasks.count_documents(dq)

        order_pipeline = [
            {"$match": {"client_id": cid, "created_at": {"$gte": start, "$lt": end}, "status": {"$nin": ["cancelled"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}},
        ]
        order_total = 0
        order_count = 0
        async for doc in db.orders.aggregate(order_pipeline):
            order_total = doc.get("total", 0)
            order_count = doc.get("count", 0)

        total_services = cleaning + logistics
        if total_services > 0 or order_count > 0:
            result.append({
                "client_id": cid,
                "client_name": name,
                "cleaning_count": cleaning,
                "logistics_count": logistics,
                "order_count": order_count,
                "revenue": order_total,
                "total_services": total_services,
            })

    result.sort(key=lambda x: x["revenue"], reverse=True)
    return result


# ============== ICAL SYNC MODULE ==============
# The actual sync logic lives in services/ical_sync.py and is imported at the top of this file.
# Only the @api_router endpoints remain here.

import httpx  # noqa: E402 — used by the route exception handlers below


@api_router.post("/ical/sync/{structure_id}")
async def ical_sync_structure(structure_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    structure = await db.structures.find_one({"id": structure_id}, {"_id": 0})
    if not structure:
        raise HTTPException(status_code=404, detail="Struttura non trovata")
    ical_url = structure.get("ical_url")
    if not ical_url:
        raise HTTPException(status_code=400, detail="Nessun URL iCal configurato per questa struttura")
    try:
        result = await _sync_structure_ical(structure_id, ical_url, current_user.get("id"))
        return result
    except httpx.HTTPStatusError as e:
        error_msg = f"Errore HTTP {e.response.status_code} scaricando il feed iCal"
        await db.ical_syncs.insert_one({
            "id": str(uuid.uuid4()), "structure_id": structure_id,
            "structure_name": structure.get("name", ""), "source": _detect_ical_source(ical_url),
            "ical_url": ical_url, "synced_at": now_iso(), "synced_by": current_user.get("id"),
            "events_in_feed": 0, "created": 0, "updated": 0, "removed": 0,
            "status": "error", "error": error_msg,
        })
        raise HTTPException(status_code=502, detail=error_msg)
    except Exception as e:
        error_msg = f"Errore durante la sincronizzazione: {str(e)}"
        await db.ical_syncs.insert_one({
            "id": str(uuid.uuid4()), "structure_id": structure_id,
            "structure_name": structure.get("name", ""), "source": _detect_ical_source(ical_url),
            "ical_url": ical_url, "synced_at": now_iso(), "synced_by": current_user.get("id"),
            "events_in_feed": 0, "created": 0, "updated": 0, "removed": 0,
            "status": "error", "error": error_msg,
        })
        raise HTTPException(status_code=500, detail=error_msg)


@api_router.post("/ical/sync-all")
async def ical_sync_all(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    structures = await db.structures.find(
        {"ical_url": {"$exists": True, "$nin": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "ical_url": 1}
    ).to_list(200)
    if not structures:
        return {"message": "Nessuna struttura con URL iCal configurato", "results": []}
    results = []
    for s in structures:
        try:
            r = await _sync_structure_ical(s["id"], s["ical_url"], current_user.get("id"))
            results.append(r)
        except Exception as e:
            results.append({
                "structure_id": s["id"], "structure_name": s.get("name", ""),
                "status": "error", "error": str(e),
                "created": 0, "updated": 0, "removed": 0, "events_in_feed": 0,
            })
    total_created = sum(r.get("created", 0) for r in results)
    total_updated = sum(r.get("updated", 0) for r in results)
    total_removed = sum(r.get("removed", 0) for r in results)
    return {
        "message": f"Sincronizzazione completata per {len(structures)} strutture",
        "total_created": total_created,
        "total_updated": total_updated,
        "total_removed": total_removed,
        "results": results,
    }


@api_router.get("/ical/status")
async def ical_sync_status(current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    # Get structures with iCal URLs
    structures = await db.structures.find(
        {"ical_url": {"$exists": True, "$nin": [None, ""]}},
        {"_id": 0, "id": 1, "name": 1, "ical_url": 1}
    ).to_list(200)
    result = []
    for s in structures:
        # Get latest sync for this structure
        last_sync = await db.ical_syncs.find_one(
            {"structure_id": s["id"]},
            {"_id": 0},
            sort=[("synced_at", -1)]
        )
        # Count imported events
        event_count = await db.events.count_documents({"structure_id": s["id"], "ical_uid": {"$exists": True, "$ne": None}})
        result.append({
            "structure_id": s["id"],
            "structure_name": s.get("name", ""),
            "ical_url": s.get("ical_url", ""),
            "source": _detect_ical_source(s.get("ical_url", "")),
            "imported_events": event_count,
            "last_sync": last_sync,
        })
    return result


# ============== DOCUMENTS MODULE ==============

class DocumentItemInput(BaseModel):
    article_id: Optional[str] = None
    description: str
    quantity: int = 1
    unit: str = "pz"
    notes: Optional[str] = None

class DocumentItemResponse(BaseModel):
    article_id: Optional[str] = None
    description: str
    quantity: int = 1
    unit: str = "pz"
    notes: Optional[str] = None

class DocumentCreate(BaseModel):
    document_type: str = "ddt"  # ddt, internal_movement, invoice_ref
    client_id: Optional[str] = None
    structure_id: Optional[str] = None
    unit_id: Optional[str] = None
    destination_address: Optional[str] = None
    items: List[DocumentItemInput] = []
    notes: Optional[str] = None
    delivery_ref: Optional[str] = None
    order_id: Optional[str] = None
    logistics_task_id: Optional[str] = None
    movement_id: Optional[str] = None

class DocumentUpdate(BaseModel):
    status: Optional[str] = None
    destination_address: Optional[str] = None
    items: Optional[List[DocumentItemInput]] = None
    notes: Optional[str] = None
    delivery_ref: Optional[str] = None
    external_ref: Optional[str] = None

class DocumentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    document_number: str
    document_type: str
    status: str
    issue_date: str
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    structure_id: Optional[str] = None
    structure_name: Optional[str] = None
    unit_id: Optional[str] = None
    unit_name: Optional[str] = None
    destination_address: Optional[str] = None
    items: List[DocumentItemResponse] = []
    notes: Optional[str] = None
    delivery_ref: Optional[str] = None
    order_id: Optional[str] = None
    logistics_task_id: Optional[str] = None
    movement_id: Optional[str] = None
    external_ref: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str
    updated_at: str


async def _next_document_number(doc_type: str) -> str:
    year = datetime.now(timezone.utc).year
    prefix = doc_type.upper()
    pattern = f"^{prefix}-{year}-"
    last = await db.documents.find_one(
        {"document_number": {"$regex": pattern}},
        {"_id": 0, "document_number": 1},
        sort=[("document_number", -1)]
    )
    if last:
        try:
            seq = int(last["document_number"].split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1
    return f"{prefix}-{year}-{seq:04d}"


async def _resolve_document_names(doc: dict) -> dict:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    if doc.get("client_id"):
        c = await db.clients.find_one({"id": doc["client_id"]}, {"_id": 0})
        doc["client_name"] = get_client_display_name(c) if c else None
    if doc.get("structure_id"):
        s = await db.structures.find_one({"id": doc["structure_id"]}, {"_id": 0, "name": 1})
        doc["structure_name"] = s["name"] if s else None
    if doc.get("unit_id"):
        u = await db.units.find_one({"id": doc["unit_id"]}, {"_id": 0, "name": 1})
        doc["unit_name"] = u["name"] if u else None
    return doc


@api_router.get("/documents")
async def list_documents(
    document_type: Optional[str] = None,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    query: dict = {}
    if document_type:
        query["document_type"] = document_type
    if status:
        query["status"] = status
    if client_id:
        query["client_id"] = client_id
    if date_from or date_to:
        dq = {}
        if date_from:
            dq["$gte"] = date_from
        if date_to:
            dq["$lte"] = date_to
        query["issue_date"] = dq
    if search:
        query["$or"] = [
            {"document_number": {"$regex": search, "$options": "i"}},
            {"client_name": {"$regex": search, "$options": "i"}},
            {"notes": {"$regex": search, "$options": "i"}},
        ]
    total = await db.documents.count_documents(query)
    docs = await db.documents.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    # resolve names
    results = []
    for d in docs:
        d = await _resolve_document_names(d)
        results.append(d)
    return {"items": results, "total": total}


@api_router.get("/documents/{doc_id}")
async def get_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    doc = await _resolve_document_names(doc)
    return doc


@api_router.post("/documents")
async def create_document(data: DocumentCreate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    now = now_iso()
    doc_id = str(uuid.uuid4())
    doc_number = await _next_document_number(data.document_type)
    doc = {
        "id": doc_id,
        "document_number": doc_number,
        "document_type": data.document_type,
        "status": "draft",
        "issue_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "client_id": data.client_id,
        "structure_id": data.structure_id,
        "unit_id": data.unit_id,
        "destination_address": data.destination_address,
        "items": [it.model_dump() for it in data.items],
        "notes": data.notes,
        "delivery_ref": data.delivery_ref,
        "order_id": data.order_id,
        "logistics_task_id": data.logistics_task_id,
        "movement_id": data.movement_id,
        "external_ref": None,
        "created_by": current_user.get("id"),
        "created_at": now,
        "updated_at": now,
    }
    await db.documents.insert_one(doc)
    doc.pop("_id", None)
    doc = await _resolve_document_names(doc)
    return doc


@api_router.put("/documents/{doc_id}")
async def update_document(doc_id: str, data: DocumentUpdate, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    existing = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    updates = {"updated_at": now_iso()}
    if data.status is not None:
        updates["status"] = data.status
    if data.destination_address is not None:
        updates["destination_address"] = data.destination_address
    if data.items is not None:
        updates["items"] = [it.model_dump() for it in data.items]
    if data.notes is not None:
        updates["notes"] = data.notes
    if data.delivery_ref is not None:
        updates["delivery_ref"] = data.delivery_ref
    if data.external_ref is not None:
        updates["external_ref"] = data.external_ref
    await db.documents.update_one({"id": doc_id}, {"$set": updates})
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    doc = await _resolve_document_names(doc)
    return doc


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    existing = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    if existing.get("status") not in ("draft", None):
        raise HTTPException(status_code=400, detail="Solo i documenti in bozza possono essere eliminati")
    await db.documents.delete_one({"id": doc_id})
    return {"message": "Documento eliminato"}


@api_router.post("/documents/generate-from-order/{order_id}")
async def generate_ddt_from_order(order_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    items = []
    for it in order.get("items", []):
        items.append(DocumentItemInput(
            article_id=it.get("article_id"),
            description=it.get("article_name", "Articolo"),
            quantity=it.get("quantity", 1),
            unit="pz",
        ))
    # Resolve address
    address = None
    if order.get("structure_id"):
        s = await db.structures.find_one({"id": order["structure_id"]}, {"_id": 0, "address": 1})
        if s:
            address = s.get("address")
    data = DocumentCreate(
        document_type="ddt",
        client_id=order.get("client_id"),
        structure_id=order.get("structure_id"),
        destination_address=address,
        items=items,
        notes=f"Generato da ordine {order.get('order_number', order_id)}",
        order_id=order_id,
    )
    return await create_document(data, current_user)


@api_router.post("/documents/generate-from-logistics/{task_id}")
async def generate_ddt_from_logistics(task_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    task = await db.logistics_tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task logistica non trovata")
    items = []
    for it in task.get("items", []):
        items.append(DocumentItemInput(
            article_id=it.get("article_id"),
            description=it.get("article_name", "Articolo"),
            quantity=it.get("quantity", 1),
            unit="pz",
        ))
    data = DocumentCreate(
        document_type="ddt",
        client_id=task.get("client_id"),
        structure_id=task.get("structure_id"),
        unit_id=task.get("unit_id"),
        destination_address=task.get("address"),
        items=items,
        notes=f"Generato da task logistica ({task.get('task_type', '')}) del {task.get('date', '')}",
        logistics_task_id=task_id,
    )
    return await create_document(data, current_user)


@api_router.post("/documents/generate-from-movement/{movement_id}")
async def generate_ddt_from_movement(movement_id: str, current_user: dict = Depends(get_current_user)):
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    mov = await db.movements.find_one({"id": movement_id}, {"_id": 0})
    if not mov:
        raise HTTPException(status_code=404, detail="Movimento non trovato")
    # Resolve article names
    art_ids = [it["article_id"] for it in mov.get("items", [])]
    art_map = {}
    if art_ids:
        async for a in db.articles.find({"id": {"$in": art_ids}}, {"_id": 0, "id": 1, "name": 1}):
            art_map[a["id"]] = a["name"]
    items = []
    for it in mov.get("items", []):
        items.append(DocumentItemInput(
            article_id=it.get("article_id"),
            description=art_map.get(it["article_id"], "Articolo"),
            quantity=it.get("quantity", 1),
            unit="pz",
        ))
    # Resolve address
    address = None
    if mov.get("structure_id"):
        s = await db.structures.find_one({"id": mov["structure_id"]}, {"_id": 0, "address": 1})
        if s:
            address = s.get("address")
    doc_type = "internal_movement" if not mov.get("client_id") else "ddt"
    data = DocumentCreate(
        document_type=doc_type,
        client_id=mov.get("client_id"),
        structure_id=mov.get("structure_id"),
        unit_id=mov.get("unit_id"),
        destination_address=address,
        items=items,
        notes=f"Generato da movimento inventario ({mov.get('movement_type', '')}) del {mov.get('date', '')}",
        movement_id=movement_id,
    )
    return await create_document(data, current_user)


# Include the router in the main app (moved after scheduler endpoints below)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============== SCHEDULED JOBS (APScheduler) ==============
# Scheduler initialization and the overdue task check live in services/scheduler_service.py.
# Helpers create_notification and notify_ops_users are passed in (defined later in this file).


async def _check_overdue_tasks() -> dict:
    """Backwards-compatible wrapper that injects local notification helpers."""
    return await scheduler_service.check_overdue_tasks(create_notification, notify_ops_users)


@api_router.post("/scheduler/check-overdue")
async def trigger_overdue_check(current_user: dict = Depends(get_current_user)):
    """Manually trigger the overdue task check (admin/ops only)."""
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return await _check_overdue_tasks()


@api_router.get("/scheduler/status")
async def scheduler_status(current_user: dict = Depends(get_current_user)):
    """Return list of scheduled jobs and their next run times."""
    if not is_ops_user(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    jobs = []
    for j in scheduler_service.scheduler.get_jobs():
        jobs.append({
            "id": j.id,
            "name": j.name,
            "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
            "trigger": str(j.trigger),
        })
    return {"running": scheduler_service.scheduler.running, "jobs": jobs}


# Include the router in the main app (after all routes are defined)
from routes.export_routes import create_export_router  # noqa: E402
from routes.billing_pdf import create_billing_pdf_router  # noqa: E402
from routes.activity_log import create_activity_router, init_activity_middleware  # noqa: E402
from routes.integrations import create_integrations_router  # noqa: E402
api_router.include_router(create_export_router(get_current_user))
api_router.include_router(create_billing_pdf_router(get_current_user))
api_router.include_router(create_activity_router(get_current_user))
api_router.include_router(create_integrations_router(get_current_user, is_ops_user))
init_activity_middleware(app, SECRET_KEY, ALGORITHM)

app.include_router(api_router)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        scheduler_service.stop_scheduler()
    except Exception as e:
        logger.warning(f"Scheduler shutdown error: {e}")
    client.close()

@app.on_event("startup")
async def startup_event():
    try:
        init_storage()
        logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage init deferred: {e}")
    # Migrate legacy "manager" role to "admin"
    result = await db.users.update_many({"role": "manager"}, {"$set": {"role": "admin"}})
    if result.modified_count > 0:
        logger.info(f"Migrated {result.modified_count} users from 'manager' to 'admin' role")
    # Assign KLV codes to structures missing one (idempotent)
    try:
        await ensure_klv_codes()
    except Exception as e:
        logger.error(f"KLV code migration failed: {e}")
    # Start scheduler with overdue task check every 30 minutes
    try:
        scheduler_service.start_scheduler(_check_overdue_tasks)
    except Exception as e:
        logger.error(f"Scheduler startup failed: {e}")
    # Channel Manager auto-sync (ogni 6 ore, predisposto anche per webhook futuri)
    try:
        from apscheduler.triggers.interval import IntervalTrigger
        from integrations.sync_service import sync_all_connections
        scheduler_service.scheduler.add_job(
            sync_all_connections, IntervalTrigger(hours=6), id="cm_auto_sync", replace_existing=True
        )
    except Exception as e:
        logger.error(f"CM auto-sync job registration failed: {e}")
    # Indici per prenotazioni channel manager (chiave stabile anti-duplicati)
    try:
        await db.cm_reservations.create_index(
            [("connection_id", 1), ("external_id", 1)], unique=True, name="cm_res_stable_key"
        )
        await db.cm_property_mappings.create_index(
            [("connection_id", 1), ("external_id", 1)], unique=True, name="cm_map_key"
        )
    except Exception as e:
        logger.warning(f"CM index creation: {e}")
    # Seed checklist standard Kilolava (idempotente)
    try:
        if not await db.checklist_templates.find_one({"key": "standard_kilolava"}):
            def _sec(name, order, items):
                return {"name": name, "order": order, "items": [
                    {"label": lbl, "item_type": "checkbox", "required": req, "order": i, "condition_parent": None, "condition_value": None}
                    for i, (lbl, req) in enumerate(items)
                ]}
            await db.checklist_templates.insert_one({
                "id": str(uuid.uuid4()),
                "key": "standard_kilolava",
                "name": "Checklist Standard Kilolava",
                "description": "Template standard pulizie — adattabile per struttura",
                "structure_id": None,
                "unit_id": None,
                "sections": [
                    _sec("1 — Cucina", 0, [
                        ("Elettrodomestici puliti", True),
                        ("Forno e forno a microonde puliti", True),
                        ("Fornelli puliti e lucidati", True),
                        ("Frigo e freezer puliti", True),
                        ("Banco pulito", True),
                        ("Cestini sostituiti", True),
                        ("Inserire eventuali ricariche (caffè, scottex...)", False),
                    ]),
                    _sec("2 — Polvere e superfici", 1, [
                        ("Mobili", True), ("Tavoli", True), ("Comodini", True), ("Mensole", True),
                        ("Davanzali", True), ("Televisione", True), ("Telecomandi", True),
                    ]),
                    _sec("3 — Bagno", 2, [
                        ("WC", True), ("Bidet + scarico", True), ("Lavandino + scarico", True),
                        ("Rubinetteria pulita e lucidata", True), ("Specchio", True), ("Doccia + scarico", True),
                        ("Carta igienica", True), ("Cestino sostituito", True),
                    ]),
                    _sec("4 — Biancheria e letti", 3, [
                        ("Controllo numero e tipologia", True),
                        ("Letto ordinato senza pieghe", True),
                        ("Segnalazioni eventuali storni", False),
                        ("Sacco biancheria sporca in magazzino", True),
                        ("Tappetino del bagno", True),
                    ]),
                    _sec("5 — Pavimenti", 4, [
                        ("Controllare capelli rimasti", True),
                        ("Controllare macchie rimaste", True),
                    ]),
                    _sec("6 — Controllo finale", 5, [
                        ("Spegnere aria condizionata", True),
                        ("Spegnere luci", True),
                        ("Chiudere finestre", True),
                        ("Riporre chiavi nella keybox", True),
                    ]),
                ],
                "created_at": now_iso(),
            })
            logger.info("Checklist standard Kilolava creata")
    except Exception as e:
        logger.warning(f"Checklist seed: {e}")


