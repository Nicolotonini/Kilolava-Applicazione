"""Persistenza token OAuth per le connessioni channel manager (solo backend)."""
from core.database import db


async def save_oauth(connection_id: str, oauth: dict):
    await db.cm_connections.update_one({"id": connection_id}, {"$set": {"oauth": oauth}})
