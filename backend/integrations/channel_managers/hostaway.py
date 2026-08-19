"""Hostaway adapter — predisposto, implementazione API ufficiale non ancora attiva."""
from .base import BaseAdapter


class HostawayAdapter(BaseAdapter):
    provider = "hostaway"
    label = "Hostaway"
    implemented = False
    mode = "non_configurato"
    credential_fields = [
        {"key": "account_id", "label": "Account ID", "secret": False},
        {"key": "api_key", "label": "API Key", "secret": True},
    ]
    notes = ("Adapter predisposto ma non attivo. Hostaway espone un'API pubblica con Account ID + "
             "API Key generabili da Hostaway → Settings → Hostaway API. L'implementazione verrà "
             "attivata quando le credenziali saranno disponibili.")
    missing_requirements = [
        "Account ID e API Key Hostaway (da Hostaway → Settings → Hostaway API)",
        "Attivazione dell'implementazione ufficiale nell'adapter",
    ]
