import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, ArrowLeftRight, RotateCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MOVEMENT_TYPE_LABELS, DOMAIN_LABELS, locLabel, fmtDT } from './shared';
import { MovementDialog } from './MovementDialog';

export function MovementsTable({ items, compact, onStorno }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">Nessun movimento.</p>;
  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2">Data/Ora</th>
            <th className="px-3 py-2">Articolo</th>
            <th className="px-3 py-2">Q.tà</th>
            {!compact && <th className="px-3 py-2">Magazzino</th>}
            <th className="px-3 py-2">Tipo</th>
            <th className="px-3 py-2">Origine → Destinazione</th>
            <th className="px-3 py-2">Utente</th>
            {onStorno && <th className="px-3 py-2"></th>}
          </tr>
        </thead>
        <tbody>
          {items.map(m => (
            <tr key={m.id} className={cn('border-t border-border row-hover', m.reversed_by && 'opacity-50 line-through')} data-testid={`mov-row-${m.id}`}>
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDT(m.at)}</td>
              <td className="px-3 py-2 font-medium">{m.product_name}</td>
              <td className="px-3 py-2 tabular-nums font-semibold">{m.qty}</td>
              {!compact && <td className="px-3 py-2 text-muted-foreground">{DOMAIN_LABELS[m.domain]}</td>}
              <td className="px-3 py-2"><StatusBadge tone={m.movement_type === 'annullamento' ? 'cancelled' : m.movement_type === 'rettifica_inventario' ? 'waiting' : 'neutral'}>{MOVEMENT_TYPE_LABELS[m.movement_type] || m.movement_type}</StatusBadge></td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{locLabel(m.origin)} → {locLabel(m.destination)}</td>
              <td className="px-3 py-2 text-muted-foreground">{m.user_name}{m.note ? <span className="block text-xs truncate max-w-[160px]">{m.note}</span> : null}</td>
              {onStorno && (
                <td className="px-3 py-2">
                  {!m.reversed_by && m.movement_type !== 'annullamento' && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => onStorno(m)} data-testid={`storno-${m.id}`}>
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

export default function MovimentiPage() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ domain: '', movement_type: '', product: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [movOpen, setMovOpen] = useState(false);

  const load = useCallback((pg = 1, append = false) => {
    const params = { page: pg, limit: 50 };
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get('/magazzino/movimenti', { params }).then(r => {
      setData(prev => append && prev ? { ...r.data, items: [...prev.items, ...r.data.items] } : r.data);
      setPage(pg);
    }).catch(() => setData({ items: [], total: 0 }));
  }, [filters]);
  useEffect(() => { load(1); }, [load]);

  const storno = async (m) => {
    if (!window.confirm(`Stornare il movimento "${m.qty}× ${m.product_name}"? Verrà creato un movimento inverso.`)) return;
    try {
      await api.post(`/magazzino/movimenti/${m.id}/storno`);
      toast.success('Movimento stornato');
      load(1);
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="movimenti-page">
      <PageHeader title="Movimenti Magazzino" subtitle="Storico completo: ogni cambio quantità è un movimento"
        actions={
          <Button onClick={() => setMovOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="new-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Nuovo movimento
          </Button>
        } />
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
        <Input value={filters.product} onChange={e => setFilters(f => ({ ...f, product: e.target.value }))}
          placeholder="Articolo..." className="h-8 w-40 text-sm" data-testid="filter-product" />
        <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-from" />
        <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-to" />
      </div>
      {data === null ? <ListSkeleton rows={8} /> : data.items.length === 0 ? (
        <EmptyState icon={ArrowLeftRight} message="Nessun movimento registrato con questi filtri." />
      ) : (
        <>
          <MovementsTable items={data.items} onStorno={storno} />
          {data.items.length < data.total && (
            <div className="text-center">
              <Button variant="outline" onClick={() => load(page + 1, true)} data-testid="load-more-mov">Carica altri ({data.total - data.items.length})</Button>
            </div>
          )}
        </>
      )}
      {movOpen && <MovementDialog onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(1); }} />}
    </div>
  );
}
