import React, { useState, useCallback, useEffect } from 'react';
import { fileUrl } from '../../lib/api';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { ChevronLeft, ChevronRight, Video, ImageOff, Play, RotateCcw, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/* Miniatura media con fallback elegante: MAI l'icona nativa di immagine rotta. */
export function MediaThumb({ media, onClick, size = 'w-20 h-20', testId }) {
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const src = media.file_path ? `${fileUrl(media.file_path)}&r=${retry}` : null;

  if (media.kind === 'video') {
    return (
      <button onClick={onClick} className={cn(size, 'relative rounded-lg border border-border bg-foreground/90 flex flex-col items-center justify-center gap-1 text-background/90 hover:opacity-90 klv-interactive shrink-0')} data-testid={testId}>
        <Play className="h-6 w-6" fill="currentColor" />
        <span className="text-[inherit] text-xs">Video</span>
      </button>
    );
  }
  if (error || !src) {
    return (
      <div className={cn(size, 'rounded-lg border border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-1 text-muted-foreground shrink-0 p-1')} data-testid={testId ? `${testId}-fallback` : 'media-fallback'}>
        <ImageOff className="h-4 w-4" />
        <span className="text-xs text-center leading-tight">Media non disponibile</span>
        {src && (
          <button onClick={e => { e.stopPropagation(); setError(false); setRetry(r => r + 1); }} className="text-xs underline flex items-center gap-0.5" data-testid="media-retry-btn">
            <RotateCcw className="h-3 w-3" />Riprova
          </button>
        )}
      </div>
    );
  }
  return (
    <button onClick={onClick} className="shrink-0" data-testid={testId}>
      <img src={src} alt="" onError={() => setError(true)}
        className={cn(size, 'object-cover rounded-lg border border-border hover:opacity-90 klv-interactive')} />
    </button>
  );
}

/* Viewer unico foto/video con precedente/successivo e meta. */
export function MediaViewer({ items, index, onClose, onNavigate }) {
  const item = items[index];
  const [error, setError] = useState(false);
  useEffect(() => { setError(false); }, [index]);

  const prev = useCallback(() => onNavigate((index - 1 + items.length) % items.length), [index, items.length, onNavigate]);
  const next = useCallback(() => onNavigate((index + 1) % items.length), [index, items.length, onNavigate]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [prev, next]);

  if (!item) return null;
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-foreground/95 border-0 [&>button]:hidden" data-testid="media-viewer">
        <DialogTitle className="sr-only">Media</DialogTitle>
        <div className="relative flex items-center justify-center min-h-[300px] max-h-[75vh]">
          {item.kind === 'video' ? (
            <video src={fileUrl(item.file_path)} controls autoPlay className="max-h-[75vh] w-full" data-testid="viewer-video" />
          ) : error ? (
            <div className="flex flex-col items-center gap-2 text-background/80 py-16" data-testid="viewer-fallback">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm">Impossibile caricare il media</p>
              <button onClick={() => setError(false)} className="text-sm underline flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" />Riprova</button>
            </div>
          ) : (
            <img src={fileUrl(item.file_path)} alt="" onError={() => setError(true)} className="max-h-[75vh] object-contain" data-testid="viewer-image" />
          )}
          <button onClick={onClose} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/20 hover:bg-background/40 text-background flex items-center justify-center klv-interactive" data-testid="viewer-close">
            <X className="h-5 w-5" />
          </button>
          {items.length > 1 && (
            <>
              <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/20 hover:bg-background/40 text-background flex items-center justify-center klv-interactive" data-testid="viewer-prev">
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/20 hover:bg-background/40 text-background flex items-center justify-center klv-interactive" data-testid="viewer-next">
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
        </div>
        <div className="px-4 py-2.5 flex items-center gap-2 text-xs text-background/80 bg-foreground">
          {item.kind === 'video' && <Video className="h-3.5 w-3.5" />}
          <span>{index + 1} / {items.length}</span>
          {item.uploaded_by_name && <span>· {item.uploaded_by_name}</span>}
          {(item.at || item.uploaded_at) && <span>· {new Date(item.at || item.uploaded_at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
          {item.description && <span className="truncate">· {item.description}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Striscia di miniature con viewer integrato. */
export function MediaStrip({ media, size, testIdPrefix }) {
  const [viewer, setViewer] = useState(null);
  if (!media?.length) return null;
  return (
    <>
      <div className="flex gap-2 flex-wrap">
        {media.map((m, i) => (
          <MediaThumb key={m.id || i} media={m} size={size} onClick={() => setViewer(i)}
            testId={testIdPrefix ? `${testIdPrefix}-${i}` : undefined} />
        ))}
      </div>
      {viewer != null && <MediaViewer items={media} index={viewer} onClose={() => setViewer(null)} onNavigate={setViewer} />}
    </>
  );
}
