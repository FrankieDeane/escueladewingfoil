/* buscador-equipos.js — buscador, tabla de resultados y comparador de equipos
 * de wingfoil dentro de #venta-de-wingfoil. Fuentes: ml-data.json (scraping
 * de Mercado Libre) y /api/equipos (avisos de la comunidad), normalizadas por
 * assets/equipo-normalizer.js. Todo se renderiza en #eqsRoot, sin ventanas
 * aparte.
 */
(function () {
  'use strict';
  var N = window.EquipoNormalizer;
  var root = document.getElementById('eqsRoot');
  if (!root || !N) return;

  var PAGE = 12;
  var MAX_CMP = 4;
  var CMP_KEY = 'eqs:cmp:v1';
  var NA = 'No especificado';
  var CAT = N.CATEGORIAS;
  var CAT_PLURAL = { tabla: 'Tablas', ala: 'Alas', foil: 'Foils', mastil: 'Mástiles', fuselaje: 'Fuselajes', plano: 'Planos', kit: 'Equipos completos', accesorio: 'Accesorios', otro: 'Otros' };
  var CAT_ICON = { tabla: '🏄', ala: '🪂', foil: '🦈', mastil: '📏', fuselaje: '🔩', plano: '✈️', kit: '📦', accesorio: '🎒', otro: '🔹' };
  var UNIDAD = { tabla: 'L', ala: 'm²', foil: 'cm²', plano: 'cm²', mastil: 'cm', fuselaje: 'cm' };
  var SINONIMOS = { ala: ['ala', 'wing', 'vela'], wing: ['wing', 'ala', 'vela'], vela: ['vela', 'wing', 'ala'], tabla: ['tabla', 'board'], board: ['board', 'tabla'], mastil: ['mastil', 'mast'], kit: ['kit', 'equipo completo', 'combo'] };

  var state = {
    items: [],
    fuentes: {},      // id → { ok, n, actualizado, error }
    tipoCambioUSD: null,
    shown: PAGE,
    cmp: loadCmp(),
    soloDiff: false,
    f: defaults(),
  };

  function defaults() {
    return { q: '', categoria: '', subtipo: '', marca: '', modelo: '', anio: '', estado: '', nivel: '', vendedor: '', disponibilidad: '', ubicacion: '', fuente: '', moneda: 'ARS', pmin: '', pmax: '', tmin: '', tmax: '', cuotas: false, ofertas: false, ocultarAgotados: false, orden: 'relevancia' };
  }

  // ── Utilidades ─────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function na(txt) { return '<span class="eqs__na">' + esc(txt || NA) + '</span>'; }
  function money(v, moneda) {
    if (v == null) return null;
    var s = Math.round(v).toLocaleString('es-AR');
    return (moneda === 'USD' ? 'US$ ' : moneda === 'EUR' ? '€ ' : '$ ') + s;
  }
  var fmtFecha = (function () {
    try {
      var f = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
      return function (iso) { return f.format(new Date(iso)); };
    } catch (e) { return function (iso) { return new Date(iso).toLocaleString('es-AR'); }; }
  })();
  function diasDesde(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null; }
  function track(event, params) {
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: event }, params || {})); } catch (e) { /* sin GTM */ }
  }
  function loadCmp() {
    try { var v = JSON.parse(localStorage.getItem(CMP_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, MAX_CMP) : []; } catch (e) { return []; }
  }
  function saveCmp() { try { localStorage.setItem(CMP_KEY, JSON.stringify(state.cmp)); } catch (e) { /* storage bloqueado */ } }
  function byId(id) { for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i]; return null; }

  // ── Textos de cada campo (siempre sin inventar) ──────────────────────────
  function txtMarcaModelo(p) { return [p.marca, p.modelo].filter(Boolean).join(' ') || null; }
  function txtCuotas(p) {
    var c = p.cuotas;
    if (c.estado === 'no') return 'No ofrece cuotas';
    if (c.estado !== 'si') return null;
    var s = c.cantidad ? c.cantidad + ' cuotas' : 'Ofrece cuotas';
    if (c.valor) s += ' de ' + money(c.valor, p.precio && p.precio.moneda);
    if (c.sinInteres) s += ' sin interés';
    return s;
  }
  function txtEstado(p) { return p.condicion === 'nuevo' ? 'Nuevo' : p.condicion === 'usado' ? 'Usado' : null; }
  function txtDisp(p) { return p.disponibilidad === 'disponible' ? 'Disponible' : p.disponibilidad === 'agotado' ? 'Agotado' : null; }
  function txtNivel(p) { return p.nivel ? p.nivel.valor + (p.nivel.estimado ? ' (estimado por volumen)' : '') : null; }
  function txtEnvio(p) { return p.envio === 'gratis' ? 'Envío gratis' : typeof p.envio === 'number' ? 'Envío ' + money(p.envio, 'ARS') : null; }
  function txtPPU(p) { return p.precioPorUnidad ? money(p.precioPorUnidad, 'ARS') + ' por ' + p.tamano.unidad : null; }
  function txtDesc(p) {
    var d = p.descripcion ? String(p.descripcion) : p.resumen;
    if (!d) return null;
    return d.length > 160 ? d.slice(0, 157).replace(/\s+\S*$/, '') + '…' : d;
  }

  // ── Búsqueda y filtros ──────────────────────────────────────────────────
  function haystack(p) {
    if (!p._hay) {
      p._hay = N.fold([p.titulo, p.marca, p.modelo, p.categoria, CAT[p.categoria], p.subtipo, p.resumen, p.descripcion, p.ubicacion, p.vendedor, p.fuente, p.anio].filter(Boolean).join(' '));
    }
    return p._hay;
  }
  function tokens(q) { return N.fold(q).split(/[^a-z0-9.,]+/).filter(function (t) { return t.length > 1 || /\d/.test(t); }); }
  function matchQ(p, toks) {
    var h = haystack(p);
    return toks.every(function (t) {
      // Números como talle/volumen/año: que "5" no matchee "115" ni "2025".
      if (/^\d+([.,]\d+)?$/.test(t)) return new RegExp('(^|[^0-9.,])' + t.replace(/[.,]/, '[.,]') + '(?![0-9])').test(h);
      return (SINONIMOS[t] || [t]).some(function (a) { return h.indexOf(a) >= 0; });
    });
  }

  // `skip` permite calcular las opciones de un filtro con todos los demás
  // aplicados (facetas), para no ofrecer combinaciones sin resultados.
  function passes(p, f, toks, skip) {
    if (toks.length && !matchQ(p, toks)) return false;
    if (skip !== 'categoria' && f.categoria && p.categoria !== f.categoria) return false;
    if (skip !== 'subtipo' && f.subtipo && p.subtipo !== f.subtipo) return false;
    if (skip !== 'marca' && f.marca && p.marca !== f.marca) return false;
    if (skip !== 'modelo' && f.modelo && N.fold(p.modelo || '').indexOf(N.fold(f.modelo)) < 0) return false;
    if (skip !== 'anio' && f.anio && String(p.anio || '') !== f.anio) return false;
    if (skip !== 'estado' && f.estado && (p.condicion || 'nd') !== f.estado) return false;
    if (skip !== 'nivel' && f.nivel && (!p.nivel || p.nivel.valor !== f.nivel)) return false;
    if (skip !== 'vendedor' && f.vendedor && (p.vendedor || '') !== f.vendedor) return false;
    if (skip !== 'disponibilidad' && f.disponibilidad && (p.disponibilidad || 'nd') !== f.disponibilidad) return false;
    if (skip !== 'ubicacion' && f.ubicacion && (p.ubicacion || '') !== f.ubicacion) return false;
    if (skip !== 'fuente' && f.fuente && p.fuenteId !== f.fuente) return false;
    if (f.pmin !== '' || f.pmax !== '') {
      if (!p.precio || p.precio.moneda !== f.moneda) return false;
      if (f.pmin !== '' && p.precio.valor < +f.pmin) return false;
      if (f.pmax !== '' && p.precio.valor > +f.pmax) return false;
    }
    if (f.categoria && UNIDAD[f.categoria] && (f.tmin !== '' || f.tmax !== '')) {
      if (!p.tamano || p.tamano.unidad !== UNIDAD[f.categoria]) return false;
      if (f.tmin !== '' && p.tamano.valor < +f.tmin) return false;
      if (f.tmax !== '' && p.tamano.valor > +f.tmax) return false;
    }
    if (f.cuotas && p.cuotas.estado !== 'si') return false;
    if (f.ofertas && !p.oferta && !p.precioBajo) return false;
    if (f.ocultarAgotados && p.disponibilidad === 'agotado') return false;
    return true;
  }

  function score(p, toks) {
    var s = 0;
    var h = haystack(p);
    toks.forEach(function (t) {
      var ft = N.fold(p.titulo);
      if (ft.indexOf(t) === 0) s += 4; else if (ft.indexOf(t) >= 0) s += 3;
      if (p.marca && N.fold(p.marca) === t) s += 5;
      if (p.modelo && N.fold(p.modelo).indexOf(t) >= 0) s += 4;
      if (N.fold(CAT[p.categoria]).indexOf(t) >= 0 || p.categoria === t) s += 3;
      if (h.indexOf(t) >= 0) s += 1;
    });
    // Completitud de datos: a igual coincidencia, primero lo que más informa.
    ['marca', 'modelo', 'anio', 'tamano', 'imagen'].forEach(function (k) { if (p[k]) s += 0.4; });
    if (p.cuotas.estado !== 'desconocido') s += 0.4;
    if (p.linkRoto) s -= 3;
    if (p.disponibilidad === 'agotado') s -= 2;
    return s;
  }

  function sortItems(list, orden, toks) {
    var cmpNull = function (a, b, fn, dir) {
      var va = fn(a), vb = fn(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;   // sin dato, siempre al final
      if (vb == null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    };
    var precio = function (p) { return p.precioARS != null ? p.precioARS : null; };
    var fns = {
      relevancia: function (a, b) { return b._score - a._score; },
      precio_asc: function (a, b) { return cmpNull(a, b, precio, 1); },
      precio_desc: function (a, b) { return cmpNull(a, b, precio, -1); },
      anio_desc: function (a, b) { return cmpNull(a, b, function (p) { return p.anio; }, -1); },
      anio_asc: function (a, b) { return cmpNull(a, b, function (p) { return p.anio; }, 1); },
      marca: function (a, b) { return cmpNull(a, b, function (p) { return p.marca && N.fold(p.marca); }, 1); },
      ppu: function (a, b) { return cmpNull(a, b, function (p) { return p.precioPorUnidad; }, 1); },
    };
    list.forEach(function (p) { p._score = score(p, toks); });
    return list.sort(function (a, b) { return fns[orden](a, b) || b._score - a._score || (a.precioARS || 0) - (b.precioARS || 0); });
  }

  function results() {
    var toks = tokens(state.f.q);
    return sortItems(state.items.filter(function (p) { return passes(p, state.f, toks); }), state.f.orden, toks);
  }

  function facet(key, getter) {
    var toks = tokens(state.f.q);
    var counts = {};
    state.items.forEach(function (p) {
      if (!passes(p, state.f, toks, key)) return;
      var v = getter(p);
      if (v == null || v === '') return;
      counts[v] = (counts[v] || 0) + 1;
    });
    return counts;
  }

  // ── Render de filtros ──────────────────────────────────────────────────
  var FACETS = [
    { key: 'categoria', label: 'Categoría', get: function (p) { return p.categoria; }, text: function (v) { return CAT[v]; }, order: Object.keys(CAT) },
    { key: 'subtipo', label: 'Tipo de producto', get: function (p) { return p.subtipo; } },
    { key: 'marca', label: 'Marca', get: function (p) { return p.marca; } },
    { key: 'anio', label: 'Año', get: function (p) { return p.anio ? String(p.anio) : null; }, desc: true },
    { key: 'estado', label: 'Estado', get: function (p) { return p.condicion || 'nd'; }, text: function (v) { return { nuevo: 'Nuevo', usado: 'Usado', nd: NA }[v]; }, order: ['nuevo', 'usado', 'nd'] },
    { key: 'nivel', label: 'Nivel recomendado', get: function (p) { return p.nivel && p.nivel.valor; }, order: ['Principiante', 'Intermedio', 'Avanzado'] },
    { key: 'vendedor', label: 'Vendedor', get: function (p) { return p.vendedor; } },
    { key: 'disponibilidad', label: 'Disponibilidad', get: function (p) { return p.disponibilidad || 'nd'; }, text: function (v) { return { disponible: 'Disponible', agotado: 'Agotado', nd: NA }[v]; }, order: ['disponible', 'agotado', 'nd'] },
    { key: 'ubicacion', label: 'Ubicación', get: function (p) { return p.ubicacion; } },
    { key: 'fuente', label: 'Fuente', get: function (p) { return p.fuenteId; }, text: function (v) { return v === 'ml' ? 'Mercado Libre' : v === 'com' ? 'Comunidad' : v; } },
  ];

  function renderFacet(fc) {
    var counts = facet(fc.key, fc.get);
    var sel = state.f[fc.key];
    var keys = Object.keys(counts);
    if (sel && keys.indexOf(sel) < 0) keys.push(sel);
    if (fc.order) keys.sort(function (a, b) { return fc.order.indexOf(a) - fc.order.indexOf(b); });
    else keys.sort(function (a, b) { return fc.desc ? b.localeCompare(a) : a.localeCompare(b, 'es'); });
    var el = root.querySelector('[data-f="' + fc.key + '"]');
    var hint = el.parentNode.querySelector('.eqs__hint');
    el.innerHTML = '<option value="">Todos</option>' + keys.map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(fc.text ? fc.text(k) : k) + ' (' + (counts[k] || 0) + ')</option>';
    }).join('');
    // Filtros que hoy no tienen datos en ninguna fuente (p. ej. vendedor en
    // ML) quedan deshabilitados con una aclaración, en vez de desaparecer.
    var sinDatos = !keys.length || (keys.length === 1 && keys[0] === 'nd' && !sel);
    el.disabled = sinDatos;
    if (hint) hint.hidden = !sinDatos;
  }

  function renderChips() {
    var counts = facet('categoria', function (p) { return p.categoria; });
    var html = '<button type="button" class="eqs__chip" data-cat="" aria-pressed="' + (!state.f.categoria) + '">Todo</button>';
    Object.keys(CAT).forEach(function (k) {
      if (!counts[k] && state.f.categoria !== k) return;
      html += '<button type="button" class="eqs__chip" data-cat="' + k + '" aria-pressed="' + (state.f.categoria === k) + '">' + CAT_ICON[k] + ' ' + CAT_PLURAL[k] + '<small>' + (counts[k] || 0) + '</small></button>';
    });
    root.querySelector('.eqs__chips').innerHTML = html;
  }

  function syncInputs() {
    ['q', 'modelo', 'pmin', 'pmax', 'tmin', 'tmax', 'moneda', 'orden'].forEach(function (k) {
      var el = root.querySelector('[data-f="' + k + '"]');
      if (el && el !== document.activeElement) el.value = state.f[k];
    });
    ['cuotas', 'ofertas', 'ocultarAgotados'].forEach(function (k) { root.querySelector('[data-f="' + k + '"]').checked = state.f[k]; });
    var u = UNIDAD[state.f.categoria];
    var tlab = root.querySelector('#eqsTamLbl');
    tlab.textContent = u ? 'Tamaño (' + u + ')' : 'Tamaño / volumen';
    root.querySelectorAll('[data-f="tmin"],[data-f="tmax"]').forEach(function (el) { el.disabled = !u; });
    root.querySelector('#eqsTamHint').hidden = !!u;
    // Modelos sugeridos según marca/categoría elegidas.
    var dl = root.querySelector('#eqsModelos');
    var mods = facet('modelo', function (p) { return p.modelo; });
    dl.innerHTML = Object.keys(mods).sort().map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
  }

  var ACTIVE_LABELS = { q: 'Búsqueda', modelo: 'Modelo', pmin: 'Precio desde', pmax: 'Precio hasta', tmin: 'Tamaño desde', tmax: 'Tamaño hasta', cuotas: 'Con cuotas', ofertas: 'Ofertas / precio bajo', ocultarAgotados: 'Sin agotados' };
  function activePills() {
    var d = defaults();
    var out = [];
    Object.keys(state.f).forEach(function (k) {
      if (k === 'orden' || k === 'moneda' || state.f[k] === d[k]) return;
      var fc = FACETS.filter(function (x) { return x.key === k; })[0];
      var v = state.f[k];
      var txt = fc ? fc.label + ': ' + (fc.text ? fc.text(v) : v) : ACTIVE_LABELS[k] + (typeof v === 'boolean' ? '' : ': ' + (/^p/.test(k) ? money(+v, state.f.moneda) : v + (/^t/.test(k) ? ' ' + UNIDAD[state.f.categoria] : '')));
      out.push('<button type="button" class="eqs__pill" data-clear="' + k + '" aria-label="Quitar filtro ' + esc(txt) + '">' + esc(txt) + '<span aria-hidden="true">×</span></button>');
    });
    return out.join('');
  }

  // ── Render de resultados ───────────────────────────────────────────────
  function tags(p) {
    var t = [];
    if (p.precioOriginal) t.push(['oferta', '−' + Math.round((1 - p.precio.valor / p.precioOriginal.valor) * 100) + '% oferta']);
    else if (p.oferta) t.push(['oferta', 'Oferta']);
    if (p.precioBajo) t.push(['bajo', 'Precio bajo']);
    if (p.cuotas.estado === 'si') t.push(['cuotas', p.cuotas.sinInteres ? 'Cuotas sin interés' : 'Cuotas']);
    if (p.cuotas.estado === 'no') t.push(['nofin', 'Sin financiación']);
    if (p.condicion === 'usado') t.push(['usado', 'Usado']);
    if (p.condicion === 'nuevo') t.push(['nuevo', 'Nuevo']);
    if (p.disponibilidad === 'agotado') t.push(['agotado', 'Agotado']);
    if (p.grupo > 1) t.push(['', p.mejorPrecioGrupo ? 'Mejor precio de ' + p.grupo + ' publicaciones' : 'Publicado ' + p.grupo + ' veces']);
    if (p.envio === 'gratis') t.push(['', 'Envío gratis']);
    return t.map(function (x) { return '<span class="eqs__tag' + (x[0] ? ' eqs__tag--' + x[0] : '') + '">' + esc(x[1]) + '</span>'; }).join('');
  }

  function imgHtml(p) {
    if (p.imagen) return '<img class="eqs__img" src="' + esc(p.imagen) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
    if (p.fotos && p.fotos.length) return '<img class="eqs__img" src="/api/equipos-foto/' + encodeURIComponent(p.fotos[0]) + '" alt="" loading="lazy">';
    return '<span class="eqs__img eqs__img--ph" aria-hidden="true">' + CAT_ICON[p.categoria] + '</span>';
  }

  function priceHtml(p) {
    if (!p.precio) return na('No disponible');
    var h = '<span class="eqs__price">' + (p.precioOriginal ? '<s>' + esc(money(p.precioOriginal.valor, p.precio.moneda)) + '</s>' : '') + esc(money(p.precio.valor, p.precio.moneda)) + '</span>';
    h += '<span class="eqs__sub">' + esc(p.precio.moneda) + (p.envio === 'gratis' ? ' · envío gratis' : typeof p.envio === 'number' ? ' + envío ' + esc(money(p.envio, 'ARS')) : '') + '</span>';
    return h;
  }

  function linkHtml(p) {
    if (!p.link || p.linkRoto) return na('Enlace no disponible');
    return '<a class="eqs__link" href="' + esc(p.link) + '" target="_blank" rel="nofollow noopener" data-out="' + esc(p.id) + '">' + esc(p.fuenteId === 'com' ? 'Contactar' : 'Ver producto') + ' ↗</a>';
  }

  function fechaHtml(iso) {
    if (!iso) return na('No disponible');
    var d = diasDesde(iso);
    return esc(fmtFecha(iso)) + (d != null && d > 3 ? '<span class="eqs__sub" style="color:var(--warn)">Hace ' + d + ' días: puede haber cambiado</span>' : '');
  }

  // El contenido va envuelto en un div: en mobile la celda es una grilla
  // etiqueta | valor y cada hijo suelto ocuparía una columna.
  function cell(label, html, cls) { return '<td data-label="' + esc(label) + '"' + (cls ? ' class="' + cls + '"' : '') + '><div>' + html + '</div></td>'; }
  function orNA(v, alt) { return v ? esc(v) : na(alt); }

  function row(p) {
    var sel = state.cmp.indexOf(p.id) >= 0;
    return '<tr' + (sel ? ' class="is-sel"' : '') + '>' +
      cell('Producto', '<div class="eqs__prod">' + imgHtml(p) + '<div><div class="eqs__title">' + esc(p.titulo) + '</div><div class="eqs__tags">' + tags(p) + '</div></div></div>', 'eqs__td-prod') +
      cell('Comparar', '<label class="eqs__cmpcheck"><input type="checkbox" data-cmp="' + esc(p.id) + '"' + (sel ? ' checked' : '') + '> Comparar</label>') +
      cell('Categoría', esc(CAT[p.categoria]) + (p.subtipo ? '<span class="eqs__sub">' + esc(p.subtipo) + '</span>' : '')) +
      cell('Marca y modelo', orNA(txtMarcaModelo(p)) + (p.tamano ? '<span class="eqs__sub">' + esc(p.tamano.texto) + '</span>' : '')) +
      cell('Año', p.anio ? esc(p.anio) : na()) +
      cell('Precio', priceHtml(p)) +
      cell('Cuotas / financiación', orNA(txtCuotas(p))) +
      cell('Vendedor', orNA(p.vendedor) + '<span class="eqs__sub">vía ' + esc(p.fuente) + '</span>') +
      cell('Estado', orNA(txtEstado(p))) +
      cell('Descripción', '<div class="eqs__desc">' + orNA(txtDesc(p)) + '</div>') +
      cell('Ubicación', orNA(p.ubicacion, 'No disponible')) +
      cell('Disponibilidad', orNA(txtDisp(p))) +
      cell('Actualizado', fechaHtml(p.actualizado)) +
      cell('Enlace', linkHtml(p)) +
      '</tr>';
  }

  var HEAD = ['Producto', 'Comparar', 'Categoría', 'Marca y modelo', 'Año', 'Precio', 'Cuotas / financiación', 'Vendedor', 'Estado', 'Descripción', 'Ubicación', 'Disponibilidad', 'Actualizado', 'Enlace'];

  function renderStatus() {
    var parts = [];
    var ml = state.fuentes.ml, com = state.fuentes.com;
    if (ml) {
      if (!ml.ok) parts.push('<span class="is-err">⚠️ No se pudieron cargar los productos de Mercado Libre. Probá de nuevo más tarde.</span>');
      else {
        var d = diasDesde(ml.actualizado);
        parts.push('<span><b>mercadolibre.com.ar:</b> ' + ml.n + ' productos' + (ml.actualizado ? ' · actualizado el ' + esc(fmtFecha(ml.actualizado)) : '') + (d > 3 ? ' <span class="is-old">(hace ' + d + ' días: se actualiza a diario, precios y stock pueden haber cambiado)</span>' : ' · se actualiza a diario') + '</span>');
      }
    }
    if (com) parts.push(com.ok ? '<span><b>Comunidad:</b> ' + com.n + ' avisos de riders</span>' : '<span class="is-err">⚠️ No se pudieron cargar los avisos de la comunidad.</span>');
    if (ml && ml.dupes) parts.push('<span>' + ml.dupes + ' publicaciones repetidas ocultas</span>');
    root.querySelector('.eqs__status').innerHTML = parts.join('');
  }

  var lastTracked = '';
  function render() {
    FACETS.forEach(renderFacet);
    renderChips();
    syncInputs();
    var list = results();
    var box = root.querySelector('.eqs__results');
    var pills = activePills();
    var catSel = state.f.categoria;
    var head = '<div class="eqs__toolbar"><span class="eqs__count">' + list.length + ' resultado' + (list.length === 1 ? '' : 's') + '</span>' +
      '<div class="eqs__active">' + pills + (pills ? '<button type="button" class="eqs__btn eqs__btn--sm" data-act="clear">Limpiar todo</button>' : '') + '</div>' +
      (catSel && list.length > 1 ? '<button type="button" class="eqs__btn eqs__btn--sm" data-act="autocmp">⚖️ Comparar los primeros ' + Math.min(MAX_CMP, list.length) + '</button>' : '') +
      '<label class="eqs__sort">Ordenar por <select data-f="orden">' +
      [['relevancia', 'Relevancia'], ['precio_asc', 'Precio: menor a mayor'], ['precio_desc', 'Precio: mayor a menor'], ['anio_desc', 'Año: más nuevo'], ['anio_asc', 'Año: más viejo'], ['marca', 'Marca (A-Z)'], ['ppu', 'Precio por L / m²']]
        .map(function (o) { return '<option value="' + o[0] + '"' + (state.f.orden === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label></div>';

    var body;
    if (!list.length) {
      body = '<div class="eqs__empty"><strong>No encontramos equipos con esos filtros.</strong>Probá con menos filtros, otra palabra (por ejemplo "ala" en vez de "wing 5m") o mirá todas las categorías.' +
        '<br><button type="button" class="eqs__btn" data-act="clear">Limpiar filtros</button></div>';
    } else {
      var visible = list.slice(0, state.shown);
      body = '<div class="eqs__tablewrap"><table class="eqs__table"><thead><tr>' + HEAD.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        visible.map(row).join('') + '</tbody></table></div>' +
        (list.length > visible.length ? '<div class="eqs__more"><button type="button" class="eqs__btn" data-act="more">Mostrar ' + Math.min(PAGE, list.length - visible.length) + ' más (quedan ' + (list.length - visible.length) + ')</button></div>' : '');
      var usdFuera = (state.f.pmin !== '' || state.f.pmax !== '') ? state.items.filter(function (p) { return p.precio && p.precio.moneda !== state.f.moneda; }).length : 0;
      if (usdFuera) body += '<p class="eqs__notice">' + usdFuera + ' producto(s) publicados en otra moneda no entran en el filtro de precio en ' + state.f.moneda + '.</p>';
    }
    box.innerHTML = head + body;
    renderStatus();
    renderTray();
    renderCmp();

    var sig = JSON.stringify(state.f);
    if (sig !== lastTracked && state.items.length) {
      lastTracked = sig;
      clearTimeout(render._t);
      render._t = setTimeout(function () {
        track('equipos_busqueda', { search_term: state.f.q || undefined, equipos_categoria: state.f.categoria || 'todas', equipos_marca: state.f.marca || undefined, equipos_orden: state.f.orden, equipos_resultados: list.length });
      }, 1200);
    }
  }

  // ── Comparador ─────────────────────────────────────────────────────────
  function cmpItems() { return state.cmp.map(byId).filter(Boolean); }

  function toast(html) {
    var t = root.querySelector('.eqs__toastslot');
    t.innerHTML = html ? '<div class="eqs__toast" role="status">' + html + '</div>' : '';
  }

  function addCmp(id) {
    var p = byId(id);
    if (!p || state.cmp.indexOf(id) >= 0) return true;
    var cur = cmpItems();
    if (cur.length && cur[0].categoria !== p.categoria) {
      toast('Sólo se comparan productos de la misma categoría: tu selección es de <b>' + esc(CAT_PLURAL[cur[0].categoria]) + '</b>. ' +
        '<button type="button" class="eqs__btn eqs__btn--sm" data-act="replacecmp" data-id="' + esc(id) + '">Empezar una comparación de ' + esc(CAT_PLURAL[p.categoria]) + '</button>');
      return false;
    }
    if (cur.length >= MAX_CMP) {
      toast('Podés comparar hasta ' + MAX_CMP + ' productos a la vez. Quitá alguno para sumar otro.');
      return false;
    }
    state.cmp.push(id);
    saveCmp();
    toast('');
    track('equipos_comparar_agregar', { equipos_categoria: p.categoria, equipos_marca: p.marca || undefined, equipos_fuente: p.fuente });
    return true;
  }
  function removeCmp(id) {
    state.cmp = state.cmp.filter(function (x) { return x !== id; });
    saveCmp();
  }

  function renderTray() {
    var tray = root.querySelector('.eqs__tray');
    var items = cmpItems();
    tray.hidden = !items.length;
    if (!items.length) return;
    tray.innerHTML = '<strong>⚖️ ' + items.length + ' ' + (items.length === 1 ? CAT[items[0].categoria].toLowerCase() : CAT_PLURAL[items[0].categoria].toLowerCase()) + ' para comparar</strong>' +
      (items.length < 2 ? '<span class="eqs__sub">Elegí al menos otro de la misma categoría</span>' : '<button type="button" class="eqs__btn eqs__btn--primary eqs__btn--sm" data-act="gocmp">Ver comparación</button>') +
      '<button type="button" class="eqs__btn eqs__btn--sm" data-act="clearcmp">Vaciar</button>';
  }

  // Filas del comparador: [etiqueta, texto, valor numérico para destacar el
  // mejor, 'min'|'max'].
  function cmpRows(items) {
    return [
      ['Precio', function (p) { return p.precio ? money(p.precio.valor, p.precio.moneda) : null; }, function (p) { return p.precioARS; }, 'min'],
      ['Precio vs. mediana de la categoría', function (p) { return p.precioARS && p.medianaCategoria ? (p.precioARS <= p.medianaCategoria ? '−' : '+') + Math.abs(Math.round((p.precioARS / p.medianaCategoria - 1) * 100)) + '% (' + money(p.medianaCategoria, 'ARS') + ')' : null; }],
      ['Relación precio / tamaño', txtPPU, function (p) { return p.precioPorUnidad; }, 'min'],
      ['Marca', function (p) { return p.marca; }],
      ['Modelo', function (p) { return p.modelo; }],
      ['Año', function (p) { return p.anio ? String(p.anio) : null; }, function (p) { return p.anio; }, 'max'],
      ['Tamaño / volumen', function (p) { return p.tamano && p.tamano.texto; }],
      ['Peso', function (p) { return p.peso && p.peso.texto; }, function (p) { return p.peso && p.peso.valor; }, 'min'],
      ['Material', function (p) { return p.materiales.join(', '); }],
      ['Nivel recomendado', txtNivel],
      ['Uso principal', function (p) { return p.usos.join(', '); }],
      ['Estado', txtEstado],
      ['Cuotas', txtCuotas],
      ['Envío', txtEnvio],
      ['Vendedor', function (p) { return p.vendedor ? p.vendedor + ' (' + p.fuente + ')' : null; }],
      ['Disponibilidad', txtDisp],
      ['Ubicación', function (p) { return p.ubicacion; }],
      ['Actualizado', function (p) { return p.actualizado ? fmtFecha(p.actualizado) : null; }],
    ];
  }

  function bestOf(items, num, dir) {
    var vals = items.map(num).filter(function (v) { return v != null && isFinite(v); });
    if (vals.length < 2) return null;
    var b = dir === 'min' ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
    return vals.every(function (v) { return v === b; }) ? null : b;
  }

  function verdict(items) {
    var out = [];
    var pick = function (label, num, dir, fmt) {
      var b = bestOf(items, num, dir);
      if (b == null) return;
      var p = items.filter(function (x) { return num(x) === b; })[0];
      out.push('<div><b>' + label + '</b>' + esc(p.titulo) + (fmt ? ' · ' + esc(fmt(p)) : '') + '</div>');
    };
    pick('Más barato', function (p) { return p.precioARS; }, 'min', function (p) { return money(p.precio.valor, p.precio.moneda); });
    pick('Mejor precio por tamaño', function (p) { return p.precioPorUnidad; }, 'min', txtPPU);
    pick('Más nuevo', function (p) { return p.anio; }, 'max', function (p) { return String(p.anio); });
    var conCuotas = items.filter(function (p) { return p.cuotas.estado === 'si'; });
    if (conCuotas.length && conCuotas.length < items.length) out.push('<div><b>Con cuotas</b>' + conCuotas.map(function (p) { return esc(p.titulo); }).join(' · ') + '</div>');
    return out.join('');
  }

  function renderCmp() {
    var box = root.querySelector('.eqs__cmp');
    var items = cmpItems();
    if (items.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    var cat = items[0].categoria;
    var rows = cmpRows(items);
    var body = rows.map(function (r) {
      var vals = items.map(function (p) { return r[1](p) || null; });
      var diff = vals.some(function (v) { return v !== vals[0]; });
      if (state.soloDiff && !diff) return '';
      var best = r[2] ? bestOf(items, r[2], r[3]) : null;
      return '<tr' + (diff ? ' class="is-diff"' : '') + '><th scope="row">' + esc(r[0]) + '</th>' + items.map(function (p, i) {
        var v = vals[i];
        var isBest = best != null && r[2](p) === best;
        return '<td>' + (v ? '<span' + (isBest ? ' class="eqs__best"' : '') + '>' + esc(v) + '</span>' : na(r[0] === 'Ubicación' ? 'No disponible' : NA)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var headRow = '<tr><th scope="row">Producto</th>' + items.map(function (p) {
      return '<td>' + imgHtml(p) + '<div class="eqs__title" style="margin-top:8px">' + esc(p.titulo) + '</div><div class="eqs__tags">' + tags(p) + '</div>' +
        '<div class="eqs__rm" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' + linkHtml(p) + '<button type="button" class="eqs__btn eqs__btn--sm" data-act="rmcmp" data-id="' + esc(p.id) + '">Quitar</button></div></td>';
    }).join('') + '</tr>';
    box.innerHTML = '<div class="eqs__cmphead"><div><h3>Comparador de ' + esc(CAT_PLURAL[cat].toLowerCase()) + '</h3>' +
      '<p>Diferencias clave entre ' + items.length + ' productos. ★ marca el mejor valor en cada fila; la barra azul, las filas donde difieren.</p></div>' +
      '<div class="eqs__actions"><label class="eqs__cmpcheck"><input type="checkbox" data-act="solodiff"' + (state.soloDiff ? ' checked' : '') + '> Sólo diferencias</label>' +
      '<button type="button" class="eqs__btn eqs__btn--sm" data-act="clearcmp">Vaciar comparación</button></div></div>' +
      '<div class="eqs__verdict">' + verdict(items) + '</div>' +
      '<div class="eqs__tablewrap"><table class="eqs__cmptable"><thead>' + headRow + '</thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="eqs__notice">Los datos salen de cada publicación; lo que el vendedor no informa figura como "No especificado". El nivel por volumen es orientativo: consultalo con tu instructor.</p>';
  }

  // ── Eventos ─────────────────────────────────────────────────────────────
  function setF(k, v) {
    state.f[k] = v;
    if (k === 'categoria') { state.f.subtipo = ''; state.f.tmin = ''; state.f.tmax = ''; }
    state.shown = PAGE;
    render();
  }

  var qTimer;
  root.addEventListener('input', function (e) {
    var k = e.target.getAttribute('data-f');
    if (!k || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { setF(k, e.target.value.trim()); }, 250);
  });
  root.addEventListener('change', function (e) {
    var t = e.target;
    var k = t.getAttribute('data-f');
    if (k && (t.tagName === 'SELECT' || t.type === 'checkbox')) return setF(k, t.type === 'checkbox' ? t.checked : t.value);
    if (t.hasAttribute('data-cmp')) {
      var id = t.getAttribute('data-cmp');
      if (t.checked) { if (!addCmp(id)) t.checked = false; } else removeCmp(id);
      render();
    }
    if (t.getAttribute('data-act') === 'solodiff') { state.soloDiff = t.checked; renderCmp(); }
  });
  root.addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(qTimer);
    setF('q', root.querySelector('[data-f="q"]').value.trim());
    root.querySelector('.eqs__results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    if (t.hasAttribute('data-cat')) return setF('categoria', t.getAttribute('data-cat'));
    if (t.hasAttribute('data-clear')) {
      var k = t.getAttribute('data-clear');
      return setF(k, defaults()[k]);
    }
    if (t.hasAttribute('data-out')) {
      var p = byId(t.getAttribute('data-out'));
      if (p) track('equipos_click_producto', { equipos_fuente: p.fuente, equipos_categoria: p.categoria, equipos_marca: p.marca || undefined, value: p.precioARS || undefined, currency: 'ARS', link_url: p.link });
      return;
    }
    var act = t.getAttribute('data-act');
    if (!act) return;
    if (act === 'clear') { state.f = defaults(); state.shown = PAGE; toast(''); render(); }
    else if (act === 'more') { state.shown += PAGE; render(); }
    else if (act === 'toggle-filters') {
      var fl = root.querySelector('.eqs__filters');
      var open = fl.getAttribute('data-open') !== 'true';
      fl.setAttribute('data-open', String(open));
      t.setAttribute('aria-expanded', String(open));
    }
    else if (act === 'clearcmp') { state.cmp = []; saveCmp(); toast(''); render(); }
    else if (act === 'rmcmp') { removeCmp(t.getAttribute('data-id')); render(); }
    else if (act === 'replacecmp') { state.cmp = []; addCmp(t.getAttribute('data-id')); render(); }
    else if (act === 'autocmp') {
      state.cmp = [];
      results().slice(0, MAX_CMP).forEach(function (p) { addCmp(p.id); });
      render();
      goCmp();
    }
    else if (act === 'gocmp') goCmp();
  });
  function goCmp() {
    var box = root.querySelector('.eqs__cmp');
    if (box.hidden) return;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var items = cmpItems();
    track('equipos_comparar_ver', { equipos_categoria: items[0] && items[0].categoria, equipos_cantidad: items.length });
  }

  // ── Carga de datos ─────────────────────────────────────────────────────
  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    var comunidad = window.EQ_COMUNIDAD || getJSON('/api/equipos');
    Promise.allSettled([getJSON('/ml-data.json'), comunidad]).then(function (res) {
      var all = [];
      var now = new Date();
      if (res[0].status === 'fulfilled') {
        var ml = N.fromMercadoLibre(res[0].value, now);
        state.tipoCambioUSD = +res[0].value.tipoCambioUSD || null;
        state.fuentes.ml = { ok: true, n: ml.length, actualizado: res[0].value.actualizado };
        all = all.concat(ml);
      } else state.fuentes.ml = { ok: false };
      if (res[1].status === 'fulfilled') {
        var com = N.fromComunidad(res[1].value, now);
        state.fuentes.com = { ok: true, n: com.length };
        all = all.concat(com);
      } else state.fuentes.com = { ok: false };
      var total = all.length;
      state.items = N.dedupe(all);
      if (state.fuentes.ml && state.fuentes.ml.ok) state.fuentes.ml.dupes = total - state.items.length;
      N.marcarPrecioBajo(state.items, state.tipoCambioUSD);
      state.cmp = state.cmp.filter(byId);
      saveCmp();
      render();
    });
  }

  // Carga diferida: cuando la sección se acerca al viewport o se abre la
  // solapa, así no compite con el contenido de arriba de la página.
  var section = document.getElementById('venta-de-wingfoil');
  if ('IntersectionObserver' in window && section) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: '600px 0px' });
    io.observe(section);
  } else load();
  window.EQS_LOAD = load;
})();
