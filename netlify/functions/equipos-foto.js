import { getStore } from '@netlify/blobs';

// Sirve una foto subida a "Equipos en Venta". Se guardan aparte del listado
// principal (en vez de embebidas en la lista JSON) para no inflar esa
// entrada en cada lectura/escritura del listado completo.
export default async function(req) {
  const url = new URL(req.url);
  const id = decodeURIComponent(url.pathname.split('/').pop() || '');
  if (!id) return new Response('Not found', { status: 404 });

  const store = getStore({ name: 'equipos-fotos', consistency: 'strong' });
  const rec = await store.get(id, { type: 'json' }).catch(() => null);
  if (!rec || !rec.b64 || !rec.ct) return new Response('Not found', { status: 404 });

  return new Response(Buffer.from(rec.b64, 'base64'), {
    headers: {
      'Content-Type': rec.ct,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

export const config = { path: '/api/equipos-foto/:id' };
