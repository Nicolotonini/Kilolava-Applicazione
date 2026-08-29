import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Plus, Boxes, Trash2, Pencil } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { DOMAIN_LABELS, fmtDT } from './shared';

const BED_LABELS = { matrimoniale: 'Matrimoniale', singolo: 'Singolo', divano: 'Divano letto' };
const STAG_LABELS = { estivo: 'Estivo', invernale: 'Invernale' };

export default function KitPage() {
  const [kits, setKits] = useState(null);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [fTipo, setFTipo] = useState('');

  const load = useCallback(() => {
    api.get('/magazzino/kits').then(r => setKits(r.data)).catch(() => setKits([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = (kits || [])
    .filter(k => !fTipo || k.domain === fTipo)
    .sort((a, b) => (a.code || 'zzz').localeCompare(b.code || 'zzz') || a.name.localeCompare(b.name));

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="kit-page">
      <PageHeader title="Kit" subtitle="Composizioni versionate: le modifiche non toccano mai lo storico" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={fTipo} onChange={e => setFTipo(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="kit-filter-tipo">
          <option value="">Tutti i tipi</option>
          {Object.entries(DOMAIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="flex-1" />
        <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="new-kit-btn">
          <Plus className="h-4 w-4 mr-1.5" />Nuovo Kit
        </Button>
      </div>

      {kits === null ? <ListSkeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState icon={Boxes} message="Nessun kit definito." />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]" data-testid="kit-table">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Codice Kit</th>
                <th className="px-3 py-2.5">Nome Kit</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Versione</th>
                <th className="px-3 py-2.5">Articoli</th>
                <th className="px-3 py-2.5">Stato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(k => (
                <tr key={k.id} className={cn('border-t border-border row-hover cursor-pointer', !k.active && 'opacity-50')}
                  onClick={() => setSelected(k)} data-testid={`kit-row-${k.code || k.id}`}>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold">{k.code || '—'}</td>
                  <td className="px-3 py-2.5 font-medium">{k.name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{DOMAIN_LABELS[k.domain] || k.domain}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">v{k.version || 1}</td>
                  <td className="px-3 py-2.5 tabular-nums">{(k.items || []).length}</td>
                  <td className="px-3 py-2.5">
                    {k.active
                      ? <span className="text-muted-foreground">Attivo</span>
                      : <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Disattivato</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <KitDetailDialog kit={selected}
          onClose={() => setSelected(null)}
          onDone={() => { setSelected(null); load(); }} />
      )}
      {creating && (
        <KitEditDialog kit={null}
          onClose={() => setCreating(false)}
          onDone={() => { setCreating(false); load(); }} />
      )}
    </div>
  );
}

function KitDetailDialog({ kit, onClose, onDone }) {
  const [editMode, setEditMode] = useState(false);
  if (editMode) return <KitEditDialog kit={kit} onClose={() => setEditMode(false)} onDone={onDone} />;

  const infoParts = [
    DOMAIN_LABELS[kit.domain] || kit.domain,
    kit.linea && `Linea ${kit.linea}`,
    kit.bed_type && BED_LABELS[kit.bed_type],
    kit.stagione && STAG_LABELS[kit.stagione],
    `v${kit.version || 1}`,
    !kit.active && 'Disattivato',
  ].filter(Boolean);

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="kit-detail-dialog">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              {kit.code && <span className="font-mono text-sm text-primary">{kit.code}</span>}
              {kit.name}
            </span>
          </DialogTitle>
          <DialogDescription>{infoParts.join(' · ')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Composizione</p>
            {(kit.items || []).length === 0 ? (
              <p className="text-sm text-amber-600" data-testid="kit-detail-empty">Kit non configurato: composizione vuota.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm" data-testid="kit-composition-table">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Articolo</th>
                      <th className="px-3 py-2">Codice</th>
                      <th className="px-3 py-2 text-right">Quantità</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kit.items.map(it => (
                      <tr key={it.product_id} className="border-t border-border/60">
                        <td className="px-3 py-1.5">{it.name}</td>
                        <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{it.code || '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{it.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {kit.notes && <p className="text-sm text-muted-foreground">Note: {kit.notes}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} data-testid="kit-detail-close-btn">Chiudi</Button>
            <Button variant="outline" onClick={() => setEditMode(true)} data-testid="kit-detail-edit-btn">
              <Pencil className="h-3.5 w-3.5 mr-1.5" />Modifica
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KitEditDialog({ kit, onClose, onDone }) {
  const [name, setName] = useState(kit?.name || '');
  const [domain, setDomain] = useState(kit?.domain || 'noleggio');
  const [bedType, setBedType] = useState(kit?.bed_type || '');
  const [linea, setLinea] = useState(kit?.linea || '');
  const [stagione, setStagione] = useState(kit?.stagione || '');
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
    setItems(xs => [...xs, { product_id: p.id, code: p.code || null, name: p.name, qty: 1 }]);
    setAddId('');
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Inserisci il nome'); return; }
    setSaving(true);
    const payload = {
      name: name.trim(), domain, bed_type: bedType || null,
      linea: linea || null, stagione: stagione || null, notes, active,
      items: items.map(i => ({ product_id: i.product_id, code: i.code || null, name: i.name, qty: Number(i.qty) })).filter(i => i.qty > 0),
    };
    try {
      if (kit) await api.put(`/magazzino/kits/${kit.id}`, payload);
      else await api.post('/magazzino/kits', payload);
      toast.success(kit ? 'Kit aggiornato' : 'Kit creato (codice assegnato automaticamente)');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const loadVersions = () => {
    api.get(`/magazzino/kits/${kit.id}/versions`).then(r => setVersions(r.data)).catch(() => setVersions([]));
  };

  const selectCls = 'w-full h-9 rounded-md border border-border bg-background px-2 text-sm';

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="kit-edit-dialog">
        <DialogHeader>
          <DialogTitle>{kit ? `Modifica kit — ${kit.code ? `${kit.code} ` : ''}${kit.name}` : 'Nuovo Kit'}</DialogTitle>
          <DialogDescription>Ogni modifica alla composizione crea una nuova versione; lo storico resta invariato.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} data-testid="kit-name-input" />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <select value={domain} disabled={!!kit}
                onChange={e => { setDomain(e.target.value); setItems([]); }}
                className={cn(selectCls, 'disabled:opacity-60')} data-testid="kit-domain-select">
                {Object.entries(DOMAIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          {domain === 'noleggio' && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Dimensione</Label>
                <select value={bedType} onChange={e => setBedType(e.target.value)} className={selectCls} data-testid="kit-bedtype-select">
                  <option value="">—</option>
                  {Object.entries(BED_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Linea Kit</Label>
                <select value={linea} onChange={e => setLinea(e.target.value)} className={selectCls} data-testid="kit-linea-select">
                  <option value="">—</option>
                  <option value="Living">Living</option>
                  <option value="Dream">Dream</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Stagione</Label>
                <select value={stagione} onChange={e => setStagione(e.target.value)} className={selectCls} data-testid="kit-stagione-select">
                  <option value="">—</option>
                  <option value="estivo">Estivo</option>
                  <option value="invernale">Invernale</option>
                </select>
              </div>
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
                {it.code && <span className="font-mono text-[11px] text-muted-foreground shrink-0">{it.code}</span>}
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
              <select value={addId} onChange={e => setAddId(e.target.value)} className={cn(selectCls, 'flex-1')} data-testid="kit-add-select">
                <option value="">Aggiungi articolo...</option>
                {catalog.filter(c => c.active && !items.some(i => i.product_id === c.id)).map(c => (
                  <option key={c.id} value={c.id}>{c.code ? `${c.code} — ` : ''}{c.name}</option>
                ))}
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
