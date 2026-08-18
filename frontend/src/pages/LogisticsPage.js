import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { logisticsApi, clientsApi, structuresApi, inventoryApi } from '../lib/api';
import { ExportButton } from '../components/ExportButton';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Search, Pencil, Trash2, X, Truck, MapPin, User, Clock,
  ChevronLeft, ChevronRight, Package, AlertTriangle, Check, Play,
  Navigation, UserPlus, GripVertical, Phone, Filter
} from 'lucide-react';
import { cn } from '../lib/utils';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const TASK_TYPES = ['delivery', 'pickup', 'mixed'];
const TASK_STATUSES = ['unassigned', 'assigned', 'in_progress', 'completed', 'problem'];

const STATUS_COLORS = {
  unassigned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  problem: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_LABELS = {
  unassigned: 'Da assegnare',
  assigned: 'Assegnato',
  in_progress: 'In corso',
  completed: 'Completato',
  problem: 'Problema',
};

const TYPE_LABELS = { delivery: 'Consegna', pickup: 'Ritiro', mixed: 'Misto' };
const TYPE_ICONS = { delivery: Truck, pickup: Package, mixed: Navigation };

const createColorIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background:${color};width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const MARKER_COLORS = {
  unassigned: '#94a3b8',
  assigned: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  problem: '#ef4444',
};

// Side Panel
const SidePanel = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className={cn(
        "fixed top-0 right-0 h-full bg-card border-l border-border z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200",
        wide ? "w-full sm:w-[50%] lg:w-[38%]" : "w-full sm:w-[42%] lg:w-[34%] xl:w-[28%]"
      )}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

// Map component that auto-fits bounds
const MapBounds = ({ tasks }) => {
  const map = useMap();
  useEffect(() => {
    const pts = tasks.filter(t => t.latitude && t.longitude).map(t => [t.latitude, t.longitude]);
    if (pts.length > 0) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 });
    }
  }, [tasks, map]);
  return null;
};

const LogisticsPage = () => {
  const { t } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [riders, setRiders] = useState([]);
  const [clients, setClients] = useState([]);
  const [structures, setStructures] = useState([]);
  const [articles, setArticles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [riderFilter, setRiderFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  // Panels
  const [taskPanel, setTaskPanel] = useState(false);
  const [riderPanel, setRiderPanel] = useState(false);
  const [detailPanel, setDetailPanel] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: '' });

  // View mode
  const [viewMode, setViewMode] = useState('split'); // split, list, map

  // Task form
  const [taskForm, setTaskForm] = useState({
    task_type: 'delivery', date: '', client_id: '', structure_id: '', unit_id: '',
    address: '', latitude: '', longitude: '', rider_id: '', route_order: 0,
    time_window_start: '', time_window_end: '',
    items: [{ article_id: '', quantity: 1, item_type: 'deliver' }],
    notes: '', access_details: '', source: 'manual',
  });

  // Rider form
  const [riderForm, setRiderForm] = useState({ name: '', email: '', password: '', phone: '', vehicle_type: '' });
  const [saving, setSaving] = useState(false);

  // Data fetching
  const fetchTasks = useCallback(async () => {
    try {
      const params = { date: selectedDate };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (riderFilter !== 'all') params.rider_id = riderFilter;
      if (typeFilter !== 'all') params.task_type = typeFilter;
      const res = await logisticsApi.getTasks(params);
      setTasks(res.data);
    } catch (e) { console.error(e); }
  }, [selectedDate, statusFilter, riderFilter, typeFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await logisticsApi.getDaySummary(selectedDate);
      setSummary(res.data);
    } catch (e) { console.error(e); }
  }, [selectedDate]);

  const fetchRiders = useCallback(async () => {
    try {
      const res = await logisticsApi.getRiders();
      setRiders(res.data);
    } catch (e) { console.error(e); }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [cRes, sRes, aRes] = await Promise.all([
        clientsApi.getAll(), structuresApi.getAll(), inventoryApi.getArticles()
      ]);
      setClients(cRes.data);
      setStructures(sRes.data);
      setArticles(aRes.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchMeta(); fetchRiders(); }, [fetchMeta, fetchRiders]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTasks(), fetchSummary()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchSummary]);

  // Date navigation
  const shiftDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const formatDateDisplay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date().toISOString().slice(0, 10);
    const label = dateStr === today ? 'Oggi' : '';
    return `${label ? label + ' - ' : ''}${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}`;
  };

  // Task actions
  const openNewTask = () => {
    setEditTask(null);
    setTaskForm({
      task_type: 'delivery', date: selectedDate, client_id: '', structure_id: '', unit_id: '',
      address: '', latitude: '', longitude: '', rider_id: '', route_order: 0,
      time_window_start: '', time_window_end: '',
      items: [{ article_id: '', quantity: 1, item_type: 'deliver' }],
      notes: '', access_details: '', source: 'manual',
    });
    setTaskPanel(true);
  };

  const openEditTask = (task) => {
    setEditTask(task);
    setTaskForm({
      task_type: task.task_type, date: task.date,
      client_id: task.client_id || '', structure_id: task.structure_id || '',
      unit_id: task.unit_id || '', address: task.address || '',
      latitude: task.latitude || '', longitude: task.longitude || '',
      rider_id: task.rider_id || '', route_order: task.route_order || 0,
      time_window_start: task.time_window_start || '', time_window_end: task.time_window_end || '',
      items: task.items?.length > 0 ? task.items.map(i => ({ article_id: i.article_id, quantity: i.quantity, item_type: i.item_type || 'deliver' })) : [{ article_id: '', quantity: 1, item_type: 'deliver' }],
      notes: task.notes || '', access_details: task.access_details || '', source: task.source || 'manual',
    });
    setTaskPanel(true);
  };

  const saveTask = async () => {
    if (!taskForm.date) { toast.error('Data richiesta'); return; }
    setSaving(true);
    try {
      const payload = {
        ...taskForm,
        latitude: taskForm.latitude ? parseFloat(taskForm.latitude) : null,
        longitude: taskForm.longitude ? parseFloat(taskForm.longitude) : null,
        items: taskForm.items.filter(i => i.article_id),
        rider_id: taskForm.rider_id || null,
        client_id: taskForm.client_id || null,
        structure_id: taskForm.structure_id || null,
        unit_id: taskForm.unit_id || null,
      };
      if (editTask) {
        await logisticsApi.updateTask(editTask.id, payload);
        toast.success('Stop aggiornato');
      } else {
        await logisticsApi.createTask(payload);
        toast.success('Stop creato');
      }
      setTaskPanel(false);
      fetchTasks();
      fetchSummary();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const quickAssign = async (taskId, riderId) => {
    try {
      await logisticsApi.assignTask(taskId, { rider_id: riderId });
      toast.success('Assegnato');
      fetchTasks();
      fetchSummary();
    } catch (e) { toast.error('Errore assegnazione'); }
  };

  const quickStatus = async (taskId, status) => {
    try {
      await logisticsApi.updateStatus(taskId, { status });
      fetchTasks();
      fetchSummary();
    } catch (e) { toast.error('Errore'); }
  };

  const handleDelete = async () => {
    try {
      if (deleteDialog.type === 'task') await logisticsApi.deleteTask(deleteDialog.id);
      else if (deleteDialog.type === 'rider') await logisticsApi.deleteRider(deleteDialog.id);
      toast.success('Eliminato');
      setDeleteDialog({ open: false, type: '', id: '' });
      fetchTasks(); fetchRiders(); fetchSummary();
    } catch (e) { toast.error('Errore'); }
  };

  // Rider panel
  const openNewRider = () => {
    setRiderForm({ name: '', email: '', password: '', phone: '', vehicle_type: '' });
    setRiderPanel(true);
  };

  const saveRider = async () => {
    if (!riderForm.name || !riderForm.email || !riderForm.password) {
      toast.error('Nome, email e password richiesti'); return;
    }
    setSaving(true);
    try {
      await logisticsApi.createRider(riderForm);
      toast.success('Rider creato');
      setRiderPanel(false);
      fetchRiders();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  // Task items management
  const addItem = () => setTaskForm(p => ({ ...p, items: [...p.items, { article_id: '', quantity: 1, item_type: 'deliver' }] }));
  const removeItem = (idx) => setTaskForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx, field, val) => setTaskForm(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));

  // Auto-fill address when structure changes
  const handleStructureChange = (structureId) => {
    setTaskForm(p => ({ ...p, structure_id: structureId }));
    if (structureId) {
      const s = structures.find(s => s.id === structureId);
      if (s?.address && !taskForm.address) {
        setTaskForm(p => ({ ...p, address: s.address, access_details: s.access_details || p.access_details }));
      }
    }
  };

  // Filtered tasks
  const mapTasks = tasks.filter(t => t.latitude && t.longitude);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="logistics-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Logistica</h1>
          {summary && (
            <div className="flex items-center gap-3 mt-1 text-sm flex-wrap">
              <span className="text-muted-foreground">{summary.total_tasks} stop</span>
              {summary.by_status?.unassigned > 0 && (
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />{summary.by_status.unassigned} da assegnare
                </span>
              )}
              {summary.by_status?.completed > 0 && (
                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />{summary.by_status.completed} completati
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButton entity="logistics" />
          <Button onClick={openNewRider} variant="outline" className="h-8 gap-1" data-testid="add-rider-btn">
            <UserPlus className="h-3.5 w-3.5" />Rider
          </Button>
          <Button onClick={openNewTask} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-1" data-testid="add-task-btn">
            <Plus className="h-4 w-4" />Nuovo stop
          </Button>
        </div>
      </div>

      {/* Date Nav + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftDate(-1)} data-testid="date-prev">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="w-[130px] h-7 text-center border-0 bg-transparent text-sm font-medium" data-testid="date-picker" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftDate(1)} data-testid="date-next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-sm font-medium text-muted-foreground">{formatDateDisplay(selectedDate)}</span>

        <div className="flex items-center gap-1.5 ml-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-8" data-testid="filter-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {TASK_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={riderFilter} onValueChange={setRiderFilter}>
            <SelectTrigger className="w-[140px] h-8" data-testid="filter-rider"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i rider</SelectItem>
              {riders.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Rider summary strip */}
      {riders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {riders.map(r => {
            const rTasks = tasks.filter(t => t.rider_id === r.id);
            const done = rTasks.filter(t => t.status === 'completed').length;
            return (
              <div key={r.id}
                className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm shrink-0 cursor-pointer transition-colors",
                  riderFilter === r.id ? "border-[#F24E75] bg-[#F24E75]/5" : "border-border hover:bg-accent/30"
                )}
                onClick={() => setRiderFilter(riderFilter === r.id ? 'all' : r.id)}
                data-testid={`rider-chip-${r.id}`}
              >
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold text-primary">
                  {r.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">{done}/{rTasks.length}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Content: Map + List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: '500px' }}>
        {/* Map */}
        <div className="border border-border rounded-xl overflow-hidden bg-card" data-testid="logistics-map">
          <MapContainer
            center={[41.9028, 12.4964]}
            zoom={6}
            style={{ height: '500px', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapBounds tasks={mapTasks} />
            {mapTasks.map(task => (
              <Marker
                key={task.id}
                position={[task.latitude, task.longitude]}
                icon={createColorIcon(MARKER_COLORS[task.status] || '#94a3b8')}
                eventHandlers={{ click: () => setDetailPanel(task) }}
              >
                <Popup>
                  <div className="text-sm">
                    <strong>{TYPE_LABELS[task.task_type]}</strong>
                    {task.structure_name && <div>{task.structure_name}</div>}
                    {task.address && <div className="text-gray-500">{task.address}</div>}
                    <div className="mt-1 font-medium" style={{ color: MARKER_COLORS[task.status] }}>{STATUS_LABELS[task.status]}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Task List */}
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: '500px' }} data-testid="task-list">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Truck className="h-10 w-10 mb-3 opacity-40" />
              <p>{loading ? 'Caricamento...' : 'Nessuno stop per questa data'}</p>
            </div>
          ) : tasks.map(task => {
            const Icon = TYPE_ICONS[task.task_type] || Truck;
            return (
              <Card
                key={task.id}
                className={cn("kilolava-card cursor-pointer hover:ring-1 hover:ring-[#F24E75]/30 transition-all",
                  detailPanel?.id === task.id && "ring-1 ring-[#F24E75]"
                )}
                onClick={() => setDetailPanel(task)}
                data-testid={`task-card-${task.id}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{TYPE_LABELS[task.task_type]}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", STATUS_COLORS[task.status])}>
                            {STATUS_LABELS[task.status]}
                          </span>
                          {task.route_order > 0 && (
                            <span className="text-[10px] px-1 py-0.5 bg-muted rounded text-muted-foreground">#{task.route_order}</span>
                          )}
                        </div>
                        {task.structure_name && <p className="text-xs text-muted-foreground truncate">{task.client_name ? `${task.client_name} - ` : ''}{task.structure_name}</p>}
                        {task.address && <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3" />{task.address}</p>}
                        {task.time_window_start && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{task.time_window_start}{task.time_window_end ? ` - ${task.time_window_end}` : ''}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {task.status === 'unassigned' && riders.length > 0 && (
                        <Select onValueChange={v => quickAssign(task.id, v)}>
                          <SelectTrigger className="h-7 w-[90px] text-[11px]" data-testid={`assign-${task.id}`}>
                            <SelectValue placeholder="Assegna" />
                          </SelectTrigger>
                          <SelectContent>
                            {riders.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {task.rider_name && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-medium flex items-center gap-1">
                          <User className="h-3 w-3" />{task.rider_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {task.items?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {task.items.map((it, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-[11px]">
                          <span className="font-medium">{it.article_name || it.article_id}</span>
                          <span className="text-muted-foreground">x{it.quantity}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Detail Panel */}
      <SidePanel open={!!detailPanel} onClose={() => setDetailPanel(null)} title="Dettaglio Stop" wide>
        {detailPanel && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{TYPE_LABELS[detailPanel.task_type]}</span>
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[detailPanel.status])}>
                  {STATUS_LABELS[detailPanel.status]}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { openEditTask(detailPanel); setDetailPanel(null); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteDialog({ open: true, type: 'task', id: detailPanel.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {detailPanel.client_name && <div className="text-sm"><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{detailPanel.client_name}</span></div>}
            {detailPanel.structure_name && <div className="text-sm"><span className="text-muted-foreground">Struttura:</span> <span className="font-medium">{detailPanel.structure_name}</span></div>}
            {detailPanel.unit_name && <div className="text-sm"><span className="text-muted-foreground">Unita:</span> <span className="font-medium">{detailPanel.unit_name}</span></div>}
            {detailPanel.address && <div className="text-sm flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{detailPanel.address}</div>}
            {detailPanel.time_window_start && <div className="text-sm flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{detailPanel.time_window_start}{detailPanel.time_window_end ? ` - ${detailPanel.time_window_end}` : ''}</div>}
            {detailPanel.access_details && <div className="text-sm"><span className="text-muted-foreground">Accesso:</span> {detailPanel.access_details}</div>}
            {detailPanel.notes && <div className="text-sm"><span className="text-muted-foreground">Note:</span> {detailPanel.notes}</div>}

            {detailPanel.items?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1.5">Articoli</p>
                <div className="space-y-1">
                  {detailPanel.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/50 px-3 py-1.5 rounded text-sm">
                      <span>{it.article_name || it.article_id}</span>
                      <span className="font-medium">x{it.quantity} ({it.item_type === 'pickup' ? 'ritiro' : 'consegna'})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Azioni rapide</p>
              {detailPanel.status === 'unassigned' && (
                <div className="flex items-center gap-2">
                  <Select onValueChange={v => { quickAssign(detailPanel.id, v); setDetailPanel(null); }}>
                    <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Assegna a rider" /></SelectTrigger>
                    <SelectContent>
                      {riders.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {detailPanel.status === 'assigned' && (
                  <Button size="sm" className="h-8 gap-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { quickStatus(detailPanel.id, 'in_progress'); setDetailPanel(null); }}>
                    <Play className="h-3 w-3" />Avvia
                  </Button>
                )}
                {(detailPanel.status === 'in_progress' || detailPanel.status === 'assigned') && (
                  <Button size="sm" className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => { quickStatus(detailPanel.id, 'completed'); setDetailPanel(null); }}>
                    <Check className="h-3 w-3" />Completato
                  </Button>
                )}
                {detailPanel.status !== 'unassigned' && detailPanel.status !== 'problem' && (
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-red-600" onClick={() => { quickStatus(detailPanel.id, 'unassigned'); setDetailPanel(null); }}>
                    Rimuovi assegnazione
                  </Button>
                )}
              </div>
            </div>

            {detailPanel.problem_notes && (
              <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm">
                <p className="text-red-700 dark:text-red-400 font-medium">Problema segnalato</p>
                <p className="text-red-600 dark:text-red-300">{detailPanel.problem_notes}</p>
              </div>
            )}
            {detailPanel.completion_notes && (
              <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-sm">
                <p className="text-green-700 dark:text-green-400 font-medium">Note completamento</p>
                <p>{detailPanel.completion_notes}</p>
              </div>
            )}
          </div>
        )}
      </SidePanel>

      {/* Task Form Panel */}
      <SidePanel open={taskPanel} onClose={() => setTaskPanel(false)} title={editTask ? 'Modifica Stop' : 'Nuovo Stop'} wide>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={taskForm.task_type} onValueChange={v => setTaskForm(p => ({ ...p, task_type: v }))}>
                <SelectTrigger data-testid="task-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" value={taskForm.date} onChange={e => setTaskForm(p => ({ ...p, date: e.target.value }))} data-testid="task-date" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Finestra oraria da</Label>
              <Input type="time" value={taskForm.time_window_start} onChange={e => setTaskForm(p => ({ ...p, time_window_start: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Finestra oraria a</Label>
              <Input type="time" value={taskForm.time_window_end} onChange={e => setTaskForm(p => ({ ...p, time_window_end: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={taskForm.client_id || 'none'} onValueChange={v => setTaskForm(p => ({ ...p, client_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Opzionale" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Struttura</Label>
              <Select value={taskForm.structure_id || 'none'} onValueChange={v => handleStructureChange(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Opzionale" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {structures.filter(s => !taskForm.client_id || s.client_id === taskForm.client_id).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rider</Label>
              <Select value={taskForm.rider_id || 'none'} onValueChange={v => setTaskForm(p => ({ ...p, rider_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non assegnato</SelectItem>
                  {riders.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Indirizzo</Label>
            <Input value={taskForm.address} onChange={e => setTaskForm(p => ({ ...p, address: e.target.value }))} placeholder="Via Roma 1, Milano" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Latitudine</Label>
              <Input type="number" step="any" value={taskForm.latitude} onChange={e => setTaskForm(p => ({ ...p, latitude: e.target.value }))} placeholder="41.9028" />
            </div>
            <div className="space-y-2">
              <Label>Longitudine</Label>
              <Input type="number" step="any" value={taskForm.longitude} onChange={e => setTaskForm(p => ({ ...p, longitude: e.target.value }))} placeholder="12.4964" />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Articoli</Label>
              <Button variant="ghost" size="sm" onClick={addItem} className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Aggiungi</Button>
            </div>
            <div className="space-y-2">
              {taskForm.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={it.article_id || 'none'} onValueChange={v => updateItem(i, 'article_id', v === 'none' ? '' : v)}>
                    <SelectTrigger className="flex-1 h-8"><SelectValue placeholder="Articolo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-</SelectItem>
                      {articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" value={it.quantity} onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} className="w-16 h-8" />
                  <Select value={it.item_type} onValueChange={v => updateItem(i, 'item_type', v)}>
                    <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deliver">Consegna</SelectItem>
                      <SelectItem value="pickup">Ritiro</SelectItem>
                    </SelectContent>
                  </Select>
                  {taskForm.items.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(i)}><X className="h-3 w-3" /></Button>}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dettagli accesso</Label>
            <Textarea value={taskForm.access_details} onChange={e => setTaskForm(p => ({ ...p, access_details: e.target.value }))} rows={2} className="resize-none" placeholder="Keybox codice 1234, terzo piano" />
          </div>

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea value={taskForm.notes} onChange={e => setTaskForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3">
          <Button variant="outline" onClick={() => setTaskPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={saveTask} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-task-btn">
            {saving ? '...' : editTask ? 'Aggiorna' : 'Crea'}
          </Button>
        </div>
      </SidePanel>

      {/* Rider Form Panel */}
      <SidePanel open={riderPanel} onClose={() => setRiderPanel(false)} title="Nuovo Rider">
        <div className="p-5 space-y-4">
          <div className="space-y-2"><Label>Nome *</Label><Input value={riderForm.name} onChange={e => setRiderForm(p => ({ ...p, name: e.target.value }))} data-testid="rider-name" /></div>
          <div className="space-y-2"><Label>Email *</Label><Input type="email" value={riderForm.email} onChange={e => setRiderForm(p => ({ ...p, email: e.target.value }))} data-testid="rider-email" /></div>
          <div className="space-y-2"><Label>Password *</Label><Input type="password" value={riderForm.password} onChange={e => setRiderForm(p => ({ ...p, password: e.target.value }))} data-testid="rider-password" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Telefono</Label><Input value={riderForm.phone} onChange={e => setRiderForm(p => ({ ...p, phone: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Veicolo</Label><Input value={riderForm.vehicle_type} onChange={e => setRiderForm(p => ({ ...p, vehicle_type: e.target.value }))} placeholder="Furgone, Scooter..." /></div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3">
          <Button variant="outline" onClick={() => setRiderPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={saveRider} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-rider-btn">
            {saving ? '...' : 'Crea Rider'}
          </Button>
        </div>
      </SidePanel>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={v => !v && setDeleteDialog({ open: false, type: '', id: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro? L'operazione non e reversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-btn">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LogisticsPage;
