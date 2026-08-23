import React from 'react';
import { Button } from '../../components/ui/button';
import { X, Settings2, AlertTriangle, Users, GripVertical, Maximize2, UserPlus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fmtMinutes } from './shared';

export function LoadBar({ load, capacity }) {
  const pct = capacity > 0 ? Math.min(100, (load / capacity) * 100) : 0;
  const over = load > capacity;
  return (
    <div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all',
            over ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn('text-[10px] mt-0.5 tabular-nums', over ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
        {fmtMinutes(load)} / {fmtMinutes(capacity)}
      </p>
    </div>
  );
}

export function CardTaskChip({ task, cardId, index, onRemove, onDragStartChip, onDropOnChip, onDetail }) {
  const [over, setOver] = React.useState(false);
  const checkinRisk = task.checkin_today && task.status !== 'completed';
  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStartChip(task, index); e.dataTransfer.setData('text/plain', task.id); }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); onDropOnChip(index); }}
      onClick={() => onDetail(task)}
      className={cn('rounded-md border bg-card px-2 py-1.5 cursor-grab active:cursor-grabbing select-none',
        over ? 'border-primary border-t-4' : 'border-border')}
      data-testid={`col-chip-${cardId}-${task.id}`}
    >
      <div className="flex items-center gap-1">
        <GripVertical className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{task.structure_name}</p>
          <p className="text-[10px] text-muted-foreground truncate">
            {task.zone_name || '—'}{task.guests_count ? ` · ${task.guests_count} pax` : ''} · ~{fmtMinutes(task.predicted_duration_minutes)}
          </p>
        </div>
        {task.checkin_today && task.checkin_time && (
          <span className={cn('text-[9px] font-bold px-1 py-0.5 rounded shrink-0',
            checkinRisk ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
            CI {task.checkin_time}
          </span>
        )}
        <button onClick={e => { e.stopPropagation(); onRemove(task); }}
          className="text-muted-foreground hover:text-destructive shrink-0" title="Rimuovi da questa scheda"
          data-testid={`col-remove-${cardId}-${task.id}`}>
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export const OperatorCard = React.memo(function OperatorCard({
  card, compact, selected, highlighted, dragHint, restThreshold,
  onSelect, onDropTask, onDragStartCard, onDragStartChip, onDropOnChip,
  onRemoveTask, onDetail, onAvailability, onExpand, onGroupAction,
}) {
  const [over, setOver] = React.useState(false);
  const av = card.availability || {};
  const unavailable = av.available === false;
  const overload = card.load > card.capacity;
  const restAlert = card.consecutive_days >= restThreshold;

  return (
    <div
      draggable
      onDragStart={e => { onDragStartCard(card.id); e.dataTransfer.setData('text/plain', card.id); }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setOver(false); onDropTask(card); }}
      className={cn('absolute rounded-xl border-2 bg-card flex flex-col transition-colors select-none shadow-sm',
        over ? 'border-primary bg-primary/5' : highlighted ? 'border-primary ring-2 ring-primary/40' : 'border-border',
        unavailable && 'opacity-60 grayscale')}
      style={{ left: card.x, top: card.y, width: card.w, height: card.h }}
      data-testid={`board-card-${card.id}`}
    >
      <div className={cn('px-3 pt-2 pb-1.5 border-b border-border/60 cursor-grab active:cursor-grabbing', card.isGroup && 'bg-primary/5 rounded-t-[10px]')}>
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect(card)}
            onClick={e => e.stopPropagation()}
            className="accent-[#F24E75] w-3.5 h-3.5 shrink-0"
            disabled={card.isGroup}
            style={card.isGroup ? { visibility: 'hidden' } : undefined}
            data-testid={`card-select-${card.id}`}
          />
          <p className="text-sm font-bold uppercase tracking-wide truncate flex-1 flex items-center gap-1">
            {card.isGroup && <Users className="h-3.5 w-3.5 text-primary shrink-0" />}
            {card.name}
          </p>
          {compact && (
            <button onClick={e => { e.stopPropagation(); onExpand(card); }} className="text-muted-foreground hover:text-primary" title="Espandi" data-testid={`card-expand-${card.id}`}>
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          {!card.isGroup && (
            <button onClick={e => { e.stopPropagation(); onAvailability(card); }} className="text-muted-foreground hover:text-primary" title="Disponibilità" data-testid={`card-availability-${card.id}`}>
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {card.isGroup ? (
          <p className="text-[10px] text-primary font-medium">GRUPPO · {card.memberNames.length} addette</p>
        ) : (
          <p className="text-[10px] text-muted-foreground">
            {unavailable ? 'Non disponibile oggi' : `${av.start_time || '—'} → ${av.end_time || '—'} · max ${av.max_hours || 8}h`}
            {card.consecutive_days > 0 && <span className={cn('ml-1', restAlert && 'text-amber-600 font-semibold')}> · {card.consecutive_days}° giorno</span>}
          </p>
        )}
      </div>

      {!compact ? (
        <>
          <div className="px-3 py-1.5 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium">{card.tasks.length} pulizie</span>
              {card.zonesPath && <span className="text-muted-foreground truncate max-w-[55%]" title={card.zonesPath}>{card.zonesPath}</span>}
            </div>
            <LoadBar load={card.load} capacity={card.capacity} />
            <div className="flex gap-1 flex-wrap">
              {overload && <span className="flex items-center gap-0.5 text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full" data-testid={`card-overload-${card.id}`}><AlertTriangle className="h-2.5 w-2.5" />Sovraccarico</span>}
              {restAlert && !card.isGroup && <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full" data-testid={`card-rest-${card.id}`}><AlertTriangle className="h-2.5 w-2.5" />Valuta riposo</span>}
            </div>
            {over && dragHint && (
              <p className={cn('text-[10px] font-medium rounded px-1.5 py-0.5', dragHint.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')} data-testid={`card-hint-${card.id}`}>
                {dragHint.text}
              </p>
            )}
          </div>
          <div className="px-2 pb-2 space-y-1 flex-1 overflow-y-auto">
            {card.tasks.length === 0 && <p className="text-[10px] text-muted-foreground/60 text-center py-4">Trascina qui le pulizie</p>}
            {card.tasks.map((t, idx) => (
              <CardTaskChip key={t.id} task={t} cardId={card.id} index={idx}
                onRemove={(task) => onRemoveTask(card, task)}
                onDragStartChip={(task, i) => onDragStartChip(card, task, i)}
                onDropOnChip={(i) => onDropOnChip(card, i)}
                onDetail={onDetail} />
            ))}
          </div>
          {card.isGroup && (
            <div className="px-2 pb-2 pt-1 border-t border-border/60 space-y-1">
              <div className="flex gap-1 flex-wrap">
                {card.memberNames.map((n, i) => (
                  <span key={card.memberIds[i]} className="flex items-center gap-0.5 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
                    {n}
                    <button onClick={() => onGroupAction(card, 'remove_member', card.memberIds[i])} className="hover:text-destructive" data-testid={`group-remove-member-${card.id}-${card.memberIds[i]}`}><X className="h-2.5 w-2.5" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => onGroupAction(card, 'add_member')} data-testid={`group-add-member-${card.id}`}><UserPlus className="h-3 w-3 mr-0.5" />Aggiungi</Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-destructive hover:text-destructive" onClick={() => onGroupAction(card, 'dissolve')} data-testid={`group-dissolve-${card.id}`}>Sciogli gruppo</Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="px-3 py-2 space-y-1 text-[11px] flex-1" onClick={() => onExpand(card)}>
          <p className="font-semibold">{card.tasks.length} pulizie · {fmtMinutes(card.load)}</p>
          <LoadBar load={card.load} capacity={card.capacity} />
          {card.zonesPath && <p className="text-muted-foreground truncate">{card.zonesPath}</p>}
          <div className="flex gap-1 flex-wrap">
            {overload && <span className="text-[9px] font-bold text-red-600">⚠ Sovraccarico</span>}
            {restAlert && !card.isGroup && <span className="text-[9px] font-bold text-amber-600">⚠ Riposo</span>}
          </div>
        </div>
      )}
    </div>
  );
});
