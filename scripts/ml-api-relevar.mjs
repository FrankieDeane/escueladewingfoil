// ml-api-relevar.mjs — relevamiento del dashboard por la API oficial de
// Mercado Libre, igual que el dashboard de Gama: ML bloquea la búsqueda de
// publicaciones (/sites/MLA/search) y las publicaciones sueltas (/items), pero
// con el token de la cuenta conectada deja leer el catálogo:
//   /products/search      → productos de catálogo de cada búsqueda, en el
//                            orden de relevancia de ML (= puesto)
//   /products/{id}        → nombre, marca, foto y precio ganador (buy box)
//   /products/{id}/items  → todos los que lo venden, con su precio
//   /users/{id}           → apodo del vendedor
//   /reviews/item/{id}    → estrellas y comentarios (si ML lo permite)

import { mlGet } from './ml-api.mjs';

// Búsquedas en el catálogo de ML. Solo quedan los productos de rubros de
// deportes de agua (kite, windsurf, SUP, fundas…) que nombran wing o foil: el
// catálogo mezcla mucho ("foil" de uñas, libros, juguetes "Wing").
export const BUSQUEDAS = ['wingfoil', 'wing wingfoil', 'tabla foil', 'kite wing', 'wingsurf', 'foil surf']
  .map((q) => ({ nombre: q, q }));
const PAGINAS_API = 2; // de 50 productos
const EN_PARALELO = 5;
const CON_OPINIONES = 15; // los primeros de cada búsqueda
const RUBRO = /^MLA-(KITES|KITESURF_\w+|WINDSURFING_\w+|SUP_\w+|SURF\w*|WATER_SPORTS\w*|WETSUITS?|\w*HARNESS\w*|\w*FOIL\w*)$/;
const NOMBRA = /wing|foil/i;
const relevante = (p) => p && p.id && NOMBRA.test(p.name || '') && (!p.domain_id || RUBRO.test(p.domain_id));

async function enPool(lista, n, fn) {
  const out = new Array(lista.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, async () => {
    while (i < lista.length) { const j = i++; out[j] = await fn(lista[j], j).catch(() => null); }
  }));
  return out;
}

const attr = (p, id) => (p.attributes || []).find((a) => a && a.id === id)?.value_name || null;
const foto = (u) => (u ? String(u).replace(/^http:/, 'https:') : null);

async function opiniones(token, itemId) {
  if (!itemId) return null;
  const r = await mlGet(`/reviews/item/${itemId}?limit=5`, token);
  if (!r.ok || !r.body) return null;
  const b = r.body;
  const estrellas = b.rating_average ?? b.paging?.rating_average ?? null;
  const cantidad = b.paging?.total ?? (b.reviews || []).length;
  if (!cantidad) return null;
  const comentarios = (b.reviews || [])
    .filter((x) => x && x.content && x.content.length > 20)
    .slice(0, 3)
    .map((x) => ({ texto: String(x.content).slice(0, 280), estrellas: x.rate ?? x.rating ?? null }));
  return { estrellas: estrellas != null ? Math.round(estrellas * 10) / 10 : null, cantidad, comentarios };
}

// apodos: { [seller_id]: nickname } (cache compartida entre corridas)
export async function relevarBusqueda(b, token, apodos) {
  const candidatos = [];
  for (let pag = 0; pag < PAGINAS_API; pag++) {
    const r = await mlGet(`/products/search?status=active&site_id=MLA&q=${encodeURIComponent(b.q)}&limit=50&offset=${pag * 50}`, token);
    if (!r.ok) { if (pag === 0) throw new Error(`Búsqueda de catálogo: HTTP ${r.status}`); break; }
    candidatos.push(...(r.body.results || []).filter(relevante));
    if ((r.body.results || []).length < 50) break;
  }

  const filas = await enPool(candidatos, EN_PARALELO, async (c, idx) => {
    const [pr, it] = await Promise.all([mlGet(`/products/${c.id}`, token), mlGet(`/products/${c.id}/items?limit=100`, token)]);
    const p = pr.ok ? pr.body : c;
    const ofertas = it.ok ? (it.body.results || []).filter((x) => x && x.price) : [];
    const bb = p.buy_box_winner || null;
    const ganador = bb || ofertas.slice().sort((a, x) => a.price - x.price)[0] || null;
    if (!ganador || !ganador.price) return null; // sin nadie vendiéndolo hoy
    const precioDesde = ofertas.length ? Math.min(...ofertas.map((x) => x.price)) : null;
    return {
      id: c.id,
      url: p.permalink || `https://www.mercadolibre.com.ar/p/${c.id}`,
      titulo: p.name || c.name,
      imagen: foto(p.pictures?.[0]?.url),
      marca: attr(p, 'BRAND') || attr(c, 'BRAND'),
      precio: ganador.price,
      precioOriginal: ganador.original_price && ganador.original_price > ganador.price ? ganador.original_price : null,
      precioDesde: precioDesde != null && precioDesde < ganador.price ? precioDesde : null,
      opciones: ofertas.length || null,
      vendedorId: ganador.seller_id || null,
      item: ganador.item_id || null,
      tiendaOficial: !!ganador.official_store_id,
      envioGratis: !!ganador.shipping?.free_shipping,
      vendidos: null,
      mlPuesto: idx + 1,
      listado: b.nombre,
      fuente: 'api',
    };
  });
  const prods = filas.filter(Boolean);

  // Apodos de vendedores que todavía no conocemos
  const faltan = [...new Set(prods.map((p) => p.vendedorId).filter((id) => id && !apodos[id]))];
  await enPool(faltan, EN_PARALELO, async (id) => {
    const u = await mlGet(`/users/${id}`, token);
    if (u.ok && u.body?.nickname) apodos[id] = u.body.nickname;
  });
  prods.forEach((p) => { p.vendedor = apodos[p.vendedorId] || null; });

  // Opiniones de los primeros
  await enPool(prods.slice(0, CON_OPINIONES), EN_PARALELO, async (p) => { p.opiniones = await opiniones(token, p.item); });
  return prods;
}
