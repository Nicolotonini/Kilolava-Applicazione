"""Guesty adapter — predisposto, implementazione API ufficiale non ancora attiva."""
from .base import BaseAdapter


class GuestyAdapter(BaseAdapter):
    provider = "guesty"
    label = "Guesty"
    implemented = False
    mode = "non_configurato"
    credential_fields = [
        {"key": "client_id", "label": "Client ID (Guesty Open API)", "secret": False},
        {"key": "client_secret", "label": "Client Secret", "secret": True},
    ]
    notes = ("Adapter predisposto ma non attivo. Guesty espone la Open API con autenticazione "
             "OAuth2 client-credentials: le credenziali si generano da Guesty → Settings → "
             "Integrations → API. L'implementazione verrà attivata quando le credenziali "
             "saranno disponibili.")
    missing_requirements = [
        "Client ID e Client Secret della Guesty Open API (generati dall'account Guesty)",
        "Attivazione dell'implementazione ufficiale nell'adapter",
    ]
