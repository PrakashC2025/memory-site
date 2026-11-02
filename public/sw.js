const CACHE_NAME = "memoriya-runtime-v6";
const LEGACY_TV_BROWSER = (() => {
  const userAgent = self.navigator.userAgent || "";
  const android = userAgent.match(/Android\s+(\d+)/i);
  const chrome = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/i);
  const oldNonMobileAndroid = android && Number(android[1]) <= 9 && !/Mobile/i.test(userAgent);
  const oldChromiumTv = chrome && Number(chrome[1]) <= 66 && !/Mobile/i.test(userAgent);
  return Boolean(oldNonMobileAndroid || oldChromiumTv || /(?:Geestar|Geestart|GoBrowser|Go Browser)/i.test(userAgent));
})();

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

if (!LEGACY_TV_BROWSER) {
  self.addEventListener("fetch", event => {
    const { request } = event;
    if (request.method !== "GET") return;

    if (
      request.url.includes("googleusercontent.com") ||
      request.url.includes("google.com/thumbnail") ||
      request.url.includes("lh3.googleusercontent.com") ||
      request.url.includes("googleapis.com/drive")
    ) {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith((async () => {
      try {
        const response = await fetch(
          request,
          request.mode === "navigate" ? { cache: "no-store" } : undefined
        );
        if (response && response.ok && request.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE_NAME);
          void cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const fallbackRoot = await caches.match("/");
          if (fallbackRoot) return fallbackRoot;
        }
        throw err;
      }
    })());
  });
}
