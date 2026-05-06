// fetch-ml.js
// Busca publicaciones activas de wingfoil en Mercado Libre Argentina.
// Las publicaciones vendidas o cerradas no aparecen en la búsqueda de ML,
// por lo que cada ejecución refleja solo el stock disponible en ese momento.
// Se ejecuta automáticamente cada 6 horas via GitHub Actions.

import fetch from 'node-fetch';
import { writeFileSync } from 'fs';

const SITE = 'MLA'; // Argentina
const QUERIES = [
  'wingfoil',
  'wing foil',
  'foil wing',
  'ala wingfoil',
  'tabla wingfoil',
  'foil wingfoil',
  'mástil wingfoil',
  'wingfoil duotone',
  'wingfoil naish',
  'wingfoil f-one',
  'wingfoil north',
  'wingfoil core',
];

const LIMIT = 50; // resultados por query (máx ML: 50)
const MARCAS = ['duotone','naish','f-one','north','core','armstrong','slingshot','cabrinha','flysurfer','ozone','code','starboard','fanatic'];

async function fetchQuery(query, offset = 0) {
  const url = `https://api.mercadolibre.com/sites/${SITE}/search?q=${encodeURIComponent(query)}&limit=${LIMIT}&offset=${offset}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
    if (!res.ok) {
      console.warn(`  ⚠️  HTTP ${res.status} en query "${query}" offset=${offset}`);
      return { results: [], total: 0 };
    }
    const data = await res.json();
    return { results: data.results || [], total: data.paging?.total || 0 };
  } catch (e) {
    console.error(`  ✗ Error en query "${query}":`, e.message);
    return { results: [], total: 0 };
  }
}

function detectCategoria(titulo) {
  const t = titulo.toLowerCase();
  if (/kit|combo|completo/.test(t)) return 'kit';
  if (/\bwing\b|\bala\b/.test(t) && !/tabla|foil|mástil|mastil|fuselaje|plano/.test(t)) return 'wing';
  if (/tabla/.test(t)) return 'tabla';
  if (/foil|mástil|mastil|fuselaje|plano|estabilizador/.test(t)) return 'foil';
  return 'otro';
}

function detectMarca(titulo, attributes) {
  const t = titulo.toLowerCase();
  for (const m of MARCAS) {
    if (t.includes(m)) return m;
  }
  const attrMarca = (attributes || []).find(a => a.id === 'BRAND');
  return attrMarca ? (attrMarca.value_name || '').toLowerCase() : '';
}

function mapItem(item) {
  const titulo = item.title || '';
  const moneda = item.currency_id === 'USD' ? 'USD' : 'ARS';
  const ubicacion = item.seller_address
    ? [item.seller_address.city?.name, item.seller_address.state?.name].filter(Boolean).join(', ')
    : '';

  return {
    id: item.id,
    titulo,
    precio: item.price || 0,
    moneda,
    condicion: item.condition === 'new' ? 'nuevo' : 'usado',
    categoria: detectCategoria(titulo),
    marca: detectMarca(titulo, item.attributes),
    ubicacion,
    imagen: item.thumbnail ? item.thumbnail.replace(/\-I\.jpg$/, '-O.jpg') : '',
    url: item.permalink,
    fecha: item.date_created ? item.date_created.split('T')[0] : '',
    vendedor_id: item.seller?.id || '',
    ventas_completadas: item.sold_quantity || 0,
  };
}

async function main() {
  console.log('🔍 Buscando publicaciones activas de wingfoil en Mercado Libre Argentina...');

  const seenIds = new Set();
  const allResults = [];

  for (const query of QUERIES) {
    console.log(`  → "${query}"`);
    // Primera página
    const { results, total } = await fetchQuery(query, 0);
    for (const item of results) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allResults.push(item);
      }
    }

    // Si hay más de LIMIT resultados, traer segunda página
    if (total > LIMIT) {
      await new Promise(r => setTimeout(r, 300));
      const { results: results2 } = await fetchQuery(query, LIMIT);
      for (const item of results2) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          allResults.push(item);
        }
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`  📦 ${allResults.length} publicaciones únicas encontradas`);

  // Filtrar solo items activos con stock disponible
  // La API de búsqueda de ML ya devuelve solo activos, pero filtramos por si acaso
  const activos = allResults.filter(item =>
    item.available_quantity > 0 &&
    (item.status === 'active' || !item.status)
  );

  console.log(`  ✅ ${activos.length} publicaciones con stock disponible`);

  const productos = activos.map(mapItem);

  // Ordenar: más recientes primero
  productos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const output = {
    actualizado: new Date().toISOString(),
    total: productos.length,
    productos,
  };

  writeFileSync('ml-data.json', JSON.stringify(output, null, 2), 'utf8');
  console.log(`💾 ml-data.json guardado con ${productos.length} productos activos`);
}

main();
