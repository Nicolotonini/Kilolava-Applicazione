import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { structuresApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { KeyRound, Search, CheckCircle2, XCircle, User } from 'lucide-react';
import { cn } from '../lib/utils';

const KEY_DEFS = [
  { letter: 'A', label: 'Addette' },
  { letter: 'B', label: 'Rider' },
  { letter: 'C', label: 'Emergenza' },
];

const KeysPage = () => {
  const navigate = useNavigate();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    structuresApi.getAll()
      .then(r => setStructures(r.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const copies = (s) => KEY_DEFS.map(d => {
    const kb = (s.access_info?.key_boxes || {})[d.letter] || {};
    return { ...d, box: kb.box || d.letter, slot: kb.slot || '', present: !!kb.present, note: kb.note || '' };
  });
  const hasKeys = (s) => !!s.access_info?.kilolava_has_keys;
  const isComplete = (s) => hasKeys(s) && copies(s).every(c => c.present);

  const withKeys = structures.filter(hasKeys);
  const completeCount = withKeys.filter(isComplete).length;
  const missingCount = withKeys.length - completeCount;
  const boxOccupied = (letter) => withKeys.reduce((n, s) => n + copies(s).filter(c => c.present && String(c.box).toUpperCase().startsWith(letter)).length, 0);

  const q = search.trim().toLowerCase();
  const filtered = withKeys.filter(s => {
    if (q && !(
      (s.klv_code || '').toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      (s.client_name || '').toLowerCase().includes(q)
    )) return false;
    if (filter === 'complete') return isComplete(s);
    if (filter === 'missing') return !isComplete(s);
    if (['A', 'B', 'C'].includes(filter)) return copies(s).some(c => String(c.box).toUpperCase().startsWith(filter));
    return true;
  });

  const FILTERS = [
    { key: 'all', label: 'Tutte' },
    { key: 'complete', label: 'Complete' },
    { key: 'missing', label: 'Copie mancanti' },
    { key: 'A', label: 'Box A' },
    { key: 'B', label: 'Box B' },
    { key: 'C', label: 'Box C' },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-5" data-testid="keys-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-heading font-semibold">Chiavi</h1>
        <p className="text-sm text-muted-foreground">Sistema box chiavi A · B · C — il portachiavi fisico riporta solo il codice KLV</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard label="Strutture con chiavi" value={withKeys.length} testId="stat-with-keys" />
        <StatCard label="Complete (3 copie)" value={completeCount} tone="green" testId="stat-complete" />
        <StatCard label="Copie mancanti" value={missingCount} tone={missingCount > 0 ? 'red' : undefined} testId="stat-missing" />
        <StatCard label="Box A occupati" value={boxOccupied('A')} testId="stat-box-a" />
        <StatCard label="Box B occupati" value={boxOccupied('B')} testId="stat-box-b" />
        <StatCard label="Box C occupati" value={boxOccupied('C')} testId="stat-box-c" />
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
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
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
        <div className="space-y-2">
          {filtered.map(s => {
            const cps = copies(s);
            const complete = isComplete(s);
            return (
              <Card
                key={s.id}
                onClick={() => navigate(`/structures/${s.id}?section=access`)}
                className={cn('border shadow-none cursor-pointer transition-colors hover:border-primary/40', !complete && 'border-red-200 dark:border-red-900/50')}
                data-testid={`keys-row-${s.id}`}
              >
                <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="min-w-[190px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold">{s.klv_code || '—'}</span>
                      <p className="font-semibold text-sm">{s.name}</p>
                    </div>
                    {s.client_name && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="h-3 w-3" />{s.client_name}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-4">
                    {cps.map(c => (
                      <div key={c.letter} className="flex items-center gap-1.5 text-xs" data-testid={`copy-${s.id}-${c.letter}`}>
                        <span className="font-mono font-bold text-muted-foreground">{c.letter}</span>
                        <span className="text-muted-foreground hidden sm:inline">— {c.label}</span>
                        {c.present ? (
                          <>
                            {c.slot && <span className="text-muted-foreground">— Slot {c.slot}</span>}
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          </>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
                            <XCircle className="h-3.5 w-3.5" />COPIA MANCANTE
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

function StatCard({ label, value, tone, testId }) {
  return (
    <Card className="border shadow-none">
      <CardContent className="p-3.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn(
          'text-2xl font-semibold tabular-nums mt-0.5',
          tone === 'green' && 'text-emerald-600',
          tone === 'red' && 'text-red-600'
        )} data-testid={testId}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default KeysPage;
