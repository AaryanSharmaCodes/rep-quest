// Keeps the app opening offline (gyms have bad signal).
// Serves the saved copy instantly and refreshes it in the background,
// so a new version shows up the next time the app is opened.
const CACHE = 'rep-quest-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'data.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Food database searches go straight to the network.
  if (url.origin !== self.location.origin && !FONT_HOSTS.includes(url.hostname)) return;

  e.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') cache.put(e.request, res.clone());
      return res;
    });
    if (saved) {
      fresh.catch(() => {});
      return saved;
    }
    return fresh;
  }));
});
