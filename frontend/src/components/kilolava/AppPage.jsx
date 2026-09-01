import React from 'react';
import { cn } from '../../lib/utils';

/* Contenitore standard di ogni pagina Kilolava.
   Padding: 16px mobile / 20px tablet / 32px desktop. Sezioni distanziate 24px. */
export function AppPage({ children, width = 'full', className, testId }) {
  return (
    <div
      className={cn(
        'p-4 md:p-5 lg:p-8 space-y-6',
        width === 'narrow' && 'max-w-5xl',
        width === 'wide' && 'max-w-7xl',
        className
      )}
      data-testid={testId || 'app-page'}
    >
      {children}
    </div>
  );
}
