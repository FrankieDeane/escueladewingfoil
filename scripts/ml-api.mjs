// ml-api.mjs — acceso a la API oficial de Mercado Libre desde las funciones
// de Netlify. Usa la app MELI_CLIENT_ID / MELI_CLIENT_SECRET.
//   - token de usuario: lo guarda /api/ml-auth en Blobs y acá se renueva solo
//     con el refresh token cuando vence (cada 6 h).
//   - token de app: client_credentials, sin login.

import { getStore } from '@netlify/blobs';

const API = 'https://api.mercadolibre.com';
export const REDIRECT_URI = 'https://escueladewingfoil.com.ar/venta-de-wingfoil';

async function pedirToken(params) {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: process.env.MELI_CLIENT_ID, client_secret: process.env.MELI_CLIENT_SECRET, ...params }),
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`token ${res.status} ${t.error || ''} ${t.message || ''}`.trim());
  return t;
}

// tipo: 'usuario' | 'app' | 'auto' (usuario si hay, si no app).
export async function getMlToken(tipo = 'auto') {
  if (tipo !== 'app') {
    const s = getStore({ name: 'ml-dashboard', consistency: 'strong' });
    const guardado = await s.get('token', { type: 'json' }).catch(() => null);
    if (guardado) {
      if (Date.now() < guardado.expira) return { token: guardado.access_token, tipo: 'usuario' };
      const t = await pedirToken({ grant_type: 'refresh_token', refresh_token: guardado.refresh_token });
      await s.setJSON('token', { ...guardado, access_token: t.access_token, refresh_token: t.refresh_token || guardado.refresh_token, expira: Date.now() + (t.expires_in || 21600) * 1000 - 60000 });
      return { token: t.access_token, tipo: 'usuario' };
    }
    if (tipo === 'usuario') return null;
  }
  const t = await pedirToken({ grant_type: 'client_credentials' });
  return { token: t.access_token, tipo: 'app' };
}

export async function mlGet(path, token) {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* no JSON */ }
  return { ok: res.ok, status: res.status, body, text };
}
