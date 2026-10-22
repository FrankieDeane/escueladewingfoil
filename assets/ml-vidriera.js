/* ml-vidriera.js — vidriera de Mercado Libre y comparador de precios (/equipos).
 *
 * Mercado Libre: /api/ml-dashboard (relevamiento diario por la API, ver
 * netlify/functions/ml-dashboard.js). Si no responde o viene vacío, usa la
 * foto fija de /ml-data.json.
 * Comparador: suma los avisos de la comunidad (/api/equipos, ya pedido en
 * window.EQ_COMUNIDAD); los que traen link de Facebook Marketplace se
 * muestran como Marketplace y el resto como riders.
 * Categoría y marca salen del título con window.EquipoNormalizer.
 */
(function () {
  'use strict';

  var vid = document.getElementById('mercado-libre');
  var cmp = document.getElementById('comparador-precios');
  if (!vid || !cmp) return;

  var CATS = [
    { k: 'wing', n: 'Wings', s: 'wing', e: '🪂' },
    { k: 'tabla', n: 'Tablas', s: 'tabla', e: '🏄' },
    { k: 'foil', n: 'Foils', s: 'foil', e: '🦈' },
    { k: 'neo', n: 'Neoprenes', s: 'neoprene', e: '🤿' },
    { k: 'kit', n: 'Kits', s: 'kit completo', e: '📦' },
    { k: 'acc', n: 'Accesorios', s: 'accesorio', e: '🎒' },
  ];
  var FUENTES = {
    ml: { n: 'Mercado Libre', i: 'ML', sw: '#FFE600', link: 'Ver en Mercado Libre ↗' },
    mp: { n: 'Marketplace', i: 'f', sw: '#1464D2', link: 'Ver en Marketplace ↗' },
    rd: { n: 'Riders', i: 'R', sw: '#FF5A2C', link: 'Escribir por WhatsApp ↗' },
  };
  var DOLAR_DEF = 1450; // si no responde la cotización del día
  var POR_PAGINA = 12;
  var MAX_VS = 3;

  var st = { ml: [], com: [], mp: [], fecha: null, fija: false, cat: 'wing', fuentes: { ml: true, mp: true, rd: true }, orden: 'barato', presu: null, limite: POR_PAGINA, sel: [], dolar: DOLAR_DEF };

  // ── Utilidades ───────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plata(n) { return n == null ? '—' : '$ ' + Math.round(n).toLocaleString('es-AR'); }
  function plataCorta(n) {
    if (n == null) return '—';
    if (n >= 1e6) return '$ ' + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: n >= 1e7 ? 0 : 2 }) + ' M';
    if (n >= 1e3) return '$ ' + Math.round(n / 1e3).toLocaleString('es-AR') + ' mil';
    return '$ ' + Math.round(n);
  }
  function fechaLarga(f) { var p = f.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function urlOk(u) { return /^https:\/\//.test(u || ''); }
  function imgOk(u) { return /^https:\/\/|^\/api\//.test(u || '') ? u : null; }
  function N() { return window.EquipoNormalizer; }

  function catDe(titulo) {
    var t = titulo || '';
    if (/neopren|traje|guante|escarpin|bot(a|in)|lycra|poncho|wetsuit/i.test(t)) return 'neo';
    if (/reparaci|parche|arn[eé]s|gancho|leash|cabo|inflador|bomba|casco|chaleco|funda|bolso|mochila|repuesto|v[aá]lvula|tornill|pad\b|straps?|correa|manija|handle/i.test(t)) return 'acc';
    var c = N() ? N().detectCategoria(t) : 'otro';
    if (c === 'ala') return 'wing';
    if (c === 'tabla') return 'tabla';
    if (c === 'foil' || c === 'mastil' || c === 'fuselaje' || c === 'plano') return 'foil';
    if (c === 'kit') return 'kit';
    if (/\bwing\b|\bala\b/i.test(t)) return 'wing';
    return 'acc';
  }
  function catDeTipo(tipo) {
    var t = String(tipo || '');
    if (/\+/.test(t)) return 'kit'; // "Tabla+Foil"
    if (/ala|wing|vela/i.test(t)) return 'wing';
    if (/tabla/i.test(t)) return 'tabla';
    if (/foil|m[aá]stil|fuselaje|plano|estabilizador/i.test(t)) return 'foil';
    if (/kit|combo/i.test(t)) return 'kit';
    if (/neopren|traje/i.test(t)) return 'neo';
    return 'acc';
  }

  // ── Datos ────────────────────────────────────────────────────────────
  function deMl(rels) {
    var ult = rels[rels.length - 1];
    var ant = rels.length > 1 ? rels[rels.length - 2] : null;
    var antes = {};
    if (ant) ant.productos.forEach(function (p) { if (p.precio) antes[p.id || p.url] = p.precio; });
    return ult.productos.filter(function (p) { return p && p.precio > 0 && p.titulo; }).map(function (p, i) {
      var prev = antes[p.id || p.url];
      var cambio = prev && prev !== p.precio ? Math.round((p.precio - prev) / prev * 100) : 0;
      return {
        id: 'ml:' + (p.id || i), f: 'ml', titulo: p.titulo, img: imgOk(p.imagen), precio: p.precio,
        original: p.precioOriginal > p.precio ? p.precioOriginal : null,
        marca: p.marca || (N() && N().detectMarca(p.titulo)) || null,
        envio: !!p.envioGratis, oficial: !!p.tiendaOficial, opciones: p.opciones || null,
        desde: p.precioDesde || null, vendedor: p.vendedor || null,
        url: urlOk(p.url || p.link) ? (p.url || p.link) : null,
        puesto: p.mlPuesto || i + 1, cambio: cambio, cat: catDe(p.titulo),
      };
    }).sort(function (a, b) { return a.puesto - b.puesto; })
      .map(function (p, i) { p.puesto = i + 1; return p; });
  }

  function deComunidad(list) {
    return (Array.isArray(list) ? list : []).map(function (d) {
      var pr = N() ? N().parsePrecio(d.precio, d.moneda) : null;
      if (!pr) return null;
      var ars = pr.moneda === 'USD' ? pr.valor * st.dolar : pr.moneda === 'ARS' ? pr.valor : null;
      if (!ars || ars < 20000) return null; // precio poco claro ("350 y 230"): no entra a comparar
      var mp = d.marketplace && window.mpLinkOk && window.mpLinkOk(d.marketplace);
      var wa = String(d.whatsapp || '').replace(/[^0-9]/g, '');
      var tipo = String(d.tipo || '').replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').split('/')[0].trim();
      return {
        id: 'c:' + (d.id || d.ts || Math.random()), f: mp ? 'mp' : 'rd',
        titulo: (tipo ? tipo + ' ' : '') + (d.marca || ''),
        img: Array.isArray(d.fotos) && d.fotos.length ? '/api/equipos-foto/' + encodeURIComponent(d.fotos[0]) : null,
        precio: ars, usd: pr.moneda === 'USD' ? pr.valor : null, ubicacion: d.ubicacion || null,
        url: mp ? d.marketplace : wa ? 'https://wa.me/' + wa : null, cat: catDeTipo(d.tipo), usado: true,
      };
    }).filter(Boolean);
  }

  // Avisos de Facebook Marketplace: relevamiento a mano en /mp-data.json
  // (Facebook no se puede leer solo). Sin foto ni link por aviso: el link
  // lleva a la búsqueda de Marketplace.
  function cargarMp() {
    return fetch('/mp-data.json').then(function (r) { return r.json(); }).then(function (d) {
      return (d.avisos || []).map(function (a, i) {
        var ars = a.moneda === 'USD' ? a.precio * st.dolar : a.precio;
        if (!ars || ars < 20000) return null;
        var orig = a.original ? (a.moneda === 'USD' ? a.original * st.dolar : a.original) : null;
        return {
          id: 'mp:' + i, f: 'mp', titulo: a.titulo, img: null, precio: ars,
          original: orig > ars ? orig : null, usd: a.moneda === 'USD' ? a.precio : null,
          ubicacion: a.ubicacion || null, url: urlOk(d.fuente) ? d.fuente : null,
          cat: catDeTipo(a.tipo), usado: true,
        };
      }).filter(Boolean);
    }).catch(function () { return []; });
  }

  function cargarMl() {
    return fetch('/api/ml-dashboard').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var rels = (d.relevamientos || []).filter(function (r) { return r.productos && r.productos.length; });
        if (!rels.length) throw new Error('vacío');
        st.fecha = rels[rels.length - 1].fecha;
        return deMl(rels);
      })
      .catch(function () {
        return fetch('/ml-data.json').then(function (r) { return r.json(); }).then(function (d) {
          st.fija = true;
          st.fecha = String(d.actualizado || '').slice(0, 10) || null;
          return deMl([{ productos: (d.productos || []).map(function (p) { return { id: p.id, titulo: p.titulo, precio: p.precio, imagen: p.imagen, url: p.link }; }) }]);
        });
      });
  }

  function cargarDolar() {
    return fetch('https://dolarapi.com/v1/dolares/oficial').then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.venta > 100) st.dolar = d.venta; }).catch(function () {});
  }

  // ── Vidriera ─────────────────────────────────────────────────────────
  function contar(el, hasta, fmt) {
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(hasta); return; }
    el.textContent = fmt(0);
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      var t0 = performance.now(), dur = 1400;
      (function paso(t) {
        var k = Math.min(1, (t - t0) / dur);
        el.textContent = fmt(hasta * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(paso);
      })(t0);
    }, { threshold: 0.4 });
    io.observe(el);
  }

  function imgTag(p, cls) {
    if (!p.img) return '<span class="pc__ph" aria-hidden="true">' + (CATS.filter(function (c) { return c.k === p.cat; })[0] || CATS[5]).e + '</span>';
    return '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async"' + (cls ? ' class="' + cls + '"' : '') + ' onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pc__ph\',textContent:\'🏄\'}))">';
  }
  function srcTag(f) { var x = FUENTES[f]; return '<span class="src src--' + f + '"><i>' + x.i + '</i>' + x.n + '</span>'; }
  function off(p) { return p.original ? Math.round((1 - p.precio / p.original) * 100) : 0; }

  function vidriera() {
    var ps = st.ml;
    $('mlvFecha').textContent = st.fecha ? (st.fija ? 'Relevado el ' : 'Actualizado el ') + fechaLarga(st.fecha) : '';
    var kp = $('mlvKpis').children;
    var marcas = {}; ps.forEach(function (p) { if (p.marca) marcas[p.marca.toLowerCase()] = 1; });
    var min = ps.length ? Math.min.apply(null, ps.map(function (p) { return p.precio; })) : null;
    var ofertas = ps.filter(function (p) { return p.original; }).length;
    contar(kp[0].querySelector('b'), ps.length, function (v) { return Math.round(v); });
    contar(kp[1].querySelector('b'), min || 0, plataCorta);
    contar(kp[2].querySelector('b'), Object.keys(marcas).length, function (v) { return Math.round(v); });
    contar(kp[3].querySelector('b'), ofertas, function (v) { return Math.round(v); });

    // Cinta: dos vueltas iguales para que el corrimiento no corte
    var tk = ps.slice(0, 24).map(function (p) {
      return '<span class="mlv__tk">' + (p.img ? '<img src="' + esc(p.img) + '" alt="" loading="lazy">' : '') + esc(p.titulo.slice(0, 38)) + ' <b>' + plataCorta(p.precio) + '</b>' + (p.original ? '<s>' + plataCorta(p.original) + '</s>' : '') + '</span>';
    }).join('');
    $('mlvTicker').innerHTML = tk + tk;

    $('mlvPodio').innerHTML = ps.slice(0, 3).map(function (p, i) {
      var o = off(p);
      return '<a class="pod pod--' + (i + 1) + '" href="' + esc(p.url || '#') + '" target="_blank" rel="noopener nofollow">' +
        '<div class="pod__img">' + imgTag(p) + '<span class="pod__medalla">' + (i + 1) + '</span>' + (o ? '<span class="pod__off">-' + o + '%</span>' : '') + '</div>' +
        '<div class="pod__body"><p class="pod__tit">' + esc(p.titulo) + '</p>' +
        '<p class="pod__precio">' + (p.original ? '<s>' + plata(p.original) + '</s>' : '') + plata(p.precio) + '</p>' +
        '<div class="pod__tags">' + tags(p) + '</div>' +
        '<span class="pod__cta">Ver en Mercado Libre →</span></div></a>';
    }).join('');
  }

  function tags(p) {
    var t = [];
    if (p.envio) t.push('<span class="tag tag--envio">🚚 Envío gratis</span>');
    if (p.oficial) t.push('<span class="tag">✔ Tienda oficial</span>');
    if (p.cambio < 0) t.push('<span class="tag tag--baja">↓ Bajó ' + Math.abs(p.cambio) + '%</span>');
    if (p.cambio > 0) t.push('<span class="tag tag--sube">↑ Subió ' + p.cambio + '%</span>');
    if (p.opciones > 1) t.push('<span class="tag">' + p.opciones + ' vendedores</span>');
    return t.join('');
  }

  // ── Comparador ───────────────────────────────────────────────────────
  function todos() { return st.ml.concat(st.mp, st.com); }
  function enCat() {
    return todos().filter(function (p) { return p.cat === st.cat && st.fuentes[p.f]; });
  }

  function dibujarCats() {
    var all = todos();
    $('cmpCats').innerHTML = CATS.map(function (c) {
      var n = all.filter(function (p) { return p.cat === c.k; }).length;
      return '<button type="button" class="cmp__cat' + (c.k === st.cat ? ' is-on' : '') + '" data-cat="' + c.k + '" aria-pressed="' + (c.k === st.cat) + '"' + (n ? '' : ' disabled') + '><em>' + c.e + '</em>' + c.n + '<small>' + n + '</small></button>';
    }).join('');
    $('cmpFuentes').innerHTML = Object.keys(FUENTES).map(function (f) {
      var n = all.filter(function (p) { return p.f === f; }).length;
      return '<button type="button" class="cmp__fuente" data-f="' + f + '" aria-pressed="' + st.fuentes[f] + '"><span class="sw" style="background:' + FUENTES[f].sw + '"></span>' + FUENTES[f].n + ' · ' + n + '</button>';
    }).join('');
  }

  function stats(ps) {
    var v = ps.map(function (p) { return p.precio; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    return { min: v[0], max: v[v.length - 1], med: m };
  }

  // Escala de raíz cuadrada: con precios de $30 mil a $5 M los baratos no
  // quedan todos amontonados a la izquierda.
  function escala(s) {
    var a = Math.sqrt(s.min), b = Math.sqrt(s.max);
    return function (v) { return b === a ? 50 : (Math.sqrt(v) - a) / (b - a) * 100; };
  }

  function comparar(nuevoPresu) {
    var c = CATS.filter(function (x) { return x.k === st.cat; })[0];
    $('cmpTCat').textContent = c.s;
    var ps = enCat();
    var s = stats(ps);
    $('cmpVacio').hidden = !!s;
    $('cmpTermo').style.visibility = s ? '' : 'hidden';
    if (!s) {
      ['cmpMin', 'cmpProm', 'cmpMax', 'cmpPresuTxt'].forEach(function (id) { $(id).textContent = '—'; });
      $('cmpAlcanza').textContent = '';
      $('cmpVacio').textContent = 'No hay ' + c.n.toLowerCase() + ' en las fuentes elegidas. Probá sumar otra fuente arriba.';
      lista([]);
      return;
    }
    $('cmpMin').textContent = plataCorta(s.min);
    $('cmpProm').textContent = plataCorta(s.med);
    $('cmpMax').textContent = plataCorta(s.max);

    var r = $('cmpPresu');
    r.min = Math.floor(s.min); r.max = Math.ceil(s.max); r.step = Math.max(1000, Math.round((s.max - s.min) / 200 / 1000) * 1000) || 1000;
    if (nuevoPresu || st.presu == null || st.presu < s.min || st.presu > s.max) st.presu = s.med;
    r.value = st.presu;

    var x = escala(s);
    // Puntos: los que caen muy cerca se apilan hacia arriba y abajo
    var usados = [];
    $('cmpPuntos').innerHTML = ps.slice().sort(function (a, b) { return a.precio - b.precio; }).map(function (p) {
      var l = x(p.precio), fila = 0;
      while (usados.some(function (u) { return u.f === fila && Math.abs(u.l - l) < 2.2; })) fila++;
      usados.push({ l: l, f: fila });
      var dy = fila === 0 ? 0 : (fila % 2 ? -1 : 1) * Math.ceil(fila / 2) * 20;
      return '<button type="button" class="cmp__pt cmp__pt--' + p.f + (st.sel.indexOf(p.id) >= 0 ? ' is-sel' : '') + '" data-id="' + esc(p.id) + '" style="left:' + l.toFixed(2) + '%;top:' + (47 + Math.max(-40, Math.min(40, dy))) + 'px" aria-label="' + esc(p.titulo) + ': ' + plata(p.precio) + '"><span class="cmp__pt-tip">' + plataCorta(p.precio) + ' · ' + FUENTES[p.f].n + '</span></button>';
    }).join('');
    presupuesto(ps, s);
    lista(ps);
  }

  function presupuesto(ps, s) {
    ps = ps || enCat(); s = s || stats(ps);
    if (!s) return;
    var x = escala(s), v = st.presu, l = x(v);
    var linea = $('cmpLinea');
    linea.style.left = l + '%';
    linea.classList.toggle('is-izq', l > 70);
    $('cmpLineaTxt').textContent = plataCorta(v);
    $('cmpPresuTxt').textContent = plata(v);
    var n = 0;
    $('cmpPuntos').querySelectorAll('.cmp__pt').forEach(function (b) {
      var p = porId(b.getAttribute('data-id'));
      var fuera = p && p.precio > v;
      b.classList.toggle('is-fuera', fuera);
      if (!fuera) n++;
    });
    $('cmpAlcanza').innerHTML = n ? 'Te alcanza para <b>' + n + ' de ' + ps.length + '</b> ' + (CATS.filter(function (c) { return c.k === st.cat; })[0].n.toLowerCase()) + '.' + (n === ps.length ? ' ¡Para todas! 🎉' : '') : 'Con ese presupuesto todavía no alcanza. Mové la barra a la derecha →';
  }

  function porId(id) { var a = todos(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }

  function ordenar(ps) {
    var o = st.orden;
    return ps.slice().sort(function (a, b) {
      if (o === 'caro') return b.precio - a.precio;
      if (o === 'ranking') return (a.puesto || 1e9) - (b.puesto || 1e9) || a.precio - b.precio;
      return a.precio - b.precio;
    });
  }

  function lista(ps) {
    var orden = ordenar(ps);
    var max = ps.length ? Math.max.apply(null, ps.map(function (p) { return p.precio; })) : 1;
    var minP = ps.length ? Math.min.apply(null, ps.map(function (p) { return p.precio; })) : 0;
    var c = CATS.filter(function (x) { return x.k === st.cat; })[0];
    $('cmpListaT').textContent = ps.length ? ps.length + ' ' + c.n.toLowerCase() + ', ' + (st.orden === 'caro' ? 'de cara a barata' : st.orden === 'ranking' ? 'como las ordena Mercado Libre' : 'de barata a cara') : 'Sin opciones';
    $('cmpGrid').innerHTML = orden.slice(0, st.limite).map(function (p, i) {
      var sel = st.sel.indexOf(p.id) >= 0;
      var meta = [];
      if (p.f === 'ml' && p.vendedor) meta.push('🏪 ' + esc(p.vendedor));
      if (p.ubicacion) meta.push('📍 ' + esc(p.ubicacion));
      if (p.usado) meta.push('Usado');
      if (p.usd) meta.push('US$ ' + Math.round(p.usd).toLocaleString('es-AR'));
      return '<article class="pc pc--' + p.f + (sel ? ' is-sel' : '') + '" style="animation-delay:' + Math.min(i, 12) * 35 + 'ms">' +
        '<div class="pc__img">' + imgTag(p) + '<span class="pc__src">' + srcTag(p.f) + '</span>' +
        (p.precio === minP ? '<span class="pc__barato">🏆 Más barato</span>' : '') +
        '<button type="button" class="pc__add" data-id="' + esc(p.id) + '" aria-pressed="' + sel + '" aria-label="' + (sel ? 'Sacar de la comparación' : 'Sumar a la comparación') + '">' + (sel ? '✓' : '+') + '</button></div>' +
        '<div class="pc__body"><p class="pc__tit">' + esc(p.titulo) + '</p>' +
        '<p class="pc__precio">' + plata(p.precio) + (p.original ? '<s>' + plata(p.original) + '</s>' : '') + '</p>' +
        '<div class="pc__vs" title="Precio comparado con el más caro"><i style="width:' + Math.max(4, p.precio / max * 100).toFixed(1) + '%"></i></div>' +
        '<div class="pod__tags">' + tags(p) + '</div>' +
        (meta.length ? '<p class="pc__meta">' + meta.join(' · ') + '</p>' : '') +
        (p.url ? '<a class="pc__link" href="' + esc(p.url) + '" target="_blank" rel="noopener nofollow">' + FUENTES[p.f].link + '</a>' : '') +
        '</div></article>';
    }).join('');
    var resto = orden.length - st.limite;
    $('cmpMas').hidden = resto <= 0;
    $('cmpMas').textContent = 'Ver ' + Math.min(resto, POR_PAGINA) + ' más (quedan ' + resto + ')';
  }

  function alternar(id) {
    var i = st.sel.indexOf(id);
    if (i >= 0) st.sel.splice(i, 1);
    else {
      if (st.sel.length >= MAX_VS) st.sel.shift();
      st.sel.push(id);
    }
    bandeja();
    comparar();
    if (!$('cmpVs').hidden) caraACara(false);
  }

  function bandeja() {
    var ps = st.sel.map(porId).filter(Boolean);
    $('cmpBandeja').hidden = !ps.length;
    $('cmpBandejaFotos').innerHTML = ps.map(function (p) { return p.img ? '<img src="' + esc(p.img) + '" alt="">' : '<span>🏄</span>'; }).join('');
    $('cmpBandejaBtn').textContent = ps.length < 2 ? 'Elegí otro para comparar' : 'Comparar ' + ps.length + ' →';
    $('cmpBandejaBtn').disabled = ps.length < 2;
  }

  function caraACara(ir) {
    var ps = st.sel.map(porId).filter(Boolean);
    var box = $('cmpVs');
    box.hidden = ps.length < 2;
    if (box.hidden) return;
    var min = Math.min.apply(null, ps.map(function (p) { return p.precio; }));
    var max = Math.max.apply(null, ps.map(function (p) { return p.precio; }));
    var g = $('cmpVsGrid');
    g.style.setProperty('--n', ps.length);
    g.setAttribute('style', '--n:' + ps.length);
    g.innerHTML = ps.map(function (p) {
      var win = p.precio === min;
      var dif = p.precio - min;
      return '<div class="vs' + (win ? ' is-win' : '') + '">' + (win ? '<span class="vs__corona">🏆 Más barato</span>' : '') +
        '<button type="button" class="vs__x" data-id="' + esc(p.id) + '" aria-label="Sacar">✕</button>' +
        '<div class="vs__img">' + imgTag(p) + '</div>' + srcTag(p.f) +
        '<p class="vs__tit">' + esc(p.titulo) + '</p>' +
        '<p class="vs__precio">' + plata(p.precio) + '</p>' +
        '<div class="vs__barra"><i style="width:' + (p.precio / max * 100).toFixed(1) + '%"></i></div>' +
        '<p class="vs__dif' + (win ? ' vs__dif--win' : '') + '">' + (win ? (max > min ? 'Ahorrás ' + plataCorta(max - min) + ' frente al más caro' : 'Mismo precio') : plataCorta(dif) + ' más caro (+' + Math.round(dif / min * 100) + '%)') + '</p>' +
        '<div class="pod__tags">' + tags(p) + '</div>' +
        (p.url ? '<a class="pc__link" href="' + esc(p.url) + '" target="_blank" rel="noopener nofollow">' + FUENTES[p.f].link + '</a>' : '') +
        '</div>';
    }).join('');
    if (ir) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Eventos ──────────────────────────────────────────────────────────
  cmp.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cat) { st.cat = b.dataset.cat; st.limite = POR_PAGINA; dibujarCats(); comparar(true); }
    else if (b.dataset.f && b.classList.contains('cmp__fuente')) {
      st.fuentes[b.dataset.f] = !st.fuentes[b.dataset.f];
      if (!st.fuentes.ml && !st.fuentes.mp && !st.fuentes.rd) st.fuentes[b.dataset.f] = true;
      dibujarCats(); comparar();
    }
    else if (b.dataset.orden) {
      st.orden = b.dataset.orden;
      cmp.querySelectorAll('.cmp__ord').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      lista(enCat());
    }
    else if (b.classList.contains('pc__add') || b.classList.contains('vs__x') || b.classList.contains('cmp__pt')) alternar(b.dataset.id);
    else if (b.id === 'cmpMas') { st.limite += POR_PAGINA; lista(enCat()); }
    else if (b.id === 'cmpBandejaBtn') caraACara(true);
    else if (b.id === 'cmpBandejaX') { st.sel = []; bandeja(); comparar(); $('cmpVs').hidden = true; }
  });
  $('cmpPresu').addEventListener('input', function (e) { st.presu = +e.target.value; presupuesto(); });
  window.addEventListener('ewf:equipo', function (e) {
    st.com = st.com.concat(deComunidad([e.detail]));
    dibujarCats(); comparar();
  });

  // ── Arranque ─────────────────────────────────────────────────────────
  function listo(fn) { if (window.EquipoNormalizer) fn(); else window.addEventListener('load', fn); }
  listo(function () {
    Promise.all([cargarMl().catch(function () { return []; }), cargarDolar()]).then(function (r) {
      st.ml = r[0];
      return cargarMp();
    }).then(function (mp) {
      st.mp = mp;
      vidriera();
      return Promise.resolve(window.EQ_COMUNIDAD).catch(function () { return []; });
    }).then(function (list) {
      st.com = deComunidad(list || []);
      var all = todos();
      if (!all.some(function (p) { return p.cat === st.cat; })) {
        var c = CATS.filter(function (x) { return all.some(function (p) { return p.cat === x.k; }); })[0];
        if (c) st.cat = c.k;
      }
      dibujarCats();
      comparar(true);
    });
  });
})();
