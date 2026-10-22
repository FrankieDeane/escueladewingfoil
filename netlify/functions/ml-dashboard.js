// /api/ml-dashboard — datos de la vidriera de Mercado Libre (página /equipos).
//
// GET  → { links, relevamientos: [{ fecha, productos: [...] }], servicio }
//        links = cantidad de búsquedas a relevar.
// POST { i }          → releva la búsqueda número i por la API oficial de ML
// POST { cerrar: 1 }  → junta lo relevado hoy en un relevamiento del historial
//
// Usa la app de ML (MELI_CLIENT_ID / MELI_CLIENT_SECRET) con el token de la
// cuenta conectada en /api/ml-auth: ML sólo deja leer el catálogo, no las
// publicaciones sueltas (ver scripts/ml-api-relevar.mjs). El workflow
// scrape-ml.yml lo dispara todos los días.
//
// Costo acotado: cada búsqueda se releva como mucho una vez cada COOLDOWN_MS.

import { getStore } from '@netlify/blobs';
import { getMlToken } from '../../scripts/ml-api.mjs';
import { BUSQUEDAS, relevarBusqueda } from '../../scripts/ml-api-relevar.mjs';

const COOLDOWN_MS = 3 * 60 * 60 * 1000;
const MAX_RELEVAMIENTOS = 60;
const API_V = 3; // subir si cambia qué se releva, para no reusar lo de antes
const servicio = () => !!(process.env.MELI_CLIENT_ID && process.env.MELI_CLIENT_SECRET);

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const store = () => getStore({ name: 'ml-dashboard', consistency: 'strong' });

async function relevar(i) {
  const b = BUSQUEDAS[i];
  const s = store();
  const key = `pag:${hoy()}:${i}`;
  const prev = await s.get(key, { type: 'json' }).catch(() => null);
  if (prev && prev.ok && prev.fuente === 'api' && prev.v === API_V && Date.now() - prev.ts < COOLDOWN_MS) return { i, ok: true, productos: prev.productos.length, cache: true };
  const base = { i, listado: b.nombre, fuente: 'api', v: API_V, ts: Date.now() };
  let out;
  try {
    const tok = await getMlToken('auto');
    const apodos = (await s.get('apodos', { type: 'json' }).catch(() => null)) || {};
    const antes = Object.keys(apodos).length;
    const productos = await relevarBusqueda(b, tok.token, apodos);
    if (Object.keys(apodos).length !== antes) await s.setJSON('apodos', apodos).catch(() => {});
    out = productos.length ? { ...base, ok: true, productos } : { ...base, ok: false, error: 'La búsqueda no trajo productos' };
  } catch (e) {
    out = { ...base, ok: false, error: String(e.message || e).slice(0, 200) };
  }
  // Un error no pisa un dato bueno del mismo día.
  if (out.ok || !prev || !prev.ok) await s.setJSON(key, out);
  return { i, ok: out.ok, productos: out.productos ? out.productos.length : 0, error: out.error };
}

// Une las búsquedas del día: un producto que aparece en varias queda una sola
// vez, con su mejor puesto y la lista de búsquedas donde aparece.
async function cerrar() {
  const s = store();
  const fecha = hoy();
  const { blobs } = await s.list({ prefix: `pag:${fecha}:` });
  const pags = (await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }).catch(() => null))))
    .filter((p) => p && p.ok && p.fuente === 'api');
  if (!pags.length) return { ok: false, motivo: 'sin-datos' };
  const porId = new Map();
  for (const p of pags.flatMap((x) => x.productos)) {
    const k = p.id || p.url;
    const prev = porId.get(k);
    if (!prev) porId.set(k, { ...p, listados: [p.listado] });
    else {
      if (!prev.listados.includes(p.listado)) prev.listados.push(p.listado);
      if (p.mlPuesto < prev.mlPuesto) prev.mlPuesto = p.mlPuesto;
    }
  }
  const productos = [...porId.values()].map(({ listado, ...p }) => ({ ...p, ok: true }));
  await s.setJSON(`rel:${fecha}`, { fecha, fuente: 'listados', ts: Date.now(), productos });
  return { ok: true, fecha, busquedas: pags.length, productos: productos.length };
}

async function leer() {
  try {
    const s = store();
    const { blobs } = await s.list({ prefix: 'rel:' });
    const keys = blobs.map((b) => b.key).sort().slice(-MAX_RELEVAMIENTOS);
    const rels = (await Promise.all(keys.map((k) => s.get(k, { type: 'json' }).catch(() => null))))
      .filter((r) => r && r.fuente === 'listados');
    return rels.sort((a, b) => a.fecha.localeCompare(b.fecha));
  } catch {
    return []; // sin Blobs (local) o caído
  }
}

const json = (body, status = 200, extra = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } });

export default async (req) => {
  if (req.method === 'GET') {
    return json({
      servicio: servicio(),
      links: BUSQUEDAS.length,
      listados: BUSQUEDAS.map((b) => b.nombre),
      relevamientos: await leer(),
    }, 200, { 'cache-control': 'public, max-age=300' });
  }
  if (req.method !== 'POST') return json({ ok: false }, 405);

  let body = {};
  try { body = await req.json(); } catch { /* body vacío */ }
  if (!servicio()) return json({ ok: false, motivo: 'sin-servicio' }, 503);
  if (body.cerrar) return json(await cerrar());
  const i = Number(body.i);
  if (!Number.isInteger(i) || i < 0 || i >= BUSQUEDAS.length) return json({ ok: false, motivo: 'link-invalido' }, 400);
  return json(await relevar(i));
};

export const config = { path: '/api/ml-dashboard' };
