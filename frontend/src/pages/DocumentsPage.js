import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  FileText, Plus, Search, Filter, Eye, Printer, Trash2,
  Package, Truck, ShoppingCart, ChevronLeft, ChevronRight,
  ArrowUpDown
} from 'lucide-react';
import { cn } from '../lib/utils';

const STATUS_MAP = {
  draft: { label: 'Bozza', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  generated: { label: 'Generato', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  delivered: { label: 'Consegnato', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  archived: { label: 'Archiviato', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

const TYPE_MAP = {
  ddt: { label: 'DDT', icon: Truck },
  internal_movement: { label: 'Mov. Interno', icon: Package },
  invoice_ref: { label: 'Rif. Fattura', icon: FileText },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_MAP[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', s.cls)}>{s.label}</span>;
};

const DocumentsPage = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState([]);

  useEffect(() => {
    api.get('/clients').then(r => setClients(r.data)).catch(() => {});
  }, []);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = { skip: page * limit, limit };
      if (filterType !== 'all') params.document_type = filterType;
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterClient !== 'all') params.client_id = filterClient;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (search) params.search = search;
      const res = await api.get('/documents', { params });
      setDocuments(res.data.items);
      setTotal(res.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, filterType, filterStatus, filterClient, dateFrom, dateTo, search]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Eliminare questo documento?')) return;
    try {
      await api.delete(`/documents/${id}`);
      fetchDocuments();
    } catch (e) {
      alert(e.response?.data?.detail || 'Errore');
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="documents-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-heading font-semibold">Documenti</h1>
          <p className="text-sm text-muted-foreground">Gestione DDT e documenti operativi</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/documents/new')}
            className="bg-[#F24E75] hover:bg-[#E03B62] text-white"
            data-testid="new-document-btn"
          >
            <Plus className="h-4 w-4 mr-1.5" />Nuovo DDT
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cerca numero, cliente, note..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="h-8 pl-8 text-xs"
                data-testid="search-input"
              />
            </div>
            <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="filter-type">
                <Filter className="h-3 w-3 mr-1" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                <SelectItem value="ddt">DDT</SelectItem>
                <SelectItem value="internal_movement">Mov. Interno</SelectItem>
                <SelectItem value="invoice_ref">Rif. Fattura</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[130px] text-xs" data-testid="filter-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="draft">Bozza</SelectItem>
                <SelectItem value="generated">Generato</SelectItem>
                <SelectItem value="delivered">Consegnato</SelectItem>
                <SelectItem value="archived">Archiviato</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterClient} onValueChange={v => { setFilterClient(v); setPage(0); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs" data-testid="filter-client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i clienti</SelectItem>
                {clients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.display_name || c.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }} className="h-8 w-[125px] text-xs" data-testid="date-from" />
            <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }} className="h-8 w-[125px] text-xs" data-testid="date-to" />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : documents.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Nessun documento trovato</p>
          <p className="text-xs text-muted-foreground mt-1">Crea il primo DDT o modifica i filtri</p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">
                    <span className="flex items-center gap-1"><ArrowUpDown className="h-3 w-3" />Numero</span>
                  </th>
                  <th className="text-left px-3 py-2.5 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2.5 font-medium">Data</th>
                  <th className="text-left px-3 py-2.5 font-medium">Cliente</th>
                  <th className="text-center px-3 py-2.5 font-medium">Articoli</th>
                  <th className="text-center px-3 py-2.5 font-medium">Stato</th>
                  <th className="text-right px-4 py-2.5 font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map(doc => {
                  const TypeIcon = TYPE_MAP[doc.document_type]?.icon || FileText;
                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-accent/30 cursor-pointer transition-colors"
                      onClick={() => navigate(`/documents/${doc.id}`)}
                      data-testid={`doc-row-${doc.id}`}
                    >
                      <td className="px-4 py-3 font-mono font-medium text-xs">{doc.document_number}</td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1.5 text-xs">
                          <TypeIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {TYPE_MAP[doc.document_type]?.label || doc.document_type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {new Date(doc.issue_date).toLocaleDateString('it-IT')}
                      </td>
                      <td className="px-3 py-3 text-xs">{doc.client_name || '-'}</td>
                      <td className="text-center px-3 py-3 text-xs">{doc.items?.length || 0}</td>
                      <td className="text-center px-3 py-3"><StatusBadge status={doc.status} /></td>
                      <td className="text-right px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={e => { e.stopPropagation(); navigate(`/documents/${doc.id}`); }}
                            data-testid={`view-doc-${doc.id}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={e => { e.stopPropagation(); navigate(`/documents/${doc.id}?print=1`); }}
                            data-testid={`print-doc-${doc.id}`}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {doc.status === 'draft' && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                              onClick={e => handleDelete(doc.id, e)}
                              data-testid={`delete-doc-${doc.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{total} documenti trovati</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="prev-page">
                  <ChevronLeft className="h-3 w-3 mr-1" />Prec
                </Button>
                <span>Pag. {page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="next-page">
                  Succ<ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DocumentsPage;
