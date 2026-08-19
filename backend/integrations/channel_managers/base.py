"""Channel Manager framework — common models and adapter interface."""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class NormalizedProperty:
    external_id: str
    name: str
    raw: dict = field(default_factory=dict)


@dataclass
class NormalizedReservation:
    external_id: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    status: str = "unknown"  # confirmed | pending | option | cancelled | no_show | unknown
    status_raw: Optional[str] = None
    guests_count: Optional[int] = None
    guest_name: Optional[str] = None
    channel: Optional[str] = None
    external_property_id: Optional[str] = None
    external_updated_at: Optional[str] = None


class AdapterError(Exception):
    """User-facing adapter error with a clear message."""


class AdapterNotConfigured(AdapterError):
    """Adapter exists but the official implementation/credentials are not yet available."""


class BaseAdapter:
    provider: str = ""
    label: str = ""
    implemented: bool = False
    mode: str = "non_configurato"
    credential_fields: List[dict] = []
    notes: str = ""
    missing_requirements: List[str] = []

    def catalog_entry(self) -> dict:
        return {
            "provider": self.provider,
            "label": self.label,
            "implemented": self.implemented,
            "mode": self.mode,
            "credential_fields": self.credential_fields,
            "notes": self.notes,
            "missing_requirements": self.missing_requirements,
        }

    async def test_connection(self, credentials: dict) -> dict:
        return {
            "ok": False,
            "provider": self.provider,
            "mode": self.mode,
            "checks": [],
            "missing": self.missing_requirements,
            "error": f"{self.label}: adapter predisposto ma non ancora attivo. Nessuna API simulata.",
        }

    async def list_properties(self, credentials: dict) -> List[NormalizedProperty]:
        raise AdapterNotConfigured(
            f"{self.label}: implementazione API non ancora disponibile. Requisiti: "
            + "; ".join(self.missing_requirements)
        )

    async def fetch_reservations(
        self, credentials: dict, external_property_ids: List[str], date_from: str, date_to: str
    ) -> List[NormalizedReservation]:
        raise AdapterNotConfigured(
            f"{self.label}: implementazione API non ancora disponibile. Requisiti: "
            + "; ".join(self.missing_requirements)
        )

    async def fetch_reservations_by_ids(
        self, credentials: dict, external_ids: List[str]
    ) -> List[NormalizedReservation]:
        return []
