import { getStore } from '@netlify/blobs';

// /api/rayos: los rayos de la última hora y media alrededor del Río de la Plata
// (detector GLM del GOES-19), que guarda bramador-rayos-leer.js cada 2 minutos.
// Cada rayo: {t: ms, lat, lng}. "datoHasta" dice hasta cuándo hay datos: si quedó
// viejo, la app no afirma que no hay rayos.
export default async () => {
  const cabeceras = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'Access-Control-Allow-Origin': '*',
  };
  try {
    const g = await getStore('bramador-rayos').get('actual', { type: 'json' });
    if (!g) return new Response(JSON.stringify({ rayos: [], datoHasta: null }), { headers: cabeceras });
    const desde = Date.now() - 90 * 60e3;
    return new Response(JSON.stringify({
      rayos: (g.rayos || []).filter((x) => x.t > desde),
      datoHasta: g.datoHasta || null,
      leidoEn: g.leidoEn || null,
    }), { headers: cabeceras });
  } catch {
    return new Response(JSON.stringify({ rayos: [], datoHasta: null, error: 'sin datos' }), { status: 503, headers: cabeceras });
  }
};

export const config = { path: '/api/rayos' };
