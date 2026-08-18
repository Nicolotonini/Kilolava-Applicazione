import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { ExportButton } from '../components/ExportButton';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Search, X, ChevronLeft, ChevronRight, Sparkles, Clock, MapPin,
  User, CheckCircle2, AlertTriangle, Eye, Trash2, Pencil, ClipboardList
} from 'lucide-react';
import { cn } from '../lib/utils';

const STATUS_CONFIG = {
  unassigned: { label: 'Non assegnato', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', dot: 'bg-gray-400' },
  assigned: { label: 'Assegnato', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-400' },
  in_progress: { label: 'In corso', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-400' },
  completed: { label: 'Completato', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', dot: 'bg-green-400' },
  issue_reported: { label: 'Problema', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-400' },
  needs_review: { label: 'Da verificare', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', dot: 'bg-purple-400' },
};

const SidePanel = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[48%] lg:w-[38%] bg-card border-l border-border z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

const CleaningPage = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('all');
  const [panel, setPanel] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: '' });
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [structures, setStructures] = useState([]);
  const [units, setUnits] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [templates, setTemplates] = useState([]);

  const [form, setForm] = useState({
    client_id: '', structure_id: '', unit_id: '', assigned_cleaner_id: '',
    date: '', scheduled_time: '', estimated_duration_minutes: '',
    access_notes: '', notes: '', checklist_template_id: '',
  });

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date: selectedDate };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/cleaning-tasks', { params });
      setTasks(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedDate, statusFilter]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [cRes, sRes, tRes, clRes] = await Promise.all([
        api.get('/clients'), api.get('/structures'),
        api.get('/checklist-templates'), api.get('/cleaning-tasks/cleaners'),
      ]);
      setClients(cRes.data);
      setStructures(sRes.data);
      setTemplates(tRes.data);
      setCleaners(clRes.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Load units when structure changes
  useEffect(() => {
    if (form.structure_id) {
      api.get('/units', { params: { structure_id: form.structure_id } })
        .then(res => setUnits(res.data))
        .catch(() => setUnits([]));
    } else {
      setUnits([]);
    }
  }, [form.structure_id]);

  const shiftDate = (d) => {
    const dt = new Date(selectedDate);
    dt.setDate(dt.getDate() + d);
    setSelectedDate(dt.toISOString().slice(0, 10));
  };

  const formatDate = (ds) => {
    const d = new Date(ds + 'T00:00:00');
    const today = new Date().toISOString().slice(0, 10);
    return `${ds === today ? 'Oggi - ' : ''}${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  };

  const openNew = () => {
    setEditTask(null);
    setForm({
      client_id: '', structure_id: '', unit_id: '', assigned_cleaner_id: '',
      date: selectedDate, scheduled_time: '09:00', estimated_duration_minutes: '60',
      access_notes: '', notes: '', checklist_template_id: '',
    });
    setPanel(true);
  };

  const openEdit = (task) => {
    setEditTask(task);
    setForm({
      client_id: task.client_id || '', structure_id: task.structure_id || '',
      unit_id: task.unit_id || '', assigned_cleaner_id: task.assigned_cleaner_id || '',
      date: task.date || selectedDate, scheduled_time: task.scheduled_time || '',
      estimated_duration_minutes: task.estimated_duration_minutes?.toString() || '',
      access_notes: task.access_notes || '', notes: task.notes || '',
      checklist_template_id: task.checklist_template_id || '',
    });
    setPanel(true);
  };

  const handleSave = async () => {
    if (!form.date) { toast.error('Data richiesta'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        estimated_duration_minutes: form.estimated_duration_minutes ? parseInt(form.estimated_duration_minutes) : null,
        client_id: form.client_id || null,
        structure_id: form.structure_id || null,
        unit_id: form.unit_id || null,
        assigned_cleaner_id: form.assigned_cleaner_id || null,
        checklist_template_id: form.checklist_template_id || null,
      };
      if (editTask) {
        await api.put(`/cleaning-tasks/${editTask.id}`, payload);
        toast.success('Task aggiornato');
      } else {
        await api.post('/cleaning-tasks', payload);
        toast.success('Task creato');
      }
      setPanel(false);
      fetchTasks();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/cleaning-tasks/${deleteDialog.id}`);
      toast.success('Task eliminato');
      setDeleteDialog({ open: false, id: '' });
      fetchTasks();
    } catch (e) { toast.error('Errore'); }
  };

  const statusCounts = {};
  tasks.forEach(t => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });

  // Auto-fill client when structure selected
  const handleStructureChange = (sid) => {
    const s = structures.find(st => st.id === sid);
    setForm(p => ({
      ...p,
      structure_id: sid,
      unit_id: '',
      client_id: s?.client_id || p.client_id,
    }));
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="cleaning-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Pulizie</h1>
          <p className="text-sm text-muted-foreground">{tasks.length} task per questa giornata</p>
        </div>
        <div className="flex gap-2">
          <ExportButton entity="cleaning" />
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/checklist-templates'} className="gap-1" data-testid="manage-templates-btn">
            <ClipboardList className="h-4 w-4" />Template
          </Button>
          <Button onClick={openNew} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-1" data-testid="add-cleaning-task-btn">
            <Plus className="h-4 w-4" />Nuovo task
          </Button>
        </div>
      </div>

      {/* Date Navigator */}
      <div className="flex items-center justify-between bg-card rounded-lg border border-border p-2">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)}><ChevronLeft className="h-5 w-5" /></Button>
        <div className="text-center">
          <p className="text-sm font-semibold">{formatDate(selectedDate)}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(1)}><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {/* Status chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button className={cn("text-xs px-3 py-1.5 rounded-full font-medium transition-colors border shrink-0",
          statusFilter === 'all' ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground hover:bg-accent"
        )} onClick={() => setStatusFilter('all')}>Tutti ({tasks.length})</button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key} className={cn("text-xs px-3 py-1.5 rounded-full font-medium transition-colors border shrink-0",
            statusFilter === key ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground hover:bg-accent"
          )} onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}>
            {cfg.label} ({statusCounts[key] || 0})
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun task di pulizia</p>
          <Button onClick={openNew} variant="outline" className="mt-3 gap-1"><Plus className="h-4 w-4" />Crea task</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const sc = STATUS_CONFIG[task.status] || STATUS_CONFIG.unassigned;
            return (
              <Card key={task.id} className="border transition-all hover:ring-1 hover:ring-[#F24E75]/30" data-testid={`cleaning-task-${task.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold">{task.structure_name || 'Struttura'}</span>
                        {task.unit_name && <span className="text-xs text-muted-foreground">/ {task.unit_name}</span>}
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", sc.color)}>{sc.label}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {task.scheduled_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{task.scheduled_time}</span>}
                        {task.estimated_duration_minutes && <span>{task.estimated_duration_minutes} min</span>}
                        {task.cleaner_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{task.cleaner_name}</span>}
                        {task.client_name && <span className="text-muted-foreground/60">{task.client_name}</span>}
                      </div>
                      {task.checklist && <span className="text-[10px] text-teal-600 dark:text-teal-400 flex items-center gap-1 mt-1"><CheckCircle2 className="h-3 w-3" />Checklist: {task.checklist.template_name}</span>}
                      {task.issues && task.issues.length > 0 && <span className="text-[10px] text-red-600 flex items-center gap-1 mt-0.5"><AlertTriangle className="h-3 w-3" />{task.issues.length} segnalazioni</span>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(task)} data-testid={`edit-task-${task.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteDialog({ open: true, id: task.id })} data-testid={`delete-task-${task.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Task Form Panel */}
      <SidePanel open={panel} onClose={() => setPanel(false)} title={editTask ? 'Modifica Task' : 'Nuovo Task Pulizia'}>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label>Struttura</Label>
            <Select value={form.structure_id || 'none'} onValueChange={v => handleStructureChange(v === 'none' ? '' : v)}>
              <SelectTrigger data-testid="task-structure"><SelectValue placeholder="Seleziona struttura" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                {structures.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {units.length > 0 && (
            <div className="space-y-2">
              <Label>Unita</Label>
              <Select value={form.unit_id || 'none'} onValueChange={v => setForm(p => ({ ...p, unit_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona unita" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} data-testid="task-date" />
            </div>
            <div className="space-y-2">
              <Label>Orario</Label>
              <Input type="time" value={form.scheduled_time} onChange={e => setForm(p => ({ ...p, scheduled_time: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Durata stimata (min)</Label>
            <Input type="number" value={form.estimated_duration_minutes} onChange={e => setForm(p => ({ ...p, estimated_duration_minutes: e.target.value }))} placeholder="60" />
          </div>
          <div className="space-y-2">
            <Label>Addetto Pulizie</Label>
            <Select value={form.assigned_cleaner_id || 'none'} onValueChange={v => setForm(p => ({ ...p, assigned_cleaner_id: v === 'none' ? '' : v }))}>
              <SelectTrigger data-testid="task-cleaner"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnato</SelectItem>
                {cleaners.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Template Checklist</Label>
            <Select value={form.checklist_template_id || 'none'} onValueChange={v => setForm(p => ({ ...p, checklist_template_id: v === 'none' ? '' : v }))}>
              <SelectTrigger data-testid="task-template"><SelectValue placeholder="Nessuna checklist" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna</SelectItem>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Note accesso</Label>
            <Textarea value={form.access_notes} onChange={e => setForm(p => ({ ...p, access_notes: e.target.value }))} rows={2} placeholder="Codice portone, chiavi..." className="resize-none" />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={() => setPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-task-btn">
            {saving ? '...' : editTask ? 'Aggiorna' : 'Crea task'}
          </Button>
        </div>
      </SidePanel>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={v => !v && setDeleteDialog({ open: false, id: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina task</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro? Il task verra eliminato permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" data-testid="confirm-delete-task">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CleaningPage;
