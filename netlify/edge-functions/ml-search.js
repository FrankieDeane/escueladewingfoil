export default async function handler(request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'wingfoil';
  const limit = url.searchParams.get('limit') || '50';

  const mlUrl = `https://api.mercadolibre.com/sites/MLA/search?q=${encodeURIComponent(query)}&limit=${limit}`;

  try {
    const res = await fetch(mlUrl, {
      headers: { 'Accept': 'application/json' },
    });
    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=21600',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ results: [], paging: { total: 0 } }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

export const config = { path: '/api/ml-search' };
