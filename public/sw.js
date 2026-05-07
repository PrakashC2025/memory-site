const CACHE_NAME = "memoriya-runtime-v4";

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => caches.match(request))
    );
    return;
  }

  if (request.url.includes("googleusercontent.com") || request.url.includes("google.com/thumbnail") || request.url.includes("googleapis.com/drive")) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
