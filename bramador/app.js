/* Bramador by Escuela de Wingfoil — el viento del Río de la Plata.
 *
 * Una sola página: cada pantalla se pinta desde una función según el #/hash.
 * Todo lo que se muestra sale de fuentes públicas leídas desde el navegador
 * (Open-Meteo, ThingSpeak del CNSI) o desde funciones propias del sitio
 * (/api/norden, /api/bramador-enso). Cada dato se guarda
 * en el teléfono para que la app abra al toque y siga andando sin señal.
 */
(function(){
'use strict';

// ─────────────────────────────── Configuración ───────────────────────────────
var TZ = 'America/Argentina/Buenos_Aires';

// Spots del río. La costa mira al NE: sirve el viento que viene del agua
// (N a SSE). Con viento de tierra (S, SO, O, NO) llega rachado y te aleja de
// la orilla, así que no se marca como bueno. "arco" es ese sector, en grados.
var SPOTS = [
  {id:'sanisidro', n:'San Isidro',  sub:'Náutico · CNSI',  lat:-34.4678, lng:-58.5086, arco:[350,170], cam:'1735938641', foto:'wf-14740926'},
  {id:'peru',      n:'Perú Beach',  sub:'Acassuso',        lat:-34.4790, lng:-58.4985, arco:[350,170], cam:'1735938641', foto:'wf-18388624'},
  {id:'martinez',  n:'Martínez',    sub:'La Plazita',      lat:-34.4885, lng:-58.4905, arco:[350,170], cam:'1601563134', foto:'wf-15151064'},
  {id:'olivos',    n:'Olivos',      sub:'Vicente López',   lat:-34.5075, lng:-58.4770, arco:[350,170], cam:'1577126865', foto:'wf-38774856'},
  {id:'quilmes',   n:'Quilmes',     sub:'Costanera',       lat:-34.7135, lng:-58.2385, arco:[340,160], foto:'wf-14447118'},
  {id:'puntalara', n:'Punta Lara',  sub:'Ensenada',        lat:-34.8180, lng:-57.9690, arco:[340,160], foto:'wf-17901682'}
];
// Cámaras de Windy que mira al río (las mismas que ya usa el sitio).
var CAMS = [
  {id:'1735938641', n:'Perú Beach',           sub:'Acassuso · Náutica San Isidro', spot:'peru'},
  {id:'1577126865', n:'Vicente López · Olivos', sub:'Mira al río desde Olivos',    spot:'olivos'},
  {id:'1601563134', n:'Martínez · al río',    sub:'Martínez Oeste, de frente al río', spot:'martinez'},
  {id:'1745449788', n:'Martínez · costa',     sub:'Mira al noroeste',               spot:'martinez'}
];
// Pilote Norden: mareógrafo en el medio del río (Canal Martín García).
var NORDEN = {lat:-34.6297, lng:-57.9204};
// Rango de nudos según nivel.
var NIVELES = {
  principiante: {n:'Principiante', min:12, max:20},
  intermedio:   {n:'Intermedio',   min:12, max:28},
  avanzado:     {n:'Avanzado',     min:11, max:35}
};
var FOTOS = {
  hoy:'wf-14740926', rio:'wf-18388624', spot:'wf-14740926', mas:'wf-38774856',
  temporada:'wf-38774856', alertas:'wf-17901682', pregunta:'wf-15151064', equipate:'wf-15151231',
  opinion:'wf-14447118', instalar:'wf-38774856', perfil:'wf-18388624', dia:'wf-14740926'
};
function foto(id, grande){ return '/assets/img/' + id + (grande ? '' : '-800') + '.jpg'; }

// ─────────────────────────────── Utilidades ───────────────────────────────
var $app = document.getElementById('app');
function esc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
var RUMBOS16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
function rumbo(g){ return RUMBOS16[Math.round((((g % 360) + 360) % 360) / 22.5) % 16]; }
var RUMBOS8 = ['N','NE','E','SE','S','SO','O','NO'];
function rumbo8(g){ return RUMBOS8[Math.round((((g % 360) + 360) % 360) / 45) % 8]; }
function kclase(kn){ return kn < 8 ? 'k0' : kn < 12 ? 'k1' : kn < 16 ? 'k2' : kn < 20 ? 'k3' : kn < 25 ? 'k4' : 'k5'; }
var KCOLOR = {k0:'#22303F', k1:'#2F7FD1', k2:'#22C3A6', k3:'#A6E22E', k4:'#FFC531', k5:'#D6336C'};
function kcolor(kn){ return KCOLOR[kclase(kn)]; }
function r0(x){ return Math.round(x); }
// Flecha que apunta hacia donde VA el viento (la dirección dice de dónde viene).
function flecha(deg, cls){
  return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(' + r0(deg) + 'deg)"><path d="M12 4v16M5 13l7 7 7-7"/></svg>';
}
// Brújula: N/S/E/O, sector bueno del spot y un triangulito del lado de donde viene el viento.
function brujula(deg, arco, tam){
  tam = tam || 112;
  var c = 66, r = 44;
  function pto(a, rad){ var t = (a - 90) * Math.PI / 180; return [c + rad * Math.cos(t), c + rad * Math.sin(t)]; }
  var sector = '';
  if (arco) {
    var a0 = arco[0], a1 = arco[1], largo = ((a1 - a0) + 360) % 360;
    var p0 = pto(a0, r), p1 = pto(a1, r);
    sector = '<path d="M ' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) + ' A ' + r + ' ' + r + ' 0 ' + (largo > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + '" fill="none" stroke="#22C3A6" stroke-width="8" opacity=".55"/>';
  }
  // Un triangulito junto al borde, del lado de donde viene el viento, apuntando al centro.
  var flechaG = deg == null ? '' :
    '<g transform="rotate(' + r0(deg) + ' 66 66)"><path d="M53 29 L79 29 L66 52 Z" fill="#FF5A2C" stroke="#0B1A22" stroke-width="2" stroke-linejoin="round"/></g>';
  return '<svg class="brujula" width="' + tam + '" height="' + tam + '" viewBox="0 0 132 132" role="img" aria-label="' + (deg == null ? 'Brújula' : 'El viento viene del ' + rumbo(deg)) + '">' +
    '<circle cx="66" cy="66" r="62" fill="rgba(11,26,34,.75)" stroke="rgba(255,255,255,.25)" stroke-width="2"/>' + sector +
    '<text x="66" y="17" text-anchor="middle" fill="#EAF2F8" font-family="DM Sans" font-weight="800" font-size="13">N</text>' +
    '<text x="66" y="125" text-anchor="middle" fill="#EAF2F8" font-family="DM Sans" font-weight="800" font-size="13">S</text>' +
    '<text x="121" y="70" text-anchor="middle" fill="#EAF2F8" font-family="DM Sans" font-weight="800" font-size="13">E</text>' +
    '<text x="11" y="70" text-anchor="middle" fill="#EAF2F8" font-family="DM Sans" font-weight="800" font-size="13">O</text>' +
    flechaG + '</svg>';
}
var PAJARO = '<rect width="36" height="36" rx="8" fill="#0B1A22"/><g transform="translate(-1.8 2.6) scale(1.1)" fill="#F7F4EC">' +
  '<path d="M18 16 C14 10 7 8 2 10 C7 11 12 13 15 17 Z" opacity=".95"/><path d="M18 16 C22 10 29 8 34 10 C29 11 24 13 21 17 Z" opacity=".8"/>' +
  '<path d="M15 17 C16 19 18 20 20 19 L21 17 C20 18 18 18.5 16 17.5 Z"/><circle cx="21.5" cy="16" r="2"/></g>';
function marca(){
  return '<a class="marca" href="#/"><svg viewBox="0 0 36 36" aria-hidden="true">' + PAJARO + '</svg>' +
    '<span><b>BRAMADOR</b><small>BY ESCUELA DE WINGFOIL</small></span></a>';
}
function rachas(dirDeg){
  // Las rachas cruzan la foto en el sentido del viento real.
  var giro = dirDeg == null ? -22 : ((dirDeg + 90) % 180) - 90;
  var tops = [90,140,190,240,290,340,390], anchos = [120,80,150,90,130,70,110], delays = [0,.6,1.2,.3,1.7,.9,2];
  return '<div class="rachas" style="--giro:' + r0(giro) + 'deg">' + tops.map(function(t, i){
    return '<div class="racha" style="top:' + t + 'px;width:' + anchos[i] + 'px;animation-delay:' + delays[i] + 's"></div>';
  }).join('') + '</div>';
}

// Fechas: Open-Meteo devuelve la hora local de Buenos Aires sin zona ("2026-10-25T14:00").
// Argentina no tiene horario de verano: siempre UTC−3.
function msDe(t){ return Date.parse(t.length <= 10 ? t + 'T00:00:00-03:00' : t + ':00-03:00'); }
function partes(ms){
  var g = {};
  new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', weekday:'short', hourCycle:'h23'})
    .formatToParts(new Date(ms)).forEach(function(x){ g[x.type] = x.value; });
  return g;
}
function hoyISO(ms){ var g = partes(ms == null ? Date.now() : ms); return g.year + '-' + g.month + '-' + g.day; }
function hhmm(ms){ var g = partes(ms); return g.hour + ':' + g.minute; }
var DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
var DIAS3 = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function diaSemana(iso){ return new Date(msDe(iso) + 12 * 3600e3).getUTCDay(); }
function nombreDia(iso){
  var hoy = hoyISO(), man = hoyISO(Date.now() + 864e5);
  if (iso === hoy) return 'hoy';
  if (iso === man) return 'mañana';
  var d = new Date(msDe(iso) + 12 * 3600e3);
  return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate();
}
function sumarDias(iso, n){ var d = new Date(msDe(iso) + 12 * 3600e3 + n * 864e5); return d.toISOString().slice(0, 10); }
function difAng(a, b){ var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
function enArco(deg, arco){
  var d = ((deg % 360) + 360) % 360, a = arco[0], b = arco[1];
  return a <= b ? (d >= a && d <= b) : (d >= a || d <= b);
}

// ─────────────────────────────── Perfil (en el teléfono) ───────────────────────────────
function leer(k, def){ try { var v = localStorage.getItem('bram_' + k); return v == null ? def : JSON.parse(v); } catch(e){ return def; } }
function guardar(k, v){ try { localStorage.setItem('bram_' + k, JSON.stringify(v)); } catch(e){} }
function perfil(){
  var p = leer('perfil', {});
  return { nombre: p.nombre || '', mail: p.mail || '', novedades: p.novedades !== false, peso: p.peso || 75, spot: p.spot || 'sanisidro', nivel: p.nivel || 'intermedio' };
}
function spotPorId(id){ for (var i = 0; i < SPOTS.length; i++) if (SPOTS[i].id === id) return SPOTS[i]; return SPOTS[0]; }
function rango(){ return NIVELES[perfil().nivel] || NIVELES.intermedio; }

// ─────────────────────────────── Datos ───────────────────────────────
// Pide JSON y lo guarda. Si la red falla, devuelve lo último guardado.
var memoria = {};
function traer(url, clave, vida){
  var ahora = Date.now();
  var g = memoria[clave] || leer('d_' + clave, null);
  if (g && ahora - g.t < vida) return Promise.resolve(g.d);
  if (memoria['p_' + clave]) return memoria['p_' + clave];
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var corte = setTimeout(function(){ if (ctrl) ctrl.abort(); }, 15000);
  var p = fetch(url, ctrl ? {signal: ctrl.signal} : {}).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(d){
    var e = {t: Date.now(), d: d};
    memoria[clave] = e;
    try { localStorage.setItem('bram_d_' + clave, JSON.stringify(e)); } catch(err){ /* lleno: queda en memoria */ }
    return d;
  }).catch(function(err){
    if (g) return g.d;
    throw err;
  }).finally(function(){ clearTimeout(corte); delete memoria['p_' + clave]; });
  memoria['p_' + clave] = p;
  return p;
}

var OM = 'https://api.open-meteo.com/v1/forecast';
function pronostico(){
  var url = OM + '?latitude=' + SPOTS.map(function(s){ return s.lat; }).join(',') +
    '&longitude=' + SPOTS.map(function(s){ return s.lng; }).join(',') +
    '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,weather_code' +
    '&minutely_15=wind_speed_10m,wind_direction_10m,wind_gusts_10m&forecast_minutely_15=192' +
    '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,weather_code,temperature_2m' +
    '&daily=sunrise,sunset,weather_code,precipitation_sum' +
    '&wind_speed_unit=kn&timezone=' + encodeURIComponent(TZ) + '&forecast_days=16';
  return traer(url, 'pron', 30 * 60e3).then(function(d){
    var arr = Array.isArray(d) ? d : [d];
    var porSpot = {};
    SPOTS.forEach(function(s, i){ if (arr[i]) porSpot[s.id] = arr[i]; });
    return porSpot;
  });
}
function pronosticoPunto(lat, lng){
  var url = OM + '?latitude=' + lat.toFixed(3) + '&longitude=' + lng.toFixed(3) +
    '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=wind_speed_10m,wind_direction_10m,weather_code' +
    '&wind_speed_unit=kn&timezone=' + encodeURIComponent(TZ) + '&forecast_days=1';
  return traer(url, 'pt_' + lat.toFixed(2) + '_' + lng.toFixed(2), 30 * 60e3);
}
// Agua: temperatura de la superficie en la boca del río (modelo marino).
function agua(){
  var url = 'https://marine-api.open-meteo.com/v1/marine?latitude=-35.0&longitude=-57.0&current=sea_surface_temperature&timezone=' + encodeURIComponent(TZ);
  return traer(url, 'agua', 3 * 3600e3).then(function(d){
    var t = d && d.current && d.current.sea_surface_temperature;
    return isFinite(t) ? t : null;
  });
}
// Clima de 20 años en San Isidro (ERA5): base de la tendencia del mes y de Temporada.
function climatologia(){
  var fin = (new Date().getFullYear() - 1) + '-12-31', ini = (new Date().getFullYear() - 20) + '-01-01';
  var url = 'https://archive-api.open-meteo.com/v1/archive?latitude=-34.4678&longitude=-58.5086&start_date=' + ini + '&end_date=' + fin +
    '&daily=wind_speed_10m_max,wind_direction_10m_dominant&wind_speed_unit=kn&timezone=' + encodeURIComponent(TZ);
  return traer(url, 'clima', 30 * 864e5).then(function(d){
    var t = d.daily.time, v = d.daily.wind_speed_10m_max, dir = d.daily.wind_direction_10m_dominant;
    var porDia = {}, porMes = [];
    for (var m = 0; m < 12; m++) porMes.push({n:0, buenos:0, suma:0});
    for (var i = 0; i < t.length; i++) {
      if (!isFinite(v[i])) continue;
      var mm = +t[i].slice(5, 7) - 1, md = t[i].slice(5);
      porMes[mm].n++; porMes[mm].suma += v[i]; if (v[i] >= 12) porMes[mm].buenos++;
      (porDia[md] = porDia[md] || []).push({kn: v[i], dir: dir[i]});
    }
    return {porDia: porDia, porMes: porMes, anios: 20};
  });
}
// Para un día del calendario: qué suele pasar (±7 días alrededor, 20 años).
function tendenciaDia(clima, iso){
  var muestras = [];
  for (var k = -7; k <= 7; k++) {
    var md = sumarDias(iso, k).slice(5);
    (clima.porDia[md] || []).forEach(function(x){ muestras.push(x); });
  }
  if (!muestras.length) return null;
  var buenos = muestras.filter(function(x){ return x.kn >= 12; }).length;
  var prom = muestras.reduce(function(a, x){ return a + x.kn; }, 0) / muestras.length;
  var cuenta = {};
  muestras.forEach(function(x){ if (isFinite(x.dir)) { var r = rumbo8(x.dir); cuenta[r] = (cuenta[r] || 0) + 1; } });
  var dirTipica = Object.keys(cuenta).sort(function(a, b){ return cuenta[b] - cuenta[a]; })[0];
  return {prob: buenos / muestras.length, prom: prom, dir: dirTipica, n: muestras.length};
}
// Viento medido en el Náutico San Isidro (estación del club, publicada en ThingSpeak).
function cnsi(){
  return traer('https://api.thingspeak.com/channels/1506798/feeds.json?results=24', 'cnsi', 5 * 60e3).then(function(d){
    var f = (d.feeds || []).map(function(x){
      return {t: Date.parse(x.created_at), kn: parseFloat(x.field3), raf: parseFloat(x.field2), dir: parseFloat(x.field4), temp: parseFloat(x.field5)};
    }).filter(function(x){ return isFinite(x.t) && isFinite(x.kn) && isFinite(x.dir); });
    return f.length ? f[f.length - 1] : null;
  });
}
// Mareas del SHN para San Isidro (pleamar y bajamar), publicadas por el CNSI.
function mareas(){
  return traer('https://api.thingspeak.com/channels/3447831/feeds.json?results=24', 'mareas', 3 * 3600e3).then(function(d){
    var vistos = {};
    return (d.feeds || []).map(function(f){
      return {t: parseInt(f.field2, 10) * 1000, m: parseFloat(f.field1), alta: f.field3 === '1'};
    }).filter(function(x){
      if (!isFinite(x.t) || !isFinite(x.m) || vistos[x.t]) return false;
      vistos[x.t] = 1; return true;
    }).sort(function(a, b){ return a.t - b.t; });
  });
}
// Altura estimada de la marea en un momento: entre una pleamar y una bajamar la
// curva sigue un coseno (así lo dibujan las tablas). Devuelve null fuera de los datos.
function alturaMarea(mar, ms){
  for (var i = 0; i + 1 < mar.length; i++) {
    var a = mar[i], b = mar[i + 1];
    if (ms >= a.t && ms <= b.t) { var f = (ms - a.t) / (b.t - a.t); return a.m + (b.m - a.m) * (1 - Math.cos(Math.PI * f)) / 2; }
  }
  return null;
}
// Gráfico de marea: 24 horas desde 6 atrás (o desde el primer dato), la parte pasada pintada, una línea
// en la hora actual y las pleamares/bajamares marcadas.
function curvaMarea(mar, ahora){
  if (!mar.length || mar[0].t > ahora || mar[mar.length - 1].t < ahora + 3600e3) return '';
  var t0 = Math.max(ahora - 6 * 3600e3, mar[0].t), t1 = t0 + 24 * 3600e3;
  t1 = Math.min(t1, mar[mar.length - 1].t);
  var W = 320, H = 150, iz = 30, de = 8, ar = 22, ab = 26, pts = [];
  for (var ms = t0; ms <= t1; ms += 10 * 60e3) pts.push([ms, alturaMarea(mar, ms)]);
  var ext = mar.filter(function(x){ return x.t >= t0 && x.t <= t1; });
  var ms_ = pts.map(function(p){ return p[1]; }), lo = Math.min.apply(null, ms_), hi = Math.max.apply(null, ms_);
  lo = Math.floor((lo - 0.1) * 5) / 5; hi = Math.ceil((hi + 0.1) * 5) / 5;
  function X(ms){ return iz + (ms - t0) / (t0 + 24 * 3600e3 - t0) * (W - iz - de); }
  function Y(m){ return ar + (hi - m) / (hi - lo) * (H - ar - ab); }
  function linea(arr){ return arr.map(function(p, k){ return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(' '); }
  var pasado = pts.filter(function(p){ return p[0] <= ahora; }).concat([[ahora, alturaMarea(mar, ahora)]]);
  var futuro = [[ahora, alturaMarea(mar, ahora)]].concat(pts.filter(function(p){ return p[0] > ahora; }));
  var g = '';
  for (var m = lo; m <= hi + 1e-6; m += (hi - lo > 1.2 ? 0.5 : 0.2)) {
    g += '<line x1="' + iz + '" x2="' + (W - de) + '" y1="' + Y(m).toFixed(1) + '" y2="' + Y(m).toFixed(1) + '" stroke="rgba(255,255,255,.08)"/>' +
      '<text x="' + (iz - 4) + '" y="' + (Y(m) + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="#8FA9BF">' + String(Math.round(m * 10) / 10).replace('.', ',') + '</text>';
  }
  for (var h = Math.ceil(t0 / (3 * 3600e3)) * 3 * 3600e3; h <= t0 + 24 * 3600e3; h += 3 * 3600e3) {
    g += '<text x="' + X(h).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="#8FA9BF">' + hhmm(h).slice(0, 2) + '</text>';
  }
  var marcas = ext.map(function(x){
    var y = Y(x.m), arriba = x.alta;
    return '<circle cx="' + X(x.t).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5" fill="' + (x.alta ? '#5BC0F8' : '#FF8A3D') + '"/>' +
      '<text x="' + X(x.t).toFixed(1) + '" y="' + (arriba ? y - 8 : y + 15).toFixed(1) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="#EAF2F8">' +
      String(Math.round(x.m * 100) / 100).replace('.', ',') + ' m ' + hhmm(x.t) + '</text>';
  }).join('');
  var base = Y(lo).toFixed(1), xa = X(ahora).toFixed(1);
  return '<svg class="curva-marea" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Curva de marea de las próximas horas">' +
    '<defs><linearGradient id="gMarea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5BC0F8" stop-opacity=".75"/><stop offset="1" stop-color="#5BC0F8" stop-opacity=".08"/></linearGradient></defs>' + g +
    '<path d="' + linea(pasado) + ' L' + xa + ' ' + base + ' L' + X(t0).toFixed(1) + ' ' + base + ' Z" fill="url(#gMarea)"/>' +
    '<path d="' + linea(pasado) + '" fill="none" stroke="#5BC0F8" stroke-width="2"/>' +
    '<path d="' + linea(futuro) + '" fill="none" stroke="#FF8A3D" stroke-width="2" stroke-dasharray="4 3"/>' +
    '<line x1="' + xa + '" x2="' + xa + '" y1="' + (ar - 6) + '" y2="' + base + '" stroke="#EAF2F8" stroke-width="1.5"/>' +
    '<text x="' + xa + '" y="' + (ar - 9) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#EAF2F8">AHORA</text>' + marcas + '</svg>';
}
// Salida y puesta del sol de hoy sobre el río (del pronóstico del spot).
function solTira(d){
  var sr = d.daily && d.daily.sunrise && d.daily.sunrise[0], ss = d.daily && d.daily.sunset && d.daily.sunset[0];
  if (!sr || !ss) return '';
  return '<div class="sol-tira"><span>🌅 Sale el sol <b>' + hhmm(msDe(sr)) + '</b></span><span>🌇 Se pone <b>' + hhmm(msDe(ss)) + '</b></span></div>';
}
function norden(){ return traer('/api/norden', 'norden', 5 * 60e3); }
function enso(){ return traer('/api/bramador-enso', 'enso', 24 * 3600e3); }

// ─────────────────────────────── Lógica del viento ───────────────────────────────
function tormenta(code){ return code >= 95; }
function evaluar(spot, kn, deg, code){
  var r = rango();
  if (tormenta(code)) return {ok:false, m:'tormenta eléctrica', tipo:'rayo'};
  if (kn < r.min) return {ok:false, m:'poco viento', tipo:'poco'};
  if (kn > r.max) return {ok:false, m:'demasiado viento para tu nivel', tipo:'mucho'};
  if (!enArco(deg, spot.arco)) return {ok:false, m:'viento de tierra (del ' + rumbo(deg) + ')', tipo:'tierra'};
  return {ok:true, m:'', tipo:'ok'};
}
// Serie de 15 min desde ahora hasta que se va el sol, con la evaluación de cada tramo.
function serieHoy(spot, d){
  var hoy = hoyISO(), puesta = msDe(d.daily.sunset[0]), ahora = Date.now();
  var m = d.minutely_15, h = d.hourly, out = [];
  // Código de tiempo por hora, para marcar tormentas dentro de cada tramo.
  var codPorHora = {};
  h.time.forEach(function(t, i){ codPorHora[t.slice(0, 13)] = h.weather_code[i]; });
  if (m && m.time) {
    for (var i = 0; i < m.time.length; i++) {
      var ms = msDe(m.time[i]);
      if (ms < ahora - 15 * 60e3 || ms > puesta || m.time[i].slice(0, 10) !== hoy) continue;
      var kn = m.wind_speed_10m[i], deg = m.wind_direction_10m[i], code = codPorHora[m.time[i].slice(0, 13)] || 0;
      if (!isFinite(kn)) continue;
      out.push({ms: ms, kn: kn, deg: deg, raf: m.wind_gusts_10m ? m.wind_gusts_10m[i] : null, code: code, ev: evaluar(spot, kn, deg, code)});
    }
  }
  if (!out.length) {
    for (var j = 0; j < h.time.length; j++) {
      var ms2 = msDe(h.time[j]);
      if (ms2 < ahora - 3600e3 || ms2 > puesta || h.time[j].slice(0, 10) !== hoy) continue;
      out.push({ms: ms2, kn: h.wind_speed_10m[j], deg: h.wind_direction_10m[j], raf: h.wind_gusts_10m[j], code: h.weather_code[j],
                ev: evaluar(spot, h.wind_speed_10m[j], h.wind_direction_10m[j], h.weather_code[j])});
    }
  }
  return {serie: out, puesta: puesta};
}
// ¿Salgo? Para un spot: si se puede ahora y hasta cuándo, o desde cuándo.
function salgo(spot, d){
  var s = serieHoy(spot, d), serie = s.serie;
  var cur = d.current || {};
  var res = {kn: r0(cur.wind_speed_10m), deg: cur.wind_direction_10m, raf: r0(cur.wind_gusts_10m), code: cur.weather_code,
             puesta: s.puesta, serie: serie};
  res.ev = evaluar(spot, cur.wind_speed_10m, cur.wind_direction_10m, cur.weather_code || 0);
  if (Date.now() > s.puesta) { res.estado = 'noche'; return res; }
  var i0 = -1, i1 = -1;
  for (var i = 0; i < serie.length; i++) { if (serie[i].ev.ok) { i0 = i; break; } }
  if (i0 >= 0) { i1 = i0; while (i1 + 1 < serie.length && serie[i1 + 1].ev.ok) i1++; }
  if (res.ev.ok && i0 === 0) {
    res.estado = 'sali';
    res.hasta = i1 === serie.length - 1 ? s.puesta : serie[i1].ms + 15 * 60e3;
    res.hastaSol = i1 === serie.length - 1;
  } else if (i0 >= 0) {
    res.estado = 'espera';
    res.desde = serie[i0].ms;
    res.hasta = i1 === serie.length - 1 ? s.puesta : serie[i1].ms + 15 * 60e3;
  } else {
    res.estado = 'no';
    // El motivo que más se repite en lo que queda del día.
    var cuenta = {};
    serie.forEach(function(x){ cuenta[x.ev.m] = (cuenta[x.ev.m] || 0) + 1; });
    res.motivo = Object.keys(cuenta).sort(function(a, b){ return cuenta[b] - cuenta[a]; })[0] || res.ev.m;
    res.hayRayos = serie.some(function(x){ return tormenta(x.code); });
  }
  return res;
}
// El mejor momento del día (de luz) para un spot y una fecha.
function picoDia(spot, d, iso){
  var h = d.hourly, best = null;
  var sr = msDe(d.daily.sunrise[d.daily.time.indexOf(iso)] || iso + 'T07:00');
  var ss = msDe(d.daily.sunset[d.daily.time.indexOf(iso)] || iso + 'T19:30');
  for (var i = 0; i < h.time.length; i++) {
    if (h.time[i].slice(0, 10) !== iso) continue;
    var ms = msDe(h.time[i]);
    if (ms < sr || ms > ss) continue;
    var ev = evaluar(spot, h.wind_speed_10m[i], h.wind_direction_10m[i], h.weather_code[i]);
    var x = {ms: ms, kn: h.wind_speed_10m[i], deg: h.wind_direction_10m[i], raf: h.wind_gusts_10m ? h.wind_gusts_10m[i] : null, ev: ev, code: h.weather_code[i]};
    if (!best || (ev.ok && !best.ev.ok) || (ev.ok === best.ev.ok && x.kn > best.kn)) best = x;
  }
  return best;
}
// Resumen diario (horas de luz) para el calendario.
// Clima del día en un emoji, para el calendario del mes.
function iconoDia(dd){
  var c = dd.code || 0, mm = dd.lluvia || 0;
  return dd.rayos ? '⛈️' : mm >= 5 ? '🌧️' : mm >= 0.5 ? '🌦️' : c <= 1 ? '☀️' : c === 2 ? '⛅' : '☁️';
}
function resumenDias(spot, d){
  var h = d.hourly, dias = {};
  d.daily.time.forEach(function(iso, k){
    dias[iso] = {iso: iso, max: 0, raf: 0, deg: null, horasOk: 0, rayos: tormenta(d.daily.weather_code[k]), code: d.daily.weather_code[k], lluvia: d.daily.precipitation_sum[k],
                 sr: msDe(d.daily.sunrise[k]), ss: msDe(d.daily.sunset[k])};
  });
  for (var i = 0; i < h.time.length; i++) {
    var x = dias[h.time[i].slice(0, 10)];
    if (!x) continue;
    var ms = msDe(h.time[i]);
    if (ms < x.sr || ms > x.ss) continue;
    var kn = h.wind_speed_10m[i];
    if (kn > x.max) { x.max = kn; x.deg = h.wind_direction_10m[i]; }
    if (h.wind_gusts_10m && h.wind_gusts_10m[i] > x.raf) x.raf = h.wind_gusts_10m[i];
    if (evaluar(spot, kn, h.wind_direction_10m[i], h.weather_code[i]).ok) x.horasOk++;
  }
  return d.daily.time.map(function(iso){ return dias[iso]; });
}
// Rachado: las ráfagas le sacan 10 kn o más al viento medio.
function rachado(kn, raf){ return isFinite(raf) && raf - kn >= 10; }
// Ala recomendada: m² ≈ peso / nudos (75 kg con 15 kn → 5 m).
function ala(kn, peso){
  if (!isFinite(kn) || kn < 6) return null;
  var m = Math.max(2.5, Math.min(7, peso / kn));
  return Math.round(m * 2) / 2;
}
function traje(t){
  if (t == null) return null;
  return t >= 23 ? 'lycra' : t >= 19 ? '3/2' : t >= 15 ? '4/3' : '5/4 + botas';
}
// Del medio del río (Norden) a tu orilla: con viento del agua llega casi
// entero; de costado, un poco menos; de tierra, la mitad y rachado.
function aLaOrilla(kn, deg, spot){
  if (enArco(deg, spot.arco)) {
    var centro = (spot.arco[0] + ((spot.arco[1] - spot.arco[0] + 360) % 360) / 2) % 360;
    return kn * (difAng(deg, centro) < 50 ? 0.85 : 0.75);
  }
  return kn * 0.55;
}

// ─────────────────────────────── Pintado común ───────────────────────────────
function fondo(clave){ document.getElementById('fondo').style.backgroundImage = 'url(' + foto(FOTOS[clave] || FOTOS.hoy) + ')'; }
function pintar(html){ $app.innerHTML = html; }
function error(msg){
  return '<div class="tarj vidrio vacio">' + esc(msg || 'No pudimos traer el pronóstico. Revisá la conexión y volvé a intentar.') +
    '<br><br><button class="btn btn--chico" type="button" data-accion="reintentar">Reintentar</button></div>';
}
function evento(nombre, extra){ try { if (typeof gtag === 'function') gtag('event', nombre, extra || {}); } catch(e){} }

// ─────────────────────────────── HOY ───────────────────────────────
function vistaHoy(){
  fondo('hoy');
  var p = perfil(), spot = spotPorId(p.spot);
  pintar('<section class="hero"><div class="hero__foto" style="background-image:url(' + foto(spot.foto) + ')"></div>' + rachas(null) +
    '<div class="hero__velo"></div><div class="hero__top">' + marca() + '</div>' +
    '<div class="hero__pie"><p class="veredicto veredicto--no" style="opacity:.4">···</p></div></section>' +
    '<p class="cargando">Leyendo el viento del río…</p>');
  Promise.all([pronostico(), agua().catch(function(){ return null; }), mareas().catch(function(){ return []; }),
               spot.id === 'sanisidro' || spot.id === 'peru' || spot.id === 'martinez' ? cnsi().catch(function(){ return null; }) : Promise.resolve(null)])
  .then(function(r){
    var todo = r[0], d = todo[spot.id];
    if (!d) throw new Error('sin datos');
    var s = salgo(spot, d), aguaT = r[1], mar = r[2], medido = r[3];
    var verd, linea;
    if (s.estado === 'sali') {
      verd = '<p class="veredicto">SALÍ.</p>';
      linea = s.hastaSol ? 'Hasta que se va el sol · ' + hhmm(s.puesta) : 'Hasta las ' + hhmm(s.hasta);
    } else if (s.estado === 'espera') {
      verd = '<p class="veredicto veredicto--espera">ESPERÁ.</p>';
      linea = 'Entra a las ' + hhmm(s.desde) + ' · hasta las ' + hhmm(s.hasta);
    } else if (s.estado === 'noche') {
      verd = '<p class="veredicto veredicto--no">YA ES DE NOCHE.</p>';
      linea = 'Mirá mañana en Mi spot';
    } else {
      verd = '<p class="veredicto veredicto--no">HOY NO.</p>';
      linea = s.hayRayos ? 'Hay tormenta eléctrica: no salgas' : 'Hoy: ' + s.motivo;
    }
    var sigMarea = mar.filter(function(x){ return x.t > Date.now(); })[0];
    var luzMin = Math.max(0, r0((s.puesta - Date.now()) / 60e3));
    var alaHoy = ala(s.estado === 'espera' ? s.serie.filter(function(x){ return x.ev.ok; })[0].kn : s.kn, p.peso);
    var pico = picoDia(spot, d, hoyISO());
    var html = '<section class="hero"><div class="hero__foto" style="background-image:url(' + foto(spot.foto) + ')"></div>' + rachas(s.deg) +
      '<div class="hero__velo"></div>' +
      '<div class="hero__top">' + marca() + '<div class="hero__acc">' +
        '<button class="pildora" type="button" data-accion="compartir" aria-label="Compartir"><svg viewBox="0 0 24 24"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg></button>' +
        '<a class="pildora" href="#/equipate"><svg viewBox="0 0 24 24" style="stroke:#FF5A2C"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>Equipate</a></div></div>' +
      '<div class="hero__spot"><a class="pildora" href="#/spot/' + spot.id + '"><span class="punto vivo-dot"></span>' + esc(spot.n) + ' ▾</a>' +
        (medido && Date.now() - medido.t < 3 * 3600e3 ? '<span class="pildora">Medido en el Náutico: ' + r0(medido.kn) + ' kn ' + rumbo(medido.dir) + '</span>' : '') + '</div>' +
      '<div class="hero__pie">' + verd +
        '<div class="hero__fila"><div><div class="hero__kn">' + s.kn + '<small> kn</small>' +
          (isFinite(s.raf) ? '<span class="hero__raf"><small>RÁFAGAS</small>' + s.raf + '<small> kn</small></span>' : '') + '</div>' +
        '<div class="hero__dir">del ' + rumbo(s.deg) + (rachado(s.kn, s.raf) ? ' · <span class="rachado">⚠ Rachado</span>' : '') + '</div>' +
        '<div class="hero__hasta">' + esc(linea) + '</div><div class="presenta" id="presenta" hidden></div></div>' + brujula(s.deg, spot.arco, 112) + '</div></div></section>' +
      '<div class="datos">' +
        '<div class="dato"><small>AGUA</small><b>' + (aguaT != null ? r0(aguaT) + '° · ' + traje(aguaT) : '—') + '</b></div>' +
        '<a class="dato" href="#/spot/' + spot.id + '"><small>MAREA</small><b>' + (sigMarea ? (sigMarea.alta ? '▲ ' : '▼ ') + hhmm(sigMarea.t) : '—') + '</b></a>' +
        '<div class="dato"><small>LUZ</small><b>' + (luzMin > 0 ? Math.floor(luzMin / 60) + ' h ' + String(luzMin % 60).padStart(2, '0') : 'de noche') + '</b></div>' +
        '<a class="dato" href="#/perfil"><small>ALA HOY</small><b>' + (alaHoy ? alaHoy + ' m' : '—') + '</b></a>' +
      '</div>' +
      solTira(d) +
      (pico ? '<div class="tarj vidrio pico">' + flecha(pico.deg, '') .replace('<svg', '<svg width="28" height="28" style="flex-shrink:0;fill:none;stroke:#FF5A2C;stroke-width:3;stroke-linecap:round;transform:rotate(' + r0(pico.deg) + 'deg)"') +
        '<div><b>Pico del día: ' + hhmm(pico.ms) + ' · ' + r0(pico.kn) + ' kn ' + rumbo(pico.deg) + (isFinite(pico.raf) ? ' · ráfagas ' + r0(pico.raf) : '') + '</b><p>' +
        (pico.ev.ok ? 'Llevá un ala de ' + ala(pico.kn, p.peso) + ' m' : 'Ni en el pico da: ' + esc(pico.ev.m)) + '</p></div></div>' : '') +
      '<div class="subt"><h2>Todo el río ahora</h2><span>color = fuerza</span></div><div class="mosaico">' +
      SPOTS.map(function(sp){
        var dd = todo[sp.id]; if (!dd) return '';
        var c = dd.current, ev = evaluar(sp, c.wind_speed_10m, c.wind_direction_10m, c.weather_code || 0);
        return '<a class="tesela ' + kclase(c.wind_speed_10m) + '" href="#/spot/' + sp.id + '"><div class="tesela__n"><b>' + r0(c.wind_speed_10m) + '</b>' +
          flecha(c.wind_direction_10m) + '</div><strong>' + esc(sp.n) + '</strong><span>' + (ev.ok ? (s.estado === 'noche' ? 'Buen viento' : 'Salí') : esc(ev.tipo === 'tierra' ? 'De tierra' : ev.tipo === 'poco' ? 'Poco' : ev.tipo === 'rayo' ? 'Tormenta' : 'Mucho')) + '</span></a>';
      }).join('') + '</div>' +
      '<div class="subt"><h2>El río en vivo</h2><a href="#/rio">Cámaras →</a></div>' +
      '<p class="nota">Pronóstico de modelos públicos, actualizado cada hora. Medido: estación del Náutico San Isidro y Pilote Norden.</p>';
    pintar(html);
    // El sponsor llega después que el viento: nunca demora el vistazo.
    sponsorPara(spot.id, 'senal').then(function(sp){
      var el = document.getElementById('presenta'); if (!sp || !el) return;
      el.innerHTML = presentado(sp); el.hidden = false; contarImpresion(sp, 'senal', spot.id);
    });
    compartirDatos = {spot: spot, s: s, linea: linea};
    avisarAlertas(todo);
  }).catch(function(){ pintar('<div class="cab">' + marca() + '</div>' + error()); });
}
var compartirDatos = null;
function compartir(){
  var c = compartirDatos;
  var txt = c ? (c.s.estado === 'sali' ? '¡SALÍ! ' : c.s.estado === 'espera' ? 'Hoy entra: ' : 'Hoy no da: ') + c.spot.n + ' · ' + c.s.kn + ' kn del ' + rumbo(c.s.deg) + ' · ' + c.linea + ' — Bramador'
              : 'Bramador: el viento del Río de la Plata';
  var url = 'https://www.escueladewingfoil.com.ar/bramador/';
  evento('bramador_compartir');
  if (navigator.share) { navigator.share({title: 'Bramador', text: txt, url: url}).catch(function(){}); return; }
  location.href = 'https://wa.me/?text=' + encodeURIComponent(txt + ' ' + url);
}

// ─────────────────────────────── EL RÍO ───────────────────────────────
var camActual = 0, windyCargado = false;
function montarCam(){
  var box = document.getElementById('camBox'); if (!box) return;
  var cam = CAMS[camActual];
  // El reproductor de Windy pasa la cámara adentro de la página: no te saca de la app.
  box.innerHTML = '<a name="windy-webcam-timelapse-player" data-id="' + cam.id + '" data-play="live" data-loop="0" data-auto-play="1" ' +
    'data-force-full-screen-on-overlay-play="0" data-interactive="1" href="#" onclick="return false"></a>';
  if (window.WindyWebcamTimelapsePlayer && window.WindyWebcamTimelapsePlayer.init) {
    try { window.WindyWebcamTimelapsePlayer.init(); } catch(e){}
  }
  var sc = document.createElement('script');
  sc.async = true;
  sc.src = 'https://webcams.windy.com/webcams/public/embed/v2/script/player.js?v=' + (windyCargado ? Date.now() : 1);
  windyCargado = true;
  document.body.appendChild(sc);
  document.getElementById('camNom').textContent = cam.n;
  document.getElementById('camSub').textContent = cam.sub;
  document.querySelectorAll('.cam').forEach(function(b, i){ b.setAttribute('aria-pressed', i === camActual ? 'true' : 'false'); });
  var kn = document.getElementById('camKn');
  var t = ultimoPron && ultimoPron[cam.spot];
  kn.textContent = t ? r0(t.current.wind_speed_10m) + ' kn ' + rumbo(t.current.wind_direction_10m) : '';
}
var ultimoPron = null;
function vistaRio(){
  fondo('rio');
  var spot = spotPorId(perfil().spot);
  pintar('<div class="cab"><div><h1>El río en vivo</h1><p>Cámaras al río y viento medido</p></div></div>' +
    '<div class="player"><div class="player__cam" id="camBox"></div><div class="player__badge"><i class="vivo-dot"></i>EN VIVO</div>' +
    '<div class="player__kn" id="camKn"></div><div class="player__pie"><b id="camNom"></b><span id="camSub"></span></div></div>' +
    '<div class="camaras">' + CAMS.map(function(c, i){
      return '<button class="cam" type="button" data-cam="' + i + '" aria-pressed="false"><b>' + esc(c.n) + '</b><span>Ver acá</span></button>';
    }).join('') + '</div>' +
    '<p class="nota">No hay cámaras públicas en los pilotes: del medio del río está el viento medido.</p>' +
    '<div class="subt"><h2>Viento medido ahora</h2><span>cada 10 min</span></div>' +
    '<div class="estaciones" id="estaciones"><div class="est vidrio"><small>Cargando…</small></div></div>' +
    '<div class="tarj vidrio" id="orilla"></div>');
  pronostico().then(function(t){ ultimoPron = t; montarCam(); }).catch(function(){ montarCam(); });
  Promise.all([cnsi().catch(function(){ return null; }), norden().catch(function(){ return null; })]).then(function(r){
    var c = r[0], n = r[1] && isFinite(r[1].kn) ? r[1] : null;
    var h = '';
    if (n) h += '<div class="est est--norden"><small>Pilote Norden · medio del río</small><b>' + r0(n.kn) + '</b> kn ' + flecha(n.grados) + ' ' + esc(n.rumbo || rumbo(n.grados)) +
      (isFinite(n.alturaCm) ? '<small>Río a ' + (n.alturaCm / 100).toFixed(2) + ' m</small>' : '') + '</div>';
    if (c) h += '<div class="est vidrio"><small>Náutico San Isidro</small><b>' + r0(c.kn) + '</b> kn ' + flecha(c.dir) + ' ' + rumbo(c.dir) +
      '<small>ráfaga ' + r0(c.raf) + ' · ' + hhmm(c.t) + '</small></div>';
    if (!h) h = '<div class="est vidrio" style="grid-column:1/-1"><small>Las estaciones no contestaron ahora. Probá en un rato.</small></div>';
    var est = document.getElementById('estaciones'); if (est) est.innerHTML = h;
    var or = document.getElementById('orilla');
    if (or) or.innerHTML = n ? '<p class="tit">Del medio del río a tu orilla</p><div class="orilla"><div><b>' + r0(n.kn) + '</b><small>kn en Norden</small></div>' +
      '<svg width="80" height="20" viewBox="0 0 90 20" fill="none" stroke="#FF5A2C" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M2 10h84M78 3l8 7-8 7"/></svg>' +
      '<div><b style="color:#FF5A2C">~' + r0(aLaOrilla(n.kn, n.grados, spot)) + '</b><small>kn en ' + esc(spot.n) + '</small></div></div>' +
      '<p style="margin:8px 0 0;font-size:12px;line-height:1.35;color:#8FA9BF">Estimado: con viento del agua llega casi todo; de tierra, la mitad y rachado.</p>'
      : '<p class="tit">Del medio del río a tu orilla</p><p style="margin:0;font-size:13px;color:#8FA9BF">Esperando el dato del Pilote Norden.</p>';
  });
}

// ─────────────────────────────── MI SPOT ───────────────────────────────
function vistaSpot(id){
  fondo('spot');
  var p = perfil(), spot = spotPorId(id || p.spot);
  var sel = '<div class="selspot">' + SPOTS.map(function(s){
    return '<a class="chip" href="#/spot/' + s.id + '" aria-pressed="' + (s.id === spot.id) + '" style="display:flex;align-items:center;text-decoration:none">' + esc(s.n) + '</a>';
  }).join('') + '</div>';
  pintar('<div class="spot-cab"><div class="hero__foto" style="background-image:url(' + foto(spot.foto) + ')"></div><div class="hero__velo"></div>' +
    '<div class="spot-cab__txt"><div><h1>' + esc(spot.n) + '</h1><p>' + esc(spot.sub) + '</p></div></div></div>' + sel + '<p class="cargando">Cargando…</p>');
  Promise.all([pronostico(), mareas().catch(function(){ return []; }), climatologia().catch(function(){ return null; })]).then(function(r){
    var d = r[0][spot.id], mar = r[1], clima = r[2];
    if (!d) throw new Error();
    var cur = d.current, pico = picoDia(spot, d, hoyISO());
    repSpot = spot.id; repKn = cur.wind_speed_10m;
    var ahora = Date.now(), h = d.hourly, barras = [];
    for (var i = 0; i < h.time.length && barras.length < 24; i++) {
      var ms = msDe(h.time[i]); if (ms < ahora - 3600e3) continue;
      barras.push({ms: ms, kn: h.wind_speed_10m[i], raf: h.wind_gusts_10m ? h.wind_gusts_10m[i] : null, deg: h.wind_direction_10m[i], code: h.weather_code[i], pp: h.precipitation_probability[i]});
    }
    var maxKn = Math.max(25, Math.max.apply(null, barras.map(function(b){ return Math.max(b.kn, b.raf || 0); })));
    var dias = resumenDias(spot, d);
    var cal = '', inicio = hoyISO(), sem0 = diaSemana(inicio);
    ['L','M','M','J','V','S','D'].forEach(function(x){ cal += '<div class="cal__sem">' + x + '</div>'; });
    var vacio = (sem0 + 6) % 7;
    for (var v = 0; v < vacio; v++) cal += '<div></div>';
    for (var k = 0; k < 30; k++) {
      var iso = sumarDias(inicio, k), dd = dias[k], dnum = +iso.slice(8);
      if (dd && k < 16) {
        cal += '<a class="cal__dia ' + kclase(dd.max) + '" href="#/dia/' + spot.id + '/' + iso + '" aria-label="' + esc(nombreDia(iso)) + ': ' + r0(dd.max) + ' nudos">' +
          '<small>' + dnum + '</small><span class="cal__ico" aria-hidden="true">' + iconoDia(dd) + '</span><b>' + r0(dd.max) + '</b>' + flecha(dd.deg || 0) + '</a>';
      } else {
        var td = clima ? tendenciaDia(clima, iso) : null;
        cal += '<a class="cal__dia cal__dia--trend ' + (td ? kclase(td.prom) : 'k0') + '" href="#/dia/' + spot.id + '/' + iso + '" aria-label="' + esc(nombreDia(iso)) + ': tendencia">' +
          '<small>' + dnum + '</small><b>' + (td ? r0(td.prob * 100) + '%' : '·') + '</b></a>';
      }
    }
    var marHtml = mar.filter(function(x){ return x.t > ahora - 3600e3; }).slice(0, 4).map(function(x){
      return '<div class="marea"><small>' + (x.alta ? '▲ PLEAMAR' : '▼ BAJAMAR') + ' · ' + esc(nombreDia(hoyISO(x.t))) + '</small><b>' + hhmm(x.t) + ' · ' + x.m.toFixed(2) + ' m</b></div>';
    }).join('');
    // Altura ahora y si sube o baja (cm por hora), arriba de la curva.
    var mAhora = alturaMarea(mar, ahora), mLuego = alturaMarea(mar, ahora + 3600e3), marAhora = '';
    if (mAhora != null && mLuego != null) {
      var cmh = Math.round((mLuego - mAhora) * 100);
      marAhora = '<div class="marea-ahora"><div><small>AHORA</small><b>' + String(Math.round(mAhora * 100) / 100).replace('.', ',') + ' m</b></div>' +
        '<span class="' + (cmh >= 0 ? 'sube' : 'baja') + '">' + (cmh >= 0 ? '▲ subiendo' : '▼ bajando') + ' · ' + Math.abs(cmh) + ' cm/h</span></div>' + curvaMarea(mar, ahora);
    }
    pintar('<div class="spot-cab"><div class="hero__foto" style="background-image:url(' + foto(spot.foto) + ')"></div><div class="hero__velo"></div>' +
      '<div class="spot-cab__txt"><div><h1>' + esc(spot.n) + '</h1>' +
      '<div class="spot-ahora"><b>' + r0(cur.wind_speed_10m) + '</b> kn ' + rumbo(cur.wind_direction_10m) + ' <span>· ráfagas <b>' + r0(cur.wind_gusts_10m) + '</b></span>' +
        (rachado(cur.wind_speed_10m, cur.wind_gusts_10m) ? ' <em class="rachado">⚠ Rachado</em>' : '') + '</div><p>' + (pico ? 'Pico del día: ' + hhmm(pico.ms) + ' · ' + r0(pico.kn) + ' kn' + (pico.ev.ok ? ' · ala de ' + ala(pico.kn, p.peso) + ' m' : '') : esc(spot.sub)) + '</p></div>' +
      brujula(cur.wind_direction_10m, spot.arco, 96) + '</div></div>' + sel +
      reportesHtml(spot) +
      solTira(d) +
      '<div class="tarj vidrio"><p class="tit">Próximas 24 horas</p><div class="barras">' + barras.map(function(b, j){
        return '<div class="barra">' + (tormenta(b.code) ? '<small>⚡</small>' : b.pp >= 50 ? '<small>💧</small>' : '') +
          (b.raf != null ? '<small class="barra__raf">' + r0(b.raf) + '</small>' : '') + '<b>' + r0(b.kn) + '</b>' +
          (b.raf != null && b.raf > b.kn ? '<i class="barra__rafi" style="height:' + r0((b.raf - b.kn) / maxKn * 80) + 'px;border-color:' + kcolor(b.kn) + '"></i>' : '') +
          '<i style="height:' + Math.max(4, r0(b.kn / maxKn * 80)) + 'px;background:' + kcolor(b.kn) + '"></i>' + flecha(b.deg) +
          '<small>' + (j % 3 === 0 ? hhmm(b.ms).slice(0, 2) : '&nbsp;') + '</small></div>';
      }).join('') + '</div><p style="margin:8px 0 0;font-size:12px;color:#8FA9BF">Arriba en amarillo y punteado: las ráfagas. Verde: viene del agua y alcanza. El arco verde de la brújula es el viento que sirve acá.</p></div>' +
      '<div class="tarj vidrio"><p class="tit">Mareas · San Isidro</p>' + marAhora + '<div class="mareas">' + (marHtml || '<span style="color:#8FA9BF;font-size:13px">Sin datos de marea ahora.</span>') + '</div></div>' +
      '<div class="tarj vidrio"><p class="tit">El mes · tocá un día</p><div class="cal">' + cal + '</div>' +
      '<p style="margin:10px 0 0;font-size:12px;line-height:1.35;color:#8FA9BF">Los primeros 16 días: nudos máximos con luz. Los punteados: tendencia (probabilidad de un día de +12 kn según los últimos 20 años).</p></div>' +
      '<div style="padding:12px 16px 0"><a class="btn btn--vidrio" href="#/alertas">🔔 Avisame cuando haya viento acá</a></div>');
    cargarEstado(spot.id);
  }).catch(function(){ pintar(sel + error()); });
}

// ─────────────────────────────── UN DÍA ───────────────────────────────
function vistaDia(id, iso){
  fondo('dia');
  var spot = spotPorId(id), p = perfil();
  pintar('<p class="cargando">Cargando…</p>');
  Promise.all([pronostico(), mareas().catch(function(){ return []; }), climatologia().catch(function(){ return null; })]).then(function(r){
    var d = r[0][spot.id], mar = r[1], clima = r[2];
    var cab = '<div class="cab"><div><h1 style="text-transform:capitalize">' + esc(nombreDia(iso)) + '</h1><p>' + esc(spot.n) + ' · ' + (+iso.slice(8)) + ' de ' + MESES[+iso.slice(5, 7) - 1] + '</p></div>' +
      '<a class="pildora" href="#/spot/' + spot.id + '">← Mes</a></div>';
    var k = d ? d.daily.time.indexOf(iso) : -1;
    if (k < 0) {
      var td = clima ? tendenciaDia(clima, iso) : null;
      pintar(cab + '<div class="tarj vidrio" style="text-align:center">' +
        (td ? '<p class="tit">Tendencia · faltan ' + r0((msDe(iso) - msDe(hoyISO())) / 864e5) + ' días</p>' +
          '<div style="font-family:Bricolage Grotesque,sans-serif;font-size:64px;font-weight:800;color:' + kcolor(td.prom) + '">' + r0(td.prob * 100) + '%</div>' +
          '<p style="margin:0;font-size:15px;font-weight:700">de chances de un día de +12 kn</p>' +
          '<p style="margin:8px 0 0;color:#8FA9BF;font-size:13px">En estas fechas el viento máximo ronda los ' + r0(td.prom) + ' kn y suele venir del ' + esc(td.dir || '—') + '.</p>'
          : '<p class="vacio">Todavía no hay datos para este día.</p>') +
        '</div><p class="nota">Nadie puede pronosticar hora por hora a más de 2 semanas. Esto sale de lo que pasó estos mismos días en los últimos 20 años. Cuando falten 16 días o menos, acá aparece el pronóstico de verdad.</p>');
      return;
    }
    var h = d.hourly, sr = msDe(d.daily.sunrise[k]), ss = msDe(d.daily.sunset[k]), filas = [], domDeg = null, maxKn = 0, hayRayo = false;
    for (var i = 0; i < h.time.length; i++) {
      if (h.time[i].slice(0, 10) !== iso) continue;
      var hr = +h.time[i].slice(11, 13);
      if (hr < 7 || hr > 21) continue;
      var kn = h.wind_speed_10m[i], deg = h.wind_direction_10m[i], code = h.weather_code[i], ev = evaluar(spot, kn, deg, code);
      if (kn > maxKn) { maxKn = kn; domDeg = deg; }
      if (tormenta(code)) hayRayo = true;
      var mareaH = mar.filter(function(x){ var g = partes(x.t); return g.year + '-' + g.month + '-' + g.day === iso && +g.hour === hr; })[0];
      filas.push('<div class="fila ' + (tormenta(code) ? 'fila--malo' : ev.ok ? 'fila--ok' : '') + '"><span class="fila__h">' + h.time[i].slice(11, 16) + '</span>' + flecha(deg) +
        '<div><div class="fila__bar" style="width:' + Math.min(100, r0(kn / 30 * 100)) + '%;background:' + kcolor(kn) + '"></div>' +
        (h.precipitation_probability[i] >= 40 ? '<span class="tag tag--lluvia">lluvia ' + h.precipitation_probability[i] + '%</span>' : '') +
        (tormenta(code) ? '<span class="tag tag--rayo">⚡ rayos</span>' : '') +
        (mareaH ? '<span class="tag tag--marea">' + (mareaH.alta ? '▲ pleamar ' : '▼ bajamar ') + hhmm(mareaH.t) + '</span>' : '') + '</div>' +
        '<span class="fila__kn">' + r0(kn) + ' kn<small>' + rumbo(deg) + ' · r ' + r0(h.wind_gusts_10m[i]) + '</small></span></div>');
    }
    var pico = picoDia(spot, d, iso);
    var titulo = hayRayo ? 'TORMENTA' : pico && pico.ev.ok && pico.kn >= 18 ? 'DÍA BRAMADOR' : pico && pico.ev.ok ? 'DÍA PARA SALIR' : 'DÍA FLOJO';
    pintar(cab + '<div class="tarj vidrio" style="display:flex;gap:14px;align-items:center">' + brujula(domDeg, spot.arco, 120) +
      '<div><div style="font-family:Bricolage Grotesque,sans-serif;font-size:26px;font-weight:800;line-height:1;color:' + (hayRayo ? '#FFD23F' : '#FF5A2C') + '">' + titulo + '</div>' +
      '<div style="font-size:30px;font-weight:900;margin-top:6px">' + r0(maxKn) + ' kn <small style="font-size:14px">' + (domDeg != null ? rumbo(domDeg) : '') + '</small></div>' +
      (pico && pico.ev.ok ? '<div style="font-size:13px;font-weight:700;color:#FFC531">Mejor: ' + hhmm(pico.ms) + ' · ala de ' + ala(pico.kn, p.peso) + ' m</div>' : '') +
      '<div style="font-size:12px;color:#8FA9BF;margin-top:4px">Sol: ' + hhmm(sr) + ' a ' + hhmm(ss) + '</div></div></div>' +
      '<div class="tarj vidrio"><p class="tit">Hora por hora</p><div class="filas">' + filas.join('') + '</div></div>' +
      (k > 6 ? '<p class="nota">A más de una semana el pronóstico puede cambiar: miralo de nuevo unos días antes.</p>' : ''));
  }).catch(function(){ pintar(error()); });
}

// ─────────────────────────────── MÁS ───────────────────────────────
// Las mismas preguntas están en index.html (texto y datos para Google): cambiar en los dos lados.
var FAQ = [["¿Qué es Bramador?", "Una app gratis de la Escuela de Wingfoil que te dice si conviene salir a navegar hoy en el Río de la Plata, spot por spot y hasta qué hora."], ["¿Para qué deportes sirve?", "Para wingfoil, kitesurf, windsurf y foil: muestra nudos, ráfagas, dirección del viento, tormentas, mareas y el ala recomendada según tu peso."], ["¿Qué spots cubre?", "San Isidro, Perú Beach, Martínez, Olivos, Quilmes y Punta Lara, con el pronóstico de 16 días y la tendencia del mes."], ["¿De dónde salen los datos?", "De modelos públicos de pronóstico actualizados cada hora, la estación del Náutico San Isidro, el Pilote Norden en el medio del río, las mareas del SHN y cámaras en vivo de Windy."], ["¿Cómo la instalo?", "Abrí escueladewingfoil.com.ar/bramador en el teléfono. En Android tocá Instalar; en iPhone, desde Safari, tocá Compartir y Agregar a pantalla de inicio. No hace falta Play Store ni App Store."], ["¿Cuesta algo?", "No. Bramador es gratis."]];
function vistaMas(){
  fondo('mas');
  function item(href, icono, t, s){ return '<a class="vidrio" href="' + href + '"><svg viewBox="0 0 24 24">' + icono + '</svg><b>' + t + '</b><span>' + s + '</span></a>'; }
  pintar('<div class="cab">' + marca() + '</div><div class="cab" style="padding-top:4px"><div><h1>Más</h1></div></div><div class="menu">' +
    item('#/temporada', '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>', 'Temporada', 'Mes por mes y El Niño') +
    item('#/alertas', '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/>', 'Alertas', 'Avisame cuando haya viento') +
    item('#/pregunta', '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', 'Preguntá', '¿Salgo el sábado? ¿Qué ala?') +
    item('#/equipate', '<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>', 'Equipate', 'Precios, notas y clases') +
    item('#/perfil', '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', 'Tu perfil', perfil().mail ? 'Mail, peso, nivel y spot' : '<b style="font-size:12px;color:#FF5A2C">Dejá tu mail</b> · peso y spot') +
    item('#/opinion', '<path d="M12 21l-8-8a5 5 0 0 1 8-6 5 5 0 0 1 8 6z"/>', 'Tu opinión', '¿Qué le agregarías?') +
    item('#/instalar', '<path d="M12 3v12M6 10l6 6 6-6M4 20h16"/>', 'Instalar', 'Android y iPhone') +
    item('/', '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>', 'Escuela de Wingfoil', 'Volver al sitio') +
    '</div><div class="subt"><h2>Preguntas frecuentes</h2></div><div class="tarj vidrio faq">' + FAQ.map(function(x){
      return '<details><summary>' + esc(x[0]) + '</summary><p>' + esc(x[1]) + '</p></details>';
    }).join('') + '</div>' +
    '<p class="nota">Bramador es gratis. Datos: modelos públicos de pronóstico, estación del Náutico San Isidro, Pilote Norden (CARP), mareas del SHN y cámaras de Windy.</p>');
}

// ─────────────────────────────── ALERTAS ───────────────────────────────
function alertas(){ return leer('alertas', []); }
function coincidencias(todo){
  var res = [];
  alertas().forEach(function(a, ia){
    var spot = spotPorId(a.spot), d = todo[a.spot]; if (!d) return;
    var h = d.hourly, porDia = {};
    for (var i = 0; i < h.time.length; i++) {
      var ms = msDe(h.time[i]); if (ms < Date.now()) continue;
      var iso = h.time[i].slice(0, 10), k = d.daily.time.indexOf(iso);
      if (k < 0 || k > 7 || ms < msDe(d.daily.sunrise[k]) || ms > msDe(d.daily.sunset[k])) continue;
      if (a.finde && [0, 6].indexOf(diaSemana(iso)) < 0) continue;
      var kn = h.wind_speed_10m[i], deg = h.wind_direction_10m[i];
      if (kn < a.min || tormenta(h.weather_code[i]) || a.dirs.indexOf(rumbo8(deg)) < 0) continue;
      if (!porDia[iso]) porDia[iso] = {ia: ia, spot: spot, iso: iso, desde: ms, max: kn, deg: deg};
      if (kn > porDia[iso].max) { porDia[iso].max = kn; porDia[iso].deg = deg; }
    }
    Object.keys(porDia).forEach(function(k){ res.push(porDia[k]); });
  });
  return res.sort(function(a, b){ return a.desde - b.desde; });
}
function avisarAlertas(todo){
  if (!alertas().length || !('Notification' in window) || Notification.permission !== 'granted') return;
  var avisadas = leer('avisadas', {});
  coincidencias(todo).forEach(function(c){
    var clave = c.spot.id + c.iso;
    if (avisadas[clave]) return;
    avisadas[clave] = Date.now();
    var txt = c.spot.n + ': ' + r0(c.max) + ' kn del ' + rumbo(c.deg) + ' ' + nombreDia(c.iso) + ' desde las ' + hhmm(c.desde);
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      Promise.all([navigator.serviceWorker.ready, sponsorPara(c.spot.id, 'alerta').catch(function(){ return null; })]).then(function(r){
        var sp = r[1];
        r[0].showNotification('🌬️ Hay viento', {body: txt + (sp ? '\nPresentado por ' + sp.nombre : ''), icon: '/bramador/icons/icon-192.png', badge: '/bramador/icons/icon-192.png', tag: clave, data: {url: '/bramador/#/dia/' + c.spot.id + '/' + c.iso}});
        if (sp) contarImpresion(sp, 'alerta', c.spot.id);
      });
    }
  });
  guardar('avisadas', avisadas);
}
var borrador = {spot: null, min: 14, dirs: ['NE','E','SE'], finde: false};
function vistaAlertas(){
  fondo('alertas');
  if (!borrador.spot) borrador.spot = perfil().spot;
  var lista = alertas();
  var permiso = 'Notification' in window ? Notification.permission : 'no';
  pintar('<div class="cab"><div><h1>Alertas</h1><p>Te avisamos cuando se dé tu viento</p></div></div>' +
    '<div class="tarj vidrio"><div class="campo"><span class="lbl">Spot</span><div class="chips" style="padding:0;flex-wrap:wrap">' + SPOTS.map(function(s){
      return '<button class="chip" type="button" data-al-spot="' + s.id + '" aria-pressed="' + (s.id === borrador.spot) + '">' + esc(s.n) + '</button>';
    }).join('') + '</div></div>' +
    '<div class="campo"><span class="lbl">Avisame desde</span><div class="chips" style="padding:0">' + [10, 12, 14, 16, 18, 20].map(function(v){
      return '<button class="chip" type="button" data-al-min="' + v + '" aria-pressed="' + (v === borrador.min) + '">' + v + ' kn</button>';
    }).join('') + '</div></div>' +
    '<div class="campo"><span class="lbl">Si viene del</span><div class="grilla8">' + RUMBOS8.map(function(r){
      return '<button class="chip" type="button" data-al-dir="' + r + '" aria-pressed="' + (borrador.dirs.indexOf(r) >= 0) + '">' + r + '</button>';
    }).join('') + '</div></div>' +
    '<div class="campo"><span class="lbl">Cuándo</span><div class="seg"><button type="button" data-al-finde="0" aria-pressed="' + !borrador.finde + '">Todos los días</button>' +
    '<button type="button" data-al-finde="1" aria-pressed="' + borrador.finde + '">Fines de semana</button></div></div>' +
    '<button class="btn" type="button" data-accion="crear-alerta">Crear alerta</button></div>' +
    (lista.length ? '<div class="subt"><h2>Tus alertas</h2></div><div style="padding:0 16px;display:flex;flex-direction:column;gap:6px">' + lista.map(function(a, i){
      return '<div class="vidrio" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:14px"><div><b>' + esc(spotPorId(a.spot).n) + ' · +' + a.min + ' kn</b>' +
        '<div style="font-size:12px;color:#8FA9BF">del ' + a.dirs.join(', ') + (a.finde ? ' · fines de semana' : '') + '</div></div>' +
        '<button class="pildora" type="button" data-al-borrar="' + i + '" aria-label="Borrar alerta">Borrar</button></div>';
    }).join('') + '</div><div class="subt"><h2>Próximos días que se cumplen</h2></div><div id="coinc" style="padding:0 16px"><p class="nota" style="margin:0">Buscando…</p></div>' : '') +
    (permiso === 'granted' ? '<div class="aviso aviso--ok">Avisos activados en este teléfono. Te avisamos al abrir Bramador cuando se cumpla una alerta.</div>'
      : permiso === 'no' ? '<div class="aviso">Este navegador no permite avisos. En iPhone, primero instalá Bramador (Más → Instalar).</div>'
      : '<div style="padding:12px 16px 0"><button class="btn btn--vidrio" type="button" data-accion="permiso">🔔 Activar avisos en este teléfono</button></div>') +
    '<p class="nota">Por ahora los avisos llegan cuando abrís Bramador. Muy pronto también con la app cerrada.</p>');
  if (lista.length) pronostico().then(function(t){
    var c = coincidencias(t), box = document.getElementById('coinc'); if (!box) return;
    box.innerHTML = c.length ? c.slice(0, 8).map(function(x){
      return '<a class="vidrio" href="#/dia/' + x.spot.id + '/' + x.iso + '" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-radius:14px;margin-bottom:6px;text-decoration:none;color:inherit">' +
        '<div><b style="text-transform:capitalize">' + esc(nombreDia(x.iso)) + '</b> · ' + esc(x.spot.n) + '<div style="font-size:12px;color:#8FA9BF">desde las ' + hhmm(x.desde) + '</div></div>' +
        '<b class="' + kclase(x.max) + '" style="padding:6px 10px;border-radius:10px">' + r0(x.max) + ' kn ' + rumbo8(x.deg) + '</b></a>';
    }).join('') : '<p class="nota" style="margin:0">Ninguna en la próxima semana. Te avisamos cuando aparezca.</p>';
  }).catch(function(){});
}

// ─────────────────────────────── TEMPORADA ───────────────────────────────
function vistaTemporada(){
  fondo('temporada');
  pintar('<div class="spot-cab"><div class="hero__foto" style="background-image:url(' + foto('wf-38774856') + ')"></div><div class="hero__velo"></div>' +
    '<div class="spot-cab__txt"><div><h1>Temporada</h1><p>20 años de viento en San Isidro, mes por mes</p></div></div></div>' +
    '<div class="tarj vidrio" id="enso"><p class="tit">El Niño / La Niña</p><p class="nota" style="margin:0">Cargando…</p></div>' +
    '<div class="tarj vidrio" id="meses"><p class="tit">Días con +12 kn, de cada 10</p><p class="nota" style="margin:0">Cargando…</p></div>');
  enso().then(function(e){
    var box = document.getElementById('enso'); if (!box) return;
    var txt = {
      nino: ['El Niño', '#FF5A2C', 'Suele traer más lluvia y más sudestadas en el Río de la Plata en primavera y verano: más días ventosos, también más tormentas.'],
      nina: ['La Niña', '#3EC6E0', 'Suele traer primaveras y veranos más secos en el Río de la Plata, con menos tormentas.'],
      neutral: ['Neutral', '#22C3A6', 'Ni El Niño ni La Niña: temporada dentro de lo normal.']
    }[e.fase] || null;
    if (!txt) throw new Error();
    box.innerHTML = '<p class="tit">El Niño / La Niña · ahora</p><div style="font-family:Bricolage Grotesque,sans-serif;font-size:34px;font-weight:800;color:' + txt[1] + '">' + txt[0] + '</div>' +
      '<p style="margin:6px 0 0;font-size:14px;line-height:1.45">' + txt[2] + '</p><p style="margin:6px 0 0;font-size:12px;color:#8FA9BF">Índice del Pacífico: ' + (e.anomalia > 0 ? '+' : '') + e.anomalia.toFixed(1) + ' °C (' + esc(e.trimestre) + ' ' + e.anio + ').</p>';
  }).catch(function(){ var b = document.getElementById('enso'); if (b) b.innerHTML = '<p class="tit">El Niño / La Niña</p><p class="nota" style="margin:0">No se pudo leer el dato ahora.</p>'; });
  climatologia().then(function(c){
    var box = document.getElementById('meses'); if (!box) return;
    var orden = [8, 9, 10, 11, 0, 1, 2, 3], et = ['Sep','Oct','Nov','Dic','Ene','Feb','Mar','Abr'], mesHoy = new Date().getMonth();
    var vals = orden.map(function(m){ var x = c.porMes[m]; return x.n ? x.buenos / x.n : 0; });
    var inv = [4, 5, 6, 7].reduce(function(a, m){ return a + c.porMes[m].buenos; }, 0) / Math.max(1, [4, 5, 6, 7].reduce(function(a, m){ return a + c.porMes[m].n; }, 0));
    vals.push(inv); et.push('Invierno');
    var max = Math.max.apply(null, vals);
    var mejor = et[vals.indexOf(max)];
    box.innerHTML = '<p class="tit">Días con +12 kn, de cada 10</p><div class="meses">' + vals.map(function(v, i){
      var esHoy = i < 8 ? orden[i] === mesHoy : [4, 5, 6, 7].indexOf(mesHoy) >= 0;
      return '<div class="mes' + (esHoy ? ' mes--hoy' : '') + '"><b>' + (v * 10).toFixed(0) + '</b><i style="height:' + Math.max(6, r0(v / max * 110)) + 'px;opacity:' + (0.45 + 0.55 * v / max) + '"></i><small>' + et[i] + '</small></div>';
    }).join('') + '</div><p style="margin:10px 0 0;font-size:14px;line-height:1.45">El mejor mes es <b>' + mejor.toLowerCase() + '</b>. Un día “de +12 kn” es uno en que el viento máximo pasó los 12 nudos.</p>';
  }).catch(function(){ var b = document.getElementById('meses'); if (b) b.innerHTML = '<p class="tit">Mes por mes</p><p class="nota" style="margin:0">No se pudo leer el historial ahora.</p>'; });
}

// ─────────────────────────────── PREGUNTÁ ───────────────────────────────
var charla = [];
function vistaPregunta(){
  fondo('pregunta');
  var chips = ['¿Salgo el sábado?', '¿Qué ala llevo hoy?', '¿Cómo viene el mes?', '¿Hay tormenta?', '¿Cuándo sube la marea?', '¿Cuál es el mejor mes?'];
  pintar('<div class="spot-cab" style="height:150px"><div class="hero__foto" style="background-image:url(' + foto('wf-38774856') + ')"></div><div class="hero__velo"></div>' +
    '<div class="spot-cab__txt"><div><h1>Preguntale<br>al Bramador</h1><p>Responde con los datos del río de hoy y de 20 años</p></div></div></div>' +
    '<div class="chips" style="flex-wrap:wrap;padding:12px 16px 0">' + chips.map(function(c){ return '<button class="chip" type="button" data-preg="' + esc(c) + '">' + esc(c) + '</button>'; }).join('') + '</div>' +
    '<div class="chat" id="chat" style="padding-top:12px"></div>' +
    '<form class="preg" id="formPreg"><label class="sr" for="q">Tu pregunta</label><input id="q" type="text" placeholder="Escribí tu pregunta…" autocomplete="off">' +
    '<button type="submit" aria-label="Preguntar"><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>');
  pintarCharla();
}
function pintarCharla(){
  var box = document.getElementById('chat'); if (!box) return;
  box.innerHTML = charla.map(function(m){
    return '<div class="burbuja ' + (m.yo ? 'burbuja--yo' : 'vidrio') + '">' + (m.yo ? esc(m.t) : m.t) + '</div>';
  }).join('');
  var u = box.lastElementChild; if (u) u.scrollIntoView({behavior: 'smooth', block: 'end'});
}
function diaPedido(txt){
  var t = txt.toLowerCase();
  if (/pasado ma[ñn]ana/.test(t)) return sumarDias(hoyISO(), 2);
  if (/ma[ñn]ana/.test(t)) return sumarDias(hoyISO(), 1);
  var nombres = ['domingo','lunes','martes','mi[eé]rcoles','jueves','viernes','s[aá]bado'];
  for (var i = 0; i < 7; i++) if (new RegExp(nombres[i]).test(t)) {
    for (var k = 0; k < 8; k++) { var iso = sumarDias(hoyISO(), k); if (diaSemana(iso) === i) return iso; }
  }
  if (/finde|fin de semana/.test(t)) { for (var j = 0; j < 8; j++) { var s = sumarDias(hoyISO(), j); if (diaSemana(s) === 6) return s; } }
  return hoyISO();
}
function barritas(serie){
  var mx = Math.max(20, Math.max.apply(null, serie.map(function(x){ return x.kn; })));
  return '<div class="barras" style="height:90px;margin-top:8px">' + serie.map(function(x){
    return '<div class="barra"><b>' + r0(x.kn) + '</b><i style="height:' + Math.max(4, r0(x.kn / mx * 60)) + 'px;background:' + kcolor(x.kn) + '"></i><small>' + x.et + '</small></div>';
  }).join('') + '</div>';
}
function responder(txt){
  charla.push({yo: true, t: txt}); charla.push({yo: false, t: '…'}); pintarCharla();
  var t = txt.toLowerCase(), p = perfil(), spot = spotPorId(p.spot);
  SPOTS.forEach(function(s){ if (t.indexOf(s.n.toLowerCase()) >= 0) spot = s; });
  var fin = function(html){ charla[charla.length - 1] = {yo: false, t: html}; pintarCharla(); };
  var datos = Promise.all([pronostico(), mareas().catch(function(){ return []; }), climatologia().catch(function(){ return null; })]);
  datos.then(function(r){
    var todo = r[0], d = todo[spot.id], mar = r[1], clima = r[2];
    if (/marea|pleamar|bajamar|bajante|creciente/.test(t)) {
      var prox = mar.filter(function(x){ return x.t > Date.now(); }).slice(0, 3);
      return fin(prox.length ? '<b>Mareas en San Isidro:</b><br>' + prox.map(function(x){ return (x.alta ? '▲ Pleamar ' : '▼ Bajamar ') + esc(nombreDia(hoyISO(x.t))) + ' a las ' + hhmm(x.t) + ' (' + x.m.toFixed(2) + ' m)'; }).join('<br>') +
        '<br><br>Con bajante fuerte el fondo queda cerca: ojo con el foil.' : 'Ahora no tengo el pronóstico de mareas. Probá en un rato.');
    }
    if (/mejor mes|temporada|cu[aá]ndo conviene/.test(t) && clima) {
      var m = clima.porMes.map(function(x, i){ return {i: i, v: x.n ? x.buenos / x.n : 0}; }).sort(function(a, b){ return b.v - a.v; });
      return fin('<b>El mejor mes en San Isidro es ' + MESES[m[0].i] + '</b>: ' + r0(m[0].v * 100) + '% de los días pasan los 12 kn. Le siguen ' + MESES[m[1].i] + ' y ' + MESES[m[2].i] + '.' +
        barritas([8, 9, 10, 11, 0, 1, 2, 3].map(function(i){ return {kn: clima.porMes[i].n ? clima.porMes[i].buenos / clima.porMes[i].n * 25 : 0, et: MESES[i].slice(0, 3)}; })).replace(/<b>\d+<\/b>/g, ''));
    }
    if (/mes|semana|pr[oó]ximos d[ií]as|cu[aá]ndo hay/.test(t)) {
      var dias = resumenDias(spot, d).slice(0, 14);
      var buenos = dias.filter(function(x){ return x.horasOk >= 2; });
      return fin('<b>Próximas 2 semanas en ' + esc(spot.n) + ':</b> ' + (buenos.length ? buenos.length + ' días para salir. Los mejores: ' +
        buenos.slice().sort(function(a, b){ return b.max - a.max; }).slice(0, 3).map(function(x){ return esc(nombreDia(x.iso)) + ' (' + r0(x.max) + ' kn)'; }).join(', ') + '.' : 'pocos días con viento que sirva.') +
        barritas(dias.map(function(x){ return {kn: x.max, et: DIAS3[diaSemana(x.iso)].slice(0, 2)}; })) + '<a href="#/spot/' + spot.id + '">Ver el mes completo →</a>');
    }
    var iso = diaPedido(t), k = d.daily.time.indexOf(iso);
    var horas = [];
    for (var i = 0; i < d.hourly.time.length; i++) {
      if (d.hourly.time[i].slice(0, 10) !== iso) continue;
      var hr = +d.hourly.time[i].slice(11, 13); if (hr < 9 || hr > 20) continue;
      horas.push({kn: d.hourly.wind_speed_10m[i], deg: d.hourly.wind_direction_10m[i], code: d.hourly.weather_code[i], et: hr, ms: msDe(d.hourly.time[i])});
    }
    if (/tormenta|rayo|lluvia|llueve/.test(t)) {
      var ray = horas.filter(function(x){ return tormenta(x.code); });
      var llu = k >= 0 ? d.daily.precipitation_sum[k] : 0;
      return fin(ray.length ? '<b>⚡ Sí: tormenta eléctrica ' + esc(nombreDia(iso)) + '</b> entre las ' + ray[0].et + ' y las ' + (ray[ray.length - 1].et + 1) + ' h. No salgas al agua.'
        : '<b>' + (llu > 1 ? 'Lluvia sí (' + llu.toFixed(0) + ' mm), rayos no' : 'Sin tormentas') + '</b> ' + esc(nombreDia(iso)) + ' en ' + esc(spot.n) + '.');
    }
    if (/ala|vela|tama[ñn]o|metros/.test(t)) {
      var pico = picoDia(spot, d, iso);
      if (!pico) return fin('No tengo el pronóstico de ese día todavía.');
      return fin('<b>Ala de ' + ala(pico.kn, p.peso) + ' m</b> para ' + esc(nombreDia(iso)) + ' a las ' + hhmm(pico.ms) + ' (' + r0(pico.kn) + ' kn), con tus ' + p.peso + ' kg.' +
        '<br><br>Si está rachado, un tamaño menos. <a href="#/perfil">Cambiar mi peso →</a>');
    }
    if (k < 0) return fin('Ese día está a más de 16 días: mirá la tendencia en <a href="#/spot/' + spot.id + '">el mes</a>.');
    var ok = horas.filter(function(x){ return evaluar(spot, x.kn, x.deg, x.code).ok; });
    var pk = picoDia(spot, d, iso);
    fin((ok.length ? '<b>Sí, salí ' + esc(nombreDia(iso)) + '</b> en ' + esc(spot.n) + ': de ' + ok[0].et + ' a ' + (ok[ok.length - 1].et + 1) + ' h. Pico a las ' + hhmm(pk.ms) + ' con ' + r0(pk.kn) + ' kn del ' + rumbo(pk.deg) + '. Ala de ' + ala(pk.kn, p.peso) + ' m.'
      : '<b>' + esc(nombreDia(iso)).replace(/^./, function(c){ return c.toUpperCase(); }) + ' no da</b> en ' + esc(spot.n) + (pk ? ': máximo ' + r0(pk.kn) + ' kn del ' + rumbo(pk.deg) + ' (' + esc(pk.ev.m) + ').' : '.')) +
      barritas(horas.map(function(x){ return {kn: x.kn, et: x.et}; })) + '<a href="#/dia/' + spot.id + '/' + iso + '">Ver hora por hora →</a>');
  }).catch(function(){ fin('No pude leer el pronóstico ahora. Revisá la conexión.'); });
}

// ─────────────────────────────── EQUIPATE ───────────────────────────────
function vistaEquipate(){
  fondo('equipate');
  var notas = [
    ['/blog/como-leer-el-viento', 'wf-14740926', 'VIENTO', 'Cómo leer el viento'],
    ['/blog/equipo-wingfoil-usado-que-revisar', 'wf-15151064', 'EQUIPO', 'Equipo usado: qué revisar'],
    ['/blog/errores-comunes-principiantes-wingfoil', 'wf-18388624', 'EMPEZAR', 'Errores de principiante'],
    ['/blog/como-elegir-tu-primer-foil', 'wf-17901682', 'EQUIPO', 'Cómo elegir tu primer foil']
  ];
  pintar('<div class="cab"><div><h1>Equipate y aprendé</h1><p>Se abre en escueladewingfoil.com.ar</p></div></div>' +
    '<div class="comp vidrio"><div class="comp__foto" style="background-image:url(' + foto('wf-15151231') + ')"><div><small>COMPARADOR DE PRECIOS</small><b>¿Te querés comprar un ala?</b></div></div>' +
    '<div style="padding:4px 14px 12px" id="precios"><p class="nota" style="margin:8px 0">Buscando los precios de hoy…</p></div></div>' +
    '<div class="subt"><h2>Notas</h2><a href="/articulos">Ver todas →</a></div><div class="notas">' + notas.map(function(n){
      return '<a href="' + n[0] + '" style="background-image:url(' + foto(n[1]) + ')"><div><small>' + n[2] + '</small><b>' + esc(n[3]) + '</b></div></a>';
    }).join('') + '</div>' +
    '<div style="display:flex;gap:8px;padding:12px 16px 0"><a class="vidrio" href="/instructores" style="flex:1;padding:12px;border-radius:14px;text-decoration:none;color:inherit"><b>Clases →</b><div style="font-size:11px;color:#8FA9BF">instructores por WhatsApp</div></a>' +
    '<a class="vidrio" href="/spots" style="flex:1;padding:12px;border-radius:14px;text-decoration:none;color:inherit"><b>Spots del país →</b><div style="font-size:11px;color:#8FA9BF">más de 20 guías</div></a></div>');
  traer('/mp-data.json', 'mp', 6 * 3600e3).then(function(mp){
    var tipos = [['Vela', 'Ala'], ['Tabla', 'Tabla'], ['Foil', 'Foil']];
    var html = tipos.map(function(t){
      var av = (mp.avisos || []).filter(function(a){ return a.tipo === t[0] && a.moneda === 'USD' && isFinite(a.precio); });
      if (!av.length) return '';
      var min = Math.min.apply(null, av.map(function(a){ return a.precio; }));
      return '<div class="comp__fila"><div><b>' + t[1] + '</b><small>' + av.length + ' avisos en Marketplace</small></div><div style="text-align:right"><small style="font-size:10px;color:#8FA9BF;font-weight:800">DESDE</small><strong>US$ ' + r0(min) + '</strong></div></div>';
    }).join('');
    var box = document.getElementById('precios'); if (!box) return;
    box.innerHTML = (html || '') + '<a class="btn btn--chico" href="/equipos#comparador-precios" style="width:100%;margin-top:6px" data-evento="bramador_comparador">Comparar todos los precios →</a>';
  }).catch(function(){
    var box = document.getElementById('precios');
    if (box) box.innerHTML = '<a class="btn btn--chico" href="/equipos#comparador-precios" style="width:100%;margin-top:10px">Ver el comparador de precios →</a>';
  });
}

// ─────────────────────────────── OPINIÓN ───────────────────────────────
var opinion = {voto: null, enviado: false};
function vistaOpinion(){
  fondo('opinion');
  if (opinion.enviado) {
    pintar('<div class="cab"><div><h1>¡Gracias!</h1><p>Lo leemos todo</p></div></div><div class="tarj vidrio vacio" style="font-size:16px">Tu opinión ya nos llegó. Con lo que nos cuentan vamos armando lo próximo de Bramador. 🤙</div>' +
      '<div style="padding:12px 16px 0"><a class="btn" href="#/">Volver al viento</a></div>');
    return;
  }
  pintar('<div class="cab"><div><h1>¿Te gusta Bramador?</h1><p>Tu opinión arma lo que viene</p></div></div>' +
    '<div class="tarj vidrio"><div class="votos">' + [['encanta', '😍', 'Me encanta'], ['bien', '🙂', 'Está bien'], ['no', '😕', 'No me sirve']].map(function(v){
      return '<button class="voto" type="button" data-voto="' + v[0] + '" aria-pressed="' + (opinion.voto === v[0]) + '"><span aria-hidden="true">' + v[1] + '</span>' + v[2] + '</button>';
    }).join('') + '</div>' +
    '<div class="campo" style="margin-top:14px"><label for="coment">¿Qué le agregarías o cambiarías?</label><textarea id="coment" maxlength="1500" placeholder="Contanos lo que quieras"></textarea></div>' +
    '<button class="btn" type="button" data-accion="enviar-opinion">Enviar</button>' +
    '<button class="btn btn--vidrio" type="button" data-accion="todo-ok" style="margin-top:8px">Todo OK, así está bien 👌</button>' +
    '<p id="opErr" class="nota" style="margin:10px 0 0" hidden></p></div>');
}
function enviarOpinion(todoOk){
  var com = document.getElementById('coment');
  var datos = {'form-name': 'opinion-bramador', voto: todoOk ? 'todo-ok' : (opinion.voto || ''), comentario: com ? com.value.trim() : '', casilla: '', pantalla: 'app'};
  if (!todoOk && !datos.voto && !datos.comentario) {
    var e = document.getElementById('opErr'); e.hidden = false; e.textContent = 'Elegí una carita o escribí algo.'; return;
  }
  var cuerpo = Object.keys(datos).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(datos[k]); }).join('&');
  fetch('/', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: cuerpo}).then(function(r){
    if (!r.ok) throw new Error();
    opinion.enviado = true; evento('bramador_opinion', {voto: datos.voto}); vistaOpinion();
  }).catch(function(){
    var e = document.getElementById('opErr'); e.hidden = false; e.textContent = 'No se pudo enviar. Revisá la conexión y probá de nuevo.';
  });
}

// ─────────────────────────────── INSTALAR ───────────────────────────────
var pedidoInstalar = null;
window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); pedidoInstalar = e; if (location.hash.indexOf('instalar') >= 0) vistaInstalar(); });
window.addEventListener('appinstalled', function(){ evento('bramador_instalada'); });
function esIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function instalada(){ return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
var osElegido = null;
function vistaInstalar(){
  fondo('instalar');
  var os = osElegido || (esIOS() ? 'ios' : 'android');
  var droid = '<svg viewBox="0 0 24 24"><path d="M17.6 9.5l1.6-2.8a.4.4 0 0 0-.7-.4l-1.7 2.8A9.8 9.8 0 0 0 12 8c-1.7 0-3.3.4-4.8 1.1L5.5 6.3a.4.4 0 0 0-.7.4l1.6 2.8A9 9 0 0 0 2 16.5h20a9 9 0 0 0-4.4-7zM7.5 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>';
  var apple = '<svg viewBox="0 0 24 24"><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2-1.1 2.8-2.3.9-1.3 1.2-2.5 1.2-2.6 0 0-2.4-.9-2.4-3.7zM14.1 5.8c.6-.8 1.1-1.8 1-2.8-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.7-1.3z"/></svg>';
  var pasos = os === 'ios' ? [
    ['Abrí esta página en Safari', 'escueladewingfoil.com.ar/bramador'],
    ['Tocá Compartir', 'el cuadradito con la flecha para arriba, abajo en la pantalla'],
    ['“Agregar a pantalla de inicio”', 'listo: el pájaro queda con tus apps']
  ] : [
    ['Abrí esta página en Chrome', 'escueladewingfoil.com.ar/bramador'],
    ['Tocá “Instalá Bramador”', 'el botón naranja de acá abajo'],
    ['Confirmá “Instalar”', 'listo: el pájaro queda con tus apps']
  ];
  pintar('<div class="spot-cab" style="height:240px"><div class="hero__foto" style="background-image:url(' + foto('wf-38774856') + ')"></div><div class="hero__velo"></div>' +
    '<div class="spot-cab__txt"><div><p style="font-size:11px;letter-spacing:.14em;font-weight:800;margin:0 0 6px">BRAMADOR BY ESCUELA DE WINGFOIL</p>' +
    '<h1>El Río de la Plata,<br>en tu bolsillo.</h1><p style="color:#FF5A2C">Gratis. Para toda la comunidad.</p></div></div></div>' +
    (instalada() ? '<div class="aviso aviso--ok">✓ Ya tenés Bramador instalada en este teléfono.</div>' : '') +
    '<div class="os"><div class="vidrio">' + droid + '<div><b>Android</b><small>✓ funciona</small></div></div><div class="vidrio">' + apple + '<div><b>iPhone</b><small>✓ funciona</small></div></div></div>' +
    '<p class="nota" style="text-align:center">Sin Play Store ni App Store: se instala desde la web en 3 pasos.</p>' +
    '<div class="tarj vidrio"><div class="seg"><button type="button" data-os="ios" aria-pressed="' + (os === 'ios') + '">iPhone</button><button type="button" data-os="android" aria-pressed="' + (os === 'android') + '">Android</button></div>' +
    '<ol class="pasos">' + pasos.map(function(x, i){ return '<li><span class="n">' + (i + 1) + '</span><div><b>' + x[0] + '</b><span>' + x[1] + '</span></div></li>'; }).join('') + '</ol>' +
    '<p style="margin:12px 0 0;font-size:12px;font-weight:700;color:#FFC531">' + (os === 'ios' ? 'En iPhone tiene que ser con Safari. Los avisos funcionan una vez instalada.' : 'En Android es un toque.') + '</p></div>' +
    (os === 'android' && !instalada() ? '<div style="padding:12px 16px 0"><button class="btn" type="button" data-accion="instalar"><svg viewBox="0 0 24 24"><path d="M12 3v12M6 10l6 6 6-6M4 20h16"/></svg>Instalá Bramador</button>' +
      (pedidoInstalar ? '' : '<p class="nota" style="margin:8px 0 0;text-align:center">Si el botón no abre nada: menú ⋮ de Chrome → “Instalar app”.</p>') + '</div>' : ''));
}

// ─────────────────────────────── PERFIL ───────────────────────────────
// El mail llega a la Escuela por Netlify Forms (formulario "mails-bramador").
function enviarMail(p){
  var datos = {'form-name': 'mails-bramador', mail: p.mail, nombre: p.nombre, spot: spotPorId(p.spot).n, nivel: p.nivel,
               novedades: p.novedades ? 'si' : 'no', casilla: ''};
  var cuerpo = Object.keys(datos).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(datos[k]); }).join('&');
  fetch('/', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: cuerpo})
    .then(function(r){ if (r.ok) evento('bramador_mail'); }).catch(function(){});
}
function vistaPerfil(){
  fondo('perfil');
  var p = perfil();
  pintar('<div class="cab"><div><h1>Tu perfil</h1><p>Tu mail, tu peso y tu spot</p></div></div>' +
    '<form class="tarj vidrio" id="formPerfil">' +
    '<div class="campo"><label for="pNom">Nombre</label><input id="pNom" name="nombre" type="text" value="' + esc(p.nombre) + '" placeholder="Cómo te llamás" autocomplete="given-name"></div>' +
    '<div class="campo"><label for="pMail">Tu mail</label><input id="pMail" name="mail" type="email" inputmode="email" value="' + esc(p.mail) + '" placeholder="nombre@mail.com" autocomplete="email"></div>' +
    '<label class="tilde"><input id="pNov" type="checkbox"' + (p.novedades ? ' checked' : '') + '> Quiero enterarme de las novedades de Bramador</label>' +
    '<div class="campo"><label for="pPeso">Tu peso: <b id="pPesoV" style="color:#FF5A2C">' + p.peso + ' kg</b></label><input id="pPeso" name="peso" type="range" min="40" max="120" step="1" value="' + p.peso + '"></div>' +
    '<div class="campo"><span class="lbl">Tu nivel</span><div class="seg">' + Object.keys(NIVELES).map(function(k){
      return '<button type="button" data-nivel="' + k + '" aria-pressed="' + (k === p.nivel) + '">' + NIVELES[k].n + '</button>';
    }).join('') + '</div></div>' +
    '<div id="alasBox">' + alasHtml() + '</div>' +
    '<div class="campo"><span class="lbl">Tu spot</span><div class="chips" style="padding:0;flex-wrap:wrap">' + SPOTS.map(function(s){
      return '<button class="chip" type="button" data-pspot="' + s.id + '" aria-pressed="' + (s.id === p.spot) + '">' + esc(s.n) + '</button>';
    }).join('') + '</div></div>' +
    '<button class="btn" type="submit">Guardar</button><p class="nota" id="pOk" style="margin:10px 0 0;text-align:center" hidden>✓ Guardado</p></form>' +
    '<p class="nota">Tu mail queda en la Escuela de Wingfoil, solo para contarte novedades de Bramador. Nunca lo compartimos.</p>' +
    '<p class="nota">Con tu peso calculamos el ala; con tu nivel, cuánto viento es “salí” para vos (principiante: 12 a 20 kn).</p>');
}

// ─────────────────────────────── COMUNIDAD Y SPONSORS ───────────────────────────────
// Datos en Supabase (tablas bram_ del proyecto compartido con Sliabh). Sin cuentas: cada teléfono
// tiene un id y un token propios. Si Supabase no contesta, la app sigue igual sin esto.
var SB = 'https://pfwazngwcvirdeyamvsd.supabase.co', SB_KEY = 'sb_publishable_5wLxVtnFy4IMOAMK_rzZ-A_cZ1TSOeV';
function rpc(fn, args){
  return fetch(SB + '/rest/v1/rpc/' + fn, {method: 'POST', headers: {apikey: SB_KEY, 'Content-Type': 'application/json'}, body: JSON.stringify(args || {})})
    .then(function(r){ if (!r.ok) throw new Error(fn); return r.status === 204 ? null : r.json(); });
}
function azar(n){
  var a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.prototype.map.call(a, function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
}
function rider(){
  var r = leer('rider', null);
  if (!r) {
    var h = azar(16);
    r = {id: crypto.randomUUID ? crypto.randomUUID() : h.slice(0,8) + '-' + h.slice(8,12) + '-4' + h.slice(13,16) + '-a' + h.slice(17,20) + '-' + h.slice(20,32), token: azar(24), ok: false};
    guardar('rider', r);
  }
  return r;
}
function registrarRider(d){
  var r = rider(), p = perfil();
  d = d || {};
  return rpc('bram_registrar', {p_id: r.id, p_token: r.token, p_nombre: d.nombre || p.nombre || '', p_apellido: d.apellido || '', p_mail: d.mail || p.mail || ''})
    .then(function(ok){ if (ok) { r.ok = true; guardar('rider', r); } return ok; });
}
function asegurarRider(){ return rider().ok ? Promise.resolve(true) : registrarRider(); }

// Mis alas: se guardan en el teléfono y en Supabase (para las tendencias del spot).
var MARCAS_ALA = ['Duotone','North','F-One','Cabrinha','Naish','Ozone','Slingshot','Armstrong','Takoon','Gong','Core','Eleveight','Reedin','Otra'];
function misAlas(){ return leer('alas', []); }
function guardarAlas(lista){
  guardar('alas', lista);
  asegurarRider().then(function(){ var r = rider(); return rpc('bram_guardar_alas', {p_id: r.id, p_token: r.token, p_alas: lista}); }).catch(function(){});
}
function alasHtml(){
  var l = misAlas(), medidas = [];
  for (var m = 2; m <= 8; m += 0.5) medidas.push(m);
  return '<div class="campo"><span class="lbl">Mis alas</span>' +
    (l.length ? '<div class="chips" style="padding:0;flex-wrap:wrap">' + l.map(function(a, i){
      return '<button class="chip" type="button" data-ala-del="' + i + '" aria-label="Sacar ' + esc(a.marca + ' ' + a.m) + ' m">' + esc(a.marca) + ' ' + String(a.m).replace('.', ',') + ' m ✕</button>';
    }).join('') + '</div>' : '<p class="nota" style="margin:0;padding:0">Guardalas una vez y en el spot marcás cuál usás con un toque.</p>') +
    '<div class="ala-nueva"><select id="alaMarca" aria-label="Marca">' + MARCAS_ALA.map(function(x){ return '<option>' + x + '</option>'; }).join('') + '</select>' +
    '<select id="alaM" aria-label="Medida">' + medidas.map(function(x){ return '<option value="' + x + '"' + (x === 5 ? ' selected' : '') + '>' + String(x).replace('.', ',') + ' m</option>'; }).join('') + '</select>' +
    '<button class="chip" type="button" data-ala-add>+ Agregar</button></div></div>';
}

// Reportes del spot ("el Waze del río"): toques de quien está ahí, últimas 2 horas.
var ETIQ = {bien: ['✅', 'Todo bien'], rachado: ['💨', 'Rachado'], pocaagua: ['🏝️', 'Poca agua'], gente: ['👥', 'Mucha gente'], bajando: ['📉', 'Bajando el viento']};
var repSpot = null, repKn = null, repEstadoAct = null;
function hace(seg){
  var m = Math.max(0, Math.round(seg / 60));
  return m < 1 ? 'recién' : m < 60 ? 'hace ' + m + ' min' : 'hace ' + Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0');
}
function reportesHtml(spot){
  return '<div class="tarj vidrio rep" id="repBox"><div class="rep__cab"><p class="tit" style="margin:0">En el spot ahora</p><span class="rep__vivo"><i class="vivo-dot"></i>en vivo</span></div>' +
    '<div class="rep__estado" id="repEstado"><span class="rep__gris">Leyendo reportes…</span></div>' +
    '<div class="rep__btns">' + Object.keys(ETIQ).map(function(k){
      return '<button type="button" data-rep="' + k + '"><span aria-hidden="true">' + ETIQ[k][0] + '</span>' + ETIQ[k][1] + '</button>';
    }).join('') + '<button type="button" data-rep="ala"><span aria-hidden="true">🪁</span>Mi ala</button></div>' +
    '<div id="repExtra"></div>' +
    '<p class="rep__nota">Cuenta solo si estás en ' + esc(spot.n) + '. Vence a las 2 horas.</p></div>';
}
function pintarEstado(e){
  repEstadoAct = e;
  var box = document.getElementById('repEstado'); if (!box) return;
  if (!e) { box.innerHTML = '<span class="rep__gris">No pudimos leer los reportes ahora.</span>'; return; }
  var h = '';
  if (e.tag && ETIQ[e.tag]) {
    h += '<div class="rep__linea"><b>' + ETIQ[e.tag][0] + ' ' + ETIQ[e.tag][1] + '</b> · ' + e.riders + (e.riders === 1 ? ' rider' : ' riders') + ' · ' + hace(e.hace) + '</div>' +
      '<div class="rep__sigue"><span>¿Sigue así?</span><button type="button" data-rep="' + e.tag + '">Sigue así</button><button type="button" data-rep="no_' + e.tag + '">Ya no</button></div>';
  } else {
    h += '<div class="rep__linea rep__gris">Sin reportes en las últimas 2 horas. ¿Estás ahí? Contá cómo está.</div>';
  }
  if (e.alas_n > 0 && e.alas_rango != null) {
    h += '<div class="rep__alas">🪁 ' + (e.alas_n > 1 ? 'La mayoría con ' : 'Hoy con ') + e.alas_rango + '–' + (e.alas_rango + 1) + ' m' +
      (e.alas_marcas && e.alas_marcas.length ? ' · ' + e.alas_marcas.map(esc).join(', ') : '') + '</div>';
  }
  box.innerHTML = h;
}
function cargarEstado(spotId){
  rpc('bram_estado', {p_spot: spotId}).then(function(e){ if (repSpot === spotId) pintarEstado(e); }).catch(function(){ if (repSpot === spotId) pintarEstado(null); });
}
function avisoRep(txt, tipo){
  var x = document.getElementById('repExtra'); if (!x) return;
  x.innerHTML = '<p class="rep__msj' + (tipo ? ' rep__msj--' + tipo : '') + '">' + txt + '</p>';
}
function distanciaM(a, b, c, d){
  var R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
  return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
}
function ubicacion(){
  return new Promise(function(ok, mal){
    if (!navigator.geolocation) return mal('sin');
    navigator.geolocation.getCurrentPosition(function(p){ ok(p.coords); }, function(err){ mal(err && err.code === 1 ? 'negado' : 'error'); },
      {enableHighAccuracy: false, timeout: 12000, maximumAge: 30000});
  });
}
function reportar(tag, ala){
  var spot = spotPorId(repSpot); if (!spot) return;
  var botones = document.querySelectorAll('#repBox button'); botones.forEach(function(b){ b.disabled = true; });
  avisoRep('Chequeando que estés en el spot…');
  var fin = function(){ document.querySelectorAll('#repBox button').forEach(function(b){ b.disabled = false; }); };
  ubicacion().then(function(c){
    if (distanciaM(c.latitude, c.longitude, spot.lat, spot.lng) > 1500) { avisoRep('Tenés que estar en ' + esc(spot.n) + ' para reportar.', 'mal'); fin(); return; }
    guardar('geo_ok', true);
    return asegurarRider().then(function(){
      var r = rider();
      return rpc('bram_reportar', {p_id: r.id, p_token: r.token, p_spot: spot.id, p_tag: tag, p_lat: c.latitude, p_lng: c.longitude,
        p_marca: ala ? ala.marca : null, p_m: ala ? ala.m : null, p_kn: repKn});
    }).then(function(res){
      fin();
      if (res && res.ok) {
        evento('bramador_reporte', {spot: spot.id, tag: tag});
        avisoRep(tag === 'ala' ? '✓ Anotado: ' + esc(ala.marca) + ' ' + String(ala.m).replace('.', ',') + ' m. ¡Buena sesión!' : '✓ Gracias, ya cuenta.', 'ok');
        pintarEstado(res.estado);
      } else if (res && res.motivo === 'lejos') avisoRep('Tenés que estar en ' + esc(spot.n) + ' para reportar.', 'mal');
      else if (res && res.motivo === 'muchos') avisoRep('Ya reportaste mucho hoy. ¡Gracias!', 'mal');
      else avisoRep('No se pudo guardar. Probá de nuevo.', 'mal');
    });
  }).catch(function(err){
    fin();
    avisoRep(err === 'negado' ? 'Sin tu ubicación no podemos contar el reporte. Activala para este sitio en el navegador.' : 'No pudimos saber dónde estás. Probá de nuevo.', 'mal');
  });
}
function tocarRep(tag){
  if (tag !== 'ala' && !leer('geo_ok', false)) {
    // La primera vez explicamos por qué pedimos la ubicación.
    var x = document.getElementById('repExtra'); if (!x) return;
    x.innerHTML = '<div class="rep__geo"><p>📍 Para que los reportes sean reales, Bramador chequea que estés en el spot. Usa tu ubicación solo en ese momento.</p>' +
      '<button class="btn btn--chico" type="button" data-rep-ok="' + tag + '">Dale, reportar</button></div>';
    return;
  }
  if (tag === 'ala') {
    var l = misAlas();
    if (!l.length) { avisoRep('Primero guardá tus alas en <a href="#/perfil">tu perfil</a>. Es una sola vez.'); return; }
    if (l.length === 1) { reportar('ala', l[0]); return; }
    var x2 = document.getElementById('repExtra');
    x2.innerHTML = '<p class="rep__msj">¿Con cuál estás?</p><div class="chips" style="padding:0;flex-wrap:wrap">' + l.map(function(a, i){
      return '<button class="chip" type="button" data-rep-ala="' + i + '">' + esc(a.marca) + ' ' + String(a.m).replace('.', ',') + ' m</button>';
    }).join('') + '</div>';
    return;
  }
  reportar(tag);
}
document.addEventListener('click', function(e){
  var b = e.target.closest('[data-rep],[data-rep-ok],[data-rep-ala],[data-ala-add],[data-ala-del]');
  if (!b) return;
  if (b.hasAttribute('data-rep')) tocarRep(b.getAttribute('data-rep'));
  else if (b.hasAttribute('data-rep-ok')) { guardar('geo_ok', true); var t = b.getAttribute('data-rep-ok'); t === 'ala' ? tocarRep('ala') : reportar(t); }
  else if (b.hasAttribute('data-rep-ala')) reportar('ala', misAlas()[+b.getAttribute('data-rep-ala')]);
  else if (b.hasAttribute('data-ala-add')) {
    var l = misAlas(), nueva = {marca: document.getElementById('alaMarca').value, m: +document.getElementById('alaM').value};
    if (!l.some(function(a){ return a.marca === nueva.marca && a.m === nueva.m; }) && l.length < 12) { l.push(nueva); guardarAlas(l); }
    document.getElementById('alasBox').innerHTML = alasHtml();
  } else if (b.hasAttribute('data-ala-del')) {
    var l2 = misAlas(); l2.splice(+b.getAttribute('data-ala-del'), 1); guardarAlas(l2);
    document.getElementById('alasBox').innerHTML = alasHtml();
  }
});

// Sponsors: "Presentado por" en la señal (SALÍ) y en las alertas. Solo logo y nombre.
var sponsorsMem = null;
function sponsorsActivos(){
  if (sponsorsMem) return sponsorsMem;
  var c = leer('sponsors', null);
  // Se consulta una vez cada 6 horas; mientras tanto se usa lo guardado.
  if (c && Date.now() - c.t < 6 * 3600e3) { sponsorsMem = Promise.resolve(c.lista); return sponsorsMem; }
  sponsorsMem = rpc('bram_sponsors_activos').then(function(lista){ guardar('sponsors', {t: Date.now(), lista: lista || []}); return lista || []; })
    .catch(function(){ return c ? c.lista : []; });
  return sponsorsMem;
}
function sponsorPara(spotId, slot){
  return sponsorsActivos().then(function(l){
    var hoy = l.filter(function(x){ return x.slot === slot; });
    return hoy.filter(function(x){ return x.spot === spotId; })[0] || hoy.filter(function(x){ return !x.spot; })[0] || null;
  });
}
function contarImpresion(sp, slot, spotId){ rpc('bram_impresion', {p_sponsor: sp.id, p_slot: slot, p_spot: spotId}).catch(function(){}); }
function presentado(sp){
  return '<span class="presenta__por">Presentado por</span>' + (sp.logo ? '<img src="' + esc(sp.logo) + '" alt="" width="20" height="20">' : '') + '<b>' + esc(sp.nombre) + '</b>';
}

// ─────────────────────────────── BIENVENIDA ───────────────────────────────
// Nombre, apellido y mail son obligatorios para entrar (Netlify Forms "leads-bramador").
// Si ya los dejó en la web, el mismo navegador tiene bram_lead y no se piden de nuevo.
function enviarLead(d){
  var datos = {'form-name': 'leads-bramador', nombre: d.nombre, apellido: d.apellido, mail: d.mail, origen: 'app' + (instalada() ? ' instalada' : ''), 'bot-field': ''};
  var cuerpo = Object.keys(datos).map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(datos[k]); }).join('&');
  return fetch('/', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: cuerpo})
    .then(function(r){ if (!r.ok) throw new Error('form'); evento('bramador_lead'); });
}
function bienvenida(){
  var falta = !leer('lead', false);
  if (leer('bienv', false) && !falta) return;
  var p = perfil();
  var el = document.createElement('div');
  el.className = 'bienv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Bienvenida a Bramador');
  el.innerHTML = '<div class="bienv__fondo"></div><div class="bienv__luz"></div>' + rachas(null) +
    '<svg class="bienv__logo" viewBox="0 0 36 36" role="img" aria-label="Logo de Escuela de Wingfoil">' + PAJARO + '</svg>' +
    '<h1>BRAMADOR</h1><div class="bienv__by">BY ESCUELA DE WINGFOIL</div><p class="bienv__lema">El viento del Río de la Plata.</p>' +
    '<form class="bienv__form">' + (falta ?
      '<p class="bienv__pide">Para entrar, dejanos tus datos. Es gratis.</p>' +
      '<div class="bienv__fila"><div class="campo"><label for="bNom">Nombre</label><input id="bNom" name="nombre" required maxlength="60" autocomplete="given-name" value="' + esc(p.nombre) + '"></div>' +
      '<div class="campo"><label for="bApe">Apellido</label><input id="bApe" name="apellido" required maxlength="60" autocomplete="family-name"></div></div>' +
      '<div class="campo"><label for="bMail">Mail</label><input id="bMail" name="mail" type="email" inputmode="email" required maxlength="120" autocomplete="email" value="' + esc(p.mail) + '"></div>' : '') +
      '<div class="campo"><div class="bienv__peso"><label for="bPeso">Tu peso, para calcular tu ala</label><b id="bPesoV">' + p.peso + ' kg</b></div>' +
    '<input id="bPeso" type="range" min="40" max="120" step="1" value="' + p.peso + '"></div>' +
    '<p class="bienv__err" hidden></p>' +
    '<button class="btn" type="submit" id="bEntrar">Ver el viento de hoy <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>' +
    '<span class="bienv__chica">Gratis · Android y iPhone</span></form>';
  if (falta) el.classList.add('bienv--datos');
  document.body.appendChild(el);
  document.getElementById('nav').hidden = true;
  var r = el.querySelector('#bPeso');
  r.addEventListener('input', function(){ el.querySelector('#bPesoV').textContent = r.value + ' kg'; });
  function entrar(){
    var pp = leer('perfil', {}); pp.peso = +r.value; guardar('perfil', pp);
    guardar('bienv', true);
    el.remove(); document.getElementById('nav').hidden = false;
    router();
  }
  var f = el.querySelector('form');
  f.addEventListener('submit', function(e){
    e.preventDefault();
    if (!falta) return entrar();
    var d = {nombre: f.nombre.value.trim(), apellido: f.apellido.value.trim(), mail: f.mail.value.trim()};
    var btn = el.querySelector('#bEntrar'), err = el.querySelector('.bienv__err'), txt = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Entrando…'; err.hidden = true;
    enviarLead(d).then(function(){
      guardar('lead', 1);
      registrarRider(d).catch(function(){});
      var pp = leer('perfil', {}); if (!pp.nombre) pp.nombre = d.nombre; if (!pp.mail) pp.mail = d.mail; guardar('perfil', pp);
      entrar();
    }).catch(function(){
      btn.disabled = false; btn.innerHTML = txt;
      err.textContent = 'No se pudo enviar. Revisá tu conexión y probá de nuevo.'; err.hidden = false;
    });
  });
}

// ─────────────────────────────── Router y eventos ───────────────────────────────
function router(){
  var h = (location.hash || '#/').replace(/^#\/?/, '').split('/');
  var ruta = h[0] || 'hoy';
  var nav = {hoy:'hoy', rio:'rio', mapa:'hoy', spot:'spot', dia:'spot'}[ruta] || 'mas';
  document.querySelectorAll('.nav a').forEach(function(a){
    if (a.getAttribute('data-ruta') === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  switch (ruta) {
    case 'rio': vistaRio(); break;
    case 'spot': vistaSpot(h[1]); break;
    case 'dia': vistaDia(h[1], h[2] || hoyISO()); break;
    case 'mas': vistaMas(); break;
    case 'alertas': vistaAlertas(); break;
    case 'temporada': vistaTemporada(); break;
    case 'pregunta': vistaPregunta(); break;
    case 'equipate': vistaEquipate(); break;
    case 'opinion': vistaOpinion(); break;
    case 'instalar': vistaInstalar(); break;
    case 'perfil': vistaPerfil(); break;
    default: vistaHoy();
  }
  try { if (typeof gtag === 'function') gtag('event', 'page_view', {page_location: location.href, page_title: 'Bramador · ' + ruta}); } catch(e){}
}

document.addEventListener('click', function(e){
  var b = e.target.closest('[data-accion],[data-cam],[data-al-spot],[data-al-min],[data-al-dir],[data-al-finde],[data-al-borrar],[data-preg],[data-voto],[data-os],[data-nivel],[data-pspot],[data-evento]');
  if (!b) return;
  var a = b.getAttribute('data-accion');
  if (b.hasAttribute('data-evento')) evento(b.getAttribute('data-evento'));
  if (a === 'reintentar') { memoria = {}; router(); }
  else if (a === 'compartir') compartir();
  else if (a === 'permiso') { Notification.requestPermission().then(function(){ vistaAlertas(); }); }
  else if (a === 'crear-alerta') {
    if (!borrador.dirs.length) return;
    var l = alertas(); l.push({spot: borrador.spot, min: borrador.min, dirs: borrador.dirs.slice(), finde: borrador.finde}); guardar('alertas', l);
    evento('bramador_alerta_creada'); vistaAlertas();
  }
  else if (a === 'enviar-opinion') enviarOpinion(false);
  else if (a === 'todo-ok') enviarOpinion(true);
  else if (a === 'instalar') {
    evento('bramador_instalar_click', {origen: 'app'});
    if (pedidoInstalar) { pedidoInstalar.prompt(); pedidoInstalar.userChoice.finally(function(){ pedidoInstalar = null; vistaInstalar(); }); }
  }
  else if (b.hasAttribute('data-cam')) { camActual = +b.getAttribute('data-cam'); montarCam(); }
  else if (b.hasAttribute('data-al-spot')) { borrador.spot = b.getAttribute('data-al-spot'); vistaAlertas(); }
  else if (b.hasAttribute('data-al-min')) { borrador.min = +b.getAttribute('data-al-min'); vistaAlertas(); }
  else if (b.hasAttribute('data-al-dir')) { var r = b.getAttribute('data-al-dir'), i = borrador.dirs.indexOf(r); if (i >= 0) borrador.dirs.splice(i, 1); else borrador.dirs.push(r); vistaAlertas(); }
  else if (b.hasAttribute('data-al-finde')) { borrador.finde = b.getAttribute('data-al-finde') === '1'; vistaAlertas(); }
  else if (b.hasAttribute('data-al-borrar')) { var l2 = alertas(); l2.splice(+b.getAttribute('data-al-borrar'), 1); guardar('alertas', l2); vistaAlertas(); }
  else if (b.hasAttribute('data-preg')) responder(b.getAttribute('data-preg'));
  else if (b.hasAttribute('data-voto')) { opinion.voto = b.getAttribute('data-voto'); document.querySelectorAll('[data-voto]').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }
  else if (b.hasAttribute('data-os')) { osElegido = b.getAttribute('data-os'); vistaInstalar(); }
  else if (b.hasAttribute('data-nivel')) { document.querySelectorAll('[data-nivel]').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }
  else if (b.hasAttribute('data-pspot')) { document.querySelectorAll('[data-pspot]').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }
});
document.addEventListener('input', function(e){
  if (e.target.id === 'pPeso') document.getElementById('pPesoV').textContent = e.target.value + ' kg';
});
document.addEventListener('submit', function(e){
  if (e.target.id === 'formPreg') {
    e.preventDefault();
    var q = document.getElementById('q'), v = q.value.trim(); if (!v) return;
    q.value = ''; responder(v);
  } else if (e.target.id === 'formPerfil') {
    e.preventDefault();
    var niv = document.querySelector('[data-nivel][aria-pressed="true"]'), sp = document.querySelector('[data-pspot][aria-pressed="true"]');
    var antes = perfil(), mail = document.getElementById('pMail').value.trim().toLowerCase(), ok = document.getElementById('pOk');
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { ok.hidden = false; ok.textContent = 'Revisá el mail: parece que le falta algo.'; return; }
    var nuevo = {nombre: document.getElementById('pNom').value.trim(), mail: mail, novedades: document.getElementById('pNov').checked,
                 peso: +document.getElementById('pPeso').value,
                 nivel: niv ? niv.getAttribute('data-nivel') : 'intermedio', spot: sp ? sp.getAttribute('data-pspot') : 'sanisidro'};
    guardar('perfil', nuevo);
    if (mail && (mail !== antes.mail || nuevo.novedades !== antes.novedades)) enviarMail(nuevo);
    ok.hidden = false; ok.textContent = '✓ Guardado';
  }
});

// ─────────────────────────────── ACTUALIZACIONES ───────────────────────────────
// Cada vez que se publica una mejora: sumar una entrada arriba de todo, cambiar VERSION en sw.js
// y poner el mismo número en version.json.
// La app se actualiza sola al abrirla; la primera vez que abre la versión nueva, muestra qué cambió.
var NOVEDADES = [
  {v: '1.12', fecha: '28/10', cambios: ['Nuevo en Mi spot: contá cómo está el río con un toque (rachado, poca agua, mucha gente…) y mirá qué alas se están usando.', 'En tu perfil guardá tus alas una vez.']},
  {v: '1.11', fecha: '27/10', cambios: ['Nuevo en Más: preguntas frecuentes sobre Bramador.']},
  {v: '1.10', fecha: '26/10', cambios: ['Ráfagas a la vista: en Hoy y en Mi spot ves las rachas al lado del viento, hora por hora, y un aviso cuando está rachado.']},
  {v: '1.9', fecha: '26/10', cambios: ['Para entrar a Bramador te pedimos nombre, apellido y mail, una sola vez.']},
  {v: '1.8', fecha: '26/10', cambios: ['Ahora ves a qué hora sale y se pone el sol en el río, en Hoy y en Mi spot.']},
  {v: '1.7', fecha: '26/10', cambios: ['Nuevo en Mi spot: la curva de la marea con la altura de ahora y si está subiendo o bajando.']},
  {v: '1.6', fecha: '26/10', cambios: ['La brújula ahora marca con un triangulito rojo de dónde viene el viento, en vez de la flecha larga.']},
  {v: '1.5', fecha: '26/10', cambios: ['Bramador más simple: sacamos la sección Mapa. El pronóstico día por día, con clima, viento y mareas, está en Mi spot.']},
  {v: '1.4', fecha: '26/10', cambios: ['El calendario del mes en Mi spot ahora muestra el clima de cada día (sol, nubes, lluvia o tormenta) junto al viento.', 'El selector de días del mapa queda más limpio, sin íconos de clima.']},
  {v: '1.3', fecha: '26/10', cambios: ['Arreglado: al tocar play en Lluvia o Tormentas ahora se ven los colores hora por hora, también las lluvias débiles.', 'Arreglado: en Mi spot y en el mes, las flechas ahora apuntan hacia donde va el viento (si dice ENE, la flecha baja hacia el oeste-suroeste).']},
  {v: '1.2', fecha: '26/10', cambios: ['Nuevo en el mapa: botón Foto satelital y, abajo, el resumen del día con mareas, vientos, lluvias y temperaturas.', 'Mapa nuevo estilo Windy: todo el río pintado con la lluvia, las tormentas o el viento, y líneas que muestran cómo se mueve el viento. Tocá play y mirá cómo avanza.', 'El mapa arranca sobre el Río de la Plata y lo podés alejar hasta ver todo el país o el continente.']},
  {v: '1.1', fecha: '26/10', cambios: ['Ahora podés dejar tu mail en Tu perfil para enterarte de lo nuevo.', 'Bramador se actualiza sola: no hace falta bajarla de nuevo.']}
];
function novedades(){
  var ultima = NOVEDADES[0], vista = leer('version', null);
  guardar('version', ultima.v);
  if (!vista || vista === ultima.v || !leer('bienv', false)) return;
  var el = document.createElement('div');
  el.className = 'novedad'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Bramador se actualizó');
  el.innerHTML = '<div class="novedad__caja vidrio"><svg viewBox="0 0 36 36" aria-hidden="true">' + PAJARO + '</svg>' +
    '<p class="novedad__eti">ACTUALIZACIÓN · ' + esc(ultima.fecha) + '</p><h2>Bramador mejoró</h2><ul>' +
    ultima.cambios.map(function(c){ return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' +
    '<button class="btn" type="button">¡Buenísimo!</button></div>';
  document.body.appendChild(el);
  el.querySelector('button').addEventListener('click', function(){ el.remove(); });
  evento('bramador_actualizada', {version: ultima.v});
  // Si dio permiso de avisos, además le llega como notificación del teléfono.
  if (window.Notification && Notification.permission === 'granted' && navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(function(reg){
      reg.showNotification('Bramador se actualizó', {body: ultima.cambios[0], icon: '/bramador/icons/icon-192.png', badge: '/bramador/icons/icon-192.png', tag: 'version-' + ultima.v, data: {url: '/bramador/'}});
    }).catch(function(){});
  }
}

window.addEventListener('hashchange', router);
if ('serviceWorker' in navigator) {
  var teniaVersion = !!navigator.serviceWorker.controller, recargada = false;
  // Cuando entra una versión nueva, la app se recarga sola una vez (sin reinstalar nada).
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (!teniaVersion || recargada) return;
    recargada = true; location.reload();
  });
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('/bramador/sw.js', {scope: '/bramador/'}).catch(function(){});
  });
}
// Control extra, aparte del service worker: al abrir la app (y al volver a ella) pregunta qué
// versión está publicada. Si es otra, borra lo guardado y recarga: el usuario no hace nada.
function buscarVersion(){
  fetch('/bramador/version.json?t=' + Date.now(), {cache: 'no-store'}).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
    if (!d || !d.v || d.v === NOVEDADES[0].v) return;
    try { if (sessionStorage.getItem('bram_recargo') === d.v) return; sessionStorage.setItem('bram_recargo', d.v); } catch(e){}
    var pasos = [];
    if (navigator.serviceWorker) pasos.push(navigator.serviceWorker.getRegistration('/bramador/').then(function(reg){ return reg && reg.update(); }).catch(function(){}));
    if (window.caches) pasos.push(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return k.indexOf('bramador-') === 0; }).map(function(k){ return caches.delete(k); })); }).catch(function(){}));
    Promise.all(pasos).then(function(){ location.reload(); });
  }).catch(function(){});
}
buscarVersion();
document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible') buscarVersion(); });
novedades();
bienvenida();
if (leer('lead', false) && !rider().ok) registrarRider().catch(function(){});
if (leer('bienv', false)) router();
})();
