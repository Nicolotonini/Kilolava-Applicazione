export const STATUS_META = {
  unassigned: { label: 'Da fare', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  assigned: { label: 'Da fare', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  in_progress: { label: 'In corso', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed: { label: 'Pronta', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  issue_reported: { label: 'Problema', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  needs_review: { label: 'Problema', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Annullata', cls: 'bg-muted text-muted-foreground line-through' },
};

export const ISSUE_CAT = {
  missing: { label: 'Mancanza', cls: 'bg-sky-100 text-sky-700' },
  damage: { label: 'Rottura / Danno', cls: 'bg-red-100 text-red-700' },
  malfunction: { label: 'Malfunzionamento', cls: 'bg-amber-100 text-amber-700' },
  other: { label: 'Anomalia / Altro', cls: 'bg-violet-100 text-violet-700' },
};

export const todayStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
export const tomorrowStr = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(Date.now() + 86400000));

export const shiftDay = (dateStr, delta) => {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

export const shiftMonth = (m, delta) => {
  const d = new Date(`${m}-01T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
};

export const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const fmtDayLong = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : '');

export const checkinLabel = (task) => {
  const isToday = task.date === todayStr();
  if (task.checkin_today) {
    if (isToday) return `Entrano oggi${task.checkin_time ? ` alle ${task.checkin_time}` : ''}`;
    return `Check-in${task.checkin_time ? ` ${task.checkin_time}` : ' lo stesso giorno'}`;
  }
  return isToday ? 'Oggi non entrano ospiti' : 'Nessun check-in';
};

export const fmtDuration = (task) =>
  task.started_at && task.finished_at && task.duration_minutes != null
    ? (task.duration_minutes > 0 ? `${task.duration_minutes} min` : '< 1 min')
    : null;

export const bedsLabel = (task) => {
  const parts = [];
  if (task.beds_double) parts.push(`${task.beds_double} matr.`);
  if (task.beds_single) parts.push(`${task.beds_single} sing.`);
  if (task.beds_sofa) parts.push(`${task.beds_sofa} div.`);
  return parts.join(' + ');
};

export const isUnassigned = (task) => !(task.assigned_cleaner_ids || []).length && !task.assigned_cleaner_id;

export const fmtMinutes = (m) => {
  if (m == null) return '—';
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h}h${String(mm).padStart(2, '0')}` : `${mm} min`;
};

export const CONF_LABEL = {
  alta: 'Alta affidabilità',
  pochi_dati: 'Pochi dati',
  stima_iniziale: 'Stima iniziale',
};
