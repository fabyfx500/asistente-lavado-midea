// Service worker del Asistente de Lavado Midea.
// - Página (HTML), scripts (.js) y estilos (.css): red primero; si no hay conexión, la última
//   copia guardada. Así la página, app.js, programas.js y styles.css siempre son de la misma versión.
// - Estáticos (íconos, manifest): caché primero y se actualizan en segundo plano.
// - /api: nunca se cachea (siempre va a la red).
// IMPORTANTE: al cambiar archivos del front, sube VERSION para que la app instalada
// muestre el aviso "Hay una versión nueva".
const VERSION = 'v8';
const CACHE = 'lavado-midea-' + VERSION;
const PRECACHE = [
  '/',
  '/styles.css',
  '/app.js',
  '/programas.js',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];
const ESPERA_RED_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k.startsWith('lavado-midea-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// La página pide activar la versión nueva cuando el usuario toca "Actualizar".
self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVAR') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith(redPrimero(req, '/'));
    return;
  }
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(redPrimero(req, url.pathname));
    return;
  }
  event.respondWith(cachePrimero(event, req));
});

// "clave": con qué nombre se guarda (la página siempre como "/", aunque venga con ?q=).
async function redPrimero(req, clave) {
  const cache = await caches.open(CACHE);
  const red = fetch(req).then((res) => {
    if (res.ok) cache.put(clave, res.clone());
    return res;
  });
  const guardada = await cache.match(clave);
  if (!guardada) return red;
  // Con mala señal no esperamos para siempre: a los 4 s mostramos la copia guardada.
  const plazo = new Promise((resolve) => setTimeout(() => resolve(guardada), ESPERA_RED_MS));
  return Promise.race([red.catch(() => guardada), plazo]);
}

async function cachePrimero(event, req) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req, { ignoreSearch: true });
  const red = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (guardada) {
    event.waitUntil(red.catch(() => {}));
    return guardada;
  }
  return red;
}
