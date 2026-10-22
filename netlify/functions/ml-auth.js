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
