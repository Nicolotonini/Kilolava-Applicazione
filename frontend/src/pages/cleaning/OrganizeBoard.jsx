import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { X, MapPin, GripVertical, UserPlus, Sparkles, Search, Settings, Users, Loader2, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { isUnassigned, bedsLabel, fmtMinutes, CONF_LABEL } from './shared';
import { DaySelector } from './controls';
import { OperatorCard } from './BoardCards';
import { ProposalDialog } from './ProposalDialog';
import { AvailabilityDialog, BoardSettingsDialog } from './AvailabilityDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';

const CARD_W = 290;
const GAP = 16;
const PER_ROW = 4;
const MAX_CARD_H = 640;

export function OrganizeBoard({ date, setDate, onDetail, onAssignDialog, refreshKey, onNewTask }) {
  const [board, setBoard] = useState(null);
  const [filter, setFilter] = useState('all');
  const [zoom, setZoom] = useState(1);
  const [positions, setPositions] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [proposing, setProposing] = useState(false);
  const [availCleaner, setAvailCleaner] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandCard, setExpandCard] = useState(null);
  const [addMemberGroup, setAddMemberGroup] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const scrollRef = useRef(null);
  const saveTimer = useRef(null);
  const layoutLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/cleaning-board', { params: { date } });
      setBoard(r.data);
      if (!layoutLoaded.current) {
        setPositions(r.data.layout?.positions || {});
        if (r.data.layout?.zoom) setZoom(r.data.layout.zoom);
        layoutLoaded.current = true;
      }
    } catch (e) { toast.error('Errore caricamento board'); }
  }, [date]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { setSelectedIds([]); }, [date]);

  const tasks = useMemo(() => (board?.tasks || []).filter(t => t.status !== 'cancelled'), [board]);
  const cleaners = board?.cleaners || [];
  const groups = board?.groups || [];
  const threshold = board?.rest_threshold_days || 5;

  const cleanersById = useMemo(() => Object.fromEntries(cleaners.map(c => [c.id, c])), [cleaners]);

  const tasksOf = useCallback((cleanerId) =>
    tasks.filter(t => (t.assigned_cleaner_ids || []).includes(cleanerId) || t.assigned_cleaner_id === cleanerId)
      .sort((a, b) => {
        const oa = a.route_order?.[cleanerId] ?? 9999;
        const ob = b.route_order?.[cleanerId] ?? 9999;
        if (oa !== ob) return oa - ob;
        return (a.scheduled_time || '99').localeCompare(b.scheduled_time || '99');
      }), [tasks]);

  const cards = useMemo(() => {
    const groupedIds = new Set(groups.flatMap(g => g.operator_ids || []));
    const list = [];
    groups.forEach(g => {
      const members = (g.operator_ids || []).map(id => cleanersById[id]).filter(Boolean);
      if (!members.length) return;
      const seen = new Set();
      const gTasks = [];
      tasksOf(members[0].id).forEach(t => { if (!seen.has(t.id)) { seen.add(t.id); gTasks.push(t); } });
      members.slice(1).forEach(m => tasksOf(m.id).forEach(t => { if (!seen.has(t.id)) { seen.add(t.id); gTasks.push(t); } }));
      const load = gTasks.reduce((s, t) => s + (t.predicted_duration_minutes || 0), 0);
      const capacity = members.reduce((s, m) => s + ((m.availability?.max_hours || 8) * 60), 0);
      const zones = [...new Set(gTasks.map(t => t.zone_name).filter(Boolean))];
      list.push({
        id: g.id, isGroup: true, name: g.name || members.map(m => m.name).join(' + '),
        memberIds: members.map(m => m.id), memberNames: members.map(m => m.name),
        tasks: gTasks, load, capacity, zonesPath: zones.join(' → '),
        availability: {}, consecutive_days: 0,
      });
    });
    cleaners.filter(c => !groupedIds.has(c.id)).forEach(c => {
      const cTasks = tasksOf(c.id);
      const load = cTasks.reduce((s, t) => s + (t.predicted_duration_minutes || 0), 0);
      const zones = [...new Set(cTasks.map(t => t.zone_name).filter(Boolean))];
      list.push({
        id: c.id, isGroup: false, name: c.name, memberIds: [c.id], memberNames: [c.name],
        tasks: cTasks, load, capacity: (c.availability?.max_hours || 8) * 60,
        zonesPath: zones.join(' → '), availability: c.availability || {},
        is_birthday: c.is_birthday || false,
        consecutive_days: c.consecutive_days || 0, last_rest_day: c.last_rest_day,
      });
    });
    return list;
  }, [groups, cleaners, cleanersById, tasksOf]);

  const compact = zoom < 0.8;

  const cardHeight = useCallback((c) => {
    if (compact) return 175;
    const header = c.isGroup || c.availability?.notes ? 72 : 58;
    const info = 88;
    const footer = c.isGroup ? 76 : 0;
    const tasksH = Math.max(1, c.tasks.length) * 48 + 14;
    return Math.min(Math.max(235, header + info + tasksH + footer), MAX_CARD_H);
  }, [compact]);

  const placedCards = useMemo(() => {
    const byCol = {};
    const unplaced = [];
    cards.forEach(c => {
      const p = positions[c.id];
      if (p && Number.isInteger(p.col) && p.col >= 0) {
        (byCol[p.col] = byCol[p.col] || []).push({ c, row: Number.isInteger(p.row) ? p.row : 999 });
      } else unplaced.push(c);
    });
    unplaced.forEach(c => {
      let best = 0, bestLen = Infinity;
      for (let i = 0; i < PER_ROW; i++) {
        const len = (byCol[i] || []).length;
        if (len < bestLen) { best = i; bestLen = len; }
      }
      (byCol[best] = byCol[best] || []).push({ c, row: 999 });
    });
    const out = [];
    Object.entries(byCol).forEach(([colStr, list]) => {
      const col = parseInt(colStr);
      list.sort((a, b) => a.row - b.row);
      let y = 0;
      list.forEach((item, i) => {
        const h = cardHeight(item.c);
        out.push({ ...item.c, col, row: i, x: col * (CARD_W + GAP), y, w: item.c.isGroup ? CARD_W + 40 : CARD_W, h });
        y += h + GAP;
      });
    });
    return out;
  }, [cards, positions, cardHeight]);

  const contentW = useMemo(() => Math.max(...placedCards.map(c => c.x + c.w), CARD_W) + GAP, [placedCards]);
  const contentH = useMemo(() => Math.max(...placedCards.map(c => c.y + c.h), 235) + GAP, [placedCards]);

  const saveLayout = useCallback((pos, z) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put('/cleaning-board/layout', { positions: pos, zoom: z }).catch(() => {});
    }, 600);
  }, []);

  const setZoomAndSave = (z) => { setZoom(z); saveLayout(positions, z); };

  const fitZoom = () => {
    const w = scrollRef.current?.clientWidth || 1200;
    const z = Math.min(1, Math.max(0.5, w / contentW));
    setZoomAndSave(Math.round(z * 100) / 100);
  };

  // ---- mutations ----
  const assign = async (taskId, cleanerId) => {
    try { await api.post(`/cleaning-tasks/${taskId}/assign`, { cleaner_id: cleanerId }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore assegnazione'); }
  };
  const assignGroup = async (taskId, groupId) => {
    try { await api.post(`/cleaning-tasks/${taskId}/assign-group`, { group_id: groupId }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore assegnazione gruppo'); }
  };
  const unassign = async (taskId, cleanerId) => {
    try { await api.delete(`/cleaning-tasks/${taskId}/assign/${cleanerId}`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };
  const saveOrder = async (memberIds, orderedIds) => {
    try {
      for (const cid of memberIds) {
        await api.put('/cleaning-tasks/route-order', { cleaner_id: cid, ordered_task_ids: orderedIds });
      }
      load();
    } catch (e) { toast.error('Errore nel salvataggio ordine'); }
  };

  // ---- drag & drop ----
  const onBoardDrop = (e) => {
    e.preventDefault();
    if (dragging?.type !== 'card') return;
    const content = scrollRef.current?.querySelector('[data-board-content]');
    if (!content) return;
    const rect = content.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const col = Math.max(0, Math.round((x - CARD_W / 2) / (CARD_W + GAP)));
    const colCards = placedCards.filter(c => c.col === col && c.id !== dragging.id).sort((a, b) => a.y - b.y);
    let insertAt = colCards.length;
    for (let i = 0; i < colCards.length; i++) {
      if (y < colCards[i].y + colCards[i].h / 2) { insertAt = i; break; }
    }
    const byCol = {};
    placedCards.filter(c => c.id !== dragging.id).forEach(c => { (byCol[c.col] = byCol[c.col] || []).push(c); });
    Object.values(byCol).forEach(l => l.sort((a, b) => a.y - b.y));
    const target = byCol[col] = byCol[col] || [];
    target.splice(Math.min(insertAt, target.length), 0, { id: dragging.id });
    const newPos = {};
    Object.entries(byCol).forEach(([cStr, list]) => list.forEach((c, i) => { newPos[c.id] = { col: parseInt(cStr), row: i }; }));
    setPositions(newPos);
    saveLayout(newPos, zoom);
    setDragging(null);
  };

  const onDropTask = (card) => {
    if (dragging?.type === 'task' || dragging?.type === 'chip') {
      const task = dragging.task;
      if (dragging.type === 'chip' && dragging.cardId === card.id) { setDragging(null); return; }
      if (card.isGroup) assignGroup(task.id, card.id);
      else assign(task.id, card.memberIds[0]);
    }
    setDragging(null);
  };

  const onDropOnChip = (card, index) => {
    if (dragging?.type === 'chip' && dragging.cardId === card.id) {
      const ids = card.tasks.map(t => t.id).filter(id => id !== dragging.task.id);
      ids.splice(Math.min(index, ids.length), 0, dragging.task.id);
      saveOrder(card.memberIds, ids);
    } else {
      onDropTask(card);
      return;
    }
    setDragging(null);
  };

  const onRemoveTask = (card, task) => {
    if (card.isGroup) card.memberIds.forEach(cid => { if ((task.assigned_cleaner_ids || []).includes(cid)) unassign(task.id, cid); });
    else unassign(task.id, card.memberIds[0]);
  };

  const dragHintFor = (card) => {
    if (dragging?.type !== 'task' && dragging?.type !== 'chip') return null;
    const task = dragging.task;
    if (!task?.zone_name) return null;
    if (!card.tasks.length) return { ok: true, text: '✓ Prima pulizia del giro' };
    const zones = new Set(card.tasks.map(t => t.zone_name).filter(Boolean));
    if (zones.has(task.zone_name)) return { ok: true, text: '✓ Coerente con il giro attuale' };
    return { ok: false, text: `⚠ Aggiunge uno spostamento verso ${task.zone_name}` };
  };

  // ---- gruppi ----
  const createGroup = async () => {
    try {
      await api.post('/cleaning-board/groups', { date, operator_ids: selectedIds });
      toast.success('Gruppo creato');
      setSelectedIds([]);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore creazione gruppo'); }
  };

  const onGroupAction = async (card, action, memberId) => {
    try {
      if (action === 'dissolve') {
        if (!window.confirm('Sciogliere il gruppo? Le pulizie assegnate restano invariate.')) return;
        await api.delete(`/cleaning-board/groups/${card.id}`);
        toast.success('Gruppo sciolto: assegnazioni mantenute');
      } else if (action === 'remove_member') {
        const remaining = card.memberIds.filter(id => id !== memberId);
        if (remaining.length < 2) {
          if (!window.confirm('Rimuovendo questa addetta il gruppo si scioglie. Continuare?')) return;
          await api.delete(`/cleaning-board/groups/${card.id}`);
        } else {
          await api.put(`/cleaning-board/groups/${card.id}`, { operator_ids: remaining });
        }
      } else if (action === 'add_member') {
        setAddMemberGroup(card);
        return;
      }
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  // ---- proposta ----
  const propose = async () => {
    setProposing(true);
    try {
      const r = await api.post(`/cleaning-board/propose?date=${date}`);
      setProposal(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore proposta'); }
    finally { setProposing(false); }
  };
  const applyProposal = async () => {
    try {
      await api.post('/cleaning-board/propose/apply', { assignments: proposal.assignments });
      toast.success('Proposta applicata: puoi sempre correggere con il drag & drop');
      setProposal(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore applicazione'); }
  };

  // ---- ricerca ----
  const doSearch = (q) => {
    setSearch(q);
    if (!q.trim()) { setHighlightId(null); return; }
    const found = placedCards.find(c => c.name.toLowerCase().includes(q.toLowerCase()));
    if (found) {
      setHighlightId(found.id);
      scrollRef.current?.scrollTo({ left: Math.max(0, found.x * zoom - 60), top: Math.max(0, found.y * zoom - 40), behavior: 'smooth' });
    } else setHighlightId(null);
  };

  // ---- lista master sinistra ----
  const listTasks = useMemo(() => {
    let list = tasks;
    if (filter === 'unassigned') list = list.filter(isUnassigned);
    else if (filter === 'assigned') list = list.filter(t => !isUnassigned(t));
    return list;
  }, [tasks, filter]);

  const byZone = useMemo(() => {
    const out = {};
    listTasks.forEach(t => {
      const key = t.zone_name || 'Senza rione';
      (out[key] = out[key] || []).push(t);
    });
    return Object.entries(out).sort((a, b) => a[0].localeCompare(b[0]));
  }, [listTasks]);

  const summary = useMemo(() => ({
    total: tasks.length,
    unassigned: tasks.filter(isUnassigned).length,
    totalMinutes: tasks.reduce((s, t) => s + (t.predicted_duration_minutes || 0), 0),
    available: cleaners.filter(c => c.availability?.available !== false).length,
  }), [tasks, cleaners]);

  if (board === null) return <p className="text-center py-10 text-muted-foreground">Caricamento board...</p>;

  return (
    <div className="space-y-3" data-testid="operations-board">
      {/* Titolo + azioni principali */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <h1 className="text-xl lg:text-2xl font-heading font-semibold">Organizzazione Pulizie</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={propose} disabled={proposing} className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="propose-btn">
            {proposing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}Proponi organizzazione
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSettingsOpen(true)} title="Impostazioni board" data-testid="board-settings-btn"><Settings className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Giorno + riepilogo */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 xl:justify-between">
        <DaySelector date={date} onChange={setDate} testPrefix="org" />
        <div className="flex items-center gap-2 text-sm flex-wrap" data-testid="board-summary">
          <span className="font-semibold">{summary.total} pulizie</span>
          <span className={cn('font-medium', summary.unassigned > 0 ? 'text-amber-600' : 'text-emerald-600')} data-testid="org-unassigned-count">{summary.unassigned} da assegnare</span>
          <span className="text-muted-foreground">{fmtMinutes(summary.totalMinutes)} previste</span>
          <span className="text-muted-foreground">{summary.available} addette disponibili</span>
        </div>
      </div>

      {/* Controlli board: ricerca addetta + zoom (a destra, riferiti alla board) */}
      <div className="hidden lg:flex items-center gap-2 flex-wrap justify-end">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => doSearch(e.target.value)} placeholder="Cerca addetta..." className="h-8 pl-8 w-44 text-xs" data-testid="board-search-input" />
        </div>
        <div className="flex items-center gap-1" data-testid="zoom-controls">
          {[1, 0.8, 0.6].map(z => (
            <button key={z} onClick={() => setZoomAndSave(z)}
              className={cn('px-2.5 py-1 rounded-md text-xs font-medium tabular-nums',
                zoom === z ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
              data-testid={`zoom-${z * 100}`}>{z * 100}%</button>
          ))}
          <button onClick={fitZoom} className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:text-foreground" data-testid="zoom-fit">Adatta</button>
        </div>
      </div>

      {/* ===== Desktop board ===== */}
      <div className="hidden lg:flex gap-3 items-start">
        {/* Colonna PULIZIE — sempre visibile */}
        <div className="w-72 shrink-0 max-h-[calc(100vh-15rem)] overflow-y-auto pr-1 space-y-4" data-testid="org-master-list">
          <div className="sticky top-0 bg-background z-10 pb-2 space-y-2 border-b border-border/60">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground pt-1">Pulizie</p>
            {onNewTask && (
              <Button onClick={onNewTask} size="sm" className="w-full h-8 bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="col-new-cleaning-btn">
                <Plus className="h-4 w-4 mr-1" />Nuova pulizia
              </Button>
            )}
            <div className="flex gap-1">
              {[{ key: 'all', label: 'Tutte' }, { key: 'unassigned', label: 'Da assegnare' }, { key: 'assigned', label: 'Assegnate' }].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={cn('px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap',
                    filter === f.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
                  data-testid={`org-filter-${f.key}`}>{f.label}</button>
              ))}
            </div>
          </div>
          {byZone.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">Nessuna pulizia</p>}
          {byZone.map(([zone, list]) => (
            <div key={zone}>
              <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                <MapPin className="h-3 w-3 text-primary" />{zone} — {list.length}
              </p>
              <div className="space-y-1.5">
                {list.map(t => (
                  <MasterChip key={t.id} task={t}
                    onDragStart={() => setDragging({ type: 'task', task: t })}
                    onDragEnd={() => setDragging(null)}
                    onDetail={onDetail} onAssignDialog={onAssignDialog} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Area organizzazione */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto rounded-xl border border-border bg-muted/10 h-[calc(100vh-15rem)]"
          onDragOver={e => e.preventDefault()}
          onDrop={onBoardDrop}
          data-testid="board-area"
        >
          <div style={{ width: contentW * zoom + 24, height: contentH * zoom + 24, position: 'relative' }}>
            <div data-board-content style={{ width: contentW, height: contentH, transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'absolute', top: 12, left: 12 }}>
              {placedCards.map(card => (
                <OperatorCard
                  key={card.id}
                  card={card}
                  compact={compact}
                  selected={selectedIds.includes(card.id)}
                  highlighted={highlightId === card.id}
                  dragHint={dragHintFor(card)}
                  restThreshold={threshold}
                  onSelect={(c) => setSelectedIds(s => s.includes(c.id) ? s.filter(x => x !== c.id) : [...s, c.id])}
                  onDropTask={onDropTask}
                  onDragStartCard={(id) => setDragging({ type: 'card', id })}
                  onDragStartChip={(c, task, index) => setDragging({ type: 'chip', cardId: c.id, task, index })}
                  onDropOnChip={onDropOnChip}
                  onRemoveTask={onRemoveTask}
                  onDetail={onDetail}
                  onAvailability={(c) => setAvailCleaner(cleanersById[c.memberIds[0]])}
                  onExpand={setExpandCard}
                  onGroupAction={onGroupAction}
                />
              ))}
              {placedCards.length === 0 && <p className="text-sm text-muted-foreground p-8">Nessuna addetta registrata</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Barra creazione gruppo */}
      {selectedIds.length >= 2 && (
        <div className="hidden lg:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-40 items-center gap-3 rounded-full bg-foreground text-background px-5 py-2.5 shadow-xl">
          <span className="text-sm font-medium">{selectedIds.length} addette selezionate</span>
          <Button size="sm" className="h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={createGroup} data-testid="create-group-btn">
            <Users className="h-3.5 w-3.5 mr-1.5" />Metti in gruppo
          </Button>
          <button onClick={() => setSelectedIds([])} className="text-background/70 hover:text-background" data-testid="clear-selection-btn"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ===== Mobile: versione semplificata ===== */}
      <div className="lg:hidden space-y-4" data-testid="org-mobile-list">
        {onNewTask && (
          <Button onClick={onNewTask} size="sm" className="w-full h-9 bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="mobile-new-cleaning-btn">
            <Plus className="h-4 w-4 mr-1" />Nuova pulizia
          </Button>
        )}
        {byZone.map(([zone, list]) => (
          <div key={zone}>
            <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              <MapPin className="h-3 w-3 text-primary" />{zone} · {list.length}
            </p>
            <div className="space-y-1.5">
              {list.map(t => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="min-w-0 flex-1" onClick={() => onDetail(t)}>
                    <p className="text-sm font-semibold truncate">{t.structure_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.guests_count ? `${t.guests_count} pax` : ''}{bedsLabel(t) ? ` · ${bedsLabel(t)}` : ''} · ~{fmtMinutes(t.predicted_duration_minutes)}
                    </p>
                    {t.cleaner_names?.length > 0
                      ? <p className="text-xs text-primary font-medium">{t.cleaner_names.join(' + ')}</p>
                      : <p className="text-xs text-amber-600 font-medium">Da assegnare</p>}
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => onAssignDialog(t)} data-testid={`mobile-assign-${t.id}`}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" />Assegna
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {byZone.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nessuna pulizia in questa giornata</p>}
      </div>

      {/* Dialogs */}
      {proposal && <ProposalDialog proposal={proposal} onApply={applyProposal} onClose={() => setProposal(null)} />}
      {availCleaner && <AvailabilityDialog cleaner={availCleaner} onClose={() => setAvailCleaner(null)} onSaved={() => { setAvailCleaner(null); load(); }} />}
      {settingsOpen && <BoardSettingsDialog threshold={threshold} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); load(); }} />}
      {expandCard && <ExpandCardDialog card={placedCards.find(c => c.id === expandCard.id) || expandCard} onClose={() => setExpandCard(null)} onDetail={onDetail} />}
      {addMemberGroup && (
        <AddMemberDialog
          group={addMemberGroup}
          cleaners={cleaners.filter(c => !groups.some(g => (g.operator_ids || []).includes(c.id)))}
          onClose={() => setAddMemberGroup(null)}
          onAdd={async (cid) => {
            try {
              await api.put(`/cleaning-board/groups/${addMemberGroup.id}`, { operator_ids: [...addMemberGroup.memberIds, cid] });
              setAddMemberGroup(null);
              load();
            } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
          }}
        />
      )}
    </div>
  );
}

const MasterChip = React.memo(function MasterChip({ task, onDragStart, onDragEnd, onDetail, onAssignDialog }) {
  const assigned = !isUnassigned(task);
  return (
    <div
      draggable
      onDragStart={e => { onDragStart(); e.dataTransfer.setData('text/plain', task.id); }}
      onDragEnd={onDragEnd}
      onClick={() => onDetail(task)}
      className={cn('group rounded-lg border px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none transition-colors',
        assigned ? 'border-emerald-300/70 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-border bg-card hover:border-primary/40')}
      data-testid={`org-task-${task.id}`}
    >
      <div className="flex items-center gap-1.5">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{task.structure_name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {task.guests_count ? `${task.guests_count} pax` : ''}{bedsLabel(task) ? ` · ${bedsLabel(task)}` : ''}
          </p>
          <p className="text-xs text-muted-foreground truncate" data-testid={`org-task-pred-${task.id}`}>
            ~{fmtMinutes(task.predicted_duration_minutes)} <span className="text-muted-foreground/60">· {CONF_LABEL[task.prediction_confidence] || 'Stima'}</span>
            {task.checkin_today && task.checkin_time && <span className="text-amber-600 font-semibold"> · CI {task.checkin_time}</span>}
          </p>
          {assigned
            ? <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium truncate" data-testid={`org-task-assigned-${task.id}`}>{(task.cleaner_names || []).join(' + ')}</p>
            : <p className="text-xs text-amber-600 font-medium" data-testid={`org-task-unassigned-${task.id}`}>Da assegnare</p>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onAssignDialog(task); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
          title="Assegna addette"
          data-testid={`org-assign-btn-${task.id}`}
        >
          <UserPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});

function ExpandCardDialog({ card, onClose, onDetail }) {
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto" data-testid="expand-card-dialog">
        <DialogHeader>
          <DialogTitle className="uppercase">{card.name}</DialogTitle>
          <DialogDescription>
            {card.tasks.length} pulizie · {fmtMinutes(card.load)} previste / {fmtMinutes(card.capacity)} disponibili
            {card.consecutive_days > 0 ? ` · ${card.consecutive_days}° giorno consecutivo` : ''}
          </DialogDescription>
        </DialogHeader>
        {card.zonesPath && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" />{card.zonesPath}</p>}
        <div className="space-y-1">
          {card.tasks.map((t, i) => (
            <div key={t.id} onClick={() => onDetail(t)} className="flex items-center justify-between text-xs rounded-lg bg-muted/40 px-2.5 py-1.5 cursor-pointer">
              <span className="font-medium">{i + 1}. {t.structure_name}</span>
              <span className="text-muted-foreground">~{fmtMinutes(t.predicted_duration_minutes)}{t.checkin_today && t.checkin_time ? ` · CI ${t.checkin_time}` : ''}</span>
            </div>
          ))}
          {card.tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nessuna pulizia assegnata</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddMemberDialog({ group, cleaners, onClose, onAdd }) {
  const candidates = cleaners.filter(c => !group.memberIds.includes(c.id));
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xs" data-testid="add-member-dialog">
        <DialogHeader>
          <DialogTitle>Aggiungi al gruppo</DialogTitle>
          <DialogDescription>{group.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {candidates.length === 0 && <p className="text-xs text-muted-foreground">Nessuna addetta disponibile</p>}
          {candidates.map(c => (
            <button key={c.id} onClick={() => onAdd(c.id)} className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-muted/60" data-testid={`add-member-${c.id}`}>
              {c.name}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
