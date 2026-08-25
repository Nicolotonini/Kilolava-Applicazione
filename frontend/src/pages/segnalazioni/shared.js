import { Package, Wrench, User, ClipboardList } from 'lucide-react';

export const TYPE_META = {
  missing: { label: 'Mancanze', single: 'Mancanza', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  damage: { label: 'Rotture / Danni', single: 'Rottura / Danno', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  malfunction: { label: 'Malfunzionamenti', single: 'Malfunzionamento', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  other: { label: 'Anomalie / Altro', single: 'Anomalia / Altro', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
};

export const PRIORITY_META = {
  low: { label: 'Bassa', dot: 'bg-slate-400' },
  normal: { label: 'Normale', dot: 'bg-sky-500' },
  high: { label: 'Alta', dot: 'bg-amber-500' },
  urgent: { label: 'Urgente', dot: 'bg-red-500' },
};

export const SEG_STATUS_META = {
  da_valutare: { label: 'Da valutare', cls: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300' },
  aperta: { label: 'Aperta', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  in_corso: { label: 'In corso', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  in_attesa: { label: 'In attesa', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  risolta: { label: 'Risolta', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  chiusa: { label: 'Chiusa', cls: 'bg-muted text-muted-foreground' },
};

export const TASK_TYPE_META = {
  delivery: { label: 'Consegna', icon: Package },
  maintenance: { label: 'Intervento', icon: Wrench },
  notify_client: { label: 'Notifica Cliente', icon: User },
  internal: { label: 'Task interno', icon: ClipboardList },
};

export const TASK_STATUS_META = {
  da_fare: { label: 'Da fare', cls: 'bg-sky-100 text-sky-700' },
  in_corso: { label: 'In corso', cls: 'bg-amber-100 text-amber-700' },
  in_attesa: { label: 'In attesa', cls: 'bg-orange-100 text-orange-700' },
  completata: { label: 'Completata', cls: 'bg-emerald-100 text-emerald-700' },
  annullata: { label: 'Annullata', cls: 'bg-muted text-muted-foreground line-through' },
};

export const WAIT_REASONS = {
  cliente: 'Cliente', materiale: 'Materiale', ricambio: 'Ricambio',
  fornitore: 'Fornitore', autorizzazione: 'Autorizzazione', altro: 'Altro',
};

export const ORIGIN_META = {
  cleaning: 'Pulizia', cleaner: 'Addetta', maintenance: 'Manutentore', rider: 'Rider',
  manager: 'Manager/Admin', client: 'Cliente', warehouse: 'Magazzino', delivery: 'Consegna',
  other: 'Altro', automation: 'Automazione',
};

export const PARTY_META = {
  kilolava: { label: 'KILOLAVA', cls: 'bg-primary/10 text-primary' },
  client: { label: 'CLIENTE / PROPRIETARIO', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  da_valutare: { label: 'DA VALUTARE', cls: 'bg-muted text-muted-foreground' },
};

export const MODE_LABELS = { manuale: 'Manuale', assistita: 'Assistita', automatica: 'Automatica', inherit: 'Eredita' };

export const ageLabel = (iso) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 giorno' : `${d} giorni`;
};

export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
