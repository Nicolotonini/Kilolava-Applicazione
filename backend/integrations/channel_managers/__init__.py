from .base import AdapterError, AdapterNotConfigured, BaseAdapter, NormalizedProperty, NormalizedReservation
from .guesty import GuestyAdapter
from .hostaway import HostawayAdapter
from .ical import ICalAdapter
from .kross import KrossAdapter
from .octorate import OctorateAdapter

_ADAPTERS = {a.provider: a for a in (
    KrossAdapter(), GuestyAdapter(), HostawayAdapter(), OctorateAdapter(), ICalAdapter()
)}

PROVIDER_ORDER = ["kross", "guesty", "hostaway", "octorate", "ical"]


def get_adapter(provider: str) -> BaseAdapter:
    adapter = _ADAPTERS.get(provider)
    if not adapter:
        raise AdapterError(f"Provider sconosciuto: {provider}")
    return adapter


def provider_catalog() -> list:
    return [_ADAPTERS[p].catalog_entry() for p in PROVIDER_ORDER]
