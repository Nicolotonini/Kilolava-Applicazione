import React from 'react';
import { cn } from '../../lib/utils';
import {
  Loader2, Building2, DoorOpen, Plus, Bed, Zap, Lock, User, AlertCircle, Move,
} from 'lucide-react';
import {
  EVENT_ICONS, SOURCE_COLORS, WEEKDAYS_SHORT, MONTHS_SHORT,
  fmtTime, fmtEU, isToday, getEventColors, getEventDaySpan,
} from './calendarHelpers';
import { ServiceIconsRow } from './ServiceIconsRow';

/**
 * Day & Week planning board. Properties rows × day columns grid.
 */
export const PlanningBoard = ({
  viewMode, days, properties, eventsByProperty, autoTaskMap, structuresMap,
  loading, onEventClick, onCellDblClick, onAddCell,
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
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Strutture</span>
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
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{WEEKDAYS_SHORT[(day.getDay()+6)%7]}</p>
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
            <p className="text-muted-foreground">Nessuna struttura configurata</p>
          </div>
        ) : (
          properties.map((prop) => {
            const propEvents = eventsByProperty[prop.key] || [];
            return (
              <React.Fragment key={prop.key}>
                <div className={cn(
                  "sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-2 flex items-center gap-2 min-h-[110px]",
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
                      <p className="text-[11px] text-muted-foreground truncate">{prop.clientName}</p>
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
                        "border-b border-border relative min-h-[110px] group/cell",
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
                          const colors = getEventColors(ev);
                          const Icon = EVENT_ICONS[ev.event_type] || Bed;
                          const isMultiDay = span.span > 1;
                          const isBooking = ev.event_type === 'booking';
                          const struct = structuresMap[ev.structure_id];

                          return (
                            <div
                              key={ev.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, ev)}
                              onDragEnd={onDragEnd}
                              className={cn(
                                "rounded px-2 py-1.5 cursor-pointer transition-shadow hover:shadow-md relative overflow-hidden",
                                "border-l-[3px]",
                                colors.bg, colors.border,
                                isBooking && "min-h-[88px]"
                              )}
                              style={isMultiDay ? {
                                width: `calc(${span.span * 100}% + ${(span.span - 1)}px)`,
                                position: 'relative', zIndex: 5,
                              } : {}}
                              onClick={() => onEventClick(ev)}
                              data-testid={`event-${ev.id}`}
                            >
                              <div className="flex items-center gap-1">
                                <Icon className={cn("h-3 w-3 flex-shrink-0", colors.text)} />
                                <span className={cn("text-[11px] font-semibold truncate flex-1", colors.text)}>
                                  {ev.title}
                                </span>
                                {(ev.auto_generated || ev.source === 'automation') && <Zap className="h-2.5 w-2.5 text-violet-500 flex-shrink-0" />}
                                {ev.manually_modified && <Lock className="h-2.5 w-2.5 text-amber-500 flex-shrink-0" />}
                              </div>

                              {isBooking ? (
                                <>
                                  <div className={cn("text-[10px] mt-0.5", colors.text)}>
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">In:</span> {fmtEU(ev.start_time)}{ev.start_time?.includes('T') ? ` · ${fmtTime(ev.start_time)}` : ''}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="font-medium">Out:</span> {fmtEU(ev.end_time)}{ev.end_time?.includes('T') ? ` · ${fmtTime(ev.end_time)}` : ''}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {ev.source && (
                                      <span className={cn("text-[10px] font-medium", colors.text)}>
                                        {SOURCE_COLORS[ev.source]?.label || ev.source}
                                      </span>
                                    )}
                                  </div>
                                  <ServiceIconsRow
                                    booking={ev}
                                    structure={struct}
                                    autoTaskMap={autoTaskMap}
                                    onIconClick={(task) => onEventClick(task)}
                                  />
                                </>
                              ) : (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={cn("text-[10px]", colors.text)}>
                                    {fmtTime(ev.start_time)}{isMultiDay ? '' : `-${fmtTime(ev.end_time)}`}
                                  </span>
                                  {ev.assigned_operator && (
                                    <span className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                                      <User className="h-2.5 w-2.5" />{ev.assigned_operator}
                                    </span>
                                  )}
                                  {!ev.assigned_operator && ev.status === 'pending' && (
                                    <AlertCircle className="h-2.5 w-2.5 text-amber-500" />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        className="absolute bottom-0.5 right-0.5 h-5 w-5 rounded bg-muted/70 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity"
                        onClick={() => onAddCell(prop, day)}
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
