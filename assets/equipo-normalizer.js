/* equipo-normalizer.js — convierte los datos crudos del scraping (Mercado
 * Libre, ml-data.json) y los avisos de la comunidad (/api/equipos) en
 * productos con una estructura homogénea para el buscador y el comparador.
 *
 * Regla de oro: NO inventar datos. Todo lo que no viene explícito en la
 * fuente o no se puede leer del título/descripción queda en null, y la UI lo
 * muestra como "No especificado" / "No disponible". En particular las cuotas:
 *   - cuotas: { cantidad, valor, sinInteres }  → se muestran las cuotas
 *   - cuotas: false | []                       → "No ofrece cuotas" (confirmado)
 *   - campo ausente                            → "No especificado"
 *
 * Campos opcionales que el scraper puede sumar a cada producto de
 * ml-data.json (todos se respetan si vienen; si no, se infieren o quedan null):
 *   categoria, marca, modelo, anio, moneda ("ARS"|"USD"), condicion
 *   ("nuevo"|"usado"), vendedor, ubicacion, disponible (bool) / stock (num),
 *   cuotas (ver arriba), envioGratis (bool), costoEnvio (num), precioOriginal
 *   (num, precio tachado), descripcion, peso, material, nivel, uso, fecha
 *   (ISO, última vez que se vio el producto), estadoEnlace (código HTTP del
 *   último chequeo del link).
 * A nivel archivo: actualizado (ISO) y, si se quiere comparar ARS/USD en una
 * misma escala, tipoCambioUSD (ARS por 1 USD) con su fecha.
 *
 * Se carga como <script> en el navegador (window.EquipoNormalizer) y también
 * se puede ejecutar en Node (scripts/test-normalizer.mjs) vía vm.
 */
(function (root) {
  'use strict';

  var CATEGORIAS = {
    tabla: 'Tabla',
    ala: 'Ala',
    foil: 'Foil completo',
    mastil: 'Mástil',
    fuselaje: 'Fuselaje',
    plano: 'Plano / estabilizador',
    kit: 'Equipo completo',
    accesorio: 'Accesorio',
    otro: 'Otro',
  };

  // Sinónimos de categoría que pueden venir de distintas fuentes (el scraper
  // viejo usaba "wing", la comunidad usa "🪂 Ala / Wing", etc.).
  var CAT_SINONIMOS = [
    [/\bkit\b|combo|equipo completo|set completo|paquete/, 'kit'],
    [/accesori|casco|chaleco|arn[eé]s|footstrap|leash|bomba|inflador|bolso|funda|neoprene|traje|guante|tornill|gancho|hook|reparaci/, 'accesorio'],
    [/\bkite\b|kitesurf/, 'otro'],
    [/m[aá]stil|mast\b/, 'mastil'],
    [/fuselaje|fuselage/, 'fuselaje'],
    [/plano|estabilizador|stabili[sz]er|front wing|ala delantera|rear wing|tail/, 'plano'],
    [/foil/, 'foil'],
    [/tabla|board/, 'tabla'],
    [/\bala\b|wing|vela/, 'ala'],
  ];

  function normCategoria(raw) {
    if (!raw) return null;
    var t = fold(raw);
    if (CATEGORIAS[t]) return t;
    for (var i = 0; i < CAT_SINONIMOS.length; i++) if (CAT_SINONIMOS[i][0].test(t)) return CAT_SINONIMOS[i][1];
    return 'otro';
  }

  // Minúsculas sin tildes, para comparar texto sin que importen acentos.
  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // ── Categoría desde el título ─────────────────────────────────────────
  // Palabras que, si aparecen en cualquier lugar, delatan un accesorio
  // (aunque el título también diga "kit" o "wing": "Kit Reparación Tubos De
  // Wing", "Arnés Wing Foil Gancho").
  var ACCESORIO_RE = /\b(tornill\w*|tuercas?|reparacion|casco|chaleco|guantes?|gancho|hook|arnes|footstraps?|straps?|boomstraps?|adaptador|quillas?|leash|bomba|inflador|funda|bolso|gearbag|mochila|neoprene|traje|botitas?|botas|poncho|lycra|protector|pads?)\b/;
  var KIT_RE = /\b(kit|combo|equipo completo|set completo)\b/;
  // Primer sustantivo de categoría que aparece en el título: en ML el título
  // casi siempre arranca por el tipo de producto ("Wing Cabrinha ... Para Foil
  // Surf" es un ala, "Foil ... Completo ... Wing" es un foil).
  var SUSTANTIVOS = [
    [/^(tabla|board|tablas)$/, 'tabla'],
    [/^(wing|ala|alas|vela|velas)$/, 'ala'],
    [/^(foil|hydrofoil|hidroala)$/, 'foil'],
    [/^(mastil|mast)$/, 'mastil'],
    [/^(fuselaje|fuselage)$/, 'fuselaje'],
    [/^(plano|estabilizador|stabilizer)$/, 'plano'],
  ];

  function detectCategoria(titulo) {
    var t = fold(titulo);
    if (ACCESORIO_RE.test(t)) return 'accesorio';
    if (KIT_RE.test(t)) return 'kit';
    var tokens = t.split(/[^a-z0-9]+/);
    for (var i = 0; i < tokens.length; i++) {
      for (var j = 0; j < SUSTANTIVOS.length; j++) {
        if (SUSTANTIVOS[j][0].test(tokens[i])) {
          return SUSTANTIVOS[j][1];
        }
      }
    }
    return 'otro';
  }

  // ── Marca ─────────────────────────────────────────────────────────────
  // [patrón, nombre para mostrar]. El orden importa sólo cuando un nombre
  // contiene a otro ("north" vs "north sails").
  var MARCAS = [
    ['duotone', 'Duotone'], ['naish', 'Naish'], ['f-one|fone|f one', 'F-One'], ['north', 'North'],
    ['core', 'Core'], ['armstrong', 'Armstrong'], ['slingshot', 'Slingshot'], ['cabrinha', 'Cabrinha'],
    ['flysurfer', 'Flysurfer'], ['ozone', 'Ozone'], ['starboard', 'Starboard'], ['fanatic', 'Fanatic'],
    ['liquid force', 'Liquid Force'], ['manera', 'Manera'], ['rrd', 'RRD'], ['nobile', 'Nobile'],
    ['aztron', 'Aztron'], ['shakka', 'Shakka'], ['tinos', 'Tinos Workshop'], ['spatium', 'Spatium'],
    ['gong', 'Gong'], ['jaws', 'Jaws'], ['axis', 'Axis'], ['sabfoil', 'Sabfoil'], ['lift', 'Lift'],
    ['takuma', 'Takuma'], ['gofoil', 'GoFoil'], ['indiana', 'Indiana'], ['ensis', 'Ensis'],
    ['reedin', 'Reedin'], ['eleveight', 'Eleveight'], ['airush', 'Airush'], ['crazyfly', 'CrazyFly'],
    ['north sails', 'North Sails'], ['moses', 'Moses'], ['unifoil', 'Unifoil'], ['ketos', 'Ketos'],
    ['sroka', 'Sroka'], ['ion', 'ION'], ['dakine', 'Dakine'], ['mystic', 'Mystic'],
    ['prolimit', 'Prolimit'], ['neilpryde', 'NeilPryde'], ['ksa', 'KSA'], ['freelife', 'Freelife'],
    ['code foils', 'Code Foils'], ['severne', 'Severne'], ['gaastra', 'Gaastra'], ['js', 'JS'],
  ].map(function (m) { return [new RegExp('\\b(' + m[0] + ')\\b'), m[1]]; });

  function detectMarca(texto) {
    var t = fold(texto);
    var best = null;
    var bestIdx = Infinity;
    for (var i = 0; i < MARCAS.length; i++) {
      var m = MARCAS[i][0].exec(t);
      // Si hay varias marcas (una tabla "compatible con foil Duotone"), gana
      // la primera que aparece en el texto.
      if (m && m.index < bestIdx) { best = MARCAS[i][1]; bestIdx = m.index; }
    }
    return best;
  }

  // Palabras que cortan el modelo: tipo de producto, relleno de ML, unidades.
  var MODELO_STOP = /^(wingfoil|wingsurf|wing|foil|tabla|de|para|con|y|el|la|los|las|oferta|color|black|negro|negra|blanco|blanca|kite|kitesurf|kitsurf|wake|surf|windsurf|windfoil|completo|completa|equipo|alas|mastil|fuselaje|accesorios|nuevo|nueva|usado|usada|somos|en|x|lts?|litros|metros|mts?|m|m2|cm|cm2|kg|inflable|carbono|carbon|aluminio|-|\+|\/|\|)$/;

  function detectModelo(titulo, marca, categoria) {
    if (!marca) return null;
    var words = String(titulo).split(/\s+/);
    var marcaFold = fold(marca).split(/\s+/)[0];
    var start = -1;
    for (var i = 0; i < words.length; i++) if (fold(words[i]).replace(/[^a-z0-9-]/g, '') === marcaFold) { start = i; break; }
    if (start < 0) return null;
    // Marcas de dos palabras ("Tinos Workshop", "Liquid Force").
    var skip = fold(marca).split(/\s+/).length;
    var out = [];
    for (var k = start + skip; k < words.length && out.length < 3; k++) {
      var w = words[k].replace(/[!¡?¿,;:()]+/g, '');
      var wf = fold(w);
      if (!w) continue;
      if (MODELO_STOP.test(wf)) { if (out.length) break; else continue; }
      if (/^(19|20)\d{2}$/.test(wf)) break;                // año
      if (/^\d+([.,]\d+)?(l|lts?|m|m2|cm|mm|kg)$/.test(wf)) break; // medida pegada
      // Número suelto: en alas es el talle ("Air Wing 5.0", "Jaws 5 6 y 7");
      // en el resto sólo vale con decimal como versión ("Code 6.0").
      if (/^\d+$/.test(wf) || (categoria === 'ala' && /^\d+[.,]\d+$/.test(wf))) break;
      if (/^\d+([.,]\d+)?$/.test(wf) && out.length && /^(l|lts?|litros|m|mts?|metros|m2|cm|cm2)$/.test(fold(words[k + 1] || ''))) break;
      out.push(w);
    }
    return out.length ? out.join(' ') : null;
  }

  function detectAnio(texto, maxAnio) {
    var re = /\b(20[12]\d)\b/g;
    var m;
    var found = null;
    while ((m = re.exec(String(texto)))) {
      var y = +m[1];
      if (y >= 2015 && y <= maxAnio) { found = y; break; }
    }
    return found;
  }

  function num(s) { return parseFloat(String(s).replace(',', '.')); }

  // Tamaño según categoría. Devuelve { valor, unidad, texto } o null.
  function detectTamano(texto, categoria) {
    var t = fold(texto);
    var m;
    if (categoria === 'tabla' || categoria === 'kit') {
      m = /(\d{2,3})\s*(?:l|lts?|litros)\b/.exec(t);
      if (m) return { valor: +m[1], unidad: 'L', texto: m[1] + ' L' };
    }
    if (categoria === 'ala' || categoria === 'kit') {
      // "5 6 y 7 metros", "4.5 m", "5.0", "2.5 - Somos"
      m = /((?:\d(?:[.,]\d)?\s*(?:,|y|-|\/)?\s*){1,4})\s*(?:m2|m²|mts?|metros|m)\b/.exec(t);
      if (m) {
        var sizes = m[1].match(/\d(?:[.,]\d)?/g).map(num).filter(function (v) { return v >= 1 && v <= 10; });
        if (sizes.length) {
          return {
            valor: Math.min.apply(null, sizes),
            unidad: 'm²',
            texto: sizes.map(function (v) { return String(v).replace('.', ','); }).join(' / ') + ' m²',
          };
        }
      }
      if (categoria === 'ala') {
        // Talle suelto en alas ("Air Wing 5.0", "Window 2022 2.5"): un
        // número con decimal entre 1,5 y 9,9 que no sea parte de un año.
        m = /(?:^|\s)([1-9][.,]\d)(?=\s|$)/.exec(t);
        if (m && num(m[1]) >= 1.5) return { valor: num(m[1]), unidad: 'm²', texto: m[1].replace('.', ',') + ' m²' };
      }
    }
    if (categoria === 'foil' || categoria === 'plano') {
      m = /(\d{3,4})\s*(?:cm2|cm²|cm 2)/.exec(t);
      if (m) return { valor: +m[1], unidad: 'cm²', texto: m[1] + ' cm²' };
    }
    if (categoria === 'mastil' || categoria === 'fuselaje' || categoria === 'foil') {
      m = /(\d{2,3})\s*cm\b(?!\s*2|²)/.exec(t);
      if (m) return { valor: +m[1], unidad: 'cm', texto: m[1] + ' cm' };
    }
    return null;
  }

  function detectPeso(texto) {
    var m = /(\d+(?:[.,]\d+)?)\s*kg\b/.exec(fold(texto));
    return m ? { valor: num(m[1]), texto: m[1].replace('.', ',') + ' kg' } : null;
  }

  var MATERIALES = [
    [/\b(carbono|carbon|full carbon)\b/, 'Carbono'],
    [/\baluminio|aluminium|aluminum|alu\b/, 'Aluminio'],
    [/\b(inflable|inflatable)\b/, 'Inflable'],
    [/\b(wood|madera|bamboo|bambu)\b/, 'Madera'],
    [/\b(dacron)\b/, 'Dacron'],
    [/\b(aluula)\b/, 'Aluula'],
    [/\b(window|ventana)\b/, 'Con ventana'],
  ];
  var USOS = [
    [/\bfreeride\b/, 'Freeride'], [/\bfreestyle\b/, 'Freestyle'], [/\b(wave|olas)\b/, 'Olas'],
    [/\b(downwind|dw|mid ?length|midlength)\b/, 'Downwind / mid length'], [/\b(race|racing|regata)\b/, 'Regata'],
    [/\b(pump|pumping|dockstart)\b/, 'Pumping'], [/\b(foil ?surf)\b/, 'Foil surf'],
  ];
  var NIVELES = [
    [/\b(principiante|principiantes|beginner|iniciacion|escuela|school)\b/, 'Principiante'],
    [/\b(intermedio|intermediate)\b/, 'Intermedio'],
    [/\b(avanzado|advanced|pro|expert)\b/, 'Avanzado'],
  ];

  function matchList(texto, list) {
    var t = fold(texto);
    var out = [];
    for (var i = 0; i < list.length; i++) if (list[i][0].test(t) && out.indexOf(list[i][1]) < 0) out.push(list[i][1]);
    return out;
  }

  // Sub-tipo para filtrar dentro de accesorios y tablas.
  var SUBTIPOS = [
    [/\bcasco\b/, 'Casco'], [/\bchaleco\b/, 'Chaleco'], [/\b(arnes|gancho|hook)\b/, 'Arnés / gancho'],
    [/\b(footstraps?|straps?)\b/, 'Footstraps'], [/\bboomstraps?\b/, 'Boomstraps'], [/\b(tornill\w*|tuercas?)\b/, 'Tornillería'],
    [/\breparacion\b/, 'Reparación'], [/\bguantes?\b/, 'Guantes'], [/\b(adaptador|quillas?)\b/, 'Adaptadores'],
    [/\b(leash)\b/, 'Leash'], [/\b(bomba|inflador)\b/, 'Inflador'], [/\b(funda|bolso|gearbag|mochila)\b/, 'Funda / bolso'],
    [/\b(neoprene|traje|lycra|botitas?|poncho)\b/, 'Indumentaria'],
    [/\binflable\b/, 'Inflable'], [/\b(mid ?length|midlength|downwind)\b/, 'Mid length / downwind'],
  ];

  function detectSubtipo(texto, categoria) {
    if (categoria !== 'accesorio' && categoria !== 'tabla') return null;
    var s = matchList(texto, SUBTIPOS);
    if (s.length) return s[0];
    return null;
  }

  // Nivel: primero lo explícito en el texto; en tablas con volumen se da una
  // orientación por litros, marcada como estimada (no es dato del vendedor).
  function detectNivel(texto, categoria, tamano) {
    var n = matchList(texto, NIVELES);
    if (n.length) return { valor: n[0], estimado: false };
    if (categoria === 'tabla' && tamano && tamano.unidad === 'L') {
      var v = tamano.valor;
      return { valor: v >= 110 ? 'Principiante' : v >= 85 ? 'Intermedio' : 'Avanzado', estimado: true };
    }
    return null;
  }

  function detectCondicion(texto) {
    var t = fold(texto);
    if (/\b(usad[oa]s?|segunda mano|poco uso|buen estado|muy buen estado|excelente estado)\b/.test(t)) return 'usado';
    if (/\b(nuev[oa]s?|sin uso|sellad[oa]|0 ?km|en caja)\b/.test(t)) return 'nuevo';
    return null;
  }

  function normCondicion(v) {
    var t = fold(v);
    if (/^(new|nuevo|nueva)$/.test(t)) return 'nuevo';
    if (/^(used|usado|usada|reacondicionado|refurbished)$/.test(t)) return 'usado';
    return null;
  }

  // Precio: número ARS de ML o texto libre de la comunidad ("USD 900",
  // "850.000", "$ 1.200.000"). Devuelve { valor, moneda } o null.
  function parsePrecio(raw, monedaHint) {
    if (raw == null || raw === '') return null;
    var moneda = monedaHint ? String(monedaHint).toUpperCase() : null;
    if (typeof raw === 'number') return raw > 0 && isFinite(raw) ? { valor: raw, moneda: moneda || 'ARS' } : null;
    var s = String(raw);
    if (/u\$s|us\$|usd|d[oó]lar|u\$d/i.test(s)) moneda = 'USD';
    else if (/€|eur/i.test(s)) moneda = 'EUR';
    var m = s.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/);
    if (!m) return null;
    var n = m[0];
    if (/^\d{1,3}(?:\.\d{3})+/.test(n)) n = n.replace(/\./g, '').replace(',', '.');
    else n = n.replace(',', '.');
    var v = parseFloat(n);
    // "850 mil" / "1,2 millones"
    if (/\bmil\b/i.test(s) && v < 10000) v *= 1000;
    if (/\bmill[oó]n(es)?\b|\bM\b/.test(s) && v < 1000) v *= 1000000;
    if (!(v > 0)) return null;
    return { valor: v, moneda: moneda || 'ARS' };
  }

  function parseCuotas(raw) {
    if (raw === undefined || raw === null) return { estado: 'desconocido' };
    if (raw === false || (Array.isArray(raw) && !raw.length) || raw === 0) return { estado: 'no' };
    var c = Array.isArray(raw) ? raw[0] : raw;
    if (typeof c === 'object' && c) {
      var cant = parseInt(c.cantidad || c.cuotas || c.quantity, 10);
      var val = parseFloat(c.valor || c.monto || c.amount);
      if (cant > 0) return { estado: 'si', cantidad: cant, valor: val > 0 ? val : null, sinInteres: !!(c.sinInteres || c.sin_interes || c.rate === 0) };
    }
    if (raw === true) return { estado: 'si' };
    return { estado: 'desconocido' };
  }

  function parseDisponibilidad(p) {
    if (p.disponible === true) return 'disponible';
    if (p.disponible === false) return 'agotado';
    if (typeof p.stock === 'number') return p.stock > 0 ? 'disponible' : 'agotado';
    var t = fold(p.titulo || '') + ' ' + fold(p.descripcion || '');
    if (/\b(agotado|sin stock|vendido)\b/.test(t)) return 'agotado';
    return null;
  }

  // Link seguro: sólo http(s). Si el scraper registró un error en el último
  // chequeo (4xx/5xx), se marca como roto para no mandar al usuario a un 404.
  function normLink(url, estado) {
    if (!url) return { url: null, roto: false };
    var u = String(url).trim();
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(u)) return { url: null, roto: true };
    return { url: u, roto: typeof estado === 'number' && estado >= 400 };
  }

  function validDate(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Clave para detectar la misma publicación (link o título repetido) y
  // huella para detectar el mismo producto publicado en distintos lugares.
  function tituloClave(t) {
    return fold(t)
      .replace(/\b(oferta|color \w+|celeste|turquesa|negro|blanco|somos \w+|envio gratis|nuevo|nueva)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function huella(p) {
    if (!p.marca || !p.modelo || !p.tamano) return null;
    return [p.categoria, fold(p.marca), fold(p.modelo).replace(/[^a-z0-9]/g, ''), p.tamano.valor, p.anio || ''].join('|');
  }

  function resumen(p) {
    var bits = [];
    if (p.subtipo && p.categoria === 'accesorio') bits.push(p.subtipo);
    if (p.tamano) bits.push(p.tamano.texto);
    if (p.materiales.length) bits.push(p.materiales.join(', '));
    if (p.usos.length) bits.push(p.usos.join(', '));
    if (p.peso) bits.push(p.peso.texto);
    return bits.join(' · ');
  }

  function base(p, fuente, ctx) {
    var titulo = String(p.titulo || '').trim();
    var texto = titulo + ' ' + (p.descripcion || '');
    var categoria = normCategoria(p.categoria) || detectCategoria(titulo);
    var marca = p.marca ? (detectMarca(p.marca) || String(p.marca).trim()) : detectMarca(titulo);
    var tamano = detectTamano(texto, categoria);
    var materiales = p.material ? [String(p.material)] : matchList(texto, MATERIALES);
    var usos = p.uso ? [String(p.uso)] : matchList(texto, USOS);
    var precio = parsePrecio(p.precio, p.moneda);
    var original = parsePrecio(p.precioOriginal, precio && precio.moneda);
    var link = normLink(p.link || p.url, p.estadoEnlace);
    var out = {
      id: fuente.id + ':' + (p.id != null ? p.id : tituloClave(titulo)),
      fuente: fuente.nombre,
      fuenteId: fuente.id,
      titulo: titulo,
      categoria: categoria,
      subtipo: detectSubtipo(texto, categoria),
      marca: marca || null,
      modelo: p.modelo ? String(p.modelo) : detectModelo(titulo, marca, categoria),
      anio: +p.anio || detectAnio(texto, ctx.maxAnio),
      precio: precio,
      precioOriginal: original && precio && original.valor > precio.valor ? original : null,
      oferta: !!(original && precio && original.valor > precio.valor) || /\boferta\b/.test(fold(titulo)),
      cuotas: parseCuotas(p.cuotas),
      envio: p.envioGratis === true ? 'gratis' : typeof p.costoEnvio === 'number' ? p.costoEnvio : null,
      vendedor: p.vendedor ? String(p.vendedor) : null,
      condicion: normCondicion(p.condicion) || detectCondicion(texto),
      descripcion: p.descripcion ? String(p.descripcion) : null,
      ubicacion: p.ubicacion ? String(p.ubicacion) : null,
      disponibilidad: parseDisponibilidad(p),
      tamano: tamano,
      peso: p.peso ? { valor: num(p.peso), texto: String(p.peso) } : detectPeso(texto),
      materiales: materiales,
      usos: usos,
      nivel: p.nivel ? { valor: String(p.nivel), estimado: false } : detectNivel(texto, categoria, tamano),
      imagen: /^https:\/\//.test(p.imagen || '') ? p.imagen : null,
      link: link.url,
      linkRoto: link.roto,
      linkTexto: fuente.linkTexto,
      actualizado: validDate(p.fecha) || validDate(p.ts) || ctx.actualizado,
    };
    out.resumen = resumen(out);
    return out;
  }

  // ── Fuentes ───────────────────────────────────────────────────────────
  function fromMercadoLibre(data, now) {
    var ctx = { actualizado: validDate(data && data.actualizado), maxAnio: (now || new Date()).getFullYear() + 1 };
    var fuente = { id: 'ml', nombre: 'Mercado Libre', linkTexto: 'Ver en Mercado Libre' };
    return ((data && data.productos) || []).filter(function (p) { return p && p.titulo; }).map(function (p) {
      return base(p, fuente, ctx);
    });
  }

  // Avisos de riders: tipo (del select), marca (texto libre, suele incluir
  // modelo/año), precio (texto), ubicación, descripción, whatsapp.
  function fromComunidad(list, now) {
    var ctx = { actualizado: null, maxAnio: (now || new Date()).getFullYear() + 1 };
    var fuente = { id: 'com', nombre: 'Comunidad', linkTexto: 'Contactar por WhatsApp' };
    return (Array.isArray(list) ? list : []).filter(function (d) { return d && (d.marca || d.descripcion); }).map(function (d) {
      var tipo = String(d.tipo || '').replace(/^[^\wÁÉÍÓÚáéíóúñÑ]+/, '').trim();
      var wa = String(d.whatsapp || '').replace(/[^0-9]/g, '');
      var p = base({
        id: d.id,
        titulo: (tipo ? tipo.split('/')[0].trim() + ' ' : '') + (d.marca || ''),
        categoria: tipo,
        precio: d.precio,
        moneda: d.moneda,
        descripcion: d.descripcion,
        ubicacion: d.ubicacion,
        vendedor: 'Particular (comunidad)',
        link: wa ? 'https://wa.me/' + wa : null,
        ts: d.ts,
      }, fuente, ctx);
      // En la comunidad la marca es texto libre: "Duotone Echo 5m 2023".
      if (d.marca && !p.modelo) p.modelo = detectModelo(d.marca, p.marca, p.categoria);
      if (!p.marca && d.marca) p.marca = String(d.marca).split(/\s+/)[0];
      p.fotos = Array.isArray(d.fotos) ? d.fotos.slice(0, 4) : [];
      return p;
    });
  }

  // Quita publicaciones repetidas (mismo link, o mismo título y precio en la
  // misma fuente) y agrupa el mismo producto publicado en varios lugares:
  // cada uno queda, pero con `grupo` = cuántas publicaciones hay y
  // `mejorPrecioGrupo` = true en la más barata.
  function dedupe(items) {
    var seen = {};
    var out = [];
    items.forEach(function (p) {
      var k1 = p.link ? 'u:' + p.link.split('?')[0].split('#')[0] : null;
      var k2 = 't:' + p.fuenteId + '|' + tituloClave(p.titulo) + '|' + (p.precio ? p.precio.valor : '');
      if ((k1 && seen[k1]) || seen[k2]) return;
      if (k1) seen[k1] = 1;
      seen[k2] = 1;
      out.push(p);
    });
    var grupos = {};
    out.forEach(function (p) {
      var h = huella(p);
      p.huella = h;
      if (h) (grupos[h] = grupos[h] || []).push(p);
    });
    Object.keys(grupos).forEach(function (h) {
      var g = grupos[h];
      if (g.length < 2) return;
      var mismos = g.filter(function (p) { return p.precio; });
      var min = null;
      mismos.forEach(function (p) { if (p.precio.moneda === mismos[0].precio.moneda && (!min || p.precio.valor < min.precio.valor)) min = p; });
      g.forEach(function (p) { p.grupo = g.length; p.mejorPrecioGrupo = p === min; });
    });
    return out;
  }

  // Precio en ARS para ordenar/filtrar en una sola escala. Sólo convierte
  // USD si el archivo de datos trae un tipo de cambio explícito.
  function precioARS(p, tipoCambioUSD) {
    if (!p.precio) return null;
    if (p.precio.moneda === 'ARS') return p.precio.valor;
    if (p.precio.moneda === 'USD' && tipoCambioUSD > 0) return p.precio.valor * tipoCambioUSD;
    return null;
  }

  // Mediana de precio por categoría (ARS) y marca de "precio bajo" cuando un
  // producto está 25% o más por debajo. Sólo para categorías de equipo, donde
  // los precios son comparables (en accesorios un casco y un tornillo no lo son).
  function marcarPrecioBajo(items, tipoCambioUSD) {
    var porCat = {};
    items.forEach(function (p) {
      p.precioARS = precioARS(p, tipoCambioUSD);
      if (p.precioARS && /^(tabla|ala|foil|kit)$/.test(p.categoria)) (porCat[p.categoria] = porCat[p.categoria] || []).push(p.precioARS);
    });
    var med = {};
    Object.keys(porCat).forEach(function (c) {
      var a = porCat[c].slice().sort(function (x, y) { return x - y; });
      if (a.length >= 5) med[c] = a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
    });
    items.forEach(function (p) {
      p.medianaCategoria = med[p.categoria] || null;
      p.precioBajo = !!(p.precioARS && med[p.categoria] && p.precioARS <= med[p.categoria] * 0.75);
      p.precioPorUnidad = p.precioARS && p.tamano && p.tamano.valor ? p.precioARS / p.tamano.valor : null;
    });
    return med;
  }

  var api = {
    CATEGORIAS: CATEGORIAS,
    fold: fold,
    detectCategoria: detectCategoria,
    detectMarca: detectMarca,
    detectModelo: detectModelo,
    detectAnio: detectAnio,
    detectTamano: detectTamano,
    parsePrecio: parsePrecio,
    parseCuotas: parseCuotas,
    normCategoria: normCategoria,
    fromMercadoLibre: fromMercadoLibre,
    fromComunidad: fromComunidad,
    dedupe: dedupe,
    marcarPrecioBajo: marcarPrecioBajo,
  };
  root.EquipoNormalizer = api;
})(typeof window !== 'undefined' ? window : globalThis);
