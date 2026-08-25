import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/* Header standard di pagina: titolo a sinistra, CTA a destra. */
export function PageHeader({ title, subtitle, actions, className, testId }) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between', className)} data-testid={testId || 'page-header'}>
      <div className="min-w-0">
        <h1 className="text-xl lg:text-2xl font-heading font-semibold truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}

/* Header standard delle pagine dettaglio: torna indietro, titolo, meta, badge, azioni. */
export function DetailHeader({ backTo, backLabel, title, meta, badges, actions, testId }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-1.5" data-testid={testId || 'detail-header'}>
      <button
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary klv-interactive"
        data-testid="detail-back-btn"
      >
        <ArrowLeft className="h-4 w-4" />{backLabel || 'Indietro'}
      </button>
      <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl lg:text-2xl font-heading font-semibold leading-snug">{title}</h1>
          {meta && <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">{meta}</div>}
          {badges && <div className="flex items-center gap-1.5 flex-wrap pt-0.5">{badges}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/* Sezione contenuto delle pagine dettaglio. */
export function DetailSection({ title, actions, children, className, testId }) {
  return (
    <section className={cn('space-y-2', className)} data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function BackButton({ to, label }) {
  const navigate = useNavigate();
  return (
    <Button variant="ghost" size="sm" onClick={() => (to ? navigate(to) : navigate(-1))} data-testid="back-btn">
      <ArrowLeft className="h-4 w-4 mr-1.5" />{label || 'Indietro'}
    </Button>
  );
}
