import React, { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { Bed } from 'lucide-react';
import {
  EVENT_ICONS, SERVICE_ICONS, WEEKDAYS_SHORT,
  fmtDate, isToday, getEventColors,
} from './calendarHelpers';

/**
 * Traditional 6-row month grid. Mini cards with service-icons under bookings.
 */
export const MonthGrid = ({
  days, events, autoTaskMap, structuresMap, refMonth,
  onEventClick, onCellDblClick,
  onPanStart, onPanMove, onPanEnd,
  onDrop, onDragOver, onDragStart, onDragEnd, dragOverCell,
}) => {
  const eventsByDay = useMemo(() => {
    const map = {};
    for (const ev of events) {
      const startStr = (ev.start_time || '').slice(0, 10);
      const endStr = (ev.end_time || '').slice(0, 10) || startStr;
      const cur = new Date(`${startStr}T00:00:00`);
      const end = new Date(`${endStr}T00:00:00`);
      while (cur <= end) {
        const k = fmtDate(cur);
        if (!map[k]) map[k] = [];
        map[k].push(ev);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [events]);

  return (
    <div className="flex-1 overflow-auto" onMouseUp={onPanEnd} onMouseLeave={onPanEnd}>
      <div className="grid grid-cols-7" data-testid="month-grid">
        {WEEKDAYS_SHORT.map((d, i) => (
          <div key={i}
            className="sticky top-0 z-10 bg-card border-b border-r border-border px-2 py-2 text-center cursor-grab select-none"
            onMouseDown={onPanStart} onMouseMove={onPanMove}>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{d}</span>
          </div>
        ))}
        {days.map((day, i) => {
          const isOtherMonth = day.getMonth() !== refMonth;
          const cellEvents = eventsByDay[fmtDate(day)] || [];
          const cellKey = `month|${i}`;
          const isDropTarget = dragOverCell === cellKey;
          return (
            <div
              key={i}
              className={cn(
                "border-b border-r border-border min-h-[120px] p-1.5 relative",
                isToday(day) && "bg-[#F24E75]/5",
                isOtherMonth && "bg-muted/20 text-muted-foreground/60",
                isDropTarget && "bg-[#F24E75]/10 ring-2 ring-[#F24E75]/40",
              )}
              onDoubleClick={() => onCellDblClick(day)}
              onDragOver={(e) => onDragOver(e, cellKey)}
              onDrop={(e) => onDrop(e, null, day)}
              data-testid={`month-cell-${fmtDate(day)}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn("text-xs font-semibold tabular-nums", isToday(day) && 'text-[#F24E75]')}>
                  {day.getDate()}
                </span>
                {cellEvents.length > 3 && (
                  <span className="text-xs text-muted-foreground">+{cellEvents.length - 3}</span>
                )}
              </div>
              <div className="space-y-0.5">
                {cellEvents.slice(0, 3).map((ev) => {
                  const colors = getEventColors(ev);
                  const Icon = EVENT_ICONS[ev.event_type] || Bed;
                  const struct = structuresMap[ev.structure_id];
                  const isBooking = ev.event_type === 'booking';
                  return (
                    <div
                      key={ev.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, ev)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      className={cn(
                        "rounded px-1.5 py-1 cursor-pointer hover:shadow border-l-[3px] overflow-hidden",
                        colors.bg, colors.border
                      )}
                      data-testid={`month-event-${ev.id}`}
                    >
                      <div className="flex items-center gap-1">
                        <Icon className={cn("h-2.5 w-2.5 flex-shrink-0", colors.text)} />
                        <span className={cn("text-xs font-medium truncate flex-1", colors.text)}>
                          {ev.title}
                        </span>
                      </div>
                      {isBooking && struct && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {SERVICE_ICONS.map(({ key, rule, Icon: SIcon, color, bg }) => {
                            const taskExists = !!autoTaskMap[ev.id]?.[rule];
                            return (
                              <div key={key} className={cn(
                                "w-3 h-3 rounded flex items-center justify-center",
                                taskExists ? `${bg} ${color}` : 'bg-muted/30 text-muted-foreground/30'
                              )}>
                                <SIcon className="h-2 w-2" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthGrid;
