// Bramador — service worker: la app abre sin señal con lo último que vio.
//
// Archivos propios (pantalla, estilos, mapa): primero la copia guardada y se
// renueva por detrás. Datos (/api/…): primero la red, y si no hay, lo último.
// Los datos de afuera (pronóstico, mareas) ya los guarda app.js en el celular.
const VERSION = 'bramador-v1';
const BASE = [
  '/bramador/',
  '/bramador/index.html',
  '/bramador/app.css',
  '/bramador/app.js',
  '/bramador/manifest.webmanifest',
  '/bramador/icons/icon-192.png',
  '/bramador/vendor/maplibre-gl-4.7.1.js',
  '/bramador/vendor/maplibre-gl-4.7.1.css',
  '/bramador/vendor/satellite-5.0.0.min.js',
  '/favicon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('bramador-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/') || url.pathname === '/mp-data.json') {
    e.respondWith(
      fetch(r).then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(r, copia)); }
        return res;
      }).catch(() => caches.match(r).then(g => g || Response.error()))
    );
    return;
  }

  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).catch(() => caches.match('/bramador/')));
    return;
  }

  e.respondWith(
    caches.match(r).then(g => {
      const red = fetch(r).then(res => {
        if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(r, copia)); }
        return res;
      }).catch(() => g);
      return g || red;
    })
  );
});

// Tocar el aviso de "Hay viento" abre la app en ese día.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = (e.notification.data && e.notification.data.url) || '/bramador/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      const w = ws.find(x => x.url.includes('/bramador/'));
      if (w) { w.navigate(destino); return w.focus(); }
      return self.clients.openWindow(destino);
    })
  );
});
