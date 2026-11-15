import { getStore } from '@netlify/blobs';

// /api/rio: la altura REAL del río medida por el mareógrafo de San Fernando del
// Servicio de Hidrografía Naval (SHN), junto con la marea astronómica (la de la
// tabla) para las mismas horas. La diferencia es lo que hace el viento: con
// sudestada el río sube por encima de la tabla; con viento del oeste, bajante.
//
// El SHN publica las dos series en su API (la misma que usa su página de
// "Alturas horarias"). No manda CORS, así que se lee acá, una vez cada 10
// minutos para todos, y se guarda en blobs.
const ESTACION = 'SFER';
const BASES = ['https://www.hidro.gov.ar', 'https://www.hidro.gob.ar'];
const CACHE_MS = 10 * 60e3;
const TIMEOUT_MS = 8000;

function marca(ms) { // YYYYMMDDHHmm en hora argentina
  const d = new Date(ms - 3 * 3600e3);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
// "2026-11-15T14:00:00" (hora argentina, sin zona) u otra fecha ISO → ms
function fecha(f) {
  if (f == null) return NaN;
  const s = String(f).trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return NaN;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(s);
  return Date.parse(s.replace(' ', 'T') + (s.length <= 16 ? ':00' : '') + '-03:00');
}
export function limpiar(serie) {
  const out = [];
  for (const x of Array.isArray(serie) ? serie : []) {
    const t = fecha(x.fecha ?? x.Fecha), h = Number(x.altura ?? x.Altura ?? x.valor);
    if (!isFinite(t) || !isFinite(h)) continue;
    out.push({ t, m: Math.abs(h) > 15 ? h / 100 : h }); // por si viniera en cm
  }
  return out.sort((a, b) => a.t - b.t);
}
async function leerSHN() {
  let ultimoError = null;
  for (const base of BASES) {
    try {
      const ctrl = new AbortController();
      const corte = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const r = await fetch(`${base}/api/v1/AlturasHorarias/ValoresGrafico/${ESTACION}/${marca(Date.now())}`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'bramador-wind-app', Accept: 'application/json' } });
      clearTimeout(corte);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      const lecturas = limpiar(d.lecturas), astronomica = limpiar(d.astronomica);
      if (!lecturas.length && !astronomica.length) throw new Error('vacío');
      return { lecturas, astronomica };
    } catch (e) { ultimoError = e; }
  }
  throw ultimoError;
}

export default async () => {
  const cabeceras = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*',
  };
  let store = null;
  try { store = getStore('bramador-rio'); } catch { /* sin cache */ }
  let g = null;
  if (store) { try { g = await store.get('actual', { type: 'json' }); } catch { /* sigue */ } }
  if (g && Date.now() - g.leidoEn < CACHE_MS) {
    return new Response(JSON.stringify({ ...g.dato, estacion: 'San Fernando', cache: true }), { headers: cabeceras });
  }
  try {
    const dato = await leerSHN();
    if (store) { try { await store.setJSON('actual', { dato, leidoEn: Date.now() }); } catch { /* no crítico */ } }
    return new Response(JSON.stringify({ ...dato, estacion: 'San Fernando', cache: false }), { headers: cabeceras });
  } catch (e) {
    console.error('rio', String(e));
    if (g) return new Response(JSON.stringify({ ...g.dato, estacion: 'San Fernando', cache: true, vencido: true }), { headers: cabeceras });
    return new Response(JSON.stringify({ lecturas: [], astronomica: [], error: 'sin datos' }), { status: 503, headers: cabeceras });
  }
};

export const config = { path: '/api/rio' };
