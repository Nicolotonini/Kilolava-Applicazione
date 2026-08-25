import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Plus, Sparkles, Printer, Copy, FileText, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { KpiCard } from '../components/kilolava/KpiCard';
import { toast } from 'sonner';
import { todayStr, tomorrowStr, isUnassigned } from './cleaning/shared';
import { CompactTaskRow } from './cleaning/TaskRow';
import { GroupedByCleaner, GroupedByZone } from './cleaning/DayView';
import { TaskFormDrawer } from './cleaning/TaskFormDrawer';
import { DaySelector } from './cleaning/controls';
import { PrintSheets } from './cleaning/PrintSheets';
import {
  TaskDetailDialog, DuplicateDialog, RecurrenceDialog, SeriesDialog, AssignDialog,
} from './cleaning/dialogs';

const VIEW_KEY = 'klv_cleaning_day_view';
const hasProblem = (t) => t.open_issues_count > 0 || t.status === 'issue_reported' || t.status === 'needs_review';

export default function CleaningPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState(null);
  const [viewMode, setViewMode] = useState(() => sessionStorage.getItem(VIEW_KEY) || 'cleaner');
  const [structures, setStructures] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [zones, setZones] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [printMode, setPrintMode] = useState(null);
  const [dupDayOpen, setDupDayOpen] = useState(false);

  const [detailTask, setDetailTask] = useState(null);
  const [formState, setFormState] = useState(null);
  const [dupTask, setDupTask] = useState(null);
  const [recurTask, setRecurTask] = useState(null);
  const [seriesTask, setSeriesTask] = useState(null);
  const [assignTask, setAssignTask] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/structures'), api.get('/cleaning-tasks/cleaners'), api.get('/zones')])
      .then(([s, c, z]) => { setStructures(s.data); setCleaners(c.data); setZones(z.data); })
      .catch(e => console.error(e));
  }, []);

  const load = useCallback(() => {
    api.get('/cleaning-tasks', { params: { date } }).then(r => setTasks(r.data)).catch(() => setTasks([]));
  }, [date]);
  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (!printMode) return;
    const t = setTimeout(() => { window.print(); setPrintMode(null); }, 350);
    return () => clearTimeout(t);
  }, [printMode]);

  const refresh = () => setRefreshKey(k => k + 1);
  const setView = (v) => { setViewMode(v); sessionStorage.setItem(VIEW_KEY, v); };

  const cancelTask = async (task) => {
    if (!window.confirm(`Annullare la pulizia di ${task.structure_name || ''} del ${task.date}?`)) return;
    try {
      await api.put(`/cleaning-tasks/${task.id}`, { status: 'cancelled' });
      toast.success('Pulizia annullata');
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const deleteTask = async (task) => {
    if (!window.confirm(`Eliminare definitivamente la pulizia di ${task.structure_name || ''}?`)) return;
    try {
      await api.delete(`/cleaning-tasks/${task.id}`);
      toast.success('Pulizia eliminata');
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const actions = {
    onDetail: (t) => navigate(`/cleaning/task/${t.id}`),
    onEdit: (t) => setFormState({ task: t }),
    onAssign: (t) => setAssignTask(t),
    onDuplicate: (t) => setDupTask(t),
    onRecur: (t) => setRecurTask(t),
    onSeries: (t) => setSeriesTask(t),
    onCancel: cancelTask,
    onDelete: deleteTask,
  };

  const operative = useMemo(() => (tasks || []).filter(t => t.status !== 'cancelled'), [tasks]);

  const kpi = useMemo(() => ({
    total: operative.length,
    assigned: operative.filter(t => !isUnassigned(t)).length,
    unassigned: operative.filter(isUnassigned).length,
    completed: operative.filter(t => t.status === 'completed').length,
    in_progress: operative.filter(t => t.status === 'in_progress').length,
    problems: operative.filter(hasProblem).length,
  }), [operative]);

  return (
    <>
      {printMode && <PrintSheets mode={printMode} date={date} tasks={tasks || []} cleaners={cleaners} />}
      <div className="p-4 lg:p-6 space-y-5 print:hidden" data-testid="cleaning-overview-page">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Piano lavoro</p>
          <h1 className="text-3xl lg:text-4xl font-heading font-bold mt-0.5">Scheda quotidiana</h1>
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center gap-3 xl:justify-between">
          <DaySelector date={date} onChange={setDate} testPrefix="giornate" />
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setDupDayOpen(true)} data-testid="duplicate-day-btn">
              <Copy className="h-4 w-4 mr-1.5" />Duplica
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setPrintMode('day')} data-testid="print-day-btn">
              <Printer className="h-4 w-4 mr-1.5" />Stampa
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setPrintMode('operators')} data-testid="print-operators-btn">
              <FileText className="h-4 w-4 mr-1.5" />Scheda operatore
            </Button>
            <Button onClick={() => setFormState({ date })} className="h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground px-5" data-testid="new-cleaning-btn">
              <Plus className="h-4 w-4 mr-1.5" />Aggiungi pulizia
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="overview-kpi">
          <KpiCard label="Pulizie" value={kpi.total} testId="kpi-total" />
          <KpiCard label="Assegnate" value={kpi.assigned} testId="kpi-assigned" />
          <KpiCard label="Da assegnare" value={kpi.unassigned} accent={kpi.unassigned > 0 ? 'text-amber-600' : 'text-emerald-600'} testId="kpi-unassigned" />
          <KpiCard label="Completate" value={kpi.completed} accent="text-emerald-600" testId="kpi-completed" />
          <KpiCard label="In corso" value={kpi.in_progress} accent={kpi.in_progress > 0 ? 'text-amber-600' : 'text-muted-foreground'} testId="kpi-inprogress" />
          <KpiCard label="Problemi" value={kpi.problems} accent={kpi.problems > 0 ? 'text-red-600' : 'text-muted-foreground'} testId="kpi-problems" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Visualizza come:</span>
          {[
            { key: 'list', label: 'Lista' },
            { key: 'cleaner', label: 'Per Addetta' },
            { key: 'zone', label: 'Per Rione' },
          ].map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={cn('px-4 py-2 rounded-full text-sm font-medium transition-colors',
                viewMode === v.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
              data-testid={`view-mode-${v.key}`}>{v.label}</button>
          ))}
        </div>

        {tasks === null ? (
          <p className="text-center py-10 text-muted-foreground">Caricamento...</p>
        ) : (tasks || []).length === 0 ? (
          <div className="text-center py-14 border border-dashed border-border rounded-xl" data-testid="day-empty">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nessuna pulizia {date === todayStr() ? 'per oggi' : 'in questa giornata'}.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setFormState({ date })}>Crea la prima</Button>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-2" data-testid="overview-list">
            {tasks.map(t => <CompactTaskRow key={t.id} task={t} actions={actions} />)}
          </div>
        ) : viewMode === 'cleaner' ? (
          <GroupedByCleaner tasks={tasks} actions={actions} onChanged={refresh} />
        ) : (
          <GroupedByZone tasks={tasks} zones={zones} actions={actions} />
        )}

        {formState !== null && (
          <TaskFormDrawer
            task={formState.task}
            defaultDate={formState.date}
            structures={structures}
            cleaners={cleaners}
            zones={zones}
            onClose={() => setFormState(null)}
            onSaved={() => { setFormState(null); refresh(); }}
          />
        )}
        {detailTask && <TaskDetailDialog taskId={detailTask.id} onClose={() => setDetailTask(null)} />}
        {dupTask && <DuplicateDialog task={dupTask} onClose={() => setDupTask(null)} onDone={() => { setDupTask(null); refresh(); }} />}
        {recurTask && <RecurrenceDialog task={recurTask} onClose={() => setRecurTask(null)} onDone={() => { setRecurTask(null); refresh(); }} />}
        {seriesTask && <SeriesDialog task={seriesTask} onClose={() => setSeriesTask(null)} />}
        {assignTask && <AssignDialog task={assignTask} cleaners={cleaners} onClose={() => setAssignTask(null)} onDone={() => { setAssignTask(null); refresh(); }} />}
        {dupDayOpen && (
          <DuplicateDayDialog date={date} tasks={operative} onClose={() => setDupDayOpen(false)} onDone={() => { setDupDayOpen(false); refresh(); }} />
        )}
      </div>
    </>
  );
}

function KpiCardLegacyRemoved() { return null; }
/* KpiCard ora condivisa: components/kilolava/KpiCard */

function DuplicateDayDialog({ date, tasks, onClose, onDone }) {
  const [target, setTarget] = useState(tomorrowStr());
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!target || target === date) { toast.error('Scegli una data diversa'); return; }
    setBusy(true);
    let ok = 0;
    for (const t of tasks) {
      try { await api.post(`/cleaning-tasks/${t.id}/duplicate`, { date: target }); ok += 1; }
      catch (e) { /* continua con le altre */ }
    }
    setBusy(false);
    toast.success(`${ok} pulizie duplicate sul ${target}`);
    onDone();
  };
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="duplicate-day-dialog">
        <DialogHeader>
          <DialogTitle>Duplica giornata</DialogTitle>
          <DialogDescription>Copia tutte le {tasks.length} pulizie del {date} (con addette e configurazione) su un'altra data.</DialogDescription>
        </DialogHeader>
        <Input type="date" value={target} onChange={e => setTarget(e.target.value)} className="h-10" data-testid="duplicate-day-date" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={go} disabled={busy || tasks.length === 0} className="bg-primary text-primary-foreground" data-testid="duplicate-day-confirm">
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Duplica {tasks.length} pulizie
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
