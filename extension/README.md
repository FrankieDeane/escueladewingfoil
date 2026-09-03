# Comparador Wingfoil — extensión de Chrome

Compara el precio de una publicación de Mercado Libre contra Hardwind y
Kitestore, sin salir de la página. (GPX Store y Santa Tabla quedaron afuera
por ahora — ver `fetch-ml.js`.)

## Instalación (todavía no está en la Chrome Web Store)

1. Descargá esta carpeta (o el .zip desde escueladewingfoil.com.ar).
2. Abrí `chrome://extensions` en Chrome.
3. Activá **Modo de desarrollador** (arriba a la derecha).
4. Tocá **Cargar descomprimida** y elegí esta carpeta.
5. Abrí cualquier publicación de wingfoil en `mercadolibre.com.ar` y hacé clic
   en el ícono 🌊 de la barra de extensiones.

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
