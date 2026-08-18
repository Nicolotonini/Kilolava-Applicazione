"""Tests for billing PDF and events Excel export endpoints."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://operations-hub-38.preview.emergentagent.com').rstrip('/')
CLIENT_ID = "eab85d0f-45c0-458f-ab88-08c442810aff"  # Mario Rossi


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "test_user@kilolava.com",
        "password": "TestPass123!"
    })
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_billing_pdf_returns_pdf(headers):
    r = requests.get(
        f"{BASE_URL}/api/clients/{CLIENT_ID}/billing-pdf",
        params={"month": "2026-03"}, headers=headers)
    assert r.status_code == 200, r.text
    assert "application/pdf" in r.headers.get("content-type", "")
    assert r.content[:4] == b"%PDF"


def test_billing_pdf_missing_month(headers):
    r = requests.get(
        f"{BASE_URL}/api/clients/{CLIENT_ID}/billing-pdf", headers=headers)
    # Should either default to current month (200) or require param (400/422)
    assert r.status_code in (200, 400, 422)


def test_export_events_month_filter(headers):
    r = requests.get(f"{BASE_URL}/api/export/events",
                     params={"month": "2026-03"}, headers=headers)
    assert r.status_code == 200, r.text
    ct = r.headers.get("content-type", "")
    assert ("spreadsheet" in ct) or ("excel" in ct) or (r.content[:2] == b"PK")


def test_export_events_no_month(headers):
    r = requests.get(f"{BASE_URL}/api/export/events", headers=headers)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"


def test_export_events_malformed_month(headers):
    r = requests.get(f"{BASE_URL}/api/export/events",
                     params={"month": "abc"}, headers=headers)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"


def test_export_clients_still_works(headers):
    r = requests.get(f"{BASE_URL}/api/export/clients", headers=headers)
    assert r.status_code == 200
    assert r.content[:2] == b"PK"
