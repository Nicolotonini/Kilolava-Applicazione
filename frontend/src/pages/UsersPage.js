import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { PageHeader } from '../components/kilolava/PageHeader';
import { StatusBadge } from '../components/kilolava/badges';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { usePermissions, ROLE_LABELS, INTERNAL_ROLES } from '../hooks/usePermissions';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Plus, Search, ChevronRight, Loader2, Phone } from 'lucide-react';

export const CONTRACT_WARN = {
  scaduto: { label: 'Contratto scaduto', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  scade_7: { label: 'Scade entro 7 giorni', cls: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' },
  scade_30: { label: 'Scade entro 30 giorni', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

export const fmtDate = (s) => {
  if (!s) return '—';
  try { return new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('it-IT'); } catch { return s; }
};

const contractCell = (u) => {
  if (u.contract?.type === 'determinato') return fmtDate(u.contract.end_date);
  return 'Indeterminato';
};

const ROLE_FILTERS = [
  ['admin', 'Admin'], ['operations_manager', 'Responsabili'], ['cleaner', 'Operatrici'],
  ['rider', 'Rider'], ['maintenance', 'Manutentori'], ['laundry', 'Lavanderia'],
];

export function NewUserDialog({ open, onClose, onCreated }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (open) setForm({ first_name: '', last_name: '', birth_date: '', phone: '', role: 'cleaner', extra_roles: [],
      contract_type: 'indeterminato', start_date: '', end_date: '', contract_notes: '',
      standard_available: true, email: '', password: '', language: 'it' });
  }, [open]);

  const toggleExtra = (r) => set('extra_roles', form.extra_roles.includes(r) ? form.extra_roles.filter((x) => x !== r) : [...form.extra_roles, r]);

  const save = async () => {
    if (!form.first_name.trim()) { toast.error('Nome obbligatorio'); return; }
    if (!form.email.trim() || !form.password) { toast.error('Email e password obbligatorie per il login'); return; }
    if (form.contract_type === 'determinato' && !form.end_date) { toast.error('Data fine contratto obbligatoria per il rapporto Determinato'); return; }
    setSaving(true);
    try {
      const r = await api.post('/users', {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        email: form.email.trim(), password: form.password,
        role: form.role, extra_roles: form.extra_roles.filter((x) => x !== form.role),
        standard_available: form.standard_available, language: form.language,
        phone: form.phone || null,
        anagrafica: form.birth_date ? { birth_date: form.birth_date } : null,
        contract: { type: form.contract_type, start_date: form.start_date || null,
          end_date: form.contract_type === 'determinato' ? form.end_date : null, notes: form.contract_notes },
      });
      toast.success(`Utente creato: ${r.data.usr_code} · ${r.data.name}`);
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore creazione utente'); }
    finally { setSaving(false); }
  };

  const Section = ({ title, children }) => (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="new-user-dialog">
        <DialogHeader>
          <DialogTitle>Nuovo Utente Interno</DialogTitle>
          <DialogDescription className="text-xs">Una persona = un solo utente, anche con più mansioni.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <Section title="1 · Identità">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Nome *</Label>
                <Input value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} data-testid="nu-first-name" /></div>
              <div className="space-y-1"><Label className="text-xs">Cognome</Label>
                <Input value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} data-testid="nu-last-name" /></div>
              <div className="space-y-1"><Label className="text-xs">Data di nascita</Label>
                <Input type="date" value={form.birth_date || ''} onChange={(e) => set('birth_date', e.target.value)} data-testid="nu-birth-date" /></div>
              <div className="space-y-1"><Label className="text-xs">Telefono</Label>
                <Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} data-testid="nu-phone" /></div>
            </div>
          </Section>
          <Section title="2 · Ruolo">
            <div className="space-y-1"><Label className="text-xs">Ruolo principale *</Label>
              <select value={form.role} onChange={(e) => set('role', e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="nu-role">
                {INTERNAL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select></div>
            <div className="space-y-1">
              <Label className="text-xs">Ruoli aggiuntivi</Label>
              <div className="flex flex-wrap gap-1.5">
                {INTERNAL_ROLES.filter((r) => r !== form.role && !['admin', 'operations_manager'].includes(r)).map((r) => (
                  <button key={r} type="button" onClick={() => toggleExtra(r)}
                    className={cn('text-xs rounded-full border px-2.5 py-1 transition-colors',
                      (form.extra_roles || []).includes(r) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50')}
                    data-testid={`nu-extra-${r}`}>{ROLE_LABELS[r]}</button>
                ))}
              </div>
            </div>
          </Section>
          <Section title="3 · Rapporto di lavoro">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Data inizio</Label>
                <Input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} data-testid="nu-start-date" /></div>
              <div className="space-y-1"><Label className="text-xs">Durata rapporto</Label>
                <select value={form.contract_type} onChange={(e) => set('contract_type', e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="nu-contract-type">
                  <option value="indeterminato">Indeterminato</option>
                  <option value="determinato">Determinato</option>
                </select></div>
              {form.contract_type === 'determinato' && (
                <div className="space-y-1"><Label className="text-xs">Data fine contratto *</Label>
                  <Input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} data-testid="nu-end-date" /></div>
              )}
            </div>
          </Section>
          <Section title="4 · Disponibilità">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Disponibilità standard</p>
                <p className="text-xs text-muted-foreground">Se disattivata non viene proposto nelle organizzazioni. Giorni liberi e orari si decidono giorno per giorno.</p>
              </div>
              <Switch checked={!!form.standard_available} onCheckedChange={(v) => set('standard_available', v)} data-testid="nu-standard-available" />
            </div>
          </Section>
          <Section title="5 · Accesso">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2"><Label className="text-xs">Email login *</Label>
                <Input type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} data-testid="nu-email" /></div>
              <div className="space-y-1"><Label className="text-xs">Password *</Label>
                <Input type="password" value={form.password || ''} onChange={(e) => set('password', e.target.value)} data-testid="nu-password" /></div>
              <div className="space-y-1"><Label className="text-xs">Lingua</Label>
                <select value={form.language} onChange={(e) => set('language', e.target.value)}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="nu-language">
                  <option value="it">Italiano</option><option value="en">English</option>
                </select></div>
            </div>
          </Section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="nu-submit">
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Crea utente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const navigate = useNavigate();
  const { isAdmin } = usePermissions();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('attivi');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/users', { params: { internal: true } });
      setUsers(r.data);
    } catch (e) { toast.error('Errore caricamento utenti'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = users;
    if (filter === 'attivi') list = list.filter((u) => u.is_active);
    else if (filter === 'disattivati') list = list.filter((u) => !u.is_active);
    else if (filter !== 'tutti') list = list.filter((u) => u.role === filter || (u.extra_roles || []).includes(filter));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((u) => [u.name, u.first_name, u.last_name, u.email, u.usr_code, u.phone]
        .some((v) => (v || '').toLowerCase().includes(q)));
    }
    return list;
  }, [users, filter, search]);

  const FilterChip = ({ k, label }) => (
    <button onClick={() => setFilter(k)}
      className={cn('text-xs rounded-full px-3 py-1.5 border font-medium whitespace-nowrap transition-colors',
        filter === k ? 'bg-foreground text-background border-foreground' : 'border-border hover:border-primary/50')}
      data-testid={`users-filter-${k}`}>{label}</button>
  );

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="users-page">
      <PageHeader
        title="Utenti Interni"
        subtitle={`${users.filter((u) => u.is_active).length} attivi · ${users.length} totali — una persona, un solo utente`}
        actions={isAdmin && (
          <Button className="h-9 gap-1.5" onClick={() => setNewOpen(true)} data-testid="new-user-btn">
            <Plus className="h-4 w-4" />Nuovo utente
          </Button>
        )}
      />

      <div className="flex flex-col gap-2.5">
        <div className="relative max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, codice USR, telefono, email..." className="pl-9 h-9" data-testid="users-search" />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <FilterChip k="tutti" label="Tutti" />
          <FilterChip k="attivi" label="Attivi" />
          <FilterChip k="disattivati" label="Disattivati" />
          <span className="w-px h-4 bg-border mx-1 shrink-0" />
          {ROLE_FILTERS.map(([k, l]) => <FilterChip key={k} k={k} label={l} />)}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Caricamento…</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">Nessun utente trovato.</CardContent></Card>
      ) : (
        <Card className="border overflow-hidden">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm" data-testid="users-table">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2.5 font-semibold">Codice</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Nome</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Ruolo</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Ruoli aggiuntivi</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Stato</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Disp. std</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Contratto</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Telefono</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((u) => (
                  <tr key={u.id} onClick={() => navigate(`/users/${u.id}`)}
                    className="hover:bg-muted/40 cursor-pointer transition-colors" data-testid={`user-row-${u.id}`}>
                    <td className="px-4 py-2.5 font-mono font-bold text-primary whitespace-nowrap">{u.usr_code || '—'}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{u.name}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{ROLE_LABELS[u.role] || u.role}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {(u.extra_roles || []).map((r) => ROLE_LABELS[r]).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={u.is_active ? 'success' : 'cancelled'} testId={`user-status-${u.id}`}>
                        {u.is_active ? 'Attivo' : 'Disattivato'}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-xs font-medium', u.standard_available ? 'text-emerald-600' : 'text-muted-foreground')}>
                        {u.standard_available ? 'Attiva' : 'Disattivata'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="tabular-nums">{contractCell(u)}</span>
                      {CONTRACT_WARN[u.contract_status] && (
                        <span className={cn('ml-2 text-xs rounded-full px-2 py-0.5 font-semibold', CONTRACT_WARN[u.contract_status].cls)}
                          data-testid={`contract-warn-${u.id}`}>{CONTRACT_WARN[u.contract_status].label}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{u.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-right"><ChevronRight className="h-4 w-4 text-muted-foreground inline" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="md:hidden divide-y divide-border/60">
            {filtered.map((u) => (
              <button key={u.id} onClick={() => navigate(`/users/${u.id}`)}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/40"
                data-testid={`user-row-mobile-${u.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    <span className="font-mono font-bold text-primary mr-1.5">{u.usr_code}</span>{u.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {ROLE_LABELS[u.role]}{(u.extra_roles || []).length > 0 ? ` +${u.extra_roles.length}` : ''} · {contractCell(u)}
                    {u.phone ? <span className="inline-flex items-center gap-0.5 ml-1.5"><Phone className="h-3 w-3" />{u.phone}</span> : null}
                  </p>
                  {CONTRACT_WARN[u.contract_status] && (
                    <span className={cn('inline-block mt-1 text-xs rounded-full px-2 py-0.5 font-semibold', CONTRACT_WARN[u.contract_status].cls)}>
                      {CONTRACT_WARN[u.contract_status].label}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge tone={u.is_active ? 'success' : 'cancelled'}>{u.is_active ? 'Attivo' : 'Off'}</StatusBadge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <NewUserDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={() => { setNewOpen(false); load(); }} />
    </div>
  );
}
