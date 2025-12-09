const CACHE_NAME = 'gtracker-cache-v9';
const ASSETS = [
  '/',
  '/index.html',
  '/edit.html',
  '/history.html',
  '/calendar.html',
  '/weekly.html',
  '/badges.html',
  '/glucose.html',
  '/profile.html',
  '/weight.html',
  '/style.css',
  '/main.js',
  '/dashboard.js',
  '/edit.js',
  '/history.js',
  '/calendar.js',
  '/weekly.js',
  '/badges.js',
  '/glucose.js',
  '/profile.js',
  '/weight.js',
  '/manifest.json',
  '/icons/gtracker-192.svg',
  '/icons/gtracker-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
