// ml-parse.mjs — funciones puras que convierten el texto crudo de cada
// tarjeta del listado de mercadolibre.com.ar en un producto de ml-data.json.
// Las usa scripts/scrape-ml.mjs; están separadas para poder testearlas sin
// conexión (scripts/test-ml-parse.mjs).

// "1.015.987" / "44.550" + centavos opcionales → número.
export function parseMoney(fraction, cents) {
  const f = String(fraction || '').replace(/[^\d]/g, '');
  if (!f) return null;
  const c = String(cents || '').replace(/[^\d]/g, '').slice(0, 2);
  const v = parseFloat(f + (c ? '.' + c : ''));
  return v > 0 ? v : null;
}

// Moneda del símbolo que ML muestra junto al precio ("$", "US$", "U$S").
export function parseCurrency(symbol) {
  return /US|U\$S|USD/i.test(String(symbol || '')) ? 'USD' : 'ARS';
}

// Texto de cuotas del listado, p. ej.:
//   "Mismo precio en 6 cuotas de $ 44.550"      → 6 sin interés
//   "en 12 cuotas de $ 17.990"                   → 12 (con interés)
//   "6 cuotas sin interés de $ 44.550"           → 6 sin interés
//   "Mismo precio en 3 cuotas de $ 1.234,50"     → valor con centavos
// Sin texto de cuotas NO se asume que el vendedor no financia (ML no lo
// informa en el listado): se devuelve undefined → "No especificado".
export function parseCuotas(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  const m = /(\d{1,2})\s*cuotas?/i.exec(t);
  if (!m) return undefined;
  const cantidad = parseInt(m[1], 10);
  const vm = /\$\s*([\d.]+)(?:,(\d{1,2}))?/.exec(t.slice(m.index));
  return {
    cantidad,
    valor: vm ? parseMoney(vm[1], vm[2]) : null,
    sinInteres: /mismo precio|sin inter[eé]s/i.test(t),
  };
}

// "Por Hardwind" / "Vendido por Kitestore" / "Tienda oficial Duotone".
export function parseSeller(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const s = t.replace(/^(vendido\s+)?por\s+/i, '').replace(/^tienda oficial\s+/i, '').trim();
  return s ? s.slice(0, 80) : null;
}

// ID de publicación a partir del link: MLA-123456789, MLA123456789,
// /p/MLA46874476 (catálogo) o /up/MLAU4193586697.
export function itemIdFromUrl(url) {
  const m = /\b(MLAU?)-?(\d{6,})/i.exec(String(url || ''));
  return m ? (m[1].toUpperCase() + m[2]) : null;
}

// Link limpio: sin tracking ni fragmentos, así el mismo producto encontrado
// por dos búsquedas distintas se reconoce como uno solo.
export function cleanUrl(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)mercadolibre\.com\.ar$/.test(u.hostname)) return null;
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch {
    return null;
  }
}

// El buscador de ML mezcla kitesurf, SUP y surf: sólo se guarda lo que es
// de wingfoil / foil.
const WING_RE = /wing|foil|hidroala|hydrofoil|m[aá]stil|fuselaje|estabilizador/i;
export function isWingfoil(title) {
  return WING_RE.test(String(title || ''));
}

// Tarjeta cruda (lo que devuelve page.evaluate) → producto de ml-data.json.
export function cardToProduct(raw, { condicion, fecha }) {
  const titulo = String(raw.title || '').replace(/\s+/g, ' ').trim();
  const link = cleanUrl(raw.href);
  const precio = parseMoney(raw.priceFraction, raw.priceCents);
  if (!titulo || !link || !precio) return null;
  const p = {
    id: itemIdFromUrl(raw.href) || link,
    titulo,
    precio,
    moneda: parseCurrency(raw.priceSymbol),
    link,
    imagen: /^https:\/\//.test(raw.img || '') ? raw.img : null,
    condicion: condicion || null,
    disponible: true, // estaba publicado y activo en el listado al momento del scraping
    fecha,
  };
  const original = parseMoney(raw.prevFraction, raw.prevCents);
  if (original && original > precio) p.precioOriginal = original;
  const cuotas = parseCuotas(raw.installments);
  if (cuotas) p.cuotas = cuotas;
  if (/env[ií]o gratis/i.test(raw.shipping || '')) p.envioGratis = true;
  const vendedor = parseSeller(raw.seller);
  if (vendedor) p.vendedor = vendedor;
  if (raw.location) p.ubicacion = String(raw.location).trim().slice(0, 80);
  return p;
}

// Une resultados de varias búsquedas: misma publicación → una sola entrada.
// Si en una búsqueda apareció como "nuevo" y en otra sin condición, gana el
// dato con condición.
export function mergeProducts(lists) {
  const byId = new Map();
  for (const p of lists.flat()) {
    if (!p) continue;
    const prev = byId.get(p.id);
    if (!prev) byId.set(p.id, p);
    else if (!prev.condicion && p.condicion) byId.set(p.id, { ...prev, condicion: p.condicion });
  }
  return [...byId.values()];
}
