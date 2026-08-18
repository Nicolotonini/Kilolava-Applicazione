// Calendar shared helpers, constants, and small utility components.
import {
  Bed, Sparkles, Truck, Package, Wrench, User,
  AlertCircle, CheckCircle2, Loader2, XCircle,
  RefreshCw,
} from 'lucide-react';

export const EVENT_TYPES = ['booking', 'cleaning', 'delivery', 'pickup', 'maintenance'];
export const EVENT_STATUSES = ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'];

export const TYPE_COLORS = {
  booking:     { bg: 'bg-slate-200 dark:bg-slate-700',         text: 'text-slate-800 dark:text-slate-100',       border: 'border-slate-400' },
  cleaning:    { bg: 'bg-emerald-100 dark:bg-emerald-900/40',  text: 'text-emerald-800 dark:text-emerald-200',   border: 'border-emerald-400' },
  delivery:    { bg: 'bg-blue-100 dark:bg-blue-900/40',        text: 'text-blue-800 dark:text-blue-200',         border: 'border-blue-400' },
  pickup:      { bg: 'bg-blue-100 dark:bg-blue-900/40',        text: 'text-blue-800 dark:text-blue-200',         border: 'border-blue-400' },
  maintenance: { bg: 'bg-orange-100 dark:bg-orange-900/40',    text: 'text-orange-800 dark:text-orange-200',     border: 'border-orange-400' },
};

export const SOURCE_COLORS = {
  airbnb:      { bg: 'bg-rose-100 dark:bg-rose-900/40',  text: 'text-rose-800 dark:text-rose-200',   border: 'border-rose-500',  label: 'Airbnb' },
  booking_com: { bg: 'bg-blue-100 dark:bg-blue-900/40',  text: 'text-blue-800 dark:text-blue-200',   border: 'border-blue-500',  label: 'Booking' },
  direct:      { bg: 'bg-slate-100 dark:bg-slate-800',   text: 'text-slate-700 dark:text-slate-200', border: 'border-slate-500', label: 'Diretto' },
  manual:      { bg: 'bg-slate-100 dark:bg-slate-800',   text: 'text-slate-700 dark:text-slate-200', border: 'border-slate-500', label: 'Manuale' },
};

export const EVENT_ICONS = { booking: Bed, cleaning: Sparkles, delivery: Truck, pickup: Package, maintenance: Wrench };
export const STATUS_ICONS = { pending: AlertCircle, assigned: User, in_progress: Loader2, completed: CheckCircle2, cancelled: XCircle };

// 4 service icons shown under bookings — colored if a corresponding auto-task exists
export const SERVICE_ICONS = [
  { key: 'cleaning',     rule: 'checkout_cleaning',     Icon: Sparkles, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40', label: 'Pulizia' },
  { key: 'linen',        rule: 'checkout_linen',        Icon: RefreshCw,color: 'text-blue-600',    bg: 'bg-blue-100 dark:bg-blue-900/40',       label: 'Biancheria' },
  { key: 'consumables',  rule: 'checkout_consumables',  Icon: Package,  color: 'text-amber-600',   bg: 'bg-amber-100 dark:bg-amber-900/40',     label: 'Consumabili' },
  { key: 'maintenance',  rule: 'checkout_maintenance',  Icon: Wrench,   color: 'text-orange-600',  bg: 'bg-orange-100 dark:bg-orange-900/40',   label: 'Manutenzione' },
];

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const WEEKDAYS_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
export const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

export const fmtDate = (d) => d.toISOString().split('T')[0];
export const fmtTime = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
export const fmtEU = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
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

export const getEventColors = (ev) => {
  if (ev.event_type === 'booking' && ev.source && SOURCE_COLORS[ev.source]) return SOURCE_COLORS[ev.source];
  if (ev.event_type === 'booking') return SOURCE_COLORS.direct;
  return TYPE_COLORS[ev.event_type] || TYPE_COLORS.cleaning;
};

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
