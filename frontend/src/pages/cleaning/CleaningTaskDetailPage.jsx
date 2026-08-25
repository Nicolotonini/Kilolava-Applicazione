import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Video, Package, CheckCircle2, ExternalLink, User, Building2, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { DetailSkeleton, EmptyState } from '../../components/kilolava/EmptyState';
import { MediaStrip } from '../../components/kilolava/MediaViewer';
import { STATUS_META, ISSUE_CAT, fmtDate, checkinLabel, fmtDuration } from './shared';

export default function CleaningTaskDetailPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    api.get(`/cleaning-tasks/${taskId}`).then(r => setTask(r.data)).catch(() => setNotFound(true));
  }, [taskId]);
  useEffect(() => { load(); }, [load]);

  if (notFound) return (
    <div className="p-4 lg:p-6">
      <EmptyState message="Pulizia non trovata." action={<Button variant="outline" onClick={() => navigate('/cleaning')}>Torna alla Panoramica</Button>} />
    </div>
  );
  if (!task) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;

  const sm = STATUS_META[task.status] || STATUS_META.unassigned;
  const media = task.media || [];
  const initial = media.find(m => m.media_type === 'initial_video');
  const final = media.find(m => m.media_type === 'final_video');
  const warehousePhotos = media.filter(m => m.media_type === 'warehouse_photo');

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="cleaning-task-detail-page">
      <DetailHeader
        backTo="/cleaning"
        backLabel="Pulizie"
        title={task.structure_name}
        meta={<>
          {task.klv_code && <span className="font-mono text-xs font-bold text-primary">{task.klv_code}</span>}
          <span className="capitalize">{fmtDate(task.date)}</span>
          {task.scheduled_time && <span>· {task.scheduled_time}</span>}
          {task.client_name && <span>· {task.client_name}</span>}
          {task.zone_name && <span>· {task.zone_name}</span>}
        </>}
        badges={<Badge className={cn('text-xs border-0', sm.cls)} data-testid="cleaning-detail-status">{sm.label}</Badge>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DetailSection title="Informazioni operative" testId="section-info-operative">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Info label="Addette" value={task.cleaner_name || '—'} />
              <Info label="Persone" value={task.guests_count ?? '—'} />
              <Info label="Letti" value={`${task.beds_double || 0} matr. · ${task.beds_single || 0} sing. · ${task.beds_sofa || 0} div.`} />
              <Info label="Check-in" value={checkinLabel(task)} />
            </div>
          </DetailSection>

          <DetailSection title="Tempi (interni — non visibili al cliente)" testId="section-tempi">
            <div className="rounded-xl border border-border p-4 space-y-1">
              <p className="text-sm">Inizio (video iniziale): <span className="font-medium">{task.started_at ? new Date(task.started_at).toLocaleString('it-IT') : '—'}</span>{task.started_by_name ? ` · ${task.started_by_name}` : ''}</p>
              <p className="text-sm">Fine (video finale): <span className="font-medium">{task.finished_at ? new Date(task.finished_at).toLocaleString('it-IT') : '—'}</span></p>
              <p className="text-base font-semibold text-primary" data-testid="detail-duration">Durata: {fmtDuration(task) || 'Tempo non rilevato'}</p>
            </div>
          </DetailSection>

          <DetailSection title="Documentazione" testId="section-documentazione">
            <div className="flex gap-2 flex-wrap">
              <MediaChip icon={Video} label="Video iniziale" ok={!!initial} />
              <MediaChip icon={Video} label="Video finale" ok={!!final} />
              <MediaChip icon={Package} label={`Foto magazzino (${warehousePhotos.length})`} ok={warehousePhotos.length > 0} />
            </div>
            <MediaStrip
              media={[
                ...(initial ? [{ ...initial, kind: 'video' }] : []),
                ...(final ? [{ ...final, kind: 'video' }] : []),
                ...warehousePhotos.map(p => ({ ...p, kind: 'image' })),
              ]}
              testIdPrefix="cleaning-media"
            />
          </DetailSection>

          {(task.task_notes || []).length > 0 && (
            <DetailSection title="Note dell'addetta" testId="section-note">
              <div className="space-y-2">
                {task.task_notes.map(n => (
                  <div key={n.id} className="rounded-xl border border-border p-3 space-y-1.5">
                    <p className="text-sm">{n.text}</p>
                    {(n.media || []).length > 0 && <MediaStrip media={n.media} size="w-14 h-14" />}
                    <p className="text-xs text-muted-foreground">{n.by_name} · {new Date(n.at).toLocaleString('it-IT')}</p>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {(task.issues || []).length > 0 && (
            <DetailSection title="Segnalazioni nate da questa Pulizia" testId="section-segnalazioni">
              <div className="space-y-1.5">
                {task.issues.map(i => {
                  const cat = ISSUE_CAT[i.category] || { label: i.category, cls: 'bg-muted text-muted-foreground' };
                  return (
                    <button key={i.id} onClick={() => navigate(`/segnalazioni/${i.id}`)}
                      className="w-full flex items-center gap-2 text-sm rounded-xl border border-border p-2.5 hover:border-primary/40 klv-interactive text-left"
                      data-testid={`cleaning-issue-${i.id}`}>
                      <Badge className={cn('text-xs border-0 shrink-0', cat.cls)}>{cat.label}</Badge>
                      <span className="flex-1 min-w-0 truncate">{i.note}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </DetailSection>
          )}

          {task.checklist && <ChecklistProgress task={task} />}
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
              {(task.issues || []).length > 0 && (
                <button onClick={() => navigate('/segnalazioni')} className="flex items-center gap-1.5 text-foreground/80 hover:text-primary text-sm klv-interactive">
                  <AlertTriangle className="h-3.5 w-3.5" />Centro Segnalazioni<ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          </DetailSection>

          {task.notes && (
            <DetailSection title="Note operative" testId="section-note-operative">
              <p className="text-sm rounded-xl border border-border p-4 whitespace-pre-wrap">{task.notes}</p>
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
}

const Info = ({ label, value }) => (
  <div className="rounded-xl border border-border p-3">
    <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-sm font-medium mt-0.5">{value}</p>
  </div>
);

const MediaChip = ({ icon: Icon, label, ok }) => (
  <span className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full',
    ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
    {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}{label}{!ok && ': mancante'}
  </span>
);

function ChecklistProgress({ task }) {
  const cl = task.checklist;
  const responses = cl.responses || {};
  let done = 0, total = 0;
  (cl.sections || []).forEach(sec => (sec.items || []).forEach(i => {
    if (!i.required) return;
    total += 1;
    const v = responses[`${sec.name}|${i.label}`];
    if (v !== undefined && v !== '' && v !== false) done += 1;
  }));
  return (
    <DetailSection title={`Checklist — ${cl.template_name}`} testId="section-checklist">
      <div className="rounded-xl border border-border p-4">
        <p className="text-sm font-medium">{done} / {total} voci obbligatorie completate</p>
        <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
        </div>
      </div>
    </DetailSection>
  );
}
