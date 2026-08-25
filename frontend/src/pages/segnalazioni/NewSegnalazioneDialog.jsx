import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { TYPE_META, PRIORITY_META } from './shared';

export function NewSegnalazioneDialog({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('missing');
  const [priority, setPriority] = useState('normal');
  const [structureId, setStructureId] = useState('');
  const [structures, setStructures] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/structures').then(r => setStructures(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    if (!title.trim()) { toast.error('Descrivi il problema'); return; }
    setSaving(true);
    try {
      await api.post('/segnalazioni', {
        title: title.trim(), description: description.trim() || title.trim(),
        type, priority, structure_id: structureId || null,
      });
      toast.success('Segnalazione creata');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" data-testid="new-segnalazione-dialog">
        <DialogHeader>
          <DialogTitle>Nuova segnalazione</DialogTitle>
          <DialogDescription>Cosa è successo? Responsabilità e azioni si decidono dopo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Problema</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Manca carta igienica" data-testid="new-seg-title" />
          </div>
          <div>
            <Label className="text-xs">Tipo di problema</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {Object.entries(TYPE_META).map(([k, v]) => (
                <button key={k} onClick={() => setType(k)}
                  className={cn('rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors text-left',
                    type === k ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-foreground/30')}
                  data-testid={`new-seg-type-${k}`}>{v.single}</button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Struttura</Label>
            <select value={structureId} onChange={e => setStructureId(e.target.value)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="new-seg-structure">
              <option value="">Nessuna / generale</option>
              {structures.map(s => <option key={s.id} value={s.id}>{s.klv_code ? `${s.klv_code} — ` : ''}{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Priorità</Label>
            <div className="flex gap-1.5 mt-1">
              {Object.entries(PRIORITY_META).map(([k, v]) => (
                <button key={k} onClick={() => setPriority(k)}
                  className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border',
                    priority === k ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}
                  data-testid={`new-seg-priority-${k}`}>
                  <span className={cn('w-2 h-2 rounded-full', v.dot)} />{v.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Dettagli (opzionale)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} data-testid="new-seg-description" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="new-seg-save-btn">
              {saving ? 'Creazione...' : 'Crea segnalazione'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
