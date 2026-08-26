import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../components/ui/button';

export const FERMATA_STATUS = {
  unassigned: { label: 'Da assegnare', tone: 'triage' },
  assigned: { label: 'Programmata', tone: 'neutral' },
  in_progress: { label: 'In corso', tone: 'progress' },
  completed: { label: 'Completata', tone: 'success' },
  problem: { label: 'Problema', tone: 'danger' },
  cancelled: { label: 'Annullata', tone: 'cancelled' },
};

export const KIND_TONES = {
  noleggio: 'violet',
  fornitura: 'progress',
  pulizie: 'neutral',
  zaino: 'accent',
  lavanderia_privata: 'triage',
  manutenzione: 'waiting',
  manuale: 'cancelled',
};

export const PRIO_LABEL = { low: 'Bassa', normal: 'Normale', high: 'Alta', urgent: 'Urgente' };

export const todayRome = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());

export const fmtDay = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const itemsSummary = (items) => (items || []).map((i) => `${i.qty}× ${i.name}`).join(', ');

export const shiftDay = (dateStr, days) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function DaySelector({ date, onChange, testId }) {
  const today = todayRome();
  return (
    <div className="flex items-center gap-1" data-testid={testId || 'day-selector'}>
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(shiftDay(date, -1))} data-testid="day-prev">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="relative">
        <button className="h-9 px-3 rounded-md border border-border text-sm font-semibold capitalize min-w-[170px]" data-testid="day-label">
          {new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
          data-testid="day-picker"
        />
      </div>
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => onChange(shiftDay(date, 1))} data-testid="day-next">
        <ChevronRight className="h-4 w-4" />
      </Button>
      {date !== today && (
        <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={() => onChange(today)} data-testid="day-today">
          Oggi
        </Button>
      )}
    </div>
  );
}
