const CACHE_NAME = "memoriya-runtime-v10";
const LEGACY_TV_BROWSER = (() => {
  const userAgent = self.navigator.userAgent || "";
  const android = userAgent.match(/Android\s+(\d+)/i);
  const chrome = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/i);
  const oldNonMobileAndroid = android && Number(android[1]) <= 9 && !/Mobile/i.test(userAgent);
  const oldChromiumTv = chrome && Number(chrome[1]) <= 66 && !/Mobile/i.test(userAgent);
  return Boolean(oldNonMobileAndroid || oldChromiumTv || /Geestar|Geestart|GoBrowser|Go Browser/i.test(userAgent));
})();

const shouldBypassCache = requestUrl => {
  try {
    const parsed = new URL(requestUrl);
    if (parsed.origin !== self.location.origin) return true;
    if (parsed.pathname.startsWith("/api/") || parsed.pathname.startsWith("/__memoriya-cast")) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
};

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

    // Never intercept cross-origin Google OAuth / Drive / Photos / Firebase API requests.
    if (shouldBypassCache(request.url)) {
      return;
    }

    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request, { cache: "no-store" }).catch(async () => (await caches.match(request)) || Response.error())
      );
      return;
    }

    event.respondWith(
      fetch(request).catch(async () => (await caches.match(request)) || Response.error())
    );
  });
}
