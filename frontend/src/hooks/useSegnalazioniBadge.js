import { useState, useEffect } from 'react';
import api from '../lib/api';

export function useSegnalazioniBadge() {
  const [badge, setBadge] = useState({ active: 0, urgent: 0 });
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/segnalazioni/badge').then(r => { if (alive) setBadge(r.data); }).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  return badge;
}
