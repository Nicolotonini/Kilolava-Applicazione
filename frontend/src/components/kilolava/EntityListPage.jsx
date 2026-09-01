import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '../ui/input';
import { AppPage } from './AppPage';
import { PageHeader } from './PageHeader';
import { EmptyState, ErrorState, ListSkeleton } from './EmptyState';

/* Struttura standard delle pagine ELENCO (Design System).
   Titolo + conteggio, ricerca, filtri, CTA di creazione, contenuto, stati vuoto/caricamento/errore. */
export function EntityListPage({
  title, subtitle, actions,
  kpis,
  searchValue, onSearchChange, searchPlaceholder,
  filters,
  loading, loadingState,
  error, onRetry,
  isEmpty, empty,
  children, testId,
}) {
  return (
    <AppPage testId={testId || 'entity-list-page'}>
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
      {kpis}
      {(onSearchChange || filters) && (
        <div className="flex flex-col gap-2.5">
          {onSearchChange && (
            <div className="relative max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder || 'Cerca...'}
                className="pl-9"
                data-testid="entity-search-input"
              />
            </div>
          )}
          {filters && <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">{filters}</div>}
        </div>
      )}
      {loading
        ? (loadingState || <ListSkeleton />)
        : error
          ? <ErrorState message={typeof error === 'string' ? error : 'Errore di caricamento'} onRetry={onRetry} />
          : isEmpty
            ? <EmptyState {...(empty || { message: 'Nessun elemento presente.' })} />
            : children}
    </AppPage>
  );
}
