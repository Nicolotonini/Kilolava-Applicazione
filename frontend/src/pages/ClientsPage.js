import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { clientsApi } from '../lib/api';
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
  LayoutGrid, List, ChevronRight, Phone, Mail, User, Briefcase
} from 'lucide-react';
import { cn } from '../lib/utils';

const defaultPrivateInfo = { name: '', surname: '', address: '', fiscal_code: '', phone: '', email: '', sdi: '0000000' };
const defaultCompanyInfo = { company_name: '', representative_name: '', representative_surname: '', vat_number: '', fiscal_code: '', sdi: '0000000', address: '', phone: '', email: '', pec: '' };

const ClientsPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('list');
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

      {/* Search & View Toggle */}
      <div className="flex flex-col sm:flex-row gap-3">
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
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-7 px-2"
            data-testid="view-list-btn"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="h-7 px-2"
            data-testid="view-grid-btn"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Clients Display */}
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
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {clients.map((client) => (
            <Card
              key={client.id}
              className="kilolava-card-interactive cursor-pointer group"
              onClick={() => handleClientClick(client)}
              data-testid={`client-card-${client.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                        client.client_type === 'company' ? "bg-blue-100 dark:bg-blue-900/30" : "bg-primary/10"
                      )}>
                        {client.client_type === 'company' 
                          ? <Briefcase className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          : <User className="h-3.5 w-3.5 text-primary" />
                        }
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-foreground truncate text-sm">
                          {client.display_name}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {t(`clients.types.${client.client_type}`)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" onClick={(e) => openEditSheet(client, e)} className="h-7 w-7">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => openDeleteDialog(client, e)} className="h-7 w-7 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{client.structure_count} {t('structures.title').toLowerCase()}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* List View with Sticky Header */
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] sm:grid-cols-[1fr_150px_200px_80px_80px] items-center gap-2 px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('clients.columns.name')}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:block">{t('clients.columns.phone')}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:block">{t('clients.columns.email')}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">{t('clients.columns.structures')}</span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">{t('common.actions')}</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {clients.map((client) => (
              <div
                key={client.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] sm:grid-cols-[1fr_150px_200px_80px_80px] items-center gap-2 px-4 py-3 cursor-pointer hover:bg-accent/40 transition-colors group"
                onClick={() => handleClientClick(client)}
                data-testid={`client-row-${client.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    client.client_type === 'company' ? "bg-blue-100 dark:bg-blue-900/30" : "bg-primary/10"
                  )}>
                    {client.client_type === 'company' 
                      ? <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      : <User className="h-4 w-4 text-primary" />
                    }
                  </div>
                  <div className="min-w-0">
                    <span className="font-medium text-sm text-foreground truncate block">{client.display_name}</span>
                    <span className="text-xs text-muted-foreground">{t(`clients.types.${client.client_type}`)}</span>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground truncate hidden sm:block">
                  {client.phone ? (
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3 flex-shrink-0" />{client.phone}</span>
                  ) : '—'}
                </span>
                <span className="text-sm text-muted-foreground truncate hidden sm:block">
                  {client.email ? (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3 flex-shrink-0" />{client.email}</span>
                  ) : '—'}
                </span>
                <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>{client.structure_count}</span>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Button variant="ghost" size="icon" onClick={(e) => openEditSheet(client, e)} className="h-7 w-7">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={(e) => openDeleteDialog(client, e)} className="h-7 w-7 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
