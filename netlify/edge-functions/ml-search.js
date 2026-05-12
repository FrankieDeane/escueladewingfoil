export default async function handler(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'wing foil';
  const limit = url.searchParams.get('limit') || '48';
  const cond = url.searchParams.get('cond') || '';

  // ML Argentina condition numeric IDs
  const condMap = { new: '2230284', used: '2230581' };
  const condParam = cond && condMap[cond] ? `&ITEM_CONDITION=${condMap[cond]}` : '';

  const mlUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=${limit}${condParam}`;

  try {
    const res = await fetch(mlUrl);
    if (!res.ok) throw new Error(`ML API ${res.status}`);
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ results: [], paging: { total: 0 }, error: e.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export const config = { path: '/api/ml-search' };
