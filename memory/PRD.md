# Kilolava - Product Requirements Document

## Fase Chiavi + Media + Google Fogli + Logo Clienti (Giugno 2026)
Test iteration_4: backend 9/9, frontend 100%. Novità: (1) Lista Strutture: rimosso "Apri" (riga interamente cliccabile), servizi come badge colorati con icona (Pulizie sky, Lav.Privata violet, Noleggio teal, Consumabili amber, Manutenzioni orange), restano Magazzino+cestino. (2) Scheda struttura: sezioni Generale/Servizi/Letti/Accesso e Chiavi/Foto-Video-Altro/Unità; "Accesso e Chiavi" include editor 3 copie chiavi (access_info.key_boxes {A,B,C} con box/slot/present/note, codici KLV-XXXX-A/B/C, portachiavi identificato solo da KLV) + campo keys_location + media arrive/enter/warehouse embedded; "Foto/Video/Altro" = media categoria general (particolarità operative). Supporto deep-link ?section=. (3) Nuova pagina /keys "Chiavi" in nav dopo Magazzino Strutture: 6 stat (con chiavi/complete/mancanti/box A-B-C occupati), ricerca KLV/nome/cliente, filtri Tutte/Complete/Mancanti/BoxA-B-C, copie mancanti in rosso, click → struttura?section=access. (4) Google Fogli: motore one-way completo in services/sheets_sync.py (google-api-python-client, service account) — 9 tab (Clienti, Strutture, Chiavi, Magazzino Strutture, Pulizie, Consegne, Lavanderia Privata, Lavanderia a Noleggio, Manutenzioni) con checkbox, menu a tendina, filtri, intestazione bloccata magenta, formattazione condizionale (Chiavi: verde/rosso/grigio; Magazzino: per quantità), riscrittura completa senza duplicati, DATI SENSIBILI MAI SINCRONIZZATI (no codici portone/keybox/magazzino). Endpoint /api/integrations/google-sheets/status e /sync (400 garbato se non configurato). NON ANCORA CONFIGURATO: servono env GOOGLE_SERVICE_ACCOUNT_JSON e GOOGLE_SHEETS_SPREADSHEET_ID + condivisione foglio col service account; card in Impostazioni mostra stato/ultima sync/pulsante Sincronizza ora. (5) Clienti: righe più ariose (py-5, nome 15px), logo/foto profilo per cliente (POST/DELETE /api/clients/{id}/logo, campo logo_path, avatar iniziali come fallback) in lista e header scheda con Carica/Sostituisci/Rimuovi.

## Fase Lista Clienti Gestionale (Giugno 2026)
Lista Clienti trasformata in vista gestionale: nuovo endpoint GET /api/clients/overview (definito PRIMA di /clients/{client_id}) che restituisce per ogni cliente {revenue_month (ordini mese corrente non annullati), today_activities (pulizie+consegne di oggi+manutenzioni aperte oggi), alerts (task in ritardo, manutenzioni urgenti aperte, strutture con magazzino negativo)}. Riga cliente: identità (nome+Privato/Azienda), KPI Strutture/Questo mese/Oggi/Alert (alert rossi solo se >0), telefono/email SEMPRE presenti come icone piccole a destra (tel:/mailto: con tooltip, disattivate in grigio se il dato manca), matita/cestino secondari, riga interamente cliccabile → scheda cliente. Rimossa vista griglia e colonne telefono/email. Nessuna modifica al modello dati. Servizi NON mostrati sul cliente (restano per struttura). Puliti 6 clienti TEST_ residui del testing agent.

## Fase Clienti & Strutture (Giugno 2026)
Overhaul completo gestione Clienti/Strutture (test iteration_3: backend 11/11, frontend 100%). Novità: codice interno progressivo permanente **KLV-XXXX** per ogni struttura (contatore globale in db.counters, backfill idempotente allo startup, ricercabile); ricerca strutture per KLV/nome/indirizzo/cliente; nuovi campi struttura: interior (interno), operational_contact, parking_info, has_units (toggle "contiene più Unità?" — sezione Unità visibile solo se ON), access_info {kilolava_has_keys, door_code, keybox_code, keybox_location} con predisposizione futura box chiavi KLV-XXXX-A/B/C, warehouse_info {location, code}, bed_config.capacity_persons (capacità operativa distinta dai posti letto, anche a livello Unità). Nuova collection **structure_media**: foto/video/note per struttura in 3 categorie (arrive/enter/warehouse), ognuna con titolo+descrizione+unit_id opzionale+ordine, endpoint CRUD+reorder (/api/structures/{id}/media). Sicurezza: ruolo client non vede access_details/access_info/warehouse_info e media (403); /api/files ora accetta ?auth=token (per <img>/<video>). UI: StructureDetailPage = pagina unica con menu interno (Generale/Servizi con 5 switch ON-OFF/Letti e Capacità/Accesso e Chiavi/Foto-Video-Istruzioni/Unità), pulsante evidente "Apri Magazzino Struttura" → /structure-inventory?structure_id=; StructuresListPage veloce con badge KLV e azioni rapide; ClientDetailPage: righe strutture con KLV, "Apri" → pagina struttura, nuova struttura → /structures/new?client_id=. Nessuna migrazione distruttiva, dati esistenti preservati. NON ancora sviluppati (fasi future): sistema avanzato box chiavi, QR code, automazioni kit/biancheria da capacità.

## Fase UI Restructure (Giugno 2026)
Ristrutturazione interfaccia (solo layout/sidebar/dashboard/identità): nuova sidebar con struttura fissa (Dashboard, Calendario, Clienti e Strutture▾, Pulizie, Magazzino Strutture, Consegne, Lavanderia Privata▾, Lavanderia a Noleggio▾, Manutenzioni, Amministrazione▾, Sistema▾), gruppi espandibili a un livello con auto-apertura. Sidebar w-72, font 15px, icone 20px, logo ingrandito + wordmark "kilolava" magenta. Top bar desktop rimossa: notifiche, toggle tema e account/ruolo (con "Visualizza come") spostati in basso a sinistra nella sidebar, dropdown verso l'alto. Dashboard ridisegnata full-width: riga Fatturato (Totale/Pulizie/Lavanderia con sub Privata-Noleggio/Consumabili + selettore periodo, default mese corrente), riga Oggi (4 card totale/completate/mancanti), riga Richiede Attenzione (lista compatta). Nuovi endpoint: GET /api/dashboard/overview, GET /api/inventory/structure-stock. Nuove pagine: /structure-inventory, /private-laundry/jobs|history (placeholder). /reports di nuovo standalone; "Logistica" rinominata "Consegne"; /inventory deep-link ?tab=. Mobile: bottom nav Home/Calendario/Pulizie/Altro con menu completo. Ricavi a 0€ finché non vengono inseriti i dati economici reali (fase futura). Movimenti magazzino assenti nel dump → Magazzino Strutture parte vuoto.

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

### Recent iterations (Giugno 2026)
- [x] Pagina Chiavi ridisegnata: rimossi KPI "Strutture con chiavi/Complete/Copie mancanti"; 3 card Box A/B/C (X/60, posti liberi) + 3 card "Chiavi fuori — Box A/B/C" (copie fuori dalla lavanderia); filtri solo Box A/B/C toggle; lista a tabella KLV | Struttura (con via + cliente cliccabile sotto il nome) | Box A | Box B | Box C con Slot ingranditi (text-base), check verde / COPIA MANCANTE rossa / grigio non disponibile; mobile card compatte con stessa logica. Verificato desktop + mobile via screenshot.
- [x] Header sticky tabella Strutture (KLV, Struttura, servizi, Ingresso, Magazzino) e header lista Chiavi: restano visibili durante lo scroll.
- [x] Tabella Strutture desktop: rimossa colonna Cliente separata; via + nome cliente (cliccabile, magenta) sotto al nome della struttura, come nelle card mobile.

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
