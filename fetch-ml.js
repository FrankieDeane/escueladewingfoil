// fetch-ml.js
// Busca publicaciones de wingfoil en Mercado Libre Argentina y guarda ml-data.json
// Se ejecuta automáticamente cada 6 horas via GitHub Actions

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

const LIMIT = 50; // resultados por query

async function fetchQuery(query) {
  const url = `https://api.mercadolibre.com/sites/${SITE}/search?q=${encodeURIComponent(query)}&limit=${LIMIT}&condition=used,new`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.error(`Error en query "${query}":`, e.message);
    return [];
  }
}

async function main() {
  console.log('🔍 Buscando publicaciones de wingfoil en Mercado Libre Argentina...');

  const allResults = [];
  const seenIds = new Set();

  for (const query of QUERIES) {
    console.log(`  → "${query}"`);
    const results = await fetchQuery(query);
    for (const item of results) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        allResults.push(item);
      }
    }
    // Pausa para no sobrecargar la API
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`✅ ${allResults.length} publicaciones únicas encontradas`);

  // Procesar y limpiar los datos
  const productos = allResults.map(item => {
    // Detectar categoría según el título
    const titulo = (item.title || '').toLowerCase();
    let categoria = 'otro';
    if (/\bwing\b|\bala\b/.test(titulo) && !/tabla|foil|mástil|mastil|fuselaje|plano/.test(titulo)) {
      categoria = 'wing';
    } else if (/tabla/.test(titulo)) {
      categoria = 'tabla';
    } else if (/foil|mástil|mastil|fuselaje|plano|estabilizador/.test(titulo)) {
      categoria = 'foil';
    } else if (/kit|combo|completo/.test(titulo)) {
      categoria = 'kit';
    }

    // Detectar marca
    const MARCAS = ['duotone','naish','f-one','north','core','armstrong','slingshot','cabrinha','flysurfer','ozone','code','starboard','fanatic'];
    let marca = '';
    for (const m of MARCAS) {
      if (titulo.includes(m)) { marca = m; break; }
    }
    if (!marca) {
      // Intentar sacar de atributos
      const attrMarca = (item.attributes || []).find(a => a.id === 'BRAND');
      if (attrMarca) marca = (attrMarca.value_name || '').toLowerCase();
    }

    // Moneda y precio
    const moneda = item.currency_id === 'USD' ? 'USD' : 'ARS';
    const precio = item.price || 0;

    // Ubicación
    const ubicacion = item.seller_address
      ? [item.seller_address.city?.name, item.seller_address.state?.name].filter(Boolean).join(', ')
      : '';

    return {
      id: item.id,
      titulo: item.title,
      precio,
      moneda,
      condicion: item.condition === 'new' ? 'nuevo' : 'usado',
      categoria,
      marca,
      ubicacion,
      imagen: item.thumbnail ? item.thumbnail.replace(/\-I\.jpg$/, '-O.jpg') : '',
      url: item.permalink,
      fecha: item.date_created ? item.date_created.split('T')[0] : '',
    };
  });

  // Ordenar: más recientes primero
  productos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  const output = {
    actualizado: new Date().toISOString(),
    total: productos.length,
    productos,
  };

  writeFileSync('ml-data.json', JSON.stringify(output, null, 2), 'utf8');
  console.log(`💾 ml-data.json guardado con ${productos.length} productos`);
}

main();
