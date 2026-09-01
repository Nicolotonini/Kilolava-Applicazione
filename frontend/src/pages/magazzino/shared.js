export const MOVEMENT_TYPE_LABELS = {
  carico: 'Carico', scarico: 'Scarico', trasferimento: 'Trasferimento', consegna: 'Consegna',
  ritiro: 'Ritiro', consumo_pulizia: 'Consumo Pulizia', reintegro_zaino: 'Reintegro Zaino',
  rettifica_inventario: 'Rettifica Inventario', danneggiato: 'Danneggiato', mancante: 'Mancante',
  reso: 'Reso', storno: 'Storno', altro: 'Altro',
};

export const movTypeLabel = (t) => MOVEMENT_TYPE_LABELS[t] || (t === 'annullamento' ? 'Storno' : t);
export const isStornoType = (t) => t === 'storno' || t === 'annullamento';

export const STORNO_MOTIVI = [
  ['errore_inserimento', 'Movimento inserito per errore'],
  ['quantita_errata', 'Quantità errata'],
  ['struttura_errata', 'Struttura errata'],
  ['articolo_errato', 'Articolo errato'],
  ['consegna_annullata', 'Consegna annullata'],
  ['altro', 'Altro'],
];
export const STORNO_MOTIVO_LABELS = Object.fromEntries(STORNO_MOTIVI);

export const DOMAIN_LABELS = { noleggio: 'Lavanderia a Noleggio', forniture: 'Forniture / Consumabili', pulizie: 'Prodotti Pulizie' };

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
  parzialmente_evasa: { label: 'Parzialmente evasa', tone: 'waiting' },
  annullata: { label: 'Annullata', tone: 'cancelled' },
};

export const locLabel = (loc) => {
  if (!loc) return '—';
  return loc.label || { central: 'Magazzino Generale', external: 'Esterno' }[loc.type] || loc.type;
};

export const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtD = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) : '—');
