# Kilolava - Product Requirements Document

## Replica 1:1 (Agosto 2026)
Ambiente ricostruito 1:1 dall'export zip Emergent (`kilolava_export (2).zip`): codice copiato verbatim (backend FastAPI + frontend React), dipendenze installate, `.env` ricreati (JWT_SECRET rigenerato, nuova EMERGENT_LLM_KEY per object storage), database importato dal dump (18 collection, 151 documenti) via `database_export/import_database.py --drop`. Verifica fedeltà: iteration_1.json — backend 100% (31/31 pytest), frontend 100% (login + 12 pagine). Admin di test: test_user@kilolava.com / TestPass123!. Nota: il primo `ical/sync-all` ha riallineato le prenotazioni al feed Booking.com live (alcuni eventi del dump rimossi perché non più nel feed — comportamento originale corretto). Le foto caricate sul vecchio ambiente non migrano (solo riferimenti). Fase successiva (su conferma utente): semplificazione UI, dashboard/calendario migliorati, dati economici reali, distinzione consegne biancheria/consumabili.

## Original Problem Statement
Building **Kilolava** - a fullstack web application for managing laundry services, cleaning services, logistics, and property operations.

## Architecture
- **Frontend**: React + TailwindCSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB + APScheduler (cron jobs)
- **Authentication**: JWT tokens (roles: admin, operations_manager, cleaner, rider, maintenance, client)
- **Styling**: Brand color #F24E75
- **Object Storage**: Emergent Object Storage
- **iCal**: icalendar + httpx

## Backend Module Structure (post Phase 21 refactor)
```
backend/
├── server.py                 # FastAPI app + remaining route handlers (~5700 lines, down from 6120)
├── core/
│   ├── database.py           # mongo client + db
│   ├── enums.py              # UserRole, StructureService, EventStatus, AutomationRule, ...
│   └── utils.py              # now_iso, helpers
├── services/
│   ├── calendar_automation.py  # CHECKOUT_TASK_DEFINITIONS + auto_generate_checkout_tasks
│   ├── ical_sync.py            # sync_structure_ical + detect_ical_source
│   └── scheduler_service.py    # APScheduler init + check_overdue_tasks
└── tests/                     # pytest regression suite (test_phase2_*, test_phase3_*)
```

## Frontend Calendar Module Structure (post Phase 21 split)
```
frontend/src/pages/
├── CalendarPage.js           # main page (~800 lines, down from 1100) — composes the modules
└── calendar/
    ├── calendarHelpers.js    # constants, fmtDate, fmtEU, getEventColors, ...
    ├── DetailPanel.jsx       # slide-in side panel (Esc to close)
    ├── PlanningBoard.jsx     # Day & Week board grid
    ├── MonthGrid.jsx         # 6-row month grid
    ├── ServiceIconsRow.jsx   # 4-icon row under bookings
    └── useCalendarDrag.js    # drag-and-drop + mouse-pan hook
```

## What's Been Implemented

### Phase 1-14: Core modules COMPLETED
### Phase 15: Documents Module (DDT) - COMPLETED
### Phase 16: iCal Integration (Airbnb/Booking.com) - COMPLETED
### Phase 17: UI Redesign + Role Impersonation - COMPLETED
### Phase 18: Dashboard + Clients UX Redesign - COMPLETED (March 2026)
### Phase 19: Structures Pages Redesign - COMPLETED (April 2026)
### Phase 20: Calendar Redesign + Auto Service Tasks at Checkout - COMPLETED (April 2026)
- Auto-generation of cleaning/linen/consumables/maintenance tasks at every booking checkout
- Day / Week / Month calendar views, taller booking blocks, 4 service icons under bookings
- Drag-and-drop with `manually_modified` flag (iCal-imported events not overwritten on next sync)
- Mouse-drag pan, EU date formatting

### Phase 21: Polish + Refactor + Cron - COMPLETED (April 2026)
- **DateTimePicker shadcn** (`/components/ui/date-time-picker.jsx`): Italian locale calendar popover + time input replaces native `datetime-local` in event create/edit panel.
- **Cron job `/api/scheduler/check-overdue`** (APScheduler): runs every 30 min, finds operational tasks past their `end_time` still pending/assigned, notifies the assigned operator + ops users. Anti-spam via `overdue_notified_at` (re-notify only after 6h). New endpoints `GET /api/scheduler/status`, `POST /api/scheduler/check-overdue` (ops-only).
- **CalendarPage.js split** into 6 small modules under `/pages/calendar/`. Page shrunk from ~1100 to ~800 lines.
- **Backend refactor** (incremental "strangler fig"): extracted `core/` (database, enums, utils) and `services/` (calendar_automation, ical_sync, scheduler_service). `server.py` shrunk from 6120 to 5736 lines (-384). Bug fix: added `UserRole.OPS_MANAGER` legacy alias (was breaking `notify_ops_users`).
- **Testing**: iteration_21.json — Backend 100% (23/23), Frontend 100% (all critical flows + new DateTimePicker).

### Phase 22: Documento "Modifiche Applicazione" — Gap Closure (Giugno 2026)
- **Excel export** (`routes/export_routes.py` + `components/ExportButton.jsx`): `GET /api/export/{entity}` per 10 entità (clients, structures, articles, users, events, cleaning, logistics, maintenance, documents, orders). xlsx con intestazioni italiane, header brandizzato #F24E75, lookup nomi cliente/struttura/utente, solo ruoli admin/operations_manager. Pulsante "Excel" su 8 pagine liste.
- **Report inglobato nella Dashboard**: tab Panoramica/Report in DashboardPage (`<ReportsPage embedded />`), voce "Report" rimossa dalla sidebar, `/reports` → redirect `/dashboard`.
- **Login**: logo ingrandito (h-16 → h-24).
- **Testing**: iteration_22.json — Frontend 100%, backend export 10/10 via curl.
- NOTA UTENTE: backup Google Drive rimandato ("non fare adesso questa cosa").

### Phase 23: Fatture PDF + Export Calendario + Fix Lingua IT (Giugno 2026)
- **BUG FIX i18n**: in `translations.js` il blocco inglese era incollato dentro `it:` senza wrapper `en: {` → le chiavi duplicate EN sovrascrivevano le IT. Aggiunto wrapper: default italiano OK, toggle IT/EN funzionante.
- **PDF Fatturazione cliente** (`routes/billing_pdf.py`, reportlab): `GET /api/clients/{id}/billing-pdf?month=YYYY-MM` — PDF brandizzato con dati cliente, riepilogo servizi, ordini del periodo, articoli più consumati, totale. Tab Fatturazione rifatto: selettore mese (12 mesi), pulsante "Scarica PDF", campi mappati correttamente sulla risposta di `/reports/client/{id}` (prima mostrava sempre zeri).
- **Export Excel calendario**: `GET /api/export/events?month=YYYY-MM` filtra per mese (start_time); pulsante Excel nell'header del calendario esporta il mese visualizzato.
- **Testing**: iteration_23.json — backend 100% (pytest 6/6), frontend 100%.

### Phase 24: Registro Attività + Sidebar Restyle (Giugno 2026)
- **Registro Attività (audit trail)**: middleware FastAPI (`routes/activity_log.py`) traccia ogni POST/PUT/PATCH/DELETE riuscito su /api/* in `activity_logs` (utente da JWT, azione, entità, id, path, timestamp). Esclusi: GET, /api/auth/login, /api/activity, /api/scheduler. `GET /api/activity` con filtri (action/entity/skip/limit, solo ops). Pagina `/activity` con tabella, badge azione, filtri, paginazione, export Excel (`/api/export/activity`).
- **Sidebar ristrutturata**: riquadro utente/role-switcher spostato dall'header al FONDO della sidebar (sopra Esci), dropdown "Visualizza come" apre verso l'alto; icona Impostazioni affianco a Esci; voce nav "Registro Attività" aggiunta; Settings rimosso dalla lista nav (resta icona in basso + header).
- **Testing**: iteration_24.json — backend 100% (7/7), frontend 100%.

### Phase 25: Documentazione per revisione esterna (Giugno 2026)
- Creati `/app/README.md` (README tecnico completo in italiano: architettura, struttura FE/BE, schema MongoDB + relazioni, ~130 endpoint API, auth JWT, ruoli/permessi, 14 moduli, automazioni/workflow, dipendenze, setup locale, funzionalità incomplete, debito tecnico), `/app/backend/.env.example` e `/app/frontend/.env.example` (solo placeholder, nessun segreto).
- Aggiunto `.env` a `.gitignore` (prima NON era escluso → i segreti reali sarebbero finiti su GitHub col push).
- Nessuna modifica al codice funzionante. L'utente farà il push con "Save to GitHub" per la revisione con altro sviluppatore/AI.

## Database Collections
- `users`, `clients`, `structures`, `units`, `events`, `articles`
- `inventory_movements`, `client_prices`, `logistics_tasks`, `orders`
- `delivery_config`, `client_catalog`, `checklist_templates`
- `cleaning_tasks`, `cleaning_issues`, `maintenance_issues`
- `notifications`, `documents`, `ical_syncs`

## Key Backend Endpoints (selection)
- `POST /api/auth/login`
- `GET/POST/PUT/DELETE /api/events` (+ `POST /api/events/{id}/generate-tasks`)
- `POST /api/automation/generate`, `DELETE /api/automation/clear`
- `POST /api/ical/sync-all`, `POST /api/ical/sync/{structure_id}`, `GET /api/ical/status`
- `GET /api/scheduler/status`, `POST /api/scheduler/check-overdue` (NEW)

## Prioritized Backlog

### P0 (Next)
- [ ] Continue server.py refactor: extract route handlers per domain (routes/events.py, routes/structures.py, routes/clients.py, routes/inventory.py, routes/orders.py, etc.). Target: server.py < 500 lines acting only as composition root.

### P1
- [ ] Push notifications (Web Push API) for overdue task alerts
- [ ] Email channel via Resend/SendGrid
- [ ] Drag-and-drop on planning board (logistics view) — calendar already done
- [ ] Route optimization for riders
- [ ] Extract event editor panel into `/pages/calendar/EventEditorPanel.jsx`

### P2
- [x] Activity log / audit trail — DONE Phase 24
- [ ] Audit: popolare entity_id per le POST di creazione leggendo l'id dal response body (opzionale, minor)
- [ ] Backup Google Drive in Excel (rimandato dall'utente — riprendere quando avrà credenziali Google)
- [ ] Fatture in Cloud API integration
