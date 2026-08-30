import React, { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Minus, Plus, X, Package } from 'lucide-react';

// + Aggiungi Kit: il Kit è una scorciatoia, la consegna conosce sempre gli articoli reali
export function KitPickerDialog({ open, onClose, onDone, richiestaId }) {
  const [kits, setKits] = useState([]);
  const [qty, setQty] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQty({});
    api.get('/magazzino/kits', { params: { domain: 'noleggio' } }).then(r => setKits(r.data)).catch(() => setKits([]));
  }, [open]);

  const groups = useMemo(() => {
    const g = { MATRIMONIALI: [], SINGOLI: [], ALTRI: [] };
    kits.forEach(k => {
      const n = (k.name || '').toLowerCase();
      if (n.includes('matrimonial')) g.MATRIMONIALI.push(k);
      else if (n.includes('singol')) g.SINGOLI.push(k);
      else g.ALTRI.push(k);
    });
    return Object.entries(g).filter(([, v]) => v.length > 0);
  }, [kits]);

  const selected = Object.entries(qty).filter(([, q]) => q > 0);

  const confirm = async () => {
    setSaving(true);
    try {
      if (richiestaId) {
        for (const [kitId, q] of selected) {
          await api.post(`/consegne/richieste/${richiestaId}/kit`, { kit_id: kitId, qty: q });
        }
        toast.success('Kit aggiunti: articoli espansi nella richiesta');
        onDone();
      } else {
        onDone(selected.map(([kit_id, q]) => ({ kit_id, qty: q, name: kits.find(k => k.id === kit_id)?.name })));
      }
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="kit-picker-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-4 w-4 text-primary" />Aggiungi Kit</DialogTitle>
          <DialogDescription>Il Kit viene espanso automaticamente negli articoli reali (con versione salvata).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {groups.map(([label, list]) => (
            <div key={label}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
              <div className="space-y-1">
                {list.map(k => (
                  <div key={k.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5" data-testid={`kit-row-${k.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{k.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{k.code} · v{k.version || 1} · {(k.items || []).length} articoli</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(p => ({ ...p, [k.id]: Math.max(0, (p[k.id] || 0) - 1) }))} data-testid={`kit-minus-${k.id}`}><Minus className="h-3 w-3" /></Button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums" data-testid={`kit-qty-${k.id}`}>{qty[k.id] || 0}</span>
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(p => ({ ...p, [k.id]: (p[k.id] || 0) + 1 }))} data-testid={`kit-plus-${k.id}`}><Plus className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {kits.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nessun Kit configurato (Sistema → Kit).</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={confirm} disabled={saving || selected.length === 0} data-testid="kit-picker-confirm">
            {saving ? '...' : `Aggiungi ${selected.reduce((s, [, q]) => s + q, 0)} kit`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Revisione richiesta: quantità, articoli, data, note (lo storico preserva l'origine)
export function EditRichiestaDialog({ richiesta, onClose, onSaved }) {
  const [items, setItems] = useState((richiesta.items || []).map(i => ({ ...i })));
  const [dateNeeded, setDateNeeded] = useState(richiesta.date_needed || '');
  const [timeWindow, setTimeWindow] = useState(richiesta.time_window || '');
  const [priority, setPriority] = useState(richiesta.priority || 'normal');
  const [note, setNote] = useState(richiesta.note || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const valid = items.filter(i => (parseInt(i.qty) || 0) > 0);
    if (valid.length === 0) { toast.error('La richiesta deve avere almeno un articolo con quantità > 0'); return; }
    setSaving(true);
    try {
      await api.put(`/consegne/richieste/${richiesta.id}`, {
        items: valid.map(i => ({ ...i, qty: parseInt(i.qty) || 1 })),
        date_needed: dateNeeded || null, time_window: timeWindow || null, priority, note: note || null,
      });
      toast.success('Richiesta aggiornata');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="edit-richiesta-dialog">
        <DialogHeader>
          <DialogTitle>Modifica richiesta — {richiesta.destination}</DialogTitle>
          <DialogDescription>{richiesta.source_label}{richiesta.kits_used?.length ? ` · Kit: ${richiesta.kits_used.map(k => `${k.qty}× ${k.kit_name} (v${k.kit_version})`).join(', ')}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Articoli</Label>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate">
                  {it.code && <span className="font-mono text-xs font-bold text-primary mr-1">{it.code}</span>}{it.name}
                </span>
                <Input type="number" min={0} value={it.qty} className="w-20 h-8"
                  onChange={e => setItems(p => p.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                  data-testid={`edit-item-qty-${i}`} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setItems(p => p.filter((_, j) => j !== i))} data-testid={`edit-item-remove-${i}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1"><Label className="text-xs">Necessaria entro</Label>
              <Input type="date" value={dateNeeded} onChange={e => setDateNeeded(e.target.value)} data-testid="edit-date-input" /></div>
            <div className="space-y-1"><Label className="text-xs">Fascia oraria</Label>
              <Input value={timeWindow} onChange={e => setTimeWindow(e.target.value)} placeholder="es. entro 13:00" data-testid="edit-window-input" /></div>
            <div className="space-y-1"><Label className="text-xs">Priorità</Label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="edit-priority-select">
                <option value="low">Bassa</option><option value="normal">Normale</option><option value="high">Alta</option><option value="urgent">Urgente</option>
              </select></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Note interne</Label>
            <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="resize-none" data-testid="edit-note-input" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="edit-richiesta-save">{saving ? '...' : 'Salva modifiche'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
