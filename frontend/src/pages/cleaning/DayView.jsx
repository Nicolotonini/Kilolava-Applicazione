import React, { useMemo } from 'react';
import { Users, MapPin } from 'lucide-react';
import { CompactTaskRow } from './TaskRow';

export function GroupedByCleaner({ tasks, actions }) {
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
    const arr = Object.entries(byCleaner).map(([id, g]) => ({ id, ...g })).sort((a, b) => a.name.localeCompare(b.name));
    return { arr, unassigned };
  }, [tasks]);

  return (
    <div className="space-y-5" data-testid="grouped-by-cleaner">
      {groups.arr.map(g => (
        <div key={g.id}>
          <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide mb-1.5">
            <Users className="h-4 w-4 text-primary" />{g.name} <span className="text-muted-foreground font-normal normal-case">— {g.list.length} pulizie</span>
          </p>
          <div className="space-y-1.5">
            {g.list.map(t => <CompactTaskRow key={`${g.id}-${t.id}`} task={t} actions={actions} />)}
          </div>
        </div>
      ))}
      {groups.unassigned.length > 0 && (
        <div data-testid="group-unassigned">
          <p className="text-sm font-bold uppercase tracking-wide mb-1.5 text-amber-600">Da assegnare — {groups.unassigned.length}</p>
          <div className="space-y-1.5">
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
    <div className="space-y-5" data-testid="grouped-by-zone">
      {groups.map(g => (
        <div key={g.id}>
          <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide mb-1.5">
            <MapPin className="h-4 w-4 text-primary" />{g.name} <span className="text-muted-foreground font-normal normal-case">— {g.list.length} pulizie</span>
          </p>
          <div className="space-y-1.5">
            {g.list.map(t => <CompactTaskRow key={t.id} task={t} actions={actions} />)}
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nessuna pulizia</p>}
    </div>
  );
}
