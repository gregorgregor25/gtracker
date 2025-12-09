// Increment this when assets change
const CACHE_NAME = 'gtracker-cache-v8';

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
  '/icons/gtracker-512.svg',
];

/* INSTALL */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

/* ACTIVATE — remove old caches */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

/* FETCH — cache-first strategy */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
