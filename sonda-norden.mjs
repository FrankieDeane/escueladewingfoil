// SONDA TEMPORAL — no forma parte del sitio.
// Antes de sumar Pilote Norden al "¿Salgo hoy?", hay que saber tres cosas:
//   1. ¿Hay un endpoint alcanzable con el viento actual?
//   2. ¿Qué devuelve — JSON, HTML, otra cosa?
//   3. ¿Manda CORS? Sin Access-Control-Allow-Origin el navegador no lo puede
//      leer, por más que el dato exista. Eso decide si se puede hacer desde
//      el sitio o hace falta un intermediario.
const CANDIDATOS = [
  ['CARP — estado Río de la Plata',  'https://www.comisionriodelaplata.org/servicios_vm.php'],
  ['CARP — servicios',               'https://www.comisionriodelaplata.org/servicios_main.php?sid=VM'],
  ['CARP — home',                    'https://www.comisionriodelaplata.org/'],
  ['molol — viento Norden',          'https://www.molol.com/rio/viento-norden.html'],
  ['SHN — home',                     'https://www.hidro.gob.ar/'],
  ['CPNLB — pronósticos',            'https://cpnlb.org.ar/static/pronosticos.php'],
];

const linea = '='.repeat(78);
console.log(linea);
console.log('SONDA — ¿se puede leer el viento de Pilote Norden?');
console.log(linea);

const vivos = [];
for (const [nombre, url] of CANDIDATOS) {
  console.log('\n' + nombre);
  console.log('  ' + url);
  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sonda-escueladewingfoil/1.0)' },
      signal: AbortSignal.timeout(15000)
    });
    const ms = Date.now() - t0;
    const cors = res.headers.get('access-control-allow-origin');
    const tipo = res.headers.get('content-type') || '(sin content-type)';
    console.log(`  HTTP ${res.status} · ${ms} ms · ${tipo}`);
    console.log(`  CORS: ${cors ? cors + '  ← el navegador PODRÍA leerlo' : 'NO manda el header  ← el navegador NO lo puede leer'}`);
    if (!res.ok) continue;
    const body = await res.text();
    console.log(`  Cuerpo: ${body.length} bytes`);

    // ¿Nombra a Norden? ¿Hay números de viento cerca?
    const menciona = /norden/i.test(body);
    console.log(`  Menciona "Norden": ${menciona ? 'sí' : 'no'}`);
    if (menciona) {
      const i = body.search(/norden/i);
      const trozo = body.slice(Math.max(0, i - 400), i + 900)
        .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      console.log('  Contexto: ' + trozo.slice(0, 460));
      vivos.push({ nombre, url, cors: !!cors });
    }
    // Endpoints que la página llame por detrás
    const llamadas = [...new Set(
      [...body.matchAll(/(?:url\s*:\s*|fetch\(|src\s*=\s*|action\s*=\s*)["']([^"']+\.(?:php|json|xml|asp|ashx)[^"']*)["']/gi)]
        .map(m => m[1])
    )].slice(0, 12);
    if (llamadas.length) console.log('  Endpoints que menciona: ' + llamadas.join(' | '));
  } catch (e) {
    console.log('  ✗ ' + (e.name === 'TimeoutError' ? 'timeout' : e.message));
  }
}

console.log('\n' + linea);
console.log('CONCLUSIÓN');
console.log(linea);
if (!vivos.length) {
  console.log('Ninguna fuente alcanzable menciona a Norden. No se puede sumar hoy.');
} else {
  vivos.forEach(v => console.log(`  ${v.cors ? '✓ CON CORS  ' : '✗ SIN CORS  '} ${v.nombre}`));
  console.log(vivos.some(v => v.cors)
    ? '\nHay al menos una fuente leíble desde el navegador: se puede hacer directo.'
    : '\nEl dato existe pero ninguna fuente manda CORS: desde el navegador no se\npuede leer. Haría falta una función de Netlify que lo busque del lado del\nservidor y lo sirva al sitio.');
}
