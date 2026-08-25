import React from 'react';
import { cn } from '../../lib/utils';

/* Tonalità stato globali Kilolava — lo stesso concetto ha lo stesso colore ovunque. */
export const STATUS_TONES = {
  neutral: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  waiting: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  cancelled: 'bg-muted text-muted-foreground',
  accent: 'bg-primary/10 text-primary',
  triage: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

export function StatusBadge({ tone = 'neutral', children, className, testId }) {
  return (
    <span className={cn('text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap', STATUS_TONES[tone] || STATUS_TONES.neutral, className)} data-testid={testId}>
      {children}
    </span>
  );
}

/* Priorità globali: stesso stile in Segnalazioni, Manutenzioni, Task, Consegne. */
export const PRIORITY_TONES = {
  low: { label: 'Bassa', dot: 'bg-slate-400' },
  normal: { label: 'Normale', dot: 'bg-sky-500' },
  medium: { label: 'Normale', dot: 'bg-sky-500' },
  high: { label: 'Alta', dot: 'bg-amber-500' },
  urgent: { label: 'Urgente', dot: 'bg-red-500' },
};

export function PriorityBadge({ priority = 'normal', showLabel = true, className, testId }) {
  const p = PRIORITY_TONES[priority] || PRIORITY_TONES.normal;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)} data-testid={testId}>
      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', p.dot)} />
      {showLabel && <span className={cn('text-xs font-medium', priority === 'urgent' && 'text-red-600 font-bold')}>{p.label}</span>}
    </span>
  );
}
