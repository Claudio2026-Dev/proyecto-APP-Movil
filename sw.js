const CACHE_NAME = 'mantind-os-v11';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

// Instalación forzada
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('PWA Cache: Indexando App Shell...');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activación y limpieza de obsoletos
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia de Red Inteligente (Network-First / Fallback to Cache)
// Evita que la app falle si falta algún icono o recurso no crítico
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Si la red responde, clonamos y guardamos actualización en caché
        if (response.status === 200) {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return response;
      })
      .catch(() => {
        // Si cae la señal en planta, responde inmediatamente con el caché
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // Si no hay mapeo, devuelve una respuesta vacía estructurada
          return new Response('Offline Content Unavailable');
        });
      })
  );
});