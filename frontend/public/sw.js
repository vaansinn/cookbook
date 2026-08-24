// Recipe Drawer service worker — offline support for the app shell and
// previously-viewed recipes. Deliberately simple (no Workbox/build step):
// - App shell / static assets: cache-first, refreshed in the background.
// - API GET requests (/api/...): network-first, falling back to the cache
//   when offline — so a recipe you've already opened still works without
//   a connection. Never caches mutating requests (POST/PATCH/DELETE) or
//   cross-origin calls.

const SHELL_CACHE = "recipe-drawer-shell-v1";
const API_CACHE = "recipe-drawer-api-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(API_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
