import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, ClipboardCheck, Send, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { DetailSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MovementDialog, InventoryDialog } from './MovementDialog';
import { MovementsTable } from './MovimentiPage';
import { AnomaliaDialog } from './AnomaliaDialog';
import { ProductThumb } from './ProductThumb';
import { FABBISOGNO_STATUS_META } from './shared';

export default function PulizieDetailPage() {
  const { structureId } = useParams();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [movOpen, setMovOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [anomOpen, setAnomOpen] = useState(false);
  const [addId, setAddId] = useState('');

  const load = useCallback(() => {
    api.get(`/magazzino/pulizie/${structureId}`).then(r => setData(r.data)).catch(() => {});
  }, [structureId]);
  useEffect(() => {
    load();
    api.get('/magazzino/catalog/pulizie').then(r => setCatalog(r.data)).catch(() => {});
  }, [load]);

  if (!data) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;
  const s = data.structure;
  const configured = new Set(data.items.map(i => i.product_id));

  const saveConfig = async (product_id, cfg) => {
    try {
      await api.put(`/magazzino/pulizie/${structureId}/items`, { product_id, ...cfg });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const addProduct = async () => {
    if (!addId) return;
    const p = catalog.find(c => c.id === addId);
    await saveConfig(addId, { min_qty: p?.min_qty ?? 1 });
    setAddId('');
    toast.success('Articolo aggiunto alla dotazione della casa');
  };

  const createRestockRequest = async () => {
    const items = data.items.filter(i => i.below_min && i.missing > 0);
    if (items.length === 0) { toast.info('Nessuna mancanza da reintegrare'); return; }
    try {
      await api.post('/magazzino/fabbisogni', {
        kind: 'pulizie', structure_id: structureId,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, qty: i.missing })),
        note: `Reintegro materiale pulizie — ${s.name}`,
      });
      toast.success('Richiesta di reintegro creata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const anyBelow = data.items.some(i => i.below_min);

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="pulizie-detail-page">
      <DetailHeader backTo="/magazzino/pulizie" backLabel="Magazzino Pulizie"
        title={s.name}
        meta={<>
          {s.klv_code && <span className="font-mono text-xs font-bold text-primary">{s.klv_code}</span>}
          {s.client_name && <span>{s.client_name}</span>}
        </>}
        actions={<>
          <Button variant="outline" onClick={() => setAnomOpen(true)} data-testid="pulizie-detail-anomalia-btn">
            <AlertTriangle className="h-4 w-4 mr-1.5" />Anomalia
          </Button>
          {anyBelow && (
            <Button variant="outline" className="border-amber-300 text-amber-700" onClick={createRestockRequest} data-testid="pulizie-restock-request-btn">
              <Send className="h-4 w-4 mr-1.5" />Crea richiesta reintegro
            </Button>
          )}
          <Button variant="outline" onClick={() => setInvOpen(true)} data-testid="pulizie-inventory-btn">
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Fai inventario
          </Button>
          <Button onClick={() => setMovOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="pulizie-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Movimento
          </Button>
        </>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DetailSection title="Dotazione pulizie della casa" testId="section-dotazione-casa"
            actions={
              <div className="flex items-center gap-1.5">
                <select value={addId} onChange={e => setAddId(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="add-cleaning-select">
                  <option value="">Aggiungi articolo...</option>
                  {catalog.filter(c => !configured.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button size="sm" variant="outline" className="h-8" onClick={addProduct} disabled={!addId} data-testid="add-cleaning-btn"><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            }>
            {data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">
                Nessuna dotazione configurata per questa casa. Aggiungi gli articoli che devono esserci.
              </p>
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Articolo</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Presente</th>
                      <th className="px-3 py-2">Prevista</th>
                      <th className="px-3 py-2">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(i => (
                      <tr key={i.product_id} className="border-t border-border" data-testid={`cleaning-row-${i.product_id}`}>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2.5">
                            <ProductThumb photo={i.photo} size="w-9 h-9" testId={`thumb-${i.product_id}`} />
                            <span>{i.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={i.type === 'attrezzatura' ? 'violet' : 'neutral'}>
                            {i.type === 'attrezzatura' ? 'Attrezzatura' : 'Consumabile'}
                          </StatusBadge>
                        </td>
                        <td className={cn('px-3 py-2 tabular-nums font-semibold', i.below_min && 'text-amber-600')}>{i.qty}</td>
                        <td className="px-3 py-2">
                          <Input type="number" min="0" defaultValue={i.min_qty ?? ''} className="w-16 h-7 text-sm"
                            onBlur={e => e.target.value !== String(i.min_qty ?? '') && saveConfig(i.product_id, { min_qty: Number(e.target.value || 0) })}
                            data-testid={`cleaning-min-${i.product_id}`} />
                        </td>
                        <td className="px-3 py-2">
                          {i.below_min ? (
                            <StatusBadge tone="waiting" testId={`cleaning-missing-${i.product_id}`}>⚠ Portare {i.missing}</StatusBadge>
                          ) : i.min_qty != null ? <StatusBadge tone="success">Ok</StatusBadge> : <StatusBadge tone="cancelled">No soglia</StatusBadge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>

          <DetailSection title="Movimenti recenti" testId="section-movimenti">
            <MovementsTable items={data.movements} compact />
          </DetailSection>
        </div>

        <div className="space-y-6">
          {data.open_requests.length > 0 && (
            <DetailSection title="Richieste aperte" testId="section-richieste">
              <div className="space-y-1.5">
                {data.open_requests.map(f => (
                  <div key={f.id} className="rounded-xl border border-border p-3 text-sm space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium flex-1">{f.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</span>
                      <StatusBadge tone={FABBISOGNO_STATUS_META[f.status]?.tone}>{FABBISOGNO_STATUS_META[f.status]?.label}</StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
          <DetailSection title="Come funziona" testId="section-info">
            <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">
              La dotazione definisce cosa deve esserci in questa casa. Le quantità cambiano solo con movimenti o inventari tracciati.
              Per rotture o problemi usa "Anomalia" (va nel Centro Segnalazioni).
            </p>
          </DetailSection>
        </div>
      </div>

      {movOpen && <MovementDialog defaultDomain="pulizie" lockDomain defaultType="carico"
        defaultDestination={{ type: 'structure', id: structureId }}
        onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(); }} />}
      {invOpen && <InventoryDialog domain="pulizie" locationType="structure" locationId={structureId}
        items={data.items} title={s.name}
        onClose={() => setInvOpen(false)} onDone={() => { setInvOpen(false); load(); }} />}
      {anomOpen && <AnomaliaDialog contextLabel={`Magazzino Pulizie — ${s.name}`} structureId={structureId} onClose={() => setAnomOpen(false)} />}
    </div>
  );
}
