import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { logisticsApi } from '../lib/api';
import { NotificationBell } from '../components/NotificationBell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import {
  Truck, MapPin, Clock, Package, Check, Play, AlertTriangle,
  Navigation, ChevronLeft, ChevronRight, Camera, MessageSquare,
  LogOut, Moon, Sun, KeyRound, ArrowUp
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';

const STATUS_COLORS = {
  assigned: 'border-blue-400 bg-blue-50 dark:bg-blue-950/30',
  in_progress: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
  completed: 'border-green-400 bg-green-50 dark:bg-green-950/30',
  problem: 'border-red-400 bg-red-50 dark:bg-red-950/30',
};

const STATUS_LABELS = {
  assigned: 'Assegnato',
  in_progress: 'In corso',
  completed: 'Completato',
  problem: 'Problema',
};

const STATUS_BADGE = {
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  problem: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
};

const TYPE_LABELS = { delivery: 'Consegna', pickup: 'Ritiro', mixed: 'Misto' };

const RiderViewPage = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expandedTask, setExpandedTask] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [problemText, setProblemText] = useState('');
  const [showProblem, setShowProblem] = useState(null);
  const fileInputRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await logisticsApi.getMyTasks(selectedDate);
      setTasks(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const shiftDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date().toISOString().slice(0, 10);
    const label = dateStr === today ? 'Oggi' : '';
    return `${label ? label + ' - ' : ''}${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  };

  const startTask = async (taskId) => {
    try {
      await logisticsApi.updateStatus(taskId, { status: 'in_progress' });
      toast.success('Stop avviato');
      fetchTasks();
    } catch (e) { toast.error('Errore'); }
  };

  const completeTask = async (taskId) => {
    try {
      await logisticsApi.updateStatus(taskId, { status: 'completed', completion_notes: noteText || null });
      toast.success('Stop completato!');
      setNoteText('');
      setExpandedTask(null);
      fetchTasks();
    } catch (e) { toast.error('Errore'); }
  };

  const reportProblem = async (taskId) => {
    if (!problemText.trim()) { toast.error('Descrivi il problema'); return; }
    try {
      await logisticsApi.updateStatus(taskId, { status: 'problem', problem_notes: problemText });
      toast.success('Problema segnalato');
      setProblemText('');
      setShowProblem(null);
      fetchTasks();
    } catch (e) { toast.error('Errore'); }
  };

  const uploadPhoto = async (taskId, file) => {
    try {
      await logisticsApi.uploadPhoto(taskId, file);
      toast.success('Foto caricata');
      fetchTasks();
    } catch (e) { toast.error('Errore upload foto'); }
  };

  const handlePhotoSelect = (taskId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) uploadPhoto(taskId, file);
    };
    input.click();
  };

  const openMaps = (address) => {
    if (!address) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  };

  const pending = tasks.filter(t => t.status === 'assigned');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const done = tasks.filter(t => t.status === 'completed');
  const problems = tasks.filter(t => t.status === 'problem');

  return (
    <div className="min-h-screen bg-background" data-testid="rider-view-page">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#F24E75]/10 flex items-center justify-center text-sm font-bold text-[#F24E75]">
              {user?.name?.charAt(0).toUpperCase() || 'R'}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Rider</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={logout} data-testid="rider-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 py-3 space-y-4 pb-20">
        {/* Date Nav */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold">{formatDate(selectedDate)}</p>
            <p className="text-xs text-muted-foreground">{tasks.length} stop assegnati</p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(1)}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Progress bar */}
        {tasks.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{done.length} di {tasks.length} completati</span>
              <span>{Math.round((done.length / tasks.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${(done.length / tasks.length) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Task list */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nessuno stop per oggi</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* In Progress first */}
            {inProgress.map(task => (
              <TaskCard key={task.id} task={task} expanded={expandedTask === task.id}
                onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                onComplete={() => completeTask(task.id)}
                onProblem={() => setShowProblem(task.id)}
                onPhoto={() => handlePhotoSelect(task.id)}
                onMaps={() => openMaps(task.address)}
                noteText={noteText} setNoteText={setNoteText}
                showProblem={showProblem === task.id}
                problemText={problemText} setProblemText={setProblemText}
                onReportProblem={() => reportProblem(task.id)}
                highlight
              />
            ))}

            {/* Assigned */}
            {pending.map(task => (
              <TaskCard key={task.id} task={task} expanded={expandedTask === task.id}
                onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                onStart={() => startTask(task.id)}
                onProblem={() => setShowProblem(task.id)}
                onMaps={() => openMaps(task.address)}
                showProblem={showProblem === task.id}
                problemText={problemText} setProblemText={setProblemText}
                onReportProblem={() => reportProblem(task.id)}
              />
            ))}

            {/* Problems */}
            {problems.map(task => (
              <TaskCard key={task.id} task={task} expanded={expandedTask === task.id}
                onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                onMaps={() => openMaps(task.address)}
              />
            ))}

            {/* Completed */}
            {done.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">Completati ({done.length})</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {done.map(task => (
                  <TaskCard key={task.id} task={task} expanded={expandedTask === task.id}
                    onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    dimmed
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Task Card Component
const TaskCard = ({
  task, expanded, onToggle, onStart, onComplete, onProblem, onPhoto, onMaps,
  noteText, setNoteText, highlight, dimmed,
  showProblem, problemText, setProblemText, onReportProblem
}) => {
  const isDelivery = task.task_type === 'delivery' || task.task_type === 'mixed';
  const isPickup = task.task_type === 'pickup' || task.task_type === 'mixed';

  return (
    <Card
      className={cn(
        "border-l-4 transition-all",
        STATUS_COLORS[task.status],
        highlight && "ring-2 ring-amber-400/50",
        dimmed && "opacity-60"
      )}
      data-testid={`rider-task-${task.id}`}
    >
      <CardContent className="p-0">
        <div className="p-3 cursor-pointer" onClick={onToggle}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold flex-shrink-0">
                {task.route_order || '-'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{TYPE_LABELS[task.task_type]}</span>
                  <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", STATUS_BADGE[task.status])}>
                    {STATUS_LABELS[task.status]}
                  </span>
                </div>
                {task.structure_name && <p className="text-xs text-foreground/80 mt-0.5">{task.structure_name}</p>}
                {task.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{task.address}</span>
                  </p>
                )}
                {task.time_window_start && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />{task.time_window_start}{task.time_window_end ? ` - ${task.time_window_end}` : ''}
                  </p>
                )}
              </div>
            </div>
            {task.items?.length > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                {task.items.reduce((sum, i) => sum + i.quantity, 0)} pz
              </span>
            )}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-border px-3 py-3 space-y-3 bg-card/50">
            {/* Items */}
            {task.items?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Articoli</p>
                {task.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-sm">
                    <span>{it.article_name || it.article_id}</span>
                    <span className="font-medium text-xs px-1.5 py-0.5 rounded bg-muted">
                      {it.item_type === 'pickup' ? 'Ritiro' : 'Consegna'} x{it.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Access details */}
            {task.access_details && (
              <div className="bg-muted/50 rounded-lg p-2.5">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5">Accesso</p>
                <p className="text-sm flex items-start gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                  {task.access_details}
                </p>
              </div>
            )}

            {/* Notes */}
            {task.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5">Note</p>
                <p className="text-sm">{task.notes}</p>
              </div>
            )}

            {task.problem_notes && (
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2.5">
                <p className="text-xs font-medium text-red-600 uppercase mb-0.5">Problema</p>
                <p className="text-sm text-red-700 dark:text-red-300">{task.problem_notes}</p>
              </div>
            )}

            {task.completion_notes && (
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-2.5">
                <p className="text-xs font-medium text-green-600 uppercase mb-0.5">Note completamento</p>
                <p className="text-sm">{task.completion_notes}</p>
              </div>
            )}

            {/* Address action */}
            {task.address && onMaps && (
              <Button variant="outline" size="sm" className="w-full h-9 gap-1.5" onClick={onMaps} data-testid={`navigate-${task.id}`}>
                <Navigation className="h-3.5 w-3.5" />Apri navigatore
              </Button>
            )}

            {/* Problem form */}
            {showProblem && (
              <div className="space-y-2 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
                <p className="text-xs font-medium text-red-700 dark:text-red-400">Segnala problema</p>
                <Textarea
                  value={problemText}
                  onChange={e => setProblemText(e.target.value)}
                  placeholder="Descrivi il problema..."
                  rows={2}
                  className="resize-none text-sm"
                  data-testid={`problem-text-${task.id}`}
                />
                <Button size="sm" className="w-full h-8 bg-red-600 hover:bg-red-700 text-white" onClick={onReportProblem} data-testid={`report-problem-${task.id}`}>
                  Invia segnalazione
                </Button>
              </div>
            )}

            {/* Completion note */}
            {task.status === 'in_progress' && onComplete && (
              <div className="space-y-2">
                <Textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Note consegna/ritiro (opzionale)"
                  rows={2}
                  className="resize-none text-sm"
                  data-testid={`completion-note-${task.id}`}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {task.status === 'assigned' && onStart && (
                <Button className="flex-1 h-10 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium" onClick={onStart} data-testid={`start-task-${task.id}`}>
                  <Play className="h-4 w-4" />Inizia
                </Button>
              )}
              {task.status === 'in_progress' && onComplete && (
                <Button className="flex-1 h-10 gap-1.5 bg-green-600 hover:bg-green-700 text-white font-medium" onClick={onComplete} data-testid={`complete-task-${task.id}`}>
                  <Check className="h-4 w-4" />Completato
                </Button>
              )}
              {task.status === 'in_progress' && onPhoto && (
                <Button variant="outline" className="h-10 gap-1.5" onClick={onPhoto} data-testid={`photo-btn-${task.id}`}>
                  <Camera className="h-4 w-4" />
                </Button>
              )}
              {(task.status === 'assigned' || task.status === 'in_progress') && onProblem && !showProblem && (
                <Button variant="outline" className="h-10 gap-1.5 text-red-600 border-red-200 dark:border-red-800" onClick={onProblem} data-testid={`problem-btn-${task.id}`}>
                  <AlertTriangle className="h-4 w-4" />
                </Button>
              )}
            </div>

            {task.confirmation_photo && (
              <div className="text-xs text-green-600 flex items-center gap-1">
                <Camera className="h-3 w-3" />Foto confermata
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RiderViewPage;
