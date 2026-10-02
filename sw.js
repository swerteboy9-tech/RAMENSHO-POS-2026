const CACHE = 'ramen-sho-pos-v16';
const ASSETS = ['./', 'index.html', 'styles.css', 'config.js', 'menu-default.js', 'sheet-sync.js', 'app.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
// Network first (so updates show up), cache as offline fallback. Apps Script calls are not cached.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('script.google')) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});
