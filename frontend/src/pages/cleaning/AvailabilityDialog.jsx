import React, { useState } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AvailabilityDialog({ cleaner, date, role = 'cleaner', onClose, onSaved }) {
  const av = cleaner.availability || {};
  const [available, setAvailable] = useState(av.available !== false);
  const [start, setStart] = useState(av.start_time || '08:30');
  const [end, setEnd] = useState(av.end_time || '16:30');
  const [maxHours, setMaxHours] = useState(av.max_hours || 8);
  const [notes, setNotes] = useState(av.notes || av.note || '');
  const [vehicle, setVehicle] = useState(cleaner.vehicle || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/day-availability', {
        date, user_id: cleaner.id, role,
        available, day_off: !available,
        start_time: start, end_time: end, max_hours: parseFloat(maxHours) || 8, note: notes,
        ...(role === 'rider' ? { vehicle } : {}),
      });
      toast.success('Disponibilità del giorno aggiornata');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await api.delete('/day-availability', { params: { date, user_id: cleaner.id } });
      toast.success('Ripristinata la disponibilità standard');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="availability-dialog">
        <DialogHeader>
          <DialogTitle>Disponibilità del {date} — {cleaner.name}</DialogTitle>
          <DialogDescription>
            Vale solo per questa giornata: la disponibilità standard dell'utente non viene modificata.
            {cleaner.consecutive_days > 0 && ` · ${cleaner.consecutive_days}° giorno consecutivo`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-between text-sm font-medium">
            {available ? 'Disponibile' : 'Giorno libero / non disponibile'}
            <Switch checked={available} onCheckedChange={setAvailable} data-testid="availability-switch" />
          </label>
          {available && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Inizio</p>
                  <Input type="time" value={start} onChange={e => setStart(e.target.value)} className="h-9" data-testid="availability-start" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fine</p>
                  <Input type="time" value={end} onChange={e => setEnd(e.target.value)} className="h-9" data-testid="availability-end" />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ore massime indicative</p>
                  <Input type="number" min={1} max={12} step={0.5} value={maxHours} onChange={e => setMaxHours(e.target.value)} className="h-9 w-24" data-testid="availability-max-hours" />
                </div>
                {role === 'rider' && (
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Mezzo</p>
                    <Input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="es. furgone" className="h-9" data-testid="availability-vehicle" />
                  </div>
                )}
              </div>
            </>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Nota (es. ferie, malattia, permesso)</p>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="availability-notes" />
          </div>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={reset} disabled={saving} className="text-xs text-muted-foreground" data-testid="availability-reset-btn">
              Ripristina standard
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Annulla</Button>
              <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground" data-testid="availability-save-btn">
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salva per oggi
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BoardSettingsDialog({ threshold, onClose, onSaved }) {
  const [value, setValue] = useState(threshold);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/cleaning-board/settings', { rest_threshold_days: parseInt(value) || 5 });
      toast.success('Impostazioni salvate');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs" data-testid="board-settings-dialog">
        <DialogHeader>
          <DialogTitle>Impostazioni Board</DialogTitle>
          <DialogDescription>Soglia per l'alert "Valuta giorno di riposo" (informativo, non blocca).</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 text-sm">
          Dopo <Input type="number" min={1} max={14} value={value} onChange={e => setValue(e.target.value)} className="h-9 w-20" data-testid="rest-threshold-input" /> giorni consecutivi
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground" data-testid="board-settings-save-btn">Salva</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
