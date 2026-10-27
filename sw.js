// sw.js — cache-first app shell. Bump VERSION on every deploy.
const VERSION = 'v29';
const ASSETS = ['.', 'index.html', 'style.css', 'app.js', 'store.js', 'seed.js',
  'account.js', 'cloud.js', 'reminders.js', 'cloud-config.js', 'sync.js', 'persistence.js',
  'nlp-dates.js', 'repeat.js', 'manifest.json', 'icon-180.png', 'icon-512.png'];

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
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true })
    .then(hit => hit || fetch(e.request)));
});

// Reminders arrive from the Supabase send-reminders function as {id, title, body}.
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'תזכורת', {
    body: data.body || '', tag: data.id || 'reminder', data: { id: data.id },
    icon: 'icon-180.png', badge: 'icon-180.png', lang: 'he', dir: 'rtl',
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows[0];
    if (open) {
      if (id) open.postMessage({ type: 'open-todo', id });
      return open.focus();
    }
    return self.clients.openWindow(id ? `./?todo=${encodeURIComponent(id)}` : './');
  }));
});
