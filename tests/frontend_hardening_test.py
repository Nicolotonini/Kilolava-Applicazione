"""
Iteration 38 - Frontend hardening final pre-import.
Runs UI tests via Playwright + API fixture management.
"""
import asyncio
import os
import json
import time
import requests
from playwright.async_api import async_playwright

BASE = "https://kilolava-rebuild.preview.emergentagent.com"
ADMIN_USER = "admin@kilolava.it"
import sys; sys.path.insert(0, "/app/backend/tests")  # noqa: E702
from testenv import TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
ADMIN_PASS = TEST_ADMIN_PASSWORD
FIXTURE_PASS = TEST_FIXTURE_PASSWORD

results = []
def log(msg, ok=True):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {msg}")
    results.append({"ok": ok, "msg": msg})

# --- API HELPERS ---
def api_login(username, password):
    r = requests.post(f"{BASE}/api/auth/login", json={
        "username": username, "password": password,
        "device_id": f"tst-{int(time.time())}", "device_name": "TestAgent38"
    }, timeout=20)
    r.raise_for_status()
    return r.json()["access_token"]

def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

CREATED = {"users": [], "clients": [], "structures": [], "units": [],
           "events": [], "cleaning_tasks": [], "portal_accounts": []}

async def skip_pin_if_present(page):
    try:
        btn = page.locator('[data-testid="setpin-skip-btn"]')
        await btn.wait_for(timeout=3000)
        await btn.click()
        await page.wait_for_timeout(500)
    except Exception:
        pass

async def ui_login(page, username, password):
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(1000)
    # Fill fields - use flexible selectors
    try:
        await page.fill('input[name="username"], input[type="text"], input[placeholder*="username" i], input[placeholder*="Username" i]', username, timeout=5000)
    except Exception:
        await page.locator('input').first.fill(username)
    try:
        await page.fill('input[type="password"]', password, timeout=5000)
    except Exception:
        pass
    # Submit
    btn = page.locator('button[type="submit"]').first
    await btn.click()
    await page.wait_for_timeout(2500)
    await skip_pin_if_present(page)
    await page.wait_for_timeout(1500)

async def run():
    admin_tok = api_login(ADMIN_USER, ADMIN_PASS)
    log("Admin API login OK")

    # ---- SETUP FIXTURES ----
    # Client TESTFIX_ (company)
    r = requests.post(f"{BASE}/api/clients", headers=hdr(admin_tok), json={
        "client_type": "company",
        "company_info": {"company_name": "TESTFIX_Srl", "vat_number": "01234567890",
                         "pec": "testfix@pec.example.com", "sdi": "ABC1234"}
    })
    if r.status_code not in (200, 201):
        log(f"Create client failed: {r.status_code} {r.text[:200]}", ok=False)
        return
    client = r.json()
    client_id = client.get("id") or client.get("_id")
    CREATED["clients"].append(client_id)
    log(f"Client TESTFIX_ created id={client_id}")

    # Structure with bed_config 1/2/0 + keys
    r = requests.post(f"{BASE}/api/structures", headers=hdr(admin_tok), json={
        "client_id": client_id,
        "name": "TESTFIX_Struttura OM",
        "structure_type": "apartment",
        "services": ["cleaning"],
        "bed_config": {"beds_double": 1, "beds_single": 2, "sofa_beds": 0},
        "access_info": {"kilolava_has_keys": True, "key_boxes": {"A": {"enabled": True, "exists": True, "present": True}}}
    })
    if r.status_code not in (200, 201):
        log(f"Create structure failed: {r.status_code} {r.text[:200]}", ok=False)
        return
    structure = r.json()
    struct_id = structure.get("id") or structure.get("_id")
    CREATED["structures"].append(struct_id)
    log(f"Structure TESTFIX_ created id={struct_id}")

    # Create users
    def create_user(first, role, extra_roles=None):
        payload = {"first_name": first, "last_name": "Test", "role": role, "password": FIXTURE_PASS}
        if extra_roles:
            payload["extra_roles"] = extra_roles
        r = requests.post(f"{BASE}/api/users", headers=hdr(admin_tok), json=payload)
        if r.status_code not in (200, 201):
            log(f"Create user {first} failed: {r.status_code} {r.text[:200]}", ok=False)
            return None
        u = r.json()
        CREATED["users"].append(u.get("id"))
        return u

    om_user = create_user("TESTFIX_OM", "operations_manager")
    if om_user:
        log(f"OM user created: login_username={om_user.get('login_username')}")
    cleaner_laundry = create_user("TESTFIX_CL", "cleaner", ["laundry"])
    cleaner_rider = create_user("TESTFIX_CR", "cleaner", ["rider"])
    cleaner_only = create_user("TESTFIX_CO", "cleaner")
    rider_only = create_user("TESTFIX_RO", "rider")

    # ---- PLAYWRIGHT UI ----
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        page.on("console", lambda msg: None)

        # ===== Fase 1: Admin login + sidebar =====
        try:
            await ui_login(page, ADMIN_USER, ADMIN_PASS)
            url = page.url
            log(f"Admin logged in, url={url}")
            # Check nav-ms-pulizie
            ms = page.locator('[data-testid="nav-ms-pulizie"]')
            ms_visible = await ms.count() > 0
            # May need to expand group - just check exists
            log(f"nav-ms-pulizie exists: {ms_visible}", ok=ms_visible)
            ss = page.locator('[data-testid="sidebar-settings-btn"]')
            ss_visible = await ss.count() > 0
            log(f"sidebar-settings-btn visible for admin: {ss_visible}", ok=ss_visible)
        except Exception as e:
            log(f"Admin login flow error: {e}", ok=False)

        # ===== Fase 2: OM user - permissions =====
        if om_user:
            try:
                await ctx.clear_cookies()
                # Use localStorage clear by new context
                await page.close()
                ctx2 = await browser.new_context(viewport={"width": 1920, "height": 1080})
                page = await ctx2.new_page()
                await ui_login(page, om_user["login_username"], FIXTURE_PASS)
                log(f"OM logged in, url={page.url}")
                # Sidebar settings absent
                ss_count = await page.locator('[data-testid="sidebar-settings-btn"]').count()
                log(f"OM: sidebar-settings-btn absent: {ss_count == 0}", ok=ss_count == 0)
                intg_count = await page.locator('[data-testid="nav-integrations"]').count()
                log(f"OM: nav-integrations absent: {intg_count == 0}", ok=intg_count == 0)
                # Navigate to /settings should redirect
                await page.goto(f"{BASE}/settings", wait_until="domcontentloaded")
                await page.wait_for_timeout(1500)
                redirected = "/settings" not in page.url
                log(f"OM: /settings redirects (url={page.url}): {redirected}", ok=redirected)
                # /integrations
                await page.goto(f"{BASE}/integrations", wait_until="domcontentloaded")
                await page.wait_for_timeout(1500)
                redirected2 = "/integrations" not in page.url
                log(f"OM: /integrations redirects (url={page.url}): {redirected2}", ok=redirected2)

                # ===== Fase 3: OM can create Unit via UI =====
                # First need a structure with unit management. Apartment may not support units in UI.
                # We navigate to structure detail
                await page.goto(f"{BASE}/structures/{struct_id}", wait_until="domcontentloaded")
                await page.wait_for_timeout(2500)
                # Check no 403 - look for error text
                page_text = await page.content()
                has_403 = "403" in page_text or "forbidden" in page_text.lower()
                log(f"OM: structure detail accessible (no 403): {not has_403}", ok=not has_403)
                await ctx2.close()
                ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
                page = await ctx.new_page()
            except Exception as e:
                log(f"OM flow error: {e}", ok=False)

        # ===== Fase 4: Multi-role cleaner+laundry =====
        if cleaner_laundry:
            try:
                await ctx.clear_cookies()
                await ui_login(page, cleaner_laundry["login_username"], FIXTURE_PASS)
                log(f"Cleaner+Laundry logged in, url={page.url}")
                to_cleaner = "/cleaner" in page.url
                log(f"CL: redirected to /cleaner: {to_cleaner}", ok=to_cleaner)
                sw = page.locator('[data-testid="role-area-switcher"]')
                sw_count = await sw.count()
                log(f"CL: role-area-switcher present: {sw_count > 0}", ok=sw_count > 0)
                a_cleaner = await page.locator('[data-testid="area-cleaner"]').count()
                a_laundry = await page.locator('[data-testid="area-laundry"]').count()
                log(f"CL: area-cleaner={a_cleaner}, area-laundry={a_laundry}", ok=a_cleaner>0 and a_laundry>0)
                if a_laundry > 0:
                    await page.locator('[data-testid="area-laundry"]').first.click()
                    await page.wait_for_timeout(2000)
                    log(f"CL: after click laundry, url={page.url}", ok="/private-laundry" in page.url or "/laundry" in page.url)
            except Exception as e:
                log(f"Cleaner+Laundry error: {e}", ok=False)

        # ===== Fase 5: Multi-role cleaner+rider =====
        if cleaner_rider:
            try:
                await ctx.close()
                ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
                page = await ctx.new_page()
                await ui_login(page, cleaner_rider["login_username"], FIXTURE_PASS)
                log(f"Cleaner+Rider logged in, url={page.url}")
                sw = await page.locator('[data-testid="role-area-switcher"]').count()
                a_cleaner = await page.locator('[data-testid="area-cleaner"]').count()
                a_rider = await page.locator('[data-testid="area-rider"]').count()
                log(f"CR: switcher={sw>0}, area-cleaner={a_cleaner}, area-rider={a_rider}", ok=sw>0 and a_cleaner>0 and a_rider>0)
                if a_rider > 0:
                    await page.locator('[data-testid="area-rider"]').first.click()
                    await page.wait_for_timeout(2000)
                    log(f"CR: clicked rider, url={page.url}", ok="/rider" in page.url)
            except Exception as e:
                log(f"Cleaner+Rider error: {e}", ok=False)

        # ===== Fase 7: Client Admin Data (as admin) =====
        try:
            await ctx.close()
            ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
            page = await ctx.new_page()
            await ui_login(page, ADMIN_USER, ADMIN_PASS)
            await page.goto(f"{BASE}/clients/{client_id}", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            # find admin data card selector
            admin_tab = page.locator('text=/Amministrazione/i').first
            if await admin_tab.count() > 0:
                try:
                    await admin_tab.click()
                    await page.wait_for_timeout(1200)
                except Exception:
                    pass
            card = await page.locator('[data-testid="client-admin-data-card"]').count()
            log(f"Admin: client-admin-data-card visible: {card > 0}", ok=card > 0)
            has_vat = "01234567890" in await page.content()
            log(f"Admin: VAT visible in admin card: {has_vat}", ok=has_vat)
            # Check anagrafica tab does NOT show VAT/CF/PEC/SDI
            gen = page.locator('text=/Anagrafica|Generale/i').first
            if await gen.count() > 0:
                try:
                    await gen.click()
                    await page.wait_for_timeout(1000)
                    content_gen = await page.content()
                    vat_in_gen = "01234567890" in content_gen
                    log(f"Admin: VAT absent from anagrafica: {not vat_in_gen}", ok=not vat_in_gen)
                except Exception:
                    pass
        except Exception as e:
            log(f"ClientAdminData error: {e}", ok=False)

        # ===== Fase 7b: OM sees restricted =====
        if om_user:
            try:
                await ctx.close()
                ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
                page = await ctx.new_page()
                await ui_login(page, om_user["login_username"], FIXTURE_PASS)
                await page.goto(f"{BASE}/clients/{client_id}", wait_until="domcontentloaded")
                await page.wait_for_timeout(2500)
                admin_tab = page.locator('text=/Amministrazione/i').first
                if await admin_tab.count() > 0:
                    try:
                        await admin_tab.click()
                        await page.wait_for_timeout(1200)
                    except Exception:
                        pass
                restricted = await page.locator('[data-testid="client-admin-data-restricted"]').count()
                log(f"OM: client-admin-data-restricted visible: {restricted > 0}", ok=restricted > 0)
            except Exception as e:
                log(f"OM restricted view error: {e}", ok=False)

        # ===== Fase 10: Portal Cliente =====
        try:
            r = requests.post(f"{BASE}/api/clients/{client_id}/create-account",
                              headers=hdr(admin_tok),
                              json={"email": "testfix.portal@example.com",
                                    "password": FIXTURE_PASS, "name": "TESTFIX Portal"})
            log(f"Portal account create API: {r.status_code}", ok=r.status_code in (200, 201))
            if r.status_code in (200, 201):
                pa = r.json()
                CREATED["portal_accounts"].append(pa.get("id") or pa.get("account_id"))
                # Enable ordering
                r2 = requests.put(f"{BASE}/api/clients/{client_id}/ordini-settings",
                                  headers=hdr(admin_tok),
                                  json={"ordering_enabled": True, "orders_categories": ["forniture"]})
                log(f"Ordini-settings PUT: {r2.status_code}", ok=r2.status_code == 200)

                await ctx.close()
                ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
                page = await ctx.new_page()
                # Portal login page usually different
                await page.goto(f"{BASE}/portal/login", wait_until="domcontentloaded")
                await page.wait_for_timeout(1500)
                try:
                    await page.fill('input[type="email"], input[name="email"]', "testfix.portal@example.com", timeout=5000)
                    await page.fill('input[type="password"]', FIXTURE_PASS, timeout=5000)
                    await page.locator('button[type="submit"]').first.click()
                    await page.wait_for_timeout(3000)
                    log(f"Portal login, url={page.url}", ok="/portal" in page.url)
                    mo = await page.locator('[data-testid="portal-month-orders"]').count()
                    log(f"portal-month-orders visible: {mo > 0}", ok=mo > 0)
                    content = await page.content()
                    # Very naive euro symbol check on dashboard
                    has_euro = "€" in content
                    log(f"Portal dashboard has €: {has_euro} (expected False)", ok=not has_euro)
                except Exception as ee:
                    log(f"Portal UI error: {ee}", ok=False)
        except Exception as e:
            log(f"Portal setup error: {e}", ok=False)

        await browser.close()

    # ---- CLEANUP ----
    print("\n=== CLEANUP ===")
    # Delete users
    for uid in CREATED["users"]:
        try:
            r = requests.delete(f"{BASE}/api/users/{uid}", headers=hdr(admin_tok))
            print(f"del user {uid}: {r.status_code}")
        except Exception as e:
            print(f"del user error: {e}")
    # Delete portal accounts
    for pid in CREATED["portal_accounts"]:
        try:
            r = requests.delete(f"{BASE}/api/portal-accounts/{pid}", headers=hdr(admin_tok))
            print(f"del portal {pid}: {r.status_code}")
        except Exception as e:
            print(f"del portal error: {e}")
    # Delete structures
    for sid in CREATED["structures"]:
        try:
            r = requests.delete(f"{BASE}/api/structures/{sid}", headers=hdr(admin_tok))
            print(f"del structure {sid}: {r.status_code}")
        except Exception as e:
            pass
    # Delete client
    for cid in CREATED["clients"]:
        try:
            r = requests.delete(f"{BASE}/api/clients/{cid}", headers=hdr(admin_tok))
            print(f"del client {cid}: {r.status_code}")
        except Exception as e:
            pass

    # Print summary
    passed = sum(1 for r in results if r["ok"])
    total = len(results)
    print(f"\n=== SUMMARY: {passed}/{total} checks passed ===")
    for r in results:
        if not r["ok"]:
            print(f"  FAIL: {r['msg']}")

if __name__ == "__main__":
    asyncio.run(run())
