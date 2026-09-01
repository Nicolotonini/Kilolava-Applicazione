import React from 'react';
import { Package } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuthFile } from '../../components/kilolava/AuthMedia';

/* Miniatura prodotto con fallback icona (mai immagine rotta). */
export function ProductThumb({ photo, size = 'w-9 h-9', testId }) {
  const { url, error } = useAuthFile(photo?.file_path || null);
  if (!photo?.file_path || error) {
    return (
      <div className={cn(size, 'rounded-md bg-muted flex items-center justify-center shrink-0 border border-border/60')} data-testid={testId ? `${testId}-fallback` : undefined}>
        <Package className="h-4 w-4 text-muted-foreground/40" />
      </div>
    );
  }
  if (!url) {
    return <div className={cn(size, 'rounded-md bg-muted shrink-0 border border-border/60 animate-pulse')} data-testid={testId} />;
  }
  return (
    <img src={url} alt=""
      className={cn(size, 'rounded-md object-cover border border-border shrink-0')} data-testid={testId} />
  );
}
