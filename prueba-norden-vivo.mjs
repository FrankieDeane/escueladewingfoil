// PRUEBA TEMPORAL — no forma parte del sitio.
// La función /api/norden nunca corrió de verdad: el parser se probó contra un
// fragmento capturado, no contra el despliegue. Esto la llama en el preview,
// que es donde ya está publicada, y verifica la respuesta real.
const URL_API = 'https://deploy-preview-99--universidad-wingfoil.netlify.app/api/norden';

const linea = '='.repeat(78);
console.log(linea);
console.log('PRUEBA REAL DE /api/norden');
console.log(linea);
console.log(URL_API + '\n');

let res = null, cuerpo = '';
for (let intento = 1; intento <= 4; intento++) {
  try {
    const t0 = Date.now();
    res = await fetch(URL_API, { signal: AbortSignal.timeout(20000) });
    cuerpo = await res.text();
    console.log(`intento ${intento}: HTTP ${res.status} · ${Date.now() - t0} ms · ${res.headers.get('content-type') || ''}`);
    if (res.ok) break;
  } catch (e) {
    console.log(`intento ${intento}: ✗ ${e.message}`);
  }
  if (intento < 4) await new Promise(r => setTimeout(r, 12000));  // el preview puede estar desplegando
}

if (!res || !res.ok) {
  console.log('\n✗ La función no respondió. Cuerpo:\n' + cuerpo.slice(0, 500));
  process.exit(1);
}

console.log('\nRESPUESTA CRUDA:');
console.log(cuerpo);

let d;
try { d = JSON.parse(cuerpo); } catch { console.log('\n✗ No es JSON'); process.exit(1); }

console.log('\n' + linea);
console.log('CHEQUEOS');
console.log(linea);
let malas = 0;
const must = (ok, txt) => { if (!ok) malas++; console.log((ok ? '  ✓ ' : '  ✗ ') + txt); };

must(isFinite(d.kn) && d.kn >= 0 && d.kn < 120, 'viento plausible: ' + d.kn + ' kn');
must(isFinite(d.grados) && d.grados >= 0 && d.grados <= 360, 'dirección válida: ' + d.grados + '°');
must(/^[NSEO]{1,3}$/.test(d.rumbo || ''), 'rumbo en castellano (O de Oeste, no W): ' + d.rumbo);
must(d.alturaCm === null || isFinite(d.alturaCm), 'marea: ' + d.alturaCm + ' cm');
must(!!d.medidoEn, 'trae la hora de la medición: ' + d.medidoEn);
must(d.estacion === 'Pilote Norden', 'identifica la estación');
must(/CARP/.test(d.fuente || ''), 'atribuye la fuente: ' + d.fuente);
must(res.headers.get('access-control-allow-origin') === '*', 'la función sí manda CORS (que es todo el punto)');

// El rumbo tiene que corresponder con los grados
const R = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
must(d.rumbo === R[Math.round(((d.grados % 360) + 360) % 360 / 22.5) % 16],
     `el rumbo corresponde a los grados: ${d.grados}° → ${d.rumbo}`);

// Segunda llamada: tiene que venir del cache, no golpear la fuente de nuevo
const d2 = await (await fetch(URL_API, { signal: AbortSignal.timeout(20000) })).json();
must(d2.cache === true, 'la segunda llamada sale del cache (no golpea la fuente ajena por visita)');
must(d2.kn === d.kn, 'y devuelve el mismo dato');

console.log('\n' + linea);
console.log(malas === 0
  ? `RESULTADO: la función anda. Pilote Norden marca ${d.kn} kn del ${d.rumbo}.`
  : `RESULTADO: ${malas} chequeos fallaron`);
console.log(linea);
process.exit(malas ? 1 : 0);
