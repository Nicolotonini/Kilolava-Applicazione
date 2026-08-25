import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import {
  Package, Wrench, User, ClipboardList, CheckCircle2, Camera,
  ExternalLink, Sparkles, Loader2, RotateCcw, Archive, Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { StatusBadge } from '../../components/kilolava/badges';
import { DetailSkeleton, EmptyState } from '../../components/kilolava/EmptyState';
import { MediaStrip } from '../../components/kilolava/MediaViewer';
import {
  TYPE_META, PRIORITY_META, SEG_STATUS_META, TASK_TYPE_META, TASK_STATUS_META,
  WAIT_REASONS, PARTY_META, MODE_LABELS, RULE_LABELS, fmtDateTime, ageLabel,
} from './shared';
import { TaskDialog } from './TaskDialog';

const SEG_TONE = { da_valutare: 'triage', aperta: 'neutral', in_corso: 'progress', in_attesa: 'waiting', risolta: 'success', chiusa: 'cancelled' };
const TYPE_TONE = { missing: 'neutral', damage: 'danger', malfunction: 'progress', other: 'violet' };

export default function SegnalazioneDetailPage() {
  const { segId } = useParams();
  const navigate = useNavigate();
  const [seg, setSeg] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [taskDialog, setTaskDialog] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    api.get(`/segnalazioni/${segId}`).then(r => setSeg(r.data)).catch(() => setNotFound(true));
  }, [segId]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, okMsg) => {
    setBusy('act');
    try { await fn(); if (okMsg) toast.success(okMsg); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setBusy(''); }
  };
  const update = (payload, okMsg) => act(() => api.put(`/segnalazioni/${segId}`, payload), okMsg);

  if (notFound) return (
    <div className="p-4 lg:p-6">
      <EmptyState message="Segnalazione non trovata." action={<Button variant="outline" onClick={() => navigate('/segnalazioni')}>Torna a Segnalazioni</Button>} />
    </div>
  );
  if (!seg) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;

  const st = SEG_STATUS_META[seg.op_status] || SEG_STATUS_META[seg.status];
  const party = seg.responsibility?.party;
  const partyMeta = PARTY_META[party];
  const suggested = seg.suggested_action;
  const activeSeg = !['risolta', 'chiusa'].includes(seg.status);
  const realTasks = (seg.tasks || []).filter(t => t.status !== 'annullata');

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="segnalazione-detail-page">
      <DetailHeader
        backTo="/segnalazioni"
        backLabel="Segnalazioni"
        title={seg.title}
        meta={<>
          {seg.klv_code && <span className="font-mono text-xs font-bold text-primary">{seg.klv_code}</span>}
          {seg.structure_name && <span>{seg.structure_name}</span>}
          {seg.client_name && <span>· {seg.client_name}</span>}
          <span>· Aperta da {ageLabel(seg.created_at)}</span>
        </>}
        badges={<>
          <StatusBadge tone={TYPE_TONE[seg.type]} testId="detail-type-badge">{TYPE_META[seg.type]?.single}</StatusBadge>
          <StatusBadge tone={SEG_TONE[seg.op_status] || SEG_TONE[seg.status]} testId="detail-status-badge">{st?.label}</StatusBadge>
          {seg.published_to_client && <StatusBadge tone="neutral">Visibile al Cliente</StatusBadge>}
        </>}
        actions={<>
          {activeSeg && (
            <Button variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={() => act(() => api.post(`/segnalazioni/${segId}/resolve`), 'Segnalazione risolta')} disabled={!!busy} data-testid="resolve-btn">
              <CheckCircle2 className="h-4 w-4 mr-1.5" />Risolvi
            </Button>
          )}
          {seg.status !== 'chiusa' && (
            <Button variant="ghost" className="text-muted-foreground"
              onClick={() => act(() => api.post(`/segnalazioni/${segId}/close`), 'Segnalazione chiusa')} disabled={!!busy} data-testid="close-btn">
              <Archive className="h-4 w-4 mr-1.5" />Chiudi
            </Button>
          )}
          {!activeSeg && (
            <Button variant="outline" onClick={() => act(() => api.post(`/segnalazioni/${segId}/reopen`), 'Segnalazione riaperta')} disabled={!!busy} data-testid="reopen-btn">
              <RotateCcw className="h-4 w-4 mr-1.5" />Riapri
            </Button>
          )}
        </>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ===== Colonna principale ===== */}
        <div className="lg:col-span-2 space-y-6">
          {/* PROBLEMA */}
          <DetailSection title="Problema" testId="section-problema">
            <div className="rounded-xl border border-border p-4 space-y-3">
              {seg.description && seg.description !== seg.title && (
                <p className="text-sm whitespace-pre-wrap">{seg.description}</p>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Priorità</span>
                {Object.entries(PRIORITY_META).map(([k, v]) => (
                  <button key={k} onClick={() => k !== seg.priority && update({ priority: k })}
                    className={cn('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border klv-interactive',
                      seg.priority === k ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/40')}
                    data-testid={`priority-${k}`}>
                    <span className={cn('w-2 h-2 rounded-full', v.dot)} />{v.label}
                  </button>
                ))}
              </div>
              {(seg.attachments || []).length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Prima — media segnalazione</p>
                  <MediaStrip media={seg.attachments} testIdPrefix="media-before" />
                </div>
              )}
            </div>
          </DetailSection>

          {/* RESPONSABILITÀ */}
          <DetailSection title="Responsabilità" testId="section-responsabilita">
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Categoria:</span>
                <select
                  value={seg.category_key || ''}
                  onChange={e => update({ category_key: e.target.value }, 'Categoria aggiornata')}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm font-medium"
                  data-testid="category-select">
                  <option value="">Da identificare...</option>
                  <optgroup label="Forniture">
                    {Object.entries(seg.categories?.supply || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </optgroup>
                  <optgroup label="Manutenzioni">
                    {Object.entries(seg.categories?.maintenance || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </optgroup>
                </select>
              </div>
              {partyMeta ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">Deve occuparsene:</span>
                    <span className={cn('text-sm font-bold px-3 py-1.5 rounded-lg', partyMeta.cls)} data-testid="responsibility-party">{partyMeta.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="responsibility-rule">
                    Regola applicata: <span className="font-semibold text-foreground">{RULE_LABELS[seg.responsibility?.source] || 'Default Kilolava'}</span>
                    {seg.responsibility?.source === 'item' && seg.responsibility?.item ? ` — "${seg.responsibility.item}"` : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Seleziona una categoria per calcolare la responsabilità dalla configurazione Cliente/Struttura.</p>
              )}
            </div>
          </DetailSection>

          {/* AZIONE SUGGERITA */}
          {activeSeg && (
            <DetailSection title="Azione suggerita" testId="section-azione">
              {suggested ? (
                <div className={cn('rounded-xl border-2 p-4 flex items-center gap-3 flex-wrap',
                  seg.mode === 'assistita' ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20')} data-testid="suggested-action">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">{seg.mode === 'assistita' ? 'Azione pronta — Kilolava propone questa NUOVA azione' : 'Kilolava suggerisce questa nuova azione'}</p>
                    <p className="text-base font-bold">{suggested.label}</p>
                  </div>
                  <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => setTaskDialog({ type: suggested.type, confirm: seg.mode === 'assistita' })}
                    data-testid="confirm-suggested-btn">
                    <Check className="h-4 w-4 mr-1" />{seg.mode === 'assistita' ? 'Conferma' : 'Crea'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTaskDialog({ type: suggested.type })} data-testid="edit-suggested-btn">Modifica</Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3" data-testid="no-suggested-action">
                  {realTasks.length > 0 ? 'Nessuna nuova azione suggerita: esistono già attività collegate per questa esigenza.' : 'Nessuna azione suggerita: valuta il problema e scegli un\u2019azione qui sotto.'}
                </p>
              )}
              <div className="flex gap-1.5 flex-wrap">
                <ActionBtn icon={Package} label="Crea consegna" onClick={() => setTaskDialog({ type: 'delivery' })} testId="action-delivery" />
                <ActionBtn icon={Wrench} label="Crea intervento" onClick={() => setTaskDialog({ type: 'maintenance' })} testId="action-maintenance" />
                <ActionBtn icon={User} label="Notifica Cliente" onClick={() => setTaskDialog({ type: 'notify_client' })} testId="action-notify" />
                <ActionBtn icon={ClipboardList} label="Task interno" onClick={() => setTaskDialog({ type: 'internal' })} testId="action-internal" />
              </div>
              {seg.status === 'da_valutare' && (
                <Button variant="outline" size="sm" className="w-full border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50"
                  onClick={() => act(() => api.post(`/segnalazioni/${segId}/triage`, {}), 'Segnalazione presa in carico')}
                  disabled={!!busy} data-testid="triage-btn">
                  Prendi in carico (segna come valutata)
                </Button>
              )}
            </DetailSection>
          )}

          {/* ATTIVITÀ COLLEGATE */}
          <DetailSection title={`Attività collegate (${(seg.tasks || []).length})`} testId="section-attivita">
            {(seg.tasks || []).length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">Nessuna attività ancora creata per questa segnalazione.</p>
            ) : (
              <div className="space-y-2">
                {seg.tasks.map(t => <TaskRow key={t.id} task={t} onChanged={load} />)}
              </div>
            )}
            {seg.all_tasks_done && seg.status === 'aperta' && (
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/10 p-3 flex items-center gap-3" data-testid="all-done-banner">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300 flex-1">Tutte le attività risultano completate.</p>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => act(() => api.post(`/segnalazioni/${segId}/resolve`), 'Segnalazione risolta')} data-testid="resolve-suggested-btn">
                  Segna come risolta
                </Button>
              </div>
            )}
          </DetailSection>

          {/* MEDIA RISOLUZIONE */}
          {(seg.resolution_media || []).length > 0 && (
            <DetailSection title="Dopo — media soluzione" testId="section-media-dopo">
              <MediaStrip media={seg.resolution_media} testIdPrefix="media-after" />
            </DetailSection>
          )}
        </div>

        {/* ===== Colonna laterale ===== */}
        <div className="space-y-6">
          <DetailSection title="Informazioni" testId="section-info">
            <div className="rounded-xl border border-border p-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <Meta label="Segnalato da" value={seg.reporter_name || '—'} />
              <Meta label="Data e ora" value={fmtDateTime(seg.created_at)} />
              <Meta label="Origine" value={seg.origin_label || '—'} />
              <Meta label="Modalità" value={MODE_LABELS[seg.mode] || '—'} />
              {seg.resolved_at && <Meta label="Risolta il" value={fmtDateTime(seg.resolved_at)} />}
            </div>
          </DetailSection>

          <DetailSection title="Collegamenti" testId="section-collegamenti">
            <div className="rounded-xl border border-border p-4 space-y-2.5">
              {seg.structure_id && (
                <button onClick={() => navigate(`/structures/${seg.structure_id}`)} className="flex items-center gap-1.5 text-primary hover:underline text-sm font-medium" data-testid="link-structure">
                  {seg.klv_code && <span className="font-mono text-xs font-bold">{seg.klv_code}</span>}{seg.structure_name}<ExternalLink className="h-3 w-3" />
                </button>
              )}
              {seg.client_id && (
                <button onClick={() => navigate(`/clients/${seg.client_id}`)} className="flex items-center gap-1.5 text-foreground/80 hover:text-primary text-sm klv-interactive" data-testid="link-client">
                  <User className="h-3.5 w-3.5" />{seg.client_name || 'Cliente'}<ExternalLink className="h-3 w-3" />
                </button>
              )}
              {seg.cleaning_task && (
                <button onClick={() => navigate('/cleaning')} className="flex items-center gap-1.5 text-foreground/80 hover:text-primary text-sm klv-interactive" data-testid="link-cleaning">
                  <Sparkles className="h-3.5 w-3.5" />Pulizia del {seg.cleaning_task.date}<ExternalLink className="h-3 w-3" />
                </button>
              )}
              {!seg.structure_id && !seg.client_id && !seg.cleaning_task && (
                <p className="text-sm text-muted-foreground">Nessun collegamento.</p>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Cliente" testId="section-pubblicazione">
            <div className="rounded-xl border border-border p-4">
              <PublishBlock seg={seg} onDone={load} />
            </div>
          </DetailSection>

          <DetailSection title="Cronologia" testId="section-cronologia">
            <div className="rounded-xl border border-border p-4 space-y-0.5" data-testid="detail-timeline">
              {[...(seg.timeline || [])].reverse().map((e, i) => (
                <div key={i} className="flex gap-2.5 text-sm py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap pt-0.5 w-24 shrink-0">{fmtDateTime(e.at)}</span>
                  <p className={cn('text-sm min-w-0', e.auto && 'text-primary')}>
                    <span className="font-medium">{e.by_name || 'Sistema'}</span>
                    {e.detail ? ` — ${e.detail}` : ` — ${e.event}`}
                  </p>
                </div>
              ))}
            </div>
          </DetailSection>
        </div>
      </div>

      {taskDialog && (
        <TaskDialog seg={seg} defaultType={taskDialog.type} autoConfirm={taskDialog.confirm}
          onClose={() => setTaskDialog(null)}
          onCreated={() => { setTaskDialog(null); load(); }} />
      )}
    </div>
  );
}

const Meta = ({ label, value }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value}</p>
  </div>
);

const ActionBtn = ({ icon: Icon, label, onClick, testId }) => (
  <Button variant="outline" size="sm" onClick={onClick} data-testid={testId}>
    <Icon className="h-3.5 w-3.5 mr-1.5" />{label}
  </Button>
);

function TaskRow({ task, onChanged }) {
  const [waitFor, setWaitFor] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const Icon = TASK_TYPE_META[task.type]?.icon || ClipboardList;
  const stMeta = TASK_STATUS_META[task.status];

  const setStatus = async (status, waiting_reason) => {
    if (status === 'in_attesa' && !waiting_reason) { setWaitFor(true); return; }
    try {
      await api.put(`/segnalazioni/tasks/${task.id}`, { status, waiting_reason: waiting_reason || undefined });
      setWaitFor(false);
      onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/segnalazioni/tasks/${task.id}/media`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Media soluzione caricato');
      onChanged();
    } catch (e) { toast.error('Errore upload'); }
    finally { setUploading(false); }
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-2" data-testid={`task-row-${task.id}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-semibold flex-1 min-w-0 truncate">{task.title}</p>
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0', stMeta?.cls)} data-testid={`task-status-${task.id}`}>
          {stMeta?.label}{task.status === 'in_attesa' && task.waiting_reason ? ` · ${WAIT_REASONS[task.waiting_reason] || task.waiting_reason}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
        <span>{TASK_TYPE_META[task.type]?.label}</span>
        {task.assignee_name && <span className="font-medium text-foreground">→ {task.assignee_name}</span>}
        {task.due_date && <span className={cn('font-medium', task.due_date <= new Date().toISOString().slice(0, 10) && task.status !== 'completata' && 'text-red-600')}>
          Entro {task.due_date}{task.due_time ? ` ${task.due_time}` : ''}
        </span>}
        <span className="flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', PRIORITY_META[task.priority]?.dot)} />{PRIORITY_META[task.priority]?.label}
        </span>
        {task.auto && <span className="text-primary font-medium">Automatica</span>}
      </div>
      {task.note && <p className="text-xs text-muted-foreground italic">{task.note}</p>}
      {(task.attachments || []).length > 0 && <MediaStrip media={task.attachments} size="w-14 h-14" />}
      {!['completata', 'annullata'].includes(task.status) && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {task.status !== 'in_corso' && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus('in_corso')} data-testid={`task-start-${task.id}`}>Avvia</Button>}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setStatus('in_attesa')} data-testid={`task-wait-${task.id}`}>In attesa</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs border-emerald-300 text-emerald-700" onClick={() => setStatus('completata')} data-testid={`task-complete-${task.id}`}>Completa</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setStatus('annullata')} data-testid={`task-cancel-${task.id}`}>Annulla</Button>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => upload(e.target.files?.[0])} />
          <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid={`task-upload-${task.id}`}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1" />}Foto/video soluzione
          </Button>
        </div>
      )}
      {waitFor && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg bg-orange-50 dark:bg-orange-900/10 p-2" data-testid={`task-wait-reasons-${task.id}`}>
          <span className="text-xs font-medium text-orange-700">In attesa di:</span>
          {Object.entries(WAIT_REASONS).map(([k, v]) => (
            <button key={k} onClick={() => setStatus('in_attesa', k)}
              className="px-2 py-1 rounded-full text-xs font-medium bg-background border border-orange-200 hover:bg-orange-100 klv-interactive"
              data-testid={`wait-reason-${k}`}>{v}</button>
          ))}
          <button onClick={() => setWaitFor(false)} className="text-xs text-muted-foreground underline ml-auto">Annulla</button>
        </div>
      )}
    </div>
  );
}

function PublishBlock({ seg, onDone }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState(seg.client_message || seg.title || '');
  const publish = async () => {
    try {
      await api.post(`/segnalazioni/${seg.id}/publish-client`, { message: msg });
      toast.success('Pubblicata al Cliente');
      setOpen(false);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };
  if (seg.published_to_client && !open) {
    return <p className="text-sm text-muted-foreground">Visibile al Cliente: “{seg.client_message || seg.title}” <button className="underline" onClick={() => setOpen(true)} data-testid="edit-publish-btn">modifica</button></p>;
  }
  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-sm text-muted-foreground underline hover:text-foreground klv-interactive" data-testid="open-publish-btn">Mostra al Cliente nel portale...</button>;
  }
  return (
    <div className="space-y-2" data-testid="publish-block">
      <p className="text-xs font-medium">Messaggio semplice per il Cliente (nessun dato interno):</p>
      <Textarea value={msg} onChange={e => setMsg(e.target.value)} rows={2} className="text-sm" data-testid="publish-message-input" />
      <div className="flex gap-2">
        <Button size="sm" onClick={publish} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="publish-btn">Pubblica</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
      </div>
    </div>
  );
}
