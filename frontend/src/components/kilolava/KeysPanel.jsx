import React, { useState } from 'react';
import { KeyRound, ArrowUpRight, Undo2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

const fmtSince = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Stato copia: disponibile in sede | ritirata da me | fuori con altra persona
const copyState = (kb, userId) => {
  if (!kb || typeof kb !== 'object') return null;
  const exists = kb.exists !== undefined ? !!kb.exists : !!kb.present;
  if (!exists) return null;
  if (kb.present) return { code: 'in_sede', label: 'Disponibile in sede', cls: 'bg-emerald-100 text-emerald-700' };
  if (kb.holder_user_id === userId) return { code: 'mia', label: 'Già ritirata da me', cls: 'bg-primary/10 text-primary' };
  return { code: 'altro', label: `Fuori con ${kb.holder_name || 'altra persona'}`, cls: 'bg-amber-100 text-amber-700' };
};

/**
 * Sezione "Chiavi" nelle viste operative (Pulizia / Fermata). Usa gli endpoint esistenti
 * POST /keys/{structure}/{copy}/ritiro|riconsegna con linked_task_id/type; l'operatore agisce solo per sé.
 * - allowedCopies: copie mostrate operativamente (Cleaner = ['A'], Rider = ['B']); il backend resta la barriera reale.
 * - heldOnly: mostra solo le copie detenute dall'utente (es. dopo il completamento) con avviso "Chiave ancora da riconsegnare".
 */
export const KeysPanel = ({ structureId, klvCode, boxes, hasKeys, linkedTaskId, linkedTaskType, onChanged, compact = false,
  allowedCopies = ['A', 'B', 'C'], heldOnly = false }) => {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null);
  if (!hasKeys || !structureId) return null;
  let copies = allowedCopies
    .map((c) => ({ letter: c, kb: (boxes || {})[c], st: copyState((boxes || {})[c], user?.id) }))
    .filter((x) => x.st);
  if (heldOnly) copies = copies.filter((x) => x.st.code === 'mia');
  if (copies.length === 0) return null;

  const act = async (letter, action) => {
    setBusy(`${letter}-${action}`);
    try {
      await api.post(`/keys/${structureId}/${letter}/${action}`, { linked_task_id: linkedTaskId, linked_task_type: linkedTaskType });
      toast.success(action === 'ritiro' ? `Chiave ${letter} ritirata` : `Chiave ${letter} riconsegnata`);
      onChanged?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore chiavi'); }
    finally { setBusy(null); }
  };

  return (
    <div className={cn('rounded-xl border bg-card', heldOnly ? 'border-amber-300' : 'border-border', compact ? 'p-2.5 space-y-2' : 'p-4 space-y-3')} data-testid="keys-panel">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <KeyRound className="h-3.5 w-3.5" />Chiavi{klvCode ? ` · ${klvCode}` : ''}
      </p>
      {heldOnly && (
        <p className="text-sm font-medium text-amber-700 flex items-center gap-1.5" data-testid="keys-held-warning">
          <AlertTriangle className="h-4 w-4" />Chiave ancora da riconsegnare
        </p>
      )}
      {copies.map(({ letter, st }) => (
        <div key={letter} className="flex items-center gap-2 flex-wrap" data-testid={`keys-copy-${letter}`}>
          <span className="text-sm font-semibold w-14">Copia {letter}</span>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', st.cls)} data-testid={`keys-state-${letter}`}>{st.label}</span>
          {st.code !== 'in_sede' && boxes?.[letter]?.out_since && (
            <span className="text-xs text-muted-foreground">dalle {fmtSince(boxes[letter].out_since)}</span>
          )}
          <span className="ml-auto flex gap-1.5">
            {st.code === 'in_sede' && (
              <Button size="sm" className="h-8 gap-1 bg-primary text-primary-foreground" disabled={!!busy}
                onClick={() => act(letter, 'ritiro')} data-testid={`keys-ritira-${letter}`}>
                <ArrowUpRight className="h-3.5 w-3.5" />Ritira chiave
              </Button>
            )}
            {st.code === 'mia' && (
              <Button size="sm" variant="outline" className="h-8 gap-1 border-emerald-300 text-emerald-700" disabled={!!busy}
                onClick={() => act(letter, 'riconsegna')} data-testid={`keys-riconsegna-${letter}`}>
                <Undo2 className="h-3.5 w-3.5" />Riconsegna chiave
              </Button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
};

export default KeysPanel;
