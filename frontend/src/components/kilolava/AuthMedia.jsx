import React, { useEffect, useState } from 'react';
import { API_BASE } from '../../lib/api';

/* Fase 18 hardening: media autenticati SENZA token nell'URL.
   Fetch con header Authorization -> Blob URL (cache per path). */
const cache = new Map();

export async function fetchAuthFileUrl(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(`${API_BASE}/files/${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('kilolava_token') || ''}` },
  });
  if (!res.ok) throw new Error(`file ${res.status}`);
  const url = URL.createObjectURL(await res.blob());
  cache.set(path, url);
  return url;
}

export function invalidateAuthFile(path) {
  const url = cache.get(path);
  if (url) URL.revokeObjectURL(url);
  cache.delete(path);
}

export function useAuthFile(path, retry = 0) {
  const [url, setUrl] = useState(() => (path ? cache.get(path) || null : null));
  const [error, setError] = useState(false);
  useEffect(() => {
    let on = true;
    setError(false);
    if (!path) { setUrl(null); return undefined; }
    if (cache.has(path)) { setUrl(cache.get(path)); return undefined; }
    setUrl(null);
    fetchAuthFileUrl(path)
      .then((u) => { if (on) setUrl(u); })
      .catch(() => { if (on) setError(true); });
    return () => { on = false; };
  }, [path, retry]);
  return { url, error };
}

export function AuthImg({ path, retry = 0, fallback = null, onLoadError, alt = '', ...props }) {
  const { url, error } = useAuthFile(path, retry);
  useEffect(() => { if (error && onLoadError) onLoadError(); }, [error, onLoadError]);
  if (!path || error) return fallback;
  if (!url) return <div aria-hidden="true" {...props} />;
  return <img src={url} alt={alt} {...props} />;
}

export function AuthVideo({ path, ...props }) {
  const { url } = useAuthFile(path);
  if (!url) return <div aria-hidden="true" className={props.className} />;
  return <video src={url} {...props} />;
}

export async function openAuthFile(path) {
  try {
    const url = await fetchAuthFileUrl(path);
    window.open(url, '_blank', 'noopener');
  } catch {
    /* media non disponibile */
  }
}
