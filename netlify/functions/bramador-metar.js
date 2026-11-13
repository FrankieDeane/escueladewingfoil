import { getStore } from '@netlify/blobs';

// Viento medido en los aeródromos alrededor del Río de la Plata (reportes
// METAR, cada 30-60 min). Bramador lo usa para "El viento viene llegando":
// si una estación que está viento arriba de tu spot ya mide mucho más, el
// viento está en camino.
//
// La fuente pública (aviationweather.gov) tarda a veces 10-15 s en responder,
// así que la lee una función programada cada 5 min (bramador-metar-leer.js)
// y la deja en blobs; esta solo entrega lo guardado, al toque.
export const ESTACIONES = {
  SABE: 'Aeroparque',
  SADF: 'San Fernando',
  SAEZ: 'Ezeiza',
  SADP: 'El Palomar',
  SADM: 'Morón',
  SADL: 'La Plata',
};
export const FUENTE = 'https://aviationweather.gov/api/data/metar?format=json&hours=2&ids=' + Object.keys(ESTACIONES).join(',');
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000; // solo si todavía no hay nada guardado

export function limpiar(lista) {
  const ultimo = {};
  for (const m of Array.isArray(lista) ? lista : []) {
    const id = String(m.icaoId || '').toUpperCase();
    if (!ESTACIONES[id]) continue;
    const t = Number(m.obsTime) * 1000;
    const kn = Number(m.wspd);
    if (!isFinite(t) || !isFinite(kn) || kn < 0 || kn > 120) continue;
    if (ultimo[id] && ultimo[id].t >= t) continue;
    const dir = Number(m.wdir); // "VRB" (variable) queda sin dirección
    const raf = m.wgst == null ? NaN : Number(m.wgst);
    ultimo[id] = {
      id, n: ESTACIONES[id],
      lat: Number(m.lat), lng: Number(m.lon),
      t, kn, raf: isFinite(raf) ? raf : null, dir: isFinite(dir) ? dir : null,
    };
  }
  return Object.values(ultimo).filter((e) => isFinite(e.lat) && isFinite(e.lng));
}

export default async () => {
  const cabeceras = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=120',
    'Access-Control-Allow-Origin': '*',
  };
  let store = null;
  try { store = getStore('bramador-metar'); } catch { /* sin blobs: lee directo */ }

  if (store) {
    try {
      const g = await store.get('actual', { type: 'json' });
      if (g && Date.now() - g.leidoEn < 3 * CACHE_MS) {
        return new Response(JSON.stringify({ estaciones: g.estaciones, cache: true }), { headers: cabeceras });
      }
    } catch { /* sigue */ }
  }

  try {
    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch(FUENTE, { signal: ctrl.signal, headers: { 'User-Agent': 'bramador-wind-app' } });
    clearTimeout(corte);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const estaciones = limpiar(await r.json());
    if (!estaciones.length) throw new Error('vacío');
    if (store) { try { await store.setJSON('actual', { estaciones, leidoEn: Date.now() }); } catch { /* no crítico */ } }
    return new Response(JSON.stringify({ estaciones, cache: false }), { headers: cabeceras });
  } catch {
    if (store) {
      try {
        const g = await store.get('actual', { type: 'json' });
        if (g) return new Response(JSON.stringify({ estaciones: g.estaciones, cache: true, vencido: true }), { headers: cabeceras });
      } catch { /* nada */ }
    }
    return new Response(JSON.stringify({ estaciones: [], error: 'sin datos' }), { status: 503, headers: cabeceras });
  }
};

export const config = { path: '/api/metar' };
