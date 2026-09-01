import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '../ui/card';
import { EmptyState, TableSkeleton } from './EmptyState';
import { cn } from '../../lib/utils';

/* Tabella standard Kilolava.
   columns: [{ key, header, render?, className?, headerClassName?, hideBelow? ('md'|'lg') }]
   - header uniforme, righe cliccabili con hover, colonna azioni, stato vuoto e caricamento
   - responsive: renderMobileCard opzionale per la vista a card su mobile */
const HIDE = { md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function DataTable({
  columns, rows, rowKey = (r) => r.id,
  onRowClick, rowTestId,
  loading, empty,
  showChevron = false,
  renderMobileCard,
  className, testId,
}) {
  if (loading) return <TableSkeleton cols={Math.min(columns.length, 6)} />;
  if (!rows || rows.length === 0) return empty || <EmptyState message="Nessun elemento presente." />;
  return (
    <Card className={cn('overflow-hidden shadow-none', className)} data-testid={testId || 'data-table'}>
      <div className={cn('overflow-x-auto', renderMobileCard && 'hidden md:block')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              {columns.map((c) => (
                <th key={c.key} className={cn('text-left px-3 py-2.5 font-semibold first:pl-4 last:pr-4 whitespace-nowrap', HIDE[c.hideBelow], c.headerClassName)}>
                  {c.header}
                </th>
              ))}
              {showChevron && <th className="px-3 py-2.5 w-8" aria-hidden="true" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('row-hover', onRowClick && 'cursor-pointer hover:bg-muted/40')}
                data-testid={rowTestId ? rowTestId(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2.5 first:pl-4 last:pr-4 align-middle', HIDE[c.hideBelow], c.className)}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
                {showChevron && (
                  <td className="px-3 py-2.5 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderMobileCard && (
        <div className="md:hidden divide-y divide-border/60">
          {rows.map((row) => (
            <div key={rowKey(row)}>{renderMobileCard(row)}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
