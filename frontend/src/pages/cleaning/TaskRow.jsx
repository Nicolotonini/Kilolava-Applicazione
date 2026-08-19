import React from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Pencil, Copy, Repeat, XCircle, Users, MapPin, AlertTriangle, UserPlus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { STATUS_META, checkinLabel, fmtDuration, bedsLabel, fmtDate } from './shared';

export const CompactTaskRow = ({ task, actions, showDate }) => {
  const sm = STATUS_META[task.status] || STATUS_META.unassigned;
  const statusLabel = task.status === 'completed' && task.guests_count ? `Pronta per ${task.guests_count}` : sm.label;
  const beds = bedsLabel(task);
  const dur = fmtDuration(task);
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 hover:border-primary/40 transition-colors cursor-pointer"
      onClick={() => actions.onDetail(task)}
      data-testid={`cleaning-row-${task.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {task.klv_code && <span className="font-mono text-[11px] font-bold text-primary">{task.klv_code}</span>}
          <span className="font-semibold text-sm truncate">{task.structure_name || 'Struttura non impostata'}</span>
          <Badge className={cn('text-[10px] border-0 px-1.5 py-0', sm.cls)}>{statusLabel}</Badge>
          {task.open_issues_count > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-red-600" data-testid={`row-issues-${task.id}`}>
              <AlertTriangle className="h-3 w-3" />{task.open_issues_count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground flex-wrap mt-0.5">
          {showDate && <span className="capitalize font-medium">{fmtDate(task.date)}</span>}
          {task.guests_count ? <span>{task.guests_count} persone</span> : null}
          {beds && <span>{beds}</span>}
          <span className={cn(task.checkin_today && 'text-amber-600 font-medium')} data-testid={`row-checkin-${task.id}`}>{checkinLabel(task)}</span>
          {task.zone_name && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{task.zone_name}</span>}
          {task.scheduled_time && <span>ore {task.scheduled_time}</span>}
          {dur && <span className="text-primary font-medium">{dur}</span>}
        </div>
        {task.cleaner_names?.length > 0 && (
          <p className="flex items-center gap-1 text-[11px] text-foreground/80 mt-0.5">
            <Users className="h-3 w-3 text-primary" />{task.cleaner_names.join(' · ')}
          </p>
        )}
      </div>
      <div onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`row-menu-${task.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => actions.onDetail(task)} data-testid={`menu-detail-${task.id}`}><Eye className="h-4 w-4 mr-2" />Apri</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onEdit(task)} data-testid={`menu-edit-${task.id}`}><Pencil className="h-4 w-4 mr-2" />Modifica</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAssign(task)} data-testid={`menu-assign-${task.id}`}><UserPlus className="h-4 w-4 mr-2" />Assegna addette</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onDuplicate(task)} data-testid={`menu-duplicate-${task.id}`}><Copy className="h-4 w-4 mr-2" />Duplica</DropdownMenuItem>
            {task.recurrence_series_id ? (
              <DropdownMenuItem onClick={() => actions.onSeries(task)} className="text-primary focus:text-primary" data-testid={`menu-series-${task.id}`}><Repeat className="h-4 w-4 mr-2" />Pulizia ricorrente</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => actions.onRecur(task)} data-testid={`menu-recur-${task.id}`}><Repeat className="h-4 w-4 mr-2" />Crea ricorrenza</DropdownMenuItem>
            )}
            {task.status !== 'cancelled' && task.status !== 'completed' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => actions.onCancel(task)} className="text-destructive focus:text-destructive" data-testid={`menu-cancel-${task.id}`}><XCircle className="h-4 w-4 mr-2" />Annulla</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};
