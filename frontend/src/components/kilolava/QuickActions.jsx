import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Truck, RotateCw, AlertTriangle, Wrench, Shirt, Plus, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePermissions } from '../../hooks/usePermissions';
import { AssistantPanel } from '../assistant/AssistantPanel';
import api from '../../lib/api';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

const OPS_ACTIONS = [
  { key: 'pulizia', label: 'Pulizia', icon: Sparkles, to: '/cleaning?new=1' },
  { key: 'consegna', label: 'Consegna', icon: Truck, to: '/consegne/definizione?new=1' },
  { key: 'storno', label: 'Storno movimento', icon: RotateCw, to: '/magazzino-generale/movimenti?storno=1' },
  { key: 'segnalazione', label: 'Segnalazione', icon: AlertTriangle, to: '/segnalazioni?new=1' },
  { key: 'manutenzione', label: 'Manutenzione', icon: Wrench, to: '/maintenance?new=1' },
  { key: 'lavanderia', label: 'Lavanderia privata', icon: Shirt, to: '/private-laundry/jobs?new=1' },
];

const SEGN_TYPES = [
  ['missing', 'Mancanza'], ['damage', 'Rottura / Danno'],
  ['malfunction', 'Malfunzionamento'], ['other', 'Anomalia / Altro'],
];

function QuickSegnalazioneDialog({ open, onClose }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('other');
  const [priority, setPriority] = useState('normal');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setTitle(''); setType('other'); setPriority('normal'); setDescription(''); } }, [open]);

  const save = async () => {
    if (!title.trim()) { toast.error('Inserisci un titolo'); return; }
    setSaving(true);
    try {
      await api.post('/segnalazioni', { title: title.trim(), type, priority, description });
      toast.success('Segnalazione inviata al responsabile');
      onClose();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore invio segnalazione'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="quick-segnalazione-dialog">
        <DialogHeader>
          <DialogTitle>Nuova Segnalazione</DialogTitle>
          <DialogDescription className="text-xs">Arriva subito al Centro Segnalazioni del responsabile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Titolo *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Cosa è successo?" data-testid="quick-seg-title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="quick-seg-type">
                {SEGN_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priorità</Label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="quick-seg-priority">
                <option value="low">Bassa</option><option value="normal">Normale</option>
                <option value="high">Alta</option><option value="urgent">Urgente</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrizione</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="quick-seg-description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="quick-seg-submit">
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Invia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const QuickActions = ({ bottomOffset = '1.25rem' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOps, role, hasRole } = usePermissions();
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [segOpen, setSegOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (role === 'client') return null;

  // Azioni derivate dal RUOLO (Role Permission Matrix): mai mostrare azioni non utilizzabili
  let actions;
  if (isOps) {
    actions = OPS_ACTIONS;
  } else {
    actions = [];
    if (hasRole('laundry')) actions.push({ key: 'lavanderia', label: 'Lavanderia privata', icon: Shirt, to: '/private-laundry/jobs?new=1' });
    actions.push({ key: 'segnalazione', label: 'Segnalazione', icon: AlertTriangle, onClick: () => setSegOpen(true) });
  }
  if (actions.length === 0) return null;

  const run = (a) => {
    setOpen(false);
    if (a.to) navigate(a.to);
    else if (a.onClick) a.onClick();
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-[58]" onClick={() => setOpen(false)} data-testid="quick-actions-backdrop" />}
      <div className="fixed right-4 lg:right-6 z-[59] flex flex-col items-end gap-2.5 print:hidden"
        style={{ bottom: `calc(${bottomOffset} + env(safe-area-inset-bottom, 0px))` }} data-testid="quick-actions-root">
        <div className={cn('flex flex-col items-end gap-1.5 mb-0.5', !open && 'pointer-events-none')} data-testid="quick-actions-menu" aria-hidden={!open}>
          {actions.map((a, i) => (
            <button
              key={a.key}
              onClick={() => run(a)}
              tabIndex={open ? 0 : -1}
              className={cn(
                'flex items-center gap-2.5 rounded-full bg-card border border-border shadow-md pl-3.5 pr-4 py-2 text-sm font-medium',
                'transition-[opacity,transform] duration-200 motion-reduce:transition-none hover:border-primary/50 hover:text-primary',
                open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              )}
              style={{ transitionDelay: open ? `${(actions.length - 1 - i) * 30}ms` : '0ms' }}
              data-testid={`quick-action-${a.key}`}
            >
              <a.icon className="h-4 w-4 text-primary" />{a.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Chiudi azioni rapide' : 'Azioni rapide'}
          className={cn('w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg border transition-colors duration-200',
            open ? 'bg-foreground text-background border-foreground' : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90')}
          data-testid="quick-actions-fab"
        >
          <Plus className={cn('h-6 w-6 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-45')} />
        </button>
        {isOps && (
          <button
            onClick={() => { setOpen(false); setAiOpen(true); }}
            aria-label="Assistente AI"
            className="w-[52px] h-[52px] rounded-full bg-card border border-border shadow-lg flex items-center justify-center
              text-primary text-xl leading-none transition-[box-shadow,transform] duration-200 motion-reduce:transition-none
              hover:shadow-[0_0_18px_rgba(242,78,117,0.45)] hover:scale-105"
            data-testid="ai-fab"
          >
            ✦
          </button>
        )}
      </div>
      {isOps && <AssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />}
      <QuickSegnalazioneDialog open={segOpen} onClose={() => setSegOpen(false)} />
    </>
  );
};
