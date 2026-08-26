import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { AlertTriangle, GripVertical, MapPin, Truck, X, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DaySelector, FERMATA_STATUS, KIND_TONES, todayRome } from './shared';

const OVERLOAD_THRESHOLD = 8;

function FermataChip({ f, draggable, onDragStart, onRemoveRider, onClick, showHandle }) {
  const st = FERMATA_STATUS[f.status] || FERMATA_STATUS.unassigned;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'rounded-lg border border-border bg-card p-2.5 text-sm cursor-pointer hover:border-primary/40 transition-colors',
        draggable && 'active:cursor-grabbing'
      )}
      data-testid={`fermata-chip-${f.id}`}
    >
      <div className="flex items-center gap-1.5">
        {showHandle && <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
        <span className="font-semibold truncate flex-1 min-w-0">{f.destination}</span>
        {onRemoveRider && f.status !== 'completed' && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveRider(f.id); }}
            className="text-muted-foreground hover:text-destructive shrink-0"
            title="Rimuovi dal rider"
            data-testid={`fermata-unassign-${f.id}`}
          >
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
          <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />{f.time_window_start}</span>
        )}
      </div>
    </div>
  );
}

export default function OrganizzazionePage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayRome());
  const [fermate, setFermate] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/consegne/fermate', { params: { date } })
      .then((r) => setFermate(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/logistics/riders').then((r) => setRiders(r.data.filter((x) => x.is_active !== false))).catch(() => {}); }, []);

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
    // riordino: costruisci nuovo ordine
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

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="organizzazione-page">
      <PageHeader
        title="Organizzazione consegne"
        subtitle="Trascina le fermate sui rider e ordina il giro. Il sovraccarico avvisa, non blocca."
        actions={<DaySelector date={date} onChange={setDate} testId="org-day-selector" />}
      />

      {loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {/* Colonna sticky: fermate da assegnare */}
          <div
            className="w-full lg:w-72 shrink-0 lg:sticky lg:top-4 rounded-xl border border-border bg-muted/30 p-3 space-y-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={dropOnUnassigned}
            data-testid="col-da-assegnare"
          >
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Da assegnare ({unassigned.length})
            </p>
            {unassigned.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">Nessuna fermata da assegnare per questa giornata</p>
            ) : (
              unassigned.map((f) => (
                <div key={f.id}>
                  <FermataChip
                    f={f}
                    draggable
                    onDragStart={() => setDragId(f.id)}
                    onClick={() => navigate(`/consegne/fermata/${f.id}`)}
                  />
                  {/* Mobile: assegna senza drag */}
                  <div className="lg:hidden mt-1">
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

          {/* Rider / Giri */}
          <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {riders.length === 0 ? (
              <EmptyState icon={Truck} message="Nessun rider attivo. Crea i rider in Utenti & Ruoli." className="col-span-full" />
            ) : (
              riders.map((r) => {
                const list = byRider[r.id] || [];
                const overload = list.length > OVERLOAD_THRESHOLD;
                return (
                  <div
                    key={r.id}
                    className={cn('rounded-xl border bg-card p-3 space-y-2 min-h-[140px]', overload ? 'border-amber-400' : 'border-border')}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => dropOnRider(r.id, null)}
                    data-testid={`rider-col-${r.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                        {r.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{list.length} fermate · giro in ordine</p>
                      </div>
                    </div>
                    {overload && (
                      <p className="text-xs text-amber-600 font-medium flex items-center gap-1" data-testid={`overload-warning-${r.id}`}>
                        <AlertTriangle className="h-3.5 w-3.5" />Sovraccarico: più di {OVERLOAD_THRESHOLD} fermate (non bloccante)
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {list.map((f, idx) => (
                        <div
                          key={f.id}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => { e.stopPropagation(); dropOnRider(r.id, f.id); }}
                          className="flex items-start gap-1.5"
                        >
                          <span className="w-5 h-5 mt-2 rounded-full bg-muted text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <FermataChip
                              f={f}
                              draggable
                              showHandle
                              onDragStart={() => setDragId(f.id)}
                              onRemoveRider={(id) => assign(id, null)}
                              onClick={() => navigate(`/consegne/fermata/${f.id}`)}
                            />
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
        </div>
      )}

      {!loading && fermate.length === 0 && (
        <EmptyState
          icon={MapPin}
          message="Nessuna fermata per questa giornata. Creale da 'Da organizzare'."
          action={<Button size="sm" onClick={() => navigate('/consegne/da-organizzare')} data-testid="goto-da-organizzare-empty">Vai a Da organizzare</Button>}
        />
      )}
    </div>
  );
}
