import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  ArrowLeft, Printer, FileText, Truck, Package,
  ShoppingCart, MapPin, Building, Home, Edit, Save, X,
  ExternalLink, Trash2, Plus
} from 'lucide-react';
import { cn } from '../lib/utils';

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Bozza' },
  { value: 'generated', label: 'Generato' },
  { value: 'delivered', label: 'Consegnato' },
  { value: 'archived', label: 'Archiviato' },
];

const STATUS_MAP = {
  draft: { label: 'Bozza', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  generated: { label: 'Generato', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  delivered: { label: 'Consegnato', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  archived: { label: 'Archiviato', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

const TYPE_MAP = {
  ddt: 'DDT - Documento di Trasporto',
  internal_movement: 'Documento Movimento Interno',
  invoice_ref: 'Riferimento Fattura',
};

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_kilolava-core/artifacts/wuuhyigy_images.png';

const DocumentDetailPage = () => {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const printMode = searchParams.get('print') === '1';
  const printRef = useRef();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({});

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/documents/${docId}`);
        setDoc(res.data);
        if (printMode) {
          setTimeout(() => window.print(), 500);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [docId, printMode]);

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await api.put(`/documents/${docId}`, { status: newStatus });
      setDoc(res.data);
    } catch (e) {
      alert(e.response?.data?.detail || 'Errore');
    }
  };

  const startEditing = () => {
    setEditData({
      destination_address: doc.destination_address || '',
      notes: doc.notes || '',
      delivery_ref: doc.delivery_ref || '',
      items: doc.items ? [...doc.items] : [],
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      const res = await api.put(`/documents/${docId}`, editData);
      setDoc(res.data);
      setEditing(false);
    } catch (e) {
      alert(e.response?.data?.detail || 'Errore');
    }
  };

  const addItem = () => {
    setEditData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unit: 'pz', article_id: null, notes: '' }],
    }));
  };

  const removeItem = (idx) => {
    setEditData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const updateItem = (idx, field, value) => {
    setEditData(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [field]: value } : it),
    }));
  };

  const handleDelete = async () => {
    if (!window.confirm('Eliminare questo documento?')) return;
    try {
      await api.delete(`/documents/${docId}`);
      navigate('/documents');
    } catch (e) {
      alert(e.response?.data?.detail || 'Errore');
    }
  };

  if (loading) return <div className="p-6 text-center text-muted-foreground">Caricamento...</div>;
  if (!doc) return <div className="p-6 text-center text-muted-foreground">Documento non trovato</div>;

  const statusInfo = STATUS_MAP[doc.status] || { label: doc.status, cls: '' };

  // ===== PRINT VIEW =====
  if (printMode) {
    return (
      <div className="print-document bg-white text-black min-h-screen" ref={printRef}>
        <style>{`
          @media print {
            body * { visibility: hidden; }
            .print-document, .print-document * { visibility: visible; }
            .print-document { position: absolute; left: 0; top: 0; width: 100%; }
            .no-print { display: none !important; }
          }
          .print-document { font-family: 'Inter', Arial, sans-serif; font-size: 12px; line-height: 1.5; padding: 24px; max-width: 800px; margin: 0 auto; }
          .print-document table { width: 100%; border-collapse: collapse; }
          .print-document th, .print-document td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
          .print-document th { background: #f5f5f5; font-weight: 600; font-size: 11px; text-transform: uppercase; }
        `}</style>

        <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(`/documents/${docId}`)} style={{ padding: '6px 14px', background: '#eee', borderRadius: 6, cursor: 'pointer', border: 'none', fontSize: 13 }}>
            Torna al dettaglio
          </button>
          <button onClick={() => window.print()} style={{ padding: '6px 14px', background: '#F24E75', color: 'white', borderRadius: 6, cursor: 'pointer', border: 'none', fontSize: 13 }}>
            Stampa / PDF
          </button>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #333', paddingBottom: 16, marginBottom: 20 }}>
          <div>
            <img src={LOGO_URL} alt="Kilolava" style={{ height: 32, marginBottom: 8 }} />
            <div style={{ fontSize: 10, color: '#666' }}>
              Kilolava S.r.l.<br />
              Via Esempio 1, 00100 Roma<br />
              P.IVA: IT00000000000
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{TYPE_MAP[doc.document_type] || doc.document_type}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>N. {doc.document_number}</div>
            <div style={{ fontSize: 11, color: '#666' }}>Data: {new Date(doc.issue_date).toLocaleDateString('it-IT')}</div>
          </div>
        </div>

        {/* Client / Destination */}
        <div style={{ display: 'flex', gap: 40, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#888', marginBottom: 4 }}>Destinatario</div>
            <div style={{ fontWeight: 600 }}>{doc.client_name || '-'}</div>
            {doc.destination_address && <div style={{ fontSize: 11, color: '#555' }}>{doc.destination_address}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: '#888', marginBottom: 4 }}>Destinazione</div>
            {doc.structure_name && <div>{doc.structure_name}</div>}
            {doc.unit_name && <div style={{ fontSize: 11 }}>Unita: {doc.unit_name}</div>}
            {doc.destination_address && <div style={{ fontSize: 11, color: '#555' }}>{doc.destination_address}</div>}
          </div>
        </div>

        {/* Reference */}
        {(doc.delivery_ref || doc.order_id || doc.logistics_task_id || doc.movement_id) && (
          <div style={{ marginBottom: 16, fontSize: 11, color: '#555' }}>
            {doc.delivery_ref && <span>Rif. consegna: <strong>{doc.delivery_ref}</strong> | </span>}
            {doc.order_id && <span>Ordine collegato | </span>}
            {doc.logistics_task_id && <span>Task logistica collegata | </span>}
            {doc.movement_id && <span>Movimento inventario collegato</span>}
          </div>
        )}

        {/* Items table */}
        <table style={{ marginBottom: 20 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Descrizione</th>
              <th style={{ width: 70, textAlign: 'center' }}>Qta</th>
              <th style={{ width: 50, textAlign: 'center' }}>U.M.</th>
              <th style={{ width: 120 }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {(doc.items || []).map((item, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}</td>
                <td>{item.description}</td>
                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ textAlign: 'center' }}>{item.unit}</td>
                <td style={{ fontSize: 10 }}>{item.notes || ''}</td>
              </tr>
            ))}
            {(!doc.items || doc.items.length === 0) && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#999' }}>Nessun articolo</td></tr>
            )}
          </tbody>
        </table>

        {/* Notes */}
        {doc.notes && (
          <div style={{ marginBottom: 20, padding: 10, background: '#f9f9f9', borderRadius: 4, fontSize: 11 }}>
            <strong>Note:</strong> {doc.notes}
          </div>
        )}

        {/* Signature area */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60, paddingTop: 20 }}>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <div style={{ borderTop: '1px solid #333', paddingTop: 8, fontSize: 10 }}>Firma mittente</div>
          </div>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <div style={{ borderTop: '1px solid #333', paddingTop: 8, fontSize: 10 }}>Firma destinatario</div>
          </div>
        </div>
      </div>
    );
  }

  // ===== DETAIL VIEW =====
  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="document-detail-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/documents')} data-testid="back-btn">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl lg:text-2xl font-heading font-semibold font-mono">{doc.document_number}</h1>
            <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', statusInfo.cls)}>{statusInfo.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">{TYPE_MAP[doc.document_type] || doc.document_type}</p>
        </div>
        <div className="flex items-center gap-2">
          {doc.status === 'draft' && !editing && (
            <Button variant="outline" size="sm" onClick={startEditing} data-testid="edit-btn">
              <Edit className="h-3.5 w-3.5 mr-1.5" />Modifica
            </Button>
          )}
          {doc.status === 'draft' && (
            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={handleDelete} data-testid="delete-btn">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />Elimina
            </Button>
          )}
          <Button
            variant="outline" size="sm"
            onClick={() => navigate(`/documents/${docId}?print=1`)}
            data-testid="print-btn"
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />Stampa
          </Button>
        </div>
      </div>

      {/* Status workflow */}
      <Card className="border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground mr-2">Cambia stato:</span>
            {STATUS_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={doc.status === opt.value ? 'default' : 'outline'}
                size="sm"
                className={cn('h-7 text-xs', doc.status === opt.value && 'bg-[#F24E75] hover:bg-[#E03B62] text-white')}
                onClick={() => handleStatusChange(opt.value)}
                data-testid={`status-${opt.value}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Document Info */}
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Informazioni documento</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground block">Data emissione</span>
                  <span className="font-medium">{new Date(doc.issue_date).toLocaleDateString('it-IT')}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Tipo</span>
                  <span className="font-medium">{TYPE_MAP[doc.document_type] || doc.document_type}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Cliente</span>
                  <span className="font-medium">{doc.client_name || '-'}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground block">Indirizzo destinazione</span>
                  {editing ? (
                    <Input
                      value={editData.destination_address}
                      onChange={e => setEditData(p => ({ ...p, destination_address: e.target.value }))}
                      className="h-8 text-xs mt-1"
                    />
                  ) : (
                    <span className="font-medium flex items-center gap-1">
                      {doc.destination_address ? <><MapPin className="h-3 w-3 text-muted-foreground" />{doc.destination_address}</> : '-'}
                    </span>
                  )}
                </div>
                {doc.structure_name && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Struttura</span>
                    <span className="font-medium flex items-center gap-1"><Building className="h-3 w-3 text-muted-foreground" />{doc.structure_name}</span>
                  </div>
                )}
                {doc.unit_name && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Unita</span>
                    <span className="font-medium flex items-center gap-1"><Home className="h-3 w-3 text-muted-foreground" />{doc.unit_name}</span>
                  </div>
                )}
                <div>
                  <span className="text-xs text-muted-foreground block">Rif. consegna</span>
                  {editing ? (
                    <Input
                      value={editData.delivery_ref}
                      onChange={e => setEditData(p => ({ ...p, delivery_ref: e.target.value }))}
                      className="h-8 text-xs mt-1"
                    />
                  ) : (
                    <span className="font-medium">{doc.delivery_ref || '-'}</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Articoli ({editing ? editData.items.length : (doc.items?.length || 0)})</h3>
                {editing && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                    <Plus className="h-3 w-3 mr-1" />Aggiungi
                  </Button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  {editData.items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                      <Input
                        value={item.description}
                        onChange={e => updateItem(idx, 'description', e.target.value)}
                        placeholder="Descrizione"
                        className="h-8 text-xs flex-1"
                      />
                      <Input
                        type="number" value={item.quantity} min={1}
                        onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="h-8 text-xs w-16 text-center"
                      />
                      <Input
                        value={item.unit}
                        onChange={e => updateItem(idx, 'unit', e.target.value)}
                        className="h-8 text-xs w-14 text-center"
                      />
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeItem(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium w-10">#</th>
                        <th className="text-left px-3 py-2 font-medium">Descrizione</th>
                        <th className="text-center px-3 py-2 font-medium w-16">Qta</th>
                        <th className="text-center px-3 py-2 font-medium w-14">U.M.</th>
                        <th className="text-left px-3 py-2 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(doc.items || []).map((item, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 text-xs font-medium">{item.description}</td>
                          <td className="text-center px-3 py-2 text-xs">{item.quantity}</td>
                          <td className="text-center px-3 py-2 text-xs">{item.unit}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.notes || '-'}</td>
                        </tr>
                      ))}
                      {(!doc.items || doc.items.length === 0) && (
                        <tr><td colSpan={5} className="text-center py-4 text-muted-foreground text-xs">Nessun articolo</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="border">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-2">Note</h3>
              {editing ? (
                <textarea
                  value={editData.notes}
                  onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              ) : (
                <p className="text-sm text-muted-foreground">{doc.notes || 'Nessuna nota'}</p>
              )}
            </CardContent>
          </Card>

          {editing && (
            <div className="flex gap-2">
              <Button className="bg-[#F24E75] hover:bg-[#E03B62] text-white" onClick={saveEdit} data-testid="save-edit-btn">
                <Save className="h-4 w-4 mr-1.5" />Salva modifiche
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>Annulla</Button>
            </div>
          )}
        </div>

        {/* Right: Links */}
        <div className="space-y-4">
          {/* Linked Records */}
          <Card className="border">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Entita collegate</h3>
              {doc.order_id && (
                <button
                  onClick={() => navigate(`/portal/orders/${doc.order_id}`)}
                  className="flex items-center gap-2 w-full p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-left"
                  data-testid="linked-order"
                >
                  <ShoppingCart className="h-4 w-4 text-purple-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">Ordine</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.order_id}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {doc.logistics_task_id && (
                <button
                  onClick={() => navigate('/logistics')}
                  className="flex items-center gap-2 w-full p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left"
                  data-testid="linked-logistics"
                >
                  <Truck className="h-4 w-4 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">Task Logistica</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.logistics_task_id}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {doc.movement_id && (
                <button
                  onClick={() => navigate('/inventory')}
                  className="flex items-center gap-2 w-full p-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors text-left"
                  data-testid="linked-movement"
                >
                  <Package className="h-4 w-4 text-teal-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">Movimento Inventario</p>
                    <p className="text-xs text-muted-foreground truncate">{doc.movement_id}</p>
                  </div>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              {!doc.order_id && !doc.logistics_task_id && !doc.movement_id && (
                <p className="text-xs text-muted-foreground">Nessuna entita collegata</p>
              )}
            </CardContent>
          </Card>

          {/* External Ref (future integration) */}
          <Card className="border">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold">Integrazione esterna</h3>
              <p className="text-xs text-muted-foreground">
                {doc.external_ref
                  ? <>Rif. esterno: <span className="font-mono font-medium">{doc.external_ref}</span></>
                  : 'Predisposto per futura integrazione con Fatture in Cloud'}
              </p>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card className="border">
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold">Dettagli</h3>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Creato: {new Date(doc.created_at).toLocaleString('it-IT')}</p>
                <p>Aggiornato: {new Date(doc.updated_at).toLocaleString('it-IT')}</p>
                {doc.external_ref && <p>Rif. esterno: {doc.external_ref}</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DocumentDetailPage;
