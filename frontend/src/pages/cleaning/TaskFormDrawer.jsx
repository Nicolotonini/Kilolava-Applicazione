import React, { useState, useMemo, useEffect } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { Search, MapPin, Minus, Plus, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { todayStr, tomorrowStr, fmtDayLong } from './shared';
import { WEEKDAYS } from './dialogs';

function Stepper({ label, value, min = 0, max, onChange, testId }) {
  const clamp = (v) => {
    let x = Math.max(min, v);
    if (max != null && max > 0 && x > max) {
      toast.error(`Massimo ${max} ${label.toLowerCase()} per questa struttura`);
      x = max;
    }
    return x;
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {max != null && max > 0 && <p className="text-xs text-muted-foreground">max {max}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onChange(clamp((value || 0) - 1))} data-testid={`${testId}-minus`}><Minus className="h-4 w-4" /></Button>
        <span className="w-8 text-center text-lg font-bold tabular-nums" data-testid={`${testId}-value`}>{value || 0}</span>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-full" onClick={() => onChange(clamp((value || 0) + 1))} data-testid={`${testId}-plus`}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function TaskFormDrawer({ task, defaultDate, structures, cleaners, zones, onClose, onSaved }) {
  const isEdit = !!task?.id;
  const zonesById = useMemo(() => Object.fromEntries((zones || []).map(z => [z.id, z.name])), [zones]);
  const [search, setSearch] = useState('');
  const [structureId, setStructureId] = useState(task?.structure_id || '');
  const [date, setDate] = useState(task?.date || defaultDate || todayStr());
  const [guests, setGuests] = useState(task?.guests_count ?? 0);
  const [bedsDouble, setBedsDouble] = useState(task?.beds_double ?? 0);
  const [bedsSingle, setBedsSingle] = useState(task?.beds_single ?? 0);
  const [bedsSofa, setBedsSofa] = useState(task?.beds_sofa ?? 0);
  const [checkin, setCheckin] = useState(task?.checkin_today || false);
  const [checkinTime, setCheckinTime] = useState(task?.checkin_time || '15:00');
  const [cleanerIds, setCleanerIds] = useState(task?.assigned_cleaner_ids || (task?.assigned_cleaner_id ? [task.assigned_cleaner_id] : []));
  const [moreOpen, setMoreOpen] = useState(false);
  const [notes, setNotes] = useState(task?.notes || '');
  const [schedTime, setSchedTime] = useState(task?.scheduled_time || '');
  const [recurOn, setRecurOn] = useState(false);
  const [recurMode, setRecurMode] = useState('weekly_days');
  const [recurDays, setRecurDays] = useState([]);
  const [recurInterval, setRecurInterval] = useState(7);
  const [recurOcc, setRecurOcc] = useState(4);
  const [saving, setSaving] = useState(false);

  const structure = structures.find(s => s.id === structureId);
  const bc = structure?.bed_config || {};

  useEffect(() => {
    if (isEdit && task?.notes) setMoreOpen(true);
  }, [isEdit, task]);

  const results = useMemo(() => {
    if (!search.trim()) return structures.slice(0, 8);
    const q = search.toLowerCase();
    return structures.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.klv_code || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [search, structures]);

  const pickStructure = (s) => {
    setStructureId(s.id);
    const b = s.bed_config || {};
    if (!isEdit) {
      setBedsDouble(b.beds_double_min || 0);
      setBedsSingle(b.beds_single_min || 0);
      setBedsSofa(b.sofa_beds_min || 0);
      setGuests(b.capacity_persons || 0);
      setCheckinTime(s.check_in_time || '15:00');
    }
  };

  const save = async () => {
    if (!structureId) { toast.error('Seleziona la struttura'); return; }
    if (!date) { toast.error('Seleziona la data'); return; }
    setSaving(true);
    try {
      const payload = {
        structure_id: structureId,
        date,
        scheduled_time: schedTime || null,
        guests_count: guests || null,
        beds_double: bedsDouble,
        beds_single: bedsSingle,
        beds_sofa: bedsSofa,
        checkin_today: checkin,
        checkin_time: checkin ? (checkinTime || null) : null,
        assigned_cleaner_ids: cleanerIds,
        notes: notes || null,
      };
      let created;
      if (isEdit) {
        await api.put(`/cleaning-tasks/${task.id}`, payload);
      } else {
        const res = await api.post('/cleaning-tasks', payload);
        created = res.data;
      }
      if (!isEdit && recurOn && created) {
        try {
          const r = await api.post(`/cleaning-tasks/${created.id}/recurrence`, {
            mode: recurMode,
            weekdays: recurDays,
            interval_days: parseInt(recurInterval) || 7,
            until_date: null,
            occurrences: parseInt(recurOcc) || 4,
          });
          toast.success(`Pulizia creata + ${r.data.created} ricorrenze`);
        } catch (e) {
          toast.error(e.response?.data?.detail || 'Pulizia creata, ma errore nella ricorrenza');
        }
      } else {
        toast.success(isEdit ? 'Pulizia aggiornata' : 'Pulizia creata');
      }
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante il salvataggio');
    } finally { setSaving(false); }
  };

  return (
    <Sheet open onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="cleaning-form-drawer">
        <SheetHeader className="text-left">
          <SheetTitle>{isEdit ? 'Modifica pulizia' : 'Nuova pulizia'}</SheetTitle>
          <SheetDescription>Accesso, keybox e magazzino arrivano automaticamente dalla Struttura.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 mt-4 pb-6">
          {/* STEP 1 — Dove */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Dove?</p>
            {structure ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-primary/50 bg-primary/5 px-3 py-2.5" data-testid="selected-structure">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {structure.klv_code && <span className="font-mono text-primary mr-1.5">{structure.klv_code}</span>}
                    {structure.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {structure.address || ''}
                    {structure.operational_zone_id && zonesById[structure.operational_zone_id] ? ` · ${zonesById[structure.operational_zone_id]}` : ''}
                    {structure.client_name ? ` · ${structure.client_name}` : ''}
                  </p>
                </div>
                {!isEdit && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setStructureId('')} data-testid="change-structure-btn">Cambia</Button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca struttura (nome, KLV, indirizzo)..." className="h-11 pl-9 text-base" data-testid="structure-search-input" />
                </div>
                <div className="rounded-xl border border-border divide-y divide-border max-h-64 overflow-y-auto">
                  {results.length === 0 && <p className="text-xs text-muted-foreground p-3">Nessuna struttura trovata</p>}
                  {results.map(s => (
                    <button key={s.id} onClick={() => pickStructure(s)} className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors" data-testid={`structure-result-${s.id}`}>
                      <p className="text-sm font-medium">
                        {s.klv_code && <span className="font-mono text-primary text-xs mr-1.5">{s.klv_code}</span>}
                        {s.name}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {s.address || '—'}
                        {s.operational_zone_id && zonesById[s.operational_zone_id] && (
                          <span className="flex items-center gap-0.5 text-primary/80"><MapPin className="h-3 w-3" />{zonesById[s.operational_zone_id]}</span>
                        )}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* STEP 2 — Quando */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Quando?</p>
            <div className="flex gap-1.5 flex-wrap items-center">
              <button onClick={() => setDate(todayStr())} className={cn('px-3.5 py-2 rounded-full text-sm font-medium', date === todayStr() ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')} data-testid="date-today-btn">Oggi</button>
              <button onClick={() => setDate(tomorrowStr())} className={cn('px-3.5 py-2 rounded-full text-sm font-medium', date === tomorrowStr() ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')} data-testid="date-tomorrow-btn">Domani</button>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-10 w-40" data-testid="date-picker-input" />
            </div>
            <p className="text-xs text-muted-foreground capitalize mt-1">{fmtDayLong(date)}</p>
          </div>

          {/* STEP 3 — Persone e letti */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Persone e letti</p>
            <Stepper label="Persone" value={guests} onChange={setGuests} testId="step-guests" />
            <Stepper label="Matrimoniali" value={bedsDouble} max={bc.beds_double} onChange={setBedsDouble} testId="step-double" />
            <Stepper label="Singoli" value={bedsSingle} max={bc.beds_single} onChange={setBedsSingle} testId="step-single" />
            {(bc.sofa_beds > 0 || bedsSofa > 0) && (
              <Stepper label="Divani letto" value={bedsSofa} max={bc.sofa_beds} onChange={setBedsSofa} testId="step-sofa" />
            )}
          </div>

          {/* STEP 4 — Check-in */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Entrano lo stesso giorno?</p>
            <div className="flex gap-1.5 items-center flex-wrap">
              <button onClick={() => setCheckin(true)} className={cn('px-4 py-2 rounded-full text-sm font-medium', checkin ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground')} data-testid="checkin-yes-btn">Sì</button>
              <button onClick={() => setCheckin(false)} className={cn('px-4 py-2 rounded-full text-sm font-medium', !checkin ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')} data-testid="checkin-no-btn">No</button>
              {checkin && (
                <Input type="time" value={checkinTime} onChange={e => setCheckinTime(e.target.value)} className="h-10 w-28" data-testid="checkin-time-input" />
              )}
            </div>
          </div>

          {/* STEP 5 — Addette (facoltativo) */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Addette <span className="normal-case font-normal">(facoltativo — senza addette va in "Da assegnare")</span></p>
            <div className="flex gap-1.5 flex-wrap">
              {cleaners.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCleanerIds(ids => ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id])}
                  className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                    cleanerIds.includes(c.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
                  data-testid={`cleaner-chip-${c.id}`}
                >{c.name}</button>
              ))}
              {cleaners.length === 0 && <p className="text-xs text-muted-foreground">Nessuna addetta registrata</p>}
            </div>
          </div>

          {/* Altre opzioni */}
          <div>
            <button onClick={() => setMoreOpen(o => !o)} className="flex items-center gap-1 text-sm font-medium text-primary" data-testid="more-options-toggle">
              {moreOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}Altre opzioni
            </button>
            {moreOpen && (
              <div className="mt-2 space-y-3 rounded-xl border border-border p-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Ora pulizia (opzionale)</p>
                  <Input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="h-9 w-32" data-testid="sched-time-input" />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Note operative</p>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="task-notes-input" />
                </div>
                {!isEdit && (
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <input type="checkbox" checked={recurOn} onChange={e => setRecurOn(e.target.checked)} className="accent-[#F24E75] w-4 h-4" data-testid="recur-enable-checkbox" />
                      Crea anche una ricorrenza
                    </label>
                    {recurOn && (
                      <div className="mt-2 space-y-2">
                        <div className="flex gap-1">
                          <button onClick={() => setRecurMode('weekly_days')} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', recurMode === 'weekly_days' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>Giorni settimana</button>
                          <button onClick={() => setRecurMode('every_n_days')} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', recurMode === 'every_n_days' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>Ogni N giorni</button>
                        </div>
                        {recurMode === 'weekly_days' ? (
                          <div className="flex gap-1 flex-wrap">
                            {WEEKDAYS.map((d, i) => (
                              <button key={d} onClick={() => setRecurDays(w => w.includes(i) ? w.filter(x => x !== i) : [...w, i])}
                                className={cn('px-2.5 py-1.5 rounded-full text-xs font-medium', recurDays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{d}</button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs">Ogni <Input type="number" min={1} value={recurInterval} onChange={e => setRecurInterval(e.target.value)} className="h-8 w-16" /> giorni</div>
                        )}
                        <div className="flex items-center gap-2 text-xs">Occorrenze <Input type="number" min={1} max={60} value={recurOcc} onChange={e => setRecurOcc(e.target.value)} className="h-8 w-16" /></div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Button onClick={save} disabled={saving} className="w-full h-12 text-base font-bold bg-primary text-primary-foreground" data-testid="save-task-btn">
            {saving && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
            {isEdit ? 'Salva modifiche' : 'Crea pulizia'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
