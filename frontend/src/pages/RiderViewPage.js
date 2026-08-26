import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { NotificationBell } from '../components/NotificationBell';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import {
  Truck, MapPin, Clock, Check, Play, AlertTriangle,
  Navigation, ChevronLeft, ChevronRight, Camera,
  LogOut, Moon, Sun, KeyRound,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';
import { StatusBadge } from '../components/kilolava/badges';
import { FERMATA_STATUS, KIND_TONES } from './consegne/shared';

const STATUS_BORDER = {
  assigned: 'border-sky-400 bg-sky-50 dark:bg-sky-950/30',
  unassigned: 'border-border',
  in_progress: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
  completed: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
  problem: 'border-red-400 bg-red-50 dark:bg-red-950/30',
  cancelled: 'border-border opacity-60',
};

const RiderViewPage = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [fermate, setFermate] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date()));
  const [expanded, setExpanded] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [problemText, setProblemText] = useState('');
  const [showProblem, setShowProblem] = useState(null);

  const fetchFermate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/consegne/mie-fermate', { params: { date: selectedDate } });
      setFermate(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { fetchFermate(); }, [fetchFermate]);

  const shiftDate = (days) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    const label = dateStr === today ? 'Oggi - ' : '';
    return `${label}${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`;
  };

  const start = async (id) => {
    try { await api.put(`/consegne/fermate/${id}/start`); toast.success('Fermata avviata'); fetchFermate(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const completa = async (id) => {
    try {
      await api.post(`/consegne/fermate/${id}/completa`, { note: noteText || null });
      toast.success('Fermata completata!');
      setNoteText(''); setExpanded(null);
      fetchFermate();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const problema = async (id) => {
    if (!problemText.trim()) { toast.error('Descrivi il problema'); return; }
    try {
      await api.put(`/consegne/fermate/${id}/problema`, { note: problemText });
      toast.success('Problema segnalato');
      setProblemText(''); setShowProblem(null);
      fetchFermate();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
  };

  const handlePhotoSelect = (id) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/consegne/fermate/${id}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success('Foto caricata');
        fetchFermate();
      } catch { toast.error('Errore upload foto'); }
    };
    input.click();
  };

  const openMaps = (address) => {
    if (!address) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  const active = fermate.filter((f) => ['assigned', 'in_progress', 'problem'].includes(f.status));
  const done = fermate.filter((f) => f.status === 'completed');
  const ordered = [
    ...active.filter((f) => f.status === 'in_progress'),
    ...active.filter((f) => f.status === 'assigned'),
    ...active.filter((f) => f.status === 'problem'),
  ];

  return (
    <div className="min-h-screen bg-background" data-testid="rider-view-page">
      <header className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#F24E75]/10 flex items-center justify-center text-sm font-bold text-[#F24E75]">
              {user?.name?.charAt(0).toUpperCase() || 'R'}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Rider</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={logout} data-testid="rider-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="px-4 py-3 space-y-4 pb-20">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)} data-testid="rider-day-prev">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-semibold capitalize" data-testid="rider-day-label">{formatDate(selectedDate)}</p>
            <p className="text-xs text-muted-foreground">{fermate.length} fermate assegnate</p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => shiftDate(1)} data-testid="rider-day-next">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {fermate.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span data-testid="rider-progress-label">{done.length} di {fermate.length} completate</span>
              <span>{Math.round((done.length / fermate.length) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${(done.length / fermate.length) * 100}%` }} />
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
        ) : fermate.length === 0 ? (
          <div className="text-center py-12">
            <Truck className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">Nessuna fermata per questa giornata</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ordered.map((f, idx) => {
              const st = FERMATA_STATUS[f.status] || FERMATA_STATUS.assigned;
              const isExp = expanded === f.id;
              return (
                <Card key={f.id} className={cn('border-l-4 transition-all', STATUS_BORDER[f.status], f.status === 'in_progress' && 'ring-2 ring-amber-400/50')} data-testid={`rider-fermata-${f.id}`}>
                  <CardContent className="p-0">
                    <div className="p-3 cursor-pointer" onClick={() => setExpanded(isExp ? null : f.id)}>
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {f.route_order || idx + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold">{f.destination}</span>
                            <StatusBadge tone={st.tone} className="!py-0.5">{st.label}</StatusBadge>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {(f.lines || []).map((l, i) => (
                              <StatusBadge key={i} tone={KIND_TONES[l.category] || 'cancelled'} className="!py-0.5">{l.category_label}</StatusBadge>
                            ))}
                          </div>
                          {f.address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3 flex-shrink-0" /><span className="truncate">{f.address}</span>
                            </p>
                          )}
                          {f.time_window_start && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <Clock className="h-3 w-3" />{f.time_window_start}{f.time_window_end ? ` - ${f.time_window_end}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {isExp && (
                      <div className="border-t border-border px-3 py-3 space-y-3 bg-card/50">
                        {(f.lines || []).map((l, i) => (
                          <div key={i}>
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-1">{l.category_label}</p>
                            {(l.items || []).map((it, j) => (
                              <div key={j} className="flex items-center justify-between py-0.5 text-sm">
                                <span>{it.name}</span>
                                <span className="font-medium text-xs px-1.5 py-0.5 rounded bg-muted">x{it.qty}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                        {f.access_details && (
                          <div className="bg-muted/50 rounded-lg p-2.5">
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5">Accesso</p>
                            <p className="text-sm flex items-start gap-1.5">
                              <KeyRound className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />{f.access_details}
                            </p>
                          </div>
                        )}
                        {f.notes && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase mb-0.5">Note</p>
                            <p className="text-sm">{f.notes}</p>
                          </div>
                        )}
                        {f.problem_notes && (
                          <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2.5">
                            <p className="text-xs font-medium text-red-600 uppercase mb-0.5">Problema</p>
                            <p className="text-sm text-red-700 dark:text-red-300">{f.problem_notes}</p>
                          </div>
                        )}
                        {f.address && (
                          <Button variant="outline" size="sm" className="w-full h-10 gap-1.5" onClick={() => openMaps(f.address)} data-testid={`navigate-${f.id}`}>
                            <Navigation className="h-4 w-4" />Apri navigatore
                          </Button>
                        )}
                        {showProblem === f.id && (
                          <div className="space-y-2 bg-red-50 dark:bg-red-950/20 p-3 rounded-lg">
                            <p className="text-xs font-medium text-red-700 dark:text-red-400">Segnala problema</p>
                            <Textarea value={problemText} onChange={(e) => setProblemText(e.target.value)} placeholder="Descrivi il problema..." rows={2} className="resize-none text-sm" data-testid={`problem-text-${f.id}`} />
                            <Button size="sm" className="w-full h-9 bg-red-600 hover:bg-red-700 text-white" onClick={() => problema(f.id)} data-testid={`report-problem-${f.id}`}>
                              Invia segnalazione
                            </Button>
                          </div>
                        )}
                        {f.status === 'in_progress' && (
                          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Note consegna (facoltative)" rows={2} className="resize-none text-sm" data-testid={`completion-note-${f.id}`} />
                        )}
                        <div className="flex gap-2">
                          {f.status === 'assigned' && (
                            <Button className="flex-1 h-11 gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium" onClick={() => start(f.id)} data-testid={`start-fermata-${f.id}`}>
                              <Play className="h-4 w-4" />Inizia
                            </Button>
                          )}
                          {f.status === 'in_progress' && (
                            <Button className="flex-1 h-11 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium" onClick={() => completa(f.id)} data-testid={`complete-fermata-${f.id}`}>
                              <Check className="h-4 w-4" />Completata
                            </Button>
                          )}
                          {f.status === 'in_progress' && (
                            <Button variant="outline" className="h-11 gap-1.5" onClick={() => handlePhotoSelect(f.id)} data-testid={`photo-btn-${f.id}`}>
                              <Camera className="h-4 w-4" />
                            </Button>
                          )}
                          {['assigned', 'in_progress'].includes(f.status) && showProblem !== f.id && (
                            <Button variant="outline" className="h-11 gap-1.5 text-red-600 border-red-200 dark:border-red-800" onClick={() => setShowProblem(f.id)} data-testid={`problem-btn-${f.id}`}>
                              <AlertTriangle className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {f.confirmation_photo && (
                          <div className="text-xs text-emerald-600 flex items-center gap-1"><Camera className="h-3 w-3" />Foto caricata</div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {done.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">Completate ({done.length})</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {done.map((f) => (
                  <Card key={f.id} className={cn('border-l-4 opacity-60', STATUS_BORDER.completed)} data-testid={`rider-fermata-${f.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Check className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-semibold">{f.destination}</span>
                        {(f.lines || []).map((l, i) => (
                          <StatusBadge key={i} tone={KIND_TONES[l.category] || 'cancelled'} className="!py-0.5">{l.category_label}</StatusBadge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RiderViewPage;
