# Sonda San Isidro — prototipo 3D del Río de la Plata (Fase 1)

**Idea original: Francisco Deane + https://escueladewingfoil.com**

Prototipo web de un modelo 3D del lecho y la costa de San Isidro con animación de marea
sobre datos reales. Sin Blender, sin software de escritorio: un solo archivo HTML con
WebGL puro, sin librerías externas ni pedidos de red en tiempo de ejecución.

## Cómo se abre

`sonda-san-isidro.html` — abrilo en cualquier navegador. No necesita servidor.

## Recorte

| | |
|---|---|
| bbox (lon/lat) | `-58.53, -34.50 → -58.42, -34.42` |
| Tamaño real | 10,1 × 8,8 km |
| Malla de render | 160 × 144 celdas (~63 m/celda) |
| Triángulos | 45.474 |

## Fuentes de datos

Todas citadas también dentro del prototipo, con organismo, URL y fecha de acceso.

### 1. Relieve de tierra
- **Dataset:** Terrain Tiles (codificación Terrarium), derivado de SRTM
- **Organismo:** AWS Open Data / NASA–USGS (vía Tilezen/Mapzen)
- **URL:** https://registry.opendata.aws/terrain-tiles/
- **Endpoint:** `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (z=14)
- **Resolución:** ~30 m · **Datum vertical:** nivel medio del mar (EGM96 aprox.)
- **Fecha de acceso:** 2026-09-04

### 2. Profundidad del lecho (primaria)
- **Dataset:** DEM Global Mosaic
- **Organismo:** NOAA National Centers for Environmental Information (NCEI)
- **URL:** https://www.ncei.noaa.gov/maps/bathymetry/
- **Endpoint:** `https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer/getSamples`
- **Resolución:** ~1,3 km · **Datum vertical:** nivel medio del mar
- **Fecha de acceso:** 2026-09-04

### 3. Profundidad del lecho (contraste)
- **Dataset:** GEBCO 2026 Grid (COG), leído por range requests
- **Organismo:** GEBCO / General Bathymetric Chart of the Oceans
- **Distribución:** Source Cooperative — https://source.coop/giswqs/gebco-bathymetry
- **Objeto:** `data.source.coop/giswqs/gebco-bathymetry/gebco_2026/gebco_2026_n0.0_s-90.0_w-90.0_e0.0.tif`
- **Procedencia:** capa TID del mismo dataset (`gebco_2026_tid_...tif`)
- **Resolución:** 382 m E–O a esta latitud · **Datum vertical:** nivel medio del mar
- **Fecha de acceso:** 2026-09-04

### 4. Marea
- **Dataset:** Pronóstico de marea del Río de la Plata (120 extremos: pleamar/bajamar)
- **Organismo:** Servicio de Hidrografía Naval (SHN), Ministerio de Defensa, Argentina
- **URL:** https://www.hidro.gov.ar/DA/DatosAbiertos.asp
- **Rango:** 2026-08-07 15:00 → 2026-09-04 20:30 ART · alturas 0,10 – 2,70 m
- **Datum vertical:** plano de reducción de sondajes
- **Fecha de acceso:** 2026-09-04

## Datum: el problema que no resolví

Las alturas del SHN se refieren al **plano de reducción de sondajes**; las cotas de
terreno y lecho, al **nivel medio del mar**. El desplazamiento entre ambos para San
Isidro **no está publicado**. No lo inventé: el plano de agua se dibuja sobre el cero del
terreno. El prototipo sirve para leer el **rango** de la marea, no la profundidad
absoluta bajo la quilla.

## Limitaciones

- **El lecho no está medido.** Según la propia capa TID de GEBCO, sólo el **5,5 %** de
  las celdas del recorte viene de una medición real; el resto es grilla pre-generada.
  En el Río de la Plata completo la proporción sube a 22 %.
- **Interpolación.** El lecho se remuestrea por bilineal desde 40×36 (NOAA) o 26×19
  (GEBCO) a la malla de 160×144. Los relieves suaves entre celdas son interpolación.
- **Suavizado del terreno.** Mediana 3×3 sobre celdas de tierra para quitar píxeles
  sueltos con error de SRTM. Es filtrado, no invención: no entra ningún valor nuevo.
- **Curva de marea reconstruida.** El SHN publica extremos; entre dos consecutivos
  interpolo con una cosenoidal (forma estándar de la onda de marea). Los extremos son
  dato oficial; los intermedios, reconstrucción.
- **Huecos declarados.** La serie tiene 1 tramo de más de 14 h sin extremos. Ahí el
  prototipo muestra «sin dato» en lugar de inventar curva.
- **Línea de costa.** Overpass (OpenStreetMap) devolvió 406 y no pude traerla. La costa
  visible surge del propio SRTM donde la cota cae a cero, no es una línea cartográfica.

## Criterio de «si sale bien»

| Criterio | Resultado |
|---|---|
| Profundidad coherente | NOAA y GEBCO, independientes, coinciden en ~1–2 m de mediana frente a San Isidro. **Se cumple** |
| Marea sincronizada | 120 extremos del SHN, mediana de 6,0 h entre pleamar y bajamar (semidiurno del Río de la Plata), rango 0,10–2,70 m. **Se cumple** |
| Performance | 45.474 triángulos, WebGL sin librerías, un archivo, cero pedidos de red en runtime. **Se cumple** |

## Reutilización

Los datos son de sus organismos: citá la fuente original (NOAA, GEBCO, SHN, AWS/NASA),
no este prototipo. La idea y el armado son de **Francisco Deane +
https://escueladewingfoil.com**.
