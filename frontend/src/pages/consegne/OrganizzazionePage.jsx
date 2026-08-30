import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import api from '../../lib/api';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle, GripVertical, MapPin, Truck, X, Clock, Sparkles, Loader2, Route } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DaySelector, FERMATA_STATUS, KIND_TONES, todayRome } from './shared';
import { DayStaffStrip } from '../../components/kilolava/DayStaffStrip';
import { AvailabilityDialog } from '../cleaning/AvailabilityDialog';

const OVERLOAD_THRESHOLD = 8;
const RIDER_COLORS = ['#2563eb', '#d97706', '#0d9488', '#7c3aed', '#db2777', '#65a30d'];

function FermataChip({ f, draggable, onDragStart, onRemoveRider, onClick, showHandle }) {
  const st = FERMATA_STATUS[f.status] || FERMATA_STATUS.unassigned;
  return (
    <div draggable={draggable} onDragStart={onDragStart} onClick={onClick}
      className={cn('rounded-lg border border-border bg-card p-2.5 text-sm cursor-pointer hover:border-primary/40 transition-colors',
        draggable && 'active:cursor-grabbing')}
      data-testid={`fermata-chip-${f.id}`}>
      <div className="flex items-center gap-1.5">
        {showHandle && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
        <span className="font-semibold truncate flex-1 min-w-0">
          {f.klv_code && <span className="font-mono text-xs font-bold text-primary mr-1">{f.klv_code}</span>}
          {f.destination}
        </span>
        {onRemoveRider && f.status !== 'completed' && (
          <button onClick={(e) => { e.stopPropagation(); onRemoveRider(f.id); }}
            className="text-muted-foreground hover:text-destructive shrink-0" title="Rimuovi dal rider"
            data-testid={`fermata-unassign-${f.id}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <StatusBadge tone={st.tone} className="!py-0.5">{st.label}</StatusBadge>
        {(f.lines || []).map((l, i) => (
          <StatusBadge key={i} tone={KIND_TONES[l.category] || 'cancelled'} className="!py-0.5">{l.category_label}</StatusBadge>
        ))}
        {f.time_window_start && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />{f.time_window_start}{f.time_window_end ? `–${f.time_window_end}` : ''}</span>
        )}
        {!f.time_window_start && f.time_window_end && (
          <span className="text-xs font-semibold text-amber-700 flex items-center gap-0.5"><Clock className="h-3 w-3" />entro {f.time_window_end}</span>
        )}
        {f.planned_eta && <span className="text-xs text-muted-foreground">ETA {f.planned_eta}</span>}
      </div>
    </div>
  );
}

function GiriProposalDialog({ proposal, onClose, onConfirmed }) {
  const [saving, setSaving] = useState(false);
  const conferma = async () => {
    setSaving(true);
    try {
      const assignments = proposal.riders.flatMap(r => r.stops.map((s, i) => ({
        fermata_id: s.fermata_id, rider_id: r.rider_id, route_order: i + 1, eta: s.eta,
      })));
      const res = await api.post('/consegne/giri/conferma', { date: proposal.date, assignments });
      toast.success(`Giri confermati: ${res.data.applied} fermate assegnate a ${res.data.riders} rider`);
      onConfirmed();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };
  const totalStops = proposal.riders.reduce((s, r) => s + r.stops.length, 0);
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto" data-testid="giri-proposal-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Proposta giri — {proposal.date}</DialogTitle>
          <DialogDescription>Il software propone, tu decidi: puoi modificare tutto dopo la conferma (drag &amp; drop).</DialogDescription>
        </DialogHeader>
        {totalStops === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="giri-proposal-empty">Nessuna fermata da pianificare in questa giornata.</p>
        ) : (
          <div className="space-y-3">
            {proposal.riders.filter(r => r.stops.length > 0).map(r => (
              <div key={r.rider_id} className="rounded-lg border border-border px-3 py-2" data-testid={`giro-rider-${r.rider_id}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold uppercase">{r.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{r.stops.length} fermate · {r.km_total} km · {r.travel_min_total}′ viaggio</p>
                </div>
                <p className="text-xs text-muted-foreground">Partenza {r.start_time} · Sede Kilolava{r.end_time ? ` → rientro previsto ${r.end_time}` : ''}</p>
                <div className="mt-1 space-y-0.5">
                  {r.stops.map((s, i) => (
                    <div key={s.fermata_id} className="flex items-center gap-2 text-xs" data-testid={`giro-stop-${s.fermata_id}`}>
                      <span className="w-4 h-4 rounded-full bg-muted font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="font-mono font-semibold tabular-nums w-11 shrink-0">{s.eta}</span>
                      <span className="min-w-0 truncate">
                        {s.klv_code && <span className="font-mono font-bold text-primary mr-1">{s.klv_code}</span>}{s.destination}
                      </span>
                      {s.time_window_end && <span className="shrink-0 text-amber-600 font-semibold">entro {s.time_window_end}</span>}
                      <span className="shrink-0 text-muted-foreground">{s.km} km · {s.travel_min}′</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {proposal.unassigned.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5" data-testid="giri-unassigned">
                {proposal.unassigned.length} fermate non pianificabili: {proposal.unassigned.map(u => u.destination).join(', ')}
              </p>
            )}
            {(proposal.alerts || []).map((a, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5" data-testid={`giri-alert-${i}`}>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{a}
              </p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="giri-cancel-btn">Annulla</Button>
          {totalStops > 0 && (
            <Button onClick={conferma} disabled={saving} className="bg-primary text-primary-foreground" data-testid="giri-confirm-btn">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Conferma giri
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GiroMap({ sede, fermate, byRider, riderColor, onOpenFermata }) {
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.REACT_APP_GOOGLE_MAP_ID;
  const orderMap = useMemo(() => {
    const m = {};
    Object.entries(byRider).forEach(([rid, list]) => list.forEach((f, i) => { m[f.id] = { n: i + 1, rid }; }));
    return m;
  }, [byRider]);
  const located = fermate.filter(f => f.latitude != null && f.status !== 'cancelled');
  if (!apiKey) return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Chiave Google Maps non configurata</div>;
  return (
    <APIProvider apiKey={apiKey}>
      <Map style={{ width: '100%', height: '100%' }}
        defaultCenter={sede?.latitude ? { lat: sede.latitude, lng: sede.longitude } : { lat: 45.6495, lng: 13.7768 }}
        defaultZoom={13} mapId={mapId || undefined} gestureHandling="greedy" disableDefaultUI zoomControl>
        {sede?.latitude && (
          <AdvancedMarker position={{ lat: sede.latitude, lng: sede.longitude }} title={sede.address}>
            <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white" data-testid="map-sede-marker">KLV</div>
          </AdvancedMarker>
        )}
        {located.map(f => {
          const ord = orderMap[f.id];
          const color = ord ? riderColor(ord.rid) : '#9ca3af';
          return (
            <AdvancedMarker key={f.id} position={{ lat: f.latitude, lng: f.longitude }} onClick={() => onOpenFermata(f)}>
              <div className="flex flex-col items-center" data-testid={`map-fermata-${f.id}`}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white"
                  style={{ backgroundColor: f.status === 'completed' ? '#10b981' : color }}>
                  {ord ? ord.n : '•'}
                </div>
                <span className="hidden sm:block mt-0.5 px-1 py-px rounded bg-white/95 text-gray-900 text-xs font-semibold shadow whitespace-nowrap border border-black/10">
                  {f.klv_code || f.destination}
                </span>
              </div>
            </AdvancedMarker>
          );
        })}
      </Map>
    </APIProvider>
  );
}

export default function OrganizzazionePage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayRome());
  const [fermate, setFermate] = useState([]);
  const [dayRiders, setDayRiders] = useState([]);
  const [sede, setSede] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [availRider, setAvailRider] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [proposing, setProposing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/consegne/fermate', { params: { date } }),
      api.get('/day-availability', { params: { date, role: 'rider' } }),
    ]).then(([f, r]) => { setFermate(f.data); setDayRiders(r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/impostazioni-operative').then(r => setSede({ address: r.data.sede_address, latitude: r.data.sede_lat, longitude: r.data.sede_lng })).catch(() => {}); }, []);

  const riders = useMemo(() => dayRiders.filter(r => r.availability?.available !== false), [dayRiders]);
  const riderColor = useCallback((rid) => RIDER_COLORS[Math.max(0, dayRiders.findIndex(r => r.id === rid)) % RIDER_COLORS.length], [dayRiders]);

  const unassigned = useMemo(() => fermate.filter((f) => !f.rider_id && f.status !== 'cancelled'), [fermate]);
  const byRider = useMemo(() => {
    const m = {};
    fermate.filter((f) => f.rider_id && f.status !== 'cancelled').forEach((f) => {
      (m[f.rider_id] = m[f.rider_id] || []).push(f);
    });
    Object.values(m).forEach((arr) => arr.sort((a, b) => (a.route_order || 0) - (b.route_order || 0)));
    return m;
  }, [fermate]);

  const assign = async (fermataId, riderId) => {
    try {
      await api.put(`/consegne/fermate/${fermataId}`, { rider_id: riderId });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const dropOnRider = async (riderId, beforeId) => {
    if (!dragId) return;
    const f = fermate.find((x) => x.id === dragId);
    setDragId(null);
    if (!f) return;
    if (f.rider_id !== riderId) await assign(dragId, riderId);
    const list = (byRider[riderId] || []).filter((x) => x.id !== dragId).map((x) => x.id);
    const idx = beforeId ? list.indexOf(beforeId) : list.length;
    list.splice(idx === -1 ? list.length : idx, 0, dragId);
    try {
      await api.put('/consegne/fermate/route-order', { rider_id: riderId, date, ordered_ids: list });
      load();
    } catch (e) { toast.error('Errore riordino'); }
  };

  const dropOnUnassigned = async () => {
    if (!dragId) return;
    const f = fermate.find((x) => x.id === dragId);
    setDragId(null);
    if (f?.rider_id) await assign(f.id, null);
  };

  const proponi = async () => {
    setProposing(true);
    try {
      const r = await api.post('/consegne/giri/proponi', { date });
      setProposal(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setProposing(false); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="organizzazione-page">
      <PageHeader
        title="Organizzazione giro"
        subtitle="Qui decidi CHI consegna, in che ORDINE e con quale PERCORSO. Le consegne sono già state definite e confermate."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DaySelector date={date} onChange={setDate} testId="org-day-selector" />
            <Button onClick={proponi} disabled={proposing} className="h-9 gap-1.5 bg-primary text-primary-foreground" data-testid="proponi-giri-btn">
              {proposing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}Proponi giri
            </Button>
          </div>
        }
      />

      <DayStaffStrip title="Rider del giorno" people={dayRiders} onEdit={setAvailRider} testPrefix="giro-rider" />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          {/* SINISTRA: fermate non assegnate + rider */}
          <div className="w-full xl:w-[380px] shrink-0 space-y-3 xl:max-h-[calc(100vh-320px)] xl:overflow-y-auto xl:pr-1">
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2"
              onDragOver={(e) => e.preventDefault()} onDrop={dropOnUnassigned} data-testid="col-da-assegnare">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pronte per il giro ({unassigned.length})</p>
              {unassigned.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">Nessuna fermata da assegnare per questa giornata</p>
              ) : (
                unassigned.map((f) => (
                  <div key={f.id}>
                    <FermataChip f={f} draggable onDragStart={() => setDragId(f.id)} onClick={() => navigate(`/consegne/fermata/${f.id}`)} />
                    <div className="xl:hidden mt-1">
                      <Select onValueChange={(v) => assign(f.id, v)}>
                        <SelectTrigger className="h-8 text-xs" data-testid={`mobile-assign-${f.id}`}><SelectValue placeholder="Assegna a rider..." /></SelectTrigger>
                        <SelectContent>
                          {riders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))
              )}
            </div>

            {riders.length === 0 ? (
              <EmptyState icon={Truck} message="Nessun rider disponibile oggi. Controlla le disponibilità qui sopra." />
            ) : (
              riders.map((r) => {
                const list = byRider[r.id] || [];
                const overload = list.length > OVERLOAD_THRESHOLD;
                return (
                  <div key={r.id}
                    className={cn('rounded-xl border bg-card p-3 space-y-2', overload ? 'border-amber-400' : 'border-border')}
                    onDragOver={(e) => e.preventDefault()} onDrop={() => dropOnRider(r.id, null)}
                    data-testid={`rider-col-${r.id}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold shrink-0" style={{ backgroundColor: riderColor(r.id) }}>
                        {r.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {list.length} fermate · {r.availability?.start_time || '—'}–{r.availability?.end_time || '—'}{r.vehicle ? ` · ${r.vehicle}` : ''}
                        </p>
                      </div>
                    </div>
                    {overload && (
                      <p className="text-xs text-amber-600 font-medium flex items-center gap-1" data-testid={`overload-warning-${r.id}`}>
                        <AlertTriangle className="h-3.5 w-3.5" />Sovraccarico: più di {OVERLOAD_THRESHOLD} fermate (non bloccante)
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {list.map((f) => (
                        <div key={f.id}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => { e.stopPropagation(); dropOnRider(r.id, f.id); }}
                          className="flex items-start gap-1.5">
                          <span className="w-5 h-5 mt-2 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0" style={{ backgroundColor: riderColor(r.id) }}>
                            {(byRider[r.id] || []).indexOf(f) + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <FermataChip f={f} draggable showHandle
                              onDragStart={() => setDragId(f.id)}
                              onRemoveRider={(id) => assign(id, null)}
                              onClick={() => navigate(`/consegne/fermata/${f.id}`)} />
                          </div>
                        </div>
                      ))}
                      {list.length === 0 && (
                        <p className="text-xs text-muted-foreground/60 text-center py-4 border border-dashed border-border rounded-lg">
                          Trascina qui una fermata
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* DESTRA: MAPPA GRANDE */}
          <div className="flex-1 w-full rounded-xl border border-border overflow-hidden h-[420px] xl:h-[calc(100vh-320px)] xl:sticky xl:top-4 relative" data-testid="giro-map">
            <GiroMap sede={sede} fermate={fermate} byRider={byRider} riderColor={riderColor} onOpenFermata={(f) => navigate(`/consegne/fermata/${f.id}`)} />
            {fermate.filter(f => f.status !== 'cancelled').length === 0 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/95 border border-border rounded-full px-4 py-1.5 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">Nessuna fermata per questa giornata</p>
              </div>
            )}
          </div>
        </div>
      )}

      {availRider && <AvailabilityDialog cleaner={availRider} date={date} role="rider" onClose={() => setAvailRider(null)} onSaved={() => { setAvailRider(null); load(); }} />}
      {proposal && <GiriProposalDialog proposal={proposal} onClose={() => setProposal(null)} onConfirmed={() => { setProposal(null); load(); }} />}
    </div>
  );
}
