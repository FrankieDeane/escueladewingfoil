// /api/ml-auth — conexión con la API oficial de Mercado Libre (app
// MELI_CLIENT_ID / MELI_CLIENT_SECRET, cargadas en Netlify).
//
// GET  ?login=1  → redirige al login de ML para autorizar la app. ML vuelve a
//                  https://escueladewingfoil.com.ar/venta-de-wingfoil?code=…
// POST { code }  → canjea el código por tokens de usuario y los guarda en
//                  Netlify Blobs (el refresh token renueva el acceso solo).
// GET  ?diag=1   → prueba qué endpoints de búsqueda responden y con qué
//                  token (app o usuario). No devuelve tokens ni secretos.

import { getStore } from '@netlify/blobs';
import { getMlToken, mlGet, REDIRECT_URI } from '../../scripts/ml-api.mjs';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export default async (req) => {
  const url = new URL(req.url);
  const id = process.env.MELI_CLIENT_ID;
  if (!id || !process.env.MELI_CLIENT_SECRET) return json({ ok: false, motivo: 'sin-app' }, 503);

  if (req.method === 'GET' && url.searchParams.get('login')) {
    const auth = new URL('https://auth.mercadolibre.com.ar/authorization');
    auth.search = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: REDIRECT_URI }).toString();
    return Response.redirect(auth.toString(), 302);
  }

  if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch { /* vacío */ }
    const code = String(body.code || '');
    if (!/^TG-[\w-]{10,}$/.test(code)) return json({ ok: false, motivo: 'codigo-invalido' }, 400);
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: id, client_secret: process.env.MELI_CLIENT_SECRET, code, redirect_uri: REDIRECT_URI }),
    });
    const t = await res.json().catch(() => ({}));
    if (!res.ok) return json({ ok: false, motivo: 'canje', status: res.status, error: t.error || null, mensaje: t.message || null }, 400);
    await getStore({ name: 'ml-dashboard', consistency: 'strong' }).setJSON('token', {
      access_token: t.access_token, refresh_token: t.refresh_token, user_id: t.user_id,
      expira: Date.now() + (t.expires_in || 21600) * 1000 - 60000,
    });
    return json({ ok: true, usuario: t.user_id });
  }

  // ?catalogo=a|b|c → cuántos productos de catálogo de wingfoil trae cada búsqueda
  if (req.method === 'GET' && url.searchParams.get('catalogo')) {
    const tok = await getMlToken('auto');
    const out = {};
    for (const q of url.searchParams.get('catalogo').split('|').slice(0, 10)) {
      const nombres = [];
      for (const off of [0, 50]) {
        const r = await mlGet(`/products/search?status=active&site_id=MLA&q=${encodeURIComponent(q)}&limit=50&offset=${off}`, tok.token);
        if (!r.ok) { nombres.push(`HTTP ${r.status}`); break; }
        (r.body.results || []).forEach((p) => { if (/wing|foil/i.test(p.name || '')) nombres.push(`${p.id} ${p.domain_id} ${p.name}`); });
      }
      out[q] = nombres;
    }
    return json(out);
  }

  // ?probar=1 → los endpoints por producto/publicación que usa el dashboard de
  // Gama, con token y sin token (algunos recursos son públicos).
  if (req.method === 'GET' && url.searchParams.get('probar')) {
    const tok = await getMlToken('auto');
    const out = { token: tok.tipo };
    for (const path of [
      '/items?ids=MLA2572823874,MLA100194922439,MLA102497944934&attributes=id,title,price,seller_id,catalog_product_id,sold_quantity',
      '/items/MLA2572823874',
      '/products/MLA46874476',
      '/products/MLA46874476/items?limit=5',
      '/sites/MLA/search?q=wingfoil&limit=2',
      '/products/search?status=active&site_id=MLA&q=tabla%20wingfoil&limit=5',
      '/users/198206295',
    ]) {
      const a = await mlGet(path, tok.token);
      const b = await fetch('https://api.mercadolibre.com' + path, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
        .then(async (r) => ({ status: r.status, text: await r.text() })).catch((e) => ({ status: 0, text: String(e) }));
      out[path] = { conToken: `${a.status} ${a.text.slice(0, 220)}`, sinToken: `${b.status} ${b.text.slice(0, 220)}` };
    }
    return json(out);
  }

  // ?explorar=1 → categorías de ML para cada búsqueda, más vendidos de cada
  // categoría (highlights) y detalle de algunos de esos productos.
  if (req.method === 'GET' && url.searchParams.get('explorar')) {
    const tok = await getMlToken('auto');
    const out = { token: tok.tipo, categorias: {}, highlights: {}, detalle: {} };
    const cats = new Set();
    for (const q of ['wingfoil tabla', 'wing wingfoil', 'foil hidroala', 'neoprene surf', 'tabla foil', 'arnes wing']) {
      const r = await mlGet(`/sites/MLA/domain_discovery/search?q=${encodeURIComponent(q)}&limit=4`, tok.token);
      out.categorias[q] = r.ok ? r.body.map((c) => `${c.category_id} ${c.category_name} (${c.domain_name})`) : r.status;
      if (r.ok) r.body.forEach((c) => cats.add(c.category_id));
    }
    const ids = [];
    for (const c of [...cats].slice(0, 8)) {
      const r = await mlGet(`/highlights/MLA/category/${c}`, tok.token);
      out.highlights[c] = r.ok ? (r.body.content || []).slice(0, 5).map((x) => `${x.type} ${x.id} #${x.position}`) : `${r.status} ${r.text.slice(0, 120)}`;
      if (r.ok) (r.body.content || []).slice(0, 2).forEach((x) => ids.push(x));
    }
    for (const x of ids.slice(0, 4)) {
      const path = x.type === 'PRODUCT' ? `/products/${x.id}` : `/items/${x.id}`;
      const r = await mlGet(path, tok.token);
      out.detalle[path] = r.ok ? JSON.stringify(r.body).slice(0, 400) : `${r.status} ${r.text.slice(0, 120)}`;
      if (x.type === 'PRODUCT') {
        const r2 = await mlGet(`/products/${x.id}/items`, tok.token);
        out.detalle[`${path}/items`] = r2.ok ? JSON.stringify(r2.body).slice(0, 400) : `${r2.status} ${r2.text.slice(0, 120)}`;
      }
    }
    return json(out);
  }

  if (req.method === 'GET' && url.searchParams.get('diag')) {
    const out = {};
    for (const tipo of ['usuario', 'app']) {
      const tok = await getMlToken(tipo).catch((e) => ({ error: String(e.message || e) }));
      if (!tok || tok.error) { out[tipo] = tok || { error: 'sin token' }; continue; }
      const prueba = {};
      for (const [nombre, path] of [
        ['buscar', '/sites/MLA/search?q=wingfoil%20tabla&limit=3'],
        ['catalogo', '/products/search?status=active&site_id=MLA&q=wingfoil&limit=3'],
        ['categorias', '/sites/MLA/domain_discovery/search?q=wingfoil%20tabla&limit=3'],
        ['tendencias', '/trends/MLA'],
      ]) {
        const r = await mlGet(path, tok.token);
        prueba[nombre] = { status: r.status, muestra: r.ok ? JSON.stringify(r.body).slice(0, 300) : r.text.slice(0, 200) };
      }
      out[tipo] = prueba;
    }
    return json(out);
  }

  return json({ ok: false }, 405);
};

export const config = { path: '/api/ml-auth' };
