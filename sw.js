const CACHE = 'jastrow-v9';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/search.js',
  './js/keyboard.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './data/index.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      });
    })
  );
});

// Pre-cache all entry chunks on request from the app
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') { self.skipWaiting(); return; }
  if (e.data !== 'prefetch-entries') return;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUV'.split('');
  caches.open(CACHE).then(async cache => {
    for (const letter of letters) {
      const url = new URL(`./data/entries/${letter}.json`, self.location.href).href;
      if (!await cache.match(url)) {
        fetch(url).then(r => r.ok && cache.put(url, r)).catch(() => {});
      }
    }
  });
});
