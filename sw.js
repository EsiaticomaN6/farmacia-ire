/* ============================================================
   Farmacia IRE — Service Worker
   Estrategia: Cache-First para assets, Network-First para datos
   ============================================================ */

const CACHE_NAME = 'farmacia-ire-v1';
const XLSX_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const FONTS_URL  = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';

// Archivos que se cachean al instalar (shell de la app)
const PRECACHE_ASSETS = [
  './FarmaciaIRE.html',
  './manifest.json',
  './icons/icon-72x72.png',
  './icons/icon-96x96.png',
  './icons/icon-128x128.png',
  './icons/icon-144x144.png',
  './icons/icon-152x152.png',
  './icons/icon-192x192.png',
  './icons/icon-384x384.png',
  './icons/icon-512x512.png',
];

// ── INSTALL: precachear el shell de la app ──────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando Farmacia IRE SW...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear assets locales
      const localPromise = cache.addAll(PRECACHE_ASSETS);

      // Cachear XLSX y fuentes (best-effort, no bloquean instalación)
      const externalPromise = Promise.allSettled([
        fetch(XLSX_URL, { mode: 'cors' })
          .then(r => r.ok ? cache.put(XLSX_URL, r) : null)
          .catch(() => null),
        fetch(FONTS_URL, { mode: 'cors' })
          .then(r => r.ok ? cache.put(FONTS_URL, r) : null)
          .catch(() => null),
      ]);

      return localPromise;
    }).then(() => {
      console.log('[SW] Precaché completo.');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar caches viejos ───────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Eliminando caché viejo:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-First con fallback a red ─────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Ignorar requests que no sean GET
  if (event.request.method !== 'GET') return;

  // Ignorar chrome-extension y otros esquemas no-http
  if (!url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Está en caché → devolver inmediatamente
        // Y actualizar en background si hay red (stale-while-revalidate)
        const fetchPromise = fetch(event.request)
          .then(networkResp => {
            if (networkResp && networkResp.ok) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, networkResp.clone());
              });
            }
            return networkResp;
          })
          .catch(() => null);

        return cached; // Siempre responder con caché primero
      }

      // No está en caché → intentar red
      return fetch(event.request)
        .then(networkResp => {
          if (!networkResp || !networkResp.ok) return networkResp;

          // Guardar en caché para próxima vez
          const cloned = networkResp.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, cloned);
          });

          return networkResp;
        })
        .catch(() => {
          // Sin red y sin caché → página de offline si es navegación
          if (event.request.mode === 'navigate') {
            return caches.match('./FarmaciaIRE.html');
          }
          return new Response('Recurso no disponible offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
    })
  );
});

// ── MENSAJE: forzar actualización ────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
