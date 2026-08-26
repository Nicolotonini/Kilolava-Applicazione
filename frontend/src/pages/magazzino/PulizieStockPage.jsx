import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, ClipboardCheck, SprayCan, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MovementDialog, InventoryDialog } from './MovementDialog';
import { AnomaliaDialog } from './AnomaliaDialog';

const FILTERS = [
  ['all', 'Tutti'],
  ['attrezzatura', 'Attrezzatura'],
  ['consumabile', 'Consumabili'],
  ['low', 'Sotto scorta'],
];

export default function PulizieStockPage() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [movOpen, setMovOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [anomOpen, setAnomOpen] = useState(false);

  const load = useCallback(() => {
    api.get('/magazzino/pulizie').then(r => setRows(r.data)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveMin = async (p, value) => {
    try {
      await api.put(`/magazzino/catalog/pulizie/${p.id}`, { name: p.name, min_qty: Number(value || 0) });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const filtered = (rows || []).filter(r => {
    if (filter === 'low') return r.below_min;
    if (filter === 'all') return true;
    return r.type === filter;
  });

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="magazzino-pulizie-page">
      <PageHeader title="Magazzino Pulizie" subtitle="Scorte aziendali di attrezzatura e prodotti per le Pulizie (magazzino centrale)"
        actions={<>
          <Button variant="outline" onClick={() => setAnomOpen(true)} data-testid="pulizie-anomalia-btn">
            <AlertTriangle className="h-4 w-4 mr-1.5" />Segnala anomalia
          </Button>
          <Button variant="outline" onClick={() => setInvOpen(true)} data-testid="pulizie-inventory-btn">
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Fai inventario
          </Button>
          <Button onClick={() => setMovOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="pulizie-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Movimento
          </Button>
        </>} />

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium klv-interactive',
              filter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            data-testid={`pulizie-filter-${k}`}>
            {l}
          </button>
        ))}
      </div>

      {rows === null ? <ListSkeleton rows={8} /> : filtered.length === 0 ? (
        <EmptyState icon={SprayCan} message="Nessun prodotto con questi filtri. Gestisci il catalogo in Sistema → Cataloghi & Kit." />
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Articolo</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Ubicazione standard</th>
                <th className="px-3 py-2.5">In magazzino</th>
                <th className="px-3 py-2.5">Negli zaini</th>
                <th className="px-3 py-2.5">Scorta minima</th>
                <th className="px-3 py-2.5">Stato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-t border-border row-hover" data-testid={`pulizie-row-${p.id}`}>
                  <td className="px-3 py-2.5 font-medium">{p.name}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={p.type === 'attrezzatura' ? 'violet' : 'neutral'}>
                      {p.type === 'attrezzatura' ? 'Attrezzatura' : 'Consumabile'}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.standard_location === 'zaino' ? 'Zaino' : 'Magazzino'}</td>
                  <td className={cn('px-3 py-2.5 tabular-nums font-semibold', p.below_min && 'text-red-600')} data-testid={`qty-central-${p.id}`}>{p.qty_central}</td>
                  <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{p.qty_zaini}</td>
                  <td className="px-3 py-2.5">
                    <Input type="number" min="0" defaultValue={p.min_qty ?? ''} placeholder="—" className="w-16 h-7 text-sm"
                      onBlur={e => e.target.value !== String(p.min_qty ?? '') && saveMin(p, e.target.value)}
                      data-testid={`min-qty-${p.id}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    {p.below_min ? <StatusBadge tone="danger" testId={`low-badge-${p.id}`}>Sotto scorta</StatusBadge>
                      : p.min_qty != null ? <StatusBadge tone="success">Ok</StatusBadge>
                        : <StatusBadge tone="cancelled">No soglia</StatusBadge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {movOpen && <MovementDialog defaultDomain="pulizie" lockDomain defaultType="carico"
        defaultDestination={{ type: 'central', id: null }}
        onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(); }} />}
      {invOpen && <InventoryDialog domain="pulizie" locationType="central" locationId={null}
        items={(rows || []).map(r => ({ product_id: r.id, name: r.name, qty: r.qty_central }))}
        title="Magazzino Pulizie"
        onClose={() => setInvOpen(false)} onDone={() => { setInvOpen(false); load(); }} />}
      {anomOpen && <AnomaliaDialog contextLabel="Magazzino Pulizie" onClose={() => setAnomOpen(false)} />}
    </div>
  );
}
