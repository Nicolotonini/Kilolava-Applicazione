import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { KpiCard, KpiGrid } from '../../components/kilolava/KpiCard';
import { KpiSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { fmtD, FABBISOGNO_STATUS_META } from './shared';

const KIND_LABELS = { noleggio: 'Noleggio', fornitura: 'Fornitura', zaino: 'Zaino', pulizie: 'Kit Pulizie' };

const LavanderiaState = ({ a }) => {
  if (!a.lavanderia) return null;
  if (a.lavanderia === 'ok') return <span className="text-xs text-emerald-600 font-medium">✓ Lavanderia coperta</span>;
  if (a.lavanderia === 'kit_non_configurato') return <span className="text-xs text-amber-600 font-medium">⚠ Lavanderia: Kit non configurato</span>;
  return <span className="text-xs text-red-600 font-medium">⚠ Lavanderia: {(a.lavanderia_missing || []).map(m => `${m.missing}× ${m.name}`).join(', ') || 'fabbisogno non coperto'}</span>;
};

export default function StruttureOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [fabbisogni, setFabbisogni] = useState([]);

  const loadFabbisogni = () => api.get('/magazzino/fabbisogni')
    .then(r => setFabbisogni(r.data.filter(f => ['aperta', 'in_consegna'].includes(f.status)))).catch(() => {});
  useEffect(() => {
    api.get('/magazzino/strutture/overview').then(r => setData(r.data)).catch(() => setData({ kpi: {}, attention: [] }));
    loadFabbisogni();
  }, []);

  const setFabStatus = async (f, status) => {
    try {
      await api.put(`/magazzino/fabbisogni/${f.id}`, { status });
      toast.success(status === 'evasa' ? 'Richiesta evasa' : status === 'annullata' ? 'Richiesta annullata' : 'Richiesta in consegna');
      loadFabbisogni();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const kpi = data?.kpi || {};

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="strutture-overview-page">
      <PageHeader title="Magazzino nelle Strutture" subtitle="Come siamo messi nelle case? Materiale fisicamente presente nelle Strutture dei Clienti" />

      {data === null ? <KpiSkeleton count={6} /> : (
        <KpiGrid testId="strutture-kpi">
          <KpiCard label="Strutture monitorate" value={kpi.structures_monitored} testId="kpi-ms-monitored" />
          <KpiCard label="Fabbisogni lavanderia" value={kpi.fabbisogni_lavanderia} accent={kpi.fabbisogni_lavanderia > 0 ? 'text-red-600' : 'text-emerald-600'} onClick={() => navigate('/magazzino-strutture/noleggio')} testId="kpi-ms-lavanderia" />
          <KpiCard label="Forniture da reintegrare" value={kpi.forniture_da_reintegrare} accent={kpi.forniture_da_reintegrare > 0 ? 'text-amber-600' : 'text-emerald-600'} onClick={() => navigate('/magazzino-strutture/forniture')} testId="kpi-ms-forniture" />
          <KpiCard label="Richieste aperte" value={kpi.fabbisogni_aperti} accent={kpi.fabbisogni_aperti > 0 ? 'text-amber-600' : 'text-emerald-600'} testId="kpi-ms-fabbisogni" />
          <KpiCard label="Anomalie" value={kpi.anomalie} accent={kpi.anomalie > 0 ? 'text-red-600' : 'text-emerald-600'} onClick={() => navigate('/segnalazioni')} testId="kpi-ms-anomalie" />
          <KpiCard label="Movimenti oggi" value={kpi.movements_today} onClick={() => navigate('/magazzino-strutture/movimenti')} testId="kpi-ms-movements" />
        </KpiGrid>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-2" data-testid="attention-section">
        <p className="text-sm font-bold">Strutture che richiedono attenzione</p>
        {(data?.attention || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Tutto a posto: nessuna struttura richiede attenzione.</p>
        ) : data.attention.map(a => (
          <button key={a.structure_id} onClick={() => navigate(`/magazzino-strutture/noleggio/${a.structure_id}`)}
            className="w-full text-left rounded-lg border border-border/60 px-3 py-2.5 space-y-1 hover:bg-accent/40 klv-interactive"
            data-testid={`attention-${a.structure_id}`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{a.structure_name}</span>
              {a.klv_code && <span className="font-mono text-xs text-primary font-bold">{a.klv_code}</span>}
              {a.next_cleaning && <span className="ml-auto text-xs text-muted-foreground capitalize">Prossima pulizia: {fmtD(a.next_cleaning)}</span>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <LavanderiaState a={a} />
              {a.forniture_missing > 0 && <span className="text-xs text-amber-600 font-medium">⚠ Forniture: {a.forniture_missing} articoli da reintegrare</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2" data-testid="fabbisogni-section">
        <p className="text-sm font-bold">Richieste operative aperte</p>
        {fabbisogni.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna richiesta aperta. Fabbisogni e reintegri compaiono qui, pronti per le Consegne.</p>
        ) : fabbisogni.map(f => (
          <div key={f.id} className="flex items-center gap-2 flex-wrap rounded-lg border border-border/60 px-3 py-2 text-sm" data-testid={`fab-${f.id}`}>
            <StatusBadge tone="accent">{KIND_LABELS[f.kind] || f.kind}</StatusBadge>
            <span className="font-medium">{f.structure_name || f.zaino_code || '—'}</span>
            <span className="text-muted-foreground flex-1 min-w-0 truncate">{(f.items || []).map(i => `${i.qty}× ${i.name}`).join(', ')}</span>
            {f.date_needed && <span className="text-xs text-muted-foreground whitespace-nowrap">entro {fmtD(f.date_needed)}</span>}
            <StatusBadge tone={FABBISOGNO_STATUS_META[f.status]?.tone}>{FABBISOGNO_STATUS_META[f.status]?.label}</StatusBadge>
            {f.status === 'aperta' && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFabStatus(f, 'in_consegna')} data-testid={`fab-transit-${f.id}`}>In consegna</Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-300" onClick={() => setFabStatus(f, 'evasa')} data-testid={`fab-done-${f.id}`}>Evasa</Button>
            {f.status === 'aperta' && (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setFabStatus(f, 'annullata')} data-testid={`fab-cancel-${f.id}`}>Annulla</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
