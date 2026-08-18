import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { portalApi } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { ShoppingCart, Plus, Minus, ArrowRight, ArrowLeft, Check, Package, CalendarDays, Clock, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const NewOrderPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [catalog, setCatalog] = useState([]);
  const [slots, setSlots] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Order state
  const [cart, setCart] = useState({});
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliverySlot, setDeliverySlot] = useState('');
  const [structureId, setStructureId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [catRes, slotRes, strRes] = await Promise.all([
          portalApi.getCatalog(),
          portalApi.getDeliverySlots(),
          portalApi.getStructures(),
        ]);
        setCatalog(catRes.data);
        setSlots(slotRes.data);
        setStructures(strRes.data);
      } catch (e) {
        toast.error('Errore caricamento catalogo');
        console.error(e);
      }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const cartItems = Object.entries(cart).filter(([_, qty]) => qty > 0);
  const cartTotal = cartItems.reduce((sum, [artId, qty]) => {
    const art = catalog.find(a => a.article_id === artId);
    return sum + (art?.price || 0) * qty;
  }, 0);

  const updateQty = (artId, delta) => {
    setCart(prev => {
      const newQty = Math.max(0, (prev[artId] || 0) + delta);
      if (newQty === 0) {
        const { [artId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [artId]: newQty };
    });
  };

  const setQty = (artId, qty) => {
    const val = Math.max(0, parseInt(qty) || 0);
    setCart(prev => {
      if (val === 0) {
        const { [artId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [artId]: val };
    });
  };

  const selectedDateSlots = slots.find(s => s.date === deliveryDate)?.slots || [];

  const handleSubmit = async () => {
    if (cartItems.length === 0) { toast.error('Seleziona almeno un articolo'); return; }
    if (!deliveryDate || !deliverySlot) { toast.error('Seleziona data e orario'); return; }

    setSubmitting(true);
    try {
      const items = cartItems.map(([artId, qty]) => {
        const art = catalog.find(a => a.article_id === artId);
        return { article_id: artId, article_name: art?.name, quantity: qty, unit_price: art?.price };
      });
      await portalApi.createOrder({
        client_id: user.client_id,
        structure_id: structureId || null,
        items,
        delivery_date: deliveryDate,
        delivery_slot: deliverySlot,
        notes: notes || null,
      });
      toast.success('Ordine inviato!');
      navigate('/portal/history');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore invio ordine');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="text-center py-16 text-muted-foreground">Caricamento catalogo...</div>;

  // Group catalog by category
  const grouped = {};
  catalog.forEach(a => {
    const cat = a.category || 'altro';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  });
  const CAT_LABELS = {
    rental_linen: 'Biancheria a noleggio', consumable: 'Consumabili',
    kit_component: 'Kit', cleaning: 'Pulizia', other: 'Altro', altro: 'Altro',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6" data-testid="new-order-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-semibold">Nuovo Ordine</h1>
        <Button variant="ghost" size="sm" onClick={() => navigate('/portal/orders')} className="text-muted-foreground">Annulla</Button>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(s => (
          <React.Fragment key={s}>
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
              step === s ? "bg-[#F24E75] text-white" : step > s ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
            )}>
              {step > s ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <div className={cn("h-0.5 flex-1 rounded", step > s ? "bg-green-500" : "bg-muted")} />}
          </React.Fragment>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Articoli</span><span>Data e ora</span><span>Conferma</span>
      </div>

      {/* Step 1: Select articles */}
      {step === 1 && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, articles]) => (
            <div key={cat}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">{CAT_LABELS[cat] || cat}</h3>
              <div className="space-y-2">
                {articles.map(art => (
                  <Card key={art.article_id} className={cn("border transition-colors", cart[art.article_id] > 0 && "border-[#F24E75]/40 bg-[#F24E75]/5")}>
                    <CardContent className="p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{art.name}</p>
                        <p className="text-xs text-muted-foreground">€{(art.price || 0).toFixed(2)} / {art.unit_type || 'pz'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQty(art.article_id, -1)} disabled={!cart[art.article_id]}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number" min="0"
                          value={cart[art.article_id] || ''}
                          onChange={e => setQty(art.article_id, e.target.value)}
                          className="w-14 h-8 text-center"
                          placeholder="0"
                          data-testid={`qty-${art.article_id}`}
                        />
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQty(art.article_id, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {cartItems.length > 0 && (
            <div className="bg-muted/50 rounded-xl p-4 border border-border">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">{cartItems.length} articoli selezionati</span>
                <span className="text-lg font-bold">€{cartTotal.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Date, slot, notes */}
      {step === 2 && (
        <div className="space-y-4">
          {structures.length > 0 && (
            <div className="space-y-2">
              <Label>Struttura di consegna</Label>
              <Select value={structureId || 'none'} onValueChange={v => setStructureId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Seleziona struttura" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {structures.map(s => <SelectItem key={s.id} value={s.id}>{s.name} {s.address ? `- ${s.address}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Data di consegna *</Label>
            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 bg-muted rounded-lg">Nessuna data disponibile al momento. Contatta l'ufficio operativo.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {slots.map(s => (
                  <Button
                    key={s.date}
                    variant={deliveryDate === s.date ? 'default' : 'outline'}
                    className={cn("h-auto py-2 px-3 text-left justify-start flex-col items-start",
                      deliveryDate === s.date && "bg-[#F24E75] hover:bg-[#E03B62] text-white"
                    )}
                    onClick={() => { setDeliveryDate(s.date); setDeliverySlot(''); }}
                    data-testid={`date-${s.date}`}
                  >
                    <span className="text-sm font-medium">
                      {new Date(s.date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-[10px] opacity-70">{s.slots.length} slot disponibili</span>
                  </Button>
                ))}
              </div>
            )}
          </div>

          {deliveryDate && selectedDateSlots.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Clock className="h-4 w-4" />Fascia oraria *</Label>
              <div className="grid grid-cols-2 gap-2">
                {selectedDateSlots.map(s => (
                  <Button
                    key={s.slot}
                    variant={deliverySlot === s.slot ? 'default' : 'outline'}
                    className={cn("h-10",
                      deliverySlot === s.slot && "bg-[#F24E75] hover:bg-[#E03B62] text-white"
                    )}
                    onClick={() => setDeliverySlot(s.slot)}
                    data-testid={`slot-${s.slot}`}
                  >
                    {s.slot}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Es: lasciare all'ingresso, non suonare il campanello..."
              rows={3}
              className="resize-none"
              data-testid="order-notes"
            />
          </div>
        </div>
      )}

      {/* Step 3: Review & confirm */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Riepilogo ordine</h3>
              <div className="space-y-2">
                {cartItems.map(([artId, qty]) => {
                  const art = catalog.find(a => a.article_id === artId);
                  return (
                    <div key={artId} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                      <span>{art?.name || artId} x{qty}</span>
                      <span className="font-medium">€{((art?.price || 0) * qty).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span>Totale</span>
                <span>€{cartTotal.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Consegna</h3>
              <p className="text-sm flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                {new Date(deliveryDate + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {deliverySlot}
              </p>
              {structureId && structures.length > 0 && (
                <p className="text-sm">{structures.find(s => s.id === structureId)?.name}</p>
              )}
              {notes && <p className="text-sm text-muted-foreground mt-1">Note: {notes}</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3 pt-2">
        {step > 1 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 gap-2">
            <ArrowLeft className="h-4 w-4" />Indietro
          </Button>
        )}
        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && cartItems.length === 0) || (step === 2 && (!deliveryDate || !deliverySlot))}
            className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-2"
            data-testid="next-step-btn"
          >
            Avanti<ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-2"
            data-testid="confirm-order-btn"
          >
            <Check className="h-4 w-4" />{submitting ? 'Invio...' : 'Conferma ordine'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default NewOrderPage;
