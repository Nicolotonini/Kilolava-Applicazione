import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { API_BASE } from '../lib/api';
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
  Plus, X, Search, Pencil, Trash2, AlertTriangle, User, MapPin,
  Clock, ChevronRight, ArrowLeft, Camera, Loader2, History, Send,
  Zap, Wrench, Armchair, CircleAlert, Package, MoreHorizontal, Image
} from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState, ListSkeleton } from '../components/kilolava/EmptyState';

const STATUS_CONFIG = {
  open: { label: 'Aperto', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', dot: 'bg-red-400' },
  assigned: { label: 'Assegnato', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', dot: 'bg-blue-400' },
  in_progress: { label: 'In corso', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', dot: 'bg-amber-400' },
  resolved: { label: 'Risolto', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', dot: 'bg-green-400' },
  closed: { label: 'Chiuso', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400', dot: 'bg-gray-400' },
};

const PRIORITY_CONFIG = {
  low: { label: 'Bassa', color: 'bg-gray-100 text-gray-600', border: 'border-l-gray-300' },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-700', border: 'border-l-blue-400' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700', border: 'border-l-orange-400' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
};

const CATEGORY_CONFIG = {
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

const SidePanel = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[52%] lg:w-[40%] bg-card border-l border-border z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

// ===== ISSUE DETAIL VIEW =====
export const IssueDetail = ({ issue, onBack, onRefresh, staffList }) => {
  const [assigning, setAssigning] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const sc = STATUS_CONFIG[issue.status] || STATUS_CONFIG.open;
  const pc = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medium;
  const cc = CATEGORY_CONFIG[issue.category] || CATEGORY_CONFIG.other;
  const CatIcon = cc.icon;

  const handleAssign = async (userId) => {
    setAssigning(true);
    try {
      await api.put(`/maintenance/issues/${issue.id}`, { assigned_to: userId || null });
      toast.success(userId ? 'Assegnato' : 'Assegnazione rimossa');
      onRefresh();
    } catch (e) { toast.error('Errore'); }
    finally { setAssigning(false); }
  };

  const handleStatusChange = async (newStatus) => {
    try {
      await api.put(`/maintenance/issues/${issue.id}/status`, { status: newStatus });
      toast.success('Stato aggiornato');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const handlePriorityChange = async (newPriority) => {
    try {
      await api.put(`/maintenance/issues/${issue.id}`, { priority: newPriority });
      toast.success('Priorita aggiornata');
      onRefresh();
    } catch (e) { toast.error('Errore'); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/maintenance/issues/${issue.id}/notes`, { note: noteText });
      toast.success('Nota aggiunta');
      setNoteText('');
      setAddingNote(false);
      onRefresh();
    } catch (e) { toast.error('Errore'); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <p className="text-sm font-semibold">Dettaglio Issue</p>
        </div>
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", sc.color)}>{sc.label}</span>
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", pc.color)}>{pc.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Header info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CatIcon className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-semibold">{cc.label}</h3>
            {issue.source === 'cleaning' && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">Da pulizia</span>}
          </div>
          <p className="text-sm text-muted-foreground">{issue.description}</p>
        </div>

        {/* Location */}
        <Card className="border">
          <CardContent className="p-3 space-y-1">
            {issue.structure_name && <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" /><span className="font-medium">{issue.structure_name}</span>{issue.unit_name && <span className="text-muted-foreground">/ {issue.unit_name}</span>}</div>}
            {issue.structure_address && <p className="text-xs text-muted-foreground ml-6">{issue.structure_address}</p>}
            {issue.client_name && <div className="flex items-center gap-2 text-sm ml-6"><span className="text-muted-foreground">Cliente: {issue.client_name}</span></div>}
          </CardContent>
        </Card>

        {/* Photos */}
        {issue.photos && issue.photos.filter(p => p.path).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1"><Image className="h-4 w-4" />Foto</h4>
            <div className="flex gap-2 overflow-x-auto">
              {issue.photos.filter(p => p.path).map((p, i) => (
                <div key={i} className="w-20 h-20 rounded-lg bg-muted border overflow-hidden flex-shrink-0">
                  <img src={`${API_BASE}/files/${p.path}?auth=${localStorage.getItem('kilolava_token')}`} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assignment */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Assegnazione</h4>
          <Select value={issue.assigned_to || 'none'} onValueChange={v => handleAssign(v === 'none' ? '' : v)} disabled={assigning}>
            <SelectTrigger className="h-9" data-testid="assign-staff"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non assegnato</SelectItem>
              {staffList.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Priorita</h4>
          <div className="flex gap-1">
            {Object.entries(PRIORITY_CONFIG).map(([k, c]) => (
              <Button key={k} variant={issue.priority === k ? 'default' : 'outline'} size="sm"
                className={cn("flex-1 h-8 text-xs", issue.priority === k && k === 'urgent' && 'bg-red-600 hover:bg-red-700')}
                onClick={() => handlePriorityChange(k)}>{c.label}</Button>
            ))}
          </div>
        </div>

        {/* Status actions */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Stato</h4>
          <div className="flex gap-1 flex-wrap">
            {Object.entries(STATUS_CONFIG).map(([k, c]) => (
              <Button key={k} variant={issue.status === k ? 'default' : 'outline'} size="sm"
                className="h-8 text-xs" onClick={() => handleStatusChange(k)} data-testid={`status-${k}`}>{c.label}</Button>
            ))}
          </div>
        </div>

        {/* Internal notes */}
        {issue.internal_notes && (
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Note interne</h4>
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg whitespace-pre-line">{issue.internal_notes}</p>
          </div>
        )}

        {/* Add note */}
        {addingNote ? (
          <div className="space-y-2">
            <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Scrivi nota..." rows={2} className="resize-none" data-testid="note-input" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddingNote(false)} className="flex-1">Annulla</Button>
              <Button size="sm" onClick={handleAddNote} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-1" data-testid="submit-note"><Send className="h-3 w-3" />Invia</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddingNote(true)} className="w-full gap-1" data-testid="add-note-btn"><Plus className="h-3 w-3" />Aggiungi nota</Button>
        )}

        {/* History */}
        {issue.history && issue.history.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1"><History className="h-4 w-4" />Storico ({issue.history.length})</h4>
            <div className="space-y-1">
              {[...issue.history].reverse().map((h, i) => (
                <div key={i} className="text-xs py-1.5 px-3 bg-muted/30 rounded-md flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0">{formatDate(h.at)}</span>
                  <span className="font-medium shrink-0">{h.by_name}</span>
                  <span className="text-muted-foreground">{h.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t border-border">
          <p>Segnalato da: {issue.reporter_name} il {formatDate(issue.created_at)}</p>
          {issue.resolved_at && <p>Risolto: {formatDate(issue.resolved_at)}</p>}
          {issue.cleaning_task_id && <p>Cleaning task: {issue.cleaning_task_id.slice(0, 8)}...</p>}
        </div>
      </div>
    </div>
  );
};

// ===== MAIN PAGE =====
const MaintenanceIssuesPage = () => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [panel, setPanel] = useState(false);
  const [detailIssue, setDetailIssue] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: '' });
  const [saving, setSaving] = useState(false);
  const [structures, setStructures] = useState([]);
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);

  const [form, setForm] = useState({
    client_id: '', structure_id: '', unit_id: '', category: 'other',
    description: '', priority: 'medium', assigned_to: '', scheduled_date: '', internal_notes: '',
  });
  const [units, setUnits] = useState([]);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      const [issRes, sumRes] = await Promise.all([
        api.get('/maintenance/issues', { params }),
        api.get('/maintenance/summary'),
      ]);
      setIssues(issRes.data);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, priorityFilter]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [sRes, cRes, stRes] = await Promise.all([
        api.get('/structures'), api.get('/clients'), api.get('/maintenance/staff'),
      ]);
      setStructures(sRes.data);
      setClients(cRes.data);
      setStaff(stRes.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    if (form.structure_id) {
      api.get('/units', { params: { structure_id: form.structure_id } })
        .then(res => setUnits(res.data)).catch(() => setUnits([]));
    } else { setUnits([]); }
  }, [form.structure_id]);

  const openNew = () => {
    setDetailIssue(null);
    setForm({
      client_id: '', structure_id: '', unit_id: '', category: 'other',
      description: '', priority: 'medium', assigned_to: '', scheduled_date: '', internal_notes: '',
    });
    setPanel(true);
  };

  const openDetail = (issue) => {
    navigate(`/maintenance/issue/${issue.id}`);
  };

  const refreshDetail = async () => {
    if (detailIssue) {
      try {
        const res = await api.get(`/maintenance/issues/${detailIssue.id}`);
        setDetailIssue(res.data);
      } catch (e) { console.error(e); }
    }
    fetchIssues();
  };

  const handleStructureChange = (sid) => {
    const s = structures.find(st => st.id === sid);
    setForm(p => ({ ...p, structure_id: sid, unit_id: '', client_id: s?.client_id || p.client_id }));
  };

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('Descrizione richiesta'); return; }
    setSaving(true);
    try {
      await api.post('/maintenance/issues', {
        ...form,
        client_id: form.client_id || null,
        structure_id: form.structure_id || null,
        unit_id: form.unit_id || null,
        assigned_to: form.assigned_to || null,
        scheduled_date: form.scheduled_date || null,
      });
      toast.success('Issue creato');
      setPanel(false);
      fetchIssues();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/maintenance/issues/${deleteDialog.id}`);
      toast.success('Issue eliminato');
      setDeleteDialog({ open: false, id: '' });
      if (detailIssue?.id === deleteDialog.id) setDetailIssue(null);
      fetchIssues();
    } catch (e) { toast.error('Errore'); }
  };

  const filtered = issues.filter(i => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (i.description || '').toLowerCase().includes(q)
      || (i.structure_name || '').toLowerCase().includes(q)
      || (i.client_name || '').toLowerCase().includes(q)
      || (CATEGORY_CONFIG[i.category]?.label || '').toLowerCase().includes(q);
  });

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="maintenance-issues-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Manutenzione</h1>
          <p className="text-sm text-muted-foreground">{summary?.open || 0} issue aperti su {summary?.total || 0} totali</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="maintenance" />
          <Button onClick={openNew} className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground gap-1" data-testid="new-issue-btn">
            <Plus className="h-4 w-4" />Nuovo issue
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Aperti', val: (summary.by_status?.open || 0), cls: 'text-red-600' },
            { label: 'Assegnati', val: (summary.by_status?.assigned || 0), cls: 'text-blue-600' },
            { label: 'In corso', val: (summary.by_status?.in_progress || 0), cls: 'text-amber-600' },
            { label: 'Risolti', val: (summary.by_status?.resolved || 0), cls: 'text-green-600' },
          ].map(c => (
            <Card key={c.label} className="border"><CardContent className="p-3 text-center">
              <p className={cn("text-xl font-bold", c.cls)}>{c.val}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cerca..."
            className="h-8 pl-9 text-sm" data-testid="search-issues" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {['all', ...Object.keys(STATUS_CONFIG)].map(s => {
            const cfg = s === 'all' ? { label: `Tutti (${issues.length})` } : STATUS_CONFIG[s];
            const count = s === 'all' ? issues.length : issues.filter(i => i.status === s).length;
            return (
              <button key={s} className={cn("text-xs px-2.5 py-1 rounded-full font-medium border shrink-0 transition-colors",
                statusFilter === s ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground"
              )} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}>
                {s === 'all' ? `Tutti` : cfg.label} {s !== 'all' ? `(${count})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority filter */}
      <div className="flex gap-1">
        {['all', ...Object.keys(PRIORITY_CONFIG)].map(p => {
          const cfg = p === 'all' ? { label: 'Tutte' } : PRIORITY_CONFIG[p];
          return (
            <button key={p} className={cn("text-xs px-2.5 py-1 rounded-full font-medium border shrink-0 transition-colors",
              priorityFilter === p ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground"
            )} onClick={() => setPriorityFilter(priorityFilter === p ? 'all' : p)}>
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Issues list */}
      {loading ? (
        <ListSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={AlertTriangle} message="Nessun issue trovato" />
      ) : (
        <div className="space-y-2">
          {filtered.map(issue => {
            const sc = STATUS_CONFIG[issue.status] || STATUS_CONFIG.open;
            const pc = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medium;
            const cc = CATEGORY_CONFIG[issue.category] || CATEGORY_CONFIG.other;
            const CatIcon = cc.icon;
            return (
              <Card key={issue.id} className={cn("border-l-4 cursor-pointer transition-all hover:ring-1 hover:ring-[#F24E75]/30", pc.border)}
                onClick={() => openDetail(issue)} data-testid={`issue-${issue.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CatIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold">{cc.label}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", sc.color)}>{sc.label}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", pc.color)}>{pc.label}</span>
                        {issue.source === 'cleaning' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">Pulizia</span>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{issue.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {issue.structure_name && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{issue.structure_name}{issue.unit_name ? ` / ${issue.unit_name}` : ''}</span>}
                        {issue.assigned_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{issue.assigned_name}</span>}
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(issue.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); setDeleteDialog({ open: true, id: issue.id }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      {/* Create Panel */}
      <SidePanel open={panel} onClose={() => setPanel(false)} title="Nuovo Issue Manutenzione">
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
              <SelectTrigger data-testid="issue-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_CONFIG).map(([k, c]) => <SelectItem key={k} value={k}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrizione *</Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3} className="resize-none" placeholder="Descrivi il problema..." data-testid="issue-description" />
          </div>
          <div className="space-y-2">
            <Label>Priorita</Label>
            <div className="flex gap-1">
              {Object.entries(PRIORITY_CONFIG).map(([k, c]) => (
                <Button key={k} variant={form.priority === k ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs"
                  onClick={() => setForm(p => ({ ...p, priority: k }))}>{c.label}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Struttura</Label>
            <Select value={form.structure_id || 'none'} onValueChange={v => handleStructureChange(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Assegna a</Label>
            <Select value={form.assigned_to || 'none'} onValueChange={v => setForm(p => ({ ...p, assigned_to: v === 'none' ? '' : v }))}>
              <SelectTrigger data-testid="issue-assignee"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnato</SelectItem>
                {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data programmata</Label>
            <Input type="date" value={form.scheduled_date} onChange={e => setForm(p => ({ ...p, scheduled_date: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Note interne</Label>
            <Textarea value={form.internal_notes} onChange={e => setForm(p => ({ ...p, internal_notes: e.target.value }))} rows={2} className="resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={() => setPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-issue-btn">
            {saving ? '...' : 'Crea issue'}
          </Button>
        </div>
      </SidePanel>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={v => !v && setDeleteDialog({ open: false, id: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina issue</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro? L'issue verra eliminato permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" data-testid="confirm-delete-issue">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MaintenanceIssuesPage;
