import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { MapPin, Plus, Pencil, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export const ZonesSettingsCard = () => {
  const [zones, setZones] = useState(null);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(() => {
    api.get('/zones', { params: { include_inactive: true } }).then(r => setZones(r.data)).catch(() => setZones([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await api.post('/zones', { name: newName.trim() });
      setNewName('');
      toast.success('Rione aggiunto');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const rename = async (id) => {
    if (!editName.trim()) { setEditId(null); return; }
    try {
      await api.put(`/zones/${id}`, { name: editName.trim() });
      setEditId(null);
      toast.success('Rione rinominato');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const toggleActive = async (z) => {
    try {
      await api.put(`/zones/${z.id}`, { active: !(z.active !== false) });
      load();
    } catch (e) { toast.error('Errore'); }
  };

  const move = async (index, delta) => {
    const ids = zones.map(z => z.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await api.put('/zones/reorder', { ids });
      load();
    } catch (e) { toast.error('Errore riordino'); }
  };

  return (
    <Card className="kilolava-card" data-testid="zones-settings-card">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-heading">Rioni / Zone operative</CardTitle>
            <CardDescription>Classificazione operativa Kilolava per organizzare le pulizie per giro. Disattivare un rione non lo rimuove dalle strutture esistenti.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nuovo rione..." className="h-9 max-w-xs" data-testid="zone-new-input" />
          <Button variant="outline" className="h-9" onClick={add} data-testid="zone-add-btn"><Plus className="h-4 w-4 mr-1" />Aggiungi</Button>
        </div>
        {zones === null ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border max-h-96 overflow-y-auto">
            {zones.map((z, i) => (
              <div key={z.id} className={cn('flex items-center gap-2 px-3 py-1.5', z.active === false && 'opacity-50')} data-testid={`zone-row-${z.id}`}>
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} data-testid={`zone-up-${z.id}`}><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === zones.length - 1} data-testid={`zone-down-${z.id}`}><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
                <div className="min-w-0 flex-1">
                  {editId === z.id ? (
                    <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && rename(z.id)} className="h-8 text-sm" data-testid={`zone-edit-input-${z.id}`} />
                  ) : (
                    <>
                      <p className="text-sm font-medium">{z.name}</p>
                      {z.group && <p className="text-xs text-muted-foreground">{z.group}</p>}
                    </>
                  )}
                </div>
                {editId === z.id ? (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => rename(z.id)} data-testid={`zone-save-${z.id}`}><Check className="h-4 w-4 text-emerald-600" /></Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditId(z.id); setEditName(z.name); }} data-testid={`zone-rename-${z.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                )}
                <Switch checked={z.active !== false} onCheckedChange={() => toggleActive(z)} data-testid={`zone-active-${z.id}`} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
