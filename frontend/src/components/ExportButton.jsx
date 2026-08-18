import React, { useState } from 'react';
import api from '../lib/api';
import { Button } from './ui/button';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const ExportButton = ({ entity, params, className = '' }) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/export/${entity}`, { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers['content-disposition'] || '';
      const m = cd.match(/filename="?([^";]+)"?/);
      a.download = m ? m[1] : `kilolava_${entity}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export Excel scaricato');
    } catch (e) {
      toast.error("Errore durante l'export");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading}
      className={`h-8 gap-1.5 ${className}`}
      data-testid={`export-${entity}-btn`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}
      Excel
    </Button>
  );
};
