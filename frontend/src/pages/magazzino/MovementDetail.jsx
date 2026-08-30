import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { RotateCw, Truck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../../components/kilolava/badges';
import { movTypeLabel, isStornoType, locLabel, fmtDT, STORNO_MOTIVI, STORNO_MOTIVO_LABELS, DOMAIN_LABELS } from './shared';

const Row = ({ label, children, testId }) => (
  <div className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-border/50 last:border-0" data-testid={testId}>
    <span className="text-muted-foreground shrink-0">{label}</span>
    <span className="text-right font-medium min-w-0">{children}</span>
  </div>
);

const ArticleLabel = ({ code, name }) => (
  <>
    {code && <span className="font-mono text-xs font-bold text-primary mr-1.5">{code}</span>}
    {name}
  </>
);

export function MovementDetailDialog({ movementId, onClose, onOpenMovement, onStorno }) {
  const [m, setM] = useState(null);

  useEffect(() => {
    setM(null);
    api.get(`/magazzino/movimenti/${movementId}`).then(r => setM(r.data)).catch(() => {
      toast.error('Movimento non trovato');
      onClose();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementId]);

  if (!m) return null;
  const storno = isStornoType(m.movement_type);
  const canStorno = !storno && !m.reversed_by;

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="movement-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-primary" data-testid="detail-mov-code">{m.code || 'Movimento'}</span>
            <StatusBadge tone={storno ? 'violet' : 'neutral'}>{movTypeLabel(m.movement_type)}</StatusBadge>
            {m.reversed_by && <StatusBadge tone="danger" testId="detail-stornato-badge">Stornato</StatusBadge>}
          </DialogTitle>
          <DialogDescription>La cronologia inventario è immutabile: le correzioni avvengono per storno.</DialogDescription>
        </DialogHeader>
        <div>
          <Row label="Articolo" testId="detail-article"><ArticleLabel code={m.product_code} name={m.product_name} /></Row>
          <Row label="Quantità" testId="detail-qty">{m.qty}</Row>
          <Row label="Magazzino">{DOMAIN_LABELS[m.domain] || m.domain}</Row>
          <Row label="Origine → Destinazione" testId="detail-locations">{locLabel(m.origin)} → {locLabel(m.destination)}</Row>
          <Row label="Data/Ora">{fmtDT(m.at)}</Row>
          <Row label="Utente" testId="detail-user">{m.user_name || '—'}</Row>
          {m.note && <Row label="Nota">{m.note}</Row>}
          {m.motivo && <Row label="Motivo storno" testId="detail-motivo">{STORNO_MOTIVO_LABELS[m.motivo] || m.motivo}{m.motivo_nota ? ` — ${m.motivo_nota}` : ''}</Row>}
          {m.reversed_by && <Row label="Stornato da" testId="detail-stornato-da">{m.stornato_by || '—'} · {fmtDT(m.stornato_at)}</Row>}
        </div>
        {m.delivery_id && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2" data-testid="detail-delivery-note">
            <Truck className="h-3.5 w-3.5 shrink-0" />
            Movimento collegato a una Consegna: eventuali documenti già emessi non vengono modificati.
          </div>
        )}
        {m.reversed_by && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900 px-3 py-2.5 text-sm space-y-1.5" data-testid="detail-gia-stornato">
            <p className="font-semibold text-red-700 dark:text-red-400">Movimento già stornato</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenMovement(m.reversed_by)} data-testid="open-reversal-btn">
              Apri movimento di storno{m.reversal_movement?.code ? ` (${m.reversal_movement.code})` : ''}
            </Button>
          </div>
        )}
        {storno && m.reverses && (
          <div className="rounded-lg border border-border px-3 py-2.5 text-sm flex items-center gap-2" data-testid="detail-storno-di">
            <span className="text-muted-foreground">Storno di</span>
            <Button variant="outline" size="sm" className="h-7 text-xs font-mono font-bold" onClick={() => onOpenMovement(m.reverses)} data-testid="open-original-btn">
              {m.original_movement?.code || 'Movimento originale'}
            </Button>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="detail-close-btn">Chiudi</Button>
          {canStorno && onStorno && (
            <Button variant="outline" className="text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => onStorno(m)} data-testid="detail-storna-btn">
              <RotateCw className="h-4 w-4 mr-1.5" />Storna movimento
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StornoDialog({ movement, onClose, onDone }) {
  const m = movement;
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [stockError, setStockError] = useState(null);
  const [saving, setSaving] = useState(false);
  const needNota = motivo === 'altro';
  const canConfirm = motivo && (!needNota || nota.trim());

  const save = async () => {
    setSaving(true);
    setStockError(null);
    try {
      const r = await api.post(`/magazzino/movimenti/${m.id}/storno`, { motivo, nota: nota.trim() || null });
      onDone(r.data);
    } catch (e) {
      const d = e.response?.data?.detail;
      if (d && typeof d === 'object' && d.error === 'stock_insufficiente') setStockError(d);
      else toast.error(typeof d === 'object' ? (d.message || 'Errore') : (d || 'Errore'));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="storno-dialog">
        <DialogHeader>
          <DialogTitle>Storna movimento{m.code ? ` — ${m.code}` : ''}</DialogTitle>
          <DialogDescription>
            Il movimento originale NON viene modificato: verrà creato un nuovo movimento inverso collegato.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border px-3 py-1">
          <Row label="Articolo" testId="storno-article"><ArticleLabel code={m.product_code} name={m.product_name} /></Row>
          <Row label="Quantità" testId="storno-qty">{m.qty}</Row>
          <Row label="Origine → Destinazione">{locLabel(m.origin)} → {locLabel(m.destination)}</Row>
          <Row label="Data movimento">{fmtDT(m.at)}</Row>
          <Row label="Creato da">{m.user_name || '—'}</Row>
        </div>
        <p className="text-xs text-muted-foreground">
          Lo storno riporta {m.qty}× da {locLabel(m.destination)} a {locLabel(m.origin)}.
        </p>
        {m.delivery_id && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2" data-testid="storno-delivery-note">
            <Truck className="h-3.5 w-3.5 shrink-0" />
            Movimento collegato a una Consegna: la Consegna e i documenti già emessi non vengono modificati.
          </div>
        )}
        {stockError && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2.5 text-sm space-y-1" data-testid="storno-stock-warning">
            <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />Storno non eseguibile automaticamente
            </p>
            <p className="text-xs text-muted-foreground">La quantità disponibile nella location è inferiore alla quantità da stornare.</p>
            <p className="text-xs">
              <span className="text-muted-foreground">Disponibile in {stockError.location}:</span> <span className="font-semibold" data-testid="storno-available">{stockError.available}</span>
              <span className="text-muted-foreground ml-3">Da stornare:</span> <span className="font-semibold" data-testid="storno-required">{stockError.required}</span>
            </p>
            <p className="text-xs text-muted-foreground">Gestisci la situazione con una Rettifica inventario o un nuovo Movimento.</p>
          </div>
        )}
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Motivo dello storno *</Label>
            <select value={motivo} onChange={e => setMotivo(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="storno-motivo">
              <option value="">Seleziona motivo...</option>
              {STORNO_MOTIVI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Nota{needNota ? ' * (obbligatoria per Altro)' : ''}</Label>
            <Input value={nota} onChange={e => setNota(e.target.value)} placeholder="Dettagli aggiuntivi..." data-testid="storno-nota" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} data-testid="storno-cancel-btn">Annulla</Button>
            <Button onClick={save} disabled={saving || !canConfirm}
              className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="storno-confirm-btn">
              {saving ? 'Storno in corso...' : 'Conferma storno'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
