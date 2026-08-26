import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { ArrowRight, Layers, Package, Backpack } from 'lucide-react';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { KpiCard, KpiGrid } from '../../components/kilolava/KpiCard';
import { KpiSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { toast } from 'sonner';
import { fmtD, FABBISOGNO_STATUS_META } from './shared';

const KIND_LABELS = { noleggio: 'Noleggio', fornitura: 'Fornitura', zaino: 'Zaino', pulizie: 'Pulizie' };

export default function MagazzinoOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [fabbisogni, setFabbisogni] = useState([]);

  const loadFabbisogni = () => api.get('/magazzino/fabbisogni')
    .then(r => setFabbisogni(r.data.filter(f => ['aperta', 'in_consegna'].includes(f.status)))).catch(() => {});
  useEffect(() => {
    api.get('/magazzino/overview').then(r => setData(r.data)).catch(() => setData({ kpi: {} }));
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
    <div className="p-4 lg:p-6 space-y-5" data-testid="magazzino-overview-page">
      <PageHeader title="Magazzino" subtitle="Panoramica di Noleggio Strutture, Forniture, Magazzino Pulizie e Zaini Operativi" />
      {data === null ? <KpiSkeleton count={6} /> : (
        <KpiGrid cols={6} testId="magazzino-kpi">
          <KpiCard label="Strutture monitorate" value={kpi.structures_monitored} testId="kpi-structures" onClick={() => navigate('/magazzino/forniture')} />
          <KpiCard label="Fabbisogni noleggio" value={kpi.noleggio_gaps} accent={kpi.noleggio_gaps > 0 ? 'text-amber-600' : 'text-emerald-600'} testId="kpi-noleggio-gaps" onClick={() => navigate('/magazzino/noleggio')} />
          <KpiCard label="Forniture da reintegrare" value={kpi.supply_restock} accent={kpi.supply_restock > 0 ? 'text-amber-600' : 'text-emerald-600'} testId="kpi-supply" onClick={() => navigate('/magazzino/forniture')} />
          <KpiCard label="Case con mancanze pulizie" value={kpi.cleaning_low_stock} accent={kpi.cleaning_low_stock > 0 ? 'text-red-600' : 'text-emerald-600'} testId="kpi-cleaning-low" onClick={() => navigate('/magazzino/pulizie')} />
          <KpiCard label="Zaini operativi" value={kpi.zaini_total} sub={kpi.zaini_da_reintegrare > 0 ? `${kpi.zaini_da_reintegrare} da reintegrare` : null} testId="kpi-zaini" onClick={() => navigate('/magazzino/zaini')} />
          <KpiCard label="Movimenti oggi" value={kpi.movements_today} sub={kpi.anomalie > 0 ? `${kpi.anomalie} anomalie aperte` : null} testId="kpi-movements" onClick={() => navigate('/magazzino/movimenti')} />
        </KpiGrid>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AreaCard icon={Layers} title="Noleggio Strutture"
          subtitle="Biancheria a noleggio nelle case: fabbisogni per le prossime Pulizie"
          onOpen={() => navigate('/magazzino/noleggio')} testId="area-noleggio">
          {(data?.noleggio_alerts || []).length === 0 ? (
            <p className="text-sm text-emerald-600">Nessun fabbisogno scoperto.</p>
          ) : data.noleggio_alerts.map(a => (
            <button key={a.structure_id} onClick={() => navigate(`/magazzino/noleggio/${a.structure_id}`)}
              className="w-full text-left text-sm flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 klv-interactive">
              <span className="font-medium truncate flex-1">{a.structure_name}</span>
              <span className="text-xs text-amber-600 font-semibold whitespace-nowrap">
                {a.unconfigured?.length ? 'Kit non configurato' : `Manca materiale`} · {fmtD(a.date)}
              </span>
            </button>
          ))}
        </AreaCard>
        <AreaCard icon={Package} title="Forniture / Consumabili"
          subtitle="Strutture sotto minimo e quantità da reintegrare"
          onOpen={() => navigate('/magazzino/forniture')} testId="area-forniture">
          {(data?.supply_alerts || []).length === 0 ? (
            <p className="text-sm text-emerald-600">Tutte le forniture sopra il minimo.</p>
          ) : data.supply_alerts.map((a, i) => (
            <p key={i} className="text-sm px-2 py-1">⚠ Articolo sotto minimo ({a.qty}/{a.min_qty})</p>
          ))}
        </AreaCard>
        <AreaCard icon={Backpack} title="Magazzino Pulizie / Zaini"
          subtitle="Case con materiale pulizie mancante e zaini da reintegrare"
          onOpen={() => navigate('/magazzino/pulizie')} testId="area-pulizie">
          {(data?.cleaning_alerts || []).length === 0 && (kpi.zaini_da_reintegrare || 0) === 0 ? (
            <p className="text-sm text-emerald-600">Case e zaini a posto.</p>
          ) : (
            <>
              {(data?.cleaning_alerts || []).map(a => (
                <button key={a.structure_id} onClick={() => navigate(`/magazzino/pulizie/${a.structure_id}`)}
                  className="w-full text-left text-sm flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 klv-interactive">
                  <span className="font-medium truncate flex-1">{a.name}</span>
                  <span className="text-xs text-amber-600 font-semibold whitespace-nowrap">{a.missing_count} mancanze</span>
                </button>
              ))}
              {kpi.zaini_da_reintegrare > 0 && (
                <button onClick={() => navigate('/magazzino/zaini')} className="text-sm px-2 py-1 text-amber-600 font-medium hover:underline">
                  {kpi.zaini_da_reintegrare} zaini da reintegrare
                </button>
              )}
            </>
          )}
        </AreaCard>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2" data-testid="fabbisogni-section">
        <p className="text-sm font-bold">Richieste operative aperte</p>
        {fabbisogni.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna richiesta aperta. I reintegri e i fabbisogni creati dalle pagine Noleggio, Forniture e Zaini compaiono qui.</p>
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

function AreaCard({ icon: Icon, title, subtitle, children, onOpen, testId }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2 flex flex-col" data-testid={testId}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold flex-1">{title}</p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onOpen} data-testid={`${testId}-open`}>
          Apri<ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <div className="flex-1 space-y-0.5">{children}</div>
    </div>
  );
}
