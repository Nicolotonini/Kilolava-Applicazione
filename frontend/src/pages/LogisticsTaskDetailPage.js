import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { logisticsApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { MapPin, Clock, Pencil, Play, Check, ExternalLink, User, Building2, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { DetailHeader, DetailSection } from '../components/kilolava/PageHeader';
import { DetailSkeleton, EmptyState } from '../components/kilolava/EmptyState';
import { MediaStrip } from '../components/kilolava/MediaViewer';
import { StatusBadge } from '../components/kilolava/badges';

const STATUS_TONE = { unassigned: 'progress', assigned: 'neutral', in_progress: 'progress', completed: 'success', problem: 'danger' };
const STATUS_LABELS = { unassigned: 'Da assegnare', assigned: 'Assegnato', in_progress: 'In corso', completed: 'Completato', problem: 'Problema' };
const TYPE_LABELS = { delivery: 'Consegna', pickup: 'Ritiro', mixed: 'Misto' };

export default function LogisticsTaskDetailPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [riders, setRiders] = useState([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    api.get(`/logistics/tasks/${taskId}`).then(r => setTask(r.data)).catch(() => setNotFound(true));
  }, [taskId]);
  useEffect(() => {
    load();
    logisticsApi.getRiders().then(r => setRiders(r.data)).catch(() => {});
  }, [load]);

  const setStatus = async (status) => {
    try { await logisticsApi.updateStatus(taskId, { status }); toast.success('Stato aggiornato'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };
  const assign = async (riderId) => {
    try { await logisticsApi.assignTask(taskId, { rider_id: riderId }); toast.success('Rider assegnato'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  if (notFound) return (
    <div className="p-4 lg:p-6">
      <EmptyState message="Stop non trovato." action={<Button variant="outline" onClick={() => navigate('/logistics')}>Torna a Consegne</Button>} />
    </div>
  );
  if (!task) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="logistics-task-detail-page">
      <DetailHeader
        backTo="/logistics"
        backLabel="Consegne"
        title={`${TYPE_LABELS[task.task_type] || 'Stop'}${task.structure_name ? ` — ${task.structure_name}` : ''}`}
        meta={<>
          <span>{task.date}</span>
          {task.time_window_start && <span>· <Clock className="h-3.5 w-3.5 inline mb-0.5" /> {task.time_window_start}{task.time_window_end ? ` - ${task.time_window_end}` : ''}</span>}
          {task.client_name && <span>· {task.client_name}</span>}
          {task.rider_name && <span>· Rider: {task.rider_name}</span>}
        </>}
        badges={<StatusBadge tone={STATUS_TONE[task.status] || 'neutral'} testId="logistics-detail-status">{STATUS_LABELS[task.status] || task.status}</StatusBadge>}
        actions={
          <Button variant="outline" onClick={() => navigate(`/logistics?edit=${task.id}`)} data-testid="edit-logistics-task-btn">
            <Pencil className="h-4 w-4 mr-1.5" />Modifica
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DetailSection title="Dettagli stop" testId="section-dettagli">
            <div className="rounded-xl border border-border p-4 space-y-2 text-sm">
              {task.address && <p className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground shrink-0" />{task.address}</p>}
              {task.access_details && <p><span className="text-muted-foreground">Accesso:</span> {task.access_details}</p>}
              {task.notes && <p><span className="text-muted-foreground">Note:</span> {task.notes}</p>}
              {!task.address && !task.access_details && !task.notes && <p className="text-muted-foreground">Nessun dettaglio aggiuntivo.</p>}
            </div>
          </DetailSection>

          {(task.items || []).length > 0 && (
            <DetailSection title="Articoli" testId="section-articoli">
              <div className="rounded-xl border border-border divide-y divide-border/60">
                {task.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span>{it.article_name || it.article_id}</span>
                    <span className="font-medium">x{it.quantity} ({it.item_type === 'pickup' ? 'ritiro' : 'consegna'})</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          <DetailSection title="Azioni rapide" testId="section-azioni">
            <div className="rounded-xl border border-border p-4 space-y-3">
              {task.status === 'unassigned' && (
                <div className="flex items-center gap-2">
                  <Select onValueChange={assign}>
                    <SelectTrigger className="h-9 flex-1 max-w-xs" data-testid="assign-rider-select"><SelectValue placeholder="Assegna a rider" /></SelectTrigger>
                    <SelectContent>
                      {riders.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2 flex-wrap">
                {task.status === 'assigned' && (
                  <Button size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setStatus('in_progress')} data-testid="start-stop-btn">
                    <Play className="h-3.5 w-3.5" />Avvia
                  </Button>
                )}
                {(task.status === 'in_progress' || task.status === 'assigned') && (
                  <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setStatus('completed')} data-testid="complete-stop-btn">
                    <Check className="h-3.5 w-3.5" />Completato
                  </Button>
                )}
                {task.status !== 'unassigned' && task.status !== 'problem' && (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => setStatus('unassigned')} data-testid="unassign-stop-btn">
                    Rimuovi assegnazione
                  </Button>
                )}
              </div>
            </div>
          </DetailSection>

          {task.problem_notes && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 p-4 text-sm">
              <p className="text-red-700 dark:text-red-400 font-medium">Problema segnalato</p>
              <p className="text-red-600 dark:text-red-300">{task.problem_notes}</p>
            </div>
          )}
          {task.completion_notes && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 p-4 text-sm">
              <p className="text-emerald-700 dark:text-emerald-400 font-medium">Note completamento</p>
              <p>{task.completion_notes}</p>
            </div>
          )}
          {task.confirmation_photo && (
            <DetailSection title="Foto conferma" testId="section-foto-conferma">
              <MediaStrip media={[{ id: 'conf', kind: 'image', file_path: task.confirmation_photo }]} />
            </DetailSection>
          )}
        </div>

        <div className="space-y-6">
          <DetailSection title="Collegamenti" testId="section-collegamenti">
            <div className="rounded-xl border border-border p-4 space-y-2.5">
              {task.structure_id && (
                <button onClick={() => navigate(`/structures/${task.structure_id}`)} className="flex items-center gap-1.5 text-primary hover:underline text-sm font-medium" data-testid="link-structure">
                  <Building2 className="h-3.5 w-3.5" />{task.structure_name}<ExternalLink className="h-3 w-3" />
                </button>
              )}
              {task.client_id && (
                <button onClick={() => navigate(`/clients/${task.client_id}`)} className="flex items-center gap-1.5 text-foreground/80 hover:text-primary text-sm klv-interactive" data-testid="link-client">
                  <User className="h-3.5 w-3.5" />{task.client_name || 'Cliente'}<ExternalLink className="h-3 w-3" />
                </button>
              )}
              {task.segnalazione_id && (
                <button onClick={() => navigate(`/segnalazioni/${task.segnalazione_id}`)} className="flex items-center gap-1.5 text-foreground/80 hover:text-primary text-sm klv-interactive" data-testid="link-segnalazione">
                  <AlertTriangle className="h-3.5 w-3.5" />Segnalazione di origine<ExternalLink className="h-3 w-3" />
                </button>
              )}
              {!task.structure_id && !task.client_id && !task.segnalazione_id && <p className="text-sm text-muted-foreground">Nessun collegamento.</p>}
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
