import React, { useState, useEffect } from 'react';
import { portalApi } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { BarChart3, ChevronLeft, ChevronRight, Package, CalendarDays, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';

// Report canonico (client_orders + cleaning_tasks + Consegne): conteggi operativi, nessun dato economico legacy
const CAT_LABELS = {
  cleaning: 'Pulizia', private_laundry: 'Lavanderia privata',
  linen_rental: 'Noleggio biancheria', consumables: 'Forniture', cleaning_products: 'Prodotti Pulizie',
  maintenance: 'Manutenzione', extras: 'Extra', other: 'Altro',
};
const CAT_COLORS = {
  cleaning: 'bg-blue-500', private_laundry: 'bg-purple-500',
  linen_rental: 'bg-teal-500', consumables: 'bg-amber-500', cleaning_products: 'bg-sky-500',
  maintenance: 'bg-orange-500', extras: 'bg-pink-500', other: 'bg-gray-500',
};

const PortalReport = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await portalApi.getReport({ month });
        setReport(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [month]);

  const shiftMonth = (dir) => {
    const [y, m] = month.split('-').map(Number);
    let nm = m + dir, ny = y;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    setMonth(`${ny}-${String(nm).padStart(2, '0')}`);
  };

  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  if (loading) return <div className="text-center py-16 text-muted-foreground">Caricamento...</div>;

  const breakdown = report?.breakdown || {};
  const breakdownEntries = Object.entries(breakdown).sort((a, b) => b[1].count - a[1].count);
  const maxBreakdown = Math.max(...breakdownEntries.map(([_, v]) => v.count), 1);

  return (
    <div className="space-y-6" data-testid="portal-report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-heading font-semibold">Report Mensile</h1>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-3 text-sm font-medium capitalize min-w-[140px] text-center">{monthLabel}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border">
          <CardContent className="p-4">
            <CalendarDays className="h-5 w-5 text-blue-600 mb-2" />
            <p className="text-2xl font-bold">{report?.cleaning_count || 0}</p>
            <p className="text-xs text-muted-foreground">Pulizie</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-4">
            <Package className="h-5 w-5 text-amber-600 mb-2" />
            <p className="text-2xl font-bold">{report?.orders_count || 0}</p>
            <p className="text-xs text-muted-foreground">Ordini</p>
          </CardContent>
        </Card>
        <Card className="border col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <Truck className="h-5 w-5 text-[#F24E75] mb-2" />
            <p className="text-2xl font-bold" data-testid="portal-report-deliveries">{report?.deliveries_count || 0}</p>
            <p className="text-xs text-muted-foreground">Consegne completate</p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown */}
      {breakdownEntries.length > 0 && (
        <Card className="border">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-4">Dettaglio per categoria</h3>
            <div className="space-y-3">
              {breakdownEntries.map(([cat, data]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{CAT_LABELS[cat] || cat}</span>
                    <span className="font-semibold">{data.count} pz</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all duration-500", CAT_COLORS[cat] || 'bg-gray-500')}
                      style={{ width: `${(data.count / maxBreakdown) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* History */}
      {report?.history?.length > 0 && (
        <Card className="border">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Mesi precedenti</h3>
            <div className="space-y-2">
              {report.history.filter(h => h.orders > 0 || h.cleanings > 0).map(h => (
                <div key={h.month} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm capitalize">
                    {new Date(h.month + '-01T00:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{h.cleanings || 0} pulizie</span>
                    <span className="text-xs text-muted-foreground ml-2">({h.orders} ordini)</span>
                  </div>
                </div>
              ))}
              {report.history.every(h => !h.orders && !h.cleanings) && (
                <p className="text-sm text-muted-foreground text-center py-4">Nessun dato storico</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PortalReport;
