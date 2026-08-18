import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api, { API_BASE } from '../lib/api';
import { NotificationBell } from '../components/NotificationBell';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, LogOut, Moon, Sun, Clock, MapPin, Key,
  CheckCircle2, Circle, Play, Check, Camera, AlertTriangle, Send,
  ArrowLeft, Image, X, Loader2, CheckSquare, ToggleLeft, Type, Hash, ClipboardList
} from 'lucide-react';
import { cn } from '../lib/utils';

const STATUS_BADGE = {
  unassigned: { label: 'Non assegnato', cls: 'bg-gray-100 text-gray-700' },
  assigned: { label: 'Assegnato', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In corso', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completato', cls: 'bg-green-100 text-green-700' },
  issue_reported: { label: 'Problema', cls: 'bg-red-100 text-red-700' },
  needs_review: { label: 'Da verificare', cls: 'bg-purple-100 text-purple-700' },
};

const ISSUE_CATEGORIES = [
  { value: 'broken_item', label: 'Oggetto rotto' },
  { value: 'missing_supplies', label: 'Materiale mancante' },
  { value: 'damage', label: 'Danno' },
  { value: 'maintenance', label: 'Manutenzione necessaria' },
];

// ===== PHOTO UPLOAD COMPONENT =====
const PhotoUploader = ({ taskId, photoType, label, photos, onUploaded }) => {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const existing = photos.filter(p => p.photo_type === photoType);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/cleaning-tasks/${taskId}/photos?photo_type=${photoType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Foto caricata');
      onUploaded();
    } catch (e) { toast.error('Errore caricamento foto'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        {existing.length > 0 && <span className="text-[10px] text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />{existing.length}</span>}
      </div>
      {existing.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {existing.map(p => (
            <div key={p.id} className="w-16 h-16 rounded-lg bg-muted border border-border overflow-hidden flex-shrink-0">
              <img src={`${API_BASE}/files/${p.file_path}`} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleUpload} className="hidden" />
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}
        className="w-full h-10 gap-2 text-sm" data-testid={`upload-${photoType}-photo`}>
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {uploading ? 'Caricamento...' : `Scatta ${label.toLowerCase()}`}
      </Button>
    </div>
  );
};

// ===== CHECKLIST ITEM RENDERER =====
const ChecklistItem = ({ item, sectionName, value, onChange, taskId, onPhotoUploaded, photos }) => {
  const key = `${sectionName}|${item.label}`;

  switch (item.item_type) {
    case 'checkbox':
      return (
        <button className="flex items-center gap-3 w-full text-left p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          onClick={() => onChange(key, !value)} data-testid={`checklist-item-${item.order}`}>
          {value ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />}
          <span className={cn("text-sm", value && "line-through text-muted-foreground")}>{item.label}</span>
          {item.required && !value && <span className="ml-auto text-[10px] text-red-400">Obb.</span>}
        </button>
      );
    case 'yesno':
      return (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <ToggleLeft className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm">{item.label}</span>
            {item.required && value === undefined && <span className="text-[10px] text-red-400">Obb.</span>}
          </div>
          <div className="flex gap-1">
            <Button variant={value === true ? "default" : "outline"} size="sm" className="h-8 px-3 text-xs"
              onClick={() => onChange(key, true)}>Si</Button>
            <Button variant={value === false ? "destructive" : "outline"} size="sm" className="h-8 px-3 text-xs"
              onClick={() => onChange(key, false)}>No</Button>
          </div>
        </div>
      );
    case 'text':
      return (
        <div className="p-3 rounded-lg bg-muted/30 space-y-2">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-purple-600 shrink-0" />
            <span className="text-sm">{item.label}</span>
            {item.required && !value && <span className="text-[10px] text-red-400">Obb.</span>}
          </div>
          <Input value={value || ''} onChange={e => onChange(key, e.target.value)} placeholder="Inserisci nota..." className="h-9" />
        </div>
      );
    case 'number':
      return (
        <div className="p-3 rounded-lg bg-muted/30 space-y-2">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm">{item.label}</span>
          </div>
          <Input type="number" value={value || ''} onChange={e => onChange(key, e.target.value)} placeholder="0" className="h-9 w-24" />
        </div>
      );
    case 'photo':
      return (
        <div className="p-3 rounded-lg bg-muted/30">
          <PhotoUploader taskId={taskId} photoType={`checklist_${sectionName}_${item.order}`}
            label={item.label} photos={photos} onUploaded={onPhotoUploaded} />
        </div>
      );
    default:
      return (
        <button className="flex items-center gap-3 w-full text-left p-3 rounded-lg bg-muted/30 hover:bg-muted/50"
          onClick={() => onChange(key, !value)}>
          {value ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground/40" />}
          <span className="text-sm">{item.label}</span>
        </button>
      );
  }
};

// ===== ISSUE REPORT FORM =====
const IssueReportForm = ({ taskId, onReported }) => {
  const [category, setCategory] = useState('broken_item');
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!note.trim()) { toast.error('Descrizione richiesta'); return; }
    setSubmitting(true);
    try {
      await api.post(`/cleaning-tasks/${taskId}/issues`, { category, note, severity });
      toast.success('Problema segnalato');
      setNote('');
      onReported();
    } catch (e) { toast.error('Errore'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3 p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900/30">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
        <AlertTriangle className="h-4 w-4" />Segnala Problema
      </h3>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-10" data-testid="issue-category"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ISSUE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        {['low', 'medium', 'high'].map(s => (
          <Button key={s} variant={severity === s ? 'default' : 'outline'} size="sm" className="flex-1 h-9 text-xs"
            onClick={() => setSeverity(s)}>{s === 'low' ? 'Bassa' : s === 'medium' ? 'Media' : 'Alta'}</Button>
        ))}
      </div>
      <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Descrivi il problema..."
        rows={3} className="resize-none" data-testid="issue-note" />
      <Button onClick={handleSubmit} disabled={submitting} className="w-full h-11 bg-red-600 hover:bg-red-700 text-white gap-2" data-testid="submit-issue">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Invia segnalazione
      </Button>
    </div>
  );
};

// ===== TASK DETAIL VIEW =====
const TaskDetail = ({ task, onBack, onRefresh }) => {
  const [checklistResponses, setChecklistResponses] = useState(task.checklist?.responses || {});
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const sb = STATUS_BADGE[task.status] || STATUS_BADGE.assigned;

  const checklist = task.checklist;
  const sections = checklist?.sections || [];
  const currentSection = sections[activeSection];

  // Calculate progress
  const totalRequired = sections.reduce((sum, s) => sum + (s.items || []).filter(i => i.required).length, 0);
  const completedRequired = sections.reduce((sum, s) => {
    return sum + (s.items || []).filter(i => {
      if (!i.required) return false;
      const key = `${s.name}|${i.label}`;
      const val = checklistResponses[key];
      return val !== undefined && val !== '' && val !== false && val !== null;
    }).length;
  }, 0);
  const progress = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

  const handleChecklistChange = (key, value) => {
    setChecklistResponses(prev => ({ ...prev, [key]: value }));
  };

  const saveChecklist = async () => {
    setSavingChecklist(true);
    try {
      await api.put(`/cleaning-tasks/${task.id}/checklist`, { responses: checklistResponses });
      toast.success('Checklist salvata');
    } catch (e) { toast.error('Errore salvataggio'); }
    finally { setSavingChecklist(false); }
  };

  const updateStatus = async (newStatus) => {
    try {
      // Save checklist first if there are changes
      if (checklist) {
        await api.put(`/cleaning-tasks/${task.id}/checklist`, { responses: checklistResponses });
      }
      await api.put(`/cleaning-tasks/${task.id}/status`, { status: newStatus });
      toast.success(newStatus === 'completed' ? 'Task completato!' : 'Stato aggiornato');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  return (
    <div className="min-h-screen bg-background pb-32" data-testid="task-detail-view">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack} data-testid="back-to-list">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{task.structure_name || 'Task Pulizia'}</p>
            {task.unit_name && <p className="text-[11px] text-muted-foreground">{task.unit_name}</p>}
          </div>
          <span className={cn("text-[10px] px-2 py-1 rounded-full font-medium", sb.cls)}>{sb.label}</span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Task Info */}
        <Card className="border">
          <CardContent className="p-4 space-y-2">
            {task.client_name && <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground w-20">Cliente:</span><span className="font-medium">{task.client_name}</span></div>}
            {task.scheduled_time && <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /><span>{task.scheduled_time}{task.estimated_duration_minutes ? ` (${task.estimated_duration_minutes} min)` : ''}</span></div>}
            {task.structure_address && <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span>{task.structure_address}</span></div>}
            {task.access_notes && <div className="flex items-center gap-2 text-sm bg-amber-50 dark:bg-amber-950/20 p-2 rounded-lg"><Key className="h-4 w-4 text-amber-600 shrink-0" /><span className="text-amber-800 dark:text-amber-300">{task.access_notes}</span></div>}
            {task.notes && <p className="text-sm text-muted-foreground mt-2">{task.notes}</p>}
          </CardContent>
        </Card>

        {/* Photos Section */}
        <Card className="border">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Foto</h3>
            <div className="grid grid-cols-2 gap-3">
              <PhotoUploader taskId={task.id} photoType="initial" label="Foto Iniziale" photos={task.photos || []} onUploaded={onRefresh} />
              <PhotoUploader taskId={task.id} photoType="final" label="Foto Finale" photos={task.photos || []} onUploaded={onRefresh} />
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        {checklist && sections.length > 0 && (
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{checklist.template_name}</h3>
                <span className="text-xs font-medium text-[#F24E75]">{progress}%</span>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-[#F24E75] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>

              {/* Section tabs */}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {sections.map((s, i) => {
                  const sectionDone = (s.items || []).filter(it => it.required).every(it => {
                    const v = checklistResponses[`${s.name}|${it.label}`];
                    return v !== undefined && v !== '' && v !== false && v !== null;
                  });
                  return (
                    <button key={i} className={cn(
                      "text-xs px-3 py-1.5 rounded-full font-medium transition-colors border shrink-0 flex items-center gap-1",
                      activeSection === i ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground"
                    )} onClick={() => setActiveSection(i)} data-testid={`section-tab-${i}`}>
                      {sectionDone && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {s.name}
                    </button>
                  );
                })}
              </div>

              {/* Current section items */}
              {currentSection && (
                <div className="space-y-2" data-testid="checklist-section-items">
                  {(currentSection.items || []).sort((a, b) => a.order - b.order).map((item, idx) => (
                    <ChecklistItem key={idx} item={item} sectionName={currentSection.name}
                      value={checklistResponses[`${currentSection.name}|${item.label}`]}
                      onChange={handleChecklistChange} taskId={task.id}
                      onPhotoUploaded={onRefresh} photos={task.photos || []} />
                  ))}
                </div>
              )}

              {/* Section navigation */}
              <div className="flex gap-2 pt-2">
                {activeSection > 0 && (
                  <Button variant="outline" size="sm" className="flex-1 h-10" onClick={() => setActiveSection(activeSection - 1)}>
                    <ChevronLeft className="h-4 w-4 mr-1" />Precedente
                  </Button>
                )}
                {activeSection < sections.length - 1 && (
                  <Button variant="outline" size="sm" className="flex-1 h-10" onClick={() => { saveChecklist(); setActiveSection(activeSection + 1); }}>
                    Successivo<ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>

              {/* Save checklist */}
              <Button variant="outline" size="sm" onClick={saveChecklist} disabled={savingChecklist} className="w-full h-10 gap-1" data-testid="save-checklist">
                {savingChecklist ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                Salva checklist
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Issue Reporting */}
        {task.issues && task.issues.length > 0 && (
          <Card className="border border-red-200 dark:border-red-900/30">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Problemi segnalati ({task.issues.length})</h3>
              {task.issues.map((issue, i) => (
                <div key={i} className="p-2 bg-red-50 dark:bg-red-950/20 rounded-lg text-sm">
                  <span className="font-medium capitalize">{(ISSUE_CATEGORIES.find(c => c.value === issue.category) || {}).label || issue.category}</span>
                  {issue.note && <p className="text-xs text-muted-foreground mt-0.5">{issue.note}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Button variant="outline" size="sm" onClick={() => setShowIssueForm(!showIssueForm)}
          className="w-full h-11 gap-2 text-red-600 border-red-200 hover:bg-red-50" data-testid="toggle-issue-form">
          <AlertTriangle className="h-4 w-4" />
          {showIssueForm ? 'Chiudi segnalazione' : 'Segnala un problema'}
        </Button>

        {showIssueForm && <IssueReportForm taskId={task.id} onReported={() => { setShowIssueForm(false); onRefresh(); }} />}
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-40">
        {task.status === 'assigned' && (
          <Button className="w-full h-12 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white gap-2" onClick={() => updateStatus('in_progress')} data-testid="start-task">
            <Play className="h-5 w-5" />Inizia pulizia
          </Button>
        )}
        {task.status === 'in_progress' && (
          <Button className="w-full h-12 text-base font-semibold bg-green-600 hover:bg-green-700 text-white gap-2" onClick={() => updateStatus('completed')} data-testid="complete-task">
            <Check className="h-5 w-5" />Completa task
          </Button>
        )}
        {task.status === 'completed' && (
          <div className="text-center text-green-600 font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="h-5 w-5" />Task completato
          </div>
        )}
        {task.status === 'issue_reported' && (
          <div className="text-center text-red-600 font-semibold flex items-center justify-center gap-2">
            <AlertTriangle className="h-5 w-5" />Problema segnalato - in attesa
          </div>
        )}
      </div>
    </div>
  );
};

// ===== MAIN CLEANER VIEW =====
const CleanerView = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedTask, setSelectedTask] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cleaning-tasks/my-tasks', { params: { date: selectedDate } });
      setTasks(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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

  const refreshTask = async () => {
    if (selectedTask) {
      try {
        const res = await api.get(`/cleaning-tasks/${selectedTask.id}`);
        setSelectedTask(res.data);
      } catch (e) { console.error(e); }
    }
    fetchTasks();
  };

  // If a task is selected, show detail view
  if (selectedTask) {
    return <TaskDetail task={selectedTask} onBack={() => { setSelectedTask(null); fetchTasks(); }} onRefresh={refreshTask} />;
  }

  const pending = tasks.filter(t => t.status !== 'completed');
  const done = tasks.filter(t => t.status === 'completed');

  return (
    <div className="min-h-screen bg-background" data-testid="cleaner-view">
      <header className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-teal-500/10 flex items-center justify-center text-sm font-bold text-teal-600">
              {user?.name?.charAt(0).toUpperCase() || 'C'}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{user?.name}</p>
              <p className="text-[11px] text-muted-foreground">Addetto Pulizie</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout} data-testid="cleaner-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 py-3 space-y-4 pb-20">
        {/* Date Navigator */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)}><ChevronLeft className="h-5 w-5" /></Button>
          <div className="text-center">
            <p className="text-sm font-semibold">{formatDate(selectedDate)}</p>
            <p className="text-xs text-muted-foreground">{tasks.length} pulizie</p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(1)}><ChevronRight className="h-5 w-5" /></Button>
        </div>

        {/* Progress */}
        {tasks.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{done.length} di {tasks.length} completate</span>
              <span>{Math.round((done.length / tasks.length) * 100)}%</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(done.length / tasks.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Task list */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nessuna pulizia programmata</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(task => {
              const sb = STATUS_BADGE[task.status] || STATUS_BADGE.assigned;
              return (
                <Card key={task.id} className={cn(
                  "border-l-4 cursor-pointer transition-all active:scale-[0.98]",
                  task.status === 'in_progress' ? "border-l-amber-400 bg-amber-50/50 dark:bg-amber-950/20" :
                  task.status === 'issue_reported' ? "border-l-red-400 bg-red-50/50 dark:bg-red-950/20" :
                  "border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                )} onClick={() => setSelectedTask(task)} data-testid={`cleaner-task-${task.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-base font-semibold">{task.structure_name || 'Pulizia'}</p>
                        {task.unit_name && <p className="text-xs text-muted-foreground">{task.unit_name}</p>}
                      </div>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", sb.cls)}>{sb.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {task.scheduled_time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{task.scheduled_time}</span>}
                      {task.estimated_duration_minutes && <span>{task.estimated_duration_minutes} min</span>}
                      {task.client_name && <span>{task.client_name}</span>}
                    </div>
                    {task.checklist && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full" style={{ width: `${(() => {
                            const sections = task.checklist.sections || [];
                            const responses = task.checklist.responses || {};
                            const total = sections.reduce((s, sec) => s + (sec.items || []).filter(i => i.required).length, 0);
                            const done = sections.reduce((s, sec) => s + (sec.items || []).filter(i => i.required && (() => { const v = responses[`${sec.name}|${i.label}`]; return v !== undefined && v !== '' && v !== false; })()).length, 0);
                            return total > 0 ? (done / total) * 100 : 0;
                          })()}%` }} />
                        </div>
                        <span className="text-[10px] text-teal-600"><ClipboardList className="h-3 w-3 inline" /> Checklist</span>
                      </div>
                    )}
                    {task.issues && task.issues.length > 0 && (
                      <span className="text-[10px] text-red-600 flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" />{task.issues.length} problemi</span>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {done.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">Completate ({done.length})</span><div className="h-px flex-1 bg-border" /></div>
                {done.map(task => (
                  <Card key={task.id} className="border-l-4 border-l-green-400 opacity-60 cursor-pointer" onClick={() => setSelectedTask(task)} data-testid={`cleaner-task-${task.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{task.structure_name || 'Pulizia'}</p>
                          {task.unit_name && <p className="text-xs text-muted-foreground">{task.unit_name}</p>}
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CleanerView;
