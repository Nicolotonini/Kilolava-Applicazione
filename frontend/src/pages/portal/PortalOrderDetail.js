import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { portalApi } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Package, CalendarDays, Clock, MapPin, Truck, X } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_BADGE = {
  draft: 'bg-slate-100 text-slate-700', submitted: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-cyan-100 text-cyan-700', in_preparation: 'bg-amber-100 text-amber-700',
  assigned: 'bg-indigo-100 text-indigo-700', delivered: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700',
};
const STATUS_LABELS = {
  draft: 'Bozza', submitted: 'Inviato', confirmed: 'Confermato',
  in_preparation: 'In preparazione', assigned: 'Assegnato',
  delivered: 'Consegnato', completed: 'Completato', cancelled: 'Annullato',
};

const PortalOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelDialog, setCancelDialog] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await portalApi.getOrder(orderId);
        setData(res.data);
      } catch (e) { console.error(e); toast.error('Ordine non trovato'); navigate('/portal/history'); }
      finally { setLoading(false); }
    };
    load();
  }, [orderId, navigate]);

  const handleCancel = async () => {
    try {
      await portalApi.cancelOrder(orderId);
      toast.success('Ordine annullato');
      setCancelDialog(false);
      // Reload
      const res = await portalApi.getOrder(orderId);
      setData(res.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  if (loading) return <div className="text-center py-16 text-muted-foreground">Caricamento...</div>;
  if (!data) return null;

  const order = data.order;
  const delivery = data.delivery_info;
  const canCancel = ['draft', 'submitted'].includes(order.status);

  return (
    <div className="max-w-2xl mx-auto space-y-4" data-testid="portal-order-detail">
      <Button variant="ghost" className="gap-2 -ml-2 text-muted-foreground" onClick={() => navigate('/portal/history')}>
        <ArrowLeft className="h-4 w-4" />Storico ordini
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-semibold">{order.order_number}</h1>
          <p className="text-xs text-muted-foreground">Ordinato il {new Date(order.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <span className={cn("text-xs px-3 py-1 rounded-full font-semibold", STATUS_BADGE[order.status] || 'bg-muted')}>
          {STATUS_LABELS[order.status] || order.status}
        </span>
      </div>

      {/* Status progress */}
      <Card className="border">
        <CardContent className="p-4">
          <div className="flex items-center gap-1 overflow-x-auto">
            {['submitted', 'confirmed', 'in_preparation', 'delivered', 'completed'].map((s, i, arr) => {
              const idx = arr.indexOf(order.status);
              const isActive = arr.indexOf(s) <= idx;
              const isCurrent = s === order.status;
              return (
                <React.Fragment key={s}>
                  <div className={cn(
                    "text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap",
                    isCurrent ? "bg-[#F24E75] text-white" : isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                  )}>
                    {STATUS_LABELS[s]}
                  </div>
                  {i < arr.length - 1 && <div className={cn("h-0.5 w-4 flex-shrink-0", isActive ? "bg-green-400" : "bg-muted")} />}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="border">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-3">Articoli ordinati</h3>
          <div className="space-y-2">
            {order.items?.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{item.article_name || item.article_id}</p>
                  <p className="text-xs text-muted-foreground">€{(item.unit_price || 0).toFixed(2)} x {item.quantity}</p>
                </div>
                <span className="text-sm font-semibold">€{(item.total || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-base font-bold pt-3 mt-3 border-t border-border">
            <span>Totale</span>
            <span>€{(order.total || 0).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Delivery info */}
      <Card className="border">
        <CardContent className="p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Dettagli consegna</h3>
          <p className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />{order.delivery_slot}
          </p>
          {order.structure_name && (
            <p className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />{order.structure_name}
            </p>
          )}
          {order.notes && (
            <div className="bg-muted/50 rounded-lg p-3 mt-2">
              <p className="text-xs text-muted-foreground font-medium">Note:</p>
              <p className="text-sm">{order.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery tracking */}
      {delivery && (
        <Card className="border border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-2">
              <Truck className="h-4 w-4" />Stato consegna
            </h3>
            <p className="text-sm">Stato: <span className="font-medium">{delivery.status}</span></p>
            {delivery.rider_name && <p className="text-sm">Rider: <span className="font-medium">{delivery.rider_name}</span></p>}
          </CardContent>
        </Card>
      )}

      {/* Cancel button */}
      {canCancel && (
        <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/20 gap-2"
          onClick={() => setCancelDialog(true)} data-testid="cancel-order-btn">
          <X className="h-4 w-4" />Annulla ordine
        </Button>
      )}

      <AlertDialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare l'ordine?</AlertDialogTitle>
            <AlertDialogDescription>L'ordine {order.order_number} verra annullato. L'operazione non e reversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground">Annulla ordine</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PortalOrderDetail;
