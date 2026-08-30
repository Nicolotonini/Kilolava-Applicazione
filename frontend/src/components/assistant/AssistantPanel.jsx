import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, Maximize2 } from 'lucide-react';
import { AssistantChat } from './AssistantChat';

export const AssistantPanel = ({ open, onClose }) => {
  const location = useLocation();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[75]" onClick={onClose} data-testid="assistant-panel-backdrop" />
      <div className="fixed z-[80] bg-card border-border flex flex-col shadow-2xl
        inset-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[430px] lg:border-l" data-testid="assistant-panel">
        <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
          <p className="font-semibold flex items-center gap-2"><span className="text-primary text-lg leading-none">✦</span>Assistente Kilolava</p>
          <div className="flex items-center gap-1">
            <Link to="/assistant" onClick={onClose} title="Apri pagina completa"
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground" data-testid="assistant-open-page-btn">
              <Maximize2 className="h-4 w-4" />
            </Link>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" data-testid="assistant-panel-close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <AssistantChat compact context={{ path: location.pathname }} />
      </div>
    </>
  );
};
