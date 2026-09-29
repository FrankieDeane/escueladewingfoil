// Pruebas del normalizador del buscador de equipos: node scripts/test-normalizer.mjs
// Corre assets/equipo-normalizer.js (script de navegador) en un contexto vm y
// verifica casos reales de ml-data.json + avisos de la comunidad.
import { readFileSync } from 'fs';
import vm from 'vm';
import assert from 'assert/strict';

const ctx = { globalThis: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../assets/equipo-normalizer.js', import.meta.url), 'utf8'), ctx);
const N = ctx.EquipoNormalizer;
const now = new Date('2026-09-29T12:00:00Z');

const ml = JSON.parse(readFileSync(new URL('../ml-data.json', import.meta.url), 'utf8'));
const items = N.dedupe(N.fromMercadoLibre(ml, now));
const byId = Object.fromEntries(items.map((p) => [p.id, p]));
const get = (id) => byId['ml:' + id];

let fails = 0;
function check(name, fn) {
  try { fn(); } catch (e) { fails++; console.error('✗ ' + name + '\n  ' + e.message); }
}

// Categorías
const cats = { 1: 'ala', 2: 'ala', 3: 'tabla', 12: 'kit', 13: 'foil', 15: 'accesorio', 19: 'accesorio', 22: 'accesorio',
  24: 'kit', 26: 'tabla', 35: 'ala', 36: 'ala', 42: 'ala', 45: 'accesorio', 47: 'kit', 48: 'tabla' };
for (const [id, c] of Object.entries(cats)) check('categoria ' + id, () => assert.equal(get(id).categoria, c, get(id).titulo));

check('marca/modelo/año Cabrinha Swift', () => {
  const p = get(5);
  assert.equal(p.marca, 'Cabrinha'); assert.equal(p.modelo, 'Swift'); assert.equal(p.anio, 2024); assert.ok(p.oferta);
});
check('modelo Mantis + tamaño 4,5', () => {
  const p = get(35);
  assert.equal(p.modelo, 'Mantis V2 Window'); assert.equal(p.tamano.valor, 4.5); assert.equal(p.tamano.unidad, 'm²');
});
check('tabla 140 L + nivel estimado', () => {
  const p = get(3);
  assert.equal(p.tamano.valor, 140); assert.equal(p.nivel.valor, 'Principiante'); assert.equal(p.nivel.estimado, true);
});
check('Duotone Sky Free 135 L 2026', () => {
  const p = get(14);
  assert.equal(p.marca, 'Duotone'); assert.equal(p.anio, 2026); assert.equal(p.tamano.valor, 135); assert.match(p.modelo, /^Sky Free/);
});
check('Jaws 5/6/7 m', () => assert.equal(get(42).tamano.texto, '5 / 6 / 7 m²'));
check('Aztron talle suelto 5.0', () => assert.equal(get(2).tamano.valor, 5));
check('carbono', () => assert.deepEqual([...get(10).materiales], ['Carbono']));

// Nada inventado: ML sin datos de cuotas/vendedor/estado/stock queda desconocido.
check('sin datos inventados', () => {
  for (const p of items) {
    assert.equal(p.cuotas.estado, 'desconocido');
    assert.equal(p.vendedor, null);
    assert.equal(p.disponibilidad, null);
    assert.equal(p.ubicacion, null);
    assert.equal(p.precio.moneda, 'ARS');
    assert.equal(p.actualizado, ml.actualizado);
  }
});
check('ningún tamaño absurdo', () => {
  for (const p of items) if (p.tamano) assert.ok(p.tamano.valor > 0 && p.tamano.valor < 5000, p.titulo);
});

// Cuotas explícitas del scraper
check('cuotas', () => {
  assert.equal(N.parseCuotas(undefined).estado, 'desconocido');
  assert.equal(N.parseCuotas(false).estado, 'no');
  assert.equal(N.parseCuotas([]).estado, 'no');
  const c = N.parseCuotas({ cantidad: 6, valor: 150000, sinInteres: true });
  assert.equal(c.estado, 'si'); assert.equal(c.cantidad, 6); assert.equal(c.sinInteres, true);
});

// Precios en texto libre
check('precios', () => {
  assert.deepEqual({ ...N.parsePrecio('850.000') }, { valor: 850000, moneda: 'ARS' });
  assert.deepEqual({ ...N.parsePrecio('USD 900') }, { valor: 900, moneda: 'USD' });
  assert.deepEqual({ ...N.parsePrecio('u$s 1.200') }, { valor: 1200, moneda: 'USD' });
  assert.deepEqual({ ...N.parsePrecio('$ 1.200.000,50') }, { valor: 1200000.5, moneda: 'ARS' });
  assert.deepEqual({ ...N.parsePrecio('850 mil') }, { valor: 850000, moneda: 'ARS' });
  assert.equal(N.parsePrecio('consultar'), null);
  assert.equal(N.parsePrecio(0), null);
});

// Sinónimos de categoría
check('sinónimos', () => {
  assert.equal(N.normCategoria('wing'), 'ala');
  assert.equal(N.normCategoria('🪂 Ala / Wing'), 'ala');
  assert.equal(N.normCategoria('🦈 Plano delantero'), 'plano');
  assert.equal(N.normCategoria('🦈 Foil completo'), 'foil');
  assert.equal(N.normCategoria('📦 Kit completo'), 'kit');
  assert.equal(N.normCategoria('🦈 Mástil'), 'mastil');
  assert.equal(N.normCategoria('🎒 Accesorios'), 'accesorio');
  assert.equal(N.normCategoria('Boards'), 'tabla');
  assert.equal(N.normCategoria('🪁 Kite'), 'otro');
});

// Comunidad
check('comunidad', () => {
  const com = N.fromComunidad([
    { id: 1, tipo: '🪂 Ala / Wing', marca: 'Duotone Echo 5m 2023', precio: 'USD 900', ubicacion: 'San Isidro',
      descripcion: 'Muy buen estado, poco uso.', whatsapp: '+54 11 5555-6666', ts: '2026-09-20T10:00:00Z' },
  ], now);
  const p = com[0];
  assert.equal(p.categoria, 'ala'); assert.equal(p.marca, 'Duotone'); assert.equal(p.modelo, 'Echo');
  assert.equal(p.anio, 2023); assert.equal(p.tamano.valor, 5); assert.equal(p.precio.moneda, 'USD');
  assert.equal(p.condicion, 'usado'); assert.equal(p.link, 'https://wa.me/541155556666');
  assert.equal(p.actualizado, '2026-09-20T10:00:00.000Z'); assert.equal(p.cuotas.estado, 'desconocido');
});

// Duplicados
check('duplicados', () => {
  const a = { titulo: 'Tabla Wingfoil Duotone Sky Free 2026 120lts', precio: 100, link: 'https://x.com/a?utm=1' };
  const d = N.dedupe(N.fromMercadoLibre({ productos: [
    { id: 1, ...a }, { id: 2, ...a, link: 'https://x.com/a' },                 // mismo link
    { id: 3, ...a, link: 'https://x.com/b' },                                   // mismo título y precio
    { id: 4, ...a, precio: 90, link: 'https://x.com/c' },                       // mismo producto, otro precio
  ] }, now));
  assert.equal(d.length, 2);
  assert.equal(d[0].grupo, 2); assert.equal(d[1].mejorPrecioGrupo, true); assert.equal(d[0].mejorPrecioGrupo, false);
});

check('links inválidos', () => {
  const d = N.fromMercadoLibre({ productos: [
    { id: 1, titulo: 'Casco', precio: 10, link: 'javascript:alert(1)' },
    { id: 2, titulo: 'Casco ION', precio: 10, link: 'https://x.com/y', estadoEnlace: 404 },
  ] }, now);
  assert.equal(d[0].link, null); assert.equal(d[0].linkRoto, true); assert.equal(d[1].linkRoto, true);
});

check('precio bajo vs mediana', () => {
  const med = N.marcarPrecioBajo(items, null);
  assert.ok(med.tabla > 0);
  for (const p of items) if (p.precioBajo) assert.ok(p.precioARS <= med[p.categoria] * 0.75);
});

if (process.argv.includes('--dump')) {
  for (const p of items) console.log([p.id, p.categoria, p.subtipo, p.marca, p.modelo, p.anio, p.tamano && p.tamano.texto, p.nivel && p.nivel.valor, p.resumen].join(' | '));
}
console.log(fails ? `\n${fails} prueba(s) fallaron` : `OK — ${items.length} productos normalizados`);
process.exit(fails ? 1 : 0);
