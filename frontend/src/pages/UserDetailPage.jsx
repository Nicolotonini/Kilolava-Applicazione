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
import { useAuth } from '../contexts/AuthContext';
import { CONTRACT_WARN, fmtDate, RAPPORTO_LABELS, CONTRACT_LABELS, ActivationCodeView } from './UsersPage';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { Cake, KeyRound, MapPin, Power, Trash2, AlertTriangle, ShieldCheck, Smartphone, RefreshCcw, LogOut, Lock } from 'lucide-react';

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
  'user.admin_data_update': 'Modifica dati amministrativi', 'user.activation_code': 'Codice attivazione generato',
  'user.force_reactivation': 'Riattivazione forzata', 'user.sessions_revoked': 'Sessioni revocate',
  'user.device_revoked': 'Dispositivo revocato', 'user.first_activation': 'Prima attivazione',
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
  const { user: me } = useAuth();
  const [user, setUser] = useState(null);
  const [gps, setGps] = useState(null);
  const [audit, setAudit] = useState([]);
  const [form, setForm] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [adminForm, setAdminForm] = useState(null);
  const [devices, setDevices] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [codeInfo, setCodeInfo] = useState(null);

  const loadDevices = useCallback(() => {
    api.get(`/users/${userId}/devices`).then((r) => setDevices(r.data)).catch(() => {});
  }, [userId]);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/users/${userId}`);
      setUser(r.data);
      setForm({
        first_name: r.data.first_name || '', last_name: r.data.last_name || '',
        display_name: r.data.display_name || '',
        phone: r.data.phone || '', birth_date: r.data.anagrafica?.birth_date || '',
        role: r.data.role, extra_roles: r.data.extra_roles || [],
        standard_available: r.data.standard_available,
        excluded_from_planning: !!r.data.excluded_from_planning,
        tipo_rapporto: r.data.tipo_rapporto || 'dipendente',
        contract_type: ['collaborazione'].includes(r.data.contract?.type) ? 'indeterminato' : (r.data.contract?.type || 'indeterminato'),
        start_date: r.data.contract?.start_date || '', end_date: r.data.contract?.end_date || '',
        weekly_hours: r.data.contract?.weekly_hours ?? '',
        transformation_date: r.data.contract?.transformation_date || '',
        apprenticeship_end: r.data.contract?.apprenticeship_end || '',
        contract_notes: r.data.contract?.notes || '', language: r.data.language || 'it',
        login_username: r.data.login_username || '',
      });
    } catch (e) { toast.error('Utente non trovato'); navigate('/users'); return; }
    api.get(`/users/${userId}/service-status`).then((r) => setGps(r.data)).catch(() => {});
    api.get(`/users/${userId}/audit`).then((r) => setAudit(r.data)).catch(() => {});
    api.get(`/users/${userId}/admin-data`).then((r) => {
      setAdminData(r.data);
      setAdminForm({ tax_code: r.data.tax_code || '', vat_number: r.data.vat_number || '',
        iban: r.data.iban || '', iban_holder: r.data.iban_holder || '', admin_notes: r.data.admin_notes || '' });
    }).catch(() => {});
    loadDevices();
  }, [userId, navigate, loadDevices]);
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
    first_name: form.first_name, last_name: form.last_name,
    display_name: form.display_name.trim() || '',
    phone: form.phone || null,
    anagrafica: { ...(user.anagrafica || {}), birth_date: form.birth_date || null },
  });
  const saveRoles = () => save({ role: form.role, extra_roles: form.extra_roles.filter((x) => x !== form.role) });

  const saveRapporto = () => {
    let contract = null;
    if (form.tipo_rapporto === 'dipendente') {
      if (form.contract_type === 'determinato' && !form.end_date) {
        toast.error('Data fine contratto obbligatoria per il Tempo determinato'); return;
      }
      contract = {
        type: form.contract_type, start_date: form.start_date || null,
        end_date: form.contract_type === 'indeterminato' ? null : (form.end_date || null),
        weekly_hours: form.weekly_hours === '' ? null : form.weekly_hours,
        transformation_date: form.transformation_date || null,
        apprenticeship_end: form.contract_type === 'apprendistato' ? (form.apprenticeship_end || null) : null,
        notes: form.contract_notes,
      };
    } else if (form.tipo_rapporto === 'collaboratore_piva') {
      contract = { type: 'collaborazione', start_date: form.start_date || null, notes: form.contract_notes };
    }
    save({ tipo_rapporto: form.tipo_rapporto, contract });
  };

  const saveAdminData = async () => {
    setSaving(true);
    try {
      const payload = { tax_code: adminForm.tax_code, vat_number: adminForm.vat_number, admin_notes: adminForm.admin_notes };
      if (!adminData?.iban_hidden) { payload.iban = adminForm.iban; payload.iban_holder = adminForm.iban_holder; }
      await api.put(`/users/${userId}/admin-data`, payload);
      toast.success('Dati amministrativi salvati');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore salvataggio'); }
    finally { setSaving(false); }
  };

  const saveUsername = () => save({ login_username: form.login_username });

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
      toast.success('Password reimpostata (sessioni revocate): comunicala all\'utente');
      setResetOpen(false); setNewPwd('');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore reset'); }
  };

  const genActivationCode = async () => {
    try {
      const r = await api.post(`/users/${userId}/activation-code`);
      setCodeInfo(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore generazione codice'); }
  };

  const forceReactivation = async () => {
    try {
      const r = await api.post(`/users/${userId}/force-reactivation`);
      setForceOpen(false);
      setCodeInfo(r.data);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore riattivazione'); setForceOpen(false); }
  };

  const revokeSessions = async () => {
    try {
      const r = await api.post(`/users/${userId}/revoke-sessions`);
      toast.success(r.data.message);
      loadDevices();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const revokeDevice = async (deviceId) => {
    try {
      await api.delete(`/users/${userId}/devices/${deviceId}`);
      toast.success('Dispositivo revocato: su quel dispositivo servirà di nuovo la password');
      loadDevices();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
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
  const isPending = user.activation_status === 'pending';

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
            {isPending && <StatusBadge tone="waiting" testId="ud-pending-badge">Da attivare</StatusBadge>}
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
          <span className="font-normal text-xs opacity-80">— l'account NON viene disattivato automaticamente: decide il Responsabile/Super Admin</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* IDENTITÀ */}
        <SectionCard title="Identità" testId="ud-identity"
          action={!ro && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveIdentity} disabled={saving} data-testid="ud-save-identity">Salva</Button>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome"><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} disabled={ro} data-testid="ud-first-name" /></Field>
            <Field label="Cognome"><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} disabled={ro} data-testid="ud-last-name" /></Field>
            <Field label="Nome visualizzato (facoltativo)"><Input value={form.display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="es. Susanna" disabled={ro} data-testid="ud-display-name" /></Field>
            <Field label="Telefono"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} disabled={ro} data-testid="ud-phone" /></Field>
            <Field label="Data di nascita"><Input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} disabled={ro} data-testid="ud-birth-date" /></Field>
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
          <Field label="Ruoli aggiuntivi (stessa persona, più mansioni: unione dei permessi)">
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
          action={!ro && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveRapporto} disabled={saving} data-testid="ud-save-contract">Salva</Button>}>
          <Field label="Tipo di rapporto">
            <select value={form.tipo_rapporto} onChange={(e) => set('tipo_rapporto', e.target.value)} disabled={ro}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="ud-tipo-rapporto">
              {Object.entries(RAPPORTO_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {form.tipo_rapporto === 'dipendente' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipologia contratto">
                <select value={form.contract_type} onChange={(e) => set('contract_type', e.target.value)} disabled={ro}
                  className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="ud-contract-type">
                  {['indeterminato', 'determinato', 'apprendistato', 'intermittente', 'altro'].map((t) => (
                    <option key={t} value={t}>{CONTRACT_LABELS[t]}</option>))}
                </select>
              </Field>
              <Field label="Data inizio"><Input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} disabled={ro} data-testid="ud-start-date" /></Field>
              {form.contract_type !== 'indeterminato' && (
                <Field label={form.contract_type === 'determinato' ? 'Data fine contratto *' : 'Data fine (se prevista)'}>
                  <Input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} disabled={ro} data-testid="ud-end-date" />
                </Field>
              )}
              <Field label="Ore settimanali"><Input type="number" min="0" step="0.5" value={form.weekly_hours} onChange={(e) => set('weekly_hours', e.target.value)} disabled={ro} data-testid="ud-weekly-hours" /></Field>
              <Field label="Trasformazione contratto (facoltativa)"><Input type="date" value={form.transformation_date || ''} onChange={(e) => set('transformation_date', e.target.value)} disabled={ro} data-testid="ud-transformation-date" /></Field>
              {form.contract_type === 'apprendistato' && (
                <Field label="Fine periodo formativo (facoltativa)"><Input type="date" value={form.apprenticeship_end || ''} onChange={(e) => set('apprenticeship_end', e.target.value)} disabled={ro} data-testid="ud-apprenticeship-end" /></Field>
              )}
            </div>
          )}
          {form.tipo_rapporto === 'collaboratore_piva' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inizio collaborazione (facoltativo)"><Input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} disabled={ro} data-testid="ud-start-date" /></Field>
              <p className="text-xs text-muted-foreground self-end pb-2">P.IVA e dati fiscali nella sezione Dati amministrativi.</p>
            </div>
          )}
          <Field label="Note interne">
            <Textarea rows={2} value={form.contract_notes} onChange={(e) => set('contract_notes', e.target.value)} disabled={ro} data-testid="ud-contract-notes" />
          </Field>
        </SectionCard>

        {/* DISPONIBILITÀ */}
        <SectionCard title="Disponibilità e pianificazione" testId="ud-availability">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Disponibilità standard: {form.standard_available ? 'Attiva' : 'Disattivata'}</p>
              <p className="text-xs text-muted-foreground">Se disattivata l'utente non viene proposto nelle organizzazioni giornaliere.</p>
            </div>
            <Switch checked={form.standard_available} disabled={ro}
              onCheckedChange={(v) => { set('standard_available', v); save({ standard_available: v }); }}
              data-testid="ud-standard-available" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Escluso dalla pianificazione: {form.excluded_from_planning ? 'Sì' : 'No'}</p>
              <p className="text-xs text-muted-foreground">Per Direzione e account tecnici: non compare mai tra Pulizie/Rider proposti.</p>
            </div>
            <Switch checked={form.excluded_from_planning} disabled={ro}
              onCheckedChange={(v) => { set('excluded_from_planning', v); save({ excluded_from_planning: v }); }}
              data-testid="ud-excluded-planning" />
          </div>
          <p className="text-xs text-muted-foreground">
            Nessun giorno libero settimanale fisso: giorni liberi, orari e non disponibilità si definiscono giorno per giorno in
            Pulizie → Organizzazione e Consegne → Organizzazione giro.
          </p>
        </SectionCard>

        {/* DATI AMMINISTRATIVI */}
        {isOps && adminData && adminForm && (
          <SectionCard title="Dati amministrativi" testId="ud-admin-data"
            action={
              <div className="flex items-center gap-2">
                <span className={cn('text-xs rounded-full px-2 py-0.5 font-semibold',
                  adminData.status === 'completi' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : adminData.status === 'non_richiesti' ? 'bg-muted text-muted-foreground'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}
                  data-testid="ud-admin-data-status">
                  {adminData.status === 'completi' ? 'Completi' : adminData.status === 'non_richiesti' ? 'Non richiesti' : 'Da completare'}
                </span>
                {adminData.can_edit && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={saveAdminData} disabled={saving} data-testid="ud-save-admin-data">Salva</Button>
                )}
              </div>
            }>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Codice fiscale"><Input value={adminForm.tax_code} onChange={(e) => setAdminForm((f) => ({ ...f, tax_code: e.target.value.toUpperCase() }))} disabled={!adminData.can_edit} className="font-mono" data-testid="ud-tax-code" /></Field>
              <Field label={`Partita IVA${user.tipo_rapporto === 'collaboratore_piva' ? ' (obbligatoria per Collaboratore P.IVA)' : ''}`}>
                <Input value={adminForm.vat_number} onChange={(e) => setAdminForm((f) => ({ ...f, vat_number: e.target.value }))} disabled={!adminData.can_edit} className="font-mono" data-testid="ud-vat-number" />
              </Field>
              {adminData.iban_hidden ? (
                <div className="col-span-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5" data-testid="ud-iban-hidden">
                  <Lock className="h-3.5 w-3.5" />IBAN riservato al Super Admin
                </div>
              ) : (
                <>
                  <Field label="IBAN"><Input value={adminForm.iban} onChange={(e) => setAdminForm((f) => ({ ...f, iban: e.target.value.toUpperCase() }))} disabled={!adminData.can_edit} className="font-mono" data-testid="ud-iban" /></Field>
                  <Field label="Intestatario IBAN"><Input value={adminForm.iban_holder} onChange={(e) => setAdminForm((f) => ({ ...f, iban_holder: e.target.value }))} disabled={!adminData.can_edit} data-testid="ud-iban-holder" /></Field>
                </>
              )}
            </div>
            <Field label="Note amministrative">
              <Textarea rows={2} value={adminForm.admin_notes} onChange={(e) => setAdminForm((f) => ({ ...f, admin_notes: e.target.value }))} disabled={!adminData.can_edit} data-testid="ud-admin-notes" />
            </Field>
            <p className="text-xs text-muted-foreground">Questi dati non compaiono mai in liste, log operativi, export o nell'Assistente AI.</p>
          </SectionCard>
        )}

        {/* ACCESSO E SICUREZZA */}
        <SectionCard title="Accesso e sicurezza" testId="ud-access">
          <div className="space-y-3">
            <Field label="Nome utente Kilolava (non è una email reale: nessun invio email)">
              <div className="flex items-center gap-2">
                <Input value={form.login_username} onChange={(e) => set('login_username', e.target.value)} disabled={ro} className="font-mono" data-testid="ud-login-username" />
                {!ro && <Button size="sm" variant="outline" className="h-9 text-xs shrink-0" onClick={saveUsername} disabled={saving} data-testid="ud-save-username">Salva</Button>}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Stato attivazione</p>
                <p className={cn('font-medium', isPending ? 'text-amber-600' : 'text-emerald-600')} data-testid="ud-activation-status">
                  {isPending ? 'Da attivare (codice monouso)' : 'Attivo'}
                </p></div>
              <div><p className="text-xs text-muted-foreground">PIN dispositivo</p>
                <p className="font-medium" data-testid="ud-pin-state">{user.pin_set ? 'Impostato (6 cifre)' : 'Non impostato'}</p></div>
              <div><p className="text-xs text-muted-foreground">Ultimo accesso</p>
                <p className="font-medium tabular-nums" data-testid="ud-last-login">{fmtDateTime(user.last_login)}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">Lingua interfaccia</p>
                <select value={form.language} disabled={ro}
                  onChange={(e) => { set('language', e.target.value); save({ language: e.target.value }); }}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm mt-0.5" data-testid="ud-language">
                  <option value="it">Italiano</option><option value="en">English</option>
                </select>
              </div>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2 pt-1">
                {isPending ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={genActivationCode} data-testid="ud-gen-code-btn">
                    <KeyRound className="h-3 w-3" />Genera codice attivazione
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setResetOpen(true)} data-testid="ud-reset-pwd-btn">
                      <KeyRound className="h-3 w-3" />Reset password
                    </Button>
                    {user.id !== me?.id && (
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setForceOpen(true)} data-testid="ud-force-react-btn">
                        <RefreshCcw className="h-3 w-3" />Forza nuova attivazione
                      </Button>
                    )}
                  </>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={revokeSessions} data-testid="ud-revoke-sessions-btn">
                  <LogOut className="h-3 w-3" />Revoca tutte le sessioni
                </Button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* DISPOSITIVI AUTORIZZATI */}
        {isOps && (
          <SectionCard title="Dispositivi autorizzati" testId="ud-devices"
            action={devices != null && (
              <span className="text-xs text-muted-foreground" data-testid="ud-active-sessions">{devices.active_sessions} sessioni attive</span>
            )}>
            {!devices || devices.devices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nessun dispositivo registrato: verrà autorizzato al primo accesso con password.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {devices.devices.map((d) => (
                  <div key={d.device_id} className="py-2 flex items-center justify-between gap-3" data-testid={`device-row-${d.device_id}`}>
                    <div className="min-w-0 flex items-center gap-2">
                      <Smartphone className={cn('h-4 w-4 shrink-0', d.revoked ? 'text-muted-foreground' : 'text-emerald-600')} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {d.name || 'Dispositivo'}
                          {d.revoked && <span className="ml-1.5 text-xs text-red-600 font-semibold">Revocato</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">Ultimo uso: {fmtDateTime(d.last_used_at)}</p>
                      </div>
                    </div>
                    {isAdmin && !d.revoked && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50 shrink-0"
                        onClick={() => revokeDevice(d.device_id)} data-testid={`revoke-device-${d.device_id}`}>Revoca</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Il PIN vale solo sui dispositivi autorizzati. Su un dispositivo revocato serve di nuovo la password.</p>
          </SectionCard>
        )}

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
              <p>La posizione è attiva solo durante la sessione di lavoro (avvio/fine attività). Mai tracking 24/7.</p>
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

      {/* Codice attivazione (mostrato UNA volta) */}
      <Dialog open={!!codeInfo} onOpenChange={(v) => !v && setCodeInfo(null)}>
        <DialogContent className="max-w-md" data-testid="activation-code-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Codice di attivazione</DialogTitle>
            <DialogDescription className="text-xs">Mostrato una sola volta: comunicalo di persona a {user.name}.</DialogDescription>
          </DialogHeader>
          {codeInfo && <ActivationCodeView info={codeInfo} onDone={() => setCodeInfo(null)} doneLabel="Chiudi" />}
        </DialogContent>
      </Dialog>

      {/* Forza nuova attivazione */}
      <Dialog open={forceOpen} onOpenChange={(v) => !v && setForceOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="force-react-dialog">
          <DialogHeader>
            <DialogTitle>Forzare una nuova attivazione?</DialogTitle>
            <DialogDescription className="text-xs">
              Password e PIN di {user.name} verranno azzerati, tutte le sessioni e i dispositivi revocati.
              Riceverai un nuovo codice monouso da comunicare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceOpen(false)}>Annulla</Button>
            <Button onClick={forceReactivation} data-testid="force-react-confirm">Forza riattivazione</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onOpenChange={(v) => !v && setResetOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="reset-pwd-dialog">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription className="text-xs">Imposta una nuova password per {user.name}. Tutte le sessioni attive verranno revocate. Il PIN sui dispositivi autorizzati resta valido.</DialogDescription>
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
