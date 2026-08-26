import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import { Plus, ClipboardCheck, Send, AlertTriangle, Trash2 } from 'lucide-react';
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

export default function KitPulizieDetailPage() {
  const { structureId } = useParams();
  const [data, setData] = useState(null);
  const [kits, setKits] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [movOpen, setMovOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [anomOpen, setAnomOpen] = useState(false);
  const [addId, setAddId] = useState('');

  const load = useCallback(() => {
    api.get(`/magazzino/kit-pulizie/${structureId}`).then(r => setData(r.data)).catch(() => {});
  }, [structureId]);
  useEffect(() => {
    load();
    api.get('/magazzino/kits', { params: { domain: 'pulizie' } }).then(r => setKits(r.data)).catch(() => {});
    api.get('/magazzino/catalog/pulizie').then(r => setCatalog(r.data)).catch(() => {});
  }, [load]);

  if (!data) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;
  const s = data.structure;
  const cfg = data.config;
  const isCustom = (cfg.custom_items || []).length > 0;

  const saveConfig = async (payload, okMsg) => {
    try {
      await api.put(`/magazzino/kit-pulizie/${structureId}`, payload);
      if (okMsg) toast.success(okMsg);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const addCustomItem = () => {
    const p = catalog.find(c => c.id === addId);
    if (!p) return;
    const base = isCustom ? cfg.custom_items : data.items.filter(i => !i.extra).map(i => ({ product_id: i.product_id, name: i.name, qty: i.expected }));
    if (base.some(i => i.product_id === p.id)) return;
    saveConfig({ custom_items: [...base, { product_id: p.id, name: p.name, qty: 1 }] }, 'Articolo aggiunto');
    setAddId('');
  };

  const setCustomQty = (pid, qty) => {
    const items = cfg.custom_items.map(i => i.product_id === pid ? { ...i, qty: Number(qty) } : i);
    saveConfig({ custom_items: items });
  };

  const removeCustomItem = (pid) => {
    saveConfig({ custom_items: cfg.custom_items.filter(i => i.product_id !== pid) }, 'Articolo rimosso');
  };

  const createRestockRequest = async () => {
    const items = data.items.filter(i => i.missing > 0);
    if (items.length === 0) { toast.info('Nessuna mancanza da reintegrare'); return; }
    try {
      await api.post('/magazzino/fabbisogni', {
        kind: 'pulizie', structure_id: structureId,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, qty: i.missing })),
        note: `Reintegro Kit Pulizie — ${s.name}`,
      });
      toast.success('Richiesta di reintegro creata (non è una Segnalazione)');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const anyMissing = data.items.some(i => i.missing > 0);

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="kit-pulizie-detail-page">
      <DetailHeader backTo="/magazzino-strutture/kit-pulizie" backLabel="Kit Pulizie Strutture"
        title={s.name}
        meta={<>
          {s.klv_code && <span className="font-mono text-xs font-bold text-primary">{s.klv_code}</span>}
          {s.client_name && <span>{s.client_name}</span>}
        </>}
        badges={cfg.enabled
          ? <StatusBadge tone="success" testId="kit-enabled-badge">Attivo</StatusBadge>
          : <StatusBadge tone="cancelled" testId="kit-disabled-badge">Non utilizzato</StatusBadge>}
        actions={cfg.enabled && <>
          <Button variant="outline" onClick={() => setAnomOpen(true)} data-testid="kit-pulizie-anomalia-btn">
            <AlertTriangle className="h-4 w-4 mr-1.5" />Anomalia
          </Button>
          {anyMissing && (
            <Button variant="outline" className="border-amber-300 text-amber-700" onClick={createRestockRequest} data-testid="kit-pulizie-restock-btn">
              <Send className="h-4 w-4 mr-1.5" />Crea richiesta reintegro
            </Button>
          )}
          <Button variant="outline" onClick={() => setMovOpen(true)} data-testid="kit-pulizie-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Movimento
          </Button>
          <Button onClick={() => setCheckOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="kit-pulizie-check-btn">
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Controlla Kit
          </Button>
        </>} />

      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3" data-testid="kit-enabled-toggle-card">
        <Switch checked={cfg.enabled} onCheckedChange={v => saveConfig({ enabled: v }, v ? 'Kit Pulizie attivato' : 'Kit Pulizie disattivato')} data-testid="kit-enabled-switch" />
        <div>
          <p className="text-sm font-semibold">Kit Pulizie Struttura {cfg.enabled ? 'attivo' : 'non utilizzato'}</p>
          <p className="text-xs text-muted-foreground">Attivalo solo se il materiale per le pulizie resta permanentemente in questa casa.</p>
        </div>
      </div>

      {cfg.enabled && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <DetailSection title="Dotazione del Kit" testId="section-kit-dotazione">
              {data.kit_unconfigured && (
                <p className="text-sm text-amber-600 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-2.5" data-testid="kit-unconfigured-warning">
                  Kit non configurato: definisci la composizione di "{data.kit_label}" in Sistema → Cataloghi &amp; Kit, oppure usa una composizione personalizzata.
                </p>
              )}
              {data.items.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">
                  Nessuna dotazione definita. Scegli un Kit predefinito o aggiungi articoli alla composizione personalizzata.
                </p>
              ) : (
                <div className="rounded-xl border border-border overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2">Articolo</th>
                        <th className="px-3 py-2">Previsto</th>
                        <th className="px-3 py-2">Presente</th>
                        <th className="px-3 py-2">Stato</th>
                        {isCustom && <th className="px-3 py-2"></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map(i => (
                        <tr key={i.product_id} className="border-t border-border" data-testid={`kit-item-${i.product_id}`}>
                          <td className="px-3 py-2 font-medium">
                            <div className="flex items-center gap-2.5">
                              <ProductThumb photo={i.photo} size="w-8 h-8" testId={`kit-thumb-${i.product_id}`} />
                              <span>{i.name}{i.extra && <span className="ml-1.5 text-xs text-muted-foreground">(extra)</span>}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {isCustom && !i.extra ? (
                              <Input type="number" min="1" defaultValue={i.expected} className="w-16 h-7 text-sm"
                                onBlur={e => Number(e.target.value) !== i.expected && setCustomQty(i.product_id, e.target.value)}
                                data-testid={`kit-expected-${i.product_id}`} />
                            ) : (i.expected ?? '—')}
                          </td>
                          <td className={cn('px-3 py-2 tabular-nums font-semibold', i.missing > 0 && 'text-amber-600')}>{i.present}</td>
                          <td className="px-3 py-2">
                            {i.missing > 0 ? <StatusBadge tone="waiting" testId={`kit-missing-${i.product_id}`}>⚠ Mancano {i.missing}</StatusBadge>
                              : i.extra ? <StatusBadge tone="neutral">Extra</StatusBadge>
                                : <StatusBadge tone="success">✓</StatusBadge>}
                          </td>
                          {isCustom && (
                            <td className="px-3 py-2 text-right">
                              {!i.extra && (
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground"
                                  onClick={() => removeCustomItem(i.product_id)} data-testid={`kit-remove-${i.product_id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </td>
                          )}
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
            <DetailSection title="Composizione" testId="section-config">
              <div className="rounded-xl border border-border p-3 space-y-2.5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Kit predefinito</p>
                  <select value={isCustom ? '' : (cfg.kit_id || '')} disabled={isCustom}
                    onChange={e => saveConfig({ kit_id: e.target.value, custom_items: [] }, 'Kit aggiornato')}
                    className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-50" data-testid="kit-select">
                    <option value="">Nessun kit</option>
                    {kits.map(k => <option key={k.id} value={k.id}>{k.name}{(k.items || []).length === 0 ? ' (non configurato)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Composizione personalizzata {isCustom && '(attiva)'}</p>
                  <div className="flex items-center gap-1.5">
                    <select value={addId} onChange={e => setAddId(e.target.value)}
                      className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-add-custom-select">
                      <option value="">Aggiungi articolo...</option>
                      {catalog.filter(c => !data.items.some(i => !i.extra && i.product_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <Button size="sm" variant="outline" className="h-9" onClick={addCustomItem} disabled={!addId} data-testid="kit-add-custom-btn">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {isCustom && (
                    <button onClick={() => saveConfig({ custom_items: [] }, 'Composizione personalizzata rimossa')}
                      className="text-xs text-muted-foreground hover:text-foreground mt-1.5 underline" data-testid="kit-clear-custom-btn">
                      Torna al Kit predefinito
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">La personalizzata prevale sul Kit predefinito. I Kit si definiscono in Sistema → Cataloghi &amp; Kit.</p>
              </div>
            </DetailSection>

            {data.open_requests.length > 0 && (
              <DetailSection title="Richieste aperte" testId="section-richieste">
                <div className="space-y-1.5">
                  {data.open_requests.map(f => (
                    <div key={f.id} className="rounded-xl border border-border p-3 text-sm">
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
                Mancanze normali → richiesta di reintegro. Attrezzatura rotta o sparita in modo anomalo → "Anomalia" (Centro Segnalazioni, origine Kit Pulizie Struttura).
              </p>
            </DetailSection>
          </div>
        </div>
      )}

      {movOpen && <MovementDialog defaultDomain="pulizie" lockDomain defaultType="trasferimento"
        defaultOrigin={{ type: 'central', id: null }} defaultDestination={{ type: 'structure', id: structureId }}
        onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(); }} />}
      {checkOpen && <InventoryDialog domain="pulizie" locationType="structure" locationId={structureId}
        items={data.items.map(i => ({ product_id: i.product_id, name: i.name, qty: i.present }))}
        title={`Kit Pulizie — ${s.name}`}
        onClose={() => setCheckOpen(false)} onDone={() => { setCheckOpen(false); load(); }} />}
      {anomOpen && <AnomaliaDialog contextLabel={`Kit Pulizie Struttura — ${s.name}`} structureId={structureId} onClose={() => setAnomOpen(false)} />}
    </div>
  );
}
