import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { SprayCan } from 'lucide-react';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';

const STATUS_META = {
  completo: { label: 'Completo', tone: 'success' },
  incompleto: { label: 'Incompleto', tone: 'waiting' },
  kit_non_configurato: { label: 'Kit non configurato', tone: 'waiting' },
};

export default function KitPulizieListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState('');

  useEffect(() => { api.get('/zones').then(r => setZones(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    setRows(null);
    api.get('/magazzino/kit-pulizie', { params: zoneId ? { zone_id: zoneId } : {} })
      .then(r => setRows(r.data)).catch(() => setRows([]));
  }, [zoneId]);

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="kit-pulizie-page">
      <PageHeader title="Kit Pulizie Strutture" subtitle="Materiale per le Pulizie lasciato permanentemente dentro alcune case (distinto dagli Zaini)"
        actions={<>
          <select value={zoneId} onChange={e => setZoneId(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-pulizie-zone-filter">
            <option value="">Tutti i rioni</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <StructurePicker onPick={(id) => navigate(`/magazzino-strutture/kit-pulizie/${id}`)} />
        </>} />
      {rows === null ? <ListSkeleton rows={5} /> : rows.length === 0 ? (
        <EmptyState icon={SprayCan} message="Nessuna struttura con Kit Pulizie attivo. Non tutte le case devono averlo: attivalo con 'Configura struttura' solo dove il materiale resta in casa." />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm hidden lg:table">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Struttura</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Kit</th>
                <th className="px-3 py-2.5">Dotazione</th>
                <th className="px-3 py-2.5">Mancanze</th>
                <th className="px-3 py-2.5">Stato</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.structure_id} onClick={() => navigate(`/magazzino-strutture/kit-pulizie/${r.structure_id}`)}
                  className="border-t border-border hover:bg-accent/40 cursor-pointer row-hover" data-testid={`kit-pulizie-row-${r.structure_id}`}>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{r.structure_name}</p>
                    {r.klv_code && <p className="font-mono text-xs text-primary font-bold">{r.klv_code}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.client_name || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{r.kit_label || '—'}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.expected_count} articoli</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.missing_count > 0 ? <span className="text-amber-600 font-semibold">{r.missing_count}</span> : '—'}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={STATUS_META[r.status]?.tone}>{STATUS_META[r.status]?.label || r.status}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lg:hidden divide-y divide-border/60">
            {rows.map(r => (
              <div key={r.structure_id} onClick={() => navigate(`/magazzino-strutture/kit-pulizie/${r.structure_id}`)}
                className="p-3 space-y-1 cursor-pointer active:bg-accent/40" data-testid={`kit-pulizie-card-${r.structure_id}`}>
                <div className="flex items-center gap-2">
                  <p className="font-semibold flex-1 truncate">{r.structure_name}</p>
                  <StatusBadge tone={STATUS_META[r.status]?.tone}>{STATUS_META[r.status]?.label || r.status}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">{r.kit_label || '—'} · {r.expected_count} articoli{r.missing_count > 0 ? ` · ${r.missing_count} mancanze` : ''}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StructurePicker({ onPick }) {
  const [structures, setStructures] = useState([]);
  useEffect(() => { api.get('/structures').then(r => setStructures(r.data)).catch(() => {}); }, []);
  return (
    <select value="" onChange={e => e.target.value && onPick(e.target.value)}
      className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-pulizie-structure-picker">
      <option value="">Configura struttura...</option>
      {structures.map(s => <option key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</option>)}
    </select>
  );
}
