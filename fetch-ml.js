// fetch-ml.js — scraper Playwright para GPX Store (Shopify) y Hardwind (WooCommerce)
// Corre en GitHub Actions cada 2 horas, guarda store-data.json

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const MARCAS = ['duotone','naish','f-one','north','core','armstrong','slingshot','cabrinha','flysurfer','ozone','starboard','fanatic','liquid force','manera','rrd','nobile','manera'];

function detectCategoria(titulo) {
  const t = titulo.toLowerCase();
  if (/kit|combo|completo|set\b/.test(t)) return 'kit';
  if (/\bwing\b|\bala\b/.test(t) && !/tabla|foil|mástil|mastil|fuselaje|plano|board/.test(t)) return 'wing';
  if (/tabla|board/.test(t) && !/foil/.test(t)) return 'tabla';
  if (/foil|mástil|mastil|fuselaje|plano|estabilizador|hydrofoil/.test(t)) return 'foil';
  return 'otro';
}

function detectMarca(titulo) {
  const t = titulo.toLowerCase();
  for (const m of MARCAS) if (t.includes(m)) return m;
  return '';
}

// Precio mínimo plausible para equipo de wingfoil (ARS). Cualquier cosa por
// debajo es casi seguro un error de parseo, no un producto real — se descarta
// en vez de publicarse (ver uso en main()).
const MIN_PRICE = 1000;

function cleanPrice(str) {
  if (!str) return 0;
  // Algunos sitios meten el precio y la cuota ("3 cuotas sin interés de
  // $305.465") en el mismo bloque de texto; si se toma todo el textContent
  // junto, los dígitos de ambos números quedan pegados. Por eso primero se
  // busca el PRIMER monto bien formado (con separador de miles) y se ignora
  // cualquier dígito que venga después — así no se contamina el precio real
  // con la cuota. Si no hay ningún monto así, se cae al string completo
  // (formato viejo: $1.200.000 / 1200000 / 1.200,50).
  const withThousands = str.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?/);
  const bareDigits = str.match(/\d{4,}(?:,\d{1,2})?/);
  const s = (withThousands?.[0] || bareDigits?.[0] || str).replace(/[^\d.,]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot) {
    // comma is decimal separator: 1.200,50 → 1200.50
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot === -1) {
    // sin separadores: 1200000
    normalized = s;
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) {
    // solo puntos, todos de a 3 dígitos exactos → son miles, no decimales
    // (una moneda real nunca muestra 3 dígitos decimales): 916.395 → 916395
    normalized = s.replace(/\./g, '');
  } else {
    // un solo punto decimal (1200.50) o miles con coma (1,200.50)
    normalized = s.replace(/,/g, '');
  }
  return parseFloat(normalized) || 0;
}

// ── GPX Store (Shopify) ────────────────────────────────────────────────────
async function scrapeGPX(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'es-AR',
  });
  const page = await context.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
    await page.goto('https://gpxstore.com/outlet', { waitUntil: 'domcontentloaded', timeout: 50000 });
    await page.waitForTimeout(4000);

    const items = await page.evaluate(() => {
      const results = [];
      // Shopify Dawn/Debut theme card selectors
      const CARD_SELS = [
        'li.grid__item',
        '.product-card',
        '[data-product-card]',
        '[class*="product-card"]',
        '.grid-product',
        '.collection-grid__item',
      ];
      let cards = [];
      for (const s of CARD_SELS) {
        const found = [...document.querySelectorAll(s)];
        if (found.length >= 2) { cards = found; break; }
      }

      cards.forEach(card => {
        // Title: Shopify Dawn uses .card__heading a or .card__heading h3
        const titleEl = card.querySelector(
          '.card__heading a, .card__heading h3, .card__heading, ' +
          '[class*="card__title"], [class*="card-title"], ' +
          '[class*="product-title"], [class*="product_title"], ' +
          '[class*="title"] a, h2 a, h3 a, h2, h3'
        );
        if (!titleEl) return;
        const titulo = titleEl.textContent.trim();
        if (!titulo || titulo.length < 3) return;

        // Price: Shopify uses .price__regular .price-item or span.money
        const priceEl = card.querySelector(
          '.price-item--sale, .price-item--regular, span.money, ' +
          '.price__sale, .price__regular, [class*="price-item"], ' +
          '[class*="price"]:not([class*="compare"]):not([class*="was"]):not(del)'
        );

        // Link
        const linkEl = card.querySelector(
          'a.full-unstyled-link, a[href*="/products/"], a.card__heading, a[href]'
        );
        const href = linkEl
          ? (linkEl.href.startsWith('http') ? linkEl.href : 'https://gpxstore.com' + linkEl.getAttribute('href'))
          : '';
        if (!href) return;

        // Image: lazy-loaded in Shopify
        const imgEl = card.querySelector('img');
        const img = imgEl?.src && !imgEl.src.includes('cdn.shopify.com/s/files/1/0') ? imgEl.src
          : imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy-src') || imgEl?.src || '';

        results.push({ titulo, priceText: priceEl?.textContent?.trim() || '', href, img });
      });
      return results;
    });

    console.log(`  ✓ GPX Store: ${items.length} productos`);
    return items.map(i => ({
      id: 'gpx-' + i.href.split('/products/').pop().split('?')[0].replace(/\//g,''),
      titulo: i.titulo,
      precio: cleanPrice(i.priceText),
      moneda: 'ARS',
      condicion: 'nuevo',
      categoria: detectCategoria(i.titulo),
      marca: detectMarca(i.titulo),
      imagen: i.img,
      url: i.href,
      fuente: 'GPX Store',
      fecha: new Date().toISOString().split('T')[0],
    }));
  } catch(e) {
    console.error(`  ✗ GPX Store: ${e.message}`);
    return [];
  } finally {
    await context.close();
  }
}

// ── Hardwind Argentina (WooCommerce) ──────────────────────────────────────
async function scrapeHardwind(browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'es-AR',
  });
  const page = await context.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
    await page.goto('https://hardwind.com/wing/', { waitUntil: 'domcontentloaded', timeout: 50000 });
    await page.waitForTimeout(4000);

    const items = await page.evaluate(() => {
      const results = [];
      // WooCommerce standard selectors
      const CARD_SELS = [
        'li.product.type-product',
        'li.product',
        'ul.products li',
        '.woocommerce-loop-product',
        '[class*="product-item"]',
        '.product-card',
      ];
      let cards = [];
      for (const s of CARD_SELS) {
        const found = [...document.querySelectorAll(s)];
        if (found.length >= 2) { cards = found; break; }
      }

      cards.forEach(card => {
        // WooCommerce title
        const titleEl = card.querySelector(
          'h2.woocommerce-loop-product__title, .woocommerce-loop-product__title, ' +
          '[class*="product__title"], [class*="product-title"], h2, h3'
        );
        if (!titleEl) return;
        const titulo = titleEl.textContent.trim();
        if (!titulo || titulo.length < 3) return;

        // WooCommerce price: prefer sale price (ins), fallback to regular
        const salePriceEl   = card.querySelector('.price ins .woocommerce-Price-amount, .price ins .amount, .price ins bdi');
        const regularPriceEl = card.querySelector('.price .woocommerce-Price-amount, .price .amount, .price bdi');
        const priceEl = salePriceEl || regularPriceEl;

        // Link
        const linkEl = card.querySelector('a.woocommerce-LoopProduct-link, a[href]');
        const href = linkEl
          ? (linkEl.href.startsWith('http') ? linkEl.href : 'https://hardwind.com' + linkEl.getAttribute('href'))
          : '';
        if (!href) return;

        // Image
        const imgEl = card.querySelector('img.attachment-woocommerce_thumbnail, img[data-src], img');
        const img = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy-src') || imgEl?.src || '';

        results.push({ titulo, priceText: priceEl?.textContent?.trim() || '', href, img });
      });
      return results;
    });

    console.log(`  ✓ Hardwind: ${items.length} productos`);
    return items.map(i => ({
      id: 'hw-' + i.href.split('/').filter(Boolean).pop(),
      titulo: i.titulo,
      precio: cleanPrice(i.priceText),
      moneda: 'ARS',
      condicion: 'nuevo',
      categoria: detectCategoria(i.titulo),
      marca: detectMarca(i.titulo),
      imagen: i.img,
      url: i.href,
      fuente: 'Hardwind',
      fecha: new Date().toISOString().split('T')[0],
    }));
  } catch(e) {
    console.error(`  ✗ Hardwind: ${e.message}`);
    return [];
  } finally {
    await context.close();
  }
}

// ── Genérico multi-plataforma (Tiendanube / Shopify / WooCommerce) ────────
// Usado por tiendas cuya plataforma no está confirmada: prueba varias URLs
// candidatas (categoría/búsqueda) y varios sets de selectores hasta encontrar
// al menos 2 productos. Pensado para validar y ajustar mirando los logs del
// primer run real en GitHub Actions (acá no hay salida a internet para probar).
const STOREFRONT_CARD_SELS = [
  // Tiendanube
  '.js-item-product', '.product-item', 'article.product-item',
  // Shopify
  'li.grid__item', '.product-card', '[data-product-card]', '.grid-product', '.collection-grid__item',
  // WooCommerce
  'li.product.type-product', 'li.product', 'ul.products li', '.woocommerce-loop-product',
  // genérico
  '[class*="product-item"]', '[class*="product-card"]',
];
const STOREFRONT_TITLE_SELS =
  '.js-item-name, .product-item__name, ' +
  '.card__heading a, .card__heading, [class*="card__title"], [class*="product-title"], [class*="product_title"], ' +
  'h2.woocommerce-loop-product__title, .woocommerce-loop-product__title, ' +
  '[class*="title"] a, h2 a, h3 a, h2, h3';
const STOREFRONT_PRICE_SELS =
  '.js-item-price ins, .js-item-price, [class*="price"] ins, ' +
  '.price-item--sale, .price-item--regular, span.money, .price__sale, .price__regular, [class*="price-item"], ' +
  '.price ins .woocommerce-Price-amount, .price ins .amount, .price ins bdi, ' +
  '.price .woocommerce-Price-amount, .price .amount, .price bdi, ' +
  '[class*="price"]:not([class*="compare"]):not([class*="was"]):not(del)';
const STOREFRONT_IMG_SELS = 'img[data-src], img[data-lazy-src], img[srcset], img';

async function scrapeStorefront(browser, { source, idPrefix, baseUrl, candidateUrls }) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'es-AR',
  });
  const page = await context.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });

    let items = [];
    let usedUrl = '';
    for (const url of candidateUrls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(3500);
      } catch {
        continue; // URL candidata no existe/no responde — probar la siguiente
      }

      const found = await page.evaluate(({ CARD_SELS, TITLE_SELS, PRICE_SELS, IMG_SELS }) => {
        let cards = [];
        for (const s of CARD_SELS) {
          const found = [...document.querySelectorAll(s)];
          if (found.length >= 2) { cards = found; break; }
        }
        const results = [];
        cards.forEach(card => {
          const titleEl = card.querySelector(TITLE_SELS);
          if (!titleEl) return;
          const titulo = titleEl.textContent.trim();
          if (!titulo || titulo.length < 3) return;

          const priceEl = card.querySelector(PRICE_SELS);
          const linkEl = card.querySelector('a[href]');
          const href = linkEl ? linkEl.href : '';
          if (!href) return;

          const imgEl = card.querySelector(IMG_SELS);
          const img = imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy-src') || imgEl?.src || '';

          results.push({ titulo, priceText: priceEl?.textContent?.trim() || '', href, img });
        });
        return results;
      }, { CARD_SELS: STOREFRONT_CARD_SELS, TITLE_SELS: STOREFRONT_TITLE_SELS, PRICE_SELS: STOREFRONT_PRICE_SELS, IMG_SELS: STOREFRONT_IMG_SELS });

      if (found.length >= 2) { items = found; usedUrl = url; break; }
    }

    if (!items.length) {
      console.warn(`  ⚠ ${source}: ninguna URL candidata devolvió productos — revisar candidateUrls/selectores`);
      return [];
    }

    console.log(`  ✓ ${source}: ${items.length} productos (via ${usedUrl})`);
    return items.map(i => ({
      id: idPrefix + '-' + (i.href.split('/').filter(Boolean).pop() || '').split('?')[0],
      titulo: i.titulo,
      precio: cleanPrice(i.priceText),
      moneda: 'ARS',
      condicion: 'nuevo',
      categoria: detectCategoria(i.titulo),
      marca: detectMarca(i.titulo),
      imagen: i.img,
      url: i.href,
      fuente: source,
      fecha: new Date().toISOString().split('T')[0],
    }));
  } catch (e) {
    console.error(`  ✗ ${source}: ${e.message}`);
    return [];
  } finally {
    await context.close();
  }
}

// ── Kitestore Argentina (plataforma no confirmada) ─────────────────────────
function scrapeKitestore(browser) {
  return scrapeStorefront(browser, {
    source: 'Kitestore',
    idPrefix: 'kts',
    baseUrl: 'https://kitestore.com.ar',
    candidateUrls: [
      'https://kitestore.com.ar/search?q=wing+foil&type=product',
      'https://kitestore.com.ar/catalogo?q=wing',
      'https://kitestore.com.ar/collections/wingfoil',
      'https://kitestore.com.ar/collections/wing-foil',
      'https://kitestore.com.ar/?s=wing+foil&post_type=product',
    ],
  });
}

// ── Santa Tabla (plataforma no confirmada) ──────────────────────────────────
function scrapeSantaTabla(browser) {
  return scrapeStorefront(browser, {
    source: 'Santa Tabla',
    idPrefix: 'stb',
    baseUrl: 'https://santatabla.com',
    candidateUrls: [
      'https://santatabla.com/search?q=wing+foil&type=product',
      'https://santatabla.com/catalogo?q=wing',
      'https://santatabla.com/collections/wingfoil',
      'https://santatabla.com/collections/wing-foil',
      'https://santatabla.com/?s=wing+foil&post_type=product',
    ],
  });
}

// ── Facebook Marketplace (requiere cookies de sesión) ─────────────────────
async function scrapeFacebook(browser) {
  const rawCookies = process.env.FB_COOKIES;
  if (!rawCookies) {
    console.log('  ⚠  FB_COOKIES no configurado — salteando Facebook Marketplace');
    return [];
  }

  let cookies;
  try {
    cookies = JSON.parse(rawCookies);
  } catch(e) {
    console.error('  ✗ FB_COOKIES no es JSON válido:', e.message);
    return [];
  }

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'es-AR',
  });

  try {
    // Inyectar cookies de sesión
    await context.addCookies(cookies);
    const page = await context.newPage();

    await page.goto(
      'https://www.facebook.com/marketplace/106073429424644/search/?query=wingfoil',
      { waitUntil: 'domcontentloaded', timeout: 50000 }
    );
    await page.waitForTimeout(5000);

    const items = await page.evaluate(() => {
      const results = [];
      // Facebook Marketplace usa divs con roles y aria-labels
      const cards = document.querySelectorAll(
        '[aria-label="Collection of Marketplace items"] > div, ' +
        '[data-testid="marketplace_feed_item"], ' +
        'div[class*="x9f619"] a[href*="/marketplace/item/"]'
      );

      cards.forEach(card => {
        const linkEl = card.tagName === 'A'
          ? card
          : card.querySelector('a[href*="/marketplace/item/"]');
        if (!linkEl) return;

        const href = linkEl.href.startsWith('http')
          ? linkEl.href
          : 'https://www.facebook.com' + linkEl.getAttribute('href');

        // Título: primer span o div con texto visible
        const spans = card.querySelectorAll('span[dir], span');
        let titulo = '', priceText = '';
        spans.forEach(s => {
          const t = s.textContent.trim();
          if (!t || t.length < 3) return;
          if (/^\$/.test(t) || /^\d/.test(t)) { if (!priceText) priceText = t; }
          else if (!titulo && t.length > 4) titulo = t;
        });

        const imgEl = card.querySelector('img');
        const img = imgEl?.src || '';

        if (titulo && href) results.push({ titulo, priceText, href, img });
      });
      return results;
    });

    console.log(`  ✓ Facebook Marketplace: ${items.length} publicaciones`);
    return items.map(i => ({
      id: 'fb-' + (i.href.match(/\/item\/(\d+)/) || ['','0'])[1],
      titulo: i.titulo,
      precio: cleanPrice(i.priceText),
      moneda: 'ARS',
      condicion: 'usado',
      categoria: detectCategoria(i.titulo),
      marca: detectMarca(i.titulo),
      imagen: i.img,
      url: i.href,
      fuente: 'Facebook Marketplace',
      fecha: new Date().toISOString().split('T')[0],
    }));
  } catch(e) {
    console.error(`  ✗ Facebook Marketplace: ${e.message}`);
    return [];
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('🌐 Scrapeando tiendas de wingfoil con Chrome...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled'],
  });

  let gpxItems = [], hwItems = [], ktsItems = [], stbItems = [], fbItems = [];
  try {
    [gpxItems, hwItems, ktsItems, stbItems, fbItems] = await Promise.all([
      scrapeGPX(browser),
      scrapeHardwind(browser),
      scrapeKitestore(browser),
      scrapeSantaTabla(browser),
      scrapeFacebook(browser),
    ]);
  } finally {
    await browser.close();
  }

  const seenIds = new Set();
  const productos = [];
  let descartadosPorPrecio = 0;
  for (const item of [...gpxItems, ...hwItems, ...ktsItems, ...stbItems, ...fbItems]) {
    if (!item.titulo || seenIds.has(item.id)) continue;
    // Precio imposible (0, NaN, o por debajo del piso plausible) → casi
    // seguro un error de parseo (ver cleanPrice). Mejor no publicarlo que
    // mostrarle a alguien un "ahorro" inventado.
    if (!item.precio || item.precio < MIN_PRICE) { descartadosPorPrecio++; continue; }
    seenIds.add(item.id);
    productos.push(item);
  }

  productos.sort((a, b) => (a.precio || 0) - (b.precio || 0));

  const output = { actualizado: new Date().toISOString(), total: productos.length, productos };
  writeFileSync('store-data.json', JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n💾 Guardados: ${productos.length} productos en store-data.json`);
  console.log(`   GPX: ${gpxItems.length} | Hardwind: ${hwItems.length} | Kitestore: ${ktsItems.length} | Santa Tabla: ${stbItems.length} | Facebook: ${fbItems.length}`);
  if (descartadosPorPrecio > 0) {
    console.warn(`⚠️  ${descartadosPorPrecio} producto(s) descartados por precio inválido (< $${MIN_PRICE} o no numérico)`);
  }
  if (productos.length === 0) {
    console.warn('⚠️  0 productos — revisar selectores o estructura de las páginas');
    process.exit(1);
  }
}

main();
