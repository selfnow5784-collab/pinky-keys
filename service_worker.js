/* service_worker.js — retired v1 worker, now a one-time kill switch.
   Phones that ran the old app still check this URL. This version deletes every cache,
   unregisters itself and reloads open tabs, so they load the current app (which uses sw.js). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    await self.clients.claim();
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
  })());
});
self.addEventListener('fetch', () => {}); // no respondWith: every request goes straight to the network
