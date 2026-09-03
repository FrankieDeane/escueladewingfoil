// content.js — corre en páginas de producto de mercadolibre.com.ar.
// Extrae título, precio e imagen de la publicación y los responde cuando
// el popup los pide. No envía nada a ningún servidor por su cuenta.

function parseArsNumber(str) {
  if (!str) return 0;
  const digits = String(str).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

// 1) Structured data (schema.org Product) — la fuente más estable.
function fromJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const type = node['@type'];
        if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
          const price = offers?.price ? Number(offers.price) : 0;
          if (node.name && price) {
            return { titulo: node.name, precio: Math.round(price), imagen: node.image?.[0] || node.image || '' };
          }
        }
      }
    } catch { /* JSON-LD inválido, seguir probando */ }
  }
  return null;
}

// 2) Fallback: selectores del DOM de la ficha de producto (Andes UI).
function fromDom() {
  const titleEl = document.querySelector('h1.ui-pdp-title, h1[class*="title"]');
  const titulo = titleEl?.textContent?.trim() || document.title.replace(/\s*\|\s*MercadoLibre.*/i, '').trim();
  if (!titulo) return null;

  const priceContainer = document.querySelector(
    '.ui-pdp-price__second-line .andes-money-amount, .ui-pdp-price .andes-money-amount, .andes-money-amount'
  );
  const fraction = priceContainer?.querySelector('.andes-money-amount__fraction')?.textContent;
  const precio = parseArsNumber(fraction);
  if (!precio) return null;

  const imagen =
    document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector('.ui-pdp-gallery img, figure img')?.src || '';

  return { titulo, precio, imagen };
}

function getProduct() {
  // Sólo fichas de producto: /p/ (catálogo) o /up/ (publicación) o /MLA-...
  const isProductPage = /\/(p|up)\/|\/MLA-?\d+/.test(location.pathname) || /\bMLAU?\d+/.test(location.href);
  if (!isProductPage) return null;

  const data = fromJsonLd() || fromDom();
  if (!data) return null;
  return { ...data, url: location.href.split('?')[0], moneda: 'ARS' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_PRODUCT') {
    sendResponse(getProduct());
  }
  return true;
});
