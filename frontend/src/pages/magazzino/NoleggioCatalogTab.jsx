import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Plus, BookOpen, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { ProductThumb } from './ProductThumb';

const CATEGORIES = ['Biancheria letto', 'Biancheria bagno', 'Tovagliato'];
const euro = (v) => (v === null || v === undefined || v === '' ? '—' : `${Number(v).toFixed(2)} €`);

export const NoleggioCatalogTab = () => {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [fCat, setFCat] = useState('');
  const [fTip, setFTip] = useState('');
  const [fLinea, setFLinea] = useState('');
  const [fStato, setFStato] = useState('');

  const load = useCallback(() => {
    api.get('/magazzino/catalog/noleggio', { params: { include_inactive: true } })
      .then(r => setRows(r.data)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const tipologie = useMemo(() => [...new Set((rows || []).map(p => p.tipologia).filter(Boolean))], [rows]);
  const linee = useMemo(() => [...new Set((rows || []).map(p => p.linea).filter(Boolean))], [rows]);

  const filtered = useMemo(() => (rows || []).filter(p => {
    if (fCat && p.category !== fCat) return false;
    if (fTip && p.tipologia !== fTip) return false;
    if (fLinea && p.linea !== fLinea) return false;
    if (fStato === 'attivi' && !p.active) return false;
    if (fStato === 'inattivi' && p.active) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(p.name || '').toLowerCase().includes(s) && !(p.code || '').toLowerCase().includes(s)) return false;
    }
    return true;
  }), [rows, fCat, fTip, fLinea, fStato, search]);

  const toggleActive = async (p, v) => {
    try {
      await api.put(`/magazzino/catalog/noleggio/${p.id}`, { name: p.name, active: v });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const selectCls = 'h-9 rounded-md border border-border bg-background px-2 text-sm';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca nome o codice..."
            className="pl-8 h-9 w-56" data-testid="nol-search-input" />
        </div>
        <select value={fCat} onChange={e => setFCat(e.target.value)} className={selectCls} data-testid="nol-filter-categoria">
          <option value="">Tutte le categorie</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fTip} onChange={e => setFTip(e.target.value)} className={selectCls} data-testid="nol-filter-tipologia">
          <option value="">Tutte le tipologie</option>
          {tipologie.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fLinea} onChange={e => setFLinea(e.target.value)} className={selectCls} data-testid="nol-filter-linea">
          <option value="">Tutte le linee</option>
          {linee.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={fStato} onChange={e => setFStato(e.target.value)} className={selectCls} data-testid="nol-filter-stato">
          <option value="">Tutti</option>
          <option value="attivi">Attivi</option>
          <option value="inattivi">Non attivi</option>
        </select>
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="nol-new-product-btn">
          <Plus className="h-4 w-4 mr-1.5" />Nuovo articolo
        </Button>
      </div>

      {rows === null ? <ListSkeleton rows={8} /> : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} message="Nessun articolo trovato nel catalogo Noleggio." />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]" data-testid="nol-catalog-table">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Codice</th>
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">Categoria</th>
                <th className="px-3 py-2.5">Tipologia</th>
                <th className="px-3 py-2.5">Linea</th>
                <th className="px-3 py-2.5">Materiale</th>
                <th className="px-3 py-2.5">UM</th>
                <th className="px-3 py-2.5 text-right">Costo</th>
                <th className="px-3 py-2.5 text-right">Prezzo std</th>
                <th className="px-3 py-2.5">Stato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const newGroup = i === 0 || filtered[i - 1].category !== p.category;
                return (
                  <React.Fragment key={p.id}>
                    {newGroup && !fCat && (
                      <tr className="bg-muted/25">
                        <td colSpan={10} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {p.category || 'Altro'}
                        </td>
                      </tr>
                    )}
                    <tr className={cn('border-t border-border row-hover cursor-pointer', !p.active && 'opacity-50')}
                      onClick={() => setEditing(p)} data-testid={`nol-row-${p.code || p.id}`}>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">{p.code || '—'}</td>
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          <ProductThumb photo={p.photo} size="w-7 h-7" testId={`nol-thumb-${p.id}`} />
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{p.category || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.tipologia || '—'}</td>
                      <td className="px-3 py-2">{p.linea ? <StatusBadge tone={p.linea === 'Dream' ? 'violet' : 'accent'}>{p.linea}</StatusBadge> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.materiale || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{euro(p.cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{euro(p.prezzo_standard)}</td>
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <Switch checked={!!p.active} onCheckedChange={v => toggleActive(p, v)} data-testid={`nol-active-${p.code || p.id}`} />
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <NoleggioProductDialog product={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onDone={() => { setCreating(false); setEditing(null); load(); }} />
      )}
    </div>
  );
};

function NoleggioProductDialog({ product, onClose, onDone }) {
  const [form, setForm] = useState({
    name: product?.name || '', category: product?.category || CATEGORIES[0],
    tipologia: product?.tipologia || '', misura: product?.misura || '',
    linea: product?.linea || '', colore: product?.colore || '',
    materiale: product?.materiale || 'Cotone', unit: product?.unit || 'pz',
    cost: product?.cost ?? '', prezzo_standard: product?.prezzo_standard ?? '',
    ordine: product?.ordine ?? '', notes: product?.notes || '',
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
      const r = await api.post(`/magazzino/catalog/noleggio/${product.id}/photo`, fd);
      setPhoto(r.data.photo);
      toast.success('Foto caricata');
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore caricamento foto'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Inserisci il nome'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(), category: form.category, unit: form.unit || 'pz', notes: form.notes,
      tipologia: form.tipologia, misura: form.misura, linea: form.linea, colore: form.colore,
      materiale: form.materiale || 'Cotone',
    };
    if (form.cost !== '' && form.cost !== null) payload.cost = Number(form.cost);
    if (form.prezzo_standard !== '' && form.prezzo_standard !== null) payload.prezzo_standard = Number(form.prezzo_standard);
    if (form.ordine !== '' && form.ordine !== null) payload.ordine = Number(form.ordine);
    try {
      if (product) await api.put(`/magazzino/catalog/noleggio/${product.id}`, payload);
      else await api.post('/magazzino/catalog/noleggio', payload);
      toast.success(product ? 'Articolo aggiornato' : 'Articolo creato (codice NOL assegnato automaticamente)');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="nol-product-dialog">
        <DialogHeader>
          <DialogTitle>
            {product ? (
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm text-primary" data-testid="nol-dialog-code">{product.code}</span>
                {product.name}
              </span>
            ) : 'Nuovo articolo Noleggio'}
          </DialogTitle>
          <DialogDescription>
            {product ? 'Il codice è permanente e non cambia mai.' : 'Il prossimo codice NOL viene assegnato automaticamente.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {product && (
            <div className="flex items-center gap-3">
              <ProductThumb photo={photo} size="w-14 h-14" testId="nol-photo-preview" />
              <label className="text-sm text-primary cursor-pointer hover:underline">
                {uploading ? 'Caricamento...' : photo ? 'Cambia foto' : 'Aggiungi foto'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => uploadPhoto(e.target.files?.[0])} data-testid="nol-photo-input" />
              </label>
            </div>
          )}
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} data-testid="nol-name-input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Categoria</Label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="nol-category-select">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Tipologia</Label>
              <Input value={form.tipologia} onChange={e => set('tipologia', e.target.value)} placeholder="es. Coprimacchia" data-testid="nol-tipologia-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Misura / Tipo</Label>
              <Input value={form.misura} onChange={e => set('misura', e.target.value)} placeholder="es. 120x120" data-testid="nol-misura-input" />
            </div>
            <div>
              <Label className="text-xs">Linea / Variante</Label>
              <Input value={form.linea} onChange={e => set('linea', e.target.value)} list="nol-linee" placeholder="es. Living / Dream" data-testid="nol-linea-input" />
              <datalist id="nol-linee"><option value="Living" /><option value="Dream" /></datalist>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Colore</Label>
              <Input value={form.colore} onChange={e => set('colore', e.target.value)} data-testid="nol-colore-input" />
            </div>
            <div>
              <Label className="text-xs">Materiale</Label>
              <Input value={form.materiale} onChange={e => set('materiale', e.target.value)} data-testid="nol-materiale-input" />
            </div>
            <div>
              <Label className="text-xs">Unità di misura</Label>
              <Input value={form.unit} onChange={e => set('unit', e.target.value)} data-testid="nol-um-input" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Costo Kilolava (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} data-testid="nol-cost-input" />
            </div>
            <div>
              <Label className="text-xs">Prezzo standard (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.prezzo_standard} onChange={e => set('prezzo_standard', e.target.value)} data-testid="nol-prezzo-input" />
            </div>
            <div>
              <Label className="text-xs">Ordine visualizzazione</Label>
              <Input type="number" min="0" value={form.ordine} onChange={e => set('ordine', e.target.value)} data-testid="nol-ordine-input" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} data-testid="nol-notes-input" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="nol-save-btn">
              {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NoleggioCatalogTab;
