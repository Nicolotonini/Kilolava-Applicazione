import React, { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { PageHeader } from '../components/kilolava/PageHeader';
import { AssistantChat, SESSION_KEY } from '../components/assistant/AssistantChat';
import { Button } from '../components/ui/button';
import { cn } from '../lib/utils';
import { Plus, MessageSquare } from 'lucide-react';

export default function AssistantPage() {
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(() => localStorage.getItem(SESSION_KEY) || null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadSessions = useCallback(() => {
    api.get('/assistant/sessions').then((r) => setSessions(r.data)).catch(() => {});
  }, []);
  useEffect(() => { loadSessions(); }, [loadSessions, refreshKey]);

  const selectSession = (id) => {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
    setActiveId(id);
    setRefreshKey((k) => k + 1);
  };

  const fmt = (iso) => {
    try { return new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className="p-4 lg:p-6 h-[calc(100vh-3.5rem)] lg:h-screen flex flex-col" data-testid="assistant-page">
      <PageHeader
        title="Assistente AI"
        subtitle="Dati reali di Kilolava, azioni con conferma esplicita e domande generali."
        actions={
          <Button variant="outline" className="h-9 gap-1.5" onClick={() => selectSession(null)} data-testid="assistant-new-session-btn">
            <Plus className="h-4 w-4" />Nuova conversazione
          </Button>
        }
      />
      <div className="flex-1 min-h-0 mt-4 flex gap-4">
        <aside className="hidden lg:flex flex-col w-64 shrink-0 rounded-xl border border-border bg-card overflow-hidden" data-testid="assistant-sessions-list">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-3 pt-3 pb-2">Conversazioni recenti</p>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
            {sessions.length === 0 && <p className="text-xs text-muted-foreground px-2 py-3">Nessuna conversazione.</p>}
            {sessions.map((s) => (
              <button key={s.id} onClick={() => selectSession(s.id)}
                className={cn('w-full text-left rounded-lg px-2.5 py-2 hover:bg-muted/60 transition-colors',
                  activeId === s.id && 'bg-primary/10 text-primary')}
                data-testid={`assistant-session-${s.id}`}>
                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />{s.title || 'Conversazione'}
                </p>
                <p className="text-xs text-muted-foreground pl-5">{fmt(s.updated_at)}</p>
              </button>
            ))}
          </div>
        </aside>
        <div className="flex-1 min-w-0 rounded-xl border border-border bg-card overflow-hidden flex flex-col">
          <div className="lg:hidden border-b border-border px-3 py-2">
            <select
              value={activeId || ''}
              onChange={(e) => selectSession(e.target.value || null)}
              className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm"
              data-testid="assistant-session-select-mobile"
            >
              <option value="">Nuova conversazione</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{s.title || 'Conversazione'}</option>)}
            </select>
          </div>
          <AssistantChat context={{ path: '/assistant' }} refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
