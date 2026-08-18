import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { structuresApi } from '../lib/api';
import { ExportButton } from '../components/ExportButton';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Building2, Plus, Search, MapPin, User, Trash2, ArrowRight, Boxes,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

const SERVICE_LABELS = {
  cleaning: 'Pulizie',
  private_laundry: 'Lav. Privata',
  rental_laundry: 'Noleggio',
  consumables: 'Consumabili',
  maintenance: 'Manutenzioni',
};

const StructuresListPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const fetchStructures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await structuresApi.getAll();
      setStructures(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStructures(); }, [fetchStructures]);

  const q = search.trim().toLowerCase();
  const filtered = structures.filter(s =>
    !q ||
    (s.klv_code || '').toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q) ||
    (s.address || '').toLowerCase().includes(q) ||
    (s.client_name || '').toLowerCase().includes(q)
  );

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Eliminare questa struttura?')) return;
    try {
      await structuresApi.delete(id);
      toast.success('Struttura eliminata');
      fetchStructures();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Errore');
    }
  };

  return (
    <div className="p-4 lg:p-8 space-y-5" data-testid="structures-list-page">
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
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            data-testid="add-structure-btn"
          >
            <Plus className="h-4 w-4 mr-1.5" />Nuova Struttura
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca per codice KLV, nome, indirizzo o cliente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-10 pl-9"
          data-testid="search-input"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nessuna struttura trovata</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div
              key={s.id}
              onClick={() => navigate(`/structures/${s.id}`)}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 rounded-xl border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors group"
              data-testid={`structure-row-${s.id}`}
            >
              <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold flex-shrink-0" data-testid={`klv-${s.id}`}>
                {s.klv_code || '—'}
              </span>
              <div className="min-w-[180px] flex-1">
                <p className="font-semibold text-sm">{s.name}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  {s.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 flex-shrink-0" />{s.address}{s.floor ? `, P.${s.floor}` : ''}
                    </span>
                  )}
                  {s.client_name && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 flex-shrink-0" />{s.client_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(s.services || []).filter(svc => SERVICE_LABELS[svc]).map(svc => (
                  <span key={svc} className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-foreground/70">
                    {SERVICE_LABELS[svc]}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1.5 ml-auto" onClick={e => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => navigate(`/structure-inventory?structure_id=${s.id}`)}
                  data-testid={`open-warehouse-${s.id}`}
                >
                  <Boxes className="h-3.5 w-3.5 mr-1" />Magazzino
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => navigate(`/structures/${s.id}`)}
                  data-testid={`open-structure-${s.id}`}
                >
                  Apri<ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={e => handleDelete(s.id, e)}
                  data-testid={`delete-structure-${s.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StructuresListPage;
