// Home Gym — offline shell and explicit update lifecycle.
// Increment this value for every release.
const CACHE_NAME = "home-gym-log-v2.0";

const REQUIRED_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./app.bundle.js",
  "./app-redesign.js",
  "./app-redesign.css",
  "./firebase-config.js",
  "./notifications.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-192-maskable.png",
  "./icon-512-maskable.png",
];

const OPTIONAL_SHELL = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-database-compat.js",
  "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(REQUIRED_SHELL);
      await Promise.allSettled(OPTIONAL_SHELL.map(url => cache.add(url)));
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  }
  if (event.data?.type === "GET_VERSION") {
    const message = { type: "HOMEGYM_VERSION", cacheName: CACHE_NAME };
    if (event.ports?.[0]) event.ports[0].postMessage(message);
    else event.source?.postMessage(message);
  }
});

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {
      title: "Home Gym",
      body: event.data ? event.data.text() : "Time for today's workout.",
    };
  }
  event.waitUntil(self.registration.showNotification(data.title || "Home Gym", {
    body: data.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: data.url || "./" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data?.url || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    })
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // The HTML and configuration should check the network first so a new
  // release can discover its waiting service worker immediately.
  if (url.origin === self.location.origin &&
      (url.pathname.endsWith("/") ||
       url.pathname.endsWith(".html") ||
       url.pathname.endsWith("firebase-config.js"))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response?.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
