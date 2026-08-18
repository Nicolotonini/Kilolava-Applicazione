import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { structuresApi, unitsApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  ArrowLeft, Building2, MapPin, Key, User, Sparkles, Shirt,
  Package, Wrench, Save, Plus, Trash2, Pencil, ExternalLink,
  Bed, Home, Hotel, Briefcase, Link2, Clock, ChevronDown, ChevronUp, X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const CATEGORY_MAP = {
  apartment: { label: 'Appartamento', icon: Home },
  guesthouse: { label: 'Affittacamere / B&B', icon: Hotel },
  hotel: { label: 'Hotel', icon: Hotel },
  office: { label: 'Ufficio', icon: Briefcase },
  other: { label: 'Altro', icon: Building2 },
};

const SERVICE_DEFS = [
  { key: 'cleaning', label: 'Pulizia', icon: Sparkles, color: 'violet', activeColor: 'bg-violet-500 text-white', inactiveColor: 'bg-muted text-muted-foreground' },
  { key: 'private_laundry', label: 'Lavanderia Privata', icon: Shirt, color: 'blue', activeColor: 'bg-blue-500 text-white', inactiveColor: 'bg-muted text-muted-foreground' },
  { key: 'rental_laundry', label: 'Lavanderia Noleggio', icon: Shirt, color: 'cyan', activeColor: 'bg-cyan-500 text-white', inactiveColor: 'bg-muted text-muted-foreground' },
  { key: 'consumables', label: 'Consumabili', icon: Package, color: 'teal', activeColor: 'bg-teal-500 text-white', inactiveColor: 'bg-muted text-muted-foreground' },
  { key: 'maintenance', label: 'Manutenzioni', icon: Wrench, color: 'orange', activeColor: 'bg-orange-500 text-white', inactiveColor: 'bg-muted text-muted-foreground' },
  { key: 'other', label: 'Altro', icon: Plus, color: 'gray', activeColor: 'bg-gray-600 text-white', inactiveColor: 'bg-muted text-muted-foreground' },
];

const StructureDetailPage = () => {
  const { structureId } = useParams();
  const navigate = useNavigate();
  const isNew = structureId === 'new';

  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [units, setUnits] = useState([]);
  const [activeTab, setActiveTab] = useState('info');
  const [customServiceInput, setCustomServiceInput] = useState('');

  const [form, setForm] = useState({
    client_id: '', name: '', structure_type: 'apartment', address: '', floor: '',
    access_type: 'keybox', access_details: '', ical_url: '', ical_source: '',
    services: [], custom_services: [], cleaning_template_id: '',
    check_in_time: '15:00', check_out_time: '10:00',
    bed_config: { capacity_total: 0, beds_double: 0, beds_single: 0, sofa_beds: 0 },
    notes: '', is_active: true,
  });

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
    api.get('/checklist-templates').then(r => setTemplates(r.data)).catch(() => {});
  }, []);

  const fetchStructure = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await structuresApi.getById(structureId);
      const s = res.data;
      setStructure(s);
      setForm({
        client_id: s.client_id || '', name: s.name || '', structure_type: s.structure_type || 'apartment',
        address: s.address || '', floor: s.floor || '',
        access_type: s.access_type || 'keybox', access_details: s.access_details || '',
        ical_url: s.ical_url || '', ical_source: s.ical_source || '',
        services: s.services || [], custom_services: s.custom_services || [],
        cleaning_template_id: s.cleaning_template_id || '',
        check_in_time: s.check_in_time || '15:00', check_out_time: s.check_out_time || '10:00',
        bed_config: s.bed_config || { capacity_total: 0, beds_double: 0, beds_single: 0, sofa_beds: 0 },
        notes: s.notes || '', is_active: s.is_active !== false,
      });
      // Fetch units
      const uRes = await unitsApi.getAll({ structure_id: structureId });
      setUnits(uRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [structureId, isNew]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);

  const toggleService = (key) => {
    setForm(p => ({
      ...p,
      services: p.services.includes(key) ? p.services.filter(s => s !== key) : [...p.services, key],
    }));
  };

  const addCustomService = () => {
    const trimmed = customServiceInput.trim();
    if (!trimmed || form.custom_services.includes(trimmed)) return;
    setForm(p => ({ ...p, custom_services: [...p.custom_services, trimmed] }));
    setCustomServiceInput('');
  };

  const removeCustomService = (svc) => {
    setForm(p => ({ ...p, custom_services: p.custom_services.filter(s => s !== svc) }));
  };

  const updateBedConfig = (field, value) => {
    setForm(p => ({ ...p, bed_config: { ...p.bed_config, [field]: parseInt(value) || 0 } }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Il nome e obbligatorio'); return; }
    if (!form.client_id && isNew) { toast.error('Seleziona un proprietario'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        client_id: form.client_id || undefined,
        cleaning_template_id: form.cleaning_template_id || null,
        ical_source: form.ical_source || null,
        bed_config: form.bed_config,
      };
      if (isNew) {
        const res = await structuresApi.create(payload);
        toast.success('Struttura creata');
        navigate(`/structures/${res.data.id}`, { replace: true });
      } else {
        await structuresApi.update(structureId, payload);
        toast.success('Struttura aggiornata');
        fetchStructure();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore nel salvataggio');
    } finally { setSaving(false); }
  };

  const hasMultipleUnits = ['guesthouse', 'hotel'].includes(form.structure_type);

  if (loading) return <div className="p-6 text-center text-muted-foreground">Caricamento...</div>;

  const TABS = [
    { key: 'info', label: 'Informazioni' },
    { key: 'services', label: 'Servizi' },
    { key: 'beds', label: 'Alloggio' },
    ...(hasMultipleUnits ? [{ key: 'units', label: `Unita (${units.length})` }] : []),
    { key: 'ota', label: 'OTA / iCal' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="structure-detail-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/structures')} data-testid="back-btn">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">
            {isNew ? 'Nuova Struttura' : form.name}
          </h1>
          {!isNew && structure?.client_name && (
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" />
              <button onClick={() => navigate(`/clients/${structure.client_id}`)} className="hover:text-[#F24E75] hover:underline">
                {structure.client_name}
              </button>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <div className="flex items-center gap-2 mr-2">
              <Label className="text-xs text-muted-foreground">Attiva</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} data-testid="active-toggle" />
            </div>
          )}
          <Button onClick={handleSave} disabled={saving} className="bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-btn">
            <Save className="h-4 w-4 mr-1.5" />{saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
              activeTab === tab.key
                ? "border-[#F24E75] text-[#F24E75]"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Informazioni */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-sm font-semibold">Dati generali</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Nome struttura *</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm mt-1" data-testid="name-input" />
                </div>
                <div>
                  <Label className="text-xs">Proprietario *</Label>
                  <Select value={form.client_id || 'none'} onValueChange={v => setForm(p => ({ ...p, client_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="h-9 text-sm mt-1" data-testid="client-select">
                      <SelectValue placeholder="Seleziona proprietario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Seleziona...</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Select value={form.structure_type} onValueChange={v => setForm(p => ({ ...p, structure_type: v }))}>
                    <SelectTrigger className="h-9 text-sm mt-1" data-testid="category-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                  <Label className="text-xs">{form.is_active ? 'Attiva' : 'Non attiva'}</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-sm font-semibold">Indirizzo e accesso</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Indirizzo (via e numero civico)</Label>
                  <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Via Roma 1" className="h-9 text-sm mt-1" data-testid="address-input" />
                </div>
                <div>
                  <Label className="text-xs">Piano</Label>
                  <Input value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} placeholder="es. 2" className="h-9 text-sm mt-1" data-testid="floor-input" />
                </div>
                <div>
                  <Label className="text-xs">Metodo di accesso</Label>
                  <Select value={form.access_type} onValueChange={v => setForm(p => ({ ...p, access_type: v }))}>
                    <SelectTrigger className="h-9 text-sm mt-1" data-testid="access-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keybox">Keybox</SelectItem>
                      <SelectItem value="keys">Chiavi</SelectItem>
                      <SelectItem value="code">Codice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Dettagli accesso</Label>
                  <Input value={form.access_details} onChange={e => setForm(p => ({ ...p, access_details: e.target.value }))} placeholder="es. Codice keybox: 1234" className="h-9 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Note</Label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: Servizi */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <Card className="border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-4">Servizi attivi</h3>
              <p className="text-xs text-muted-foreground mb-4">Seleziona i servizi utilizzati in questa struttura. Le icone si colorano quando il servizio e attivo.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {SERVICE_DEFS.map(svc => {
                  const active = form.services.includes(svc.key);
                  const Icon = svc.icon;
                  return (
                    <button
                      key={svc.key}
                      onClick={() => toggleService(svc.key)}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                        active
                          ? `border-${svc.color}-400 ${svc.activeColor} shadow-sm`
                          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                      data-testid={`service-${svc.key}`}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-[11px] font-medium text-center leading-tight">{svc.label}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Custom services when "other" is active */}
          {form.services.includes('other') && (
            <Card className="border">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Servizi personalizzati</h3>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={customServiceInput}
                    onChange={e => setCustomServiceInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomService()}
                    placeholder="Nome servizio personalizzato..."
                    className="h-8 text-xs flex-1"
                    data-testid="custom-service-input"
                  />
                  <Button variant="outline" size="sm" className="h-8" onClick={addCustomService}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Aggiungi
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.custom_services.map(cs => (
                    <span key={cs} className="flex items-center gap-1 px-2.5 py-1 bg-muted rounded-full text-xs font-medium">
                      {cs}
                      <button onClick={() => removeCustomService(cs)} className="hover:text-red-500"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Cleaning template selection */}
          {form.services.includes('cleaning') && (
            <Card className="border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <h3 className="text-sm font-semibold">Configurazione Pulizia</h3>
                </div>
                <div>
                  <Label className="text-xs">Template checklist</Label>
                  <Select value={form.cleaning_template_id || 'none'} onValueChange={v => setForm(p => ({ ...p, cleaning_template_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="h-9 text-sm mt-1" data-testid="cleaning-template-select">
                      <SelectValue placeholder="Seleziona template..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun template</SelectItem>
                      {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* TAB: Alloggio (Beds) */}
      {activeTab === 'beds' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Bed className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Configurazione letti</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Posti letto totali</Label>
                  <Input type="number" min={0} value={form.bed_config.capacity_total} onChange={e => updateBedConfig('capacity_total', e.target.value)} className="h-9 text-sm mt-1" data-testid="beds-total" />
                </div>
                <div>
                  <Label className="text-xs">Letti matrimoniali</Label>
                  <Input type="number" min={0} value={form.bed_config.beds_double} onChange={e => updateBedConfig('beds_double', e.target.value)} className="h-9 text-sm mt-1" data-testid="beds-double" />
                </div>
                <div>
                  <Label className="text-xs">Letti singoli</Label>
                  <Input type="number" min={0} value={form.bed_config.beds_single} onChange={e => updateBedConfig('beds_single', e.target.value)} className="h-9 text-sm mt-1" data-testid="beds-single" />
                </div>
                <div>
                  <Label className="text-xs">Divani letto</Label>
                  <Input type="number" min={0} value={form.bed_config.sofa_beds} onChange={e => updateBedConfig('sofa_beds', e.target.value)} className="h-9 text-sm mt-1" data-testid="beds-sofa" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Orari check-in / check-out</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Check-in</Label>
                  <Input type="time" value={form.check_in_time} onChange={e => setForm(p => ({ ...p, check_in_time: e.target.value }))} className="h-9 text-sm mt-1" data-testid="checkin-time" />
                </div>
                <div>
                  <Label className="text-xs">Check-out</Label>
                  <Input type="time" value={form.check_out_time} onChange={e => setForm(p => ({ ...p, check_out_time: e.target.value }))} className="h-9 text-sm mt-1" data-testid="checkout-time" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: Unita (for guesthouse/hotel) */}
      {activeTab === 'units' && hasMultipleUnits && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Unita / Camere ({units.length})</h3>
            <Button size="sm" className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white" onClick={() => navigate(`/clients/${form.client_id}`)} data-testid="manage-units-btn">
              <Plus className="h-3.5 w-3.5 mr-1" />Gestisci unita
            </Button>
          </div>
          {units.length === 0 ? (
            <Card className="border">
              <CardContent className="p-8 text-center">
                <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">Nessuna unita creata</p>
                <p className="text-xs text-muted-foreground mt-1">Aggiungi camere o appartamenti a questa struttura</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {units.map(u => (
                <Card key={u.id} className="border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-sm">{u.name}</p>
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                        {u.is_active ? 'Attiva' : 'Inattiva'}
                      </span>
                    </div>
                    {u.bed_config && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Posti: {u.bed_config.capacity_total} | Matrimoniali: {u.bed_config.beds_double} | Singoli: {u.bed_config.beds_single}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: OTA / iCal */}
      {activeTab === 'ota' && (
        <div className="space-y-4">
          <Card className="border">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-sm font-semibold">Collegamento OTA</h3>
              <p className="text-xs text-muted-foreground">Collega il calendario iCal da Airbnb o Booking.com per importare automaticamente le prenotazioni.</p>

              <div>
                <Label className="text-xs">Piattaforma</Label>
                <div className="flex gap-3 mt-2">
                  {[
                    { key: 'airbnb', label: 'Airbnb', color: 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' },
                    { key: 'booking_com', label: 'Booking.com', color: 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
                  ].map(p => (
                    <button
                      key={p.key}
                      onClick={() => setForm(prev => ({ ...prev, ical_source: prev.ical_source === p.key ? '' : p.key }))}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all font-medium text-sm",
                        form.ical_source === p.key ? p.color : "border-border text-muted-foreground hover:border-muted-foreground/30"
                      )}
                      data-testid={`ota-${p.key}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">URL iCal</Label>
                <Input
                  value={form.ical_url}
                  onChange={e => setForm(p => ({ ...p, ical_url: e.target.value }))}
                  placeholder="https://ical.booking.com/v1/export/..."
                  className="h-9 text-sm mt-1 font-mono"
                  data-testid="ical-url-input"
                />
              </div>

              {form.ical_url && (
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-600 font-medium">URL iCal configurato</span>
                  <Button variant="outline" size="sm" className="h-7 text-xs ml-auto" onClick={() => window.open(form.ical_url, '_blank')}>
                    <ExternalLink className="h-3 w-3 mr-1" />Apri feed
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StructureDetailPage;
