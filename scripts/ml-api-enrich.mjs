// ml-api-enrich.mjs — completa los productos de ml-data.json con la API
// oficial de Mercado Libre: vendedor, ubicación, condición, estado de la
// publicación, stock y cuotas cuando la API los devuelve.
//
// No reemplaza al scraper: parte de los IDs que ya están en ml-data.json.
// Usa un App Token (client_credentials) con ML_APP_ID + ML_SECRET.
// Cada llamada queda registrada en el diagnóstico con su status, porque
// ML responde 403 a algunos endpoints según el tipo de token y hay que ver
// cuáles andan con datos reales, no suponerlo.
//
// Uso: ML_APP_ID=... ML_SECRET=... node scripts/ml-api-enrich.mjs
//      [--in ml-data.json] [--out ml-api-data.json] [--diag ml-api-diag.json]

import { readFileSync, writeFileSync } from 'fs';
import { itemIdFromUrl } from './ml-parse.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const IN = arg('--in', 'ml-data.json');
const OUT = arg('--out', 'ml-api-data.json');
const DIAG = arg('--diag', 'ml-api-diag.json');
const API = 'https://api.mercadolibre.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const diag = { token: null, calls: [], muestras: {} };
let token = null;

async function getToken() {
  const id = process.env.ML_APP_ID, secret = process.env.ML_SECRET;
  if (!id || !secret) throw new Error('Faltan ML_APP_ID / ML_SECRET');
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    // Con ML_CODE (código que devuelve el login del usuario) se pide un token
    // de usuario; si no, un App Token. ML rechaza con 403 las lecturas de
    // publicaciones ajenas hechas con App Token.
    body: new URLSearchParams(process.env.ML_CODE
      ? { grant_type: 'authorization_code', client_id: id, client_secret: secret, code: process.env.ML_CODE, redirect_uri: process.env.ML_REDIRECT_URI || '' }
      : { grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  const body = await res.json().catch(() => ({}));
  diag.token = { tipo: process.env.ML_CODE ? 'usuario' : 'app', status: res.status, scope: body.scope || null, error: res.ok ? null : body };
  if (!res.ok) throw new Error(`Token ${res.status}`);
  return body.access_token;
}

// GET con token; registra status y una muestra de la primera respuesta de
// cada tipo de endpoint para poder mapear campos.
async function get(path, tipo) {
  await sleep(250);
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* no JSON */ }
  diag.calls.push({ tipo, path, status: res.status, error: res.ok ? null : text.slice(0, 300) });
  if (res.ok && !diag.muestras[tipo]) diag.muestras[tipo] = body;
  return res.ok ? body : null;
}

const attr = (obj, id) => (obj?.attributes || []).find((a) => a.id === id)?.value_name || null;
const CONDICION = { new: 'nuevo', used: 'usado', not_specified: null };
const ESTADO = { active: 'activa', paused: 'pausada', closed: 'finalizada', under_review: 'en revisión', inactive: 'inactiva' };

function cuotasDe(x) {
  const i = x?.installments || x?.sale_terms_installments;
  if (!i || !i.quantity) return null;
  return { cantidad: i.quantity, valor: i.amount ?? null, tasa: i.rate ?? null, sinInteres: i.rate === 0 };
}

async function vendedor(id, cache) {
  if (!id) return null;
  if (!cache.has(id)) {
    const u = await get(`/users/${id}`, 'user');
    cache.set(id, u ? {
      id, nickname: u.nickname || null,
      ciudad: u.address?.city || null, provincia: u.address?.state || null,
      reputacion: u.seller_reputation?.level_id || null,
      tiendaOficial: !!(u.tags || []).includes('brand'),
    } : { id });
  }
  return cache.get(id);
}

function desdeItem(it) {
  if (!it) return {};
  return {
    itemId: it.id,
    precioApi: it.price ?? null,
    moneda: it.currency_id || null,
    condicion: CONDICION[it.condition] ?? attr(it, 'ITEM_CONDITION'),
    estadoPublicacion: ESTADO[it.status] || it.status || null,
    stock: it.available_quantity ?? null,
    vendidos: it.sold_quantity ?? null,
    cuotas: cuotasDe(it),
    sellerId: it.seller_id || null,
    ubicacionItem: [it.seller_address?.city?.name, it.seller_address?.state?.name].filter(Boolean).join(', ') || null,
    envioGratis: it.shipping?.free_shipping ?? null,
  };
}

async function main() {
  const src = JSON.parse(readFileSync(IN, 'utf8'));
  token = await getToken();
  const users = new Map();
  const out = [];
  for (const p of src.productos) {
    const id = itemIdFromUrl(p.link);
    const r = { id: p.id, mlId: id, titulo: p.titulo, link: p.link, precio: p.precio };
    let info = {};
    if (/^MLAU/.test(id)) {
      const up = await get(`/user-products/${id}`, 'user-product');
      r.sellerId = up?.user_id || null;
      r.catalogo = up?.catalog_product_id || null;
      info.condicion = attr(up, 'ITEM_CONDITION');
      // Las publicaciones de un user product no siempre se pueden listar
      // con App Token: se prueba y queda en el diagnóstico.
      const items = await get(`/items?user_product_id=${id}`, 'items-by-up')
        || await get(`/sites/MLA/search?user_product_id=${id}`, 'search-by-up');
      const itId = items?.results?.[0]?.id || items?.[0]?.body?.id;
      if (itId) info = { ...info, ...desdeItem(await get(`/items/${itId}`, 'item')) };
    } else if (/\/p\//.test(p.link)) {
      const prod = await get(`/products/${id}`, 'product');
      const bbw = prod?.buy_box_winner;
      r.sellerId = bbw?.seller_id || null;
      info = { cuotas: cuotasDe(bbw) };
      if (bbw?.item_id) info = { ...info, ...desdeItem(await get(`/items/${bbw.item_id}`, 'item')) };
    } else {
      info = desdeItem(await get(`/items/${id}`, 'item'));
    }
    Object.assign(r, Object.fromEntries(Object.entries(info).filter(([, v]) => v !== null && v !== undefined)));
    const v = await vendedor(r.sellerId || info.sellerId, users);
    if (v) {
      r.vendedor = v.nickname || null;
      r.ubicacion = r.ubicacionItem || [v.ciudad, v.provincia].filter(Boolean).join(', ') || null;
      r.reputacion = v.reputacion;
    }
    out.push(r);
  }
  const resumen = {};
  for (const c of diag.calls) { const k = `${c.tipo} ${c.status}`; resumen[k] = (resumen[k] || 0) + 1; }
  diag.resumen = resumen;
  writeFileSync(OUT, JSON.stringify({ actualizado: new Date().toISOString(), total: out.length, productos: out }, null, 2));
  writeFileSync(DIAG, JSON.stringify(diag, null, 2));
  console.log('Token:', diag.token);
  console.log('Llamadas por endpoint/status:', resumen);
  const con = (k) => out.filter((x) => x[k] != null && x[k] !== '').length;
  console.log(`Con vendedor ${con('vendedor')}/${out.length}, ubicación ${con('ubicacion')}, condición ${con('condicion')}, estado ${con('estadoPublicacion')}, stock ${con('stock')}, cuotas ${con('cuotas')}`);
}

main().catch((e) => { console.error('✗', e.message); writeFileSync(DIAG, JSON.stringify(diag, null, 2)); process.exit(1); });
