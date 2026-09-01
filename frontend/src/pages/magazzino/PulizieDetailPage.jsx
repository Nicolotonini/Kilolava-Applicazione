import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { DetailSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MovementsTable } from './MovimentiPage';
import { ProductThumb } from './ProductThumb';
import { FABBISOGNO_STATUS_META, fmtD } from './shared';

export default function PulizieDetailPage() {
  const { structureId } = useParams();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
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

  const saveMin = async (product_id, min_qty) => {
    try {
      await api.put(`/magazzino/pulizie/${structureId}/items`, { product_id, min_qty });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const addProduct = async () => {
    if (!addId) return;
    await saveMin(addId, 0);
    setAddId('');
    toast.success('Prodotto aggiunto');
  };

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="pulizie-detail-page">
      <DetailHeader
        backTo="/magazzino-strutture/pulizie"
        backLabel="Prodotti Pulizie"
        title={s.name}
        code={s.klv_code}
        meta={s.client_name || ''}
      />

      <DetailSection title="Dotazione Prodotti Pulizie">
        <div className="flex items-center gap-2 mb-3">
          <select value={addId} onChange={e => setAddId(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm flex-1 max-w-xs" data-testid="pulizie-add-select">
            <option value="">Aggiungi prodotto dal catalogo...</option>
            {catalog.filter(c => !configured.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>)}
          </select>
          <Button size="sm" className="h-9" onClick={addProduct} disabled={!addId} data-testid="pulizie-add-btn">Aggiungi</Button>
        </div>
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="pulizie-items-empty">Nessun prodotto configurato per questa struttura.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Prodotto</th>
                  <th className="px-3 py-2">In struttura</th>
                  <th className="px-3 py-2">Minimo</th>
                  <th className="px-3 py-2">Stato</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map(i => (
                  <tr key={i.product_id} className="border-t border-border" data-testid={`pulizie-item-${i.product_id}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <ProductThumb photo={i.photo} />
                        <div>
                          <p className="font-medium">{i.name}</p>
                          {i.code && <p className="font-mono text-xs text-muted-foreground">{i.code}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{i.qty} {i.unit}</td>
                    <td className="px-3 py-2">
                      <Input type="number" min={0} defaultValue={i.min_qty ?? 0}
                        onBlur={e => { const v = parseInt(e.target.value || '0', 10); if (v !== (i.min_qty ?? 0)) saveMin(i.product_id, v); }}
                        className="h-8 w-20 tabular-nums" data-testid={`pulizie-min-${i.product_id}`} />
                    </td>
                    <td className="px-3 py-2">
                      {i.below_min ? <StatusBadge tone="waiting">Mancano {i.missing}</StatusBadge> : <StatusBadge tone="success">Ok</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>

      {(data.open_requests || []).length > 0 && (
        <DetailSection title="Richieste aperte">
          <div className="space-y-2">
            {data.open_requests.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-sm" data-testid={`pulizie-request-${r.id}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{(r.items || []).map(x => `${x.qty}× ${x.name}`).join(', ')}</p>
                  <p className="text-xs text-muted-foreground">{r.date_needed ? `entro ${fmtD(r.date_needed)}` : 'senza data'} · {r.note || ''}</p>
                </div>
                <StatusBadge tone={(FABBISOGNO_STATUS_META[r.status] || {}).tone || 'neutral'}>
                  {(FABBISOGNO_STATUS_META[r.status] || {}).label || r.status}
                </StatusBadge>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      <DetailSection title="Movimenti recenti">
        <MovementsTable items={data.movements || []} compact />
      </DetailSection>
    </div>
  );
}
