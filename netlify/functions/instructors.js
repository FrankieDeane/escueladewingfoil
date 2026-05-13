import { getStore } from '@netlify/blobs';

const KEY = 'list';

export default async function(req) {
  const store = getStore({ name: 'instructors', consistency: 'strong' });
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (req.method === 'GET') {
    const list = await store.get(KEY, { type: 'json' }).catch(() => []);
    return new Response(JSON.stringify(list || []), { headers: cors });
  }

  if (req.method === 'POST') {
    const text = await req.text();
    const body = new URLSearchParams(text);
    const entry = {
      id: Date.now(),
      nombre: body.get('nombre') || '',
      apellido: body.get('apellido') || '',
      whatsapp: body.get('whatsapp') || '',
      ubicacion: body.get('ubicacion') || '',
      bio: body.get('bio') || '',
      deportes: body.get('deportes') || '',
      ts: new Date().toISOString(),
    };
    const list = await store.get(KEY, { type: 'json' }).catch(() => []) || [];
    list.push(entry);
    await store.setJSON(KEY, list);
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  return new Response('Method not allowed', { status: 405 });
}

export const config = { path: '/api/instructors' };
