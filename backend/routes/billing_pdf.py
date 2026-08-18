import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core.database import db

BRAND = colors.HexColor('#F24E75')
GREY = colors.HexColor('#6B7280')
LIGHT = colors.HexColor('#FDF2F5')

MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']


def _month_range(month: Optional[str]):
    if month:
        try:
            y, m = (int(x) for x in month.split('-'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato mese non valido (YYYY-MM)")
    else:
        now = datetime.now(timezone.utc)
        y, m = now.year, now.month
    start = f"{y}-{m:02d}-01"
    end = f"{y + 1}-01-01" if m == 12 else f"{y}-{m + 1:02d}-01"
    return start, end, y, m


def _client_info(client):
    if client.get('client_type') == 'company':
        info = client.get('company_info') or {}
        name = info.get('company_name') or ''
        tipo = 'Azienda'
        fiscal = info.get('vat_number') or info.get('fiscal_code') or ''
    else:
        info = client.get('private_info') or {}
        name = f"{info.get('name') or info.get('first_name') or ''} {info.get('surname') or info.get('last_name') or ''}".strip()
        tipo = 'Privato'
        fiscal = info.get('fiscal_code') or ''
    return {
        'name': name, 'tipo': tipo, 'fiscal': fiscal,
        'email': info.get('email') or '', 'phone': info.get('phone') or '',
        'address': info.get('address') or '',
    }


def _eur(v):
    return f"€ {(v or 0):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')


def create_billing_pdf_router(get_current_user):
    router = APIRouter(tags=["billing"])

    @router.get("/clients/{client_id}/billing-pdf")
    async def billing_pdf(client_id: str, month: Optional[str] = None, current_user: dict = Depends(get_current_user)):
        if current_user.get('role') not in ('admin', 'operations_manager') and current_user.get('client_id') != client_id:
            raise HTTPException(status_code=403, detail="Non autorizzato")
        client = await db.clients.find_one({"id": client_id}, {"_id": 0})
        if not client:
            raise HTTPException(status_code=404, detail="Cliente non trovato")

        start, end, y, m = _month_range(month)
        info = _client_info(client)

        dq = {"date": {"$gte": start, "$lt": end}, "client_id": client_id}
        cleaning_count = await db.cleaning_tasks.count_documents(dq)
        cleaning_completed = await db.cleaning_tasks.count_documents({**dq, "status": "completed"})
        deliveries = await db.logistics_tasks.count_documents({**dq, "task_type": "delivery"})
        pickups = await db.logistics_tasks.count_documents({**dq, "task_type": "pickup"})
        maint_count = await db.maintenance_issues.count_documents(
            {"created_at": {"$gte": start, "$lt": end}, "client_id": client_id})

        orders = await db.orders.find(
            {"client_id": client_id, "created_at": {"$gte": start, "$lt": end}, "status": {"$nin": ["cancelled"]}},
            {"_id": 0, "order_number": 1, "created_at": 1, "items": 1, "total": 1, "status": 1},
        ).sort("created_at", 1).to_list(500)
        orders_revenue = sum(o.get('total') or 0 for o in orders)

        top_items = []
        pipeline = [
            {"$match": {"date": {"$gte": start, "$lt": end}, "client_id": client_id}},
            {"$unwind": "$items"},
            {"$group": {"_id": "$items.article_id", "qty": {"$sum": "$items.quantity"}, "name": {"$first": "$items.article_name"}}},
            {"$sort": {"qty": -1}}, {"$limit": 10},
        ]
        async for doc in db.inventory_movements.aggregate(pipeline):
            top_items.append((doc.get('name') or doc['_id'], doc['qty']))

        # ---- Build PDF ----
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                                topMargin=16 * mm, bottomMargin=16 * mm,
                                title=f"Fatturazione {info['name']} {MESI[m - 1]} {y}")
        ss = getSampleStyleSheet()
        h1 = ParagraphStyle('h1', parent=ss['Title'], fontSize=20, textColor=BRAND, alignment=0, spaceAfter=2)
        sub = ParagraphStyle('sub', parent=ss['Normal'], fontSize=10, textColor=GREY, spaceAfter=6)
        sec = ParagraphStyle('sec', parent=ss['Heading3'], fontSize=12, textColor=colors.HexColor('#111827'), spaceBefore=10, spaceAfter=4)
        norm = ParagraphStyle('norm', parent=ss['Normal'], fontSize=9.5, leading=13)

        story = [
            Paragraph("kilolava", h1),
            Paragraph(f"Riepilogo Fatturazione — {MESI[m - 1]} {y}", sub),
            HRFlowable(width='100%', thickness=1.2, color=BRAND, spaceAfter=8),
        ]

        client_lines = [f"<b>{info['name']}</b> ({info['tipo']})"]
        if info['address']:
            client_lines.append(info['address'])
        contact = ' · '.join(x for x in [info['email'], info['phone']] if x)
        if contact:
            client_lines.append(contact)
        if info['fiscal']:
            client_lines.append(f"P.IVA / C.F.: {info['fiscal']}")
        story.append(Paragraph('<br/>'.join(client_lines), norm))
        story.append(Spacer(1, 6))

        story.append(Paragraph("Riepilogo servizi", sec))
        summary_data = [
            ['Servizio', 'Quantità', 'Dettaglio'],
            ['Pulizie', str(cleaning_count), f"{cleaning_completed} completate"],
            ['Logistica', str(deliveries + pickups), f"{deliveries} consegne · {pickups} ritiri"],
            ['Ordini', str(len(orders)), _eur(orders_revenue)],
            ['Manutenzioni', str(maint_count), '—'],
        ]
        st = Table(summary_data, colWidths=[55 * mm, 30 * mm, 85 * mm])
        st.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), BRAND),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E7EB')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(st)

        if orders:
            story.append(Paragraph("Ordini del periodo", sec))
            odata = [['Numero', 'Data', 'Articoli', 'Totale']]
            for o in orders:
                dt = ''
                if o.get('created_at'):
                    try:
                        dt = datetime.fromisoformat(str(o['created_at']).replace('Z', '+00:00')).strftime('%d/%m/%Y')
                    except ValueError:
                        dt = str(o['created_at'])[:10]
                odata.append([o.get('order_number') or '—', dt, str(len(o.get('items') or [])), _eur(o.get('total'))])
            odata.append(['', '', 'Totale', _eur(orders_revenue)])
            ot = Table(odata, colWidths=[45 * mm, 35 * mm, 30 * mm, 60 * mm])
            ot.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
                ('ALIGN', (2, 0), (2, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -2), 0.4, colors.HexColor('#E5E7EB')),
                ('LINEABOVE', (0, -1), (-1, -1), 0.8, BRAND),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(ot)

        if top_items:
            story.append(Paragraph("Articoli più consumati", sec))
            idata = [['Articolo', 'Quantità']] + [[n, str(q)] for n, q in top_items]
            it = Table(idata, colWidths=[120 * mm, 50 * mm])
            it.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
                ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E7EB')),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ]))
            story.append(it)

        story.append(Spacer(1, 14))
        total_style = ParagraphStyle('tot', parent=ss['Normal'], fontSize=13, textColor=BRAND, fontName='Helvetica-Bold', alignment=2)
        story.append(Paragraph(f"Totale periodo: {_eur(orders_revenue)}", total_style))
        story.append(Spacer(1, 10))
        footer = ParagraphStyle('foot', parent=ss['Normal'], fontSize=7.5, textColor=GREY, alignment=1)
        story.append(HRFlowable(width='100%', thickness=0.5, color=colors.HexColor('#E5E7EB'), spaceAfter=4))
        story.append(Paragraph(
            f"Documento generato automaticamente da Kilolava il {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC — non costituisce fattura fiscale",
            footer))

        doc.build(story)
        buf.seek(0)
        safe_name = ''.join(c if c.isalnum() else '_' for c in info['name'])[:40] or 'cliente'
        filename = f"kilolava_fatturazione_{safe_name}_{y}-{m:02d}.pdf"
        return StreamingResponse(buf, media_type='application/pdf',
                                 headers={'Content-Disposition': f'attachment; filename="{filename}"'})

    return router
