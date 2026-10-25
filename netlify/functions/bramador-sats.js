import { getStore } from '@netlify/blobs';

// Bramador — órbitas de los satélites que muestra el mapa (TLE de CelesTrak).
//
// Por qué pasa por acá y no se pide desde el navegador: CelesTrak pide no
// consultar el mismo dato más de una vez cada pocas horas, y cada visita de
// la app lo pediría de nuevo. Se cachea en blobs y se sirve el mismo TLE a
// todos durante CACHE_MS. Las órbitas cambian poco: medio día está bien.
const CACHE_MS = 12 * 3600 * 1000;
const TIMEOUT_MS = 8000;

// Número de catálogo NORAD de cada uno.
const SATS = [
  { id: 'iss',      norad: 25544 },
  { id: 'saocom1a', norad: 43641 },
  { id: 'saocom1b', norad: 46265 },
  { id: 'goes19',   norad: 60133 },
  { id: 'noaa20',   norad: 43013 },
  { id: 'arsat1',   norad: 40272 },
  { id: 'arsat2',   norad: 40941 },
  { id: 'starlink', norad: 44713 }
];

async function tle(norad) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=' + norad + '&FORMAT=TLE',
                          { signal: ctrl.signal, headers: { 'User-Agent': 'escueladewingfoil.com.ar (Bramador)' } });
    if (!r.ok) return null;
    const lineas = (await r.text()).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const l1 = lineas.find(l => l.startsWith('1 '));
    const l2 = lineas.find(l => l.startsWith('2 '));
    return l1 && l2 ? [l1, l2] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default async () => {
  const cabeceras = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  };

  let store = null;
  try { store = getStore({ name: 'bramador', consistency: 'strong' }); } catch { /* seguimos sin cache */ }

  let guardado = null;
  if (store) {
    try { guardado = await store.get('tle', { type: 'json' }); } catch { /* sin cache */ }
    if (guardado && Date.now() - guardado.leidoEn < CACHE_MS) {
      return new Response(JSON.stringify(guardado.sats), { headers: cabeceras });
    }
  }

  const leidos = await Promise.all(SATS.map(async s => ({ id: s.id, tle: await tle(s.norad) })));
  const sats = {};
  leidos.forEach(s => { if (s.tle) sats[s.id] = s.tle; });
  // Si CelesTrak no contestó alguno, vale más el TLE viejo que ninguno.
  if (guardado) Object.keys(guardado.sats).forEach(id => { if (!sats[id]) sats[id] = guardado.sats[id]; });

  if (!Object.keys(sats).length) {
    return new Response(JSON.stringify({ error: 'sin datos' }), { status: 503, headers: cabeceras });
  }
  if (store) {
    try { await store.setJSON('tle', { sats, leidoEn: Date.now() }); } catch { /* no crítico */ }
  }
  return new Response(JSON.stringify(sats), { headers: cabeceras });
};

export const config = { path: '/api/bramador-sats' };
