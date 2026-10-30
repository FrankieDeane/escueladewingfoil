// Genera las páginas con SEO propio a partir de index.html:
//   · spot-<nombre>.html  → una ficha por spot (título, descripción, canonical y schema propios)
//   · aprender.html, spots.html, instructores.html, equipos.html, articulos.html
//     → copias de index.html con el <head> de cada página (sin esto, Google veía
//       el mismo título y el canonical de la home en las cinco)
// Se corre solo en cada deploy de Netlify (ver netlify.toml). A mano: node scripts/gen-seo.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://www.escueladewingfoil.com.ar';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = (h) => String(h || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

const index = read('index.html');

// ───── Spots (misma lista que usa el sitio) ─────
const i0 = index.indexOf('var SPOTS=[');
const i1 = index.indexOf('];\nwindow.__EWF', i0);
if (i0 < 0 || i1 < 0) throw new Error('No encontré la lista SPOTS en index.html');
const SPOTS = vm.runInNewContext(index.slice(i0 + 10, i1 + 1));

// nombre corto para títulos y textos
const CORTO = {
  sanisidro: 'San Isidro', mardelplata: 'Mar del Plata', pinamar: 'Pinamar', chascomus: 'Chascomús',
  parana: 'Paraná', gualeguaychu: 'Gualeguaychú', corrientes: 'Corrientes', pasodelapatria: 'Paso de la Patria',
  embalse: 'Embalse Río Tercero', marchiquita: 'Mar Chiquita', lolog: 'Lago Lolog', lacar: 'Lago Lácar',
  dinahuapi: 'Dina Huapi', playabonita: 'Playa Bonita', gutierrez: 'Lago Gutiérrez', puertomadryn: 'Puerto Madryn',
  playaunion: 'Playa Unión', campana: 'Pampa Cable Park', benavidez: 'Bairex Park', sanpedro: 'San Pedro Wake Park',
  ipora: 'Ipora Wake Park',
};
const PROV = { 'BS AS': 'Buenos Aires', 'E.RÍOS': 'Entre Ríos', CTES: 'Corrientes', CBA: 'Córdoba', NEUQUÉN: 'Neuquén', 'RÍO NEGRO': 'Río Negro', CHUBUT: 'Chubut' };
const NIVEL = { b: 'Principiante', i: 'Intermedio', a: 'Avanzado', c: 'Todos los niveles' };
const NIVEL_EN = { b: 'Beginner', i: 'Intermediate', a: 'Advanced', c: 'All levels' };

for (const s of SPOTS) {
  if (!s.slug || !CORTO[s.slug]) throw new Error('Spot sin slug o sin nombre corto: ' + s.n);
}

const km = (a, b) => {
  const r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

// ───── Piezas comunes (cabecera, GTM, pie) copiadas del estilo del blog ─────
const HEAD_ANALYTICS = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-5VH677HZ');</script>
<!-- End Google Tag Manager -->
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-VJMGLED2P8"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-VJMGLED2P8');
</script>`;
const LOGO = '<svg width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M18 16 C14 10 7 8 2 10 C7 11 12 13 15 17 Z" fill="currentColor" opacity=".9"/><path d="M18 16 C22 10 29 8 34 10 C29 11 24 13 21 17 Z" fill="currentColor" opacity=".75"/><path d="M15 17 C16 19 18 20 20 19 L21 17 C20 18 18 18.5 16 17.5 Z" fill="currentColor"/><circle cx="21.5" cy="16" r="2" fill="currentColor"/></svg>';
const BAR = `<header class="bar">
  <div class="bar__in">
    <a class="logo" href="/">${LOGO}<span>Escuela de Wingfoil</span></a>
    <nav class="nav" aria-label="Principal">
      <a href="/aprender" data-en="Learn">Aprender</a>
      <a href="/spots" data-en="Spots" aria-current="page">Spots</a>
      <a href="/instructores" data-en="Instructors">Instructores</a>
      <a href="/equipos" data-en="Gear">Equipos</a>
      <a href="/articulos" data-en="Articles">Artículos</a>
      <a href="/costa-san-isidro" data-en="River level">Nivel del río</a>
    </nav>
    <div class="lang" id="langToggle" role="group" aria-label="Idioma">
      <button type="button" data-lang="es" aria-pressed="true">ES</button>
      <button type="button" data-lang="en" aria-pressed="false">EN</button>
    </div>
  </div>
</header>`;
const FOOT = `<footer class="foot">
  <p>© 2026 Escuela de Wingfoil Argentina · <a href="/">Inicio</a> · <a href="/spots">Spots</a> · <a href="/blog/">Blog</a> · <a href="/aprender">Preguntas frecuentes</a> · <a href="/costa-san-isidro">Nivel del Río de la Plata</a></p>
</footer>`;
const LANG_JS = `<script>
(function(){
  var LS='wf-lang', LANG_ES=document.documentElement.lang||'es';
  function leer(){try{return localStorage.getItem(LS);}catch(e){return null;}}
  function guardar(v){try{localStorage.setItem(LS,v);}catch(e){}}
  function aplicar(lang){
    var en=lang==='en';
    document.documentElement.lang=en?'en':LANG_ES;
    document.querySelectorAll('[data-en]').forEach(function(el){
      if(el.dataset.es===undefined) el.dataset.es=el.innerHTML;
      el.innerHTML=en?el.getAttribute('data-en'):el.dataset.es;
    });
    document.querySelectorAll('#langToggle button').forEach(function(b){
      b.setAttribute('aria-pressed',String(b.dataset.lang===lang));
    });
  }
  var caja=document.getElementById('langToggle');
  if(caja) caja.addEventListener('click',function(e){
    var b=e.target.closest('button[data-lang]'); if(!b) return;
    guardar(b.dataset.lang); aplicar(b.dataset.lang);
  });
  var q=new URLSearchParams(location.search).get('lang');
  var ini=q==='en'||q==='es'?q:leer();
  if(ini==='en') aplicar('en');
})();
</script>`;

// ───── Ficha de cada spot ─────
function fichaSpot(s) {
  const corto = CORTO[s.slug];
  const prov = PROV[s.prov] || s.prov;
  const cable = !!s.cable;
  const url = `${BASE}/spot-${s.slug}`;
  const nivel = s.lvLabel || NIVEL[s.lv];
  const nivelEn = s.lvLabelEn || NIVEL_EN[s.lv];
  const m = /^(.*?)\s*(\d+)-(\d+)\s*kn$/.exec(s.w || '');
  const rumbos = m ? m[1].trim() : null;
  const kn1 = m ? +m[2] : 0, kn2 = m ? +m[3] : 0;
  const kmh = (k) => Math.round(k * 1.852);
  const vientoTxt = m ? `${rumbos}, ${kn1}-${kn2} nudos (${kmh(kn1)}-${kmh(kn2)} km/h)` : 'No depende del viento (cable)';

  const title = cable ? `${corto}: cable park en ${prov} | Cómo llegar` : `Wingfoil en ${corto} | Viento y cómo llegar`;
  const descRaw = cable
    ? `${corto}, cable park en ${prov}: ${txt(s.d)} Cómo llegar, consejos y otros spots de Argentina.`
    : `Wingfoil en ${corto} (${prov}): viento ideal ${s.w}, nivel ${nivel.toLowerCase()}, mejor época, cómo llegar y pronóstico en vivo.`;
  const desc = clip(descRaw.trim(), 158);
  const h1 = cable ? `${s.n.replace(' — ', ' · ')}: cable park en ${prov}` : `Wingfoil en ${s.n.replace(' — ', ' · ')}`;
  const h1En = cable ? `${s.n.replace(' — ', ' · ')}: cable park in ${prov}` : `Wingfoil at ${s.n.replace(' — ', ' · ')}`;

  const faq = [];
  if (!cable && s.months) faq.push([`¿Cuándo es la mejor época para hacer wingfoil en ${corto}?`, `When is the best time for wingfoil at ${corto}?`, txt(s.months), txt(s.monthsEn)]);
  if (!cable) faq.push([`¿Qué viento necesita ${corto} para hacer wingfoil?`, `What wind does ${corto} need for wingfoil?`,
    `Rinde con viento del ${rumbos}, entre ${kn1} y ${kn2} nudos (${kmh(kn1)} a ${kmh(kn2)} km/h). ${txt(s.d)}`,
    `It works with ${rumbos} wind between ${kn1} and ${kn2} knots (${kmh(kn1)} to ${kmh(kn2)} km/h). ${txt(s.dEn)}`]);
  else faq.push([`¿Hace falta viento en ${corto}?`, `Do you need wind at ${corto}?`, 'No. Es un cable park: un cable te remolca, así que no depende del viento.', 'No. It is a cable park: a cable tows you, so it does not depend on the wind.']);
  if (s.howTo) faq.push([`¿Cómo llegar a ${corto}?`, `How do I get to ${corto}?`, txt(s.howTo).replace(/^Cómo llegar:\s*/, ''), txt(s.howToEn).replace(/^How to get there:\s*/, '')]);
  if (s.safety) faq.push([`¿Qué cuidados hay que tener en ${corto}?`, `What should I watch out for at ${corto}?`, txt(s.safety), txt(s.safetyEn)]);

  const cercanos = SPOTS.filter((o) => o !== s && !!o.cable === cable)
    .sort((a, b) => km(s, a) - km(s, b)).slice(0, 4);
  const otros = SPOTS.filter((o) => o !== s);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SportsActivityLocation',
        '@id': `${url}#spot`,
        name: cable ? s.n : `${s.n} · wingfoil`,
        description: txt(s.d),
        url,
        image: s.img,
        geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng },
        address: { '@type': 'PostalAddress', addressRegion: prov, addressCountry: 'AR' },
        sport: cable ? 'Wakeboard' : 'Wingfoil',
        isPartOf: { '@id': `${BASE}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: 'Spots', item: `${BASE}/spots` },
          { '@type': 'ListItem', position: 3, name: corto, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[2] } })),
      },
      {
        '@type': 'EducationalOrganization',
        '@id': `${BASE}/#organization`,
        name: 'Escuela de Wingfoil Argentina',
        url: `${BASE}/`,
        logo: { '@type': 'ImageObject', url: `${BASE}/icon-512.png`, width: 512, height: 512 },
      },
    ],
  };

  const dual = (es, en) => `<div class="es-only">${es}</div><div class="en-only">${en || es}</div>`;
  const sec = (hEs, hEn, es, en) => (es ? `<section class="sec"><h2 data-en="${esc(hEn)}">${hEs}</h2>${dual(es, en)}</section>` : '');
  const p = (h) => (h ? `<p>${h}</p>` : '');

  const escuelas = (s.schools || []).map((e) =>
    `<div class="escuela"><h3>${esc(e.n)}</h3><div class="es-only"><p>${esc(e.d)}</p>${e.acc ? `<p><strong>Acceso:</strong> ${esc(e.acc)}</p>` : ''}</div><div class="en-only"><p>${esc(e.dEn || e.d)}</p>${e.accEn ? `<p><strong>Access:</strong> ${esc(e.accEn)}</p>` : ''}</div></div>`).join('');

  const hechos = [
    ['Provincia', 'Province', esc(prov), esc(prov)],
    cable ? ['Tipo', 'Type', 'Cable park', 'Cable park'] : ['Viento ideal', 'Ideal wind', esc(s.w), esc(s.w)],
    ['Nivel', 'Level', esc(nivel), esc(nivelEn)],
    ['Características', 'Features', esc((s.tags || []).join(' · ')), esc((s.tagsEn || s.tags || []).join(' · '))],
  ].map((h) => `<div class="fact"><dt data-en="${h[1]}">${h[0]}</dt><dd><span class="es-only">${h[2]}</span><span class="en-only">${h[3]}</span></dd></div>`).join('');

  const faqHtml = faq.map((f) => `<details><summary data-en="${esc(f[1])}">${esc(f[0])}</summary>${dual(p(esc(f[2])), p(esc(f[3] || f[2])))}</details>`).join('');
  const chips = (arr) => arr.map((o) => `<a href="/spot-${o.slug}">${esc(CORTO[o.slug])}</a>`).join('');

  const body = `<main class="wrap">
  <nav class="crumbs" aria-label="Migas de pan"><ol>
    <li><a href="/">Inicio</a></li><li><a href="/spots">Spots</a></li><li aria-current="page">${esc(corto)}</li>
  </ol></nav>
  <article class="post">
    <header class="wf-cab">
      <img class="wf-cab__bg" src="${esc(s.img)}" alt="${esc(corto)}: ${cable ? 'cable park' : 'spot de wingfoil'} en ${esc(prov)}" referrerpolicy="no-referrer" fetchpriority="high" onerror="this.remove()"/>
      <div class="wf-cab__in">
        <div style="margin-bottom:14px"><span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--primary)" data-en="${esc(prov)} · Argentina">${esc(prov)} · Argentina</span></div>
        <h1 style="font-family:'Bricolage Grotesque',sans-serif;font-size:clamp(26px,4vw,40px);font-weight:800;line-height:1.15;margin-bottom:12px" data-en="${esc(h1En)}">${esc(h1)}</h1>
      </div>
    </header>
    <dl class="facts">${hechos}</dl>
    <div class="live">
      <p><strong data-en="Wind, forecast and cameras for today">Viento, pronóstico y cámaras de hoy</strong><br><span data-en="See if you can ride today, where the wind comes from, which hours are good and the sunrise and sunset.">Mirá si se puede navegar hoy, de dónde viene el viento, qué horas sirven y el amanecer y atardecer.</span></p>
      <a class="btn" href="/spots#spot-${s.slug}" data-en="See it live →">Verlo en vivo →</a>
    </div>
    ${sec('Cómo es', 'What it is like', p(esc(s.d)) + (cable ? '' : p(`Viento ideal: <strong>${esc(vientoTxt)}</strong>. Si dudás con qué ala salir, mirá la <a href="/blog/que-tamano-de-ala-wingfoil-segun-viento">guía de tamaño de ala según el viento</a>.`)), p(esc(s.dEn || s.d)) + (cable ? '' : p(`Ideal wind: <strong>${esc(rumbos)}, ${kn1}-${kn2} knots (${kmh(kn1)}-${kmh(kn2)} km/h)</strong>.`)))}
    ${sec('Mejor época', 'Best time to go', s.months ? p(s.months) : '', s.months ? p(s.monthsEn || s.months) : '')}
    ${sec('Cómo llegar', 'How to get there', p(s.howTo) + p(`<a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" rel="noopener">Ver en Google Maps ↗</a>`), p(s.howToEn || s.howTo) + p(`<a href="https://www.google.com/maps?q=${s.lat},${s.lng}" target="_blank" rel="noopener">Open in Google Maps ↗</a>`))}
    ${sec('Seguridad', 'Safety', p(s.safety), p(s.safetyEn || s.safety))}
    ${sec('Consejos', 'Tips', p(s.tips), p(s.tipsEn || s.tips))}
    ${escuelas ? `<section class="sec"><h2 data-en="Schools and access">Escuelas y acceso</h2>${escuelas}</section>` : ''}
    <section class="sec faq"><h2 data-en="Frequently asked questions">Preguntas frecuentes</h2>${faqHtml}</section>
    <section class="sec"><h2 data-en="Nearby spots">Spots cercanos</h2><div class="chips">${chips(cercanos)}</div></section>
    <section class="sec"><h2 data-en="Keep exploring">Seguí explorando</h2>
      <p><a href="/spots">Mapa de todos los spots</a> · <a href="/blog/como-leer-el-viento">Cómo leer el viento</a> · <a href="/blog/mejores-spots-wingfoil-argentina">Mejores spots de Argentina</a> · <a href="/instructores">Instructores</a> · <a href="/aprender">Aprender wingfoil gratis</a></p>
    </section>
    <section class="sec"><h2 data-en="All spots">Todos los spots</h2><div class="chips">${chips(otros)}</div></section>
  </article>
</main>`;

  return `<!DOCTYPE html>
<html lang="es-AR" data-theme="light">
<head>
${HEAD_ANALYTICS}
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${url}" />
<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />
<meta name="theme-color" content="#F7F4EC" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="es_AR" />
<meta property="og:site_name" content="Escuela de Wingfoil Argentina" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${BASE}/assets/video/portada.jpg" />
<meta property="og:image:alt" content="${esc(corto)} · wingfoil en Argentina" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="${BASE}/assets/video/portada.jpg" />
<link rel="icon" href="/favicon.ico" sizes="32x32 16x16" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/icon-192.png" />
<link rel="manifest" href="/manifest.json" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400..700&display=swap" rel="stylesheet" />
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
<link rel="stylesheet" href="/assets/spot.css" />
<link rel="stylesheet" href="/assets/blog.css" />
<script>try{if(localStorage.getItem('wf-tema')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}</script>
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-5VH677HZ"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
${BAR}

${body}
${FOOT}
${LANG_JS}
</body>
</html>
`;
}

// ───── Páginas del sitio: copias de index.html con su propio <head> ─────
const SCHEMA = JSON.parse(read('scripts/seo-schema.json'));
const PAGINAS = {
  aprender: ['Aprender wingfoil gratis, por nivel | Escuela de Wingfoil', 'Aprendé wingfoil gratis: videos en español por nivel, anatomía del equipo, maniobras, glosario y guías para pasar de la orilla al primer vuelo.', 'Aprender'],
  spots: ['Spots de wingfoil en Argentina | Escuela de Wingfoil', 'Mapa de 17 spots de wingfoil y 4 cable parks en Argentina: viento ideal, nivel, mejor época, cómo llegar, pronóstico y cámaras en vivo.', 'Spots'],
  instructores: ['Clases de wingfoil con instructores | Escuela de Wingfoil', 'Clases de wingfoil en Argentina: directorio de instructores por spot y nivel. Mirá su perfil y escribile directo por WhatsApp, sin intermediarios.', 'Instructores'],
  equipos: ['Precios de equipos de wingfoil | Escuela de Wingfoil', 'Precios de alas, tablas y foils de wingfoil en Mercado Libre, relevados todos los días, y comparador con avisos de Facebook Marketplace.', 'Equipos'],
  articulos: ['Artículos y guías de wingfoil | Escuela de Wingfoil', '28 artículos de wingfoil en español: cómo empezar, técnica, viento, equipo, seguridad y los mejores spots de Argentina y Brasil.', 'Artículos'],
};

function pagina(slug) {
  const [t, d, nombre] = PAGINAS[slug];
  const url = `${BASE}/${slug}`;
  let h = index;
  const sub = (re, fn, que) => { if (!re.test(h)) throw new Error('No encontré ' + que); h = h.replace(re, fn); };
  sub(/<title>[^<]*<\/title>/, () => `<title>${esc(t)}</title>`, 'title');
  sub(/(<meta name="description" content=")[^"]*(")/, (_, a, b) => a + esc(d) + b, 'description');
  sub(/(<link rel="canonical" href=")[^"]*(")/, (_, a, b) => a + url + b, 'canonical');
  sub(/(<meta property="og:url" content=")[^"]*(")/, (_, a, b) => a + url + b, 'og:url');
  sub(/(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => a + esc(t) + b, 'og:title');
  sub(/(<meta property="og:description" content=")[^"]*(")/, (_, a, b) => a + esc(d) + b, 'og:description');
  sub(/(<meta name="twitter:title" content=")[^"]*(")/, (_, a, b) => a + esc(t) + b, 'twitter:title');
  sub(/(<meta name="twitter:description" content=")[^"]*(")/, (_, a, b) => a + esc(d) + b, 'twitter:description');
  sub(/<html lang="es-AR" data-theme="light" data-page="inicio">/, () => `<html lang="es-AR" data-theme="light" data-page="${slug}">`, 'html data-page');
  sub(/(<link rel="alternate" hreflang="es-AR" href=")[^"]*(")/, (_, a, b) => a + url + b, 'hreflang es-AR');
  sub(/(<link rel="alternate" hreflang="x-default" href=")[^"]*(")/, (_, a, b) => a + url + b, 'hreflang x-default');

  // Un solo h1 por página: el de la portada pasa a h2 y el de esta página a h1
  sub(/<h1 class="nx-h1">([\s\S]*?)<\/h1>/, (_, a) => `<h2 class="nx-h1">${a}</h2>`, 'h1 de la portada');
  sub(new RegExp(`(id="pagina-${slug}"[\\s\\S]*?)<h2 class="nx-h1">([\\s\\S]*?)<\\/h2>`), (_, a, b) => `${a}<h1 class="nx-h1">${b}</h1>`, 'título de la página');

  // Foto principal (la que se ve primero): se pide antes y con prioridad; la de la
  // portada, que acá está oculta, ya no se descarga
  const fondo = new RegExp(`id="pagina-${slug}">\\s*<img class="nx-intro__bg" src="([^"]+)" alt="" loading="lazy"/>`).exec(h);
  if (!fondo) throw new Error('No encontré la foto de ' + slug);
  const foto = fondo[1];
  h = h.replace(fondo[0], fondo[0].replace('loading="lazy"', 'fetchpriority="high"'));
  sub(/(<img class="nx-hv__poster" src="[^"]*" alt="") fetchpriority="high"/, (_, a) => `${a} loading="lazy"`, 'foto de la portada');
  sub(/<link rel="preload" as="image"[^>]*\/>\n(?:\s*<link rel="preload" as="image"[^>]*\/>\n)?/, () => `<link rel="preload" as="image" href="${foto}" fetchpriority="high" />\n`, 'preload');
  sub(/(<meta property="og:image" content=")[^"]*(")/, (_, a, b) => a + BASE + foto + b, 'og:image');
  sub(/(<meta name="twitter:image" content=")[^"]*(")/, (_, a, b) => a + BASE + foto + b, 'twitter:image');
  sub(/(<meta property="og:image:width" content=")[^"]*(")/, (_, a, b) => a + '1600' + b, 'og:image:width');
  sub(/(<meta property="og:image:height" content=")[^"]*(")/, (_, a, b) => a + '1066' + b, 'og:image:height');
  sub(/(<meta property="og:image:alt" content=")[^"]*(")/, (_, a, b) => a + esc(`${nombre} · Escuela de Wingfoil Argentina`) + b, 'og:image:alt');
  // el WebPage de la portada no va en las otras páginas (cada una trae el suyo, abajo)
  sub(/,\s*\{\s*"@type": "WebPage",\s*"@id": "https:\/\/www\.escueladewingfoil\.com\.ar\/#page"[\s\S]*?\n {6}\}(?=\s*\])/, () => '', 'WebPage de la portada');

  const graph = [
    { '@type': slug === 'articulos' ? 'CollectionPage' : 'WebPage', '@id': `${url}#page`, url, name: t, description: d, inLanguage: 'es-AR', isPartOf: { '@id': `${BASE}/#website` }, about: { '@id': `${BASE}/#organization` }, primaryImageOfPage: { '@type': 'ImageObject', url: BASE + foto, width: 1600, height: 1066 } },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: nombre, item: url },
    ] },
  ];
  if (slug === 'spots') {
    graph.push({ '@type': 'ItemList', name: 'Spots de wingfoil en Argentina', numberOfItems: SPOTS.length,
      itemListElement: SPOTS.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.n, url: `${BASE}/spot-${s.slug}` })) });
  }
  const bloques = [{ '@context': 'https://schema.org', '@graph': graph }, ...(SCHEMA[slug] || [])];
  const ld = bloques.map((b) => `  <script type="application/ld+json">\n${JSON.stringify(b)}\n  </script>\n`).join('');
  sub(/<!-- Schema\.org JSON-LD -->\n/, () => `<!-- Schema.org JSON-LD -->\n${ld}`, 'bloque de schema');
  return h;
}

// ───── Escribir todo (primero en memoria; si algo falla, no se toca nada) ─────
const salida = {};
for (const s of SPOTS) salida[`spot-${s.slug}.html`] = fichaSpot(s);
for (const slug of Object.keys(PAGINAS)) salida[`${slug}.html`] = pagina(slug);
for (const [f, c] of Object.entries(salida)) write(f, c);
console.log(`SEO: ${Object.keys(salida).length} páginas generadas (${SPOTS.length} fichas de spot + ${Object.keys(PAGINAS).length} páginas)`);
