// ml-page-parse.mjs — lee el HTML de una publicación de Mercado Libre
// (artículo /MLA-…, catálogo /p/MLA… o /up/MLAU…) y devuelve los datos que
// usa el dashboard de equipos. Todo lo que no aparece en la página queda en
// null: no se inventan datos.
//
// Lo usa netlify/functions/ml-dashboard.js y se prueba con
// scripts/test-ml-page-parse.mjs.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s)
    .replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// "1.234.567" / "1234567" / "1.234.567,50" → 1234567.5
function pesos(s) {
  if (s == null) return null;
  const t = String(s).replace(/[^\d.,]/g, '');
  if (!t) return null;
  const n = /,\d{1,2}$/.test(t) ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t.replace(/[.,]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "+100 vendidos" → 100, "+5 mil vendidos" → 5000
function vendidos(html) {
  const m = /\+?\s*(\d+(?:[.,]\d+)?)\s*(mil)?\s*vendid[oa]s/i.exec(html);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  return Math.round(m[2] ? n * 1000 : n);
}

function jsonLdProducto(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      const list = Array.isArray(data) ? data : data['@graph'] || [data];
      const p = list.find((x) => x && /Product/i.test(x['@type']));
      if (p) return p;
    } catch { /* bloque roto: seguir con el próximo */ }
  }
  return null;
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = re.exec(html);
  return m ? decode(m[1]) : null;
}

export function mlId(url) {
  const m = /\b(MLAU?)-?(\d{6,})/i.exec(String(url));
  return m ? (m[1].toUpperCase() + m[2]) : null;
}

// ¿Es la página de verificación anti-bots de ML en lugar del producto?
export function esBloqueo(html, finalUrl = '') {
  return /account-verification|suspicious-traffic/i.test(finalUrl) || /suspicious-traffic-frontend/.test(html.slice(0, 2000));
}

export function parseProducto(html, url) {
  const ld = jsonLdProducto(html) || {};
  const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers || {};
  const titulo = decode(ld.name || meta(html, 'og:title') || (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1]?.replace(/<[^>]+>/g, '') || '') || null;

  let precio = pesos(offers.price ?? offers.lowPrice) ?? pesos(meta(html, 'price'));
  if (precio == null) {
    const m = /andes-money-amount__fraction[^>]*>([\d.]+)</.exec(html);
    precio = m ? pesos(m[1]) : null;
  }

  // Precio tachado ("Antes: $ 1.234.567"): el precio de lista sin descuento.
  let precioOriginal = null;
  const prev = /andes-money-amount--previous[^>]*aria-label=["'][^"']*?([\d.]+)\s*pesos/i.exec(html)
    || /aria-label=["']Antes:\s*([\d.]+)\s*pesos/i.exec(html);
  if (prev) precioOriginal = pesos(prev[1]);
  if (precioOriginal != null && precio != null && precioOriginal <= precio) precioOriginal = null;

  // Vendedor: "Vendido por X", tienda oficial o nickname del JSON embebido.
  let vendedor = null;
  const v = /Vendido por\s*(?:<[^>]+>\s*)*([^<]{2,60})</i.exec(html)
    || /Tienda oficial\s*(?:<[^>]+>\s*)*([^<]{2,60})</i.exec(html)
    || /"seller_name"\s*:\s*"([^"]{2,60})"/.exec(html)
    || /"nickname"\s*:\s*"([^"]{2,60})"/.exec(html);
  if (v) vendedor = decode(v[1]);
  const tiendaOficial = /Tienda oficial/i.test(html);

  // Ranking propio de ML: "1º MÁS VENDIDO" / "3º en Tablas de wingfoil".
  let mlPuesto = null;
  let mlRanking = null;
  const r = /(\d{1,3})\s*[º°]\s*(?:<[^>]+>\s*)*en\s*(?:<[^>]+>\s*)*([^<]{3,60})</i.exec(html);
  if (r) { mlPuesto = +r[1]; mlRanking = decode(r[2]); }
  const masVendido = /M[ÁA]S VENDIDO/i.test(html);
  if (mlPuesto == null) {
    const r2 = /(\d{1,3})\s*[º°]\s*(?:<[^>]+>\s*)*M[ÁA]S VENDIDO/i.exec(html);
    if (r2) mlPuesto = +r2[1];
  }

  // Catálogo con varios vendedores: "Ver 5 opciones desde $ 1.200.000".
  let opciones = null;
  let precioDesde = null;
  const o = /(\d+)\s*opciones?(?:\s*de compra)?\s*(?:<[^>]+>\s*)*desde\s*(?:<[^>]+>\s*)*\$?\s*(?:<[^>]+>\s*)*([\d.]+)/i.exec(html);
  if (o) { opciones = +o[1]; precioDesde = pesos(o[2]); }

  const condicion = /itemCondition[^"]*"\s*:\s*"[^"]*Used/i.test(html) || /\bUsado\b\s*\|/.test(html) ? 'usado'
    : /NewCondition/i.test(String(offers.itemCondition || '')) || /\bNuevo\b\s*\|/.test(html) ? 'nuevo' : null;

  const marca = ld.brand ? decode(typeof ld.brand === 'string' ? ld.brand : ld.brand.name || '') || null : null;
  const imagen = (Array.isArray(ld.image) ? ld.image[0] : ld.image) || meta(html, 'og:image') || null;

  return {
    id: mlId(url),
    url,
    titulo,
    marca,
    imagen,
    precio,
    precioOriginal,
    precioDesde,
    opciones,
    vendedor,
    tiendaOficial,
    vendidos: vendidos(html),
    mlPuesto,
    mlRanking,
    masVendido,
    condicion,
  };
}
