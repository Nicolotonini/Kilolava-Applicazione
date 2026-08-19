import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api, { fileUrl } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Plus, Users, BedDouble, Clock, AlertTriangle, Copy, Repeat, XCircle, Pencil,
  ChevronLeft, ChevronRight, Loader2, Video, Package, CheckCircle2, Sparkles, Eye,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export const STATUS_META = {
  unassigned: { label: 'Da fare', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  assigned: { label: 'Da fare', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  in_progress: { label: 'In corso', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed: { label: 'Completata', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  issue_reported: { label: 'Problema', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  needs_review: { label: 'Problema', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Annullata', cls: 'bg-muted text-muted-foreground line-through' },
};

const ISSUE_CAT = {
  missing: { label: 'Mancanza', cls: 'bg-sky-100 text-sky-700' },
  damage: { label: 'Rottura / Danno', cls: 'bg-red-100 text-red-700' },
  malfunction: { label: 'Malfunzionamento', cls: 'bg-amber-100 text-amber-700' },
  other: { label: 'Anomalia / Altro', cls: 'bg-violet-100 text-violet-700' },
};

const todayStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const tomorrowStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(Date.now() + 86400000));
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '');

export const checkinLabel = (task) => {
  const isToday = task.date === todayStr();
  if (task.checkin_today) {
    if (isToday) return `Entrano oggi${task.checkin_time ? ` alle ${task.checkin_time}` : ''}`;
    return `Check-in${task.checkin_time ? ` ${task.checkin_time}` : ' lo stesso giorno'}`;
  }
  return isToday ? 'Oggi non entrano ospiti' : 'Nessun check-in';
};

const fmtDuration = (task) =>
  task.started_at && task.finished_at && task.duration_minutes != null
    ? (task.duration_minutes > 0 ? `${task.duration_minutes} min` : '< 1 min')
    : null;

export default function CleaningPage() {
  const [tab, setTab] = useState('today');
  const [tasks, setTasks] = useState([]);
  const [structures, setStructures] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const [formTask, setFormTask] = useState(null); // null | {} new | task edit
  const [detailTask, setDetailTask] = useState(null);
  const [recurTask, setRecurTask] = useState(null);
  const [dupTask, setDupTask] = useState(null);
  const [seriesTask, setSeriesTask] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let params = {};
      if (tab === 'today') params = { date: todayStr() };
      else if (tab === 'tomorrow') params = { date: tomorrowStr() };
      else if (tab === 'calendar') params = { date_from: `${month}-01`, date_to: `${month}-31` };
      const res = await api.get('/cleaning-tasks', { params });
      setTasks(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [tab, month]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([api.get('/structures'), api.get('/cleaning-tasks/cleaners')])
      .then(([s, c]) => { setStructures(s.data); setCleaners(c.data); })
      .catch(e => console.error(e));
  }, []);

  const cancelTask = async (task) => {
    if (!window.confirm(`Annullare la pulizia di ${task.structure_name || ''} del ${task.date}?`)) return;
    try {
      await api.put(`/cleaning-tasks/${task.id}`, { status: 'cancelled' });
      toast.success('Pulizia annullata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const grouped = useMemo(() => {
    if (tab !== 'calendar' && tab !== 'all') return null;
    const byDate = {};
    tasks.forEach(t => { (byDate[t.date] = byDate[t.date] || []).push(t); });
    return Object.entries(byDate).sort((a, b) => (tab === 'all' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])));
  }, [tasks, tab]);

  return (
    <div className="p-4 lg:p-8 space-y-5" data-testid="cleaning-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Pulizie</h1>
          <p className="text-sm text-muted-foreground">Pianificazione, esecuzione e segnalazioni</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => (window.location.href = '/checklist-templates')} data-testid="manage-templates-btn">Checklist</Button>
          <Button onClick={() => setFormTask({})} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="new-cleaning-btn">
            <Plus className="h-4 w-4 mr-1.5" />Nuova pulizia
          </Button>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {[
          { key: 'today', label: 'Oggi' },
          { key: 'tomorrow', label: 'Domani' },
          { key: 'calendar', label: 'Calendario' },
          { key: 'all', label: 'Tutte' },
          { key: 'issues', label: 'Segnalazioni' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            data-testid={`cleaning-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'issues' ? (
        <IssuesAdmin />
      ) : (
        <>
          {tab === 'calendar' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(m => shiftMonth(m, -1))} data-testid="cal-prev"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-semibold capitalize w-36 text-center">{new Date(`${month}-01T00:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth(m => shiftMonth(m, 1))} data-testid="cal-next"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
          {loading ? (
            <p className="text-center py-12 text-muted-foreground">Caricamento...</p>
          ) : tasks.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl" data-testid="cleaning-empty">
              <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nessuna pulizia {tab === 'today' ? 'per oggi' : tab === 'tomorrow' ? 'per domani' : 'nel periodo'}.</p>
            </div>
          ) : grouped ? (
            <div className="space-y-5">
              {grouped.map(([date, list]) => (
                <div key={date}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 capitalize">{fmtDate(date)} · {date}</p>
                  <div className="space-y-2">
                    {list.map(t => (
                      <TaskRow key={t.id} task={t} onDetail={() => setDetailTask(t)} onEdit={() => setFormTask(t)} onDuplicate={() => setDupTask(t)} onRecur={() => setRecurTask(t)} onSeries={() => setSeriesTask(t)} onCancel={() => cancelTask(t)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map(t => (
                <TaskRow key={t.id} task={t} onDetail={() => setDetailTask(t)} onEdit={() => setFormTask(t)} onDuplicate={() => setDupTask(t)} onRecur={() => setRecurTask(t)} onSeries={() => setSeriesTask(t)} onCancel={() => cancelTask(t)} />
              ))}
            </div>
          )}
        </>
      )}

      {formTask !== null && (
        <TaskFormDialog
          task={formTask.id ? formTask : null}
          structures={structures}
          cleaners={cleaners}
          onClose={() => setFormTask(null)}
          onSaved={() => { setFormTask(null); load(); }}
        />
      )}
      {detailTask && <TaskDetailDialog taskId={detailTask.id} onClose={() => setDetailTask(null)} />}
      {dupTask && <DuplicateDialog task={dupTask} onClose={() => setDupTask(null)} onDone={() => { setDupTask(null); load(); }} />}
      {recurTask && <RecurrenceDialog task={recurTask} onClose={() => setRecurTask(null)} onDone={() => { setRecurTask(null); load(); }} />}
      {seriesTask && <SeriesDialog task={seriesTask} onClose={() => setSeriesTask(null)} />}
    </div>
  );
}

function shiftMonth(m, delta) {
  const d = new Date(`${m}-01T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
}

function TaskRow({ task, onDetail, onEdit, onDuplicate, onRecur, onSeries, onCancel }) {
  const sm = STATUS_META[task.status] || STATUS_META.unassigned;
  const beds = [];
  if (task.beds_double) beds.push(`${task.beds_double} matr.`);
  if (task.beds_single) beds.push(`${task.beds_single} sing.`);
  if (task.beds_sofa) beds.push(`${task.beds_sofa} div.`);
  return (
    <Card className="border shadow-none hover:border-primary/40 transition-colors cursor-pointer" onClick={onDetail} data-testid={`cleaning-row-${task.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {task.klv_code && <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold">{task.klv_code}</span>}
              <p className="font-semibold text-[15px]">{task.structure_name || 'Struttura non impostata'}</p>
              <Badge className={cn('text-[10px] border-0', sm.cls)}>{sm.label}</Badge>
              {task.open_issues_count > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-red-600" data-testid={`row-issues-${task.id}`}>
                  <AlertTriangle className="h-3.5 w-3.5" />{task.open_issues_count} segnalazioni
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {task.client_name && <span>{task.client_name}</span>}
              <span className="capitalize">{fmtDate(task.date)}</span>
              {task.scheduled_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{task.scheduled_time}</span>}
              {task.cleaner_name && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{task.cleaner_name}</span>}
              {task.guests_count ? <span>{task.guests_count} persone</span> : null}
              {beds.length > 0 && <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" />{beds.join(' + ')}</span>}
              <span className={cn('font-medium', task.checkin_today ? 'text-amber-600' : '')} data-testid={`row-checkin-${task.id}`}>
                {checkinLabel(task)}
              </span>
              {fmtDuration(task) && <span className="text-primary font-medium">{fmtDuration(task)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Dettagli" onClick={onDetail} data-testid={`detail-task-${task.id}`}><Eye className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Modifica" onClick={onEdit} data-testid={`edit-task-${task.id}`}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Duplica" onClick={onDuplicate} data-testid={`duplicate-task-${task.id}`}><Copy className="h-4 w-4" /></Button>
            {task.recurrence_series_id ? (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" title="Pulizia ricorrente" onClick={onSeries} data-testid={`series-task-${task.id}`}><Repeat className="h-4 w-4" /></Button>
            ) : (
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Crea ricorrenza" onClick={onRecur} data-testid={`recur-task-${task.id}`}><Repeat className="h-4 w-4" /></Button>
            )}
            {task.status !== 'cancelled' && task.status !== 'completed' && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Annulla" onClick={onCancel} data-testid={`cancel-task-${task.id}`}><XCircle className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BedInput({ label, value, max, onChange, testId }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}{max ? ` (max ${max})` : ''}</label>
      <Input
        type="number" min={0} max={max || undefined} value={value}
        onChange={e => {
          let v = parseInt(e.target.value) || 0;
          if (max && v > max) { toast.error(`La struttura ha massimo ${max} ${label.toLowerCase()}`); v = max; }
          onChange(v);
        }}
        className="h-9 mt-1" data-testid={testId}
      />
    </div>
  );
}

function TaskFormDialog({ task, structures, cleaners, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    structure_id: task?.structure_id || '',
    date: task?.date || todayStr(),
    scheduled_time: task?.scheduled_time || '',
    guests_count: task?.guests_count ?? '',
    beds_double: task?.beds_double ?? 0,
    beds_single: task?.beds_single ?? 0,
    beds_sofa: task?.beds_sofa ?? 0,
    checkin_today: task?.checkin_today || false,
    checkin_time: task?.checkin_time || '',
    assigned_cleaner_ids: task?.assigned_cleaner_ids || (task?.assigned_cleaner_id ? [task.assigned_cleaner_id] : []),
    notes: task?.notes || '',
  }));
  const [saving, setSaving] = useState(false);

  const structure = structures.find(s => s.id === form.structure_id);
  const bc = structure?.bed_config || {};

  const pickStructure = (sid) => {
    const s = structures.find(x => x.id === sid);
    const b = s?.bed_config || {};
    setForm(f => ({
      ...f,
      structure_id: sid,
      beds_double: task ? f.beds_double : (b.beds_double_min || 0),
      beds_single: task ? f.beds_single : (b.beds_single_min || 0),
      beds_sofa: task ? f.beds_sofa : (b.sofa_beds_min || 0),
      guests_count: task ? f.guests_count : (b.capacity_persons || f.guests_count),
    }));
  };

  const save = async () => {
    if (!form.structure_id) { toast.error('Seleziona la struttura'); return; }
    if (!form.date) { toast.error('Seleziona la data'); return; }
    setSaving(true);
    try {
      const payload = {
        structure_id: form.structure_id,
        date: form.date,
        scheduled_time: form.scheduled_time || null,
        guests_count: form.guests_count === '' ? null : parseInt(form.guests_count),
        beds_double: form.beds_double,
        beds_single: form.beds_single,
        beds_sofa: form.beds_sofa,
        checkin_today: form.checkin_today,
        checkin_time: form.checkin_today ? (form.checkin_time || null) : null,
        assigned_cleaner_ids: form.assigned_cleaner_ids,
        notes: form.notes || null,
      };
      if (task) await api.put(`/cleaning-tasks/${task.id}`, payload);
      else await api.post('/cleaning-tasks', payload);
      toast.success(task ? 'Pulizia aggiornata' : 'Pulizia creata');
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante il salvataggio');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="cleaning-form-dialog">
        <DialogHeader>
          <DialogTitle>{task ? 'Modifica pulizia' : 'Nuova pulizia'}</DialogTitle>
          <DialogDescription>Le info di accesso, keybox e magazzino arrivano automaticamente dalla scheda Struttura.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Struttura</label>
            <Select value={form.structure_id} onValueChange={pickStructure}>
              <SelectTrigger className="h-9 mt-1" data-testid="task-structure-select"><SelectValue placeholder="Seleziona struttura..." /></SelectTrigger>
              <SelectContent>
                {structures.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Data</label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-9 mt-1" data-testid="task-date-input" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Ora (opzionale)</label>
              <Input type="time" value={form.scheduled_time} onChange={e => setForm(f => ({ ...f, scheduled_time: e.target.value }))} className="h-9 mt-1" data-testid="task-time-input" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Persone</label>
              <Input type="number" min={0} value={form.guests_count} onChange={e => setForm(f => ({ ...f, guests_count: e.target.value }))} className="h-9 mt-1" data-testid="task-guests-input" />
            </div>
            <BedInput label="Matrimoniali" value={form.beds_double} max={bc.beds_double} onChange={v => setForm(f => ({ ...f, beds_double: v }))} testId="task-beds-double" />
            <BedInput label="Singoli" value={form.beds_single} max={bc.beds_single} onChange={v => setForm(f => ({ ...f, beds_single: v }))} testId="task-beds-single" />
            <BedInput label="Divani letto" value={form.beds_sofa} max={bc.sofa_beds} onChange={v => setForm(f => ({ ...f, beds_sofa: v }))} testId="task-beds-sofa" />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              Entrano oggi
              <Switch checked={form.checkin_today} onCheckedChange={v => setForm(f => ({ ...f, checkin_today: v }))} data-testid="task-checkin-switch" />
            </label>
            {form.checkin_today && (
              <div>
                <Input type="time" value={form.checkin_time} onChange={e => setForm(f => ({ ...f, checkin_time: e.target.value }))} className="h-9 w-32" data-testid="task-checkin-time" placeholder="Ora check-in" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Addette ({form.assigned_cleaner_ids.length} selezionate)</label>
            <div className="mt-1 space-y-1 max-h-40 overflow-y-auto border border-border rounded-lg p-2">
              {cleaners.length === 0 && <p className="text-xs text-muted-foreground">Nessuna addetta registrata</p>}
              {cleaners.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer" data-testid={`cleaner-option-${c.id}`}>
                  <input
                    type="checkbox"
                    checked={form.assigned_cleaner_ids.includes(c.id)}
                    onChange={e => setForm(f => ({
                      ...f,
                      assigned_cleaner_ids: e.target.checked
                        ? [...f.assigned_cleaner_ids, c.id]
                        : f.assigned_cleaner_ids.filter(x => x !== c.id),
                    }))}
                    className="accent-[#F24E75] w-4 h-4"
                  />
                  {c.name || `${c.first_name || ''} ${c.last_name || ''}`}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Note operative</label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="mt-1" data-testid="task-notes-input" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground" data-testid="save-task-btn">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salva
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TaskDetailDialog({ taskId, onClose }) {
  const [task, setTask] = useState(null);
  useEffect(() => {
    api.get(`/cleaning-tasks/${taskId}`).then(r => setTask(r.data)).catch(() => {});
  }, [taskId]);
  if (!task) return null;
  const sm = STATUS_META[task.status] || STATUS_META.unassigned;
  const media = task.media || [];
  const initial = media.find(m => m.media_type === 'initial_video');
  const final = media.find(m => m.media_type === 'final_video');
  const warehousePhotos = media.filter(m => m.media_type === 'warehouse_photo');
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="cleaning-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {task.klv_code && <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-sm font-bold">{task.klv_code}</span>}
            {task.structure_name}
            <Badge className={cn('text-[10px] border-0', sm.cls)}>{sm.label}</Badge>
          </DialogTitle>
          <DialogDescription className="capitalize">{fmtDate(task.date)} {task.scheduled_time ? `· ${task.scheduled_time}` : ''} {task.client_name ? `· ${task.client_name}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="Addette" value={task.cleaner_name || '—'} />
            <Info label="Persone" value={task.guests_count ?? '—'} />
            <Info label="Letti" value={`${task.beds_double || 0} matr. · ${task.beds_single || 0} sing. · ${task.beds_sofa || 0} div.`} />
            <Info label="Check-in" value={checkinLabel(task)} />
          </div>
          <div className="rounded-lg border border-border p-3 space-y-1" data-testid="detail-timing">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tempi (interni — non visibili al cliente)</p>
            <p className="text-xs">Inizio (video iniziale): <span className="font-medium">{task.started_at ? new Date(task.started_at).toLocaleString('it-IT') : '—'}</span>{task.started_by_name ? ` · ${task.started_by_name}` : ''}</p>
            <p className="text-xs">Fine (video finale): <span className="font-medium">{task.finished_at ? new Date(task.finished_at).toLocaleString('it-IT') : '—'}</span></p>
            <p className="text-sm font-semibold text-primary" data-testid="detail-duration">Durata: {fmtDuration(task) || 'Tempo non rilevato'}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documentazione</p>
            <div className="flex gap-2 flex-wrap">
              <MediaChip icon={Video} label="Video iniziale" media={initial} />
              <MediaChip icon={Video} label="Video finale" media={final} />
              <MediaChip icon={Package} label={`Foto magazzino (${warehousePhotos.length})`} media={warehousePhotos[0]} />
            </div>
            {warehousePhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {warehousePhotos.map(p => (
                  <a key={p.id} href={fileUrl(p.file_path)} target="_blank" rel="noreferrer">
                    <img src={fileUrl(p.file_path)} alt="magazzino" className="w-16 h-16 object-cover rounded-lg border border-border" />
                  </a>
                ))}
              </div>
            )}
          </div>
          {(task.task_notes || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note dell'addetta</p>
              {task.task_notes.map(n => (
                <div key={n.id} className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-xs">{n.text}</p>
                  {(n.media || []).length > 0 && (
                    <div className="flex gap-1.5 mt-1.5">
                      {n.media.map(m => (
                        <a key={m.id} href={fileUrl(m.file_path)} target="_blank" rel="noreferrer" className="text-[10px] underline text-primary">{m.kind === 'video' ? 'Video' : 'Foto'}</a>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{n.by_name} · {new Date(n.at).toLocaleString('it-IT')}</p>
                </div>
              ))}
            </div>
          )}
          {(task.issues || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segnalazioni</p>
              {task.issues.map(i => {
                const cat = ISSUE_CAT[i.category] || { label: i.category, cls: 'bg-muted text-muted-foreground' };
                return (
                  <div key={i.id} className="flex items-center gap-2 text-xs rounded-lg border border-border p-2">
                    <Badge className={cn('text-[10px] border-0', cat.cls)}>{cat.label}</Badge>
                    <span className="flex-1">{i.note}</span>
                    <span className="text-muted-foreground">{i.status === 'open' ? 'Aperta' : i.status}</span>
                  </div>
                );
              })}
            </div>
          )}
          <ChecklistProgress task={task} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function MediaChip({ icon: Icon, label, media }) {
  if (!media) {
    return <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-muted text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}: mancante</span>;
  }
  return (
    <a href={fileUrl(media.file_path)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-emerald-100 text-emerald-700 hover:opacity-80">
      <CheckCircle2 className="h-3.5 w-3.5" />{label}
    </a>
  );
}

function ChecklistProgress({ task }) {
  const cl = task.checklist;
  if (!cl) return null;
  const responses = cl.responses || {};
  let done = 0, total = 0;
  (cl.sections || []).forEach(sec => (sec.items || []).forEach(i => {
    if (!i.required) return;
    total += 1;
    const v = responses[`${sec.name}|${i.label}`];
    if (v !== undefined && v !== '' && v !== false) done += 1;
  }));
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Checklist — {cl.template_name}</p>
      <p className="text-sm font-medium">{done} / {total} voci obbligatorie completate</p>
    </div>
  );
}

function DuplicateDialog({ task, onClose, onDone }) {
  const [date, setDate] = useState(tomorrowStr());
  const [saving, setSaving] = useState(false);
  const go = async () => {
    setSaving(true);
    try {
      await api.post(`/cleaning-tasks/${task.id}/duplicate`, { date });
      toast.success(`Pulizia duplicata per il ${date}`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="duplicate-dialog">
        <DialogHeader><DialogTitle>Duplica pulizia</DialogTitle><DialogDescription>{task.structure_name} — copia della pianificazione</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" data-testid="duplicate-date-input" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={go} disabled={saving} className="bg-primary text-primary-foreground" data-testid="duplicate-confirm-btn">Duplica</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function RecurrenceDialog({ task, onClose, onDone }) {
  const [mode, setMode] = useState('weekly_days');
  const [weekdays, setWeekdays] = useState([]);
  const [interval, setInterval_] = useState(7);
  const [endType, setEndType] = useState('occurrences');
  const [untilDate, setUntilDate] = useState('');
  const [occurrences, setOccurrences] = useState(4);
  const [saving, setSaving] = useState(false);

  const go = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/cleaning-tasks/${task.id}/recurrence`, {
        mode,
        weekdays,
        interval_days: parseInt(interval) || 7,
        until_date: endType === 'until' ? untilDate || null : null,
        occurrences: endType === 'occurrences' ? parseInt(occurrences) || null : null,
      });
      toast.success(`${res.data.created} pulizie create`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="recurrence-dialog">
        <DialogHeader><DialogTitle>Crea ricorrenza</DialogTitle><DialogDescription>{task.structure_name} — a partire dal {task.date}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="h-9" data-testid="recur-mode-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly_days">Giorni della settimana</SelectItem>
              <SelectItem value="every_n_days">Ogni N giorni</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'weekly_days' ? (
            <div className="flex gap-1 flex-wrap">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setWeekdays(w => w.includes(i) ? w.filter(x => x !== i) : [...w, i])}
                  className={cn('px-2.5 py-1.5 rounded-full text-xs font-medium',
                    weekdays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
                  data-testid={`recur-day-${i}`}
                >{d}</button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">Ogni <Input type="number" min={1} value={interval} onChange={e => setInterval_(e.target.value)} className="h-9 w-20" data-testid="recur-interval-input" /> giorni</div>
          )}
          <div className="flex gap-1">
            <button onClick={() => setEndType('occurrences')} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', endType === 'occurrences' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>N. occorrenze</button>
            <button onClick={() => setEndType('until')} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', endType === 'until' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>Fino a data</button>
          </div>
          {endType === 'occurrences' ? (
            <Input type="number" min={1} max={60} value={occurrences} onChange={e => setOccurrences(e.target.value)} className="h-9" data-testid="recur-occurrences-input" />
          ) : (
            <Input type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)} className="h-9" data-testid="recur-until-input" />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={go} disabled={saving} className="bg-primary text-primary-foreground" data-testid="recur-confirm-btn">Crea</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SeriesDialog({ task, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/cleaning-tasks/${task.id}/series`).then(r => setData(r.data)).catch(() => setData({ tasks: [] }));
  }, [task.id]);
  const info = data?.info;
  const freq = info
    ? (info.mode === 'weekly_days'
        ? `Giorni: ${(info.weekdays || []).map(i => WEEKDAYS[i]).join(', ') || '—'}`
        : `Ogni ${info.interval_days || '—'} giorni`)
    : '—';
  const end = info?.until_date ? `Fino al ${info.until_date}` : info?.occurrences ? `${info.occurrences} occorrenze` : '—';
  const upcoming = (data?.tasks || []).filter(t => t.date >= todayStr());
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" data-testid="series-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" />Pulizia ricorrente</DialogTitle>
          <DialogDescription>{task.structure_name}</DialogDescription>
        </DialogHeader>
        {data === null ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Caricamento...</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Frequenza" value={freq} />
              <Info label="Fine" value={end} />
              <Info label="Data inizio" value={info?.start_date || '—'} />
              <Info label="Pulizie nella serie" value={(data.tasks || []).length} />
            </div>
            {upcoming.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Prossime pulizie</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {upcoming.map(t => {
                    const sm = STATUS_META[t.status] || STATUS_META.unassigned;
                    return (
                      <div key={t.id} className="flex items-center justify-between text-xs rounded-lg bg-muted/40 px-2.5 py-1.5" data-testid={`series-item-${t.id}`}>
                        <span className="capitalize">{fmtDate(t.date)} · {t.date}{t.scheduled_time ? ` · ${t.scheduled_time}` : ''}</span>
                        <Badge className={cn('text-[10px] border-0', sm.cls)}>{sm.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IssuesAdmin() {
  const [issues, setIssues] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    const params = statusFilter === 'all' ? {} : { status: statusFilter };
    api.get('/cleaning-issues', { params }).then(r => setIssues(r.data)).catch(() => setIssues([]));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const act = async (issue, action) => {
    setBusy(issue.id + action);
    try {
      await api.post(`/cleaning-issues/${issue.id}/action`, { action });
      toast.success({
        add_to_delivery: 'Aggiunta alla prossima consegna',
        create_maintenance: 'Manutenzione creata',
        publish_client: 'Pubblicata al Cliente',
        close: 'Segnalazione chiusa',
      }[action]);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setBusy(''); }
  };

  const STATUS_LABELS = { open: 'Aperte', to_delivery: 'In consegna', maintenance_created: 'Manutenzione', closed: 'Chiuse', all: 'Tutte' };

  return (
    <div className="space-y-3" data-testid="issues-admin">
      <div className="flex gap-1 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium',
              statusFilter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            data-testid={`issues-filter-${k}`}>{v}</button>
        ))}
      </div>
      {issues === null ? (
        <p className="text-center py-8 text-muted-foreground">Caricamento...</p>
      ) : issues.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nessuna segnalazione {STATUS_LABELS[statusFilter]?.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map(i => {
            const cat = ISSUE_CAT[i.category] || { label: i.category, cls: 'bg-muted text-muted-foreground' };
            return (
              <Card key={i.id} className="border shadow-none" data-testid={`issue-card-${i.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn('text-[10px] border-0', cat.cls)}>{cat.label}</Badge>
                    {i.klv_code && <span className="font-mono text-xs text-primary font-bold">{i.klv_code}</span>}
                    <span className="font-medium text-sm">{i.structure_name || ''}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{i.reporter_name} · {new Date(i.created_at).toLocaleString('it-IT')}</span>
                  </div>
                  <p className="text-sm">{i.note}</p>
                  {(i.attachments || []).length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {i.attachments.map(a => a.kind === 'video' ? (
                        <a key={a.id} href={fileUrl(a.file_path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted"><Video className="h-3 w-3" />Video</a>
                      ) : (
                        <a key={a.id} href={fileUrl(a.file_path)} target="_blank" rel="noreferrer">
                          <img src={fileUrl(a.file_path)} alt="" className="w-14 h-14 object-cover rounded-lg border border-border" />
                        </a>
                      ))}
                    </div>
                  )}
                  {i.status === 'open' ? (
                    <div className="flex gap-1.5 flex-wrap pt-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!!busy} onClick={() => act(i, 'add_to_delivery')} data-testid={`issue-delivery-${i.id}`}>Aggiungi a prossima consegna</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!!busy} onClick={() => act(i, 'create_maintenance')} data-testid={`issue-maintenance-${i.id}`}>Crea manutenzione</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!!busy || i.published_to_client} onClick={() => act(i, 'publish_client')} data-testid={`issue-publish-${i.id}`}>{i.published_to_client ? 'Mostrata al Cliente' : 'Mostra al Cliente'}</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" disabled={!!busy} onClick={() => act(i, 'close')} data-testid={`issue-close-${i.id}`}>Chiudi</Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Stato: {STATUS_LABELS[i.status] || i.status}{i.published_to_client ? ' · pubblicata al Cliente' : ''}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
