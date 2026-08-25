import React from 'react';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';

/* KPI card standard Kilolava (riferimento: pagina Chiavi). */
export function KpiCard({ label, value, sub, accent, onClick, active, testId }) {
  return (
    <Card
      className={cn('border shadow-none', onClick && 'cursor-pointer card-hover', active && 'border-primary ring-1 ring-primary/30')}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className={cn('text-3xl font-semibold tabular-nums mt-1', accent)} data-testid={testId}>{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function KpiGrid({ children, cols = 6, className, testId }) {
  const colCls = {
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4',
    5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
  }[cols] || 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6';
  return <div className={cn('grid gap-3', colCls, className)} data-testid={testId}>{children}</div>;
}
