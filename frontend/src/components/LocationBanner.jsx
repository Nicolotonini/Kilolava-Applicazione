import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { MapPin, Play, Square } from 'lucide-react';
import { cn } from '../lib/utils';
import { startLocation, stopLocation, subscribeLocation, resumeLocationIfActive } from '../services/locationService';

// Stato localizzazione condiviso (alimentato dal LocationService centralizzato)
export function useLocationState() {
  const [st, setSt] = useState({ active: false });
  useEffect(() => subscribeLocation(setSt), []);
  return st;
}

// Blocco operativo: le azioni di servizio richiedono localizzazione attiva
export function LocationRequiredDialog({ open, onClose, sessionType }) {
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const activate = async () => {
    setBusy(true);
    try {
      await startLocation(sessionType);
      toast.success('Localizzazione attivata: ora puoi continuare');
      onClose();
    } catch (e) {
      toast.error(e.message || e.response?.data?.detail || 'Attivazione localizzazione fallita');
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="location-required-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Localizzazione richiesta</DialogTitle>
          <DialogDescription>
            Per utilizzare Kilolava durante il servizio è necessario attivare la localizzazione.
            La posizione è condivisa solo durante il lavoro e si interrompe a fine servizio.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="location-required-cancel">Annulla</Button>
          <Button onClick={activate} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="location-required-activate">
            {busy ? 'Attivazione...' : 'Attiva localizzazione'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Banner attivazione localizzazione lavoro (Operatrice/Rider/Manutentore).
 * Mostra sempre all'utente quando la localizzazione è attiva.
 */
export function LocationBanner({ sessionType, startLabel, stopLabel }) {
  const [st, setSt] = useState({ active: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    resumeLocationIfActive();
    return subscribeLocation(setSt);
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (st.active) {
        await stopLocation();
        toast.success('Localizzazione disattivata');
      } else {
        await startLocation(sessionType);
        toast.success('Localizzazione attiva per la durata del lavoro');
      }
    } catch (e) {
      toast.error(e.message || e.response?.data?.detail || 'Errore');
    } finally { setBusy(false); }
  };

  return (
    <div
      className={cn('flex items-center justify-between gap-2 px-4 py-2 border-b',
        st.active ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-muted/40 border-border')}
      data-testid="location-banner"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn('relative flex h-2.5 w-2.5 shrink-0')}>
          {st.active && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
          <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', st.active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        </span>
        <p className="text-xs font-medium truncate" data-testid="location-status-text">
          {st.active ? 'Posizione condivisa (solo durante il lavoro)' : 'Posizione non condivisa'}
          {st.error && <span className="text-red-600 ml-1">— {st.error}</span>}
        </p>
      </div>
      <Button
        size="sm"
        variant={st.active ? 'outline' : 'default'}
        className={cn('h-8 gap-1.5 text-xs shrink-0', !st.active && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
        onClick={toggle}
        disabled={busy}
        data-testid="location-toggle-btn"
      >
        {st.active ? <><Square className="h-3.5 w-3.5" />{stopLabel}</> : <><Play className="h-3.5 w-3.5" />{startLabel}</>}
      </Button>
    </div>
  );
}

export const LocationDot = MapPin;
