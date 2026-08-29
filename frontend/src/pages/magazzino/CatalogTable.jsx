import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Plus, BookOpen, Search, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { ProductThumb } from './ProductThumb';

export const NOL_CATEGORIES = ['Biancheria letto', 'Biancheria bagno', 'Tovagliato'];
export const TYPE_LABELS = {
  attrezzatura_durevole: 'Attrezzatura durevole',
  consumabile: 'Consumabile',
  materiale: 'Materiale',
  attrezzatura: 'Attrezzatura',
};
const euro = (v) => (v === null || v === undefined || v === '' ? '—' : `${Number(v).toFixed(2)} €`);

export const CatalogTable = ({ domain }) => {
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [usedInfo, setUsedInfo] = useState(null);
  const [search, setSearch] = useState('');
  const [fCat, setFCat] = useState('');
  const [fTip, setFTip] = useState('');
  const [fStato, setFStato] = useState('');

  const load = useCallback(() => {
    api.get(`/magazzino/catalog/${domain}`, { params: { include_inactive: true } })
      .then(r => setRows(r.data)).catch(() => setRows([]));
  }, [domain]);
  useEffect(() => { load(); }, [load]);

  const tipValue = (p) => (domain === 'pulizie' ? (TYPE_LABELS[p.type] || p.type || '') : (p.tipologia || ''));
  const categorie = useMemo(() => [...new Set((rows || []).map(p => p.category).filter(Boolean))], [rows]);
  const tipologie = useMemo(() => [...new Set((rows || []).map(tipValue).filter(Boolean))], [rows, domain]); // eslint-disable-line

  const filtered = useMemo(() => (rows || []).filter(p => {
    if (fCat && p.category !== fCat) return false;
    if (fTip && tipValue(p) !== fTip) return false;
    if (fStato === 'attivi' && !p.active) return false;
    if (fStato === 'inattivi' && p.active) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(p.name || '').toLowerCase().includes(s) && !(p.code || '').toLowerCase().includes(s)) return false;
    }
    return true;
  }), [rows, fCat, fTip, fStato, search, domain]); // eslint-disable-line

  const toggleActive = async (p, v) => {
    try {
      await api.put(`/magazzino/catalog/${domain}/${p.id}`, { name: p.name, active: v });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const doDelete = async () => {
    const p = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.delete(`/magazzino/catalog/${domain}/${p.id}`);
      toast.success(`Articolo ${p.code || p.name} eliminato definitivamente`);
      load();
    } catch (e) {
      if (e.response?.status === 409) setUsedInfo({ product: p, message: e.response.data.detail });
      else toast.error(e.response?.data?.detail || 'Errore');
    }
  };

  const deactivateUsed = async () => {
    const p = usedInfo.product;
    setUsedInfo(null);
    await toggleActive(p, false);
    toast.success(`Articolo ${p.code || p.name} disattivato: storico preservato`);
  };

  const selectCls = 'h-9 rounded-md border border-border bg-background px-2 text-sm';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca nome o codice..."
            className="pl-8 h-9 w-56" data-testid="cat-search-input" />
        </div>
        <select value={fCat} onChange={e => setFCat(e.target.value)} className={selectCls} data-testid="cat-filter-categoria">
          <option value="">Tutte le categorie</option>
          {(domain === 'noleggio' ? NOL_CATEGORIES : categorie).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={fTip} onChange={e => setFTip(e.target.value)} className={selectCls} data-testid="cat-filter-tipologia">
          <option value="">{domain === 'pulizie' ? 'Tutti i tipi' : 'Tutte le tipologie'}</option>
          {tipologie.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={fStato} onChange={e => setFStato(e.target.value)} className={selectCls} data-testid="cat-filter-stato">
          <option value="">Tutti</option>
          <option value="attivi">Attivi</option>
          <option value="inattivi">Non attivi</option>
        </select>
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="cat-new-product-btn">
          <Plus className="h-4 w-4 mr-1.5" />Nuovo articolo
        </Button>
      </div>

      {rows === null ? <ListSkeleton rows={8} /> : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} message="Nessun articolo trovato in questo catalogo." />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]" data-testid={`catalog-table-${domain}`}>
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Codice</th>
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">Categoria</th>
                <th className="px-3 py-2.5">{domain === 'pulizie' ? 'Tipo' : 'Tipologia'}</th>
                <th className="px-3 py-2.5">UM</th>
                <th className="px-3 py-2.5 text-right">Costo</th>
                <th className="px-3 py-2.5 text-right">Prezzo std</th>
                <th className="px-3 py-2.5">Stato</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => {
                const newGroup = !fCat && p.category && (i === 0 || filtered[i - 1].category !== p.category);
                return (
                  <React.Fragment key={p.id}>
                    {newGroup && (
                      <tr className="bg-muted/25" data-group-header="true">
                        <td colSpan={9} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {p.category}
                        </td>
                      </tr>
                    )}
                    <tr className={cn('border-t border-border row-hover cursor-pointer', !p.active && 'opacity-50')}
                      onClick={() => setEditing(p)} data-testid={`cat-row-${p.code || p.id}`}>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold">{p.code || '—'}</td>
                      <td className="px-3 py-2.5 font-medium">
                        <div className="flex items-center gap-2.5">
                          <ProductThumb photo={p.photo} size="w-9 h-9" testId={`cat-thumb-${p.id}`} />
                          <span>{p.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{p.category || '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{tipValue(p) || '—'}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{p.unit}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{euro(p.cost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{euro(p.prezzo_standard)}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <Switch checked={!!p.active} onCheckedChange={v => toggleActive(p, v)} data-testid={`cat-active-${p.code || p.id}`} />
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                          onClick={() => setConfirmDelete(p)} title="Cancella" data-testid={`cat-delete-${p.code || p.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
        <ProductDialog domain={domain} product={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onDone={() => { setCreating(false); setEditing(null); load(); }} />
      )}

      {confirmDelete && (
        <Dialog open onOpenChange={v => !v && setConfirmDelete(null)}>
          <DialogContent className="max-w-sm" data-testid="cat-delete-confirm-dialog">
            <DialogHeader>
              <DialogTitle>Eliminare definitivamente questo articolo?</DialogTitle>
              <DialogDescription>
                {confirmDelete.code} — {confirmDelete.name}. Questa azione non può essere annullata.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(null)} data-testid="cat-delete-cancel-btn">Annulla</Button>
              <Button onClick={doDelete} className="bg-red-600 hover:bg-red-700 text-white" data-testid="cat-delete-confirm-btn">Elimina</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {usedInfo && (
        <Dialog open onOpenChange={v => !v && setUsedInfo(null)}>
          <DialogContent className="max-w-md" data-testid="cat-used-dialog">
            <DialogHeader>
              <DialogTitle>Articolo già utilizzato</DialogTitle>
              <DialogDescription>{usedInfo.message}</DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setUsedInfo(null)} data-testid="cat-used-cancel-btn">Annulla</Button>
              <Button variant="outline" onClick={deactivateUsed} data-testid="cat-used-deactivate-btn">Disattiva articolo</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

function ProductDialog({ domain, product, onClose, onDone }) {
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || (domain === 'noleggio' ? NOL_CATEGORIES[0] : ''),
    tipologia: product?.tipologia || '',
    type: product?.type || 'consumabile',
    formato: product?.formato || '',
    misura: product?.misura || '', linea: product?.linea || '', colore: product?.colore || '',
    materiale: product?.materiale || 'Cotone',
    unit: product?.unit || 'pz',
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
      const r = await api.post(`/magazzino/catalog/${domain}/${product.id}/photo`, fd);
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
      tipologia: form.tipologia,
    };
    if (domain === 'pulizie') payload.type = form.type;
    if (domain === 'noleggio') {
      payload.misura = form.misura; payload.linea = form.linea;
      payload.colore = form.colore; payload.materiale = form.materiale || 'Cotone';
    } else {
      payload.formato = form.formato;
    }
    if (form.cost !== '' && form.cost !== null) payload.cost = Number(form.cost);
    if (form.prezzo_standard !== '' && form.prezzo_standard !== null) payload.prezzo_standard = Number(form.prezzo_standard);
    if (form.ordine !== '' && form.ordine !== null) payload.ordine = Number(form.ordine);
    try {
      if (product) await api.put(`/magazzino/catalog/${domain}/${product.id}`, payload);
      else await api.post(`/magazzino/catalog/${domain}`, payload);
      toast.success(product ? 'Articolo aggiornato' : 'Articolo creato (codice assegnato automaticamente)');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const selectCls = 'w-full h-9 rounded-md border border-border bg-background px-2 text-sm';

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="cat-product-dialog">
        <DialogHeader>
          <DialogTitle>
            {product ? (
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm text-primary" data-testid="cat-dialog-code">{product.code}</span>
                {product.name}
              </span>
            ) : 'Nuovo articolo'}
          </DialogTitle>
          <DialogDescription>
            {product ? 'Il codice è permanente e non cambia mai.' : 'Il prossimo codice progressivo viene assegnato automaticamente.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {product && (
            <div className="flex items-center gap-3">
              <ProductThumb photo={photo} size="w-14 h-14" testId="cat-photo-preview" />
              <label className="text-sm text-primary cursor-pointer hover:underline">
                {uploading ? 'Caricamento...' : photo ? 'Cambia foto' : 'Aggiungi foto'}
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => uploadPhoto(e.target.files?.[0])} data-testid="cat-photo-input" />
              </label>
            </div>
          )}
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} data-testid="cat-name-input" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Categoria</Label>
              {domain === 'noleggio' ? (
                <select value={form.category} onChange={e => set('category', e.target.value)} className={selectCls} data-testid="cat-category-select">
                  {NOL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="es. Bagno" data-testid="cat-category-input" />
              )}
            </div>
            <div>
              {domain === 'pulizie' ? (
                <>
                  <Label className="text-xs">Tipo</Label>
                  <select value={form.type} onChange={e => set('type', e.target.value)} className={selectCls} data-testid="cat-type-select">
                    <option value="attrezzatura_durevole">Attrezzatura durevole</option>
                    <option value="consumabile">Consumabile</option>
                    <option value="materiale">Materiale</option>
                  </select>
                </>
              ) : (
                <>
                  <Label className="text-xs">Tipologia</Label>
                  <Input value={form.tipologia} onChange={e => set('tipologia', e.target.value)} data-testid="cat-tipologia-input" />
                </>
              )}
            </div>
          </div>
          {domain === 'noleggio' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Misura / Tipo</Label>
                  <Input value={form.misura} onChange={e => set('misura', e.target.value)} placeholder="es. 120x120" data-testid="cat-misura-input" />
                </div>
                <div>
                  <Label className="text-xs">Linea / Variante</Label>
                  <Input value={form.linea} onChange={e => set('linea', e.target.value)} list="cat-linee" placeholder="es. Living / Dream" data-testid="cat-linea-input" />
                  <datalist id="cat-linee"><option value="Living" /><option value="Dream" /></datalist>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Colore</Label>
                  <Input value={form.colore} onChange={e => set('colore', e.target.value)} data-testid="cat-colore-input" />
                </div>
                <div>
                  <Label className="text-xs">Materiale</Label>
                  <Input value={form.materiale} onChange={e => set('materiale', e.target.value)} data-testid="cat-materiale-input" />
                </div>
                <div>
                  <Label className="text-xs">Unità di misura</Label>
                  <Input value={form.unit} onChange={e => set('unit', e.target.value)} data-testid="cat-um-input" />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Formato / Variante</Label>
                <Input value={form.formato} onChange={e => set('formato', e.target.value)} data-testid="cat-formato-input" />
              </div>
              <div>
                <Label className="text-xs">Unità di misura</Label>
                <Input value={form.unit} onChange={e => set('unit', e.target.value)} data-testid="cat-um-input" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Costo Kilolava (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.cost} onChange={e => set('cost', e.target.value)} data-testid="cat-cost-input" />
            </div>
            <div>
              <Label className="text-xs">Prezzo standard (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.prezzo_standard} onChange={e => set('prezzo_standard', e.target.value)} data-testid="cat-prezzo-input" />
            </div>
            <div>
              <Label className="text-xs">Ordine visualizzazione</Label>
              <Input type="number" min="0" value={form.ordine} onChange={e => set('ordine', e.target.value)} data-testid="cat-ordine-input" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Input value={form.notes} onChange={e => set('notes', e.target.value)} data-testid="cat-notes-input" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="cat-save-btn">
              {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CatalogTable;
