"""Retest specific failing areas from iteration 38."""
import asyncio, os, time, requests
from playwright.async_api import async_playwright

BASE = "https://kilolava-rebuild.preview.emergentagent.com"
ADMIN_USER = "admin@kilolava.it"
import sys; sys.path.insert(0, "/app/backend/tests")  # noqa: E702
from testenv import TEST_ADMIN_PASSWORD, TEST_FIXTURE_PASSWORD  # noqa: E402
ADMIN_PASS = TEST_ADMIN_PASSWORD
FIXTURE_PASS = TEST_FIXTURE_PASSWORD

results = []
def log(m, ok=True):
    print(f"[{'PASS' if ok else 'FAIL'}] {m}")
    results.append(ok)

def api_login(u, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"username": u, "password": p, "device_id": f"tst-{int(time.time())}", "device_name": "TA"}, timeout=20)
    r.raise_for_status(); return r.json()["access_token"]

def hdr(t): return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}

CREATED = {"users": [], "clients": [], "structures": [], "portal_accounts": []}

async def skip_pin(page):
    try:
        await page.locator('[data-testid="setpin-skip-btn"]').wait_for(timeout=3000)
        await page.click('[data-testid="setpin-skip-btn"]'); await page.wait_for_timeout(500)
    except: pass

async def do_login(page, user, pwd):
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    try:
        await page.fill('input[name="username"]', user, timeout=5000)
    except:
        await page.locator('input').first.fill(user)
    await page.fill('input[type="password"]', pwd)
    await page.locator('button[type="submit"]').first.click()
    await page.wait_for_timeout(3000)
    await skip_pin(page)
    await page.wait_for_timeout(1500)

async def run():
    admin_tok = api_login(ADMIN_USER, ADMIN_PASS)

    # Fixtures
    r = requests.post(f"{BASE}/api/clients", headers=hdr(admin_tok), json={
        "client_type": "company",
        "company_info": {"company_name": "TESTFIX_Srl", "vat_number": "01234567890",
                         "pec": "testfix@pec.example.com", "sdi": "ABC1234"}
    })
    cid = r.json().get("id") or r.json().get("_id")
    CREATED["clients"].append(cid)
    log(f"client {cid}")

    r = requests.post(f"{BASE}/api/structures", headers=hdr(admin_tok), json={
        "client_id": cid, "name": "TESTFIX_Struttura OM",
        "structure_type": "apartment", "services": ["cleaning"],
        "bed_config": {"beds_double": 1, "beds_single": 2, "sofa_beds": 0}
    })
    sid = r.json().get("id") or r.json().get("_id")
    CREATED["structures"].append(sid)

    r = requests.post(f"{BASE}/api/users", headers=hdr(admin_tok),
                      json={"first_name": "TESTFIX_OM", "last_name": "Test",
                            "role": "operations_manager", "password": FIXTURE_PASS})
    om = r.json(); CREATED["users"].append(om.get("id"))

    # Portal account
    r = requests.post(f"{BASE}/api/clients/{cid}/create-account", headers=hdr(admin_tok),
                      json={"email": "testfix.portal@example.com", "password": FIXTURE_PASS, "name": "TESTFIX Portal"})
    log(f"portal account: {r.status_code}", r.status_code in (200, 201))
    requests.put(f"{BASE}/api/clients/{cid}/ordini-settings", headers=hdr(admin_tok),
                 json={"ordering_enabled": True, "orders_categories": ["forniture"]})

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ---- Admin: nav-ms-pulizie by expanding group ----
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        await do_login(page, ADMIN_USER, ADMIN_PASS)
        try:
            grp = page.locator('[data-testid="nav-group-magazzino-strutture"]')
            gc = await grp.count()
            log(f"nav-group-magazzino-strutture: {gc}", gc > 0)
            if gc > 0:
                await grp.first.click()
                await page.wait_for_timeout(600)
            ms_count = await page.locator('[data-testid="nav-ms-pulizie"]').count()
            log(f"nav-ms-pulizie after group open: {ms_count}", ms_count > 0)
            if ms_count > 0:
                await page.click('[data-testid="nav-ms-pulizie"]')
                await page.wait_for_timeout(1500)
                log(f"After click url={page.url}", "/magazzino-strutture/pulizie" in page.url)
        except Exception as e:
            log(f"nav-ms-pulizie: {e}", False)

        # ---- Admin: client detail Amministrazione tab ----
        try:
            await page.goto(f"{BASE}/clients/{cid}", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            tab_amm = page.locator('[data-testid="tab-amministrazione"]')
            ta_count = await tab_amm.count()
            log(f"tab-amministrazione exists: {ta_count}", ta_count > 0)
            if ta_count > 0:
                await tab_amm.first.click()
                await page.wait_for_timeout(1500)
                card = await page.locator('[data-testid="client-admin-data-card"]').count()
                log(f"admin: client-admin-data-card visible: {card}", card > 0)
                # check VAT
                content = await page.content()
                log(f"admin: VAT 01234567890 in page: {'01234567890' in content}", "01234567890" in content)
                # try edit + save payment_terms
                edit_btn = page.locator('[data-testid="admin-data-edit"]')
                if await edit_btn.count() > 0:
                    await edit_btn.first.click()
                    await page.wait_for_timeout(600)
                    pt = page.locator('[data-testid="admin-data-input-payment_terms"]')
                    if await pt.count() > 0:
                        await pt.first.fill("30 gg")
                        await page.click('[data-testid="admin-data-save"]')
                        await page.wait_for_timeout(2000)
                        content2 = await page.content()
                        log(f"admin: '30 gg' persisted in page: {'30 gg' in content2}", "30 gg" in content2)
        except Exception as e:
            log(f"admin data flow: {e}", False)
        await ctx.close()

        # ---- OM: structure detail access + restricted card ----
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        # capture failed responses
        bad = []
        page.on("response", lambda r: bad.append(f"{r.status} {r.url}") if r.status >= 400 and "/api/" in r.url else None)
        await do_login(page, om["login_username"], FIXTURE_PASS)
        try:
            bad.clear()
            await page.goto(f"{BASE}/structures/{sid}", wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            api_403 = [b for b in bad if "403" in b]
            log(f"OM /structures/{sid}: {len(api_403)} 403 responses. url={page.url}", len(api_403) == 0)
            if api_403:
                for b in api_403[:5]: print("  ", b)
            # unit tab: check if there's a unità tab
            unit_tab = page.locator('text=/Unità/i').first
            if await unit_tab.count() > 0:
                try: await unit_tab.click(); await page.wait_for_timeout(1000)
                except: pass
            content = await page.content()
            log(f"OM structure detail loaded (has content): {len(content) > 1000}", len(content) > 1000)
        except Exception as e:
            log(f"OM structure detail: {e}", False)

        # ---- OM: client admin data restricted ----
        try:
            await page.goto(f"{BASE}/clients/{cid}", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            tab_amm = page.locator('[data-testid="tab-amministrazione"]')
            if await tab_amm.count() > 0:
                await tab_amm.first.click()
                await page.wait_for_timeout(1500)
            r_count = await page.locator('[data-testid="client-admin-data-restricted"]').count()
            log(f"OM: client-admin-data-restricted visible: {r_count}", r_count > 0)
        except Exception as e:
            log(f"OM restricted: {e}", False)
        await ctx.close()

        # ---- Portal login via /login with email ----
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        try:
            await do_login(page, "testfix.portal@example.com", FIXTURE_PASS)
            log(f"Portal login url={page.url}", "/portal" in page.url)
            mo = await page.locator('[data-testid="portal-month-orders"]').count()
            log(f"portal-month-orders visible: {mo}", mo > 0)
            content = await page.content()
            # Extract main visible text region only
            log(f"Portal dashboard has '€': {'€' in content} (expected False)", "€" not in content)
        except Exception as e:
            log(f"Portal: {e}", False)
        await ctx.close()

        await browser.close()

    # cleanup
    print("\n=== CLEANUP ===")
    for uid in CREATED["users"]:
        r = requests.delete(f"{BASE}/api/users/{uid}", headers=hdr(admin_tok))
        print(f"del user: {r.status_code}")
    # portal accounts via client accounts endpoint
    try:
        r = requests.get(f"{BASE}/api/clients/{cid}/portal-accounts", headers=hdr(admin_tok))
        if r.status_code == 200:
            for acc in r.json():
                aid = acc.get("id") or acc.get("account_id")
                if aid:
                    dr = requests.delete(f"{BASE}/api/clients/{cid}/portal-accounts/{aid}", headers=hdr(admin_tok))
                    print(f"del portal-account: {dr.status_code}")
    except Exception as e: print(f"portal cleanup: {e}")
    for s in CREATED["structures"]:
        r = requests.delete(f"{BASE}/api/structures/{s}", headers=hdr(admin_tok))
        print(f"del structure: {r.status_code}")
    for c in CREATED["clients"]:
        r = requests.delete(f"{BASE}/api/clients/{c}", headers=hdr(admin_tok))
        print(f"del client: {r.status_code} {r.text[:200] if r.status_code>=400 else ''}")

    passed = sum(1 for x in results if x)
    print(f"\n=== {passed}/{len(results)} passed ===")

asyncio.run(run())
