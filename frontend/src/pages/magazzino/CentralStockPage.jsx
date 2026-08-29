import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Plus, ClipboardCheck, AlertTriangle, PackageOpen, Boxes } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MovementDialog, InventoryDialog } from './MovementDialog';
import { AnomaliaDialog } from './AnomaliaDialog';
import { ProductThumb } from './ProductThumb';

const META = {
  noleggio: { title: 'Lavanderia a Noleggio', subtitle: 'Stock centrale della biancheria disponibile in sede Kilolava' },
  forniture: { title: 'Forniture / Consumabili', subtitle: 'Scorte Kilolava in sede, pronte per essere distribuite nelle case' },
  pulizie: { title: 'Prodotti Pulizie', subtitle: 'Stock centrale del materiale utilizzato per lavorare (sede e zaini)' },
};
const FILTERS = [['all', 'Tutti'], ['attrezzatura', 'Attrezzatura'], ['consumabile', 'Consumabili'], ['materiale', 'Materiali'], ['low', 'Sotto scorta']];

export default function CentralStockPage({ domain }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [movOpen, setMovOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [anomOpen, setAnomOpen] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/magazzino/generale/stock/${domain}`).then(r => setRows(r.data)).catch(() => setRows([]));
  }, [domain]);
  useEffect(() => { setRows(null); setFilter('all'); load(); }, [load]);

  const meta = META[domain];
  const filtered = (rows || []).filter(r => {
    if (domain !== 'pulizie' || filter === 'all') return true;
    if (filter === 'low') return r.below_min;
    if (filter === 'attrezzatura') return (r.type || '').startsWith('attrezzatura');
    return r.type === filter;
  });

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid={`central-stock-page-${domain}`}>
      <PageHeader title={meta.title} subtitle={meta.subtitle}
        actions={<>
          <Button variant="outline" onClick={() => setAnomOpen(true)} data-testid="central-anomalia-btn">
            <AlertTriangle className="h-4 w-4 mr-1.5" />Anomalia
          </Button>
          {domain === 'noleggio' && (
            <Button variant="outline" onClick={() => setKitOpen(true)} data-testid="kit-transfer-btn">
              <PackageOpen className="h-4 w-4 mr-1.5" />Trasferisci Kit
            </Button>
          )}
          <Button variant="outline" onClick={() => setInvOpen(true)} data-testid="central-inventory-btn">
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Fai inventario
          </Button>
          <Button onClick={() => setMovOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="central-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Movimento
          </Button>
        </>} />

      {domain === 'pulizie' && (
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cn('px-3 py-1.5 rounded-full text-sm font-medium klv-interactive',
                filter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
              data-testid={`central-filter-${k}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      {rows === null ? <ListSkeleton rows={8} /> : filtered.length === 0 ? (
        <EmptyState icon={Boxes} message="Nessun articolo. Registra un Carico dal fornitore per iniziare, o gestisci il catalogo in Sistema → Cataloghi Prodotti." />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Articolo</th>
                <th className="px-3 py-2.5">Categoria</th>
                {domain === 'pulizie' && <th className="px-3 py-2.5">Tipo</th>}
                <th className="px-3 py-2.5">Unità</th>
                <th className="px-3 py-2.5">Disponibile in sede</th>
                {domain === 'pulizie' && <th className="px-3 py-2.5">Scorta min.</th>}
                {domain === 'pulizie' && <th className="px-3 py-2.5">Stato</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-t border-border row-hover" data-testid={`central-row-${p.id}`}>
                  <td className="px-3 py-2.5 font-medium">
                    <div className="flex items-center gap-2.5">
                      <ProductThumb photo={p.photo} size="w-9 h-9" testId={`central-thumb-${p.id}`} />
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.category || '—'}</td>
                  {domain === 'pulizie' && (
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={(p.type || '').startsWith('attrezzatura') ? 'violet' : 'neutral'}>
                        {(p.type || '').startsWith('attrezzatura') ? 'Attrezzatura' : p.type === 'materiale' ? 'Materiale' : 'Consumabile'}
                      </StatusBadge>
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-muted-foreground">{p.unit || 'pz'}</td>
                  <td className={cn('px-3 py-2.5 tabular-nums font-semibold', p.below_min && 'text-red-600')} data-testid={`central-qty-${p.id}`}>{p.qty}</td>
                  {domain === 'pulizie' && <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{p.min_qty ?? '—'}</td>}
                  {domain === 'pulizie' && (
                    <td className="px-3 py-2.5">
                      {p.below_min ? <StatusBadge tone="danger" testId={`central-low-${p.id}`}>Sotto scorta</StatusBadge>
                        : p.min_qty != null ? <StatusBadge tone="success">Ok</StatusBadge>
                          : <StatusBadge tone="cancelled">No soglia</StatusBadge>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {movOpen && <MovementDialog defaultDomain={domain} lockDomain defaultType="carico"
        defaultOrigin={{ type: 'external', id: null }} defaultDestination={{ type: 'central', id: null }}
        onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(); }} />}
      {invOpen && <InventoryDialog domain={domain} locationType="central" locationId={null}
        items={(rows || []).map(r => ({ product_id: r.id, name: r.name, qty: r.qty }))}
        title="Magazzino Generale"
        onClose={() => setInvOpen(false)} onDone={() => { setInvOpen(false); load(); }} />}
      {anomOpen && <AnomaliaDialog contextLabel="Magazzino Generale" onClose={() => setAnomOpen(false)} />}
      {kitOpen && <KitTransferDialog onClose={() => setKitOpen(false)} onDone={() => { setKitOpen(false); load(); }} />}
    </div>
  );
}

function KitTransferDialog({ onClose, onDone }) {
  const [kits, setKits] = useState([]);
  const [structures, setStructures] = useState([]);
  const [kitId, setKitId] = useState('');
  const [qty, setQty] = useState(1);
  const [structureId, setStructureId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/magazzino/kits', { params: { domain: 'noleggio' } }).then(r => setKits(r.data)).catch(() => {});
    api.get('/structures').then(r => setStructures(r.data)).catch(() => {});
  }, []);

  const kit = kits.find(k => k.id === kitId);

  const save = async () => {
    if (!kitId || !structureId) { toast.error('Seleziona kit e struttura'); return; }
    setSaving(true);
    try {
      const r = await api.post('/magazzino/kit-transfer', { kit_id: kitId, structure_id: structureId, qty: Number(qty) });
      toast.success(`Trasferimento registrato: ${r.data.movements} articoli spostati dal Magazzino Generale`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="kit-transfer-dialog">
        <DialogHeader>
          <DialogTitle>Trasferisci Kit a struttura</DialogTitle>
          <DialogDescription>Un solo trasferimento logico: i componenti del Kit escono dal Magazzino Generale ed entrano nella struttura.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Kit</Label>
            <select value={kitId} onChange={e => setKitId(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-transfer-kit">
              <option value="">Seleziona kit...</option>
              {kits.map(k => <option key={k.id} value={k.id}>{k.name}{(k.items || []).length === 0 ? ' (non configurato)' : ''}</option>)}
            </select>
            {kit && (kit.items || []).length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{kit.items.map(i => `${i.qty}× ${i.name}`).join(', ')}</p>
            )}
          </div>
          <div>
            <Label className="text-xs">Quantità kit</Label>
            <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} data-testid="kit-transfer-qty" />
          </div>
          <div>
            <Label className="text-xs">Struttura di destinazione</Label>
            <select value={structureId} onChange={e => setStructureId(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-transfer-structure">
              <option value="">Seleziona...</option>
              {structures.map(s => <option key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="kit-transfer-save">
              {saving ? 'Trasferimento...' : 'Trasferisci'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
