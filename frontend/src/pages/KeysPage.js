import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { structuresApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { KeyRound, Search, CheckCircle2, XCircle, MapPin, User, ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/utils';

const KEY_DEFS = [
  { letter: 'A', label: 'Addette' },
  { letter: 'B', label: 'Rider' },
  { letter: 'C', label: 'Emergenza' },
];

const GRID = 'md:grid md:grid-cols-[120px_minmax(0,1.5fr)_180px_180px_210px] md:items-center md:gap-3';

const KeysPage = () => {
  const navigate = useNavigate();
  const [structures, setStructures] = useState([]);
  const [capacity, setCapacity] = useState(60);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    Promise.all([
      structuresApi.getAll(),
      api.get('/settings/keys').catch(() => ({ data: { box_capacity: 60 } })),
    ])
      .then(([sRes, cRes]) => {
        setStructures(sRes.data);
        setCapacity(cRes.data.box_capacity || 60);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const copies = (s) => KEY_DEFS.map(d => {
    const raw = (s.access_info?.key_boxes || {})[d.letter];
    const exists = raw ? (raw.exists !== undefined ? !!raw.exists : !!raw.present) : false;
    return {
      ...d,
      tracked: !!raw,
      exists,
      box: raw?.box || d.letter,
      slot: raw?.slot || '',
      present: exists && !!raw?.present,
    };
  });
  const hasKeys = (s) => !!s.access_info?.kilolava_has_keys;

  const withKeys = structures.filter(hasKeys);
  const boxOccupied = (letter) => withKeys.reduce((n, s) => n + copies(s).filter(c => String(c.slot).trim() !== '' && String(c.box).toUpperCase().startsWith(letter)).length, 0);
  const boxOut = (letter) => withKeys.reduce((n, s) => n + copies(s).filter(c => c.exists && !c.present && String(c.box).toUpperCase().startsWith(letter)).length, 0);

  const q = search.trim().toLowerCase();
  const filtered = withKeys.filter(s => {
    if (q && !(
      (s.klv_code || '').toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.client_name || '').toLowerCase().includes(q)
    )) return false;
    if (filter === 'out') return copies(s).some(c => c.exists && !c.present);
    if (filter === 'missing') return copies(s).some(c => c.tracked && !c.exists);
    if (['A', 'B', 'C'].includes(filter)) return copies(s).some(c => String(c.box).toUpperCase().startsWith(filter));
    return true;
  });

  const openClient = (e, s) => {
    e.stopPropagation();
    if (s.client_id) navigate(`/clients/${s.client_id}`);
  };

  return (
    <div className="p-4 lg:p-8 space-y-5" data-testid="keys-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-heading font-semibold">Chiavi</h1>
        <p className="text-sm text-muted-foreground">Sistema box chiavi A · B · C — il portachiavi fisico riporta solo il codice KLV</p>
      </div>

      {/* Box occupancy */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BoxCard letter="A" label="Addette" occupied={boxOccupied('A')} capacity={capacity} testId="stat-box-a" />
        <BoxCard letter="B" label="Rider" occupied={boxOccupied('B')} capacity={capacity} testId="stat-box-b" />
        <BoxCard letter="C" label="Emergenza" occupied={boxOccupied('C')} capacity={capacity} testId="stat-box-c" />
      </div>

      {/* Keys currently out */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <OutCard letter="A" label="Addette" count={boxOut('A')} testId="stat-out-a" />
        <OutCard letter="B" label="Rider" count={boxOut('B')} testId="stat-out-b" />
        <OutCard letter="C" label="Emergenza" count={boxOut('C')} testId="stat-out-c" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca KLV, struttura o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
            data-testid="keys-search"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            { key: 'A', label: 'Box A' },
            { key: 'B', label: 'Box B' },
            { key: 'C', label: 'Box C' },
            { key: 'out', label: 'Fuori sede' },
            { key: 'missing', label: 'Copie mancanti' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(filter === f.key ? 'all' : f.key)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
              data-testid={`keys-filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center py-12 text-muted-foreground">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl" data-testid="keys-empty">
          <KeyRound className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {withKeys.length === 0
              ? 'Nessuna struttura con chiavi Kilolava. Attiva "Kilolava possiede le chiavi" nella scheda struttura.'
              : 'Nessun risultato per la ricerca o il filtro selezionato.'}
          </p>
        </div>
      ) : (
        <div>
          {/* Desktop table header */}
          <div className={cn('hidden px-4 pb-2 md:sticky md:top-0 md:z-10 bg-background', GRID)} data-testid="keys-table-header">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">KLV</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Struttura</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Box A — Addette</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Box B — Rider</span>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Box C — Emergenza</span>
          </div>

          <div className="space-y-2">
            {filtered.map(s => {
              const cps = copies(s);
              const anyMissing = cps.some(c => c.tracked && !c.exists);
              const anyOut = cps.some(c => c.exists && !c.present);
              return (
                <Card
                  key={s.id}
                  onClick={() => navigate(`/structures/${s.id}?section=access`)}
                  className={cn(
                    'border shadow-none cursor-pointer transition-colors hover:border-primary/40',
                    anyMissing ? 'border-red-200 dark:border-red-900/50' : anyOut && 'border-amber-200 dark:border-amber-900/50'
                  )}
                  data-testid={`keys-row-${s.id}`}
                >
                  {/* Desktop row */}
                  <CardContent className={cn('hidden p-4', GRID)}>
                    <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-mono text-sm font-bold w-fit whitespace-nowrap">{s.klv_code || '—'}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{s.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {s.address && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />{s.address}{s.floor ? `, P.${s.floor}` : ''}
                          </span>
                        )}
                        {s.client_name && (
                          <button
                            onClick={(e) => openClient(e, s)}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
                            data-testid={`keys-client-link-${s.id}`}
                          >
                            <User className="h-3 w-3 shrink-0" />{s.client_name}
                          </button>
                        )}
                      </div>
                    </div>
                    {cps.map(c => (
                      <CopyCell key={c.letter} copy={c} testId={`copy-${s.id}-${c.letter}`} />
                    ))}
                  </CardContent>

                  {/* Mobile card */}
                  <CardContent className="p-4 md:hidden space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-sm font-bold">{s.klv_code || '—'}</span>
                      <p className="font-semibold text-sm">{s.name}</p>
                    </div>
                    {s.address && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />{s.address}{s.floor ? `, P.${s.floor}` : ''}
                      </p>
                    )}
                    {s.client_name && (
                      <button
                        onClick={(e) => openClient(e, s)}
                        className="flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2"
                        data-testid={`keys-client-link-mobile-${s.id}`}
                      >
                        <User className="h-3.5 w-3.5 shrink-0" />{s.client_name}
                      </button>
                    )}
                    <div className="space-y-1.5 pt-1 border-t border-border">
                      {cps.map(c => (
                        <div key={c.letter} className="flex items-center gap-2 text-sm" data-testid={`copy-mobile-${s.id}-${c.letter}`}>
                          <span className="font-mono font-bold w-4">{c.letter}</span>
                          <CopyStatus copy={c} />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

function CopyCell({ copy, testId }) {
  return (
    <div className="flex items-center gap-1.5 text-sm" data-testid={testId}>
      <CopyStatus copy={copy} />
    </div>
  );
}

function CopyStatus({ copy }) {
  if (!copy.tracked) {
    return <span className="text-muted-foreground text-base">—</span>;
  }
  if (!copy.exists) {
    return (
      <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold text-sm whitespace-nowrap">
        <XCircle className="h-4 w-4 shrink-0" />COPIA MANCANTE
      </span>
    );
  }
  if (copy.present) {
    return (
      <span className="flex items-center gap-2 text-base font-medium">
        {copy.slot ? <span>Slot {copy.slot}</span> : <span>Presente</span>}
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-sm whitespace-nowrap">
      <ArrowUpRight className="h-4 w-4 shrink-0" />FUORI SEDE
    </span>
  );
}

function BoxCard({ letter, label, occupied, capacity, testId }) {
  const free = Math.max(0, capacity - occupied);
  return (
    <Card className="border shadow-none">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Box {letter} — {label}</p>
        <p className="text-3xl font-semibold tabular-nums mt-1" data-testid={testId}>
          {occupied} <span className="text-base text-muted-foreground font-normal">/ {capacity}</span>
        </p>
        <p className={cn('text-xs mt-1', free === 0 ? 'text-red-600 font-medium' : 'text-muted-foreground')} data-testid={`${testId}-free`}>
          slot assegnati — {free} disponibili
        </p>
      </CardContent>
    </Card>
  );
}

function OutCard({ letter, label, count, testId }) {
  return (
    <Card className="border shadow-none">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Fuori sede — {label}</p>
        <p className={cn('text-3xl font-semibold tabular-nums mt-1', count > 0 ? 'text-amber-600' : 'text-emerald-600')} data-testid={testId}>
          {count}
        </p>
        <p className="text-xs mt-1 text-muted-foreground">
          {count === 0
            ? `Nessuna copia Box ${letter} fuori dalla lavanderia`
            : `cop${count === 1 ? 'ia' : 'ie'} Box ${letter} attualmente fuori dalla lavanderia`}
        </p>
      </CardContent>
    </Card>
  );
}

export default KeysPage;
