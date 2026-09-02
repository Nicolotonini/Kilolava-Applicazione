import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { structuresApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { OperationalDrawer } from '../components/kilolava/OperationalDrawer';
import { toast } from 'sonner';
import { KeyRound, Search, CheckCircle2, XCircle, MapPin, User, ArrowUpRight, Undo2, History, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

const fmtOut = (iso) => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// Cruscotto chiavi fuori sede: KLV · copia · detentore · attività collegata (da GET /keys/out)
const KeysOutList = ({ rows, onOpen }) => {
  const navigate = useNavigate();
  if (!rows || rows.length === 0) return null;
  return (
    <Card data-testid="keys-out-list">
      <CardContent className="p-0 divide-y divide-border">
        <div className="px-4 py-2.5 flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-semibold">Chiavi fuori sede <span className="text-muted-foreground font-normal">({rows.length})</span></p>
        </div>
        {rows.map((r) => (
          <div key={`${r.structure_id}-${r.copy}`} className="px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm" data-testid={`keys-out-${r.structure_id}-${r.copy}`}>
            <button type="button" onClick={() => onOpen(r)} className="font-mono font-bold text-primary hover:underline" data-testid={`keys-out-klv-${r.structure_id}-${r.copy}`}>
              {r.klv_code || '—'}
            </button>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Copia {r.copy}</span>
            <span className="font-medium flex items-center gap-1"><User className="h-3.5 w-3.5 text-muted-foreground" />{r.holder_name || '—'}</span>
            <span className="text-muted-foreground truncate max-w-[260px]">
              {r.linked_task_label ? `${r.linked_task_label} · ` : ''}{r.structure_name}{r.address ? ` · ${r.address}` : ''}
            </span>
            <span className="ml-auto text-xs text-muted-foreground tabular-nums">Fuori dalle {fmtOut(r.out_since)}</span>
            {r.linked_task_link && (
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={() => navigate(r.linked_task_link)} data-testid={`keys-out-link-${r.structure_id}-${r.copy}`}>
                <ExternalLink className="h-3.5 w-3.5" />{r.linked_task_type === 'cleaning' ? 'Pulizia' : 'Consegna'}
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

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
  const [drawer, setDrawer] = useState(null); // { s, copy }
  const [users, setUsers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [holderId, setHolderId] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [keysOut, setKeysOut] = useState([]);

  const fetchData = useCallback(() => {
    Promise.all([
      structuresApi.getAll(),
      api.get('/settings/keys').catch(() => ({ data: { box_capacity: 60 } })),
      api.get('/keys/out').catch(() => ({ data: [] })),
    ])
      .then(([sRes, cRes, oRes]) => {
        setStructures(sRes.data);
        setCapacity(cRes.data.box_capacity || 60);
        setKeysOut(oRes.data || []);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDrawer = async (e, s, copy) => {
    e.stopPropagation();
    if (!copy.tracked || !copy.exists) return;
    setDrawer({ s, copy });
    setHolderId('');
    setActionNote('');
    try {
      const [uRes, mRes] = await Promise.all([
        users.length ? Promise.resolve({ data: users }) : api.get('/users', { params: { internal: 1 } }),
        api.get('/keys/movements', { params: { structure_id: s.id, copy: copy.letter, limit: 10 } }),
      ]);
      setUsers(uRes.data.filter(u => u.is_active !== false));
      setMovements(mRes.data);
    } catch { setMovements([]); }
  };

  const doAction = async (action) => {
    if (action === 'ritiro' && !holderId) { toast.error('Seleziona chi ritira la chiave'); return; }
    setActionLoading(true);
    try {
      await api.post(`/keys/${drawer.s.id}/${drawer.copy.letter}/${action}`, {
        holder_user_id: action === 'ritiro' ? holderId : undefined,
        note: actionNote || null,
      });
      toast.success(action === 'ritiro' ? 'Ritiro chiave registrato' : 'Riconsegna registrata');
      setDrawer(null);
      fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setActionLoading(false); }
  };

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
      holder: raw?.holder_name || null,
      outSince: raw?.out_since || null,
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

      <KeysOutList
        rows={keysOut}
        onOpen={(r) => { const s = structures.find(x => x.id === r.structure_id); if (s) { const c = copies(s).find(x => x.letter === r.copy); if (c) openDrawer({ stopPropagation() {} }, s, c); } }}
      />

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
                      <button key={c.letter} type="button" onClick={(e) => openDrawer(e, s, c)}
                        className={cn('flex items-center gap-1.5 text-sm text-left rounded-md px-1 py-0.5 -mx-1',
                          c.tracked && c.exists && 'hover:bg-muted/70 cursor-pointer')}
                        data-testid={`copy-${s.id}-${c.letter}`}>
                        <CopyStatus copy={c} />
                      </button>
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
                        <button key={c.letter} type="button" onClick={(e) => openDrawer(e, s, c)}
                          className="flex items-center gap-2 text-sm w-full text-left" data-testid={`copy-mobile-${s.id}-${c.letter}`}>
                          <span className="font-mono font-bold w-4">{c.letter}</span>
                          <CopyStatus copy={c} />
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      {drawer && (
        <OperationalDrawer open onOpenChange={(v) => { if (!v) setDrawer(null); }}
          title={`Chiave ${drawer.s.klv_code || ''} — Copia ${drawer.copy.letter}`}
          description={`${drawer.s.name} · Box ${drawer.copy.box}${drawer.copy.slot ? ` · Slot ${drawer.copy.slot}` : ''}`}
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => setDrawer(null)} data-testid="drawer-cancel-btn">Chiudi</Button>
              {drawer.copy.present ? (
                <Button onClick={() => doAction('ritiro')} disabled={actionLoading}
                  className="bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="key-ritiro-btn">
                  <ArrowUpRight className="h-4 w-4 mr-1.5" />Registra ritiro
                </Button>
              ) : (
                <Button onClick={() => doAction('riconsegna')} disabled={actionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="key-riconsegna-btn">
                  <Undo2 className="h-4 w-4 mr-1.5" />Registra riconsegna
                </Button>
              )}
            </div>
          }
          testId="keys-drawer">
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Stato attuale</p>
              {drawer.copy.present ? (
                <p className="text-sm font-medium flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" />In sede{drawer.copy.slot ? ` — Slot ${drawer.copy.slot}` : ''}</p>
              ) : (
                <div>
                  <p className="text-sm font-medium text-amber-600 flex items-center gap-1.5"><ArrowUpRight className="h-4 w-4" />Fuori sede</p>
                  {drawer.copy.holder && <p className="text-sm mt-0.5" data-testid="drawer-holder">Detenuta da <span className="font-medium">{drawer.copy.holder}</span></p>}
                  {drawer.copy.outSince && <p className="text-xs text-muted-foreground mt-0.5">Dal {new Date(drawer.copy.outSince).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              )}
            </div>

            {drawer.copy.present && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Chi ritira la chiave *</p>
                <Select value={holderId} onValueChange={setHolderId}>
                  <SelectTrigger data-testid="key-holder-select"><SelectValue placeholder="Seleziona persona..." /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id} data-testid={`holder-opt-${u.id}`}>
                        {u.first_name} {u.last_name}{u.usr_code ? ` · ${u.usr_code}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">Note (facoltative)</p>
              <Textarea value={actionNote} onChange={(e) => setActionNote(e.target.value)} rows={2} className="resize-none text-sm" data-testid="key-note" />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Ultimi movimenti</p>
              {movements.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="key-history-empty">Nessun movimento registrato.</p>
              ) : (
                <div className="space-y-1.5" data-testid="key-history">
                  {movements.map(m => (
                    <div key={m.id} className="flex items-start gap-2 text-sm border-b border-border/60 pb-1.5">
                      {m.action === 'ritiro'
                        ? <ArrowUpRight className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0" />
                        : <Undo2 className="h-3.5 w-3.5 mt-0.5 text-emerald-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className="truncate">
                          <span className="font-medium">{m.action === 'ritiro' ? 'Ritiro' : 'Riconsegna'}</span>
                          {m.holder_name ? ` — ${m.holder_name}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(m.at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {m.by_user_name ? ` · registrato da ${m.by_user_name}` : ''}{m.note ? ` · ${m.note}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </OperationalDrawer>
      )}
    </div>
  );
};

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
    <span className="flex flex-col items-start">
      <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-sm whitespace-nowrap">
        <ArrowUpRight className="h-4 w-4 shrink-0" />FUORI SEDE
      </span>
      {copy.holder && (
        <span className="text-xs text-muted-foreground truncate max-w-[160px]" data-testid="copy-holder">{copy.holder}</span>
      )}
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
