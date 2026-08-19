import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Plus, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { todayStr, isUnassigned } from './cleaning/shared';
import { CompactTaskRow } from './cleaning/TaskRow';
import { GroupedByCleaner, GroupedByZone } from './cleaning/DayView';
import { TaskFormDrawer } from './cleaning/TaskFormDrawer';
import { DaySelector } from './cleaning/controls';
import {
  TaskDetailDialog, DuplicateDialog, RecurrenceDialog, SeriesDialog, AssignDialog,
} from './cleaning/dialogs';

const VIEW_KEY = 'klv_cleaning_day_view';
const hasProblem = (t) => t.open_issues_count > 0 || t.status === 'issue_reported' || t.status === 'needs_review';

export default function CleaningPage() {
  const [date, setDate] = useState(todayStr());
  const [tasks, setTasks] = useState(null);
  const [viewMode, setViewMode] = useState(() => sessionStorage.getItem(VIEW_KEY) || 'list');
  const [structures, setStructures] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [zones, setZones] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const actions = {
    onDetail: (t) => setDetailTask(t),
    onEdit: (t) => setFormState({ task: t }),
    onAssign: (t) => setAssignTask(t),
    onDuplicate: (t) => setDupTask(t),
    onRecur: (t) => setRecurTask(t),
    onSeries: (t) => setSeriesTask(t),
    onCancel: cancelTask,
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
    <div className="p-4 lg:p-6 space-y-5" data-testid="cleaning-overview-page">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Panoramica Pulizie</h1>
          <p className="text-sm text-muted-foreground">Come stanno andando le pulizie della giornata</p>
        </div>
        <Button onClick={() => setFormState({ date })} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="new-cleaning-btn">
          <Plus className="h-4 w-4 mr-1.5" />Nuova pulizia
        </Button>
      </div>

      <DaySelector date={date} onChange={setDate} testPrefix="giornate" />

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="overview-kpi">
        <KpiCard label="Pulizie" value={kpi.total} testId="kpi-total" />
        <KpiCard label="Assegnate" value={kpi.assigned} valueCls="text-foreground" testId="kpi-assigned" />
        <KpiCard label="Da assegnare" value={kpi.unassigned} valueCls={kpi.unassigned > 0 ? 'text-amber-600' : 'text-emerald-600'} testId="kpi-unassigned" />
        <KpiCard label="Completate" value={kpi.completed} valueCls="text-emerald-600" testId="kpi-completed" />
        <KpiCard label="In corso" value={kpi.in_progress} valueCls={kpi.in_progress > 0 ? 'text-amber-600' : 'text-muted-foreground'} testId="kpi-inprogress" />
        <KpiCard label="Problemi" value={kpi.problems} valueCls={kpi.problems > 0 ? 'text-red-600' : 'text-muted-foreground'} testId="kpi-problems" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Visualizza come:</span>
        {[
          { key: 'list', label: 'Lista' },
          { key: 'cleaner', label: 'Per Addetta' },
          { key: 'zone', label: 'Per Rione' },
        ].map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={cn('px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors',
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
        <div className="space-y-1.5" data-testid="overview-list">
          {tasks.map(t => <CompactTaskRow key={t.id} task={t} actions={actions} />)}
        </div>
      ) : viewMode === 'cleaner' ? (
        <GroupedByCleaner tasks={tasks} actions={actions} />
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
    </div>
  );
}

function KpiCard({ label, value, valueCls, testId }) {
  return (
    <Card className="border shadow-none">
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn('text-3xl font-semibold tabular-nums mt-1', valueCls)} data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}
