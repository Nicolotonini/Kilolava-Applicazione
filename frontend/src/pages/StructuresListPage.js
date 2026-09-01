import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { structuresApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Building2, Plus, Search, MapPin, User, Trash2, Boxes, DoorOpen,
  Sparkles, Shirt, Layers, Package, Wrench,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip';
import { EmptyState, ListSkeleton } from '../components/kilolava/EmptyState';

const SERVICE_COLS = [
  { key: 'cleaning', label: 'Pulizie', icon: Sparkles, on: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400' },
  { key: 'private_laundry', label: 'Privata', icon: Shirt, on: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' },
  { key: 'rental_laundry', label: 'Noleggio', icon: Layers, on: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' },
  { key: 'consumables', label: 'Consum.', icon: Package, on: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  { key: 'maintenance', label: 'Manut.', icon: Wrench, on: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
];

const ServiceDot = ({ svc, active }) => (
  <span
    title={`${svc.label}${active ? ' — attivo' : ' — non attivo'}`}
    className={cn(
      'inline-flex w-9 h-9 rounded-full items-center justify-center',
      active ? svc.on : 'text-muted-foreground/20'
    )}
  >
    <svc.icon className="h-[18px] w-[18px]" />
  </span>
);

const TH = 'sticky top-0 z-10 bg-card border-b border-border font-medium';

const StructuresListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const fetchStructures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await structuresApi.getAll();
      setStructures(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStructures(); }, [fetchStructures]);

  const q = search.trim().toLowerCase();
  const filtered = structures.filter(s =>
    !q ||
    (s.klv_code || '').toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q) ||
    (s.address || '').toLowerCase().includes(q) ||
    (s.client_name || '').toLowerCase().includes(q)
  );

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Eliminare questa struttura?')) return;
    try {
      await structuresApi.delete(id);
      toast.success('Struttura eliminata');
      fetchStructures();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore');
    }
  };

  const goStructure = (id) => navigate(`/structures/${id}`);
  const goClient = (e, clientId) => { e.stopPropagation(); navigate(`/clients/${clientId}`); };
  const goAccess = (e, id) => { e.stopPropagation(); navigate(`/structures/${id}?section=access`); };
  const goWarehouse = (e, id) => { e.stopPropagation(); navigate(`/magazzino-strutture/noleggio/${id}`); };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="p-4 lg:p-6 space-y-5" data-testid="structures-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Strutture</h1>
          <p className="text-sm text-muted-foreground">{structures.length} strutture registrate</p>
        </div>
        <Button
          onClick={() => navigate('/structures/new')}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          data-testid="add-structure-btn"
        >
          <Plus className="h-4 w-4 mr-1.5" />Nuova Struttura
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per codice KLV, nome, indirizzo o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-10 pl-9"
          data-testid="search-input"
        />
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Building2} message="Nessuna struttura trovata" />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block border border-border rounded-xl bg-card">
            <table className="w-full text-sm border-separate border-spacing-0" data-testid="structures-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className={cn(TH, 'py-2.5 pl-4 pr-2 rounded-tl-xl')}>KLV</th>
                  <th className={cn(TH, 'py-2.5 px-2')}>Struttura</th>
                  {SERVICE_COLS.map(s => (
                    <th key={s.key} className={cn(TH, 'py-2.5 px-1 text-center')}>{s.label}</th>
                  ))}
                  <th className={cn(TH, 'py-2.5 px-1 text-center')}>Ingresso</th>
                  <th className={cn(TH, 'py-2.5 px-1 text-center')}>Magazzino</th>
                  <th className={cn(TH, 'py-2.5 pl-1 pr-3 rounded-tr-xl')} />
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border/60 [&>tr:last-child>td]:border-0">
                {filtered.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => goStructure(s.id)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors"
                    data-testid={`structure-row-${s.id}`}
                  >
                    <td className="py-3 pl-4 pr-2">
                      <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-mono text-sm font-bold whitespace-nowrap" data-testid={`klv-${s.id}`}>
                        {s.klv_code || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <p className="font-semibold text-sm leading-tight flex items-center gap-2">
                        <span>{s.name}</span>
                        {s.is_active === false && (
                          <span className="px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium" data-testid={`structure-inactive-${s.id}`}>Disattivata</span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {s.address && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />{s.address}{s.floor ? `, P.${s.floor}` : ''}
                          </span>
                        )}
                        {s.client_name && (
                          <button
                            onClick={e => goClient(e, s.client_id)}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
                            data-testid={`client-link-${s.id}`}
                          >
                            <User className="h-3 w-3 shrink-0" />{s.client_name}
                          </button>
                        )}
                      </div>
                    </td>
                    {SERVICE_COLS.map(svc => (
                      <td key={svc.key} className="py-3 px-1 text-center" data-testid={`svc-${svc.key}-${s.id}`}>
                        <ServiceDot svc={svc} active={(s.services || []).includes(svc.key)} />
                      </td>
                    ))}
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={e => goAccess(e, s.id)}
                            data-testid={`open-access-${s.id}`}
                          >
                            <DoorOpen className="h-[18px] w-[18px]" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Informazioni di ingresso</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-1 text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-9 w-9"
                            onClick={e => goWarehouse(e, s.id)}
                            data-testid={`open-warehouse-${s.id}`}
                          >
                            <Boxes className="h-[18px] w-[18px]" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Magazzino Struttura</TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-3 pl-1 pr-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={e => handleDelete(s.id, e)}
                        data-testid={`delete-structure-${s.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {filtered.map(s => (
              <div
                key={s.id}
                onClick={() => goStructure(s.id)}
                className="p-4 rounded-xl border border-border bg-card cursor-pointer"
                data-testid={`structure-card-${s.id}`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold">{s.klv_code || '—'}</span>
                  <p className="font-semibold text-sm flex-1 min-w-0 truncate">{s.name}</p>
                  {s.is_active === false && (
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-muted text-muted-foreground font-medium flex-shrink-0">Disattivata</span>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={e => handleDelete(s.id, e)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                  {s.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.address}</span>}
                  {s.client_name && (
                    <button onClick={e => goClient(e, s.client_id)} className="flex items-center gap-1 text-primary">
                      <User className="h-3 w-3" />{s.client_name}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-0.5">
                    {SERVICE_COLS.map(svc => (
                      <ServiceDot key={svc.key} svc={svc} active={(s.services || []).includes(svc.key)} />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={e => goAccess(e, s.id)}>
                      <DoorOpen className="h-3.5 w-3.5 mr-1" />Ingresso
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={e => goWarehouse(e, s.id)}>
                      <Boxes className="h-3.5 w-3.5 mr-1" />Magazzino
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
    </TooltipProvider>
  );
};

export default StructuresListPage;
