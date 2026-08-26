import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { Card, CardContent } from '../../components/ui/card';
import { Truck, MapPin, Clock, ChevronRight } from 'lucide-react';
import { DaySelector, FERMATA_STATUS, KIND_TONES, todayRome } from './shared';

export default function ConsegneOggiPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayRome());
  const [fermate, setFermate] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/consegne/fermate', { params: { date } })
      .then((r) => setFermate(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const active = fermate.filter((f) => f.status !== 'cancelled');
    const m = new Map();
    active.forEach((f) => {
      const key = f.rider_id || '_none';
      if (!m.has(key)) m.set(key, { rider_id: f.rider_id, rider_name: f.rider_name || 'Non assegnate', list: [] });
      m.get(key).list.push(f);
    });
    const arr = [...m.values()];
    arr.forEach((g) => g.list.sort((a, b) => (a.route_order || 0) - (b.route_order || 0)));
    arr.sort((a, b) => (a.rider_id ? 0 : 1) - (b.rider_id ? 0 : 1) || (a.rider_name || '').localeCompare(b.rider_name || ''));
    return arr;
  }, [fermate]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl" data-testid="consegne-oggi-page">
      <PageHeader
        title="Consegne del giorno"
        subtitle="Avanzamento dei giri per rider"
        actions={<DaySelector date={date} onChange={setDate} testId="oggi-day-selector" />}
      />

      {loading ? (
        <ListSkeleton rows={5} />
      ) : groups.length === 0 ? (
        <EmptyState icon={Truck} message="Nessuna fermata programmata per questa giornata" testId="oggi-empty" />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const done = g.list.filter((f) => f.status === 'completed').length;
            return (
              <div key={g.rider_id || 'none'} className="space-y-2" data-testid={`oggi-rider-${g.rider_id || 'none'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{g.rider_name}</p>
                  <span className="text-xs text-muted-foreground tabular-nums">{done}/{g.list.length} completate</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${g.list.length ? (done / g.list.length) * 100 : 0}%` }} />
                </div>
                <div className="space-y-1.5">
                  {g.list.map((f, idx) => {
                    const st = FERMATA_STATUS[f.status] || FERMATA_STATUS.unassigned;
                    return (
                      <Card
                        key={f.id}
                        className="border shadow-none cursor-pointer hover:border-primary/40 transition-colors"
                        onClick={() => navigate(`/consegne/fermata/${f.id}`)}
                        data-testid={`oggi-fermata-${f.id}`}
                      >
                        <CardContent className="p-3 flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-muted text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold truncate">{f.destination}</span>
                              <StatusBadge tone={st.tone} className="!py-0.5">{st.label}</StatusBadge>
                              {(f.lines || []).map((l, i) => (
                                <StatusBadge key={i} tone={KIND_TONES[l.category] || 'cancelled'} className="!py-0.5">{l.category_label}</StatusBadge>
                              ))}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              {f.address && <span className="flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{f.address}</span></span>}
                              {f.time_window_start && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{f.time_window_start}{f.time_window_end ? `–${f.time_window_end}` : ''}</span>}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
