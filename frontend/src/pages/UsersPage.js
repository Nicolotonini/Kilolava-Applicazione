import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { ExportButton } from '../components/ExportButton';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Search, Pencil, Trash2, X, Users, Shield, UserCheck, UserX,
  Phone, Mail, Truck, Briefcase
} from 'lucide-react';
import { cn } from '../lib/utils';
import { clientsApi } from '../lib/api';

const ROLE_LABELS = {
  admin: 'Admin', operations_manager: 'Operations Manager',
  cleaner: 'Addetto Pulizie', rider: 'Rider',
  maintenance: 'Manutenzione', client: 'Cliente',
};
const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  operations_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  cleaner: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  rider: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  client: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
};
const ALL_ROLES = ['admin', 'operations_manager', 'cleaner', 'rider', 'maintenance', 'client'];

const SidePanel = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className={cn(
        "fixed top-0 right-0 h-full bg-card border-l border-border z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200",
        wide ? "w-full sm:w-[48%] lg:w-[36%]" : "w-full sm:w-[40%] lg:w-[30%]"
      )}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

const EMPTY_ANAG = { birth_date: '', address: '', tax_code: '', emergency_contact: '', emergency_phone: '' };

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [panel, setPanel] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: '' });
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', password: '',
    role: 'cleaner', phone: '', vehicle_type: '', client_id: '', notes: '',
  });

  const fetchUsers = useCallback(async () => {
    try {
      const params = {};
      if (roleFilter !== 'all') params.role = roleFilter;
      if (activeFilter !== 'all') params.is_active = activeFilter === 'active';
      if (search) params.search = search;
      const res = await api.get('/users', { params });
      setUsers(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [roleFilter, activeFilter, search]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await clientsApi.getAll();
      setClients(res.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { setLoading(true); fetchUsers(); }, [fetchUsers]);

  const openNew = () => {
    setEditUser(null);
    setForm({ first_name: '', last_name: '', email: '', password: '', role: 'cleaner', phone: '', vehicle_type: '', client_id: '', notes: '', anagrafica: { ...EMPTY_ANAG } });
    setPanel(true);
  };

  const openEdit = (user) => {
    setEditUser(user);
    setForm({
      first_name: user.first_name || '', last_name: user.last_name || '',
      email: user.email || '', password: '',
      role: user.role || 'cleaner', phone: user.phone || '',
      vehicle_type: user.vehicle_type || '', client_id: user.client_id || '',
      notes: user.notes || '',
      anagrafica: { ...EMPTY_ANAG, ...(user.anagrafica || {}) },
    });
    setPanel(true);
  };

  const handleSave = async () => {
    if (!form.first_name || !form.email) { toast.error('Nome e email richiesti'); return; }
    if (!editUser && !form.password) { toast.error('Password richiesta'); return; }
    setSaving(true);
    try {
      if (editUser) {
        const payload = { ...form };
        delete payload.password;
        delete payload.email;
        if (form.role !== 'client') payload.client_id = null;
        await api.put(`/users/${editUser.id}`, payload);
        toast.success('Utente aggiornato');
      } else {
        const payload = { ...form };
        if (form.role !== 'client') payload.client_id = null;
        if (form.role !== 'rider') payload.vehicle_type = null;
        await api.post('/users', payload);
        toast.success('Utente creato');
      }
      setPanel(false);
      fetchUsers();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (userId) => {
    try {
      await api.put(`/users/${userId}/toggle-active`);
      fetchUsers();
    } catch (e) { toast.error('Errore'); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/users/${deleteDialog.id}`);
      toast.success('Utente eliminato');
      setDeleteDialog({ open: false, id: '' });
      fetchUsers();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const roleCounts = {};
  users.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="users-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Utenti</h1>
          <p className="text-sm text-muted-foreground">{users.length} utenti totali</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="users" />
          <Button onClick={openNew} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white gap-1" data-testid="add-user-btn">
            <Plus className="h-4 w-4" />Nuovo utente
          </Button>
        </div>
      </div>

      {/* Role chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          className={cn("text-xs px-3 py-1.5 rounded-full font-medium transition-colors border",
            roleFilter === 'all' ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground hover:bg-accent")}
          onClick={() => setRoleFilter('all')}
        >
          Tutti ({users.length})
        </button>
        {ALL_ROLES.map(r => (
          <button
            key={r}
            className={cn("text-xs px-3 py-1.5 rounded-full font-medium transition-colors border shrink-0",
              roleFilter === r ? "border-[#F24E75] bg-[#F24E75]/10 text-[#F24E75]" : "border-border text-muted-foreground hover:bg-accent")}
            onClick={() => setRoleFilter(roleFilter === r ? 'all' : r)}
          >
            {ROLE_LABELS[r]} ({roleCounts[r] || 0})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cerca utente..." value={search} onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9" data-testid="user-search" />
        </div>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="active">Attivi</SelectItem>
            <SelectItem value="inactive">Disattivati</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : users.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun utente trovato</p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(user => (
            <Card key={user.id} className={cn("border transition-all hover:ring-1 hover:ring-[#F24E75]/30", !user.is_active && "opacity-50")}
              data-testid={`user-card-${user.id}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn("w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                      user.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                      {(user.first_name || user.name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{user.name}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", ROLE_COLORS[user.role] || 'bg-muted')}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                        {!user.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            Disattivato
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>
                        {user.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(user.id)}
                      title={user.is_active ? 'Disattiva' : 'Attiva'} data-testid={`toggle-${user.id}`}>
                      {user.is_active ? <UserCheck className="h-3.5 w-3.5 text-green-600" /> : <UserX className="h-3.5 w-3.5 text-red-500" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)} data-testid={`edit-${user.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteDialog({ open: true, id: user.id })} data-testid={`delete-${user.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* User Form Panel */}
      <SidePanel open={panel} onClose={() => setPanel(false)} title={editUser ? 'Modifica Utente' : 'Nuovo Utente'} wide>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} data-testid="user-first-name" /></div>
            <div className="space-y-2"><Label>Cognome</Label><Input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} data-testid="user-last-name" /></div>
          </div>
          <div className="space-y-2"><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} disabled={!!editUser} data-testid="user-email" /></div>
          {!editUser && <div className="space-y-2"><Label>Password *</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} data-testid="user-password" /></div>}
          <div className="space-y-2">
            <Label>Ruolo *</Label>
            <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
              <SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Telefono</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
          {form.role === 'rider' && (
            <div className="space-y-2"><Label>Tipo veicolo</Label><Input value={form.vehicle_type} onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))} placeholder="Furgone, Scooter..." /></div>
          )}
          {form.role === 'client' && (
            <div className="space-y-2">
              <Label>Collegamento cliente *</Label>
              <Select value={form.client_id || 'none'} onValueChange={v => setForm(p => ({ ...p, client_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2"><Label>Note (esigenze particolari)</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none" /></div>
          {form.role !== 'client' && (
            <div className="space-y-3 rounded-xl border border-border p-3" data-testid="anagrafica-section">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anagrafica dipendente</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data di nascita</Label>
                  <Input type="date" value={form.anagrafica?.birth_date || ''} onChange={e => setForm(p => ({ ...p, anagrafica: { ...p.anagrafica, birth_date: e.target.value } }))} data-testid="anag-birth-date" />
                  <p className="text-xs text-muted-foreground">Il giorno del compleanno il dipendente sta a casa e non lavora.</p>
                </div>
                <div className="space-y-2">
                  <Label>Codice fiscale</Label>
                  <Input value={form.anagrafica?.tax_code || ''} onChange={e => setForm(p => ({ ...p, anagrafica: { ...p.anagrafica, tax_code: e.target.value.toUpperCase() } }))} data-testid="anag-tax-code" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Indirizzo di residenza</Label>
                <Input value={form.anagrafica?.address || ''} onChange={e => setForm(p => ({ ...p, anagrafica: { ...p.anagrafica, address: e.target.value } }))} data-testid="anag-address" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Contatto di emergenza</Label>
                  <Input value={form.anagrafica?.emergency_contact || ''} onChange={e => setForm(p => ({ ...p, anagrafica: { ...p.anagrafica, emergency_contact: e.target.value } }))} placeholder="Nome" data-testid="anag-emergency-contact" />
                </div>
                <div className="space-y-2">
                  <Label>Telefono emergenza</Label>
                  <Input value={form.anagrafica?.emergency_phone || ''} onChange={e => setForm(p => ({ ...p, anagrafica: { ...p.anagrafica, emergency_phone: e.target.value } }))} data-testid="anag-emergency-phone" />
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3 flex-shrink-0">
          <Button variant="outline" onClick={() => setPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-user-btn">
            {saving ? '...' : editUser ? 'Aggiorna' : 'Crea utente'}
          </Button>
        </div>
      </SidePanel>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={v => !v && setDeleteDialog({ open: false, id: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina utente</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro? L'utente verra eliminato permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground" data-testid="confirm-delete-user">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersPage;
