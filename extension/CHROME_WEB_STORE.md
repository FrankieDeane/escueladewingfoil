# Publicar "Comparador Wingfoil" en la Chrome Web Store

Todo el contenido para completar el formulario está acá. Vos solo tenés que:
1. Crear una cuenta de developer en https://chrome.google.com/webstore/devconsole (pago único de USD 5).
2. Click en "Nuevo item" y subir `descargas/comparador-wingfoil-extension.zip` (ya está en el repo).
3. Pegar los textos de abajo en cada campo.
4. Sacar 1-2 capturas (instrucciones abajo) y subirlas.
5. Enviar a revisión. Google tarda entre 1 y varios días hábiles.

---

## Store listing

**Nombre del producto** (máx. 45 caracteres)
```
Comparador Wingfoil
```

**Resumen** (máx. 132 caracteres — aparece en los resultados de búsqueda)
```
Comparás precios de wingfoil entre Mercado Libre, Hardwind, GPX Store, Kitestore y Santa Tabla, sin salir de la publicación.
```

**Descripción detallada**
```
¿Estás por comprar una tabla, un wing o un foil? El Comparador Wingfoil te
muestra al instante si lo conseguís más barato en otra tienda antes de
pagarlo en Mercado Libre.

Cómo funciona:
1. Abrís cualquier publicación de equipo de wingfoil en mercadolibre.com.ar
2. Hacés clic en el ícono de la extensión
3. Te muestra el precio de esa publicación al lado del de Hardwind, GPX
   Store, Kitestore y Santa Tabla — con el ahorro en pesos si hay una
   opción más barata

Los precios de las otras tiendas se actualizan cada 6 horas desde
escueladewingfoil.com.ar. Con un clic accedés al informe completo, que
también podés exportar o compartir.

Gratis, sin registro, sin publicidad. Hecha por Escuela de Wingfoil
Argentina para la comunidad de wingfoil, kite y windsurf del país.
```

**Categoría**: Shopping
**Idioma**: Spanish (Latin America)
**Sitio web**: https://www.escueladewingfoil.com.ar
**Política de privacidad**: https://www.escueladewingfoil.com.ar/extension-privacidad.html

---

## Pestaña "Privacy practices" (obligatoria)

**Single purpose** (propósito único, un párrafo)
```
Comparar el precio de una publicación de Mercado Libre que el usuario está
viendo contra el precio del mismo producto en otras cuatro tiendas de
equipamiento de wingfoil (Hardwind, GPX Store, Kitestore, Santa Tabla).
```

**Justificación de cada permiso** (los pega tal cual en cada campo del
formulario):

| Permiso | Justificación |
|---|---|
| `activeTab` | Necesario para leer el título y precio de la publicación de Mercado Libre que el usuario está mirando, solo cuando hace clic en el ícono de la extensión. |
| `scripting` | Necesario para inyectar el content script que lee el título y precio de la página cuando el usuario abre el popup, en caso de que la página ya estuviera cargada antes de instalar la extensión. |
| Acceso a host `mercadolibre.com.ar` | La extensión solo funciona sobre publicaciones de Mercado Libre Argentina — necesita leer esa página para saber qué producto comparar. |
| Acceso a host `escueladewingfoil.com.ar` | Para traer store-data.json (precios de las otras 4 tiendas, actualizados cada 6h) y para abrir el informe completo en comparador.html. |

**¿Recolecta datos personales, financieros, de salud, ubicación, historial
web, actividad del usuario, contenido de comunicaciones, etc.?**
Marcar **NO** en todas las categorías del formulario de Google. La
extensión no envía datos del usuario a ningún servidor — solo lee la
publicación activa localmente y hace un GET a un archivo JSON público.

**¿Usa código remoto?** No.

---

## Capturas de pantalla (obligatorias, 1 a 5 imágenes)

Especificación de Google: **1280×800** o **640×400** píxeles, PNG o JPEG
sin transparencia.

Cómo sacarlas (2 minutos):
1. Cargá la extensión descomprimida en Chrome (`chrome://extensions` →
   Modo desarrollador → Cargar descomprimida → carpeta `extension/`).
2. Abrí una publicación de wingfoil en mercadolibre.com.ar (por ejemplo,
   la tabla Duotone Sky Air que ya está linkeada en el sitio).
3. Hacé clic en el ícono 🌊 para abrir el popup.
4. Capturá la pantalla (o solo el popup) y recortá/escalá a 1280×800.
5. Repetí opcionalmente con `comparador.html` abierto para una segunda
   captura mostrando el informe completo.

**Ícono de la tienda** (128×128, ya generado):
`extension/icons/icon128.png` — se sube tal cual, no hace falta tocar nada.
