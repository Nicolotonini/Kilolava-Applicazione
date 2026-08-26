import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, ClipboardCheck, PackagePlus, Send, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { DetailSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { MovementDialog } from './MovementDialog';
import { MovementsTable } from './MovimentiPage';
import { AnomaliaDialog } from './AnomaliaDialog';
import { ZAINO_STATUS_META, fmtDT } from './shared';

export default function ZainoDetailPage() {
  const { zainoId } = useParams();
  const [z, setZ] = useState(null);
  const [kits, setKits] = useState([]);
  const [cleaners, setCleaners] = useState([]);
  const [movOpen, setMovOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [reintOpen, setReintOpen] = useState(false);
  const [anomOpen, setAnomOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/magazzino/zaini/${zainoId}`).then(r => setZ(r.data)).catch(() => {});
  }, [zainoId]);
  useEffect(() => {
    load();
    api.get('/magazzino/kits', { params: { domain: 'pulizie' } }).then(r => setKits(r.data)).catch(() => {});
    api.get('/cleaning-tasks/cleaners').then(r => setCleaners(r.data)).catch(() => {});
  }, [load]);

  if (!z) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;

  const update = async (payload, okMsg) => {
    try {
      const r = await api.put(`/magazzino/zaini/${zainoId}`, payload);
      setZ(r.data);
      if (okMsg) toast.success(okMsg);
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const createRequest = async () => {
    try {
      await api.post('/magazzino/fabbisogni', {
        kind: 'zaino', zaino_id: zainoId,
        items: z.missing_items.map(m => ({ product_id: m.product_id, name: m.name, qty: m.missing })),
        note: `Reintegro zaino ${z.code}`,
      });
      toast.success('Richiesta di reintegro creata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const kit = kits.find(k => k.id === z.kit_id);
  const kitUnconfigured = kit && (kit.items || []).length === 0;

  return (
    <div className="p-4 lg:p-6 space-y-6" data-testid="zaino-detail-page">
      <DetailHeader backTo="/magazzino/zaini" backLabel="Zaini Operativi"
        title={<span><span className="font-mono text-primary">{z.code}</span>{z.name ? ` — ${z.name}` : ''}</span>}
        meta={<span>Ultimo controllo: {fmtDT(z.last_check_at)}</span>}
        badges={<StatusBadge tone={ZAINO_STATUS_META[z.status]?.tone} testId="zaino-status-badge">{ZAINO_STATUS_META[z.status]?.label || z.status}</StatusBadge>}
        actions={<>
          <Button variant="outline" onClick={() => setAnomOpen(true)} data-testid="zaino-anomalia-btn">
            <AlertTriangle className="h-4 w-4 mr-1.5" />Anomalia
          </Button>
          <Button variant="outline" onClick={() => setMovOpen(true)} data-testid="zaino-movement-btn">
            <Plus className="h-4 w-4 mr-1.5" />Movimento
          </Button>
          <Button onClick={() => setCheckOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="zaino-check-btn">
            <ClipboardCheck className="h-4 w-4 mr-1.5" />Controllo zaino
          </Button>
        </>} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DetailSection title="Dotazione" testId="section-dotazione"
            actions={z.missing_items.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={createRequest} data-testid="zaino-request-btn">
                  <Send className="h-3 w-3 mr-1" />Crea richiesta
                </Button>
                <Button size="sm" className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setReintOpen(true)} data-testid="zaino-reintegro-btn">
                  <PackagePlus className="h-3 w-3 mr-1" />Reintegra ora
                </Button>
              </div>
            )}>
            {kitUnconfigured && (
              <p className="text-sm text-amber-600 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-2.5" data-testid="kit-unconfigured-warning">
                Kit non configurato: definisci la composizione di "{kit.name}" in Sistema → Cataloghi &amp; Kit per calcolare la dotazione prevista.
              </p>
            )}
            {z.dotation.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-4 py-3">
                Nessuna dotazione prevista. Collega un Kit o registra un movimento verso lo zaino.
              </p>
            ) : (
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Articolo</th>
                      <th className="px-3 py-2">Prevista</th>
                      <th className="px-3 py-2">Presente</th>
                      <th className="px-3 py-2">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {z.dotation.map(d => (
                      <tr key={d.product_id} className="border-t border-border" data-testid={`dotation-${d.product_id}`}>
                        <td className="px-3 py-2 font-medium">{d.name}{d.extra && <span className="ml-1.5 text-xs text-muted-foreground">(extra)</span>}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{d.qty ?? '—'}</td>
                        <td className={cn('px-3 py-2 tabular-nums font-semibold', d.missing > 0 && 'text-amber-600')}>{d.present}</td>
                        <td className="px-3 py-2">
                          {d.missing > 0 ? <StatusBadge tone="waiting">Mancano {d.missing}</StatusBadge>
                            : d.extra ? <StatusBadge tone="neutral">Extra</StatusBadge>
                              : <StatusBadge tone="success">Ok</StatusBadge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>

          <DetailSection title="Movimenti dello zaino" testId="section-movimenti">
            <MovementsTable items={z.movements} compact />
          </DetailSection>
        </div>

        <div className="space-y-6">
          <DetailSection title="Assegnazione" testId="section-assegnazione">
            <div className="rounded-xl border border-border p-3 space-y-2">
              <select value={z.assigned_to || ''} onChange={e => update({ assigned_to: e.target.value }, e.target.value ? 'Zaino assegnato' : 'Assegnazione rimossa')}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="zaino-assign-select">
                <option value="">Non assegnato</option>
                {cleaners.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {z.assigned_at && <p className="text-xs text-muted-foreground">Assegnato dal {fmtDT(z.assigned_at)}</p>}
            </div>
          </DetailSection>

          <DetailSection title="Kit di riferimento" testId="section-kit">
            <div className="rounded-xl border border-border p-3 space-y-1.5">
              <select value={z.kit_id || ''} onChange={e => update({ kit_id: e.target.value }, 'Kit aggiornato')}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="zaino-kit-select">
                <option value="">Nessun kit</option>
                {kits.map(k => <option key={k.id} value={k.id}>{k.name}{(k.items || []).length === 0 ? ' (non configurato)' : ''}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">La dotazione prevista deriva dal Kit selezionato.</p>
            </div>
          </DetailSection>

          <DetailSection title="Stato" testId="section-stato">
            <div className="rounded-xl border border-border p-3">
              <select value={z.status} onChange={e => update({ status: e.target.value }, 'Stato aggiornato')}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="zaino-status-select">
                {Object.entries(ZAINO_STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            </div>
          </DetailSection>

          {(z.assignment_history || []).length > 0 && (
            <DetailSection title="Storico assegnazioni" testId="section-storico">
              <div className="rounded-xl border border-border divide-y divide-border/60">
                {[...z.assignment_history].reverse().map((h, i) => (
                  <div key={i} className="px-3 py-2 text-sm">
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{fmtDT(h.from)} → {h.to ? fmtDT(h.to) : 'in corso'}</p>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
        </div>
      </div>

      {movOpen && <MovementDialog defaultDomain="pulizie" lockDomain defaultType="trasferimento"
        defaultOrigin={{ type: 'central', id: null }} defaultDestination={{ type: 'zaino', id: zainoId }}
        onClose={() => setMovOpen(false)} onDone={() => { setMovOpen(false); load(); }} />}
      {checkOpen && <CheckDialog zaino={z} onClose={() => setCheckOpen(false)} onDone={() => { setCheckOpen(false); load(); }} />}
      {reintOpen && <ReintegroDialog zaino={z} onClose={() => setReintOpen(false)} onDone={() => { setReintOpen(false); load(); }} />}
      {anomOpen && <AnomaliaDialog contextLabel={`Zaino ${z.code}`} defaultTitle="" onClose={() => setAnomOpen(false)} />}
    </div>
  );
}

function CheckDialog({ zaino, onClose, onDone }) {
  const [counts, setCounts] = useState(zaino.dotation.map(d => ({ product_id: d.product_id, name: d.name, system: d.present, counted: d.present })));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/magazzino/zaini/${zaino.id}/check`, {
        counts: counts.map(c => ({ product_id: c.product_id, counted: Number(c.counted) })),
      });
      toast.success(r.data.adjustments > 0
        ? `Controllo registrato: ${r.data.adjustments} rettifiche`
        : 'Controllo registrato: tutto conforme');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="zaino-check-dialog">
        <DialogHeader>
          <DialogTitle>Controllo zaino — {zaino.code}</DialogTitle>
          <DialogDescription>Conta gli articoli presenti: le differenze generano movimenti di rettifica.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {counts.map((c, i) => (
            <div key={c.product_id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground w-16 text-right">sistema {c.system}</span>
              <Input type="number" min="0" value={c.counted} className="w-20 h-8 text-sm"
                onChange={e => setCounts(cs => cs.map((x, j) => j === i ? { ...x, counted: e.target.value } : x))}
                data-testid={`check-count-${c.product_id}`} />
            </div>
          ))}
          {counts.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Nessuna dotazione da controllare.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving || counts.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="check-save-btn">
              {saving ? 'Salvataggio...' : 'Conferma controllo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReintegroDialog({ zaino, onClose, onDone }) {
  const [items, setItems] = useState(zaino.missing_items.map(m => ({ product_id: m.product_id, name: m.name, qty: m.missing })));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/magazzino/zaini/${zaino.id}/reintegro`, {
        items: items.map(i => ({ product_id: i.product_id, qty: Number(i.qty) })),
      });
      toast.success(`Reintegro registrato: ${r.data.movements} trasferimenti dal Magazzino Pulizie`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="zaino-reintegro-dialog">
        <DialogHeader>
          <DialogTitle>Reintegra zaino — {zaino.code}</DialogTitle>
          <DialogDescription>Trasferimento interno dal Magazzino Pulizie allo zaino (movimenti tracciati).</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={it.product_id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0 truncate">{it.name}</span>
              <Input type="number" min="0" value={it.qty} className="w-20 h-8 text-sm"
                onChange={e => setItems(xs => xs.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                data-testid={`reint-qty-${it.product_id}`} />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving || items.length === 0} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="reint-save-btn">
              {saving ? 'Salvataggio...' : 'Conferma reintegro'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
