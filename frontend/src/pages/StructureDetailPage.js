import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api, { structuresApi, unitsApi, fileUrl } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  ArrowLeft, Building2, User, Sparkles, Shirt, Package, Wrench, Save, Plus,
  Trash2, Pencil, Bed, Home, Hotel, Briefcase, KeyRound, Camera, Boxes,
  MapPin, DoorOpen, ChevronUp, ChevronDown, X, StickyNote, Film, Layers, Info, AlertTriangle,
} from 'lucide-react';
import { GestioneSegnalazioniCard } from './segnalazioni/ConfigDialog';
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
  { key: 'cleaning', label: 'Pulizie', icon: Sparkles, desc: 'Pulizie e checklist' },
  { key: 'private_laundry', label: 'Lavanderia Privata', icon: Shirt, desc: 'Lavaggio biancheria di proprietà del cliente' },
  { key: 'rental_laundry', label: 'Lavanderia a Noleggio', icon: Layers, desc: 'Biancheria a noleggio Kilolava' },
  { key: 'consumables', label: 'Consumabili', icon: Package, desc: 'Reintegro consumabili' },
  { key: 'maintenance', label: 'Manutenzioni', icon: Wrench, desc: 'Interventi e segnalazioni' },
];

const MEDIA_CATS = [
  { key: 'arrive', label: 'Come arrivare' },
  { key: 'enter', label: 'Come entrare' },
  { key: 'warehouse', label: 'Magazzino struttura' },
];

const GENERAL_CATS = [
  { key: 'general', label: 'Foto / Video / Altro' },
];

const KEY_COPIES = [
  { letter: 'A', label: 'Addette alle Pulizie' },
  { letter: 'B', label: 'Rider' },
  { letter: 'C', label: 'Emergenza' },
];

const emptyBedConfig = { capacity_total: 0, beds_double: 0, beds_single: 0, sofa_beds: 0, capacity_persons: 0, beds_double_min: 0, beds_single_min: 0, sofa_beds_min: 0 };

const StructureDetailPage = () => {
  const { structureId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = structureId === 'new';

  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [units, setUnits] = useState([]);
  const [zones, setZones] = useState([]);
  const [section, setSection] = useState(searchParams.get('section') || 'general');

  const [form, setForm] = useState({
    client_id: searchParams.get('client_id') || '',
    name: '', structure_type: 'apartment', address: '', floor: '', interior: '',
    operational_contact: '', parking_info: '',
    has_units: false,
    access_type: 'keybox', access_details: '',
    access_info: { kilolava_has_keys: false, door_code: '', keybox_code: '', keybox_location: '' },
    warehouse_info: { location: '', code: '' },
    ical_url: '', ical_source: '',
    services: [], custom_services: [], cleaning_template_id: '',
    check_in_time: '15:00', check_out_time: '10:00',
    bed_config: { ...emptyBedConfig },
    operational_zone_id: '',
    expected_cleaning_minutes: '',
    notes: '', is_active: true,
  });

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
    api.get('/checklist-templates').then(r => setTemplates(r.data)).catch(() => {});
    api.get('/zones').then(r => setZones(r.data)).catch(() => {});
  }, []);

  const fetchStructure = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const res = await structuresApi.getOne(structureId);
      const s = res.data;
      setStructure(s);
      setForm({
        client_id: s.client_id || '', name: s.name || '', structure_type: s.structure_type || 'apartment',
        address: s.address || '', floor: s.floor || '', interior: s.interior || '',
        operational_contact: s.operational_contact || '', parking_info: s.parking_info || '',
        has_units: s.has_units || false,
        access_type: s.access_type || 'keybox', access_details: s.access_details || '',
        access_info: { kilolava_has_keys: false, door_code: '', keybox_code: '', keybox_location: '', ...(s.access_info || {}) },
        warehouse_info: { location: '', code: '', ...(s.warehouse_info || {}) },
        ical_url: s.ical_url || '', ical_source: s.ical_source || '',
        services: s.services || [], custom_services: s.custom_services || [],
        cleaning_template_id: s.cleaning_template_id || '',
        check_in_time: s.check_in_time || '15:00', check_out_time: s.check_out_time || '10:00',
        bed_config: { ...emptyBedConfig, ...(s.bed_config || {}) },
        operational_zone_id: s.operational_zone_id || '',
        expected_cleaning_minutes: s.expected_cleaning_minutes || '',
        notes: s.notes || '', is_active: s.is_active !== false,
      });
      const uRes = await unitsApi.getAll({ structure_id: structureId });
      setUnits(uRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [structureId, isNew]);

  useEffect(() => { fetchStructure(); }, [fetchStructure]);

  const set = (field, value) => setForm(p => ({ ...p, [field]: value }));
  const setAccess = (field, value) => setForm(p => ({ ...p, access_info: { ...p.access_info, [field]: value } }));
  const setWarehouse = (field, value) => setForm(p => ({ ...p, warehouse_info: { ...p.warehouse_info, [field]: value } }));
  const setBed = (field, value) => setForm(p => ({ ...p, bed_config: { ...p.bed_config, [field]: parseInt(value) || 0 } }));
  const setKeyBox = (letter, field, value) => setForm(p => ({
    ...p,
    access_info: {
      ...p.access_info,
      key_boxes: {
        ...(p.access_info.key_boxes || {}),
        [letter]: { ...((p.access_info.key_boxes || {})[letter] || {}), [field]: value },
      },
    },
  }));

  const toggleService = (key, on) => {
    setForm(p => ({
      ...p,
      services: on ? [...new Set([...p.services, key])] : p.services.filter(s => s !== key),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Il nome è obbligatorio'); return; }
    if (!form.client_id) { toast.error('Seleziona il cliente'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        cleaning_template_id: form.cleaning_template_id || null,
        expected_cleaning_minutes: form.expected_cleaning_minutes ? parseInt(form.expected_cleaning_minutes) : null,
      };
      if (isNew) {
        const res = await structuresApi.create(payload);
        toast.success(`Struttura creata — codice ${res.data.klv_code}`);
        navigate(`/structures/${res.data.id}`, { replace: true });
      } else {
        await structuresApi.update(structureId, payload);
        toast.success('Struttura salvata');
        fetchStructure();
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore nel salvataggio');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Caricamento...</div>;

  const SECTIONS = [
    { key: 'general', label: 'Generale', icon: Home },
    { key: 'services', label: 'Servizi', icon: Sparkles },
    { key: 'beds', label: 'Letti e Capacità', icon: Bed },
    { key: 'access', label: 'Accesso e Chiavi', icon: KeyRound },
    { key: 'segnalazioni', label: 'Gestione Segnalazioni', icon: AlertTriangle, disabled: isNew },
    { key: 'photos', label: 'Foto / Video / Altro', icon: Camera, disabled: isNew },
    ...(form.has_units ? [{ key: 'units', label: `Unità (${units.length})`, icon: DoorOpen, disabled: isNew }] : []),
  ];

  return (
    <div className="p-4 lg:p-8 space-y-5" data-testid="structure-detail-page">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/structures')} data-testid="back-btn">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {!isNew && structure?.klv_code && (
          <span className="px-2.5 py-1 rounded-md bg-primary/10 text-primary font-mono text-sm font-bold" data-testid="klv-code-badge">
            {structure.klv_code}
          </span>
        )}
        <div className="flex-1 min-w-[160px]">
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">{isNew ? 'Nuova Struttura' : form.name}</h1>
          {!isNew && structure?.client_name && (
            <button onClick={() => navigate(`/clients/${structure.client_id}`)} className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
              <User className="h-3 w-3" />{structure.client_name}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew && (
            <Button
              variant="outline"
              onClick={() => navigate(`/magazzino/noleggio/${structureId}`)}
              className="border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
              data-testid="open-warehouse-btn"
            >
              <Boxes className="h-4 w-4 mr-1.5" />Apri Magazzino Struttura
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="save-btn">
            <Save className="h-4 w-4 mr-1.5" />{saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Internal menu */}
        <nav className="lg:w-56 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible flex-shrink-0" data-testid="structure-sections-menu">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => !s.disabled && setSection(s.key)}
              disabled={s.disabled}
              title={s.disabled ? 'Salva prima la struttura' : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors text-left',
                section === s.key
                  ? 'bg-primary/10 text-primary font-semibold'
                  : s.disabled
                    ? 'text-muted-foreground/40 cursor-not-allowed'
                    : 'text-foreground/70 hover:bg-muted'
              )}
              data-testid={`section-${s.key}`}
            >
              <s.icon className="h-4 w-4 flex-shrink-0" />
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {section === 'general' && (
            <GeneralSection form={form} set={set} clients={clients} isNew={isNew} zones={zones} />
          )}
          {section === 'services' && (
            <ServicesSection form={form} set={set} toggleService={toggleService} templates={templates} />
          )}
          {section === 'beds' && (
            <BedsSection form={form} setBed={setBed} set={set} />
          )}
          {section === 'access' && (
            <>
              <AccessSection form={form} set={set} setAccess={setAccess} setKeyBox={setKeyBox} klvCode={structure?.klv_code} />
              {!isNew && (
                <div className="pt-2 space-y-4">
                  <h3 className="text-sm font-semibold">Istruzioni con foto e video</h3>
                  <MediaSection structureId={structureId} units={units} hasUnits={form.has_units} form={form} setWarehouse={setWarehouse} onSaveStructure={handleSave} />
                </div>
              )}
            </>
          )}
          {section === 'segnalazioni' && !isNew && (
            <GestioneSegnalazioniCard scope="structure" id={structureId} />
          )}
          {section === 'photos' && !isNew && (
            <>
              <p className="text-sm text-muted-foreground">
                Particolarità operative della casa: divano letto, caldaia, elettrodomestici, climatizzatore, punti delicati e informazioni speciali.
              </p>
              <MediaSection structureId={structureId} units={units} hasUnits={form.has_units} form={form} setWarehouse={setWarehouse} onSaveStructure={handleSave} categories={GENERAL_CATS} />
            </>
          )}
          {section === 'units' && !isNew && form.has_units && (
            <UnitsSection structureId={structureId} units={units} refresh={fetchStructure} />
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------- Sections ---------- */

const FieldRow = ({ label, children, hint }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <div className="mt-1">{children}</div>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

function GeneralSection({ form, set, clients, isNew, zones }) {
  return (
    <>
      <Card className="border shadow-none">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Dati principali</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Nome struttura *">
              <Input value={form.name} onChange={e => set('name', e.target.value)} className="h-9" data-testid="name-input" />
            </FieldRow>
            <FieldRow label="Cliente *">
              <Select value={form.client_id || 'none'} onValueChange={v => set('client_id', v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9" data-testid="client-select"><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleziona...</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Categoria">
              <Select value={form.structure_type} onValueChange={v => set('structure_type', v)}>
                <SelectTrigger className="h-9" data-testid="category-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <div className="flex items-center gap-3 pt-5">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} data-testid="active-toggle" />
              <Label className="text-sm">{form.is_active ? 'Struttura attiva' : 'Struttura non attiva'}</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Indirizzo</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-3">
              <FieldRow label="Indirizzo (via e numero civico)">
                <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Via Roma 1" className="h-9" data-testid="address-input" />
              </FieldRow>
            </div>
            <FieldRow label="Piano">
              <Input value={form.floor} onChange={e => set('floor', e.target.value)} placeholder="es. 2" className="h-9" data-testid="floor-input" />
            </FieldRow>
            <FieldRow label="Interno">
              <Input value={form.interior} onChange={e => set('interior', e.target.value)} placeholder="es. Int. 5" className="h-9" data-testid="interior-input" />
            </FieldRow>
            <div className="sm:col-span-3">
              <FieldRow label="Rione / Zona operativa" hint="Zona operativa Kilolava della struttura: usata per organizzare le pulizie per giro.">
                <Select value={form.operational_zone_id || 'none'} onValueChange={v => set('operational_zone_id', v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9" data-testid="zone-select">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      <SelectValue placeholder="Seleziona rione..." />
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="none">Nessuno / Da definire</SelectItem>
                    {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}{z.group ? ` — ${z.group}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>
            <FieldRow label="Durata pulizia prevista (min)" hint="Stima iniziale usata finché non c'è abbastanza storico reale.">
              <Input type="number" min={10} max={600} value={form.expected_cleaning_minutes} onChange={e => set('expected_cleaning_minutes', e.target.value)} placeholder="es. 75" className="h-9" data-testid="expected-cleaning-minutes-input" />
            </FieldRow>
            <FieldRow label="Parcheggio">
              <Input value={form.parking_info} onChange={e => set('parking_info', e.target.value)} placeholder="es. Strisce blu in piazza" className="h-9" data-testid="parking-input" />
            </FieldRow>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Operatività</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Contatto operativo">
              <Input value={form.operational_contact} onChange={e => set('operational_contact', e.target.value)} placeholder="Nome e telefono" className="h-9" data-testid="contact-input" />
            </FieldRow>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Check-in">
                <Input type="time" value={form.check_in_time} onChange={e => set('check_in_time', e.target.value)} className="h-9" data-testid="checkin-time" />
              </FieldRow>
              <FieldRow label="Check-out">
                <Input type="time" value={form.check_out_time} onChange={e => set('check_out_time', e.target.value)} className="h-9" data-testid="checkout-time" />
              </FieldRow>
            </div>
          </div>
          <FieldRow label="Note generali">
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} data-testid="notes-input" />
          </FieldRow>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3.5">
            <div>
              <p className="text-sm font-medium">Questa struttura contiene più Unità?</p>
              <p className="text-xs text-muted-foreground">Attiva solo per affittacamere, hotel o strutture con camere gestite separatamente.</p>
            </div>
            <Switch checked={form.has_units} onCheckedChange={v => set('has_units', v)} data-testid="has-units-toggle" />
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Calendario OTA / iCal</h3>
          <div className="flex gap-2">
            {[{ key: 'airbnb', label: 'Airbnb' }, { key: 'booking_com', label: 'Booking.com' }].map(p => (
              <button
                key={p.key}
                onClick={() => set('ical_source', form.ical_source === p.key ? '' : p.key)}
                className={cn(
                  'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                  form.ical_source === p.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-muted-foreground/40'
                )}
                data-testid={`ota-${p.key}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <FieldRow label="URL iCal">
            <Input value={form.ical_url} onChange={e => set('ical_url', e.target.value)} placeholder="https://..." className="h-9 font-mono text-xs" data-testid="ical-url-input" />
          </FieldRow>
        </CardContent>
      </Card>
    </>
  );
}

function ServicesSection({ form, set, toggleService, templates }) {
  return (
    <Card className="border shadow-none">
      <CardContent className="p-5 space-y-1">
        <h3 className="text-sm font-semibold mb-3">Servizi attivi</h3>
        {SERVICE_DEFS.map(svc => {
          const active = form.services.includes(svc.key);
          return (
            <div key={svc.key} className="flex items-center justify-between gap-3 py-3 border-b border-border/60 last:border-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  <svc.icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                </div>
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium', !active && 'text-muted-foreground')}>{svc.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{svc.desc}</p>
                </div>
              </div>
              <Switch checked={active} onCheckedChange={v => toggleService(svc.key, v)} data-testid={`service-${svc.key}`} />
            </div>
          );
        })}
        {form.services.includes('cleaning') && (
          <div className="pt-4">
            <FieldRow label="Template checklist pulizie">
              <Select value={form.cleaning_template_id || 'none'} onValueChange={v => set('cleaning_template_id', v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9" data-testid="cleaning-template-select"><SelectValue placeholder="Seleziona template..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun template</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BedsSection({ form, setBed }) {
  const bc = form.bed_config;
  return (
    <>
      <Card className="border shadow-none">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Letti</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <FieldRow label="Posti letto totali">
              <Input type="number" min={0} value={bc.capacity_total} onChange={e => setBed('capacity_total', e.target.value)} className="h-9" data-testid="beds-total" />
            </FieldRow>
            <FieldRow label="Letti matrimoniali">
              <Input type="number" min={0} value={bc.beds_double} onChange={e => setBed('beds_double', e.target.value)} className="h-9" data-testid="beds-double" />
            </FieldRow>
            <FieldRow label="Letti singoli">
              <Input type="number" min={0} value={bc.beds_single} onChange={e => setBed('beds_single', e.target.value)} className="h-9" data-testid="beds-single" />
            </FieldRow>
            <FieldRow label="Divani letto">
              <Input type="number" min={0} value={bc.sofa_beds} onChange={e => setBed('sofa_beds', e.target.value)} className="h-9" data-testid="beds-sofa" />
            </FieldRow>
          </div>
          <div className="pt-2 border-t border-border">
            <p className="text-xs font-semibold mb-1">Preparazione minima / predefinita</p>
            <p className="text-xs text-muted-foreground mb-3">Valori precompilati quando viene creata una nuova pulizia per questa struttura. I massimi sopra non possono essere superati.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FieldRow label="Matrimoniali minimi">
                <Input type="number" min={0} max={bc.beds_double} value={bc.beds_double_min || 0} onChange={e => setBed('beds_double_min', e.target.value)} className="h-9" data-testid="beds-double-min" />
              </FieldRow>
              <FieldRow label="Singoli minimi">
                <Input type="number" min={0} max={bc.beds_single} value={bc.beds_single_min || 0} onChange={e => setBed('beds_single_min', e.target.value)} className="h-9" data-testid="beds-single-min" />
              </FieldRow>
              <FieldRow label="Divani letto minimi">
                <Input type="number" min={0} max={bc.sofa_beds} value={bc.sofa_beds_min || 0} onChange={e => setBed('sofa_beds_min', e.target.value)} className="h-9" data-testid="beds-sofa-min" />
              </FieldRow>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border border-primary/25 shadow-none">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Capacità base operativa</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Numero di persone per cui la struttura viene preparata di standard. Non coincide necessariamente con i posti letto reali: serve per pulizie, kit e biancheria.
          </p>
          <div className="max-w-[180px]">
            <FieldRow label="Persone (preparazione standard)">
              <Input type="number" min={0} value={bc.capacity_persons} onChange={e => setBed('capacity_persons', e.target.value)} className="h-9" data-testid="capacity-persons" />
            </FieldRow>
          </div>
          {form.has_units && (
            <p className="text-xs text-muted-foreground">Se la struttura ha Unità, questi valori possono essere configurati anche sulla singola Unità.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function AccessSection({ form, set, setAccess, setKeyBox, klvCode }) {
  const ai = form.access_info;
  return (
    <>
      <Card className="border shadow-none">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Kilolava possiede le chiavi?</h3>
              <p className="text-xs text-muted-foreground">Copie fisiche delle chiavi in gestione a Kilolava.</p>
            </div>
            <Switch checked={!!ai.kilolava_has_keys} onCheckedChange={v => setAccess('kilolava_has_keys', v)} data-testid="has-keys-toggle" />
          </div>
          {ai.kilolava_has_keys && (
            <div className="space-y-2.5">
              {KEY_COPIES.map(kc => {
                const kb = (ai.key_boxes || {})[kc.letter] || {};
                const exists = kb.exists !== undefined ? !!kb.exists : !!kb.present;
                const present = exists && !!kb.present;
                return (
                  <div key={kc.letter} className="rounded-lg border border-border p-3.5" data-testid={`keybox-${kc.letter}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold">
                          {klvCode ? `${klvCode}-${kc.letter}` : `KLV-····-${kc.letter}`}
                        </span>
                        <span className="text-xs font-medium">Box {kc.letter} — {kc.label}</span>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <span className={cn('text-xs font-semibold', !exists ? 'text-red-500' : present ? 'text-emerald-600' : 'text-amber-600')}>
                          {!exists ? 'Copia mancante' : present ? 'Presente in lavanderia' : 'Fuori sede'}
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          Copia esistente
                          <Switch
                            checked={exists}
                            onCheckedChange={v => { setKeyBox(kc.letter, 'exists', v); if (!v) setKeyBox(kc.letter, 'present', false); }}
                            data-testid={`keybox-exists-${kc.letter}`}
                          />
                        </label>
                        {exists && (
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            In lavanderia
                            <Switch
                              checked={present}
                              onCheckedChange={v => { setKeyBox(kc.letter, 'exists', true); setKeyBox(kc.letter, 'present', v); }}
                              data-testid={`keybox-present-${kc.letter}`}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <FieldRow label="Box">
                        <Input value={kb.box ?? kc.letter} onChange={e => setKeyBox(kc.letter, 'box', e.target.value)} placeholder={kc.letter} className="h-8 font-mono text-xs" data-testid={`keybox-box-${kc.letter}`} />
                      </FieldRow>
                      <FieldRow label="Slot">
                        <Input value={kb.slot || ''} onChange={e => setKeyBox(kc.letter, 'slot', e.target.value)} placeholder="es. 42" className="h-8 font-mono text-xs" data-testid={`keybox-slot-${kc.letter}`} />
                      </FieldRow>
                      <FieldRow label="Nota">
                        <Input value={kb.note || ''} onChange={e => setKeyBox(kc.letter, 'note', e.target.value)} className="h-8 text-xs" />
                      </FieldRow>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                Il portachiavi fisico è identificato solo dal codice KLV, mai da nome, indirizzo, piano o cliente. Predisposto per QR anonimo di recupero chiavi.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-none">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold">Codici di accesso</h3>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />Informazioni sensibili, visibili solo ai ruoli autorizzati.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Codice portone">
              <Input value={ai.door_code || ''} onChange={e => setAccess('door_code', e.target.value)} className="h-9 font-mono" data-testid="door-code-input" />
            </FieldRow>
            <FieldRow label="Codice keybox">
              <Input value={ai.keybox_code || ''} onChange={e => setAccess('keybox_code', e.target.value)} className="h-9 font-mono" data-testid="keybox-code-input" />
            </FieldRow>
            <div className="sm:col-span-2">
              <FieldRow label="Posizione keybox">
                <Input value={ai.keybox_location || ''} onChange={e => setAccess('keybox_location', e.target.value)} placeholder="es. Sul cancello a destra del portone" className="h-9" data-testid="keybox-location-input" />
              </FieldRow>
            </div>
            <div className="sm:col-span-2">
              <FieldRow label="Posizione chiavi">
                <Input value={ai.keys_location || ''} onChange={e => setAccess('keys_location', e.target.value)} placeholder="es. Chiavi appese dietro la porta del magazzino" className="h-9" data-testid="keys-location-input" />
              </FieldRow>
            </div>
            <FieldRow label="Metodo di accesso principale">
              <Select value={form.access_type} onValueChange={v => set('access_type', v)}>
                <SelectTrigger className="h-9" data-testid="access-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keybox">Keybox</SelectItem>
                  <SelectItem value="keys">Chiavi</SelectItem>
                  <SelectItem value="code">Codice</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <div className="sm:col-span-2">
              <FieldRow label="Altre istruzioni di accesso">
                <Textarea value={form.access_details} onChange={e => set('access_details', e.target.value)} rows={2} placeholder="es. Citofonare Rossi, secondo piano..." data-testid="access-details-input" />
              </FieldRow>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ---------- Media section ---------- */

function MediaSection({ structureId, units, hasUnits, form, setWarehouse, onSaveStructure, categories = MEDIA_CATS }) {
  const [cat, setCat] = useState(categories[0].key);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [noteForm, setNoteForm] = useState(null);
  const fileInputRef = useRef(null);

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/structures/${structureId}/media`);
      setMedia(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [structureId]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  const catMedia = media.filter(m => m.category === cat).sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', cat);
      await api.post(`/structures/${structureId}/media`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Contenuto caricato — aggiungi una descrizione');
      fetchMedia();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore nel caricamento');
    } finally { setUploading(false); }
  };

  const handleAddNote = async () => {
    if (!noteForm?.description?.trim() && !noteForm?.title?.trim()) { toast.error('Scrivi la nota'); return; }
    try {
      await api.post(`/structures/${structureId}/media/note`, { ...noteForm, category: cat });
      setNoteForm(null);
      toast.success('Nota aggiunta');
      fetchMedia();
    } catch (err) { toast.error('Errore'); }
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/structures/${structureId}/media/${editItem.id}`, {
        title: editItem.title || null,
        description: editItem.description || null,
        unit_id: editItem.unit_id || null,
      });
      setEditItem(null);
      toast.success('Aggiornato');
      fetchMedia();
    } catch (err) { toast.error('Errore'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Eliminare questo contenuto?')) return;
    try {
      await api.delete(`/structures/${structureId}/media/${id}`);
      fetchMedia();
    } catch (err) { toast.error('Errore'); }
  };

  const move = async (index, dir) => {
    const ids = catMedia.map(m => m.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await api.post(`/structures/${structureId}/media/reorder`, { ids });
      fetchMedia();
    } catch (err) { toast.error('Errore'); }
  };

  const unitName = (uid) => units.find(u => u.id === uid)?.name;

  return (
    <div className="space-y-4">
      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit max-w-full overflow-x-auto">
          {categories.map(c => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={cn(
                'px-3.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                cat === c.key ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid={`media-cat-${c.key}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* Warehouse extra fields */}
      {cat === 'warehouse' && (
        <Card className="border shadow-none">
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldRow label="Posizione magazzino">
                <Input value={form.warehouse_info.location || ''} onChange={e => setWarehouse('location', e.target.value)} placeholder="es. Piano terra, seconda porta a sinistra" className="h-9" data-testid="warehouse-location-input" />
              </FieldRow>
              <FieldRow label="Codice magazzino">
                <Input value={form.warehouse_info.code || ''} onChange={e => setWarehouse('code', e.target.value)} placeholder="es. 2580" className="h-9 font-mono" data-testid="warehouse-code-input" />
              </FieldRow>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onSaveStructure} data-testid="save-warehouse-info-btn">
              <Save className="h-3.5 w-3.5 mr-1" />Salva posizione e codice
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add buttons */}
      <div className="flex gap-2 flex-wrap">
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelected} data-testid="media-file-input" />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="add-media-btn">
          <Camera className="h-4 w-4 mr-1.5" />{uploading ? 'Caricamento...' : 'Aggiungi foto / video'}
        </Button>
        <Button variant="outline" onClick={() => setNoteForm({ title: '', description: '', unit_id: '' })} className="h-9" data-testid="add-note-btn">
          <StickyNote className="h-4 w-4 mr-1.5" />Aggiungi nota
        </Button>
      </div>

      {/* Note form */}
      {noteForm && (
        <Card className="border border-primary/25 shadow-none">
          <CardContent className="p-4 space-y-3">
            <Input value={noteForm.title} onChange={e => setNoteForm(p => ({ ...p, title: e.target.value }))} placeholder="Titolo (opzionale)" className="h-9" data-testid="note-title-input" />
            <Textarea value={noteForm.description} onChange={e => setNoteForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder='es. "Entrare dal portone accanto al bar e salire la prima rampa di scale."' data-testid="note-desc-input" />
            {hasUnits && units.length > 0 && (
              <Select value={noteForm.unit_id || 'common'} onValueChange={v => setNoteForm(p => ({ ...p, unit_id: v === 'common' ? '' : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="common">Comune a tutta la struttura</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>Specifica: {u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleAddNote} data-testid="save-note-btn">Salva nota</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setNoteForm(null)}>Annulla</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Media list */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-4">Caricamento...</p>
      ) : catMedia.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl" data-testid="media-empty">
          <Film className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Nessun contenuto in "{categories.find(c => c.key === cat)?.label}"</p>
        </div>
      ) : (
        <div className="space-y-2">
          {catMedia.map((m, idx) => (
            <Card key={m.id} className="border shadow-none" data-testid={`media-item-${m.id}`}>
              <CardContent className="p-3 flex gap-3">
                {m.media_type === 'photo' && (
                  <a href={fileUrl(m.path)} target="_blank" rel="noreferrer" className="flex-shrink-0">
                    <img src={fileUrl(m.path)} alt={m.title || ''} className="w-24 h-24 object-cover rounded-lg border border-border" />
                  </a>
                )}
                {m.media_type === 'video' && (
                  <video src={fileUrl(m.path)} controls className="w-40 h-24 rounded-lg border border-border bg-black flex-shrink-0" />
                )}
                {m.media_type === 'note' && (
                  <div className="w-12 h-12 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                    <StickyNote className="h-5 w-5 text-amber-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {m.title && <p className="text-sm font-semibold">{m.title}</p>}
                    {m.unit_id && unitName(m.unit_id) && (
                      <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">{unitName(m.unit_id)}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{m.description || <span className="italic">Nessuna descrizione</span>}</p>
                </div>
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, -1)} disabled={idx === 0} data-testid={`media-up-${m.id}`}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => move(idx, 1)} disabled={idx === catMedia.length - 1} data-testid={`media-down-${m.id}`}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditItem({ ...m })} data-testid={`media-edit-${m.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(m.id)} data-testid={`media-delete-${m.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog (inline panel) */}
      {editItem && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setEditItem(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-md bg-card border border-border rounded-xl shadow-xl z-[60] p-5 space-y-3" data-testid="media-edit-dialog">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Modifica contenuto</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditItem(null)}><X className="h-4 w-4" /></Button>
            </div>
            <Input value={editItem.title || ''} onChange={e => setEditItem(p => ({ ...p, title: e.target.value }))} placeholder="Titolo (opzionale)" className="h-9" data-testid="edit-media-title" />
            <Textarea value={editItem.description || ''} onChange={e => setEditItem(p => ({ ...p, description: e.target.value }))} rows={3} placeholder="Descrizione / nota operativa" data-testid="edit-media-desc" />
            {hasUnits && units.length > 0 && (
              <Select value={editItem.unit_id || 'common'} onValueChange={v => setEditItem(p => ({ ...p, unit_id: v === 'common' ? '' : v }))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="common">Comune a tutta la struttura</SelectItem>
                  {units.map(u => <SelectItem key={u.id} value={u.id}>Specifica: {u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleUpdate} data-testid="save-media-edit-btn">Salva</Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Units section ---------- */

function UnitsSection({ structureId, units, refresh }) {
  const [panel, setPanel] = useState(null); // {id?, name, unit_type, bed_config, notes, is_active}

  const openNew = () => setPanel({ name: '', unit_type: 'room', bed_config: { ...emptyBedConfig }, notes: '', is_active: true });
  const openEdit = (u) => setPanel({ id: u.id, name: u.name, unit_type: u.unit_type || 'room', bed_config: { ...emptyBedConfig, ...(u.bed_config || {}) }, notes: u.notes || '', is_active: u.is_active !== false });

  const save = async () => {
    if (!panel.name.trim()) { toast.error('Il nome è obbligatorio'); return; }
    try {
      if (panel.id) {
        await unitsApi.update(panel.id, { name: panel.name, unit_type: panel.unit_type, bed_config: panel.bed_config, notes: panel.notes, is_active: panel.is_active });
        toast.success('Unità aggiornata');
      } else {
        await unitsApi.create({ structure_id: structureId, name: panel.name, unit_type: panel.unit_type, bed_config: panel.bed_config, notes: panel.notes, is_active: panel.is_active });
        toast.success('Unità creata');
      }
      setPanel(null);
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const remove = async (id) => {
    if (!window.confirm('Eliminare questa unità?')) return;
    try {
      await unitsApi.delete(id);
      toast.success('Unità eliminata');
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const setBed = (f, v) => setPanel(p => ({ ...p, bed_config: { ...p.bed_config, [f]: parseInt(v) || 0 } }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Camere o appartamenti gestiti separatamente all'interno della struttura.</p>
        <Button size="sm" className="h-8 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openNew} data-testid="add-unit-btn">
          <Plus className="h-3.5 w-3.5 mr-1" />Nuova Unità
        </Button>
      </div>

      {units.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <DoorOpen className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Nessuna unità creata</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {units.map(u => (
            <Card key={u.id} className="border shadow-none" data-testid={`unit-card-${u.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="font-semibold text-sm">{u.name}</p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)} data-testid={`edit-unit-${u.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(u.id)} data-testid={`delete-unit-${u.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {u.bed_config && (
                  <p className="text-xs text-muted-foreground">
                    Posti {u.bed_config.capacity_total || 0} · Matr. {u.bed_config.beds_double || 0} · Sing. {u.bed_config.beds_single || 0} · Persone {u.bed_config.capacity_persons || 0}
                  </p>
                )}
                {!u.is_active && <span className="text-xs text-red-500 font-medium">Non attiva</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {panel && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setPanel(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-lg bg-card border border-border rounded-xl shadow-xl z-[60] p-5 space-y-4 max-h-[85vh] overflow-y-auto" data-testid="unit-panel">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{panel.id ? 'Modifica Unità' : 'Nuova Unità'}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPanel(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Nome *">
                <Input value={panel.name} onChange={e => setPanel(p => ({ ...p, name: e.target.value }))} placeholder="es. Camera 3" className="h-9" data-testid="unit-name-input" />
              </FieldRow>
              <FieldRow label="Tipo">
                <Select value={panel.unit_type} onValueChange={v => setPanel(p => ({ ...p, unit_type: v }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room">Camera</SelectItem>
                    <SelectItem value="apartment">Appartamento</SelectItem>
                    <SelectItem value="other">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FieldRow label="Posti letto"><Input type="number" min={0} value={panel.bed_config.capacity_total} onChange={e => setBed('capacity_total', e.target.value)} className="h-9" /></FieldRow>
              <FieldRow label="Matrimoniali"><Input type="number" min={0} value={panel.bed_config.beds_double} onChange={e => setBed('beds_double', e.target.value)} className="h-9" /></FieldRow>
              <FieldRow label="Singoli"><Input type="number" min={0} value={panel.bed_config.beds_single} onChange={e => setBed('beds_single', e.target.value)} className="h-9" /></FieldRow>
              <FieldRow label="Divani letto"><Input type="number" min={0} value={panel.bed_config.sofa_beds} onChange={e => setBed('sofa_beds', e.target.value)} className="h-9" /></FieldRow>
              <FieldRow label="Persone (capacità)"><Input type="number" min={0} value={panel.bed_config.capacity_persons} onChange={e => setBed('capacity_persons', e.target.value)} className="h-9" data-testid="unit-capacity-persons" /></FieldRow>
            </div>
            <FieldRow label="Note">
              <Textarea value={panel.notes} onChange={e => setPanel(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </FieldRow>
            <div className="flex items-center gap-2">
              <Switch checked={panel.is_active} onCheckedChange={v => setPanel(p => ({ ...p, is_active: v }))} />
              <Label className="text-xs">{panel.is_active ? 'Attiva' : 'Non attiva'}</Label>
            </div>
            <Button className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={save} data-testid="save-unit-btn">Salva Unità</Button>
          </div>
        </>
      )}
    </div>
  );
}

export default StructureDetailPage;
