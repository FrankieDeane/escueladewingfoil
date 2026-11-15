import { getStore } from '@netlify/blobs';
import * as hdf5 from 'jsfive';

// Temperatura del agua medida desde el espacio: el producto de temperatura de la
// superficie del agua (SST) del satélite GOES-19, una imagen por hora con píxeles
// de 2 km. Público y gratis (bucket abierto noaa-goes19 en AWS).
//
// Una vez por hora esta función baja la última imagen (~27 MB), lee la temperatura
// del agua frente a cada spot (promedio de los píxeles buenos a menos de 6 km del
// punto río adentro) y guarda las últimas 72 horas en blobs. Con nubes no hay dato:
// queda el último que se vio. /api/agua (bramador-agua.js) solo entrega lo guardado.
const BUCKET = 'https://noaa-goes19.s3.amazonaws.com';
const PRODUCTO = 'ABI-L2-SSTF';
// Puntos río adentro de cada spot (los mismos plat/plng que usa la app para el pronóstico).
export const PUNTOS = {
  sanisidro: [-34.457, -58.497], peru: [-34.468, -58.487], martinez: [-34.478, -58.479],
  olivos: [-34.497, -58.465], quilmes: [-34.703, -58.227], puntalara: [-34.807, -57.957],
};
const RADIO_KM = 6;
const GUARDAR_H = 72;
// Proyección fija del GOES-R (valores del propio archivo: goes_imager_projection, x, y, SST).
const H = 35786023 + 6378137, REQ = 6378137, RPOL = 6356752.31414, LON0 = -75 * Math.PI / 180;
const E2 = 0.0066943800699785, PASO = 5.6e-5, OFF = 0.151844, N = 5424;
const ESCALA = 0.00244163, SUMA = 180; // SST en Kelvin = crudo * ESCALA + SUMA; 65535 = sin dato

// Latitud/longitud → columna y fila de la imagen.
export function pixel(lat, lng) {
  const la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
  const phic = Math.atan(RPOL * RPOL / (REQ * REQ) * Math.tan(la));
  const rc = RPOL / Math.sqrt(1 - E2 * Math.cos(phic) ** 2);
  const sx = H - rc * Math.cos(phic) * Math.cos(lo - LON0), sy = -rc * Math.cos(phic) * Math.sin(lo - LON0), sz = rc * Math.sin(phic);
  const x = Math.asin(-sy / Math.sqrt(sx * sx + sy * sy + sz * sz)), y = Math.atan(sz / sx);
  return [Math.round((x + OFF) / PASO), Math.round((OFF - y) / PASO)];
}
function carpeta(ms) {
  const d = new Date(ms), y = d.getUTCFullYear();
  const doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 0)) / 864e5);
  return `${PRODUCTO}/${y}/${String(doy).padStart(3, '0')}/${String(d.getUTCHours()).padStart(2, '0')}/`;
}
function inicio(key) {
  const m = key.match(/_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})/);
  return m ? Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * 864e5 + (+m[3]) * 3600e3 + (+m[4]) * 60e3 + (+m[5]) * 1e3 : null;
}
// Temperatura (°C, un decimal) de cada spot en una imagen; null si estaba nublado.
export function leerSpots(buf) {
  const f = new hdf5.File(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'sst.nc');
  const sst = f.get('SST').value, dqf = f.get('DQF').value;
  const r = Math.ceil(RADIO_KM / 2) + 1, out = {};
  for (const [id, [lat, lng]] of Object.entries(PUNTOS)) {
    const [i, j] = pixel(lat, lng), vals = [];
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if ((di * di + dj * dj) * 4 > RADIO_KM * RADIO_KM) continue; // ~2 km por píxel acá
      const k = (j + dj) * N + (i + di), v = sst[k];
      if (v === 65535 || dqf[k] !== 0) continue; // solo calidad buena (sin nubes, sin tierra)
      vals.push(v * ESCALA + SUMA - 273.15);
    }
    if (vals.length < 3) { out[id] = null; continue; }
    vals.sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    out[id] = Math.round(med * 10) / 10;
  }
  return out;
}
async function ultimaClave(ahora) {
  for (const ms of [ahora, ahora - 3600e3, ahora - 2 * 3600e3]) {
    const r = await fetch(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(carpeta(ms))}`);
    if (!r.ok) throw new Error('S3 ' + r.status);
    const claves = [...(await r.text()).matchAll(/<Key>([^<]+\.nc)<\/Key>/g)].map((m) => m[1]).sort();
    if (claves.length) return claves[claves.length - 1];
  }
  return null;
}

export default async () => {
  const store = getStore('bramador-agua');
  const ahora = Date.now();
  try {
    const g = (await store.get('actual', { type: 'json' })) || { historial: [] };
    const clave = await ultimaClave(ahora);
    if (!clave || clave === g.ultimaClave) { console.log('agua: sin imagen nueva'); return new Response('ok'); }
    const r = await fetch(`${BUCKET}/${clave}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const spots = leerSpots(Buffer.from(await r.arrayBuffer()));
    const historial = (g.historial || []).concat([{ t: inicio(clave) + 30 * 60e3, spots }])
      .filter((x) => x.t > ahora - GUARDAR_H * 3600e3);
    await store.setJSON('actual', { historial, ultimaClave: clave, leidoEn: ahora });
    console.log('agua', clave, JSON.stringify(spots));
  } catch (e) {
    console.error('agua', String(e));
  }
  return new Response('ok');
};

// Cada hora a los 20 minutos (la imagen de la hora anterior se publica cerca de y:03).
export const config = { schedule: '20 * * * *' };
