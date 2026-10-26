import { getStore } from '@netlify/blobs';

// Bramador — El Niño / La Niña para la pantalla Temporada.
//
// El índice oficial es el ONI de la NOAA (anomalía de temperatura del mar en
// la región Niño 3.4, promedio de 3 meses). Se publica una vez por mes en un
// archivo de texto sin CORS, así que se lee desde acá y se cachea un día.
const FUENTE = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
const CACHE_MS = 24 * 3600 * 1000;
const TIMEOUT_MS = 8000;

// Las filas son "SEAS  YR   TOTAL   ANOM", p. ej. "JAS 2026 27.31  0.62".
function parsear(txt) {
  const filas = txt.split(/\r?\n/)
    .map(l => l.trim().split(/\s+/))
    .filter(c => c.length >= 4 && /^[A-Z]{3}$/.test(c[0]) && isFinite(+c[1]) && isFinite(+c[3]))
    .map(c => ({ trimestre: c[0], anio: +c[1], anomalia: +c[3] }));
  if (!filas.length) return null;
  const ult = filas[filas.length - 1];
  const fase = ult.anomalia >= 0.5 ? 'nino' : ult.anomalia <= -0.5 ? 'nina' : 'neutral';
  return { ...ult, fase, ultimos: filas.slice(-6).map(f => f.anomalia) };
}

export default async () => {
  const cabeceras = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=21600'
  };

  let store = null;
  try { store = getStore({ name: 'bramador', consistency: 'strong' }); } catch { /* seguimos sin cache */ }

  let guardado = null;
  if (store) {
    try { guardado = await store.get('enso', { type: 'json' }); } catch { /* sin cache */ }
    if (guardado && Date.now() - guardado.leidoEn < CACHE_MS) {
      return new Response(JSON.stringify(guardado.dato), { headers: cabeceras });
    }
  }

  let dato = null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(FUENTE, { signal: ctrl.signal });
    if (r.ok) dato = parsear(await r.text());
  } catch { /* abajo se sirve lo viejo */ } finally {
    clearTimeout(t);
  }

  if (dato) {
    if (store) {
      try { await store.setJSON('enso', { dato, leidoEn: Date.now() }); } catch { /* no crítico */ }
    }
    return new Response(JSON.stringify(dato), { headers: cabeceras });
  }
  if (guardado) return new Response(JSON.stringify(guardado.dato), { headers: cabeceras });
  return new Response(JSON.stringify({ error: 'sin datos' }), { status: 503, headers: cabeceras });
};

export const config = { path: '/api/bramador-enso' };
