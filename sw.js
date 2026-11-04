// Keeps the app opening offline (gyms have bad signal).
// The app itself: serve the saved copy instantly and refresh it in the background.
// The food files are large and only change with a rebuild, so they're fetched once and kept.
const CACHE = 'rep-quest-v2';
const DATA_CACHE = 'rep-quest-data-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'js/util.js', 'js/science.js', 'js/library.js', 'js/core.js', 'js/foods.js', 'js/charts.js', 'js/views.js', 'js/sheets.js', 'js/app.js', 'food-worker.js', 'manifest.webmanifest', 'fonts/big-shoulders.woff2', 'fonts/instrument-sans.woff2', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // online food searches go straight to the network

  const path = url.pathname;
  if (path.endsWith('/foods/meta.json')) {
    // Newest database description when online, saved one when not.
    e.respondWith(caches.open(DATA_CACHE).then(async cache => {
      try {
        const res = await fetch(e.request);
        if (res.ok) cache.put(path, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(path)) || Response.error();
      }
    }));
    return;
  }
  if (path.includes('/foods/') || path.endsWith('exercises-db.json') || path.includes('/vendor/')) {
    // The ?v= in the URL changes when a file is rebuilt.
    e.respondWith(caches.open(DATA_CACHE).then(async cache => {
      const saved = await cache.match(e.request);
      if (saved) return saved;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    });
    if (saved) {
      fresh.catch(() => {});
      return saved;
    }
    return fresh;
  }));
});
