import React, { useState } from 'react';
import { PageHeader } from '../../components/kilolava/PageHeader';
import { cn } from '../../lib/utils';
import { CatalogTable } from './CatalogTable';
import { DOMAIN_LABELS } from './shared';

const TABS = ['noleggio', 'forniture', 'pulizie'];

export default function CataloghiProdottiPage() {
  const [tab, setTab] = useState('noleggio');
  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="cataloghi-prodotti-page">
      <PageHeader title="Cataloghi Prodotti" subtitle="Il catalogo definisce COSA è il prodotto; quantità e ubicazioni vivono nel Magazzino" />
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(k => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-3 py-1.5 rounded-full text-sm font-medium klv-interactive',
              tab === k ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}
            data-testid={`catalog-tab-${k}`}>
            {DOMAIN_LABELS[k]}
          </button>
        ))}
      </div>
      <CatalogTable domain={tab} key={tab} />
    </div>
  );
}
