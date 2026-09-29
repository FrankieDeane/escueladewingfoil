// scrape-ml.mjs — scraper del listado público de mercadolibre.com.ar para el
// buscador de equipos. Corre en GitHub Actions (.github/workflows/scrape-ml.yml)
// una vez por día y reescribe ml-data.json.
//
// Por qué scraping y no la API: /sites/MLA/search de la API oficial responde
// 403 incluso con un App Token válido (se probó en netlify/edge-functions/
// ml-search.js, ver historial). El listado web es público.
//
// Uso:  node scripts/scrape-ml.mjs [--out ml-data.json] [--debug-dir scrape-debug]
// Requiere playwright (el workflow lo instala; no es dependencia del sitio).
//
// Si ML bloquea el pedido (captcha / verificación) o trae menos de
// MIN_PRODUCTS productos, NO escribe nada y sale con código 1: el sitio
// sigue mostrando los últimos datos buenos y la corrida queda en rojo.

import { writeFileSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';
import { cardToProduct, isWingfoil, mergeProducts } from './ml-parse.mjs';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const OUT = arg('--out', 'ml-data.json');
const DEBUG_DIR = arg('--debug-dir', 'scrape-debug');

const QUERIES = ['wingfoil', 'wing foil', 'tabla wingfoil', 'ala wing foil', 'foil wing mastil', 'hydrofoil wing'];
// Filtro de condición del listado de ML: así "nuevo"/"usado" es dato de ML,
// no una suposición a partir del título.
const CONDICIONES = { nuevo: '2230284', usado: '2230581' };
const MAX_PAGES = 2;
const MIN_PRODUCTS = 15;

const slug = (q) => q.trim().toLowerCase().replace(/\s+/g, '-');
const listUrl = (q, condId) => `https://listado.mercadolibre.com.ar/${slug(q)}_ITEM*CONDITION_${condId}_NoIndex_True`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 2500 + Math.floor(Math.random() * 3000);

// Corre dentro de la página: devuelve el texto crudo de cada tarjeta.
// Varios selectores por campo porque ML alterna entre el diseño "poly-card"
// y el viejo "ui-search-result".
export function extractCards() {
  const q = (el, sels) => { for (const s of sels) { const n = el.querySelector(s); if (n) return n; } return null; };
  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  const money = (n) => n ? {
    fraction: txt(n.querySelector('.andes-money-amount__fraction')),
    cents: txt(n.querySelector('.andes-money-amount__cents')),
    symbol: txt(n.querySelector('.andes-money-amount__currency-symbol')),
  } : {};
  let cards = [...document.querySelectorAll('li.ui-search-layout__item')];
  if (!cards.length) cards = [...document.querySelectorAll('.poly-card, .ui-search-result__wrapper')];
  return cards.map((c) => {
    const a = q(c, ['a.poly-component__title', '.poly-component__title a', '.poly-component__title-wrapper a', 'a.ui-search-item__group__element', 'a.ui-search-link']);
    const titleEl = q(c, ['.poly-component__title', '.ui-search-item__title']) || a;
    const installments = q(c, ['.poly-price__installments', '.ui-search-installments', '.poly-component__installments']);
    // Precio actual: el primero que no sea el tachado ni esté dentro de las cuotas.
    const current = q(c, ['.poly-price__current .andes-money-amount:not(.andes-money-amount--previous)', '.ui-search-price__second-line .andes-money-amount:not(.andes-money-amount--previous)'])
      || [...c.querySelectorAll('.andes-money-amount')].find((m) => !m.matches('.andes-money-amount--previous') && !m.closest('s') && !(installments && installments.contains(m)));
    const prev = q(c, ['s.andes-money-amount--previous', '.andes-money-amount--previous']);
    const img = q(c, ['img.poly-component__picture', 'img.ui-search-result-image__element', 'img']);
    const src = img ? [img.getAttribute('src'), img.getAttribute('data-src')].find((s) => s && /^https:/.test(s)) : '';
    const cur = money(current), pv = money(prev);
    return {
      title: txt(titleEl),
      href: a ? a.href : '',
      priceFraction: cur.fraction, priceCents: cur.cents, priceSymbol: cur.symbol,
      prevFraction: pv.fraction, prevCents: pv.cents,
      installments: txt(installments),
      shipping: txt(q(c, ['.poly-component__shipping', '.ui-search-item__shipping'])),
      seller: txt(q(c, ['.poly-component__seller', '.ui-search-official-store-label'])),
      location: txt(q(c, ['.poly-component__location', '.ui-search-item__location'])),
      img: src || '',
    };
  });
}

function isBlocked(page, title) {
  return /account-verification|captcha|login|security/i.test(page.url()) || /hubo un error|verific|robot/i.test(title || '');
}

async function scrapeList(page, url, condicion, fecha, log) {
  const out = [];
  let next = url;
  for (let n = 0; n < MAX_PAGES && next; n++) {
    await page.goto(next, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('li.ui-search-layout__item, .poly-card, .ui-search-rescue, .ui-search-search-result', { timeout: 15000 }).catch(() => {});
    // Baja la página para que carguen las imágenes lazy.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 900) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } });
    const title = await page.title();
    if (isBlocked(page, title)) {
      log.blocked.push(next);
      await dumpDebug(page, 'blocked');
      return out;
    }
    const raw = await page.evaluate(extractCards);
    const prods = raw.map((r) => cardToProduct(r, { condicion, fecha })).filter((p) => p && isWingfoil(p.titulo));
    log.pages.push({ url: next, cards: raw.length, kept: prods.length });
    if (!raw.length) await dumpDebug(page, 'empty');
    out.push(...prods);
    next = await page.evaluate(() => {
      const a = document.querySelector('li.andes-pagination__button--next a, a.andes-pagination__link[title="Siguiente"]');
      return a ? a.href : null;
    });
    if (next) await sleep(jitter());
  }
  return out;
}

let debugN = 0;
async function dumpDebug(page, tag) {
  try {
    mkdirSync(DEBUG_DIR, { recursive: true });
    const base = `${DEBUG_DIR}/${String(++debugN).padStart(2, '0')}-${tag}`;
    await page.screenshot({ path: base + '.png', fullPage: false });
    writeFileSync(base + '.html', await page.content());
  } catch { /* el debug nunca rompe el scraping */ }
}

async function main() {
  const { chromium } = await import('playwright');
  const fecha = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    extraHTTPHeaders: { 'Accept-Language': 'es-AR,es;q=0.9' },
  });
  const page = await context.newPage();
  const log = { pages: [], blocked: [], errors: [] };
  const lists = [];
  for (const q of QUERIES) {
    for (const [condicion, id] of Object.entries(CONDICIONES)) {
      try {
        lists.push(await scrapeList(page, listUrl(q, id), condicion, fecha, log));
      } catch (e) {
        log.errors.push(`${q} (${condicion}): ${e.message}`);
        await dumpDebug(page, 'error');
      }
      await sleep(jitter());
    }
  }
  await browser.close();

  const productos = mergeProducts(lists);
  console.log(JSON.stringify(log, null, 2));
  console.log(`Productos únicos: ${productos.length}`);

  if (productos.length < MIN_PRODUCTS) {
    console.error(`✗ Sólo ${productos.length} productos (mínimo ${MIN_PRODUCTS}). ${log.blocked.length ? 'ML bloqueó ' + log.blocked.length + ' pedido(s). ' : ''}No se toca ${OUT}.`);
    process.exit(1);
  }

  const data = {
    actualizado: fecha,
    fuente: 'https://listado.mercadolibre.com.ar',
    busquedas: QUERIES,
    total: productos.length,
    productos,
  };
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
  console.log(`✓ ${OUT}: ${productos.length} productos`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
