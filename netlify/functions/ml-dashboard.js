// /api/ml-dashboard — datos del dashboard de equipos de Mercado Libre
// (sección #venta-de-wingfoil).
//
// GET  → { links, relevamientos: [{ fecha, productos: [...] }], servicio }
//        links = cantidad de páginas a relevar (listados × páginas).
// POST { i }          → releva la página número i (listado i / paginas, página i % paginas)
// POST { cerrar: 1 }  → junta lo relevado hoy en un relevamiento del historial
//
// ML bloquea los pedidos que salen de servidores (Netlify, GitHub Actions):
// devuelve una página de verificación anti-bots. Por eso cada página se pide a
// través de un servicio de scraping con IPs residenciales, configurado en la
// variable de entorno ML_FETCH_URL con {url} donde va el link. Ej.:
//   https://api.scraperapi.com/?api_key=CLAVE&country_code=ar&url={url}
// Sin esa variable, POST responde 503 y el dashboard queda vacío.
//
// Costo acotado: cada página se releva como mucho una vez cada COOLDOWN_MS,
// aunque alguien apriete "Relevar ahora" muchas veces.

import { getStore } from '@netlify/blobs';
import linksFile from '../../ml-links.json';
import { parseListado, esBloqueo } from '../../scripts/ml-page-parse.mjs';
import { getMlToken } from '../../scripts/ml-api.mjs';
import { BUSQUEDAS, relevarBusqueda } from '../../scripts/ml-api-relevar.mjs';

const COOLDOWN_MS = 3 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9500;
const MAX_RELEVAMIENTOS = 180;
const POR_PAGINA = 48; // resultados por página del listado de ML
const PAGINAS = Math.max(1, Math.min(5, linksFile.paginas || 1));
const LISTADOS = (linksFile.listados || [])
  .filter((l) => l && /^https:\/\/listado\.mercadolibre\.com\.ar\//.test(l.url))
  .map((l) => ({ ...l, url: l.url.split(/[?#]/)[0].replace(/\/+$/, '') }));
// Con la app de ML (MELI_CLIENT_ID/SECRET) se releva por la API, una búsqueda
// de catálogo por tarea. Si no, páginas de los listados vía ML_FETCH_URL.
const conApi = () => !!(process.env.MELI_CLIENT_ID && process.env.MELI_CLIENT_SECRET);
const tareas = () => (conApi() ? BUSQUEDAS.length : LISTADOS.length * PAGINAS);
const servicio = () => conApi() || !!process.env.ML_FETCH_URL;

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const store = () => getStore({ name: 'ml-dashboard', consistency: 'strong' });

// Página p del listado: ML pagina con _Desde_49, _Desde_97…
const urlPagina = (l, p) => (p === 0 ? l.url : `${l.url}_Desde_${p * POR_PAGINA + 1}_NoIndex_True`);

async function relevarApi(i) {
  const b = BUSQUEDAS[i];
  const s = store();
  const key = `pag:${hoy()}:${i}`;
  const prev = await s.get(key, { type: 'json' }).catch(() => null);
  if (prev && prev.ok && prev.fuente === 'api' && Date.now() - prev.ts < COOLDOWN_MS) return { i, ok: true, productos: prev.productos.length, cache: true };
  const base = { i, listado: b.nombre, fuente: 'api', ts: Date.now() };
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
  if (out.ok || !prev || !prev.ok) await s.setJSON(key, out);
  return { i, ok: out.ok, productos: out.productos ? out.productos.length : 0, error: out.error };
}

async function relevar(i) {
  if (conApi()) return relevarApi(i);
  const listado = LISTADOS[Math.floor(i / PAGINAS)];
  const pagina = i % PAGINAS;
  const s = store();
  const key = `pag:${hoy()}:${i}`;
  const prev = await s.get(key, { type: 'json' }).catch(() => null);
  if (prev && prev.ok && Date.now() - prev.ts < COOLDOWN_MS) return { i, ok: true, productos: prev.productos.length, cache: true };

  const url = urlPagina(listado, pagina);
  const base = { i, listado: listado.nombre, url, ts: Date.now() };
  let out;
  try {
    const r = await fetch(process.env.ML_FETCH_URL.replace('{url}', encodeURIComponent(url)), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const html = await r.text();
    if (!r.ok) out = { ...base, ok: false, error: `HTTP ${r.status}` };
    else if (esBloqueo(html, r.url)) out = { ...base, ok: false, error: 'ML pidió verificación' };
    else {
      const productos = parseListado(html, pagina * POR_PAGINA).map((p) => ({ ...p, listado: listado.nombre }));
      out = productos.length ? { ...base, ok: true, productos } : { ...base, ok: false, error: 'No se pudo leer el listado' };
    }
  } catch (e) {
    out = { ...base, ok: false, error: e.name === 'TimeoutError' ? 'Tardó demasiado' : 'Error de conexión' };
  }
  // Un error no pisa un dato bueno del mismo día.
  if (out.ok || !prev || !prev.ok) await s.setJSON(key, out);
  return { i, ok: out.ok, productos: out.productos ? out.productos.length : 0, error: out.error };
}

// Une las páginas del día: un producto que aparece en varios listados queda
// una sola vez, con su mejor puesto y la lista de listados donde aparece.
async function cerrar() {
  const s = store();
  const fecha = hoy();
  const { blobs } = await s.list({ prefix: `pag:${fecha}:` });
  const pags = (await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }).catch(() => null))))
    .filter((p) => p && p.ok && (p.fuente === 'api') === conApi());
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
  return { ok: true, fecha, paginas: pags.length, productos: productos.length };
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
  const probar = new URL(req.url).searchParams.get('probar');
  if (req.method === 'GET' && probar != null && conApi()) {
    // Prueba de una búsqueda por la API, sin guardar nada.
    const b = BUSQUEDAS[Number(probar)] || BUSQUEDAS[0];
    const t0 = Date.now();
    try {
      const tok = await getMlToken('auto');
      const prods = await relevarBusqueda(b, tok.token, {});
      return json({ busqueda: b, token: tok.tipo, ms: Date.now() - t0, total: prods.length, productos: prods.slice(0, 12) });
    } catch (e) {
      return json({ busqueda: b, ms: Date.now() - t0, error: String(e.message || e) }, 500);
    }
  }
  if (req.method === 'GET') {
    return json({
      servicio: servicio(),
      links: tareas(),
      listados: conApi() ? BUSQUEDAS.map((b) => b.nombre) : LISTADOS.map((l) => l.nombre),
      relevamientos: await leer(),
    }, 200, { 'cache-control': 'public, max-age=120' });
  }
  if (req.method !== 'POST') return json({ ok: false }, 405);

  let body = {};
  try { body = await req.json(); } catch { /* body vacío */ }
  if (!servicio()) return json({ ok: false, motivo: 'sin-servicio' }, 503);
  if (body.cerrar) return json(await cerrar());
  const i = Number(body.i);
  if (!Number.isInteger(i) || i < 0 || i >= tareas()) return json({ ok: false, motivo: 'link-invalido' }, 400);
  return json(await relevar(i));
};

export const config = { path: '/api/ml-dashboard' };
