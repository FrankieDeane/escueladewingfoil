// /api/hardwind — precios de la tienda Hard Wind (Tiendanube). En construcción.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('raw')) {
    const r = await fetch(`https://hardwind.com/${url.searchParams.get('cat') || 'wing'}/?page=${url.searchParams.get('page') || 1}`, { headers: { 'user-agent': UA, 'accept-language': 'es-AR,es;q=0.9' } });
    const html = await r.text();
    const i = html.indexOf(url.searchParams.get('buscar') || 'js-item-product');
    const desde = Number(url.searchParams.get('desde') || 0);
    return new Response(`status ${r.status} largo ${html.length} pos ${i}\n\n` + html.slice(Math.max(0, i + desde), i + desde + 6000), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return Response.json({ ok: false }, { status: 405 });
};

export const config = { path: '/api/hardwind' };
