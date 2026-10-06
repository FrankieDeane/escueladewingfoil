// Prueba temporal: ¿Mercado Libre responde a pedidos desde Netlify?
const URLS = [
  'https://articulo.mercadolibre.com.ar/MLA-2572823874-vela-rrd-wind-wing-wingfoil-wingsurf-freeride-freestyle-str-_JM',
  'https://www.mercadolibre.com.ar/vela-de-wing-wingfoil-aztron-air-wing-50-kite-wake-surf-color-celeste/p/MLA46874476',
  'https://listado.mercadolibre.com.ar/wingfoil',
  'https://api.mercadolibre.com/items/MLA2572823874',
  'https://api.mercadolibre.com/products/MLA46874476',
];
const HDRS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'es-AR,es;q=0.9',
};
export default async () => {
  const out = await Promise.all(URLS.map(async (u) => {
    const t = Date.now();
    try {
      const r = await fetch(u, { headers: HDRS, redirect: 'follow', signal: AbortSignal.timeout(7000) });
      const body = await r.text();
      return { u, status: r.status, final: r.url, ms: Date.now() - t, len: body.length,
        title: (body.match(/<title>([^<]*)/) || [])[1] || null,
        hasPrice: /"price"\s*:\s*\d/.test(body) || /andes-money-amount__fraction/.test(body),
        vendidos: (body.match(/\+?\d+\s*vendidos/) || [])[0] || null,
        snippet: body.slice(0, 200) };
    } catch (e) { return { u, error: String(e), ms: Date.now() - t }; }
  }));
  return Response.json(out);
};
export const config = { path: '/api/ml-probe' };
