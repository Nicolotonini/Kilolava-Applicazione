import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api, { eventsApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, Search, Sparkles, BedDouble, X, AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';

import {
  MONTHS, MONTHS_SHORT, fmtDate, getWeekStart, getMonthStart, getPropertyKey,
} from './calendar/calendarHelpers';
import { PlanningBoard } from './calendar/PlanningBoard';
import { MonthGrid } from './calendar/MonthGrid';
import { SoggiornoDrawer } from './calendar/SoggiornoDrawer';
import { useCalendarDrag } from './calendar/useCalendarDrag';
import { TaskFormDrawer } from './cleaning/TaskFormDrawer';

const VIEWS = [
  { key: 'day', label: 'Giorno' },
  { key: 'week', label: 'Settimana' },
  { key: 'month', label: 'Mese' },
];

function NuovoSoggiornoDialog({ open, onClose, structures, units = [], defaultStructureId, defaultDate, onCreated }) {
  const [structureId, setStructureId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [inDate, setInDate] = useState('');
  const [outDate, setOutDate] = useState('');
  const [inTime, setInTime] = useState('15:00');
  const [outTime, setOutTime] = useState('10:00');
  const [guests, setGuests] = useState('');
  const [notes, setNotes] = useState('');
  const [beds, setBeds] = useState({ beds_double: '', beds_single: '', beds_sofa: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStructureId(defaultStructureId || '');
      setUnitId('');
      setInDate(defaultDate || fmtDate(new Date()));
      setOutDate('');
      setInTime('15:00'); setOutTime('10:00'); setGuests(''); setNotes('');
    }
  }, [open, defaultStructureId, defaultDate]);

  const structUnits = useMemo(() => (units || []).filter((u) => u.structure_id === structureId), [units, structureId]);

  // Letti precompilati dalla configurazione corretta (Unit → Struttura), modificabili per il singolo soggiorno.
  // Il numero di persone NON decide i letti.
  useEffect(() => {
    if (!open) return;
    const u = (units || []).find((x) => x.id === unitId);
    const s = (structures || []).find((x) => x.id === structureId);
    const ubc = u?.bed_config;
    const hasUnitBeds = ubc && ((ubc.beds_double || 0) + (ubc.beds_single || 0) + (ubc.sofa_beds || 0) > 0);
    const bc = hasUnitBeds ? ubc : (s?.bed_config || {});
    setBeds({ beds_double: bc.beds_double ?? '', beds_single: bc.beds_single ?? '', beds_sofa: bc.sofa_beds ?? '' });
  }, [open, structureId, unitId, units, structures]);

  const save = async () => {
    if (!structureId || !inDate || !outDate) { toast.error('Struttura e date IN/OUT obbligatorie'); return; }
    if (outDate < inDate) { toast.error('La data OUT deve essere successiva alla data IN'); return; }
    setSaving(true);
    try {
      await eventsApi.create({
        event_type: 'booking', title: 'Soggiorno', structure_id: structureId,
        unit_id: unitId || null,
        start_time: `${inDate}T${inTime || '15:00'}:00`, end_time: `${outDate}T${outTime || '10:00'}:00`,
        source: 'direct',
        guests_count: guests ? parseInt(guests) : null,
        beds_double: beds.beds_double === '' ? null : parseInt(beds.beds_double, 10),
        beds_single: beds.beds_single === '' ? null : parseInt(beds.beds_single, 10),
        beds_sofa: beds.beds_sofa === '' ? null : parseInt(beds.beds_sofa, 10),
        checkin_time: inTime || null, checkout_time: outTime || null,
        notes: notes || null,
      });
      toast.success('Soggiorno creato');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="nuovo-soggiorno-dialog">
        <DialogHeader><DialogTitle>Nuovo soggiorno (prenotazione diretta)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Struttura *</Label>
            <Select value={structureId || 'none'} onValueChange={(v) => { setStructureId(v === 'none' ? '' : v); setUnitId(''); }}>
              <SelectTrigger data-testid="soggiorno-structure-select"><SelectValue placeholder="Seleziona" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {structures.map((s) => <SelectItem key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {structUnits.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Unità</Label>
              <Select value={unitId || 'none'} onValueChange={(v) => setUnitId(v === 'none' ? '' : v)}>
                <SelectTrigger data-testid="soggiorno-unit-select"><SelectValue placeholder="Intera struttura" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Intera struttura</SelectItem>
                  {structUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Check-in *</Label>
              <Input type="date" value={inDate} onChange={(e) => setInDate(e.target.value)} data-testid="nuovo-in-date" />
              <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} data-testid="nuovo-in-time" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Check-out *</Label>
              <Input type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} data-testid="nuovo-out-date" />
              <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} data-testid="nuovo-out-time" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Persone</Label>
            <Input type="number" min={0} value={guests} onChange={(e) => setGuests(e.target.value)} data-testid="nuovo-guests" />
          </div>
          <div className="space-y-1.5" data-testid="nuovo-beds">
            <Label className="text-xs">Letti da preparare <span className="text-muted-foreground font-normal">(precompilati dalla configurazione, modificabili)</span></Label>
            <div className="grid grid-cols-3 gap-2">
              {[['beds_double', 'Matrimoniali'], ['beds_single', 'Singoli'], ['beds_sofa', 'Divani letto']].map(([k, lbl]) => (
                <div key={k} className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">{lbl}</span>
                  <Input type="number" min={0} value={beds[k]} onChange={(e) => setBeds((b) => ({ ...b, [k]: e.target.value }))} data-testid={`nuovo-${k.replace('_', '-')}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="resize-none" data-testid="nuovo-notes" />
          </div>
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-2.5" data-testid="soggiorno-auto-cleaning-hint">
            Se la struttura ha il servizio Pulizie attivo, la pulizia al check-out viene creata automaticamente e resta collegata al soggiorno.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="nuovo-soggiorno-submit">{saving ? '...' : 'Crea soggiorno'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const CalendarPage = () => {
  const [viewMode, setViewMode] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [indicatorsMap, setIndicatorsMap] = useState({});
  const [structures, setStructures] = useState([]);
  const [units, setUnits] = useState([]);
  const [clients, setClients] = useState([]);
  const [zones, setZones] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // filtri
  const [searchQ, setSearchQ] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [onlyToAssign, setOnlyToAssign] = useState(false);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [cleaningForm, setCleaningForm] = useState(null); // { defaultDate, prefill }
  const [cellChoice, setCellChoice] = useState(null); // { structureId, date }
  const [newSoggiorno, setNewSoggiorno] = useState(null); // { structureId, date }

  const viewDays = useMemo(() => {
    const days = [];
    if (viewMode === 'day') {
      days.push(new Date(currentDate));
    } else if (viewMode === 'week') {
      const start = getWeekStart(currentDate);
      for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
    } else {
      const monthStart = getMonthStart(currentDate);
      const gridStart = getWeekStart(monthStart);
      for (let i = 0; i < 42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); days.push(d); }
    }
    return days;
  }, [viewMode, currentDate]);

  const rangeLabel = useMemo(() => {
    if (viewMode === 'day') return `${currentDate.getDate()} ${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === 'month') return `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    const first = viewDays[0]; const last = viewDays[viewDays.length - 1];
    return `${first.getDate()} ${MONTHS_SHORT[first.getMonth()]} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
  }, [viewMode, currentDate, viewDays]);

  const fetchStatic = useCallback(async () => {
    try {
      const [sRes, uRes, cRes, zRes, clRes] = await Promise.all([
        api.get('/structures'), api.get('/units'), api.get('/clients'),
        api.get('/zones').catch(() => ({ data: [] })),
        api.get('/cleaning-tasks/cleaners').catch(() => ({ data: [] })),
      ]);
      setStructures(sRes.data); setUnits(uRes.data); setClients(cRes.data);
      setZones(zRes.data); setCleaners(clRes.data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const dateFrom = fmtDate(viewDays[0]);
      const dateTo = fmtDate(viewDays[viewDays.length - 1]);
      const [evRes, indRes] = await Promise.all([
        eventsApi.getAll({ date_from: dateFrom, date_to: dateTo, event_type: 'booking' }),
        api.get('/calendar/indicators', { params: { date_from: dateFrom, date_to: dateTo } }).catch(() => ({ data: {} })),
      ]);
      setEvents(evRes.data);
      setIndicatorsMap(indRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [viewDays]);

  useEffect(() => { fetchStatic(); }, [fetchStatic]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const structuresMap = useMemo(() => Object.fromEntries(structures.map((s) => [s.id, s])), [structures]);
  const clientsMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  // Filtri applicati agli eventi
  const filteredEvents = useMemo(() => events.filter((ev) => {
    const s = structuresMap[ev.structure_id];
    if (searchQ && !(s?.name || '').toLowerCase().includes(searchQ.toLowerCase()) && !(s?.klv_code || '').toLowerCase().includes(searchQ.toLowerCase())) return false;
    if (clientFilter && s?.client_id !== clientFilter) return false;
    if (zoneFilter && s?.zone_id !== zoneFilter && s?.zone !== zoneFilter) return false;
    const ind = indicatorsMap[ev.id];
    if (onlyToAssign && ind?.cleaning?.assigned) return false;
    if (onlyGaps && !(ind?.linen_gap || ind?.supplies_gap)) return false;
    if (onlyProblems && !(ind?.maintenance_open || ev.dates_changed || ev.feed_cancelled)) return false;
    return true;
  }), [events, structuresMap, searchQ, clientFilter, zoneFilter, onlyToAssign, onlyGaps, onlyProblems, indicatorsMap]);

  // Righe strutture (+ unità figlie se usate dagli eventi)
  const properties = useMemo(() => {
    const rows = [];
    const visibleStructIds = new Set(filteredEvents.map((e) => e.structure_id));
    const searchActive = searchQ || clientFilter || zoneFilter || onlyToAssign || onlyGaps || onlyProblems;
    structures.forEach((s) => {
      if (searchActive && !visibleStructIds.has(s.id)) {
        // con filtri attivi mostra solo strutture pertinenti (o che matchano la ricerca)
        const matchSearch = searchQ && ((s.name || '').toLowerCase().includes(searchQ.toLowerCase()) || (s.klv_code || '').toLowerCase().includes(searchQ.toLowerCase())) && !clientFilter && !zoneFilter && !onlyToAssign && !onlyGaps && !onlyProblems;
        if (!matchSearch) return;
      }
      rows.push({ key: `struct:${s.id}`, type: 'structure', id: s.id, name: s.name, clientName: clientsMap[s.client_id]?.display_name || '', structureId: s.id });
      units.filter((u) => u.structure_id === s.id && filteredEvents.some((e) => e.unit_id === u.id)).forEach((u) => {
        rows.push({ key: `unit:${u.id}`, type: 'unit', id: u.id, name: u.name, isChild: true, structureId: s.id });
      });
    });
    return rows;
  }, [structures, units, filteredEvents, clientsMap, searchQ, clientFilter, zoneFilter, onlyToAssign, onlyGaps, onlyProblems]);

  const eventsByProperty = useMemo(() => {
    const map = {};
    filteredEvents.forEach((ev) => {
      const key = getPropertyKey(ev);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [filteredEvents]);

  const toAssignCount = useMemo(() =>
    filteredEvents.filter((ev) => !(indicatorsMap[ev.id]?.cleaning?.assigned)).length,
  [filteredEvents, indicatorsMap]);

  const goPrev = useCallback(() => {
    setCurrentDate((d) => { const nd = new Date(d); if (viewMode === 'day') nd.setDate(nd.getDate() - 1); else if (viewMode === 'week') nd.setDate(nd.getDate() - 7); else nd.setMonth(nd.getMonth() - 1); return nd; });
  }, [viewMode]);
  const goNext = useCallback(() => {
    setCurrentDate((d) => { const nd = new Date(d); if (viewMode === 'day') nd.setDate(nd.getDate() + 1); else if (viewMode === 'week') nd.setDate(nd.getDate() + 7); else nd.setMonth(nd.getMonth() + 1); return nd; });
  }, [viewMode]);

  const drag = useCalendarDrag({ events: filteredEvents, fetchEvents, goPrev, goNext });

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/ical/sync-all');
      const r = res.data;
      toast.success(`Sync iCal: ${r.synced ?? r.results?.length ?? 0} feed sincronizzati${r.errors ? `, ${r.errors} errori` : ''}`);
      fetchEvents();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore sincronizzazione'); }
    finally { setSyncing(false); }
  };

  const openCreaPulizia = (ev, prep) => {
    const checkoutDate = (ev.end_time || '').slice(0, 10);
    setSelectedEvent(null);
    setCleaningForm({
      defaultDate: checkoutDate,
      prefill: {
        structure_id: ev.structure_id,
        guests_count: prep?.guests || ev.guests_count || undefined,
        beds_double: prep?.bd ?? ev.beds_double ?? undefined,
        beds_single: prep?.bs ?? ev.beds_single ?? undefined,
        beds_sofa: prep?.bsofa ?? ev.beds_sofa ?? undefined,
        booking_event_id: ev.id,
      },
    });
  };

  const handleCellAction = (prop, day) => {
    setCellChoice({ structureId: prop?.structureId || prop?.id || '', date: fmtDate(day) });
  };

  return (
    <div className="h-full flex flex-col" data-testid="calendar-page">
      {/* ===== HEADER ===== */}
      <div className="px-4 lg:px-6 pt-5 pb-3 border-b border-border bg-card space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl lg:text-2xl font-heading font-semibold">Calendario</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Soggiorni, check-in e check-out — da qui nascono le Pulizie</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-9 gap-1.5" onClick={handleSyncAll} disabled={syncing} data-testid="sync-ical-btn">
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />Sync iCal
            </Button>
            <Button className="h-9 gap-1.5" onClick={() => setCleaningForm({ defaultDate: fmtDate(currentDate), prefill: null })} data-testid="nuova-pulizia-btn">
              <Plus className="h-4 w-4" />Nuova pulizia
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={cn('px-4 py-2 text-sm font-medium transition-colors',
                  viewMode === v.key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground')}
                data-testid={`view-${v.key}`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} data-testid="cal-prev"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" className="h-9 px-4" onClick={() => setCurrentDate(new Date())} data-testid="cal-today">Oggi</Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNext} data-testid="cal-next"><ChevronRight className="h-4 w-4" /></Button>
            <span className="text-base font-semibold ml-2 capitalize" data-testid="cal-range-label">{rangeLabel}</span>
          </div>
          <div className="w-[100px] hidden lg:block" />
        </div>

        {/* Filtri */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Cerca struttura..." className="h-8 pl-8 w-[190px] text-sm" data-testid="cal-search" />
          </div>
          <Select value={clientFilter || 'all'} onValueChange={(v) => setClientFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 w-[160px] text-sm" data-testid="cal-client-filter"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i clienti</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {zones.length > 0 && (
            <Select value={zoneFilter || 'all'} onValueChange={(v) => setZoneFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 w-[140px] text-sm" data-testid="cal-zone-filter"><SelectValue placeholder="Rione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i rioni</SelectItem>
                {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {[
            { st: onlyToAssign, set: setOnlyToAssign, label: 'Pulizia da assegnare', tid: 'filter-to-assign' },
            { st: onlyGaps, set: setOnlyGaps, label: 'Con fabbisogno', tid: 'filter-gaps' },
            { st: onlyProblems, set: setOnlyProblems, label: 'Con problemi', tid: 'filter-problems' },
          ].map((f) => (
            <button
              key={f.tid}
              onClick={() => f.set(!f.st)}
              className={cn('text-xs px-2.5 py-1.5 rounded-full font-medium border transition-colors',
                f.st ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
              data-testid={f.tid}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alert discreto pulizie da assegnare */}
      {toAssignCount > 0 && !loading && (
        <div className="px-4 lg:px-6 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/60 dark:border-amber-800/50 flex items-center gap-2" data-testid="to-assign-alert">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {toAssignCount} soggiorn{toAssignCount === 1 ? 'o' : 'i'} nel periodo senza pulizia organizzata
          </p>
          <button className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline" onClick={() => setOnlyToAssign(true)}>Mostra</button>
        </div>
      )}

      {/* ===== BOARD ===== */}
      {viewMode === 'month' ? (
        <MonthGrid
          days={viewDays}
          events={filteredEvents}
          indicatorsMap={indicatorsMap}
          refMonth={currentDate.getMonth()}
          onEventClick={(ev) => setSelectedEvent(ev)}
          onCellDblClick={(day) => handleCellAction(null, day)}
          onPanStart={drag.handlePanStart} onPanMove={drag.handlePanMove} onPanEnd={drag.handlePanEnd}
          onDrop={drag.handleDrop} onDragOver={drag.handleDragOver}
          onDragStart={drag.handleDragStart} onDragEnd={drag.handleDragEnd}
          dragOverCell={drag.dragOverCell}
        />
      ) : (
        <PlanningBoard
          viewMode={viewMode}
          days={viewDays}
          properties={properties}
          eventsByProperty={eventsByProperty}
          indicatorsMap={indicatorsMap}
          loading={loading}
          onEventClick={(ev) => setSelectedEvent(ev)}
          onCellDblClick={handleCellAction}
          onPanStart={drag.handlePanStart} onPanMove={drag.handlePanMove} onPanEnd={drag.handlePanEnd}
          onDrop={drag.handleDrop} onDragOver={drag.handleDragOver}
          onDragStart={drag.handleDragStart} onDragEnd={drag.handleDragEnd}
          dragOverCell={drag.dragOverCell}
        />
      )}

      {/* Drawer soggiorno */}
      {selectedEvent && (
        <SoggiornoDrawer
          event={{ ...selectedEvent, structure_name: structuresMap[selectedEvent.structure_id]?.name }}
          indicators={indicatorsMap[selectedEvent.id]}
          onClose={() => setSelectedEvent(null)}
          onChanged={() => { setSelectedEvent(null); fetchEvents(); }}
          onCreaPulizia={openCreaPulizia}
        />
      )}

      {/* Nuova pulizia (drawer condiviso col modulo Pulizie) */}
      {cleaningForm && (
        <TaskFormDrawer
          task={null}
          defaultDate={cleaningForm.defaultDate}
          prefill={cleaningForm.prefill}
          structures={structures}
          cleaners={cleaners}
          zones={zones}
          onClose={() => setCleaningForm(null)}
          onSaved={() => { setCleaningForm(null); fetchEvents(); toast.success('Pulizia creata'); }}
        />
      )}

      {/* Scelta rapida su cella */}
      <Dialog open={!!cellChoice} onOpenChange={(v) => !v && setCellChoice(null)}>
        <DialogContent className="max-w-xs" data-testid="cell-choice-dialog">
          <DialogHeader><DialogTitle>Cosa vuoi creare?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Button
              className="w-full h-10 gap-2 justify-start"
              onClick={() => {
                setCleaningForm({ defaultDate: cellChoice.date, prefill: cellChoice.structureId ? { structure_id: cellChoice.structureId } : null });
                setCellChoice(null);
              }}
              data-testid="cell-nuova-pulizia"
            >
              <Sparkles className="h-4 w-4" />Nuova pulizia
            </Button>
            <Button
              variant="outline"
              className="w-full h-10 gap-2 justify-start"
              onClick={() => { setNewSoggiorno({ structureId: cellChoice.structureId, date: cellChoice.date }); setCellChoice(null); }}
              data-testid="cell-nuovo-soggiorno"
            >
              <BedDouble className="h-4 w-4" />Nuovo soggiorno
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NuovoSoggiornoDialog
        open={!!newSoggiorno}
        onClose={() => setNewSoggiorno(null)}
        structures={structures}
        units={units}
        defaultStructureId={newSoggiorno?.structureId}
        defaultDate={newSoggiorno?.date}
        onCreated={() => { setNewSoggiorno(null); fetchEvents(); }}
      />
    </div>
  );
};

export default CalendarPage;
