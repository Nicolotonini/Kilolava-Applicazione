import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../components/ui/sheet';
import { cn } from '../../lib/utils';
import { TASK_TYPE_META, TASK_STATUS_META, PRIORITY_META, WAIT_REASONS } from './shared';
import { ClipboardList } from 'lucide-react';

export function MyTasksSheet({ onClose, onOpenSeg }) {
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api.get('/segnalazioni/my-tasks').then(r => setData(r.data)).catch(() => setData({ active: [], done: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Sheet open onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" data-testid="my-tasks-sheet">
        <SheetHeader className="text-left">
          <SheetTitle>I miei task</SheetTitle>
          <SheetDescription>Le attività assegnate a te dal Centro Segnalazioni.</SheetDescription>
        </SheetHeader>
        {data === null ? (
          <p className="text-center py-8 text-muted-foreground">Caricamento...</p>
        ) : (
          <div className="space-y-4 mt-4">
            {data.active.length === 0 && <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">Nessun task attivo</p>}
            {data.active.map(t => <TaskItem key={t.id} task={t} onOpenSeg={onOpenSeg} />)}
            {data.done.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">Completati di recente</p>
                {data.done.map(t => <TaskItem key={t.id} task={t} onOpenSeg={onOpenSeg} done />)}
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskItem({ task, onOpenSeg, done }) {
  const Icon = TASK_TYPE_META[task.type]?.icon || ClipboardList;
  const st = TASK_STATUS_META[task.status];
  const pr = PRIORITY_META[task.priority] || PRIORITY_META.normal;
  return (
    <button onClick={() => onOpenSeg(task.segnalazione_id)}
      className={cn('w-full text-left rounded-xl border border-border p-3 space-y-1 hover:border-primary/40 transition-colors', done && 'opacity-60')}
      data-testid={`my-task-${task.id}`}>
      <div className="flex items-center gap-2">
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', pr.dot)} />
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-semibold flex-1 min-w-0 truncate">{task.title}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pl-5">
        {task.segnalazione?.structure_name && <span>{task.segnalazione.structure_name}</span>}
        <span>{pr.label} priorità</span>
        {task.due_date && <span className="font-medium text-foreground">Entro {task.due_date}{task.due_time ? ` ${task.due_time}` : ''}</span>}
        <span className={cn('font-semibold px-1.5 py-0.5 rounded-full ml-auto', st?.cls)}>
          {st?.label}{task.status === 'in_attesa' && task.waiting_reason ? ` · ${WAIT_REASONS[task.waiting_reason]}` : ''}
        </span>
      </div>
    </button>
  );
}
