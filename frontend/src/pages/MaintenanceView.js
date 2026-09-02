import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import api, { API_BASE } from '../lib/api';
import { AuthImg } from '../components/kilolava/AuthMedia';
import { NotificationBell } from '../components/NotificationBell';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';
import {
  LogOut, Moon, Sun, MapPin, ArrowLeft, Camera, Loader2, Send, Play,
  CheckCircle2, AlertTriangle, Clock, Wrench, Zap, Armchair, CircleAlert,
  Package, MoreHorizontal, Image, ChevronRight, MessageSquare, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { RoleAreaSwitcher } from '../components/kilolava/RoleAreaSwitcher';
import { QuickActions } from '../components/kilolava/QuickActions';
import { LocationBanner, useLocationState, LocationRequiredDialog } from '../components/LocationBanner';

const STATUS_BADGE = {
  open: { label: 'Aperto', cls: 'bg-red-100 text-red-700' },
  assigned: { label: 'Assegnato', cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In corso', cls: 'bg-amber-100 text-amber-700' },
  resolved: { label: 'Risolto', cls: 'bg-green-100 text-green-700' },
  closed: { label: 'Chiuso', cls: 'bg-gray-100 text-gray-600' },
};

const PRIORITY_BADGE = {
  low: { label: 'Bassa', cls: 'bg-gray-100 text-gray-600', border: 'border-l-gray-300' },
  medium: { label: 'Media', cls: 'bg-blue-100 text-blue-700', border: 'border-l-blue-400' },
  high: { label: 'Alta', cls: 'bg-orange-100 text-orange-700', border: 'border-l-orange-400' },
  urgent: { label: 'Urgente', cls: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
};

const CATEGORY_MAP = {
  electrical: { label: 'Elettrico', icon: Zap },
  plumbing: { label: 'Idraulica', icon: Wrench },
  furniture: { label: 'Arredamento', icon: Armchair },
  damage: { label: 'Danno', icon: CircleAlert },
  missing_item: { label: 'Oggetto mancante', icon: Package },
  broken_item: { label: 'Oggetto rotto', icon: AlertTriangle },
  missing_supplies: { label: 'Materiale mancante', icon: Package },
  maintenance: { label: 'Manutenzione', icon: Wrench },
  other: { label: 'Altro', icon: MoreHorizontal },
};

// ===== TASK DETAIL VIEW =====
const TaskDetail = ({ task, onBack, onRefresh }) => {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const locState = useLocationState();
  const [locDialog, setLocDialog] = useState(false);

  const sb = STATUS_BADGE[task.status] || STATUS_BADGE.assigned;
  const pb = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
  const cc = CATEGORY_MAP[task.category] || CATEGORY_MAP.other;
  const CatIcon = cc.icon;

  const updateStatus = async (newStatus) => {
    if (newStatus === 'in_progress' && !locState.active) { setLocDialog(true); return; }
    try {
      const payload = { status: newStatus };
      if (newStatus === 'resolved' && resolutionNotes) {
        payload.resolution_notes = resolutionNotes;
      }
      await api.put(`/maintenance/issues/${task.id}/status`, payload);
      toast.success(newStatus === 'resolved' ? 'Intervento completato!' : 'Stato aggiornato');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/maintenance/issues/${task.id}/photo?photo_type=after`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Foto caricata');
      onRefresh();
    } catch (e) { toast.error('Errore caricamento'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/maintenance/issues/${task.id}/notes`, { note: noteText });
      toast.success('Nota aggiunta');
      setNoteText('');
      setShowNoteForm(false);
      onRefresh();
    } catch (e) { toast.error('Errore'); }
  };

  const issuePhotos = (task.photos || []).filter(p => p.path && p.type === 'issue');
  const afterPhotos = (task.photos || []).filter(p => p.path && p.type === 'after');

  return (
    <div className="min-h-screen bg-background pb-32" data-testid="maint-task-detail">
      <LocationRequiredDialog open={locDialog} onClose={() => setLocDialog(false)} sessionType="intervento" />
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack} data-testid="maint-back-to-list">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate flex items-center gap-2">
              <CatIcon className="h-4 w-4 shrink-0" />{cc.label}
            </p>
            <p className="text-xs text-muted-foreground">{task.structure_name || 'Intervento'}</p>
          </div>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sb.cls)}>{sb.label}</span>
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", pb.cls)}>{pb.label}</span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Description */}
        <Card className="border">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Descrizione problema</h3>
            <p className="text-sm">{task.description || 'Nessuna descrizione'}</p>
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="border">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Posizione</h3>
            {task.structure_name && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium">{task.structure_name}</span>
                {task.unit_name && <span className="text-muted-foreground">/ {task.unit_name}</span>}
              </div>
            )}
            {task.structure_address && <p className="text-xs text-muted-foreground ml-6">{task.structure_address}</p>}
            {task.client_name && <p className="text-xs text-muted-foreground ml-6">Cliente: {task.client_name}</p>}
          </CardContent>
        </Card>

        {/* Issue Photos */}
        {issuePhotos.length > 0 && (
          <Card className="border">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-1"><Image className="h-4 w-4" />Foto problema</h3>
              <div className="flex gap-2 overflow-x-auto">
                {issuePhotos.map((p, i) => (
                  <div key={i} className="w-24 h-24 rounded-lg bg-muted border overflow-hidden flex-shrink-0">
                    <AuthImg path={p.path} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* After Photos + Upload */}
        <Card className="border">
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1"><Camera className="h-4 w-4" />Foto dopo intervento</h3>
            {afterPhotos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {afterPhotos.map((p, i) => (
                  <div key={i} className="w-24 h-24 rounded-lg bg-muted border overflow-hidden flex-shrink-0">
                    <AuthImg path={p.path} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleUploadPhoto} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full h-11 gap-2" data-testid="upload-after-photo">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {uploading ? 'Caricamento...' : 'Scatta foto'}
            </Button>
          </CardContent>
        </Card>

        {/* Internal Notes */}
        {task.internal_notes && (
          <Card className="border">
            <CardContent className="p-4 space-y-1">
              <h3 className="text-sm font-semibold">Note</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{task.internal_notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Add Note */}
        {showNoteForm ? (
          <div className="space-y-2">
            <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Aggiungi nota..." rows={3} className="resize-none" data-testid="maint-note-input" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNoteForm(false)} className="flex-1">Annulla</Button>
              <Button size="sm" onClick={handleAddNote} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-1" data-testid="maint-submit-note">
                <Send className="h-3 w-3" />Invia
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowNoteForm(true)} className="w-full h-10 gap-2" data-testid="maint-add-note">
            <MessageSquare className="h-4 w-4" />Aggiungi nota
          </Button>
        )}

        {/* Resolution notes for completing */}
        {task.status === 'in_progress' && (
          <Card className="border border-green-200 dark:border-green-900/30">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">Note risoluzione</h3>
              <Textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                placeholder="Descrivi cosa hai fatto..." rows={2} className="resize-none" data-testid="resolution-notes" />
            </CardContent>
          </Card>
        )}

        {/* History */}
        {task.history && task.history.length > 0 && (
          <Card className="border">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold">Storico</h3>
              <div className="space-y-1">
                {[...task.history].reverse().slice(0, 5).map((h, i) => (
                  <div key={i} className="text-xs py-1 text-muted-foreground">
                    <span className="font-medium">{h.by_name}</span> - {h.detail}
                    <span className="ml-1 opacity-50">{new Date(h.at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-40">
        {(task.status === 'assigned' || task.status === 'open') && (
          <Button className="w-full h-12 text-base font-semibold bg-amber-600 hover:bg-amber-700 text-white gap-2"
            onClick={() => updateStatus('in_progress')} data-testid="maint-start-task">
            <Play className="h-5 w-5" />Inizia intervento
          </Button>
        )}
        {task.status === 'in_progress' && (
          <Button className="w-full h-12 text-base font-semibold bg-green-600 hover:bg-green-700 text-white gap-2"
            onClick={() => updateStatus('resolved')} data-testid="maint-resolve-task">
            <CheckCircle2 className="h-5 w-5" />Intervento completato
          </Button>
        )}
        {task.status === 'resolved' && (
          <div className="text-center text-green-600 font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="h-5 w-5" />Intervento completato
          </div>
        )}
        {task.status === 'closed' && (
          <div className="text-center text-gray-500 font-semibold flex items-center justify-center gap-2">
            Chiuso
          </div>
        )}
      </div>
    </div>
  );
};

// ===== MAIN MAINTENANCE VIEW =====
const MaintenanceView = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/maintenance/my-tasks', { params });
      setTasks(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const refreshTask = async () => {
    if (selectedTask) {
      try {
        const res = await api.get(`/maintenance/issues/${selectedTask.id}`);
        setSelectedTask(res.data);
      } catch (e) { console.error(e); }
    }
    fetchTasks();
  };

  if (selectedTask) {
    return <TaskDetail task={selectedTask} onBack={() => { setSelectedTask(null); fetchTasks(); }} onRefresh={refreshTask} />;
  }

  const pending = tasks.filter(t => !['resolved', 'closed'].includes(t.status));
  const done = tasks.filter(t => ['resolved', 'closed'].includes(t.status));

  return (
    <div className="min-h-screen bg-background" data-testid="maintenance-view">
      <header className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center text-sm font-bold text-orange-600">
              {user?.name?.charAt(0).toUpperCase() || 'M'}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Manutenzione</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={logout} data-testid="maint-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <LocationBanner sessionType="intervento" startLabel="Inizia attività" stopLabel="Fine attività" />

      <div className="px-4 py-3 space-y-4 pb-8">
        <RoleAreaSwitcher />
        {/* Summary */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">I miei interventi</h2>
          <span className="text-sm text-muted-foreground">{pending.length} attivi</span>
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[
            { key: 'all', label: `Tutti (${tasks.length})` },
            { key: 'assigned', label: `Da fare (${tasks.filter(t => t.status === 'assigned').length})` },
            { key: 'in_progress', label: `In corso (${tasks.filter(t => t.status === 'in_progress').length})` },
            { key: 'resolved', label: `Risolti (${tasks.filter(t => t.status === 'resolved').length})` },
          ].map(f => (
            <button key={f.key} className={cn(
              "text-xs px-3 py-1.5 rounded-full font-medium border shrink-0 transition-colors",
              statusFilter === f.key ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-300" : "border-border text-muted-foreground"
            )} onClick={() => setStatusFilter(f.key)} data-testid={`maint-filter-${f.key}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Task list */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nessun intervento assegnato</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(task => {
              const sb = STATUS_BADGE[task.status] || STATUS_BADGE.assigned;
              const pb = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.medium;
              const cc = CATEGORY_MAP[task.category] || CATEGORY_MAP.other;
              const CatIcon = cc.icon;
              return (
                <Card key={task.id} className={cn(
                  "border-l-4 cursor-pointer transition-all active:scale-[0.98]", pb.border
                )} onClick={() => setSelectedTask(task)} data-testid={`maint-task-${task.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CatIcon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-base font-semibold">{cc.label}</p>
                          {task.structure_name && <p className="text-xs text-muted-foreground">{task.structure_name}{task.unit_name ? ` / ${task.unit_name}` : ''}</p>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sb.cls)}>{sb.label}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", pb.cls)}>{pb.label}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(task.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                      {task.scheduled_date && <span>Programmato: {new Date(task.scheduled_date + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>}
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {done.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">Completati ({done.length})</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {done.map(task => {
                  const cc = CATEGORY_MAP[task.category] || CATEGORY_MAP.other;
                  const CatIcon = cc.icon;
                  return (
                    <Card key={task.id} className="border-l-4 border-l-green-400 opacity-60 cursor-pointer"
                      onClick={() => setSelectedTask(task)} data-testid={`maint-task-${task.id}`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CatIcon className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{cc.label}</p>
                              <p className="text-xs text-muted-foreground">{task.structure_name}</p>
                            </div>
                          </div>
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
      <QuickActions bottomOffset="5.5rem" />
    </div>
  );
};

export default MaintenanceView;
