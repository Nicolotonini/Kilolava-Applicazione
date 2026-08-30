import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { KpiCard, KpiGrid } from '../../components/kilolava/KpiCard';
import { KpiSkeleton, EmptyState } from '../../components/kilolava/EmptyState';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Truck, AlertTriangle, Scale, User, PackageSearch, ChevronRight } from 'lucide-react';

const ATT_ICONS = { richiesta: PackageSearch, lavanderia: Scale, fermata: Truck, rider: User };

export default function ConsegnePanoramicaPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/consegne/overview')
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const k = data?.kpi || {};

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="consegne-overview-page">
      <PageHeader
        title="Consegne — Panoramica"
        subtitle="Centro logistico Kilolava: richieste, fermate e giri di consegna"
        actions={
          <Button onClick={() => navigate('/consegne/definizione')} className="h-9 gap-1.5" data-testid="goto-definizione">
            <PackageSearch className="h-4 w-4" />Organizzazione e definizione
          </Button>
        }
      />
      {loading ? (
        <KpiSkeleton count={8} />
      ) : (
        <KpiGrid cols={4} testId="consegne-kpi-grid">
          <KpiCard label="Consegne oggi" value={k.consegne_oggi} onClick={() => navigate('/consegne/giro')} testId="kpi-consegne-oggi" />
          <KpiCard label="Da verificare" value={k.da_verificare} accent={k.da_verificare > 0 ? 'text-amber-600' : undefined} onClick={() => navigate('/consegne/definizione')} testId="kpi-da-verificare" />
          <KpiCard label="Da confermare" value={k.da_confermare} accent={k.da_confermare > 0 ? 'text-sky-600' : undefined} onClick={() => navigate('/consegne/definizione')} testId="kpi-da-confermare" />
          <KpiCard label="Da organizzare" value={k.da_organizzare} onClick={() => navigate('/consegne/definizione')} testId="kpi-da-organizzare" />
          <KpiCard label="Pronte per il giro" value={k.pronte_giro} onClick={() => navigate('/consegne/giro')} testId="kpi-pronte-giro" />
          <KpiCard label="In corso" value={k.in_corso} accent="text-amber-600" testId="kpi-in-corso" />
          <KpiCard label="Completate oggi" value={k.completate_oggi} accent="text-emerald-600" testId="kpi-completate" />
          <KpiCard label="Urgenti / Problemi" value={(k.urgenti || 0) + (k.in_ritardo || 0)} accent={(k.urgenti || 0) + (k.in_ritardo || 0) > 0 ? 'text-red-600' : undefined} testId="kpi-urgenti" />
        </KpiGrid>
      )}

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Richiede attenzione</p>
        {!loading && (!data?.attention || data.attention.length === 0) ? (
          <EmptyState icon={Truck} message="Nessuna situazione da attenzionare: tutto sotto controllo" testId="attention-empty" />
        ) : (
          <Card className="border shadow-none">
            <CardContent className="p-0 divide-y divide-border/60">
              {(data?.attention || []).map((a, i) => {
                const Icon = ATT_ICONS[a.type] || AlertTriangle;
                const to = a.type === 'fermata' ? `/consegne/fermata/${a.id}`
                  : a.type === 'lavanderia' ? '/private-laundry/jobs'
                  : a.type === 'rider' ? '/consegne/giro' : '/consegne/definizione';
                return (
                  <button
                    key={i}
                    onClick={() => navigate(to)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                    data-testid={`attention-row-${i}`}
                  >
                    <Icon className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="text-sm flex-1 min-w-0 truncate">{a.text}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
