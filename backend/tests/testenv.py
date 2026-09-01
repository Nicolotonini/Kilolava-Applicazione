"""Credenziali di test da environment (backend/.env, NON versionato). Nessun valore hardcoded nel repository."""
import os

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

TEST_ADMIN_USERNAME = os.environ["TEST_ADMIN_USERNAME"]
TEST_ADMIN_PASSWORD = os.environ["TEST_ADMIN_PASSWORD"]
TEST_FIXTURE_PASSWORD = os.environ["TEST_FIXTURE_PASSWORD"]

__all__ = ["TEST_ADMIN_USERNAME", "TEST_ADMIN_PASSWORD", "TEST_FIXTURE_PASSWORD"]
