import React from 'react';
import { cn } from '../../lib/utils';
import { INDICATOR_TONES, buildIndicators, fmtShortEU } from './calendarHelpers';
import { AlertTriangle } from 'lucide-react';

/**
 * Blocco soggiorno: UN SOLO blocco continuo dal check-in al check-out.
 * Mostra persone, IN/OUT e indicatori operativi (max 4 + "+N").
 */
export const SoggiornoBlock = ({ ev, indicators, compact = false, draggable, onDragStart, onDragEnd, onClick }) => {
  const inds = buildIndicators(indicators);
  const visible = inds.slice(0, 4);
  const extra = inds.length - visible.length;
  const guests = ev.guests_count;
  const hasAlert = !!ev.dates_changed || !!ev.feed_cancelled;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'rounded-md px-2 py-1.5 cursor-pointer transition-shadow hover:shadow-md overflow-hidden',
        'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-l-[3px] border-l-slate-500',
        ev.feed_cancelled && 'opacity-60 border-l-red-400',
      )}
      data-testid={`soggiorno-${ev.id}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('text-xs font-bold', guests ? 'text-slate-800 dark:text-slate-100' : 'text-amber-600')}>
          {guests ? `${guests} person${guests === 1 ? 'a' : 'e'}` : 'Persone da definire'}
        </span>
        {hasAlert && (
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-orange-600" title={ev.feed_cancelled ? 'Cancellata dal feed iCal' : 'Date soggiorno modificate'}>
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </div>
      {!compact && (
        <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
          <div><span className="font-semibold">IN</span> {ev.checkin_time || '—'} · {fmtShortEU(ev.start_time)}</div>
          <div><span className="font-semibold">OUT</span> {ev.checkout_time || '—'} · {fmtShortEU(ev.end_time)}</div>
        </div>
      )}
      {compact && (
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-snug truncate">
          {fmtShortEU(ev.start_time)} → {fmtShortEU(ev.end_time)}
        </div>
      )}
      {visible.length > 0 && (
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {visible.map((ind) => (
            <span
              key={ind.key}
              title={ind.label}
              className={cn('inline-flex items-center justify-center rounded h-4 min-w-4 px-0.5', INDICATOR_TONES[ind.tone])}
              data-testid={`ind-${ind.key}-${ev.id}`}
            >
              {ind.Icon ? <ind.Icon className="h-2.5 w-2.5" /> : <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />}
              {ind.tone === 'warn' || ind.tone === 'danger' ? <span className="text-[9px] font-bold ml-px">!</span> : null}
            </span>
          ))}
          {extra > 0 && <span className="text-[10px] text-muted-foreground font-medium">+{extra}</span>}
        </div>
      )}
    </div>
  );
};

export default SoggiornoBlock;
