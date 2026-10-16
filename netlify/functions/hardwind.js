// /api/hardwind — precios de la tienda Hard Wind (hardwind.com, Tiendanube)
// para la pestaña "Hard Wind" de la sección de equipos.
//
// GET                       → { categorias, relevamientos: [{ fecha, productos }] }
// POST { cat, pagina }      → releva una página de una categoría
//                             (responde { n, mas } para saber si seguir)
// POST { cerrar: 1 }        → junta lo relevado hoy en el historial
//
// La pausa de 3 s entre páginas la pone quien llama (el botón "Relevar" y el
// relevamiento diario de GitHub Actions), así cada función dura poco.

import { getStore } from '@netlify/blobs';
import { parseCategoria } from '../../scripts/hardwind-parse.mjs';

const CATEGORIAS = [
  { id: 'wing', nombre: 'Wing foil' },
  { id: 'foil', nombre: 'Foil' },
  { id: 'neoprenes', nombre: 'Neoprenes' },
  { id: 'straps-y-botas', nombre: 'Straps y botas' },
  { id: 'accesorios1', nombre: 'Accesorios' },
  { id: 'usado', nombre: 'Usados' },
];
const MAX_PAGINAS = 15;
const POR_PAGINA = 12; // productos por página del listado de Hard Wind
const MAX_RELEVAMIENTOS = 180;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const store = () => getStore({ name: 'hardwind', consistency: 'strong' });
const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } });
const urlPagina = (cat, p) => (p === 1 ? `https://hardwind.com/${cat}/` : `https://hardwind.com/${cat}/page/${p}/`);

async function relevar(cat, pagina) {
  const r = await fetch(urlPagina(cat, pagina), {
    headers: { 'user-agent': UA, 'accept-language': 'es-AR,es;q=0.9', accept: 'text/html' },
    signal: AbortSignal.timeout(9000),
  });
  if (r.status === 404) return { ok: true, n: 0, mas: false };
  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
  const productos = parseCategoria(await r.text()).map((p) => ({ ...p, seccion: cat }));
  const s = store();
  // Tiendanube puede repetir la última página: si no hay nada nuevo, se corta
  const previa = pagina > 1 ? await s.get(`pag:${hoy()}:${cat}:${pagina - 1}`, { type: 'json' }).catch(() => null) : null;
  const vistos = new Set((previa?.productos || []).map((p) => p.id));
  const nuevos = productos.filter((p) => !vistos.has(p.id));
  if (nuevos.length) await s.setJSON(`pag:${hoy()}:${cat}:${pagina}`, { ts: Date.now(), productos: nuevos });
  return { ok: true, n: nuevos.length, mas: nuevos.length >= POR_PAGINA && pagina < MAX_PAGINAS };
}

async function cerrar() {
  const s = store();
  const fecha = hoy();
  const { blobs } = await s.list({ prefix: `pag:${fecha}:` });
  const pags = (await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }).catch(() => null)))).filter(Boolean);
  const porId = new Map();
  pags.flatMap((p) => p.productos).forEach((p) => {
    const prev = porId.get(p.id);
    if (!prev) porId.set(p.id, { ...p, secciones: [p.seccion] });
    else if (!prev.secciones.includes(p.seccion)) prev.secciones.push(p.seccion);
  });
  if (!porId.size) return { ok: false, motivo: 'sin-datos' };
  const productos = [...porId.values()].map(({ seccion, ...p }) => p);
  await s.setJSON(`rel:${fecha}`, { fecha, ts: Date.now(), productos });
  return { ok: true, fecha, productos: productos.length };
}

async function leer() {
  try {
    const s = store();
    const { blobs } = await s.list({ prefix: 'rel:' });
    const keys = blobs.map((b) => b.key).sort().slice(-MAX_RELEVAMIENTOS);
    const rels = await Promise.all(keys.map((k) => s.get(k, { type: 'json' }).catch(() => null)));
    return rels.filter(Boolean);
  } catch {
    return []; // sin Blobs (local)
  }
}

export default async (req) => {
  if (req.method === 'GET') {
    return json({ categorias: CATEGORIAS, maxPaginas: MAX_PAGINAS, relevamientos: await leer() }, 200, { 'cache-control': 'public, max-age=60' });
  }
  if (req.method !== 'POST') return json({ ok: false }, 405);
  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  if (body.cerrar) return json(await cerrar());
  const cat = CATEGORIAS.find((c) => c.id === body.cat);
  const pagina = Number(body.pagina);
  if (!cat || !Number.isInteger(pagina) || pagina < 1 || pagina > MAX_PAGINAS) return json({ ok: false, motivo: 'pedido-invalido' }, 400);
  try {
    return json(await relevar(cat.id, pagina));
  } catch (e) {
    return json({ ok: false, error: e.name === 'TimeoutError' ? 'Hard Wind tardó demasiado' : 'Error de conexión' });
  }
};

export const config = { path: '/api/hardwind' };
