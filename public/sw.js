const CACHE_NAME = "memoriya-runtime-v5";
const LEGACY_TV_BROWSER = /Android\s*(?:TV|\d).*?(?:TV|SMART-TV|HbbTV)|GoogleTV|AFT[BSM]|BRAVIA|SHIELD/i.test(self.navigator.userAgent || "");

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    if (LEGACY_TV_BROWSER) {
      await self.registration.unregister();
      return;
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
  })());
});

// Old Android TV WebViews should never be blocked by an offline cache layer.
if (!LEGACY_TV_BROWSER) {
  self.addEventListener("fetch", event => {
    const { request } = event;
    if (request.method !== "GET") return;

    if (request.mode === "navigate") {
      event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request)));
      return;
    }

    if (request.url.includes("googleusercontent.com") || request.url.includes("google.com/thumbnail") || request.url.includes("googleapis.com/drive")) {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith(fetch(request).catch(() => caches.match(request)));
  });
}
