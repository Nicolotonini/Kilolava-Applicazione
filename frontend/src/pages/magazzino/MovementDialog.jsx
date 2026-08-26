import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { MOVEMENT_TYPE_LABELS, DOMAIN_LABELS } from './shared';

const LOC_TYPES = [
  ['external', 'Esterno'],
  ['central', 'Magazzino Pulizie (centrale)'],
  ['structure', 'Struttura'],
  ['zaino', 'Zaino'],
];

function LocPicker({ label, value, onChange, structures, zaini, testId }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">{label}</Label>
        <select value={value.type} onChange={e => onChange({ type: e.target.value, id: null })}
          className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid={`${testId}-type`}>
          {LOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {value.type === 'structure' && (
        <div>
          <Label className="text-xs">Struttura</Label>
          <select value={value.id || ''} onChange={e => onChange({ ...value, id: e.target.value })}
            className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid={`${testId}-structure`}>
            <option value="">Seleziona...</option>
            {structures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {value.type === 'zaino' && (
        <div>
          <Label className="text-xs">Zaino</Label>
          <select value={value.id || ''} onChange={e => onChange({ ...value, id: e.target.value })}
            className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid={`${testId}-zaino`}>
            <option value="">Seleziona...</option>
            {zaini.map(z => <option key={z.id} value={z.id}>{z.code}{z.assigned_to_name ? ` — ${z.assigned_to_name}` : ''}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

export function MovementDialog({ defaultDomain = 'pulizie', lockDomain, defaultType = 'carico',
  defaultOrigin, defaultDestination, onClose, onDone }) {
  const [domain, setDomain] = useState(defaultDomain);
  const [type, setType] = useState(defaultType);
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [origin, setOrigin] = useState(defaultOrigin || { type: 'external', id: null });
  const [destination, setDestination] = useState(defaultDestination || { type: domain === 'pulizie' ? 'central' : 'structure', id: null });
  const [products, setProducts] = useState([]);
  const [structures, setStructures] = useState([]);
  const [zaini, setZaini] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/magazzino/catalog/${domain}`).then(r => setProducts(r.data)).catch(() => {});
  }, [domain]);
  useEffect(() => {
    api.get('/structures').then(r => setStructures(r.data)).catch(() => {});
    api.get('/magazzino/zaini').then(r => setZaini(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    if (!productId) { toast.error('Seleziona un prodotto'); return; }
    if ((origin.type === 'structure' || origin.type === 'zaino') && !origin.id) { toast.error('Seleziona origine'); return; }
    if ((destination.type === 'structure' || destination.type === 'zaino') && !destination.id) { toast.error('Seleziona destinazione'); return; }
    setSaving(true);
    try {
      await api.post('/magazzino/movimenti', {
        domain, movement_type: type, product_id: productId, qty: Number(qty),
        origin, destination, note: note || null,
      });
      toast.success('Movimento registrato');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="movement-dialog">
        <DialogHeader>
          <DialogTitle>Nuovo movimento</DialogTitle>
          <DialogDescription>Ogni cambio quantità viene registrato nello storico.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!lockDomain && (
            <div>
              <Label className="text-xs">Magazzino</Label>
              <select value={domain} onChange={e => { setDomain(e.target.value); setProductId(''); }}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="mov-domain">
                {Object.entries(DOMAIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs">Tipo movimento</Label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="mov-type">
              {Object.entries(MOVEMENT_TYPE_LABELS).filter(([k]) => k !== 'annullamento').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Prodotto</Label>
              <select value={productId} onChange={e => setProductId(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="mov-product">
                <option value="">Seleziona...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Quantità</Label>
              <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} data-testid="mov-qty" />
            </div>
          </div>
          <LocPicker label="Origine" value={origin} onChange={setOrigin} structures={structures} zaini={zaini} testId="mov-origin" />
          <LocPicker label="Destinazione" value={destination} onChange={setDestination} structures={structures} zaini={zaini} testId="mov-destination" />
          <div>
            <Label className="text-xs">Nota</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} data-testid="mov-note" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="mov-save-btn">
              {saving ? 'Salvataggio...' : 'Registra movimento'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function InventoryDialog({ domain, locationType, locationId, items, title, onClose, onDone }) {
  const [counts, setCounts] = useState(items.map(i => ({ product_id: i.product_id, name: i.name, system: i.qty ?? i.present ?? 0, counted: i.qty ?? i.present ?? 0 })));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.post('/magazzino/inventario', {
        domain, location_type: locationType, location_id: locationId,
        counts: counts.map(c => ({ product_id: c.product_id, counted: Number(c.counted) })),
      });
      const n = r.data.adjustments?.length || 0;
      toast.success(n > 0 ? `Inventario registrato: ${n} rettifiche` : 'Inventario registrato: nessuna differenza');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="inventory-dialog">
        <DialogHeader>
          <DialogTitle>Fai inventario{title ? ` — ${title}` : ''}</DialogTitle>
          <DialogDescription>Le differenze generano movimenti di Rettifica Inventario.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {counts.map((c, i) => (
            <div key={c.product_id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground w-16 text-right">sistema {c.system}</span>
              <Input type="number" min="0" value={c.counted} className="w-20 h-8 text-sm"
                onChange={e => setCounts(cs => cs.map((x, j) => j === i ? { ...x, counted: e.target.value } : x))}
                data-testid={`inv-count-${c.product_id}`} />
            </div>
          ))}
          {counts.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nessun articolo da contare.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving || counts.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="inv-save-btn">
              {saving ? 'Salvataggio...' : 'Conferma inventario'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
