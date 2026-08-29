import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import {
  MapPin, Sparkles, Truck, Wrench, PanelLeftClose, PanelLeftOpen,
  Crosshair, ExternalLink, User, Battery, X, Route,
} from 'lucide-react';

const ROLE_META = {
  cleaner: { label: 'Operatrice', color: '#F24E75', Icon: Sparkles },
  rider: { label: 'Rider', color: '#2563eb', Icon: Truck },
  maintenance: { label: 'Manutentore', color: '#f59e0b', Icon: Wrench },
};

const FRESHNESS = {
  live: { dot: 'bg-emerald-500', label: (s) => (s < 60 ? `${s} sec fa` : `${Math.round(s / 60)} min fa`), text: 'text-emerald-600' },
  stale: { dot: 'bg-orange-500', label: (s) => `${Math.round(s / 60)} min fa`, text: 'text-orange-600' },
  offline: { dot: 'bg-muted-foreground/40', label: () => 'Offline', text: 'text-muted-foreground' },
};

const FILTERS = [
  { key: 'all', label: 'Tutti' },
  { key: 'cleaner', label: 'Operatrici' },
  { key: 'rider', label: 'Rider' },
  { key: 'maintenance', label: 'Manutentori' },
  { key: 'online', label: 'Online' },
  { key: 'offline', label: 'Offline' },
];

function FitBounds({ people, giro }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !window.google) return;
    const pts = [
      ...people.filter((p) => p.latitude != null),
      ...(giro || []).filter((f) => f.latitude != null),
    ];
    if (pts.length === 0) return;
    if (pts.length === 1) {
      map.setCenter({ lat: pts[0].latitude, lng: pts[0].longitude });
      map.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    pts.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    map.fitBounds(bounds, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, people.length, (giro || []).length]);
  return null;
}

function CenterOn({ target }) {
  const map = useMap();
  useEffect(() => {
    if (map && target && target.latitude != null) {
      map.panTo({ lat: target.latitude, lng: target.longitude });
      map.setZoom(16);
    }
  }, [map, target]);
  return null;
}

function freshnessInfo(p) {
  return FRESHNESS[p.freshness] || FRESHNESS.offline;
}

export default function MappaOperativaPage() {
  const navigate = useNavigate();
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const [people, setPeople] = useState([]);
  const [filter, setFilter] = useState('all');
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState(null);
  const [centerTarget, setCenterTarget] = useState(null);
  const [giro, setGiro] = useState(null); // fermate del rider selezionato

  const load = useCallback(() => {
    api.get('/mappa/personale').then((r) => {
      setPeople(r.data);
      setSelected((prev) => prev ? r.data.find((p) => p.user_id === prev.user_id) || prev : prev);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => people.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'online') return p.freshness === 'live' || p.freshness === 'stale';
    if (filter === 'offline') return p.freshness === 'offline';
    return p.role === filter;
  }), [people, filter]);

  const located = filtered.filter((p) => p.latitude != null && p.active);

  const selectPerson = async (p) => {
    setSelected(p);
    setGiro(null);
    if (p.latitude != null) setCenterTarget({ ...p });
    if (p.role === 'rider') {
      try { const r = await api.get(`/mappa/giro/${p.user_id}`); setGiro(r.data); } catch { setGiro(null); }
    }
  };

  const openActivity = (act) => {
    if (!act) return;
    if (act.type === 'cleaning') navigate(`/cleaning/task/${act.id}`);
    else if (act.type === 'fermata') navigate(`/consegne/fermata/${act.id}`);
    else if (act.type === 'maintenance') navigate(`/maintenance/issue/${act.id}`);
  };

  if (!apiKey) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-border p-8 text-center max-w-md mx-auto">
          <MapPin className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-semibold">Chiave Google Maps non configurata</p>
          <p className="text-sm text-muted-foreground mt-1">Aggiungi REACT_APP_GOOGLE_MAPS_API_KEY per attivare la Mappa Operativa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="mappa-operativa-page">
      <div className="px-4 lg:px-6 py-3 border-b border-border bg-card flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-heading font-semibold">Mappa Operativa</h1>
          <p className="text-xs text-muted-foreground">Personale in servizio — posizione attiva solo durante il lavoro</p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn('text-xs px-2.5 py-1.5 rounded-full font-medium border transition-colors',
                filter === f.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
              data-testid={`map-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Pannello sinistro richiudibile */}
        <div className={cn('border-r border-border bg-card flex flex-col transition-all duration-200 overflow-hidden',
          panelOpen ? 'w-72' : 'w-0')} data-testid="map-side-panel">
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center">Nessun operatore con questo filtro</p>
            )}
            {filtered.map((p) => {
              const meta = ROLE_META[p.role] || ROLE_META.cleaner;
              const fr = freshnessInfo(p);
              return (
                <button
                  key={p.user_id}
                  onClick={() => selectPerson(p)}
                  className={cn('w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors',
                    selected?.user_id === p.user_id && 'bg-primary/5')}
                  data-testid={`map-person-${p.user_id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', fr.dot)} />
                    <span className="text-sm font-semibold truncate flex-1">{p.name}</span>
                    <meta.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
                  </div>
                  <div className="flex items-center justify-between mt-0.5 ml-4">
                    <span className="text-xs text-muted-foreground">{meta.label}</span>
                    <span className={cn('text-xs font-medium', fr.text)}>
                      {p.seconds_ago != null && p.active ? fr.label(p.seconds_ago) : 'Offline'}
                    </span>
                  </div>
                  {p.current_activity && (
                    <p className="text-xs text-muted-foreground ml-4 mt-0.5 truncate">→ {p.current_activity.label}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <button
          className="absolute top-3 z-10 bg-card border border-border rounded-r-lg p-1.5 shadow-sm"
          style={{ left: panelOpen ? '288px' : '0px' }}
          onClick={() => setPanelOpen(!panelOpen)}
          data-testid="toggle-panel-btn"
        >
          {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

        {/* Mappa */}
        <div className="flex-1 relative">
          <APIProvider apiKey={apiKey}>
            <Map
              style={{ width: '100%', height: '100%' }}
              defaultCenter={{ lat: 40.667, lng: 16.606 }}
              defaultZoom={13}
              mapId="DEMO_MAP_ID"
              gestureHandling="greedy"
              disableDefaultUI
              zoomControl
            >
              <FitBounds people={located} giro={giro} />
              {centerTarget && <CenterOn target={centerTarget} />}
              {located.map((p) => {
                const meta = ROLE_META[p.role] || ROLE_META.cleaner;
                const isSel = selected?.user_id === p.user_id;
                return (
                  <AdvancedMarker
                    key={p.user_id}
                    position={{ lat: p.latitude, lng: p.longitude }}
                    onClick={() => selectPerson(p)}
                  >
                    <div
                      className={cn('rounded-full flex items-center justify-center shadow-md border-2 border-white', isSel ? 'w-10 h-10' : 'w-8 h-8')}
                      style={{ backgroundColor: meta.color }}
                      title={p.name}
                    >
                      <meta.Icon className="h-4 w-4 text-white" />
                    </div>
                  </AdvancedMarker>
                );
              })}
              {(giro || []).filter((f) => f.latitude != null).map((f) => (
                <AdvancedMarker key={f.id} position={{ lat: f.latitude, lng: f.longitude }} onClick={() => navigate(`/consegne/fermata/${f.id}`)}>
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow border-2 border-white',
                    f.status === 'completed' ? 'bg-emerald-500 text-white' : 'bg-white text-blue-700')}>
                    {f.route_order || '•'}
                  </div>
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>

          {/* Card rapida persona */}
          {selected && (
            <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-80 bg-card border border-border rounded-xl shadow-xl p-4 space-y-2" data-testid="map-person-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_META[selected.role]?.label}</p>
                </div>
                <button onClick={() => { setSelected(null); setGiro(null); }} className="text-muted-foreground" data-testid="close-person-card"><X className="h-4 w-4" /></button>
              </div>
              <div className="text-xs space-y-1">
                <p className={cn('font-medium', freshnessInfo(selected).text)}>
                  Posizione: {selected.active && selected.seconds_ago != null ? `aggiornata ${freshnessInfo(selected).label(selected.seconds_ago)}` : 'non disponibile (offline)'}
                  {selected.battery != null && <span className="text-muted-foreground ml-2 inline-flex items-center gap-0.5"><Battery className="h-3 w-3" />{selected.battery}%</span>}
                </p>
                {selected.current_activity && <p><span className="text-muted-foreground">Attività attuale:</span> <strong>{selected.current_activity.label}</strong></p>}
                {selected.next_activity && <p><span className="text-muted-foreground">Prossima:</span> {selected.next_activity.label}</p>}
                {selected.stats && selected.stats.total != null && (
                  <p className="text-muted-foreground">{selected.stats.done}/{selected.stats.total} completate oggi</p>
                )}
                {selected.role === 'rider' && giro && giro.length > 0 && (
                  <p className="text-muted-foreground flex items-center gap-1"><Route className="h-3 w-3" />{giro.length} fermate nel giro (mostrate sulla mappa)</p>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(selected.current_activity || selected.next_activity) && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => openActivity(selected.current_activity || selected.next_activity)} data-testid="card-open-activity">
                    <ExternalLink className="h-3 w-3" />Apri attività
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => navigate(`/users?u=${selected.user_id}`)} data-testid="card-open-user">
                  <User className="h-3 w-3" />Apri utente
                </Button>
                {selected.latitude != null && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setCenterTarget({ ...selected })} data-testid="card-center">
                    <Crosshair className="h-3 w-3" />Centra
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
