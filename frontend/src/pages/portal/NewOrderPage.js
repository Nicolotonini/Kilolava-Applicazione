import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, Minus, Plus, Package } from 'lucide-react';

const CAT_LABELS = { noleggio: 'Biancheria a Noleggio', forniture: 'Forniture / Consumabili', pulizie: 'Prodotti Pulizie' };

function Stepper({ value, onChange, testId }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(Math.max(0, value - 1))} data-testid={`${testId}-minus`}><Minus className="h-3 w-3" /></Button>
      <span className="w-7 text-center text-sm font-bold tabular-nums" data-testid={`${testId}-qty`}>{value}</span>
      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => onChange(value + 1)} data-testid={`${testId}-plus`}><Plus className="h-3 w-3" /></Button>
    </div>
  );
}

export default function NewOrderPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [denied, setDenied] = useState(false);
  const [structureId, setStructureId] = useState('');
  const [datePreferred, setDatePreferred] = useState('');
  const [timeWindow, setTimeWindow] = useState('');
  const [note, setNote] = useState('');
  const [kitQty, setKitQty] = useState({});
  const [itemQty, setItemQty] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/portal/ordini/catalogo')
      .then(r => {
        setCatalog(r.data);
        if (r.data.structures?.length === 1) setStructureId(r.data.structures[0].id);
      })
      .catch(() => setDenied(true));
  }, []);

  const totalPieces = useMemo(() =>
    Object.values(kitQty).reduce((s, q) => s + q, 0) + Object.values(itemQty).reduce((s, q) => s + q, 0),
  [kitQty, itemQty]);

  const submit = async () => {
    if (!structureId) { toast.error('Seleziona la struttura'); return; }
    const kits = Object.entries(kitQty).filter(([, q]) => q > 0).map(([kit_id, qty]) => ({ kit_id, qty }));
    const items = Object.entries(itemQty).filter(([, q]) => q > 0).map(([key, qty]) => {
      const [domain, product_id] = key.split('|');
      return { domain, product_id, qty };
    });
    if (kits.length === 0 && items.length === 0) { toast.error("L'ordine è vuoto"); return; }
    setSaving(true);
    try {
      const r = await api.post('/portal/ordini', {
        structure_id: structureId, date_preferred: datePreferred || null,
        time_window: timeWindow || null, items, kits, note: note || null,
      });
      toast.success(`Ordine ${r.data.order_number} inviato: sarà verificato dall'ufficio operativo`);
      navigate('/portal/orders');
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore invio ordine'); }
    finally { setSaving(false); }
  };

  if (denied) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Gli ordini non sono abilitati per il tuo account.</p>
        <Button variant="ghost" className="mt-3" onClick={() => navigate('/portal/orders')}>Torna agli ordini</Button>
      </div>
    );
  }
  if (!catalog) return <div className="text-center py-16 text-muted-foreground">Caricamento catalogo...</div>;

  const filterFn = (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code || '').toLowerCase().includes(search.toLowerCase());

  return (
    <div className="space-y-5 pb-24" data-testid="new-order-page">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/portal/orders')} data-testid="order-back-btn"><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-heading font-semibold">Nuovo ordine</h1>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Struttura *</Label>
          <select value={structureId} onChange={e => setStructureId(e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="order-structure-select">
            <option value="">Seleziona...</option>
            {(catalog.structures || []).map(s => <option key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data preferita</Label>
          <Input type="date" value={datePreferred} onChange={e => setDatePreferred(e.target.value)} className="h-9" data-testid="order-date-input" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fascia oraria preferita</Label>
          <Input value={timeWindow} onChange={e => setTimeWindow(e.target.value)} placeholder="es. mattina, 10–13" className="h-9" data-testid="order-window-input" />
        </div>
      </div>

      {(catalog.kits || []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Kit</p>
          <div className="space-y-1.5">
            {catalog.kits.map(k => (
              <div key={k.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2" data-testid={`order-kit-${k.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{k.name}</p>
                  <p className="text-xs text-muted-foreground">{(k.items || []).length} articoli inclusi</p>
                </div>
                <Stepper value={kitQty[k.id] || 0} onChange={v => setKitQty(p => ({ ...p, [k.id]: v }))} testId={`kit-${k.id}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca articolo..." className="h-9 max-w-xs" data-testid="order-search-input" />

      {Object.entries(catalog.products || {}).map(([cat, products]) => {
        const list = products.filter(filterFn);
        if (list.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{CAT_LABELS[cat] || cat}</p>
            <div className="space-y-1.5">
              {list.map(p => {
                const key = `${cat}|${p.id}`;
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2" data-testid={`order-product-${p.id}`}>
                    {p.photo && <img src={p.photo} alt="" className="w-9 h-9 rounded object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs font-mono font-bold text-primary">{p.code}</p>
                    </div>
                    <Stepper value={itemQty[key] || 0} onChange={v => setItemQty(pr => ({ ...pr, [key]: v }))} testId={`item-${p.id}`} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="space-y-1">
        <Label className="text-xs">Note per l'ufficio operativo</Label>
        <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} className="resize-none" data-testid="order-note-input" />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 flex items-center justify-between gap-3 sm:static sm:border-0 sm:p-0 sm:bg-transparent">
        <p className="text-sm text-muted-foreground"><strong>{totalPieces}</strong> pezzi selezionati</p>
        <Button onClick={submit} disabled={saving || totalPieces === 0} className="bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="order-submit-btn">
          {saving ? 'Invio...' : 'Invia ordine'}
        </Button>
      </div>
    </div>
  );
}
