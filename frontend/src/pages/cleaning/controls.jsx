import React from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtDayLong, todayStr, shiftDay } from './shared';

export function DaySelector({ date, onChange, testPrefix = 'day' }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(shiftDay(date, -1))} data-testid={`${testPrefix}-prev`}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-base lg:text-lg font-heading font-semibold capitalize min-w-[190px] text-center" data-testid={`${testPrefix}-label`}>
        {fmtDayLong(date)}
      </span>
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(shiftDay(date, 1))} data-testid={`${testPrefix}-next`}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      {date !== todayStr() && (
        <Button variant="outline" size="sm" className="h-9" onClick={() => onChange(todayStr())} data-testid={`${testPrefix}-today-btn`}>Oggi</Button>
      )}
      <Input type="date" value={date} onChange={e => e.target.value && onChange(e.target.value)} className="h-9 w-36" data-testid={`${testPrefix}-date-input`} />
    </div>
  );
}

export function ZoneFilter({ zones, value, onChange, testId = 'zone-filter' }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
      data-testid={testId}
    >
      <option value="all">Tutti i rioni</option>
      {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
    </select>
  );
}
