import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import { DetailHeader } from '../components/kilolava/PageHeader';
import { StatusBadge } from '../components/kilolava/badges';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { usePermissions, ROLE_LABELS, INTERNAL_ROLES } from '../hooks/usePermissions';
import { CONTRACT_WARN, fmtDate } from './UsersPage';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Cake, KeyRound, Loader2, MapPin, Power, Trash2, AlertTriangle } from 'lucide-react';

const birthdayLabel = (s) => {
  if (!s) return null;
  try { return new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }); }
  catch { return null; }
};
const ageOf = (s) => {
  if (!s) return null;
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
};
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};

const GPS_LABELS = { live: ['GPS Live', 'text-emerald-600'], recente: ['GPS Recente', 'text-amber-600'], non_aggiornata: ['GPS Non aggiornato', 'text-red-600'], off: ['GPS Disattivato', 'text-muted-foreground'] };
const AUDIT_LABELS = {
  'user.create': 'Creazione utente', 'user.update': 'Modifica', 'user.activate': 'Attivazione',
  'user.deactivate': 'Disattivazione', 'user.password_reset': 'Reset password', 'user.delete': 'Eliminazione',
};

function SectionCard({ title, children, action, testId }) {
  return (
    <Card className="border" data-testid={testId}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

const Field = ({ label, children }) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    {children}
  </div>
);

export default function UserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isOps } = usePermissions();
  const [user, setUser] = useState(null);
  const [gps, setGps] = useState(null);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/users/${userId}`);
      setUser(r.data);
      setForm({
        first_name: r.data.first_name || '', last_name: r.data.last_name || '',
        phone: r.data.phone || '', birth_date: r.data.anagrafica?.birth_date || '',
        role: r.data.role, extra_roles: r.data.extra_roles || [],
        standard_available: r.data.standard_available,
        contract_type: r.data.contract?.type || 'indeterminato',
        start_date: r.data.contract?.start_date || '', end_date: r.data.contract?.end_date || '',
        contract_notes: r.data.contract?.notes || '', language: r.data.language || 'it',
      });
    } catch (e) { toast.error('Utente non trovato'); navigate('/users'); }
    api.get(`/users/${userId}/service-status`).then((r) => setGps(r.data)).catch(() => {});
    api.get(`/users/${userId}/audit`).then((r) => setAudit(r.data)).catch(() => {});
  }, [userId, navigate]);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleExtra = (r) => set('extra_roles', form.extra_roles.includes(r) ? form.extra_roles.filter((x) => x !== r) : [...form.extra_roles, r]);

  const save = async (patch) => {
    setSaving(true);
    try {
      await api.put(`/users/${userId}`, patch);
      toast.success('Salvato');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore salvataggio'); }
    finally { setSaving(false); }
  };

  const saveIdentity = () => save({
    first_name: form.first_name, last_name: form.last_name, phone: form.phone || null,
    anagrafica: { ...(user.anagrafica || {}), birth_date: form.birth_date || null },
  });
  const saveRoles = () => save({ role: form.role, extra_roles: form.extra_roles.filter((x) => x !== form.role) });
  const saveContract = () => {
    if (form.contract_type === 'determinato' && !form.end_date) { toast.error('Data fine contratto obbligatoria per il rapporto Determinato'); return; }
    save({ contract: { type: form.contract_type, start_date: form.start_date || null,
      end_date: form.contract_type === 'determinato' ? form.end_date : null, notes: form.contract_notes } });
  };

  const toggleActive = async () => {
    try {
      const r = await api.put(`/users/${userId}/toggle-active`);
      toast.success(r.data.message);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const resetPassword = async () => {
    try {
      await api.post(`/users/${userId}/reset-password`, { new_password: newPwd });
      toast.success('Password reimpostata: comunicala all\'utente');
      setResetOpen(false); setNewPwd('');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore reset'); }
  };

  const hardDelete = async () => {
    try {
      await api.delete(`/users/${userId}`);
      toast.success('Utente eliminato');
      navigate('/users');
    } catch (e) { toast.error(e.response?.data?.detail || 'Eliminazione non consentita'); setDeleteOpen(false); }
  };

  if (!user || !form) return <div className="p-6 text-sm text-muted-foreground">Caricamento…</div>;

  const birth = user.anagrafica?.birth_date;
  const warn = CONTRACT_WARN[user.contract_status];
  const gpsMeta = GPS_LABELS[gps?.gps_state] || GPS_LABELS.off;
  const ro = !isAdmin;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl" data-testid="user-detail-page">
      <DetailHeader
        backTo="/users" backLabel="Utenti Interni"
        title={user.name}
        meta={<span className="font-mono font-bold text-primary">{user.usr_code || '—'}</span>}
        badges={
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge tone={user.is_active ? 'success' : 'cancelled'} testId="ud-status-badge">{user.is_active ? 'Attivo' : 'Disattivato'}</StatusBadge>
            <StatusBadge tone="info">{ROLE_LABELS[user.role] || user.role}</StatusBadge>
            {(user.extra_roles || []).map((r) => <StatusBadge key={r} tone="waiting">{ROLE_LABELS[r]}</StatusBadge>)}
          </div>
        }
        actions={isAdmin && (
          <Button variant={user.is_active ? 'outline' : 'default'} className="h-9 gap-1.5" onClick={toggleActive} data-testid="ud-toggle-active-btn">
            <Power className="h-4 w-4" />{user.is_active ? 'Disattiva' : 'Attiva'}
          </Button>
        )}
        testId="user-detail-header"
      />

      {warn && (
        <div className={cn('rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold', CONTRACT_WARN[user.contract_status].cls)} data-testid="ud-contract-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />{warn.label}
          {user.contract?.end_date && <span className="font-normal">· fine contratto {fmtDate(user.contract.end_date)}</span>}
          <span className="font-normal text-xs opacity-80">— l'account NON viene disattivato automaticamente: decide il Responsabile/Admin</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* IDENTITÀ */}
        <SectionCard title="Identità" testId="ud-identity"
          action={!ro && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveIdentity} disabled={saving} data-testid="ud-save-identity">Salva</Button>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} disabled={ro} data-testid="ud-first-name" /></Field>
            <Field label="Cognome"><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} disabled={ro} data-testid="ud-last-name" /></Field>
            <Field label="Data di nascita"><Input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} disabled={ro} data-testid="ud-birth-date" /></Field>
            <Field label="Telefono"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={ro} data-testid="ud-phone" /></Field>
          </div>
          {birth && (
            <p className="text-sm flex items-center gap-1.5" data-testid="ud-birthday">
              <Cake className="h-4 w-4 text-primary" />
              <span className="font-medium">Compleanno: {birthdayLabel(birth)}</span>
              <span className="text-muted-foreground text-xs">· Età: {ageOf(birth)} anni</span>
            </p>
          )}
        </SectionCard>

        {/* RUOLI */}
        <SectionCard title="Ruoli" testId="ud-roles"
          action={!ro && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveRoles} disabled={saving} data-testid="ud-save-roles">Salva</Button>}>
          <Field label="Ruolo principale">
            <select value={form.role} onChange={(e) => set('role', e.target.value)} disabled={ro}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="ud-role-select">
              {INTERNAL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field label="Ruoli aggiuntivi (stessa persona, più mansioni)">
            <div className="flex flex-wrap gap-1.5">
              {INTERNAL_ROLES.filter((r) => r !== form.role && !['admin', 'operations_manager'].includes(r)).map((r) => (
                <button key={r} type="button" disabled={ro} onClick={() => toggleExtra(r)}
                  className={cn('text-xs rounded-full border px-2.5 py-1 transition-colors disabled:opacity-60',
                    form.extra_roles.includes(r) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50')}
                  data-testid={`ud-extra-${r}`}>{ROLE_LABELS[r]}</button>
              ))}
            </div>
          </Field>
        </SectionCard>

        {/* RAPPORTO DI LAVORO */}
        <SectionCard title="Rapporto di lavoro" testId="ud-contract"
          action={!ro && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveContract} disabled={saving} data-testid="ud-save-contract">Salva</Button>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data inizio"><Input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} disabled={ro} data-testid="ud-start-date" /></Field>
            <Field label="Durata rapporto">
              <select value={form.contract_type} onChange={(e) => set('contract_type', e.target.value)} disabled={ro}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="ud-contract-type">
                <option value="indeterminato">Indeterminato</option>
                <option value="determinato">Determinato</option>
              </select>
            </Field>
            {form.contract_type === 'determinato' && (
              <Field label="Data fine contratto *">
                <Input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} disabled={ro} data-testid="ud-end-date" />
              </Field>
            )}
          </div>
          <Field label="Note interne">
            <Textarea rows={2} value={form.contract_notes} onChange={(e) => set('contract_notes', e.target.value)} disabled={ro} data-testid="ud-contract-notes" />
          </Field>
        </SectionCard>

        {/* DISPONIBILITÀ */}
        <SectionCard title="Disponibilità" testId="ud-availability">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Disponibilità standard: {form.standard_available ? 'Attiva' : 'Disattivata'}</p>
              <p className="text-xs text-muted-foreground">Se disattivata l'utente non viene proposto nelle organizzazioni giornaliere.</p>
            </div>
            <Switch checked={form.standard_available} disabled={ro}
              onCheckedChange={(v) => { set('standard_available', v); save({ standard_available: v }); }}
              data-testid="ud-standard-available" />
          </div>
          <p className="text-xs text-muted-foreground">
            Nessun giorno libero settimanale fisso: giorni liberi, orari e non disponibilità si definiscono giorno per giorno in
            Pulizie → Organizzazione e Consegne → Organizzazione giro.
          </p>
        </SectionCard>

        {/* ACCESSO */}
        <SectionCard title="Accesso" testId="ud-access"
          action={isAdmin && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setResetOpen(true)} data-testid="ud-reset-pwd-btn">
              <KeyRound className="h-3 w-3" />Reset password
            </Button>
          )}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Email login</p><p className="font-medium break-all">{user.email}</p></div>
            <div><p className="text-xs text-muted-foreground">Ultimo accesso</p><p className="font-medium tabular-nums" data-testid="ud-last-login">{fmtDateTime(user.last_login)}</p></div>
            <div><p className="text-xs text-muted-foreground">Stato account</p><p className="font-medium">{user.is_active ? 'Attivo' : 'Disattivato'}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Lingua interfaccia</p>
              <select value={form.language} disabled={ro}
                onChange={(e) => { set('language', e.target.value); save({ language: e.target.value }); }}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm mt-0.5" data-testid="ud-language">
                <option value="it">Italiano</option><option value="en">English</option>
              </select>
            </div>
          </div>
        </SectionCard>

        {/* SERVIZIO & GPS */}
        {isOps && (
          <SectionCard title="Servizio & GPS" testId="ud-gps">
            <div className="flex items-center gap-3">
              <span className={cn('w-2.5 h-2.5 rounded-full', gps?.in_service ? 'bg-emerald-500' : 'bg-gray-400')} />
              <p className="text-sm font-semibold" data-testid="ud-service-state">{gps?.in_service ? 'In servizio' : 'Fuori servizio'}</p>
              <span className={cn('text-xs font-semibold', gpsMeta[1])} data-testid="ud-gps-state">{gpsMeta[0]}</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />Ultimo aggiornamento: {fmtDateTime(gps?.last_update)}</p>
              {gps?.session_type && <p>Attività corrente: {gps.session_type}</p>}
              <p>La posizione è attiva solo durante la sessione di lavoro (avvio/fine attività). Nessuna cronologia mostrata qui.</p>
            </div>
          </SectionCard>
        )}
      </div>

      {/* AUDIT */}
      <SectionCard title="Attività recente (audit)" testId="ud-audit">
        {audit.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nessun evento registrato.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {audit.map((a) => (
              <div key={a.id} className="py-2 text-xs flex items-start justify-between gap-3" data-testid={`audit-row-${a.id}`}>
                <div className="min-w-0">
                  <p className="font-semibold">{AUDIT_LABELS[a.action] || a.action}</p>
                  {a.details && <p className="text-muted-foreground truncate">{JSON.stringify(a.details)}</p>}
                </div>
                <div className="text-right shrink-0 text-muted-foreground">
                  <p>{a.user_name}</p>
                  <p className="tabular-nums">{fmtDateTime(a.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* DANGER ZONE */}
      {isAdmin && (
        <Card className="border border-red-200 dark:border-red-900">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-red-600">Eliminazione definitiva</p>
              <p className="text-xs text-muted-foreground">Consentita solo se l'utente non ha storico operativo. Il codice {user.usr_code} non verrà mai riutilizzato. Con storico usa Disattiva.</p>
            </div>
            <Button variant="outline" className="h-9 gap-1.5 text-red-600 border-red-300 hover:bg-red-50 shrink-0"
              onClick={() => setDeleteOpen(true)} data-testid="ud-delete-btn">
              <Trash2 className="h-4 w-4" />Elimina
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onOpenChange={(v) => !v && setResetOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="reset-pwd-dialog">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription className="text-xs">Imposta una nuova password per {user.name}. Non viene mai mostrata la password attuale.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Nuova password (min 8 caratteri)</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} data-testid="reset-pwd-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>Annulla</Button>
            <Button onClick={resetPassword} disabled={newPwd.length < 8} data-testid="reset-pwd-submit">Reimposta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={(v) => !v && setDeleteOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="delete-user-dialog">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminare definitivamente?</DialogTitle>
            <DialogDescription className="text-xs">
              {user.usr_code} · {user.name} verrà eliminato per sempre. L'operazione è consentita solo per utenti creati per errore, senza alcuno storico.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Annulla</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={hardDelete} data-testid="delete-user-confirm">
              Elimina definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
