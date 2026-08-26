import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Layers } from 'lucide-react';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { fmtD } from './shared';

export default function NoleggioPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState('');

  useEffect(() => {
    api.get('/zones').then(r => setZones(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    setRows(null);
    api.get('/magazzino/noleggio', { params: zoneId ? { zone_id: zoneId } : {} })
      .then(r => setRows(r.data)).catch(() => setRows([]));
  }, [zoneId]);

  const coverageBadge = (r) => {
    if (!r.next_need) return <StatusBadge tone="cancelled">Nessuna pulizia</StatusBadge>;
    const cov = r.next_need.coverage;
    if (cov.unconfigured_kits?.length) return <StatusBadge tone="waiting">Kit non configurato</StatusBadge>;
    if (cov.covered) return <StatusBadge tone="success">Coperto</StatusBadge>;
    return <StatusBadge tone="danger">Fabbisogno non coperto</StatusBadge>;
  };

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="noleggio-page">
      <PageHeader title="Lavanderia a Noleggio" subtitle="Biancheria a noleggio fisicamente presente nelle Strutture: copre le prossime Pulizie?"
        actions={
          <select value={zoneId} onChange={e => setZoneId(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="noleggio-zone-filter">
            <option value="">Tutti i rioni</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        } />
      {rows === null ? <ListSkeleton rows={6} /> : rows.length === 0 ? (
        <EmptyState icon={Layers} message="Nessuna struttura con biancheria a noleggio o pulizie future. Registra un Carico dai Movimenti per iniziare." />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm hidden lg:table">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Struttura</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Stato</th>
                <th className="px-3 py-2.5">Prossimo fabbisogno</th>
                <th className="px-3 py-2.5">Disponibilità</th>
                <th className="px-3 py-2.5">Mancanze</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.structure_id} onClick={() => navigate(`/magazzino-strutture/noleggio/${r.structure_id}`)}
                  className="border-t border-border hover:bg-accent/40 cursor-pointer row-hover" data-testid={`noleggio-row-${r.structure_id}`}>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{r.structure_name}</p>
                    {r.klv_code && <p className="font-mono text-xs text-primary font-bold">{r.klv_code}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.client_name || '—'}</td>
                  <td className="px-3 py-2.5">{coverageBadge(r)}</td>
                  <td className="px-3 py-2.5">
                    {r.next_need ? (
                      <span className="capitalize">{fmtD(r.next_need.date)} · {r.next_need.coverage.kits_needed.map(k => `${k.qty}× ${k.kit_name}`).join(', ') || '—'}</span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{r.total_items} articoli</td>
                  <td className="px-3 py-2.5">
                    {r.next_need?.coverage?.missing_items?.length > 0
                      ? <span className="text-red-600 font-medium">{r.next_need.coverage.missing_items.map(m => `${m.missing}× ${m.name}`).join(', ')}</span>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lg:hidden divide-y divide-border/60">
            {rows.map(r => (
              <div key={r.structure_id} onClick={() => navigate(`/magazzino-strutture/noleggio/${r.structure_id}`)}
                className="p-3 space-y-1 cursor-pointer active:bg-accent/40" data-testid={`noleggio-card-${r.structure_id}`}>
                <div className="flex items-center gap-2">
                  <p className="font-semibold flex-1 truncate">{r.structure_name}</p>
                  {coverageBadge(r)}
                </div>
                <p className="text-xs text-muted-foreground">{r.client_name || ''} · {r.total_items} articoli
                  {r.next_need ? ` · ${fmtD(r.next_need.date)}` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
