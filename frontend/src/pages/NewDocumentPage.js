import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft, Plus, X, Save } from 'lucide-react';

const NewDocumentPage = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [structures, setStructures] = useState([]);
  const [articles, setArticles] = useState([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    document_type: 'ddt',
    client_id: '',
    structure_id: '',
    unit_id: '',
    destination_address: '',
    notes: '',
    delivery_ref: '',
    items: [{ description: '', quantity: 1, unit: 'pz', article_id: '', notes: '' }],
  });

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
    api.get('/structures').then(r => setStructures(r.data)).catch(() => {});
    api.get('/inventory/articles').then(r => setArticles(r.data)).catch(() => {});
  }, []);

  const addItem = () => {
    setForm(p => ({ ...p, items: [...p.items, { description: '', quantity: 1, unit: 'pz', article_id: '', notes: '' }] }));
  };

  const removeItem = (idx) => {
    setForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  const updateItem = (idx, field, value) => {
    setForm(p => ({
      ...p,
      items: p.items.map((it, i) => {
        if (i !== idx) return it;
        if (field === 'article_id' && value) {
          const art = articles.find(a => a.id === value);
          return { ...it, article_id: value, description: art?.name || it.description };
        }
        return { ...it, [field]: value };
      }),
    }));
  };

  const handleSubmit = async () => {
    const validItems = form.items.filter(it => it.description.trim());
    if (validItems.length === 0) {
      alert('Aggiungi almeno un articolo');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        client_id: form.client_id || null,
        structure_id: form.structure_id || null,
        unit_id: form.unit_id || null,
        items: validItems.map(it => ({
          article_id: it.article_id || null,
          description: it.description,
          quantity: parseInt(it.quantity) || 1,
          unit: it.unit || 'pz',
          notes: it.notes || null,
        })),
      };
      const res = await api.post('/documents', payload);
      navigate(`/documents/${res.data.id}`);
    } catch (e) {
      alert(e.response?.data?.detail || 'Errore durante la creazione');
    } finally {
      setSaving(false);
    }
  };

  // Get units for selected structure
  const [units, setUnits] = useState([]);
  useEffect(() => {
    if (form.structure_id) {
      api.get('/units', { params: { structure_id: form.structure_id } }).then(r => setUnits(r.data)).catch(() => {});
    } else {
      setUnits([]);
    }
  }, [form.structure_id]);

  // Auto-fill address from structure
  useEffect(() => {
    if (form.structure_id) {
      const s = structures.find(st => st.id === form.structure_id);
      if (s?.address && !form.destination_address) {
        setForm(p => ({ ...p, destination_address: s.address }));
      }
    }
  }, [form.structure_id, structures, form.destination_address]);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="new-document-page">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/documents')} data-testid="back-btn">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Nuovo Documento</h1>
          <p className="text-sm text-muted-foreground">Crea un DDT o documento operativo</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Type & Client */}
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Informazioni generali</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Tipo documento</label>
                  <Select value={form.document_type} onValueChange={v => setForm(p => ({ ...p, document_type: v }))}>
                    <SelectTrigger className="h-9 text-sm" data-testid="doc-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ddt">DDT - Documento di Trasporto</SelectItem>
                      <SelectItem value="internal_movement">Movimento Interno</SelectItem>
                      <SelectItem value="invoice_ref">Riferimento Fattura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Cliente</label>
                  <Select value={form.client_id || 'none'} onValueChange={v => setForm(p => ({ ...p, client_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="h-9 text-sm" data-testid="client-select">
                      <SelectValue placeholder="Seleziona cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun cliente</SelectItem>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.display_name || c.id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Struttura</label>
                  <Select value={form.structure_id || 'none'} onValueChange={v => setForm(p => ({ ...p, structure_id: v === 'none' ? '' : v, unit_id: '' }))}>
                    <SelectTrigger className="h-9 text-sm" data-testid="structure-select">
                      <SelectValue placeholder="Seleziona struttura" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna struttura</SelectItem>
                      {structures.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {units.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Unita</label>
                    <Select value={form.unit_id || 'none'} onValueChange={v => setForm(p => ({ ...p, unit_id: v === 'none' ? '' : v }))}>
                      <SelectTrigger className="h-9 text-sm" data-testid="unit-select">
                        <SelectValue placeholder="Seleziona unita" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuna unita</SelectItem>
                        {units.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Destination */}
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Destinazione e riferimenti</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Indirizzo destinazione</label>
                  <Input
                    value={form.destination_address}
                    onChange={e => setForm(p => ({ ...p, destination_address: e.target.value }))}
                    placeholder="Via, citta..."
                    className="h-9 text-sm"
                    data-testid="address-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Rif. consegna</label>
                  <Input
                    value={form.delivery_ref}
                    onChange={e => setForm(p => ({ ...p, delivery_ref: e.target.value }))}
                    placeholder="es. Consegna #42"
                    className="h-9 text-sm"
                    data-testid="delivery-ref-input"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Articoli</h3>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem} data-testid="add-item-btn">
                  <Plus className="h-3 w-3 mr-1" />Aggiungi riga
                </Button>
              </div>
              <div className="space-y-2">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2.5 bg-muted/30 rounded-lg" data-testid={`item-row-${idx}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Select
                          value={item.article_id || 'manual'}
                          onValueChange={v => updateItem(idx, 'article_id', v === 'manual' ? '' : v)}
                        >
                          <SelectTrigger className="h-8 w-[160px] text-xs">
                            <SelectValue placeholder="Articolo..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Inserimento manuale</SelectItem>
                            {articles.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          placeholder="Descrizione articolo"
                          className="h-8 text-xs flex-1"
                        />
                      </div>
                    </div>
                    <Input
                      type="number" value={item.quantity} min={1}
                      onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                      className="h-8 text-xs w-16 text-center"
                    />
                    <Input
                      value={item.unit}
                      onChange={e => updateItem(idx, 'unit', e.target.value)}
                      className="h-8 text-xs w-14 text-center"
                      placeholder="U.M."
                    />
                    {form.items.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeItem(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-2">Note</h3>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Note aggiuntive..."
                data-testid="notes-input"
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-2">
            <Button
              className="bg-[#F24E75] hover:bg-[#E03B62] text-white"
              onClick={handleSubmit}
              disabled={saving}
              data-testid="create-document-btn"
            >
              <Save className="h-4 w-4 mr-1.5" />{saving ? 'Creazione...' : 'Crea Documento'}
            </Button>
            <Button variant="outline" onClick={() => navigate('/documents')}>Annulla</Button>
          </div>
        </div>

        {/* Right: Info panel */}
        <div className="space-y-4">
          <Card className="border">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold">Info</h3>
              <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                <li>Il numero documento viene assegnato automaticamente</li>
                <li>Il documento viene creato in stato <span className="font-medium">Bozza</span></li>
                <li>Puoi modificare il documento finche resta in bozza</li>
                <li>Seleziona un articolo dal catalogo o inserisci manualmente</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold">Genera da entita</h3>
              <p className="text-xs text-muted-foreground">
                Puoi generare DDT automaticamente da ordini, task logistiche o movimenti inventario dalla sezione Logistica, Ordini o Inventario.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default NewDocumentPage;
