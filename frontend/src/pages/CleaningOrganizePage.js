import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Plus } from 'lucide-react';
import { todayStr } from './cleaning/shared';
import { OrganizeBoard } from './cleaning/OrganizeBoard';
import { TaskFormDrawer } from './cleaning/TaskFormDrawer';
import { TaskDetailDialog, AssignDialog } from './cleaning/dialogs';

export default function CleaningOrganizePage() {
  const [date, setDate] = useState(todayStr());
  const [cleaners, setCleaners] = useState([]);
  const [structures, setStructures] = useState([]);
  const [zones, setZones] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailTask, setDetailTask] = useState(null);
  const [assignTask, setAssignTask] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/cleaning-tasks/cleaners'), api.get('/structures'), api.get('/zones')])
      .then(([c, s, z]) => { setCleaners(c.data); setStructures(s.data); setZones(z.data); })
      .catch(e => console.error(e));
  }, []);

  const refresh = () => setRefreshKey(k => k + 1);

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="cleaning-organize-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Organizzazione Pulizie</h1>
          <p className="text-sm text-muted-foreground">Distribuisci il lavoro tra le addette: trascina una pulizia sulla scheda dell'addetta</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="org-new-cleaning-btn">
          <Plus className="h-4 w-4 mr-1.5" />Nuova pulizia
        </Button>
      </div>
      <OrganizeBoard
        refreshKey={refreshKey}
        date={date}
        setDate={setDate}
        onAssignDialog={(t) => setAssignTask(t)}
        onDetail={(t) => setDetailTask(t)}
      />
      {formOpen && (
        <TaskFormDrawer
          defaultDate={date}
          structures={structures}
          cleaners={cleaners}
          zones={zones}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); refresh(); }}
        />
      )}
      {detailTask && <TaskDetailDialog taskId={detailTask.id} onClose={() => setDetailTask(null)} />}
      {assignTask && (
        <AssignDialog
          task={assignTask}
          cleaners={cleaners}
          onClose={() => setAssignTask(null)}
          onDone={() => { setAssignTask(null); refresh(); }}
        />
      )}
    </div>
  );
}
