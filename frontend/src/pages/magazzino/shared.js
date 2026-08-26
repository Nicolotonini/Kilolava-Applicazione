export const MOVEMENT_TYPE_LABELS = {
  carico: 'Carico', scarico: 'Scarico', trasferimento: 'Trasferimento', consegna: 'Consegna',
  ritiro: 'Ritiro', consumo_pulizia: 'Consumo Pulizia', reintegro_zaino: 'Reintegro Zaino',
  rettifica_inventario: 'Rettifica Inventario', danneggiato: 'Danneggiato', mancante: 'Mancante',
  reso: 'Reso', annullamento: 'Annullamento', altro: 'Altro',
};

export const DOMAIN_LABELS = { noleggio: 'Noleggio Strutture', forniture: 'Forniture', pulizie: 'Magazzino Pulizie' };

export const ZAINO_STATUS_META = {
  disponibile: { label: 'Disponibile', tone: 'neutral' },
  assegnato: { label: 'Assegnato', tone: 'accent' },
  da_reintegrare: { label: 'Da reintegrare', tone: 'waiting' },
  in_manutenzione: { label: 'In manutenzione', tone: 'progress' },
  fuori_uso: { label: 'Fuori uso', tone: 'cancelled' },
};

export const FABBISOGNO_STATUS_META = {
  aperta: { label: 'Aperta', tone: 'progress' },
  in_consegna: { label: 'In consegna', tone: 'neutral' },
  evasa: { label: 'Evasa', tone: 'success' },
  annullata: { label: 'Annullata', tone: 'cancelled' },
};

export const locLabel = (loc) => {
  if (!loc) return '—';
  return loc.label || { central: 'Magazzino', external: 'Esterno' }[loc.type] || loc.type;
};

export const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtD = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
