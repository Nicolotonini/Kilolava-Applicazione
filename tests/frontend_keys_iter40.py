"""Iteration 40 — Frontend targeted UI test for chiavi (Cleaner/Rider/Admin), Client Activity, deactivated user 401.
Setup + Cleanup via API/Mongo. Fixtures prefixed TESTFIX_.
"""
import asyncio, os, time, requests, subprocess
from datetime import date, timedelta
from playwright.async_api import async_playwright

for line in open("/app/backend/.env"):
    if "=" in line:
        k, v = line.strip().split("=", 1)
        os.environ.setdefault(k, v.strip('"').strip("'"))

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip('/')
if not BASE:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE = line.strip().split("=", 1)[1].strip('"').strip("'").rstrip('/')
ADMIN_USER = os.environ["TEST_ADMIN_USERNAME"].strip('"')
ADMIN_PASS = os.environ["TEST_ADMIN_PASSWORD"].strip('"')
FIXTURE_PASS = os.environ["TEST_FIXTURE_PASSWORD"].strip('"')
MONGO_URL = os.environ["MONGO_URL"].strip('"')
DB_NAME = os.environ["DB_NAME"].strip('"')

RESULTS = []
def log(msg, ok=True):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {msg}", flush=True)
    RESULTS.append((tag, msg))

TODAY = date.today().isoformat()

def api_login(u, p):
    r = requests.post(f"{BASE}/api/auth/login", json={"username": u, "password": p, "device_id": f"tst40-{int(time.time()*1000)}", "device_name": "TA40"}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]

def hdr(t): return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}

CREATED = {"users": [], "clients": [], "structures": [], "cleaning_tasks": [], "richieste": [], "fermate": [], "orders": [], "portal_email": None}

async def skip_pin(page):
    try:
        await page.locator('[data-testid="setpin-skip-btn"]').wait_for(timeout=3500)
        await page.click('[data-testid="setpin-skip-btn"]')
        await page.wait_for_timeout(500)
    except Exception:
        pass

async def do_login(page, user, pwd):
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    try:
        await page.fill('input[name="username"]', user, timeout=5000)
    except Exception:
        await page.locator('input').first.fill(user)
    await page.fill('input[type="password"]', pwd)
    await page.locator('button[type="submit"]').first.click()
    await page.wait_for_timeout(3000)
    await skip_pin(page)
    await page.wait_for_timeout(1000)


async def run():
    admin_tok = api_login(ADMIN_USER, ADMIN_PASS)
    log("admin login OK")

    # ---------- SETUP ----------
    r = requests.post(f"{BASE}/api/clients", headers=hdr(admin_tok), json={
        "client_type": "private",
        "private_info": {"name": "TESTFIX_KeyUI", "surname": "C"}
    })
    log(f"POST /clients {r.status_code}", r.status_code in (200, 201))
    cid = r.json()["id"]; CREATED["clients"].append(cid)

    r = requests.post(f"{BASE}/api/structures", headers=hdr(admin_tok), json={
        "client_id": cid,
        "name": "TESTFIX_Casa Chiavi",
        "structure_type": "apartment",
        "services": ["cleaning", "rental_laundry"],
        "access_info": {
            "kilolava_has_keys": True,
            "key_boxes": {
                "A": {"enabled": True, "exists": True, "present": True},
                "B": {"enabled": True, "exists": True, "present": True},
                "C": {"enabled": True, "exists": True, "present": True},
            }
        }
    })
    log(f"POST /structures {r.status_code}", r.status_code in (200, 201))
    sid = r.json()["id"]; CREATED["structures"].append(sid)

    def mkuser(role, first):
        rr = requests.post(f"{BASE}/api/users", headers=hdr(admin_tok),
                           json={"first_name": first, "last_name": "T", "role": role, "password": FIXTURE_PASS})
        assert rr.status_code in (200, 201), f"{rr.status_code} {rr.text}"
        u = rr.json(); CREATED["users"].append(u["id"])
        return u
    cleaner = mkuser("cleaner", "TESTFIX_Cl")
    rider = mkuser("rider", "TESTFIX_Ri")
    log(f"users cleaner={cleaner['id']} rider={rider['id']}")

    # Cleaning task assigned to cleaner (today)
    r = requests.post(f"{BASE}/api/cleaning-tasks", headers=hdr(admin_tok), json={
        "structure_id": sid, "date": TODAY, "guests_count": 2,
        "assigned_cleaner_ids": [cleaner["id"]]
    })
    log(f"POST cleaning-task {r.status_code}", r.status_code in (200, 201))
    ct_id = r.json()["id"]; CREATED["cleaning_tasks"].append(ct_id)

    # Enable orders
    r = requests.put(f"{BASE}/api/clients/{cid}/ordini-settings", headers=hdr(admin_tok),
                     json={"ordering_enabled": True, "orders_categories": ["forniture"]})
    log(f"ordini-settings {r.status_code}", r.status_code in (200, 201))
    # Portal
    portal_email = "testfix.keyui@example.com"
    CREATED["portal_email"] = portal_email
    r = requests.post(f"{BASE}/api/clients/{cid}/create-account", headers=hdr(admin_tok),
                      json={"email": portal_email, "password": FIXTURE_PASS, "name": "TESTFIX KeyUI Portal"})
    log(f"portal account {r.status_code}", r.status_code in (200, 201))

    # Get product id from supply_catalog (Mongo direct - most reliable)
    prod_id = None
    try:
        from pymongo import MongoClient
        mc0 = MongoClient(MONGO_URL); db0 = mc0[DB_NAME]
        one = db0.supply_catalog.find_one({"active": {"$ne": False}})
        if one: prod_id = one.get("id")
    except Exception as e:
        print("supply_catalog fetch err:", e)
    log(f"forniture product id={prod_id}", bool(prod_id))

    # Delivery: create richiesta + fermata for today
    fermata_id = None
    if prod_id:
        r = requests.post(f"{BASE}/api/consegne/richieste", headers=hdr(admin_tok), json={
            "structure_id": sid, "kind": "forniture",
            "items": [{"product_id": prod_id, "qty": 1}],
            "date_needed": TODAY
        })
        log(f"POST richieste {r.status_code} {r.text[:200] if r.status_code>=400 else ''}", r.status_code in (200, 201))
        if r.status_code in (200, 201):
            rq_id = r.json().get("id") or r.json().get("richiesta_id")
            CREATED["richieste"].append(rq_id)
            rf = requests.post(f"{BASE}/api/consegne/fermate", headers=hdr(admin_tok), json={
                "richiesta_ids": [rq_id], "date": TODAY, "rider_id": rider["id"]
            })
            log(f"POST fermate {rf.status_code} {rf.text[:200] if rf.status_code>=400 else ''}", rf.status_code in (200, 201))
            if rf.status_code in (200, 201):
                body = rf.json()
                if isinstance(body, list):
                    fermata_id = body[0].get("id")
                else:
                    fermata_id = body.get("id") or (body.get("fermate") or [{}])[0].get("id")
                CREATED["fermate"].append(fermata_id)
    log(f"fermata_id={fermata_id}", bool(fermata_id))

    # ------------------------------------------------------------
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)

        # ============ CLEANER: BEFORE — only Copy A visible ============
        ctx = await browser.new_context(viewport={"width": 390, "height": 844},
                                        geolocation={"latitude": 41.9, "longitude": 12.5},
                                        permissions=["geolocation"])
        page = await ctx.new_page()
        await do_login(page, cleaner["login_username"], FIXTURE_PASS)
        try:
            await page.goto(f"{BASE}/cleaner", wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            card = page.locator(f'[data-testid="cleaner-task-{ct_id}"]')
            log(f"cleaner-task card visible: {await card.count()}", await card.count() > 0)
            await card.first.click(force=True)
            await page.wait_for_timeout(2500)
            log(f"keys-panel visible: {await page.locator('[data-testid=keys-panel]').count()}", await page.locator('[data-testid=keys-panel]').count() > 0)
            has_a = await page.locator('[data-testid="keys-copy-A"]').count()
            has_b = await page.locator('[data-testid="keys-copy-B"]').count()
            has_c = await page.locator('[data-testid="keys-copy-C"]').count()
            log(f"cleaner BEFORE: A={has_a} B={has_b} C={has_c} (expect 1/0/0)", has_a == 1 and has_b == 0 and has_c == 0)
            state_a = await page.locator('[data-testid="keys-state-A"]').text_content()
            log(f"state A text: '{state_a}'", "sede" in (state_a or "").lower())
            ritira = page.locator('[data-testid="keys-ritira-A"]')
            log(f"keys-ritira-A count: {await ritira.count()}", await ritira.count() > 0)
            await ritira.first.scroll_into_view_if_needed()
            await page.wait_for_timeout(300)
            await ritira.first.click()
            await page.wait_for_timeout(2500)
            state_a2 = await page.locator('[data-testid="keys-state-A"]').text_content()
            log(f"cleaner state A after ritira: '{state_a2}'", "ritirata" in (state_a2 or "").lower())
            log(f"keys-riconsegna-A visible: {await page.locator('[data-testid=keys-riconsegna-A]').count()}", await page.locator('[data-testid=keys-riconsegna-A]').count() > 0)
        except Exception as e:
            log(f"CLEANER BEFORE error: {e}", False)
        await ctx.close()

        # ============ CLEANER: DURING — set status=in_progress via Mongo ============
        try:
            subprocess.check_output(["mongosh", MONGO_URL, "--quiet", "--eval",
                f"db=db.getSiblingDB('{DB_NAME}'); db.cleaning_tasks.updateOne({{id:'{ct_id}'}}, {{$set:{{status:'in_progress', started_at:new Date()}}}})"])
        except Exception as e:
            print("mongo err:", e)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844},
                                        geolocation={"latitude": 41.9, "longitude": 12.5},
                                        permissions=["geolocation"])
        page = await ctx.new_page()
        await do_login(page, cleaner["login_username"], FIXTURE_PASS)
        try:
            await page.goto(f"{BASE}/cleaner", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            card = page.locator(f'[data-testid="cleaner-task-{ct_id}"]')
            if await card.count() > 0:
                await card.first.click(force=True)
                await page.wait_for_timeout(2500)
            kp = await page.locator('[data-testid="keys-panel"]').count()
            log(f"CLEANER DURING (in_progress): keys-panel visible={kp}", kp > 0)
            ric = await page.locator('[data-testid="keys-riconsegna-A"]').count()
            log(f"CLEANER DURING: keys-riconsegna-A={ric}", ric > 0)
            warn = await page.locator('[data-testid="keys-held-warning"]').count()
            log(f"CLEANER DURING: keys-held-warning NOT present={warn == 0}", warn == 0)
        except Exception as e:
            log(f"CLEANER DURING error: {e}", False)
        await ctx.close()

        # ============ CLEANER: AFTER completed with key held ============
        try:
            subprocess.check_output(["mongosh", MONGO_URL, "--quiet", "--eval",
                f"db=db.getSiblingDB('{DB_NAME}'); db.cleaning_tasks.updateOne({{id:'{ct_id}'}}, {{$set:{{status:'completed', completed_at:new Date()}}}})"])
        except Exception as e:
            print("mongo err:", e)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844},
                                        geolocation={"latitude": 41.9, "longitude": 12.5},
                                        permissions=["geolocation"])
        page = await ctx.new_page()
        await do_login(page, cleaner["login_username"], FIXTURE_PASS)
        try:
            # Task is now completed — no longer in "today" filter? Try /cleaner/task/{id}
            await page.goto(f"{BASE}/cleaner", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            card = page.locator(f'[data-testid="cleaner-task-{ct_id}"]')
            if await card.count() > 0:
                await card.first.click(force=True)
                await page.wait_for_timeout(2500)
            else:
                # Try navigating directly
                await page.goto(f"{BASE}/cleaner/task/{ct_id}", wait_until="domcontentloaded")
                await page.wait_for_timeout(2500)
            banner = await page.locator('[data-testid="cleaning-completed-banner"]').count()
            log(f"CLEANER AFTER: cleaning-completed-banner={banner}", banner > 0)
            kp = await page.locator('[data-testid="keys-panel"]').count()
            warn = await page.locator('[data-testid="keys-held-warning"]').count()
            ric = await page.locator('[data-testid="keys-riconsegna-A"]').count()
            log(f"CLEANER AFTER (key held): keys-panel={kp} warn={warn} ric={ric}", kp > 0 and warn > 0 and ric > 0)
            if ric > 0:
                btn = page.locator('[data-testid="keys-riconsegna-A"]').first
                await btn.scroll_into_view_if_needed()
                await page.wait_for_timeout(300)
                await btn.click()
                await page.wait_for_timeout(2500)
                kp2 = await page.locator('[data-testid="keys-panel"]').count()
                warn2 = await page.locator('[data-testid="keys-held-warning"]').count()
                log(f"CLEANER AFTER riconsegna: keys-panel disappeared={kp2 == 0} warn disappeared={warn2 == 0}", kp2 == 0 and warn2 == 0)
        except Exception as e:
            log(f"CLEANER AFTER error: {e}", False)
        await ctx.close()

        # Redo ritiro (via API) so /keys page has an entry for admin test AND for the rider test we ensure key B is used through rider flow
        try:
            cleaner_tok = api_login(cleaner["login_username"], FIXTURE_PASS)
            rr = requests.post(f"{BASE}/api/keys/{sid}/A/ritiro", headers=hdr(cleaner_tok),
                               json={"linked_task_id": ct_id, "linked_task_type": "cleaning"})
            log(f"redo A ritiro (cleaner API): {rr.status_code}", rr.status_code in (200, 201))
        except Exception as e:
            log(f"redo ritiro err: {e}", False)

        # ============ RIDER: fermata expand → Copy B only, ritira, complete ============
        rider_key_warning = None
        if fermata_id:
            ctx = await browser.new_context(viewport={"width": 390, "height": 844},
                                            geolocation={"latitude": 41.9, "longitude": 12.5},
                                            permissions=["geolocation"])
            page = await ctx.new_page()
            page.on("console", lambda m: None)
            captured_toasts = []
            # Capture toast text via listening body text periodically is complex; skip
            await do_login(page, rider["login_username"], FIXTURE_PASS)
            try:
                await page.goto(f"{BASE}/rider", wait_until="domcontentloaded")
                await page.wait_for_timeout(3500)
                fcard = page.locator(f'[data-testid="rider-fermata-{fermata_id}"]')
                fc = await fcard.count()
                log(f"rider-fermata-{fermata_id} visible: {fc}", fc > 0)
                if fc > 0:
                    await fcard.first.click(force=True)
                    await page.wait_for_timeout(1500)
                    has_a = await page.locator('[data-testid="keys-copy-A"]').count()
                    has_b = await page.locator('[data-testid="keys-copy-B"]').count()
                    has_c = await page.locator('[data-testid="keys-copy-C"]').count()
                    log(f"RIDER expanded: A={has_a} B={has_b} C={has_c} (expect 0/1/0)", has_a == 0 and has_b == 1 and has_c == 0)
                    ritB = page.locator('[data-testid="keys-ritira-B"]')
                    if await ritB.count() > 0:
                        await ritB.first.scroll_into_view_if_needed()
                        await page.wait_for_timeout(300)
                        await ritB.first.click()
                        await page.wait_for_timeout(2500)
                        state_b = await page.locator('[data-testid="keys-state-B"]').text_content()
                        log(f"RIDER state B after ritira: '{state_b}'", "ritirata" in (state_b or "").lower())
                    # Start fermata
                    start_btn = page.locator(f'[data-testid="start-fermata-{fermata_id}"]')
                    if await start_btn.count() > 0:
                        await start_btn.first.click(force=True)
                        await page.wait_for_timeout(2000)
                    # Complete
                    comp_btn = page.locator(f'[data-testid="complete-fermata-{fermata_id}"]')
                    # Complete via API for reliability (UI drawer flow tested separately)
                    try:
                        rider_tok = api_login(rider["login_username"], FIXTURE_PASS)
                        # ensure in_progress via API start
                        requests.post(f"{BASE}/api/consegne/fermate/{fermata_id}/start", headers=hdr(rider_tok))
                        comp_res = requests.post(f"{BASE}/api/consegne/fermate/{fermata_id}/completa",
                                                 headers=hdr(rider_tok), json={})
                        log(f"rider completa API: {comp_res.status_code}", comp_res.status_code in (200, 201))
                        try:
                            body = comp_res.json()
                            kw = body.get("key_warning")
                            log(f"key_warning in complete response: '{kw}'", bool(kw))
                        except Exception:
                            pass
                    except Exception as e:
                        log(f"rider API completa err: {e}", False)
                    await page.reload(wait_until="domcontentloaded")
                    await page.wait_for_timeout(3500)
                    # Now check completed card shows keys-held-warning WITHOUT expanding
                    warn = await page.locator('[data-testid="keys-held-warning"]').count()
                    ric_b = await page.locator('[data-testid="keys-riconsegna-B"]').count()
                    log(f"RIDER after complete: keys-held-warning={warn} keys-riconsegna-B={ric_b}", warn > 0 and ric_b > 0)
                    if ric_b > 0:
                        btn = page.locator('[data-testid="keys-riconsegna-B"]').first
                        try:
                            await btn.scroll_into_view_if_needed(timeout=3000)
                            await page.wait_for_timeout(300)
                            await btn.click(timeout=8000)
                            await page.wait_for_timeout(2500)
                            warn2 = await page.locator('[data-testid="keys-held-warning"]').count()
                            log(f"RIDER after riconsegna: keys-held-warning gone={warn2 == 0}", warn2 == 0)
                        except Exception as ee:
                            log(f"RIDER riconsegna click err: {ee}", False)
            except Exception as e:
                log(f"RIDER error: {e}", False)
            await ctx.close()

        # ============ ADMIN /keys — verify chiavi fuori sede visibility ============
        # First redo cleaner ritiro so /keys has a row
        try:
            cleaner_tok = api_login(cleaner["login_username"], FIXTURE_PASS)
            rr = requests.post(f"{BASE}/api/keys/{sid}/A/ritiro", headers=hdr(cleaner_tok),
                               json={"linked_task_id": ct_id, "linked_task_type": "cleaning"})
            log(f"pre-admin: A ritiro {rr.status_code}", rr.status_code in (200, 201, 400))
        except Exception:
            pass
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        await do_login(page, ADMIN_USER, ADMIN_PASS)
        try:
            await page.goto(f"{BASE}/keys", wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            kout = await page.locator('[data-testid="keys-out-list"]').count()
            log(f"admin /keys keys-out-list: {kout}", kout > 0)
            row = await page.locator(f'[data-testid="keys-out-{sid}-A"]').count()
            log(f"admin /keys row for A: {row}", row > 0)
            link = await page.locator(f'[data-testid="keys-out-link-{sid}-A"]').count()
            log(f"admin /keys link for A: {link}", link > 0)
        except Exception as e:
            log(f"admin /keys error: {e}", False)
        await ctx.close()

        # ============ CLIENT ACTIVITY TAB ============
        # Create portal order via portal API
        order_id = None
        try:
            portal_tok = api_login(portal_email, FIXTURE_PASS)
            cat2 = requests.get(f"{BASE}/api/portal/ordini/catalogo", headers=hdr(portal_tok))
            pprod = None
            if cat2.status_code == 200:
                data = cat2.json()
                forniture = (data.get("products") or {}).get("forniture") or []
                if forniture: pprod = forniture[0].get("id")
            if pprod:
                future = (date.today() + timedelta(days=5)).isoformat()
                oo = requests.post(f"{BASE}/api/portal/ordini", headers=hdr(portal_tok), json={
                    "structure_id": sid,
                    "items": [{"domain": "forniture", "product_id": pprod, "qty": 2}],
                    "date_preferred": future
                })
                log(f"portal order POST {oo.status_code}", oo.status_code in (200, 201))
                if oo.status_code in (200, 201):
                    order_id = oo.json().get("id")
                    CREATED["orders"].append(order_id)
        except Exception as e:
            log(f"portal order err: {e}", False)

        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        req_urls = []
        page.on("request", lambda r: req_urls.append(r.url) if "/api/" in r.url else None)
        await do_login(page, ADMIN_USER, ADMIN_PASS)
        try:
            await page.goto(f"{BASE}/clients/{cid}", wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            # Click Attività tab
            tab = page.locator('[data-testid="tab-attivita"]')
            if await tab.count() == 0:
                # try text
                tab = page.get_by_role("tab", name="Attività")
            req_urls.clear()
            await tab.first.click(force=True)
            await page.wait_for_timeout(3500)
            # Verify no operations/orders call
            ops_calls = [u for u in req_urls if "/operations/orders" in u]
            act_calls = [u for u in req_urls if f"/clients/{cid}/activity" in u]
            log(f"activity call made: {len(act_calls) > 0}", len(act_calls) > 0)
            log(f"NO /operations/orders call: {len(ops_calls) == 0}", len(ops_calls) == 0)
            # Verify testids
            if order_id:
                oact = await page.locator(f'[data-testid="client-activity-order-{order_id}"]').count()
                log(f"client-activity-order-{order_id}: {oact}", oact > 0)
            cact = await page.locator(f'[data-testid="client-activity-cleaning-{ct_id}"]').count()
            log(f"client-activity-cleaning-{ct_id}: {cact}", cact > 0)
            if fermata_id:
                lact = await page.locator(f'[data-testid="client-activity-logistics-{fermata_id}"]').count()
                log(f"client-activity-logistics-{fermata_id}: {lact}", lact > 0)
        except Exception as e:
            log(f"Client Activity error: {e}", False)
        await ctx.close()

        # ============ DEACTIVATED USER 401 ============
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        await do_login(page, cleaner["login_username"], FIXTURE_PASS)
        try:
            await page.goto(f"{BASE}/cleaner", wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)
            # Now deactivate
            subprocess.check_output(["mongosh", MONGO_URL, "--quiet", "--eval",
                f"db=db.getSiblingDB('{DB_NAME}'); db.users.updateOne({{id:'{cleaner['id']}'}}, {{$set:{{is_active:false}}}})"])
            statuses = []
            page.on("response", lambda r: statuses.append((r.status, r.url)) if "/api/" in r.url else None)
            await page.reload(wait_until="domcontentloaded")
            await page.wait_for_timeout(3500)
            got_401 = any(s == 401 for s, _ in statuses)
            on_login = "/login" in page.url
            log(f"Deactivated user: got 401 from API={got_401} OR redirected to /login={on_login}", got_401 or on_login)
        except Exception as e:
            log(f"Deactivation test error: {e}", False)
        finally:
            # Reactivate for cleanup convenience
            try:
                subprocess.check_output(["mongosh", MONGO_URL, "--quiet", "--eval",
                    f"db=db.getSiblingDB('{DB_NAME}'); db.users.updateOne({{id:'{cleaner['id']}'}}, {{$set:{{is_active:true}}}})"])
            except Exception:
                pass
        await ctx.close()

        await browser.close()

    # ---------- CLEANUP ----------
    print("\n=== CLEANUP ===")
    try:
        from pymongo import MongoClient
        mc = MongoClient(MONGO_URL); db_ = mc[DB_NAME]
        for sid_ in CREATED["structures"]:
            for coll in ['events', 'cleaning_tasks', 'units', 'structure_media', 'logistics_tasks',
                          'client_orders', 'key_movements', 'fabbisogni', 'notifications', 'consegne_richieste',
                          'consegne_fermate', 'zaini', 'giri']:
                if coll in db_.list_collection_names():
                    d = db_[coll].delete_many({'structure_id': sid_})
                    if d.deleted_count: print(f'{coll}[structure]: {d.deleted_count}')
            db_.structures.delete_one({'id': sid_})
        for cid_ in CREATED["clients"]:
            for coll in ['events', 'cleaning_tasks', 'client_orders', 'notifications', 'consegne_richieste']:
                if coll in db_.list_collection_names():
                    d = db_[coll].delete_many({'client_id': cid_})
                    if d.deleted_count: print(f'{coll}[client]: {d.deleted_count}')
            db_.clients.delete_one({'id': cid_})
        for uid_ in CREATED["users"]:
            db_.users.delete_one({'id': uid_})
            db_.user_sessions.delete_many({'user_id': uid_})
        # Portal user
        if CREATED["portal_email"]:
            db_.users.delete_many({'email': CREATED["portal_email"]})
        # Sweep any TESTFIX residue
        db_.users.delete_many({'first_name': {'$regex': '^TESTFIX'}})
        db_.clients.delete_many({'$or': [
            {'private_info.name': {'$regex': '^TESTFIX'}},
            {'company_info.company_name': {'$regex': '^TESTFIX'}},
        ]})
        db_.structures.delete_many({'name': {'$regex': '^TESTFIX'}})
        # Also cleanup any notifications created during test
        db_.notifications.delete_many({'created_at': {'$gte': __import__('datetime').datetime.utcnow() - __import__('datetime').timedelta(hours=1)}})
        print("mongo cleanup done")
    except Exception as e:
        print(f"cleanup err: {e}")

    # Baseline
    print("\n=== BASELINE ===")
    try:
        from pymongo import MongoClient
        mc = MongoClient(MONGO_URL); db_ = mc[DB_NAME]
        for coll in ["users", "clients", "structures", "units", "events", "cleaning_tasks", "fabbisogni",
                     "logistics_tasks", "client_orders", "key_movements", "rental_catalog", "supply_catalog",
                     "cleaning_catalog", "kits", "notifications"]:
            if coll in db_.list_collection_names():
                print(f"{coll}: {db_[coll].count_documents({})}")
    except Exception as e:
        print(f"baseline err: {e}")

    passed = sum(1 for r, _ in RESULTS if r == "PASS")
    total = len(RESULTS)
    print(f"\n=== {passed}/{total} passed ===")
    for r, m in RESULTS:
        if r == "FAIL": print(f"  FAIL: {m}")

asyncio.run(run())
