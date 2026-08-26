import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Plus, Pencil, Trash2, BookOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { ProductThumb } from './ProductThumb';
import { DOMAIN_LABELS, fmtDT } from './shared';

const TABS = [
  ['noleggio', 'Noleggio Strutture'],
  ['forniture', 'Forniture / Consumabili'],
  ['pulizie', 'Magazzino Pulizie'],
  ['kits', 'Kit'],
];
const BED_TYPES = [['', '—'], ['matrimoniale', 'Matrimoniale'], ['singolo', 'Singolo'], ['divano', 'Divano letto']];

export default function CataloghiKitPage() {
  const [tab, setTab] = useState('noleggio');
  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="cataloghi-kit-page">
      <PageHeader title="Cataloghi & Kit" subtitle="Prodotti e composizioni Kit del sistema Magazzino (separati dalla Lavanderia a Noleggio)" />
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium klv-interactive',
              tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            data-testid={`catalog-tab-${k}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'kits' ? <KitsTab /> : <CatalogTab domain={tab} key={tab} />}
    </div>
  );
}

function CatalogTab({ domain }) {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get(`/magazzino/catalog/${domain}`, { params: { include_inactive: true } })
      .then(r => setRows(r.data)).catch(() => setRows([]));
  }, [domain]);
  useEffect(() => { load(); }, [load]);

  const toggleActive = async (p, v) => {
    try {
      await api.put(`/magazzino/catalog/${domain}/${p.id}`, { name: p.name, active: v });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="new-product-btn">
          <Plus className="h-4 w-4 mr-1.5" />Nuovo prodotto
        </Button>
      </div>
      {rows === null ? <ListSkeleton rows={6} /> : rows.length === 0 ? (
        <EmptyState icon={BookOpen} message={`Nessun prodotto nel catalogo ${DOMAIN_LABELS[domain]}.`} />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Prodotto</th>
                <th className="px-3 py-2.5">Categoria</th>
                <th className="px-3 py-2.5">Unità</th>
                {domain === 'pulizie' && <th className="px-3 py-2.5">Tipo</th>}
                {domain === 'pulizie' && <th className="px-3 py-2.5">Ubicazione</th>}
                {domain === 'forniture' && <th className="px-3 py-2.5">Min/Ideale default</th>}
                <th className="px-3 py-2.5">Attivo</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id} className={cn('border-t border-border row-hover', !p.active && 'opacity-50')} data-testid={`product-row-${p.id}`}>
                  <td className="px-3 py-2.5 font-medium">
                    <div className="flex items-center gap-2.5">
                      <ProductThumb photo={p.photo} size="w-9 h-9" testId={`product-thumb-${p.id}`} />
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.category || '—'}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.unit}</td>
                  {domain === 'pulizie' && (
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={p.type === 'attrezzatura' ? 'violet' : 'neutral'}>
                        {p.type === 'attrezzatura' ? 'Attrezzatura' : 'Consumabile'}
                      </StatusBadge>
                    </td>
                  )}
                  {domain === 'pulizie' && <td className="px-3 py-2.5 text-muted-foreground">{p.standard_location === 'zaino' ? 'Zaino' : 'Casa'}</td>}
                  {domain === 'forniture' && <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{p.default_min ?? '—'} / {p.default_ideal ?? '—'}</td>}
                  <td className="px-3 py-2.5">
                    <Switch checked={!!p.active} onCheckedChange={v => toggleActive(p, v)} data-testid={`product-active-${p.id}`} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(p)} data-testid={`product-edit-${p.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(creating || editing) && (
        <ProductDialog domain={domain} product={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onDone={() => { setCreating(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

function ProductDialog({ domain, product, onClose, onDone }) {
  const [form, setForm] = useState({
    name: product?.name || '', category: product?.category || '', unit: product?.unit || 'pz',
    notes: product?.notes || '', type: product?.type || 'consumabile',
    standard_location: product?.standard_location || 'casa', min_qty: product?.min_qty ?? '',
    default_min: product?.default_min ?? '', default_ideal: product?.default_ideal ?? '',
  });
  const [photo, setPhoto] = useState(product?.photo || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post(`/magazzino/catalog/${domain}/${product.id}/photo`, fd);
      setPhoto(r.data.photo);
      toast.success('Foto caricata');
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore caricamento foto'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Inserisci il nome'); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), category: form.category, unit: form.unit, notes: form.notes };
    if (domain === 'pulizie') {
      payload.type = form.type;
      payload.standard_location = form.standard_location;
      if (form.min_qty !== '') payload.min_qty = Number(form.min_qty);
    }
    if (domain === 'forniture') {
      if (form.default_min !== '') payload.default_min = Number(form.default_min);
      if (form.default_ideal !== '') payload.default_ideal = Number(form.default_ideal);
    }
    try {
      if (product) await api.put(`/magazzino/catalog/${domain}/${product.id}`, payload);
      else await api.post(`/magazzino/catalog/${domain}`, payload);
      toast.success(product ? 'Prodotto aggiornato' : 'Prodotto creato');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="product-dialog">
        <DialogHeader>
          <DialogTitle>{product ? 'Modifica prodotto' : 'Nuovo prodotto'} — {DOMAIN_LABELS[domain]}</DialogTitle>
          <DialogDescription>Il catalogo definisce i prodotti; le quantità vivono nei movimenti.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {product && (
            <div className="flex items-center gap-3">
              <ProductThumb photo={photo} size="w-14 h-14" testId="product-photo-preview" />
              <label className="text-sm text-primary cursor-pointer hover:underline">
                {uploading ? 'Caricamento...' : photo ? 'Cambia foto' : 'Aggiungi foto'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => uploadPhoto(e.target.files?.[0])} data-testid="product-photo-input" />
              </label>
            </div>
          )}
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} data-testid="product-name-input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Categoria</Label>
              <Input value={form.category} onChange={e => set('category', e.target.value)} data-testid="product-category-input" />
            </div>
            <div>
              <Label className="text-xs">Unità</Label>
              <Input value={form.unit} onChange={e => set('unit', e.target.value)} data-testid="product-unit-input" />
            </div>
          </div>
          {domain === 'pulizie' && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Tipo</Label>
                <select value={form.type} onChange={e => set('type', e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="product-type-select">
                  <option value="consumabile">Consumabile</option>
                  <option value="attrezzatura">Attrezzatura</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Ubicazione</Label>
                <select value={form.standard_location} onChange={e => set('standard_location', e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="product-location-select">
                  <option value="casa">Casa</option>
                  <option value="zaino">Zaino</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Dotazione min.</Label>
                <Input type="number" min="0" value={form.min_qty} onChange={e => set('min_qty', e.target.value)} data-testid="product-min-input" />
              </div>
            </div>
          )}
          {domain === 'forniture' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Minimo default</Label>
                <Input type="number" min="0" value={form.default_min} onChange={e => set('default_min', e.target.value)} data-testid="product-defmin-input" />
              </div>
              <div>
                <Label className="text-xs">Ideale default</Label>
                <Input type="number" min="0" value={form.default_ideal} onChange={e => set('default_ideal', e.target.value)} data-testid="product-defideal-input" />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs">Note</Label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} data-testid="product-notes-input" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="product-save-btn">
              {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KitsTab() {
  const [kits, setKits] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get('/magazzino/kits').then(r => setKits(r.data)).catch(() => setKits([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="new-kit-btn">
          <Plus className="h-4 w-4 mr-1.5" />Nuovo kit
        </Button>
      </div>
      {kits === null ? <ListSkeleton rows={4} /> : kits.length === 0 ? (
        <EmptyState icon={BookOpen} message="Nessun kit definito." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {kits.map(k => (
            <div key={k.id} className="rounded-xl border border-border bg-card p-4 space-y-2 card-hover cursor-pointer"
              onClick={() => setEditing(k)} data-testid={`kit-card-${k.id}`}>
              <div className="flex items-center gap-2">
                <p className="font-semibold flex-1 truncate">{k.name}</p>
                <span className="text-xs text-muted-foreground font-mono">v{k.version || 1}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <StatusBadge tone="accent">{DOMAIN_LABELS[k.domain] || k.domain}</StatusBadge>
                {k.bed_type && <StatusBadge tone="violet">{BED_TYPES.find(([v]) => v === k.bed_type)?.[1] || k.bed_type}</StatusBadge>}
                {(k.items || []).length === 0
                  ? <StatusBadge tone="waiting" testId={`kit-unconfigured-${k.id}`}>Kit non configurato</StatusBadge>
                  : <StatusBadge tone="success">{k.items.length} articoli</StatusBadge>}
                {!k.active && <StatusBadge tone="cancelled">Disattivato</StatusBadge>}
              </div>
              {(k.items || []).length > 0 && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {k.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {(creating || editing) && (
        <KitDialog kit={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onDone={() => { setCreating(false); setEditing(null); load(); }} />
      )}
    </div>
  );
}

function KitDialog({ kit, onClose, onDone }) {
  const [name, setName] = useState(kit?.name || '');
  const [domain, setDomain] = useState(kit?.domain || 'noleggio');
  const [bedType, setBedType] = useState(kit?.bed_type || '');
  const [notes, setNotes] = useState(kit?.notes || '');
  const [active, setActive] = useState(kit ? !!kit.active : true);
  const [items, setItems] = useState(kit?.items ? kit.items.map(i => ({ ...i })) : []);
  const [catalog, setCatalog] = useState([]);
  const [addId, setAddId] = useState('');
  const [versions, setVersions] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/magazzino/catalog/${domain}`).then(r => setCatalog(r.data)).catch(() => setCatalog([]));
  }, [domain]);

  const addItem = () => {
    const p = catalog.find(c => c.id === addId);
    if (!p || items.some(i => i.product_id === p.id)) return;
    setItems(xs => [...xs, { product_id: p.id, name: p.name, qty: 1 }]);
    setAddId('');
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Inserisci il nome'); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), domain, bed_type: bedType || null, notes, active,
      items: items.map(i => ({ product_id: i.product_id, name: i.name, qty: Number(i.qty) })).filter(i => i.qty > 0),
    };
    try {
      if (kit) await api.put(`/magazzino/kits/${kit.id}`, payload);
      else await api.post('/magazzino/kits', payload);
      toast.success(kit ? 'Kit aggiornato (nuova versione)' : 'Kit creato');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const loadVersions = () => {
    api.get(`/magazzino/kits/${kit.id}/versions`).then(r => setVersions(r.data)).catch(() => setVersions([]));
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="kit-dialog">
        <DialogHeader>
          <DialogTitle>{kit ? `Modifica kit — ${kit.name}` : 'Nuovo kit'}</DialogTitle>
          <DialogDescription>Ogni salvataggio crea una nuova versione; lo storico resta invariato.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} data-testid="kit-name-input" />
            </div>
            <div>
              <Label className="text-xs">Magazzino</Label>
              <select value={domain} disabled={!!kit}
                onChange={e => { setDomain(e.target.value); setItems([]); }}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60" data-testid="kit-domain-select">
                {Object.entries(DOMAIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          {domain === 'noleggio' && (
            <div>
              <Label className="text-xs">Tipo letto (per il calcolo del fabbisogno)</Label>
              <select value={bedType} onChange={e => setBedType(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-bedtype-select">
                {BED_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Composizione</Label>
            {items.length === 0 && (
              <p className="text-sm text-amber-600 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2" data-testid="kit-empty-warning">
                Kit non configurato: finché la composizione è vuota il fabbisogno non viene calcolato.
              </p>
            )}
            {items.map((it, i) => (
              <div key={it.product_id} className="flex items-center gap-2 text-sm" data-testid={`kit-item-${it.product_id}`}>
                <span className="flex-1 min-w-0 truncate">{it.name}</span>
                <Input type="number" min="1" value={it.qty} className="w-20 h-8 text-sm"
                  onChange={e => setItems(xs => xs.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                  data-testid={`kit-qty-${it.product_id}`} />
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground"
                  onClick={() => setItems(xs => xs.filter((_, j) => j !== i))} data-testid={`kit-remove-${it.product_id}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <select value={addId} onChange={e => setAddId(e.target.value)}
                className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-add-select">
                <option value="">Aggiungi articolo...</option>
                {catalog.filter(c => !items.some(i => i.product_id === c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button size="sm" variant="outline" className="h-9" onClick={addItem} disabled={!addId} data-testid="kit-add-btn">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">Note</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} data-testid="kit-notes-input" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} data-testid="kit-active-switch" />
            <span className="text-sm">Kit attivo</span>
          </div>

          {kit && (
            <div className="space-y-1">
              {versions === null ? (
                <button onClick={loadVersions} className="text-xs text-primary hover:underline" data-testid="kit-versions-btn">
                  Mostra storico versioni
                </button>
              ) : versions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessuna versione precedente.</p>
              ) : (
                <div className="rounded-lg border border-border divide-y divide-border/60">
                  {versions.map(v => (
                    <div key={v.id} className="px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-2">
                      <span className="font-mono font-semibold">v{v.version}</span>
                      <span className="flex-1">{(v.snapshot?.items || []).map(i => `${i.qty}× ${i.name}`).join(', ') || 'vuoto'}</span>
                      <span>{fmtDT(v.saved_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="kit-save-btn">
              {saving ? 'Salvataggio...' : 'Salva kit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
