import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { API_BASE } from '../../lib/api';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { Send, RotateCw, Check, X, Loader2, Wrench } from 'lucide-react';

export const SESSION_KEY = 'klv_assistant_session';

const SUGGESTIONS = [
  'Quante pulizie abbiamo domani?',
  'Quali consegne devo confermare?',
  'Ci sono segnalazioni urgenti?',
  'Quali magazzini sono sotto soglia?',
  'Quali lavanderie private sono pronte?',
];

const InlineText = ({ text }) => {
  const nodes = [];
  const re = /\[([^\]]+)\]\((\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) nodes.push(<Link key={i++} to={m[2]} className="text-primary font-semibold underline underline-offset-2 hover:opacity-80">{m[1]}</Link>);
    else nodes.push(<strong key={i++}>{m[3]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <span className="whitespace-pre-wrap break-words">{nodes}</span>;
};

function ActionCard({ action }) {
  const [local, setLocal] = useState(action);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setLocal(action); }, [action]);

  const run = async (op) => {
    setBusy(true);
    try {
      if (op === 'execute') {
        const r = await api.post(`/assistant/actions/${local.id}/execute`);
        setLocal((l) => ({ ...l, status: 'executed', result: r.data }));
        toast.success(r.data.message || 'Azione eseguita');
      } else {
        await api.post(`/assistant/actions/${local.id}/cancel`);
        setLocal((l) => ({ ...l, status: 'cancelled' }));
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore esecuzione azione');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2 my-1.5" data-testid={`assistant-action-${local.id}`}>
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Anteprima azione — {local.label}</p>
      <div className="space-y-0.5">
        {(local.preview || []).map((row, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground text-xs shrink-0">{row.label}</span>
            <span className="font-medium text-right">{row.value}</span>
          </div>
        ))}
      </div>
      {local.status === 'proposed' && (
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => run('cancel')} data-testid={`action-cancel-${local.id}`}>
            <X className="h-3.5 w-3.5 mr-1" />Annulla
          </Button>
          <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => run('execute')} data-testid={`action-confirm-${local.id}`}>
            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}Conferma
          </Button>
        </div>
      )}
      {local.status === 'executed' && (
        <div className="flex items-center justify-between gap-2 pt-1" data-testid={`action-executed-${local.id}`}>
          <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1"><Check className="h-3.5 w-3.5" />{local.result?.message || 'Eseguita'}</span>
          {local.result?.link && <Link to={local.result.link} className="text-xs text-primary font-semibold underline underline-offset-2">Apri</Link>}
        </div>
      )}
      {local.status === 'cancelled' && <p className="text-xs text-muted-foreground pt-1">Azione annullata: nessuna modifica effettuata.</p>}
    </div>
  );
}

export const AssistantChat = ({ context, compact, refreshKey }) => {
  const [sessionId, setSessionId] = useState(() => localStorage.getItem(SESSION_KEY) || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState(null);
  const [error, setError] = useState(null);
  const lastUserText = useRef('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const sid = localStorage.getItem(SESSION_KEY);
    setSessionId(sid);
    if (!sid) { setMessages([]); return; }
    api.get(`/assistant/sessions/${sid}/messages`)
      .then((r) => setMessages(r.data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, actions: m.actions || [] }))))
      .catch(() => { localStorage.removeItem(SESSION_KEY); setSessionId(null); setMessages([]); });
  }, [refreshKey]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages, streaming, toolStatus]);

  const send = useCallback(async (text) => {
    const msg = (text || '').trim();
    if (!msg || streaming) return;
    lastUserText.current = msg;
    setError(null);
    setInput('');
    setStreaming(true);
    setToolStatus(null);
    setMessages((p) => [...p, { id: `u-${Date.now()}`, role: 'user', content: msg, actions: [] },
                        { id: `a-${Date.now()}`, role: 'assistant', content: '', actions: [], pending: true }]);
    try {
      const res = await fetch(`${API_BASE}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('kilolava_token')}` },
        body: JSON.stringify({ message: msg, session_id: localStorage.getItem(SESSION_KEY) || null, context }),
      });
      if (!res.ok || !res.body) throw new Error(`Errore ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let gotError = null;
      const handleEvent = (ev) => {
        if (ev.type === 'session') {
          localStorage.setItem(SESSION_KEY, ev.session_id);
          setSessionId(ev.session_id);
        } else if (ev.type === 'delta') {
          setToolStatus(null);
          setMessages((p) => {
            const n = [...p];
            n[n.length - 1] = { ...n[n.length - 1], content: n[n.length - 1].content + ev.content, pending: false };
            return n;
          });
        } else if (ev.type === 'tool') {
          setToolStatus(ev.name);
        } else if (ev.type === 'action') {
          setMessages((p) => {
            const n = [...p];
            n[n.length - 1] = { ...n[n.length - 1], actions: [...n[n.length - 1].actions, ev.action], pending: false };
            return n;
          });
        } else if (ev.type === 'error') {
          gotError = ev.message;
        }
      };
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.trim();
          if (line.startsWith('data: ')) {
            try { handleEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
          }
        }
      }
      if (gotError) throw new Error(gotError);
      setMessages((p) => {
        const n = [...p];
        const lastMsg = n[n.length - 1];
        if (lastMsg.role === 'assistant' && !lastMsg.content && lastMsg.actions.length === 0) {
          n[n.length - 1] = { ...lastMsg, content: 'Fatto.', pending: false };
        }
        return n;
      });
    } catch (e) {
      setMessages((p) => p.filter((m) => !(m.pending && !m.content && m.actions.length === 0)));
      setError(e.message || 'Errore di connessione');
    } finally {
      setStreaming(false);
      setToolStatus(null);
      inputRef.current?.focus();
    }
  }, [streaming, context]);

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="assistant-chat">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && !streaming && (
          <div className="pt-6 space-y-4" data-testid="assistant-suggestions">
            <div className="text-center space-y-1">
              <span className="text-3xl text-primary block">✦</span>
              <p className="font-semibold">Assistente Kilolava</p>
              <p className="text-xs text-muted-foreground">Dati reali dell'app, azioni con conferma e domande generali.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="text-left text-sm rounded-lg border border-border px-3 py-2 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  data-testid={`suggestion-${SUGGESTIONS.indexOf(s)}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('rounded-2xl px-3.5 py-2.5 text-sm max-w-[92%]',
              m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted/70 rounded-bl-sm')}
              data-testid={`assistant-msg-${m.role}`}>
              {m.content ? <InlineText text={m.content} /> : (m.pending ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />{toolStatus ? 'Consulto i dati Kilolava…' : 'Sto pensando…'}
                </span>
              ) : null)}
              {(m.actions || []).map((a) => <ActionCard key={a.id} action={a} />)}
            </div>
          </div>
        ))}
        {streaming && toolStatus && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 pl-1" data-testid="assistant-tool-status">
            <Wrench className="h-3 w-3 animate-pulse" />Consulto: {toolStatus}
          </p>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900 px-3 py-2 text-sm flex items-center justify-between gap-2" data-testid="assistant-error">
            <span className="text-red-700 dark:text-red-400 text-xs">{error}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => send(lastUserText.current)} data-testid="assistant-retry-btn">
              <RotateCw className="h-3 w-3 mr-1" />Riprova
            </Button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-border p-3 shrink-0">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Chiedimi qualcosa..."
            rows={compact ? 1 : 2}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            data-testid="assistant-input"
          />
          <Button type="submit" size="icon" className="h-10 w-10 rounded-xl shrink-0" disabled={streaming || !input.trim()} data-testid="assistant-send-btn">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
};
