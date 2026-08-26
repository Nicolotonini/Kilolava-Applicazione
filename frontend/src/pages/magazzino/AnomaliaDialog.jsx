import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';

const TYPES = [
  ['missing', 'Mancanza'],
  ['damage', 'Rottura / Danno'],
  ['malfunction', 'Malfunzionamento'],
  ['other', 'Anomalia / Altro'],
];
const PRIORITIES = [['low', 'Bassa'], ['normal', 'Normale'], ['high', 'Alta'], ['urgent', 'Urgente']];

/* Anomalia vera dal Magazzino → Centro Segnalazioni (origine "Magazzino"). */
export function AnomaliaDialog({ contextLabel, structureId, defaultTitle, onClose }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(defaultTitle || '');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('damage');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast.error('Inserisci un titolo'); return; }
    setSaving(true);
    try {
      const r = await api.post('/segnalazioni', {
        title: title.trim(), description, type, priority,
        structure_id: structureId || null,
        origin_type: 'warehouse', origin_label: contextLabel || 'Magazzino',
      });
      toast.success('Anomalia registrata nel Centro Segnalazioni', {
        action: { label: 'Apri', onClick: () => navigate(`/segnalazioni/${r.data.id}`) },
      });
      onClose();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="anomalia-dialog">
        <DialogHeader>
          <DialogTitle>Segnala anomalia</DialogTitle>
          <DialogDescription>
            Per rotture, danni o problemi veri: la segnalazione viene gestita nel Centro Segnalazioni.
            Per i normali reintegri usa invece le richieste operative.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Tipo</Label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="anomalia-type">
                {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Priorità</Label>
              <select value={priority} onChange={e => setPriority(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="anomalia-priority">
                {PRIORITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Titolo</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Aspirapolvere rotto" data-testid="anomalia-title" />
          </div>
          <div>
            <Label className="text-xs">Descrizione</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} data-testid="anomalia-description" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="anomalia-save-btn">
              {saving ? 'Invio...' : 'Registra anomalia'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
