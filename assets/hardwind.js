/* hardwind.js — pestaña "Hard Wind" de la sección de equipos: productos y
 * precios de la tienda hardwind.com. Lee /api/hardwind (relevamientos por
 * fecha) y el botón "Relevar" recorre las categorías página por página, con
 * 3 segundos de pausa entre pedidos para no cargar a la tienda.
 * Usa los estilos .mld__* del dashboard de Mercado Libre.
 */
(function () {
  'use strict';

  var root = document.getElementById('hwDash');
  if (!root) return;

  var PAUSA_MS = 3000;
  var state = { raw: null, q: '', cat: '', orden: 'precio-desc', stock: false, limite: 30, cargado: false };

  function $(sel) { return root.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function plata(n) { return n == null ? '—' : '$ ' + Math.round(n).toLocaleString('es-AR'); }
  function fechaLarga(f) { var p = f.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function fold(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function aviso(txt, tipo) {
    var el = $('#hwAviso');
    el.textContent = txt || '';
    el.className = 'mld__aviso' + (tipo ? ' is-' + tipo : '');
    el.hidden = !txt;
  }

  function rels() { return (state.raw && state.raw.relevamientos) || []; }
  function ultimo() { var r = rels(); return r[r.length - 1] || null; }
  function anterior() { var r = rels(); return r[r.length - 2] || null; }
  // Sección de la tienda (Wing foil, Foil, Usados…); si falta, la categoría del producto
  function cat(p) {
    var id = p.secciones && p.secciones[0];
    var c = ((state.raw && state.raw.categorias) || []).find(function (x) { return x.id === id; });
    return c ? c.nombre : ((p.categoria || '').trim() || 'Otros');
  }

  // ── Resumen ──────────────────────────────────────────────────────────
  function kpi(t, v, s) {
    return '<div class="mld__kpi"><span class="mld__kpi-t">' + t + '</span><span class="mld__kpi-v">' + v + '</span>' +
      (s ? '<span class="mld__kpi-s">' + s + '</span>' : '') + '</div>';
  }

  function cambios() {
    var a = anterior(), u = ultimo();
    if (!a || !u) return [];
    var antes = {};
    a.productos.forEach(function (p) { if (p.precio) antes[p.id] = p.precio; });
    return u.productos.filter(function (p) { return p.precio && antes[p.id] && antes[p.id] !== p.precio; })
      .map(function (p) { return { p: p, antes: antes[p.id], d: (p.precio - antes[p.id]) / antes[p.id] }; })
      .sort(function (x, y) { return Math.abs(y.d) - Math.abs(x.d); });
  }

  function renderResumen() {
    var u = ultimo(), prods = u.productos;
    var conStock = prods.filter(function (p) { return p.disponible; }).length;
    var ofertas = prods.filter(function (p) { return p.precioAnterior; }).length;
    var nuevos = 0, a = anterior();
    if (a) {
      var ids = {};
      a.productos.forEach(function (p) { ids[p.id] = 1; });
      nuevos = prods.filter(function (p) { return !ids[p.id]; }).length;
    }
    var cb = cambios();
    var suben = cb.filter(function (c) { return c.d > 0; }).length;
    $('#hwKpis').innerHTML =
      kpi('Productos', prods.length, conStock + ' con stock') +
      kpi('En oferta', ofertas, 'con precio anterior tachado') +
      kpi('Cambios de precio', a ? cb.length : '—', a ? suben + ' subieron · ' + (cb.length - suben) + ' bajaron' : 'Se ven desde el segundo relevamiento') +
      kpi('Nuevos', a ? nuevos : '—', a ? 'desde el ' + fechaLarga(a.fecha) : 'Se ven desde el segundo relevamiento');

    // Precio promedio por categoría (barras simples)
    var grupos = {};
    prods.forEach(function (p) {
      if (!p.precio) return;
      var g = grupos[cat(p)] || (grupos[cat(p)] = { n: 0, suma: 0, min: Infinity, max: 0 });
      g.n++; g.suma += p.precio; g.min = Math.min(g.min, p.precio); g.max = Math.max(g.max, p.precio);
    });
    var filas = Object.keys(grupos).map(function (k) { var g = grupos[k]; return { k: k, prom: g.suma / g.n, n: g.n, min: g.min, max: g.max }; })
      .sort(function (x, y) { return y.prom - x.prom; });
    var tope = filas.length ? filas[0].prom : 1;
    $('#hwCats').innerHTML = filas.length ? filas.map(function (f) {
      return '<li class="hw__bar"><span class="hw__bar-k">' + esc(f.k) + ' <small>(' + f.n + ')</small></span>' +
        '<span class="hw__bar-t"><span class="hw__bar-f" style="width:' + Math.max(3, f.prom / tope * 100).toFixed(1) + '%"></span></span>' +
        '<b>' + plata(f.prom) + '</b><small class="hw__bar-r">' + plata(f.min) + ' a ' + plata(f.max) + '</small></li>';
    }).join('') : '<li class="mld__vacio">Sin precios publicados.</li>';

    // Cambios de precio
    $('#hwCambios').innerHTML = !a ? '<li class="mld__vacio">Los cambios de precio aparecen desde el segundo relevamiento.</li>'
      : cb.length ? cb.slice(0, 10).map(function (c, i) {
        var pct = (c.d * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 });
        return '<li><span class="mld__n">' + (i + 1) + '</span><a href="' + esc(c.p.url) + '" target="_blank" rel="noopener nofollow">' + esc(c.p.titulo) + '</a>' +
          '<span class="mld__d ' + (c.d > 0 ? 'is-down' : 'is-up') + '">' + (c.d > 0 ? '▲ +' : '▼ ') + pct + '%</span><b>' + plata(c.p.precio) + '</b></li>';
      }).join('') : '<li class="mld__vacio">Sin cambios de precio desde el ' + fechaLarga(a.fecha) + '.</li>';
  }

  // ── Lista ────────────────────────────────────────────────────────────
  function renderLista() {
    var prods = ultimo().productos;
    var catSel = $('#hwCat');
    var cats = Array.from(new Set(prods.map(cat))).sort();
    catSel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(function (c) {
      return '<option' + (c === state.cat ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var q = fold(state.q);
    var lista = prods.filter(function (p) {
      if (state.cat && cat(p) !== state.cat) return false;
      if (state.stock && !p.disponible) return false;
      return !q || fold(p.titulo).indexOf(q) >= 0;
    });
    var nulo = function (v, d) { return v == null ? d : v; };
    lista.sort(state.orden === 'precio-asc' ? function (a, b) { return nulo(a.precio, 1e15) - nulo(b.precio, 1e15); }
      : state.orden === 'nombre' ? function (a, b) { return a.titulo.localeCompare(b.titulo, 'es'); }
      : function (a, b) { return nulo(b.precio, -1) - nulo(a.precio, -1); });
    $('#hwCount').textContent = lista.length + ' de ' + prods.length;
    $('#hwTabla').innerHTML = lista.length ? lista.slice(0, state.limite).map(function (p) {
      var precio = p.precio != null ? plata(p.precio) + (p.precioAnterior ? '<small><s>' + plata(p.precioAnterior) + '</s></small>' : '')
        : '<span class="mld__nd">' + (p.consultar ? 'Consultar' : 'Sin precio') + '</span>';
      return '<tr>' +
        '<td data-l="Producto"><span class="mld__prod">' + (p.imagen ? '<img src="' + esc(p.imagen) + '" alt="" loading="lazy">' : '') + '<span>' + esc(p.titulo) + '</span></span></td>' +
        '<td data-l="Categoría">' + esc(cat(p)) + '</td>' +
        '<td data-l="Precio">' + precio + '</td>' +
        '<td data-l="Transferencia">' + (p.precioTransferencia ? plata(p.precioTransferencia) : '<span class="mld__nd">—</span>') + '</td>' +
        '<td data-l="Stock">' + (p.disponible ? (p.stock == null ? 'Disponible' : p.stock + ' u.') : '<span class="mld__nd">Sin stock</span>') + '</td>' +
        '<td data-l=""><a class="mld__ver" href="' + esc(p.url) + '" target="_blank" rel="noopener nofollow">Ver ›</a></td>' +
        '</tr>';
    }).join('') : '<tr><td colspan="6" class="mld__vacio">No hay productos con esos filtros.</td></tr>';
    var resto = lista.length - state.limite;
    $('#hwMas').hidden = resto <= 0;
    $('#hwMas').textContent = 'Ver ' + Math.min(resto, 30) + ' más';
  }

  function render() {
    var u = ultimo();
    root.classList.remove('is-loading');
    root.classList.toggle('is-empty', !u);
    if (!u) {
      $('#hwEstado').textContent = 'Todavía no hay relevamientos de Hard Wind.';
      aviso('Tocá "Relevar" para traer los precios de hoy.', 'warn');
      return;
    }
    $('#hwEstado').innerHTML = 'Último relevamiento: <b>' + fechaLarga(u.fecha) + '</b> · ' + u.productos.length + ' productos · ' + rels().length + (rels().length === 1 ? ' relevamiento' : ' relevamientos');
    renderResumen();
    renderLista();
  }

  function cargar(fresco) {
    return fetch('/api/hardwind' + (fresco ? '?t=' + Date.now() : ''))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (raw) { state.raw = raw; render(); })
      .catch(function () {
        root.classList.remove('is-loading');
        $('#hwEstado').textContent = 'No se pudieron cargar los datos de Hard Wind.';
      });
  }

  function post(body) {
    return fetch('/api/hardwind', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  // Recorre cada categoría página por página, con pausa entre pedidos.
  async function relevar() {
    var btn = $('#hwRelevar');
    btn.disabled = true;
    var cats = (state.raw && state.raw.categorias) || [];
    var total = 0, errores = 0, primero = true;
    try {
      for (var i = 0; i < cats.length; i++) {
        for (var pag = 1; pag <= (state.raw.maxPaginas || 15); pag++) {
          if (!primero) await espera(PAUSA_MS);
          primero = false;
          aviso('Relevando ' + cats[i].nombre + ' (página ' + pag + ')… ' + total + ' productos hasta ahora.');
          var r = await post({ cat: cats[i].id, pagina: pag }).catch(function () { return { ok: false }; });
          if (!r.ok) { errores++; break; }
          total += r.n;
          if (!r.mas) break;
        }
      }
      var c = await post({ cerrar: 1 });
      await cargar(true);
      aviso(c.ok ? 'Listo: ' + c.productos + ' productos relevados de Hard Wind' + (errores ? ' (' + errores + ' categorías no respondieron).' : '.')
        : 'Hard Wind no devolvió productos esta vez. Probá de nuevo en un rato.', c.ok ? 'ok' : 'warn');
    } catch (e) {
      aviso('No se pudo completar el relevamiento. Probá de nuevo en un rato.', 'warn');
    }
    btn.disabled = false;
  }

  $('#hwRelevar').addEventListener('click', relevar);
  $('#hwBuscar').addEventListener('input', function (e) { state.q = e.target.value; state.limite = 30; renderLista(); });
  $('#hwCat').addEventListener('change', function (e) { state.cat = e.target.value; state.limite = 30; renderLista(); });
  $('#hwOrden').addEventListener('change', function (e) { state.orden = e.target.value; renderLista(); });
  $('#hwStock').addEventListener('change', function (e) { state.stock = e.target.checked; state.limite = 30; renderLista(); });
  $('#hwMas').addEventListener('click', function () { state.limite += 30; renderLista(); });

  // Se carga cuando se abre la pestaña
  window.HW_LOAD = function () { if (!state.cargado) { state.cargado = true; cargar(false); } };
})();
