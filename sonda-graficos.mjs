// SONDA TEMPORAL — segunda pasada, ahora sabiendo dónde mirar.
//   A) La CARP tiene una página que no habíamos encontrado: vientosymareas.php
//      (la linkea el propio CNSI). Ahí debería estar el gráfico de mareas.
//   B) El CNSI publica su estación por ThingSpeak, que es una API JSON
//      pública. Si manda CORS, podemos dibujar los gráficos nosotros con sus
//      datos, citando la fuente, en vez de scrapear nada.
const UA = { 'User-Agent': 'escueladewingfoil.com.ar (+https://escueladewingfoil.com.ar)' };
const L = '='.repeat(78);
const traer = async u => { const r = await fetch(u, { headers: UA, redirect:'follow', signal: AbortSignal.timeout(20000) }); return { r, txt: await r.text() }; };
const cors = r => r.headers.get('access-control-allow-origin') || null;

// ─── A) CARP: vientosymareas.php ───────────────────────────────────────────
for (const url of [
  'https://comisionriodelaplata.org/vientosymareas.php',
  'https://www.comisionriodelaplata.org/vientosymareas.php'
]) {
  console.log('\n' + L + '\nA) ' + url + '\n' + L);
  try {
    const { r, txt } = await traer(url);
    console.log(`HTTP ${r.status} · ${r.headers.get('content-type')||''} · ${txt.length} bytes`);
    console.log('CORS: ' + (cors(r) || 'no'));
    if (!r.ok) continue;
    console.log('Highcharts: ' + /highcharts/i.test(txt) + ' · tide-chart: ' + /tide-chart|tide-latest/i.test(txt) + ' · Norden: ' + /norden/i.test(txt));

    const eps = [...new Set([...txt.matchAll(/["'`]([^"'`\s<>]*(?:\.php|\.json|\.csv|\.txt|\.xml)(?:\?[^"'`\s<>]*)?)["'`]/g)].map(m=>m[1]))];
    console.log('\nendpoints: ' + eps.join(' | '));
    const js = [...new Set([...txt.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>m[1]))];
    console.log('scripts: ' + js.join(' | '));

    // ¿Series embebidas o llamadas ajax?
    const ajax = [...new Set([...txt.matchAll(/(?:\$\.(?:get|post|ajax|getJSON)|fetch)\s*\(\s*["'`]([^"'`]+)/g)].map(m=>m[1]))];
    console.log('llamadas ajax: ' + (ajax.length ? ajax.join(' | ') : '(ninguna)'));
    const pares = [...txt.matchAll(/\[\s*(\d{12,13})\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)].slice(0,4);
    console.log('pares [ts,valor]: ' + pares.length + (pares.length ? ' → ' + pares.map(p=>`[${p[1]},${p[2]}]`).join(' ') : ''));

    const i = txt.search(/tide|marea|highcharts/i);
    if (i >= 0) console.log('\ncontexto:\n' + txt.slice(Math.max(0,i-500), i+1800).replace(/\s+/g,' ').slice(0, 2000));
    break;
  } catch (e) { console.log('✗ ' + e.message); }
}

// ─── B) ThingSpeak del CNSI ────────────────────────────────────────────────
for (const [nombre, canal] of [['estación meteorológica', 1506798], ['marea', 2075368], ['otro feed', 3447831]]) {
  const url = `https://api.thingspeak.com/channels/${canal}/feeds.json?results=3`;
  console.log('\n' + L + `\nB) CNSI — ${nombre} (canal ${canal})\n` + L);
  console.log(url);
  try {
    const { r, txt } = await traer(url);
    console.log(`HTTP ${r.status} · ${r.headers.get('content-type')||''}`);
    console.log('CORS: ' + (cors(r) ? cors(r) + '  ← LEÍBLE DESDE EL NAVEGADOR, sin función intermedia' : 'no'));
    if (!r.ok) { console.log(txt.slice(0,300)); continue; }
    const d = JSON.parse(txt);
    console.log('\ncanal: ' + JSON.stringify(d.channel, null, 1));
    console.log('\núltimas lecturas:');
    (d.feeds||[]).forEach(f => console.log('  ' + JSON.stringify(f)));
  } catch (e) { console.log('✗ ' + e.message); }
}
console.log('\n' + L + '\nFIN\n' + L);
