import React from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

/* Drawer operativo condiviso (Design System).
   Per azioni rapide che mantengono visibile il contesto: nuova pulizia/consegna/segnalazione rapida,
   assegnazioni, cambi stato, movimenti. 560px su desktop, full screen su mobile.
   Header fisso, contenuto scrollabile, footer fisso con Annulla/Conferma. */
export function OperationalDrawer({
  open, onOpenChange,
  title, description,
  children,
  footer,
  onConfirm, onCancel,
  confirmLabel = 'Conferma', cancelLabel = 'Annulla',
  confirmDisabled, loading, destructive,
  className, testId,
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn('w-full max-w-full sm:w-[560px] sm:max-w-[560px] p-0 flex flex-col gap-0', className)}
        data-testid={testId || 'operational-drawer'}
      >
        <SheetHeader className="px-5 py-4 border-b border-border text-left shrink-0 space-y-0.5">
          <SheetTitle className="text-card-title pr-8">{title}</SheetTitle>
          <SheetDescription className={cn('text-caption', !description && 'sr-only')}>
            {description || title}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div>
        {(footer || onConfirm) && (
          <div className="px-5 py-3.5 border-t border-border bg-card flex items-center justify-end gap-2 shrink-0 pb-safe">
            {footer || (
              <>
                <Button variant="outline" onClick={onCancel || (() => onOpenChange(false))} data-testid="drawer-cancel-btn">
                  {cancelLabel}
                </Button>
                <Button
                  variant={destructive ? 'destructive' : 'default'}
                  onClick={onConfirm}
                  disabled={confirmDisabled || loading}
                  data-testid="drawer-confirm-btn"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {confirmLabel}
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
