// /api/ml-dashboard — datos del dashboard de equipos de Mercado Libre
// (sección #venta-de-wingfoil).
//
// GET  → { links, relevamientos: [{ fecha, productos: [...] }], servicio }
// POST { i }          → releva el link número i de ml-links.json
// POST { cerrar: 1 }  → junta los links relevados hoy en un relevamiento
//
// ML bloquea los pedidos que salen de servidores (Netlify, GitHub Actions):
// devuelve una página de verificación anti-bots. Por eso cada página se pide a
// través de un servicio de scraping con IPs residenciales, configurado en la
// variable de entorno ML_FETCH_URL con {url} donde va el link. Ej.:
//   https://api.scraperapi.com/?api_key=CLAVE&country_code=ar&url={url}
// Sin esa variable, POST responde 503 y el dashboard muestra los datos que ya hay.
//
// Costo acotado: cada link se releva como mucho una vez cada COOLDOWN_MS,
// aunque alguien apriete "Relevar ahora" muchas veces.

import { getStore } from '@netlify/blobs';
import linksFile from '../../ml-links.json';
import seed from '../../ml-data.json';
import { parseProducto, esBloqueo } from '../../scripts/ml-page-parse.mjs';

const COOLDOWN_MS = 3 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000;
const MAX_RELEVAMIENTOS = 180;
const LINKS = (linksFile.links || []).filter((l) => l && /^https:\/\/[a-z.]*mercadolibre\.com\.ar\//.test(l.url));

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const store = () => getStore({ name: 'ml-dashboard', consistency: 'strong' });

// El primer relevamiento es el scraping del listado del 24/9: sólo título,
// precio e imagen, en el orden en que ML los mostraba (≈ más vendidos).
function relevamientoSemilla() {
  return {
    fecha: seed.actualizado.slice(0, 10),
    fuente: 'listado',
    productos: seed.productos.map((p) => ({
      id: (/\b(MLAU?)-?(\d{6,})/i.exec(p.link) || []).slice(1).join('') || null,
      url: p.link, titulo: p.titulo, imagen: p.imagen, precio: p.precio, mlPuesto: p.id, ok: true,
    })),
  };
}

async function relevar(i) {
  const link = LINKS[i];
  const s = store();
  const key = `item:${hoy()}:${i}`;
  const prev = await s.get(key, { type: 'json' }).catch(() => null);
  if (prev && prev.ok && Date.now() - prev.ts < COOLDOWN_MS) return { ...prev, cache: true };

  const base = { i, url: link.url, categoria: link.categoria || null, ts: Date.now() };
  let out;
  try {
    const r = await fetch(process.env.ML_FETCH_URL.replace('{url}', encodeURIComponent(link.url)), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const html = await r.text();
    if (!r.ok) out = { ...base, ok: false, error: `HTTP ${r.status}` };
    else if (esBloqueo(html, r.url)) out = { ...base, ok: false, error: 'ML pidió verificación' };
    else {
      const p = parseProducto(html, link.url);
      out = { ...base, ...p, marca: link.marca || p.marca, ok: p.precio != null || !!p.titulo };
      if (!out.ok) out.error = 'No se pudo leer la publicación';
    }
  } catch (e) {
    out = { ...base, ok: false, error: e.name === 'TimeoutError' ? 'Tardó demasiado' : 'Error de conexión' };
  }
  // Un error no pisa un dato bueno del mismo día.
  if (out.ok || !prev || !prev.ok) await s.setJSON(key, out);
  return out.ok || !prev ? out : { ...prev, cache: true };
}

async function cerrar() {
  const s = store();
  const fecha = hoy();
  const { blobs } = await s.list({ prefix: `item:${fecha}:` });
  const items = (await Promise.all(blobs.map((b) => s.get(b.key, { type: 'json' }).catch(() => null))))
    .filter(Boolean).sort((a, b) => a.i - b.i);
  if (!items.some((p) => p.ok)) return { ok: false, motivo: 'sin-datos' };
  await s.setJSON(`rel:${fecha}`, { fecha, fuente: 'links', ts: Date.now(), productos: items });
  return { ok: true, fecha, productos: items.length, conDatos: items.filter((p) => p.ok).length };
}

async function leer() {
  let rels = [];
  try {
    const s = store();
    const { blobs } = await s.list({ prefix: 'rel:' });
    const keys = blobs.map((b) => b.key).sort().slice(-MAX_RELEVAMIENTOS);
    rels = (await Promise.all(keys.map((k) => s.get(k, { type: 'json' }).catch(() => null)))).filter(Boolean);
  } catch { /* sin Blobs (local) o caído: se muestran sólo los datos iniciales */ }
  const semilla = relevamientoSemilla();
  if (!rels.some((r) => r.fecha === semilla.fecha)) rels.unshift(semilla);
  rels.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return rels;
}

const json = (body, status = 200, extra = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } });

export default async (req) => {
  if (req.method === 'GET') {
    return json({
      servicio: !!process.env.ML_FETCH_URL,
      links: LINKS.length,
      relevamientos: await leer(),
    }, 200, { 'cache-control': 'public, max-age=120' });
  }
  if (req.method !== 'POST') return json({ ok: false }, 405);

  let body = {};
  try { body = await req.json(); } catch { /* body vacío */ }
  if (!process.env.ML_FETCH_URL) return json({ ok: false, motivo: 'sin-servicio' }, 503);
  if (body.cerrar) return json(await cerrar());
  const i = Number(body.i);
  if (!Number.isInteger(i) || i < 0 || i >= LINKS.length) return json({ ok: false, motivo: 'link-invalido' }, 400);
  return json(await relevar(i));
};

export const config = { path: '/api/ml-dashboard' };
