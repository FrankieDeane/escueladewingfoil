import { getStore } from '@netlify/blobs';

const KEY = 'list';
const MAX_BODY_BYTES = 8 * 1024;   // reject oversized request bodies
const MAX_ENTRIES = 1000;          // cap stored list to bound storage growth

// Strip angle brackets + control chars (defense-in-depth vs stored XSS), trim
// and cap length. Newlines/tabs are preserved for free-text fields.
function clean(value, max) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, max);
}

// WhatsApp: keep an optional leading + and digits only.
function cleanPhone(value) {
  const raw = String(value || '').replace(/[^0-9+]/g, '');
  const plus = raw.startsWith('+') ? '+' : '';
  return (plus + raw.replace(/[^0-9]/g, '')).slice(0, 20);
}

// Only allow known sport tags.
function cleanDeportes(value) {
  const allowed = new Set(['wingfoil', 'kitesurf']);
  return String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => allowed.has(s))
    .join(',');
}

export default async function(req) {
  const store = getStore({ name: 'instructors', consistency: 'strong' });
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (req.method === 'GET') {
    const list = await store.get(KEY, { type: 'json' }).catch(() => []);
    return new Response(JSON.stringify(list || []), { headers: cors });
  }

  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: 'payload too large' }), { status: 413, headers: cors });
    }
    const body = new URLSearchParams(text);

    // Honeypot: real users never fill this hidden field. Pretend success.
    if (clean(body.get('bot-field'), 1)) {
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    const entry = {
      id: Date.now(),
      nombre: clean(body.get('nombre'), 60),
      apellido: clean(body.get('apellido'), 60),
      whatsapp: cleanPhone(body.get('whatsapp')),
      ubicacion: clean(body.get('ubicacion'), 80),
      bio: clean(body.get('bio'), 600),
      deportes: cleanDeportes(body.get('deportes')),
      ts: new Date().toISOString(),
    };

    // Require the meaningful fields so blank/spam rows are rejected.
    if (!entry.nombre || !entry.apellido || !entry.whatsapp || !entry.ubicacion) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400, headers: cors });
    }

    const list = await store.get(KEY, { type: 'json' }).catch(() => []) || [];
    list.push(entry);
    // Keep only the most recent MAX_ENTRIES to bound storage.
    if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
    await store.setJSON(KEY, list);
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  return new Response('Method not allowed', { status: 405, headers: cors });
}

export const config = { path: '/api/instructors' };
