import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';

/* Dialog di conferma standard (Design System).
   SOLO per: conferme, eliminazioni, avvisi, microazioni con pochissimi campi.
   Mai per schede complesse (Cliente, Struttura, Utente, Prodotto, Kit -> pagina dedicata). */
export function ConfirmDialog({
  open, onOpenChange,
  title, description,
  confirmLabel = 'Conferma', cancelLabel = 'Annulla',
  destructive, onConfirm, loading,
  children, testId,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid={testId || 'confirm-dialog'}>
        <DialogHeader>
          <DialogTitle className={destructive ? 'text-destructive' : undefined}>{title}</DialogTitle>
          {description && <DialogDescription className="text-caption">{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="confirm-dialog-cancel">
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
            data-testid="confirm-dialog-confirm"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
