import React from 'react';
import { cn } from '../../lib/utils';
import { Pencil } from 'lucide-react';

// Sezione "Personale del giorno": disponibilità giornaliera (override del giorno, non tocca lo standard)
export function DayStaffStrip({ title, people, onEdit, testPrefix = 'staff' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5" data-testid={`${testPrefix}-strip`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{title}</p>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {people.length === 0 && <p className="text-sm text-muted-foreground px-1">Nessun operatore.</p>}
        {people.map(p => {
          const av = p.availability || {};
          const off = av.available === false;
          return (
            <button key={p.id} onClick={() => onEdit(p)}
              className={cn('shrink-0 text-left rounded-lg border px-2.5 py-1.5 min-w-[150px] transition-colors hover:border-primary/60',
                off ? 'border-border bg-muted/50 opacity-70' : 'border-border bg-background')}
              data-testid={`${testPrefix}-person-${p.id}`}>
              <div className="flex items-center gap-1.5">
                {p.gps && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="GPS attivo (in servizio)" data-testid={`${testPrefix}-gps-${p.id}`} />}
                <span className="text-sm font-bold truncate">{p.name}</span>
                {p.vehicle && <span className="text-xs text-muted-foreground">· {p.vehicle}</span>}
                <Pencil className="h-3 w-3 text-muted-foreground/50 ml-auto shrink-0" />
              </div>
              {p.is_birthday && av.available === false && !p.has_override ? (
                <p className="text-xs font-semibold text-primary">🎂 Compleanno</p>
              ) : off ? (
                <p className="text-xs font-semibold text-red-600" data-testid={`${testPrefix}-off-${p.id}`}>Giorno libero</p>
              ) : (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Disponibile {av.start_time || '—'}–{av.end_time || '—'}{av.max_hours ? ` · max ${av.max_hours}h` : ''}
                </p>
              )}
              {(av.notes || av.note) && <p className="text-xs text-amber-700 truncate" title={av.notes || av.note}>✎ {av.notes || av.note}</p>}
              {p.has_override && <p className="text-[11px] text-primary/80">modificato per oggi</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
