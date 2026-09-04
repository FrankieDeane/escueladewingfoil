// SONDA TEMPORAL — no forma parte del sitio.
// Segunda pasada: ya sabemos que el dato existe y que ninguna fuente manda
// CORS. Ahora hace falta ver la estructura exacta de la página oficial de la
// CARP para poder parsearla desde una función de Netlify.
const FUENTES = [
  ['CARP (oficial)', 'https://www.comisionriodelaplata.org/servicios_vm.php'],
  ['molol (espejo)', 'https://www.molol.com/rio/viento-norden.html'],
];

const linea = '='.repeat(78);
for (const [nombre, url] of FUENTES) {
  console.log('\n' + linea);
  console.log(nombre + '  —  ' + url);
  console.log(linea);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; sonda-escueladewingfoil/1.0)' },
      signal: AbortSignal.timeout(15000)
    });
    console.log('HTTP ' + res.status + '  ·  ' + (res.headers.get('content-type') || ''));
    const body = await res.text();
    console.log('bytes: ' + body.length + '\n');
    console.log('--- HTML crudo (lo que importa para escribir el parser) ---');
    console.log(body.slice(0, 4200));
    if (body.length > 4200) console.log('\n[... ' + (body.length - 4200) + ' bytes más ...]');
  } catch (e) {
    console.log('✗ ' + e.message);
  }
}
