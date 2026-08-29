// Calendar shared helpers, constants, and small utility components.
import {
  Bed, Sparkles, Truck, Package, Wrench,
  AlertCircle, CheckCircle2, Loader2, XCircle, User,
} from 'lucide-react';

export const EVENT_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];

export const EVENT_ICONS = { booking: Bed, cleaning: Sparkles, delivery: Truck, pickup: Package, maintenance: Wrench };
export const STATUS_ICONS = { pending: AlertCircle, assigned: User, in_progress: Loader2, completed: CheckCircle2, cancelled: XCircle };

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const WEEKDAYS_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
export const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

export const fmtDate = (d) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
};
export const fmtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export const fmtEU = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
// 26/08 short form
export const fmtShortEU = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
};

export const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};
export const getMonthStart = (date) => {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
export const isSameDay = (a, b) => fmtDate(a) === fmtDate(b);
export const isToday = (d) => isSameDay(d, new Date());

export const getPropertyKey = (ev) => ev.unit_id ? `unit:${ev.unit_id}` : `struct:${ev.structure_id}`;

export const getEventDaySpan = (ev, days) => {
  const evStartStr = (ev.start_time || '').slice(0, 10);
  const evEndStr = (ev.end_time || '').slice(0, 10);
  let startCol = -1, endCol = -1;
  for (let i = 0; i < days.length; i++) {
    const d = fmtDate(days[i]);
    if (d >= evStartStr && startCol === -1) startCol = i;
    if (d <= evEndStr) endCol = i;
  }
  if (startCol === -1) startCol = 0;
  if (endCol === -1 || endCol < startCol) endCol = startCol;
  return { startCol, span: endCol - startCol + 1 };
};

// Indicatori operativi del soggiorno: SOLO ciò che richiede azione o stato utile.
// Ritorna array [{key, Icon, label, tone: 'ok'|'warn'|'danger'|'info'}]
export const buildIndicators = (ind) => {
  if (!ind) return [];
  const out = [];
  const c = ind.cleaning || {};
  if (c.task_id) {
    out.push(c.assigned
      ? { key: 'cleaning', Icon: Sparkles, label: `Pulizia organizzata${c.cleaners?.length ? ` — ${c.cleaners.join(', ')}` : ''}`, tone: 'ok' }
      : { key: 'cleaning', Icon: Sparkles, label: 'Pulizia da assegnare', tone: 'warn' });
  } else {
    out.push({ key: 'cleaning', Icon: Sparkles, label: 'Pulizia da creare', tone: 'warn' });
  }
  if (ind.linen_gap) out.push({ key: 'linen', Icon: Bed, label: 'Fabbisogno biancheria non coperto', tone: 'warn' });
  if (ind.supplies_gap) out.push({ key: 'supplies', Icon: Package, label: 'Reintegro forniture richiesto', tone: 'warn' });
  if (ind.maintenance_open) out.push({ key: 'maintenance', Icon: Wrench, label: 'Intervento manutenzione aperto', tone: 'danger' });
  if (ind.has_notes) out.push({ key: 'notes', Icon: null, label: 'Note operative', tone: 'info' });
  return out;
};

export const INDICATOR_TONES = {
  ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-muted text-muted-foreground',
};
