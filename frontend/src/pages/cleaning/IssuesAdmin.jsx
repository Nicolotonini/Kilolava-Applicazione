import React, { useState, useEffect, useCallback } from 'react';
import api, { fileUrl } from '../../lib/api';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { AlertTriangle, Video } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { ISSUE_CAT } from './shared';

export function IssuesAdmin() {
  const [issues, setIssues] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    const params = statusFilter === 'all' ? {} : { status: statusFilter };
    api.get('/cleaning-issues', { params }).then(r => setIssues(r.data)).catch(() => setIssues([]));
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  const act = async (issue, action) => {
    setBusy(issue.id + action);
    try {
      await api.post(`/cleaning-issues/${issue.id}/action`, { action });
      toast.success({
        add_to_delivery: 'Aggiunta alla prossima consegna',
        create_maintenance: 'Manutenzione creata',
        publish_client: 'Pubblicata al Cliente',
        close: 'Segnalazione chiusa',
      }[action]);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Errore'); }
    finally { setBusy(''); }
  };

  const STATUS_LABELS = { open: 'Aperte', to_delivery: 'In consegna', maintenance_created: 'Manutenzione', closed: 'Chiuse', all: 'Tutte' };

  return (
    <div className="space-y-3" data-testid="issues-admin">
      <div className="flex gap-1 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium',
              statusFilter === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            data-testid={`issues-filter-${k}`}>{v}</button>
        ))}
      </div>
      {issues === null ? (
        <p className="text-center py-8 text-muted-foreground">Caricamento...</p>
      ) : issues.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Nessuna segnalazione {STATUS_LABELS[statusFilter]?.toLowerCase()}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map(i => {
            const cat = ISSUE_CAT[i.category] || { label: i.category, cls: 'bg-muted text-muted-foreground' };
            return (
              <Card key={i.id} className="border shadow-none" data-testid={`issue-card-${i.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={cn('text-xs border-0', cat.cls)}>{cat.label}</Badge>
                    {i.klv_code && <span className="font-mono text-xs text-primary font-bold">{i.klv_code}</span>}
                    <span className="font-medium text-sm">{i.structure_name || ''}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{i.reporter_name} · {new Date(i.created_at).toLocaleString('it-IT')}</span>
                  </div>
                  <p className="text-sm">{i.note}</p>
                  {(i.attachments || []).length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {i.attachments.map(a => a.kind === 'video' ? (
                        <a key={a.id} href={fileUrl(a.file_path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted"><Video className="h-3 w-3" />Video</a>
                      ) : (
                        <a key={a.id} href={fileUrl(a.file_path)} target="_blank" rel="noreferrer">
                          <img src={fileUrl(a.file_path)} alt="" className="w-14 h-14 object-cover rounded-lg border border-border" />
                        </a>
                      ))}
                    </div>
                  )}
                  {i.status === 'open' ? (
                    <div className="flex gap-1.5 flex-wrap pt-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!!busy} onClick={() => act(i, 'add_to_delivery')} data-testid={`issue-delivery-${i.id}`}>Aggiungi a prossima consegna</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!!busy} onClick={() => act(i, 'create_maintenance')} data-testid={`issue-maintenance-${i.id}`}>Crea manutenzione</Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!!busy || i.published_to_client} onClick={() => act(i, 'publish_client')} data-testid={`issue-publish-${i.id}`}>{i.published_to_client ? 'Mostrata al Cliente' : 'Mostra al Cliente'}</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" disabled={!!busy} onClick={() => act(i, 'close')} data-testid={`issue-close-${i.id}`}>Chiudi</Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Stato: {STATUS_LABELS[i.status] || i.status}{i.published_to_client ? ' · pubblicata al Cliente' : ''}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
