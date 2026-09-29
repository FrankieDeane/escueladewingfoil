// Pruebas del parser del scraper de ML: node scripts/test-ml-parse.mjs
// Sin conexión: funciones puras + extracción del DOM sobre una tarjeta de
// ejemplo con el markup del listado de ML (si hay Playwright disponible).
import assert from 'assert/strict';
import { parseMoney, parseCuotas, parseSeller, itemIdFromUrl, cleanUrl, isWingfoil, cardToProduct, mergeProducts } from './ml-parse.mjs';

let fails = 0;
const check = async (name, fn) => { try { await fn(); } catch (e) { fails++; console.error('✗ ' + name + '\n  ' + e.message); } };

await check('parseMoney', () => {
  assert.equal(parseMoney('1.015.987'), 1015987);
  assert.equal(parseMoney('1.234', '50'), 1234.5);
  assert.equal(parseMoney(''), null);
});
await check('parseCuotas', () => {
  assert.deepEqual(parseCuotas('Mismo precio en 6 cuotas de $ 44.550'), { cantidad: 6, valor: 44550, sinInteres: true });
  assert.deepEqual(parseCuotas('en 12 cuotas de $ 17.990'), { cantidad: 12, valor: 17990, sinInteres: false });
  assert.deepEqual(parseCuotas('6 cuotas sin interés de $ 1.234,50'), { cantidad: 6, valor: 1234.5, sinInteres: true });
  assert.equal(parseCuotas(''), undefined);          // sin dato ≠ "no ofrece cuotas"
  assert.equal(parseCuotas('Envío gratis'), undefined);
});
await check('parseSeller', () => {
  assert.equal(parseSeller('Por Hardwind'), 'Hardwind');
  assert.equal(parseSeller('Vendido por Kitestore'), 'Kitestore');
  assert.equal(parseSeller('Tienda oficial Duotone'), 'Duotone');
  assert.equal(parseSeller(''), null);
});
await check('ids y links', () => {
  assert.equal(itemIdFromUrl('https://articulo.mercadolibre.com.ar/MLA-2572823874-vela-rrd-_JM#pos=1'), 'MLA2572823874');
  assert.equal(itemIdFromUrl('https://www.mercadolibre.com.ar/x/p/MLA46874476?pdp_filters=1'), 'MLA46874476');
  assert.equal(itemIdFromUrl('https://www.mercadolibre.com.ar/x/up/MLAU4193586697'), 'MLAU4193586697');
  assert.equal(cleanUrl('https://articulo.mercadolibre.com.ar/MLA-1-x_JM?tracking=1#pos=3'), 'https://articulo.mercadolibre.com.ar/MLA-1-x_JM');
  assert.equal(cleanUrl('https://evil.com/MLA-1'), null);
  assert.equal(cleanUrl('javascript:alert(1)'), null);
});
await check('isWingfoil', () => {
  assert.ok(isWingfoil('Tabla Wingfoil Shakka 140l'));
  assert.ok(isWingfoil('Mástil Carbono 85cm'));
  assert.ok(!isWingfoil('Barra Kitesurf Duotone Click Bar'));
});
await check('cardToProduct', () => {
  const p = cardToProduct({
    title: ' Tabla Wingfoil Duotone Sky Free 2026 - 120lts ', href: 'https://articulo.mercadolibre.com.ar/MLA-123456789-tabla-_JM#pos=2',
    priceFraction: '4.115.259', priceSymbol: '$', prevFraction: '4.600.000', installments: 'Mismo precio en 6 cuotas de $ 685.876',
    shipping: 'Envío gratis', seller: 'Por Kitestore', img: 'https://http2.mlstatic.com/D_Q_NP_1.webp',
  }, { condicion: 'nuevo', fecha: '2026-09-29T09:00:00.000Z' });
  assert.equal(p.id, 'MLA123456789'); assert.equal(p.titulo, 'Tabla Wingfoil Duotone Sky Free 2026 - 120lts');
  assert.equal(p.precio, 4115259); assert.equal(p.precioOriginal, 4600000); assert.equal(p.moneda, 'ARS');
  assert.equal(p.cuotas.cantidad, 6); assert.equal(p.cuotas.sinInteres, true); assert.equal(p.envioGratis, true);
  assert.equal(p.vendedor, 'Kitestore'); assert.equal(p.condicion, 'nuevo'); assert.equal(p.link, 'https://articulo.mercadolibre.com.ar/MLA-123456789-tabla-_JM');
  // Sin cuotas/vendedor en la tarjeta → los campos no existen (no se inventan).
  const q = cardToProduct({ title: 'Ala Wing 5m', href: 'https://articulo.mercadolibre.com.ar/MLA-999999-a', priceFraction: '900.000', priceSymbol: 'US$' }, { condicion: 'usado', fecha: 'x' });
  assert.equal(q.moneda, 'USD'); assert.ok(!('cuotas' in q)); assert.ok(!('vendedor' in q)); assert.ok(!('precioOriginal' in q));
  assert.equal(cardToProduct({ title: 'Sin precio', href: 'https://articulo.mercadolibre.com.ar/MLA-1' }, {}), null);
});
await check('mergeProducts', () => {
  const a = { id: 'MLA1', titulo: 'x', condicion: null };
  const m = mergeProducts([[a], [{ ...a, condicion: 'usado' }], [{ id: 'MLA2' }]]);
  assert.equal(m.length, 2); assert.equal(m[0].condicion, 'usado');
});

// Extracción del DOM con el markup "poly-card" del listado de ML.
let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('(playwright no instalado: se saltea la prueba del DOM)'); }
if (chromium) await check('extractCards (DOM)', async () => {
  const { extractCards } = await import('./scrape-ml.mjs');
  const opts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
  const b = await chromium.launch(opts);
  const page = await b.newPage();
  await page.setContent(`<ol><li class="ui-search-layout__item"><div class="poly-card">
    <img class="poly-component__picture" src="data:image/gif;base64,R0" data-src="https://http2.mlstatic.com/D_1.webp">
    <h3 class="poly-component__title-wrapper"><a class="poly-component__title" href="https://articulo.mercadolibre.com.ar/MLA-111111-tabla-_JM#pos=1">Tabla Wingfoil Cabrinha Code 2025</a></h3>
    <div class="poly-component__seller">Por Hardwind</div>
    <div class="poly-price__current"><s class="andes-money-amount andes-money-amount--previous"><span class="andes-money-amount__currency-symbol">$</span><span class="andes-money-amount__fraction">3.500.000</span></s>
      <span class="andes-money-amount"><span class="andes-money-amount__currency-symbol">$</span><span class="andes-money-amount__fraction">3.125.918</span></span></div>
    <span class="poly-price__installments">Mismo precio en 6 cuotas de <span class="andes-money-amount"><span class="andes-money-amount__currency-symbol">$</span><span class="andes-money-amount__fraction">520.986</span></span></span>
    <div class="poly-component__shipping">Envío gratis</div></div></li>
    <li class="ui-search-layout__item"><div class="poly-card"><a class="poly-component__title" href="https://articulo.mercadolibre.com.ar/MLA-222222-ala">Ala Wing Jaws 5m</a>
    <div class="poly-price__current"><span class="andes-money-amount"><span class="andes-money-amount__currency-symbol">$</span><span class="andes-money-amount__fraction">450.000</span></span></div></div></li></ol>`);
  const raw = await page.evaluate(extractCards);
  await b.close();
  assert.equal(raw.length, 2);
  const p = cardToProduct(raw[0], { condicion: 'nuevo', fecha: 'x' });
  assert.equal(p.precio, 3125918); assert.equal(p.precioOriginal, 3500000); assert.equal(p.cuotas.valor, 520986);
  assert.equal(p.vendedor, 'Hardwind'); assert.equal(p.envioGratis, true); assert.equal(p.imagen, 'https://http2.mlstatic.com/D_1.webp');
  const q = cardToProduct(raw[1], { condicion: 'usado', fecha: 'x' });
  assert.equal(q.precio, 450000); assert.ok(!('cuotas' in q)); assert.equal(q.imagen, null);
});

console.log(fails ? `\n${fails} prueba(s) fallaron` : 'OK — parser de Mercado Libre');
process.exit(fails ? 1 : 0);
