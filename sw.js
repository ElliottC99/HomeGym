// Home Gym Log — service worker
// Cache-first for the app shell so it opens instantly and works offline
// once it's been loaded at least once. Bump CACHE_NAME to force an update
// the next time you deploy a change.
const CACHE_NAME = "home-gym-log-v1";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./app.bundle.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {
      // If a CDN request fails at install time (e.g. offline first install),
      // don't block install entirely — cache what we can.
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      // Serve cached immediately if we have it (fast + offline-safe),
      // still refresh the cache in the background from the network.
      return cached || networkFetch;
    })
  );
});
