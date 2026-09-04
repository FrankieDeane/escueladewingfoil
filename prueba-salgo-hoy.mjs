// PRUEBA TEMPORAL — no forma parte del sitio.
// Corre el "¿Salgo hoy?" tal cual está en index.html, pero contra la API real
// de Open-Meteo. Los tests locales usan una respuesta simulada porque el
// entorno de desarrollo no tiene salida a internet; esto cierra ese hueco.
import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
let pedidos = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://escueladewingfoil.com.ar/',
  beforeParse(w) {
    // jsdom no implementa matchMedia (el sitio lo usa en el efecto de anatomía)
    w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
    // fetch REAL: es lo que vinimos a probar
    w.fetch = (url, opt) => { pedidos.push(String(url)); return globalThis.fetch(url, opt); };
  }
});
const { window: w } = dom;
const d = w.document;

await new Promise(r => w.addEventListener('load', r));

// Esperar a que vuelva la API (o hasta 20 s)
const t0 = Date.now();
const sec = d.getElementById('salgo-hoy');
while (sec.hidden && Date.now() - t0 < 20000) await new Promise(r => setTimeout(r, 250));
const ms = Date.now() - t0;

const linea = '='.repeat(78);
console.log(linea);
console.log('PRUEBA REAL DEL "¿SALGO HOY?" — ' + new Date().toLocaleString('es-AR', { timeZone:'America/Argentina/Buenos_Aires' }));
console.log(linea);
const deViento = ((w.__EWF||{}).SPOTS||[]).filter(sp => sp.w && /\d+\s*-\s*\d+/.test(sp.w) && isFinite(sp.lat));
console.log('Spots de viento    :', deViento.length, 'de', ((w.__EWF||{}).SPOTS||[]).length, 'totales (el resto son cable parks)');
var aMeteo = pedidos.filter(u => u.includes('open-meteo'));
console.log('Requests a la API  :', aMeteo.length, aMeteo.length === 1 ? '(uno solo para todos los spots, como se diseñó)' : '(!)');
console.log('Otros fetch (sitio):', pedidos.length - aMeteo.length, '(instructores, equipos)');
console.log('Tardó              :', ms, 'ms');
console.log('Sección visible    :', sec.hidden ? 'NO — algo falló' : 'sí');

if (sec.hidden) {
  console.log('\n✗ La sección quedó oculta. URL pedida:\n ', pedidos[0]);
  const res = await globalThis.fetch(pedidos[0]).catch(e => ({ statusText: e.message }));
  console.log('  Respuesta directa:', res.status || res.statusText);
  process.exit(1);
}

console.log('\nRESUMEN EN PANTALLA:');
console.log(' ', d.getElementById('hoyResumen').textContent.trim());
console.log(' ', d.getElementById('hoyEstado').textContent.trim().replace(/\s+/g, ' '));

const leer = sel => [...d.querySelectorAll(sel)].map(c => ({
  spot:   c.querySelector('h3').textContent,
  prov:   c.querySelector('.hoy__prov').textContent,
  dato:   c.querySelector('.hoy__dato').textContent,
  extra: (c.querySelector('.hoy__horas') || c.querySelector('.hoy__motivo')).textContent.trim(),
  regla:  c.querySelector('.hoy__regla').textContent
}));

const si = leer('#hoySi .hoy__card'), no = leer('#hoyNo .hoy__card');

console.log('\n' + linea);
console.log('SE PUEDE NAVEGAR (' + si.length + ')');
console.log(linea);
si.forEach(c => {
  console.log('\n' + c.spot + '  [' + c.prov + ']');
  console.log('  ahora : ' + c.dato);
  console.log('  ' + c.extra);
  console.log('  ' + c.regla);
});
if (!si.length) console.log('\n(ninguno con ventana en las próximas 12 h)');

console.log('\n' + linea);
console.log('NO DAN (' + no.length + ') — con el motivo, que es lo que ningún pronóstico te dice');
console.log(linea);
no.forEach(c => console.log('  ' + c.spot.padEnd(30) + c.dato.padEnd(34) + ' → ' + c.extra));

// Chequeos de sanidad sobre datos reales
console.log('\n' + linea);
console.log('CHEQUEOS DE SANIDAD');
console.log(linea);
const todas = [...si, ...no];
const nums = todas.map(c => +c.dato.match(/(\d+) kn/)[1]);
const dirs = todas.map(c => +c.dato.match(/(\d+)°/)[1]);
const chk = (ok, txt) => console.log((ok ? '  ✓ ' : '  ✗ ') + txt);
let malas = 0; const must = (ok, txt) => { if (!ok) malas++; chk(ok, txt); };

must(todas.length === deViento.length, 'aparecen los ' + deViento.length + ' spots de viento (los cable parks quedan afuera): ' + todas.length);
must(!todas.some(c=>/Cable Park|Wake Park/.test(c.spot)), 'ningún cable park en la lista');
must(!todas.some(c=>/sin regla/.test(c.extra)), 'ninguno queda sin motivo real');
must(nums.every(n => n >= 0 && n < 90), 'velocidades plausibles: ' + Math.min(...nums) + '–' + Math.max(...nums) + ' kn');
must(dirs.every(dg => dg >= 0 && dg <= 360), 'direcciones válidas: ' + Math.min(...dirs) + '°–' + Math.max(...dirs) + '°');
must(si.every(c => /hora(s)? navegable/.test(c.extra)), 'los "sí" muestran las horas concretas');
must(si.every(c => /^(Ahora|A las \d\d:\d\d) · /.test(c.dato)), 'los "sí" dicen a qué hora corresponde el viento que muestran');
must(si.every(c => {
  const kn = +c.dato.match(/(\d+) kn/)[1];
  const [, mn, mx] = c.regla.match(/(\d+)-(\d+) kn/);
  return kn >= +mn && kn <= +mx;
}), 'ninguna tarjeta en verde se contradice con la regla de su spot');
must(no.every(c => /^Ahora · /.test(c.dato)), 'los "no" muestran el viento de ahora, y lo dicen');
must(no.every(c => /poco viento|demasiado viento|dirección no sirve|sin regla/.test(c.extra)), 'los "no" siempre dicen por qué');
must(todas.every(c => /Este spot pide .+ kn/.test(c.regla)), 'todos muestran la regla del spot');

// Bramador tiene que contestar con este mismo dato
d.getElementById('bramFab').dispatchEvent(new w.MouseEvent('click', { bubbles:true }));
await new Promise(r => setTimeout(r, 80));
const msgs = d.getElementById('bramMsgs'), input = d.getElementById('bramInput');
const antes = msgs.children.length;
input.value = '¿salgo hoy?';
d.getElementById('bramForm').dispatchEvent(new w.Event('submit', { bubbles:true, cancelable:true }));
await new Promise(r => setTimeout(r, 600));
const resp = [...msgs.children].slice(antes)[1].textContent;
must(si.length ? /hay ventana en \d+ spot/.test(resp) : /Hoy no/.test(resp),
     'Bramador contesta con el dato real');
console.log('\n  Bramador dijo:\n  ' + resp.split('\n').filter(Boolean).slice(0, 4).map(l => '  ' + l).join('\n'));

console.log('\n' + linea);
console.log(malas === 0 ? 'RESULTADO: todo consistente contra la API real' : 'RESULTADO: ' + malas + ' chequeos fallaron');
console.log(linea);
process.exit(malas ? 1 : 0);
