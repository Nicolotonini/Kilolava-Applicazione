import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from core.database import db

BRAND_FILL = PatternFill(start_color="F24E75", end_color="F24E75", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=11)

TYPE_LABELS = {
    'apartment': 'Appartamento', 'guesthouse': 'Affittacamere/B&B',
    'hotel': 'Hotel', 'office': 'Ufficio', 'other': 'Altro',
}
SERVICE_LABELS = {
    'cleaning': 'Pulizia', 'private_laundry': 'Lavanderia privata',
    'rental_laundry': 'Lavanderia noleggio', 'consumables': 'Consumabili',
    'maintenance': 'Manutenzioni', 'other': 'Altro',
}
STATUS_LABELS = {
    'unassigned': 'Non assegnato', 'assigned': 'Assegnato', 'in_progress': 'In corso',
    'completed': 'Completato', 'issue_reported': 'Problema', 'needs_review': 'Da verificare',
    'open': 'Aperto', 'resolved': 'Risolto', 'closed': 'Chiuso', 'pending': 'In attesa',
    'confirmed': 'Confermato', 'delivered': 'Consegnato', 'cancelled': 'Annullato',
    'draft': 'Bozza', 'issued': 'Emesso', 'scheduled': 'Programmato',
    'planned': 'Pianificato', 'ready': 'Pronto',
}
ROLE_LABELS = {
    'admin': 'Admin', 'operations_manager': 'Manager', 'cleaner': 'Addetto pulizie',
    'rider': 'Rider', 'maintenance': 'Manutentore', 'client': 'Cliente',
}
PRIORITY_LABELS = {'low': 'Bassa', 'medium': 'Media', 'high': 'Alta', 'urgent': 'Urgente'}
TASK_TYPE_LABELS = {'delivery': 'Consegna', 'pickup': 'Ritiro'}


def _client_name(c):
    if not c:
        return ''
    if c.get('client_type') == 'company' and c.get('company_info'):
        return c['company_info'].get('company_name') or ''
    pi = c.get('private_info') or {}
    return f"{pi.get('name', '') or ''} {pi.get('surname', '') or ''}".strip()


def _client_contact(c, field):
    info = (c.get('company_info') if c.get('client_type') == 'company' else c.get('private_info')) or {}
    return info.get(field) or ''


def _fmt_dt(v):
    if not v:
        return ''
    try:
        dt = datetime.fromisoformat(str(v).replace('Z', '+00:00'))
        return dt.strftime('%d/%m/%Y %H:%M')
    except (ValueError, TypeError):
        return str(v)


def _fmt_d(v):
    if not v:
        return ''
    try:
        dt = datetime.fromisoformat(str(v).replace('Z', '+00:00'))
        return dt.strftime('%d/%m/%Y')
    except (ValueError, TypeError):
        return str(v)


def _si_no(v):
    return 'Sì' if v else 'No'


def _status(v):
    return STATUS_LABELS.get(v, v or '')


EXPORT_CONFIGS = {
    'clients': {
        'collection': 'clients', 'sheet': 'Clienti', 'filename': 'clienti',
        'columns': [
            ('Nome', lambda d, m: _client_name(d)),
            ('Tipo', lambda d, m: 'Azienda' if d.get('client_type') == 'company' else 'Privato'),
            ('Email', lambda d, m: _client_contact(d, 'email')),
            ('Telefono', lambda d, m: _client_contact(d, 'phone')),
            ('Indirizzo', lambda d, m: _client_contact(d, 'address')),
            ('P.IVA', lambda d, m: (d.get('company_info') or {}).get('vat_number', '') if d.get('company_info') else ''),
            ('Codice Fiscale', lambda d, m: _client_contact(d, 'fiscal_code')),
            ('Ordini abilitati', lambda d, m: _si_no(d.get('ordering_enabled'))),
            ('Attivo', lambda d, m: _si_no(d.get('is_active'))),
            ('Note', lambda d, m: d.get('notes') or ''),
            ('Creato il', lambda d, m: _fmt_d(d.get('created_at'))),
        ],
    },
    'structures': {
        'collection': 'structures', 'sheet': 'Strutture', 'filename': 'strutture',
        'columns': [
            ('Nome', lambda d, m: d.get('name') or ''),
            ('Indirizzo', lambda d, m: d.get('address') or ''),
            ('Piano', lambda d, m: d.get('floor') or ''),
            ('Categoria', lambda d, m: TYPE_LABELS.get(d.get('structure_type') or d.get('type'), d.get('structure_type') or d.get('type') or '')),
            ('Proprietario', lambda d, m: m['clients'].get(d.get('client_id'), '')),
            ('Servizi', lambda d, m: ', '.join(SERVICE_LABELS.get(s, s) for s in (d.get('services') or []))),
            ('Metodo ingresso', lambda d, m: d.get('access_type') or ''),
            ('iCal', lambda d, m: d.get('ical_url') or ''),
            ('Attiva', lambda d, m: _si_no(d.get('is_active'))),
            ('Note', lambda d, m: d.get('notes') or ''),
        ],
    },
    'articles': {
        'collection': 'articles', 'sheet': 'Magazzino', 'filename': 'magazzino',
        'columns': [
            ('Nome', lambda d, m: d.get('name') or ''),
            ('Categoria', lambda d, m: d.get('category') or ''),
            ('Quantità disponibile', lambda d, m: d.get('quantity_available', 0)),
            ('Soglia minima', lambda d, m: d.get('minimum_threshold', 0)),
            ('Prezzo standard (€)', lambda d, m: d.get('standard_price', 0)),
            ('Unità', lambda d, m: d.get('unit_type') or ''),
            ('Attivo', lambda d, m: _si_no(d.get('is_active'))),
            ('Note', lambda d, m: d.get('notes') or ''),
        ],
    },
    'users': {
        'collection': 'users', 'sheet': 'Utenti', 'filename': 'utenti',
        'columns': [
            ('Nome', lambda d, m: d.get('name') or ''),
            ('Email', lambda d, m: d.get('email') or ''),
            ('Ruolo', lambda d, m: ROLE_LABELS.get(d.get('role'), d.get('role') or '')),
            ('Lingua', lambda d, m: (d.get('language') or '').upper()),
            ('Creato il', lambda d, m: _fmt_d(d.get('created_at'))),
        ],
    },
    'events': {
        'collection': 'events', 'sheet': 'Calendario', 'filename': 'calendario',
        'columns': [
            ('Titolo', lambda d, m: d.get('title') or ''),
            ('Tipo', lambda d, m: d.get('event_type') or ''),
            ('Struttura', lambda d, m: m['structures'].get(d.get('structure_id'), '')),
            ('Inizio', lambda d, m: _fmt_dt(d.get('start_time'))),
            ('Fine', lambda d, m: _fmt_dt(d.get('end_time'))),
            ('Stato', lambda d, m: _status(d.get('status'))),
            ('Operatore', lambda d, m: m['users'].get(d.get('assigned_operator'), '')),
            ('Fonte', lambda d, m: d.get('source') or ''),
            ('Note', lambda d, m: d.get('notes') or ''),
        ],
    },
    'cleaning': {
        'collection': 'cleaning_tasks', 'sheet': 'Pulizie', 'filename': 'pulizie',
        'columns': [
            ('Data', lambda d, m: _fmt_d(d.get('date'))),
            ('Ora prevista', lambda d, m: d.get('scheduled_time') or ''),
            ('Struttura', lambda d, m: m['structures'].get(d.get('structure_id'), '')),
            ('Cliente', lambda d, m: m['clients'].get(d.get('client_id'), '')),
            ('Addetto', lambda d, m: m['users'].get(d.get('assigned_cleaner_id'), '')),
            ('Stato', lambda d, m: _status(d.get('status'))),
            ('Durata stimata (min)', lambda d, m: d.get('estimated_duration_minutes') or ''),
            ('Completata il', lambda d, m: _fmt_dt(d.get('completed_at'))),
            ('Note', lambda d, m: d.get('notes') or ''),
        ],
    },
    'logistics': {
        'collection': 'logistics_tasks', 'sheet': 'Logistica', 'filename': 'logistica',
        'columns': [
            ('Data', lambda d, m: _fmt_d(d.get('date'))),
            ('Tipo', lambda d, m: TASK_TYPE_LABELS.get(d.get('task_type'), d.get('task_type') or '')),
            ('Indirizzo', lambda d, m: d.get('address') or ''),
            ('Struttura', lambda d, m: m['structures'].get(d.get('structure_id'), '')),
            ('Cliente', lambda d, m: m['clients'].get(d.get('client_id'), '')),
            ('Rider', lambda d, m: m['users'].get(d.get('rider_id'), '')),
            ('Fascia oraria', lambda d, m: f"{d.get('time_window_start') or ''} - {d.get('time_window_end') or ''}".strip(' -')),
            ('Stato', lambda d, m: _status(d.get('status'))),
            ('Completata il', lambda d, m: _fmt_dt(d.get('completed_at'))),
            ('Note', lambda d, m: d.get('notes') or ''),
        ],
    },
    'maintenance': {
        'collection': 'maintenance_issues', 'sheet': 'Manutenzioni', 'filename': 'manutenzioni',
        'columns': [
            ('Descrizione', lambda d, m: d.get('description') or ''),
            ('Categoria', lambda d, m: d.get('category') or ''),
            ('Priorità', lambda d, m: PRIORITY_LABELS.get(d.get('priority'), d.get('priority') or '')),
            ('Stato', lambda d, m: _status(d.get('status'))),
            ('Struttura', lambda d, m: m['structures'].get(d.get('structure_id'), '')),
            ('Cliente', lambda d, m: m['clients'].get(d.get('client_id'), '')),
            ('Segnalato da', lambda d, m: d.get('reporter_name') or m['users'].get(d.get('reported_by'), '')),
            ('Assegnato a', lambda d, m: m['users'].get(d.get('assigned_to'), '')),
            ('Data pianificata', lambda d, m: _fmt_d(d.get('scheduled_date'))),
            ('Note risoluzione', lambda d, m: d.get('resolution_notes') or ''),
            ('Creato il', lambda d, m: _fmt_d(d.get('created_at'))),
        ],
    },
    'documents': {
        'collection': 'documents', 'sheet': 'Documenti', 'filename': 'documenti',
        'columns': [
            ('Numero', lambda d, m: d.get('document_number') or ''),
            ('Tipo', lambda d, m: (d.get('document_type') or '').upper()),
            ('Data emissione', lambda d, m: _fmt_d(d.get('issue_date'))),
            ('Cliente', lambda d, m: m['clients'].get(d.get('client_id'), '')),
            ('Struttura', lambda d, m: m['structures'].get(d.get('structure_id'), '')),
            ('Destinazione', lambda d, m: d.get('destination_address') or ''),
            ('N. articoli', lambda d, m: len(d.get('items') or [])),
            ('Stato', lambda d, m: _status(d.get('status'))),
            ('Note', lambda d, m: d.get('notes') or ''),
        ],
    },
    'orders': {
        'collection': 'orders', 'sheet': 'Ordini', 'filename': 'ordini',
        'columns': [
            ('Numero ordine', lambda d, m: d.get('order_number') or ''),
            ('Cliente', lambda d, m: m['clients'].get(d.get('client_id'), '')),
            ('Struttura', lambda d, m: m['structures'].get(d.get('structure_id'), '')),
            ('Data consegna', lambda d, m: _fmt_d(d.get('delivery_date'))),
            ('Fascia', lambda d, m: d.get('delivery_slot') or ''),
            ('N. articoli', lambda d, m: len(d.get('items') or [])),
            ('Subtotale (€)', lambda d, m: d.get('subtotal', 0)),
            ('Totale (€)', lambda d, m: d.get('total', 0)),
            ('Stato', lambda d, m: _status(d.get('status'))),
            ('Creato il', lambda d, m: _fmt_d(d.get('created_at'))),
        ],
    },
    'activity': {
        'collection': 'activity_logs', 'sheet': 'Registro Attivita', 'filename': 'registro_attivita',
        'columns': [
            ('Data/Ora', lambda d, m: _fmt_dt(d.get('timestamp'))),
            ('Utente', lambda d, m: d.get('user_name') or ''),
            ('Ruolo', lambda d, m: ROLE_LABELS.get(d.get('user_role'), d.get('user_role') or '')),
            ('Azione', lambda d, m: {'create': 'Creazione', 'update': 'Modifica', 'delete': 'Eliminazione'}.get(d.get('action'), d.get('action') or '')),
            ('Sezione', lambda d, m: d.get('entity_type') or ''),
            ('ID elemento', lambda d, m: d.get('entity_id') or ''),
            ('Percorso', lambda d, m: d.get('path') or ''),
        ],
    },
}


async def _build_lookup_maps():
    clients = await db.clients.find({}, {'_id': 0, 'id': 1, 'client_type': 1, 'private_info': 1, 'company_info': 1}).to_list(5000)
    structures = await db.structures.find({}, {'_id': 0, 'id': 1, 'name': 1}).to_list(5000)
    users = await db.users.find({}, {'_id': 0, 'id': 1, 'name': 1}).to_list(5000)
    return {
        'clients': {c['id']: _client_name(c) for c in clients},
        'structures': {s['id']: s.get('name', '') for s in structures},
        'users': {u['id']: u.get('name', '') for u in users},
    }


def _build_workbook(sheet_name, columns, docs, maps):
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name
    headers = [h for h, _ in columns]
    ws.append(headers)
    for cell in ws[1]:
        cell.fill = BRAND_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(vertical='center')
    ws.row_dimensions[1].height = 22
    ws.freeze_panes = 'A2'
    for doc in docs:
        ws.append([fn(doc, maps) for _, fn in columns])
    for i, h in enumerate(headers, 1):
        max_len = max([len(str(h))] + [len(str(ws.cell(row=r, column=i).value or '')) for r in range(2, min(ws.max_row, 200) + 1)])
        ws.column_dimensions[get_column_letter(i)].width = min(max(max_len + 3, 12), 50)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def create_export_router(get_current_user):
    router = APIRouter(prefix="/export", tags=["export"])

    @router.get("/{entity}")
    async def export_entity(entity: str, month: str = None, current_user: dict = Depends(get_current_user)):
        if current_user.get('role') not in ('admin', 'operations_manager'):
            raise HTTPException(status_code=403, detail="Non autorizzato")
        config = EXPORT_CONFIGS.get(entity)
        if not config:
            raise HTTPException(status_code=404, detail=f"Export '{entity}' non disponibile")
        query = {}
        suffix = ''
        if entity == 'events' and month:
            try:
                y, m = (int(x) for x in month.split('-'))
            except ValueError:
                raise HTTPException(status_code=400, detail="Formato mese non valido (YYYY-MM)")
            nxt = f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"
            query['start_time'] = {'$gte': f"{y}-{m:02d}-01", '$lt': f"{nxt}-01"}
            suffix = f"_{m:02d}-{y}"
        docs = await db[config['collection']].find(query, {'_id': 0}).to_list(10000)
        maps = await _build_lookup_maps()
        buf = _build_workbook(config['sheet'], config['columns'], docs, maps)
        today = datetime.now(timezone.utc).strftime('%d-%m-%Y')
        filename = f"kilolava_{config['filename']}{suffix}_{today}.xlsx"
        return StreamingResponse(
            buf,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )

    return router
