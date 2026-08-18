import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { clientsApi, structuresApi, unitsApi, operationsApi, inventoryApi } from '../lib/api';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import { Download as DownloadIcon, Loader2 as LoaderIcon } from 'lucide-react';
import { 
  ChevronLeft, ChevronDown, ChevronRight, Plus, Pencil, Trash2, X,
  Building2, DoorOpen, MapPin, Key, Bed, Package, Truck, Sparkles,
  Link2, Phone, Mail, Home, Layers, Clock, User, Briefcase,
  Shield, ShoppingCart, BookOpen
} from 'lucide-react';
import { cn } from '../lib/utils';

const ACCESS_TYPES = ['keybox', 'keys', 'code'];
const STRUCTURE_TYPES = ['apartment', 'guesthouse', 'hotel', 'office', 'other'];
const STRUCTURE_SERVICES = ['cleaning', 'private_laundry', 'rental_laundry', 'consumables', 'maintenance'];
const UNIT_TYPES = ['apartment', 'room', 'office', 'other'];
const LOGISTICS_MODES = ['dynamic', 'fixed'];
const COMPLEXITY_LEVELS = ['low', 'medium', 'high'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const defaultUnitForm = {
  structure_id: '',
  name: '',
  unit_type: 'apartment',
  bed_config: { capacity_total: 0, beds_double: 0, beds_single: 0, sofa_beds: 0 },
  kit_config: { kit_double_per_set: 0, kit_single_per_set: 0 },
  stock_config: { target_kit_sets: 3, minimum_threshold: 1 },
  logistics_config: { logistics_mode: 'dynamic', pickup_days: [], pickup_time_window: '' },
  cleaning_config: { checklist_template_id: '', estimated_cleaning_time: 60, complexity_level: 'medium' },
  notes: '',
  is_active: true,
};

// Large Side Panel - full height, 30-40% width
const SidePanel = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className={cn(
        "fixed top-0 right-0 h-full bg-card border-l border-border z-50 shadow-2xl",
        "flex flex-col animate-in slide-in-from-right duration-200",
        wide ? "w-full sm:w-[55%] lg:w-[45%] xl:w-[40%]" : "w-full sm:w-[45%] lg:w-[38%] xl:w-[32%]"
      )}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-lg">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" data-testid="close-panel-btn">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </>
  );
};

// Unit Edit Panel with Vertical Menu
const UnitEditPanel = ({ open, onClose, unit, structureId, onSave, t }) => {
  const [activeSection, setActiveSection] = useState('general');
  const [formData, setFormData] = useState({ ...defaultUnitForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (unit) {
      setFormData({
        structure_id: unit.structure_id || structureId,
        name: unit.name || '',
        unit_type: unit.unit_type || 'apartment',
        bed_config: unit.bed_config || defaultUnitForm.bed_config,
        kit_config: unit.kit_config || defaultUnitForm.kit_config,
        stock_config: unit.stock_config || defaultUnitForm.stock_config,
        logistics_config: unit.logistics_config || defaultUnitForm.logistics_config,
        cleaning_config: unit.cleaning_config || defaultUnitForm.cleaning_config,
        notes: unit.notes || '',
        is_active: unit.is_active ?? true,
      });
    } else {
      setFormData({ ...defaultUnitForm, structure_id: structureId });
    }
    setActiveSection('general');
  }, [unit, structureId, open]);

  const sections = [
    { id: 'general', label: t('units.sections.general'), icon: Home },
    { id: 'beds', label: t('units.sections.beds'), icon: Bed },
    { id: 'kit', label: t('units.sections.kit'), icon: Layers },
    { id: 'stock', label: t('units.sections.stock'), icon: Package },
    { id: 'logistics', label: t('units.sections.logistics'), icon: Truck },
    { id: 'cleaning', label: t('units.sections.cleaning'), icon: Sparkles },
  ];

  const updateBedConfig = (field, value) => {
    setFormData(prev => ({ ...prev, bed_config: { ...prev.bed_config, [field]: parseInt(value) || 0 } }));
  };
  const updateKitConfig = (field, value) => {
    setFormData(prev => ({ ...prev, kit_config: { ...prev.kit_config, [field]: parseInt(value) || 0 } }));
  };
  const updateStockConfig = (field, value) => {
    setFormData(prev => ({ ...prev, stock_config: { ...prev.stock_config, [field]: parseInt(value) || 0 } }));
  };
  const updateLogisticsConfig = (field, value) => {
    setFormData(prev => ({ ...prev, logistics_config: { ...prev.logistics_config, [field]: value } }));
  };
  const updateCleaningConfig = (field, value) => {
    setFormData(prev => ({ ...prev, cleaning_config: { ...prev.cleaning_config, [field]: value } }));
  };

  const togglePickupDay = (day) => {
    const currentDays = formData.logistics_config.pickup_days || [];
    const newDays = currentDays.includes(day) ? currentDays.filter(d => d !== day) : [...currentDays, day];
    updateLogisticsConfig('pickup_days', newDays);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast.error(t('common.required')); return; }
    setSaving(true);
    try {
      await onSave(formData, unit?.id);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel open={open} onClose={onClose} title={unit ? t('units.edit') : t('units.addNew')} wide>
      <div className="flex h-full">
        {/* Vertical Menu */}
        <div className="w-[160px] lg:w-[180px] border-r border-border bg-muted/20 py-2 flex-shrink-0 overflow-y-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              data-testid={`unit-section-${section.id}`}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left",
                activeSection === section.id
                  ? "bg-primary/10 text-primary border-r-2 border-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <section.icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{section.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {activeSection === 'general' && (
              <>
                <div className="space-y-2">
                  <Label>{t('units.name')} *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="es. Apt 2, Camera 3" data-testid="unit-name-input" />
                </div>
                <div className="space-y-2">
                  <Label>{t('units.unitType')}</Label>
                  <Select value={formData.unit_type} onValueChange={(value) => setFormData({ ...formData, unit_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map((type) => (<SelectItem key={type} value={type}>{t(`units.types.${type}`)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('units.notes')}</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} className="resize-none" />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Label>{t('units.active')}</Label>
                  <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
                </div>
              </>
            )}

            {activeSection === 'beds' && (
              <>
                <p className="text-sm text-muted-foreground">Configura la capacita e i letti dell'unita.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t('units.beds.capacityTotal')}</Label><Input type="number" min="0" value={formData.bed_config.capacity_total} onChange={(e) => updateBedConfig('capacity_total', e.target.value)} /></div>
                  <div className="space-y-2"><Label>{t('units.beds.bedsDouble')}</Label><Input type="number" min="0" value={formData.bed_config.beds_double} onChange={(e) => updateBedConfig('beds_double', e.target.value)} /></div>
                  <div className="space-y-2"><Label>{t('units.beds.bedsSingle')}</Label><Input type="number" min="0" value={formData.bed_config.beds_single} onChange={(e) => updateBedConfig('beds_single', e.target.value)} /></div>
                  <div className="space-y-2"><Label>{t('units.beds.sofaBeds')}</Label><Input type="number" min="0" value={formData.bed_config.sofa_beds} onChange={(e) => updateBedConfig('sofa_beds', e.target.value)} /></div>
                </div>
              </>
            )}

            {activeSection === 'kit' && (
              <>
                <p className="text-sm text-muted-foreground">{t('units.kit.description')}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t('units.kit.kitDoublePerSet')}</Label><Input type="number" min="0" value={formData.kit_config.kit_double_per_set} onChange={(e) => updateKitConfig('kit_double_per_set', e.target.value)} /></div>
                  <div className="space-y-2"><Label>{t('units.kit.kitSinglePerSet')}</Label><Input type="number" min="0" value={formData.kit_config.kit_single_per_set} onChange={(e) => updateKitConfig('kit_single_per_set', e.target.value)} /></div>
                </div>
              </>
            )}

            {activeSection === 'stock' && (
              <>
                <p className="text-sm text-muted-foreground">{t('units.stock.description')}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>{t('units.stock.targetKitSets')}</Label><Input type="number" min="0" value={formData.stock_config.target_kit_sets} onChange={(e) => updateStockConfig('target_kit_sets', e.target.value)} /></div>
                  <div className="space-y-2"><Label>{t('units.stock.minimumThreshold')}</Label><Input type="number" min="0" value={formData.stock_config.minimum_threshold} onChange={(e) => updateStockConfig('minimum_threshold', e.target.value)} /></div>
                </div>
              </>
            )}

            {activeSection === 'logistics' && (
              <>
                <div className="space-y-2">
                  <Label>{t('units.logistics.logisticsMode')}</Label>
                  <Select value={formData.logistics_config.logistics_mode} onValueChange={(value) => updateLogisticsConfig('logistics_mode', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LOGISTICS_MODES.map((mode) => (<SelectItem key={mode} value={mode}>{t(`units.logistics.modes.${mode}`)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.logistics_config.logistics_mode === 'fixed' && (
                  <>
                    <div className="space-y-2">
                      <Label>{t('units.logistics.pickupDays')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((day) => (
                          <label key={day} className="flex items-center gap-1.5 cursor-pointer">
                            <Checkbox checked={(formData.logistics_config.pickup_days || []).includes(day)} onCheckedChange={() => togglePickupDay(day)} />
                            <span className="text-sm">{t(`units.days.${day}`)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('units.logistics.pickupTimeWindow')}</Label>
                      <Input placeholder="es. 09:00-12:00" value={formData.logistics_config.pickup_time_window || ''} onChange={(e) => updateLogisticsConfig('pickup_time_window', e.target.value)} />
                    </div>
                  </>
                )}
              </>
            )}

            {activeSection === 'cleaning' && (
              <>
                <div className="space-y-2">
                  <Label>{t('units.cleaning.estimatedCleaningTime')}</Label>
                  <Input type="number" min="0" value={formData.cleaning_config.estimated_cleaning_time} onChange={(e) => updateCleaningConfig('estimated_cleaning_time', parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label>{t('units.cleaning.complexityLevel')}</Label>
                  <Select value={formData.cleaning_config.complexity_level} onValueChange={(value) => updateCleaningConfig('complexity_level', value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COMPLEXITY_LEVELS.map((level) => (<SelectItem key={level} value={level}>{t(`units.cleaning.complexity.${level}`)}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('units.cleaning.checklistTemplateId')}</Label>
                  <Input placeholder="ID template (opzionale)" value={formData.cleaning_config.checklist_template_id || ''} onChange={(e) => updateCleaningConfig('checklist_template_id', e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="px-5 py-4 border-t border-border bg-muted/20 flex gap-3 flex-shrink-0">
            <Button variant="outline" onClick={onClose} className="flex-1">{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-unit-btn">
              {saving ? t('common.loading') : (unit ? t('common.update') : t('common.create'))}
            </Button>
          </div>
        </div>
      </div>
    </SidePanel>
  );
};

// Structure Edit Panel with structure_type + services
const StructureEditPanel = ({ open, onClose, structure, clientId, onSave, t }) => {
  const [formData, setFormData] = useState({
    client_id: clientId,
    name: '',
    structure_type: 'apartment',
    address: '',
    access_type: 'keybox',
    access_details: '',
    ical_url: '',
    services: [],
    notes: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (structure) {
      setFormData({
        client_id: clientId,
        name: structure.name || '',
        structure_type: structure.structure_type || 'apartment',
        address: structure.address || '',
        access_type: structure.access_type || 'keybox',
        access_details: structure.access_details || '',
        ical_url: structure.ical_url || '',
        services: structure.services || [],
        notes: structure.notes || '',
        is_active: structure.is_active ?? true,
      });
    } else {
      setFormData({
        client_id: clientId,
        name: '',
        structure_type: 'apartment',
        address: '',
        access_type: 'keybox',
        access_details: '',
        ical_url: '',
        services: [],
        notes: '',
        is_active: true,
      });
    }
  }, [structure, clientId, open]);

  const toggleService = (service) => {
    setFormData(prev => ({
      ...prev,
      services: prev.services.includes(service) ? prev.services.filter(s => s !== service) : [...prev.services, service]
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast.error(t('common.required')); return; }
    setSaving(true);
    try {
      await onSave(formData, structure?.id);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel open={open} onClose={onClose} title={structure ? t('structures.edit') : t('structures.addNew')}>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="space-y-2">
          <Label>{t('structures.name')} *</Label>
          <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} data-testid="structure-name-input" />
        </div>

        <div className="space-y-2">
          <Label>{t('structures.structureType')}</Label>
          <Select value={formData.structure_type} onValueChange={(value) => setFormData({ ...formData, structure_type: value })}>
            <SelectTrigger data-testid="structure-type-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STRUCTURE_TYPES.map((type) => (<SelectItem key={type} value={type}>{t(`structures.structureTypes.${type}`)}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t('structures.address')}</Label>
          <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Via Roma 1, Milano" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('structures.accessType')}</Label>
            <Select value={formData.access_type} onValueChange={(value) => setFormData({ ...formData, access_type: value })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCESS_TYPES.map((type) => (<SelectItem key={type} value={type}>{t(`structures.accessTypes.${type}`)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('structures.accessDetails')}</Label>
            <Input value={formData.access_details} onChange={(e) => setFormData({ ...formData, access_details: e.target.value })} placeholder="es. Codice 1234" />
          </div>
        </div>

        {/* Services */}
        <div className="space-y-3 pt-3 border-t border-border">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('structures.services')}</h4>
          <div className="grid grid-cols-1 gap-2">
            {STRUCTURE_SERVICES.map((service) => (
              <div key={service} className="flex items-center space-x-2">
                <Checkbox
                  id={`svc-${service}`}
                  checked={formData.services.includes(service)}
                  onCheckedChange={() => toggleService(service)}
                />
                <Label htmlFor={`svc-${service}`} className="text-sm font-normal cursor-pointer">
                  {t(`structures.servicesList.${service}`)}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t('structures.icalUrl')}</Label>
          <Input value={formData.ical_url} onChange={(e) => setFormData({ ...formData, ical_url: e.target.value })} placeholder="https://..." />
        </div>

        <div className="space-y-2">
          <Label>{t('structures.notes')}</Label>
          <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} className="resize-none" />
        </div>

        <div className="flex items-center justify-between pt-2">
          <Label>{t('structures.active')}</Label>
          <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
        <Button variant="outline" onClick={onClose} className="flex-1">{t('common.cancel')}</Button>
        <Button onClick={handleSubmit} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-structure-btn">
          {saving ? t('common.loading') : (structure ? t('common.update') : t('common.create'))}
        </Button>
      </div>
    </SidePanel>
  );
};

const ClientDetailPage = () => {
  const { t } = useLanguage();
  const { clientId } = useParams();
  const navigate = useNavigate();
  
  const [client, setClient] = useState(null);
  const [structures, setStructures] = useState([]);
  const [unitsByStructure, setUnitsByStructure] = useState({});
  const [expandedStructures, setExpandedStructures] = useState({});
  const [loading, setLoading] = useState(true);
  
  const [structurePanelOpen, setStructurePanelOpen] = useState(false);
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  const [selectedStructure, setSelectedStructure] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedStructureId, setSelectedStructureId] = useState(null);
  
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState(null);

  // Portal management
  const [portalPanel, setPortalPanel] = useState(false);
  const [catalogPanel, setCatalogPanel] = useState(false);
  const [accountForm, setAccountForm] = useState({ email: '', password: '', name: '' });
  const [catalogEntries, setCatalogEntries] = useState([]);
  const [allArticles, setAllArticles] = useState([]);
  const [savingPortal, setSavingPortal] = useState(false);

  const fetchClient = useCallback(async () => {
    try {
      const response = await clientsApi.getOne(clientId);
      setClient(response.data);
    } catch (error) {
      toast.error(t('common.error'));
      navigate('/clients');
    }
  }, [clientId, navigate, t]);

  const fetchStructures = useCallback(async () => {
    try {
      const response = await structuresApi.getAll({ client_id: clientId });
      setStructures(response.data);
      
      const expanded = {};
      response.data.forEach(s => { expanded[s.id] = true; });
      setExpandedStructures(prev => {
        const merged = { ...expanded };
        Object.keys(prev).forEach(k => { if (k in merged) merged[k] = prev[k]; });
        return merged;
      });
      
      const unitsMap = {};
      for (const structure of response.data) {
        const unitsResponse = await unitsApi.getAll({ structure_id: structure.id });
        unitsMap[structure.id] = unitsResponse.data;
      }
      setUnitsByStructure(unitsMap);
    } catch (error) {
      console.error('Failed to fetch structures:', error);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchClient();
    fetchStructures();
  }, [fetchClient, fetchStructures]);

  const handleSaveStructure = async (formData, structureId) => {
    if (structureId) {
      await structuresApi.update(structureId, formData);
      toast.success(t('structures.updateSuccess'));
    } else {
      await structuresApi.create(formData);
      toast.success(t('structures.createSuccess'));
    }
    fetchStructures();
  };

  const handleSaveUnit = async (formData, unitId) => {
    if (unitId) {
      await unitsApi.update(unitId, formData);
      toast.success(t('units.updateSuccess'));
    } else {
      await unitsApi.create(formData);
      toast.success(t('units.createSuccess'));
    }
    fetchStructures();
  };

  const openDeleteStructure = (structure, e) => {
    e?.stopPropagation();
    setSelectedStructure(structure);
    setDeleteType('structure');
    setDeleteDialogOpen(true);
  };

  const openDeleteUnit = (unit, e) => {
    e?.stopPropagation();
    setSelectedUnit(unit);
    setDeleteType('unit');
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    try {
      if (deleteType === 'structure') {
        await structuresApi.delete(selectedStructure.id);
        toast.success(t('structures.deleteSuccess'));
      } else {
        await unitsApi.delete(selectedUnit.id);
        toast.success(t('units.deleteSuccess'));
      }
      setDeleteDialogOpen(false);
      fetchStructures();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('common.error'));
    }
  };

  const toggleStructure = (structureId) => {
    setExpandedStructures(prev => ({ ...prev, [structureId]: !prev[structureId] }));
  };

  // Check if structure supports multiple units
  const hasMultipleUnits = (structure) => {
    return ['guesthouse', 'hotel'].includes(structure.structure_type);
  };

  // Portal management functions
  const handleCreateAccount = async () => {
    if (!accountForm.email || !accountForm.password || !accountForm.name) {
      toast.error('Email, password e nome richiesti'); return;
    }
    setSavingPortal(true);
    try {
      await operationsApi.createClientAccount(clientId, accountForm);
      toast.success('Account portale creato');
      setPortalPanel(false);
      setAccountForm({ email: '', password: '', name: '' });
      fetchClient();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSavingPortal(false); }
  };

  const handleToggleOrdering = async (enabled) => {
    try {
      await clientsApi.update(clientId, { ordering_enabled: enabled });
      toast.success(enabled ? 'Ordini abilitati' : 'Ordini disabilitati');
      fetchClient();
    } catch (e) { toast.error('Errore'); }
  };

  const openCatalogPanel = async () => {
    try {
      const [catRes, artRes] = await Promise.all([
        operationsApi.getClientCatalog(clientId),
        inventoryApi.getArticles(),
      ]);
      setAllArticles(artRes.data);
      const existing = {};
      catRes.data.forEach(e => { existing[e.article_id] = e; });
      const entries = artRes.data.map(a => ({
        article_id: a.id, name: a.name, category: a.category,
        is_enabled: existing[a.id]?.is_enabled ?? false,
        custom_price: existing[a.id]?.custom_price ?? null,
        standard_price: a.standard_price || 0,
      }));
      setCatalogEntries(entries);
      setCatalogPanel(true);
    } catch (e) { toast.error('Errore caricamento catalogo'); }
  };

  const handleSaveCatalog = async () => {
    setSavingPortal(true);
    try {
      await operationsApi.setClientCatalog({
        client_id: clientId,
        entries: catalogEntries.filter(e => e.is_enabled).map(e => ({
          article_id: e.article_id,
          is_enabled: e.is_enabled,
          custom_price: e.custom_price,
        })),
      });
      toast.success('Catalogo aggiornato');
      setCatalogPanel(false);
    } catch (e) { toast.error('Errore'); }
    finally { setSavingPortal(false); }
  };

  // === STORICO TAB ===
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [cleanRes, logRes, maintRes, ordRes] = await Promise.all([
        api.get('/cleaning-tasks', { params: { client_id: clientId } }).catch(() => ({ data: [] })),
        api.get('/logistics/tasks', { params: { client_id: clientId } }).catch(() => ({ data: [] })),
        api.get('/maintenance/issues', { params: { client_id: clientId } }).catch(() => ({ data: [] })),
        api.get('/operations/orders', { params: { client_id: clientId } }).catch(() => ({ data: [] })),
      ]);
      const all = [
        ...(cleanRes.data || []).map(e => ({ ...e, _type: 'cleaning', _label: 'Pulizia', _date: e.scheduled_date || e.created_at })),
        ...(logRes.data || []).map(e => ({ ...e, _type: 'logistics', _label: e.task_type === 'delivery' ? 'Consegna' : 'Ritiro', _date: e.date || e.created_at })),
        ...(maintRes.data || []).map(e => ({ ...e, _type: 'maintenance', _label: 'Manutenzione', _date: e.reported_date || e.created_at })),
        ...(ordRes.data || []).map(e => ({ ...e, _type: 'order', _label: 'Ordine', _date: e.created_at })),
      ];
      all.sort((a, b) => (b._date || '').localeCompare(a._date || ''));
      setHistory(all);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  }, [clientId]);

  // === FATTURAZIONE TAB ===
  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingMonth, setBillingMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const [pdfLoading, setPdfLoading] = useState(false);

  const fetchBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const res = await api.get(`/reports/client/${clientId}`, { params: { month: billingMonth } });
      setBilling(res.data);
    } catch (e) { console.error(e); }
    finally { setBillingLoading(false); }
  }, [clientId, billingMonth]);

  const downloadBillingPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await api.get(`/clients/${clientId}/billing-pdf`, { params: { month: billingMonth }, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers['content-disposition'] || '';
      const mm = cd.match(/filename="?([^";]+)"?/);
      a.download = mm ? mm[1] : `fatturazione_${billingMonth}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF fatturazione scaricato');
    } catch (e) { toast.error('Errore durante il download del PDF'); }
    finally { setPdfLoading(false); }
  };

  // === TAB STATE ===
  const [activeTab, setActiveTab] = useState('anagrafica');

  useEffect(() => {
    if (activeTab === 'storico' && history.length === 0 && !historyLoading) fetchHistory();
    if (activeTab === 'fatturazione') fetchBilling();
  }, [activeTab, history.length, historyLoading, fetchHistory, fetchBilling]);

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  const TABS = [
    { key: 'anagrafica', label: 'Anagrafica' },
    { key: 'strutture', label: `Strutture (${structures.length})` },
    { key: 'storico', label: 'Storico' },
    { key: 'fatturazione', label: 'Fatturazione' },
  ];

  const filteredHistory = historyFilter === 'all' ? history : history.filter(h => h._type === historyFilter);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="client-detail-page">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clients')} className="h-9 w-9 mt-0.5" data-testid="back-btn">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
              client?.client_type === 'company' ? "bg-blue-100 dark:bg-blue-900/30" : "bg-primary/10"
            )}>
              {client?.client_type === 'company' 
                ? <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                : <User className="h-5 w-5 text-primary" />
              }
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-heading font-semibold text-foreground">
                {client?.display_name}
              </h1>
              <span className="text-xs text-muted-foreground">{t(`clients.types.${client?.client_type}`)}</span>
            </div>
          </div>
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

      {/* TAB: Anagrafica */}
      {activeTab === 'anagrafica' && (
        <div className="space-y-4">
          {/* Contact info */}
          <Card className="border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Informazioni di contatto</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                {client?.phone && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Telefono</span>
                    <span className="font-medium flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{client.phone}</span>
                  </div>
                )}
                {client?.email && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Email</span>
                    <span className="font-medium flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{client.email}</span>
                  </div>
                )}
                {client?.client_type === 'private' && client?.private_info && (
                  <>
                    {client.private_info.name && (
                      <div>
                        <span className="text-xs text-muted-foreground block">Nome</span>
                        <span className="font-medium">{client.private_info.name} {client.private_info.surname}</span>
                      </div>
                    )}
                    {client.private_info.fiscal_code && (
                      <div>
                        <span className="text-xs text-muted-foreground block">Codice Fiscale</span>
                        <span className="font-medium font-mono text-xs">{client.private_info.fiscal_code}</span>
                      </div>
                    )}
                  </>
                )}
                {client?.client_type === 'company' && client?.company_info && (
                  <>
                    {client.company_info.company_name && (
                      <div>
                        <span className="text-xs text-muted-foreground block">Ragione Sociale</span>
                        <span className="font-medium">{client.company_info.company_name}</span>
                      </div>
                    )}
                    {client.company_info.vat_number && (
                      <div>
                        <span className="text-xs text-muted-foreground block">P.IVA</span>
                        <span className="font-medium font-mono text-xs">{client.company_info.vat_number}</span>
                      </div>
                    )}
                    {client.company_info.representative_name && (
                      <div>
                        <span className="text-xs text-muted-foreground block">Referente</span>
                        <span className="font-medium">{client.company_info.representative_name} {client.company_info.representative_surname}</span>
                      </div>
                    )}
                  </>
                )}
                {client?.notes && (
                  <div className="col-span-full">
                    <span className="text-xs text-muted-foreground block">Note</span>
                    <span className="text-sm">{client.notes}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Portal Management */}
          <Card className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground" />Portale Cliente</h3>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                {client?.has_portal_account ? (
                  <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-medium">Account attivo</span>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setPortalPanel(true)} data-testid="create-portal-account-btn">
                    <Plus className="h-3.5 w-3.5" />Crea account portale
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Ordini</Label>
                  <Switch checked={client?.ordering_enabled || false} onCheckedChange={handleToggleOrdering} data-testid="ordering-toggle" />
                </div>
                {client?.ordering_enabled && (
                  <Button variant="outline" size="sm" className="h-8 gap-1" onClick={openCatalogPanel} data-testid="manage-catalog-btn">
                    <BookOpen className="h-3.5 w-3.5" />Catalogo articoli
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB: Strutture */}
      {activeTab === 'strutture' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">
              {t('structures.title')} <span className="text-muted-foreground">({structures.length})</span>
            </h2>
            <Button onClick={() => navigate(`/structures/new?client_id=${clientId}`)} size="sm" className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="add-structure-btn">
              <Plus className="h-4 w-4 mr-1.5" />{t('structures.addNew')}
            </Button>
          </div>

          {/* Structures & Units */}
          {structures.length === 0 ? (
        <Card className="kilolava-card">
          <CardContent className="p-8 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground mb-4">{t('structures.noStructures')}</p>
            <Button onClick={() => navigate(`/structures/new?client_id=${clientId}`)} variant="outline">
              <Plus className="h-4 w-4 mr-1.5" />
              {t('structures.addNew')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {structures.map((structure) => {
            const isMultiUnit = hasMultipleUnits(structure);
            const units = unitsByStructure[structure.id] || [];

            return (
              <Card key={structure.id} className="kilolava-card overflow-hidden" data-testid={`structure-card-${structure.id}`}>
                {/* Structure Header */}
                <Collapsible
                  open={expandedStructures[structure.id]}
                  onOpenChange={() => toggleStructure(structure.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-accent/30 transition-colors" data-testid={`structure-${structure.id}`}>
                      {isMultiUnit && (
                        <ChevronDown className={cn(
                          "h-5 w-5 text-muted-foreground transition-transform flex-shrink-0",
                          !expandedStructures[structure.id] && "-rotate-90"
                        )} />
                      )}
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {structure.klv_code && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-primary/10 text-primary rounded">{structure.klv_code}</span>
                          )}
                          <span className="font-medium">{structure.name}</span>
                          <span className="px-1.5 py-0.5 text-[10px] bg-muted text-muted-foreground rounded">
                            {t(`structures.structureTypes.${structure.structure_type}`)}
                          </span>
                          {structure.ical_url && <Link2 className="h-3.5 w-3.5 text-blue-500" />}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5 flex-wrap">
                          {structure.address && (
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /><span className="truncate max-w-[200px]">{structure.address}</span></span>
                          )}
                          <span className="flex items-center gap-1"><Key className="h-3 w-3" />{t(`structures.accessTypes.${structure.access_type}`)}</span>
                          {isMultiUnit && (
                            <span className="flex items-center gap-1"><DoorOpen className="h-3 w-3" />{units.length} {t('units.title').toLowerCase()}</span>
                          )}
                        </div>
                        {/* Service badges */}
                        {structure.services?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {structure.services.map(s => (
                              <span key={s} className="px-1.5 py-0.5 text-[10px] bg-primary/10 text-primary rounded">
                                {t(`structures.servicesList.${s}`)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Action Buttons - Prominent */}
                      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {isMultiUnit && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStructureId(structure.id);
                              setSelectedUnit(null);
                              setUnitPanelOpen(true);
                            }}
                            className="h-8 text-xs bg-[#F24E75] hover:bg-[#E03B62] text-white"
                            data-testid={`add-unit-btn-${structure.id}`}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            {t('structures.addUnit')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/structures/${structure.id}`);
                          }}
                          className="h-8 text-xs"
                          data-testid={`edit-structure-btn-${structure.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Apri
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => openDeleteStructure(structure, e)}
                          className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          data-testid={`delete-structure-btn-${structure.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          {t('common.delete')}
                        </Button>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  {/* Units - only for multi-unit structures */}
                  {isMultiUnit && (
                    <CollapsibleContent>
                      <div className="border-t border-border bg-muted/10">
                        {units.length === 0 ? (
                          <div className="p-6 text-center">
                            <DoorOpen className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                            <p className="text-sm text-muted-foreground mb-3">{t('units.noUnits')}</p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedStructureId(structure.id);
                                setSelectedUnit(null);
                                setUnitPanelOpen(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              {t('units.addNew')}
                            </Button>
                          </div>
                        ) : (
                          <div className="divide-y divide-border">
                            {units.map((unit) => (
                              <div
                                key={unit.id}
                                className={cn(
                                  "flex items-center gap-4 py-3.5 cursor-pointer",
                                  "hover:bg-accent/50 transition-all group",
                                  "pl-8 sm:pl-12 lg:pl-16 pr-4"
                                )}
                                onClick={() => {
                                  setSelectedStructureId(structure.id);
                                  setSelectedUnit(unit);
                                  setUnitPanelOpen(true);
                                }}
                                data-testid={`unit-${unit.id}`}
                              >
                                {/* Visual connector */}
                                <div className="w-4 h-px bg-border flex-shrink-0 hidden sm:block" />
                                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                                  <DoorOpen className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{unit.name}</span>
                                    <span className="px-1.5 py-0.5 text-[10px] bg-muted rounded">{t(`units.types.${unit.unit_type}`)}</span>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                    {unit.bed_config && unit.bed_config.capacity_total > 0 && (
                                      <span className="flex items-center gap-1"><Bed className="h-3 w-3" />{unit.bed_config.capacity_total} pax</span>
                                    )}
                                    {unit.stock_config && unit.stock_config.target_kit_sets > 0 && (
                                      <span className="flex items-center gap-1"><Package className="h-3 w-3" />{unit.stock_config.target_kit_sets} kit</span>
                                    )}
                                    {unit.cleaning_config && (
                                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{unit.cleaning_config.estimated_cleaning_time} min</span>
                                    )}
                                  </div>
                                </div>
                                
                                {/* Unit Actions - visible buttons */}
                                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStructureId(structure.id);
                                      setSelectedUnit(unit);
                                      setUnitPanelOpen(true);
                                    }}
                                    className="h-7 text-xs px-2"
                                    data-testid={`edit-unit-btn-${unit.id}`}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    {t('common.edit')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => openDeleteUnit(unit, e)}
                                    className="h-7 text-xs px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                                    data-testid={`delete-unit-btn-${unit.id}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                
                                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
        </div>
      )}

      {/* TAB: Storico */}
      {activeTab === 'storico' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: 'all', label: 'Tutto' },
              { key: 'cleaning', label: 'Pulizie' },
              { key: 'logistics', label: 'Consegne/Ritiri' },
              { key: 'maintenance', label: 'Manutenzioni' },
              { key: 'order', label: 'Ordini' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setHistoryFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                  historyFilter === f.key
                    ? "bg-[#F24E75] text-white border-[#F24E75]"
                    : "bg-background text-muted-foreground border-border hover:bg-accent"
                )}
                data-testid={`history-filter-${f.key}`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">{filteredHistory.length} risultati</span>
          </div>

          {historyLoading ? (
            <div className="text-center py-12 text-muted-foreground">Caricamento storico...</div>
          ) : filteredHistory.length === 0 ? (
            <Card className="border">
              <CardContent className="p-8 text-center">
                <Clock className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-muted-foreground text-sm">Nessuna attivita trovata</p>
              </CardContent>
            </Card>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">Data</th>
                    <th className="text-left px-3 py-2.5 font-medium">Tipo</th>
                    <th className="text-left px-3 py-2.5 font-medium">Dettaglio</th>
                    <th className="text-center px-3 py-2.5 font-medium">Stato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredHistory.map((item, i) => {
                    const typeColors = {
                      cleaning: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
                      logistics: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                      maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
                      order: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
                    };
                    return (
                      <tr key={i} className="hover:bg-accent/30">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {item._date ? new Date(item._date).toLocaleDateString('it-IT') : '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', typeColors[item._type])}>
                            {item._label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {item.title || item.order_number || item.description || item.notes || '-'}
                        </td>
                        <td className="text-center px-3 py-2.5">
                          <span className="text-[10px] font-medium text-muted-foreground">{item.status || '-'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Fatturazione */}
      {activeTab === 'fatturazione' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Select value={billingMonth} onValueChange={setBillingMonth}>
              <SelectTrigger className="h-8 w-[190px] text-xs" data-testid="billing-month-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => {
                  const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
                  const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  return (
                    <SelectItem key={val} value={val}>
                      <span className="capitalize">{d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={downloadBillingPdf}
              disabled={pdfLoading || billingLoading}
              className="h-8 gap-1.5 bg-[#F24E75] hover:bg-[#E03B62] text-white"
              data-testid="billing-pdf-btn"
            >
              {pdfLoading ? <LoaderIcon className="h-3.5 w-3.5 animate-spin" /> : <DownloadIcon className="h-3.5 w-3.5" />}
              Scarica PDF
            </Button>
          </div>
          {billingLoading ? (
            <div className="text-center py-12 text-muted-foreground">Caricamento dati fatturazione...</div>
          ) : !billing ? (
            <Card className="border">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground text-sm">Nessun dato disponibile</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Revenue Summary */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="border">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Totale periodo</p>
                    <p className="text-2xl font-bold tabular-nums mt-1" data-testid="billing-total">
                      {(billing.summary?.estimated_revenue || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Ordini</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{billing.breakdown?.orders?.count || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Pulizie</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{billing.breakdown?.cleaning?.count || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Consegne</p>
                    <p className="text-2xl font-bold tabular-nums mt-1">{billing.breakdown?.logistics?.deliveries || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Breakdown per categoria */}
              {billing.breakdown && (
                <Card className="border">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Breakdown per categoria</h3>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium">Categoria</th>
                            <th className="text-center px-3 py-2 font-medium">Quantità</th>
                            <th className="text-right px-4 py-2 font-medium">Dettaglio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          <tr>
                            <td className="px-4 py-2.5 text-xs font-medium">Pulizie</td>
                            <td className="text-center px-3 py-2.5 text-xs">{billing.breakdown.cleaning?.count || 0}</td>
                            <td className="text-right px-4 py-2.5 text-xs">{billing.breakdown.cleaning?.completed || 0} completate</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2.5 text-xs font-medium">Logistica</td>
                            <td className="text-center px-3 py-2.5 text-xs">{billing.breakdown.logistics?.count || 0}</td>
                            <td className="text-right px-4 py-2.5 text-xs">{billing.breakdown.logistics?.deliveries || 0} consegne · {billing.breakdown.logistics?.pickups || 0} ritiri</td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2.5 text-xs font-medium">Ordini</td>
                            <td className="text-center px-3 py-2.5 text-xs">{billing.breakdown.orders?.count || 0}</td>
                            <td className="text-right px-4 py-2.5 text-xs font-medium">
                              {(billing.breakdown.orders?.revenue || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2.5 text-xs font-medium">Manutenzioni</td>
                            <td className="text-center px-3 py-2.5 text-xs">{billing.breakdown.maintenance?.count || 0}</td>
                            <td className="text-right px-4 py-2.5 text-xs">—</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Articoli più consumati */}
              {billing.top_items && billing.top_items.length > 0 && (
                <Card className="border">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-semibold mb-3">Articoli più consumati</h3>
                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium">Articolo</th>
                            <th className="text-right px-4 py-2 font-medium">Quantità</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {billing.top_items.map((item, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2.5 text-xs font-medium">{item.article_name || item.article_id}</td>
                              <td className="text-right px-4 py-2.5 text-xs">{item.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Panels */}
      <StructureEditPanel
        open={structurePanelOpen}
        onClose={() => { setStructurePanelOpen(false); setSelectedStructure(null); }}
        structure={selectedStructure}
        clientId={clientId}
        onSave={handleSaveStructure}
        t={t}
      />

      <UnitEditPanel
        open={unitPanelOpen}
        onClose={() => { setUnitPanelOpen(false); setSelectedUnit(null); }}
        unit={selectedUnit}
        structureId={selectedStructureId}
        onSave={handleSaveUnit}
        t={t}
      />

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteType === 'structure' ? t('structures.delete') : t('units.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{deleteType === 'structure' ? t('structures.confirmDelete') : t('units.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-btn">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Portal Account Panel */}
      <SidePanel open={portalPanel} onClose={() => setPortalPanel(false)} title="Crea Account Portale">
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Crea un account per consentire al cliente di accedere al portale.</p>
          <div className="space-y-2"><Label>Nome *</Label><Input value={accountForm.name} onChange={e => setAccountForm(p => ({ ...p, name: e.target.value }))} data-testid="portal-name" /></div>
          <div className="space-y-2"><Label>Email *</Label><Input type="email" value={accountForm.email} onChange={e => setAccountForm(p => ({ ...p, email: e.target.value }))} data-testid="portal-email" /></div>
          <div className="space-y-2"><Label>Password *</Label><Input type="password" value={accountForm.password} onChange={e => setAccountForm(p => ({ ...p, password: e.target.value }))} data-testid="portal-password" /></div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={() => setPortalPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={handleCreateAccount} disabled={savingPortal} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-portal-account-btn">
            {savingPortal ? '...' : 'Crea Account'}
          </Button>
        </div>
      </SidePanel>

      {/* Catalog Panel */}
      <SidePanel open={catalogPanel} onClose={() => setCatalogPanel(false)} title="Catalogo Articoli Cliente" wide>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <p className="text-xs text-muted-foreground">Seleziona gli articoli visibili al cliente nel portale. Puoi impostare prezzi personalizzati.</p>
          {catalogEntries.map((entry, i) => (
            <div key={entry.article_id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <Switch
                checked={entry.is_enabled}
                onCheckedChange={v => setCatalogEntries(prev => prev.map((e, j) => j === i ? { ...e, is_enabled: v } : e))}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{entry.name}</p>
                <p className="text-xs text-muted-foreground">{entry.category} - Standard: €{(entry.standard_price || 0).toFixed(2)}</p>
              </div>
              {entry.is_enabled && (
                <Input
                  type="number" step="0.01" min="0"
                  placeholder={`€${(entry.standard_price || 0).toFixed(2)}`}
                  value={entry.custom_price ?? ''}
                  onChange={e => setCatalogEntries(prev => prev.map((en, j) => j === i ? { ...en, custom_price: e.target.value ? parseFloat(e.target.value) : null } : en))}
                  className="w-24 h-8"
                />
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={() => setCatalogPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={handleSaveCatalog} disabled={savingPortal} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-catalog-btn">
            {savingPortal ? '...' : 'Salva Catalogo'}
          </Button>
        </div>
      </SidePanel>
    </div>
  );
};

export default ClientDetailPage;
