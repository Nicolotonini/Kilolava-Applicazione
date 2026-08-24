import React, { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ExportButton } from '../components/ExportButton';
import { History, PlusCircle, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const ACTION_META = {
  create: { label: 'Creazione', icon: PlusCircle, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  update: { label: 'Modifica', icon: Pencil, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  delete: { label: 'Eliminazione', icon: Trash2, cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const ENTITY_LABELS = {
  clients: 'Clienti', structures: 'Strutture', units: 'Unità', events: 'Calendario',
  articles: 'Magazzino', inventory: 'Magazzino', users: 'Utenti', documents: 'Documenti',
  orders: 'Ordini', cleaning: 'Pulizie', logistics: 'Logistica', maintenance: 'Manutenzione',
  ical: 'Sync iCal', automation: 'Automazione', auth: 'Account', notifications: 'Notifiche',
  'checklist-templates': 'Template pulizie', 'client-prices': 'Prezzi', 'delivery-config': 'Consegne',
  export: 'Export', upload: 'Upload',
};

const ROLE_LABELS = {
  admin: 'Admin', operations_manager: 'Manager', cleaner: 'Addetto pulizie',
  rider: 'Rider', maintenance: 'Manutentore', client: 'Cliente',
};

const LIMIT = 50;

export default function ActivityLogPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [entities, setEntities] = useState([]);
  const [action, setAction] = useState('all');
  const [entity, setEntity] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchLogs = useCallback(async (skip = 0, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const res = await api.get('/activity', { params: { action, entity, skip, limit: LIMIT } });
      setTotal(res.data.total || 0);
      setEntities(res.data.entities || []);
      setItems(prev => append ? [...prev, ...(res.data.items || [])] : (res.data.items || []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [action, entity]);

  useEffect(() => { fetchLogs(0, false); }, [fetchLogs]);

  const fmtTs = (ts) => {
    if (!ts) return '—';
    try {
      return new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="activity-log-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Registro Attività</h1>
          <p className="text-sm text-muted-foreground">{total} operazioni registrate</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="activity" />
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fetchLogs(0, false)} data-testid="refresh-activity-btn">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />Aggiorna
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="activity-action-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le azioni</SelectItem>
            <SelectItem value="create">Creazione</SelectItem>
            <SelectItem value="update">Modifica</SelectItem>
            <SelectItem value="delete">Eliminazione</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="h-8 w-[180px] text-xs" data-testid="activity-entity-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le sezioni</SelectItem>
            {entities.map(e => (
              <SelectItem key={e} value={e}>{ENTITY_LABELS[e] || e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento registro...</div>
      ) : items.length === 0 ? (
        <Card className="border">
          <CardContent className="p-10 text-center">
            <History className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nessuna attività registrata</p>
            <p className="text-xs text-muted-foreground mt-1">Le operazioni di creazione, modifica ed eliminazione verranno tracciate qui</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Data / Ora</th>
                  <th className="text-left px-3 py-2.5 font-medium">Utente</th>
                  <th className="text-left px-3 py-2.5 font-medium">Azione</th>
                  <th className="text-left px-3 py-2.5 font-medium">Sezione</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Dettaglio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((log) => {
                  const meta = ACTION_META[log.action] || { label: log.action, icon: History, cls: 'bg-muted text-muted-foreground' };
                  const ActionIcon = meta.icon;
                  return (
                    <tr key={log.id} className="hover:bg-accent/30" data-testid={`activity-row-${log.id}`}>
                      <td className="px-4 py-2.5 text-xs whitespace-nowrap tabular-nums">{fmtTs(log.timestamp)}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-medium">{log.user_name || '—'}</p>
                        {log.user_role && <p className="text-xs text-muted-foreground">{ROLE_LABELS[log.user_role] || log.user_role}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', meta.cls)}>
                          <ActionIcon className="h-3 w-3" />{meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium">{ENTITY_LABELS[log.entity_type] || log.entity_type || '—'}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <p className="text-xs font-mono text-muted-foreground truncate max-w-[320px]">{log.path}</p>
                        {log.entity_id && <p className="text-xs text-muted-foreground/70 font-mono">ID: {log.entity_id.slice(0, 8)}…</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {items.length < total && (
            <div className="text-center">
              <Button variant="outline" size="sm" className="h-8" onClick={() => fetchLogs(items.length, true)} disabled={loadingMore} data-testid="load-more-activity-btn">
                {loadingMore ? 'Caricamento...' : `Carica altri (${total - items.length} rimanenti)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
