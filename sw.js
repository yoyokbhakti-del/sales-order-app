const CACHE_NAME = "sales-order-pwa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./sync.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  // Network-first: selalu ambil versi terbaru, cache hanya sebagai cadangan offline
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => caches.match(request).then((c) => c || caches.match("./index.html")))
  );
});
