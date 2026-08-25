import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/skeleton';

export function EmptyState({ icon: Icon = AlertTriangle, message, action, className, testId }) {
  return (
    <div className={cn('text-center py-14 border border-dashed border-border rounded-xl', className)} data-testid={testId || 'empty-state'}>
      <Icon className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
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
