import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { KpiCard, KpiGrid } from '../../components/kilolava/KpiCard';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Shirt } from 'lucide-react';
import { fmtDateTime, shiftDay, todayRome } from '../consegne/shared';

const eur = (v) => (v ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export default function LavanderiaStoricoPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => shiftDay(todayRome(), -90));
  const [to, setTo] = useState(todayRome());
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = { date_from: from, date_to: to };
    if (clientId) params.client_id = clientId;
    api.get('/lavanderia/history', { params })
      .then((r) => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to, clientId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/clients').then((r) => setClients(r.data)).catch(() => {}); }, []);

  const totals = useMemo(() => ({
    count: rows.length,
    kg: rows.reduce((s, j) => s + (j.final_weight_kg || 0), 0),
    revenue: rows.reduce((s, j) => s + (j.total_price || 0), 0),
  }), [rows]);

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl" data-testid="lavanderia-storico-page">
      <PageHeader title="Lavanderia Privata — Storico" subtitle="Lavorazioni consegnate: pesi, prezzi e rider" />

      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Dal</p>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" data-testid="pl-storico-from" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Al</p>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" data-testid="pl-storico-to" />
        </div>
        <Select value={clientId || 'all'} onValueChange={(v) => setClientId(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 w-[200px]" data-testid="pl-storico-client"><SelectValue placeholder="Tutti i clienti" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i clienti</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name || c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <KpiGrid cols={3} testId="pl-storico-kpi">
        <KpiCard label="Lavorazioni" value={totals.count} testId="pl-kpi-count" />
        <KpiCard label="Kg totali" value={totals.kg.toLocaleString('it-IT', { maximumFractionDigits: 1 })} testId="pl-kpi-kg" />
        <KpiCard label="Totale €" value={eur(totals.revenue)} accent="text-primary" testId="pl-kpi-revenue" />
      </KpiGrid>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Shirt} message="Nessuna lavorazione consegnata nel periodo" testId="pl-storico-empty" />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Consegnata</th>
                <th className="text-left px-3 py-2 font-medium">Cliente</th>
                <th className="text-right px-3 py-2 font-medium">Kg</th>
                <th className="text-right px-3 py-2 font-medium">€/kg</th>
                <th className="text-right px-3 py-2 font-medium">Totale</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Rider</th>
                <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">Consegna</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((j) => (
                <tr key={j.id} data-testid={`pl-storico-row-${j.id}`}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDateTime(j.delivered_at)}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{j.client_name}</span>
                    {j.structure_name && <span className="text-xs text-muted-foreground ml-1.5">{j.structure_name}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{j.final_weight_kg ?? '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {j.price_per_kg != null ? eur(j.price_per_kg) : '—'}
                    {j.price_source === 'cliente' && <span className="text-xs text-primary ml-1">cliente</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums" data-testid={`pl-total-${j.id}`}>{j.total_price != null ? eur(j.total_price) : '—'}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground">{j.rider_name || '—'}</td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    {j.delivery_id ? (
                      <button className="text-xs text-primary hover:underline" onClick={() => navigate(`/consegne/fermata/${j.delivery_id}`)} data-testid={`pl-delivery-link-${j.id}`}>
                        Apri fermata
                      </button>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
