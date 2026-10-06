/* ml-dashboard.js — dashboard de equipos de wingfoil en Mercado Libre
 * (sección #venta-de-wingfoil). Lee /api/ml-dashboard: una lista de
 * relevamientos (fecha + productos de los links de ml-links.json) y arma
 * rankings por marca y categoría, la evolución del puesto, precios por
 * categoría y la lista filtrable de productos.
 *
 * Categoría y marca salen del título con window.EquipoNormalizer (salvo que
 * el link las traiga fijas). Gráficos con Chart.js, cargado sólo cuando la
 * sección se ve.
 */
(function () {
  'use strict';

  var root = document.getElementById('mlDash');
  if (!root) return;

  var CHART_SRC = '/assets/vendor/chart-4.4.4.umd.js';
  var CATS = ['Tablas', 'Wings', 'Foils', 'Neoprenes', 'Accesorios', 'Equipos completos'];
  var COLORES = ['#0096c7', '#e9c46a', '#2a9d8f', '#e76f51', '#9b5de5', '#f4a261', '#43aa8b', '#f15bb5', '#7eaec5'];
  var TOP_SERIES = 5;

  var state = { data: null, cat: 'Todas', fechaCaros: null, ordenCaros: 'desc', q: '', marca: '', vendedor: '', orden: 'puesto', limite: 20 };
  var charts = {};

  // ── Utilidades ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel) { return root.querySelector(sel); }
  function plata(n) { return n == null ? '—' : '$ ' + Math.round(n).toLocaleString('es-AR'); }
  function plataCorta(n) {
    if (n >= 1e6) return '$ ' + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1e3) return '$ ' + Math.round(n / 1e3).toLocaleString('es-AR') + ' mil';
    return '$ ' + Math.round(n);
  }
  function fechaCorta(f) { var p = f.split('-'); return p[2] + '/' + p[1]; }
  function fechaLarga(f) { var p = f.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function urlClave(u) { return String(u || '').split(/[?#]/)[0].replace(/\/+$/, '').toLowerCase(); }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function categoria(p) {
    if (p.categoria && CATS.indexOf(p.categoria) >= 0) return p.categoria;
    var N = window.EquipoNormalizer;
    var t = p.titulo || '';
    if (/neopren|traje|guante|bot(a|in)|lycra|poncho/i.test(t)) return 'Neoprenes';
    var c = N ? N.detectCategoria(t) : 'otro';
    if (c === 'tabla') return 'Tablas';
    if (c === 'ala') return 'Wings';
    if (c === 'foil' || c === 'mastil' || c === 'fuselaje' || c === 'plano') return 'Foils';
    if (c === 'kit') return 'Equipos completos';
    return 'Accesorios';
  }
  function marca(p) {
    var N = window.EquipoNormalizer;
    return p.marca || (N && N.detectMarca(p.titulo || '')) || 'Sin marca';
  }

  // ── Modelo: productos por relevamiento, con puesto en el ranking ────────
  // Puesto = orden por unidades vendidas que informa ML; a igualdad (o sin
  // ese dato), el puesto que muestra ML y después el orden de los links.
  function preparar(raw) {
    var info = {}; // datos más recientes de cada producto (título, imagen…)
    raw.relevamientos.forEach(function (r) {
      r.productos.forEach(function (p) {
        if (!p.ok && p.ok !== undefined) return;
        var k = urlClave(p.url);
        info[k] = Object.assign({}, info[k] || {}, Object.keys(p).reduce(function (o, key) {
          if (p[key] != null) o[key] = p[key];
          return o;
        }, {}));
      });
    });
    Object.keys(info).forEach(function (k) {
      info[k].clave = k;
      info[k].cat = categoria(info[k]);
      info[k].marcaN = marca(info[k]);
    });
    var rels = raw.relevamientos.map(function (r) {
      var prods = r.productos.filter(function (p) { return p.ok !== false && p.precio != null; }).map(function (p, idx) {
        var k = urlClave(p.url);
        return Object.assign({}, p, { clave: k, orden: p.i != null ? p.i : idx, cat: info[k].cat, marcaN: info[k].marcaN, titulo: p.titulo || info[k].titulo, imagen: p.imagen || info[k].imagen });
      });
      return { fecha: r.fecha, productos: prods, conVentas: prods.some(function (p) { return p.vendidos != null; }) };
    });
    return { rels: rels, info: info, servicio: raw.servicio, links: raw.links };
  }

  function rankear(prods) {
    var nulo = function (v, def) { return v == null ? def : v; };
    var arr = prods.slice().sort(function (a, b) {
      return nulo(b.vendidos, -1) - nulo(a.vendidos, -1)
        || nulo(a.mlPuesto, 1e9) - nulo(b.mlPuesto, 1e9)
        || a.orden - b.orden;
    });
    arr.forEach(function (p, i) { p.puesto = i + 1; });
    return arr;
  }

  function filtrarCat(prods) {
    return state.cat === 'Todas' ? prods : prods.filter(function (p) { return p.cat === state.cat; });
  }

  function relsFiltrados() {
    return state.data.rels.map(function (r) {
      return { fecha: r.fecha, conVentas: r.conVentas, productos: rankear(filtrarCat(r.productos)) };
    });
  }

  // Participación: unidades vendidas si ML las informa; si no, productos en
  // el ranking. Devuelve [{nombre, valor}] ordenado, con "Otras" al final.
  function participacion(prods, campo, max) {
    var usarVentas = prods.some(function (p) { return p.vendidos != null; });
    var acc = {};
    prods.forEach(function (p) { acc[p[campo]] = (acc[p[campo]] || 0) + (usarVentas ? (p.vendidos || 0) : 1); });
    var arr = Object.keys(acc).map(function (k) { return { nombre: k, valor: acc[k] }; })
      .filter(function (x) { return x.valor > 0; })
      .sort(function (a, b) { return b.valor - a.valor; });
    if (max && arr.length > max) {
      var resto = arr.slice(max - 1).reduce(function (s, x) { return s + x.valor; }, 0);
      arr = arr.slice(0, max - 1).concat([{ nombre: 'Otras', valor: resto }]);
    }
    return { items: arr, usarVentas: usarVentas };
  }

  // ── Gráficos ─────────────────────────────────────────────────────────
  function cargarChart() {
    if (window.Chart) return Promise.resolve();
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = CHART_SRC; s.onload = ok; s.onerror = mal;
      document.head.appendChild(s);
    });
  }

  function tema() {
    var Chart = window.Chart;
    Chart.defaults.color = css('--text-muted') || '#6da4be';
    Chart.defaults.borderColor = css('--divider') || '#142840';
    Chart.defaults.font.family = "'Satoshi', system-ui, sans-serif";
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
  }

  function dibujar(id, cfg) {
    if (charts[id]) charts[id].destroy();
    var cv = $('#' + id);
    if (!cv) return;
    charts[id] = new window.Chart(cv, cfg);
  }

  function torta(id, part, vacio) {
    var box = $('#' + id).parentNode;
    box.classList.toggle('is-empty', !part.items.length);
    box.setAttribute('data-empty', vacio);
    dibujar(id, {
      type: 'doughnut',
      data: {
        labels: part.items.map(function (x) { return x.nombre; }),
        datasets: [{ data: part.items.map(function (x) { return x.valor; }), backgroundColor: COLORES, borderColor: css('--surface'), borderWidth: 2 }],
      },
      options: {
        maintainAspectRatio: false, cutout: '55%',
        plugins: {
          legend: { position: window.innerWidth < 600 ? 'bottom' : 'right' },
          tooltip: { callbacks: { label: function (c) {
            var tot = c.dataset.data.reduce(function (s, v) { return s + v; }, 0);
            return ' ' + c.label + ': ' + c.raw + (part.usarVentas ? ' vendidos' : ' productos') + ' (' + Math.round(c.raw / tot * 100) + '%)';
          } } },
        },
      },
    });
  }

  function lineaPuesto(id, fechas, series) {
    var maxPuesto = 1;
    series.forEach(function (s) { s.data.forEach(function (v) { if (v > maxPuesto) maxPuesto = v; }); });
    dibujar(id, {
      type: 'line',
      data: {
        labels: fechas.map(fechaCorta),
        datasets: series.map(function (s, i) {
          return { label: s.label, data: s.data, borderColor: COLORES[i], backgroundColor: COLORES[i], tension: .25, spanGaps: true, pointRadius: 4 };
        }),
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: { y: { reverse: true, min: 1, suggestedMax: Math.max(5, maxPuesto), ticks: { precision: 0, callback: function (v) { return v + 'º'; } }, title: { display: true, text: 'Puesto' } } },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + c.raw + 'º'; } } },
        },
      },
    });
  }

  function corto(t, n) { t = t || ''; return t.length > n ? t.slice(0, n - 1) + '…' : t; }

  function render() {
    var rels = relsFiltrados();
    var ultimo = rels[rels.length - 1];
    var fechas = rels.map(function (r) { return r.fecha; });
    var prods = ultimo.productos;

    // Tortas
    // "Sin marca" (títulos que no nombran ninguna) no compite en la torta.
    var pm = participacion(prods.filter(function (p) { return p.marcaN !== 'Sin marca'; }), 'marcaN', 8);
    torta('mldPieMarcas', pm, 'Sin productos en esta categoría');
    $('#mldPieMarcasSub').textContent = pm.usarVentas ? 'Unidades vendidas que informa Mercado Libre' : 'Productos de cada marca en el ranking';
    var pc = participacion(state.data.rels[state.data.rels.length - 1].productos, 'cat', 8);
    torta('mldPieCats', pc, 'Sin datos');
    $('#mldPieCatsSub').textContent = pc.usarVentas ? 'Unidades vendidas que informa Mercado Libre' : 'Productos de cada categoría en el ranking';

    // Top vendedores (barras): ventas informadas o cantidad de productos
    var pv = participacion(prods.filter(function (p) { return p.vendedor; }), 'vendedor', 0);
    pv.items = pv.items.slice(0, 10);
    $('#mldVendVacio').hidden = !!pv.items.length;
    $('#mldVend').parentNode.hidden = !pv.items.length;
    $('#mldVendSub').textContent = pv.usarVentas ? 'Unidades vendidas que informa Mercado Libre, top 10' : 'Productos de cada vendedor en el ranking, top 10';
    if (pv.items.length) {
      $('#mldVend').parentNode.style.height = Math.max(160, pv.items.length * 34 + 40) + 'px';
      dibujar('mldVend', {
        type: 'bar',
        data: { labels: pv.items.map(function (x) { return x.nombre; }), datasets: [{ data: pv.items.map(function (x) { return x.valor; }), backgroundColor: COLORES[0], borderRadius: 4 }] },
        options: {
          indexAxis: 'y', maintainAspectRatio: false,
          scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' ' + c.raw + (pv.usarVentas ? ' vendidos' : ' productos'); } } } },
        },
      });
    } else if (charts.mldVend) { charts.mldVend.destroy(); delete charts.mldVend; }

    // Evolución del puesto: top productos del último relevamiento
    var top = prods.slice(0, TOP_SERIES);
    lineaPuesto('mldEvoProd', fechas, top.map(function (p) {
      return { label: corto(p.titulo, 32), data: rels.map(function (r) {
        var x = r.productos.find(function (q) { return q.clave === p.clave; });
        return x ? x.puesto : null;
      }) };
    }));
    // Top marcas: mejor puesto de cada marca en cada fecha
    var marcasTop = pm.items.filter(function (x) { return x.nombre !== 'Otras' && x.nombre !== 'Sin marca'; }).slice(0, TOP_SERIES);
    lineaPuesto('mldEvoMarcas', fechas, marcasTop.map(function (m) {
      return { label: m.nombre, data: rels.map(function (r) {
        var x = r.productos.find(function (q) { return q.marcaN === m.nombre; });
        return x ? x.puesto : null;
      }) };
    }));
    var unRel = rels.length < 2;
    root.querySelectorAll('.mld__evo-hint').forEach(function (el) { el.hidden = !unRel; });

    // Precios por categoría (último relevamiento, todas las categorías)
    var porCat = {};
    state.data.rels[state.data.rels.length - 1].productos.forEach(function (p) { (porCat[p.cat] = porCat[p.cat] || []).push(p.precio); });
    var catsConDatos = CATS.filter(function (c) { return porCat[c]; });
    var stats = catsConDatos.map(function (c) {
      var a = porCat[c];
      return { min: Math.min.apply(null, a), max: Math.max.apply(null, a), prom: a.reduce(function (s, v) { return s + v; }, 0) / a.length };
    });
    // Escala logarítmica: sólo las potencias de 10 llevan etiqueta.
    var ticksPlata = { autoSkip: false, callback: function (v) {
      var e = Math.log10(v);
      return Math.abs(e - Math.round(e)) < 1e-9 ? plataCorta(v) : '';
    } };
    dibujar('mldPrecios', {
      type: 'bar',
      data: {
        labels: catsConDatos,
        datasets: [
          { label: 'Más barato', data: stats.map(function (s) { return s.min; }), backgroundColor: COLORES[2] },
          { label: 'Promedio', data: stats.map(function (s) { return s.prom; }), backgroundColor: COLORES[0] },
          { label: 'Más caro', data: stats.map(function (s) { return s.max; }), backgroundColor: COLORES[3] },
        ],
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { type: 'logarithmic', ticks: ticksPlata } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + plata(c.raw); } } } },
      },
    });
    // Precio promedio por categoría en el tiempo
    dibujar('mldPreciosEvo', {
      type: 'line',
      data: {
        labels: fechas.map(fechaCorta),
        datasets: catsConDatos.map(function (c, i) {
          return { label: c, borderColor: COLORES[i], backgroundColor: COLORES[i], tension: .25, spanGaps: true, pointRadius: 4,
            data: state.data.rels.map(function (r) {
              var a = r.productos.filter(function (p) { return p.cat === c; }).map(function (p) { return p.precio; });
              return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : null;
            }) };
        }),
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { type: 'logarithmic', ticks: ticksPlata } },
        plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ' + plata(c.raw); } } } },
      },
    });

    renderCaros(rels);
    renderLista(prods);
  }

  // Más caros (o más baratos) en la fecha elegida
  function renderCaros(rels) {
    var sel = $('#mldFechaCaros');
    var fechas = rels.map(function (r) { return r.fecha; });
    if (!state.fechaCaros || fechas.indexOf(state.fechaCaros) < 0) state.fechaCaros = fechas[fechas.length - 1];
    sel.innerHTML = fechas.slice().reverse().map(function (f) {
      return '<option value="' + f + '"' + (f === state.fechaCaros ? ' selected' : '') + '>' + fechaLarga(f) + '</option>';
    }).join('');
    var r = rels.find(function (x) { return x.fecha === state.fechaCaros; });
    var arr = r.productos.slice().sort(function (a, b) { return state.ordenCaros === 'desc' ? b.precio - a.precio : a.precio - b.precio; }).slice(0, 10);
    $('#mldOrdenCaros').textContent = state.ordenCaros === 'desc' ? '↓ De caro a barato' : '↑ De barato a caro';
    $('#mldCaros').innerHTML = arr.length ? arr.map(function (p, i) {
      return '<li><span class="mld__n">' + (i + 1) + '</span><a href="' + esc(p.url) + '" target="_blank" rel="noopener nofollow">' + esc(p.titulo) + '</a>' +
        '<span class="mld__tag">' + esc(p.cat) + '</span><b>' + plata(p.precio) + '</b></li>';
    }).join('') : '<li class="mld__vacio">Sin productos en esta categoría</li>';
  }

  // Lista con filtros
  function opciones(sel, valores, actual, todos) {
    sel.innerHTML = '<option value="">' + todos + '</option>' + valores.map(function (v) {
      return '<option' + (v === actual ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  function renderLista(prods) {
    var uniq = function (campo) {
      var s = {};
      prods.forEach(function (p) { if (p[campo]) s[p[campo]] = 1; });
      return Object.keys(s).sort(function (a, b) { return a.localeCompare(b, 'es'); });
    };
    var vendedores = uniq('vendedor');
    opciones($('#mldMarca'), uniq('marcaN'), state.marca, 'Todas las marcas');
    opciones($('#mldVendedor'), vendedores, state.vendedor, vendedores.length ? 'Todos los vendedores' : 'Sin datos de vendedor');
    $('#mldVendedor').disabled = !vendedores.length;

    var N = window.EquipoNormalizer;
    var q = N ? N.fold(state.q) : state.q.toLowerCase();
    var arr = prods.filter(function (p) {
      if (state.marca && p.marcaN !== state.marca) return false;
      if (state.vendedor && p.vendedor !== state.vendedor) return false;
      if (q && (N ? N.fold(p.titulo + ' ' + p.marcaN) : (p.titulo + ' ' + p.marcaN).toLowerCase()).indexOf(q) < 0) return false;
      return true;
    });
    var ord = {
      puesto: function (a, b) { return a.puesto - b.puesto; },
      barato: function (a, b) { return a.precio - b.precio; },
      caro: function (a, b) { return b.precio - a.precio; },
    }[state.orden];
    arr.sort(ord);

    $('#mldCount').textContent = arr.length + (arr.length === 1 ? ' producto' : ' productos');
    var mas = $('#mldMas');
    mas.hidden = arr.length <= state.limite;
    mas.textContent = 'Ver ' + (arr.length - state.limite) + ' productos más';
    $('#mldTabla').innerHTML = arr.length ? arr.slice(0, state.limite).map(function (p) {
      var oficial = p.tiendaOficial ? plata(p.precio) + '<small>Tienda oficial</small>'
        : p.precioDesde ? plata(p.precioDesde) + '<small>Mejor precio del catálogo</small>' : '<span class="mld__nd">No informa</span>';
      var vend = p.vendedor ? esc(p.vendedor) : '<span class="mld__nd">No informa</span>';
      if (p.opciones) vend += '<small>' + p.opciones + ' vendedores en total</small>';
      return '<tr>' +
        '<td data-l="Puesto"><span class="mld__puesto">' + p.puesto + 'º</span></td>' +
        '<td data-l="Producto"><div class="mld__prod">' + (p.imagen ? '<img src="' + esc(p.imagen) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '') +
          '<span>' + esc(p.titulo) + '</span></div></td>' +
        '<td data-l="Categoría">' + esc(p.cat) + '</td>' +
        '<td data-l="Marca">' + esc(p.marcaN) + '</td>' +
        '<td data-l="Precio del link"><b>' + plata(p.precio) + '</b>' + (p.precioOriginal ? '<small><s>' + plata(p.precioOriginal) + '</s></small>' : '') + '</td>' +
        '<td data-l="Precio oficial ML">' + oficial + '</td>' +
        '<td data-l="Vendedor">' + vend + '</td>' +
        '<td data-l="Vendidos">' + (p.vendidos != null ? '+' + p.vendidos.toLocaleString('es-AR') : '<span class="mld__nd">—</span>') + '</td>' +
        '<td><a class="mld__ver" href="' + esc(p.url) + '" target="_blank" rel="noopener nofollow">Ver en ML ↗</a></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="9" class="mld__vacio">No hay productos con estos filtros</td></tr>';
  }

  function renderEstado() {
    var d = state.data;
    var ultimo = d.rels[d.rels.length - 1];
    $('#mldEstado').innerHTML = 'Último relevamiento: <b>' + fechaLarga(ultimo.fecha) + '</b> · <b>' + ultimo.productos.length + '</b> productos · <b>' +
      d.rels.length + '</b> ' + (d.rels.length === 1 ? 'relevamiento' : 'relevamientos') + ' en el historial';
  }

  function renderChips() {
    var cats = ['Todas'].concat(CATS);
    var ultimo = state.data.rels[state.data.rels.length - 1].productos;
    $('#mldChips').innerHTML = cats.map(function (c) {
      var n = c === 'Todas' ? ultimo.length : ultimo.filter(function (p) { return p.cat === c; }).length;
      return '<button type="button" class="mld__chip" data-cat="' + c + '" aria-pressed="' + (c === state.cat) + '"' + (n ? '' : ' disabled') + '>' + c + ' <small>' + n + '</small></button>';
    }).join('');
  }

  // ── Relevar ahora ────────────────────────────────────────────────────
  function aviso(txt, tipo) {
    var el = $('#mldAviso');
    el.textContent = txt;
    el.className = 'mld__aviso' + (tipo ? ' is-' + tipo : '');
    el.hidden = !txt;
  }

  function post(body) {
    return fetch('/api/ml-dashboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  function relevar() {
    var btn = $('#mldRelevar');
    if (!state.data.servicio) {
      aviso('El relevamiento automático todavía no está conectado: se muestran los datos del ' + fechaLarga(state.data.rels[state.data.rels.length - 1].fecha) + '.', 'warn');
      return;
    }
    btn.disabled = true;
    var total = state.data.links, sig = 0, hechos = 0, buenos = 0;
    aviso('Relevando 0 de ' + total + '…');
    function worker() {
      if (sig >= total) return Promise.resolve();
      var i = sig++;
      return post({ i: i }).then(function (r) {
        hechos++; if (r && r.ok) buenos++;
        aviso('Relevando ' + hechos + ' de ' + total + '…');
      }, function () { hechos++; }).then(worker);
    }
    Promise.all([worker(), worker(), worker(), worker()])
      .then(function () { return post({ cerrar: 1 }); })
      .then(function () { return cargar(true); })
      .then(function () {
        aviso(buenos ? 'Listo: se relevaron ' + buenos + ' de ' + total + ' productos.' : 'Mercado Libre no devolvió datos esta vez. Se muestran los últimos datos buenos.', buenos ? 'ok' : 'warn');
      }, function () { aviso('No se pudo completar el relevamiento. Probá de nuevo en un rato.', 'warn'); })
      .then(function () { btn.disabled = false; });
  }

  // ── Arranque ─────────────────────────────────────────────────────────
  function cargar(fresco) {
    return fetch('/api/ml-dashboard' + (fresco ? '?t=' + Date.now() : ''))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (raw) {
        state.data = preparar(raw);
        root.classList.remove('is-loading');
        renderEstado(); renderChips(); render();
      });
  }

  function eventos() {
    root.addEventListener('click', function (e) {
      var chip = e.target.closest('.mld__chip');
      if (chip) { state.cat = chip.getAttribute('data-cat'); state.limite = 20; renderChips(); render(); return; }
      if (e.target.closest('#mldRelevar')) { relevar(); return; }
      if (e.target.closest('#mldMas')) { state.limite = 1e9; renderLista(relsFiltrados().slice(-1)[0].productos); return; }
      if (e.target.closest('#mldOrdenCaros')) { state.ordenCaros = state.ordenCaros === 'desc' ? 'asc' : 'desc'; renderCaros(relsFiltrados()); }
    });
    root.addEventListener('input', function (e) {
      var f = e.target.getAttribute('data-f');
      if (!f) return;
      state[f] = e.target.value;
      state.limite = 20;
      if (f === 'fechaCaros') renderCaros(relsFiltrados());
      else renderLista(relsFiltrados().slice(-1)[0].productos);
    });
    // Cambio de tema claro/oscuro: redibujar con los colores nuevos.
    new MutationObserver(function () { if (window.Chart && state.data) { tema(); render(); } })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  var iniciado = false;
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    eventos();
    cargarChart().then(function () { tema(); return cargar(false); }).catch(function (e) {
      if (window.console) console.error('ml-dashboard', e);
      root.classList.remove('is-loading');
      aviso('No se pudieron cargar los datos del dashboard. Probá recargar la página.', 'warn');
    });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) {
      if (en.some(function (x) { return x.isIntersecting; })) { io.disconnect(); iniciar(); }
    }, { rootMargin: '400px' });
    io.observe(root);
  } else iniciar();
})();
