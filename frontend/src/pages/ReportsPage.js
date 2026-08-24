import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  BarChart3, Users, Sparkles, Truck, Wrench, Package, ShoppingCart,
  TrendingUp, AlertTriangle, ChevronRight, Calendar, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { cn } from '../lib/utils';

const KPI = ({ label, value, sub, icon: Icon, color, trend }) => (
  <Card className="border">
    <CardContent className="p-4">
      <div className="flex items-start justify-between mb-2">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        {trend && (
          <span className={cn("text-xs flex items-center gap-0.5 font-medium", trend > 0 ? "text-green-600" : "text-red-500")}>
            {trend > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString('it-IT') : value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </CardContent>
  </Card>
);

const ProgressBar = ({ label, value, max, color = 'bg-[#F24E75]' }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} / {max} ({pct}%)</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const StatusTable = ({ title, data, labels }) => {
  if (!data || Object.keys(data).length === 0) return null;
  const total = Object.values(data).reduce((s, v) => s + v, 0);
  return (
    <Card className="border">
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
        <div className="space-y-2">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground capitalize">{labels?.[k] || k.replace(/_/g, ' ')}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium">{v}</span>
                <span className="text-xs text-muted-foreground w-8 text-right">{total > 0 ? Math.round((v / total) * 100) : 0}%</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ===== PERIOD SELECTOR =====
const PeriodSelector = ({ month, onMonthChange, dateFrom, dateTo, onDateFromChange, onDateToChange, onApply }) => {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) });
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={month} onValueChange={onMonthChange}>
        <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="period-month"><SelectValue /></SelectTrigger>
        <SelectContent>{months.map(m => <SelectItem key={m.value} value={m.value}><span className="capitalize">{m.label}</span></SelectItem>)}</SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">oppure</span>
      <Input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} className="h-8 w-[130px] text-xs" />
      <Input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)} className="h-8 w-[130px] text-xs" />
      {dateFrom && dateTo && <Button size="sm" className="h-8 text-xs" onClick={onApply}>Applica</Button>}
    </div>
  );
};

// ===== TABS =====
const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'clients', label: 'Clienti', icon: Users },
  { key: 'operations', label: 'Operazioni', icon: Sparkles },
  { key: 'inventory', label: 'Inventario', icon: Package },
];

// ===== MAIN PAGE =====
const ReportsPage = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customRange, setCustomRange] = useState(false);

  const [dashboard, setDashboard] = useState(null);
  const [operations, setOperations] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [clientsSummary, setClientsSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  const params = customRange && dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : { month };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'dashboard') {
        const res = await api.get('/reports/dashboard', { params });
        setDashboard(res.data);
      } else if (tab === 'operations') {
        const res = await api.get('/reports/operations', { params });
        setOperations(res.data);
      } else if (tab === 'inventory') {
        const res = await api.get('/reports/inventory', { params });
        setInventory(res.data);
      } else if (tab === 'clients') {
        const res = await api.get('/reports/clients-summary', { params });
        setClientsSummary(res.data);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [tab, month, customRange, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMonthChange = (v) => { setMonth(v); setCustomRange(false); };
  const handleApplyRange = () => { setCustomRange(true); };

  const STATUS_LABELS = {
    unassigned: 'Non assegnato', assigned: 'Assegnato', in_progress: 'In corso',
    completed: 'Completato', issue_reported: 'Problema', needs_review: 'Da verificare',
    open: 'Aperto', resolved: 'Risolto', closed: 'Chiuso',
  };
  const MAINT_CAT_LABELS = {
    electrical: 'Elettrico', plumbing: 'Idraulica', furniture: 'Arredamento',
    damage: 'Danno', missing_item: 'Mancante', broken_item: 'Rotto',
    missing_supplies: 'Materiale', maintenance: 'Manutenzione', other: 'Altro',
  };

  return (
    <div className={embedded ? "space-y-4" : "p-4 lg:p-6 space-y-4"} data-testid="reports-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {!embedded && (
          <div>
            <h1 className="text-xl lg:text-2xl font-heading font-semibold">Report</h1>
            <p className="text-sm text-muted-foreground">Analisi operativa e finanziaria</p>
          </div>
        )}
        <PeriodSelector month={month} onMonthChange={handleMonthChange}
          dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo}
          onApply={handleApplyRange} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors shrink-0",
            tab === t.key ? "bg-[#F24E75]/10 text-[#F24E75] border-b-2 border-[#F24E75]" : "text-muted-foreground hover:text-foreground"
          )} onClick={() => setTab(t.key)} data-testid={`tab-${t.key}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : (
        <>
          {/* DASHBOARD TAB */}
          {tab === 'dashboard' && dashboard && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KPI label="Revenue stimata" value={`€${dashboard.revenue_estimated.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`} icon={TrendingUp} color="bg-emerald-500" />
                <KPI label="Clienti attivi" value={dashboard.active_clients} icon={Users} color="bg-blue-500" />
                <KPI label="Ordini" value={dashboard.orders_total} icon={ShoppingCart} color="bg-purple-500" />
                <KPI label="Manutenzioni aperte" value={dashboard.maintenance.open} icon={Wrench} color="bg-orange-500" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="border"><CardContent className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Sparkles className="h-4 w-4 text-teal-500" />Pulizie</h3>
                  <p className="text-2xl font-bold">{dashboard.cleaning.total}</p>
                  <ProgressBar label="Completate" value={dashboard.cleaning.completed} max={dashboard.cleaning.total} color="bg-teal-500" />
                </CardContent></Card>
                <Card className="border"><CardContent className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Truck className="h-4 w-4 text-blue-500" />Logistica</h3>
                  <p className="text-2xl font-bold">{dashboard.logistics.total}</p>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                    <span>{dashboard.logistics.deliveries} consegne</span>
                    <span>{dashboard.logistics.pickups} ritiri</span>
                  </div>
                  <ProgressBar label="Completate" value={dashboard.logistics.completed} max={dashboard.logistics.total} color="bg-blue-500" />
                </CardContent></Card>
                <Card className="border"><CardContent className="p-4">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3"><Wrench className="h-4 w-4 text-orange-500" />Manutenzione</h3>
                  <p className="text-2xl font-bold">{dashboard.maintenance.total}</p>
                  <ProgressBar label="Risolte" value={dashboard.maintenance.resolved} max={dashboard.maintenance.total} color="bg-orange-500" />
                </CardContent></Card>
              </div>
            </div>
          )}

          {/* CLIENTS TAB */}
          {tab === 'clients' && (
            <div className="space-y-2">
              {clientsSummary.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Nessuna attivita nel periodo</div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium">Cliente</th>
                        <th className="text-center px-2 py-2.5 font-medium">Pulizie</th>
                        <th className="text-center px-2 py-2.5 font-medium">Logistica</th>
                        <th className="text-center px-2 py-2.5 font-medium">Ordini</th>
                        <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {clientsSummary.map(c => (
                        <tr key={c.client_id} className="hover:bg-accent/30 cursor-pointer" onClick={() => navigate(`/clients/${c.client_id}`)} data-testid={`client-row-${c.client_id}`}>
                          <td className="px-4 py-3 font-medium">{c.client_name}</td>
                          <td className="text-center px-2 py-3">{c.cleaning_count}</td>
                          <td className="text-center px-2 py-3">{c.logistics_count}</td>
                          <td className="text-center px-2 py-3">{c.order_count}</td>
                          <td className="text-right px-4 py-3 font-semibold">{c.revenue > 0 ? `€${c.revenue.toFixed(2)}` : '-'}</td>
                          <td className="px-2"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 font-semibold text-xs">
                      <tr>
                        <td className="px-4 py-2">Totale</td>
                        <td className="text-center px-2 py-2">{clientsSummary.reduce((s, c) => s + c.cleaning_count, 0)}</td>
                        <td className="text-center px-2 py-2">{clientsSummary.reduce((s, c) => s + c.logistics_count, 0)}</td>
                        <td className="text-center px-2 py-2">{clientsSummary.reduce((s, c) => s + c.order_count, 0)}</td>
                        <td className="text-right px-4 py-2">€{clientsSummary.reduce((s, c) => s + c.revenue, 0).toFixed(2)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* OPERATIONS TAB */}
          {tab === 'operations' && operations && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <StatusTable title="Pulizie per stato" data={operations.cleaning?.by_status} labels={STATUS_LABELS} />
              <StatusTable title="Logistica per stato" data={operations.logistics?.by_status} labels={STATUS_LABELS} />
              <StatusTable title="Manutenzione per stato" data={operations.maintenance?.by_status} labels={STATUS_LABELS} />
              <StatusTable title="Manutenzione per categoria" data={operations.maintenance?.by_category} labels={MAINT_CAT_LABELS} />
              {(operations.cleaning?.overdue > 0 || operations.logistics?.overdue > 0) && (
                <Card className="border border-red-200 dark:border-red-900/30">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1.5 mb-3"><AlertTriangle className="h-4 w-4" />Task in ritardo</h3>
                    {operations.cleaning?.overdue > 0 && <p className="text-sm">{operations.cleaning.overdue} pulizie in ritardo</p>}
                    {operations.logistics?.overdue > 0 && <p className="text-sm">{operations.logistics.overdue} consegne in ritardo</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* INVENTORY TAB */}
          {tab === 'inventory' && inventory && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KPI label="Movimenti totali" value={inventory.total_movements} icon={Package} color="bg-blue-500" />
                <KPI label="Consegne" value={inventory.by_type?.delivery || 0} icon={Truck} color="bg-teal-500" />
                <KPI label="Resi" value={inventory.by_type?.return || 0} icon={Package} color="bg-purple-500" />
              </div>

              {inventory.top_items && inventory.top_items.length > 0 && (
                <Card className="border">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Articoli piu movimentati</h3>
                    <div className="space-y-2">
                      {inventory.top_items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{item.name || item.article_id}</span>
                          <span className="font-medium">{item.quantity} pezzi</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {inventory.low_stock && inventory.low_stock.length > 0 && (
                <Card className="border border-amber-200 dark:border-amber-900/30">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-1.5 mb-3"><AlertTriangle className="h-4 w-4" />Stock sotto soglia</h3>
                    <div className="space-y-1.5">
                      {inventory.low_stock.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span>{item.name}</span>
                          <span className="text-red-600 font-medium">{item.quantity_available} / {item.minimum_threshold}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {(!inventory.top_items || inventory.top_items.length === 0) && inventory.total_movements === 0 && (
                <div className="text-center py-12 text-muted-foreground">Nessun movimento nel periodo</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportsPage;
