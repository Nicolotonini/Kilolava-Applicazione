import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Truck, AlertTriangle, Scale, PackageSearch, X, MapPin } from 'lucide-react';
import { KIND_TONES, PRIO_LABEL, todayRome, fmtDay, itemsSummary } from './shared';

function RichiestaRow({ r, checked, onCheck, onAnnulla }) {
  const blocked = r.laundry && !r.laundry.consegnabile;
  return (
    <div className="flex items-start gap-2.5 py-2" data-testid={`richiesta-row-${r.id}`}>
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheck(r.id, !!v)}
        disabled={blocked}
        className="mt-0.5"
        data-testid={`richiesta-check-${r.id}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone={KIND_TONES[r.kind] || 'cancelled'}>{r.kind_label}</StatusBadge>
          {r.priority && r.priority !== 'normal' && (
            <StatusBadge tone={r.priority === 'urgent' ? 'danger' : 'progress'}>{PRIO_LABEL[r.priority]}</StatusBadge>
          )}
          {r.date_needed && <span className="text-xs text-muted-foreground">entro {fmtDay(r.date_needed)}</span>}
        </div>
        <p className="text-sm mt-1">{itemsSummary(r.items) || '—'}</p>
        {r.note && <p className="text-xs text-muted-foreground mt-0.5">{r.note}</p>}
        {r.stock_ok === false && (
          <p className="text-xs text-amber-600 font-medium flex items-center gap-1 mt-1" data-testid={`stock-warning-${r.id}`}>
            <AlertTriangle className="h-3.5 w-3.5" />Disponibilità insufficiente nel Magazzino Generale
          </p>
        )}
        {blocked && (
          <p className="text-xs text-orange-600 font-medium flex items-center gap-1 mt-1" data-testid={`laundry-gate-${r.id}`}>
            <Scale className="h-3.5 w-3.5" />Da pesare: peso finale e foto bilancia obbligatori prima della consegna
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onAnnulla(r.id)}
        title="Annulla richiesta"
        data-testid={`richiesta-annulla-${r.id}`}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function CreaFermataDialog({ open, onClose, group, selectedIds, riders, onCreated }) {
  const [date, setDate] = useState(todayRome());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [riderId, setRiderId] = useState('');
  const [notes, setNotes] = useState('');
  const [compat, setCompat] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !group) return;
    setDate(group.date_needed || todayRome());
    setStart(''); setEnd(''); setRiderId(''); setNotes('');
    const params = group.structure_id ? { structure_id: group.structure_id } : group.client_id ? { client_id: group.client_id } : null;
    if (params) {
      api.get('/consegne/fermate-compatibili', { params }).then((r) => setCompat(r.data)).catch(() => setCompat([]));
    } else setCompat([]);
  }, [open, group]);

  if (!group) return null;

  const create = async () => {
    setSaving(true);
    try {
      await api.post('/consegne/fermate', {
        richiesta_ids: selectedIds, date,
        time_window_start: start || null, time_window_end: end || null,
        rider_id: riderId || null, notes: notes || null,
      });
      toast.success('Fermata creata');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const addToExisting = async (fermataId) => {
    setSaving(true);
    try {
      for (const rid of selectedIds) {
        await api.post(`/consegne/fermate/${fermataId}/richieste`, { richiesta_id: rid });
      }
      toast.success('Richieste aggiunte alla fermata esistente');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="crea-fermata-dialog">
        <DialogHeader>
          <DialogTitle>Crea fermata — {group.destination}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{selectedIds.length} richieste selezionate ({group.kind_labels?.join(', ')})</p>
          {compat.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="fermate-compatibili">
              <p className="text-xs font-semibold text-primary">Fermate già programmate per questa destinazione — evita doppioni:</p>
              {compat.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{fmtDay(f.date)}{f.time_window_start ? ` · ${f.time_window_start}` : ''}{f.rider_name ? ` · ${f.rider_name}` : ' · non assegnata'}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => addToExisting(f.id)} data-testid={`add-to-fermata-${f.id}`}>
                    Aggiungi qui
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="fermata-date-input" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dalle</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} data-testid="fermata-start-input" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Alle</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="fermata-end-input" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rider (facoltativo — puoi assegnare dopo in Organizzazione)</Label>
            <Select value={riderId || 'none'} onValueChange={(v) => setRiderId(v === 'none' ? '' : v)}>
              <SelectTrigger data-testid="fermata-rider-select"><SelectValue placeholder="Non assegnata" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnata</SelectItem>
                {riders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" data-testid="fermata-notes-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={create} disabled={saving || !date || selectedIds.length === 0} data-testid="fermata-create-submit">
            {saving ? '...' : 'Crea fermata'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuovaRichiestaDialog({ open, onClose, structures, onCreated }) {
  const [structureId, setStructureId] = useState('');
  const [destLabel, setDestLabel] = useState('');
  const [items, setItems] = useState([{ name: '', qty: 1 }]);
  const [dateNeeded, setDateNeeded] = useState('');
  const [priority, setPriority] = useState('normal');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStructureId(''); setDestLabel(''); setItems([{ name: '', qty: 1 }]);
      setDateNeeded(''); setPriority('normal'); setNote('');
    }
  }, [open]);

  const save = async () => {
    const validItems = items.filter((i) => i.name.trim());
    if (validItems.length === 0) { toast.error('Inserisci almeno un articolo'); return; }
    if (!structureId && !destLabel.trim()) { toast.error('Indica una struttura o una destinazione'); return; }
    setSaving(true);
    try {
      await api.post('/consegne/richieste', {
        structure_id: structureId || null,
        destination_label: destLabel.trim() || null,
        items: validItems.map((i) => ({ name: i.name.trim(), qty: parseInt(i.qty) || 1 })),
        date_needed: dateNeeded || null, priority, note: note || null,
      });
      toast.success('Richiesta creata');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="nuova-richiesta-dialog">
        <DialogHeader><DialogTitle>Nuova richiesta logistica</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Struttura</Label>
            <Select value={structureId || 'none'} onValueChange={(v) => setStructureId(v === 'none' ? '' : v)}>
              <SelectTrigger data-testid="richiesta-structure-select"><SelectValue placeholder="Nessuna" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna / altra destinazione</SelectItem>
                {structures.map((s) => <SelectItem key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!structureId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Destinazione libera</Label>
              <Input value={destLabel} onChange={(e) => setDestLabel(e.target.value)} placeholder="es. Sede fornitore, Ufficio..." data-testid="richiesta-dest-input" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Articoli *</Label>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={it.name} onChange={(e) => setItems((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Cosa portare" className="flex-1" data-testid={`richiesta-item-name-${i}`} />
                <Input type="number" min={1} value={it.qty} onChange={(e) => setItems((p) => p.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} className="w-20" data-testid={`richiesta-item-qty-${i}`} />
                {items.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setItems((p) => p.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setItems((p) => [...p, { name: '', qty: 1 }])} data-testid="richiesta-add-item">
              <Plus className="h-3 w-3" />Aggiungi articolo
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Necessaria entro</Label>
              <Input type="date" value={dateNeeded} onChange={(e) => setDateNeeded(e.target.value)} data-testid="richiesta-date-input" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priorità</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="richiesta-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none" data-testid="richiesta-note-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="richiesta-create-submit">{saving ? '...' : 'Crea richiesta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DaOrganizzarePage() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState([]);
  const [structures, setStructures] = useState([]);
  const [selected, setSelected] = useState({});
  const [fermataGroup, setFermataGroup] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/consegne/proposte').then((r) => {
      setGroups(r.data);
      const sel = {};
      r.data.forEach((g) => g.richieste.forEach((f) => {
        sel[f.id] = !(f.laundry && !f.laundry.consegnabile);
      }));
      setSelected(sel);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api.get('/logistics/riders').then((r) => setRiders(r.data)).catch(() => {});
    api.get('/structures').then((r) => setStructures(r.data)).catch(() => {});
  }, [load]);

  const annulla = async (id) => {
    try {
      await api.put(`/consegne/richieste/${id}/annulla`);
      toast.success('Richiesta annullata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const totalRichieste = useMemo(() => groups.reduce((s, g) => s + g.richieste.length, 0), [groups]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl" data-testid="da-organizzare-page">
      <PageHeader
        title="Da organizzare"
        subtitle={`${totalRichieste} richieste aperte raggruppate per destinazione — una fermata per visita fisica`}
        actions={
          <Button onClick={() => setNewOpen(true)} className="h-9 gap-1.5" data-testid="nuova-richiesta-btn">
            <Plus className="h-4 w-4" />Nuova richiesta
          </Button>
        }
      />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState icon={PackageSearch} message="Nessuna richiesta da organizzare. Le richieste da Magazzino, Lavanderia Privata, Segnalazioni e Manutenzioni compaiono qui." testId="da-organizzare-empty" />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const selIds = g.richieste.filter((r) => selected[r.id]).map((r) => r.id);
            return (
              <Card key={g.key} className="border shadow-none" data-testid={`gruppo-${g.key}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-base">{g.destination}</span>
                        {g.klv_code && <span className="text-xs font-mono text-muted-foreground">{g.klv_code}</span>}
                        {g.priority !== 'low' && g.priority !== 'normal' && (
                          <StatusBadge tone={g.priority === 'urgent' ? 'danger' : 'progress'}>{PRIO_LABEL[g.priority]}</StatusBadge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {g.richieste.length} richieste · {g.kind_labels.join(' + ')}
                        {g.date_needed ? ` · prima scadenza ${fmtDay(g.date_needed)}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={selIds.length === 0}
                      onClick={() => setFermataGroup(g)}
                      data-testid={`crea-fermata-btn-${g.key}`}
                    >
                      <Truck className="h-3.5 w-3.5" />Crea fermata ({selIds.length})
                    </Button>
                  </div>
                  <div className="mt-2 divide-y divide-border/60">
                    {g.richieste.map((r) => (
                      <RichiestaRow
                        key={r.id}
                        r={r}
                        checked={!!selected[r.id]}
                        onCheck={(id, v) => setSelected((p) => ({ ...p, [id]: v }))}
                        onAnnulla={annulla}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreaFermataDialog
        open={!!fermataGroup}
        onClose={() => setFermataGroup(null)}
        group={fermataGroup}
        selectedIds={fermataGroup ? fermataGroup.richieste.filter((r) => selected[r.id]).map((r) => r.id) : []}
        riders={riders}
        onCreated={() => { setFermataGroup(null); load(); }}
      />
      <NuovaRichiestaDialog open={newOpen} onClose={() => setNewOpen(false)} structures={structures} onCreated={() => { setNewOpen(false); load(); }} />
    </div>
  );
}
