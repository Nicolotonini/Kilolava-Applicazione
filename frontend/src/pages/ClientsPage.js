import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { clientsApi, fileUrl } from '../lib/api';
import api from '../lib/api';
import { ExportButton } from '../components/ExportButton';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
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
import { 
  Plus, Search, Pencil, Trash2, Building2, 
  Phone, Mail, User, Briefcase, TrendingUp, CalendarCheck, AlertTriangle
} from 'lucide-react';
import { cn } from '../lib/utils';

const defaultPrivateInfo = { name: '', surname: '', address: '', fiscal_code: '', phone: '', email: '', sdi: '0000000' };
const defaultCompanyInfo = { company_name: '', representative_name: '', representative_surname: '', vat_number: '', fiscal_code: '', sdi: '0000000', address: '', phone: '', email: '', pec: '' };

const getInitials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const ClientsPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [overview, setOverview] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [formData, setFormData] = useState({
    client_type: 'private',
    private_info: { ...defaultPrivateInfo },
    company_info: { ...defaultCompanyInfo },
    notes: '',
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      const response = await clientsApi.getAll(params);
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, t]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    api.get('/clients/overview').then(r => setOverview(r.data)).catch(() => {});
  }, []);

  const resetForm = () => {
    setFormData({
      client_type: 'private',
      private_info: { ...defaultPrivateInfo },
      company_info: { ...defaultCompanyInfo },
      notes: '',
      is_active: true,
    });
    setSelectedClient(null);
  };

  const openCreateSheet = () => {
    resetForm();
    setSheetOpen(true);
  };

  const openEditSheet = (client, e) => {
    e?.stopPropagation();
    setSelectedClient(client);
    setFormData({
      client_type: client.client_type || 'private',
      private_info: client.private_info || { ...defaultPrivateInfo },
      company_info: client.company_info || { ...defaultCompanyInfo },
      notes: client.notes || '',
      is_active: client.is_active ?? true,
    });
    setSheetOpen(true);
  };

  const openDeleteDialog = (client, e) => {
    e?.stopPropagation();
    setSelectedClient(client);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.client_type === 'private' && !formData.private_info.name?.trim()) {
      toast.error(t('common.required'));
      return;
    }
    if (formData.client_type === 'company' && !formData.company_info.company_name?.trim()) {
      toast.error(t('common.required'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_type: formData.client_type,
        notes: formData.notes,
        is_active: formData.is_active,
      };
      if (formData.client_type === 'private') {
        payload.private_info = formData.private_info;
      } else {
        payload.company_info = formData.company_info;
      }

      if (selectedClient) {
        await clientsApi.update(selectedClient.id, payload);
        toast.success(t('clients.updateSuccess'));
      } else {
        await clientsApi.create(payload);
        toast.success(t('clients.createSuccess'));
      }
      setSheetOpen(false);
      resetForm();
      fetchClients();
    } catch (error) {
      console.error('Failed to save client:', error);
      toast.error(error.response?.data?.detail || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedClient) return;
    try {
      await clientsApi.delete(selectedClient.id);
      toast.success(t('clients.deleteSuccess'));
      setDeleteDialogOpen(false);
      setSelectedClient(null);
      fetchClients();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('clients.hasStructures'));
    }
  };

  const handleClientClick = (client) => {
    navigate(`/clients/${client.id}`);
  };

  const updatePrivateInfo = (field, value) => {
    setFormData(prev => ({
      ...prev,
      private_info: { ...prev.private_info, [field]: value }
    }));
  };

  const updateCompanyInfo = (field, value) => {
    setFormData(prev => ({
      ...prev,
      company_info: { ...prev.company_info, [field]: value }
    }));
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="clients-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold text-foreground">
            {t('clients.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('clients.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="clients" className="h-9" />
          <Button
            onClick={openCreateSheet}
            className="bg-[#F24E75] hover:bg-[#E03B62] text-white h-9"
            data-testid="add-client-btn"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t('clients.addNew')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('clients.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
          data-testid="search-input"
        />
      </div>

      {/* Clients management list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : clients.length === 0 ? (
        <Card className="kilolava-card">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-3">{t('clients.noClients')}</p>
            <Button onClick={openCreateSheet} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              {t('clients.addNew')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {clients.map((client) => {
            const st = overview[client.id] || {};
            const revenue = st.revenue_month || 0;
            const todayN = st.today_activities || 0;
            const alerts = st.alerts || 0;
            return (
              <div
                key={client.id}
                onClick={() => handleClientClick(client)}
                className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-5 rounded-xl border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors"
                data-testid={`client-row-${client.id}`}
              >
                {/* Identity */}
                <div className="flex items-center gap-3.5 min-w-[210px] flex-1">
                  {client.logo_path ? (
                    <img
                      src={fileUrl(client.logo_path)}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover border border-border flex-shrink-0"
                      data-testid={`client-logo-${client.id}`}
                    />
                  ) : (
                    <div className={cn(
                      "w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                      client.client_type === 'company' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-primary/10 text-primary"
                    )}>
                      {getInitials(client.display_name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[15px] truncate">{client.display_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t(`clients.types.${client.client_type}`)}</p>
                  </div>
                </div>

                {/* KPIs */}
                <div className="flex items-center gap-7 flex-wrap">
                  <div className="min-w-[72px]" data-testid={`kpi-structures-${client.id}`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Strutture</p>
                    <p className="text-sm font-semibold tabular-nums flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />{client.structure_count}
                    </p>
                  </div>
                  <div className="min-w-[92px]" data-testid={`kpi-revenue-${client.id}`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Questo mese</p>
                    <p className="text-sm font-semibold tabular-nums flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      {revenue.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="min-w-[72px]" data-testid={`kpi-today-${client.id}`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Oggi</p>
                    <p className="text-sm font-semibold tabular-nums flex items-center gap-1.5">
                      <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      {todayN} {todayN === 1 ? 'attività' : 'attività'}
                    </p>
                  </div>
                  <div className="min-w-[72px]" data-testid={`kpi-alerts-${client.id}`}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Alert</p>
                    {alerts > 0 ? (
                      <p className="text-sm font-semibold tabular-nums flex items-center gap-1.5 text-red-600 dark:text-red-400">
                        <AlertTriangle className="h-3.5 w-3.5" />{alerts}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground/50">—</p>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-0.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                  {client.phone ? (
                    <a
                      href={`tel:${client.phone}`}
                      title={client.phone}
                      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      data-testid={`call-${client.id}`}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span
                      title="Telefono non inserito"
                      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/25 cursor-default"
                      data-testid={`call-${client.id}`}
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </span>
                  )}
                  {client.email ? (
                    <a
                      href={`mailto:${client.email}`}
                      title={client.email}
                      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      data-testid={`email-${client.id}`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span
                      title="Email non inserita"
                      className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/25 cursor-default"
                      data-testid={`email-${client.id}`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="w-px h-5 bg-border mx-1" />
                  <Button variant="ghost" size="icon" onClick={(e) => openEditSheet(client, e)} className="h-8 w-8 text-muted-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={(e) => openDeleteDialog(client, e)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Side Panel for Create/Edit */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="client-sheet">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-heading">
              {selectedClient ? t('clients.edit') : t('clients.addNew')}
            </SheetTitle>
          </SheetHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Client Type Selector */}
            <div className="space-y-2">
              <Label className="text-sm">{t('clients.type')}</Label>
              <Select
                value={formData.client_type}
                onValueChange={(value) => setFormData({ ...formData, client_type: value })}
              >
                <SelectTrigger className="h-9" data-testid="client-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">{t('clients.types.private')}</SelectItem>
                  <SelectItem value="company">{t('clients.types.company')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Private Client Fields */}
            {formData.client_type === 'private' && (
              <div className="space-y-3 pt-3 border-t border-border">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Dati personali
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.name')} *</Label>
                    <Input
                      value={formData.private_info.name}
                      onChange={(e) => updatePrivateInfo('name', e.target.value)}
                      data-testid="client-name-input"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.surname')}</Label>
                    <Input
                      value={formData.private_info.surname}
                      onChange={(e) => updatePrivateInfo('surname', e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('clients.address')}</Label>
                  <Input value={formData.private_info.address || ''} onChange={(e) => updatePrivateInfo('address', e.target.value)} className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.phone')}</Label>
                    <Input value={formData.private_info.phone || ''} onChange={(e) => updatePrivateInfo('phone', e.target.value)} className="h-9" placeholder="+39..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.email')}</Label>
                    <Input type="email" value={formData.private_info.email || ''} onChange={(e) => updatePrivateInfo('email', e.target.value)} className="h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.fiscalCode')}</Label>
                    <Input value={formData.private_info.fiscal_code || ''} onChange={(e) => updatePrivateInfo('fiscal_code', e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.sdi')}</Label>
                    <Input value={formData.private_info.sdi || '0000000'} onChange={(e) => updatePrivateInfo('sdi', e.target.value)} className="h-9" />
                  </div>
                </div>
              </div>
            )}

            {/* Company Client Fields */}
            {formData.client_type === 'company' && (
              <div className="space-y-3 pt-3 border-t border-border">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Dati azienda
                </h4>
                <div className="space-y-2">
                  <Label className="text-sm">{t('clients.companyName')} *</Label>
                  <Input
                    value={formData.company_info.company_name}
                    onChange={(e) => updateCompanyInfo('company_name', e.target.value)}
                    data-testid="company-name-input"
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.representativeName')}</Label>
                    <Input value={formData.company_info.representative_name} onChange={(e) => updateCompanyInfo('representative_name', e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.representativeSurname')}</Label>
                    <Input value={formData.company_info.representative_surname} onChange={(e) => updateCompanyInfo('representative_surname', e.target.value)} className="h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.vatNumber')}</Label>
                    <Input value={formData.company_info.vat_number || ''} onChange={(e) => updateCompanyInfo('vat_number', e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.fiscalCode')}</Label>
                    <Input value={formData.company_info.fiscal_code || ''} onChange={(e) => updateCompanyInfo('fiscal_code', e.target.value)} className="h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.sdi')}</Label>
                    <Input value={formData.company_info.sdi || '0000000'} onChange={(e) => updateCompanyInfo('sdi', e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.pec')}</Label>
                    <Input value={formData.company_info.pec || ''} onChange={(e) => updateCompanyInfo('pec', e.target.value)} className="h-9" placeholder="pec@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">{t('clients.address')}</Label>
                  <Input value={formData.company_info.address || ''} onChange={(e) => updateCompanyInfo('address', e.target.value)} className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.phone')}</Label>
                    <Input value={formData.company_info.phone || ''} onChange={(e) => updateCompanyInfo('phone', e.target.value)} className="h-9" placeholder="+39..." />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">{t('clients.email')}</Label>
                    <Input type="email" value={formData.company_info.email || ''} onChange={(e) => updateCompanyInfo('email', e.target.value)} className="h-9" />
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2 pt-3 border-t border-border">
              <Label className="text-sm">{t('clients.notes')}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} className="flex-1 h-9">
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                className="flex-1 h-9 bg-[#F24E75] hover:bg-[#E03B62] text-white"
                disabled={saving}
                data-testid="save-client-btn"
              >
                {saving ? t('common.loading') : selectedClient ? t('common.update') : t('common.create')}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clients.delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('clients.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-btn"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientsPage;
