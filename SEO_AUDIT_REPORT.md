# Auditoría SEO — escueladewingfoil.com.ar

**Fecha:** 28/09/2026 · **Stack:** HTML estático + Netlify Functions · **Idioma:** es-AR

> **Alcance.** El sitio en vivo no era accesible desde el entorno de auditoría (bloqueado por proxy), así que se auditó el código fuente del repo, que es lo que Netlify publica tal cual (`publish = "."`, sin build). Todo lo que depende del servidor está marcado como **Revisión manual requerida**.

## Score

| Categoría | Peso | Antes | Después (estimado) |
|---|---|---|---|
| Técnica | 30% | 55 | 80 |
| On-page | 30% | 65 | 90 |
| Contenido | 20% | 55 | 80 |
| Performance | 20% | 45 | 55 |
| **Total** | | **~56** | **~78** |

El techo de Técnica y Performance depende de las revisiones manuales de abajo (redirecciones, TTFB, Core Web Vitals reales).

## Resumen por categoría

| Check | Antes | Después |
|---|---|---|
| HTTPS / HSTS | ✅ HSTS con preload en `netlify.toml` | ✅ · 🔍 verificar redirección http→https |
| Status codes / redirecciones | 🔍 | 🔍 Revisión manual |
| `<head>` válido | ❌ Forms de Netlify en `<head>` lo cerraban: hreflang, favicons y manifest quedaban en `<body>` | ✅ |
| Canonical | ⚠️ La 404 apuntaba al home | ✅ Autorreferente en las 10 URLs indexables; la 404 sin canonical y con `noindex` |
| robots.txt | ✅ | ✅ |
| sitemap.xml | ❌ 9 de 11 URLs con `#`, `changefreq` inválido | ✅ 10 URLs reales |
| hreflang | ❌ Apuntaba a dominio sin www; EN sin URL propia | ✅ Quitado hasta tener `/en/` estático |
| TTFB | 🔍 | 🔍 Revisión manual |
| Title 30-60 | ⚠️ Costa: 84 | ✅ 43-59 en todas |
| Meta description 120-160 | ❌ Home 289, Costa 276 | ✅ 139-153 en todas |
| 1 H1 por página | ✅ | ✅ |
| ≥2 H2 | ✅ | ✅ (404 exenta) |
| Alt en imágenes | ✅ | ✅ |
| ≥300 palabras | ✅ | ✅ |
| ≥3 enlaces internos | ⚠️ Costa: 2 | ✅ Costa: 7; guías: 20+ |
| Jerarquía de headings | ✅ | ✅ Sin saltos en las 11 páginas |
| Titles/metas duplicados | ✅ | ✅ |
| Contenido indexable por tema | ❌ 7 guías sin URL propia (en `<dialog>`) | ✅ `/blog/<slug>` |
| Schema | ⚠️ Sin WebSite; VideoObject con datos inventados; Article sin fechas | ✅ Ver detalle |
| Lazy loading | ✅ 37/38 | ✅ |
| Video hero | ❌ `preload="auto"` (mp4 1440×2560) | ✅ `preload="metadata"` |
| Peso HTML del home | ⚠️ 667 KB | ⚠️ 519 KB (−146 KB) |
| Core Web Vitals | 🔍 | 🔍 Revisión manual (PageSpeed / CrUX) |

## Fixes implementados (P0 y P1)

| # | Prioridad | Issue | Qué se hizo | Impacto | Esfuerzo |
|---|---|---|---|---|---|
| 1 | P0 | 4 `<form>` ocultos dentro de `<head>`: el parser HTML5 cierra el head en el primer elemento no permitido y todo lo siguiente (hreflang, favicons, manifest, preconnect, fuente) caía en `<body>`. Google ignora hreflang fuera del head y puede no mostrar el favicon en la SERP. | Forms movidos al inicio de `<body>` (Netlify los detecta igual en el deploy). | Alto | Bajo |
| 2 | P0 | Sitemap con `/#videos`, `/#spots`, etc. (Google descarta el fragmento: eran duplicados de `/`) y `changefreq="biweekly"` (valor inválido). | Sitemap con las 10 URLs reales y `lastmod`. | Alto | Bajo |
| 3 | P1 | hreflang a `escueladewingfoil.com.ar` (sin www) y versión EN solo por JS en `?lang=en` con canonical a `/`: señales contradictorias. | hreflang quitado. El toggle EN sigue funcionando para usuarios. | Alto | Bajo |
| 4 | P1 | Metas largas (289 / 276) y title de la costa de 84. | Reescritas a 150 / 153; title de la costa a 59. | Medio | Bajo |
| 5 | P1 | Schema incompleto o con datos falsos. | `@graph` con `EducationalOrganization` + `WebSite` enlazados por `@id`; `Article` de sudestada con `datePublished` e `image`; se quitaron los 3 `VideoObject` con `uploadDate: 2023-01-01` y duraciones inventadas. | Medio | Bajo |
| 6 | P1 | 404 con canonical al home; costa sin favicons y con 2 enlaces internos. | 404 sin canonical; costa con favicons/manifest y bloque "Seguí explorando". | Bajo-medio | Bajo |
| 7 | P1 | Video hero descargado entero antes del LCP; miniaturas sin dimensiones. | `preload="metadata"`; `width`/`height` intrínsecos en miniaturas de YouTube y notas de prensa. | Medio | Bajo |
| 8 | P1 | Las 7 guías (415-980 palabras c/u) vivían en modales del home: no podían posicionar por "es peligroso el wingfoil", "equipo wingfoil usado", etc. | Cada guía en `/blog/<slug>` con title, meta, canonical, `BlogPosting` + `BreadcrumbList`, migas visibles, CTA y 3 relacionadas en rotación. Índice `/blog/` con `Blog` + `ItemList`. Cards del home enlazan a las páginas; modales quitados; links viejos `/#articleX` redirigen. | **Muy alto** | Medio |

### URLs nuevas

| URL | Title | Keyword objetivo |
|---|---|---|
| `/blog/` | Blog de wingfoil: guías, spots y equipo en Argentina | blog wingfoil |
| `/blog/como-elegir-tu-primer-foil` | Cómo elegir tu primer foil de wingfoil \| Guía 2026 | foil para principiante |
| `/blog/wingfoil-vs-kitesurf-vs-windsurf` | Wingfoil vs kitesurf vs windsurf: cuál aprender primero | wingfoil vs kitesurf |
| `/blog/como-leer-el-viento` | Cómo leer el viento para wingfoil como un pro | cómo leer el viento |
| `/blog/mejores-spots-wingfoil-argentina` | Mejores spots de wingfoil en Argentina 2026 | spots wingfoil Argentina |
| `/blog/equipo-wingfoil-usado-que-revisar` | Equipo de wingfoil usado: qué revisar antes de comprar | equipo wingfoil usado |
| `/blog/es-peligroso-el-wingfoil` | ¿Es peligroso el wingfoil? Guía de seguridad | es peligroso el wingfoil |
| `/blog/spots-wingfoil-kitesurf-brasil` | Spots de wingfoil y kitesurf en Brasil: temporada 2026 | kitesurf Brasil spots |

### Schema por página

| Página | Tipos |
|---|---|
| `/` | EducationalOrganization, WebSite, FAQPage, HowTo, Article (sudestada), WebApplication, SportsActivityLocation ×5, DefinedTermSet |
| `/costa-san-isidro` | Dataset, BreadcrumbList, FAQPage (sin cambios) |
| `/blog/` | Blog, BreadcrumbList, ItemList, EducationalOrganization |
| `/blog/<slug>` | BlogPosting, BreadcrumbList, EducationalOrganization |

- Todo el JSON-LD parsea sin errores.
- `WebSite` va **sin** `SearchAction` porque el sitio no tiene buscador interno; agregarlo sin uno real sería marcado inválido.
- `HowTo` ya no genera resultado enriquecido en Google (desde 2023) y `FAQPage` quedó limitado a sitios de gobierno y salud. Se mantienen porque no penalizan y los usan Bing y los motores de respuesta con IA.
- 🔍 Validar en [Rich Results Test](https://search.google.com/test/rich-results) después del deploy.

## Archivos creados / modificados

| Archivo | Cambio |
|---|---|
| `index.html` | Forms al body, sin hreflang, meta nueva, schema `@graph`, sin VideoObject, hero `preload=metadata`, dimensiones en imágenes, cards con enlace a `/blog/`, sin modales, redirección `/#articleX` |
| `costa-san-isidro.html` | Title y meta, favicons + manifest, enlaces internos en el pie |
| `404.html` | Sin canonical |
| `sitemap.xml` | Reescrito (10 URLs) |
| `blog/index.html` | **Nuevo** |
| `blog/*.html` (7) | **Nuevos** |
| `SEO_AUDIT_REPORT.md` | **Nuevo** |

## Revisión manual requerida

1. **Redirecciones (Netlify → Domain management):** que `http://` y `escueladewingfoil.com.ar` sin www hagan **un solo 301** a `https://www.escueladewingfoil.com.ar/`. Probar con `curl -sIL http://escueladewingfoil.com.ar/`.
2. **Pretty URLs:** confirmar que `/blog/como-leer-el-viento` responde 200 (Netlify sirve `blog/como-leer-el-viento.html`). Mismo patrón que `/costa-san-isidro`.
3. **Fechas de las guías:** `datePublished` usa el mes del byline ("Mayo 2026" → `2026-05-01`; Brasil `2026-06-01`). Ajustar si tenés las fechas exactas.
4. **Tracking duplicado:** el sitio carga GTM (`GTM-5VH677HZ`) **y** `gtag` directo (`G-VJMGLED2P8`). Si GA4 también está configurado dentro de GTM, cada page_view se cuenta dos veces. Las páginas del blog replican el mismo esquema para mantener consistencia: al corregirlo, corregir en todas.
5. **`/costa-san-isidro` no tiene GTM ni GA4**: su tráfico no se está midiendo.
6. **Publicación de ejemplo en Equipos** (`wa.me/541111111111`, "Duotone Echo 5m"): confirmar que el JS la reemplaza siempre por datos reales; si no, quitarla (contenido falso visible a Google).
7. **Search Console:** enviar el sitemap nuevo, pedir indexación de `/blog/` y las 7 guías, y revisar en 2-4 semanas el reporte de páginas.
8. **Core Web Vitals:** medir LCP, INP y CLS en PageSpeed Insights (mobile) antes y después del deploy.

## Próximos pasos (P2 / P3)

| Prioridad | Recomendación | Impacto | Esfuerzo |
|---|---|---|---|
| P2 | Alojar localmente en WebP las imágenes tomadas de La Nación, Clarín, Kiteworld (home) y cvsi.org.ar (og:image de la costa): se pueden romper, no están optimizadas y tienen riesgo de derechos. | Medio | Medio |
| P2 | Sacar los ~217 KB de JS y ~109 KB de CSS inline del home a archivos externos cacheables. | Medio | Alto |
| P2 | Poster del hero local, optimizado y con `<link rel="preload" as="image" fetchpriority="high">`. | Medio | Bajo |
| P2 | Volver a publicar los `VideoObject` con `uploadDate` y `duration` reales sacados de YouTube Studio. | Bajo-medio | Bajo |
| P2 | Versión EN estática en `/en/` con su canonical y hreflang recíproco, si el público angloparlante es objetivo. | Medio | Alto |
| P3 | Quitar `<meta name="keywords">` (Google lo ignora desde 2009; solo le muestra tu estrategia a la competencia). | Bajo | Bajo |
| P3 | Nuevas guías según volumen de búsqueda: "clases de wingfoil en Buenos Aires", "cuánto cuesta un equipo de wingfoil", "altura del Río de la Plata hoy" (enlazada a la costa). | Alto | Medio |
| P3 | Páginas por spot (`/spots/san-isidro`, `/spots/bariloche`…) con su `SportsActivityLocation`. | Alto | Alto |
