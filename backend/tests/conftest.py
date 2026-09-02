"""Guardia di sicurezza dati.

La suite pytest storica (test_*.py non "gate") è nata sui dati demo pre-reset: crea fixture non idempotenti,
utenti/cataloghi e può lasciare residui. NON va eseguita su un database con dati reali.
La regressione ufficiale è costituita dagli script tests/test_gate_*.py (eseguiti con `python tests/test_gate_x.py`).
Per eseguire comunque la suite legacy (solo ambiente DEV con DB sacrificabile): KILOLAVA_ALLOW_LEGACY_TESTS=1
"""
import os

import pytest

_ALLOW_LEGACY = os.environ.get("KILOLAVA_ALLOW_LEGACY_TESTS") == "1"


def pytest_collection_modifyitems(config, items):
    if _ALLOW_LEGACY:
        return
    skip = pytest.mark.skip(reason="Suite legacy disabilitata su DB reale (KILOLAVA_ALLOW_LEGACY_TESTS=1 per forzare). "
                                   "Regressione ufficiale: tests/test_gate_*.py")
    for item in items:
        if not os.path.basename(str(item.fspath)).startswith("test_gate_"):
            item.add_marker(skip)
