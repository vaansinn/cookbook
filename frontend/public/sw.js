// Recipe Drawer service worker — offline support for the app shell and a
// small allowlist of genuinely public API responses.
// - App shell / static assets: cache-first, refreshed in the background.
// - Public, non-entitlement-varying API GETs (see PUBLIC_API_ALLOWLIST):
//   network-first, falling back to the cache when offline.
// - Every other API GET (anything not on the allowlist, and always anything
//   carrying an Authorization header) is network-only: never read from or
//   written to the cache. Most `/api/*` responses vary by who's asking (an
//   account's entitlement/tier access, favorites, progress, meal plans...)
//   even when the URL itself looks the same for everyone, so a cache keyed
//   on the URL alone can hand one account's private/premium response to a
//   different account that logs in later on the same device — including
//   offline. GET /api/dishes/<slug> is the clearest example: the path looks
//   static per-recipe, but its content differs by tier access, so it is
//   deliberately NOT on the allowlist.
//   Trade-off accepted: a previously-viewed recipe's detail is no longer
//   available offline. That's a real regression versus the old (unsafe)
//   behavior, not a bug — correctness beats offline convenience here.
// Never caches mutating requests (POST/PATCH/DELETE) or cross-origin calls.

const SHELL_CACHE = "recipe-drawer-shell-v2";
const API_CACHE = "recipe-drawer-api-v2";

// Paths whose response is the same for every caller — no auth, no
// per-account entitlement variation. Keep this list small and deliberate;
// don't add a path here just because it "looks public".
const PUBLIC_API_ALLOWLIST = [
  /^\/api\/glossary(\/|$)/, // glossary lookup/definitions
  /^\/api\/dishes$/, // anonymous dish list/filter call (not /dishes/<slug>)
  /^\/api\/filters$/, // discovery filter chips
];

function isPublicApiPath(pathname) {
  return PUBLIC_API_ALLOWLIST.some((re) => re.test(pathname));
}

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
    // Any authenticated request is private by definition — never read it
    // from, or write it into, the cache. Go straight to the network.
    if (request.headers.has("Authorization")) {
      event.respondWith(fetch(request));
      return;
    }
    // Anonymous requests: only the small public allowlist gets the
    // cache-fallback treatment. Everything else (including anonymous
    // /api/dishes/<slug> calls) is network-only too, since the same path
    // can later be requested by a different, authenticated caller on this
    // device and must never be answered from someone else's cached entry.
    if (!isPublicApiPath(url.pathname)) {
      event.respondWith(fetch(request));
      return;
    }
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
