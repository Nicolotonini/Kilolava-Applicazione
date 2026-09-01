import React from 'react';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';
import { Button } from '../ui/button';

/* Stato vuoto standard: icona, titolo opzionale, spiegazione, CTA facoltativa. */
export function EmptyState({ icon: Icon = AlertTriangle, title, message, action, className, testId }) {
  return (
    <div className={cn('text-center py-14 px-4 border border-dashed border-border rounded-xl', className)} data-testid={testId || 'empty-state'}>
      <Icon className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
      {title && <p className="text-card-title mb-1">{title}</p>}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/* Stato di errore standard: messaggio comprensibile, Riprova, eventuale ritorno indietro. */
export function ErrorState({ title = 'Qualcosa non ha funzionato', message, onRetry, backTo, backLabel, className, testId }) {
  const navigate = useNavigate();
  return (
    <div className={cn('text-center py-14 px-4 border border-dashed border-destructive/30 rounded-xl', className)} data-testid={testId || 'error-state'}>
      <AlertTriangle className="h-8 w-8 mx-auto text-destructive/50 mb-3" />
      <p className="text-card-title mb-1">{title}</p>
      {message && <p className="text-sm text-muted-foreground max-w-md mx-auto">{message}</p>}
      <div className="mt-4 flex items-center justify-center gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5" data-testid="error-retry-btn">
            <RotateCcw className="h-3.5 w-3.5" />Riprova
          </Button>
        )}
        {backTo && (
          <Button variant="ghost" size="sm" onClick={() => navigate(backTo)} className="gap-1.5" data-testid="error-back-btn">
            <ArrowLeft className="h-3.5 w-3.5" />{backLabel || 'Torna indietro'}
          </Button>
        )}
      </div>
    </div>
  );
}

export function KpiSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="kpi-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border p-4 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-12" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }) {
  return (
    <div className="rounded-xl border border-border divide-y divide-border/60" data-testid="list-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <Skeleton className="h-3 w-3 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4" data-testid="detail-skeleton">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-7 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
        <div className="lg:col-span-2 space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden" data-testid="table-skeleton">
      <div className="flex gap-4 px-4 py-3 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 flex-1" />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3.5 border-b border-border/60 last:border-0">
          {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-3.5 flex-1" />)}
        </div>
      ))}
    </div>
  );
}
