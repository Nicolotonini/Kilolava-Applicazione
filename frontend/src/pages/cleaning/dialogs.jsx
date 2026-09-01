import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { AuthImg, openAuthFile } from '../../components/kilolava/AuthMedia';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Video, Package, CheckCircle2, Repeat, Loader2, Maximize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { STATUS_META, ISSUE_CAT, fmtDate, tomorrowStr, todayStr, checkinLabel, fmtDuration } from './shared';

export const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function MediaChip({ icon: Icon, label, media }) {
  if (!media) {
    return <span className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-muted text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}: mancante</span>;
  }
  return (
    <button type="button" onClick={() => openAuthFile(media.file_path)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-emerald-100 text-emerald-700 hover:opacity-80">
      <CheckCircle2 className="h-3.5 w-3.5" />{label}
    </button>
  );
}

function ChecklistProgress({ task }) {
  const cl = task.checklist;
  if (!cl) return null;
  const responses = cl.responses || {};
  let done = 0, total = 0;
  (cl.sections || []).forEach(sec => (sec.items || []).forEach(i => {
    if (!i.required) return;
    total += 1;
    const v = responses[`${sec.name}|${i.label}`];
    if (v !== undefined && v !== '' && v !== false) done += 1;
  }));
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Checklist — {cl.template_name}</p>
      <p className="text-sm font-medium">{done} / {total} voci obbligatorie completate</p>
    </div>
  );
}

export function TaskDetailDialog({ taskId, onClose }) {
  const [task, setTask] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    api.get(`/cleaning-tasks/${taskId}`).then(r => setTask(r.data)).catch(() => {});
  }, [taskId]);
  if (!task) return null;
  const sm = STATUS_META[task.status] || STATUS_META.unassigned;
  const media = task.media || [];
  const initial = media.find(m => m.media_type === 'initial_video');
  const final = media.find(m => m.media_type === 'final_video');
  const warehousePhotos = media.filter(m => m.media_type === 'warehouse_photo');
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="cleaning-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {task.klv_code && <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-sm font-bold">{task.klv_code}</span>}
            {task.structure_name}
            <Badge className={cn('text-xs border-0', sm.cls)}>{sm.label}</Badge>
          </DialogTitle>
          <DialogDescription className="capitalize">{fmtDate(task.date)} {task.scheduled_time ? `· ${task.scheduled_time}` : ''} {task.client_name ? `· ${task.client_name}` : ''} {task.zone_name ? `· ${task.zone_name}` : ''}</DialogDescription>
          <Button variant="outline" size="sm" className="w-fit h-7 text-xs mt-1"
            onClick={() => { onClose(); navigate(`/cleaning/task/${task.id}`); }}
            data-testid="open-full-detail-btn">
            <Maximize2 className="h-3 w-3 mr-1.5" />Apri dettaglio completo
          </Button>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Info label="Addette" value={task.cleaner_name || '—'} />
            <Info label="Persone" value={task.guests_count ?? '—'} />
            <Info label="Letti" value={`${task.beds_double || 0} matr. · ${task.beds_single || 0} sing. · ${task.beds_sofa || 0} div.`} />
            <Info label="Check-in" value={checkinLabel(task)} />
          </div>
          <div className="rounded-lg border border-border p-3 space-y-1" data-testid="detail-timing">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tempi (interni — non visibili al cliente)</p>
            <p className="text-xs">Inizio (video iniziale): <span className="font-medium">{task.started_at ? new Date(task.started_at).toLocaleString('it-IT') : '—'}</span>{task.started_by_name ? ` · ${task.started_by_name}` : ''}</p>
            <p className="text-xs">Fine (video finale): <span className="font-medium">{task.finished_at ? new Date(task.finished_at).toLocaleString('it-IT') : '—'}</span></p>
            <p className="text-sm font-semibold text-primary" data-testid="detail-duration">Durata: {fmtDuration(task) || 'Tempo non rilevato'}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documentazione</p>
            <div className="flex gap-2 flex-wrap">
              <MediaChip icon={Video} label="Video iniziale" media={initial} />
              <MediaChip icon={Video} label="Video finale" media={final} />
              <MediaChip icon={Package} label={`Foto magazzino (${warehousePhotos.length})`} media={warehousePhotos[0]} />
            </div>
            {warehousePhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {warehousePhotos.map(p => (
                  <button type="button" key={p.id} onClick={() => openAuthFile(p.file_path)}>
                    <AuthImg path={p.file_path} alt="magazzino" className="w-16 h-16 object-cover rounded-lg border border-border" />
                  </button>
                ))}
              </div>
            )}
          </div>
          {(task.task_notes || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note dell'addetta</p>
              {task.task_notes.map(n => (
                <div key={n.id} className="rounded-lg bg-muted/40 p-2.5">
                  <p className="text-xs">{n.text}</p>
                  {(n.media || []).length > 0 && (
                    <div className="flex gap-1.5 mt-1.5">
                      {n.media.map(m => (
                        <button type="button" key={m.id} onClick={() => openAuthFile(m.file_path)} className="text-xs underline text-primary">{m.kind === 'video' ? 'Video' : 'Foto'}</button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{n.by_name} · {new Date(n.at).toLocaleString('it-IT')}</p>
                </div>
              ))}
            </div>
          )}
          {(task.issues || []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Segnalazioni</p>
              {task.issues.map(i => {
                const cat = ISSUE_CAT[i.category] || { label: i.category, cls: 'bg-muted text-muted-foreground' };
                return (
                  <div key={i.id} className="flex items-center gap-2 text-xs rounded-lg border border-border p-2">
                    <Badge className={cn('text-xs border-0', cat.cls)}>{cat.label}</Badge>
                    <span className="flex-1">{i.note}</span>
                    <span className="text-muted-foreground">{i.status === 'open' ? 'Aperta' : i.status}</span>
                  </div>
                );
              })}
            </div>
          )}
          <ChecklistProgress task={task} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DuplicateDialog({ task, onClose, onDone }) {
  const [date, setDate] = useState(tomorrowStr());
  const [saving, setSaving] = useState(false);
  const go = async () => {
    setSaving(true);
    try {
      await api.post(`/cleaning-tasks/${task.id}/duplicate`, { date });
      toast.success(`Pulizia duplicata per il ${date}`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="duplicate-dialog">
        <DialogHeader><DialogTitle>Duplica pulizia</DialogTitle><DialogDescription>{task.structure_name} — copia della pianificazione</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9" data-testid="duplicate-date-input" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={go} disabled={saving} className="bg-primary text-primary-foreground" data-testid="duplicate-confirm-btn">Duplica</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RecurrenceDialog({ task, onClose, onDone }) {
  const [mode, setMode] = useState('weekly_days');
  const [weekdays, setWeekdays] = useState([]);
  const [interval, setInterval_] = useState(7);
  const [endType, setEndType] = useState('occurrences');
  const [untilDate, setUntilDate] = useState('');
  const [occurrences, setOccurrences] = useState(4);
  const [saving, setSaving] = useState(false);

  const go = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/cleaning-tasks/${task.id}/recurrence`, {
        mode,
        weekdays,
        interval_days: parseInt(interval) || 7,
        until_date: endType === 'until' ? untilDate || null : null,
        occurrences: endType === 'occurrences' ? parseInt(occurrences) || null : null,
      });
      toast.success(`${res.data.created} pulizie create`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="recurrence-dialog">
        <DialogHeader><DialogTitle>Crea ricorrenza</DialogTitle><DialogDescription>{task.structure_name} — a partire dal {task.date}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="h-9" data-testid="recur-mode-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly_days">Giorni della settimana</SelectItem>
              <SelectItem value="every_n_days">Ogni N giorni</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'weekly_days' ? (
            <div className="flex gap-1 flex-wrap">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setWeekdays(w => w.includes(i) ? w.filter(x => x !== i) : [...w, i])}
                  className={cn('px-2.5 py-1.5 rounded-full text-xs font-medium',
                    weekdays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}
                  data-testid={`recur-day-${i}`}
                >{d}</button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm">Ogni <Input type="number" min={1} value={interval} onChange={e => setInterval_(e.target.value)} className="h-9 w-20" data-testid="recur-interval-input" /> giorni</div>
          )}
          <div className="flex gap-1">
            <button onClick={() => setEndType('occurrences')} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', endType === 'occurrences' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>N. occorrenze</button>
            <button onClick={() => setEndType('until')} className={cn('px-3 py-1.5 rounded-full text-xs font-medium', endType === 'until' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>Fino a data</button>
          </div>
          {endType === 'occurrences' ? (
            <Input type="number" min={1} max={60} value={occurrences} onChange={e => setOccurrences(e.target.value)} className="h-9" data-testid="recur-occurrences-input" />
          ) : (
            <Input type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)} className="h-9" data-testid="recur-until-input" />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={go} disabled={saving} className="bg-primary text-primary-foreground" data-testid="recur-confirm-btn">Crea</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SeriesDialog({ task, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/cleaning-tasks/${task.id}/series`).then(r => setData(r.data)).catch(() => setData({ tasks: [] }));
  }, [task.id]);
  const info = data?.info;
  const freq = info
    ? (info.mode === 'weekly_days'
        ? `Giorni: ${(info.weekdays || []).map(i => WEEKDAYS[i]).join(', ') || '—'}`
        : `Ogni ${info.interval_days || '—'} giorni`)
    : '—';
  const end = info?.until_date ? `Fino al ${info.until_date}` : info?.occurrences ? `${info.occurrences} occorrenze` : '—';
  const upcoming = (data?.tasks || []).filter(t => t.date >= todayStr());
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" data-testid="series-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Repeat className="h-4 w-4 text-primary" />Pulizia ricorrente</DialogTitle>
          <DialogDescription>{task.structure_name}</DialogDescription>
        </DialogHeader>
        {data === null ? (
          <p className="text-center py-6 text-muted-foreground text-sm">Caricamento...</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Frequenza" value={freq} />
              <Info label="Fine" value={end} />
              <Info label="Data inizio" value={info?.start_date || '—'} />
              <Info label="Pulizie nella serie" value={(data.tasks || []).length} />
            </div>
            {upcoming.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Prossime pulizie</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {upcoming.map(t => {
                    const sm = STATUS_META[t.status] || STATUS_META.unassigned;
                    return (
                      <div key={t.id} className="flex items-center justify-between text-xs rounded-lg bg-muted/40 px-2.5 py-1.5" data-testid={`series-item-${t.id}`}>
                        <span className="capitalize">{fmtDate(t.date)} · {t.date}{t.scheduled_time ? ` · ${t.scheduled_time}` : ''}</span>
                        <Badge className={cn('text-xs border-0', sm.cls)}>{sm.label}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AssignDialog({ task, cleaners, onClose, onDone }) {
  const [selected, setSelected] = useState(task.assigned_cleaner_ids || (task.assigned_cleaner_id ? [task.assigned_cleaner_id] : []));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/cleaning-tasks/${task.id}`, { assigned_cleaner_ids: selected });
      toast.success(selected.length ? 'Addette assegnate' : 'Pulizia da assegnare');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="assign-dialog">
        <DialogHeader>
          <DialogTitle>Assegna addette</DialogTitle>
          <DialogDescription>{task.structure_name} — {fmtDate(task.date)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {cleaners.length === 0 && <p className="text-xs text-muted-foreground">Nessuna addetta registrata</p>}
          {cleaners.map(c => (
            <label key={c.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-muted/50 cursor-pointer" data-testid={`assign-option-${c.id}`}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={e => setSelected(s => e.target.checked ? [...s, c.id] : s.filter(x => x !== c.id))}
                className="accent-[#F24E75] w-4 h-4"
              />
              {c.name}
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground" data-testid="assign-save-btn">
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salva
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
