// SONDA TEMPORAL — no forma parte del sitio.
// Verifica dos cosas antes de construir el "¿Salgo hoy?":
//   1. ¿Open-Meteo responde para TODOS los spots (incluida Patagonia y Litoral)?
//   2. ¿El cruce pronóstico + regla del spot da una respuesta útil?
// Node 24 trae fetch nativo: sin dependencias.

// Spots reales del sitio (n = nombre, w = viento ideal ya codificado en index.html)
const SPOTS = [
  { n:'San Isidro', w:'S/SO 12-25 kn', lat:-34.4738, lng:-58.5054 },
  { n:'Mar del Plata — Waikiki', w:'S/SE 15-30 kn', lat:-38.0167, lng:-57.5333 },
  { n:'Pinamar — La Frontera', w:'S/SE 12-22 kn', lat:-37.1075, lng:-56.8617 },
  { n:'Chascomús — Laguna', w:'S 10-20 kn', lat:-35.5731, lng:-58.0264 },
  { n:'Paraná — Laguna Setúbal', w:'N/NE 12-22 kn', lat:-31.6107, lng:-60.6973 },
  { n:'Gualeguaychú — Río Uruguay', w:'E/NE 12-25 kn', lat:-33.0094, lng:-58.5172 },
  { n:'Corrientes — Río Paraná', w:'N/NE 15-28 kn', lat:-27.4806, lng:-58.8341 },
  { n:'Paso de la Patria', w:'N 18-35 kn', lat:-27.3148, lng:-58.5781 },
  { n:'Embalse Río Tercero', w:'S/SO 15-30 kn', lat:-32.1761, lng:-64.4061 },
  { n:'Laguna Mar Chiquita', w:'N/NE 15-35 kn', lat:-30.7167, lng:-62.85 },
  { n:'Lago Lolog — San Martín', w:'S/SO 18-35 kn', lat:-40.0833, lng:-71.45 },
  { n:'Lago Lacar — Quila Quina', w:'SO 15-28 kn', lat:-40.1717, lng:-71.4567 },
  { n:'Nahuel Huapi — Dina Huapi', w:'O/NO 20-40 kn', lat:-41.0569, lng:-71.1581 },
  { n:'Nahuel Huapi — Playa Bonita', w:'O 15-25 kn', lat:-41.1167, lng:-71.45 },
  { n:'Lago Gutierrez', w:'O/SO 15-30 kn', lat:-41.2167, lng:-71.4 },
  { n:'Puerto Madryn — Golfo Nuevo', w:'S 18-35 kn', lat:-42.7692, lng:-65.0386 },
  { n:'Rawson — Playa Unión', w:'S 15-30 kn', lat:-43.3167, lng:-65.05 },
];

// Rosa de los vientos en español: O = Oeste (no W).
const RUMBOS = { N:0, NE:45, E:90, SE:135, S:180, SO:225, O:270, NO:315 };

// 'S/SO 12-25 kn' → { dirs:[180,225], min:12, max:25 }
function parseRegla(w) {
  const rango = w.match(/(\d+)\s*-\s*(\d+)/);
  const dirTxt = w.split(/\s+/)[0];
  const dirs = dirTxt.split('/').map(d => RUMBOS[d.toUpperCase()]).filter(d => d !== undefined);
  return { dirs, min: rango ? +rango[1] : null, max: rango ? +rango[2] : null };
}

// Diferencia angular mínima entre dos rumbos (0-180)
function difAngular(a, b) { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

// ¿Sirve esta hora? Tolerancia ±45° sobre la dirección ideal.
function evaluar(regla, kn, deg) {
  if (regla.min === null) return { ok:false, motivo:'sin regla de viento' };
  if (kn < regla.min) return { ok:false, motivo:`poco viento (${kn} kn, necesitás ${regla.min}+)` };
  if (kn > regla.max) return { ok:false, motivo:`demasiado viento (${kn} kn, máx ${regla.max})` };
  const cerca = regla.dirs.some(d => difAngular(d, deg) <= 45);
  if (!cerca) return { ok:false, motivo:`dirección equivocada (${Math.round(deg)}°)` };
  return { ok:true, motivo:`${kn} kn en dirección correcta` };
}

// Open-Meteo acepta varias coordenadas en un solo pedido (lat1,lat2&lon1,lon2)
const url = 'https://api.open-meteo.com/v1/forecast'
  + `?latitude=${SPOTS.map(s => s.lat).join(',')}`
  + `&longitude=${SPOTS.map(s => s.lng).join(',')}`
  + '&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m'
  + '&wind_speed_unit=kn&timezone=America%2FArgentina%2FBuenos_Aires&forecast_days=2';

console.log('Pidiendo pronóstico para', SPOTS.length, 'spots en UN solo request...\n');
const t0 = Date.now();
const res = await fetch(url);
const ms = Date.now() - t0;
console.log('HTTP status :', res.status);
console.log('Tiempo      :', ms, 'ms');
console.log('Rate limit  :', res.headers.get('x-ratelimit-limit') || '(no informa header)');
if (!res.ok) {
  console.log('Cuerpo del error:', (await res.text()).slice(0, 300));
  process.exit(1);
}
const data = await res.json();
const arr = Array.isArray(data) ? data : [data];
console.log('Respuestas recibidas:', arr.length, '/', SPOTS.length);
console.log('\n' + '='.repeat(78));
console.log('SIMULACIÓN REAL DEL "¿SALGO HOY?" — próximas 12 h de cada spot');
console.log('='.repeat(78));

let conDatos = 0, conVentana = 0;
arr.forEach((d, i) => {
  const sp = SPOTS[i];
  if (!d?.hourly?.wind_speed_10m) { console.log(`\n✗ ${sp.n}: SIN DATOS`); return; }
  conDatos++;
  const regla = parseRegla(sp.w);
  const { time, wind_speed_10m: vel, wind_gusts_10m: raf, wind_direction_10m: dir } = d.hourly;
  // Desde la hora actual, 12 h hacia adelante
  const ahora = new Date().toISOString().slice(0, 13);
  let ini = time.findIndex(t => t.slice(0, 13) >= ahora);
  if (ini < 0) ini = 0;
  const ventana = [];
  for (let h = ini; h < Math.min(ini + 12, time.length); h++) {
    const ev = evaluar(regla, Math.round(vel[h]), dir[h]);
    if (ev.ok) ventana.push({ hora: time[h].slice(11, 16), kn: Math.round(vel[h]), raf: Math.round(raf[h]) });
  }
  if (ventana.length) conVentana++;
  const muestra = `${Math.round(vel[ini])} kn / ráf ${Math.round(raf[ini])} / ${Math.round(dir[ini])}°`;
  console.log(`\n${sp.n}`);
  console.log(`  regla del spot : ${sp.w}`);
  console.log(`  ahora          : ${muestra}`);
  if (ventana.length) {
    const h = ventana.map(v => v.hora).join(', ');
    console.log(`  >>> SÍ — ${ventana.length}h navegables: ${h}  (ej. ${ventana[0].kn} kn, ráfagas ${ventana[0].raf})`);
  } else {
    console.log(`  >>> NO — ${evaluar(regla, Math.round(vel[ini]), dir[ini]).motivo}`);
  }
});

console.log('\n' + '='.repeat(78));
console.log(`RESULTADO: ${conDatos}/${SPOTS.length} spots con datos | ${conVentana} con ventana navegable en 12 h`);
console.log('='.repeat(78));
