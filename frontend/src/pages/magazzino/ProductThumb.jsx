import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { fileUrl } from '../../lib/api';
import { cn } from '../../lib/utils';

/* Miniatura prodotto con fallback icona (mai immagine rotta). */
export function ProductThumb({ photo, size = 'w-9 h-9', testId }) {
  const [err, setErr] = useState(false);
  if (!photo?.file_path || err) {
    return (
      <div className={cn(size, 'rounded-md bg-muted flex items-center justify-center shrink-0 border border-border/60')} data-testid={testId ? `${testId}-fallback` : undefined}>
        <Package className="h-4 w-4 text-muted-foreground/40" />
      </div>
    );
  }
  return (
    <img src={fileUrl(photo.file_path)} alt="" onError={() => setErr(true)}
      className={cn(size, 'rounded-md object-cover border border-border shrink-0')} data-testid={testId} />
  );
}
