import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { ShoppingCart, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_META = {
  da_confermare: { label: 'In revisione', cls: 'bg-sky-100 text-sky-700' },
  in_revisione: { label: 'In revisione', cls: 'bg-sky-100 text-sky-700' },
  confermato: { label: 'Confermato', cls: 'bg-emerald-100 text-emerald-700' },
  pianificato: { label: 'In consegna', cls: 'bg-amber-100 text-amber-700' },
  parziale: { label: 'Parzialmente consegnato', cls: 'bg-amber-100 text-amber-700' },
  consegnato: { label: 'Consegnato', cls: 'bg-emerald-600 text-white' },
  annullato: { label: 'Annullato', cls: 'bg-muted text-muted-foreground' },
};

const PortalOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/portal/ordini')
      .then(r => { setOrders(r.data); setEnabled(true); })
      .catch(e => setEnabled(e.response?.status !== 403))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-16 text-muted-foreground">Caricamento...</div>;

  return (
    <div className="space-y-6" data-testid="portal-orders">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold">Ordini</h1>
        {enabled && (
          <Button onClick={() => navigate('/portal/orders/new')} className="bg-[#F24E75] hover:bg-[#E03B62] text-white gap-2" data-testid="new-order-btn">
            <Plus className="h-4 w-4" />Nuovo ordine
          </Button>
        )}
      </div>

      {!enabled ? (
        <div className="text-center py-12">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Gli ordini non sono abilitati per il tuo account.</p>
          <p className="text-xs text-muted-foreground mt-1">Contatta l'ufficio operativo per maggiori informazioni.</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun ordine effettuato</p>
          <Button onClick={() => navigate('/portal/orders/new')} variant="outline" className="mt-4 gap-2">
            <Plus className="h-4 w-4" />Crea il tuo primo ordine
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => {
            const st = STATUS_META[o.status] || STATUS_META.in_revisione;
            const expanded = open === o.id;
            return (
              <div key={o.id} className="rounded-xl border border-border bg-card" data-testid={`portal-order-${o.id}`}>
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(expanded ? null : o.id)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      <span className="font-mono text-primary mr-1.5">{o.order_number}</span>{o.structure_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString('it-IT')}
                      {o.date_preferred ? ` · consegna preferita ${new Date(o.date_preferred + 'T00:00:00').toLocaleDateString('it-IT')}` : ''}
                      {' '}· {(o.items || []).length} articoli
                    </p>
                  </div>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0', st.cls)} data-testid={`order-status-${o.id}`}>{st.label}</span>
                  {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {expanded && (
                  <div className="px-4 pb-3 border-t border-border/60 pt-2 space-y-1">
                    {(o.kits_used || []).length > 0 && (
                      <p className="text-xs text-muted-foreground">Kit: {o.kits_used.map(k => `${k.qty}× ${k.kit_name}`).join(', ')}</p>
                    )}
                    {(o.items || []).map((i, idx) => (
                      <p key={idx} className="text-sm">{i.qty}× {i.name}</p>
                    ))}
                    {o.note && <p className="text-xs text-muted-foreground mt-1">Nota: {o.note}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PortalOrders;
