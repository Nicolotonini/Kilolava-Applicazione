import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Plus, ClipboardCheck, Send } from 'lucide-react';
import { toast } from 'sonner';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { DetailSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MovementDialog, InventoryDialog } from './MovementDialog';
import { MovementsTable } from './MovimentiPage';
import { MediaStrip } from '../../components/kilolava/MediaViewer';
import { FABBISOGNO_STATUS_META, fmtD } from './shared';

export default function NoleggioDetailPage() {
  const { structureId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [movOpen, setMovOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/magazzino/noleggio/${structureId}`).then(r => setData(r.data)).catch(() => {});
  }, [structureId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;
  const s = data.structure;

  const createRequest = async (need) => {
    try {
      await api.post('/magazzino/fabbisogni', {
        kind: 'noleggio', structure_id: structureId,
        items: need.coverage.missing_items.map(m => ({ product_id: m.product_id, name: m.name, qty: m.missing })),
        date_needed: need.date, cleaning_task_id: need.task_id,
        note: `Fabbisogno pulizia del ${need.date}`,
      });
      toast.success('Richiesta operativa creata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="noleggio-detail-page">
      <DetailHeader backTo="/magazzino-strutture/noleggio" backLabel="Lavanderia a Noleggio"
        title={s.name}
        meta={<>
          {s.klv_code && <span className="font-mono text-xs font-bold text-primary">{s.klv_code}</span>}
          {s.client_name && <span>{s.client_name}</span>}
        </>}
        actions={<>
          <Button variant="outline" onClick={() => setInvOpen(true)} data-testid="noleggio-inventory-btn">
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Fai inventario
          </Button>
          <Button onClick={() => setMovOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="noleggio-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Movimento
          </Button>
        </>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DetailSection title="Prossime necessità" testId="section-necessita">
            {data.upcoming_needs.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">Nessuna pulizia futura programmata.</p>
            ) : (
              <div className="space-y-2">
                {data.upcoming_needs.map(n => (
                  <div key={n.task_id} className="rounded-xl border border-border p-3 space-y-1.5" data-testid={`need-${n.task_id}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold capitalize">{fmtD(n.date)}{n.scheduled_time ? ` · ${n.scheduled_time}` : ''}</p>
                      <span className="text-xs text-muted-foreground">
                        {n.beds.double} matr. · {n.beds.single} sing. · {n.beds.sofa} div.
                      </span>
                      <span className="ml-auto">
                        {n.coverage.unconfigured_kits.length > 0 ? <StatusBadge tone="waiting">Kit non configurato</StatusBadge>
                          : n.coverage.covered ? <StatusBadge tone="success">✓ Sufficiente</StatusBadge>
                            : <StatusBadge tone="danger">Fabbisogno non coperto</StatusBadge>}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Richiesti: {n.coverage.kits_needed.map(k => `${k.qty}× ${k.kit_name}`).join(', ') || 'nessun kit'}
                    </p>
                    {n.coverage.unconfigured_kits.length > 0 && (
                      <p className="text-xs text-amber-600">Configura {n.coverage.unconfigured_kits.join(', ')} in Sistema → Cataloghi &amp; Kit per calcolare il fabbisogno.</p>
                    )}
                    {n.coverage.missing_items.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-red-600 font-medium">
                          ⚠ Manca: {n.coverage.missing_items.map(m => `${m.missing}× ${m.name}`).join(', ')}
                        </p>
                        <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => createRequest(n)} data-testid={`create-request-${n.task_id}`}>
                          <Send className="h-3 w-3 mr-1" />Crea richiesta
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Movimenti recenti" testId="section-movimenti">
            <MovementsTable items={data.movements} compact />
          </DetailSection>
        </div>

        <div className="space-y-6">
          <DetailSection title="Stock in struttura" testId="section-stock">
            <div className="rounded-xl border border-border divide-y divide-border/60">
              {data.items.map(i => (
                <div key={i.product_id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`stock-${i.product_id}`}>
                  <span>{i.name}</span>
                  <span className="font-semibold tabular-nums">{i.qty}</span>
                </div>
              ))}
            </div>
          </DetailSection>

          {data.open_requests.length > 0 && (
            <DetailSection title="Richieste aperte" testId="section-richieste">
              <div className="space-y-1.5">
                {data.open_requests.map(f => (
                  <div key={f.id} className="rounded-xl border border-border p-3 text-sm space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium flex-1">{f.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</span>
                      <StatusBadge tone={FABBISOGNO_STATUS_META[f.status]?.tone}>{FABBISOGNO_STATUS_META[f.status]?.label}</StatusBadge>
                    </div>
                    {f.date_needed && <p className="text-xs text-muted-foreground">Entro {f.date_needed}</p>}
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          <DetailSection title="Storico fotografico Magazzino" testId="section-foto">
            {(data.photos || []).length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">Le foto del magazzino scattate a fine Pulizia compariranno qui.</p>
            ) : (
              <div className="space-y-2">
                {data.photos.map((p, i) => (
                  <div key={p.id || i} className="flex items-center gap-3">
                    <MediaStrip media={[p]} size="w-16 h-16" testIdPrefix={`nol-photo-${i}`} />
                    <div className="text-sm">
                      <p className="font-medium capitalize">{fmtD(p.date)}</p>
                      <p className="text-xs text-muted-foreground">{p.uploaded_by_name || ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        </div>
      </div>

      {movOpen && <MovementDialog defaultDomain="noleggio" lockDomain defaultType="trasferimento"
        defaultOrigin={{ type: 'central', id: null }} defaultDestination={{ type: 'structure', id: structureId }}
        onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(); }} />}
      {invOpen && <InventoryDialog domain="noleggio" locationType="structure" locationId={structureId}
        items={data.items} title={s.name}
        onClose={() => setInvOpen(false)} onDone={() => { setInvOpen(false); load(); }} />}
    </div>
  );
}
