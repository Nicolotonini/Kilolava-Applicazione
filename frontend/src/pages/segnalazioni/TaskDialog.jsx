import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { TASK_TYPE_META, PRIORITY_META } from './shared';

const ROLE_SHORT = { admin: 'Admin', operations_manager: 'Manager', maintenance: 'Manutentore', rider: 'Rider' };

export function TaskDialog({ seg, defaultType, autoConfirm, onClose, onCreated }) {
  const [type, setType] = useState(defaultType || 'internal');
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState(seg.priority || 'normal');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [note, setNote] = useState('');
  const [clientMessage, setClientMessage] = useState(seg.title || '');
  const [assignees, setAssignees] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/segnalazioni/assignees').then(r => setAssignees(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const prefix = { delivery: 'Consegna', maintenance: 'Intervento', notify_client: 'Notifica Cliente', internal: 'Task' }[type];
    setTitle(`${prefix}: ${seg.title}`.slice(0, 120));
  }, [type, seg.title]);

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
  const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(Date.now() + 86400000));

  const sortedAssignees = [...assignees].sort((a, b) => {
    const pref = type === 'maintenance' ? 'maintenance' : type === 'delivery' ? 'rider' : 'admin';
    return (a.role === pref ? 0 : 1) - (b.role === pref ? 0 : 1) || a.name.localeCompare(b.name);
  });

  const save = async () => {
    if (!title.trim()) { toast.error('Inserisci un titolo'); return; }
    setSaving(true);
    try {
      await api.post(`/segnalazioni/${seg.id}/tasks`, {
        type, title, assignee_id: assigneeId || null, priority,
        due_date: dueDate || null, due_time: dueTime || null, note: note || null,
        client_message: type === 'notify_client' ? clientMessage : null,
      });
      toast.success({ delivery: 'Consegna creata', maintenance: 'Intervento creato', notify_client: 'Cliente notificato', internal: 'Task creato' }[type]);
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="task-dialog">
        <DialogHeader>
          <DialogTitle>{autoConfirm ? 'Conferma azione' : 'Nuova azione'}</DialogTitle>
          <DialogDescription>La Segnalazione resta separata: puoi creare più azioni.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(TASK_TYPE_META).map(([k, v]) => (
              <button key={k} onClick={() => setType(k)}
                className={cn('flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors',
                  type === k ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-foreground/30')}
                data-testid={`task-type-${k}`}>
                <v.icon className="h-4 w-4" />{v.label}
              </button>
            ))}
          </div>
          <div>
            <Label className="text-xs">Titolo</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} data-testid="task-title-input" />
          </div>
          {type === 'notify_client' ? (
            <div>
              <Label className="text-xs">Messaggio per il Cliente</Label>
              <Textarea value={clientMessage} onChange={e => setClientMessage(e.target.value)} rows={2} data-testid="task-client-message" />
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">Assegna a</Label>
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="task-assignee-select">
                  <option value="">Nessuno (da assegnare)</option>
                  {sortedAssignees.map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE_SHORT[u.role] || u.role}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Priorità</Label>
                <div className="flex gap-1.5 mt-1">
                  {Object.entries(PRIORITY_META).map(([k, v]) => (
                    <button key={k} onClick={() => setPriority(k)}
                      className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border',
                        priority === k ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}
                      data-testid={`task-priority-${k}`}>
                      <span className={cn('w-2 h-2 rounded-full', v.dot)} />{v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Da risolvere entro</Label>
                <div className="flex gap-1.5 mt-1 items-center flex-wrap">
                  <button onClick={() => setDueDate(today)} className={cn('px-2.5 py-1.5 rounded-full text-xs font-medium border', dueDate === today ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')} data-testid="due-today-btn">Oggi</button>
                  <button onClick={() => setDueDate(tomorrow)} className={cn('px-2.5 py-1.5 rounded-full text-xs font-medium border', dueDate === tomorrow ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')} data-testid="due-tomorrow-btn">Domani</button>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="due-date-input" />
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="due-time-input" />
                  {dueDate && <button onClick={() => { setDueDate(''); setDueTime(''); }} className="text-xs text-muted-foreground underline">nessuna</button>}
                </div>
              </div>
              <div>
                <Label className="text-xs">Nota</Label>
                <Textarea value={note} onChange={e => setNote(e.target.value)} rows={2} data-testid="task-note-input" />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="task-save-btn">
              {saving ? 'Creazione...' : autoConfirm ? 'Conferma' : 'Crea'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
