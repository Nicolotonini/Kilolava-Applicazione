import React from 'react';
import { Label } from '../ui/label';
import { cn } from '../../lib/utils';

/* Campo form standard: label 13/18 medium sopra, descrizione, errore, obbligatorietà. */
export function FormField({ label, htmlFor, required, description, error, disabled, className, children, testId }) {
  return (
    <div className={cn('space-y-1.5', disabled && 'opacity-70', className)} data-testid={testId}>
      {label && (
        <Label htmlFor={htmlFor} className="text-caption font-medium text-foreground/80 whitespace-nowrap">
          {label}
          {required && <span className="text-destructive ml-0.5" aria-hidden="true">*</span>}
        </Label>
      )}
      {children}
      {description && !error && <p className="text-caption text-muted-foreground">{description}</p>}
      {error && <p className="text-caption text-destructive" role="alert">{error}</p>}
    </div>
  );
}
