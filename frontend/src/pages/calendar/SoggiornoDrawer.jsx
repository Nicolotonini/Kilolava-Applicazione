import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { eventsApi } from '../../lib/api';
import { DetailPanel } from './DetailPanel';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import { Sparkles, Bed, Package, AlertTriangle, Trash2, CheckCircle2, Minus, Plus } from 'lucide-react';
import { fmtEU } from './calendarHelpers';

function MiniStepper({ label, value, onChange, testId }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <p className="text-sm">{label}</p>
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onChange(Math.max(0, (value || 0) - 1))} data-testid={`${testId}-minus`}><Minus className="h-3.5 w-3.5" /></Button>
        <span className="w-6 text-center text-base font-bold tabular-nums" data-testid={`${testId}-value`}>{value || 0}</span>
        <Button type="button" variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={() => onChange((value || 0) + 1)} data-testid={`${testId}-plus`}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

const CLEANING_STATUS_IT = {
  unassigned: 'Da assegnare', assigned: 'Assegnata', in_progress: 'In corso',
  completed: 'Completata', done: 'Completata', cancelled: 'Annullata',
};

/**
 * Drawer rapido del soggiorno: info, preparazione letti, pulizia collegata, materiale, note.
 */
export const SoggiornoDrawer = ({ event, indicators, onClose, onChanged, onCreaPulizia }) => {
  const navigate = useNavigate();
  const [guests, setGuests] = useState(0);
  const [bd, setBd] = useState(0);
  const [bs, setBs] = useState(0);
  const [bsofa, setBsofa] = useState(0);
  const [notes, setNotes] = useState('');
  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!event) return;
    setGuests(event.guests_count || 0);
    setBd(event.beds_double || 0);
    setBs(event.beds_single || 0);
    setBsofa(event.beds_sofa || 0);
    setNotes(event.notes || '');
    setInTime(event.checkin_time || '');
    setOutTime(event.checkout_time || '');
    setStartDate((event.start_time || '').slice(0, 10));
    setEndDate((event.end_time || '').slice(0, 10));
  }, [event]);

  if (!event) return null;
  const isManual = !event.ical_uid;
  const cleaning = indicators?.cleaning || {};

  const dirty = guests !== (event.guests_count || 0) || bd !== (event.beds_double || 0)
    || bs !== (event.beds_single || 0) || bsofa !== (event.beds_sofa || 0)
    || notes !== (event.notes || '') || inTime !== (event.checkin_time || '') || outTime !== (event.checkout_time || '')
    || (isManual && (startDate !== (event.start_time || '').slice(0, 10) || endDate !== (event.end_time || '').slice(0, 10)));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        guests_count: guests || null, beds_double: bd, beds_single: bs, beds_sofa: bsofa,
        notes: notes || null, checkin_time: inTime || null, checkout_time: outTime || null,
      };
      if (isManual && startDate && endDate) {
        payload.start_time = startDate;
        payload.end_time = endDate;
      }
      await eventsApi.update(event.id, payload);
      toast.success('Soggiorno aggiornato');
      onChanged();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const dismissAlert = async () => {
    try {
      await eventsApi.update(event.id, { clear_dates_alert: true });
      toast.success('Alert verificato');
      onChanged();
    } catch { toast.error('Errore'); }
  };

  const handleDelete = async () => {
    try {
      await eventsApi.delete(event.id);
      toast.success('Soggiorno eliminato');
      setDeleteOpen(false);
      onClose();
      onChanged();
    } catch { toast.error('Errore'); }
  };

  return (
    <DetailPanel open onClose={onClose} title="Soggiorno">
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-5 space-y-5" data-testid="soggiorno-drawer">
          {/* Alert date modificate / cancellazione feed */}
          {(event.dates_changed || event.feed_cancelled) && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-1.5" data-testid="dates-changed-alert">
              <p className="text-sm font-bold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                {event.feed_cancelled ? 'Prenotazione cancellata dal feed iCal' : 'Date soggiorno modificate'}
              </p>
              {event.dates_changed && (
                <p className="text-xs text-orange-700 dark:text-orange-300">
                  Da {fmtEU(event.dates_changed.old_start)} → {fmtEU(event.dates_changed.old_end)} a {fmtEU(event.dates_changed.new_start)} → {fmtEU(event.dates_changed.new_end)}.
                  Controlla le Pulizie già organizzate.
                </p>
              )}
              {event.feed_cancelled && (
                <p className="text-xs text-orange-700 dark:text-orange-300">I dati operativi Kilolava sono stati conservati. Verifica la pulizia collegata.</p>
              )}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={dismissAlert} data-testid="dismiss-dates-alert">
                <CheckCircle2 className="h-3 w-3" />OK, verificato
              </Button>
            </div>
          )}

          {/* Soggiorno */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Soggiorno</p>
            <p className="text-sm font-semibold mb-2">{event.structure_name}{event.unit_name ? ` / ${event.unit_name}` : ''}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-xs text-muted-foreground uppercase">IN</p>
                {isManual ? (
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8 mt-1" data-testid="soggiorno-in-date" />
                ) : (
                  <p className="text-sm font-bold">{fmtEU(event.start_time)}</p>
                )}
                <Input type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} className="h-8 mt-1" data-testid="soggiorno-in-time" />
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="text-xs text-muted-foreground uppercase">OUT</p>
                {isManual ? (
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8 mt-1" data-testid="soggiorno-out-date" />
                ) : (
                  <p className="text-sm font-bold">{fmtEU(event.end_time)}</p>
                )}
                <Input type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} className="h-8 mt-1" data-testid="soggiorno-out-time" />
              </div>
            </div>
          </div>

          {/* Preparazione */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Preparazione</p>
            <MiniStepper label="Persone" value={guests} onChange={setGuests} testId="sog-guests" />
            <MiniStepper label="Matrimoniali" value={bd} onChange={setBd} testId="sog-double" />
            <MiniStepper label="Singoli" value={bs} onChange={setBs} testId="sog-single" />
            <MiniStepper label="Divani letto" value={bsofa} onChange={setBsofa} testId="sog-sofa" />
          </div>

          {/* Pulizia */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pulizia</p>
            {cleaning.task_id ? (
              <div className="rounded-lg border border-border p-3 space-y-1" data-testid="soggiorno-cleaning-info">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-medium">{fmtEU(cleaning.date)}{cleaning.time ? ` · ${cleaning.time}` : ''}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted font-medium">{CLEANING_STATUS_IT[cleaning.status] || cleaning.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cleaning.cleaners?.length ? `Operatrici: ${cleaning.cleaners.join(', ')}` : 'Nessuna operatrice assegnata'}
                </p>
                <Button size="sm" className="h-8 mt-1 w-full" onClick={() => navigate(`/cleaning/task/${cleaning.task_id}`)} data-testid="apri-pulizia-btn">
                  Apri Pulizia
                </Button>
              </div>
            ) : (
              <Button size="sm" className="h-9 w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onCreaPulizia(event, { guests, bd, bs, bsofa })} data-testid="crea-pulizia-btn">
                <Sparkles className="h-4 w-4" />Crea Pulizia
              </Button>
            )}
          </div>

          {/* Materiale */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Materiale</p>
            <div className="flex items-center justify-between text-sm rounded-lg border border-border px-3 py-2" data-testid="soggiorno-linen">
              <span className="flex items-center gap-2"><Bed className="h-4 w-4 text-muted-foreground" />Lavanderia / biancheria</span>
              {indicators?.linen_gap
                ? <span className="text-amber-600 font-semibold text-xs">⚠ Fabbisogno non coperto</span>
                : <span className="text-emerald-600 font-semibold text-xs">✓ Ok</span>}
            </div>
            <div className="flex items-center justify-between text-sm rounded-lg border border-border px-3 py-2" data-testid="soggiorno-supplies">
              <span className="flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />Forniture / consumabili</span>
              {indicators?.supplies_gap
                ? <span className="text-amber-600 font-semibold text-xs">⚠ Reintegro richiesto</span>
                : <span className="text-emerald-600 font-semibold text-xs">✓ Ok</span>}
            </div>
            {indicators?.maintenance_open && (
              <div className="flex items-center justify-between text-sm rounded-lg border border-red-200 px-3 py-2 bg-red-50 dark:bg-red-950/30">
                <span className="text-red-600 font-medium text-xs">🔧 Intervento manutenzione aperto per questa struttura</span>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Note operative</p>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="resize-none" placeholder="Note per questo soggiorno..." data-testid="soggiorno-notes" />
          </div>

          {isManual && (
            <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => setDeleteOpen(true)} data-testid="delete-soggiorno-btn">
              <Trash2 className="h-4 w-4" />Elimina soggiorno
            </Button>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <Button className="w-full h-10" onClick={save} disabled={saving || !dirty} data-testid="soggiorno-save-btn">
            {saving ? 'Salvataggio...' : 'Salva modifiche'}
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il soggiorno?</AlertDialogTitle>
            <AlertDialogDescription>L'eventuale pulizia collegata NON verrà eliminata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" data-testid="confirm-delete-soggiorno">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DetailPanel>
  );
};

export default SoggiornoDrawer;
