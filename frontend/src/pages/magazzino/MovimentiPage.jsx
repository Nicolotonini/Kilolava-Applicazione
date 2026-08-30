import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, ArrowLeftRight, RotateCw, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MOVEMENT_TYPE_LABELS, DOMAIN_LABELS, movTypeLabel, isStornoType, locLabel, fmtDT } from './shared';
import { MovementDialog } from './MovementDialog';
import { StornoDialog, MovementDetailDialog } from './MovementDetail';

export function MovementsTable({ items, compact, onStorno, onOpen }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">Nessun movimento.</p>;
  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <table className={cn('w-full text-sm', compact ? 'min-w-[640px]' : 'min-w-[860px]')}>
        <thead>
          <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            {!compact && <th className="px-3 py-2">Codice</th>}
            <th className="px-3 py-2">Data/Ora</th>
            <th className="px-3 py-2">Articolo</th>
            <th className="px-3 py-2">Q.tà</th>
            {!compact && <th className="px-3 py-2">Magazzino</th>}
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Origine → Destinazione</th>
            <th className="px-3 py-2">Utente</th>
            {!compact && <th className="px-3 py-2">Stato</th>}
            {onStorno && <th className="px-3 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id} onClick={onOpen ? () => onOpen(m) : undefined}
              className={cn('border-t border-border row-hover', onOpen && 'cursor-pointer hover:bg-accent/40', m.reversed_by && 'opacity-60')}
              data-testid={`mov-row-${m.id}`}>
              {!compact && (
                <td className="px-3 py-2 font-mono text-xs font-bold text-primary whitespace-nowrap" data-testid={`mov-mcode-${m.id}`}>{m.code || '—'}</td>
              )}
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDT(m.at)}</td>
              <td className={cn('px-3 py-2 font-medium', m.reversed_by && 'line-through')}>
                {m.product_name}
                {m.product_code && <span className="block font-mono text-xs font-bold text-primary" data-testid={`mov-code-${m.id}`}>{m.product_code}</span>}
              </td>
              <td className={cn('px-3 py-2 tabular-nums font-semibold', m.reversed_by && 'line-through')}>{m.qty}</td>
              {!compact && <td className="px-3 py-2 text-muted-foreground">{DOMAIN_LABELS[m.domain]}</td>}
              <td className="px-3 py-2"><StatusBadge tone={isStornoType(m.movement_type) ? 'violet' : m.movement_type === 'rettifica_inventario' ? 'waiting' : 'neutral'}>{movTypeLabel(m.movement_type)}</StatusBadge></td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{locLabel(m.origin)} → {locLabel(m.destination)}</td>
              <td className="px-3 py-2 text-muted-foreground">{m.user_name}{m.note ? <span className="block text-xs truncate max-w-[160px]">{m.note}</span> : null}</td>
              {!compact && (
                <td className="px-3 py-2 whitespace-nowrap">
                  {m.reversed_by ? (
                    <StatusBadge tone="danger" testId={`mov-stornato-${m.id}`}>Stornato</StatusBadge>
                  ) : isStornoType(m.movement_type) ? (
                    <span className="text-xs text-muted-foreground" data-testid={`mov-storno-di-${m.id}`}>
                      Storno di <span className="font-mono font-bold text-primary">{m.reverses_code || '—'}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Valido</span>
                  )}
                </td>
              )}
              {onStorno && (
                <td className="px-3 py-2">
                  {!m.reversed_by && !isStornoType(m.movement_type) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                      onClick={e => { e.stopPropagation(); onStorno(m); }} data-testid={`storno-${m.id}`}>
                      <RotateCw className="h-3 w-3 mr-1" />Storna
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MovimentiPage({ scope }) {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ domain: '', movement_type: '', state: '', product: '', date_from: '', date_to: '', structure_id: '', client_id: '', zone_id: '', user: '' });
  const [structures, setStructures] = useState([]);
  const [clients, setClients] = useState([]);
  const [zones, setZones] = useState([]);
  const [page, setPage] = useState(1);
  const [movOpen, setMovOpen] = useState(false);
  const [stornoMov, setStornoMov] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [stornoPick, setStornoPick] = useState(() => searchParams.get('storno') === '1');

  useEffect(() => {
    if (searchParams.get('storno') === '1') {
      setFilters((f) => ({ ...f, state: 'validi' }));
      searchParams.delete('storno');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.get('/structures').then(r => setStructures(r.data)).catch(() => {});
    if (scope === 'strutture') {
      api.get('/clients').then(r => setClients(r.data)).catch(() => {});
      api.get('/zones').then(r => setZones(r.data)).catch(() => {});
    }
  }, [scope]);

  const load = useCallback((pg = 1, append = false) => {
    const params = { page: pg, limit: 50 };
    if (scope) params.scope = scope;
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get('/magazzino/movimenti', { params }).then(r => {
      setData(prev => append && prev ? { ...r.data, items: [...prev.items, ...r.data.items] } : r.data);
      setPage(pg);
    }).catch(() => setData({ items: [], total: 0 }));
  }, [filters, scope]);
  useEffect(() => { load(1); }, [load]);

  const onStornoDone = (res) => {
    setStornoMov(null);
    setDetailId(null);
    toast.success('Movimento stornato correttamente', {
      action: { label: 'Apri movimento di storno', onClick: () => setDetailId(res.storno.id) },
    });
    load(1);
  };

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="movimenti-page">
      <PageHeader
        title={scope === 'strutture' ? 'Movimenti — Strutture' : scope === 'generale' ? 'Movimenti — Generale' : 'Movimenti Magazzino'}
        subtitle={scope === 'strutture' ? 'Solo i movimenti che coinvolgono una Struttura: consegne, ritiri, consumi e rettifiche nelle case'
          : scope === 'generale' ? 'Stock centrale, zaini e trasferimenti da/verso le Strutture'
            : 'Storico completo: ogni cambio quantità è un movimento'}
        actions={
          <Button onClick={() => setMovOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="new-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Nuovo movimento
          </Button>
        } />
      {stornoPick && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 flex items-start justify-between gap-3" data-testid="storno-pick-banner">
          <div>
            <p className="text-sm font-semibold text-primary flex items-center gap-1.5"><RotateCw className="h-4 w-4" />Storna movimento</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Non esiste uno storno libero: cerca il movimento da stornare (codice MOV, articolo, struttura o data) e usa il pulsante <strong>Storna</strong> sulla riga.
            </p>
          </div>
          <button onClick={() => setStornoPick(false)} className="text-muted-foreground hover:text-foreground shrink-0" data-testid="storno-pick-close">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="flex gap-2 flex-wrap items-center">
        <select value={filters.domain} onChange={e => setFilters(f => ({ ...f, domain: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-domain">
          <option value="">Tutti i magazzini</option>
          {Object.entries(DOMAIN_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={filters.movement_type} onChange={e => setFilters(f => ({ ...f, movement_type: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-type">
          <option value="">Tutti i tipi</option>
          {Object.entries(MOVEMENT_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={filters.state} onChange={e => setFilters(f => ({ ...f, state: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-state">
          <option value="">Tutti gli stati</option>
          <option value="validi">Validi</option>
          <option value="stornati">Stornati</option>
        </select>
        <Input value={filters.product} onChange={e => setFilters(f => ({ ...f, product: e.target.value }))}
          placeholder="Articolo o codice MOV..." className="h-8 w-48 text-sm" data-testid="filter-product" />
        <select value={filters.structure_id} onChange={e => setFilters(f => ({ ...f, structure_id: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm max-w-[180px]" data-testid="filter-structure">
          <option value="">Tutte le strutture</option>
          {structures.map(s => <option key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</option>)}
        </select>
        {scope === 'strutture' && (
          <select value={filters.client_id} onChange={e => setFilters(f => ({ ...f, client_id: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm max-w-[160px]" data-testid="filter-client">
            <option value="">Tutti i clienti</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
          </select>
        )}
        {scope === 'strutture' && (
          <select value={filters.zone_id} onChange={e => setFilters(f => ({ ...f, zone_id: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-zone">
            <option value="">Tutti i rioni</option>
            {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        )}
        <Input value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))}
          placeholder="Utente..." className="h-8 w-32 text-sm" data-testid="filter-user" />
        <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-from" />
        <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-to" />
      </div>
      {data === null ? <ListSkeleton rows={8} /> : data.items.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} message="Nessun movimento registrato con questi filtri." />
      ) : (
        <>
          <MovementsTable items={data.items} onStorno={setStornoMov} onOpen={(m) => setDetailId(m.id)} />
          {data.items.length < data.total && (
            <div className="text-center">
              <Button variant="outline" onClick={() => load(page + 1, true)} data-testid="load-more-mov">Carica altri ({data.total - data.items.length})</Button>
            </div>
          )}
        </>
      )}
      {movOpen && <MovementDialog onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(1); }} />}
      {detailId && <MovementDetailDialog movementId={detailId} onClose={() => setDetailId(null)}
        onOpenMovement={(id) => setDetailId(id)} onStorno={(m) => setStornoMov(m)} />}
      {stornoMov && <StornoDialog movement={stornoMov} onClose={() => setStornoMov(null)} onDone={onStornoDone} />}
    </div>
  );
}
