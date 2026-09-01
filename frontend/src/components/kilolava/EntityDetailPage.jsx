import React from 'react';
import { AppPage } from './AppPage';
import { DetailHeader, BackButton } from './PageHeader';
import { DetailSkeleton, ErrorState } from './EmptyState';

/* Struttura standard delle pagine DETTAGLIO entità (Cliente, Struttura, Utente, Prodotto, Kit, ...).
   Ritorno alla lista, titolo + codice + stato + azioni, navigazione interna, contenuto a sezioni. */
export function EntityDetailPage({
  backTo, backLabel,
  title, code, meta, badges, actions,
  nav,
  loading, error, onRetry,
  children, testId,
}) {
  return (
    <AppPage width="narrow" testId={testId || 'entity-detail-page'}>
      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <>
          <BackButton to={backTo} label={backLabel} />
          <ErrorState message={typeof error === 'string' ? error : 'Elemento non trovato'} onRetry={onRetry} backTo={backTo} backLabel={backLabel} />
        </>
      ) : (
        <>
          <DetailHeader backTo={backTo} backLabel={backLabel} title={title} code={code} meta={meta} badges={badges} actions={actions} />
          {nav}
          {children}
        </>
      )}
    </AppPage>
  );
}
