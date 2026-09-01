import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/* Header standard di pagina (Design System).
   Supporta: back opzionale, titolo (28/34), descrizione, codice, badge, azioni. */
export function PageHeader({ backTo, backLabel, title, subtitle, description, code, badges, actions, className, testId }) {
  const navigate = useNavigate();
  const desc = description || subtitle;
  return (
    <div className={cn('space-y-1.5', className)} data-testid={testId || 'page-header'}>
      {(backTo || backLabel) && (
        <button
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary klv-interactive"
          data-testid="page-back-btn"
        >
          <ArrowLeft className="h-4 w-4" />{backLabel || 'Indietro'}
        </button>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-page-title font-heading font-semibold truncate">
            {title}
            {code && <span className="ml-2.5 font-mono text-sm font-bold text-primary align-middle">{code}</span>}
          </h1>
          {desc && <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>}
          {badges && <div className="flex items-center gap-1.5 flex-wrap pt-1">{badges}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/* Titolo di sezione (20/28) con descrizione e azione facoltative. */
export function SectionHeader({ title, description, action, className, testId }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)} data-testid={testId}>
      <div className="min-w-0">
        <h2 className="text-section-title font-heading">{title}</h2>
        {description && <p className="text-caption text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* Header standard delle pagine dettaglio: torna indietro, titolo, codice, meta, badge, azioni. */
export function DetailHeader({ backTo, backLabel, title, code, meta, badges, actions, testId }) {
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
          <h1 className="text-xl sm:text-page-title font-heading font-semibold leading-snug">
            {title}
            {code && <span className="ml-2.5 font-mono text-sm font-bold text-primary align-middle">{code}</span>}
          </h1>
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
