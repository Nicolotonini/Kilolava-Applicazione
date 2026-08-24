import React, { useState, useEffect, useCallback } from 'react';
import { portalApi } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { CalendarDays, Truck, Package, Check, Clock, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { cn } from '../../lib/utils';

const TYPE_LABELS = {
  cleaning: 'Pulizia', checkin: 'Check-in', checkout: 'Check-out',
  delivery: 'Consegna', pickup: 'Ritiro', mixed: 'Misto',
};
const TYPE_ICONS = {
  cleaning: CalendarDays, checkin: CalendarDays, checkout: CalendarDays,
  delivery: Truck, pickup: Package, mixed: Package,
};
const STATUS_BADGE = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  unassigned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const PortalServices = () => {
  const [services, setServices] = useState([]);
  const [structures, setStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterStructure, setFilterStructure] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [svcRes, strRes] = await Promise.all([
        portalApi.getServices({ month, structure_id: filterStructure !== 'all' ? filterStructure : undefined }),
        portalApi.getStructures(),
      ]);
      setServices(svcRes.data);
      setStructures(strRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [month, filterStructure]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const shiftMonth = (dir) => {
    const [y, m] = month.split('-').map(Number);
    let nm = m + dir, ny = y;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    setMonth(`${ny}-${String(nm).padStart(2, '0')}`);
  };

  const monthLabel = new Date(month + '-01T00:00:00').toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  const grouped = {};
  services.forEach(s => {
    const d = s.date || 'senza-data';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(s);
  });
  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="space-y-4" data-testid="portal-services">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-heading font-semibold">Servizi</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-3 text-sm font-medium capitalize min-w-[140px] text-center">{monthLabel}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {structures.length > 1 && (
            <Select value={filterStructure} onValueChange={setFilterStructure}>
              <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="Struttura" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le strutture</SelectItem>
                {structures.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : services.length === 0 ? (
        <div className="text-center py-12">
          <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun servizio per questo mese</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(date => (
            <div key={date}>
              <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                {new Date(date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div className="space-y-2">
                {grouped[date].map(svc => {
                  const Icon = TYPE_ICONS[svc.type] || CalendarDays;
                  return (
                    <Card key={svc.id} className="border">
                      <CardContent className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{TYPE_LABELS[svc.type] || svc.title || svc.type}</p>
                            <p className="text-xs text-muted-foreground truncate">{svc.structure_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {svc.items_count && <span className="text-xs text-muted-foreground">{svc.items_count} art.</span>}
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_BADGE[svc.status] || 'bg-muted text-muted-foreground')}>
                            {svc.status === 'completed' ? 'Completato' : svc.status === 'in_progress' ? 'In corso' : svc.status}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortalServices;
