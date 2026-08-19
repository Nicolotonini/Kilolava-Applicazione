"""Octorate adapter — predisposto, implementazione API ufficiale non ancora attiva."""
from .base import BaseAdapter


class OctorateAdapter(BaseAdapter):
    provider = "octorate"
    label = "Octorate"
    implemented = False
    mode = "non_configurato"
    credential_fields = [
        {"key": "client_id", "label": "Client ID (Octorate Connect API)", "secret": False},
        {"key": "client_secret", "label": "Client Secret", "secret": True},
    ]
    notes = ("Adapter predisposto ma non attivo. Octorate espone la Connect API (OAuth2): l'accesso "
             "va richiesto a Octorate come partner/integratore. L'implementazione verrà attivata "
             "quando le credenziali saranno disponibili.")
    missing_requirements = [
        "Accesso partner alla Octorate Connect API (client OAuth da richiedere a Octorate)",
        "Attivazione dell'implementazione ufficiale nell'adapter",
    ]
