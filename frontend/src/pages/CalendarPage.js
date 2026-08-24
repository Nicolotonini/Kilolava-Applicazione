import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { eventsApi, structuresApi, unitsApi, automationApi } from '../lib/api';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { DateTimePicker } from '../components/ui/date-time-picker';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Plus,
  Sparkles, Loader2, Bed, AlertCircle, CheckCircle2, RotateCw, RefreshCw, Zap, Lock, User,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ExportButton } from '../components/ExportButton';

import { DetailPanel } from './calendar/DetailPanel';
import { PlanningBoard } from './calendar/PlanningBoard';
import { MonthGrid } from './calendar/MonthGrid';
import { useCalendarDrag } from './calendar/useCalendarDrag';
import {
  EVENT_TYPES, EVENT_STATUSES, EVENT_ICONS, STATUS_ICONS, SOURCE_COLORS, TYPE_COLORS,
  SERVICE_ICONS,
  WEEKDAYS_FULL, MONTHS, MONTHS_SHORT,
  fmtDate, fmtTime, fmtEU, isSameDay, getEventColors, getEventDaySpan, getMonthStart, getWeekStart, getPropertyKey,
} from './calendar/calendarHelpers';

const CalendarPage = () => {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState('week');
  const [refDate, setRefDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [properties, setProperties] = useState([]);
  const [structuresMap, setStructuresMap] = useState({});
  const [loading, setLoading] = useState(true);

  const [detailEvent, setDetailEvent] = useState(null);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [automationPanelOpen, setAutomationPanelOpen] = useState(false);
  const [automationResult, setAutomationResult] = useState(null);
  const [generating, setGenerating] = useState(false);

  const [formData, setFormData] = useState({
    event_type: 'cleaning', title: '', structure_id: '', unit_id: '',
    start_time: '', end_time: '', assigned_operator: '', status: 'pending', notes: '', source: '',
  });
  const [allStructures, setAllStructures] = useState([]);
  const [unitsByStructure, setUnitsByStructure] = useState({});
  const [saving, setSaving] = useState(false);

  // Compute days based on view mode
  const viewDays = useMemo(() => {
    if (viewMode === 'day') return [new Date(refDate)];
    if (viewMode === 'month') {
      const monthStart = getMonthStart(refDate);
      const firstDay = new Date(monthStart);
      const startDow = (firstDay.getDay() + 6) % 7;
      firstDay.setDate(firstDay.getDate() - startDow);
      const days = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(firstDay);
        d.setDate(d.getDate() + i);
        days.push(d);
      }
      return days;
    }
    const ws = getWeekStart(refDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [viewMode, refDate]);

  const dateFrom = fmtDate(viewDays[0]);
  const dateTo = fmtDate(viewDays[viewDays.length - 1]);

  const fetchProperties = useCallback(async () => {
    try {
      const sRes = await structuresApi.getAll();
      const structs = sRes.data;
      setAllStructures(structs);
      const sMap = {};
      structs.forEach(s => { sMap[s.id] = s; });
      setStructuresMap(sMap);

      const rows = [];
      const uMap = {};
      for (const s of structs) {
        const isMulti = ['guesthouse', 'hotel'].includes(s.structure_type);
        if (isMulti && s.unit_count > 0) {
          const uRes = await unitsApi.getAll({ structure_id: s.id });
          uMap[s.id] = uRes.data;
          rows.push({ type: 'structure', id: s.id, key: `struct:${s.id}`, name: s.name, clientName: s.client_name, isParent: true, structure: s });
          for (const u of uRes.data) {
            rows.push({ type: 'unit', id: u.id, structureId: s.id, key: `unit:${u.id}`, name: u.name, isChild: true, structure: s });
          }
        } else {
          rows.push({ type: 'structure', id: s.id, key: `struct:${s.id}`, name: s.name, clientName: s.client_name, isParent: false, structure: s });
        }
      }
      setProperties(rows);
      setUnitsByStructure(uMap);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await eventsApi.getAll({ date_from: dateFrom, date_to: dateTo });
      setEvents(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    if (formData.structure_id && !unitsByStructure[formData.structure_id]) {
      unitsApi.getAll({ structure_id: formData.structure_id }).then(res => {
        setUnitsByStructure(prev => ({ ...prev, [formData.structure_id]: res.data }));
      });
    }
  }, [formData.structure_id, unitsByStructure]);

  const eventsByProperty = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const key = getPropertyKey(ev);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  const autoTaskMap = useMemo(() => {
    const map = {};
    for (const ev of events) {
      if (ev.auto_generated && ev.generated_from && ev.rule) {
        if (!map[ev.generated_from]) map[ev.generated_from] = {};
        map[ev.generated_from][ev.rule] = ev;
      }
    }
    return map;
  }, [events]);

  // Navigation
  const goToday = () => setRefDate(new Date());
  const stepDays = useMemo(() => (viewMode === 'day' ? 1 : viewMode === 'month' ? 0 : 7), [viewMode]);
  const goPrev = useCallback(() => {
    setRefDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
      else d.setDate(d.getDate() - stepDays);
      return d;
    });
  }, [viewMode, stepDays]);
  const goNext = useCallback(() => {
    setRefDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
      else d.setDate(d.getDate() + stepDays);
      return d;
    });
  }, [viewMode, stepDays]);

  const headerLabel = useMemo(() => {
    if (viewMode === 'day') {
      const d = viewDays[0];
      return `${WEEKDAYS_FULL[(d.getDay()+6)%7]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    }
    if (viewMode === 'month') {
      return `${MONTHS[refDate.getMonth()]} ${refDate.getFullYear()}`;
    }
    const a = viewDays[0], b = viewDays[viewDays.length - 1];
    return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} - ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]} ${b.getFullYear()}`;
  }, [viewMode, viewDays, refDate]);

  const drag = useCalendarDrag({ events, fetchEvents, goPrev, goNext });

  // Panels
  const openEventDetail = (ev) => { setDetailEvent(ev); setEditMode(false); setCreatePanelOpen(false); };

  const openCreatePanel = (propertyRow, dayDate) => {
    const dayStr = fmtDate(dayDate);
    const structId = propertyRow?.type === 'unit' ? propertyRow.structureId : propertyRow?.id || '';
    const unitId = propertyRow?.type === 'unit' ? propertyRow.id : '';
    setFormData({
      event_type: 'cleaning', title: '',
      structure_id: structId, unit_id: unitId,
      start_time: `${dayStr}T09:00`, end_time: `${dayStr}T11:00`,
      assigned_operator: '', status: 'pending', notes: '', source: 'manual',
    });
    setDetailEvent(null);
    setCreatePanelOpen(true);
  };

  const openCreateGeneric = () => {
    const dayStr = fmtDate(viewDays[0]);
    setFormData({
      event_type: 'cleaning', title: '', structure_id: '', unit_id: '',
      start_time: `${dayStr}T09:00`, end_time: `${dayStr}T11:00`,
      assigned_operator: '', status: 'pending', notes: '', source: 'manual',
    });
    setDetailEvent(null);
    setCreatePanelOpen(true);
  };

  const openEditMode = () => {
    if (!detailEvent) return;
    setFormData({
      event_type: detailEvent.event_type, title: detailEvent.title,
      structure_id: detailEvent.structure_id, unit_id: detailEvent.unit_id || '',
      start_time: detailEvent.start_time?.slice(0, 16) || '',
      end_time: detailEvent.end_time?.slice(0, 16) || '',
      assigned_operator: detailEvent.assigned_operator || '',
      status: detailEvent.status, notes: detailEvent.notes || '',
      source: detailEvent.source || '',
    });
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.structure_id) { toast.error(t('common.required')); return; }
    setSaving(true);
    try {
      const payload = { ...formData };
      if (!payload.unit_id) delete payload.unit_id;
      if (!payload.assigned_operator) delete payload.assigned_operator;
      if (!payload.source) delete payload.source;
      if (editMode && detailEvent) {
        const res = await eventsApi.update(detailEvent.id, payload);
        toast.success(t('calendar.updateSuccess'));
        setDetailEvent(res.data);
        setEditMode(false);
      } else {
        await eventsApi.create(payload);
        toast.success(t('calendar.createSuccess'));
        setCreatePanelOpen(false);
      }
      fetchEvents();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!detailEvent) return;
    try {
      await eventsApi.delete(detailEvent.id);
      toast.success(t('calendar.deleteSuccess'));
      setDetailEvent(null);
      setDeleteDialogOpen(false);
      fetchEvents();
    } catch { toast.error(t('common.error')); }
  };

  const handleQuickStatus = async (eventId, newStatus) => {
    try {
      const res = await eventsApi.update(eventId, { status: newStatus });
      if (detailEvent?.id === eventId) setDetailEvent(res.data);
      fetchEvents();
    } catch { toast.error(t('common.error')); }
  };

  const handleQuickAssign = async (eventId, operator) => {
    try {
      const res = await eventsApi.update(eventId, { assigned_operator: operator, status: 'assigned' });
      toast.success(t('calendar.updateSuccess'));
      if (detailEvent?.id === eventId) setDetailEvent(res.data);
      fetchEvents();
    } catch { toast.error(t('common.error')); }
  };

  const handleRegenerateTasks = async (bookingId) => {
    try {
      const res = await eventsApi.regenerateTasks(bookingId);
      toast.success(`${res.data.created_count} task creati`);
      fetchEvents();
    } catch { toast.error('Errore nella generazione task'); }
  };

  // Automation
  const handleGeneratePreview = async () => {
    setGenerating(true);
    try {
      const res = await automationApi.generate(dateFrom, dateTo, true);
      setAutomationResult(res.data);
      setAutomationPanelOpen(true);
    } catch { toast.error(t('common.error')); }
    finally { setGenerating(false); }
  };
  const handleGenerateConfirm = async () => {
    setGenerating(true);
    try {
      const res = await automationApi.generate(dateFrom, dateTo, false);
      setAutomationResult(res.data);
      toast.success(`${res.data.generated_count} ${t('calendar.automation.generated').toLowerCase()}`);
      fetchEvents();
    } catch { toast.error(t('common.error')); }
    finally { setGenerating(false); }
  };
  const handleClearAutoTasks = async () => {
    try {
      const res = await automationApi.clear(dateFrom, dateTo);
      toast.success(`${res.data.deleted_count} task rimossi`);
      setAutomationResult(null);
      fetchEvents();
    } catch { toast.error(t('common.error')); }
  };

  // iCal
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const handleIcalSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/ical/sync-all');
      setSyncResult(res.data);
      setSyncPanelOpen(true);
      fetchEvents();
      const msg = `${res.data.total_created} nuove, ${res.data.total_updated} aggiornate, ${res.data.total_removed} rimosse`;
      if (res.data.total_created > 0 || res.data.total_updated > 0) toast.success(`Sync iCal completata: ${msg}`);
      else toast.info(`Sync iCal: nessuna modifica`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore sync iCal');
    } finally { setSyncing(false); }
  };

  const autoCount = useMemo(() => events.filter(e => e.auto_generated || e.source === 'automation').length, [events]);
  const icalCount = useMemo(() => events.filter(e => e.ical_uid).length, [events]);
  const unassignedCount = useMemo(() => events.filter(e => !e.assigned_operator && !['completed','cancelled'].includes(e.status) && e.event_type !== 'booking').length, [events]);
  const availableUnits = unitsByStructure[formData.structure_id] || [];

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-screen flex flex-col" data-testid="calendar-page">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 lg:px-5 py-2.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-base lg:text-lg font-heading font-semibold">{t('calendar.title')}</h1>

          <div className="flex items-center bg-muted/50 rounded-md p-0.5" data-testid="view-mode-tabs">
            {[
              { key: 'day', label: 'Giorno' },
              { key: 'week', label: 'Settimana' },
              { key: 'month', label: 'Mese' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={cn(
                  "h-7 px-3 text-xs font-medium rounded transition-colors",
                  viewMode === v.key ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                data-testid={`view-mode-${v.key}`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-2">
            <Button variant="ghost" size="icon" onClick={goPrev} className="h-7 w-7" data-testid="prev-btn">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={isSameDay(refDate, new Date()) ? 'secondary' : 'ghost'}
              size="sm" onClick={goToday} className="h-7 text-xs px-3" data-testid="today-btn"
            >
              {t('calendar.today')}
            </Button>
            <Button variant="ghost" size="icon" onClick={goNext} className="h-7 w-7" data-testid="next-btn">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm font-medium text-muted-foreground hidden sm:block">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="events" params={{ month: `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}` }} />
          {unassignedCount > 0 && (
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1" data-testid="unassigned-count">
              <AlertCircle className="h-3.5 w-3.5" />{unassignedCount} {t('calendar.unassigned').toLowerCase()}
            </span>
          )}
          {autoCount > 0 && (
            <span className="text-xs font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1" data-testid="auto-count">
              <Zap className="h-3.5 w-3.5" />{autoCount} auto
            </span>
          )}
          {icalCount > 0 && (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1" data-testid="ical-count">
              <Bed className="h-3.5 w-3.5" />{icalCount} iCal
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleIcalSyncAll} disabled={syncing} className="h-8 text-xs gap-1.5" data-testid="ical-sync-btn">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Sync iCal
          </Button>
          <Button variant="outline" size="sm" onClick={handleGeneratePreview} disabled={generating} className="h-8 text-xs gap-1.5" data-testid="automation-btn">
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}{t('calendar.automation.generate')}
          </Button>
          <Button onClick={openCreateGeneric} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="add-event-btn">
            <Plus className="h-4 w-4 mr-1" />{t('calendar.addEvent')}
          </Button>
        </div>
      </div>

      {viewMode === 'month' ? (
        <MonthGrid
          days={viewDays}
          events={events}
          autoTaskMap={autoTaskMap}
          structuresMap={structuresMap}
          refMonth={refDate.getMonth()}
          onEventClick={openEventDetail}
          onCellDblClick={(d) => openCreatePanel(null, d)}
          onPanStart={drag.handlePanStart}
          onPanMove={drag.handlePanMove}
          onPanEnd={drag.handlePanEnd}
          onDrop={drag.handleDrop}
          onDragOver={drag.handleDragOver}
          onDragStart={drag.handleDragStart}
          onDragEnd={drag.handleDragEnd}
          dragOverCell={drag.dragOverCell}
        />
      ) : (
        <PlanningBoard
          viewMode={viewMode}
          days={viewDays}
          properties={properties}
          eventsByProperty={eventsByProperty}
          autoTaskMap={autoTaskMap}
          structuresMap={structuresMap}
          loading={loading}
          onEventClick={openEventDetail}
          onCellDblClick={openCreatePanel}
          onAddCell={openCreatePanel}
          onPanStart={drag.handlePanStart}
          onPanMove={drag.handlePanMove}
          onPanEnd={drag.handlePanEnd}
          onDrop={drag.handleDrop}
          onDragOver={drag.handleDragOver}
          onDragStart={drag.handleDragStart}
          onDragEnd={drag.handleDragEnd}
          dragOverCell={drag.dragOverCell}
        />
      )}

      {/* Event Detail Panel */}
      <DetailPanel open={!!detailEvent && !editMode} onClose={() => setDetailEvent(null)} title={detailEvent ? t(`calendar.types.${detailEvent.event_type}`) : ''}>
        {detailEvent && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                {(() => { const Icon = EVENT_ICONS[detailEvent.event_type]; const c = getEventColors(detailEvent); return <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", c.bg)}><Icon className={cn("h-5 w-5", c.text)} /></div>; })()}
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="font-semibold">{detailEvent.title}</h3>
                    {(detailEvent.auto_generated || detailEvent.source === 'automation') && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 rounded">
                        <Zap className="h-2.5 w-2.5" />Auto
                      </span>
                    )}
                    {detailEvent.manually_modified && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded">
                        <Lock className="h-2.5 w-2.5" />Modif. manuale
                      </span>
                    )}
                  </div>
                  <span className={cn("text-xs font-medium", getEventColors(detailEvent).text)}>
                    {t(`calendar.types.${detailEvent.event_type}`)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Check-in</p>
                  <p className="font-medium">{fmtEU(detailEvent.start_time)}{detailEvent.start_time?.includes('T') ? ` · ${fmtTime(detailEvent.start_time)}` : ''}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Check-out</p>
                  <p className="font-medium">{fmtEU(detailEvent.end_time)}{detailEvent.end_time?.includes('T') ? ` · ${fmtTime(detailEvent.end_time)}` : ''}</p>
                </div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{t('calendar.structure')}</p><p className="font-medium">{detailEvent.structure_name || '-'}</p></div>
                {detailEvent.unit_name && <div><p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">{t('calendar.unit')}</p><p className="font-medium">{detailEvent.unit_name}</p></div>}
              </div>

              {detailEvent.event_type === 'booking' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Servizi al checkout</p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRegenerateTasks(detailEvent.id)} data-testid="regenerate-tasks-btn">
                      <RotateCw className="h-3.5 w-3.5 mr-1" />Rigenera
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SERVICE_ICONS.map(({ key, rule, Icon, color, bg, label }) => {
                      const task = autoTaskMap[detailEvent.id]?.[rule];
                      const struct = structuresMap[detailEvent.structure_id];
                      const active = struct?.services?.includes(
                        key === 'linen' ? 'private_laundry' : (key === 'maintenance' ? 'maintenance' : key)
                      ) || (key === 'linen' && struct?.services?.includes('rental_laundry'));
                      return (
                        <button
                          key={key}
                          onClick={() => task && openEventDetail(task)}
                          className={cn(
                            "flex items-center gap-2 px-2.5 py-2 rounded border text-left transition-colors",
                            task ? `${bg} border-current/30 hover:opacity-80` : 'bg-muted/30 border-border opacity-60 cursor-default',
                          )}
                          data-testid={`linked-task-${key}`}
                          disabled={!task}
                        >
                          <Icon className={cn("h-4 w-4 flex-shrink-0", task ? color : 'text-muted-foreground')} />
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs font-medium truncate", task ? color : 'text-muted-foreground')}>{label}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {task ? t(`calendar.statuses.${task.status}`) : (active ? 'Da generare' : 'Non configurato')}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {detailEvent.event_type !== 'booking' && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EVENT_STATUSES.filter(s => s !== 'cancelled').map(s => {
                      const SIcon = STATUS_ICONS[s];
                      return (
                        <button key={s} onClick={() => handleQuickStatus(detailEvent.id, s)} data-testid={`status-${s}`}
                          className={cn("inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            detailEvent.status === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
                          )}>
                          <SIcon className="h-3.5 w-3.5" />{t(`calendar.statuses.${s}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {detailEvent.event_type !== 'booking' && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{t('calendar.operator')}</p>
                  {detailEvent.assigned_operator ? (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">{detailEvent.assigned_operator.charAt(0).toUpperCase()}</div>
                      <span className="text-sm font-medium">{detailEvent.assigned_operator}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input placeholder="Nome operatore" className="h-8 text-sm flex-1" id="quick-assign-input"
                        onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) handleQuickAssign(detailEvent.id, e.target.value.trim()); }} />
                      <Button size="sm" className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="assign-btn"
                        onClick={() => { const inp = document.getElementById('quick-assign-input'); if (inp?.value?.trim()) handleQuickAssign(detailEvent.id, inp.value.trim()); }}>
                        {t('calendar.assign')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {detailEvent.source && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('calendar.source')}</p>
                  <span className={cn("inline-block px-2 py-0.5 text-xs rounded font-medium",
                    detailEvent.source === 'airbnb' && "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
                    detailEvent.source === 'booking_com' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                    !['airbnb','booking_com'].includes(detailEvent.source) && "bg-muted text-muted-foreground"
                  )}>
                    {SOURCE_COLORS[detailEvent.source]?.label || detailEvent.source}
                  </span>
                </div>
              )}

              {detailEvent.notes && (
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{t('clients.notes')}</p><p className="text-sm bg-muted/50 rounded-lg p-2.5 whitespace-pre-line">{detailEvent.notes}</p></div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-border flex gap-2 flex-shrink-0">
              <Button variant="outline" size="sm" onClick={openEditMode} className="flex-1 h-9" data-testid="edit-event-btn">{t('calendar.editEvent')}</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)} className="h-9 text-destructive border-destructive/30 hover:bg-destructive/10" data-testid="delete-event-btn">{t('calendar.deleteEvent')}</Button>
            </div>
          </div>
        )}
      </DetailPanel>

      {/* Create/Edit Panel */}
      <DetailPanel open={createPanelOpen || editMode} onClose={() => { setCreatePanelOpen(false); setEditMode(false); }} title={editMode ? t('calendar.editEvent') : t('calendar.addEvent')}>
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="space-y-2">
              <Label>{t('common.filter') || 'Tipo'}</Label>
              <Select value={formData.event_type} onValueChange={v => setFormData(p => ({ ...p, event_type: v }))}>
                <SelectTrigger data-testid="event-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_TYPES.map(et => <SelectItem key={et} value={et}>{t(`calendar.types.${et}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('calendar.eventTitle')} *</Label>
              <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} data-testid="event-title-input" />
            </div>
            <div className="space-y-2">
              <Label>{t('calendar.structure')} *</Label>
              <Select value={formData.structure_id} onValueChange={v => setFormData(p => ({ ...p, structure_id: v, unit_id: '' }))}>
                <SelectTrigger data-testid="event-structure-select"><SelectValue placeholder="Seleziona struttura" /></SelectTrigger>
                <SelectContent>{allStructures.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.client_name ? ` (${s.client_name})` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {availableUnits.length > 0 && (
              <div className="space-y-2">
                <Label>{t('calendar.unit')}</Label>
                <Select value={formData.unit_id || 'none'} onValueChange={v => setFormData(p => ({ ...p, unit_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-</SelectItem>
                    {availableUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {formData.event_type === 'booking' && (
              <div className="space-y-2">
                <Label>{t('calendar.source')}</Label>
                <Select value={formData.source || 'manual'} onValueChange={v => setFormData(p => ({ ...p, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{t('calendar.sources.manual')}</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                    <SelectItem value="booking_com">Booking.com</SelectItem>
                    <SelectItem value="direct">{t('calendar.sources.direct') || 'Diretto'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2"><Label>{t('calendar.startTime')}</Label>
                <DateTimePicker value={formData.start_time} onChange={(v) => setFormData(p => ({ ...p, start_time: v }))} data-testid="event-start-picker" />
              </div>
              <div className="space-y-2"><Label>{t('calendar.endTime')}</Label>
                <DateTimePicker value={formData.end_time} onChange={(v) => setFormData(p => ({ ...p, end_time: v }))} data-testid="event-end-picker" />
              </div>
            </div>
            <div className="space-y-2"><Label>{t('calendar.operator')}</Label><Input value={formData.assigned_operator} onChange={e => setFormData(p => ({ ...p, assigned_operator: e.target.value }))} placeholder="Nome operatore" /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EVENT_STATUSES.map(s => <SelectItem key={s} value={s}>{t(`calendar.statuses.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('clients.notes')}</Label><Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none" /></div>
          </div>
          <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
            <Button variant="outline" onClick={() => { setCreatePanelOpen(false); setEditMode(false); }} className="flex-1">{t('common.cancel')}</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-event-btn">
              {saving ? t('common.loading') : (editMode ? t('common.update') : t('common.create'))}
            </Button>
          </div>
        </div>
      </DetailPanel>

      {/* Automation Result Panel */}
      <DetailPanel open={automationPanelOpen} onClose={() => setAutomationPanelOpen(false)} title={t('calendar.automation.title')}>
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {automationResult && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{automationResult.generated_count}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('calendar.automation.generated')}</p>
                  </div>
                  <div className="bg-muted rounded-lg p-3 border border-border">
                    <p className="text-2xl font-bold tabular-nums">{automationResult.skipped_count}</p>
                    <p className="text-xs text-muted-foreground">{t('calendar.automation.skipped')}</p>
                  </div>
                </div>
                {automationResult.generated.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />{t('calendar.automation.generated')}
                    </h4>
                    <div className="space-y-1.5">
                      {automationResult.generated.map((task, i) => {
                        const colors = TYPE_COLORS[task.event_type] || TYPE_COLORS.cleaning;
                        const Icon = EVENT_ICONS[task.event_type] || Sparkles;
                        return (
                          <div key={i} className={cn("rounded-lg px-3 py-2 border-l-[3px]", colors.bg, colors.border)}>
                            <div className="flex items-center gap-1.5">
                              <Icon className={cn("h-3.5 w-3.5", colors.text)} />
                              <span className={cn("text-xs font-semibold", colors.text)}>{task.title}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{fmtEU(task.start_time)} · {fmtTime(task.start_time)}-{fmtTime(task.end_time)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {automationResult.generated_count === 0 && automationResult.skipped_count === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">{t('calendar.automation.noBookings')}</p>
                )}
              </>
            )}
          </div>
          <div className="px-5 py-3 border-t border-border flex gap-2 flex-shrink-0">
            {automationResult?.dry_run && automationResult?.generated_count > 0 && (
              <Button onClick={handleGenerateConfirm} disabled={generating} className="flex-1 h-9 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="confirm-generate-btn">
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
                {t('calendar.automation.generate')} ({automationResult.generated_count})
              </Button>
            )}
            {autoCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleClearAutoTasks} className="h-9 text-xs" data-testid="clear-auto-btn">
                <RotateCw className="h-3.5 w-3.5 mr-1" />{t('calendar.automation.clearPending')}
              </Button>
            )}
          </div>
        </div>
      </DetailPanel>

      {/* iCal Sync Result Panel */}
      <DetailPanel open={syncPanelOpen} onClose={() => setSyncPanelOpen(false)} title="Sincronizzazione iCal">
        <div className="p-5 space-y-4">
          {syncResult && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{syncResult.total_created}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">Nuove</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">{syncResult.total_updated}</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Aggiornate</p>
                </div>
                <div className="bg-muted rounded-lg p-3 border border-border">
                  <p className="text-2xl font-bold tabular-nums">{syncResult.total_removed}</p>
                  <p className="text-xs text-muted-foreground">Rimosse</p>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dettaglio per struttura</h4>
                {syncResult.results?.map((r, i) => (
                  <div key={i} className={cn("rounded-lg px-3 py-2.5 border", r.status === 'error' ? 'border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10' : 'border-border bg-muted/30')}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{r.structure_name || r.structure_id}</span>
                      {r.status === 'error'
                        ? <span className="text-xs text-red-600 font-medium">Errore</span>
                        : <span className="text-xs text-emerald-600 font-medium flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />OK</span>
                      }
                    </div>
                    {r.status === 'error' ? (
                      <p className="text-xs text-red-500 mt-1">{r.error}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {r.events_in_feed} nel feed | +{r.created} nuove, ~{r.updated} aggiornate, -{r.removed} rimosse{r.auto_tasks_created ? `, ${r.auto_tasks_created} task auto` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </DetailPanel>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('calendar.deleteEvent')}</AlertDialogTitle>
            <AlertDialogDescription>{t('calendar.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-event-btn">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CalendarPage;
