import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

// No app imports, dotenv, npm packages, real fetches or persistent storage.
const source = await readFile(new URL("../../frontend/public/sw.js", import.meta.url), "utf8");
const origin = "https://cookbook.test";
const own = "recipe-drawer-shell-v4";
const asset = "/assets/index-Abcd1234.js";
const request = (path = "/", options = {}) => new Request(new URL(path, origin), options);
const down = () => { throw new TypeError("offline"); };

test('only audited same-origin font paths with font MIME can enter shell fallback', async () => {
  for (const path of ['/fonts/plus-jakarta-sans-variable.ttf', '/fonts/plus-jakarta-sans-italic-variable.ttf', '/fonts/bricolage-grotesque-variable.ttf']) {
    const h = harness();
    h.network(() => response(path, { headers: { 'Content-Type': 'font/ttf', 'Cache-Control': 'public, max-age=60' } }));
    assert.equal((await h.dispatch(request(path))).status, 200);
    h.network(down);
    assert.equal((await h.dispatch(request(path))).status, 200);
    h.network(() => response(path, { headers: { 'Content-Type': 'text/html' } }));
    await h.dispatch(request(path)); h.network(down);
    assert.equal((await h.dispatch(request(path))).status, 503);
  }
  const h = harness(); const path = '/fonts/private-upload.ttf';
  h.network(() => response(path, { headers: { 'Content-Type': 'font/ttf' } }));
  await h.dispatch(request(path)); h.network(down);
  assert.equal((await h.dispatch(request(path))).status, 503);
});

test("Flask public/compressed shell headers allow offline fallback, not identity variation", async () => {
  const h = harness();
  h.network(() => response("/", { headers: { "Cache-Control": "public, max-age=60", "Vary": "Accept-Encoding" } }));
  assert.equal((await h.dispatch(request("/"))).status, 200);
  h.network(down);
  assert.equal((await h.dispatch(request("/"))).status, 200);
  h.network(() => response("/", { headers: { "Cache-Control": "public, max-age=60", "Vary": "Accept-Encoding, Cookie" } }));
  await h.dispatch(request("/"));
  h.network(down);
  assert.equal((await h.dispatch(request("/"))).status, 503);
});

function response(path = "/", { status = 200, headers = {}, type = "basic", redirected = false, body = "public" } = {}) {
  const value = new Response(body, { status, headers: { "Content-Type": "text/html", ...headers } });
  Object.defineProperties(value, {
    url: { value: new URL(path, origin).href },
    type: { value: type },
    redirected: { value: redirected },
  });
  // Native Response.clone does not preserve simulated network metadata.
  value.clone = () => response(path, { status, headers, type, redirected, body });
  return value;
}

function harness({ fail, gate } = {}) {
  const listeners = new Map();
  const stores = new Map();
  const calls = [];
  let network = async (req) => response(req.url);
  function record(operation, ...args) {
    calls.push([operation, ...args]);
    if (operation === fail) throw new Error(`storage ${operation} failed`);
  }
  const caches = {
    async keys() { record("keys"); return [...stores.keys()]; },
    async delete(name) {
      record("deleteCache", name);
      if (gate) await gate;
      return stores.delete(name);
    },
    async match() { throw new Error("Global cache lookup is forbidden"); },
    async open(name) {
      record("open", name);
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(req) { record("match", name, req.url); return entries.get(req.url)?.clone(); },
        async put(req, res) {
          record("put", name, req.url);
          if (gate) await gate;
          entries.set(req.url, res.clone());
        },
        async delete(req) { record("deleteEntry", name, req.url); return entries.delete(req.url); },
      };
    },
  };
  vm.runInNewContext(source, {
    URL, Response, caches,
    fetch: async (req) => { calls.push(["fetch", req]); return network(req); },
    self: {
      location: { origin },
      addEventListener: (name, handler) => listeners.set(name, handler),
      skipWaiting: () => { throw new Error("Forced activation"); },
      clients: { claim: () => { throw new Error("Forced client claim"); } },
    },
  }, { filename: "sw.js" });
  return {
    calls, stores, listeners,
    network(fn) { network = fn; },
    seed(name, path, res = response(path)) {
      if (!stores.has(name)) stores.set(name, new Map());
      stores.get(name).set(request(path).url, res);
    },
    dispatch(req) {
      let pending;
      let active = true;
      listeners.get("fetch")({ request: req, respondWith(value) {
        assert.ok(active, "respondWith must be called synchronously");
        assert.equal(pending, undefined);
        pending = Promise.resolve(value);
      } });
      active = false;
      return pending;
    },
    async activate() {
      const lifetime = [];
      listeners.get("activate")({ waitUntil: (value) => lifetime.push(value) });
      assert.equal(lifetime.length, 1);
      await Promise.all(lifetime);
    },
  };
}

test("known public shell/assets survive offline in only the current own cache", async () => {
  for (const [path, mime] of [
    ["/", "text/html"], ["/index.html", "text/html"],
    ["/manifest.json", "application/manifest+json"],
    ["/icons/favicon-32.png", "image/png"], ["/icons/icon-192.png", "image/png"],
    ["/icons/icon-512.png", "image/png"], ["/icons/icon-512-maskable.png", "image/png"],
    [asset, "text/javascript"], ["/assets/index-Abcd1234.css", "text/css"],
  ]) {
    const h = harness();
    h.network(() => response(path, { headers: { "Content-Type": mime } }));
    assert.equal(await (await h.dispatch(request(path))).text(), "public");
    h.network(down);
    assert.equal(await (await h.dispatch(request(path))).text(), "public", path);
    assert.deepEqual([...h.stores.keys()], [own]);
  }
});

test("500 is returned without poisoning a good cache; uncached offline is a valid 503", async () => {
  for (const seeded of [false, true]) {
    const h = harness();
    if (seeded) h.seed(own, "/");
    h.network(() => response("/", { status: 500, body: "server error" }));
    assert.equal((await h.dispatch(request())).status, 500);
    assert.equal(h.calls.some(([op]) => op === "put"), false);
    h.network(down);
    const result = await h.dispatch(request());
    assert.ok(result instanceof Response);
    assert.equal(result.status, seeded ? 200 : 503);
    if (!seeded) assert.equal(result.headers.get("Cache-Control"), "no-store");
  }
});

test("errors, redirects, opaque, private/no-store/vary and wrong content never become fallbacks", async () => {
  for (const options of [
    { status: 404 }, { status: 302 }, { status: 206 }, { redirected: true },
    { type: "opaque" }, { type: "opaqueredirect" },
    ...["private", "PUBLIC, No-Store", "private=\"Authorization\"", "no-cache"].map((value) => ({ headers: { "Cache-Control": value } })),
    { headers: { Pragma: "no-cache" } }, { headers: { Vary: "Authorization" } },
    { headers: { Vary: "*" } }, { headers: { "Set-Cookie": "session=secret" } },
    { headers: { "Content-Type": "application/json" } },
  ]) {
    const h = harness();
    h.seed(own, "/");
    h.network(() => response("/", options));
    await h.dispatch(request());
    assert.equal(h.calls.some(([op]) => op === "put"), false, JSON.stringify(options));
    h.network(down);
    assert.equal((await h.dispatch(request())).status, 503, JSON.stringify(options));
  }
  const h = harness();
  h.network(() => response(asset)); // SPA catchall for a missing JS asset.
  await h.dispatch(request(asset));
  h.network(down);
  assert.equal((await h.dispatch(request(asset))).status, 503);
});

test("private/premium APIs, formerly public APIs and dynamic URLs stay network-only", async () => {
  for (const path of [
    "/api/dishes/premium", "/api/favorites", "/api/meal-plans", "/api/progress",
    "/api/dishes", "/api/filters", "/api/glossary", "/api/glossary/knife", "/api",
    "/dish/premium", "/shared/secret", "/account", "/sitemap.xml", "/robots.txt",
    "/assets/private.json", "/assets/arbitrary.js", "/?token=secret", "/sw.js",
  ]) {
    const h = harness();
    h.seed(own, path, response(path, { body: "old account premium" }));
    h.seed("recipe-drawer-api-v2", path);
    h.network(() => response(path, { body: "current account" }));
    assert.equal(await (await h.dispatch(request(path))).text(), "current account");
    h.network(down);
    assert.equal((await h.dispatch(request(path))).status, 503, path);
    assert.ok(h.calls.every(([op]) => op === "fetch"), path);
  }
});

test("credential/range/request cache headers bypass cache reads and writes", async () => {
  for (const options of [
    { headers: { Authorization: "Bearer account-a" } },
    { headers: { Authorization: "" } }, { headers: { "Proxy-Authorization": "secret" } },
    { headers: { Cookie: "session=b" } }, { headers: { Range: "bytes=0-10" } },
    { headers: { "Cache-Control": "no-store" } }, { headers: { "Cache-Control": "no-cache" } },
    { headers: { Pragma: "no-cache" } },
    ...["no-store", "no-cache", "reload"].map((cache) => ({ cache })),
  ]) {
    const h = harness();
    h.seed(own, "/");
    const req = request("/", options);
    await h.dispatch(req);
    assert.equal(h.calls[0][1], req, "forward original request including headers");
    h.network(down);
    assert.equal((await h.dispatch(req)).status, 503);
    assert.ok(h.calls.every(([op]) => op === "fetch"));
  }
});

test("mutations and cross-origin requests are left to the browser", () => {
  const h = harness();
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal(h.dispatch(request("/", { method })), undefined);
  }
  assert.equal(h.dispatch(request("https://other.test/")), undefined);
  assert.deepEqual(h.calls, []);
});

test("lookup ignores unrelated and obsolete caches and rejects unsafe current entries", async () => {
  const h = harness();
  for (const name of ["another-app", "recipe-drawer-api-v2", "recipe-drawer-shell-v2"]) h.seed(name, "/");
  h.network(down);
  assert.equal((await h.dispatch(request())).status, 503);
  for (const res of [response("/", { status: 500 }), response("/", { headers: { "Cache-Control": "private" } }), response("/login")]) {
    h.seed(own, "/", res);
    assert.equal((await h.dispatch(request())).status, 503);
  }
  assert.ok(h.calls.filter(([op]) => ["open", "match"].includes(op)).every(([, name]) => name === own));
});

test("storage failures do not lose network responses or reject offline fallbacks", async () => {
  for (const fail of ["open", "put", "match", "deleteEntry"]) {
    const h = harness({ fail });
    assert.equal((await h.dispatch(request())).status, 200, fail);
    h.network(() => response("/", { headers: { "Cache-Control": "no-store" } }));
    assert.equal((await h.dispatch(request())).status, 200, fail);
    h.network(down);
    assert.ok((await h.dispatch(request())) instanceof Response, fail);
  }
});

test("fetch lifetime waits for cache writes", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ gate });
  let settled = false;
  const pending = h.dispatch(request()).then((res) => { settled = true; return res; });
  await new Promise(setImmediate);
  assert.ok(h.calls.some(([op]) => op === "put"));
  assert.equal(settled, false);
  release();
  assert.equal((await pending).status, 200);
  assert.ok(h.stores.get(own).has(request().url));
});

test("activation cleans only owned old caches and tolerates storage failures without claiming clients", async () => {
  for (const fail of [undefined, "keys", "deleteCache"]) {
    const h = harness({ fail });
    for (const name of [own, "recipe-drawer-api-v2", "recipe-drawer-shell-v2", "another-app", "recipe-drawerish"]) h.seed(name, "/");
    assert.equal(h.listeners.has("install"), false);
    await h.activate();
    assert.ok(h.stores.has(own));
    assert.ok(h.stores.has("another-app"));
    assert.ok(h.stores.has("recipe-drawerish"));
    if (!fail) {
      assert.equal(h.stores.has("recipe-drawer-api-v2"), false);
      assert.equal(h.stores.has("recipe-drawer-shell-v2"), false);
    }
  }
});

test("activation lifetime includes asynchronous cleanup", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = harness({ gate });
  h.seed("recipe-drawer-api-v2", "/");
  let settled = false;
  const pending = h.activate().then(() => { settled = true; });
  await new Promise(setImmediate);
  assert.equal(settled, false);
  assert.ok(h.stores.has("recipe-drawer-api-v2"));
  release();
  await pending;
  assert.equal(h.stores.has("recipe-drawer-api-v2"), false);
});
