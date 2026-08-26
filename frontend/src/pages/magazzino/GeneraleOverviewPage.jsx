import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Shirt, Package, SprayCan, Backpack, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { KpiCard, KpiGrid } from '../../components/kilolava/KpiCard';
import { KpiSkeleton } from '../../components/kilolava/EmptyState';

const AREAS = [
  { path: '/magazzino-generale/noleggio', icon: Shirt, title: 'Lavanderia a Noleggio', desc: 'Biancheria disponibile in sede', testId: 'mg-area-noleggio' },
  { path: '/magazzino-generale/forniture', icon: Package, title: 'Forniture / Consumabili', desc: 'Scorte Kilolava da distribuire nelle case', testId: 'mg-area-forniture' },
  { path: '/magazzino-generale/pulizie', icon: SprayCan, title: 'Prodotti Pulizie', desc: 'Stock centrale del materiale di lavoro', testId: 'mg-area-pulizie' },
  { path: '/magazzino-generale/zaini', icon: Backpack, title: 'Zaini Operatrici', desc: 'Ubicazioni mobili collegate alla sede', testId: 'mg-area-zaini' },
];

export default function GeneraleOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/magazzino/generale/overview').then(r => setData(r.data)).catch(() => setData({ kpi: {} }));
  }, []);

  const kpi = data?.kpi || {};

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="generale-overview-page">
      <PageHeader title="Magazzino Generale" subtitle="Cosa abbiamo in sede? Sede Kilolava, lavanderia, deposito centrale e zaini" />

      {data === null ? <KpiSkeleton count={6} /> : (
        <KpiGrid testId="generale-kpi">
          <KpiCard label="Articoli noleggio" value={kpi.noleggio_pieces} sub={`${kpi.noleggio_refs || 0} referenze`} onClick={() => navigate('/magazzino-generale/noleggio')} testId="kpi-mg-noleggio" />
          <KpiCard label="Forniture disponibili" value={kpi.forniture_pieces} sub={`${kpi.forniture_refs || 0} referenze`} onClick={() => navigate('/magazzino-generale/forniture')} testId="kpi-mg-forniture" />
          <KpiCard label="Pulizie sotto scorta" value={kpi.pulizie_low} accent={kpi.pulizie_low > 0 ? 'text-red-600' : 'text-emerald-600'} onClick={() => navigate('/magazzino-generale/pulizie')} testId="kpi-mg-pulizie-low" />
          <KpiCard label="Zaini da reintegrare" value={kpi.zaini_da_reintegrare} sub={`su ${kpi.zaini_total || 0} zaini`} accent={kpi.zaini_da_reintegrare > 0 ? 'text-amber-600' : 'text-emerald-600'} onClick={() => navigate('/magazzino-generale/zaini')} testId="kpi-mg-zaini" />
          <KpiCard label="Anomalie" value={kpi.anomalie} accent={kpi.anomalie > 0 ? 'text-red-600' : 'text-emerald-600'} onClick={() => navigate('/segnalazioni')} testId="kpi-mg-anomalie" />
          <KpiCard label="Movimenti oggi" value={kpi.movements_today} onClick={() => navigate('/magazzino-generale/movimenti')} testId="kpi-mg-movements" />
        </KpiGrid>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AREAS.map(a => (
          <button key={a.path} onClick={() => navigate(a.path)}
            className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 text-left hover:bg-accent/40 card-hover klv-interactive"
            data-testid={a.testId}>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <a.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{a.title}</p>
              <p className="text-xs text-muted-foreground">{a.desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
