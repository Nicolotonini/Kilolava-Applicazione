import React, { useEffect, useState } from 'react';
import { Lock, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { usePermissions } from '../../hooks/usePermissions';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

const PRIVATE_FIELDS = [
  ['fiscal_code', 'Codice Fiscale'], ['billing_address', 'Indirizzo fatturazione'], ['sdi', 'Codice SDI'],
  ['billing_email', 'Email fatturazione'], ['payment_terms', 'Termini pagamento'],
];
const COMPANY_FIELDS = [
  ['company_name', 'Ragione sociale'], ['vat_number', 'P.IVA'], ['fiscal_code', 'Codice Fiscale'], ['pec', 'PEC'],
  ['sdi', 'Codice SDI'], ['billing_address', 'Sede legale / Indirizzo fatturazione'], ['billing_email', 'Email fatturazione'],
  ['payment_terms', 'Termini pagamento'],
];

// Dati fiscali/amministrativi: endpoint dedicato /clients/{id}/admin-data, SOLO Super Admin (backend = barriera reale)
export const ClientAdminDataCard = ({ clientId, clientType }) => {
  const { isAdmin } = usePermissions();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const fields = clientType === 'company' ? COMPANY_FIELDS : PRIVATE_FIELDS;

  useEffect(() => {
    if (!isAdmin || !clientId) return;
    api.get(`/clients/${clientId}/admin-data`).then(r => setData(r.data)).catch(e => setError(e.response?.status || 'err'));
  }, [clientId, isAdmin]);

  if (!isAdmin) {
    return (
      <Card className="border" data-testid="client-admin-data-restricted">
        <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />Dati fiscali e amministrativi riservati al Super Admin.
        </CardContent>
      </Card>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put(`/clients/${clientId}/admin-data`, form);
      setData(r.data); setForm(null); toast.success('Dati amministrativi salvati');
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore salvataggio'); }
    finally { setSaving(false); }
  };

  return (
    <Card className="border" data-testid="client-admin-data-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Dati amministrativi e fiscali</h3>
          {form ? (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setForm(null)} data-testid="admin-data-cancel"><X className="h-3 w-3 mr-1" />Annulla</Button>
              <Button size="sm" className="h-7 text-xs bg-[#F24E75] hover:bg-[#E03B62] text-white" disabled={saving} onClick={save} data-testid="admin-data-save"><Save className="h-3 w-3 mr-1" />Salva</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!data} onClick={() => setForm(Object.fromEntries(fields.concat([['admin_notes']]).map(([k]) => [k, data?.[k] || ''])))} data-testid="admin-data-edit">
              <Pencil className="h-3 w-3 mr-1" />Modifica
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-destructive">Impossibile caricare i dati amministrativi ({error}).</p>}
        {!form ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm" data-testid="client-fiscal-data">
            {fields.map(([k, label]) => (
              <div key={k}>
                <span className="text-xs text-muted-foreground block">{label}</span>
                <span className="font-medium" data-testid={`admin-data-${k}`}>{data?.[k] || '—'}</span>
              </div>
            ))}
            {data?.admin_notes && (
              <div className="col-span-full"><span className="text-xs text-muted-foreground block">Note amministrative</span><span className="text-sm">{data.admin_notes}</span></div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(([k, label]) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <Input value={form[k] || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="h-9" data-testid={`admin-data-input-${k}`} />
              </div>
            ))}
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Note amministrative</Label>
              <Textarea rows={2} value={form.admin_notes || ''} onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))} className="resize-none" data-testid="admin-data-input-admin_notes" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ClientAdminDataCard;
