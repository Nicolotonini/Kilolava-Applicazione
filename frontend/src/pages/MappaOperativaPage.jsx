import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';
import {
  MapPin, PanelLeftClose, PanelLeftOpen, Crosshair, ExternalLink,
  User, Battery, X, Route, Users, Maximize2, Search, AlertTriangle,
} from 'lucide-react';

const ROLE_META = {
  cleaner: { label: 'Operatrice', color: '#F24E75' },
  rider: { label: 'Rider', color: '#2563eb' },
  maintenance: { label: 'Manutentore', color: '#d97706' },
};

const FRESHNESS = {
  live: { label: 'LIVE', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  recente: { label: 'RECENTE', dot: 'bg-amber-500', text: 'text-amber-600' },
  non_aggiornata: { label: 'NON AGGIORNATA', dot: 'bg-orange-500', text: 'text-orange-600' },
  gps_off: { label: 'GPS DISATTIVATO', dot: 'bg-red-500', text: 'text-red-600' },
  offline: { label: 'Fuori servizio', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
};

const ROLE_FILTERS = [
  { key: 'all', label: 'Tutti' },
  { key: 'cleaner', label: 'Operatrici' },
  { key: 'rider', label: 'Rider' },
  { key: 'maintenance', label: 'Manutentori' },
];
const STATE_FILTERS = [
  { key: 'all', label: 'Tutti' },
  { key: 'servizio', label: 'In servizio' },
  { key: 'fuori', label: 'Fuori servizio' },
  { key: 'online', label: 'Online' },
  { key: 'offline', label: 'Offline' },
];

const TRIESTE = { lat: 45.6495, lng: 13.7768 };

const initials = (name) => (name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const shortName = (name) => {
  const parts = (name || '').split(' ').filter(Boolean);
  if (parts.length <= 1) return name || '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};
const agoLabel = (sec) => sec == null ? '—' : sec < 60 ? `${sec} sec fa` : `${Math.round(sec / 60)} min fa`;
const fr = (p) => FRESHNESS[p.freshness] || FRESHNESS.offline;

function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !window.google || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter({ lat: points[0].latitude, lng: points[0].longitude });
      map.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    map.fitBounds(bounds, 70);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, points.length]);
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

function PersonMarker({ p, selected, onClick }) {
  const meta = ROLE_META[p.role] || ROLE_META.cleaner;
  return (
    <AdvancedMarker position={{ lat: p.latitude, lng: p.longitude }} onClick={onClick} zIndex={selected ? 100 : 10}>
      <div className="flex flex-col items-center" data-testid={`marker-${p.user_id}`}>
        <div
          className={cn('rounded-full flex items-center justify-center text-white font-bold shadow-lg border-2 border-white relative transition-transform',
            selected ? 'w-11 h-11 text-sm scale-110' : 'w-9 h-9 text-xs')}
          style={{ backgroundColor: meta.color, outline: selected ? '3px solid rgba(242,78,117,0.5)' : 'none' }}
        >
          {initials(p.name)}
          <span className={cn('absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white', fr(p).dot)} />
        </div>
        <span className="hidden sm:block mt-0.5 px-1.5 py-px rounded bg-white/95 text-gray-900 text-xs font-semibold shadow whitespace-nowrap border border-black/10">
          {shortName(p.name)}
        </span>
      </div>
    </AdvancedMarker>
  );
}

function Kpi({ label, value, warn, testId }) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0" data-testid={testId}>
      <span className={cn('text-lg font-bold tabular-nums leading-none', warn && value > 0 ? 'text-red-600' : 'text-foreground')}>{value}</span>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
    </div>
  );
}

function PersonRow({ p, selected, onClick }) {
  const meta = ROLE_META[p.role] || ROLE_META.cleaner;
  const f = fr(p);
  return (
    <button
      onClick={onClick}
      className={cn('w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors', selected && 'bg-primary/5 border-l-2 border-primary')}
      data-testid={`map-person-${p.user_id}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: meta.color }}>
          {initials(p.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate leading-tight">{p.name}</p>
          <p className="text-xs text-muted-foreground">{meta.label} · {p.active ? 'In servizio' : 'Fuori servizio'}</p>
        </div>
        <span className={cn('text-xs font-semibold whitespace-nowrap', f.text)}>{p.active ? f.label : '—'}</span>
      </div>
      <div className="ml-9 mt-0.5 space-y-0.5">
        {p.active && (
          <p className="text-xs text-muted-foreground">
            {p.freshness === 'gps_off' ? 'GPS non attivo' : `Ultimo agg.: ${agoLabel(p.seconds_ago)} · GPS attivo`}
          </p>
        )}
        {p.current_activity && <p className="text-xs truncate"><span className="text-muted-foreground">In corso:</span> <span className="font-medium">{p.current_activity.label}</span></p>}
        {p.next_activity && <p className="text-xs text-muted-foreground truncate">Prossima: {p.next_activity.label}</p>}
      </div>
    </button>
  );
}

export default function MappaOperativaPage() {
  const navigate = useNavigate();
  const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.REACT_APP_GOOGLE_MAP_ID;
  const [people, setPeople] = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [selected, setSelected] = useState(null);
  const [centerTarget, setCenterTarget] = useState(null);
  const [fitKey, setFitKey] = useState(1);
  const [giro, setGiro] = useState(null);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    window.gm_authFailure = () => setMapError('Autenticazione Google Maps fallita: verifica la chiave API.');
    return () => { delete window.gm_authFailure; };
  }, []);

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

  const kpi = useMemo(() => {
    const act = people.filter((p) => p.active);
    return {
      servizio: act.length,
      cleaner: act.filter((p) => p.role === 'cleaner').length,
      rider: act.filter((p) => p.role === 'rider').length,
      maintenance: act.filter((p) => p.role === 'maintenance').length,
      gpsOff: act.filter((p) => p.freshness === 'gps_off').length,
      stale: act.filter((p) => p.freshness === 'non_aggiornata').length,
    };
  }, [people]);

  const filtered = useMemo(() => people.filter((p) => {
    if (roleFilter !== 'all' && p.role !== roleFilter) return false;
    if (stateFilter === 'servizio' && !p.active) return false;
    if (stateFilter === 'fuori' && p.active) return false;
    if (stateFilter === 'online' && !['live', 'recente'].includes(p.freshness)) return false;
    if (stateFilter === 'offline' && ['live', 'recente'].includes(p.freshness)) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [people, roleFilter, stateFilter, search]);

  const located = filtered.filter((p) => p.latitude != null && p.active);

  const selectPerson = async (p) => {
    setSelected(p);
    setGiro(null);
    if (p.latitude != null) setCenterTarget({ ...p });
    if (window.innerWidth < 1024) setPanelOpen(false);
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

  const pillCls = (on) => cn('text-xs px-2.5 py-1 rounded-full font-medium border transition-colors whitespace-nowrap',
    on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground');

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
    <div className="flex flex-col overflow-hidden h-[calc(100vh-3.5rem)] lg:h-screen" data-testid="mappa-operativa-page">
      {/* Header + KPI + filtri */}
      <div className="px-4 lg:px-6 py-3 border-b border-border bg-card space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-heading font-semibold leading-tight">Mappa Operativa</h1>
            <p className="text-xs text-muted-foreground">Personale in servizio in tempo reale</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={() => setFitKey((k) => k + 1)} data-testid="fit-all-btn">
            <Maximize2 className="h-3.5 w-3.5" />Mostra tutti
          </Button>
        </div>
        <div className="flex items-center gap-5 lg:gap-6 overflow-x-auto" data-testid="map-kpi-row">
          <Kpi label="In servizio" value={kpi.servizio} testId="kpi-servizio" />
          <Kpi label="Operatrici" value={kpi.cleaner} testId="kpi-cleaner" />
          <Kpi label="Rider" value={kpi.rider} testId="kpi-rider" />
          <Kpi label="Manutentori" value={kpi.maintenance} testId="kpi-maintenance" />
          <Kpi label="GPS disattivato" value={kpi.gpsOff} warn testId="kpi-gps-off" />
          <Kpi label="Non aggiornata" value={kpi.stale} warn testId="kpi-stale" />
        </div>
        <div className="flex items-start gap-x-8 gap-y-2.5 overflow-x-auto sm:overflow-visible sm:flex-wrap" data-testid="map-filters-row">
          <div className="space-y-1.5 shrink-0 sm:shrink" data-testid="map-filter-group-role">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Ruolo</p>
            <div className="flex items-center gap-1.5 sm:flex-wrap">
              {ROLE_FILTERS.map((f) => (
                <button key={f.key} onClick={() => setRoleFilter(f.key)} className={pillCls(roleFilter === f.key)} data-testid={`map-filter-${f.key}`}>{f.label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 shrink-0 sm:shrink" data-testid="map-filter-group-state">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Stato</p>
            <div className="flex items-center gap-1.5 sm:flex-wrap">
              {STATE_FILTERS.map((f) => (
                <button key={f.key} onClick={() => setStateFilter(f.key)} className={pillCls(stateFilter === f.key)} data-testid={`map-state-${f.key}`}>{f.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Pannello operatori: statico su desktop, overlay su mobile */}
        {panelOpen && (
          <div className="lg:hidden absolute inset-0 bg-black/30 z-20" onClick={() => setPanelOpen(false)} data-testid="panel-backdrop" />
        )}
        <div className={cn('bg-card border-r border-border flex-col z-30 shrink-0',
          'absolute inset-y-0 left-0 w-[85vw] max-w-xs lg:static lg:w-80 lg:max-w-none',
          panelOpen ? 'flex' : 'hidden')} data-testid="map-side-panel">
          <div className="p-2.5 border-b border-border">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca operatore..."
                className="h-8 pl-8 text-sm" data-testid="map-search-input" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground p-4 text-center" data-testid="panel-empty">
                {people.some((p) => p.active) ? 'Nessun operatore con questo filtro.' : 'Nessuna posizione attiva.'}
              </p>
            )}
            {filtered.map((p) => (
              <PersonRow key={p.user_id} p={p} selected={selected?.user_id === p.user_id} onClick={() => selectPerson(p)} />
            ))}
          </div>
        </div>

        {/* Toggle pannello — desktop */}
        <button
          className="hidden lg:block absolute top-3 z-30 bg-card border border-border rounded-r-lg p-1.5 shadow-sm"
          style={{ left: panelOpen ? '320px' : '0px' }}
          onClick={() => setPanelOpen(!panelOpen)}
          data-testid="toggle-panel-btn"
        >
          {panelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

        {/* Mappa */}
        <div className="flex-1 relative min-w-0">
          {mapError ? (
            <div className="h-full flex items-center justify-center bg-muted/30 p-6" data-testid="map-error">
              <div className="text-center max-w-sm">
                <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="font-semibold">Impossibile caricare la mappa</p>
                <p className="text-sm text-muted-foreground mt-1">{mapError}</p>
              </div>
            </div>
          ) : (
            <APIProvider apiKey={apiKey} onError={() => setMapError('Errore di caricamento Google Maps. Riprova o verifica la connessione.')}>
              <Map
                style={{ width: '100%', height: '100%' }}
                defaultCenter={TRIESTE}
                defaultZoom={13}
                mapId={mapId || undefined}
                gestureHandling="greedy"
                disableDefaultUI
                zoomControl
              >
                <FitBounds points={located} fitKey={fitKey} />
                {centerTarget && <CenterOn target={centerTarget} />}
                {located.map((p) => (
                  <PersonMarker key={p.user_id} p={p} selected={selected?.user_id === p.user_id} onClick={() => selectPerson(p)} />
                ))}
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
          )}

          {/* Empty state discreto sopra la mappa */}
          {!mapError && located.length === 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/75 backdrop-blur-sm border border-border/60 rounded-full px-3 py-1 z-10" data-testid="map-empty-chip">
              <p className="text-xs text-muted-foreground/80">Nessun operatore attualmente in servizio</p>
            </div>
          )}

          {/* Bottone operatori — mobile */}
          <button
            className="lg:hidden absolute bottom-4 left-4 z-10 bg-card border border-border rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2 text-sm font-semibold"
            onClick={() => setPanelOpen(true)}
            data-testid="mobile-panel-btn"
          >
            <Users className="h-4 w-4" />Operatori ({filtered.length})
          </button>

          {/* Dettaglio rapido persona */}
          {selected && (
            <div className="absolute bottom-4 right-4 left-4 sm:left-auto sm:w-80 bg-card border border-border rounded-xl shadow-xl p-4 space-y-2 z-10" data-testid="map-person-card">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: (ROLE_META[selected.role] || ROLE_META.cleaner).color }}>
                    {initials(selected.name)}
                  </span>
                  <div>
                    <p className="font-semibold leading-tight">{selected.name}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_META[selected.role]?.label} · {selected.active ? 'In servizio' : 'Fuori servizio'}</p>
                  </div>
                </div>
                <button onClick={() => { setSelected(null); setGiro(null); }} className="text-muted-foreground" data-testid="close-person-card"><X className="h-4 w-4" /></button>
              </div>
              <div className="text-xs space-y-1">
                <p className={cn('font-semibold', fr(selected).text)} data-testid="card-freshness">
                  {selected.active ? fr(selected).label : 'Fuori servizio'}
                  {selected.active && selected.seconds_ago != null && <span className="font-normal"> · {agoLabel(selected.seconds_ago)}</span>}
                  {selected.accuracy != null && <span className="text-muted-foreground font-normal ml-2">±{Math.round(selected.accuracy)} m</span>}
                  {selected.battery != null && <span className="text-muted-foreground font-normal ml-2 inline-flex items-center gap-0.5"><Battery className="h-3 w-3" />{selected.battery}%</span>}
                </p>
                {selected.current_activity && <p><span className="text-muted-foreground">In corso:</span> <strong>{selected.current_activity.label}</strong></p>}
                {selected.next_activity && <p><span className="text-muted-foreground">Prossima:</span> {selected.next_activity.label}</p>}
                {selected.stats && selected.stats.total != null && (
                  <p className="text-muted-foreground">{selected.stats.done}/{selected.stats.total} completate oggi</p>
                )}
                {selected.role === 'rider' && giro && giro.length > 0 && (
                  <p className="text-muted-foreground flex items-center gap-1"><Route className="h-3 w-3" />{giro.length} fermate nel giro (sulla mappa)</p>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(selected.current_activity || selected.next_activity) && (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => openActivity(selected.current_activity || selected.next_activity)} data-testid="card-open-activity">
                    <ExternalLink className="h-3 w-3" />Apri attività
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => navigate(`/users?u=${selected.user_id}`)} data-testid="card-open-user">
                  <User className="h-3 w-3" />Scheda utente
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
