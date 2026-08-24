import React from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Pencil, Copy, Repeat, XCircle, Users, MapPin, AlertTriangle, UserPlus, GripVertical, Trash2, BellRing } from 'lucide-react';
import { cn } from '../../lib/utils';
import { STATUS_META, checkinLabel, fmtDuration, todayStr } from './shared';

const bedBadges = (task) => {
  const out = [];
  if (task.beds_double) out.push({ label: `${task.beds_double}× matrimoniale`, cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' });
  if (task.beds_single) out.push({ label: `${task.beds_single}× singolo`, cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' });
  if (task.beds_sofa) out.push({ label: `${task.beds_sofa}× divano letto`, cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' });
  return out;
};

export const CompactTaskRow = ({ task, actions, showDate, showCleaners = true, dragHandle }) => {
  const sm = STATUS_META[task.status] || STATUS_META.unassigned;
  const statusLabel = task.status === 'completed' && task.guests_count ? `Pronta per ${task.guests_count}` : sm.label;
  const dur = fmtDuration(task);
  const isToday = task.date === todayStr();
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 hover:border-primary/40 transition-colors cursor-pointer"
      onClick={() => actions.onDetail(task)}
      data-testid={`cleaning-row-${task.id}`}
    >
      {dragHandle}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn('text-xs border-0 px-2.5 py-0.5 rounded-full font-semibold', sm.cls)}>{statusLabel}</Badge>
          {task.checkin_today && (
            <Badge className={cn('text-xs border-0 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1',
              isToday ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}
              data-testid={`row-checkin-${task.id}`}>
              <BellRing className="h-3 w-3" />
              {isToday ? `ENTRANO OGGI${task.checkin_time ? ` ${task.checkin_time}` : ''}` : `CHECK-IN${task.checkin_time ? ` ${task.checkin_time}` : ''}`}
            </Badge>
          )}
          {task.open_issues_count > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-bold text-red-600" data-testid={`row-issues-${task.id}`}>
              <AlertTriangle className="h-3.5 w-3.5" />{task.open_issues_count}
            </span>
          )}
          {showDate && <span className="text-xs text-muted-foreground capitalize font-medium">{task.date}</span>}
        </div>
        <p className="text-base lg:text-lg font-bold leading-tight truncate">
          {task.klv_code && <span className="font-mono text-sm text-primary mr-2">{task.klv_code}</span>}
          {task.structure_name || 'Struttura non impostata'}
          {task.structure_address && <span className="font-normal text-muted-foreground"> — {task.structure_address}</span>}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {bedBadges(task).map(b => (
            <span key={b.label} className={cn('text-xs font-medium px-2 py-0.5 rounded-full', b.cls)}>{b.label}</span>
          ))}
          {task.zone_name && (
            <span className="flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              <MapPin className="h-3 w-3" />{task.zone_name}
            </span>
          )}
          {task.scheduled_time && <span className="text-xs text-muted-foreground font-medium">ore {task.scheduled_time}</span>}
          {dur && <span className="text-xs text-primary font-semibold">{dur}</span>}
          {showCleaners && task.cleaner_names?.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-foreground/80">
              <Users className="h-3 w-3 text-primary" />{task.cleaner_names.join(' + ')}
            </span>
          )}
        </div>
      </div>
      {task.guests_count ? (
        <div className="text-center shrink-0 w-14" data-testid={`row-guests-${task.id}`}>
          <p className="text-3xl font-bold text-primary leading-none tabular-nums">{task.guests_count}</p>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-0.5">Ospiti</p>
        </div>
      ) : <div className="w-14 shrink-0" />}
      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" title="Apri" onClick={() => actions.onDetail(task)} data-testid={`row-open-${task.id}`}>
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" title="Modifica" onClick={() => actions.onEdit(task)} data-testid={`row-edit-${task.id}`}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-destructive hover:text-destructive" title="Elimina" onClick={() => actions.onDelete(task)} data-testid={`row-delete-${task.id}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" data-testid={`row-menu-${task.id}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
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

export const RouteDragHandle = ({ onDragStart, onDragEnd }) => (
  <span
    draggable
    onDragStart={e => { e.stopPropagation(); onDragStart(); e.dataTransfer.setData('text/plain', 'route'); }}
    onDragEnd={onDragEnd}
    onClick={e => e.stopPropagation()}
    className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
    title="Trascina per riordinare"
  >
    <GripVertical className="h-5 w-5" />
  </span>
);
