import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  TrendingUp, Sparkles, Shirt, Package, Wrench, Truck,
  CheckCircle2, ArrowRight, PackageX, AlertTriangle, Clock, ShoppingCart,
} from 'lucide-react';
import { cn } from '../lib/utils';

const PERIODS = [
  { key: 'today', label: 'Oggi' },
  { key: 'week', label: 'Settimana' },
  { key: 'month', label: 'Mese corrente' },
  { key: 'custom', label: 'Personalizzato' },
];

const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function getRange(period, customFrom, customTo) {
  const today = new Date();
  if (period === 'today') return { from: localIso(today), to: localIso(addDays(today, 1)) };
  if (period === 'week') {
    const day = (today.getDay() + 6) % 7;
    const monday = addDays(today, -day);
    return { from: localIso(monday), to: localIso(addDays(monday, 7)) };
  }
  if (period === 'custom' && customFrom && customTo) {
    return { from: customFrom, to: localIso(addDays(new Date(customTo), 1)) };
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { from: localIso(first), to: localIso(next) };
}

const fmtEur = (v) => (v || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

const ATTENTION_META = {
  negative_stock: {
    icon: PackageX,
    label: (a) => (a.count === 1 && a.detail ? `${a.detail} — magazzino negativo` : `${a.count} strutture con magazzino negativo`),
  },
  below_threshold: { icon: Package, label: (a) => `${a.count} articoli sotto soglia minima` },
  overdue_cleaning: { icon: Clock, label: (a) => `${a.count} pulizie in ritardo` },
  overdue_deliveries: { icon: Clock, label: (a) => `${a.count} consegne in ritardo` },
  urgent_maintenance: { icon: Wrench, label: (a) => `${a.count} manutenzioni urgenti` },
  orders_to_verify: { icon: ShoppingCart, label: (a) => `${a.count} nuovi ordini da verificare` },
};

const SEVERITY_STYLES = {
  danger: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-primary',
};

const DashboardPage = () => {
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => getRange(period, customFrom, customTo), [period, customFrom, customTo]);

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/dashboard/overview?date_from=${range.from}&date_to=${range.to}`)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, period, customFrom, customTo]);

  const rev = data?.revenue || {};
  const today = data?.today || {};
  const attention = data?.attention || [];

  return (
    <div className="p-4 lg:p-8 space-y-8" data-testid="dashboard-page">
      {/* SECTION 1 — FATTURATO */}
      <section>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fatturato</h2>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="period-selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.key} value={p.key} data-testid={`period-${p.key}`}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period === 'custom' && (
              <>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-[140px] text-xs" data-testid="period-from" />
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-[140px] text-xs" data-testid="period-to" />
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <RevenueCard icon={TrendingUp} label="Fatturato Totale" value={rev.total} loading={loading} highlight testId="kpi-revenue" />
          <RevenueCard icon={Sparkles} label="Pulizie" value={rev.cleaning} loading={loading} testId="kpi-cleaning" />
          <Card className="border shadow-none">
            <CardContent className="p-4 lg:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Shirt className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Lavanderia</span>
              </div>
              <p className="text-2xl lg:text-3xl font-semibold tabular-nums" data-testid="kpi-laundry">
                {loading ? '—' : fmtEur(rev.laundry?.total)}
              </p>
              <div className="flex gap-4 mt-2">
                <span className="text-xs text-muted-foreground">Privata <strong className="text-foreground tabular-nums">{fmtEur(rev.laundry?.private)}</strong></span>
                <span className="text-xs text-muted-foreground">Noleggio <strong className="text-foreground tabular-nums">{fmtEur(rev.laundry?.rental)}</strong></span>
              </div>
            </CardContent>
          </Card>
          <RevenueCard icon={Package} label="Consumabili" value={rev.consumables} loading={loading} testId="kpi-consumables" />
        </div>
      </section>

      {/* SECTION 2 — OGGI */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Oggi</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <TodayCard icon={Sparkles} label="Pulizie" data={today.cleaning} link="/cleaning" loading={loading} testId="today-cleaning" />
          <TodayCard icon={Shirt} label="Consegne Biancheria" data={today.deliveries_linen} link="/logistics" loading={loading} testId="today-linen" />
          <TodayCard icon={Truck} label="Consegne Consumabili" data={today.deliveries_consumables} link="/logistics" loading={loading} testId="today-consumables" />
          <TodayCard icon={Wrench} label="Manutenzioni" data={today.maintenance} link="/maintenance" loading={loading} testId="today-maintenance" />
        </div>
      </section>

      {/* SECTION 3 — RICHIEDE ATTENZIONE */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Richiede attenzione</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground py-2">Caricamento...</p>
        ) : attention.length === 0 ? (
          <div className="flex items-center gap-2.5 py-3 px-4 rounded-lg border border-border bg-card" data-testid="attention-empty">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm text-muted-foreground">Nessun avviso. Tutto sotto controllo.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border" data-testid="attention-list">
            {attention.map((a, i) => {
              const meta = ATTENTION_META[a.type] || { icon: AlertTriangle, label: (x) => `${x.count} avvisi` };
              const Icon = meta.icon;
              return (
                <Link
                  key={i}
                  to={a.link || '/dashboard'}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors group"
                  data-testid={`attention-${a.type}`}
                >
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', SEVERITY_STYLES[a.severity] || 'bg-muted-foreground')} />
                  <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm flex-1 min-w-0 truncate">{meta.label(a)}</p>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

function RevenueCard({ icon: Icon, label, value, loading, highlight, testId }) {
  return (
    <Card className={cn('border shadow-none', highlight && 'border-primary/25')}>
      <CardContent className="p-4 lg:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon className={cn('h-4 w-4', highlight ? 'text-primary' : 'text-muted-foreground')} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl lg:text-3xl font-semibold tabular-nums" data-testid={testId}>
          {loading ? '—' : fmtEur(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function TodayCard({ icon: Icon, label, data, link, loading, testId }) {
  const total = data?.total || 0;
  const completed = data?.completed || 0;
  const missing = data?.missing || 0;
  return (
    <Link to={link} className="block group">
      <Card className="border shadow-none h-full transition-colors group-hover:border-primary/30" data-testid={testId}>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-2.5">
            <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground truncate">{label}</span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-3xl lg:text-4xl font-semibold tabular-nums leading-none">{loading ? '—' : total}</p>
            <div className="flex flex-col items-end gap-1 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-600 font-medium tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{completed} completate
              </span>
              <span className={cn('flex items-center gap-1.5 font-medium tabular-nums whitespace-nowrap', missing > 0 ? 'text-red-500' : 'text-muted-foreground')}>
                <span className={cn('w-1.5 h-1.5 rounded-full', missing > 0 ? 'bg-red-500' : 'bg-muted-foreground/40')} />{missing} mancanti
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default DashboardPage;
