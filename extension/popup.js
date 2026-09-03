// popup.js — arma la comparación de precios al abrir la extensión.
// Lee el producto de la pestaña activa (vía content.js) y lo cruza contra
// store-data.json, publicado por escueladewingfoil.com.ar y actualizado
// cada 6h por GitHub Actions (fetch-ml.js). No hace scraping en vivo.

const SITE = 'https://www.escueladewingfoil.com.ar';
const STORE_DATA_URL = `${SITE}/store-data.json`;
const STORES_ORDER = ['Hardwind', 'Kitestore'];
const MATCH_THRESHOLD = 0.32;

// Mantener en sync con MARCAS/detectCategoria en fetch-ml.js y comparador.html
const MARCAS = ['duotone', 'naish', 'f-one', 'north', 'core', 'armstrong', 'slingshot', 'cabrinha', 'flysurfer', 'ozone', 'starboard', 'fanatic', 'liquid force', 'manera', 'rrd', 'nobile'];
const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'un', 'una', 'nuevo', 'nueva', 'y', 'en', 'del']);

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenize(str) {
  return normalize(str).split(' ').filter(t => t.length >= 2 && !STOPWORDS.has(t));
}
function categoriaDe(titulo) {
  const t = normalize(titulo);
  if (/kit|combo|completo|set\b/.test(t)) return 'kit';
  if (/\bwing\b|\bala\b/.test(t) && !/tabla|foil|mastil|fuselaje|plano|board/.test(t)) return 'wing';
  if (/tabla|board/.test(t) && !/foil/.test(t)) return 'tabla';
  if (/foil|mastil|fuselaje|plano|estabilizador|hydrofoil/.test(t)) return 'foil';
  return 'otro';
}
function score(tokensA, tokensB) {
  const setA = new Set(tokensA), setB = new Set(tokensB);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = new Set([...setA, ...setB]).size || 1;
  let s = inter / union;
  const brandA = MARCAS.find(m => tokensA.includes(m));
  if (brandA && tokensB.includes(brandA)) s += 0.15;
  return s;
}
function bestMatch(mlTitulo, productos, fuente) {
  const mlTokens = tokenize(mlTitulo);
  const mlCat = categoriaDe(mlTitulo);
  let best = null, bestScore = 0;
  for (const p of productos) {
    if (p.fuente !== fuente || !p.precio) continue;
    if (p.categoria && mlCat !== 'otro' && p.categoria !== mlCat) continue;
    const s = score(mlTokens, tokenize(p.titulo));
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}

function fmtPrice(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}
function fmtHoursAgo(iso) {
  const h = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  if (h < 1) return 'Actualizado hace instantes';
  if (h === 1) return 'Actualizado hace 1 h';
  if (h < 48) return `Actualizado hace ${h} h`;
  return `Actualizado hace ${Math.round(h / 24)} días`;
}

function showState(id) {
  for (const s of ['stateEmpty', 'stateLoading', 'stateError']) {
    document.getElementById(s).hidden = s !== id;
  }
  document.getElementById('result').hidden = true;
}

async function getActiveProduct() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.url.startsWith('https://www.mercadolibre.com.ar/')) return { tab, product: null, offSite: true };

  const ask = () => new Promise(resolve => {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT' }, resp => {
      if (chrome.runtime.lastError) resolve(undefined); // sin content script inyectado todavía
      else resolve(resp);
    });
  });

  let product = await ask();
  if (product === undefined) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      product = await ask();
    } catch {
      product = null;
    }
  }
  return { tab, product: product || null, offSite: false };
}

function renderRows(mlProduct, productos) {
  const rowsEl = document.getElementById('rows');
  rowsEl.innerHTML = '';

  const matches = STORES_ORDER.map(fuente => ({ fuente, item: bestMatch(mlProduct.titulo, productos, fuente) }));
  const found = matches.filter(m => m.item);
  const cheapestFound = found.reduce((min, m) => (!min || m.item.precio < min.item.precio ? m : min), null);

  const combined = [
    ...found.map(m => ({ kind: 'store', fuente: m.fuente, precio: m.item.precio, url: m.item.url })),
    { kind: 'ml', fuente: 'Mercado Libre', precio: mlProduct.precio, url: mlProduct.url },
  ].sort((a, b) => a.precio - b.precio);

  for (const row of combined) {
    const delta = ((row.precio - mlProduct.precio) / mlProduct.precio) * 100;
    const isBest = row.kind === 'store' && cheapestFound && row.fuente === cheapestFound.fuente;
    const div = document.createElement('div');
    div.className = 'prow' + (isBest ? ' best' : '') + (row.kind === 'ml' ? ' current' : '');
    const deltaHtml = row.kind === 'ml'
      ? '<span class="delta delta-flat">— referencia</span>'
      : `<span class="delta ${delta < 0 ? 'delta-good' : delta > 0 ? 'delta-bad' : 'delta-flat'}">${delta < 0 ? '▾' : delta > 0 ? '▴' : '—'} ${Math.abs(delta).toFixed(1)}% vs ML</span>`;
    div.innerHTML = `
      <div class="prow__store"><b>${row.fuente}${isBest ? '<span class="pill-best">Más barata</span>' : ''}</b>
        <small>${row.kind === 'ml' ? 'estás viendo esta publicación' : new URL(row.url).hostname.replace('www.', '')}</small></div>
      <div><div class="price">${fmtPrice(row.precio)}</div>${deltaHtml}</div>`;
    div.style.cursor = 'pointer';
    div.addEventListener('click', () => chrome.tabs.create({ url: row.url }));
    rowsEl.appendChild(div);
  }
  for (const m of matches.filter(m => !m.item)) {
    const div = document.createElement('div');
    div.className = 'prow';
    div.innerHTML = `<div class="prow__store"><b style="color:var(--text-muted)">${m.fuente}</b></div><div class="na">no encontrado</div>`;
    rowsEl.appendChild(div);
  }

  const savingsEl = document.getElementById('savings');
  if (cheapestFound && cheapestFound.item.precio < mlProduct.precio) {
    const ahorro = mlProduct.precio - cheapestFound.item.precio;
    const pct = (ahorro / mlProduct.precio) * 100;
    document.getElementById('savingsTitle').textContent = `Ahorrás ${fmtPrice(ahorro)}`;
    document.getElementById('savingsSub').textContent = `comprando en ${cheapestFound.fuente} en vez de Mercado Libre (-${pct.toFixed(1)}%)`;
    savingsEl.hidden = false;
  } else {
    savingsEl.hidden = true;
  }
}

async function main() {
  showState('stateLoading');
  const { product, offSite } = await getActiveProduct();

  if (offSite || !product) {
    document.getElementById('headSub').textContent = 'Sin publicación detectada';
    showState('stateEmpty');
    return;
  }

  document.getElementById('headSub').textContent = 'Comparando precios…';

  let data;
  try {
    const res = await fetch(STORE_DATA_URL, { cache: 'default' });
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    document.getElementById('errorMsg').textContent = 'No pudimos cargar los precios de las otras tiendas. Probá de nuevo en unos minutos.';
    showState('stateError');
    return;
  }

  const productos = data?.productos || [];
  document.getElementById('prodName').textContent = product.titulo;
  const thumb = document.getElementById('prodThumb');
  if (product.imagen) { thumb.style.backgroundImage = `url(${product.imagen})`; thumb.style.backgroundSize = 'cover'; thumb.textContent = ''; }

  renderRows(product, productos);
  document.getElementById('updatedAt').textContent = data?.actualizado ? fmtHoursAgo(data.actualizado) : '';

  const reportUrl = new URL(`${SITE}/comparador.html`);
  reportUrl.searchParams.set('titulo', product.titulo);
  reportUrl.searchParams.set('precio', String(product.precio));
  reportUrl.searchParams.set('url', product.url);
  if (product.imagen) reportUrl.searchParams.set('img', product.imagen);
  document.getElementById('fullReportLink').href = reportUrl.toString();

  document.getElementById('headSub').textContent = STORES_ORDER.length + ' tiendas rastreadas';
  document.getElementById('result').hidden = false;
  for (const s of ['stateEmpty', 'stateLoading', 'stateError']) document.getElementById(s).hidden = true;
}

main();
