import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api, { API_BASE } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, X, Search, Trash2, AlertTriangle, User, MapPin,
  Clock, ChevronRight, ArrowLeft, Camera, History, Send,
  Zap, Wrench, Armchair, CircleAlert, Package, MoreHorizontal, Image,
  Play, PauseCircle, Check, Ban, Truck, Link2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState, ListSkeleton } from '../components/kilolava/EmptyState';

export const STATUS_CONFIG = {
  open: { label: 'Da fare', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  assigned: { label: 'Assegnato', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  in_progress: { label: 'In corso', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  on_hold: { label: 'In attesa', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  completed: { label: 'Completata', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  cancelled: { label: 'Annullata', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  resolved: { label: 'Risolto (storico)', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  closed: { label: 'Chiuso (storico)', color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

const ACTIVE_STATUSES = ['open', 'assigned', 'in_progress', 'on_hold'];
const HISTORY_STATUSES = ['completed', 'cancelled', 'resolved', 'closed'];

const HOLD_REASONS = {
  cliente: 'Cliente', materiale: 'Materiale', ricambio: 'Ricambio',
  fornitore: 'Fornitore', autorizzazione: 'Autorizzazione', altro: 'Altro',
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

// ===== MATERIALI DIALOG =====
const MaterialsDialog = ({ open, onClose, issue, onSaved }) => {
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const m = issue.materials || [];
      setRows(m.length ? m.map((x) => ({ ...x })) : [{ description: '', qty: 1, available: true, to_bring: false, note: '' }]);
    }
  }, [open, issue]);

  const save = async () => {
    const valid = rows.filter((r) => r.description.trim());
    setSaving(true);
    try {
      await api.put(`/maintenance/issues/${issue.id}/materials`, {
        materials: valid.map((r) => ({ ...r, qty: parseInt(r.qty) || 1 })),
      });
      toast.success('Materiali salvati');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="materials-dialog">
        <DialogHeader><DialogTitle>Materiali intervento</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center" data-testid={`material-row-${i}`}>
              <Input className="col-span-4 h-8" placeholder="Descrizione" value={r.description}
                onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                data-testid={`material-desc-${i}`} />
              <Input className="col-span-1 h-8" type="number" min={1} value={r.qty}
                onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                data-testid={`material-qty-${i}`} />
              <label className="col-span-2 flex items-center gap-1.5 text-xs">
                <Checkbox checked={r.available} onCheckedChange={(v) => setRows((p) => p.map((x, j) => j === i ? { ...x, available: !!v } : x))} data-testid={`material-available-${i}`} />
                Disponibile
              </label>
              <label className="col-span-2 flex items-center gap-1.5 text-xs">
                <Checkbox checked={r.to_bring} onCheckedChange={(v) => setRows((p) => p.map((x, j) => j === i ? { ...x, to_bring: !!v } : x))} data-testid={`material-tobring-${i}`} />
                Da portare
              </label>
              <Input className="col-span-2 h-8" placeholder="Note" value={r.note || ''}
                onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
              <Button variant="ghost" size="icon" className="col-span-1 h-8 w-8" onClick={() => setRows((p) => p.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setRows((p) => [...p, { description: '', qty: 1, available: true, to_bring: false, note: '' }])} data-testid="material-add-row">
            <Plus className="h-3 w-3" />Aggiungi materiale
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="materials-save">{saving ? '...' : 'Salva materiali'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ===== ISSUE DETAIL VIEW =====
export const IssueDetail = ({ issue, onBack, onRefresh, staffList }) => {
  const navigate = useNavigate();
  const [assigning, setAssigning] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holdNote, setHoldNote] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [materialsNote, setMaterialsNote] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const sc = STATUS_CONFIG[issue.status] || STATUS_CONFIG.open;
  const pc = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medium;
  const cc = CATEGORY_CONFIG[issue.category] || CATEGORY_CONFIG.other;
  const CatIcon = cc.icon;
  const active = ACTIVE_STATUSES.includes(issue.status);

  const handleAssign = async (userId) => {
    setAssigning(true);
    try {
      await api.put(`/maintenance/issues/${issue.id}`, { assigned_to: userId || null });
      toast.success(userId ? 'Assegnato' : 'Assegnazione rimossa');
      onRefresh();
    } catch (e) { toast.error('Errore'); }
    finally { setAssigning(false); }
  };

  const handleStart = async () => {
    try {
      await api.put(`/maintenance/issues/${issue.id}/start`);
      toast.success('Intervento avviato');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const handleHold = async () => {
    if (!holdReason) { toast.error('Il motivo dell\'attesa è obbligatorio'); return; }
    try {
      await api.put(`/maintenance/issues/${issue.id}/hold`, { reason: holdReason, note: holdNote || null });
      toast.success('Intervento in attesa');
      setHoldOpen(false); setHoldReason(''); setHoldNote('');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const handleComplete = async () => {
    if (!resolutionNotes.trim()) { toast.error('La nota di risoluzione è obbligatoria'); return; }
    try {
      await api.put(`/maintenance/issues/${issue.id}/complete`, {
        resolution_notes: resolutionNotes, materials_note: materialsNote || null,
      });
      toast.success('Intervento completato — la segnalazione collegata è stata risolta');
      setCompleteOpen(false); setResolutionNotes(''); setMaterialsNote('');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const handleCancel = async () => {
    try {
      await api.put(`/maintenance/issues/${issue.id}/cancel`, { reason: cancelReason || null });
      toast.success('Intervento annullato');
      setCancelOpen(false); setCancelReason('');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const handlePriorityChange = async (newPriority) => {
    try {
      await api.put(`/maintenance/issues/${issue.id}`, { priority: newPriority });
      toast.success('Priorità aggiornata');
      onRefresh();
    } catch (e) { toast.error('Errore'); }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await api.post(`/maintenance/issues/${issue.id}/notes`, { note: noteText });
      toast.success('Nota aggiunta');
      setNoteText(''); setAddingNote(false);
      onRefresh();
    } catch (e) { toast.error('Errore'); }
  };

  const handlePhotoUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/maintenance/issues/${issue.id}/photo?photo_type=after`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Foto caricata');
        onRefresh();
      } catch { toast.error('Errore upload'); }
    };
    input.click();
  };

  const createMaterialsRequest = async () => {
    try {
      await api.post(`/maintenance/issues/${issue.id}/materials-request`);
      toast.success('Richiesta logistica creata in Consegne → Da organizzare');
      onRefresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const materials = issue.materials || [];
  const toBring = materials.filter((m) => m.to_bring);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} data-testid="issue-back-btn"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{issue.title || 'Intervento manutenzione'}</p>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', sc.color)} data-testid="issue-status-badge">{sc.label}</span>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', pc.color)}>{pc.label}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Azioni di flusso */}
        {active && (
          <div className="flex gap-2 flex-wrap" data-testid="issue-flow-actions">
            {issue.status !== 'in_progress' && (
              <Button size="sm" className="h-9 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={handleStart} data-testid="issue-start-btn">
                <Play className="h-4 w-4" />Avvia
              </Button>
            )}
            {issue.status !== 'on_hold' && (
              <Button size="sm" variant="outline" className="h-9 gap-1.5 text-orange-600 border-orange-200" onClick={() => setHoldOpen(true)} data-testid="issue-hold-btn">
                <PauseCircle className="h-4 w-4" />Metti in attesa
              </Button>
            )}
            <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCompleteOpen(true)} data-testid="issue-complete-btn">
              <Check className="h-4 w-4" />Completa
            </Button>
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground" onClick={() => setCancelOpen(true)} data-testid="issue-cancel-btn">
              <Ban className="h-4 w-4" />Annulla
            </Button>
          </div>
        )}

        {/* Motivo attesa */}
        {issue.status === 'on_hold' && issue.hold_reason && (
          <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3" data-testid="issue-hold-reason">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 uppercase">In attesa — {HOLD_REASONS[issue.hold_reason.reason] || issue.hold_reason.reason}</p>
            {issue.hold_reason.note && <p className="text-sm mt-1">{issue.hold_reason.note}</p>}
            <p className="text-xs text-muted-foreground mt-1">{issue.hold_reason.by_name} · {formatDate(issue.hold_reason.at)}</p>
          </div>
        )}

        {/* Risoluzione */}
        {issue.status === 'completed' && issue.resolution_notes && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3" data-testid="issue-resolution">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Risoluzione</p>
            <p className="text-sm mt-1 whitespace-pre-line">{issue.resolution_notes}</p>
            {issue.materials_note && <p className="text-xs text-muted-foreground mt-1">Materiali usati: {issue.materials_note}</p>}
            <p className="text-xs text-muted-foreground mt-1">{issue.completed_by_name} · {formatDate(issue.completed_at)}</p>
          </div>
        )}

        {/* Header info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CatIcon className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-base font-semibold">{cc.label}</h3>
            {issue.source === 'cleaning' && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">Da pulizia</span>}
            {issue.source === 'segnalazione' && <span className="text-xs px-2 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">Da segnalazione</span>}
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{issue.description}</p>
          {issue.segnalazione_id && (
            <button
              className="text-xs text-primary hover:underline flex items-center gap-1"
              onClick={() => navigate(`/segnalazioni/${issue.segnalazione_id}`)}
              data-testid="issue-segnalazione-link"
            >
              <Link2 className="h-3 w-3" />Apri segnalazione collegata
            </button>
          )}
        </div>

        {/* Location */}
        <Card className="border">
          <CardContent className="p-3 space-y-1">
            {issue.structure_name && <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" /><span className="font-medium">{issue.structure_name}</span>{issue.unit_name && <span className="text-muted-foreground">/ {issue.unit_name}</span>}</div>}
            {issue.structure_address && <p className="text-xs text-muted-foreground ml-6">{issue.structure_address}</p>}
            {issue.client_name && <div className="flex items-center gap-2 text-sm ml-6"><span className="text-muted-foreground">Cliente: {issue.client_name}</span></div>}
            {issue.scheduled_date && <p className="text-xs text-muted-foreground ml-6">Programmato: {issue.scheduled_date}</p>}
          </CardContent>
        </Card>

        {/* Materiali */}
        <div className="space-y-2" data-testid="issue-materials-section">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Materiali</h4>
            <div className="flex gap-1.5">
              {active && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setMaterialsOpen(true)} data-testid="issue-materials-edit">
                  {materials.length ? 'Modifica' : 'Aggiungi'}
                </Button>
              )}
              {active && toBring.length > 0 && (
                <Button size="sm" className="h-7 text-xs gap-1" onClick={createMaterialsRequest} data-testid="issue-materials-request-btn">
                  <Truck className="h-3 w-3" />Crea richiesta logistica
                </Button>
              )}
            </div>
          </div>
          {materials.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nessun materiale registrato</p>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border/60">
              {materials.map((m, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`issue-material-${i}`}>
                  <span className="flex-1 min-w-0 truncate">{m.qty}× {m.description}{m.note ? ` — ${m.note}` : ''}</span>
                  {m.available && <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Disponibile</span>}
                  {m.to_bring && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Da portare</span>}
                </div>
              ))}
            </div>
          )}
          {issue.materials_richiesta_id && (
            <p className="text-xs text-emerald-600 flex items-center gap-1" data-testid="issue-materials-request-created">
              <Truck className="h-3 w-3" />Richiesta logistica collegata creata
            </p>
          )}
        </div>

        {/* Photos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-1"><Image className="h-4 w-4" />Foto</h4>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handlePhotoUpload} data-testid="issue-photo-upload">
              <Camera className="h-3 w-3" />Carica foto
            </Button>
          </div>
          {issue.photos && issue.photos.filter((p) => p.path).length > 0 ? (
            <div className="flex gap-2 overflow-x-auto">
              {issue.photos.filter((p) => p.path).map((p, i) => (
                <div key={i} className="w-20 h-20 rounded-lg bg-muted border overflow-hidden flex-shrink-0">
                  <img src={`${API_BASE}/files/${p.path}?auth=${localStorage.getItem('kilolava_token')}`} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nessuna foto</p>
          )}
        </div>

        {/* Assignment */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Assegnazione</h4>
          <Select value={issue.assigned_to || 'none'} onValueChange={(v) => handleAssign(v === 'none' ? '' : v)} disabled={assigning || !active}>
            <SelectTrigger className="h-9" data-testid="assign-staff"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Non assegnato</SelectItem>
              {staffList.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Priorità</h4>
          <div className="flex gap-1">
            {Object.entries(PRIORITY_CONFIG).map(([k, c]) => (
              <Button key={k} variant={issue.priority === k ? 'default' : 'outline'} size="sm"
                className={cn('flex-1 h-8 text-xs', issue.priority === k && k === 'urgent' && 'bg-red-600 hover:bg-red-700')}
                disabled={!active}
                onClick={() => handlePriorityChange(k)}>{c.label}</Button>
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

        {addingNote ? (
          <div className="space-y-2">
            <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Scrivi nota..." rows={2} className="resize-none" data-testid="note-input" />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setAddingNote(false)} className="flex-1">Annulla</Button>
              <Button size="sm" onClick={handleAddNote} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground gap-1" data-testid="submit-note"><Send className="h-3 w-3" />Invia</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAddingNote(true)} className="w-full gap-1" data-testid="add-note-btn"><Plus className="h-3 w-3" />Aggiungi nota</Button>
        )}

        {/* History / audit */}
        {issue.history && issue.history.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1"><History className="h-4 w-4" />Cronologia ({issue.history.length})</h4>
            <div className="space-y-1" data-testid="issue-history">
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
          {issue.started_at && <p>Avviato: {formatDate(issue.started_at)}</p>}
          {issue.completed_at && <p>Completato: {formatDate(issue.completed_at)} da {issue.completed_by_name}</p>}
          {issue.cancelled_at && <p>Annullato: {formatDate(issue.cancelled_at)}{issue.cancel_reason ? ` — ${issue.cancel_reason}` : ''}</p>}
        </div>
      </div>

      {/* Dialog: In attesa */}
      <Dialog open={holdOpen} onOpenChange={(v) => !v && setHoldOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="hold-dialog">
          <DialogHeader><DialogTitle>Metti in attesa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo *</Label>
              <Select value={holdReason || 'none'} onValueChange={(v) => setHoldReason(v === 'none' ? '' : v)}>
                <SelectTrigger data-testid="hold-reason-select"><SelectValue placeholder="Seleziona motivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {Object.entries(HOLD_REASONS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dettaglio</Label>
              <Textarea rows={2} value={holdNote} onChange={(e) => setHoldNote(e.target.value)} className="resize-none" data-testid="hold-note-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Annulla</Button>
            <Button onClick={handleHold} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="hold-submit">In attesa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Completa */}
      <Dialog open={completeOpen} onOpenChange={(v) => !v && setCompleteOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="complete-dialog">
          <DialogHeader><DialogTitle>Completa intervento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nota di risoluzione * (obbligatoria)</Label>
              <Textarea rows={3} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Come è stato risolto..." className="resize-none" data-testid="resolution-notes-input" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Materiali utilizzati (facoltativo)</Label>
              <Textarea rows={2} value={materialsNote} onChange={(e) => setMaterialsNote(e.target.value)} className="resize-none" data-testid="materials-used-input" />
            </div>
            {issue.segnalazione_id && (
              <p className="text-xs text-muted-foreground">La segnalazione collegata verrà impostata su "Risolta".</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Annulla</Button>
            <Button onClick={handleComplete} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="complete-submit">Completa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Annulla */}
      <Dialog open={cancelOpen} onOpenChange={(v) => !v && setCancelOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="cancel-dialog">
          <DialogHeader><DialogTitle>Annulla intervento</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo (facoltativo)</Label>
            <Textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="resize-none" data-testid="cancel-reason-input" />
          </div>
          <p className="text-xs text-muted-foreground">La segnalazione collegata resta aperta: il problema non risulta risolto.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Indietro</Button>
            <Button variant="destructive" onClick={handleCancel} data-testid="cancel-submit">Annulla intervento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MaterialsDialog open={materialsOpen} onClose={() => setMaterialsOpen(false)} issue={issue} onSaved={() => { setMaterialsOpen(false); onRefresh(); }} />
    </div>
  );
};

// ===== MAIN PAGE =====
const MaintenanceIssuesPage = () => {
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState('interventi');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [panel, setPanel] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setPanel(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: '' });
  const [saving, setSaving] = useState(false);
  const [structures, setStructures] = useState([]);
  const [staff, setStaff] = useState([]);

  const [form, setForm] = useState({
    title: '', client_id: '', structure_id: '', unit_id: '', category: 'other',
    description: '', priority: 'medium', assigned_to: '', scheduled_date: '', internal_notes: '',
  });
  const [units, setUnits] = useState([]);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    try {
      const [issRes, sumRes] = await Promise.all([
        api.get('/maintenance/issues'),
        api.get('/maintenance/summary'),
      ]);
      setIssues(issRes.data);
      setSummary(sumRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [sRes, stRes] = await Promise.all([api.get('/structures'), api.get('/maintenance/staff')]);
      setStructures(sRes.data);
      setStaff(stRes.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    if (form.structure_id) {
      api.get('/units', { params: { structure_id: form.structure_id } })
        .then((res) => setUnits(res.data)).catch(() => setUnits([]));
    } else { setUnits([]); }
  }, [form.structure_id]);

  const openNew = () => {
    setForm({
      title: '', client_id: '', structure_id: '', unit_id: '', category: 'other',
      description: '', priority: 'medium', assigned_to: '', scheduled_date: '', internal_notes: '',
    });
    setPanel(true);
  };

  const handleStructureChange = (sid) => {
    const s = structures.find((st) => st.id === sid);
    setForm((p) => ({ ...p, structure_id: sid, unit_id: '', client_id: s?.client_id || p.client_id }));
  };

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('Descrizione richiesta'); return; }
    setSaving(true);
    try {
      await api.post('/maintenance/issues', {
        ...form,
        title: form.title || null,
        client_id: form.client_id || null,
        structure_id: form.structure_id || null,
        unit_id: form.unit_id || null,
        assigned_to: form.assigned_to || null,
        scheduled_date: form.scheduled_date || null,
      });
      toast.success('Intervento creato');
      setPanel(false);
      fetchIssues();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/maintenance/issues/${deleteDialog.id}`);
      toast.success('Intervento eliminato');
      setDeleteDialog({ open: false, id: '' });
      fetchIssues();
    } catch (e) { toast.error('Errore'); }
  };

  const tabIssues = issues.filter((i) => (tab === 'interventi' ? ACTIVE_STATUSES : HISTORY_STATUSES).includes(i.status));
  const tabStatuses = tab === 'interventi' ? ACTIVE_STATUSES : HISTORY_STATUSES;

  const filtered = tabIssues.filter((i) => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (i.title || '').toLowerCase().includes(q)
      || (i.description || '').toLowerCase().includes(q)
      || (i.structure_name || '').toLowerCase().includes(q)
      || (i.client_name || '').toLowerCase().includes(q)
      || (CATEGORY_CONFIG[i.category]?.label || '').toLowerCase().includes(q);
  });

  const activeCount = issues.filter((i) => ACTIVE_STATUSES.includes(i.status)).length;
  const histCount = issues.filter((i) => HISTORY_STATUSES.includes(i.status)).length;

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="maintenance-issues-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Manutenzioni</h1>
          <p className="text-sm text-muted-foreground">Interventi collegati alle Segnalazioni — {activeCount} aperti</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openNew} className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground gap-1" data-testid="new-issue-btn">
            <Plus className="h-4 w-4" />Nuovo intervento
          </Button>
        </div>
      </div>

      {/* Tabs Interventi | Storico */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'interventi', label: `Interventi (${activeCount})` },
          { key: 'storico', label: `Storico (${histCount})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setStatusFilter('all'); }}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
            data-testid={`maintenance-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {summary && tab === 'interventi' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Da fare', val: (summary.by_status?.open || 0) + (summary.by_status?.assigned || 0), cls: 'text-red-600' },
            { label: 'In corso', val: summary.by_status?.in_progress || 0, cls: 'text-amber-600' },
            { label: 'In attesa', val: summary.by_status?.on_hold || 0, cls: 'text-orange-600' },
            { label: 'Completate', val: (summary.by_status?.completed || 0) + (summary.by_status?.resolved || 0), cls: 'text-emerald-600' },
          ].map((c) => (
            <Card key={c.label} className="border"><CardContent className="p-3 text-center">
              <p className={cn('text-xl font-bold', c.cls)}>{c.val}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </CardContent></Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cerca..."
            className="h-8 pl-9 text-sm" data-testid="search-issues" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {['all', ...tabStatuses].map((s) => {
            const cfg = s === 'all' ? { label: 'Tutti' } : STATUS_CONFIG[s];
            const count = s === 'all' ? tabIssues.length : tabIssues.filter((i) => i.status === s).length;
            return (
              <button key={s} className={cn('text-xs px-2.5 py-1 rounded-full font-medium border shrink-0 transition-colors',
                statusFilter === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
              )} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)} data-testid={`status-filter-${s}`}>
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority filter */}
      <div className="flex gap-1">
        {['all', ...Object.keys(PRIORITY_CONFIG)].map((p) => {
          const cfg = p === 'all' ? { label: 'Tutte' } : PRIORITY_CONFIG[p];
          return (
            <button key={p} className={cn('text-xs px-2.5 py-1 rounded-full font-medium border shrink-0 transition-colors',
              priorityFilter === p ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
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
        <EmptyState icon={Wrench} message={tab === 'interventi' ? 'Nessun intervento aperto' : 'Nessun intervento nello storico'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((issue) => {
            const sc = STATUS_CONFIG[issue.status] || STATUS_CONFIG.open;
            const pc = PRIORITY_CONFIG[issue.priority] || PRIORITY_CONFIG.medium;
            const cc = CATEGORY_CONFIG[issue.category] || CATEGORY_CONFIG.other;
            const CatIcon = cc.icon;
            return (
              <Card key={issue.id} className={cn('border-l-4 cursor-pointer transition-all hover:ring-1 hover:ring-primary/30', pc.border)}
                onClick={() => navigate(`/maintenance/issue/${issue.id}`)} data-testid={`issue-${issue.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CatIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-semibold">{issue.title || cc.label}</span>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', sc.color)}>{sc.label}</span>
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', pc.color)}>{pc.label}</span>
                        {issue.source === 'segnalazione' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300">Segnalazione</span>}
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
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteDialog({ open: true, id: issue.id }); }} data-testid={`delete-issue-${issue.id}`}>
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

      {/* Create Panel */}
      <SidePanel open={panel} onClose={() => setPanel(false)} title="Nuovo intervento manutenzione">
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label>Titolo</Label>
            <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="es. Riparazione rubinetto bagno" data-testid="issue-title" />
          </div>
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
              <SelectTrigger data-testid="issue-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_CONFIG).map(([k, c]) => <SelectItem key={k} value={k}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Descrizione *</Label>
            <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={3} className="resize-none" placeholder="Descrivi l'intervento..." data-testid="issue-description" />
          </div>
          <div className="space-y-2">
            <Label>Priorità</Label>
            <div className="flex gap-1">
              {Object.entries(PRIORITY_CONFIG).map(([k, c]) => (
                <Button key={k} variant={form.priority === k ? 'default' : 'outline'} size="sm" className="flex-1 h-8 text-xs"
                  onClick={() => setForm((p) => ({ ...p, priority: k }))}>{c.label}</Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Struttura</Label>
            <Select value={form.structure_id || 'none'} onValueChange={(v) => handleStructureChange(v === 'none' ? '' : v)}>
              <SelectTrigger data-testid="issue-structure"><SelectValue placeholder="Seleziona" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                {structures.map((s) => <SelectItem key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {units.length > 0 && (
            <div className="space-y-2">
              <Label>Unità</Label>
              <Select value={form.unit_id || 'none'} onValueChange={(v) => setForm((p) => ({ ...p, unit_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Assegna a</Label>
            <Select value={form.assigned_to || 'none'} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to: v === 'none' ? '' : v }))}>
              <SelectTrigger data-testid="issue-assignee"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnato</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data programmata (anche futura)</Label>
            <Input type="date" value={form.scheduled_date} onChange={(e) => setForm((p) => ({ ...p, scheduled_date: e.target.value }))} data-testid="issue-scheduled-date" />
          </div>
          <div className="space-y-2">
            <Label>Note interne</Label>
            <Textarea value={form.internal_notes} onChange={(e) => setForm((p) => ({ ...p, internal_notes: e.target.value }))} rows={2} className="resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={() => setPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="save-issue-btn">
            {saving ? '...' : 'Crea intervento'}
          </Button>
        </div>
      </SidePanel>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(v) => !v && setDeleteDialog({ open: false, id: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina intervento</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro? L'intervento verrà eliminato permanentemente. Per la tracciabilità preferisci "Annulla intervento".</AlertDialogDescription>
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
