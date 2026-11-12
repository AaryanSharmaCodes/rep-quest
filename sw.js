// Keeps the app opening offline (gyms have bad signal).
// The app itself: each release is one complete saved copy, so old and new files never mix.
// CHANGE THIS NAME ON EVERY RELEASE, and APP_VERSION in js/core.js with it: a phone only updates when this file changes.
// The food files are large and only change with a rebuild, so they're fetched once and kept.
const CACHE = 'rep-quest-v24';
const DATA_CACHE = 'rep-quest-data-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'js/canvas-confetti.js', 'js/motion-lib.js', 'js/morphdom.js', 'js/cloud.js', 'js/motion.js', 'js/quotes.js', 'js/util.js', 'js/science.js', 'js/library.js', 'js/core.js', 'js/foods.js', 'js/charts.js', 'js/views.js', 'js/checkin.js', 'js/micros.js', 'js/sheets.js', 'js/app.js', 'food-worker.js', 'manifest.webmanifest', 'fonts/cinzel.woff2', 'fonts/cinzel-deco-700.woff2', 'fonts/silkscreen-700.woff2', 'fonts/instrument-sans.woff2', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'guide/ios-share.jpg', 'guide/ios-more.jpg', 'guide/ios-add.jpg', 'guide/ios-confirm.jpg', 'guide/android-menu.jpg', 'guide/android-add.jpg', 'guide/android-choice.jpg', 'guide/android-install.jpg'];

self.addEventListener('install', e => {
  // 'reload' skips the browser's HTTP cache. GitHub Pages lets it reuse files for 10 minutes,
  // and without this a new release can get saved with the old files inside.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
        if (res.ok) {
          cache.put(path, res.clone());
          // A rebuilt database replaces the old files, so don't keep both on the phone.
          const { built } = await res.clone().json();
          const saved = await cache.keys();
          saved.forEach(r => {
            const u = new URL(r.url);
            if (u.pathname.includes('/foods/') && u.searchParams.has('v') && u.searchParams.get('v') !== String(built)) cache.delete(r);
          });
        }
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
  e.respondWith(caches.open(CACHE).then(async cache => (await cache.match(e.request, { ignoreSearch: true })) || fetch(e.request)));
});
