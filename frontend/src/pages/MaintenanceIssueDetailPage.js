import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Button } from '../components/ui/button';
import { DetailSkeleton, EmptyState } from '../components/kilolava/EmptyState';
import { IssueDetail } from './MaintenanceIssuesPage';

export default function MaintenanceIssueDetailPage() {
  const { issueId } = useParams();
  const navigate = useNavigate();
  const [issue, setIssue] = useState(null);
  const [staff, setStaff] = useState([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    api.get(`/maintenance/issues/${issueId}`).then(r => setIssue(r.data)).catch(() => setNotFound(true));
  }, [issueId]);

  useEffect(() => {
    load();
    api.get('/maintenance/staff').then(r => setStaff(r.data)).catch(() => {});
  }, [load]);

  if (notFound) return (
    <div className="p-4 lg:p-6">
      <EmptyState message="Issue di manutenzione non trovato." action={<Button variant="outline" onClick={() => navigate('/maintenance')}>Torna a Manutenzione</Button>} />
    </div>
  );
  if (!issue) return <div className="p-4 lg:p-6"><DetailSkeleton /></div>;

  return (
    <div className="p-4 lg:p-6 max-w-4xl" data-testid="maintenance-issue-detail-page">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <IssueDetail issue={issue} onBack={() => navigate('/maintenance')} onRefresh={load} staffList={staff} />
      </div>
    </div>
  );
}
