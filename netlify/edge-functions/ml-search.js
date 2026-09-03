// ML Search Edge Function — usa App Token (client credentials) si están configuradas las env vars
// Si no hay credenciales, intenta la llamada pública con headers de browser

export default async function handler(request) {
  const url = new URL(request.url);
  // Cap query length to keep the upstream URL bounded.
  const query = (url.searchParams.get('q') || 'wing foil').slice(0, 120);
  // Clamp limit to a sane 1–50 range (ML caps at 50; reject junk/huge values).
  const limitNum = parseInt(url.searchParams.get('limit'), 10);
  const limit = String(Number.isFinite(limitNum) ? Math.min(Math.max(limitNum, 1), 50) : 48);
  const cond = url.searchParams.get('cond') || '';

  const condMap = { new: '2230284', used: '2230581' };
  const condParam = cond && condMap[cond] ? `&ITEM_CONDITION=${condMap[cond]}` : '';
  const mlSearchUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=${limit}${condParam}`;

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  function errorResponse(msg) {
    return new Response(JSON.stringify({ results: [], paging: { total: 0 }, error: msg }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Diagnóstico: por qué "no encontramos publicaciones" puede significar cosas
  // muy distintas (sin token, token rechazado, ML bloqueando el pedido, o de
  // verdad 0 resultados). En vez de adivinar a ciegas de nuevo, esto queda
  // en la respuesta para poder leerlo directo desde comparador.html.
  const debug = { hasAppId: false, hasAppSecret: false, tokenAttempted: false, tokenOk: null, tokenStatus: null, tokenErrorBody: null, mlStatus: null, mlErrorBody: null };

  try {
    let accessToken = null;

    // Si hay credenciales de app, obtener App Token via client_credentials
    const appId = Deno.env.get('ML_APP_ID');
    const appSecret = Deno.env.get('ML_SECRET');
    debug.hasAppId = !!appId;
    debug.hasAppSecret = !!appSecret;

    if (appId && appSecret) {
      debug.tokenAttempted = true;
      const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: `grant_type=client_credentials&client_id=${appId}&client_secret=${appSecret}`,
      });
      debug.tokenStatus = tokenRes.status;
      debug.tokenOk = tokenRes.ok;
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        accessToken = tokenData.access_token;
      } else {
        debug.tokenErrorBody = (await tokenRes.text()).slice(0, 300);
      }
    }

    // Llamar al API de búsqueda
    const searchHeaders = {
      'Accept': 'application/json',
      'Accept-Language': 'es-AR,es;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    if (accessToken) {
      searchHeaders['Authorization'] = `Bearer ${accessToken}`;
    } else {
      // Sin token: intentar como request público con headers de browser
      searchHeaders['Referer'] = 'https://www.mercadolibre.com.ar/';
      searchHeaders['Origin'] = 'https://www.mercadolibre.com.ar';
    }

    const res = await fetch(mlSearchUrl, { headers: searchHeaders });
    debug.mlStatus = res.status;
    if (!res.ok) {
      debug.mlErrorBody = (await res.text()).slice(0, 500);
      throw new Error(`ML API ${res.status}`);
    }

    const data = await res.json();
    data._debug = debug;
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });

  } catch (e) {
    return errorResponse(e.message + ' | debug=' + JSON.stringify(debug));
  }
}

export const config = { path: '/api/ml-search' };
