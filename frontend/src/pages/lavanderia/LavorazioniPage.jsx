import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import { AuthImg } from '../../components/kilolava/AuthMedia';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Shirt, Scale, Check, Truck, Settings2, Camera, Ban } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fmtDateTime } from '../consegne/shared';

const JOB_STATUS = {
  da_lavorare: { label: 'Da lavorare', tone: 'progress' },
  pronta: { label: 'Pronta', tone: 'neutral' },
  consegnata: { label: 'Consegnata', tone: 'success' },
  annullata: { label: 'Annullata', tone: 'cancelled' },
};

const FILTERS = [
  { key: 'all', label: 'Tutte' },
  { key: 'da_lavorare', label: 'Da lavorare' },
  { key: 'pronta', label: 'Pronte' },
  { key: 'da_pesare', label: 'Da pesare' },
  { key: 'in_consegna', label: 'In consegna' },
];

function NuovoArrivoDialog({ open, onClose, clients, structures, jobs, onCreated, onUseExisting }) {
  const [clientId, setClientId] = useState('');
  const [structureId, setStructureId] = useState('');
  const [bags, setBags] = useState('');
  const [weight, setWeight] = useState('');
  const [photo, setPhoto] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setClientId(''); setStructureId(''); setBags(''); setWeight(''); setPhoto(null); setNote(''); } }, [open]);

  const clientStructures = structures.filter((s) => !clientId || s.client_id === clientId);
  const existing = (jobs || []).filter((j) => structureId && j.structure_id === structureId && ['da_lavorare', 'pronta'].includes(j.status));

  const save = async () => {
    if (!clientId) { toast.error('Seleziona il cliente'); return; }
    if (weight && !(parseFloat(weight) > 0)) { toast.error('Peso non valido'); return; }
    setSaving(true);
    try {
      const r = await api.post('/lavanderia/jobs', {
        client_id: clientId, structure_id: structureId || null,
        bags: bags ? parseInt(bags) : null, note: note || null,
      });
      const jobId = r.data.id;
      if (weight) {
        await api.put(`/lavanderia/jobs/${jobId}/peso`, { final_weight_kg: parseFloat(weight) });
      }
      if (photo) {
        const fd = new FormData();
        fd.append('file', photo);
        await api.post(`/lavanderia/jobs/${jobId}/foto-bilancia`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      toast.success('Arrivo registrato');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="nuovo-arrivo-dialog">
        <DialogHeader>
          <DialogTitle>Nuovo arrivo — Lavanderia Privata</DialogTitle>
          <DialogDescription className="text-xs">Registra il ritiro: cliente, struttura e, se già disponibili, peso e foto della pesatura.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente *</Label>
            <Select value={clientId || 'none'} onValueChange={(v) => { setClientId(v === 'none' ? '' : v); setStructureId(''); }}>
              <SelectTrigger data-testid="arrivo-client-select"><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name || c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Struttura (facoltativa)</Label>
            <Select value={structureId || 'none'} onValueChange={(v) => setStructureId(v === 'none' ? '' : v)}>
              <SelectTrigger data-testid="arrivo-structure-select"><SelectValue placeholder="Nessuna" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna</SelectItem>
                {clientStructures.map((s) => <SelectItem key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {existing.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 space-y-1.5" data-testid="existing-job-hint">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Esiste già una lavorazione aperta per questa struttura: evita i doppioni.</p>
              {existing.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-xs">{j.client_name} · {JOB_STATUS[j.status]?.label}{j.final_weight_kg ? ` · ${j.final_weight_kg} kg` : ''}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onUseExisting(j)} data-testid={`use-existing-${j.id}`}>
                    Usa questa
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sacchi (facoltativo)</Label>
              <Input type="number" min={0} value={bags} onChange={(e) => setBags(e.target.value)} data-testid="arrivo-bags-input" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Peso kg (facoltativo)</Label>
              <Input type="number" step="0.1" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="es. 7.5" data-testid="arrivo-weight-input" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Foto bilancia / pesatura (facoltativa ora, obbligatoria prima della consegna)</Label>
            <Input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} data-testid="arrivo-photo-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none" data-testid="arrivo-note-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="arrivo-submit">{saving ? '...' : 'Registra arrivo'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PesaDialog({ open, onClose, job, onDone }) {
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setWeight(job?.final_weight_kg || ''); setNote(''); setPhoto(null); }
  }, [open, job]);

  if (!job) return null;
  const needsPhoto = !job.scale_photo;

  const submit = async () => {
    const w = parseFloat(weight);
    if (!w || w <= 0) { toast.error('Inserisci un peso valido in kg'); return; }
    if (needsPhoto && !photo) { toast.error('La foto della bilancia è obbligatoria'); return; }
    setSaving(true);
    try {
      await api.put(`/lavanderia/jobs/${job.id}/peso`, { final_weight_kg: w, note: note || null });
      if (photo) {
        const fd = new FormData();
        fd.append('file', photo);
        await api.post(`/lavanderia/jobs/${job.id}/foto-bilancia`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      toast.success('Pesatura registrata: la lavorazione ora è consegnabile');
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="pesa-dialog">
        <DialogHeader><DialogTitle>Pesatura — {job.client_name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Peso finale (kg) *</Label>
            <Input type="number" step="0.1" min={0} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="es. 7.5" data-testid="peso-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Foto bilancia {needsPhoto ? '*' : '(già caricata — sostituisci se serve)'}</Label>
            {job.scale_photo && !photo && (
              <AuthImg path={job.scale_photo.file_path} alt="Bilancia" className="h-24 rounded-lg border border-border object-cover" data-testid="scale-photo-preview" />
            )}
            <Input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] || null)} data-testid="foto-bilancia-input" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nota pesatura</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="resize-none" data-testid="peso-note-input" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={submit} disabled={saving} data-testid="peso-submit">{saving ? '...' : 'Salva pesatura'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LavorazioniPage() {
  const [jobs, setJobs] = useState([]);
  const [richiesteMap, setRichiesteMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [clients, setClients] = useState([]);
  const [structures, setStructures] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [pesaJob, setPesaJob] = useState(null);
  const [price, setPrice] = useState(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/lavanderia/jobs'),
      api.get('/consegne/richieste', { params: { kind: 'lavanderia_privata' } }),
    ]).then(([j, r]) => {
      setJobs(j.data);
      const m = {};
      r.data.forEach((x) => { if (x.source_id) m[x.source_id] = x.status; });
      setRichiesteMap(m);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    api.get('/clients').then((r) => setClients(r.data)).catch(() => {});
    api.get('/structures').then((r) => setStructures(r.data)).catch(() => {});
    api.get('/lavanderia/settings').then((r) => setPrice(r.data.price_per_kg)).catch(() => {});
  }, [load]);

  const markReady = async (job) => {
    try {
      await api.post(`/lavanderia/jobs/${job.id}/pronta`, {});
      toast.success('Pronta: appare in Consegne → Organizzazione e definizione come possibile consegna da valutare');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const annulla = async (job) => {
    try {
      await api.put(`/lavanderia/jobs/${job.id}`, { status: 'annullata' });
      toast.success('Lavorazione annullata');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const savePrice = async () => {
    const p = parseFloat(priceInput);
    if (!p || p <= 0) { toast.error('Prezzo non valido'); return; }
    try {
      await api.put('/lavanderia/settings', { price_per_kg: p });
      setPrice(p);
      setPriceOpen(false);
      toast.success('Prezzo standard aggiornato');
    } catch (e) { toast.error('Errore'); }
  };

  const filtered = useMemo(() => jobs.filter((j) => {
    const inConsegna = richiesteMap[j.id] === 'in_consegna';
    switch (filter) {
      case 'da_lavorare': return j.status === 'da_lavorare';
      case 'pronta': return j.status === 'pronta';
      case 'da_pesare': return j.status === 'pronta' && !j.consegnabile;
      case 'in_consegna': return inConsegna;
      default: return true;
    }
  }), [jobs, filter, richiesteMap]);

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl" data-testid="lavorazioni-page">
      <PageHeader
        title="Lavanderia Privata — Lavorazioni"
        subtitle={
          <span>
            Flusso: Da lavorare → Pronta → <strong>pesatura + foto bilancia</strong> → Consegnata.
            {price != null && <> Prezzo standard: <strong>{price.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}/kg</strong></>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => { setPriceInput(price ?? 3); setPriceOpen(true); }} title="Prezzo standard €/kg" data-testid="price-settings-btn">
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button onClick={() => setNewOpen(true)} className="h-9 gap-1.5" data-testid="nuovo-arrivo-btn">
              <Plus className="h-4 w-4" />Nuovo arrivo
            </Button>
          </>
        }
      />

      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn('text-xs px-3 py-1.5 rounded-full font-medium border transition-colors',
              filter === f.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
            data-testid={`filter-${f.key}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Shirt} message="Nessuna lavorazione con questo filtro" testId="lavorazioni-empty" />
      ) : (
        <div className="space-y-2">
          {filtered.map((j) => {
            const st = JOB_STATUS[j.status] || JOB_STATUS.da_lavorare;
            const inConsegna = richiesteMap[j.id] === 'in_consegna';
            return (
              <Card key={j.id} className="border shadow-none" data-testid={`job-card-${j.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{j.client_name}</span>
                        {j.structure_name && <span className="text-xs text-muted-foreground">· {j.structure_name}</span>}
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                        {inConsegna && <StatusBadge tone="accent" testId={`job-in-consegna-${j.id}`}>In consegna</StatusBadge>}
                        {j.status === 'pronta' && !j.consegnabile && (
                          <StatusBadge tone="waiting" testId={`job-da-pesare-${j.id}`}>⚠ Da pesare</StatusBadge>
                        )}
                        {j.consegnabile && j.status !== 'consegnata' && (
                          <StatusBadge tone="success" testId={`job-consegnabile-${j.id}`}>Consegnabile</StatusBadge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        <span>Arrivo: {fmtDateTime(j.arrived_at)}</span>
                        {j.bags != null && <span>{j.bags} sacchi</span>}
                        {j.final_weight_kg != null && (
                          <span className="font-medium text-foreground" data-testid={`job-weight-${j.id}`}>
                            {j.final_weight_kg} kg × {j.price_per_kg?.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}/kg
                            {j.price_source === 'cliente' ? ' (prezzo cliente)' : ''} = <strong>{j.total_price?.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong>
                          </span>
                        )}
                        {j.scale_photo && <span className="flex items-center gap-1 text-emerald-600"><Camera className="h-3 w-3" />Foto bilancia ✓</span>}
                      </div>
                      {j.note && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{j.note}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      {j.status === 'da_lavorare' && (
                        <Button size="sm" className="h-8 gap-1" onClick={() => markReady(j)} data-testid={`job-pronta-btn-${j.id}`}>
                          <Check className="h-3.5 w-3.5" />Segna pronta
                        </Button>
                      )}
                      {(j.status === 'da_lavorare' || j.status === 'pronta') && (
                        <Button variant={j.consegnabile ? 'outline' : 'default'} size="sm" className={cn('h-8 gap-1', !j.consegnabile && j.status === 'pronta' && 'bg-orange-500 hover:bg-orange-600 text-white')} onClick={() => setPesaJob(j)} data-testid={`job-pesa-btn-${j.id}`}>
                          <Scale className="h-3.5 w-3.5" />{j.final_weight_kg ? 'Modifica pesatura' : 'Pesa'}
                        </Button>
                      )}
                      {j.status !== 'consegnata' && j.status !== 'annullata' && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => annulla(j)} title="Annulla lavorazione" data-testid={`job-annulla-btn-${j.id}`}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {j.status === 'pronta' && !j.consegnabile && (
                    <p className="text-xs text-orange-600 font-medium flex items-center gap-1 mt-2" data-testid={`job-gate-msg-${j.id}`}>
                      <Truck className="h-3.5 w-3.5" />La richiesta è in Consegne → Da organizzare, ma serve peso + foto bilancia prima della consegna
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NuovoArrivoDialog open={newOpen} onClose={() => setNewOpen(false)} clients={clients} structures={structures} jobs={jobs}
        onCreated={() => { setNewOpen(false); load(); }}
        onUseExisting={(j) => { setNewOpen(false); if (!j.consegnabile) setPesaJob(j); toast.info('Lavorazione esistente selezionata'); }} />
      <PesaDialog open={!!pesaJob} onClose={() => setPesaJob(null)} job={pesaJob} onDone={() => { setPesaJob(null); load(); }} />

      <Dialog open={priceOpen} onOpenChange={(v) => !v && setPriceOpen(false)}>
        <DialogContent className="max-w-xs" data-testid="price-dialog">
          <DialogHeader><DialogTitle>Prezzo standard €/kg</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Vale per tutti i clienti senza prezzo personalizzato (override nella scheda Cliente → Fatturazione).</p>
          <Input type="number" step="0.1" min={0} value={priceInput} onChange={(e) => setPriceInput(e.target.value)} data-testid="price-input" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceOpen(false)}>Annulla</Button>
            <Button onClick={savePrice} data-testid="price-save">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
