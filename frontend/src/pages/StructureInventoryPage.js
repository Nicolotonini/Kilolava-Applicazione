import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Search, Boxes, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

const StructureInventoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const structureFilter = searchParams.get('structure_id');
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/inventory/structure-stock')
      .then((res) => setStock(res.data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = stock.filter((s) =>
    (!structureFilter || s.structure_id === structureFilter) &&
    s.structure_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 lg:p-8 max-w-5xl space-y-5" data-testid="structure-inventory-page">
      <h1 className="text-xl lg:text-2xl font-heading font-semibold">Magazzino Strutture</h1>
      {structureFilter && (
        <div className="flex items-center gap-2 text-sm bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
          <span className="text-muted-foreground">Filtro attivo: solo la struttura selezionata.</span>
          <button onClick={() => setSearchParams({})} className="text-primary font-medium hover:underline" data-testid="clear-structure-filter">
            Mostra tutte
          </button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Dotazione presente in ogni struttura, calcolata da consegne e ritiri.
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca struttura..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
            data-testid="structure-stock-search"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Caricamento...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl" data-testid="structure-stock-empty">
          <Boxes className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium">Nessun magazzino struttura</p>
          <p className="text-xs text-muted-foreground mt-1">
            I saldi compaiono quando registri consegne e ritiri verso le strutture.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Card key={s.structure_id} className="border shadow-none" data-testid={`structure-stock-${s.structure_id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link to={`/structures/${s.structure_id}`} className="text-sm font-semibold hover:text-primary transition-colors">
                    {s.structure_name}
                  </Link>
                  {s.has_negative && (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />Saldo negativo
                    </span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left font-medium py-1.5 pr-3">Articolo</th>
                        <th className="text-right font-medium py-1.5 px-3">Consegnato</th>
                        <th className="text-right font-medium py-1.5 px-3">Ritirato</th>
                        <th className="text-right font-medium py-1.5 pl-3">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.items.map((it) => (
                        <tr key={it.article_id} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5 pr-3">{it.article_name || it.article_id}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{it.loaded}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{it.unloaded}</td>
                          <td className={cn(
                            'py-1.5 pl-3 text-right tabular-nums font-semibold',
                            it.balance < 0 ? 'text-red-600' : it.balance > 0 ? 'text-emerald-600' : 'text-muted-foreground'
                          )}>
                            {it.balance}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default StructureInventoryPage;
