import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Plus, Backpack } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { EmptyState, ListSkeleton } from '../../components/kilolava/EmptyState';
import { StatusBadge } from '../../components/kilolava/badges';
import { ZAINO_STATUS_META, fmtDT } from './shared';

export default function ZainiPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(() => {
    api.get('/magazzino/zaini').then(r => setRows(r.data)).catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="zaini-page">
      <PageHeader title="Zaini Operatrici" subtitle="Ubicazioni mobili collegate al Magazzino Generale: dotazione, controlli e reintegri"
        actions={
          <Button onClick={() => setNewOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="new-zaino-btn">
            <Plus className="h-4 w-4 mr-1.5" />Nuovo zaino
          </Button>
        } />
      {rows === null ? <ListSkeleton rows={5} /> : rows.length === 0 ? (
        <EmptyState icon={Backpack} message="Nessuno zaino operativo. Crea il primo zaino e assegnalo a un'Addetta." />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm hidden lg:table">
            <thead>
              <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Codice</th>
                <th className="px-3 py-2.5">Nome</th>
                <th className="px-3 py-2.5">Assegnato a</th>
                <th className="px-3 py-2.5">Stato</th>
                <th className="px-3 py-2.5">Mancanze</th>
                <th className="px-3 py-2.5">Ultimo controllo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(z => (
                <tr key={z.id} onClick={() => navigate(`/magazzino-generale/zaini/${z.id}`)}
                  className="border-t border-border hover:bg-accent/40 cursor-pointer row-hover" data-testid={`zaino-row-${z.id}`}>
                  <td className="px-3 py-2.5 font-mono text-sm font-bold text-primary">{z.code}</td>
                  <td className="px-3 py-2.5 font-medium">{z.name || '—'}</td>
                  <td className="px-3 py-2.5">{z.assigned_to_name || <span className="text-muted-foreground">Non assegnato</span>}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge tone={ZAINO_STATUS_META[z.status]?.tone}>{ZAINO_STATUS_META[z.status]?.label || z.status}</StatusBadge>
                  </td>
                  <td className="px-3 py-2.5">
                    {z.missing_count > 0
                      ? <span className="text-amber-600 font-semibold">{z.missing_count} articoli</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{fmtDT(z.last_check_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lg:hidden divide-y divide-border/60">
            {rows.map(z => (
              <div key={z.id} onClick={() => navigate(`/magazzino-generale/zaini/${z.id}`)}
                className="p-3 space-y-1 cursor-pointer active:bg-accent/40" data-testid={`zaino-card-${z.id}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-primary">{z.code}</span>
                  <span className="font-medium flex-1 truncate">{z.name || ''}</span>
                  <StatusBadge tone={ZAINO_STATUS_META[z.status]?.tone}>{ZAINO_STATUS_META[z.status]?.label || z.status}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {z.assigned_to_name || 'Non assegnato'}
                  {z.missing_count > 0 ? ` · ${z.missing_count} mancanze` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {newOpen && <NewZainoDialog onClose={() => setNewOpen(false)} onDone={(z) => { setNewOpen(false); load(); navigate(`/magazzino-generale/zaini/${z.id}`); }} />}
    </div>
  );
}

function NewZainoDialog({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [kitId, setKitId] = useState('');
  const [kits, setKits] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/magazzino/kits', { params: { domain: 'pulizie' } }).then(r => setKits(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.post('/magazzino/zaini', { name: name || null, kit_id: kitId || null });
      toast.success(`Zaino ${r.data.code} creato`);
      onDone(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm" data-testid="new-zaino-dialog">
        <DialogHeader>
          <DialogTitle>Nuovo zaino operativo</DialogTitle>
          <DialogDescription>Il codice KLV-Z viene assegnato automaticamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nome (facoltativo)</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Zaino rione Centro" data-testid="zaino-name-input" />
          </div>
          <div>
            <Label className="text-xs">Kit dotazione di riferimento</Label>
            <select value={kitId} onChange={e => setKitId(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="zaino-kit-select">
              <option value="">Nessun kit</option>
              {kits.map(k => <option key={k.id} value={k.id}>{k.name}{(k.items || []).length === 0 ? ' (non configurato)' : ''}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="zaino-create-btn">
              {saving ? 'Creazione...' : 'Crea zaino'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
