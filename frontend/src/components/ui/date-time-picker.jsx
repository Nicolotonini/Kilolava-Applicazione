import * as React from "react";
import { format, parse } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * DateTimePicker
 * value: string in `YYYY-MM-DDTHH:mm` form (compatible with input[type=datetime-local])
 * onChange: receives the same string format (or empty string)
 */
export function DateTimePicker({ value, onChange, placeholder = "Seleziona data e ora", className, "data-testid": testId }) {
  const parsed = React.useMemo(() => {
    if (!value) return null;
    try {
      // Accept both "YYYY-MM-DDTHH:mm" and "YYYY-MM-DDTHH:mm:ss"
      const v = value.length === 16 ? `${value}:00` : value;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }, [value]);

  const time = parsed ? format(parsed, "HH:mm") : "";

  const buildValue = (date, hhmm) => {
    if (!date) return "";
    const [h, m] = (hhmm || "09:00").split(":").map((n) => parseInt(n, 10) || 0);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  const handleDateSelect = (date) => {
    if (!date) return;
    onChange(buildValue(date, time || "09:00"));
  };

  const handleTimeChange = (e) => {
    const next = e.target.value;
    if (!parsed) {
      // initialize date as today if user picks time first
      onChange(buildValue(new Date(), next));
    } else {
      onChange(buildValue(parsed, next));
    }
  };

  return (
    <div className={cn("flex gap-2", className)} data-testid={testId}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className={cn(
              "flex-1 justify-start text-left font-normal h-9",
              !parsed && "text-muted-foreground"
            )}
            data-testid={testId ? `${testId}-date-trigger` : undefined}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {parsed ? format(parsed, "dd/MM/yyyy", { locale: it }) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={parsed || undefined}
            onSelect={handleDateSelect}
            initialFocus
            locale={it}
          />
        </PopoverContent>
      </Popover>
      <div className="relative w-[110px]">
        <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="time"
          value={time}
          onChange={handleTimeChange}
          className="pl-7 h-9"
          data-testid={testId ? `${testId}-time-input` : undefined}
        />
      </div>
    </div>
  );
}

export default DateTimePicker;
