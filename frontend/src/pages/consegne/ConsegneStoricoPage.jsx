import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { History, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FERMATA_STATUS, KIND_TONES, fmtDay, fmtDateTime, shiftDay, todayRome } from './shared';

export default function ConsegneStoricoPage() {
  const navigate = useNavigate();
  const [from, setFrom] = useState(() => shiftDay(todayRome(), -30));
  const [to, setTo] = useState(todayRome());
  const [status, setStatus] = useState('completed,cancelled,problem');
  const [riderId, setRiderId] = useState('');
  const [riders, setRiders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = { date_from: from, date_to: to, status };
    if (riderId) params.rider_id = riderId;
    api.get('/consegne/fermate', { params })
      .then((r) => setRows(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to, status, riderId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/logistics/riders').then((r) => setRiders(r.data)).catch(() => {}); }, []);

  const filtered = rows.filter((f) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (f.destination || '').toLowerCase().includes(s) || (f.klv_code || '').toLowerCase().includes(s) || (f.rider_name || '').toLowerCase().includes(s);
  });

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl" data-testid="consegne-storico-page">
      <PageHeader title="Storico consegne" subtitle="Fermate concluse, con problemi o annullate — incluse le consegne pre-esistenti" />

      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Dal</p>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-[150px]" data-testid="storico-from" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Al</p>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-[150px]" data-testid="storico-to" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[190px]" data-testid="storico-status-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="completed,cancelled,problem">Concluse e annullate</SelectItem>
            <SelectItem value="completed">Solo completate</SelectItem>
            <SelectItem value="cancelled">Solo annullate</SelectItem>
            <SelectItem value="problem">Con problema</SelectItem>
            <SelectItem value="unassigned,assigned,in_progress,completed,problem,cancelled">Tutte</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riderId || 'all'} onValueChange={(v) => setRiderId(v === 'all' ? '' : v)}>
          <SelectTrigger className="h-9 w-[160px]" data-testid="storico-rider-select"><SelectValue placeholder="Tutti i rider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i rider</SelectItem>
            {riders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca destinazione, KLV, rider..." className="h-9 pl-9" data-testid="storico-search" />
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={History} message="Nessuna fermata nel periodo selezionato" testId="storico-empty" />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Data</th>
                <th className="text-left px-3 py-2 font-medium">Destinazione</th>
                <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Categorie</th>
                <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Rider</th>
                <th className="text-left px-3 py-2 font-medium">Stato</th>
                <th className="text-right px-4 py-2 font-medium hidden lg:table-cell">Completata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((f) => {
                const st = FERMATA_STATUS[f.status] || FERMATA_STATUS.unassigned;
                return (
                  <tr
                    key={f.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => navigate(`/consegne/fermata/${f.id}`)}
                    data-testid={`storico-row-${f.id}`}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDay(f.date)}</td>
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{f.destination}</span>
                      {f.klv_code && <span className={cn('ml-1.5 text-xs font-mono text-muted-foreground')}>{f.klv_code}</span>}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {(f.lines || []).map((l, i) => (
                          <StatusBadge key={i} tone={KIND_TONES[l.category] || 'cancelled'} className="!py-0.5">{l.category_label}</StatusBadge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-muted-foreground">{f.rider_name || '—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground hidden lg:table-cell">{f.completed_at ? fmtDateTime(f.completed_at) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
