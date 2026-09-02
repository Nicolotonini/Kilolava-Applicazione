import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { AuthImg, openAuthFile } from '../components/kilolava/AuthMedia';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import {
  MapPin, Clock, Users, BedDouble, ChevronLeft, AlertTriangle, Video, Camera,
  Package, KeyRound, CheckCircle2, Loader2, Navigation, DoorOpen, StickyNote, Sparkles,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { LocationBanner, useLocationState, LocationRequiredDialog } from '../components/LocationBanner';
import { KeysPanel } from '../components/kilolava/KeysPanel';
import { RoleAreaSwitcher } from '../components/kilolava/RoleAreaSwitcher';

const STATUS_META = {
  unassigned: { label: 'Da fare', cls: 'bg-sky-100 text-sky-700' },
  assigned: { label: 'Da fare', cls: 'bg-sky-100 text-sky-700' },
  in_progress: { label: 'In corso', cls: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completata', cls: 'bg-emerald-100 text-emerald-700' },
  issue_reported: { label: 'Problema', cls: 'bg-red-100 text-red-700' },
  needs_review: { label: 'Problema', cls: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annullata', cls: 'bg-muted text-muted-foreground' },
};

const ISSUE_CATEGORIES = [
  { key: 'missing', label: 'Mancanza', desc: 'Manca qualcosa (carta, caffè, asciugamani...)', requireMedia: false },
  { key: 'damage', label: 'Rottura / Danno', desc: 'Qualcosa è rotto o danneggiato', requireMedia: true },
  { key: 'malfunction', label: 'Malfunzionamento', desc: 'Qualcosa non funziona (luce, scarico, clima...)', requireMedia: true },
  { key: 'other', label: 'Anomalia / Altro', desc: 'Situazione da far vedere al responsabile', requireMedia: false },
];

const todayStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

const checkinText = (task) => {
  const isToday = task.date === todayStr();
  if (task.checkin_today) {
    if (isToday) return `⚠ Entrano oggi${task.checkin_time ? ` alle ${task.checkin_time}` : ''}`;
    return `Check-in${task.checkin_time ? ` ${task.checkin_time}` : ' lo stesso giorno'}`;
  }
  return isToday ? 'Oggi non entrano ospiti' : 'Nessun check-in';
};

export default function CleanerView() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [activeTask, setActiveTask] = useState(null);

  const load = useCallback(() => {
    api.get('/cleaning-tasks/my-tasks').then(r => setTasks(r.data)).catch(() => setTasks([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (activeTask) {
    return (
      <div data-testid="cleaner-view-work">
        <LocationBanner sessionType="giornata" startLabel="Inizia giornata" stopLabel="Fine giornata" />
        <TaskWorkScreen taskId={activeTask} onBack={() => { setActiveTask(null); load(); }} />
      </div>
    );
  }

  const today = (tasks || []).filter(t => t.date === todayStr() && t.status !== 'cancelled');
  const upcoming = (tasks || []).filter(t => t.date > todayStr() && t.status !== 'cancelled').slice(0, 10);

  return (
    <div data-testid="cleaner-view">
      <LocationBanner sessionType="giornata" startLabel="Inizia giornata" stopLabel="Fine giornata" />
      <div className="p-4 pb-24 space-y-5 max-w-lg mx-auto">
      <div>
        <h1 className="text-xl font-heading font-semibold">Ciao {user?.name?.split(' ')[0] || ''}</h1>
        <p className="text-sm text-muted-foreground">Le mie pulizie di oggi</p>
      </div>
      <RoleAreaSwitcher />
      {tasks === null ? (
        <p className="text-center py-10 text-muted-foreground">Caricamento...</p>
      ) : today.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-border rounded-xl" data-testid="cleaner-empty-today">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nessuna pulizia per oggi.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {today.map(t => <CleanerTaskCard key={t.id} task={t} onOpen={() => setActiveTask(t.id)} />)}
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prossime</p>
          {upcoming.map(t => <CleanerTaskCard key={t.id} task={t} onOpen={() => setActiveTask(t.id)} compact />)}
        </div>
      )}
      </div>
    </div>
  );
}

function CleanerTaskCard({ task, onOpen, compact }) {
  const sm = STATUS_META[task.status] || STATUS_META.assigned;
  const beds = [];
  if (task.beds_double) beds.push(`${task.beds_double} matrimoniali`);
  if (task.beds_single) beds.push(`${task.beds_single} singoli`);
  if (task.beds_sofa) beds.push(`${task.beds_sofa} divani letto`);
  return (
    <Card onClick={onOpen} className="border shadow-none cursor-pointer active:scale-[0.99] transition-transform" data-testid={`cleaner-task-${task.id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-base">{task.structure_name}</p>
          <Badge className={cn('text-xs border-0 shrink-0', sm.cls)}>{sm.label}</Badge>
        </div>
        {task.structure_address && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{task.structure_address}</p>
        )}
        <div className="flex items-center gap-3 flex-wrap text-sm" data-testid={`card-prep-${task.id}`}>
          {task.scheduled_time && <span className="flex items-center gap-1 font-medium"><Clock className="h-4 w-4" />{task.scheduled_time}</span>}
          {task.guests_count ? <span className="flex items-center gap-1"><Users className="h-4 w-4" />{task.guests_count} persone</span> : null}
          {beds.length > 0 && <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" />{beds.join(' + ')}</span>}
        </div>
        <p className={cn('text-sm font-semibold', task.checkin_today ? 'text-amber-600' : 'text-muted-foreground')} data-testid={`card-checkin-${task.id}`}>
          {checkinText(task)}
        </p>
        {compact && <p className="text-xs text-muted-foreground capitalize">{new Date(task.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
      </CardContent>
    </Card>
  );
}

function TaskWorkScreen({ taskId, onBack }) {
  const [task, setTask] = useState(null);
  const [ops, setOps] = useState(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const locState = useLocationState();
  const [locDialog, setLocDialog] = useState(false);

  const reloadOps = useCallback(() => {
    api.get(`/cleaning-tasks/${taskId}/operational`).then(r => setOps(r.data)).catch(() => setOps({}));
  }, [taskId]);
  const reload = useCallback(() => {
    api.get(`/cleaning-tasks/${taskId}`).then(r => setTask(r.data)).catch(() => {});
  }, [taskId]);

  useEffect(() => {
    reload();
    reloadOps();
  }, [taskId, reload, reloadOps]);

  if (!task) return <p className="text-center py-10 text-muted-foreground">Caricamento...</p>;

  const media = task.media || [];
  const hasInitial = media.some(m => m.media_type === 'initial_video');
  const hasFinal = media.some(m => m.media_type === 'final_video');
  const hasWarehouse = media.some(m => m.media_type === 'warehouse_photo');
  const started = !!task.started_at;
  const completed = task.status === 'completed';
  const s = ops?.structure;

  return (
    <div className="p-4 pb-28 space-y-4 max-w-lg mx-auto" data-testid="cleaner-work-screen">
      <LocationRequiredDialog open={locDialog} onClose={() => setLocDialog(false)} sessionType="giornata" />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9" data-testid="cleaner-back-btn"><ChevronLeft className="h-5 w-5" /></Button>
        <div className="min-w-0">
          <p className="font-semibold text-base truncate">{task.structure_name}</p>
          <Badge className={cn('text-xs border-0', (STATUS_META[task.status] || STATUS_META.assigned).cls)}>
            {(STATUS_META[task.status] || STATUS_META.assigned).label}
          </Badge>
        </div>
      </div>

      {completed ? (
        <div className="text-center py-10 space-y-3" data-testid="cleaning-completed-banner">
          <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
          <p className="text-lg font-semibold">Pulizia completata!</p>
          <p className="text-sm text-muted-foreground">Grazie, tutto è stato registrato.</p>
        </div>
      ) : (
        <>
          {/* Preparazione — sempre visibile */}
          <PrepCard task={task} />

          {!started && (
            <>
              <Section icon={Navigation} title="Dove devo andare" testId="section-where">
                <p className="font-medium">{s?.name}</p>
                {s?.address && <p className="text-sm text-muted-foreground">{s.address}{s.floor ? `, piano ${s.floor}` : ''}</p>}
                {s?.address && (
                  <Button
                    className="w-full h-11 mt-2 bg-primary text-primary-foreground text-base"
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`, '_blank')}
                    data-testid="open-maps-btn"
                  >
                    <MapPin className="h-5 w-5 mr-2" />Apri Maps
                  </Button>
                )}
              </Section>

              <Section icon={Navigation} title="Come arrivare" testId="section-arrive">
                {s?.access_details && <p className="text-sm whitespace-pre-wrap">{s.access_details}</p>}
                <MediaGallery items={ops?.media?.arrive || []} empty="Nessuna indicazione caricata" />
              </Section>

              <Section icon={DoorOpen} title="Come entrare" testId="section-enter">
                <div className="space-y-1.5 text-sm">
                  {s?.door_code && <InfoRow icon={KeyRound} label="Codice portone" value={s.door_code} />}
                  {s?.keybox_code && <InfoRow icon={KeyRound} label="Codice keybox" value={s.keybox_code} />}
                  {s?.keybox_location && <InfoRow icon={MapPin} label="Posizione keybox" value={s.keybox_location} />}
                  {s?.kilolava_has_keys && <p className="text-xs text-muted-foreground">Le chiavi sono nel sistema box Kilolava{s.klv_code ? ` (portachiavi ${s.klv_code})` : ''}</p>}
                </div>
                <MediaGallery items={ops?.media?.enter || []} empty="Nessuna istruzione caricata" />
              </Section>

              <KeysPanel
                structureId={task.structure_id}
                klvCode={s?.klv_code}
                boxes={s?.key_boxes}
                hasKeys={!!s?.kilolava_has_keys}
                linkedTaskId={task.id}
                linkedTaskType="cleaning"
                onChanged={reloadOps}
              />
            </>
          )}

          <Section icon={Package} title="Magazzino Struttura" testId="section-warehouse">
            <div className="space-y-1.5 text-sm">
              {s?.warehouse_info?.location && <InfoRow icon={MapPin} label="Dove si trova" value={s.warehouse_info.location} />}
              {s?.warehouse_info?.code && <InfoRow icon={KeyRound} label="Codice" value={s.warehouse_info.code} />}
            </div>
            <MediaGallery items={ops?.media?.warehouse || []} empty="Nessuna foto/istruzione caricata" />
            {started && (
              <UploadButton
                taskId={task.id}
                mediaType="warehouse_photo"
                accept="image/*"
                label={hasWarehouse ? 'Foto magazzino caricata ✓ (aggiungi altra)' : '📦 Carica foto Magazzino (obbligatoria)'}
                variant={hasWarehouse ? 'done' : 'required'}
                onDone={reload}
                testId="upload-warehouse-photo"
              />
            )}
          </Section>

          {!started ? (
            <div className="space-y-2 pt-2">
              <p className="text-sm text-center text-muted-foreground">
                La pulizia inizia quando carichi il <b>video iniziale</b> dell'intero appartamento.
              </p>
              <UploadButton
                taskId={task.id}
                mediaType="initial_video"
                accept="video/*"
                label="🎥 Carica VIDEO INIZIALE e inizia"
                variant="primary"
                onDone={reload}
                testId="upload-initial-video"
                beforeOpen={() => { if (!locState.active) { setLocDialog(true); return false; } return true; }}
              />
            </div>
          ) : (
            <>
              <ChecklistSectionUI task={task} onSaved={reload} />
              <NotesSection task={task} onSaved={reload} />
              <Section icon={Video} title="Video finale" testId="section-final-video">
                <p className="text-sm text-muted-foreground">A lavoro finito carica il video dell'intero appartamento: ferma il tempo della pulizia.</p>
                <UploadButton
                  taskId={task.id}
                  mediaType="final_video"
                  accept="video/*"
                  label={hasFinal ? 'Video finale caricato ✓' : '🎥 Carica VIDEO FINALE'}
                  variant={hasFinal ? 'done' : 'required'}
                  disabled={hasFinal}
                  onDone={reload}
                  testId="upload-final-video"
                />
              </Section>
              <CompleteButton task={task} hasInitial={hasInitial} hasFinal={hasFinal} hasWarehouse={hasWarehouse} onDone={reload} />
            </>
          )}
        </>
      )}

      {/* Segnalazione — SEMPRE disponibile */}
      {!completed && (
        <button
          onClick={() => setIssueOpen(true)}
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-red-600 text-white font-semibold text-sm shadow-lg active:scale-95 transition-transform"
          data-testid="create-issue-fab"
        >
          <AlertTriangle className="h-5 w-5" />Segnalazione
        </button>
      )}
      {issueOpen && <IssueDialog task={task} onClose={() => setIssueOpen(false)} onDone={() => { setIssueOpen(false); reload(); }} />}
    </div>
  );
}

function PrepCard({ task }) {
  return (
    <Card className="border-primary/30 shadow-none" data-testid="prep-card">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Preparazione</p>
        <div className="grid grid-cols-2 gap-2">
          <BigStat label="Persone" value={task.guests_count ?? '—'} />
          <BigStat label="Matrimoniali" value={task.beds_double || 0} />
          <BigStat label="Singoli" value={task.beds_single || 0} />
          <BigStat label="Divani letto" value={task.beds_sofa || 0} />
        </div>
        <p className={cn('mt-3 text-center text-base font-bold rounded-lg py-2',
          task.checkin_today ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground')} data-testid="checkin-banner">
          {task.checkin_today
            ? (task.date === todayStr()
                ? `ENTRANO OGGI${task.checkin_time ? ` · CHECK-IN ${task.checkin_time}` : ''}`
                : `CHECK-IN${task.checkin_time ? ` ${task.checkin_time}` : ' LO STESSO GIORNO'}`)
            : (task.date === todayStr() ? 'Oggi non entrano ospiti' : 'Nessun check-in')}
        </p>
        {task.notes && <p className="mt-2 text-sm bg-muted/50 rounded-lg p-2.5 whitespace-pre-wrap">{task.notes}</p>}
      </CardContent>
    </Card>
  );
}

function BigStat({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5 text-center">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children, testId }) {
  return (
    <Card className="border shadow-none" data-testid={testId}>
      <CardContent className="p-4 space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <p className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold">{value}</span>
    </p>
  );
}

function MediaGallery({ items, empty }) {
  if (!items || items.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {items.map(m => (
          <button type="button" key={m.id} onClick={() => openAuthFile(m.file_path)} className="block w-full text-left">
            {m.media_type === 'video' || m.kind === 'video' || (m.content_type || '').startsWith('video') ? (
              <span className="flex flex-col items-center justify-center h-20 rounded-lg bg-muted text-muted-foreground text-xs gap-1"><Video className="h-5 w-5" />Video</span>
            ) : m.file_path ? (
              <AuthImg path={m.file_path} alt={m.title || ''} className="w-full h-20 object-cover rounded-lg border border-border" />
            ) : (
              <span className="flex items-center justify-center h-20 rounded-lg bg-muted text-xs text-muted-foreground p-1 text-center">{m.title || 'Nota'}</span>
            )}
          </button>
        ))}
      </div>
      {items.filter(m => m.description || (m.media_type === 'note' && m.title)).map(m => (
        <p key={`d-${m.id}`} className="text-xs bg-muted/40 rounded-lg p-2">{m.title ? <b>{m.title}: </b> : null}{m.description}</p>
      ))}
    </div>
  );
}

function UploadButton({ taskId, mediaType, accept, label, variant, disabled, onDone, testId, noteId, beforeOpen }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const params = new URLSearchParams({ media_type: mediaType });
      if (noteId) params.set('note_id', noteId);
      await api.post(`/cleaning-tasks/${taskId}/media?${params}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (mediaType === 'initial_video') toast.success('Video iniziale caricato — pulizia iniziata!');
      else if (mediaType === 'final_video') toast.success('Video finale caricato — tempo fermato');
      else toast.success('Caricato');
      onDone && onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante il caricamento');
    } finally { setUploading(false); }
  };
  return (
    <>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => upload(e.target.files?.[0])} data-testid={`${testId}-input`} />
      <Button
        onClick={() => { if (beforeOpen && !beforeOpen()) return; inputRef.current?.click(); }}
        disabled={uploading || disabled}
        className={cn('w-full h-12 text-base font-semibold',
          variant === 'primary' && 'bg-primary text-primary-foreground',
          variant === 'required' && 'bg-foreground text-background',
          variant === 'done' && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100')}
        data-testid={testId}
      >
        {uploading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Caricamento...</> : label}
      </Button>
    </>
  );
}

function ChecklistSectionUI({ task, onSaved }) {
  const [responses, setResponses] = useState(task.checklist?.responses || {});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setResponses(task.checklist?.responses || {}); }, [task.checklist]);
  const cl = task.checklist;
  if (!cl) return null;

  const toggle = async (key) => {
    const next = { ...responses, [key]: !responses[key] };
    setResponses(next);
    setSaving(true);
    try {
      await api.put(`/cleaning-tasks/${task.id}/checklist`, { responses: next });
    } catch (e) { toast.error('Errore salvataggio checklist'); }
    finally { setSaving(false); onSaved && onSaved(); }
  };

  let done = 0, total = 0;
  (cl.sections || []).forEach(sec => (sec.items || []).forEach(i => {
    if (!i.required) return;
    total += 1;
    if (responses[`${sec.name}|${i.label}`]) done += 1;
  }));

  return (
    <Card className="border shadow-none" data-testid="cleaner-checklist">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-primary" />Checklist</p>
          <span className={cn('text-xs font-bold', done === total ? 'text-emerald-600' : 'text-muted-foreground')}>{done}/{total}</span>
        </div>
        {(cl.sections || []).map(sec => (
          <div key={sec.name}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{sec.name}</p>
            <div className="space-y-1">
              {(sec.items || []).map(item => {
                const key = `${sec.name}|${item.label}`;
                const checked = !!responses[key];
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    disabled={saving}
                    className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors',
                      checked ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300' : 'bg-muted/40 hover:bg-muted')}
                    data-testid={`check-item-${sec.name}-${item.label}`.replace(/[^a-zA-Z0-9-]/g, '_')}
                  >
                    <span className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                      checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40')}>
                      {checked && <CheckCircle2 className="h-4 w-4" />}
                    </span>
                    <span className={cn(checked && 'line-through opacity-70')}>{item.label}{item.required ? '' : ' (facoltativo)'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NotesSection({ task, onSaved }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastNoteId, setLastNoteId] = useState(null);

  const addNote = async () => {
    if (!text.trim()) { toast.error('Scrivi la nota'); return; }
    setSaving(true);
    try {
      const res = await api.post(`/cleaning-tasks/${task.id}/notes`, { text });
      setLastNoteId(res.data.id);
      setText('');
      toast.success('Nota salvata — ora puoi allegare foto/video');
      onSaved && onSaved();
    } catch (e) { toast.error('Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Section icon={StickyNote} title="Note (con foto/video)" testId="section-notes">
      {(task.task_notes || []).map(n => (
        <div key={n.id} className="rounded-lg bg-muted/40 p-2.5 text-sm">
          <p>{n.text}</p>
          {(n.media || []).length > 0 && (
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {n.media.map(m => m.kind === 'video' ? (
                <button type="button" key={m.id} onClick={() => openAuthFile(m.file_path)} className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-background"><Video className="h-3 w-3" />Video</button>
              ) : (
                <button type="button" key={m.id} onClick={() => openAuthFile(m.file_path)}>
                  <AuthImg path={m.file_path} alt="" className="w-12 h-12 object-cover rounded border border-border" />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <Textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Scrivi una nota..." data-testid="note-text-input" />
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-10" onClick={addNote} disabled={saving} data-testid="add-note-btn">Salva nota</Button>
        {lastNoteId && (
          <div className="flex-1">
            <UploadButton taskId={task.id} mediaType="note" accept="image/*,video/*" label="+ Foto/Video" variant="done" noteId={lastNoteId} onDone={onSaved} testId="note-media-upload" />
          </div>
        )}
      </div>
    </Section>
  );
}

function CompleteButton({ task, hasInitial, hasFinal, hasWarehouse, onDone }) {
  const [busy, setBusy] = useState(false);
  const complete = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/cleaning-tasks/${task.id}/complete`);
      toast.success('Pulizia completata!');
      if (res.data?.key_warning) toast.warning(res.data.key_warning, { duration: 8000 });
      onDone && onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Impossibile completare');
    } finally { setBusy(false); }
  };
  const missing = [];
  if (!hasInitial) missing.push('video iniziale');
  if (!hasWarehouse) missing.push('foto magazzino');
  if (!hasFinal) missing.push('video finale');
  return (
    <div className="space-y-2 pt-1">
      {missing.length > 0 && (
        <p className="text-xs text-center text-muted-foreground" data-testid="complete-missing-hint">Manca: {missing.join(', ')} (e checklist completa)</p>
      )}
      <Button
        onClick={complete}
        disabled={busy}
        className="w-full h-13 py-3.5 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
        data-testid="complete-cleaning-btn"
      >
        {busy ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
        Completa pulizia
      </Button>
    </div>
  );
}

function IssueDialog({ task, onClose, onDone }) {
  const [category, setCategory] = useState(null);
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const catMeta = ISSUE_CATEGORIES.find(c => c.key === category);

  const submit = async () => {
    if (!category) { toast.error('Scegli il tipo di segnalazione'); return; }
    if (!note.trim()) { toast.error('Scrivi una breve descrizione'); return; }
    if (catMeta?.requireMedia && files.length === 0) { toast.error(`Per "${catMeta.label}" serve almeno 1 foto o video`); return; }
    setSaving(true);
    try {
      const attachmentIds = [];
      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        const res = await api.post(`/cleaning-tasks/${task.id}/media?media_type=issue`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        attachmentIds.push(res.data.id);
      }
      await api.post(`/cleaning-tasks/${task.id}/issues`, { category, note, attachment_ids: attachmentIds });
      toast.success('Segnalazione inviata al responsabile');
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante l\'invio');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto" data-testid="issue-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-600" />Crea segnalazione</DialogTitle>
          <DialogDescription>Segnala e basta: a chi spetta risolvere ci pensa il responsabile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            {ISSUE_CATEGORIES.map(c => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={cn('text-left px-3.5 py-3 rounded-xl border-2 transition-colors',
                  category === c.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40')}
                data-testid={`issue-cat-${c.key}`}
              >
                <p className="font-semibold text-sm">{c.label}{c.requireMedia && <span className="text-red-600"> *</span>}</p>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </button>
            ))}
          </div>
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Breve descrizione..." data-testid="issue-note-input" />
          <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} data-testid="issue-files-input" />
          <Button variant="outline" className="w-full h-11" onClick={() => inputRef.current?.click()} data-testid="issue-add-media-btn">
            <Camera className="h-4 w-4 mr-2" />Aggiungi foto / video {catMeta?.requireMedia ? '(obbligatorio)' : '(facoltativo)'}
          </Button>
          {files.length > 0 && <p className="text-xs text-center text-muted-foreground">{files.length} file selezionati</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Annulla</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={submit} disabled={saving} data-testid="issue-submit-btn">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Invia
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
