import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ArrowLeft, Package, Truck, CheckCircle2, Clock, MapPin } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ORDER_STATUS_META } from './PortalHistory';

// Avanzamento canonico: revisione → confermato → in consegna → consegnato (parziale = consegna in più fermate)
const STEPS = [
  { key: 'in_revisione', label: 'In revisione' },
  { key: 'confermato', label: 'Confermato' },
  { key: 'pianificato', label: 'In consegna' },
  { key: 'consegnato', label: 'Consegnato' },
];
const STEP_INDEX = { in_revisione: 0, confermato: 1, pianificato: 2, parziale: 2, consegnato: 3 };
const RICHIESTA_STATUS = {
  aperta: 'Da evadere', in_consegna: 'In consegna', evasa: 'Consegnata', parzialmente_evasa: 'Consegna parziale', annullata: 'Annullata',
};
const DOMAIN_LABEL = { noleggio: 'Noleggio', forniture: 'Forniture', pulizie: 'Prodotti Pulizie' };

const PortalOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/portal/ordini/${orderId}`)
      .then(r => setOrder(r.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Caricamento...</div>;
  if (!order) return <div className="p-8 text-center text-muted-foreground">Ordine non trovato</div>;

  const meta = ORDER_STATUS_META[order.status] || { label: order.status, cls: 'bg-muted text-muted-foreground' };
  const stepIdx = STEP_INDEX[order.status];
  const cancelled = order.status === 'annullato';

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-3xl" data-testid="portal-order-detail">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/history')} data-testid="order-back"><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-2xl font-heading font-semibold">Ordine {order.order_number}</h1>
          <p className="text-sm text-muted-foreground">
            Ordinato il {new Date(order.created_at).toLocaleDateString('it-IT')}{order.structure_name ? ` · ${order.structure_name}` : ''}
          </p>
        </div>
        <span className={cn('ml-auto text-xs px-2.5 py-1 rounded-full font-medium', meta.cls)} data-testid="order-detail-status">{meta.label}</span>
      </div>

      {!cancelled && (
        <Card className="border" data-testid="order-progress">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              {STEPS.map((s, i) => {
                const done = stepIdx >= i;
                return (
                  <div key={s.key} className="flex-1 flex flex-col items-center relative">
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', done ? 'bg-[#F24E75] text-white' : 'bg-muted text-muted-foreground')}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                    </div>
                    <span className={cn('text-xs mt-1.5', done ? 'font-medium' : 'text-muted-foreground')}>{s.label}</span>
                    {i < STEPS.length - 1 && <div className={cn('absolute top-4 left-1/2 w-full h-0.5', stepIdx > i ? 'bg-[#F24E75]' : 'bg-muted')} />}
                  </div>
                );
              })}
            </div>
            {order.status === 'parziale' && <p className="text-xs text-orange-600 mt-3 text-center">Consegna parziale: il residuo arriverà con una prossima consegna</p>}
          </CardContent>
        </Card>
      )}

      <Card className="border">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-[#F24E75]" />Articoli</h3>
          <div className="space-y-2" data-testid="order-items">
            {(order.items || []).map((it, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div>
                  <span className="font-medium">{it.name}</span>
                  {it.domain && <span className="ml-2 text-xs text-muted-foreground">{DOMAIN_LABEL[it.domain] || it.domain}</span>}
                </div>
                <span className="font-semibold tabular-nums">x{it.qty}</span>
              </div>
            ))}
            {(order.kits_used || []).map((k, i) => (
              <div key={`kit-${i}`} className="text-xs text-muted-foreground">Kit {k.kit_name || k.kit_id} x{k.qty}</div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Truck className="h-4 w-4 text-[#F24E75]" />Consegna</h3>
          {order.date_preferred && (
            <p className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />
              Richiesta per {new Date(order.date_preferred + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })} {order.time_window || ''}
            </p>
          )}
          {order.structure_address && <p className="text-sm flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{order.structure_address}</p>}
          <div className="space-y-1.5" data-testid="order-richieste">
            {(order.richieste || []).map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs bg-muted/40 rounded-md px-2.5 py-1.5">
                <span>{DOMAIN_LABEL[r.kind] || r.kind}{r.residual_of ? ' · residuo' : ''}</span>
                <span className="font-medium">{RICHIESTA_STATUS[r.status] || r.status}</span>
              </div>
            ))}
          </div>
          {(order.consegne || []).length > 0 && (
            <div className="space-y-1.5" data-testid="order-consegne">
              {order.consegne.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>Consegna del {c.date ? new Date(c.date + 'T00:00:00').toLocaleDateString('it-IT') : '—'}{c.rider_name ? ` · ${c.rider_name}` : ''}</span>
                  <span className="text-xs font-medium text-muted-foreground">{c.status === 'completata' ? 'Completata' : c.status}</span>
                </div>
              ))}
            </div>
          )}
          {order.note && <p className="text-xs text-muted-foreground">Note: {order.note}</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalOrderDetail;
