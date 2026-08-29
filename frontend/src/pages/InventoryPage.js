import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { inventoryApi, clientsApi, structuresApi } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import { Card, CardContent } from '../components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Search, Pencil, Trash2, X, Package, AlertTriangle,
  ArrowDownToLine, ArrowUpFromLine, RotateCw, TrendingDown, TrendingUp,
  Filter, FileText, DollarSign, Layers
} from 'lucide-react';
import { cn } from '../lib/utils';

const CATEGORIES = ['rental_linen', 'consumable', 'kit_component'];
const MOVEMENT_TYPES = ['prepared', 'delivered', 'picked_up', 'returned', 'missing', 'damaged', 'restocked'];
const STOCK_IN = new Set(['returned', 'restocked']);
const STOCK_OUT = new Set(['prepared', 'delivered', 'missing', 'damaged']);

const CAT_COLORS = {
  rental_linen: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  consumable: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  kit_component: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};
const MOV_COLORS = {
  prepared: 'text-orange-600', delivered: 'text-blue-600', picked_up: 'text-emerald-600',
  returned: 'text-green-600', missing: 'text-red-600', damaged: 'text-red-500', restocked: 'text-teal-600',
};

const TABS = ['articles', 'movements', 'register', 'pricing'];

// Side Panel
const SidePanel = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[42%] lg:w-[34%] xl:w-[28%] bg-card border-l border-border z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8"><X className="h-4 w-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

const InventoryPage = () => {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useState(TABS.includes(urlTab) ? urlTab : 'articles');
  useEffect(() => {
    if (urlTab && TABS.includes(urlTab)) setTab(urlTab);
  }, [urlTab]);
  const [articles, setArticles] = useState([]);
  const [movements, setMovements] = useState([]);
  const [register, setRegister] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [stats, setStats] = useState(null);
  const [clients, setClients] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [thresholdFilter, setThresholdFilter] = useState(false);
  const [movFilter, setMovFilter] = useState({ type: 'all', client_id: '', date_from: '', date_to: '' });
  const [regMonth, setRegMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; });
  const [regFilter, setRegFilter] = useState({ client_id: '', structure_id: '', movement_type: '' });
  const [pricingClientFilter, setPricingClientFilter] = useState('all');

  // Panels
  const [articlePanel, setArticlePanel] = useState(false);
  const [movPanel, setMovPanel] = useState(false);
  const [pricingPanel, setPricingPanel] = useState(false);
  const [editArticle, setEditArticle] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: '' });

  // Forms
  const [artForm, setArtForm] = useState({ name: '', category: 'rental_linen', unit_type: 'pz', standard_price: 0, quantity_available: 0, minimum_threshold: 0, is_active: true, notes: '' });
  const [movForm, setMovForm] = useState({ movement_type: 'delivered', date: new Date().toISOString().slice(0,10), client_id: '', structure_id: '', unit_id: '', items: [{ article_id: '', quantity: 1 }], notes: '' });
  const [priceForm, setPriceForm] = useState({ client_id: '', article_id: '', custom_price: 0 });
  const [saving, setSaving] = useState(false);

  // Data fetchers
  const fetchArticles = useCallback(async () => {
    try {
      const params = {};
      if (searchQuery) params.search = searchQuery;
      if (catFilter !== 'all') params.category = catFilter;
      if (thresholdFilter) params.below_threshold = true;
      const res = await inventoryApi.getArticles(params);
      setArticles(res.data);
    } catch (e) { console.error(e); }
  }, [searchQuery, catFilter, thresholdFilter]);

  const fetchMovements = useCallback(async () => {
    const params = { limit: 50 };
    if (movFilter.type !== 'all') params.movement_type = movFilter.type;
    if (movFilter.client_id) params.client_id = movFilter.client_id;
    if (movFilter.date_from) params.date_from = movFilter.date_from;
    if (movFilter.date_to) params.date_to = movFilter.date_to;
    try {
      const res = await inventoryApi.getMovements(params);
      setMovements(res.data);
    } catch (e) { console.error(e); }
  }, [movFilter]);

  const fetchRegister = useCallback(async () => {
    const params = { month: regMonth };
    if (regFilter.client_id) params.client_id = regFilter.client_id;
    if (regFilter.structure_id) params.structure_id = regFilter.structure_id;
    if (regFilter.movement_type) params.movement_type = regFilter.movement_type;
    try {
      const res = await inventoryApi.getRegister(params);
      setRegister(res.data);
    } catch (e) { console.error(e); }
  }, [regMonth, regFilter]);

  const fetchPricing = useCallback(async () => {
    const params = {};
    if (pricingClientFilter !== 'all') params.client_id = pricingClientFilter;
    try {
      const res = await inventoryApi.getPricing(params);
      setPricing(res.data);
    } catch (e) { console.error(e); }
  }, [pricingClientFilter]);

  const fetchStats = useCallback(async () => {
    try { const res = await inventoryApi.getStats(); setStats(res.data); } catch (e) { console.error(e); }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [cRes, sRes] = await Promise.all([clientsApi.getAll(), structuresApi.getAll()]);
      setClients(cRes.data);
      setStructures(sRes.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchMeta(); fetchStats(); }, [fetchMeta, fetchStats]);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      if (tab === 'articles') await fetchArticles();
      else if (tab === 'movements') await fetchMovements();
      else if (tab === 'register') await fetchRegister();
      else if (tab === 'pricing') await fetchPricing();
      setLoading(false);
    };
    load();
  }, [tab, fetchArticles, fetchMovements, fetchRegister, fetchPricing]);

  // Actions
  const openNewArticle = () => {
    setEditArticle(null);
    setArtForm({ name: '', category: 'rental_linen', unit_type: 'pz', standard_price: 0, quantity_available: 0, minimum_threshold: 0, is_active: true, notes: '' });
    setArticlePanel(true);
  };

  const openEditArticle = (a) => {
    setEditArticle(a);
    setArtForm({ name: a.name, category: a.category, unit_type: a.unit_type, standard_price: a.standard_price, quantity_available: a.quantity_available, minimum_threshold: a.minimum_threshold, is_active: a.is_active, notes: a.notes || '' });
    setArticlePanel(true);
  };

  const saveArticle = async () => {
    if (!artForm.name.trim()) { toast.error('Nome richiesto'); return; }
    setSaving(true);
    try {
      if (editArticle) {
        await inventoryApi.updateArticle(editArticle.id, artForm);
        toast.success('Articolo aggiornato');
      } else {
        await inventoryApi.createArticle(artForm);
        toast.success('Articolo creato');
      }
      setArticlePanel(false);
      fetchArticles();
      fetchStats();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const openNewMovement = () => {
    setMovForm({ movement_type: 'delivered', date: new Date().toISOString().slice(0,10), client_id: '', structure_id: '', unit_id: '', items: [{ article_id: '', quantity: 1 }], notes: '' });
    setMovPanel(true);
  };

  const addMovItem = () => setMovForm(p => ({ ...p, items: [...p.items, { article_id: '', quantity: 1 }] }));
  const removeMovItem = (idx) => setMovForm(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  const updateMovItem = (idx, field, val) => setMovForm(p => ({ ...p, items: p.items.map((it, i) => i === idx ? { ...it, [field]: val } : it) }));

  const saveMovement = async () => {
    const validItems = movForm.items.filter(it => it.article_id && it.quantity > 0);
    if (validItems.length === 0) { toast.error('Aggiungi almeno un articolo'); return; }
    setSaving(true);
    try {
      await inventoryApi.createMovement({ ...movForm, items: validItems });
      toast.success('Movimento registrato');
      setMovPanel(false);
      fetchMovements();
      fetchArticles();
      fetchStats();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setSaving(false); }
  };

  const openNewPricing = () => {
    setPriceForm({ client_id: '', article_id: '', custom_price: 0 });
    setPricingPanel(true);
  };

  const savePricing = async () => {
    if (!priceForm.client_id || !priceForm.article_id) { toast.error('Seleziona cliente e articolo'); return; }
    setSaving(true);
    try {
      await inventoryApi.createPricing(priceForm);
      toast.success('Prezzo salvato');
      setPricingPanel(false);
      fetchPricing();
    } catch (e) { toast.error('Errore'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      if (deleteDialog.type === 'article') await inventoryApi.deleteArticle(deleteDialog.id);
      else if (deleteDialog.type === 'movement') await inventoryApi.deleteMovement(deleteDialog.id);
      else if (deleteDialog.type === 'pricing') await inventoryApi.deletePricing(deleteDialog.id);
      toast.success('Eliminato');
      setDeleteDialog({ open: false, type: '', id: '' });
      if (deleteDialog.type === 'article') { fetchArticles(); fetchStats(); }
      else if (deleteDialog.type === 'movement') { fetchMovements(); fetchArticles(); fetchStats(); }
      else fetchPricing();
    } catch (e) { toast.error('Errore'); }
  };

  const tabLabels = { articles: 'Articoli', movements: 'Movimenti', register: 'Registro', pricing: 'Prezzi' };
  const tabIcons = { articles: Package, movements: RotateCw, register: FileText, pricing: DollarSign };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="inventory-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">{t('nav.inventory')}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm">
            {stats && (
              <>
                <span className="text-muted-foreground">{stats.active_articles} articoli</span>
                {stats.below_threshold > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />{stats.below_threshold} sotto soglia
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'articles' && <Button onClick={openNewArticle} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="add-article-btn"><Plus className="h-4 w-4 mr-1" />Nuovo articolo</Button>}
          {tab === 'movements' && <Button onClick={openNewMovement} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="add-movement-btn"><Plus className="h-4 w-4 mr-1" />Nuovo movimento</Button>}
          {tab === 'pricing' && <Button onClick={openNewPricing} className="h-8 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="add-pricing-btn"><Plus className="h-4 w-4 mr-1" />Nuovo prezzo</Button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {TABS.map((t2) => {
          const Icon = tabIcons[t2];
          return (
            <Button key={t2} variant={tab === t2 ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab(t2)}
              className="h-8 gap-1.5" data-testid={`tab-${t2}`}>
              <Icon className="h-3.5 w-3.5" />{tabLabels[t2]}
            </Button>
          );
        })}
      </div>

      {/* === ARTICLES TAB === */}
      {tab === 'articles' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Cerca articolo..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-8" data-testid="article-search" />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c === 'rental_linen' ? 'Biancheria noleggio' : c === 'consumable' ? 'Consumabili' : 'Componenti kit'}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={thresholdFilter ? 'secondary' : 'ghost'} size="sm" onClick={() => setThresholdFilter(!thresholdFilter)} className="h-8 gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />Sotto soglia
            </Button>
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b border-border">
              <div className="grid grid-cols-[1fr_110px_80px_80px_80px_70px] items-center gap-2 px-4 py-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Articolo</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Categoria</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Prezzo</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Disp.</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Soglia</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">Azioni</span>
              </div>
            </div>
            {articles.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">{loading ? 'Caricamento...' : 'Nessun articolo trovato'}</div>
            ) : (
              <div className="divide-y divide-border">
                {articles.map(a => (
                  <div key={a.id} className="grid grid-cols-[1fr_110px_80px_80px_80px_70px] items-center gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors" data-testid={`article-${a.id}`}>
                    <div className="min-w-0">
                      <span className="text-sm font-medium truncate block">{a.name}</span>
                      {a.notes && <span className="text-xs text-muted-foreground truncate block">{a.notes}</span>}
                    </div>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded font-medium w-fit", CAT_COLORS[a.category])}>
                      {a.category === 'rental_linen' ? 'Noleggio' : a.category === 'consumable' ? 'Consumabile' : 'Kit'}
                    </span>
                    <span className="text-sm text-right tabular-nums">{a.standard_price.toFixed(2)}</span>
                    <span className={cn("text-sm font-semibold text-right tabular-nums", a.below_threshold && "text-red-600 dark:text-red-400")}>
                      {a.quantity_available}
                    </span>
                    <span className="text-sm text-muted-foreground text-right tabular-nums">{a.minimum_threshold}</span>
                    <div className="flex items-center justify-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditArticle(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteDialog({ open: true, type: 'article', id: a.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* === MOVEMENTS TAB === */}
      {tab === 'movements' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={movFilter.type} onValueChange={v => setMovFilter(p => ({ ...p, type: v }))}>
              <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                {MOVEMENT_TYPES.map(mt => <SelectItem key={mt} value={mt}>{mt.replace('_',' ')}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={movFilter.date_from} onChange={e => setMovFilter(p => ({ ...p, date_from: e.target.value }))} className="w-[140px] h-8" placeholder="Da" />
            <Input type="date" value={movFilter.date_to} onChange={e => setMovFilter(p => ({ ...p, date_to: e.target.value }))} className="w-[140px] h-8" placeholder="A" />
          </div>

          <div className="space-y-2">
            {movements.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">{loading ? 'Caricamento...' : 'Nessun movimento'}</div>
            ) : movements.map(m => (
              <Card key={m.id} className="kilolava-card" data-testid={`movement-${m.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {STOCK_IN.has(m.movement_type)
                        ? <ArrowDownToLine className="h-4 w-4 text-green-600 flex-shrink-0" />
                        : <ArrowUpFromLine className="h-4 w-4 text-red-500 flex-shrink-0" />}
                      <div>
                        <span className={cn("text-sm font-semibold capitalize", MOV_COLORS[m.movement_type])}>{m.movement_type.replace('_',' ')}</span>
                        <span className="text-xs text-muted-foreground ml-2">{m.date}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteDialog({ open: true, type: 'movement', id: m.id })}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {m.client_name && <span>{m.client_name}</span>}
                    {m.structure_name && <span>{m.structure_name}</span>}
                    {m.unit_name && <span>{m.unit_name}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.items.map((it, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs">
                        <span className="font-medium">{it.article_name || it.article_id}</span>
                        <span className="text-muted-foreground">x{it.quantity}</span>
                      </span>
                    ))}
                  </div>
                  {m.notes && <p className="text-xs text-muted-foreground mt-1.5">{m.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* === REGISTER TAB === */}
      {tab === 'register' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="month" value={regMonth} onChange={e => setRegMonth(e.target.value)} className="w-[160px] h-8" />
            <Select value={regFilter.client_id || 'all'} onValueChange={v => setRegFilter(p => ({ ...p, client_id: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="Cliente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i clienti</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={regFilter.movement_type || 'all'} onValueChange={v => setRegFilter(p => ({ ...p, movement_type: v === 'all' ? '' : v }))}>
              <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                {MOVEMENT_TYPES.map(mt => <SelectItem key={mt} value={mt}>{mt.replace('_',' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {register && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="kilolava-card"><CardContent className="p-3">
                  <p className="text-2xl font-bold tabular-nums">{register.total_movements}</p>
                  <p className="text-xs text-muted-foreground">Movimenti totali</p>
                </CardContent></Card>
                {Object.entries(register.totals_by_type || {}).map(([type, count]) => (
                  <Card key={type} className="kilolava-card"><CardContent className="p-3">
                    <p className={cn("text-xl font-bold tabular-nums", MOV_COLORS[type])}>{count}</p>
                    <p className="text-xs text-muted-foreground capitalize">{type.replace('_',' ')}</p>
                  </CardContent></Card>
                ))}
              </div>

              {/* Article summary */}
              {register.article_summary?.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden bg-card">
                  <div className="bg-muted/80 border-b border-border px-4 py-2">
                    <div className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Articolo</span>
                      <span className="text-xs font-medium text-muted-foreground uppercase text-right">Entrate</span>
                      <span className="text-xs font-medium text-muted-foreground uppercase text-right">Uscite</span>
                      <span className="text-xs font-medium text-muted-foreground uppercase text-right">Netto</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {register.article_summary.map((as, i) => (
                      <div key={i} className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 px-4 py-2">
                        <span className="text-sm font-medium truncate">{as.article_name}</span>
                        <span className="text-sm text-green-600 text-right tabular-nums flex items-center justify-end gap-1"><TrendingUp className="h-3 w-3" />{as.total_in}</span>
                        <span className="text-sm text-red-500 text-right tabular-nums flex items-center justify-end gap-1"><TrendingDown className="h-3 w-3" />{as.total_out}</span>
                        <span className={cn("text-sm font-semibold text-right tabular-nums", as.net >= 0 ? 'text-green-600' : 'text-red-500')}>{as.net > 0 ? '+' : ''}{as.net}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {register.total_movements === 0 && <p className="text-center text-muted-foreground py-8">Nessun movimento per questo mese</p>}
            </div>
          )}
        </div>
      )}

      {/* === PRICING TAB === */}
      {tab === 'pricing' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Select value={pricingClientFilter} onValueChange={setPricingClientFilter}>
              <SelectTrigger className="w-[200px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i clienti</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {pricing.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nessun prezzo personalizzato</div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="bg-muted/80 border-b border-border px-4 py-2">
                <div className="grid grid-cols-[1fr_1fr_90px_90px_60px] items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Cliente</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase">Articolo</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase text-right">Standard</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase text-right">Custom</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase text-center">Azioni</span>
                </div>
              </div>
              <div className="divide-y divide-border">
                {pricing.map(p => (
                  <div key={p.id} className="grid grid-cols-[1fr_1fr_90px_90px_60px] items-center gap-2 px-4 py-2.5">
                    <span className="text-sm truncate">{p.client_name}</span>
                    <span className="text-sm truncate">{p.article_name}</span>
                    <span className="text-sm text-muted-foreground text-right tabular-nums">{p.standard_price?.toFixed(2)}</span>
                    <span className="text-sm font-semibold text-right tabular-nums">{p.custom_price.toFixed(2)}</span>
                    <div className="flex justify-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteDialog({ open: true, type: 'pricing', id: p.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === ARTICLE PANEL === */}
      <SidePanel open={articlePanel} onClose={() => setArticlePanel(false)} title={editArticle ? 'Modifica articolo' : 'Nuovo articolo'}>
        <div className="p-5 space-y-4">
          <div className="space-y-2"><Label>Nome *</Label><Input value={artForm.name} onChange={e => setArtForm(p => ({ ...p, name: e.target.value }))} data-testid="article-name-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={artForm.category} onValueChange={v => setArtForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rental_linen">Biancheria noleggio</SelectItem>
                  <SelectItem value="consumable">Consumabile</SelectItem>
                  <SelectItem value="kit_component">Componente kit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Unità</Label><Input value={artForm.unit_type} onChange={e => setArtForm(p => ({ ...p, unit_type: e.target.value }))} placeholder="pz, kg, set" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>Prezzo std.</Label><Input type="number" step="0.01" min="0" value={artForm.standard_price} onChange={e => setArtForm(p => ({ ...p, standard_price: parseFloat(e.target.value) || 0 }))} /></div>
            <div className="space-y-2"><Label>Quantità</Label><Input type="number" min="0" value={artForm.quantity_available} onChange={e => setArtForm(p => ({ ...p, quantity_available: parseInt(e.target.value) || 0 }))} /></div>
            <div className="space-y-2"><Label>Soglia min.</Label><Input type="number" min="0" value={artForm.minimum_threshold} onChange={e => setArtForm(p => ({ ...p, minimum_threshold: parseInt(e.target.value) || 0 }))} /></div>
          </div>
          <div className="space-y-2"><Label>Note</Label><Textarea value={artForm.notes} onChange={e => setArtForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none" /></div>
          <div className="flex items-center justify-between"><Label>Attivo</Label><Switch checked={artForm.is_active} onCheckedChange={v => setArtForm(p => ({ ...p, is_active: v }))} /></div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3">
          <Button variant="outline" onClick={() => setArticlePanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={saveArticle} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-article-btn">{saving ? '...' : editArticle ? 'Aggiorna' : 'Crea'}</Button>
        </div>
      </SidePanel>

      {/* === MOVEMENT PANEL === */}
      <SidePanel open={movPanel} onClose={() => setMovPanel(false)} title="Nuovo movimento">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={movForm.movement_type} onValueChange={v => setMovForm(p => ({ ...p, movement_type: v }))}>
                <SelectTrigger data-testid="mov-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>{MOVEMENT_TYPES.map(mt => <SelectItem key={mt} value={mt}>{mt.replace('_',' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Data</Label><Input type="date" value={movForm.date} onChange={e => setMovForm(p => ({ ...p, date: e.target.value }))} /></div>
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={movForm.client_id || 'none'} onValueChange={v => setMovForm(p => ({ ...p, client_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Opzionale" /></SelectTrigger>
              <SelectContent><SelectItem value="none">-</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Struttura</Label>
            <Select value={movForm.structure_id || 'none'} onValueChange={v => setMovForm(p => ({ ...p, structure_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Opzionale" /></SelectTrigger>
              <SelectContent><SelectItem value="none">-</SelectItem>{structures.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label>Articoli</Label><Button variant="ghost" size="sm" onClick={addMovItem} className="h-7 text-xs"><Plus className="h-3 w-3 mr-1" />Aggiungi</Button></div>
            <div className="space-y-2">
              {movForm.items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={it.article_id || 'none'} onValueChange={v => updateMovItem(i, 'article_id', v === 'none' ? '' : v)}>
                    <SelectTrigger className="flex-1 h-8"><SelectValue placeholder="Articolo" /></SelectTrigger>
                    <SelectContent><SelectItem value="none">-</SelectItem>{articles.length > 0 ? articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>) : null}</SelectContent>
                  </Select>
                  <Input type="number" min="1" value={it.quantity} onChange={e => updateMovItem(i, 'quantity', parseInt(e.target.value) || 1)} className="w-20 h-8" />
                  {movForm.items.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeMovItem(i)}><X className="h-3 w-3" /></Button>}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2"><Label>Note</Label><Textarea value={movForm.notes} onChange={e => setMovForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="resize-none" /></div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3">
          <Button variant="outline" onClick={() => setMovPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={saveMovement} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-movement-btn">{saving ? '...' : 'Registra'}</Button>
        </div>
      </SidePanel>

      {/* === PRICING PANEL === */}
      <SidePanel open={pricingPanel} onClose={() => setPricingPanel(false)} title="Prezzo personalizzato">
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <Select value={priceForm.client_id || 'none'} onValueChange={v => setPriceForm(p => ({ ...p, client_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
              <SelectContent><SelectItem value="none">-</SelectItem>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Articolo *</Label>
            <Select value={priceForm.article_id || 'none'} onValueChange={v => setPriceForm(p => ({ ...p, article_id: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Seleziona articolo" /></SelectTrigger>
              <SelectContent><SelectItem value="none">-</SelectItem>{articles.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.standard_price.toFixed(2)})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Prezzo personalizzato</Label><Input type="number" step="0.01" min="0" value={priceForm.custom_price} onChange={e => setPriceForm(p => ({ ...p, custom_price: parseFloat(e.target.value) || 0 }))} /></div>
        </div>
        <div className="px-5 py-4 border-t border-border flex gap-3">
          <Button variant="outline" onClick={() => setPricingPanel(false)} className="flex-1">Annulla</Button>
          <Button onClick={savePricing} disabled={saving} className="flex-1 bg-[#F24E75] hover:bg-[#E03B62] text-white" data-testid="save-pricing-btn">{saving ? '...' : 'Salva'}</Button>
        </div>
      </SidePanel>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={v => !v && setDeleteDialog({ open: false, type: '', id: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Conferma eliminazione</AlertDialogTitle><AlertDialogDescription>Sei sicuro? L'operazione non è reversibile.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="confirm-delete-btn">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InventoryPage;
