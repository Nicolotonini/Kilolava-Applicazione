import React, { useRef } from 'react';
import { Button } from '../../components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { fmtDayLong, todayStr, shiftDay } from './shared';

export function DaySelector({ date, onChange, testPrefix = 'day' }) {
  const inputRef = useRef(null);
  const openPicker = () => {
    if (inputRef.current?.showPicker) inputRef.current.showPicker();
    else inputRef.current?.click();
  };
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl" onClick={() => onChange(shiftDay(date, -1))} data-testid={`${testPrefix}-prev`}>
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <button
        onClick={openPicker}
        className="relative flex items-center gap-2.5 h-11 px-4 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors"
        data-testid={`${testPrefix}-date-btn`}
      >
        <CalendarDays className="h-5 w-5 text-primary" />
        <span className="text-base lg:text-lg font-heading font-semibold capitalize whitespace-nowrap" data-testid={`${testPrefix}-label`}>
          {fmtDayLong(date)}
        </span>
        <input
          ref={inputRef}
          type="date"
          value={date}
          onChange={e => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          tabIndex={-1}
          data-testid={`${testPrefix}-date-input`}
        />
      </button>
      <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl" onClick={() => onChange(shiftDay(date, 1))} data-testid={`${testPrefix}-next`}>
        <ChevronRight className="h-5 w-5" />
      </Button>
      {date !== todayStr() && (
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => onChange(todayStr())} data-testid={`${testPrefix}-today-btn`}>Oggi</Button>
      )}
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
