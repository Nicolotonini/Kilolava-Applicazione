import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { portalApi } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  CalendarDays, Truck, ShoppingCart, BarChart3, Package,
  ArrowRight, Check, Clock, AlertTriangle
} from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_COLORS = {
  scheduled: 'text-blue-600', pending: 'text-blue-600', assigned: 'text-blue-600',
  completed: 'text-green-600', in_progress: 'text-amber-600',
  submitted: 'text-blue-600', confirmed: 'text-green-600',
  delivered: 'text-green-600', cancelled: 'text-red-500',
};

const PortalDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await portalApi.getDashboard();
        setData(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div className="text-center py-16 text-muted-foreground">Caricamento...</div>;
  if (!data) return <div className="text-center py-16 text-muted-foreground">Errore caricamento dati</div>;

  return (
    <div className="space-y-6" data-testid="portal-dashboard">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-heading font-semibold">Buongiorno, {data.client_name || user?.name}</h1>
        <p className="text-sm text-muted-foreground mt-1">Ecco il riepilogo delle tue attivita</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={CalendarDays} label="Pulizie completate" value={data.completed_cleanings_count} sub="questo mese" color="text-green-600" />
        <StatCard icon={Truck} label="Consegne in arrivo" value={data.upcoming_deliveries?.length || 0} sub="prossime" color="text-blue-600" />
        <StatCard icon={ShoppingCart} label="Ordini recenti" value={data.recent_orders?.length || 0} sub="ultimi" color="text-amber-600" />
        <StatCard icon={BarChart3} label="Totale mese" value={`€${(data.month_total || 0).toFixed(2)}`} sub="stimato" color="text-[#F24E75]" />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        {data.ordering_enabled && (
          <Button onClick={() => navigate('/portal/orders/new')} className="bg-[#F24E75] hover:bg-[#E03B62] text-white gap-2" data-testid="quick-new-order">
            <ShoppingCart className="h-4 w-4" />Nuovo ordine
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate('/portal/history')} className="gap-2" data-testid="quick-history">
          <Clock className="h-4 w-4" />Storico ordini
        </Button>
        <Button variant="outline" onClick={() => navigate('/portal/report')} className="gap-2">
          <BarChart3 className="h-4 w-4" />Report mensile
        </Button>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Cleanings */}
        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />Prossime pulizie</h3>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/portal/services')}>Vedi tutte<ArrowRight className="h-3 w-3 ml-1" /></Button>
            </div>
            {data.upcoming_cleanings?.length > 0 ? (
              <div className="space-y-2">
                {data.upcoming_cleanings.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{c.structure_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                    </div>
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", c.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300')}>
                      {c.status === 'completed' ? 'Completata' : 'Programmata'}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4 text-center">Nessuna pulizia programmata</p>}
          </CardContent>
        </Card>

        {/* Upcoming Deliveries */}
        <Card className="border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />Consegne in arrivo</h3>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/portal/services')}>Vedi tutte<ArrowRight className="h-3 w-3 ml-1" /></Button>
            </div>
            {data.upcoming_deliveries?.length > 0 ? (
              <div className="space-y-2">
                {data.upcoming_deliveries.map(d => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{d.structure_name || d.address || 'Consegna'}</p>
                      <p className="text-xs text-muted-foreground">{new Date(d.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} - {d.items_count} articoli</p>
                    </div>
                    <span className={cn("text-xs font-medium", STATUS_COLORS[d.status] || 'text-muted-foreground')}>{d.status}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground py-4 text-center">Nessuna consegna in arrivo</p>}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        {data.recent_orders?.length > 0 && (
          <Card className="border lg:col-span-2">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />Ordini recenti</h3>
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate('/portal/history')}>Vedi tutti<ArrowRight className="h-3 w-3 ml-1" /></Button>
              </div>
              <div className="space-y-2">
                {data.recent_orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-accent/30 rounded -mx-2 px-2 transition-colors"
                    onClick={() => navigate(`/portal/orders/${o.id}`)}>
                    <div>
                      <p className="text-sm font-medium">{o.order_number}</p>
                      <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('it-IT')} - {o.items?.length} articoli</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">€{(o.total || 0).toFixed(2)}</p>
                      <span className={cn("text-xs font-medium", STATUS_COLORS[o.status] || 'text-muted-foreground')}>{o.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, sub, color }) => (
  <Card className="border">
    <CardContent className="p-4">
      <Icon className={cn("h-5 w-5 mb-2", color)} />
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </CardContent>
  </Card>
);

export default PortalDashboard;
