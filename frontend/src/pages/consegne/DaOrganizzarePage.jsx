import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Plus, Truck, AlertTriangle, Scale, PackageSearch, X, MapPin, Sparkles, Package, Pencil, Check } from 'lucide-react';
import { KIND_TONES, PRIO_LABEL, STAGE_TONES, FERMATA_STATUS, DaySelector, todayRome, fmtDay, fmtDateTime, itemsSummary } from './shared';
import { KitPickerDialog, EditRichiestaDialog } from './RichiestaDialogs';

function RichiestaRow({ r, checked, onCheck, onAnnulla, onConferma, onRinvia, onEdit, onAddKit }) {
  const blocked = r.laundry && !r.laundry.consegnabile;
  const pending = r.stage !== 'confermata';
  const isLav = r.kind === 'lavanderia_privata';
  return (
    <div className="flex items-start gap-2.5 py-2" data-testid={`richiesta-row-${r.id}`}>
      <Checkbox checked={checked} onCheckedChange={(v) => onCheck(r.id, !!v)} disabled={blocked || pending} className="mt-0.5" data-testid={`richiesta-check-${r.id}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadge tone={STAGE_TONES[r.stage] || 'success'} testId={`richiesta-stage-${r.id}`}>{r.stage_label}</StatusBadge>
          <StatusBadge tone={KIND_TONES[r.kind] || 'cancelled'}>{r.kind_label}</StatusBadge>
          {(r.source || {}).type === 'ordine_cliente' && <StatusBadge tone="accent" testId={`richiesta-ordine-${r.id}`}>Ordine Cliente {(r.source || {}).order_number || ''}</StatusBadge>}
          {(r.source || {}).type === 'fabbisogno_pulizia' && <StatusBadge tone="violet" testId={`richiesta-fabbisogno-${r.id}`}>Fabbisogno Pulizia</StatusBadge>}
          {r.priority && r.priority !== 'normal' && <StatusBadge tone={r.priority === 'urgent' ? 'danger' : 'progress'}>{PRIO_LABEL[r.priority]}</StatusBadge>}
          {r.date_needed && <span className="text-xs text-muted-foreground">entro {fmtDay(r.date_needed)}</span>}
          {r.time_window && <span className="text-xs font-semibold text-amber-700">{r.time_window}</span>}
        </div>
        <p className="text-sm mt-1">{itemsSummary(r.items) || '—'}</p>
        {isLav && r.laundry && (
          <p className="text-xs mt-0.5" data-testid={`laundry-info-${r.id}`}>
            <span className="font-semibold">{r.laundry.weight_kg != null ? `${String(r.laundry.weight_kg).replace('.', ',')} kg` : 'Peso da rilevare'}</span>
            {r.laundry.ready_at && <span className="text-muted-foreground"> · Pronta dal {fmtDateTime(r.laundry.ready_at)}</span>}
          </p>
        )}
        {(r.kits_used || []).length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">Kit: {r.kits_used.map(k => `${k.qty}× ${k.kit_name} (v${k.kit_version})`).join(', ')}</p>
        )}
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
      <div className="flex items-center gap-0.5 shrink-0 flex-wrap justify-end">
        {pending && isLav ? (
          <>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              onClick={() => onConferma(r.id)} data-testid={`lav-aggiungi-consegna-${r.id}`}>
              <Check className="h-3 w-3" />Aggiungi alla consegna
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
              onClick={() => onRinvia(r.id)} data-testid={`lav-rinvia-${r.id}`}>
              Non consegnare ora
            </Button>
          </>
        ) : pending && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            onClick={() => onConferma(r.id)} data-testid={`richiesta-conferma-${r.id}`}>
            <Check className="h-3 w-3" />Conferma
          </Button>
        )}
        {r.kind === 'noleggio' && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onAddKit(r)} title="Aggiungi Kit" data-testid={`richiesta-kit-${r.id}`}>
            <Package className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onEdit(r)} title="Modifica" data-testid={`richiesta-edit-${r.id}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onAnnulla(r.id)} title="Annulla richiesta" data-testid={`richiesta-annulla-${r.id}`}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function CreaFermataDialog({ open, onClose, group, selectedIds, riders, defaultDate, onCreated }) {
  const [date, setDate] = useState(defaultDate || todayRome());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [riderId, setRiderId] = useState('');
  const [notes, setNotes] = useState('');
  const [compat, setCompat] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !group) return;
    setDate(group.date_needed || defaultDate || todayRome());
    setStart(''); setEnd(''); setRiderId(''); setNotes('');
    const params = group.structure_id ? { structure_id: group.structure_id } : group.client_id ? { client_id: group.client_id } : null;
    if (params) {
      api.get('/consegne/fermate-compatibili', { params }).then((r) => setCompat(r.data)).catch(() => setCompat([]));
    } else setCompat([]);
  }, [open, group, defaultDate]);

  if (!group) return null;

  const create = async () => {
    setSaving(true);
    try {
      await api.post('/consegne/fermate', {
        richiesta_ids: selectedIds, date,
        time_window_start: start || null, time_window_end: end || null,
        rider_id: riderId || null, notes: notes || null,
      });
      toast.success('Fermata creata: pronta per il giro');
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
      toast.success('Richieste accorpate alla fermata esistente');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="crea-fermata-dialog">
        <DialogHeader><DialogTitle>Crea fermata — {group.destination}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{selectedIds.length} richieste confermate selezionate: una sola visita fisica.</p>
          {compat.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="fermate-compatibili">
              <p className="text-xs font-semibold text-primary">Fermate già programmate per questa destinazione — accorpa, evita doppioni:</p>
              {compat.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{fmtDay(f.date)}{f.time_window_start ? ` · ${f.time_window_start}` : ''}{f.rider_name ? ` · ${f.rider_name}` : ' · non assegnata'}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => addToExisting(f.id)} data-testid={`add-to-fermata-${f.id}`}>Aggiungi qui</Button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Data *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="fermata-date-input" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Dalle</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} data-testid="fermata-start-input" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Alle</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="fermata-end-input" /></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Rider (facoltativo — puoi decidere in Organizzazione giro)</Label>
            <Select value={riderId || 'none'} onValueChange={(v) => setRiderId(v === 'none' ? '' : v)}>
              <SelectTrigger data-testid="fermata-rider-select"><SelectValue placeholder="Non assegnata" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnata</SelectItem>
                {riders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Note</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" data-testid="fermata-notes-input" /></div>
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

function NuovaRichiestaDialog({ open, onClose, structures, defaultDate, onCreated }) {
  const [structureId, setStructureId] = useState('');
  const [destLabel, setDestLabel] = useState('');
  const [items, setItems] = useState([{ name: '', qty: 1 }]);
  const [kits, setKits] = useState([]);
  const [kitPicker, setKitPicker] = useState(false);
  const [dateNeeded, setDateNeeded] = useState(defaultDate || '');
  const [timeWindow, setTimeWindow] = useState('');
  const [priority, setPriority] = useState('normal');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStructureId(''); setDestLabel(''); setItems([{ name: '', qty: 1 }]); setKits([]);
      setDateNeeded(defaultDate || ''); setTimeWindow(''); setPriority('normal'); setNote('');
    }
  }, [open, defaultDate]);

  const save = async () => {
    const validItems = items.filter((i) => i.name.trim());
    if (validItems.length === 0 && kits.length === 0) { toast.error('Inserisci almeno un articolo o un Kit'); return; }
    if (!structureId && !destLabel.trim()) { toast.error('Indica una struttura o una destinazione'); return; }
    setSaving(true);
    try {
      await api.post('/consegne/richieste', {
        structure_id: structureId || null,
        destination_label: destLabel.trim() || null,
        items: validItems.map((i) => ({ name: i.name.trim(), qty: parseInt(i.qty) || 1 })),
        kits: kits.map(k => ({ kit_id: k.kit_id, qty: k.qty })),
        date_needed: dateNeeded || null, time_window: timeWindow || null, priority, note: note || null,
      });
      toast.success('Consegna creata (già confermata: sei tu che l\'hai decisa)');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto" data-testid="nuova-richiesta-dialog">
        <DialogHeader><DialogTitle>Nuova consegna</DialogTitle></DialogHeader>
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
            <div className="flex items-center justify-between">
              <Label className="text-xs">Articoli</Label>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setKitPicker(true)} data-testid="richiesta-add-kit-btn">
                <Package className="h-3 w-3" />Aggiungi Kit
              </Button>
            </div>
            {kits.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {kits.map((k, i) => (
                  <span key={i} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 flex items-center gap-1" data-testid={`richiesta-kit-chip-${i}`}>
                    {k.qty}× {k.name}
                    <button onClick={() => setKits(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Necessaria entro</Label>
              <Input type="date" value={dateNeeded} onChange={(e) => setDateNeeded(e.target.value)} data-testid="richiesta-date-input" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Fascia oraria</Label>
              <Input value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} placeholder="es. 10–13" data-testid="richiesta-window-input" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Priorità</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="richiesta-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIO_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none" data-testid="richiesta-note-input" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="richiesta-create-submit">{saving ? '...' : 'Crea consegna'}</Button>
        </DialogFooter>
        <KitPickerDialog open={kitPicker} onClose={() => setKitPicker(false)} onDone={(sel) => { setKits(p => [...p, ...sel]); setKitPicker(false); }} />
      </DialogContent>
    </Dialog>
  );
}

export default function DaOrganizzarePage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayRome());
  const [data, setData] = useState(null);
  const [riders, setRiders] = useState([]);
  const [structures, setStructures] = useState([]);
  const [selected, setSelected] = useState({});
  const [fermataGroup, setFermataGroup] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [editRichiesta, setEditRichiesta] = useState(null);
  const [kitRichiesta, setKitRichiesta] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    api.get('/consegne/giornata', { params: { date } }).then((r) => {
      setData(r.data);
      const sel = {};
      r.data.richieste.forEach((f) => {
        sel[f.id] = f.stage === 'confermata' && !(f.laundry && !f.laundry.consegnabile);
      });
      setSelected(sel);
    }).catch(() => setData({ richieste: [], fermate: [], counts: {} }));
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/logistics/riders').then((r) => setRiders(r.data)).catch(() => {});
    api.get('/structures').then((r) => setStructures(r.data)).catch(() => {});
  }, []);

  const groups = useMemo(() => {
    const m = {};
    (data?.richieste || []).forEach((r) => {
      const key = r.structure_id || r.zaino_id || (r.client_id ? `c:${r.client_id}` : `l:${r.destination}`);
      if (!m[key]) {
        m[key] = { key, destination: r.destination, klv_code: r.klv_code, structure_id: r.structure_id,
                   client_id: r.client_id, date_needed: r.date_needed, priority: r.priority, richieste: [], kind_labels: new Set() };
      }
      m[key].richieste.push(r);
      m[key].kind_labels.add(r.kind_label);
      if (r.date_needed && (!m[key].date_needed || r.date_needed < m[key].date_needed)) m[key].date_needed = r.date_needed;
    });
    return Object.values(m).map(g => ({ ...g, kind_labels: [...g.kind_labels] }));
  }, [data]);

  const conferma = async (id) => {
    try { await api.put(`/consegne/richieste/${id}/conferma`); toast.success('Richiesta confermata'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };
  const annulla = async (id) => {
    try { await api.put(`/consegne/richieste/${id}/annulla`); toast.success('Richiesta annullata'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };
  const rinvia = async (id) => {
    try { await api.put(`/consegne/richieste/${id}/rinvia`); toast.success('Non in consegna ora: resta Pronta e rivalutabile'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };
  const riproponi = async (id) => {
    try { await api.put(`/consegne/richieste/${id}/riproponi`); toast.success('Richiesta riproposta tra quelle da organizzare'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };
  const generaFabbisogni = async () => {
    setGenerating(true);
    try {
      const r = await api.post('/consegne/genera-fabbisogni', { date });
      const d = r.data;
      toast.success(`Fabbisogni ${date}: ${d.created} nuovi · ${d.updated} aggiornati · ${d.senza_fabbisogno} senza fabbisogno (stock ok)`, { duration: 6000 });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setGenerating(false); }
  };

  const counts = data?.counts || {};

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl" data-testid="definizione-page">
      <PageHeader
        title="Organizzazione e definizione"
        subtitle="Decidi COSA consegnare, QUANTO, DOVE e QUANDO. Le richieste automatiche vanno verificate prima del giro."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={generaFabbisogni} disabled={generating} className="h-9 gap-1.5" data-testid="genera-fabbisogni-btn">
              <Sparkles className="h-4 w-4" />{generating ? 'Calcolo...' : 'Genera fabbisogni dalle pulizie'}
            </Button>
            <Button onClick={() => setNewOpen(true)} className="h-9 gap-1.5" data-testid="nuova-richiesta-btn">
              <Plus className="h-4 w-4" />Nuova consegna
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <DaySelector date={date} onChange={setDate} testId="def-day-selector" />
        <div className="flex items-center gap-2 text-sm" data-testid="def-counts">
          {counts.da_verificare > 0 && <span className="font-medium text-amber-600">{counts.da_verificare} da verificare</span>}
          {counts.da_confermare > 0 && <span className="font-medium text-sky-600">{counts.da_confermare} da confermare</span>}
          <span className="text-muted-foreground">{counts.confermata || 0} confermate</span>
        </div>
      </div>

      {data === null ? (
        <ListSkeleton rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState icon={PackageSearch} message="Nessuna richiesta per questa giornata. Genera i fabbisogni dalle pulizie o crea una consegna manuale." testId="da-organizzare-empty" />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const selIds = g.richieste.filter((r) => selected[r.id] && r.stage === 'confermata').map((r) => r.id);
            return (
              <Card key={g.key} className="border shadow-none" data-testid={`gruppo-${g.key}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MapPin className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-base">{g.destination}</span>
                        {g.klv_code && <span className="text-xs font-mono font-bold text-primary">{g.klv_code}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {g.richieste.length} richieste · {g.kind_labels.join(' + ')}
                        {g.date_needed ? ` · prima scadenza ${fmtDay(g.date_needed)}` : ''}
                      </p>
                    </div>
                    <Button size="sm" className="h-8 gap-1.5" disabled={selIds.length === 0} onClick={() => setFermataGroup(g)} data-testid={`crea-fermata-btn-${g.key}`}>
                      <Truck className="h-3.5 w-3.5" />Crea fermata ({selIds.length})
                    </Button>
                  </div>
                  <div className="mt-2 divide-y divide-border/60">
                    {g.richieste.map((r) => (
                      <RichiestaRow key={r.id} r={r} checked={!!selected[r.id]}
                        onCheck={(id, v) => setSelected((p) => ({ ...p, [id]: v }))}
                        onAnnulla={annulla} onConferma={conferma} onRinvia={rinvia}
                        onEdit={setEditRichiesta} onAddKit={setKitRichiesta} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(data?.fermate || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fermate del {fmtDay(date)} ({data.fermate.length})</p>
          <div className="flex gap-2 flex-wrap">
            {data.fermate.map(f => {
              const st = FERMATA_STATUS[f.status] || FERMATA_STATUS.unassigned;
              return (
                <button key={f.id} onClick={() => navigate(`/consegne/fermata/${f.id}`)}
                  className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-left hover:border-primary/50" data-testid={`fermata-day-${f.id}`}>
                  <p className="text-sm font-semibold">{f.klv_code && <span className="font-mono text-xs text-primary mr-1">{f.klv_code}</span>}{f.destination}</p>
                  <p className="text-xs text-muted-foreground">{st.label}{f.rider_name ? ` · ${f.rider_name}` : ' · pronta per il giro'}</p>
                </button>
              );
            })}
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate('/consegne/giro')} data-testid="goto-giro-btn">
            Vai a Organizzazione giro →
          </Button>
        </div>
      )}

      {(data?.rinviate || []).length > 0 && (
        <Card className="border border-dashed shadow-none" data-testid="rinviate-card">
          <CardContent className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Non in consegna — rivalutabili ({data.rinviate.length})
            </p>
            <div className="divide-y divide-border/60">
              {data.rinviate.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2" data-testid={`rinviata-row-${r.id}`}>
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">{r.destination}</span>
                    <span className="text-xs text-muted-foreground"> · {r.kind_label}
                      {r.laundry?.weight_kg != null ? ` · ${String(r.laundry.weight_kg).replace('.', ',')} kg` : ''}
                      {r.laundry?.ready_at ? ` · Pronta dal ${fmtDateTime(r.laundry.ready_at)}` : ''}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => riproponi(r.id)} data-testid={`riproponi-${r.id}`}>
                    Riproponi
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <CreaFermataDialog open={!!fermataGroup} onClose={() => setFermataGroup(null)} group={fermataGroup} defaultDate={date}
        selectedIds={fermataGroup ? fermataGroup.richieste.filter((r) => selected[r.id] && r.stage === 'confermata').map((r) => r.id) : []}
        riders={riders} onCreated={() => { setFermataGroup(null); load(); }} />
      <NuovaRichiestaDialog open={newOpen} onClose={() => setNewOpen(false)} structures={structures} defaultDate={date} onCreated={() => { setNewOpen(false); load(); }} />
      {editRichiesta && <EditRichiestaDialog richiesta={editRichiesta} onClose={() => setEditRichiesta(null)} onSaved={() => { setEditRichiesta(null); load(); }} />}
      <KitPickerDialog open={!!kitRichiesta} richiestaId={kitRichiesta?.id} onClose={() => setKitRichiesta(null)} onDone={() => { setKitRichiesta(null); load(); }} />
    </div>
  );
}
