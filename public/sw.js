// Offline cache for the merchant app. Network first (so updates arrive when online), cache fallback (so it works with no signal).
const C = 'zenith-tally-v2';
const ASSETS = ['/index.html', '/merchant.html', '/merchant.js', '/npp.js', '/style.css', '/lib/nacl-fast.min.js', '/lib/jsQR.js', '/lib/qrcode.js'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(C).then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(C).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('/merchant.html') : r))));
});
