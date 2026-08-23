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
      <h1 className="text-xl lg:text-2xl font-heading font-semibold">Organizzazione Pulizie</h1>
      <OrganizeBoard
        refreshKey={refreshKey}
        date={date}
        setDate={setDate}
        onAssignDialog={(t) => setAssignTask(t)}
        onDetail={(t) => setDetailTask(t)}
        onNewTask={() => setFormOpen(true)}
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
