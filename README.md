# Kilolava — Sistema Gestionale Operativo

**Kilolava** è un'applicazione full-stack per la gestione operativa di un'azienda di servizi per il settore extra-alberghiero e non solo: **lavanderia** (privata e a noleggio), **pulizie**, **logistica/consegne**, **manutenzioni** e **fornitura di consumabili** per strutture ricettive (appartamenti, B&B, hotel, uffici).

Include un **gestionale interno** (admin/manager/operatori) e un **portale clienti** per ordini e reportistica.

---

## Indice

1. [Stack tecnologico](#1-stack-tecnologico)
2. [Architettura generale](#2-architettura-generale)
3. [Struttura del progetto](#3-struttura-del-progetto)
4. [Schema del database (MongoDB)](#4-schema-del-database-mongodb)
5. [Relazioni tra i dati](#5-relazioni-tra-i-dati)
6. [API ed endpoint](#6-api-ed-endpoint)
7. [Autenticazione](#7-autenticazione)
8. [Utenti, ruoli e permessi](#8-utenti-ruoli-e-permessi)
9. [Moduli implementati](#9-moduli-implementati)
10. [Automazioni e workflow](#10-automazioni-e-workflow)
11. [Dipendenze](#11-dipendenze)
12. [Avvio del progetto in locale](#12-avvio-del-progetto-in-locale)
13. [Dati demo / credenziali di test](#13-dati-demo--credenziali-di-test)
14. [Funzionalità incomplete o parziali](#14-funzionalità-incomplete-o-parziali)
15. [Note tecniche e debito tecnico](#15-note-tecniche-e-debito-tecnico)

---

## 1. Stack tecnologico

| Livello | Tecnologia |
|---|---|
| Frontend | React 19 (Create React App + CRACO), React Router 7, TailwindCSS, Shadcn/UI (Radix), lucide-react, axios, recharts, sonner (toast), date-fns, react-day-picker |
| Backend | FastAPI 0.110 (Python 3.11), Uvicorn |
| Database | MongoDB (driver async **Motor**) |
| Auth | JWT (PyJWT) + bcrypt per hashing password |
| Scheduler | APScheduler (cron job in-process) |
| PDF | reportlab (fatturazione), generazione DDT |
| Excel | openpyxl (export .xlsx) |
| iCal | icalendar (parsing feed Airbnb/Booking) |
| File storage | Emergent Object Storage (foto pulizie/consegne/manutenzioni) |

---

## 2. Architettura generale

```
┌─────────────────────┐        ┌──────────────────────────┐        ┌──────────────┐
│  React SPA (3000)   │  HTTP  │   FastAPI (8001)          │        │   MongoDB    │
│  - Gestionale ops   │ ─────► │   prefisso comune /api    │ ─────► │  (Motor)     │
│  - Portale clienti  │  axios │   - server.py (router)    │        │              │
└─────────────────────┘        │   - routes/  (moduli)     │        └──────────────┘
                               │   - services/ (logica)    │
                               │   - core/    (db, utils)  │
                               │   + APScheduler (cron)    │
                               │   + middleware audit log  │
                               └────────────┬─────────────┘
                                            │
                        ┌───────────────────┴───────────────────┐
                        │  Integrazioni esterne                  │
                        │  - Feed iCal (Airbnb / Booking.com)    │
                        │  - Emergent Object Storage (foto)      │
                        └────────────────────────────────────────┘
```

- **Tutte le route backend sono prefissate con `/api`**.
- Il frontend chiama il backend tramite `REACT_APP_BACKEND_URL` (variabile d'ambiente).
- Il token JWT viene inviato in header `Authorization: Bearer <token>` (interceptor axios in `frontend/src/lib/api.js`).

---

## 3. Struttura del progetto

```
/app
├── backend/
│   ├── server.py              # Entry point FastAPI — contiene la maggior parte di route e modelli Pydantic (~5.700 righe, vedi §15)
│   ├── core/
│   │   ├── database.py        # Connessione MongoDB (Motor) — esporta `db`
│   │   ├── enums.py           # Enum condivisi (UserRole, stati task, ecc.)
│   │   └── utils.py           # Utility comuni (now_iso, ecc.)
│   ├── routes/
│   │   ├── export_routes.py   # Export Excel generico (/api/export/{entity})
│   │   ├── billing_pdf.py     # PDF fatturazione mensile cliente
│   │   └── activity_log.py    # Audit trail: middleware + /api/activity
│   ├── services/
│   │   ├── ical_sync.py       # Sync feed iCal (dedup per UID)
│   │   ├── calendar_automation.py  # Auto-generazione task al checkout
│   │   └── scheduler_service.py    # Cron APScheduler (task in ritardo)
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.js             # Routing + guardie per ruolo
│   │   ├── lib/api.js         # Istanza axios + API helper per modulo
│   │   ├── contexts/          # AuthContext, LanguageContext, ThemeContext
│   │   ├── hooks/usePermissions.js  # Visibilità nav + impersonificazione ruoli
│   │   ├── i18n/translations.js     # Traduzioni IT (default) / EN
│   │   ├── components/
│   │   │   ├── layout/AppLayout.js  # Sidebar + header gestionale
│   │   │   ├── layout/PortalLayout.js  # Layout portale clienti
│   │   │   ├── ExportButton.jsx     # Pulsante export Excel riusabile
│   │   │   └── ui/                  # Componenti Shadcn/UI (+ date-time-picker custom)
│   │   └── pages/
│   │       ├── DashboardPage.js     # Dashboard (tab Panoramica + Report)
│   │       ├── CalendarPage.js      # Calendario (viste giorno/settimana/mese)
│   │       ├── calendar/            # Sottocomponenti calendario (PlanningBoard, MonthGrid, DetailPanel, drag&drop)
│   │       ├── ClientsPage.js / ClientDetailPage.js  # Clienti (tab Anagrafica/Strutture/Storico/Fatturazione)
│   │       ├── StructuresListPage.js / StructureDetailPage.js  # Strutture + unità + OTA/iCal
│   │       ├── InventoryPage.js     # Magazzino (articoli, movimenti, prezzi)
│   │       ├── LogisticsPage.js / RiderViewPage.js   # Logistica + vista rider
│   │       ├── CleaningPage.js / CleanerView.js / ChecklistTemplatesPage.js  # Pulizie
│   │       ├── MaintenanceIssuesPage.js / MaintenanceView.js  # Manutenzioni
│   │       ├── DocumentsPage.js / NewDocumentPage.js / DocumentDetailPage.js  # DDT
│   │       ├── UsersPage.js         # Gestione utenti
│   │       ├── ActivityLogPage.js   # Registro attività (audit)
│   │       ├── ReportsPage.js       # Report (inglobato come tab della Dashboard)
│   │       ├── SettingsPage.js / NotificationsPage.js / LoginPage.js / RegisterPage.js
│   │       └── portal/              # Portale clienti (dashboard, ordini, storico, report, servizi)
│   ├── package.json
│   └── .env.example
│
└── memory/                    # Documentazione di lavoro (PRD.md, credenziali test)
```

---

## 4. Schema del database (MongoDB)

Tutti i documenti usano **UUID stringa nel campo `id`** (non l'ObjectId Mongo) e date in **stringhe ISO 8601**. Collection principali:

| Collection | Scopo | Campi principali |
|---|---|---|
| `users` | Utenti di sistema | `id`, `name`, `email`, `password_hash` (bcrypt), `role`, `language`, `is_active`, `client_id` (solo ruolo client), `created_at` |
| `clients` | Anagrafica clienti | `id`, `client_type` (`private`/`company`), `private_info` {name, surname, email, phone, address, fiscal_code}, `company_info` {company_name, vat_number, …}, `ordering_enabled`, `is_active`, `notes` |
| `structures` | Strutture/immobili | `id`, `name`, `address`, `floor`, `structure_type` (apartment/guesthouse/hotel/office/other), `client_id`, `services[]` (cleaning, private_laundry, rental_laundry, consumables, maintenance, other), `access_type`, `ical_url`, `ical_source`, orari check-in/out, `is_active`, `notes` |
| `units` | Sotto-unità (camere per B&B/hotel) | `id`, `structure_id`, `name`, configurazione letti/ospiti |
| `events` | Prenotazioni/eventi calendario | `id`, `structure_id`, `unit_id`, `title`, `event_type`, `start_time`, `end_time`, `status`, `source` (manual/ical), `ical_uid` (dedup), `auto_generated`, `manually_modified`, `assigned_operator`, `notes` |
| `cleaning_tasks` | Task di pulizia | `id`, `date`, `scheduled_time`, `structure_id`, `unit_id`, `client_id`, `assigned_cleaner_id`, `status`, `checklist[]`, foto (initial/final/checklist), `estimated_duration_minutes`, `completed_at` |
| `cleaning_issues` | Problemi segnalati durante pulizie | `id`, task/struttura di riferimento, descrizione, foto, stato |
| `logistics_tasks` | Consegne/ritiri biancheria e consumabili | `id`, `date`, `task_type` (delivery/pickup), `address`, `structure_id`, `client_id`, `rider_id`, `time_window_start/end`, `status`, `items[]`, `confirmation_photo`, ordinamento percorso |
| `maintenance_issues` | Segnalazioni manutenzione | `id`, `description`, `category`, `priority`, `status`, `structure_id`, `client_id`, `reported_by`/`reporter_name`, `assigned_to`, `scheduled_date`, foto, note risoluzione |
| `articles` | Articoli magazzino | `id`, `name`, `category`, `quantity_available`, `minimum_threshold`, `standard_price`, `unit_type`, `is_active` |
| `inventory_movements` / `movements` | Movimenti di magazzino | `id`, `date`, `client_id`, `structure_id`, `items[]` {article_id, article_name, quantity}, tipo movimento |
| `pricing` | Prezzi personalizzati per cliente | `id`, `client_id`, `article_id`, prezzo |
| `client_catalog` | Catalogo articoli abilitati per cliente (portale) | `id`, `client_id`, articoli abilitati |
| `orders` | Ordini dal portale clienti | `id`, `order_number`, `client_id`, `structure_id`, `delivery_date`, `delivery_slot`, `items[]`, `subtotal`, `total`, `status`, `created_at` |
| `documents` | Documenti di trasporto (DDT) | `id`, `document_number`, `document_type`, `issue_date`, `client_id`, `structure_id`, `destination_address`, `items[]`, `status`, `notes` |
| `checklist_templates` | Template checklist pulizie | `id`, `name`, `items[]` |
| `notifications` | Notifiche interne | `id`, `user_id`, `type` (es. `task_overdue`), `title`, `message`, `read`, `created_at` |
| `activity_logs` | Audit trail | `id`, `timestamp`, `user_id`, `user_name`, `user_role`, `method`, `path`, `action` (create/update/delete), `entity_type`, `entity_id`, `status_code` |
| `ical_syncs` | Log sincronizzazioni iCal | struttura, esito, contatori eventi importati |
| `delivery_config` | Configurazione fasce/giorni di consegna | slot disponibili per gli ordini del portale |

---

## 5. Relazioni tra i dati

Le relazioni sono **per riferimento** (campo `*_id` con UUID), non embedded:

```
clients 1 ──── N structures 1 ──── N units
   │                 │                 │
   │                 └──── N events (prenotazioni; unit_id opzionale)
   │                              │
   │                              └── al checkout genera → cleaning_tasks / logistics_tasks
   │
   ├──── N orders ──── genera → logistics_tasks (consegna) e documents (DDT)
   ├──── N inventory_movements / pricing / client_catalog
   ├──── N maintenance_issues
   └──── 1 users (account portale, role=client, users.client_id → clients.id)

users (role=cleaner)      1 ── N cleaning_tasks   (assigned_cleaner_id)
users (role=rider)        1 ── N logistics_tasks  (rider_id)
users (role=maintenance)  1 ── N maintenance_issues (assigned_to)
articles 1 ── N items[] dentro orders / documents / logistics_tasks / movements
```

---

## 6. API ed endpoint

Tutte le API sono sotto `/api`. Endpoint principali per modulo (≈130 endpoint totali):

### Auth
- `POST /api/auth/register` — registrazione
- `POST /api/auth/login` — login, restituisce `access_token` JWT
- `GET /api/auth/me` / `PUT /api/auth/me` — profilo corrente

### Clienti
- `GET|POST /api/clients`, `GET|PUT|DELETE /api/clients/{id}`
- `POST /api/clients/{id}/create-account` — crea account portale per il cliente
- `GET /api/clients/{id}/billing-pdf?month=YYYY-MM` — **PDF fatturazione mensile**

### Strutture e unità
- `GET|POST /api/structures`, `GET|PUT|DELETE /api/structures/{id}`
- `GET|POST /api/units`, `GET|PUT|DELETE /api/units/{id}`

### Calendario / eventi
- `GET|POST /api/events`, `GET|PUT|DELETE /api/events/{id}`
- `GET /api/events/stats/day` — statistiche giornaliere
- `POST /api/events/{id}/generate-tasks` — genera task operative dall'evento

### iCal / Automazione
- `POST /api/ical/sync/{structure_id}` / `POST /api/ical/sync-all` / `GET /api/ical/status`
- `POST /api/automation/generate` / `GET /api/automation/status` / `DELETE /api/automation/clear`

### Pulizie
- `GET|POST /api/cleaning-tasks`, `GET|PUT /api/cleaning-tasks/{id}`, `PUT .../status`, `PUT .../checklist`
- `GET /api/cleaning-tasks/my-tasks` (vista addetto), `GET /api/cleaning-tasks/cleaners`
- `POST /api/cleaning-tasks/{id}/photos?photo_type=...` — upload foto
- `GET /api/cleaning-issues`, `PUT /api/cleaning-issues/{id}`, `POST .../photo`
- `GET|POST /api/checklist-templates`, `GET|PUT|DELETE /api/checklist-templates/{id}`

### Logistica
- `GET|POST /api/logistics/tasks`, `PUT|DELETE /api/logistics/tasks/{id}`, `PUT .../assign`
- `PUT /api/logistics/reorder` — riordino percorso rider
- `GET /api/logistics/my-tasks` (vista rider), `GET /api/logistics/day-summary`
- `GET|POST /api/logistics/riders`, `PUT|DELETE /api/logistics/riders/{id}`
- `POST /api/logistics/tasks/{id}/photo` — foto di conferma consegna

### Manutenzioni
- `GET|POST /api/maintenance/issues`, `GET|PUT /api/maintenance/issues/{id}`, `PUT .../status`
- `POST .../photo`, `POST .../notes`, `GET /api/maintenance/my-tasks`, `GET /api/maintenance/summary`, `GET /api/maintenance/staff`

### Magazzino
- `GET|POST /api/inventory/articles`, `PUT|DELETE /api/inventory/articles/{id}`
- `GET|POST /api/inventory/movements`, `DELETE /api/inventory/movements/{id}`
- `GET|POST /api/inventory/pricing`, `DELETE /api/inventory/pricing/{id}`
- `GET /api/inventory/stats`, `GET /api/inventory/register`, `GET /api/inventory/kit-calc/{unit_id}`

### Documenti (DDT)
- `GET|POST /api/documents`, `GET|PUT|DELETE /api/documents/{id}`
- `POST /api/documents/generate-from-order/{order_id}` / `generate-from-logistics/{task_id}` / `generate-from-movement/{movement_id}`

### Portale clienti
- `GET /api/portal/dashboard|catalog|services|structures|delivery-slots|report`
- `GET|POST /api/portal/orders`, `GET /api/portal/orders/{id}`, `PUT .../cancel`
- Lato ops: `GET /api/operations/orders`, `PUT /api/operations/orders/{id}/status`, `GET|POST /api/operations/client-catalog`, `GET|PUT /api/operations/delivery-config`

### Report e dashboard
- `GET /api/dashboard/stats` — KPI dashboard
- `GET /api/reports/dashboard|operations|inventory|clients-summary`
- `GET /api/reports/client/{client_id}?month=YYYY-MM` — dati fatturazione cliente

### Export / Audit / Sistema
- `GET /api/export/{entity}` — **export Excel** (`clients`, `structures`, `articles`, `users`, `events` [+`?month=`], `cleaning`, `logistics`, `maintenance`, `documents`, `orders`, `activity`)
- `GET /api/activity` — registro attività con filtri (`action`, `entity`, `skip`, `limit`)
- `GET|PUT /api/notifications...`, `GET /api/notifications/unread-count`
- `GET /api/scheduler/status`, `POST /api/scheduler/check-overdue`
- `GET /api/permissions/roles`, `GET /api/health`, `GET /api/files/{path}` (proxy file storage)
- Utenti: `GET|POST /api/users`, `GET|PUT|DELETE /api/users/{id}`, `PUT .../toggle-active`

---

## 7. Autenticazione

- **JWT Bearer token**: login (`POST /api/auth/login`) restituisce `access_token` firmato con `JWT_SECRET` (HS256, PyJWT). Il payload contiene `sub` = user id.
- **Password**: hash con **bcrypt** (mai in chiaro).
- Il frontend salva il token e lo invia in ogni richiesta tramite interceptor axios (`lib/api.js`); `AuthContext` gestisce sessione, login, logout e utente corrente.
- Le route protette usano la dependency `get_current_user` (in `server.py`): valida il token, carica l'utente e ne verifica lo stato attivo.
- Autorizzazione per ruolo applicata endpoint per endpoint (es. export/audit solo `admin`/`operations_manager`; il portale filtra per `client_id` dell'utente).

---

## 8. Utenti, ruoli e permessi

| Ruolo | Descrizione | Accesso |
|---|---|---|
| `admin` | Account principale | Tutto il gestionale + gestione utenti + registro attività + **impersonificazione ruoli** |
| `operations_manager` | Manager operativo | Tutto il gestionale tranne gestione utenti |
| `cleaner` | Addetto pulizie | Vista dedicata `CleanerView` con i propri task, checklist e upload foto |
| `rider` | Corriere | Vista dedicata `RiderViewPage` con giro consegne del giorno, foto conferma |
| `maintenance` | Manutentore | Vista dedicata `MaintenanceView` con gli interventi assegnati |
| `client` | Cliente finale | **Portale clienti** (`/portal/*`): ordini, storico, report; collegato a `clients` via `users.client_id` |

- La visibilità del menu è definita in `frontend/src/hooks/usePermissions.js` (`NAV_VISIBILITY`).
- **Impersonificazione**: l'admin può "vedere come" qualsiasi ruolo dal riquadro utente in fondo alla sidebar (dropdown "Visualizza come", banner ambra quando attiva). Solo lato UI, non cambia il token.
- Elenco ruoli esposto anche da `GET /api/permissions/roles`.

---

## 9. Moduli implementati

1. **Dashboard** — KPI economici del mese (fatturato totale, pulizie, lavanderia privata/noleggio, consumabili), operatività (4 card: pulizie/biancheria/consumabili/manutenzioni con totali/completate/mancanti), alert (scorte sotto soglia, task in ritardo, manutenzioni urgenti, nuovi ordini). Include il tab **Report** (grafici recharts: andamento, breakdown clienti, operazioni, inventario).
2. **Clienti** — lista con ricerca/vista griglia-lista, dettaglio a tab: Anagrafica, Strutture, Storico (con filtri), **Fatturazione** (selettore mese + PDF scaricabile).
3. **Strutture** — categorie (appartamento, affittacamere/B&B, hotel, ufficio, altro), sotto-unità/camere, servizi attivi con icone, metodo d'ingresso, collegamento OTA (**feed iCal Airbnb/Booking** con dedup per UID).
4. **Calendario** — viste giorno/settimana(default)/mese, blocchi prenotazione a doppia altezza, 4 icone servizio sotto il checkout, **drag & drop** per riassegnare/spostare, pannello dettaglio con date EU, ospiti e letti da preparare, generazione task.
5. **Pulizie** — task con checklist da template, foto prima/dopo, segnalazione problemi, vista dedicata per l'addetto.
6. **Logistica/Consegne** — consegne e ritiri, assegnazione rider, riordino percorso, foto di conferma, vista rider.
7. **Manutenzioni** — segnalazioni con priorità/categoria, assegnazione, note e foto, vista manutentore.
8. **Magazzino** — articoli con soglie minime, movimenti, prezzi per cliente, calcolo kit per unità.
9. **Documenti (DDT)** — creazione manuale o generazione da ordine/consegna/movimento, numerazione, stampa/PDF.
10. **Portale clienti** — dashboard, catalogo personalizzato, ordini con fasce di consegna, storico, report.
11. **Utenti** — CRUD utenti interni con ruoli, attivazione/disattivazione.
12. **Registro Attività** — audit trail automatico di ogni create/update/delete con filtri ed export.
13. **Export Excel** — pulsante "Excel" su tutte le liste principali (11 entità esportabili).
14. **Impostazioni / Notifiche / i18n** — tema chiaro/scuro, lingua IT (default)/EN, centro notifiche.

---

## 10. Automazioni e workflow

| Automazione | Dove | Come funziona |
|---|---|---|
| **Sync iCal** | `services/ical_sync.py` | Scarica i feed iCal delle strutture (Airbnb/Booking), crea/aggiorna eventi deduplicando per `ical_uid`; gli eventi rimossi dal feed vengono gestiti. Trigger manuale (`/api/ical/sync…`). |
| **Task automatiche al checkout** | `services/calendar_automation.py` | Alla data di **checkout** di ogni prenotazione genera automaticamente le task operative (pulizia, biancheria, consumabili) in base ai **servizi attivi della struttura**; salta se già esistenti (`auto_generated`, protezione `manually_modified`). |
| **Cron task in ritardo** | `services/scheduler_service.py` (APScheduler) | Job ricorrente che individua task scadute e non completate e crea **notifiche interne** (`task_overdue`) per gli utenti ops. Stato via `GET /api/scheduler/status`, trigger manuale via `POST /api/scheduler/check-overdue`. |
| **Audit trail** | `routes/activity_log.py` (middleware) | Ogni POST/PUT/PATCH/DELETE riuscito su `/api/*` viene registrato in `activity_logs` con utente (dal JWT), azione, entità e id. Esclusi: GET, login, `/api/activity`, `/api/scheduler`. |
| **Generazione DDT** | `server.py` | Un DDT può essere generato in un click da un ordine, una consegna o un movimento di magazzino. |
| **Workflow ordine portale** | portale + ops | Cliente crea ordine → ops lo conferma e ne aggiorna lo stato → consegna in logistica → DDT → i totali confluiscono nella fatturazione mensile del cliente. |

---

## 11. Dipendenze

### Backend (`backend/requirements.txt` — principali)
```
fastapi==0.110.1        uvicorn==0.25.0       motor==3.3.1 (pymongo 4.5)
PyJWT==2.11.0           bcrypt==4.1.3         passlib==1.7.4
APScheduler==3.11.2     icalendar==7.0.3
reportlab==5.0.0        openpyxl==3.1.5
pydantic==2.12.5        python-dotenv
```

### Frontend (`frontend/package.json` — principali)
```
react 19, react-router-dom 7, axios, tailwindcss + shadcn/ui (27 pacchetti @radix-ui),
lucide-react, recharts, sonner, date-fns, react-day-picker, react-hook-form + zod,
leaflet / react-leaflet (mappe logistica)
```

---

## 12. Avvio del progetto in locale

### Prerequisiti
- Python **3.11+**, Node.js **18+** con **yarn**, MongoDB in esecuzione (locale o Atlas)

### 1. Backend
```bash
cd backend
cp .env.example .env          # e compila i valori reali
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```
API disponibili su `http://localhost:8001/api` (health check: `GET /api/health`).

### 2. Frontend
```bash
cd frontend
cp .env.example .env          # REACT_APP_BACKEND_URL=http://localhost:8001
yarn install
yarn start
```
App su `http://localhost:3000`.

### 3. Primo utente
Non esiste uno script di seeding: registrare il primo utente da `/register` (o `POST /api/auth/register`). Nota: la registrazione self-service assegna un ruolo base; per ottenere un admin impostare `role: "admin"` sul documento in `users` direttamente in MongoDB, dopodiché gli altri utenti si creano dalla pagina **Utenti**.

> Nell'ambiente di sviluppo Emergent i processi sono gestiti da *supervisor* e il DB contiene già dati dimostrativi (clienti, strutture, prenotazioni, task). Il database **non** viene esportato con il codice: in locale si parte da un DB vuoto.

---

## 13. Dati demo / credenziali di test

Nell'ambiente di sviluppo esiste un account tecnico admin: username e password sono documentati SOLO in `memory/test_credentials.md` (file **non versionato**, escluso via `.gitignore`) e nelle variabili `TEST_ADMIN_USERNAME` / `TEST_ADMIN_PASSWORD` di `backend/.env`.
- Dati dimostrativi presenti: clienti (privato e azienda), strutture con unità e feed iCal, prenotazioni, task di pulizia/logistica/manutenzione, articoli di magazzino, ordini e DDT.

Le collection si popolano comunque in automatico usando l'app (creazione clienti → strutture → sync iCal → task generate al checkout).

---

## 14. Funzionalità incomplete o parziali

| Funzionalità | Stato | Note |
|---|---|---|
| **Notifiche Email / Web Push** | ❌ Non implementate | Il cron delle task in ritardo crea solo **notifiche interne** a DB; l'invio email/push è in backlog. |
| **Backup su Google Drive (Excel)** | ❌ Rimandato | Richiesto dal committente ma sospeso in attesa di credenziali Google (OAuth/Service Account). Gli export Excel per singola sezione esistono già. |
| **Integrazione Fatture in Cloud** | ❌ Non iniziata | In backlog. Il PDF di fatturazione mensile esiste ma non è una fattura fiscale. |
| **Invio email del PDF fatturazione** | ❌ Non iniziata | Oggi il PDF è solo scaricabile. |
| **Audit: `entity_id` sulle creazioni** | ⚠️ Parziale | Il middleware ricava l'id solo dall'URL: sulle POST di creazione `entity_id` è `null` (l'id è nel body di risposta). Miglioria opzionale. |
| **Ottimizzazione percorsi logistica** | ⚠️ Base | Esiste il riordino manuale del giro rider; nessun motore di routing automatico. |
| **Sync iCal schedulata** | ⚠️ Manuale | La sync è on-demand (pulsante/endpoint); non c'è ancora un cron automatico periodico. |
| **Pagina Impostazioni** | ⚠️ Base | Preferenze essenziali (tema/lingua/profilo); sezioni avanzate da definire. |

---

## 15. Note tecniche e debito tecnico

1. **`backend/server.py` è ancora un monolite (~5.700 righe)**: contiene la maggior parte dei modelli Pydantic e delle route. Un refactoring è stato avviato (estratti `core/`, `services/` e i nuovi moduli in `routes/`), ma lo split completo in `routes/` + `models/` è il principale intervento consigliato prima di nuove evoluzioni.
2. **Convenzioni date**: stringhe ISO (`YYYY-MM-DD` per i task, `YYYY-MM-DDTHH:MM` per gli eventi); il filtro per intervallo sfrutta l'ordinamento lessicografico.
3. **ID applicativi**: UUID stringa in `id`; l'`_id` di Mongo non viene mai esposto dalle API (proiezione `{'_id': 0}`).
4. **i18n**: `i18n/translations.js` con chiavi `it`/`en`; l'italiano è la lingua di default. Alcune pagine più recenti hanno stringhe italiane hardcoded.
5. **File/foto**: caricate su Emergent Object Storage e servite tramite `GET /api/files/{path}`; in un altro ambiente va sostituito con storage proprio (S3, disco, ecc.).
6. **Test**: esistono test di integrazione in `backend/tests/` e report end-to-end in `test_reports/` (generati durante lo sviluppo assistito).
7. **Sicurezza**: nessun segreto è hardcoded; tutto passa da `.env` (vedi `.env.example`). `CORS_ORIGINS` va ristretto in produzione.
