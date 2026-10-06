// Prueba del parser de publicaciones de ML (scripts/ml-page-parse.mjs) con
// HTML armado a mano a partir de la estructura de las páginas de ML.
import assert from 'node:assert/strict';
import { parseProducto, esBloqueo, mlId } from './ml-page-parse.mjs';

const html = `<html><head>
<meta property="og:title" content="Tabla Wingfoil Duotone Sky Free 2026 - 120lts">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Tabla De Wingfoil Duotone Sky Free 2026 - 120lts","brand":{"@type":"Brand","name":"Duotone"},"image":"https://http2.mlstatic.com/x.webp","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.7","reviewCount":"23"},"review":[{"@type":"Review","reviewBody":"Excelente tabla, muy estable para aprender.","reviewRating":{"ratingValue":5}},{"@type":"Review","reviewBody":"ok"}],"offers":{"@type":"Offer","price":4115259,"priceCurrency":"ARS","itemCondition":"https://schema.org/NewCondition"}}</script>
</head><body>
<span class="ui-pdp-subtitle">Nuevo  |  +50 vendidos</span>
<a class="ui-pdp-promotions-pill-label">3º <span>en</span> Tablas de wingfoil</a>
<s class="andes-money-amount andes-money-amount--previous" aria-label="Antes: 4572510 pesos"><span class="andes-money-amount__fraction">4.572.510</span></s>
<span class="andes-money-amount__fraction">4.115.259</span>
<p>Vendido por <a href="#">KITEWINGSHOP</a></p>
<a>Ver 4 opciones de compra desde <span>$</span><span>3.990.000</span></a>
</body></html>`;

const p = parseProducto(html, 'https://www.mercadolibre.com.ar/tabla/p/MLA12345678');
assert.equal(p.id, 'MLA12345678');
assert.equal(p.titulo, 'Tabla De Wingfoil Duotone Sky Free 2026 - 120lts');
assert.equal(p.marca, 'Duotone');
assert.equal(p.precio, 4115259);
assert.equal(p.precioOriginal, 4572510);
assert.equal(p.vendidos, 50);
assert.equal(p.mlPuesto, 3);
assert.equal(p.mlRanking, 'Tablas de wingfoil');
assert.equal(p.vendedor, 'KITEWINGSHOP');
assert.equal(p.opciones, 4);
assert.equal(p.precioDesde, 3990000);
assert.equal(p.condicion, 'nuevo');
assert.equal(p.opiniones.estrellas, 4.7);
assert.equal(p.opiniones.cantidad, 23);
assert.deepEqual(p.opiniones.comentarios, [{ texto: 'Excelente tabla, muy estable para aprender.', estrellas: 5 }]);
const html2 = '<p class="ui-review-capability-comments__comment__content">Llegó rápido, <b>muy</b> buena calidad</p>';
assert.deepEqual(parseProducto(html2, 'https://x/MLA123456').opiniones.comentarios, [{ texto: 'Llegó rápido, muy buena calidad', estrellas: null }]);

const vacio = parseProducto('<html><h1>Casco</h1><p>+5 mil vendidos</p></html>', 'https://articulo.mercadolibre.com.ar/MLA-999999-casco-_JM');
assert.equal(vacio.id, 'MLA999999');
assert.equal(vacio.titulo, 'Casco');
assert.equal(vacio.precio, null);
assert.equal(vacio.vendidos, 5000);
assert.equal(vacio.vendedor, null);
assert.equal(vacio.opiniones, null);

assert.equal(esBloqueo('<html data-assets-prefix="https://http2.mlstatic.com/frontend-assets/suspicious-traffic-frontend/">'), true);
assert.equal(esBloqueo(html, 'https://www.mercadolibre.com.ar/x'), false);
assert.equal(mlId('https://www.mercadolibre.com.ar/x/up/MLAU4193586697'), 'MLAU4193586697');
console.log('ml-page-parse: OK');
