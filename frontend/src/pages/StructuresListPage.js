import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { structuresApi, clientsApi } from '../lib/api';
import { ExportButton } from '../components/ExportButton';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Building2, Plus, Search, MapPin, Key, Sparkles, Shirt, Package, Wrench,
  Pencil, Trash2, ChevronRight, Home, Hotel, Briefcase, LayoutGrid, List, Link2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const CATEGORY_MAP = {
  apartment: { label: 'Appartamento', icon: Home, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  guesthouse: { label: 'Affittacamere / B&B', icon: Hotel, cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  hotel: { label: 'Hotel', icon: Hotel, cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  office: { label: 'Ufficio', icon: Briefcase, cls: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300' },
  other: { label: 'Altro', icon: Building2, cls: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300' },
};

const SERVICE_ICONS = {
  cleaning: { icon: Sparkles, label: 'Pulizia', color: 'text-violet-500' },
  private_laundry: { icon: Shirt, label: 'Lav. Privata', color: 'text-blue-500' },
  rental_laundry: { icon: Shirt, label: 'Lav. Noleggio', color: 'text-cyan-500' },
  consumables: { icon: Package, label: 'Consumabili', color: 'text-teal-500' },
  maintenance: { icon: Wrench, label: 'Manutenzioni', color: 'text-orange-500' },
};

const ACCESS_MAP = {
  keybox: 'Keybox',
  keys: 'Chiavi',
  code: 'Codice',
};

const StructuresListPage = () => {
  const navigate = useNavigate();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewMode, setViewMode] = useState('list');

  const fetchStructures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await structuresApi.getAll();
      setStructures(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStructures(); }, [fetchStructures]);

  const filtered = structures.filter(s => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.address || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.client_name || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || s.structure_type === filterCategory;
    return matchSearch && matchCat;
  });

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Eliminare questa struttura?')) return;
    try {
      await structuresApi.delete(id);
      toast.success('Struttura eliminata');
      fetchStructures();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Errore');
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="structures-list-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Strutture</h1>
          <p className="text-sm text-muted-foreground">{structures.length} strutture registrate</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton entity="structures" className="h-9" />
          <Button
            onClick={() => navigate('/structures/new')}
            className="bg-[#F24E75] hover:bg-[#E03B62] text-white"
            data-testid="add-structure-btn"
          >
            <Plus className="h-4 w-4 mr-1.5" />Nuova Struttura
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca nome, indirizzo, proprietario..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
                data-testid="search-input"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="filter-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {Object.entries(CATEGORY_MAP).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
              <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('list')} className="h-7 px-2">
                <List className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('grid')} className="h-7 px-2">
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nessuna struttura trovata</p>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Nome</th>
                <th className="text-left px-3 py-2.5 font-medium">Indirizzo</th>
                <th className="text-left px-3 py-2.5 font-medium">Categoria</th>
                <th className="text-left px-3 py-2.5 font-medium">Servizi</th>
                <th className="text-center px-3 py-2.5 font-medium">Accesso</th>
                <th className="text-right px-4 py-2.5 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(s => {
                const cat = CATEGORY_MAP[s.structure_type] || CATEGORY_MAP.other;
                return (
                  <tr
                    key={s.id}
                    className="hover:bg-accent/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/structures/${s.id}`)}
                    data-testid={`structure-row-${s.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-xs">{s.name}</div>
                        {s.ical_url && <Link2 className="h-3 w-3 text-blue-500" />}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        {s.address || '-'}{s.floor ? `, Piano ${s.floor}` : ''}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', cat.cls)}>
                        {cat.label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {(s.services || []).map(svc => {
                          const si = SERVICE_ICONS[svc];
                          if (!si) return null;
                          return <si.icon key={svc} className={cn('h-3.5 w-3.5', si.color)} title={si.label} />;
                        })}
                        {(!s.services || s.services.length === 0) && <span className="text-[10px] text-muted-foreground">-</span>}
                      </div>
                    </td>
                    <td className="text-center px-3 py-3">
                      <span className="text-xs flex items-center justify-center gap-1">
                        <Key className="h-3 w-3 text-muted-foreground" />
                        {ACCESS_MAP[s.access_type] || s.access_type}
                      </span>
                    </td>
                    <td className="text-right px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={e => { e.stopPropagation(); navigate(`/structures/${s.id}`); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={e => handleDelete(s.id, e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(s => {
            const cat = CATEGORY_MAP[s.structure_type] || CATEGORY_MAP.other;
            const CatIcon = cat.icon;
            return (
              <Card
                key={s.id}
                className="border hover:shadow-sm transition-shadow cursor-pointer"
                onClick={() => navigate(`/structures/${s.id}`)}
                data-testid={`structure-card-${s.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', cat.cls.split(' ')[0])}>
                        <CatIcon className={cn('h-4 w-4', cat.cls.split(' ').slice(1).join(' '))} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', cat.cls)}>{cat.label}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); navigate(`/structures/${s.id}`); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={e => handleDelete(s.id, e)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {s.address && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.address}{s.floor ? `, P.${s.floor}` : ''}</span>
                    )}
                    <span className="flex items-center gap-1"><Key className="h-3 w-3" />{ACCESS_MAP[s.access_type] || s.access_type}</span>
                    {s.unit_count > 0 && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{s.unit_count} unita</span>}
                  </div>
                  {(s.services || []).length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-border">
                      {s.services.map(svc => {
                        const si = SERVICE_ICONS[svc];
                        if (!si) return null;
                        return <si.icon key={svc} className={cn('h-3.5 w-3.5', si.color)} title={si.label} />;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StructuresListPage;
