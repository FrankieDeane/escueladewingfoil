// fetch-ml.js — scraper Playwright para tiendas argentinas/españolas de wingfoil
// Corre en GitHub Actions cada 2 horas y guarda store-data.json

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const MARCAS = ['duotone','naish','f-one','north','core','armstrong','slingshot','cabrinha','flysurfer','ozone','starboard','fanatic','liquid force','manera','rrd','nobile'];

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
  for (const m of MARCAS) {
    if (t.includes(m)) return m;
  }
  return '';
}

function cleanPrice(str) {
  if (!str) return 0;
  const m = str.match(/[\d.,]+/);
  if (!m) return 0;
  const s = m[0].replace(/\.(?=\d{3})/g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

async function scrapeGPX(browser) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
    await page.goto('https://gpxstore.com/outlet', { waitUntil: 'domcontentloaded', timeout: 50000 });
    await page.waitForTimeout(3500);

    const items = await page.evaluate(() => {
      const results = [];
      // Shopify / custom — try multiple selector patterns
      const CARD_SELS = [
        '.product-card','li.grid__item','[data-product-card]','[class*="product-card"]',
        '.grid-product','[class*="ProductCard"]','.product-item','[class*="product_card"]',
      ];
      let cards = [];
      for (const s of CARD_SELS) {
        const found = [...document.querySelectorAll(s)];
        if (found.length >= 2) { cards = found; break; }
      }
      cards.forEach(card => {
        const titleEl = card.querySelector('[class*="title"],[class*="name"],h2,h3,h4');
        const priceEl = card.querySelector('[class*="price"]:not([class*="compare"]):not([class*="was"]):not([class*="original"]),.money');
        const linkEl  = card.querySelector('a[href]');
        const imgEl   = card.querySelector('img');
        if (!titleEl) return;
        const titulo = titleEl.textContent.trim();
        if (!titulo || titulo.length < 3) return;
        const href = linkEl ? (linkEl.href.startsWith('http') ? linkEl.href : 'https://gpxstore.com' + linkEl.getAttribute('href')) : '';
        const img = imgEl?.src || imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy-src') || '';
        const priceText = priceEl?.textContent?.trim() || '';
        results.push({ titulo, priceText, href, img });
      });
      return results;
    });

    console.log(`  ✓ GPX Store: ${items.length} productos`);
    return items.filter(i => i.href).map(i => ({
      id: 'gpx-' + (i.href.split('/').filter(Boolean).pop() || Math.random().toString(36).slice(2)),
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

async function scrapeHardwind(browser) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-ES,es;q=0.9' });
    await page.goto('https://hardwind.com/wing/', { waitUntil: 'domcontentloaded', timeout: 50000 });
    await page.waitForTimeout(3500);

    const items = await page.evaluate(() => {
      const results = [];
      // WooCommerce first, then generic
      const CARD_SELS = [
        'li.product','ul.products li','.woocommerce-LoopProduct',
        '[class*="product-item"]','[class*="product_item"]','.product-card',
      ];
      let cards = [];
      for (const s of CARD_SELS) {
        const found = [...document.querySelectorAll(s)];
        if (found.length >= 2) { cards = found; break; }
      }
      cards.forEach(card => {
        const titleEl = card.querySelector('.woocommerce-loop-product__title,[class*="title"],[class*="name"],h2,h3,h4');
        const priceEl = card.querySelector('.woocommerce-Price-amount,.price ins .amount,.price>.amount,[class*="price"]:not(del):not([class*="compare"])');
        const linkEl  = card.querySelector('a[href]');
        const imgEl   = card.querySelector('img');
        if (!titleEl) return;
        const titulo = titleEl.textContent.trim();
        if (!titulo || titulo.length < 3) return;
        const href = linkEl ? (linkEl.href.startsWith('http') ? linkEl.href : 'https://hardwind.com' + linkEl.getAttribute('href')) : '';
        const img = imgEl?.src || imgEl?.getAttribute('data-src') || imgEl?.getAttribute('data-lazy-src') || '';
        const priceText = priceEl?.textContent?.trim() || '';
        results.push({ titulo, priceText, href, img });
      });
      return results;
    });

    console.log(`  ✓ Hardwind: ${items.length} productos`);
    return items.filter(i => i.href).map(i => ({
      id: 'hw-' + (i.href.split('/').filter(Boolean).pop() || Math.random().toString(36).slice(2)),
      titulo: i.titulo,
      precio: cleanPrice(i.priceText),
      moneda: 'EUR',
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

async function main() {
  console.log('🌐 Scrapeando tiendas de wingfoil con Chrome...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
  });

  let gpxItems = [], hwItems = [];
  try {
    [gpxItems, hwItems] = await Promise.all([
      scrapeGPX(browser),
      scrapeHardwind(browser),
    ]);
  } finally {
    await browser.close();
  }

  const seenIds = new Set();
  const productos = [];
  for (const item of [...gpxItems, ...hwItems]) {
    if (!seenIds.has(item.id) && item.titulo) {
      seenIds.add(item.id);
      productos.push(item);
    }
  }

  productos.sort((a, b) => (a.precio || 0) - (b.precio || 0));

  const output = { actualizado: new Date().toISOString(), total: productos.length, productos };
  writeFileSync('store-data.json', JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n💾 Listo: ${productos.length} productos guardados en store-data.json`);
  if (productos.length === 0) console.warn('⚠️  0 productos — verificar selectores de las tiendas');
}

main();
