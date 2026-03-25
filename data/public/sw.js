/**
 * sw.js — Service Worker
 *
 * Caches the app shell for offline use.
 * Does NOT cache user PDF files or blob URLs.
 */

const CACHE_NAME = '20260315-154122';
const APP_SHELL = [
  './',
  'index.html',
  'presentation.html',
  'remote.html',
  'qa.html',
  'manifest.json',
  'assets/icon-192.png',
  'assets/icon-512.png',
  /* VITE_INJECT_ASSETS */
];

/* ---- Install: pre-cache app shell (resilient) ---- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache files individually — don't let one failure break everything
      for (const url of APP_SHELL) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn(`[sw] Failed to cache ${url}:`, e);
        }
      }
    })
  );
  self.skipWaiting();
});

/* ---- Activate: clean old caches ---- */
 
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ---- Fetch: network-first for HTML, cache-first for hashed assets ---- */

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache blob URLs (user PDFs)
  if (url.protocol === 'blob:') return;

  // Never cache CDN resources — let the browser handle HTTP caching
  if (url.hostname !== location.hostname) return;

  // HTML / navigation requests → network-first (always fresh)
  const isHTML = event.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname === '/';

  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update the cache with the fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // Offline fallback
    );
    return;
  }

  // JS / CSS / assets (Vite hashed) → cache-first (hash guarantees uniqueness)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
