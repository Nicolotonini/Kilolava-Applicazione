import React from 'react';
import { IssuesAdmin } from './cleaning/IssuesAdmin';

export default function CleaningIssuesPage() {
  return (
    <div className="p-4 lg:p-6 space-y-5" data-testid="cleaning-issues-page">
      <div>
        <h1 className="text-xl lg:text-2xl font-heading font-semibold">Segnalazioni Pulizie</h1>
        <p className="text-sm text-muted-foreground">Segnalazioni inviate dalle addette durante le pulizie</p>
      </div>
      <IssuesAdmin />
    </div>
  );
}
