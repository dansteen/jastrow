const CACHE = 'jastrow-v1';
const ENTRY_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUV'.split('');

const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/search.js',
  '/js/keyboard.js',
  '/icons/icon.svg',
  '/data/index.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
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
  // Only cache GET requests to our own origin
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache entry JSON files as they're loaded
        if (url.pathname.startsWith('/data/')) {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      });
    })
  );
});

// Background-cache all entry files when the app requests it
self.addEventListener('message', e => {
  if (e.data === 'prefetch-entries') {
    caches.open(CACHE).then(async cache => {
      for (const letter of ENTRY_LETTERS) {
        const url = `/data/entries/${letter}.json`;
        const cached = await cache.match(url);
        if (!cached) {
          fetch(url).then(r => r.ok && cache.put(url, r)).catch(() => {});
        }
      }
    });
  }
});
