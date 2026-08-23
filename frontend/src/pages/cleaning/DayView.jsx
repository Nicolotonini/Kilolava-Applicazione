import React, { useMemo, useState } from 'react';
import api from '../../lib/api';
import { MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { CompactTaskRow, RouteDragHandle } from './TaskRow';

export function GroupedByCleaner({ tasks, actions, onChanged }) {
  const [dragging, setDragging] = useState(null); // {taskId, cleanerId}
  const [overTask, setOverTask] = useState(null);

  const groups = useMemo(() => {
    const byCleaner = {};
    const unassigned = [];
    tasks.forEach(t => {
      const ids = t.assigned_cleaner_ids?.length ? t.assigned_cleaner_ids : (t.assigned_cleaner_id ? [t.assigned_cleaner_id] : []);
      if (!ids.length) { unassigned.push(t); return; }
      ids.forEach((id, idx) => {
        const name = t.cleaner_names?.[idx] || t.cleaner_names?.[0] || 'Addetta';
        if (!byCleaner[id]) byCleaner[id] = { name, list: [] };
        byCleaner[id].list.push(t);
      });
    });
    const arr = Object.entries(byCleaner).map(([id, g]) => ({
      id,
      ...g,
      list: g.list.sort((a, b) => {
        const oa = a.route_order?.[id] ?? 9999;
        const ob = b.route_order?.[id] ?? 9999;
        if (oa !== ob) return oa - ob;
        return (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99');
      }),
    })).sort((a, b) => a.name.localeCompare(b.name));
    return { arr, unassigned };
  }, [tasks]);

  const dropOn = async (group, targetIndex) => {
    if (!dragging || dragging.cleanerId !== group.id) { setDragging(null); setOverTask(null); return; }
    const ids = group.list.map(t => t.id).filter(id => id !== dragging.taskId);
    ids.splice(Math.min(targetIndex, ids.length), 0, dragging.taskId);
    setDragging(null);
    setOverTask(null);
    try {
      await api.put('/cleaning-tasks/route-order', { cleaner_id: group.id, ordered_task_ids: ids });
      onChanged?.();
    } catch (e) { toast.error('Errore nel riordino'); }
  };

  return (
    <div className="space-y-6" data-testid="grouped-by-cleaner">
      <p className="text-xs text-muted-foreground flex items-center gap-1">⠿ Trascina l'impugnatura per riordinare il giro all'interno di ogni addetta</p>
      {groups.arr.map(g => (
        <div key={g.id}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
              {g.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="text-base font-bold leading-tight">{g.name}</p>
              <p className="text-xs text-muted-foreground">{g.list.length} pulizie</p>
            </div>
          </div>
          <div className="space-y-2">
            {g.list.map((t, idx) => (
              <div
                key={`${g.id}-${t.id}`}
                onDragOver={e => { if (dragging?.cleanerId === g.id) { e.preventDefault(); setOverTask(`${g.id}-${t.id}`); } }}
                onDragLeave={() => setOverTask(o => (o === `${g.id}-${t.id}` ? null : o))}
                onDrop={e => { e.preventDefault(); dropOn(g, idx); }}
                className={cn(overTask === `${g.id}-${t.id}` && 'border-t-4 border-primary rounded-xl')}
              >
                <CompactTaskRow
                  task={t}
                  actions={actions}
                  showCleaners={false}
                  dragHandle={
                    <RouteDragHandle
                      onDragStart={() => setDragging({ taskId: t.id, cleanerId: g.id })}
                      onDragEnd={() => { setDragging(null); setOverTask(null); }}
                    />
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {groups.unassigned.length > 0 && (
        <div data-testid="group-unassigned">
          <div className="flex items-center gap-2.5 mb-2">
            <span className="h-9 w-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold shrink-0">!</span>
            <div>
              <p className="text-base font-bold leading-tight text-amber-600">Da assegnare</p>
              <p className="text-xs text-muted-foreground">{groups.unassigned.length} pulizie</p>
            </div>
          </div>
          <div className="space-y-2">
            {groups.unassigned.map(t => <CompactTaskRow key={t.id} task={t} actions={actions} />)}
          </div>
        </div>
      )}
      {groups.arr.length === 0 && groups.unassigned.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nessuna pulizia</p>
      )}
    </div>
  );
}

export function GroupedByZone({ tasks, zones, actions }) {
  const groups = useMemo(() => {
    const zoneOrder = Object.fromEntries(zones.map((z, i) => [z.id, i]));
    const byZone = {};
    tasks.forEach(t => {
      const key = t.zone_id || '_none';
      if (!byZone[key]) byZone[key] = { name: t.zone_name || 'Senza rione', list: [] };
      byZone[key].list.push(t);
    });
    return Object.entries(byZone)
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => (zoneOrder[a.id] ?? 999) - (zoneOrder[b.id] ?? 999));
  }, [tasks, zones]);

  return (
    <div className="space-y-6" data-testid="grouped-by-zone">
      {groups.map(g => (
        <div key={g.id}>
          <p className="flex items-center gap-1.5 text-base font-bold uppercase tracking-wide mb-2">
            <MapPin className="h-4 w-4 text-primary" />{g.name} <span className="text-muted-foreground font-normal normal-case text-sm">— {g.list.length} pulizie</span>
          </p>
          <div className="space-y-2">
            {g.list.map(t => <CompactTaskRow key={t.id} task={t} actions={actions} />)}
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nessuna pulizia</p>}
    </div>
  );
}
