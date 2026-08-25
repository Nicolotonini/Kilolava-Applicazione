import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Plus, X, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { MODE_LABELS } from './shared';

const SCOPE_META = {
  company: { title: 'Default aziendale Segnalazioni', desc: 'Regole valide per tutte le Strutture, salvo regole Cliente o eccezioni Struttura.' },
  client: { title: 'Regole Segnalazioni del Cliente', desc: 'Sovrascrivono il default aziendale per tutte le Strutture di questo Cliente.' },
  structure: { title: 'Eccezioni Segnalazioni della Struttura', desc: 'La regola più specifica prevale: Default → Cliente → Struttura → Articolo.' },
};

const PARTY_OPTS_SUPPLY = [['kilolava', 'Kilolava'], ['client', 'Cliente / Proprietario']];
const PARTY_OPTS_MAINT = [...PARTY_OPTS_SUPPLY, ['da_valutare', 'Da valutare']];
const MODES = ['manuale', 'assistita', 'automatica'];

export function SegnalazioniConfigDialog({ scope, id, onClose, initialSection }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const scoped = scope !== 'company';
  const url = scope === 'company' ? '/segnalazioni/config' : `/segnalazioni/config/${scope}/${id}`;

  const load = useCallback(() => {
    api.get(url).then(r => {
      setData(r.data);
      const cfg = scoped ? (r.data.config || {}) : r.data;
      setForm({
        mode: cfg.mode || (scoped ? 'inherit' : 'assistita'),
        supply: cfg.supply || {},
        maintenance: cfg.maintenance || {},
        automations: cfg.automations || {},
        item_exceptions: cfg.item_exceptions || [],
      });
    }).catch(() => toast.error('Errore caricamento configurazione'));
  }, [url, scoped]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(url, form);
      toast.success('Configurazione salvata');
      onClose();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore salvataggio'); }
    finally { setSaving(false); }
  };

  if (!data || !form) return null;

  const cats = data.categories || { supply: {}, maintenance: {} };
  const effective = scoped ? data.effective : null;

  const setResp = (group, key, val) => setForm(f => ({ ...f, [group]: { ...f[group], [key]: val } }));

  const RespTable = ({ group, label, opts }) => (
    <div className="space-y-1.5">
      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="rounded-xl border border-border divide-y divide-border/60">
        {Object.entries(cats[group === 'supply' ? 'supply' : 'maintenance']).map(([k, catLabel]) => {
          const val = form[group][k] || (scoped ? 'inherit' : 'kilolava');
          const eff = effective?.[group]?.[k];
          return (
            <div key={k} className="flex items-center gap-2 px-3 py-2">
              <span className="text-sm flex-1">{catLabel}</span>
              <select value={val} onChange={e => setResp(group, k, e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid={`resp-${group}-${k}`}>
                {scoped && <option value="inherit">Eredita{eff ? ` (${eff === 'kilolava' ? 'Kilolava' : eff === 'client' ? 'Cliente' : 'Da valutare'})` : ''}</option>}
                {opts.map(([ok, ol]) => <option key={ok} value={ok}>{ol}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="segnalazioni-config-dialog">
        <DialogHeader>
          <DialogTitle>{SCOPE_META[scope].title}</DialogTitle>
          <DialogDescription>{SCOPE_META[scope].desc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {/* Modalità */}
          <div className="space-y-1.5">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Modalità di gestione</p>
            <div className="flex gap-1.5 flex-wrap">
              {(scoped ? ['inherit', ...MODES] : MODES).map(m => (
                <button key={m} onClick={() => setForm(f => ({ ...f, mode: m }))}
                  className={cn('px-3 py-1.5 rounded-full text-sm font-medium border transition-colors',
                    form.mode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}
                  data-testid={`mode-${m}`}>
                  {MODE_LABELS[m]}{m === 'inherit' && effective?.mode ? ` (${MODE_LABELS[effective.mode]})` : ''}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Manuale: Kilolava suggerisce, tu esegui. Assistita: Kilolava prepara l'azione, tu confermi. Automatica: esegue da sola SOLO le automazioni consentite qui sotto — un operatore supervisiona sempre.
            </p>
          </div>

          <RespTable group="supply" label="Responsabilità forniture" opts={PARTY_OPTS_SUPPLY} />
          <RespTable group="maintenance" label="Responsabilità manutenzioni" opts={PARTY_OPTS_MAINT} />

          {/* Automazioni */}
          <div className="space-y-1.5">
            <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Automazioni consentite</p>
            <div className="rounded-xl border border-border divide-y divide-border/60">
              {Object.entries(data.automation_labels || {}).map(([k, label]) => {
                const raw = form.automations[k];
                const effVal = effective?.automations?.[k];
                const checked = raw == null ? (scoped ? !!effVal : false) : !!raw;
                const inherited = scoped && raw == null;
                const critical = ['damage', 'malfunction', 'other'].includes(k);
                return (
                  <label key={k} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={checked}
                      onChange={e => setForm(f => ({ ...f, automations: { ...f.automations, [k]: e.target.checked } }))}
                      className="accent-[#F24E75] w-4 h-4" data-testid={`automation-${k}`} />
                    <span className="text-sm flex-1">{label}{inherited && <span className="text-xs text-muted-foreground"> (ereditata)</span>}</span>
                    {critical && <span className="text-xs text-amber-600 font-medium">passa dal Manager</span>}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Le automazioni si attivano solo in modalità Automatica e per situazioni semplici. Rotture, perdite e anomalie richiedono comunque valutazione.</p>
          </div>

          {/* Eccezioni articolo */}
          {scoped && (
            <ItemExceptions
              list={form.item_exceptions}
              onChange={(list) => setForm(f => ({ ...f, item_exceptions: list }))} />
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Annulla</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90" data-testid="config-save-btn">
              {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemExceptions({ list, onChange }) {
  const [name, setName] = useState('');
  const [party, setParty] = useState('kilolava');
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Eccezioni per singolo articolo</p>
      <p className="text-xs text-muted-foreground">Es. "Capsule caffè → Cliente" anche se i consumabili cucina sono Kilolava.</p>
      {list.map((exc, i) => (
        <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5">
          <span className="text-sm flex-1">{exc.name}</span>
          <span className="text-xs font-semibold">{exc.party === 'kilolava' ? 'Kilolava' : 'Cliente'}</span>
          <button onClick={() => onChange(list.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`exc-remove-${i}`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome articolo (es. capsule caffè)" className="h-8 text-sm" data-testid="exc-name-input" />
        <select value={party} onChange={e => setParty(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-sm" data-testid="exc-party-select">
          <option value="kilolava">Kilolava</option>
          <option value="client">Cliente</option>
        </select>
        <Button variant="outline" size="sm" className="h-8"
          onClick={() => { if (name.trim()) { onChange([...list, { name: name.trim(), party }]); setName(''); } }}
          data-testid="exc-add-btn"><Plus className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

export function GestioneSegnalazioniCard({ scope, id }) {
  const [effective, setEffective] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.get(`/segnalazioni/config/${scope}/${id}`).then(r => setEffective(r.data.effective)).catch(() => {});
  }, [scope, id]);
  useEffect(() => { load(); }, [load]);

  const count = (obj, party) => Object.values(obj || {}).filter(v => v === party).length;

  return (
    <Card className="border shadow-none" data-testid={`gestione-segnalazioni-${scope}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Gestione Segnalazioni</p>
            <p className="text-xs text-muted-foreground">Chi si occupa dei problemi segnalati {scope === 'client' ? 'per questo Cliente' : 'in questa Struttura'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="gestione-segnalazioni-btn">
            <Settings className="h-3.5 w-3.5 mr-1.5" />Gestisci
          </Button>
        </div>
        {effective && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Modalità</p>
              <p className="font-semibold">{MODE_LABELS[effective.mode] || effective.mode}</p>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Forniture</p>
              <p className="font-semibold">{count(effective.supply, 'kilolava')} Kilolava · {count(effective.supply, 'client')} Cliente</p>
            </div>
            <div className="rounded-lg bg-muted/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">Manutenzioni</p>
              <p className="font-semibold">{count(effective.maintenance, 'kilolava')} Kilolava · {count(effective.maintenance, 'client')} Cliente</p>
            </div>
          </div>
        )}
        {open && <SegnalazioniConfigDialog scope={scope} id={id} onClose={() => { setOpen(false); load(); }} />}
      </CardContent>
    </Card>
  );
}
