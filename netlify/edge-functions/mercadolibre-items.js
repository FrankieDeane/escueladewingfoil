export default async () => {
  try {
    const res = await fetch('https://api.mercadolibre.com/sites/MLA/search?q=wingfoil');
    const data = await res.json();

    const items = data.results.slice(0, 8).map(item => ({
      id: item.id,
      title: item.title,
      price: item.price,
      permalink: item.permalink,
      thumbnail: item.thumbnail
    }));

    return Response.json({ items });
  } catch (error) {
    return Response.json({ error: 'Error consultando Mercado Libre' }, { status: 500 });
  }
};
