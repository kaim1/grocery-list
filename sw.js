// sw.js — cache-first app shell. Bump VERSION on every deploy.
const VERSION = 'v5';
const ASSETS = ['.', 'index.html', 'style.css', 'app.js', 'store.js', 'seed.js',
  'manifest.json', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c =>
    c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true })
    .then(hit => hit || fetch(e.request)));
});
