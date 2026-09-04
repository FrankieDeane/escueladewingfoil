// SONDA TEMPORAL — no forma parte del sitio.
// Dos preguntas antes de prometer nada:
//   A) El gráfico de mareas de la CARP lo dibuja Highcharts en el navegador.
//      ¿De dónde saca la serie? Si está embebida o hay un endpoint, podemos
//      dibujar nuestro propio gráfico con los datos, citando a la CARP.
//   B) La estación del CNSI (San Isidro): ¿qué publica y se puede leer?
// En los dos casos lo decisivo es CORS: sin él, hace falta función de Netlify.
const UA = { 'User-Agent': 'escueladewingfoil.com.ar (+https://escueladewingfoil.com.ar)' };
const linea = '='.repeat(78);

async function traer(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  return { r, txt: await r.text() };
}
function cabecera(nombre, url, r, txt) {
  console.log('\n' + linea + '\n' + nombre + '\n' + linea);
  console.log(url);
  console.log(`HTTP ${r.status} · ${r.headers.get('content-type') || ''} · ${txt.length} bytes`);
  const cors = r.headers.get('access-control-allow-origin');
  console.log('CORS: ' + (cors ? cors + '  ← leíble desde el navegador' : 'no manda el header  ← hace falta función de Netlify'));
}

// ─── A) CARP: de dónde sale la serie del gráfico ───────────────────────────
try {
  const url = 'https://www.comisionriodelaplata.org/servicios_main.php?sid=VM';
  const { r, txt } = await traer(url);
  cabecera('A) CARP — origen de la serie de Highcharts', url, r, txt);

  console.log('\n¿Menciona Highcharts?: ' + /highcharts/i.test(txt));
  console.log('¿Menciona tide-chart?: ' + /tide-chart|tide-latest|tabs-\d+-tide/i.test(txt));

  // Series embebidas: data: [[...]] o [[1234567890000, 1.23], ...]
  const series = [...txt.matchAll(/(?:data|series)\s*:\s*(\[\s*\[[\s\S]{0,400}?\]\s*\])/g)].map(m => m[1]);
  console.log('\nSeries embebidas encontradas: ' + series.length);
  series.slice(0, 3).forEach((s, i) => console.log(`  [${i}] ${s.replace(/\s+/g, ' ').slice(0, 260)}`));

  // Pares [timestamp, valor] sueltos
  const pares = [...txt.matchAll(/\[\s*(\d{12,13})\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)].slice(0, 6);
  console.log('\nPares [timestamp, valor]: ' + pares.length + (pares.length ? ' → ' + pares.map(p => p[0]).join(' ') : ''));

  // Cualquier URL que pida datos
  const eps = [...new Set([...txt.matchAll(/["'`]([^"'`\s<>]*(?:\.php|\.json|\.xml|\.csv|\.txt)(?:\?[^"'`\s<>]*)?)["'`]/g)].map(m => m[1]))];
  const datos = eps.filter(u => /tide|marea|wind|viento|dato|data|chart|serie|estac|json|csv/i.test(u));
  console.log('\nEndpoints con pinta de datos: ' + (datos.length ? datos.join(' | ') : '(ninguno)'));

  // Scripts externos: la lógica del gráfico puede estar en un .js aparte
  const js = [...new Set([...txt.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]))];
  console.log('\nScripts que carga: ' + js.join(' | '));

  // Probar los .js propios: ahí puede estar la URL de los datos
  for (const s of js.filter(u => !/^https?:\/\/(cdn|unpkg|ajax|code)\./.test(u)).slice(0, 6)) {
    const full = s.startsWith('http') ? s : 'https://www.comisionriodelaplata.org/' + s.replace(/^\//, '');
    try {
      const { r: r2, txt: t2 } = await traer(full);
      const pistas = [...new Set([...t2.matchAll(/["'`]([^"'`\s<>]*(?:\.php|\.json|\.csv)(?:\?[^"'`\s<>]*)?)["'`]/g)].map(m => m[1]))]
        .filter(u => /tide|marea|wind|viento|dato|data|chart|json|csv/i.test(u));
      if (pistas.length || /tide|highcharts/i.test(t2)) {
        console.log(`\n  ${full} (${r2.status}, ${t2.length} b)`);
        if (pistas.length) console.log('    → pide: ' + pistas.join(' | '));
        const ctx = t2.search(/tide|highcharts/i);
        if (ctx >= 0) console.log('    → contexto: ' + t2.slice(Math.max(0, ctx - 150), ctx + 350).replace(/\s+/g, ' '));
      }
    } catch (e) { console.log(`  ${full} ✗ ${e.message}`); }
  }
} catch (e) { console.log('A) ✗ ' + e.message); }

// ─── B) CNSI — estación meteorológica de San Isidro ────────────────────────
for (const url of [
  'https://cnsi.org.ar/yachting/estacion-meteorologica/',
  'https://cnsi.org.ar/'
]) {
  try {
    const { r, txt } = await traer(url);
    cabecera('B) CNSI — ' + url, url, r, txt);

    const iframes = [...new Set([...txt.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]))];
    console.log('\niframes: ' + (iframes.length ? iframes.join(' | ') : '(ninguno)'));

    const js = [...new Set([...txt.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]))]
      .filter(u => !/jquery|bootstrap|wp-includes|wp-content\/plugins\/(?!.*weather)/i.test(u));
    console.log('scripts propios: ' + js.slice(0, 12).join(' | '));

    const pistas = [...txt.matchAll(/(viento|wind|marea|tide|temperatur|humedad|presi[oó]n|nudos|km\/h)[^<>{}]{0,60}?([\d.,]+)/gi)]
      .map(m => m[0].replace(/\s+/g, ' ')).slice(0, 12);
    console.log('\nValores en la página: ' + (pistas.length ? '\n  ' + [...new Set(pistas)].join('\n  ') : '(ninguno visible: se cargan por JS)'));

    const eps = [...new Set([...txt.matchAll(/["'`]([^"'`\s<>]*(?:\.php|\.json|\.xml|\.csv|\.txt)(?:\?[^"'`\s<>]*)?)["'`]/g)].map(m => m[1]))]
      .filter(u => /weather|clima|estac|wind|viento|marea|tide|data|dato|json|csv/i.test(u));
    console.log('endpoints con pinta de datos: ' + (eps.length ? eps.join(' | ') : '(ninguno)'));
  } catch (e) { console.log('\nB) ' + url + ' ✗ ' + e.message); }
}

console.log('\n' + linea + '\nFIN\n' + linea);
