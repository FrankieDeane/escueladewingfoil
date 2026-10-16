// hardwind-parse.mjs — lee una página de categoría de hardwind.com (tienda
// Tiendanube) y devuelve sus productos. Cada producto del listado es un
// <div class="js-item-product …" data-product-id="…"> que trae:
//   - un JSON-LD "Product" con nombre, link, foto y disponibilidad
//   - data-variants con precio, precio anterior y stock de cada variante
// y la página trae además la lista de Google Analytics (googleItems) con la
// categoría de cada producto ("Wings", "Tablas", "Accesorios y repuestos"…).
//
// Lo usa netlify/functions/hardwind.js; se prueba con scripts/test-hardwind-parse.mjs.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const decode = (s) => String(s).replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  }
  return ENT[e.toLowerCase()] ?? m;
});
const limpio = (s) => decode(s || '').replace(/\s+/g, ' ').trim();

function json(texto) {
  try { return JSON.parse(texto); } catch { return null; }
}

// product_id → categoría, desde la lista de Google Analytics de la página
function categorias(html) {
  const out = {};
  const m = /const googleItems = (\[[\s\S]*?\]);\s*\n/.exec(html);
  const items = m ? json(m[1]) : null;
  (items || []).forEach((g) => {
    const id = g?.source?.product_id;
    if (id && !out[id]) out[id] = g.info?.item_category2 || g.info?.item_category || null;
  });
  return out;
}

export function parseCategoria(html) {
  const cats = categorias(html);
  const partes = html.split(/<div class="js-item-product[\s"]/).slice(1);
  const out = [];
  for (const parte of partes) {
    const id = (/data-product-id="(\d+)"/.exec(parte) || [])[1];
    if (!id) continue;
    const ld = json((/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(parte) || [])[1]) || {};
    const variantes = json(decode((/data-variants="([^"]*)"/.exec(parte) || [])[1] || '')) || [];
    const visibles = variantes.filter((v) => v && v.is_visible !== false);
    const conPrecio = visibles.filter((v) => v.price_number > 0);
    const masBarata = conPrecio.sort((a, b) => a.price_number - b.price_number)[0] || null;
    // stock null en Tiendanube = sin límite de stock
    const ilimitado = visibles.some((v) => v.available && v.stock == null);
    const stock = ilimitado ? null : visibles.reduce((t, v) => t + (Number(v.stock) || 0), 0);
    const nombre = limpio(ld.name) || limpio((/title="([^"]+)"/.exec(parte) || [])[1]);
    if (!nombre) continue;
    const url = ld.offers?.url || ld.mainEntityOfPage?.['@id'] || (/href="(https:\/\/hardwind\.com\/productos\/[^"]+)"/.exec(parte) || [])[1] || null;
    out.push({
      id,
      titulo: nombre,
      url,
      imagen: ld.image || null,
      categoria: cats[id] || null,
      precio: masBarata ? masBarata.price_number : null,
      precioAnterior: masBarata && masBarata.compare_at_price_number > masBarata.price_number ? masBarata.compare_at_price_number : null,
      precioTransferencia: masBarata ? precioTexto(masBarata.price_with_payment_discount_short) : null,
      consultar: !masBarata && visibles.some((v) => v.contact),
      stock,
      disponible: visibles.some((v) => v.available) && (stock == null || stock > 0),
      variantes: visibles.length,
    });
  }
  return out;
}

// "$2.150.136,56" → 2150136.56
function precioTexto(s) {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}
