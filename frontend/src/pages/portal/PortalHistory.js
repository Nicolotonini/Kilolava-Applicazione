import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ShoppingCart, Package, ChevronRight, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

// Fonte canonica: /portal/ordini (client_orders + richieste + Consegne). Il vecchio db.orders è solo storico legacy.
export const ORDER_STATUS_META = {
  in_revisione: { label: 'In revisione', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  confermato: { label: 'Confermato', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  pianificato: { label: 'In consegna', cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  parziale: { label: 'Consegna parziale', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  consegnato: { label: 'Consegnato', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  annullato: { label: 'Annullato', cls: 'bg-muted text-muted-foreground' },
};

const PortalHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    api.get('/portal/ordini')
      .then(r => setOrders(r.data || []))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const shown = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter);

  return (
    <div className="p-4 lg:p-8 space-y-6" data-testid="portal-history">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-heading font-semibold">Storico Ordini</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9" data-testid="history-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(ORDER_STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun ordine trovato</p>
          <Button onClick={() => navigate('/portal/orders/new')} variant="outline" className="mt-4 gap-2" data-testid="history-new-order">
            <ShoppingCart className="h-4 w-4" />Nuovo ordine
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(order => {
            const meta = ORDER_STATUS_META[order.status] || { label: order.status, cls: 'bg-muted text-muted-foreground' };
            const pezzi = (order.items || []).reduce((n, i) => n + (i.qty || 0), 0);
            return (
              <Card key={order.id} className="border cursor-pointer hover:ring-1 hover:ring-[#F24E75]/30 transition-all"
                onClick={() => navigate(`/portal/orders/${order.id}`)} data-testid={`order-${order.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{order.order_number}</span>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', meta.cls)} data-testid={`order-status-${order.id}`}>{meta.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ordinato {new Date(order.created_at).toLocaleDateString('it-IT')} · {order.structure_name || 'Struttura'} · {order.items?.length || 0} articoli ({pezzi} pz)
                      </p>
                      {order.date_preferred && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          Consegna richiesta: {new Date(order.date_preferred + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} {order.time_window || ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PortalHistory;
