/* sw.js — service worker: caches every app file so it opens with no internet.
   Bump VERSION whenever any file changes so phones pick up the new files. */
const VERSION = 'v3.4-1', CACHE = 'pinky-keys-' + VERSION;
const FILES = ['./', './index.html', './styles.css', './manifest.json', './icon-192.png', './icon-512.png',
  './js/util.js', './js/csv.js', './js/search.js', './js/data.js', './js/onhand.js', './js/lookup.js', './js/db.js', './js/store.js',
  './js/ui-table.js', './js/ui-search.js', './js/ui-inventory.js', './js/ui-reference.js', './js/ui-vehicles.js', './js/ui-data.js', './js/app.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('pinky-keys-') && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: r.mode === 'navigate' }).then(hit => hit || fetch(r).catch(() => r.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
