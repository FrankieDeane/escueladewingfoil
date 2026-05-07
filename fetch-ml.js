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

function cleanPrice(str) {
  if (!str) return 0;
  // Handle formats: $1.200.000 / 1200000 / 1.200,50
  const s = str.replace(/[^\d.,]/g, '');
  // If has dots as thousands separator (e.g. 1.200.000 or 1.200,50)
  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot) {
    // comma is decimal separator: 1.200,50 → 1200.50
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    // dot is decimal separator or thousands: 1,200.50 or 1.200.000
    normalized = s.replace(/,/g, '');
  }
  return parseFloat(normalized) || 0;
}

// ── GPX Store (Shopify) ────────────────────────────────────────────────────
async function scrapeGPX(browser) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
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
    await page.close();
  }
}

// ── Hardwind Argentina (WooCommerce) ──────────────────────────────────────
async function scrapeHardwind(browser) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
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
    await page.close();
  }
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

  let gpxItems = [], hwItems = [], fbItems = [];
  try {
    [gpxItems, hwItems, fbItems] = await Promise.all([
      scrapeGPX(browser),
      scrapeHardwind(browser),
      scrapeFacebook(browser),
    ]);
  } finally {
    await browser.close();
  }

  const seenIds = new Set();
  const productos = [];
  for (const item of [...gpxItems, ...hwItems, ...fbItems]) {
    if (item.titulo && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      productos.push(item);
    }
  }

  productos.sort((a, b) => (a.precio || 0) - (b.precio || 0));

  const output = { actualizado: new Date().toISOString(), total: productos.length, productos };
  writeFileSync('store-data.json', JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n💾 Guardados: ${productos.length} productos en store-data.json`);
  console.log(`   GPX: ${gpxItems.length} | Hardwind: ${hwItems.length} | Facebook: ${fbItems.length}`);
  if (productos.length === 0) {
    console.warn('⚠️  0 productos — revisar selectores o estructura de las páginas');
    process.exit(1);
  }
}

main();
