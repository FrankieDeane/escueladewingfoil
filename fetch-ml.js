// fetch-ml.js — scraper con Playwright (Chrome real, no detectable como bot)
// Corre en GitHub Actions cada hora y guarda ml-data.json

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const MARCAS = ['duotone','naish','f-one','north','core','armstrong','slingshot','cabrinha','flysurfer','ozone','starboard','fanatic'];

const URLS = [
  'https://listado.mercadolibre.com.ar/deportes-fitness/wingfoil_OrderId_PRICE_NoIndex_True',
  'https://listado.mercadolibre.com.ar/deportes-fitness/wingfoil_Desde_51_NoIndex_True',
  'https://listado.mercadolibre.com.ar/deportes-fitness/wingfoil_Desde_101_NoIndex_True',
];

function detectCategoria(titulo) {
  const t = titulo.toLowerCase();
  if (/kit|combo|completo/.test(t)) return 'kit';
  if (/\bwing\b|\bala\b/.test(t) && !/tabla|foil|mástil|mastil|fuselaje|plano/.test(t)) return 'wing';
  if (/tabla/.test(t)) return 'tabla';
  if (/foil|mástil|mastil|fuselaje|plano|estabilizador/.test(t)) return 'foil';
  return 'otro';
}

function detectMarca(titulo) {
  const t = titulo.toLowerCase();
  for (const m of MARCAS) {
    if (t.includes(m)) return m;
  }
  return '';
}

async function scrapePage(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-AR,es;q=0.9' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(2500);

    const items = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.ui-search-layout__item, .andes-card');
      cards.forEach(card => {
        const linkEl = card.querySelector('a[href*="MLA"]');
        const titleEl = card.querySelector('.ui-search-item__title, .poly-component__title');
        const priceInt = card.querySelector('.andes-money-amount__fraction');
        const currencyEl = card.querySelector('.andes-money-amount__currency-symbol');
        const imgEl = card.querySelector('img');
        const locationEl = card.querySelector('.ui-search-item__location, .poly-component__location');
        const condEl = card.querySelector('.ui-search-item__highlight-label__title, .poly-component__condition');

        if (!linkEl || !titleEl) return;

        const href = linkEl.href || '';
        const titulo = titleEl.textContent?.trim() || '';
        const rawPrice = (priceInt?.textContent || '0').replace(/\./g, '').replace(',', '.');
        const precio = parseFloat(rawPrice) || 0;
        const sym = currencyEl?.textContent?.trim() || '';
        const moneda = (sym === 'U$S' || sym === 'USD' || sym === 'US$') ? 'USD' : 'ARS';
        const imagen = imgEl?.src || imgEl?.getAttribute('data-src') || '';
        const ubicacion = locationEl?.textContent?.trim() || '';
        const condicion = (condEl?.textContent || '').toLowerCase().includes('nuevo') ? 'nuevo' : 'usado';
        const idMatch = href.match(/(MLA-?\d+)/);
        const id = idMatch ? idMatch[1].replace('-', '') : href;

        if (titulo && href) results.push({ id, titulo, precio, moneda, condicion, imagen, url: href, ubicacion });
      });
      return results;
    });

    console.log(`  ✓ ${items.length} items en ${url}`);
    return items;
  } catch (e) {
    console.error(`  ✗ Error en ${url}: ${e.message}`);
    return [];
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('🌐 Iniciando Chrome para scrapear Mercado Libre Argentina...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const seenIds = new Set();
  const allItems = [];

  for (const url of URLS) {
    console.log(`→ ${url}`);
    const items = await scrapePage(browser, url);
    for (const item of items) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allItems.push(item);
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  await browser.close();

  const productos = allItems.map(item => ({
    id: item.id,
    titulo: item.titulo,
    precio: item.precio,
    moneda: item.moneda,
    condicion: item.condicion,
    categoria: detectCategoria(item.titulo),
    marca: detectMarca(item.titulo),
    ubicacion: item.ubicacion,
    imagen: item.imagen,
    url: item.url,
    fecha: new Date().toISOString().split('T')[0],
  }));

  productos.sort((a, b) => (a.precio || 0) - (b.precio || 0));

  const output = { actualizado: new Date().toISOString(), total: productos.length, productos };
  writeFileSync('ml-data.json', JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n💾 Listo: ${productos.length} publicaciones guardadas en ml-data.json`);
}

main();
