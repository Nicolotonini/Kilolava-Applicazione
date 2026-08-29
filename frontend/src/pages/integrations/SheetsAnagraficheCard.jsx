import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { sheetsAnagraficheApi } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import {
  FileSpreadsheet, ExternalLink, Loader2, CloudUpload, Eye, Unlink, Link2,
  AlertTriangle, CheckCircle2, ShieldCheck, History,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

const fmtDT = (v) => (v ? new Date(v).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

const ACTION_META = {
  create: { label: 'Nuovo', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  update: { label: 'Modifica', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  deactivate: { label: 'Disattivazione', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  missing: { label: 'Assente nel foglio', cls: 'bg-muted text-muted-foreground' },
};

export default function SheetsAnagraficheCard() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState(null);

  const reload = useCallback(() => {
    Promise.all([sheetsAnagraficheApi.status(), sheetsAnagraficheApi.history()])
      .then(([s, h]) => { setStatus(s.data); setHistory(h.data || []); })
      .catch(e => { if (e.response?.status === 403) setForbidden(true); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

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
      reload();
    }
  };

  const handleConnect = async () => {
    setBusy('connect');
    try {
      const res = await sheetsAnagraficheApi.connectUrl();
      window.location.assign(res.data.url);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Impossibile avviare il collegamento Google');
      setBusy('');
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Scollegare l\'account Google? Import e backup non funzioneranno finché non ricolleghi.')) return;
    await run('disconnect', () => sheetsAnagraficheApi.disconnect(), 'Account Google scollegato');
  };

  const handlePreview = async () => {
    const res = await run('preview', () => sheetsAnagraficheApi.preview());
    if (res) setPreview(res.data);
  };

  const handleBackup = async () => {
    const res = await run('backup', () => sheetsAnagraficheApi.backup());
    if (res) {
      const r = res.data;
      toast.success(`Backup completato: ${r.clienti} clienti, ${r.strutture} strutture, ${r.unita} unità, ${r.dipendenti} dipendenti`);
    }
  };

  if (loading) return <p className="text-center py-12 text-muted-foreground">Caricamento...</p>;
  if (forbidden) {
    return (
      <div className="text-center py-16 border border-dashed border-border rounded-xl" data-testid="sheets-forbidden">
        <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">Solo l'Admin può gestire le anagrafiche Google Sheets.</p>
      </div>
    );
  }

  const connected = status?.connected;

  return (
    <div className="space-y-4" data-testid="sheets-anagrafiche-card">
      <Card className="border shadow-none">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase tracking-wide">
                  Google Fogli
                </span>
                <h3 className="text-base font-semibold">Anagrafiche Kilolava</h3>
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', connected ? 'text-emerald-600' : 'text-muted-foreground')} data-testid="sheets-connection-status">
                  <span className={cn('w-2 h-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                  {connected ? 'Collegato' : 'Non collegato'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Kilolava è la fonte ufficiale. Import dal foglio con anteprima e conferma obbligatoria (mai cancellazioni automatiche); backup giornaliero alle 03:00 + manuale. Nessun dato riservato nei fogli.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {connected ? (
                <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={!!busy} data-testid="sheets-disconnect-btn">
                  {busy === 'disconnect' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Unlink className="h-4 w-4 mr-1.5" />}Scollega
                </Button>
              ) : (
                <Button size="sm" onClick={handleConnect} disabled={!!busy || !status?.configured}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="sheets-connect-btn">
                  {busy === 'connect' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Link2 className="h-4 w-4 mr-1.5" />}Connetti Google
                </Button>
              )}
            </div>
          </div>

          {!status?.configured && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2" data-testid="sheets-not-configured">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Credenziali OAuth o ID dei fogli non configurati nel backend.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {status?.import_url && (
              <a href={status.import_url} target="_blank" rel="noreferrer" data-testid="sheets-open-import-link"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <FileSpreadsheet className="h-4 w-4" />Foglio Import<ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {status?.backup_url && (
              <a href={status.backup_url} target="_blank" rel="noreferrer" data-testid="sheets-open-backup-link"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <FileSpreadsheet className="h-4 w-4" />Foglio Backup<ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60 pt-3">
            <Button variant="outline" size="sm" onClick={() => run('setup', () => sheetsAnagraficheApi.setupImport(), 'Foglio import preparato: 4 tab con intestazioni')}
              disabled={!connected || !!busy} data-testid="sheets-setup-btn">
              {busy === 'setup' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />}Prepara foglio import
            </Button>
            <Button size="sm" onClick={handlePreview} disabled={!connected || !!busy}
              className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="sheets-preview-btn">
              {busy === 'preview' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />}Anteprima import
            </Button>
            <Button variant="outline" size="sm" onClick={handleBackup} disabled={!connected || !!busy} data-testid="sheets-backup-btn">
              {busy === 'backup' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CloudUpload className="h-4 w-4 mr-1.5" />}Backup ora
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-muted/50 px-3 py-2" data-testid="sheets-last-import">
              <p className="text-xs text-muted-foreground font-medium">Ultimo import</p>
              {status?.last_import ? (
                <p>{fmtDT(status.last_import.at)} — {status.last_import.user_name} · {status.last_import.creati ?? 0} creati, {status.last_import.modificati ?? 0} modificati</p>
              ) : <p className="text-muted-foreground">Mai eseguito</p>}
            </div>
            <div className="rounded-lg bg-muted/50 px-3 py-2" data-testid="sheets-last-backup">
              <p className="text-xs text-muted-foreground font-medium">Ultimo backup</p>
              {status?.last_backup ? (
                <p>{fmtDT(status.last_backup.at)} — {status.last_backup.user_name} · {status.last_backup.clienti ?? 0} clienti, {status.last_backup.strutture ?? 0} strutture</p>
              ) : <p className="text-muted-foreground">Mai eseguito</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card className="border shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">Storico operazioni</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="sheets-history-table">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 pr-3 font-medium">Tipo</th>
                    <th className="py-2 pr-3 font-medium">Utente</th>
                    <th className="py-2 pr-3 font-medium">Dettagli</th>
                    <th className="py-2 font-medium">Esito</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDT(h.at)}</td>
                      <td className="py-2 pr-3">
                        <span className={cn('px-2 py-0.5 rounded-md text-xs font-semibold',
                          h.type === 'import' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' : 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400')}>
                          {h.type === 'import' ? 'Import' : 'Backup'}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{h.user_name || '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {h.type === 'import'
                          ? `${h.creati ?? 0} creati · ${h.modificati ?? 0} modificati · ${h.disattivati ?? 0} disattivati · ${h.saltati ?? 0} saltati`
                          : h.esito === 'success' ? `${h.clienti ?? 0} clienti · ${h.strutture ?? 0} strutture · ${h.unita ?? 0} unità · ${h.dipendenti ?? 0} dipendenti` : '—'}
                      </td>
                      <td className="py-2">
                        {h.esito === 'success'
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          : <AlertTriangle className="h-4 w-4 text-red-500" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <PreviewDialog
        preview={preview}
        onClose={async (cancel) => {
          if (cancel && preview?.id) {
            try { await sheetsAnagraficheApi.cancelPreview(preview.id); } catch (e) { /* già scaduta */ }
          }
          setPreview(null);
        }}
        onApplied={() => { setPreview(null); reload(); }}
      />
    </div>
  );
}

function PreviewDialog({ preview, onClose, onApplied }) {
  const [decisions, setDecisions] = useState({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!preview) { setDecisions({}); return; }
    const d = {};
    (preview.items || []).forEach(i => {
      if (['create', 'update', 'deactivate'].includes(i.action)) d[i.key] = { apply: true, fields: {} };
    });
    setDecisions(d);
  }, [preview]);

  const actionable = useMemo(() => (preview?.items || []).filter(i => ['create', 'update', 'deactivate'].includes(i.action)), [preview]);
  const missing = useMemo(() => (preview?.items || []).filter(i => i.action === 'missing'), [preview]);
  const selectedCount = actionable.filter(i => decisions[i.key]?.apply !== false).length;

  const toggleItem = (key, val) => setDecisions(p => ({ ...p, [key]: { ...(p[key] || { fields: {} }), apply: val } }));
  const setFieldChoice = (key, field, choice) => setDecisions(p => ({
    ...p, [key]: { ...(p[key] || { apply: true }), fields: { ...(p[key]?.fields || {}), [field]: choice } },
  }));

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await sheetsAnagraficheApi.applyImport({ preview_id: preview.id, decisions });
      const s = res.data.stats;
      toast.success(`Import completato: ${s.creati} creati, ${s.modificati} modificati, ${s.disattivati} disattivati, ${s.saltati} saltati`);
      onApplied();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore durante l\'import');
    } finally {
      setApplying(false);
    }
  };

  if (!preview) return null;
  const sum = preview.summary || {};
  const chips = [
    { label: 'Nuovi', val: Object.values(sum.nuovi || {}).reduce((a, b) => a + b, 0), cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    { label: 'Modificati', val: Object.values(sum.modificati || {}).reduce((a, b) => a + b, 0), cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    { label: 'Invariati', val: sum.invariati || 0, cls: 'bg-muted text-muted-foreground' },
    { label: 'Disattivazioni', val: sum.disattivazioni || 0, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    { label: 'Conflitti', val: sum.conflitti || 0, cls: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400' },
    { label: 'Errori', val: sum.errori || 0, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  ];

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !applying) onClose(true); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col" data-testid="sheets-preview-dialog">
        <DialogHeader>
          <DialogTitle>Anteprima import anagrafiche</DialogTitle>
          <DialogDescription>
            Nessuna modifica è stata applicata. Controlla e conferma: le righe sparite dal foglio NON vengono mai eliminate da Kilolava.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2" data-testid="sheets-preview-summary">
          {chips.map(c => (
            <span key={c.label} className={cn('px-2.5 py-1 rounded-md text-xs font-semibold', c.cls)}>
              {c.label}: {c.val}
            </span>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 -mr-1">
          {(preview.errors || []).length > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 p-3 space-y-1" data-testid="sheets-preview-errors">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />Errori bloccanti ({preview.errors.length}) — queste righe non verranno importate
              </p>
              {preview.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 dark:text-red-400">
                  {e.tab} · riga {e.row}: {e.msg}
                </p>
              ))}
            </div>
          )}

          {actionable.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground" data-testid="sheets-preview-empty">
              <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-500 mb-2" />
              Nessuna modifica da applicare: le anagrafiche sono già allineate al foglio.
            </div>
          )}

          {actionable.map(item => {
            const dec = decisions[item.key] || { apply: true, fields: {} };
            const meta = ACTION_META[item.action];
            return (
              <div key={item.key}
                className={cn('rounded-lg border border-border p-3 space-y-2 transition-opacity', dec.apply === false && 'opacity-50')}
                data-testid={`sheets-preview-item-${item.key.replace(':', '-')}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Checkbox
                    checked={dec.apply !== false}
                    onCheckedChange={(v) => toggleItem(item.key, !!v)}
                    data-testid={`sheets-item-check-${item.key.replace(':', '-')}`}
                  />
                  <span className={cn('px-2 py-0.5 rounded-md text-xs font-semibold', meta.cls)}>{meta.label}</span>
                  <span className="text-xs font-bold text-muted-foreground">{item.entity}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.row && <span className="text-xs text-muted-foreground">riga {item.row}</span>}
                </div>
                {(item.warnings || []).map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{w}</p>
                ))}
                {(item.changes || []).length > 0 && (
                  <div className="space-y-1.5 pl-6">
                    {item.changes.map(c => (
                      <div key={c.field} className="text-xs">
                        <span className="font-medium">{c.label}:</span>{' '}
                        <span className="text-muted-foreground line-through">{c.old || '—'}</span>
                        {' → '}
                        <span className="font-semibold">{c.new || '—'}</span>
                        {c.conflict && (
                          <span className="ml-2 inline-flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400 font-semibold">Conflitto</span>
                            <button type="button"
                              onClick={() => setFieldChoice(item.key, c.field, 'sheet')}
                              className={cn('px-1.5 py-0.5 rounded border text-xs',
                                (dec.fields?.[c.field] || 'sheet') === 'sheet' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}
                              data-testid={`sheets-conflict-sheet-${item.key.replace(':', '-')}-${c.field}`}>
                              Usa foglio
                            </button>
                            <button type="button"
                              onClick={() => setFieldChoice(item.key, c.field, 'kilolava')}
                              className={cn('px-1.5 py-0.5 rounded border text-xs',
                                dec.fields?.[c.field] === 'kilolava' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}
                              data-testid={`sheets-conflict-kilolava-${item.key.replace(':', '-')}-${c.field}`}>
                              Mantieni Kilolava
                            </button>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {missing.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1" data-testid="sheets-preview-missing">
              <p className="text-xs font-semibold text-muted-foreground">Record non più presenti nel foglio (NON verranno eliminati)</p>
              {missing.map(m => (
                <p key={m.key} className="text-xs text-muted-foreground">{m.entity} · {m.code}</p>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onClose(true)} disabled={applying} data-testid="sheets-cancel-preview-btn">
            Annulla
          </Button>
          <Button onClick={handleApply} disabled={applying || selectedCount === 0}
            className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="sheets-apply-btn">
            {applying && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Applica import ({selectedCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
