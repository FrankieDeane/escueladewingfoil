import { getStore } from '@netlify/blobs';

// /api/agua: temperatura del agua frente a cada spot, medida por satélite
// (la guarda bramador-agua-leer.js cada hora). Para cada spot devuelve el último
// dato sin nubes ("c" en °C y "t" cuándo), el promedio de las últimas 24 h y el de
// las 24 h anteriores (para saber si el agua se está calentando o enfriando).
export default async () => {
  const cabeceras = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=600',
    'Access-Control-Allow-Origin': '*',
  };
  try {
    const g = await getStore('bramador-agua').get('actual', { type: 'json' });
    const hist = (g && g.historial) || [], ahora = Date.now(), spots = {};
    const ids = new Set(); hist.forEach((h) => Object.keys(h.spots || {}).forEach((k) => ids.add(k)));
    for (const id of ids) {
      const vals = hist.filter((h) => h.spots && h.spots[id] != null).map((h) => ({ t: h.t, c: h.spots[id] }));
      if (!vals.length) continue;
      const ult = vals[vals.length - 1];
      const prom = (l) => (l.length ? Math.round(l.reduce((a, x) => a + x.c, 0) / l.length * 10) / 10 : null);
      spots[id] = {
        c: ult.c, t: ult.t,
        dia: prom(vals.filter((x) => x.t > ahora - 24 * 3600e3)),
        antes: prom(vals.filter((x) => x.t <= ahora - 24 * 3600e3 && x.t > ahora - 48 * 3600e3)),
      };
    }
    return new Response(JSON.stringify({ spots, leidoEn: g ? g.leidoEn : null }), { headers: cabeceras });
  } catch {
    return new Response(JSON.stringify({ spots: {}, error: 'sin datos' }), { status: 503, headers: cabeceras });
  }
};

export const config = { path: '/api/agua' };
