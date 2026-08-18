import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { dashboardApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import {
  TrendingUp, Sparkles, Shirt, Package, Wrench,
  AlertTriangle, Clock, ShoppingCart, ArrowRight,
  CheckCircle2, XCircle, Users, LayoutDashboard, BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';
import ReportsPage from './ReportsPage';

const DashboardPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [operations, setOperations] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, dashRes, opsRes, invRes] = await Promise.all([
          dashboardApi.getStats(),
          api.get('/reports/dashboard'),
          api.get('/reports/operations'),
          api.get('/reports/inventory'),
        ]);
        setStats(statsRes.data);
        setDashboard(dashRes.data);
        setOperations(opsRes.data);
        setInventory(invRes.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="p-4 lg:p-6" data-testid="dashboard-page">
        <div className="text-center py-16 text-muted-foreground">Caricamento dashboard...</div>
      </div>
    );
  }

  const d = dashboard || {};
  const ops = operations || {};
  const inv = inventory || {};

  // Calculate operations today
  const cleaningTotal = d.cleaning?.total || 0;
  const cleaningDone = d.cleaning?.completed || 0;
  const cleaningMissing = cleaningTotal - cleaningDone;

  const logisticsTotal = d.logistics?.total || 0;
  const logisticsDone = d.logistics?.completed || 0;
  const logisticsMissing = logisticsTotal - logisticsDone;

  const maintTotal = d.maintenance?.total || 0;
  const maintResolved = d.maintenance?.resolved || 0;
  const maintOpen = d.maintenance?.open || 0;

  // Alerts
  const alerts = [];
  if (inv.low_stock?.length > 0) {
    alerts.push({ type: 'warning', icon: Package, label: `${inv.low_stock.length} articoli sotto soglia minima`, link: '/inventory', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' });
  }
  if ((ops.cleaning?.overdue || 0) > 0) {
    alerts.push({ type: 'danger', icon: Clock, label: `${ops.cleaning.overdue} pulizie in ritardo`, link: '/cleaning', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' });
  }
  if ((ops.logistics?.overdue || 0) > 0) {
    alerts.push({ type: 'danger', icon: Clock, label: `${ops.logistics.overdue} consegne in ritardo`, link: '/logistics', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' });
  }
  if (maintOpen > 0) {
    alerts.push({ type: 'warning', icon: Wrench, label: `${maintOpen} manutenzioni aperte`, link: '/maintenance', color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800' });
  }
  if ((d.orders_total || 0) > 0) {
    alerts.push({ type: 'info', icon: ShoppingCart, label: `${d.orders_total} nuovi ordini questo mese`, link: '/logistics', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' });
  }

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">
            Ciao, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground">Panoramica operativa</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors",
            tab === 'overview' ? "bg-[#F24E75]/10 text-[#F24E75] border-b-2 border-[#F24E75]" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab('overview')}
          data-testid="dashboard-tab-overview"
        >
          <LayoutDashboard className="h-3.5 w-3.5" />Panoramica
        </button>
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors",
            tab === 'reports' ? "bg-[#F24E75]/10 text-[#F24E75] border-b-2 border-[#F24E75]" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab('reports')}
          data-testid="dashboard-tab-reports"
        >
          <BarChart3 className="h-3.5 w-3.5" />Report
        </button>
      </div>

      {tab === 'overview' && (
      <>
      {/* ROW 1 — KPI ECONOMICI */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Fatturato del mese</h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Revenue Total */}
          <Card className="border col-span-2 lg:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <span className="text-xs text-muted-foreground">Totale</span>
              </div>
              <p className="text-2xl font-bold tabular-nums" data-testid="kpi-revenue">
                {(d.revenue_estimated || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </p>
            </CardContent>
          </Card>

          {/* Cleaning Revenue */}
          <KpiCard icon={Sparkles} label="Pulizie" value={0} color="violet" testId="kpi-cleaning" />
          {/* Laundry Revenue */}
          <Card className="border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Shirt className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-xs text-muted-foreground">Lavanderia</span>
              </div>
              <p className="text-2xl font-bold tabular-nums" data-testid="kpi-laundry">{formatCurrency(0)}</p>
              <div className="flex gap-3 mt-1">
                <span className="text-[10px] text-muted-foreground">Privata: {formatCurrency(0)}</span>
                <span className="text-[10px] text-muted-foreground">Noleggio: {formatCurrency(0)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Consumables */}
          <KpiCard icon={Package} label="Consumabili" value={0} color="teal" testId="kpi-consumables" />
          {/* Clients */}
          <KpiCard icon={Users} label="Clienti attivi" value={d.active_clients || 0} color="pink" testId="kpi-clients" isCurrency={false} />
        </div>
      </div>

      {/* ROW 2 — OPERATIVITA' OGGI */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Operativita del mese</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OpsCard
            icon={Sparkles}
            label="Pulizie"
            total={cleaningTotal}
            completed={cleaningDone}
            missing={cleaningMissing}
            color="violet"
            link="/cleaning"
            testId="ops-cleaning"
          />
          <OpsCard
            icon={Shirt}
            label="Biancheria"
            total={logisticsTotal}
            completed={logisticsDone}
            missing={logisticsMissing}
            color="blue"
            link="/logistics"
            testId="ops-laundry"
          />
          <OpsCard
            icon={Package}
            label="Consumabili"
            total={inv.total_movements || 0}
            completed={inv.total_movements || 0}
            missing={0}
            color="teal"
            link="/inventory"
            testId="ops-consumables"
          />
          <OpsCard
            icon={Wrench}
            label="Manutenzioni"
            total={maintTotal}
            completed={maintResolved}
            missing={maintOpen}
            color="orange"
            link="/maintenance"
            testId="ops-maintenance"
          />
        </div>
      </div>

      {/* ROW 3 — ALERT */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Alert e notifiche</h2>
        {alerts.length === 0 ? (
          <Card className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Nessun alert. Tutto sotto controllo!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <Link key={i} to={alert.link} className="block">
                <Card className={cn('border transition-colors hover:shadow-sm', alert.border, alert.bg)}>
                  <CardContent className="p-3.5 flex items-center gap-3">
                    <alert.icon className={cn('h-4.5 w-4.5', alert.color)} />
                    <p className={cn('text-sm font-medium flex-1', alert.color)}>{alert.label}</p>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {tab === 'reports' && <ReportsPage embedded />}
    </div>
  );
};

function formatCurrency(v) {
  return (v || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

function KpiCard({ icon: Icon, label, value, color, testId, isCurrency = true }) {
  const colors = {
    violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600' },
    blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600' },
    teal: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-600' },
    pink: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-600' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600' },
  };
  const c = colors[color] || colors.blue;
  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', c.bg)}>
            <Icon className={cn('h-4 w-4', c.text)} />
          </div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold tabular-nums" data-testid={testId}>
          {isCurrency ? formatCurrency(value) : value}
        </p>
      </CardContent>
    </Card>
  );
}

function OpsCard({ icon: Icon, label, total, completed, missing, color, link, testId }) {
  const colors = {
    violet: { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-600', bar: 'bg-violet-500' },
    blue: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600', bar: 'bg-blue-500' },
    teal: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-600', bar: 'bg-teal-500' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600', bar: 'bg-orange-500' },
  };
  const c = colors[color] || colors.blue;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Link to={link} className="block">
      <Card className="border hover:shadow-sm transition-shadow cursor-pointer h-full" data-testid={testId}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', c.bg)}>
              <Icon className={cn('h-4 w-4', c.text)} />
            </div>
            <span className="text-sm font-semibold">{label}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Totali</span>
              <span className="font-semibold tabular-nums">{total}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Completate</span>
              <span className="font-semibold tabular-nums text-emerald-600">{completed}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-red-500 flex items-center gap-1"><XCircle className="h-3 w-3" />Mancanti</span>
              <span className="font-semibold tabular-nums text-red-500">{missing}</span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
              <div className={cn('h-full rounded-full transition-all', c.bar)} style={{ width: `${pct}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default DashboardPage;
