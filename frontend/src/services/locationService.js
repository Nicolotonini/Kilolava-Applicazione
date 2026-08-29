// Location Service — separato dall'UI: in futuro potrà essere alimentato
// da un wrapper nativo senza cambiare backend o Mappa.
// PWA: il tracking in background NON è garantito (schermo spento/browser chiuso).
import api from '../lib/api';

const PING_INTERVAL_MS = 30000;

let watchId = null;
let pingTimer = null;
let lastPosition = null;
let listeners = [];
let state = { active: false, sessionType: null, lastPingAt: null, error: null };

const emit = () => listeners.forEach((fn) => fn({ ...state }));

export const subscribeLocation = (fn) => {
  listeners.push(fn);
  fn({ ...state });
  return () => { listeners = listeners.filter((l) => l !== fn); };
};

const getBattery = async () => {
  try {
    if (navigator.getBattery) {
      const b = await navigator.getBattery();
      return Math.round(b.level * 100);
    }
  } catch { /* non disponibile */ }
  return null;
};

const sendPing = async () => {
  if (!lastPosition || !state.active) return;
  try {
    const battery = await getBattery();
    await api.post('/posizione/ping', {
      latitude: lastPosition.coords.latitude,
      longitude: lastPosition.coords.longitude,
      accuracy: lastPosition.coords.accuracy ?? null,
      speed: lastPosition.coords.speed ?? null,
      battery,
    });
    state = { ...state, lastPingAt: new Date().toISOString(), error: null };
    emit();
  } catch (e) {
    state = { ...state, error: 'Invio posizione fallito' };
    emit();
  }
};

export const startLocation = async (sessionType) => {
  if (!navigator.geolocation) {
    throw new Error('Geolocalizzazione non supportata dal dispositivo');
  }
  await api.post('/posizione/start', { session_type: sessionType });
  state = { active: true, sessionType, lastPingAt: null, error: null };
  emit();
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const first = !lastPosition;
      lastPosition = pos;
      if (first) sendPing();
    },
    (err) => {
      state = { ...state, error: err.code === 1 ? 'Permesso posizione negato' : 'Posizione non disponibile' };
      emit();
    },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
  pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
};

export const stopLocation = async () => {
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  lastPosition = null;
  try { await api.post('/posizione/stop'); } catch { /* best effort */ }
  state = { active: false, sessionType: null, lastPingAt: null, error: null };
  emit();
};

// Riallinea lo stato locale con il backend (es. dopo refresh pagina)
export const resumeLocationIfActive = async () => {
  try {
    const res = await api.get('/posizione/me');
    if (res.data.active && !state.active) {
      state = { active: true, sessionType: res.data.session_type, lastPingAt: res.data.last_ping, error: null };
      emit();
      watchId = navigator.geolocation.watchPosition(
        (pos) => { const first = !lastPosition; lastPosition = pos; if (first) sendPing(); },
        () => {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
      );
      pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
    }
    return res.data;
  } catch { return { active: false }; }
};
