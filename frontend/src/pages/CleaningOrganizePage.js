import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { todayStr } from './cleaning/shared';
import { OrganizeBoard } from './cleaning/OrganizeBoard';
import { TaskDetailDialog, AssignDialog } from './cleaning/dialogs';

export default function CleaningOrganizePage() {
  const [date, setDate] = useState(todayStr());
  const [cleaners, setCleaners] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailTask, setDetailTask] = useState(null);
  const [assignTask, setAssignTask] = useState(null);

  useEffect(() => {
    api.get('/cleaning-tasks/cleaners')
      .then(c => setCleaners(c.data))
      .catch(e => console.error(e));
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="cleaning-organize-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-heading font-semibold">Organizzazione Pulizie</h1>
        <p className="text-sm text-muted-foreground">Distribuisci il lavoro tra le addette: trascina una pulizia sulla colonna dell'addetta</p>
      </div>
      <OrganizeBoard
        refreshKey={refreshKey}
        date={date}
        setDate={setDate}
        onAssignDialog={(t) => setAssignTask(t)}
        onDetail={(t) => setDetailTask(t)}
      />
      {detailTask && <TaskDetailDialog taskId={detailTask.id} onClose={() => setDetailTask(null)} />}
      {assignTask && (
        <AssignDialog
          task={assignTask}
          cleaners={cleaners}
          onClose={() => setAssignTask(null)}
          onDone={() => { setAssignTask(null); setRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}
