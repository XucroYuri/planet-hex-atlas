// Offline shell for the atlas. Immutable release assets are cached on first use;
// navigations are network-first with the cached shell as fallback.
const CACHE = 'orbis-atlas-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    const shell = await cache.match('/');
    if (shell) return shell;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Release assets are content-addressed and immutable.
  if (url.pathname.startsWith('/r/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === 'navigate' || url.pathname === '/release.json') {
    event.respondWith(networkFirst(request));
  }
});
