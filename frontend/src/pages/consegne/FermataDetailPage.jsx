import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { fileUrl } from '../../lib/api';
import { DetailHeader, DetailSection } from '../../components/kilolava/PageHeader';
import { DetailSkeleton, EmptyState } from '../../components/kilolava/EmptyState';
import { StatusBadge, PriorityBadge } from '../../components/kilolava/badges';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Play, Check, AlertTriangle, Ban, MapPin, Clock, Truck, Camera, X, ArrowLeftRight } from 'lucide-react';
import { FERMATA_STATUS, KIND_TONES, fmtDay, fmtDateTime, itemsSummary } from './shared';

function CompletaDialog({ open, onClose, fermata, onDone }) {
  const [note, setNote] = useState('');
  const [qtys, setQtys] = useState({});
  const [saving, setSaving] = useState(false);

  const stockItems = [];
  (fermata?.lines || []).forEach((l) => {
    if (l.category === 'lavanderia_privata') return;
    (l.items || []).forEach((it) => {
      if (it.product_id) stockItems.push({ richiesta_id: l.richiesta_id, ...it });
    });
  });

  useEffect(() => {
    if (open) {
      setNote('');
      const q = {};
      stockItems.forEach((it) => { q[`${it.richiesta_id}|${it.product_id}`] = it.qty; });
      setQtys(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    setSaving(true);
    try {
      const effective_items = stockItems.map((it) => ({
        richiesta_id: it.richiesta_id, product_id: it.product_id,
        qty: parseInt(qtys[`${it.richiesta_id}|${it.product_id}`]) ?? it.qty,
      }));
      const res = await api.post(`/consegne/fermate/${fermata.id}/completa`, {
        note: note || null,
        effective_items: effective_items.length ? effective_items : null,
      });
      toast.success(`Fermata completata — ${res.data.movements} movimenti stock generati`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="completa-dialog">
        <DialogHeader><DialogTitle>Completa fermata</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {stockItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Quantità effettivamente consegnate</Label>
              {stockItems.map((it) => (
                <div key={`${it.richiesta_id}|${it.product_id}`} className="flex items-center gap-2">
                  <span className="text-sm flex-1 min-w-0 truncate">{it.name}</span>
                  <Input
                    type="number" min={0}
                    value={qtys[`${it.richiesta_id}|${it.product_id}`] ?? it.qty}
                    onChange={(e) => setQtys((p) => ({ ...p, [`${it.richiesta_id}|${it.product_id}`]: e.target.value }))}
                    className="w-20 h-8"
                    data-testid={`eff-qty-${it.product_id}`}
                  />
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Nota (facoltativa)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none" data-testid="completa-note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="completa-submit">
            {saving ? '...' : 'Completa e genera movimenti'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FermataDetailPage() {
  const { fermataId } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState([]);
  const [completaOpen, setCompletaOpen] = useState(false);
  const [problemaOpen, setProblemaOpen] = useState(false);
  const [problemNote, setProblemNote] = useState('');
  const [annullaOpen, setAnnullaOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/consegne/fermate/${fermataId}`)
      .then((r) => setF(r.data))
      .catch(() => setF(null))
      .finally(() => setLoading(false));
  }, [fermataId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/logistics/riders').then((r) => setRiders(r.data)).catch(() => {}); }, []);

  if (loading) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;
  if (!f) return <div className="p-4 lg:p-6"><EmptyState icon={Truck} message="Fermata non trovata" /></div>;

  const st = FERMATA_STATUS[f.status] || FERMATA_STATUS.unassigned;
  const editable = !['completed', 'cancelled'].includes(f.status);

  const assignRider = async (riderId) => {
    try {
      await api.put(`/consegne/fermate/${f.id}`, { rider_id: riderId || null });
      toast.success(riderId ? 'Rider assegnato' : 'Assegnazione rimossa');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const start = async () => {
    try { await api.put(`/consegne/fermate/${f.id}/start`); toast.success('Fermata avviata'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const problema = async () => {
    if (!problemNote.trim()) { toast.error('Descrivi il problema'); return; }
    try {
      await api.put(`/consegne/fermate/${f.id}/problema`, { note: problemNote });
      toast.success('Problema registrato');
      setProblemaOpen(false); setProblemNote('');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const annulla = async () => {
    try {
      await api.put(`/consegne/fermate/${f.id}`, { status: 'cancelled' });
      toast.success('Fermata annullata — le richieste tornano in Da organizzare');
      setAnnullaOpen(false);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const rimuoviRichiesta = async (rid) => {
    try {
      await api.delete(`/consegne/fermate/${f.id}/richieste/${rid}`);
      toast.success('Richiesta rimossa dalla fermata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl" data-testid="fermata-detail-page">
      <DetailHeader
        backTo="/consegne"
        backLabel="Consegne"
        title={f.destination}
        meta={
          <>
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{f.address || 'Indirizzo non indicato'}</span>
            <span>·</span>
            <span>{fmtDay(f.date)}</span>
            {f.time_window_start && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{f.time_window_start}{f.time_window_end ? `–${f.time_window_end}` : ''}</span>}
          </>
        }
        badges={
          <>
            <StatusBadge tone={st.tone} testId="fermata-status-badge">{st.label}</StatusBadge>
            <PriorityBadge priority={f.priority || 'normal'} />
            {f.klv_code && <span className="text-xs font-mono text-muted-foreground">{f.klv_code}</span>}
          </>
        }
        actions={
          editable && (
            <>
              {f.status !== 'in_progress' && (
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={start} data-testid="fermata-start-btn">
                  <Play className="h-4 w-4" />Avvia
                </Button>
              )}
              <Button size="sm" className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCompletaOpen(true)} data-testid="fermata-completa-btn">
                <Check className="h-4 w-4" />Completa
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-red-600 border-red-200" onClick={() => setProblemaOpen(true)} data-testid="fermata-problema-btn">
                <AlertTriangle className="h-4 w-4" />Problema
              </Button>
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => setAnnullaOpen(true)} data-testid="fermata-annulla-btn">
                <Ban className="h-4 w-4" />Annulla
              </Button>
            </>
          )
        }
        testId="fermata-detail-header"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <DetailSection title="Contenuto fermata" testId="fermata-lines-section">
            {(f.lines || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna riga</p>
            ) : (
              <div className="space-y-2">
                {f.lines.map((l, i) => (
                  <Card key={i} className="border shadow-none" data-testid={`fermata-line-${i}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge tone={KIND_TONES[l.category] || 'cancelled'}>{l.category_label}</StatusBadge>
                        {editable && l.richiesta_id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => rimuoviRichiesta(l.richiesta_id)} title="Rimuovi dalla fermata" data-testid={`line-remove-${l.richiesta_id}`}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm mt-1.5">{itemsSummary(l.items) || '—'}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="Movimenti stock generati" testId="fermata-movements-section">
            {(f.movements || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun movimento — verranno generati al completamento della fermata</p>
            ) : (
              <div className="rounded-lg border border-border divide-y divide-border/60">
                {f.movements.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm" data-testid={`movement-row-${m.id}`}>
                    <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{m.product_name || m.product?.name} × {m.qty}</span>
                    <span className="text-xs text-muted-foreground">{(m.origin?.label || '')} → {(m.destination?.label || '')}</span>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          {f.problem_notes && (
            <DetailSection title="Problema segnalato">
              <p className="text-sm bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg p-3" data-testid="fermata-problem-notes">{f.problem_notes}</p>
            </DetailSection>
          )}
          {f.completion_notes && (
            <DetailSection title="Nota di completamento">
              <p className="text-sm bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3" data-testid="fermata-completion-notes">{f.completion_notes}</p>
            </DetailSection>
          )}
          {f.confirmation_photo && (
            <DetailSection title="Foto di conferma">
              <img src={fileUrl(f.confirmation_photo)} alt="Conferma consegna" className="h-40 rounded-lg border border-border object-cover" data-testid="fermata-confirmation-photo" />
            </DetailSection>
          )}
        </div>

        <div className="space-y-5">
          <DetailSection title="Rider" testId="fermata-rider-section">
            <Select value={f.rider_id || 'none'} onValueChange={(v) => assignRider(v === 'none' ? '' : v)} disabled={!editable}>
              <SelectTrigger data-testid="fermata-rider-assign"><SelectValue placeholder="Non assegnata" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assegnata</SelectItem>
                {riders.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </DetailSection>

          <DetailSection title="Cronologia">
            <div className="text-xs text-muted-foreground space-y-1" data-testid="fermata-timeline">
              <p>Creata: {fmtDateTime(f.created_at)}</p>
              {f.started_at && <p>Avviata: {fmtDateTime(f.started_at)}</p>}
              {f.completed_at && <p className="text-emerald-600 font-medium">Completata: {fmtDateTime(f.completed_at)}{f.rider_name ? ` — ${f.rider_name}` : ''}</p>}
              {f.cancelled_at && <p>Annullata: {fmtDateTime(f.cancelled_at)}</p>}
            </div>
          </DetailSection>

          {f.notes && (
            <DetailSection title="Note">
              <p className="text-sm text-muted-foreground">{f.notes}</p>
            </DetailSection>
          )}
        </div>
      </div>

      <CompletaDialog open={completaOpen} onClose={() => setCompletaOpen(false)} fermata={f} onDone={() => { setCompletaOpen(false); load(); }} />

      <Dialog open={problemaOpen} onOpenChange={(v) => !v && setProblemaOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="problema-dialog">
          <DialogHeader><DialogTitle>Segnala problema</DialogTitle></DialogHeader>
          <Textarea rows={3} value={problemNote} onChange={(e) => setProblemNote(e.target.value)} placeholder="Descrivi il problema..." className="resize-none" data-testid="problema-note-input" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setProblemaOpen(false)}>Annulla</Button>
            <Button onClick={problema} className="bg-red-600 hover:bg-red-700 text-white" data-testid="problema-submit">Registra problema</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={annullaOpen} onOpenChange={(v) => !v && setAnnullaOpen(false)}>
        <DialogContent className="max-w-sm" data-testid="annulla-dialog">
          <DialogHeader><DialogTitle>Annullare la fermata?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Le richieste collegate torneranno in "Da organizzare". Nessun movimento stock verrà generato.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnullaOpen(false)}>Indietro</Button>
            <Button variant="destructive" onClick={annulla} data-testid="annulla-submit">Annulla fermata</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
