import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Sparkles, AlertTriangle, Loader2, MapPin } from 'lucide-react';
import { fmtMinutes } from './shared';
import { fmtDayLong } from './shared';

export function ProposalDialog({ proposal, onApply, onClose }) {
  const [applying, setApplying] = useState(false);
  const apply = async () => {
    setApplying(true);
    try { await onApply(); } finally { setApplying(false); }
  };
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto" data-testid="proposal-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Proposta Kilolava</DialogTitle>
          <DialogDescription className="capitalize">
            {fmtDayLong(proposal.date)} — bozza di organizzazione: il software propone, tu decidi.
          </DialogDescription>
        </DialogHeader>
        {proposal.assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="proposal-empty">
            Nessuna pulizia da assegnare in questa giornata.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {proposal.per_cleaner.map(pc => (
                <div key={pc.cleaner_id} className="rounded-lg border border-border px-3 py-2" data-testid={`proposal-cleaner-${pc.cleaner_id}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold uppercase">{pc.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{pc.count} pulizie · {fmtMinutes(pc.total_minutes)} / {fmtMinutes(pc.capacity_minutes)}</p>
                  </div>
                  {(pc.schedule || []).length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {pc.schedule.map(s => (
                        <div key={s.task_id} className="flex items-center gap-2 text-xs" data-testid={`proposal-slot-${s.task_id}`}>
                          <span className="font-mono font-semibold tabular-nums w-20 shrink-0">{s.start}–{s.end}</span>
                          <span className="min-w-0 truncate">
                            {s.klv_code && <span className="font-mono font-bold text-primary mr-1">{s.klv_code}</span>}
                            {s.structure_name}
                            {s.locked && <span className="text-muted-foreground"> (già assegnata)</span>}
                          </span>
                          {s.early_checkin && <span className="shrink-0 text-[11px] font-bold text-white bg-red-600 rounded px-1">CI ANT. {s.checkin_time}</span>}
                          {!s.early_checkin && s.checkin_time && <span className="shrink-0 text-amber-600 font-semibold">CI {s.checkin_time}</span>}
                          {s.travel_min > 0 && <span className="shrink-0 text-muted-foreground">🚗 {s.travel_min}′</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 flex-wrap">
                    <span>Lavoro <strong>{fmtMinutes(pc.total_minutes)}</strong></span>
                    {pc.travel_minutes != null && <span>· Spostamenti <strong>{fmtMinutes(pc.travel_minutes)}</strong></span>}
                    {pc.end_time && <span>· Fine prevista <strong>{pc.end_time}</strong></span>}
                    {pc.zones.length > 0 && <span className="flex items-center gap-0.5">· <MapPin className="h-3 w-3" />{pc.zones.join(' → ')}</span>}
                    {pc.consecutive_days > 0 && <span>· {pc.consecutive_days}° giorno consecutivo</span>}
                  </p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Assegnazioni proposte ({proposal.assignments.length})</p>
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {proposal.assignments.map(a => (
                  <div key={a.task_id} className="flex items-center justify-between text-xs rounded-lg bg-muted/40 px-2.5 py-1.5" data-testid={`proposal-item-${a.task_id}`}>
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.structure_name}</span>
                      {a.zone_name && <span className="text-muted-foreground"> · {a.zone_name}</span>}
                      {a.checkin_time && <span className="text-amber-600 font-medium"> · CI {a.checkin_time}</span>}
                    </span>
                    <span className="shrink-0 ml-2">→ <Badge className="text-xs border-0 bg-primary/10 text-primary">{a.cleaner_names.join(' + ')}</Badge> <span className="text-muted-foreground">~{fmtMinutes(a.predicted_duration_minutes)}</span></span>
                  </div>
                ))}
              </div>
            </div>
            {proposal.alerts.length > 0 && (
              <div className="space-y-1">
                {proposal.alerts.map((a, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5" data-testid={`proposal-alert-${i}`}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{a}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} data-testid="proposal-cancel-btn">Annulla</Button>
          {proposal.assignments.length > 0 && (
            <Button onClick={apply} disabled={applying} className="bg-primary text-primary-foreground" data-testid="proposal-apply-btn">
              {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Applica tutto
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
