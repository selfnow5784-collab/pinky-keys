// Bump VERSION whenever any app file changes; phones then fetch the new files and show "Update now".
const VERSION = 'v2.0.3';
const CACHE_NAME = 'transponder-db-' + VERSION;
const APP_FILES = ['./', './index.html', './app.js', './csv.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_FILES.map(u => new Request(u, { cache: 'reload' })))));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('transponder-db-') && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Cache first (works offline); for page loads ignore ?query so any link opens the cached app.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => hit ||
      fetch(req).catch(() => req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
