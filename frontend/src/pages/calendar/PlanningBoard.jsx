import React from 'react';
import { cn } from '../../lib/utils';
import { Loader2, Building2, DoorOpen, Plus, Move } from 'lucide-react';
import { WEEKDAYS_SHORT, MONTHS_SHORT, isToday, getEventDaySpan } from './calendarHelpers';
import { SoggiornoBlock } from './SoggiornoBlock';

/**
 * Day & Week planning board. Strutture in riga × giorni in colonna.
 * Ogni soggiorno è UN SOLO blocco continuo dal check-in al check-out.
 */
export const PlanningBoard = ({
  viewMode, days, properties, eventsByProperty, indicatorsMap,
  loading, onEventClick, onCellDblClick,
  onPanStart, onPanMove, onPanEnd,
  onDrop, onDragOver, onDragStart, onDragEnd, dragOverCell,
}) => {
  const PROP_W = '220px';
  const colCount = days.length;
  const COL_W = viewMode === 'day' ? '1fr' : 'minmax(160px, 1fr)';

  return (
    <div className="flex-1 overflow-auto" onMouseUp={onPanEnd} onMouseLeave={onPanEnd}>
      <div className={cn(viewMode === 'week' && "min-w-[900px]")}
        style={{ display: 'grid', gridTemplateColumns: `${PROP_W} repeat(${colCount}, ${COL_W})` }}>

        <div
          className="sticky top-0 left-0 z-30 bg-card border-b border-r border-border px-3 py-2 flex items-end gap-1 select-none"
          onMouseDown={onPanStart} onMouseMove={onPanMove}
          title="Trascina per scorrere"
        >
          <Move className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Strutture</span>
        </div>
        {days.map((day, i) => (
          <div
            key={i}
            className={cn(
              "sticky top-0 z-20 border-b border-border px-2 py-2 text-center cursor-grab select-none",
              isToday(day) ? 'bg-[#F24E75]/5' : 'bg-card'
            )}
            onMouseDown={onPanStart} onMouseMove={onPanMove}
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{WEEKDAYS_SHORT[(day.getDay()+6)%7]}</p>
            <p className={cn("text-lg font-bold tabular-nums leading-tight", isToday(day) ? 'text-[#F24E75]' : 'text-foreground')}>
              {day.getDate()}{viewMode === 'day' ? ` ${MONTHS_SHORT[day.getMonth()]}` : ''}
            </p>
          </div>
        ))}

        {loading && properties.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground" style={{ gridColumn: `1 / span ${colCount + 1}` }}>
            <Loader2 className="h-5 w-5 animate-spin mr-2" />Caricamento...
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20" style={{ gridColumn: `1 / span ${colCount + 1}` }}>
            <Building2 className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nessuna struttura da mostrare</p>
          </div>
        ) : (
          properties.map((prop) => {
            const propEvents = eventsByProperty[prop.key] || [];
            return (
              <React.Fragment key={prop.key}>
                <div className={cn(
                  "sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-2 flex items-center gap-2 min-h-[96px]",
                  prop.isChild && "pl-8"
                )} data-testid={`prop-row-${prop.key}`}>
                  {prop.type === 'structure' ? (
                    <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <DoorOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium truncate", prop.isChild && "text-xs")}>{prop.name}</p>
                    {prop.clientName && !prop.isChild && (
                      <p className="text-xs text-muted-foreground truncate">{prop.clientName}</p>
                    )}
                  </div>
                </div>

                {days.map((day, dayIdx) => {
                  const cellEvents = propEvents.filter(ev => {
                    const span = getEventDaySpan(ev, days);
                    return span.startCol === dayIdx;
                  });
                  const cellKey = `${prop.key}|${dayIdx}`;
                  const isDropTarget = dragOverCell === cellKey;

                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "border-b border-border relative min-h-[96px] group/cell",
                        dayIdx < colCount - 1 && "border-r",
                        isToday(day) && "bg-[#F24E75]/[0.02]",
                        isDropTarget && "bg-[#F24E75]/10 ring-2 ring-[#F24E75]/40",
                      )}
                      onDoubleClick={() => onCellDblClick(prop, day)}
                      onDragOver={(e) => onDragOver(e, cellKey)}
                      onDrop={(e) => onDrop(e, prop, day)}
                    >
                      <div className="p-1 space-y-1">
                        {cellEvents.map((ev) => {
                          const span = getEventDaySpan(ev, days);
                          const isMultiDay = span.span > 1;
                          return (
                            <div
                              key={ev.id}
                              style={isMultiDay ? {
                                width: `calc(${span.span * 100}% + ${(span.span - 1)}px)`,
                                position: 'relative', zIndex: 5,
                              } : {}}
                            >
                              <SoggiornoBlock
                                ev={ev}
                                indicators={indicatorsMap?.[ev.id]}
                                draggable={!ev.ical_uid}
                                onDragStart={(e) => { if (ev.ical_uid) { e.preventDefault(); return; } onDragStart(e, ev); }}
                                onDragEnd={onDragEnd}
                                onClick={() => onEventClick(ev)}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <button
                        className="absolute bottom-0.5 right-0.5 h-5 w-5 rounded bg-muted/70 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity"
                        onClick={() => onCellDblClick(prop, day)}
                        title="Aggiungi"
                        data-testid={`quick-add-${prop.key}-${dayIdx}`}
                      >
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PlanningBoard;
