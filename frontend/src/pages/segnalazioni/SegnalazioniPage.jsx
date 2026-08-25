import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, Settings, ClipboardList, AlertTriangle, SlidersHorizontal, Search, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { KpiCard, KpiGrid } from '../../components/kilolava/KpiCard';
import { EmptyState, KpiSkeleton, ListSkeleton } from '../../components/kilolava/EmptyState';
import { TYPE_META, PRIORITY_META, SEG_STATUS_META, ORIGIN_META, ageLabel } from './shared';
import { NewSegnalazioneDialog } from './NewSegnalazioneDialog';
import { SegnalazioniConfigDialog } from './ConfigDialog';
import { MyTasksSheet } from './MyTasksSheet';

const STATUS_PILLS = [
  { key: 'active', label: 'Tutte aperte' },
  { key: 'da_valutare', label: 'Da valutare' },
  { key: 'aperta', label: 'Aperte' },
  { key: 'in_corso', label: 'In corso' },
  { key: 'in_attesa', label: 'In attesa' },
  { key: 'risolta', label: 'Risolte' },
  { key: 'chiusa', label: 'Chiuse' },
];

const VIEW_MODES = [
  { key: 'list', label: 'Lista' },
  { key: 'assignee', label: 'Per assegnatario' },
  { key: 'structure', label: 'Per Struttura' },
  { key: 'type', label: 'Per Tipo' },
];

export default function SegnalazioniPage() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode] = useState('list');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({ priority: '', structure_id: '', client_id: '', assignee: '', origin: '', date_from: '', date_to: '' });
  const [counters, setCounters] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [myTasksOpen, setMyTasksOpen] = useState(false);
  const [filterData, setFilterData] = useState(null);

  const loadCounters = useCallback(() => {
    api.get('/segnalazioni/counters', { params: { type: typeFilter } }).then(r => setCounters(r.data)).catch(() => {});
  }, [typeFilter]);

  const buildParams = useCallback((pg) => {
    const p = { type: typeFilter, status: statusFilter, page: pg, limit: viewMode === 'list' ? 50 : 200 };
    if (search.trim()) p.search = search.trim();
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  }, [typeFilter, statusFilter, search, filters, viewMode]);

  const loadList = useCallback((pg = 1, append = false) => {
    setLoading(true);
    api.get('/segnalazioni', { params: buildParams(pg) })
      .then(r => {
        setItems(prev => append ? [...prev, ...r.data.items] : r.data.items);
        setTotal(r.data.total);
        setPage(pg);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [buildParams]);

  useEffect(() => { loadCounters(); }, [loadCounters]);
  useEffect(() => { loadList(1); }, [loadList]);

  const openFilters = () => {
    setShowFilters(v => !v);
    if (!filterData) {
      Promise.all([api.get('/structures'), api.get('/clients'), api.get('/segnalazioni/assignees')])
        .then(([s, c, a]) => setFilterData({ structures: s.data, clients: c.data, assignees: a.data }))
        .catch(() => setFilterData({ structures: [], clients: [], assignees: [] }));
    }
  };

  const refresh = () => { loadCounters(); loadList(1); };

  const grouped = useMemo(() => {
    if (viewMode === 'list') return null;
    const keyFn = {
      assignee: (i) => (i.assignee_names?.length ? i.assignee_names.join(' + ') : 'Non assegnate'),
      structure: (i) => i.structure_name || 'Senza struttura',
      type: (i) => TYPE_META[i.type]?.label || i.type,
    }[viewMode];
    const out = {};
    items.forEach(i => { const k = keyFn(i); (out[k] = out[k] || []).push(i); });
    return Object.entries(out).sort((a, b) => {
      if (a[0] === 'Non assegnate') return 1;
      if (b[0] === 'Non assegnate') return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [items, viewMode]);

  const kpi = counters?.kpi || {};
  const openSeg = (id) => navigate(`/segnalazioni/${id}`);

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="segnalazioni-page">
      <PageHeader
        title="Segnalazioni"
        actions={<>
          <Button variant="outline" onClick={() => setMyTasksOpen(true)} data-testid="my-tasks-btn">
            <ClipboardList className="h-4 w-4 mr-1.5" />I miei task
          </Button>
          <Button onClick={() => setNewOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="new-segnalazione-btn">
            <Plus className="h-4 w-4 mr-1.5" />Nuova segnalazione
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setConfigOpen(true)} title="Impostazioni Segnalazioni" data-testid="segnalazioni-settings-btn">
            <Settings className="h-4 w-4" />
          </Button>
        </>}
      />

      {/* KPI */}
      {counters === null ? <KpiSkeleton count={6} /> : (
        <KpiGrid cols={6} testId="segnalazioni-kpi">
          <KpiCard label="Da valutare" value={kpi.da_valutare} accent={kpi.da_valutare > 0 ? 'text-fuchsia-600' : ''} testId="kpi-da-valutare" />
          <KpiCard label="Aperte" value={kpi.aperte} testId="kpi-aperte" />
          <KpiCard label="In corso" value={kpi.in_corso} testId="kpi-in-corso" />
          <KpiCard label="In attesa" value={kpi.in_attesa} testId="kpi-in-attesa" />
          <KpiCard label="Urgenti" value={kpi.urgent} accent={kpi.urgent > 0 ? 'text-red-600' : ''} testId="kpi-urgenti" />
          <KpiCard label="Risolte questo mese" value={kpi.resolved_month} accent="text-emerald-600" testId="kpi-risolte-mese" />
        </KpiGrid>
      )}

      {/* PRIMO LIVELLO: tipo */}
      <div className="flex gap-1 border-b border-border overflow-x-auto" data-testid="type-tabs">
        {[['all', 'Tutte'], ...Object.entries(TYPE_META).map(([k, v]) => [k, v.label])].map(([k, label]) => (
          <button key={k} onClick={() => { setTypeFilter(k); }}
            className={cn('px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px flex items-center gap-2',
              typeFilter === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
            data-testid={`type-tab-${k}`}>
            {label}
            <span className={cn('text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full',
              typeFilter === k ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}
              data-testid={`type-count-${k}`}>
              {counters?.types?.[k] ?? '—'}
            </span>
          </button>
        ))}
      </div>

      {/* SECONDO LIVELLO: stato */}
      <div className="flex gap-1.5 flex-wrap items-center" data-testid="status-pills">
        {STATUS_PILLS.map(s => {
          const n = s.key === 'active' ? null : counters?.statuses?.[s.key];
          return (
            <button key={s.key} onClick={() => setStatusFilter(s.key)}
              className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                statusFilter === s.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
              data-testid={`status-pill-${s.key}`}>
              {s.label}{n != null && n > 0 && <span className="ml-1.5 tabular-nums opacity-80">{n}</span>}
            </button>
          );
        })}
        <button onClick={openFilters}
          className={cn('ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
            showFilters ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground')}
          data-testid="toggle-filters-btn">
          <SlidersHorizontal className="h-3.5 w-3.5" />Filtri
        </button>
      </div>

      {/* TERZO LIVELLO: filtri secondari */}
      {showFilters && (
        <div className="flex gap-2 flex-wrap items-center rounded-xl border border-border bg-muted/20 p-3" data-testid="secondary-filters">
          <MiniSelect value={filters.client_id} onChange={v => setFilters(f => ({ ...f, client_id: v }))} placeholder="Cliente"
            options={(filterData?.clients || []).map(c => [c.id, c.display_name || c.name])} testId="filter-client" />
          <MiniSelect value={filters.structure_id} onChange={v => setFilters(f => ({ ...f, structure_id: v }))} placeholder="Struttura"
            options={(filterData?.structures || []).map(s => [s.id, s.name])} testId="filter-structure" />
          <MiniSelect value={filters.assignee} onChange={v => setFilters(f => ({ ...f, assignee: v }))} placeholder="Assegnatario"
            options={(filterData?.assignees || []).map(u => [u.name, u.name])} testId="filter-assignee" />
          <MiniSelect value={filters.priority} onChange={v => setFilters(f => ({ ...f, priority: v }))} placeholder="Priorità"
            options={Object.entries(PRIORITY_META).map(([k, v]) => [k, v.label])} testId="filter-priority" />
          <MiniSelect value={filters.origin} onChange={v => setFilters(f => ({ ...f, origin: v }))} placeholder="Origine"
            options={Object.entries(ORIGIN_META).map(([k, v]) => [k, v])} testId="filter-origin" />
          <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-date-from" />
          <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="filter-date-to" />
          <button onClick={() => setFilters({ priority: '', structure_id: '', client_id: '', assignee: '', origin: '', date_from: '', date_to: '' })}
            className="text-sm text-muted-foreground hover:text-foreground underline" data-testid="clear-filters-btn">Azzera</button>
        </div>
      )}

      {/* Visualizza come + ricerca */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground">Visualizza come:</span>
        {VIEW_MODES.map(v => (
          <button key={v.key} onClick={() => setViewMode(v.key)}
            className={cn('px-2.5 py-1 rounded-md text-sm font-medium',
              viewMode === v.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground')}
            data-testid={`view-mode-${v.key}`}>{v.label}</button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca..." className="h-8 pl-8 w-48 text-sm" data-testid="segnalazioni-search" />
        </div>
      </div>

      {/* Lista */}
      {loading && items.length === 0 ? (
        <ListSkeleton rows={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={AlertTriangle} message="Nessuna segnalazione con questi filtri." />
      ) : viewMode === 'list' ? (
        <SegTable items={items} onOpen={openSeg} />
      ) : (
        <div className="space-y-5">
          {grouped.map(([groupName, list]) => (
            <div key={groupName}>
              <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-2">
                {groupName} <span className="text-xs font-semibold bg-muted px-1.5 py-0.5 rounded-full">{list.length}</span>
              </p>
              <SegTable items={list} onOpen={openSeg} hideCol={viewMode} />
            </div>
          ))}
        </div>
      )}

      {viewMode === 'list' && items.length < total && (
        <div className="text-center">
          <Button variant="outline" onClick={() => loadList(page + 1, true)} disabled={loading} data-testid="load-more-btn">
            <ChevronDown className="h-4 w-4 mr-1.5" />Carica altre ({total - items.length})
          </Button>
        </div>
      )}

      {/* Dialogs */}
      {newOpen && <NewSegnalazioneDialog onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); refresh(); }} />}
      {configOpen && <SegnalazioniConfigDialog scope="company" onClose={() => setConfigOpen(false)} />}
      {myTasksOpen && <MyTasksSheet onClose={() => setMyTasksOpen(false)} onOpenSeg={openSeg} />}
    </div>
  );
}

function MiniSelect({ value, onChange, placeholder, options, testId }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={cn('h-8 rounded-md border border-border bg-background px-2 text-sm max-w-[170px]', !value && 'text-muted-foreground')}
      data-testid={testId}>
      <option value="">{placeholder}</option>
      {options.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
    </select>
  );
}

export function SegTable({ items, onOpen, hideCol }) {
  return (
    <>
      {/* Desktop */}
      <div className="hidden lg:block rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 w-24">Priorità</th>
              <th className="px-3 py-2.5">Problema</th>
              {hideCol !== 'structure' && <th className="px-3 py-2.5">Struttura</th>}
              <th className="px-3 py-2.5">Cliente</th>
              {hideCol !== 'type' && <th className="px-3 py-2.5">Tipo</th>}
              {hideCol !== 'assignee' && <th className="px-3 py-2.5">Assegnatario</th>}
              <th className="px-3 py-2.5 w-20">Età</th>
              <th className="px-3 py-2.5 w-28">Stato</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => {
              const pr = PRIORITY_META[i.priority] || PRIORITY_META.normal;
              const st = SEG_STATUS_META[i.op_status] || SEG_STATUS_META[i.status];
              return (
                <tr key={i.id} onClick={() => onOpen(i.id)}
                  className="border-t border-border hover:bg-accent/40 cursor-pointer transition-colors"
                  data-testid={`seg-row-${i.id}`}>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', pr.dot)} />
                      <span className={cn('text-xs font-medium', i.priority === 'urgent' && 'text-red-600 font-bold')}>{pr.label}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold truncate max-w-[280px]">{i.title}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[280px]">{i.origin_label || ORIGIN_META[i.origin_type]}</p>
                  </td>
                  {hideCol !== 'structure' && (
                    <td className="px-3 py-2.5">
                      <p className="font-medium truncate max-w-[160px]">{i.structure_name || '—'}</p>
                      {i.klv_code && <p className="font-mono text-xs text-primary font-bold">{i.klv_code}</p>}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[140px]">{i.client_name || '—'}</td>
                  {hideCol !== 'type' && (
                    <td className="px-3 py-2.5">
                      <span className={cn('text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap', TYPE_META[i.type]?.cls)}>{TYPE_META[i.type]?.single || i.type}</span>
                    </td>
                  )}
                  {hideCol !== 'assignee' && (
                    <td className="px-3 py-2.5 text-muted-foreground truncate max-w-[140px]">{i.assignee_names?.length ? i.assignee_names.join(' + ') : '—'}</td>
                  )}
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums" data-testid={`seg-age-${i.id}`}>{ageLabel(i.created_at)}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap', st?.cls)} data-testid={`seg-status-${i.id}`}>{st?.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="lg:hidden space-y-2">
        {items.map(i => {
          const pr = PRIORITY_META[i.priority] || PRIORITY_META.normal;
          const st = SEG_STATUS_META[i.op_status] || SEG_STATUS_META[i.status];
          return (
            <div key={i.id} onClick={() => onOpen(i.id)}
              className="rounded-xl border border-border bg-card p-3 space-y-1.5 cursor-pointer active:bg-accent/40"
              data-testid={`seg-card-${i.id}`}>
              <div className="flex items-center gap-2">
                <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', pr.dot)} />
                <p className="font-semibold flex-1 min-w-0 truncate">{i.title}</p>
                <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0', st?.cls)}>{st?.label}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                <span className={cn('font-semibold px-1.5 py-0.5 rounded-full', TYPE_META[i.type]?.cls)}>{TYPE_META[i.type]?.single}</span>
                {i.klv_code && <span className="font-mono text-primary font-bold">{i.klv_code}</span>}
                <span className="truncate">{i.structure_name || ''}</span>
                <span className="ml-auto tabular-nums">{ageLabel(i.created_at)}</span>
              </div>
              {i.assignee_names?.length > 0 && <p className="text-xs text-muted-foreground">→ {i.assignee_names.join(' + ')}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
