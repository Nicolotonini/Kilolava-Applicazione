import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { portalApi } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { ShoppingCart, Plus } from 'lucide-react';

const PortalOrders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orderingEnabled, setOrderingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await portalApi.getDashboard();
        setOrderingEnabled(res.data.ordering_enabled);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  if (loading) return <div className="text-center py-16 text-muted-foreground">Caricamento...</div>;

  return (
    <div className="space-y-6" data-testid="portal-orders">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold">Ordini</h1>
        {orderingEnabled && (
          <Button onClick={() => navigate('/portal/orders/new')} className="bg-[#F24E75] hover:bg-[#E03B62] text-white gap-2" data-testid="new-order-btn">
            <Plus className="h-4 w-4" />Nuovo ordine
          </Button>
        )}
      </div>

      {!orderingEnabled ? (
        <div className="text-center py-12">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Gli ordini non sono abilitati per il tuo account.</p>
          <p className="text-xs text-muted-foreground mt-1">Contatta l'ufficio operativo per maggiori informazioni.</p>
        </div>
      ) : (
        <div className="text-center py-12">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun ordine in corso</p>
          <Button onClick={() => navigate('/portal/orders/new')} variant="outline" className="mt-4 gap-2">
            <Plus className="h-4 w-4" />Crea il tuo primo ordine
          </Button>
        </div>
      )}
    </div>
  );
};

export default PortalOrders;
