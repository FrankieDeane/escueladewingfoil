// SONDA TEMPORAL — tercera y última pasada.
// Ya sabemos: el dato existe, nadie manda CORS, y la página institucional de
// la CARP solo publica ZIPs históricos. Falta saber si el mapa de la CARP
// (servicios_main.php?sid=VM, 66 kB con Leaflet) trae los valores en vivo o
// los pide a un endpoint aparte. Si los trae, es la fuente oficial y le
// ganamos al espejo de terceros.
const URL_MAPA = 'https://www.comisionriodelaplata.org/servicios_main.php?sid=VM';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; sonda-escueladewingfoil/1.0)' };

const res = await fetch(URL_MAPA, { headers: UA, signal: AbortSignal.timeout(15000) });
const html = await res.text();
console.log('HTTP ' + res.status + ' · ' + html.length + ' bytes\n');

// 1. Todo lo que rodee a "Norden"
console.log('='.repeat(78));
console.log('CONTEXTOS DE "NORDEN"');
console.log('='.repeat(78));
let i = -1, n = 0;
while ((i = html.toLowerCase().indexOf('norden', i + 1)) !== -1 && n < 6) {
  n++;
  console.log('\n--- aparición ' + n + ' (offset ' + i + ') ---');
  console.log(html.slice(Math.max(0, i - 550), i + 750).replace(/\s+/g, ' '));
}
if (!n) console.log('(no aparece)');

// 2. Endpoints que la página pida por detrás
console.log('\n' + '='.repeat(78));
console.log('ENDPOINTS Y LLAMADAS');
console.log('='.repeat(78));
const urls = [...new Set([...html.matchAll(/["\'`]([^"\'`\s]*(?:\.php|\.json|\.xml|\.txt|\.csv)(?:\?[^"\'`\s]*)?)["\'`]/g)].map(m => m[1]))];
urls.forEach(u => console.log('  ' + u));

// 3. ¿Hay números de viento/marea embebidos?
console.log('\n' + '='.repeat(78));
console.log('POSIBLES VALORES EMBEBIDOS');
console.log('='.repeat(78));
const pistas = [...html.matchAll(/(viento|wind|marea|tide|nudos|knots|direccion|dir)\s*[:=]\s*["\']?([\d.,]+)/gi)]
  .map(m => m[0].replace(/\s+/g, ' '));
console.log(pistas.length ? [...new Set(pistas)].slice(0, 25).join('\n') : '(ninguno: los pide por AJAX o no están acá)');

// 4. Probar los endpoints .php que parezcan de datos
console.log('\n' + '='.repeat(78));
console.log('PROBANDO LOS ENDPOINTS QUE PARECEN DE DATOS');
console.log('='.repeat(78));
const base = 'https://www.comisionriodelaplata.org/';
for (const u of urls.filter(u => /vm|viento|marea|wind|tide|estac|dato|json/i.test(u)).slice(0, 8)) {
  const full = u.startsWith('http') ? u : base + u.replace(/^\//, '');
  try {
    const r = await fetch(full, { headers: UA, signal: AbortSignal.timeout(12000) });
    const b = await r.text();
    console.log('\n' + full);
    console.log('  HTTP ' + r.status + ' · ' + (r.headers.get('content-type') || '') + ' · ' + b.length + ' bytes');
    console.log('  CORS: ' + (r.headers.get('access-control-allow-origin') || 'no'));
    if (/norden/i.test(b)) {
      const j = b.search(/norden/i);
      console.log('  ¡MENCIONA NORDEN! → ' + b.slice(Math.max(0, j - 300), j + 500).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 450));
    }
  } catch (e) { console.log('\n' + full + '\n  ✗ ' + e.message); }
}
