// Cache only the public build shell inspected in frontend/index.html,
// public/manifest.json and vite.config.js. Dynamic pages (including /dish/*)
// and ALL APIs are network-only: a URL or missing Authorization header is
// not proof that a response is independent of accounts/entitlements.
const CACHE_PREFIX = "recipe-drawer-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-v4`;
const SHELL_TYPES = new Map([
  ["/", ["text/html"]],
  ["/index.html", ["text/html"]],
  ["/manifest.json", ["application/json", "application/manifest+json"]],
  ["/icons/favicon-32.png", ["image/png"]],
  ["/icons/icon-192.png", ["image/png"]],
  ["/icons/icon-512.png", ["image/png"]],
  ["/icons/icon-512-maskable.png", ["image/png"]],
  ["/fonts/plus-jakarta-sans-variable.ttf", ["font/ttf"]],
  ["/fonts/plus-jakarta-sans-italic-variable.ttf", ["font/ttf"]],
  ["/fonts/bricolage-grotesque-variable.ttf", ["font/ttf"]],
]);

function shellTypes(url) {
  if (url.search) return undefined;
  if (SHELL_TYPES.has(url.pathname)) return SHELL_TYPES.get(url.pathname);
  // Vite's default entry naming; do not cache arbitrary /assets/* responses.
  const entry = /^\/assets\/index-[A-Za-z0-9_-]{8,}\.(js|css)$/.exec(url.pathname);
  if (!entry) return undefined;
  return entry[1] === "css"
    ? ["text/css"]
    : ["text/javascript", "application/javascript"];
}

function forbidsStorage(headers) {
  const directives = (headers.get("Cache-Control") || "")
    .split(",").map((part) => part.trim().split("=")[0].toLowerCase());
  // no-cache requires revalidation; this worker cannot satisfy that offline.
  return directives.some((name) => ["private", "no-store", "no-cache"].includes(name))
    || /\bno-cache\b/i.test(headers.get("Pragma") || "");
}

function cacheable(response, request, types) {
  const mime = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const vary = (response.headers.get("Vary") || "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  return response.status === 200
    && response.type === "basic"
    && !response.redirected
    && response.url === request.url
    && !forbidsStorage(response.headers)
    // Compression changes representation, not account identity. Cache API
    // still performs its normal Vary match; any other variation is rejected.
    && vary.every((header) => header === "accept-encoding")
    && !response.headers.has("Set-Cookie")
    && types.includes(mime);
}

function offline() {
  return new Response("Offline: this resource is unavailable.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return offline();
  }
}

async function shellResponse(request, types) {
  let response;
  try {
    response = await fetch(request);
  } catch {
    try {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      if (cached && cacheable(cached, request, types)) return cached;
    } catch {
      // Disabled/evicted storage is equivalent to a cache miss.
    }
    return offline();
  }

  try {
    const cache = await caches.open(SHELL_CACHE);
    if (cacheable(response, request, types)) {
      await cache.put(request, response.clone());
    } else if (response.status < 500) {
      // A redirect/private/no-store/not-found response invalidates an older
      // fallback. Transient server errors must not overwrite a good shell.
      await cache.delete(request);
    }
  } catch {
    // Storage failures must not turn a successful fetch into an offline error.
  }
  return response;
}

// Use the standard waiting lifecycle. Existing controlled tabs must close
// before activation; this alone does not solve old-client release recovery.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
        .map(async (key) => {
          try { await caches.delete(key); } catch { /* Best-effort cleanup. */ }
        }));
    } catch { /* Storage may be unavailable during activation. */ }
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const types = shellTypes(url);
  const bypass = ["Authorization", "Proxy-Authorization", "Cookie", "Range"]
    .some((header) => request.headers.has(header))
    || ["no-store", "no-cache", "reload"].includes(request.cache)
    || forbidsStorage(request.headers);

  // respondWith owns the entire async lifetime, including awaited storage
  // writes. There are no detached refresh/write promises to be terminated.
  event.respondWith(types && !bypass
    ? shellResponse(request, types)
    : networkOnly(request));
});
