import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Plus, ClipboardCheck, Send } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { DetailSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MediaStrip } from '../../components/kilolava/MediaViewer';
import { MovementDialog, InventoryDialog } from './MovementDialog';
import { MovementsTable } from './MovimentiPage';
import { ProductThumb } from './ProductThumb';
import { FABBISOGNO_STATUS_META, fmtD } from './shared';

export default function FornitureDetailPage() {
  const { structureId } = useParams();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [movOpen, setMovOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [addId, setAddId] = useState('');

  const load = useCallback(() => {
    api.get(`/magazzino/forniture/${structureId}`).then(r => setData(r.data)).catch(() => {});
  }, [structureId]);
  useEffect(() => {
    load();
    api.get('/magazzino/catalog/forniture').then(r => setCatalog(r.data)).catch(() => {});
  }, [load]);

  if (!data) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;
  const s = data.structure;
  const configured = new Set(data.items.map(i => i.product_id));

  const saveConfig = async (product_id, cfg) => {
    try {
      await api.put(`/magazzino/forniture/${structureId}/items`, { product_id, ...cfg });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const addProduct = async () => {
    if (!addId) return;
    const p = catalog.find(c => c.id === addId);
    await saveConfig(addId, { min_qty: p?.default_min ?? 0, ideal_qty: p?.default_ideal ?? 0, threshold_enabled: true });
    setAddId('');
    toast.success('Articolo aggiunto');
  };

  const createRestockRequest = async () => {
    const items = data.items.filter(i => i.below_min && i.suggested_restock > 0);
    const kilolavaItems = items.filter(i => i.responsibility?.party !== 'client');
    if (kilolavaItems.length === 0) { toast.info('Nessun reintegro a carico Kilolava'); return; }
    try {
      await api.post('/magazzino/fabbisogni', {
        kind: 'fornitura', structure_id: structureId,
        items: kilolavaItems.map(i => ({ product_id: i.product_id, name: i.name, qty: i.suggested_restock })),
        responsibility: 'kilolava', note: 'Reintegro forniture sotto minimo',
      });
      toast.success('Richiesta di reintegro creata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const anyBelow = data.items.some(i => i.below_min);

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="forniture-detail-page">
      <DetailHeader backTo="/magazzino-strutture/forniture" backLabel="Forniture / Consumabili"
        title={s.name}
        meta={<>
          {s.klv_code && <span className="font-mono text-xs font-bold text-primary">{s.klv_code}</span>}
          {s.client_name && <span>{s.client_name}</span>}
        </>}
        actions={<>
          {anyBelow && (
            <Button variant="outline" className="border-amber-300 text-amber-700" onClick={createRestockRequest} data-testid="restock-request-btn">
              <Send className="h-4 w-4 mr-1.5" />Crea richiesta reintegro
            </Button>
          )}
          <Button variant="outline" onClick={() => setInvOpen(true)} data-testid="forniture-inventory-btn">
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Fai inventario
          </Button>
          <Button onClick={() => setMovOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="forniture-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Movimento
          </Button>
        </>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DetailSection title="Articoli" testId="section-articoli"
            actions={
              <div className="flex items-center gap-1.5">
                <select value={addId} onChange={e => setAddId(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="add-supply-select">
                  <option value="">Aggiungi articolo...</option>
                  {catalog.filter(c => !configured.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <Button size="sm" variant="outline" className="h-8" onClick={addProduct} disabled={!addId} data-testid="add-supply-btn"><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            }>
            {data.items.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">Nessun articolo configurato per questa struttura.</p>
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Articolo</th>
                      <th className="px-3 py-2">Attuale</th>
                      <th className="px-3 py-2">Minimo</th>
                      <th className="px-3 py-2">Ideale</th>
                      <th className="px-3 py-2">Soglia</th>
                      <th className="px-3 py-2">Responsabilità</th>
                      <th className="px-3 py-2">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(i => (
                      <tr key={i.product_id} className="border-t border-border" data-testid={`supply-row-${i.product_id}`}>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-2.5">
                            <ProductThumb photo={i.photo} size="w-9 h-9" testId={`supply-thumb-${i.product_id}`} />
                            <span>{i.name}</span>
                          </div>
                        </td>
                        <td className={cn('px-3 py-2 tabular-nums font-semibold', i.below_min && 'text-amber-600')}>{i.qty}</td>
                        <td className="px-3 py-2">
                          <Input type="number" min="0" defaultValue={i.min_qty ?? ''} className="w-16 h-7 text-sm"
                            onBlur={e => e.target.value !== String(i.min_qty ?? '') && saveConfig(i.product_id, { min_qty: Number(e.target.value || 0) })}
                            data-testid={`min-${i.product_id}`} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min="0" defaultValue={i.ideal_qty ?? ''} className="w-16 h-7 text-sm"
                            onBlur={e => e.target.value !== String(i.ideal_qty ?? '') && saveConfig(i.product_id, { ideal_qty: Number(e.target.value || 0) })}
                            data-testid={`ideal-${i.product_id}`} />
                        </td>
                        <td className="px-3 py-2">
                          <Switch checked={i.threshold_enabled} onCheckedChange={v => saveConfig(i.product_id, { threshold_enabled: v })}
                            data-testid={`threshold-${i.product_id}`} />
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {i.responsibility?.party === 'client' ? <span className="text-blue-600 font-medium">Cliente</span>
                            : i.responsibility?.party === 'kilolava' ? <span className="text-primary font-medium">Kilolava</span>
                              : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {i.below_min ? (
                            <StatusBadge tone="waiting" testId={`restock-badge-${i.product_id}`}>⚠ Portare {i.suggested_restock}</StatusBadge>
                          ) : i.threshold_enabled ? <StatusBadge tone="success">Ok</StatusBadge> : <StatusBadge tone="cancelled">No soglia</StatusBadge>}
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
          <DetailSection title="Storico fotografico" testId="section-foto">
            {data.photos.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">Le foto del magazzino scattate a fine Pulizia compariranno qui.</p>
            ) : (
              <div className="space-y-2">
                {data.photos.map((p, i) => (
                  <div key={p.id || i} className="flex items-center gap-3">
                    <MediaStrip media={[p]} size="w-16 h-16" testIdPrefix={`photo-${i}`} />
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

      {movOpen && <MovementDialog defaultDomain="forniture" lockDomain defaultType="consegna"
        defaultOrigin={{ type: 'central', id: null }} defaultDestination={{ type: 'structure', id: structureId }}
        onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(); }} />}
      {invOpen && <InventoryDialog domain="forniture" locationType="structure" locationId={structureId}
        items={data.items} title={s.name}
        onClose={() => setInvOpen(false)} onDone={() => { setInvOpen(false); load(); }} />}
    </div>
  );
}
