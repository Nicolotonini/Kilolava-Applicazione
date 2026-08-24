import React, { useState, useEffect, useCallback } from 'react';
import { integrationsApi, structuresApi, clientsApi } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  Plug, Plus, RefreshCw, Trash2, CheckCircle2, XCircle, AlertTriangle,
  Link2, Building2, CalendarDays, Loader2, KeyRound, Download, Unlink, EyeOff,
  Settings2, ExternalLink, Webhook,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const PROVIDER_LABELS = {
  kross: 'Kross Booking',
  guesty: 'Guesty',
  hostaway: 'Hostaway',
  octorate: 'Octorate',
  ical: 'iCal',
};

const STATUS_META = {
  connected: { label: 'Collegato', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  warning: { label: 'Attenzione', dot: 'bg-amber-500', text: 'text-amber-600' },
  error: { label: 'Errore', dot: 'bg-red-500', text: 'text-red-600' },
  not_configured: { label: 'Non configurato', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
  disconnected: { label: 'Da testare', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
};

const RES_STATUS_META = {
  confirmed: { label: 'Confermata', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  pending: { label: 'In attesa', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  option: { label: 'Opzione', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  cancelled: { label: 'Cancellata', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  no_show: { label: 'No-show', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  unknown: { label: 'Sconosciuto', cls: 'bg-muted text-muted-foreground' },
};

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const clientDisplayName = (c) => {
  if (!c) return '';
  if (c.client_type === 'company') return (c.company_info || {}).company_name || '';
  const pi = c.private_info || {};
  return `${pi.name || pi.first_name || ''} ${pi.surname || pi.last_name || ''}`.trim();
};

export default function IntegrationsPage() {
  const [tab, setTab] = useState('connections');
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [structures, setStructures] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [octorateAppOpen, setOctorateAppOpen] = useState(false);

  const reload = useCallback(() => {
    integrationsApi.list().then(r => setConnections(r.data)).catch(e => console.error(e));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oct = params.get('octorate');
    if (oct === 'connected') toast.success('Octorate collegato via OAuth');
    else if (oct === 'error') toast.error(`Collegamento Octorate fallito${params.get('reason') ? `: ${params.get('reason')}` : ''}`);
    if (oct) window.history.replaceState({}, '', '/integrations');
  }, []);

  useEffect(() => {
    Promise.all([
      integrationsApi.providers(),
      integrationsApi.list(),
      structuresApi.getAll(),
      clientsApi.getAll(),
    ])
      .then(([p, c, s, cl]) => {
        setProviders(p.data);
        setConnections(c.data);
        setStructures(s.data);
        setClients(cl.data);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 lg:p-8 space-y-5" data-testid="integrations-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Integrazioni</h1>
          <p className="text-sm text-muted-foreground">Channel Manager e fonti prenotazioni — priorità: API → iCal → Manuale</p>
        </div>
        {tab === 'connections' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setOctorateAppOpen(true)}
              data-testid="octorate-app-settings-btn"
            >
              <Settings2 className="h-4 w-4 mr-1.5" />App Octorate
            </Button>
            <Button
              onClick={() => { setEditConn(null); setDialogOpen(true); }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              data-testid="add-channel-manager-btn"
            >
              <Plus className="h-4 w-4 mr-1.5" />Aggiungi Channel Manager
            </Button>
          </div>
        )}
      </div>

      <div className="flex gap-1">
        {[
          { key: 'connections', label: 'Channel Manager' },
          { key: 'reservations', label: 'Prenotazioni importate' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
            data-testid={`integrations-tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'connections' ? (
        loading ? (
          <p className="text-center py-12 text-muted-foreground">Caricamento...</p>
        ) : connections.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl" data-testid="cm-empty">
            <Plug className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Nessun Channel Manager collegato. Aggiungi il primo account (es. Kross Booking).</p>
          </div>
        ) : (
          <div className="space-y-3">
            {connections.map(conn => (
              <ConnectionCard
                key={conn.id}
                conn={conn}
                structures={structures}
                onReload={reload}
                onEdit={() => { setEditConn(conn); setDialogOpen(true); }}
                onTestResult={setTestResult}
              />
            ))}
          </div>
        )
      ) : (
        <ReservationsTab connections={connections} structures={structures} />
      )}

      <ConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        providers={providers}
        clients={clients}
        editConn={editConn}
        onSaved={reload}
      />
      <OctorateAppDialog open={octorateAppOpen} onClose={() => setOctorateAppOpen(false)} />
      <TestResultDialog result={testResult} onClose={() => setTestResult(null)} />
    </div>
  );
}

function StatusDot({ status }) {
  const meta = STATUS_META[status] || STATUS_META.disconnected;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', meta.text)} data-testid="connection-status">
      <span className={cn('w-2 h-2 rounded-full', meta.dot)} />{meta.label}
    </span>
  );
}

function ConnectionCard({ conn, structures, onReload, onEdit, onTestResult }) {
  const [busy, setBusy] = useState('');
  const [showMappings, setShowMappings] = useState(false);

  const run = async (label, fn, okMsg) => {
    setBusy(label);
    try {
      const res = await fn();
      if (okMsg) toast.success(okMsg);
      return res;
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
      return null;
    } finally {
      setBusy('');
      onReload();
    }
  };

  const handleTest = async () => {
    setBusy('test');
    try {
      const res = await integrationsApi.test(conn.id);
      onTestResult({ ...res.data, connection_name: conn.name });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante il test');
    } finally {
      setBusy('');
      onReload();
    }
  };

  const handleOctorateConnect = async () => {
    setBusy('oauth');
    try {
      const res = await integrationsApi.octorateConnect(conn.id);
      window.location.assign(res.data.authorize_url);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Impossibile avviare il flusso OAuth');
      setBusy('');
    }
  };

  const handleSync = async () => {
    const res = await run('sync', () => integrationsApi.sync(conn.id));
    if (res) {
      const r = res.data;
      if (r.errors?.length) toast.error(r.errors[0]);
      else toast.success(`Sync completata: ${r.created} nuove, ${r.updated} aggiornate, ${r.cancelled} cancellate`);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Disconnettere questo account? Le prenotazioni importate e le strutture Kilolava NON verranno eliminate.')) return;
    await run('delete', () => integrationsApi.remove(conn.id), 'Account disconnesso');
  };

  const lastErr = conn.status === 'error'
    ? (conn.last_sync_result?.errors?.[0] || conn.last_test?.error)
    : null;

  return (
    <Card className="border shadow-none" data-testid={`connection-card-${conn.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase tracking-wide">
                {PROVIDER_LABELS[conn.provider] || conn.provider}
              </span>
              <p className="font-semibold text-sm">{conn.name}</p>
              <StatusDot status={conn.status} />
            </div>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {conn.client_name && <span>Cliente: {conn.client_name}</span>}
              <span className="flex items-center gap-1"><Download className="h-3 w-3" />{conn.properties_imported} proprietà importate</span>
              <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{conn.linked_structures} collegate a Kilolava</span>
              <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{conn.reservations_imported} prenotazioni importate</span>
              <span>Ultima sync: {fmtDateTime(conn.last_sync)}</span>
            </div>
            {conn.provider === 'hostaway' && conn.webhook_path && (
              <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1 flex-wrap" data-testid={`webhook-url-${conn.id}`}>
                <Webhook className="h-3 w-3 shrink-0" />
                Webhook: <span className="font-mono select-all">{window.location.origin}{conn.webhook_path}</span>
                <span>(registralo su Hostaway → Settings → Add Webhook con login/password webhook)</span>
              </p>
            )}
            {lastErr && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1" data-testid={`connection-error-${conn.id}`}>
                <XCircle className="h-3.5 w-3.5 shrink-0" />{lastErr}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {conn.provider === 'octorate' && !conn.oauth_connected && (
              <Button
                size="sm" className="h-8 text-xs bg-primary text-primary-foreground"
                onClick={handleOctorateConnect} disabled={!!busy}
                data-testid={`octorate-connect-${conn.id}`}
              >
                {busy === 'oauth' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />}Collega Octorate
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleTest} disabled={!!busy} data-testid={`test-connection-${conn.id}`}>
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plug className="h-3.5 w-3.5 mr-1" />}Testa connessione
            </Button>
            <Button
              variant="outline" size="sm" className="h-8 text-xs" onClick={handleSync}
              disabled={!!busy || conn.linked_structures === 0}
              title={conn.linked_structures === 0 ? 'Collega prima almeno una struttura nel mapping' : undefined}
              data-testid={`sync-now-${conn.id}`}
            >
              {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}Sincronizza ora
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowMappings(v => !v)} data-testid={`show-mappings-${conn.id}`}>
              <Link2 className="h-3.5 w-3.5 mr-1" />Proprietà & Mapping
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onEdit} data-testid={`edit-connection-${conn.id}`}>
              <KeyRound className="h-3.5 w-3.5 mr-1" />Credenziali
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleDelete} data-testid={`delete-connection-${conn.id}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {showMappings && (
          <MappingSection conn={conn} structures={structures} onChanged={onReload} />
        )}
      </CardContent>
    </Card>
  );
}

function MappingSection({ conn, structures, onChanged }) {
  const [mappings, setMappings] = useState(null);
  const [busy, setBusy] = useState('');
  const [selected, setSelected] = useState({});

  const load = useCallback(() => {
    integrationsApi.mappings(conn.id).then(r => setMappings(r.data)).catch(() => setMappings([]));
  }, [conn.id]);

  useEffect(() => { load(); }, [load]);

  const handleImport = async () => {
    setBusy('import');
    try {
      const res = await integrationsApi.importProperties(conn.id);
      toast.success(`${res.data.imported} proprietà importate dal channel manager`);
      load();
      onChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante l\'import');
    } finally {
      setBusy('');
    }
  };

  const act = async (mappingId, action, structureId) => {
    setBusy(mappingId);
    try {
      const res = await integrationsApi.updateMapping(mappingId, { action, structure_id: structureId });
      if (res.data.warning) toast.warning(res.data.warning);
      else toast.success(action === 'link' ? 'Struttura collegata' : action === 'ignore' ? 'Proprietà ignorata' : 'Scollegata');
      load();
      onChanged();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    } finally {
      setBusy('');
    }
  };

  const MAP_STATUS = {
    linked: { label: 'Collegato', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    unlinked: { label: 'Da collegare', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    ignored: { label: 'Ignorato', cls: 'bg-muted text-muted-foreground' },
  };

  return (
    <div className="border-t border-border pt-3 space-y-2" data-testid={`mapping-section-${conn.id}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Proprietà esterne → Strutture Kilolava</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleImport} disabled={!!busy} data-testid={`import-properties-${conn.id}`}>
          {busy === 'import' ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}Importa proprietà
        </Button>
      </div>
      {mappings === null ? (
        <p className="text-xs text-muted-foreground py-2">Caricamento...</p>
      ) : mappings.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nessuna proprietà importata. Usa "Importa proprietà" dopo aver testato la connessione.</p>
      ) : (
        <div className="space-y-1.5">
          {mappings.map(m => {
            const ms = MAP_STATUS[m.status] || MAP_STATUS.unlinked;
            return (
              <div key={m.id} className="flex items-center gap-3 flex-wrap rounded-lg border border-border/60 px-3 py-2" data-testid={`mapping-row-${m.id}`}>
                <div className="min-w-[180px]">
                  <p className="text-sm font-medium">{m.external_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">External ID: {m.external_id}</p>
                </div>
                <Badge className={cn('text-xs border-0', ms.cls)}>{ms.label}</Badge>
                {m.status === 'linked' ? (
                  <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
                    <span className="text-sm">→ <span className="font-mono text-primary font-bold text-xs">{m.klv_code || '—'}</span> {m.structure_name}</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => act(m.id, 'unlink')} disabled={busy === m.id}>
                      <Unlink className="h-3 w-3 mr-1" />Scollega
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1 justify-end flex-wrap">
                    <Select value={selected[m.id] || ''} onValueChange={v => setSelected(s => ({ ...s, [m.id]: v }))}>
                      <SelectTrigger className="h-8 w-56 text-xs" data-testid={`mapping-structure-select-${m.id}`}>
                        <SelectValue placeholder="Seleziona struttura Kilolava..." />
                      </SelectTrigger>
                      <SelectContent>
                        {structures.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="h-8 text-xs bg-primary text-primary-foreground" disabled={!selected[m.id] || busy === m.id} onClick={() => act(m.id, 'link', selected[m.id])} data-testid={`link-mapping-${m.id}`}>
                      <Link2 className="h-3 w-3 mr-1" />Collega
                    </Button>
                    {m.status !== 'ignored' && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => act(m.id, 'ignore')} disabled={busy === m.id}>
                        <EyeOff className="h-3 w-3 mr-1" />Ignora
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConnectionDialog({ open, onClose, providers, clients, editConn, onSaved }) {
  const [provider, setProvider] = useState('kross');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('none');
  const [creds, setCreds] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProvider(editConn?.provider || 'kross');
      setName(editConn?.name || '');
      setClientId(editConn?.client_id || 'none');
      setCreds({});
    }
  }, [open, editConn]);

  const meta = providers.find(p => p.provider === provider);

  const save = async () => {
    if (!name.trim()) { toast.error('Inserisci un nome interno per l\'account'); return; }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        client_id: clientId === 'none' ? null : clientId,
        credentials: creds,
      };
      if (editConn) {
        await integrationsApi.update(editConn.id, payload);
        toast.success('Account aggiornato');
      } else {
        await integrationsApi.create({ ...payload, provider });
        toast.success('Channel Manager aggiunto — esegui "Testa connessione"');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="connection-dialog">
        <DialogHeader>
          <DialogTitle>{editConn ? 'Modifica account' : 'Aggiungi Channel Manager'}</DialogTitle>
          <DialogDescription>Le credenziali sono salvate solo nel backend e mai mostrate dopo il salvataggio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!editConn && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Provider</label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="h-9 mt-1" data-testid="provider-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.provider} value={p.provider}>
                      {p.label}{!p.implemented ? ' — Non configurato' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {meta && (
            <div className={cn('rounded-lg border p-3 text-xs leading-relaxed',
              meta.implemented ? 'border-border bg-muted/40 text-muted-foreground' : 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-300')}>
              <p>{meta.notes}</p>
              {!meta.implemented && meta.missing_requirements?.length > 0 && (
                <ul className="mt-1.5 list-disc pl-4 space-y-0.5">
                  {meta.missing_requirements.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome interno account</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="es. Kross Booking — Urbanauts" className="h-9 mt-1" data-testid="connection-name-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Cliente associato (opzionale)</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-9 mt-1" data-testid="connection-client-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{clientDisplayName(c) || c.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(meta?.credential_fields || []).map(f => (
            <div key={f.key}>
              <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
              <Input
                type={f.secret ? 'password' : 'text'}
                value={creds[f.key] || ''}
                onChange={e => setCreds(c => ({ ...c, [f.key]: e.target.value }))}
                placeholder={editConn ? (editConn.credentials?.[f.key] ? 'Impostata — lascia vuoto per non modificare' : '') : ''}
                className="h-9 mt-1"
                data-testid={`cred-${f.key}-input`}
              />
              {f.help && <p className="text-xs text-muted-foreground mt-0.5">{f.help}</p>}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground" data-testid="save-connection-btn">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salva
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OctorateAppDialog({ open, onClose }) {
  const [form, setForm] = useState({ client_id: '', client_secret: '', redirect_uri: '' });
  const [secretSet, setSecretSet] = useState(false);
  const [saving, setSaving] = useState(false);
  const suggested = `${window.location.origin}/api/integrations/octorate/callback`;

  useEffect(() => {
    if (open) {
      integrationsApi.octorateAppSettings().then(r => {
        setForm({
          client_id: r.data.client_id || '',
          client_secret: '',
          redirect_uri: r.data.redirect_uri || '',
        });
        setSecretSet(r.data.client_secret_set);
      }).catch(() => {});
    }
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      await integrationsApi.saveOctorateAppSettings({
        client_id: form.client_id,
        client_secret: form.client_secret || null,
        redirect_uri: form.redirect_uri,
      });
      toast.success('Credenziali app Octorate salvate');
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="octorate-app-dialog">
        <DialogHeader>
          <DialogTitle>App Octorate (credenziali globali)</DialogTitle>
          <DialogDescription>
            Credenziali dell'applicazione Kilolava fornite da Octorate al partner. Si configurano una sola volta:
            i singoli account si collegano poi con "Collega Octorate" (OAuth).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Client ID Octorate</label>
            <Input value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} className="h-9 mt-1" data-testid="octorate-client-id-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Client Secret Octorate</label>
            <Input type="password" value={form.client_secret} onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))} placeholder={secretSet ? 'Impostato — lascia vuoto per non modificare' : ''} className="h-9 mt-1" data-testid="octorate-client-secret-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Redirect URI Kilolava</label>
            <Input value={form.redirect_uri} onChange={e => setForm(f => ({ ...f, redirect_uri: e.target.value }))} placeholder={suggested} className="h-9 mt-1 font-mono text-xs" data-testid="octorate-redirect-uri-input" />
            <p className="text-xs text-muted-foreground mt-1">
              Suggerita: <button type="button" className="font-mono underline underline-offset-2" onClick={() => setForm(f => ({ ...f, redirect_uri: suggested }))}>{suggested}</button>
              <br />Deve essere whitelistata da Octorate per la vostra app (HTTPS obbligatorio).
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground" data-testid="save-octorate-app-btn">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salva
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TestResultDialog({ result, onClose }) {
  if (!result) return null;
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="test-result-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.ok
              ? <><CheckCircle2 className="h-5 w-5 text-emerald-500" />Connessione riuscita</>
              : <><XCircle className="h-5 w-5 text-red-500" />Connessione fallita</>}
          </DialogTitle>
          <DialogDescription>{result.connection_name} — {result.mode}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {(result.checks || []).map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {c.ok
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                : <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
              </div>
            </div>
          ))}
          {result.properties_found !== undefined && (
            <p className="text-sm"><span className="text-muted-foreground">Strutture/listing trovati:</span> <span className="font-semibold">{result.properties_found}</span></p>
          )}
          {result.reservations_readable !== undefined && (
            <p className="text-sm"><span className="text-muted-foreground">Prenotazioni leggibili:</span> <span className="font-semibold">{result.reservations_readable}</span></p>
          )}
          {result.last_reservation_date && (
            <p className="text-sm"><span className="text-muted-foreground">Ultima prenotazione disponibile:</span> <span className="font-semibold">{result.last_reservation_date}</span></p>
          )}
          {(result.missing || []).length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold mb-1">Cosa manca:</p>
              <ul className="list-disc pl-4 space-y-0.5">{result.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          {result.error && !result.ok && (
            <p className="text-xs text-red-600 dark:text-red-400" data-testid="test-error-detail">{result.error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReservationsTab({ connections, structures }) {
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ provider: 'all', connection_id: 'all', structure_id: 'all', status: 'all', date_from: '', date_to: '' });

  useEffect(() => {
    const params = {};
    if (filters.provider !== 'all') params.provider = filters.provider;
    if (filters.connection_id !== 'all') params.connection_id = filters.connection_id;
    if (filters.structure_id !== 'all') params.structure_id = filters.structure_id;
    if (filters.status !== 'all') params.status = filters.status;
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    integrationsApi.reservations(params).then(r => setRows(r.data)).catch(() => setRows([]));
  }, [filters]);

  const set = (k) => (v) => setFilters(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4" data-testid="imported-reservations-tab">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filters.provider} onValueChange={set('provider')}>
          <SelectTrigger className="h-9 w-40 text-xs" data-testid="filter-provider"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i provider</SelectItem>
            {Object.entries(PROVIDER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.connection_id} onValueChange={set('connection_id')}>
          <SelectTrigger className="h-9 w-44 text-xs" data-testid="filter-connection"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli account</SelectItem>
            {connections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.structure_id} onValueChange={set('structure_id')}>
          <SelectTrigger className="h-9 w-52 text-xs" data-testid="filter-structure"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le strutture</SelectItem>
            {structures.map(s => <SelectItem key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={set('status')}>
          <SelectTrigger className="h-9 w-36 text-xs" data-testid="filter-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(RES_STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={filters.date_from} onChange={e => set('date_from')(e.target.value)} className="h-9 w-36 text-xs" data-testid="filter-date-from" />
        <Input type="date" value={filters.date_to} onChange={e => set('date_to')(e.target.value)} className="h-9 w-36 text-xs" data-testid="filter-date-to" />
      </div>

      {rows === null ? (
        <p className="text-center py-12 text-muted-foreground">Caricamento...</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl" data-testid="reservations-empty">
          <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nessuna prenotazione importata. Collega un account, mappa le strutture ed esegui "Sincronizza ora".</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block border border-border rounded-xl bg-card">
            <table className="w-full text-sm border-separate border-spacing-0" data-testid="reservations-table">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  {['Check-in', 'Check-out', 'Struttura', 'Provider', 'External ID', 'Stato', 'Ultimo aggiornamento'].map((h, i) => (
                    <th key={h} className={cn('sticky top-0 z-10 bg-card border-b border-border font-medium py-2.5 px-3', i === 0 && 'rounded-tl-xl', i === 6 && 'rounded-tr-xl')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-border/60 [&>tr:last-child>td]:border-0">
                {rows.map(r => {
                  const sm = RES_STATUS_META[r.status] || RES_STATUS_META.unknown;
                  return (
                    <tr key={`${r.connection_id}-${r.external_id}`} data-testid={`reservation-row-${r.external_id}`}>
                      <td className="py-2.5 px-3 font-medium tabular-nums">{fmtDate(r.check_in)}</td>
                      <td className="py-2.5 px-3 font-medium tabular-nums">{fmtDate(r.check_out)}</td>
                      <td className="py-2.5 px-3">
                        {r.klv_code && <span className="font-mono text-xs text-primary font-bold mr-1.5">{r.klv_code}</span>}
                        {r.structure_name || <span className="text-muted-foreground">non mappata</span>}
                      </td>
                      <td className="py-2.5 px-3 text-xs">{PROVIDER_LABELS[r.provider] || r.provider}<span className="text-muted-foreground"> · {r.connection_name}</span></td>
                      <td className="py-2.5 px-3 font-mono text-xs">{r.external_id}</td>
                      <td className="py-2.5 px-3"><Badge className={cn('text-xs border-0', sm.cls)}>{sm.label}</Badge></td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">{fmtDateTime(r.last_synced_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-2">
            {rows.map(r => {
              const sm = RES_STATUS_META[r.status] || RES_STATUS_META.unknown;
              return (
                <div key={`${r.connection_id}-${r.external_id}`} className="p-3.5 rounded-xl border border-border bg-card space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-sm tabular-nums">{fmtDate(r.check_in)} → {fmtDate(r.check_out)}</p>
                    <Badge className={cn('text-xs border-0', sm.cls)}>{sm.label}</Badge>
                  </div>
                  <p className="text-xs">
                    {r.klv_code && <span className="font-mono text-primary font-bold mr-1">{r.klv_code}</span>}
                    {r.structure_name || 'non mappata'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {PROVIDER_LABELS[r.provider] || r.provider} · {r.connection_name} · <span className="font-mono">{r.external_id}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
