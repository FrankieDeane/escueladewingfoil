import { getStore } from '@netlify/blobs';
import * as hdf5 from 'jsfive';

// Rayos de verdad, medidos desde el espacio: el detector de rayos (GLM) del
// satélite meteorológico GOES-19, que mira toda América cada 20 segundos.
// Los datos son públicos y gratis (bucket abierto noaa-goes19 en AWS).
//
// Cada 2 minutos esta función baja los archivos nuevos (uno cada 20 s, ~400 KB),
// se queda con los rayos que cayeron alrededor del Río de la Plata y los guarda
// en blobs. /api/rayos (bramador-rayos.js) solo entrega lo guardado.
const BUCKET = 'https://noaa-goes19.s3.amazonaws.com';
const PRODUCTO = 'GLM-L2-LCFA';
// Recuadro: de Rosario/Junín a Punta Indio y la costa uruguaya (~180 km alrededor de los spots).
export const CAJA = { latMin: -36.2, latMax: -32.8, lngMin: -60.8, lngMax: -55.8 };
const GUARDAR_MS = 90 * 60e3;   // los rayos de la última hora y media
const MAX_ARCHIVOS = 12;        // por corrida (4 min de datos); si se atrasó, se pone al día de a poco
const MAX_RAYOS = 4000;

function carpeta(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 0)) / 864e5);
  return `${PRODUCTO}/${y}/${String(doy).padStart(3, '0')}/${String(d.getUTCHours()).padStart(2, '0')}/`;
}
// "..._s20263191900200_..." → inicio del archivo (año, día del año, hh, mm, ss, décimas)
export function inicioArchivo(key) {
  const m = key.match(/_s(\d{4})(\d{3})(\d{2})(\d{2})(\d{2})(\d)/);
  if (!m) return null;
  return Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * 864e5 + (+m[3]) * 3600e3 + (+m[4]) * 60e3 + (+m[5]) * 1e3 + (+m[6]) * 100;
}
async function listar(prefijo, despuesDe) {
  let url = `${BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefijo)}`;
  if (despuesDe && despuesDe.startsWith(prefijo)) url += `&start-after=${encodeURIComponent(despuesDe)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('S3 ' + r.status);
  const xml = await r.text();
  return [...xml.matchAll(/<Key>([^<]+\.nc)<\/Key>/g)].map((m) => m[1]);
}
// Lee un archivo GLM (NetCDF4/HDF5) y devuelve los rayos dentro de la caja.
export function rayosDeArchivo(buf, t0) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const f = new hdf5.File(ab, 'glm.nc');
  const lat = f.get('flash_lat').value, lng = f.get('flash_lon').value;
  const out = [];
  for (let i = 0; i < lat.length; i++) {
    const a = lat[i], o = lng[i];
    if (a < CAJA.latMin || a > CAJA.latMax || o < CAJA.lngMin || o > CAJA.lngMax) continue;
    out.push({ t: t0 + 10e3, lat: Math.round(a * 1000) / 1000, lng: Math.round(o * 1000) / 1000 });
  }
  return out;
}

export default async () => {
  const store = getStore('bramador-rayos');
  const ahora = Date.now();
  let g = null;
  try { g = await store.get('actual', { type: 'json' }); } catch { /* arranca vacío */ }
  const previo = g || { rayos: [], ultimoArchivo: null };
  try {
    // La hora anterior también, por si recién empezó la hora o la corrida anterior falló.
    const prefijos = [carpeta(ahora - 3600e3), carpeta(ahora)];
    let claves = [];
    for (const p of prefijos) claves = claves.concat(await listar(p, previo.ultimoArchivo));
    claves = claves.filter((k) => !previo.ultimoArchivo || k > previo.ultimoArchivo)
      .filter((k) => (inicioArchivo(k) || 0) > ahora - GUARDAR_MS)
      .sort();
    if (claves.length > MAX_ARCHIVOS) claves = claves.slice(-MAX_ARCHIVOS);
    const nuevos = [];
    let ultimo = previo.ultimoArchivo, leidos = 0;
    const resultados = await Promise.all(claves.map(async (k) => {
      try {
        const r = await fetch(`${BUCKET}/${k}`);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return { k, rayos: rayosDeArchivo(Buffer.from(await r.arrayBuffer()), inicioArchivo(k)) };
      } catch (e) { console.error('rayos archivo', k, String(e)); return { k, rayos: null }; }
    }));
    for (const x of resultados) {
      if (!x.rayos) break;   // si uno falló, se reintenta desde ahí en la próxima corrida
      nuevos.push(...x.rayos); ultimo = x.k; leidos++;
    }
    const rayos = previo.rayos.concat(nuevos).filter((x) => x.t > ahora - GUARDAR_MS).slice(-MAX_RAYOS);
    const datoHasta = ultimo ? inicioArchivo(ultimo) + 20e3 : previo.datoHasta || null;
    await store.setJSON('actual', { rayos, ultimoArchivo: ultimo, datoHasta, leidoEn: ahora });
    console.log(`rayos: ${leidos} archivos, ${nuevos.length} rayos nuevos en la zona, ${rayos.length} guardados`);
  } catch (e) {
    console.error('rayos', String(e));
  }
  return new Response('ok');
};

export const config = { schedule: '*/2 * * * *' };
