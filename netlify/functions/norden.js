import { getStore } from '@netlify/blobs';

// Pilote Norden — mareógrafo de la CARP en el Río de la Plata (Canal Martín
// García, km 45.7). Mide viento y marea de verdad, no los modela.
//
// Por qué hace falta esta función y no se lee desde el navegador:
//   1. Ninguna fuente manda Access-Control-Allow-Origin. Verificado contra
//      la CARP, su mapa, el SHN y el espejo: ninguno. El navegador no puede
//      leer nada de eso por más que el dato exista.
//   2. La CARP publica en su sitio los históricos en ZIP, pero no los valores
//      actuales en ningún formato parseable. También verificado.
// Así que el único origen con el dato vivo es el espejo de abajo, y hay que
// leerlo del lado del servidor.
//
// Se cachea en blobs: una sola lectura cada CACHE_MS para todos los visitantes
// del sitio. Es un servidor chico y ajeno; no corresponde golpearlo una vez
// por visita.
const FUENTE = 'https://www.molol.com/rio/viento-norden.html';
const CACHE_MS = 10 * 60 * 1000;   // el mareógrafo reporta cada ~10 min
const TIMEOUT_MS = 6000;

const RUMBOS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
function rumbo(grados) {
  return RUMBOS[Math.round(((grados % 360) + 360) % 360 / 22.5) % 16];
}

// El espejo deja los valores servidos en el HTML como variables de JS:
//   var dir = 231;
//   var viento= "19.4";
// y el resto como texto: "Altura 103.7 cm", "Actualizado 03-09-2026 09:54".
function parsear(html) {
  const dir = html.match(/\bvar\s+dir\s*=\s*"?(-?[\d.]+)"?/);
  const vel = html.match(/\bvar\s+viento\s*=\s*"?([\d.]+)"?/);
  if (!dir || !vel) return null;

  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const alt = texto.match(/Altura\s+(-?[\d.]+)\s*cm/i);
  const act = texto.match(/Actualizado\s+([\d-]+\s+[\d:]+)/i);

  const kn = Number(vel[1]);
  const grados = Number(dir[1]);
  if (!isFinite(kn) || !isFinite(grados) || kn < 0 || kn > 200) return null;

  return {
    kn: Math.round(kn * 10) / 10,
    grados: Math.round(grados),
    rumbo: rumbo(grados),
    // La fuente devuelve la marea con la basura de un float de 32 bits
    // (124.899994). Un decimal es toda la precisión que tiene sentido mostrar.
    alturaCm: alt ? Math.round(Number(alt[1]) * 10) / 10 : null,
    medidoEn: act ? act[1] : null,     // hora local del mareógrafo (UTC-3)
    estacion: 'Pilote Norden',
    fuente: 'Comisión Administradora del Río de la Plata (CARP)'
  };
}

export default async () => {
  const cabeceras = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Access-Control-Allow-Origin': '*'
  };

  let store = null;
  try { store = getStore({ name: 'norden', consistency: 'strong' }); } catch { /* seguimos sin cache */ }

  // Cache vigente
  if (store) {
    try {
      const guardado = await store.get('actual', { type: 'json' });
      if (guardado && Date.now() - guardado.leidoEn < CACHE_MS) {
        return new Response(JSON.stringify({ ...guardado.dato, cache: true }), { headers: cabeceras });
      }
    } catch { /* cache ilegible: se relee */ }
  }

  let dato = null;
  try {
    const res = await fetch(FUENTE, {
      headers: { 'User-Agent': 'escueladewingfoil.com.ar (+https://escueladewingfoil.com.ar)' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.ok) dato = parsear(await res.text());
  } catch { /* la fuente no respondió */ }

  if (dato) {
    if (store) {
      try { await store.setJSON('actual', { dato, leidoEn: Date.now() }); } catch { /* no crítico */ }
    }
    return new Response(JSON.stringify({ ...dato, cache: false }), { headers: cabeceras });
  }

  // Falló la lectura: si hay algo viejo en cache, sirve eso antes que nada.
  // Un dato de hace media hora vale más que ninguno, siempre que se avise.
  if (store) {
    try {
      const guardado = await store.get('actual', { type: 'json' });
      if (guardado) {
        return new Response(
          JSON.stringify({ ...guardado.dato, cache: true, vencido: true, leidoEn: guardado.leidoEn }),
          { headers: cabeceras }
        );
      }
    } catch { /* nada que servir */ }
  }

  return new Response(JSON.stringify({ error: 'sin datos' }), { status: 503, headers: cabeceras });
};

export const config = { path: '/api/norden' };
