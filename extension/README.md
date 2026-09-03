# Comparador Wingfoil — extensión de Chrome

Compara el precio de una publicación de Mercado Libre contra Hardwind y
Kitestore, sin salir de la página.

## Instalación (todavía no está en la Chrome Web Store)

1. Descargá el .zip desde escueladewingfoil.com.ar. Andá a la carpeta donde
   se descargó, hacé **clic derecho sobre el .zip** → **"Extraer todo..."**
   (Windows) o doble clic para descomprimirlo (Mac). Eso crea una
   **carpeta nueva** con todos los archivos adentro — anotá dónde quedó, la
   necesitás en el paso 4. No uses los archivos desde adentro de
   WinRAR/7-Zip: tienen que quedar extraídos en esa carpeta nueva del disco.
2. En Chrome, hacé clic en el ícono de piezas de rompecabezas 🧩 (junto a la
   barra de direcciones) → **Gestionar extensiones**. (O escribí
   `chrome://extensions` directamente en la barra de direcciones.)
3. Activá **Modo de desarrollador** (arriba a la derecha de esa página).
4. Van a aparecer 3 botones nuevos arriba a la izquierda — tocá
   **Cargar descomprimida** y elegí la carpeta nueva del paso 1 (la que
   tiene `popup.html`, `manifest.json`, etc. adentro).
5. Abrí cualquier publicación de wingfoil en `mercadolibre.com.ar` y hacé clic
   en el ícono 🌊 (fijalo desde el ícono de piezas 🧩 si no lo ves).

⚠️ **No hagas doble clic en `popup.html` ni en ningún otro archivo de esta
carpeta para "abrirla".** Estos archivos solo funcionan dentro de Chrome
como extensión (paso 4) — abiertos sueltos no tienen forma de leer la
publicación de Mercado Libre y se quedan colgados.

## Cómo funciona

- `content.js` lee el título y precio de la publicación de Mercado Libre que
  estás mirando (no envía nada a ningún servidor).
- `popup.js` trae `store-data.json` desde escueladewingfoil.com.ar/store-data.json
  — un archivo que un GitHub Action (`fetch-ml.js`) actualiza cada 6 horas
  rastreando Hardwind y Kitestore — y hace el matcheo por marca + modelo
  contra el producto detectado.
- No hace scraping en vivo desde tu navegador: siempre lee el último
  rastreo publicado en el sitio.
- "Ver informe completo" abre `escueladewingfoil.com.ar/comparador.html`
  con el mismo producto, para ver la tabla completa o exportarla a PDF.

## Permisos que pide

- `activeTab` / `scripting`: para leer el título y precio de la pestaña de
  Mercado Libre activa cuando abrís el popup.
- Host access a `mercadolibre.com.ar` y `escueladewingfoil.com.ar` solamente.

No pide `<all_urls>`, no rastrea tu navegación, no guarda historial.
