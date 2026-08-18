import React, { useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { X } from 'lucide-react';

/**
 * Slide-in detail panel from the right. Closes on backdrop click and Escape key.
 */
export const DetailPanel = ({ open, onClose, title, children }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[44%] lg:w-[36%] xl:w-[30%] bg-card border-l border-border z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30 flex-shrink-0">
          <h2 className="font-heading font-semibold text-base">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" data-testid="close-detail-panel">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
};

export default DetailPanel;
