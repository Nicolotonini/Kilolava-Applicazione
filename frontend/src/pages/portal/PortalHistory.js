import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ShoppingCart, Package, ChevronRight, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_BADGE = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  confirmed: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  in_preparation: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  assigned: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_LABELS = {
  draft: 'Bozza', submitted: 'Inviato', confirmed: 'Confermato',
  in_preparation: 'In preparazione', assigned: 'Assegnato',
  delivered: 'Consegnato', completed: 'Completato', cancelled: 'Annullato',
};

const PortalHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const load = async () => {
      try {
        const params = {};
        if (statusFilter !== 'all') params.status = statusFilter;
        const res = await portalApi.getOrders(params);
        setOrders(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [statusFilter]);

  return (
    <div className="space-y-4" data-testid="portal-history">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-heading font-semibold">Storico Ordini</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun ordine trovato</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(order => (
            <Card key={order.id} className="border cursor-pointer hover:ring-1 hover:ring-[#F24E75]/30 transition-all"
              onClick={() => navigate(`/portal/orders/${order.id}`)} data-testid={`order-${order.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">{order.order_number}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_BADGE[order.status])}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ordinato {new Date(order.created_at).toLocaleDateString('it-IT')} - {order.items?.length || 0} articoli
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3" />
                      Consegna: {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} {order.delivery_slot}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-lg font-bold">€{(order.total || 0).toFixed(2)}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortalHistory;
