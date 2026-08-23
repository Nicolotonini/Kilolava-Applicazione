import React, { useState } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function AvailabilityDialog({ cleaner, onClose, onSaved }) {
  const av = cleaner.availability || {};
  const [available, setAvailable] = useState(av.available !== false);
  const [start, setStart] = useState(av.start_time || '08:30');
  const [end, setEnd] = useState(av.end_time || '16:30');
  const [maxHours, setMaxHours] = useState(av.max_hours || 8);
  const [notes, setNotes] = useState(av.notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/cleaning-board/cleaners/${cleaner.id}/availability`, {
        available, start_time: start, end_time: end, max_hours: parseFloat(maxHours) || 8, notes,
      });
      toast.success('Disponibilità aggiornata');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="availability-dialog">
        <DialogHeader>
          <DialogTitle>Disponibilità — {cleaner.name}</DialogTitle>
          <DialogDescription>
            {cleaner.consecutive_days > 0 ? `${cleaner.consecutive_days}° giorno consecutivo · ultimo riposo: ${cleaner.last_rest_day || '—'}` : 'Nessun giorno consecutivo in corso'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-between text-sm font-medium">
            Disponibile oggi
            <Switch checked={available} onCheckedChange={setAvailable} data-testid="availability-switch" />
          </label>
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
          <div>
            <p className="text-xs text-muted-foreground mb-1">Ore massime previste</p>
            <Input type="number" min={1} max={12} step={0.5} value={maxHours} onChange={e => setMaxHours(e.target.value)} className="h-9 w-24" data-testid="availability-max-hours" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Note operative</p>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} data-testid="availability-notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground" data-testid="availability-save-btn">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salva
            </Button>
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
