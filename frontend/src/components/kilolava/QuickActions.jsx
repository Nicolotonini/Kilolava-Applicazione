import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Truck, RotateCw, AlertTriangle, Wrench, Shirt, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { usePermissions } from '../../hooks/usePermissions';
import { AssistantPanel } from '../assistant/AssistantPanel';

const ACTIONS = [
  { key: 'pulizia', label: 'Pulizia', icon: Sparkles, to: '/cleaning?new=1' },
  { key: 'consegna', label: 'Consegna', icon: Truck, to: '/consegne/definizione?new=1' },
  { key: 'storno', label: 'Storno movimento', icon: RotateCw, to: '/magazzino-generale/movimenti?storno=1' },
  { key: 'segnalazione', label: 'Segnalazione', icon: AlertTriangle, to: '/segnalazioni?new=1' },
  { key: 'manutenzione', label: 'Manutenzione', icon: Wrench, to: '/maintenance?new=1' },
  { key: 'lavanderia', label: 'Lavanderia privata', icon: Shirt, to: '/private-laundry/jobs?new=1' },
];

export const QuickActions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOps } = usePermissions();
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!isOps) return null;

  const go = (to) => { setOpen(false); navigate(to); };

  return (
    <>
      {open && <div className="fixed inset-0 z-[58]" onClick={() => setOpen(false)} data-testid="quick-actions-backdrop" />}
      <div className="fixed right-4 lg:right-6 z-[59] flex flex-col items-end gap-2.5 print:hidden"
        style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }} data-testid="quick-actions-root">
        {/* Speed menu */}
        <div className={cn('flex flex-col items-end gap-1.5 mb-0.5', !open && 'pointer-events-none')} data-testid="quick-actions-menu" aria-hidden={!open}>
          {ACTIONS.map((a, i) => (
            <button
              key={a.key}
              onClick={() => go(a.to)}
              tabIndex={open ? 0 : -1}
              className={cn(
                'flex items-center gap-2.5 rounded-full bg-card border border-border shadow-md pl-3.5 pr-4 py-2 text-sm font-medium',
                'transition-[opacity,transform] duration-200 motion-reduce:transition-none hover:border-primary/50 hover:text-primary',
                open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              )}
              style={{ transitionDelay: open ? `${(ACTIONS.length - 1 - i) * 30}ms` : '0ms' }}
              data-testid={`quick-action-${a.key}`}
            >
              <a.icon className="h-4 w-4 text-primary" />{a.label}
            </button>
          ))}
        </div>
        {/* + */}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Chiudi azioni rapide' : 'Azioni rapide'}
          className={cn('w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg border transition-colors duration-200',
            open ? 'bg-foreground text-background border-foreground' : 'bg-primary text-primary-foreground border-primary hover:bg-primary/90')}
          data-testid="quick-actions-fab"
        >
          <Plus className={cn('h-6 w-6 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-45')} />
        </button>
        {/* AI */}
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
      </div>
      <AssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
};
