// ML Search Edge Function — usa App Token (client credentials) si están configuradas las env vars
// Si no hay credenciales, intenta la llamada pública con headers de browser

export default async function handler(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'wing foil';
  const limit = url.searchParams.get('limit') || '48';
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

  try {
    let accessToken = null;

    // Si hay credenciales de app, obtener App Token via client_credentials
    const appId = Deno.env.get('ML_APP_ID');
    const appSecret = Deno.env.get('ML_SECRET');

    if (appId && appSecret) {
      const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: `grant_type=client_credentials&client_id=${appId}&client_secret=${appSecret}`,
      });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        accessToken = tokenData.access_token;
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
    if (!res.ok) throw new Error(`ML API ${res.status}`);

    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200, headers: corsHeaders });

  } catch (e) {
    return errorResponse(e.message);
  }
}

export const config = { path: '/api/ml-search' };
