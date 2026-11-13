import { getStore } from '@netlify/blobs';
import { FUENTE, limpiar } from './bramador-metar.js';

// Cada 5 minutos lee los METAR de los aeródromos y los guarda para /api/metar.
// Corre programada porque la fuente a veces tarda más de lo que espera una visita.
export default async () => {
  try {
    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(FUENTE, { signal: ctrl.signal, headers: { 'User-Agent': 'bramador-wind-app' } });
    clearTimeout(corte);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const estaciones = limpiar(await r.json());
    if (!estaciones.length) throw new Error('vacío');
    await getStore('bramador-metar').setJSON('actual', { estaciones, leidoEn: Date.now() });
  } catch (e) {
    console.error('metar', String(e));
  }
  return new Response('ok');
};

export const config = { schedule: '*/5 * * * *' };
