import { getStore } from '@netlify/blobs';

const KEY = 'list';
const MAX_BODY_BYTES = 6 * 1024 * 1024; // fotos van en base64 dentro del body
const MAX_ENTRIES = 1000;          // cap stored list to bound storage growth
const RL_WINDOW_MS = 60 * 60 * 1000; // rate-limit window: 1 hour
const RL_MAX = 8;                    // max POSTs per IP per window
const MAX_FOTOS = 4;
const MAX_FOTO_B64_LEN = 2_500_000; // ~1.8MB crudos por foto (el cliente ya las reduce antes de subir)
const FOTO_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

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

// Client IP from Netlify-provided headers.
function clientIp(req) {
  return req.headers.get('x-nf-client-connection-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || '';
}

// Sliding-window per-IP rate limit backed by Netlify Blobs.
// Returns true if the request is allowed, false if the limit is exceeded.
async function allowRequest(ip) {
  if (!ip) return true; // can't identify caller — don't block
  try {
    const rl = getStore({ name: 'equipos', consistency: 'strong' });
    const rlKey = `rl:${ip}`;
    const now = Date.now();
    const hits = (await rl.get(rlKey, { type: 'json' }).catch(() => []) || [])
      .filter((t) => now - t < RL_WINDOW_MS);
    if (hits.length >= RL_MAX) return false;
    hits.push(now);
    await rl.setJSON(rlKey, hits);
    return true;
  } catch {
    return true; // never let the limiter itself break submissions
  }
}

// Parses the `fotos` field (a JSON-stringified array of data: URLs), stores
// each valid image as its own blob and returns the list of stored ids.
// Anything malformed or oversized is silently dropped rather than failing
// the whole submission — fotos are optional.
async function storeFotos(rawFotos, entryId, fotosStore) {
  let parsed;
  try {
    parsed = JSON.parse(rawFotos || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const ids = [];
  for (let i = 0; i < parsed.length && ids.length < MAX_FOTOS; i++) {
    const dataUrl = String(parsed[i] || '');
    if (dataUrl.length > MAX_FOTO_B64_LEN) continue;
    const m = FOTO_DATA_URL_RE.exec(dataUrl);
    if (!m) continue;
    const ct = 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]);
    const id = `${entryId}-${ids.length}`;
    try {
      await fotosStore.setJSON(id, { b64: m[2], ct });
      ids.push(id);
    } catch {
      // storage hiccup — skip this photo, keep the rest of the listing
    }
  }
  return ids;
}

async function deleteFotos(ids, fotosStore) {
  await Promise.all((ids || []).map((id) => fotosStore.delete(id).catch(() => {})));
}

export default async function(req) {
  const store = getStore({ name: 'equipos', consistency: 'strong' });
  const fotosStore = getStore({ name: 'equipos-fotos', consistency: 'strong' });
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
    // Per-IP rate limit (counts every attempt, including bots).
    if (!(await allowRequest(clientIp(req)))) {
      return new Response(JSON.stringify({ error: 'too many requests' }), { status: 429, headers: cors });
    }

    const body = new URLSearchParams(text);

    // Honeypot: real users never fill this hidden field. Pretend success.
    if (clean(body.get('bot-field'), 1)) {
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    const entry = {
      id: Date.now(),
      tipo: clean(body.get('tipo'), 60),
      marca: clean(body.get('marca'), 80),
      precio: clean(body.get('precio'), 30),
      ubicacion: clean(body.get('ubicacion'), 80),
      descripcion: clean(body.get('descripcion'), 1000),
      whatsapp: cleanPhone(body.get('whatsapp')),
      ts: new Date().toISOString(),
    };

    // Require the meaningful fields so blank/spam rows are rejected.
    if (!entry.tipo || !entry.marca || !entry.precio || !entry.ubicacion || !entry.descripcion || !entry.whatsapp) {
      return new Response(JSON.stringify({ error: 'missing required fields' }), { status: 400, headers: cors });
    }

    entry.fotos = await storeFotos(body.get('fotos'), entry.id, fotosStore);

    const list = await store.get(KEY, { type: 'json' }).catch(() => []) || [];
    list.push(entry);
    // Keep only the most recent MAX_ENTRIES to bound storage, and drop the
    // photo blobs of whatever falls off so they don't leak forever.
    if (list.length > MAX_ENTRIES) {
      const evicted = list.splice(0, list.length - MAX_ENTRIES);
      await Promise.all(evicted.map((e) => deleteFotos(e.fotos, fotosStore)));
    }
    await store.setJSON(KEY, list);
    return new Response(JSON.stringify({ ok: true, fotos: entry.fotos }), { headers: cors });
  }

  return new Response('Method not allowed', { status: 405, headers: cors });
}

export const config = { path: '/api/equipos' };
