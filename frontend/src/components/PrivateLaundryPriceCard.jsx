import React, { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { toast } from 'sonner';
import { Shirt } from 'lucide-react';

export function PrivateLaundrySettingsCard() {
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/lavanderia/settings').then((r) => setPrice(String(r.data.price_per_kg))).catch(() => {});
  }, []);

  const save = async () => {
    const p = parseFloat(price);
    if (!p || p <= 0) { toast.error('Prezzo non valido'); return; }
    setSaving(true);
    try {
      await api.put('/lavanderia/settings', { price_per_kg: p });
      toast.success('Prezzo standard Lavanderia Privata aggiornato');
    } catch { toast.error('Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="kilolava-card" data-testid="pl-settings-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Shirt className="h-5 w-5 text-primary" /></div>
          <div>
            <CardTitle className="text-lg font-heading">Lavanderia Privata</CardTitle>
            <CardDescription>Prezzo standard al kg (override per cliente nella scheda Cliente → Fatturazione)</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div>
            <Label className="text-xs">Prezzo €/kg</Label>
            <Input type="number" step="0.1" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="w-32 mt-1" data-testid="pl-settings-price-input" />
          </div>
          <Button size="sm" onClick={save} disabled={saving} data-testid="pl-settings-price-save">{saving ? '...' : 'Salva'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PrivateLaundryPriceCard({ clientId }) {
  const [defaultPrice, setDefaultPrice] = useState(null);
  const [override, setOverride] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get('/lavanderia/settings').then((r) => setDefaultPrice(r.data.price_per_kg)).catch(() => {});
    api.get(`/clients/${clientId}`).then((r) => {
      const v = r.data.private_laundry_price_per_kg;
      setOverride(v != null ? String(v) : '');
    }).catch(() => {});
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const save = async (value) => {
    setSaving(true);
    try {
      await api.put(`/lavanderia/client-price/${clientId}`, { price_per_kg: value });
      toast.success(value != null ? 'Prezzo personalizzato salvato' : 'Tornato al prezzo standard');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border" data-testid="pl-price-card">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Shirt className="h-5 w-5 text-primary" /></div>
          <div>
            <CardTitle className="text-base font-heading">Lavanderia Privata — prezzo €/kg</CardTitle>
            <CardDescription>
              Standard Kilolava: {defaultPrice != null ? defaultPrice.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : '—'}/kg.
              Il prezzo personalizzato prevale per questo cliente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs">Prezzo personalizzato (€/kg)</Label>
            <Input
              type="number" step="0.1" min={0}
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder={defaultPrice != null ? `standard ${defaultPrice}` : ''}
              className="w-36 mt-1"
              data-testid="pl-client-price-input"
            />
          </div>
          <Button
            size="sm" disabled={saving || !override}
            onClick={() => save(parseFloat(override))}
            data-testid="pl-client-price-save"
          >
            Salva
          </Button>
          <Button
            size="sm" variant="outline" disabled={saving}
            onClick={() => { setOverride(''); save(null); }}
            data-testid="pl-client-price-reset"
          >
            Usa standard
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
