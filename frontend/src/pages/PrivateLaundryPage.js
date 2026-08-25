import React from 'react';
import { Shirt } from 'lucide-react';

const PrivateLaundryPage = ({ view = 'jobs' }) => (
  <div className="p-4 lg:p-6 max-w-5xl" data-testid={`private-laundry-${view}`}>
    <div className="text-center py-20 border border-dashed border-border rounded-xl">
      <Shirt className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium">
        {view === 'jobs' ? 'Lavorazioni — Lavanderia Privata' : 'Storico — Lavanderia Privata'}
      </p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
        {view === 'jobs'
          ? 'La gestione delle lavorazioni in corso sarà attivata in una delle prossime fasi.'
          : 'Lo storico delle lavorazioni concluse sarà attivato in una delle prossime fasi.'}
      </p>
    </div>
  </div>
);

export default PrivateLaundryPage;
