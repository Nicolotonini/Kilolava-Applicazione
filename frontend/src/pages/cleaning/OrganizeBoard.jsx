import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { X, MapPin, GripVertical, UserPlus, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { isUnassigned, bedsLabel } from './shared';
import { DaySelector, ZoneFilter } from './controls';

export function OrganizeBoard({ zones, cleaners, refreshKey, onAssignDialog, onDetail, date, setDate }) {
  const [tasks, setTasks] = useState(null);
  const [filter, setFilter] = useState('all');
  const [zoneFilter, setZoneFilter] = useState('all');
  const [dragOverCol, setDragOverCol] = useState(null);
  const [localKey, setLocalKey] = useState(0);

  const load = useCallback(() => {
    api.get('/cleaning-tasks', { params: { date } }).then(r => setTasks(r.data)).catch(() => setTasks([]));
  }, [date]);
  useEffect(() => { load(); }, [load, refreshKey, localKey]);

  const reload = () => setLocalKey(k => k + 1);

  const active = useMemo(() => (tasks || []).filter(t => t.status !== 'cancelled'), [tasks]);

  const listTasks = useMemo(() => {
    let list = active;
    if (zoneFilter !== 'all') list = list.filter(t => t.zone_id === zoneFilter);
    if (filter === 'unassigned') list = list.filter(isUnassigned);
    else if (filter === 'assigned') list = list.filter(t => !isUnassigned(t));
    return list;
  }, [active, filter, zoneFilter]);

  const byZone = useMemo(() => {
    const zoneOrder = Object.fromEntries(zones.map((z, i) => [z.id, i]));
    const groups = {};
    listTasks.forEach(t => {
      const key = t.zone_id || '_none';
      if (!groups[key]) groups[key] = { name: t.zone_name || 'Senza rione', list: [] };
      groups[key].list.push(t);
    });
    return Object.entries(groups).map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => (zoneOrder[a.id] ?? 999) - (zoneOrder[b.id] ?? 999));
  }, [listTasks, zones]);

  const unassignedCount = active.filter(isUnassigned).length;

  const assign = async (taskId, cleanerId) => {
    try {
      await api.post(`/cleaning-tasks/${taskId}/assign`, { cleaner_id: cleanerId });
      reload();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore assegnazione'); }
  };

  const unassign = async (taskId, cleanerId) => {
    try {
      await api.delete(`/cleaning-tasks/${taskId}/assign/${cleanerId}`);
      reload();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const saveOrder = async (cleanerId, orderedIds) => {
    try {
      await api.put('/cleaning-tasks/route-order', { cleaner_id: cleanerId, ordered_task_ids: orderedIds });
      reload();
    } catch (e) { toast.error('Errore nel salvataggio ordine'); }
  };

  const columnTasks = (cleanerId) =>
    active
      .filter(t => (t.assigned_cleaner_ids || []).includes(cleanerId) || t.assigned_cleaner_id === cleanerId)
      .sort((a, b) => {
        const oa = a.route_order?.[cleanerId] ?? 9999;
        const ob = b.route_order?.[cleanerId] ?? 9999;
        if (oa !== ob) return oa - ob;
        return (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99');
      });

  const handleColumnDrop = (e, cleanerId, dropIndex = null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCol(null);
    let data;
    try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (!data?.taskId) return;
    const colIds = columnTasks(cleanerId).map(t => t.id);
    if (data.from === 'col' && data.cleanerId === cleanerId) {
      const ids = colIds.filter(id => id !== data.taskId);
      const idx = dropIndex == null ? ids.length : Math.min(dropIndex, ids.length);
      ids.splice(idx, 0, data.taskId);
      saveOrder(cleanerId, ids);
    } else if (!colIds.includes(data.taskId)) {
      assign(data.taskId, cleanerId);
    }
  };

  if (tasks === null) return <p className="text-center py-10 text-muted-foreground">Caricamento...</p>;

  return (
    <div className="space-y-4" data-testid="organize-board">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
        <DaySelector date={date} onChange={setDate} testPrefix="org" />
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="font-semibold">{active.length} pulizie</span>
          <span className={cn('font-medium', unassignedCount > 0 ? 'text-amber-600' : 'text-emerald-600')} data-testid="org-unassigned-count">
            {unassignedCount} da assegnare
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {[{ key: 'all', label: 'Tutte' }, { key: 'unassigned', label: 'Da assegnare' }, { key: 'assigned', label: 'Assegnate' }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium',
              filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            data-testid={`org-filter-${f.key}`}>{f.label}</button>
        ))}
        <ZoneFilter zones={zones} value={zoneFilter} onChange={setZoneFilter} testId="org-zone-filter" />
        <span className="hidden lg:inline text-[11px] text-muted-foreground ml-auto">Trascina una pulizia sulla colonna dell'addetta per assegnarla</span>
      </div>

      {/* ===== Desktop / tablet board ===== */}
      <div className="hidden lg:flex gap-4 items-start">
        {/* Left: master list grouped by zone */}
        <div className="w-72 xl:w-80 shrink-0 space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1" data-testid="org-master-list">
          {byZone.length === 0 && (
            <div className="text-center py-10 border border-dashed border-border rounded-xl">
              <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nessuna pulizia</p>
            </div>
          )}
          {byZone.map(g => (
            <div key={g.id}>
              <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                <MapPin className="h-3 w-3 text-primary" />{g.name} · {g.list.length}
              </p>
              <div className="space-y-1.5">
                {g.list.map(t => <MasterChip key={t.id} task={t} onDetail={onDetail} onAssignDialog={onAssignDialog} />)}
              </div>
            </div>
          ))}
        </div>

        {/* Right: cleaner columns */}
        <div className="flex-1 flex gap-3 overflow-x-auto pb-2" data-testid="org-columns">
          {cleaners.map(c => {
            const colTasks = columnTasks(c.id);
            return (
              <div
                key={c.id}
                onDragOver={e => { e.preventDefault(); setDragOverCol(c.id); }}
                onDragLeave={() => setDragOverCol(d => (d === c.id ? null : d))}
                onDrop={e => handleColumnDrop(e, c.id)}
                className={cn('w-52 xl:w-56 shrink-0 rounded-xl border-2 transition-colors flex flex-col',
                  dragOverCol === c.id ? 'border-primary bg-primary/5' : 'border-border bg-muted/20')}
                data-testid={`cleaner-column-${c.id}`}
              >
                <div className="px-3 py-2 border-b border-border/60">
                  <p className="text-sm font-bold uppercase tracking-wide truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{colTasks.length} pulizie</p>
                </div>
                <div className="p-2 space-y-1.5 min-h-[120px] flex-1">
                  {colTasks.length === 0 && (
                    <p className="text-[11px] text-muted-foreground/60 text-center py-6">Trascina qui le pulizie</p>
                  )}
                  {colTasks.map((t, idx) => (
                    <ColumnChip
                      key={t.id}
                      task={t}
                      cleanerId={c.id}
                      index={idx}
                      onRemove={() => unassign(t.id, c.id)}
                      onDropOn={(e) => handleColumnDrop(e, c.id, idx)}
                      onDetail={onDetail}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {cleaners.length === 0 && <p className="text-sm text-muted-foreground py-6">Nessuna addetta registrata</p>}
        </div>
      </div>

      {/* ===== Mobile: simple list with assign buttons ===== */}
      <div className="lg:hidden space-y-4" data-testid="org-mobile-list">
        {byZone.map(g => (
          <div key={g.id}>
            <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              <MapPin className="h-3 w-3 text-primary" />{g.name} · {g.list.length}
            </p>
            <div className="space-y-1.5">
              {g.list.map(t => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="min-w-0 flex-1" onClick={() => onDetail(t)}>
                    <p className="text-sm font-semibold truncate">{t.structure_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.guests_count ? `${t.guests_count} pax` : ''}{bedsLabel(t) ? ` · ${bedsLabel(t)}` : ''}
                      {t.checkin_today && t.checkin_time ? ` · CI ${t.checkin_time}` : ''}
                    </p>
                    {t.cleaner_names?.length > 0
                      ? <p className="text-[11px] text-primary font-medium">{t.cleaner_names.join(' + ')}</p>
                      : <p className="text-[11px] text-amber-600 font-medium">Da assegnare</p>}
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => onAssignDialog(t)} data-testid={`mobile-assign-${t.id}`}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" />Assegna
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {byZone.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nessuna pulizia in questa giornata</p>}
      </div>
    </div>
  );
}

function MasterChip({ task, onDetail, onAssignDialog }) {
  const assigned = !isUnassigned(task);
  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id, from: 'list' }))}
      onClick={() => onDetail(task)}
      className={cn('group rounded-lg border px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none transition-colors',
        assigned ? 'border-emerald-300/70 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-border bg-card hover:border-primary/40')}
      data-testid={`org-task-${task.id}`}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate">{task.structure_name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {task.guests_count ? `${task.guests_count} pax` : ''}{bedsLabel(task) ? ` · ${bedsLabel(task)}` : ''}
            {task.checkin_today && task.checkin_time ? ` · CI ${task.checkin_time}` : ''}
          </p>
          {assigned
            ? <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium truncate" data-testid={`org-task-assigned-${task.id}`}>{(task.cleaner_names || []).join(' + ')}</p>
            : <p className="text-[11px] text-amber-600 font-medium" data-testid={`org-task-unassigned-${task.id}`}>Da assegnare</p>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onAssignDialog(task); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
          title="Assegna addette"
          data-testid={`org-assign-btn-${task.id}`}
        >
          <UserPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ColumnChip({ task, cleanerId, index, onRemove, onDropOn, onDetail }) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable
      onDragStart={e => {
        e.stopPropagation();
        e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id, from: 'col', cleanerId, index }));
      }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { setOver(false); onDropOn(e); }}
      onClick={() => onDetail(task)}
      className={cn('rounded-lg border bg-card px-2.5 py-2 cursor-grab active:cursor-grabbing select-none',
        over ? 'border-primary border-t-4' : 'border-border')}
      data-testid={`col-chip-${cleanerId}-${task.id}`}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate flex items-center gap-1">
            {task.checkin_today && <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" title="Entrano lo stesso giorno" />}
            {task.structure_name}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {task.zone_name ? `${task.zone_name} · ` : ''}{task.guests_count ? `${task.guests_count} pax` : ''}
            {task.checkin_today && task.checkin_time ? ` · CI ${task.checkin_time}` : ''}
          </p>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Rimuovi questa addetta"
          data-testid={`col-remove-${cleanerId}-${task.id}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
