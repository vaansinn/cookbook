// node --experimental-vm-modules --experimental-loader ./tests/frontend/extensionlessLoader.mjs tests/frontend/test_auth_recovery.mjs
// Actual store/client modules, isolated dependencies, deferred HTTP responses.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const source = (path) => readFileSync(new URL("../../frontend/src/" + path, import.meta.url), "utf8");
async function fixture({ token = "A", storageThrows = false } = {}) {
  const values = new Map(token ? [["token", token]] : []);
  const requests = [];
  const storageAccesses = [];
  const lockRequests = [];
  const listeners = new Map();
  const failedRemovals = new Set();
  const failedWrites = new Set();
  let nextLockGate = null;
  let requestHook, rejectHook;
  const storage = {
    getItem: (key) => { storageAccesses.push(["get", key]); if (storageThrows) throw Error("storage"); return values.get(key) ?? null; },
    setItem: (key, value) => { storageAccesses.push(["set", key, value]); if (storageThrows || failedWrites.has(key)) throw Error("storage"); values.set(key, value); },
    removeItem: (key) => { storageAccesses.push(["remove", key]); if (storageThrows || failedRemovals.has(key)) throw Error("storage"); values.delete(key); },
  };
  const send = (method, url, config = {}) => {
    config = requestHook({ ...config, method, url, headers: { ...config.headers } });
    return new Promise((resolve, reject) => requests.push({
      config, resolve: (data) => resolve({ data }),
      reject: (status, data) => reject(Object.assign(Error("request failed"), { config, ...(status ? { response: { status, data } } : {}) })),
    })).catch(rejectHook);
  };
  const api = {
    interceptors: { request: { use: (f) => { requestHook = f; } }, response: { use: (_, f) => { rejectHook = f; } } },
    get: (url, config) => send("get", url, config),
    post: (url, body, config) => send("post", url, config),
    delete: (url, config) => send("delete", url, config),
  };
  const create = (factory) => {
    let state;
    const set = (update) => { state = { ...state, ...(typeof update === "function" ? update(state) : update) }; };
    const store = (selector = (s) => s) => selector(state);
    store.getState = () => state;
    store.setState = set;
    state = factory(set, store.getState);
    return store;
  };
  const context = vm.createContext({
    localStorage: storage,
    navigator: { locks: { request: (_name, _options, callback) => {
      lockRequests.push(_name);
      if (!nextLockGate) return callback({ name: _name });
      const gate = nextLockGate;
      nextLockGate = null;
      return gate.then(() => callback({ name: _name }));
    } } },
    Number, Error,
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      dispatchEvent: (event) => listeners.get(event.type)?.(event),
    },
    CustomEvent: class { constructor(type, args) { this.type = type; this.detail = args.detail; } },
  });
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
  const axios = synthetic({ default: { create: () => api } });
  const zustand = synthetic({ create });
  const client = new vm.SourceTextModule(source("api/client.js"), { context });
  const session = new vm.SourceTextModule(source("api/authSession.mjs"), { context });
  await session.link(() => { throw Error('Unexpected session import'); });
  const runtime = new vm.SourceTextModule(source("api/runtimeFetch.mjs"), { context });
  await runtime.link(() => session);
  await client.link((name) => name === 'axios' ? axios : runtime);
  await client.evaluate();
  const store = new vm.SourceTextModule(source("store/useAuthStore.js"), { context });
  const lifecycle = new vm.SourceTextModule(source("api/planningLifecycle.mjs"), { context });
  await lifecycle.link(() => { throw Error('Unexpected lifecycle import'); });
  await lifecycle.evaluate();
  await store.link((name) => name === "zustand" ? zustand : name.endsWith("planningLifecycle.mjs") ? lifecycle : client);
  await store.evaluate();
  return { auth: store.namespace.default, api, requests, values, context, synthetic, listeners, storageAccesses, lockRequests,
    storageFailure: (value) => { storageThrows = value; },
    storageRemoveFailure: (key, value) => { if (value) failedRemovals.add(key); else failedRemovals.delete(key); },
    storageWriteFailure: (key, value) => { if (value) failedWrites.add(key); else failedWrites.delete(key); },
    deferNextLock: () => {
      assert.equal(nextLockGate, null);
      let release;
      nextLockGate = new Promise((resolve) => { release = resolve; });
      return release;
    } };
}

// Drive the actual DELETE -> lifecycle -> auth-store recovery handoff. Selective
// failure leaves token clearing usable and can also prevent final-marker storage,
// forcing retry to use the original module-issued confirmation object.
async function deletedCleanupFixture(f, { failMarker = false } = {}) {
  f.auth.setState({ user: { id: 1 }, token: "A", initialized: true,
    initializing: false, loading: false, initError: null });
  f.values.set("token", "A");
  f.values.set("private-planning:v1:outbox:1", "deleted owner draft");
  f.values.set("private-planning:v1:outbox:2", "other owner draft");
  f.values.set("private-planning:v1:owner:2", "1:open");
  f.storageRemoveFailure("private-planning:v1:outbox:1", true);
  const index = f.requests.length;
  const deletion = f.auth.getState().deleteAccount(1);
  assert.equal(f.requests.length, index + 1);
  assert.equal(f.requests[index].config.method, "delete");
  assert.equal(f.requests[index].config.url, "/auth/me");
  assert.equal(f.values.get("private-planning:v1:owner:1"), "1:deleting");
  if (failMarker) f.storageWriteFailure("private-planning:v1:owner:1", true);
  f.requests[index].resolve({ message: "Account deleted" });
  const result = await deletion;
  assert.equal(result.deleted, true);
  assert.equal(result.cleanupError, true);
  const state = f.auth.getState();
  assert.equal(state.deletionCleanup.accountId, 1);
  assert.equal(state.deletionCleanup.confirmation, result, "retain original proof, not a reconstructed result");
  assert.equal(state.token, null);
  assert.equal(state.user, null);
  assert.equal(state.initialized, false);
  assert.equal(state.initError, "deleted_storage");
  assert.equal(f.values.has("token"), false);
  assert.equal(f.values.get("private-planning:v1:owner:1"), failMarker ? "1:deleting" : "1:deleted");
  return result;
}

// Check both immediate and settled effects: even a transient marker write or a
// generation bump would interfere with the replacement owner's work.
async function withoutDeletionEffects(f, invoke) {
  const state = f.auth.getState();
  const generation = state.requestGeneration;
  const values = [...f.values];
  const storageCount = f.storageAccesses.length;
  const lockCount = f.lockRequests.length;
  const requestCount = f.requests.length;
  const unchanged = () => {
    assert.equal(f.auth.getState().requestGeneration, generation, "must not begin a new auth generation");
    assert.equal(f.auth.getState(), state, "must not set any auth field");
    assert.equal(f.storageAccesses.length, storageCount, "must not access storage, including owner markers");
    assert.deepEqual([...f.values], values, "tokens, markers and all owners' drafts remain untouched");
    assert.equal(f.lockRequests.length, lockCount, "must reject before entering lifecycle coordination");
    assert.equal(f.requests.length, requestCount, "must not issue HTTP");
  };
  const pending = invoke();
  unchanged();
  const result = await pending;
  unchanged();
  return result;
}

// An omitted/invalid owner is never permission to delete the current account.
// Include absent identity so undefined === undefined cannot authorize deletion.
for (const user of [{ id: 2 }, null, {}]) {
  for (const expectedAccountId of [1, undefined, null, "2", 0, -1, NaN, Infinity]) {
    const f = await fixture();
    f.auth.setState({ user, initialized: true });
    f.values.set("private-planning:v1:outbox:1", "old owner draft");
    f.values.set("private-planning:v1:outbox:2", "current owner draft");
    f.values.set("private-planning:v1:owner:1", "1:deleting");
    f.values.set("private-planning:v1:owner:2", "1:open");
    const result = await withoutDeletionEffects(f, () => f.auth.getState().deleteAccount(expectedAccountId));
    assert.equal(result.stale, true);
    assert.equal(result.deleted, undefined);
  }
}

// Transient failures preserve identity and do not automatically retry.
for (const status of [undefined, 503, 500, 403, 422]) {
  const f = await fixture();
  const pending = f.auth.getState().init();
  assert.equal(f.auth.getState().initializing, true);
  assert.equal(f.requests[0].config.timeout, 15000);
  f.requests[0].reject(status, { error: "unavailable" });
  await pending;
  const state = f.auth.getState();
  assert.equal(state.token, "A");
  assert.equal(state.epoch, 0);
  assert.equal(state.user, null);
  assert.equal(state.initialized, false);
  assert.equal(state.initializing, false);
  assert.equal(state.initError, "unavailable");
  assert.equal(f.values.get("token"), "A");
  assert.equal(f.requests.length, 1);
  const retry = state.init();
  f.requests[1].resolve({ id: 1 });
  await retry;
  assert.equal(f.auth.getState().user.id, 1);
  assert.equal(f.auth.getState().initError, null);
}
for (const status of [401, 422]) {
  const f = await fixture();
  const pending = f.auth.getState().init();
  f.requests[0].reject(status, { msg: "Not enough segments" });
  await pending;
  assert.equal(f.auth.getState().token, null);
  assert.equal(f.auth.getState().epoch, 1);
  assert.equal(f.auth.getState().initialized, true);
  assert.equal(f.values.has("token"), false);
}
// Stale init successes AND failures, including same-token overlap.
for (const fail of [false, true]) {
  const f = await fixture();
  const old = f.auth.getState().init();
  const latest = f.auth.getState().init();
  f.requests[1].resolve({ id: 2 });
  await latest;
  if (fail) f.requests[0].reject(401); else f.requests[0].resolve({ id: 1 });
  await old;
  assert.equal(f.auth.getState().user.id, 2);
  assert.equal(f.auth.getState().epoch, 0);
}
for (const operation of ["init", "login", "register", "deleteAccount"]) {
  for (const fail of [false, true]) {
    const f = await fixture();
    if (operation === 'deleteAccount') f.auth.setState({ user: { id: 1 }, initialized: true });
    const old = f.auth.getState()[operation](operation === "deleteAccount" ? 1 : "a", "b", "c");
    const latest = f.auth.getState().login("new", "password");
    f.requests[1].resolve({ token: "B", user: { id: 2 } });
    await latest;
    if (fail) f.requests[0].reject(401); else f.requests[0].resolve({ token: "OLD", user: { id: 1 }, id: 1 });
    await old;
    assert.equal(f.auth.getState().token, "B", operation);
    assert.equal(f.auth.getState().user.id, 2, operation);
    assert.equal(f.auth.getState().error, null);
    assert.equal(f.values.get("token"), "B");
  }
}
for (const operation of ["init", "login", "register", "deleteAccount"]) {
  for (const fail of [false, true]) {
    const f = await fixture();
    if (operation === 'deleteAccount') f.auth.setState({ user: { id: 1 }, initialized: true });
    const old = f.auth.getState()[operation](operation === "deleteAccount" ? 1 : "a", "b", "c");
    f.auth.getState().logout();
    if (fail) f.requests[0].reject(401); else f.requests[0].resolve({ token: "OLD", user: { id: 1 } });
    await old;
    assert.equal(f.auth.getState().token, null);
    assert.equal(f.auth.getState().user, null);
    assert.equal(f.auth.getState().epoch, 1);
  }
}
for (const endpoint of ["/auth/login", "/auth/register"]) {
  const f = await fixture();
  const pending = f.api.post(endpoint, {}, { headers: { authorization: "Bearer A", Authorization: "Bearer A" } });
  assert.equal(Object.keys(f.requests[0].config.headers).length, 0);
  f.requests[0].reject(401);
  await assert.rejects(pending);
  assert.equal(f.auth.getState().token, "A");
}
// Exact origin token guards still hold if a caller changes token without epoch.
{
  const f = await fixture();
  const pending = f.auth.getState().init();
  f.auth.setState({ token: "B" });
  f.requests[0].reject(401);
  await pending;
  assert.equal(f.auth.getState().token, "B");
  assert.equal(f.auth.getState().epoch, 0);
}
for (const operation of ["login", "register"]) {
  const f = await fixture({ token: null });
  await f.auth.getState().init();
  const pending = f.auth.getState()[operation]("a", "b", "c");
  assert.equal(f.auth.getState().initialized, true, "guest credential form remains mounted");
  f.requests[0].reject(401, { error: "Bad credentials" });
  await assert.rejects(pending);
  assert.equal(f.auth.getState().error, "Bad credentials");
  assert.equal(f.auth.getState().loading, false);
  assert.equal(f.auth.getState().epoch, 0);
}
{
  const f = await fixture();
  f.auth.setState({ user: { id: 1 }, initialized: true });
  f.values.set('private-planning:v1:outbox:1', 'private draft');
  f.values.set('private-planning:v1:outbox:2', 'other private draft');
  const pending = f.auth.getState().deleteAccount(1);
  f.requests[0].resolve({});
  await pending;
  assert.equal(f.auth.getState().token, null);
  assert.equal(f.auth.getState().epoch, 1);
  assert.equal(f.values.has('private-planning:v1:outbox:1'), false);
  assert.equal(f.values.get('private-planning:v1:outbox:2'), 'other private draft');
}
// Cross-tab token changes invalidate mounted identity before verification; late
// Deletion rejection stays explicit: a 401 is not proof an ambiguous earlier
// deletion completed and must not silently sign out or report success.
for (const status of [401, 422, 503]) {
  const f = await fixture();
  f.auth.setState({ user: { id: 1 }, initialized: true });
  const pending = f.auth.getState().deleteAccount(1);
  assert.equal(f.requests[0].config.handlesAuthRejection, true);
  f.requests[0].reject(status);
  await assert.rejects(pending);
  assert.equal(f.auth.getState().user.id, 1);
  assert.equal(f.auth.getState().token, 'A');
}
{
  const f = await fixture();
  f.auth.setState({ user: { id: 1 }, initialized: true });
  const pending = f.auth.getState().deleteAccount(1);
  f.auth.getState().logout();
  f.requests[0].resolve({});
  assert.equal((await pending).stale, true, 'stale deletion cannot navigate a replacement session');
}
// A confirmed DELETE with local storage failure offers local-only retries. Failed
// retries keep the recovery gate/proof; successful retries preserve every other owner.
for (const failMarker of [false, true]) {
  const f = await fixture();
  const original = await deletedCleanupFixture(f, { failMarker });
  const requestsBeforeRetry = f.requests.length;
  const failedRetry = f.auth.getState().retryDeletionCleanup();
  assert.equal(f.auth.getState().loading, true);
  await failedRetry;
  assert.equal(f.requests.length, requestsBeforeRetry, "failed cleanup retry must not issue HTTP");
  assert.equal(f.auth.getState().loading, false);
  assert.equal(f.auth.getState().initialized, false);
  assert.equal(f.auth.getState().initError, "deleted_storage");
  assert.equal(f.auth.getState().deletionCleanup.accountId, 1);
  assert.equal(f.auth.getState().deletionCleanup.confirmation.deleted, true);
  assert.notEqual(f.auth.getState().deletionCleanup.confirmation, original, "retain the latest lifecycle proof after another cleanup failure");
  assert.equal(f.values.get("private-planning:v1:outbox:1"), "deleted owner draft");
  f.storageRemoveFailure("private-planning:v1:outbox:1", false);
  f.storageWriteFailure("private-planning:v1:owner:1", false);
  await f.auth.getState().retryDeletionCleanup();
  const state = f.auth.getState();
  assert.equal(state.loading, false);
  assert.equal(state.initialized, true);
  assert.equal(state.initError, null);
  assert.equal(state.deletionCleanup, null);
  assert.equal(state.user, null);
  assert.equal(state.token, null);
  assert.equal(f.values.has("private-planning:v1:outbox:1"), false);
  assert.equal(f.values.get("private-planning:v1:owner:1"), "1:deleted");
  assert.equal(f.values.get("private-planning:v1:outbox:2"), "other owner draft");
  assert.equal(f.values.get("private-planning:v1:owner:2"), "1:open");
  assert.equal(f.requests.length, requestsBeforeRetry, "successful cleanup retry must not issue HTTP");
  await state.retryDeletionCleanup();
  assert.equal(f.requests.length, requestsBeforeRetry, "no recovery record means no work");
}

// Delay local cleanup's lock callback so a replacement auth session/generation
// arrives first. Exercise successful cleanup, cleanupError, and thrown storage failure.
for (const fence of ["account", "epoch", "requestGeneration"]) {
  for (const cleanupOutcome of ["success", "cleanup_error", "rejection"]) {
    const f = await fixture();
    await deletedCleanupFixture(f);
    const release = f.deferNextLock();
    const retry = f.auth.getState().retryDeletionCleanup();
    assert.equal(f.auth.getState().loading, true);
    const previous = f.auth.getState();
    if (fence === "account") {
      f.values.set("token", "B");
      f.auth.setState({ user: { id: 2 }, token: "B", epoch: previous.epoch + 1,
        requestGeneration: previous.requestGeneration + 1, initialized: true,
        loading: false, initError: null, deletionCleanup: null });
    } else {
      f.auth.setState({ [fence]: previous[fence] + 1, loading: false,
        initialized: false, initError: "unavailable" });
    }
    const replacement = f.auth.getState();
    if (cleanupOutcome === "success") f.storageRemoveFailure("private-planning:v1:outbox:1", false);
    if (cleanupOutcome === "rejection") f.storageFailure(true);
    const requestCount = f.requests.length;
    release();
    await retry;
    assert.equal(f.auth.getState(), replacement, `${fence}: stale cleanup must not set any current auth field`);
    assert.equal(f.requests.length, requestCount, "stale cleanup is still local-only");
    assert.equal(f.values.get("private-planning:v1:outbox:2"), "other owner draft");
    assert.equal(f.values.get("private-planning:v1:owner:2"), "1:open");
    assert.equal(f.values.has("private-planning:v1:outbox:1"), cleanupOutcome !== "success");
    if (fence === "account") assert.equal(f.values.get("token"), "B");
  }
}
console.log("deletion cleanup: original proof retained, local retries issue no HTTP, other owners and stale auth generations preserved");

// Cross-tab token changes invalidate mounted identity before verification; late
// responses from the previous token cannot restore it.
{
  const f = await fixture();
  f.auth.setState({ user: { id: 1 }, initialized: true });
  const old = f.auth.getState().init();
  f.values.set('token', 'B');
  const switched = f.auth.getState().syncSessionFromStorage();
  assert.equal(f.auth.getState().initialized, false);
  assert.equal(f.auth.getState().token, 'B');
  f.requests[1].resolve({ id: 2 }); await switched;
  f.requests[0].resolve({ id: 1 }); await old;
  assert.equal(f.auth.getState().user.id, 2);
  f.values.delete('token');
  f.listeners.get('storage')({ key: 'token' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.auth.getState().token, null);
  assert.equal(f.auth.getState().user, null);
  assert.equal(f.auth.getState().initialized, true);
}
// Mid-session expiry and stale same-token responses use both epoch and generation.
{
  const f = await fixture();
  const old = f.api.get("/private");
  f.auth.getState().logout();
  const login = f.auth.getState().login("a", "b");
  f.requests[1].resolve({ token: "A", user: { id: 2 } });
  await login;
  f.requests[0].reject(401);
  await assert.rejects(old);
  assert.equal(f.auth.getState().user.id, 2);
  const current = f.api.get("/private");
  f.requests[2].reject(401);
  await assert.rejects(current);
  assert.equal(f.auth.getState().token, null);
}
{
  const f = await fixture({ storageThrows: true });
  assert.equal(f.auth.getState().initError, "storage");
  await f.auth.getState().init();
  assert.equal(f.auth.getState().initialized, false);
  f.storageFailure(false);
  const retry = f.auth.getState().init();
  f.requests[0].resolve({ id: 1 });
  await retry;
  f.storageFailure(true);
  f.auth.getState().logout();
  assert.equal(f.auth.getState().initialized, false);
  assert.equal(f.auth.getState().user, null);
  f.storageFailure(false);
  f.auth.getState().logout();
  assert.equal(f.auth.getState().token, null);
}

// Execute JSX using the checkout's existing esbuild, without installing.
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { transformSync } = require("esbuild");
const f = await fixture();
let effects = [];
let focused = false;
const react = f.synthetic({
  useEffect: (effect) => effects.push(effect),
  useRef: () => ({ current: { focus: () => { focused = true; } } }),
});
const jsx = f.synthetic({ jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) });
const authModule = f.synthetic({ default: f.auth });
let locale = "en";
const dictionaries = Object.fromEntries(["en", "de"].map((lang) => [lang, JSON.parse(source("locales/" + lang + ".json"))]));
const i18n = f.synthetic({ useT: () => (key) => dictionaries[locale][key] });
const compile = (path) => new vm.SourceTextModule(transformSync(source(path), { loader: "jsx", jsx: "automatic", format: "esm" }).code, { context: f.context });
const recovery = compile("components/AuthRecovery.jsx");
await recovery.link((name) => name === "react" ? react : name === "react/jsx-runtime" ? jsx : name.includes("useAuthStore") ? authModule
  : name.includes('api/client') ? f.synthetic({ getSessionRuntime: () => undefined })
    : name.includes('AccountSecurity') ? f.synthetic({ useSignOut: () => ({ pending: false, error: null,
      run: (action) => f.auth.getState()[action]() }) }) : i18n);
await recovery.evaluate();
const flat = (node) => !node || typeof node !== "object" ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flat)];
f.auth.setState({ initError: "unavailable" });
for (locale of ["en", "de"]) {
  effects = [];
  const tree = flat(recovery.namespace.default());
  effects.forEach((effect) => effect());
  assert.equal(focused, true);
  assert.ok(tree.find((node) => node.props?.role === "alert").props.children);
  const buttons = tree.filter((node) => node.type === "button");
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every((node) => node.props.style.minHeight >= 44));
  assert.equal(buttons[1].props.children, locale === "en" ? "Sign out" : "Abmelden");
}
// Execute retry and sign-out handlers, and render the intervening loading state.
{
  const tree = flat(recovery.namespace.default());
  const retry = tree.find((node) => node.type === "button").props.onClick();
  const pendingTree = flat(recovery.namespace.default());
  assert.ok(pendingTree.some((node) => node.props?.role === "status"));
  assert.equal(pendingTree.filter((node) => node.type === "button").length, 1);
  f.requests[0].reject(503);
  await retry;
  const buttons = flat(recovery.namespace.default()).filter((node) => node.type === "button");
  buttons[1].props.onClick();
  assert.equal(f.auth.getState().token, null);
  assert.equal(f.auth.getState().initialized, true);
  f.auth.setState({ initialized: false, initError: "unavailable" });
}
// Render the real EN/DE cleanup action and invoke its actual store handler. This
// must never substitute init()/GET or DELETE for the local recovery operation.
{
  await deletedCleanupFixture(f, { failMarker: true });
  for (locale of ["en", "de"]) {
    const tree = flat(recovery.namespace.default());
    const buttons = tree.filter((node) => node.type === "button");
    const label = dictionaries[locale].auth_recovery_retry_cleanup;
    assert.equal(typeof label, "string");
    assert.ok(label.length > 0);
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].props.children, label);
    assert.equal(buttons[0].props.onClick, f.auth.getState().retryDeletionCleanup);
    assert.equal(buttons[0].props.disabled, false);
    assert.ok(buttons[0].props.style.minHeight >= 44);
    assert.equal(tree.find((node) => node.props?.role === "alert").props.children,
      dictionaries[locale].auth_recovery_deleted_storage);
  }
  f.storageRemoveFailure("private-planning:v1:outbox:1", false);
  f.storageWriteFailure("private-planning:v1:owner:1", false);
  const requestCount = f.requests.length;
  const release = f.deferNextLock();
  const cleanupButton = flat(recovery.namespace.default()).find((node) => node.type === "button");
  const retry = cleanupButton.props.onClick();
  assert.equal(flat(recovery.namespace.default()).find((node) => node.type === "button").props.disabled, true);
  await f.auth.getState().retryDeletionCleanup(); // Busy guard: no second cleanup.
  release();
  await retry;
  assert.equal(f.requests.length, requestCount, "EN/DE recovery button triggers zero new HTTP requests");
  assert.equal(f.auth.getState().initialized, true);
  assert.equal(f.auth.getState().deletionCleanup, null);
  assert.equal(f.auth.getState().initError, null);
  assert.equal(f.values.get("private-planning:v1:outbox:2"), "other owner draft");
  assert.equal(f.values.get("private-planning:v1:owner:1"), "1:deleted");
  f.auth.setState({ initialized: false, initError: "unavailable" });
}
const app = compile("App.jsx");
await app.link((name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return jsx;
  if (name.includes("useAuthStore")) return authModule;
  if (name.includes("AuthRecovery")) return recovery;
  if (name.includes("useSettingsStore")) return f.synthetic({ default: (select) => select({ darkMode: false }) });
  if (name === "react-router-dom") return f.synthetic(Object.fromEntries(["BrowserRouter", "Routes", "Route", "Navigate", "useSearchParams"].map((key) => [key, key])));
  return f.synthetic({ default: name, GlossaryList: "GlossaryList", GlossaryDetail: "GlossaryDetail" });
});
await app.evaluate();
assert.equal(app.namespace.default().type, recovery.namespace.default, "all routes blocked while unverified");
f.auth.setState({ initialized: true, token: null, initError: null });
assert.equal(app.namespace.default().type, "BrowserRouter");
console.log("auth recovery: deferred races, rejection cleanup, storage, credential headers, global gate and EN/DE recovery passed");

// Exercise the actual form continuation, not a test copy of its navigation.
// An obsolete response settles while the replacement is still pending.
for (const page of ["Login", "Register"]) {
  for (const staleFailure of [false, true]) {
    for (const latestFailure of [false, true]) {
      const formFixture = await fixture({ token: null });
      await formFixture.auth.getState().init();
      const navigations = [];
      const edits = [];
      const formReact = formFixture.synthetic({ useState: (initial) => [initial, (value) => edits.push(value)],
        useEffect: () => {}, useRef: (value) => ({ current: value }) });
      const formJsx = formFixture.synthetic({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) });
      const form = new vm.SourceTextModule(transformSync(source("pages/" + page + ".jsx"), { loader: "jsx", jsx: "automatic", format: "esm" }).code, { context: formFixture.context });
      await form.link((name) => {
        if (name === "react") return formReact;
        if (name === "react/jsx-runtime") return formJsx;
        if (name === "react-router-dom") return formFixture.synthetic({ Link: "Link", useNavigate: () => (destination) => navigations.push(destination) });
        if (name.includes("useAuthStore")) return formFixture.synthetic({ default: formFixture.auth });
        if (name.includes('api/client')) return formFixture.synthetic({ getSessionRuntime: () => undefined });
        if (name.includes("i18n")) return formFixture.synthetic({ useT: () => (key) => key, apiMessage: (data, t, fallback) => data?.error || fallback });
        return formFixture.synthetic({ default: name });
      });
      await form.evaluate();
      const submit = flat(form.namespace.default()).find((node) => node.type === "form").props.onSubmit;
      // Capture an independently mounted form's handler before either submits.
      // It has its own pending ref, as a replacement route/form would.
      const replacementSubmit = flat(form.namespace.default()).find((node) => node.type === "form").props.onSubmit;
      const first = submit({ preventDefault() {} });
      await submit({ preventDefault() {} });
      assert.equal(formFixture.requests.length, 1, 'the mounted form suppresses duplicate submits');
      const second = replacementSubmit({ preventDefault() {} });
      if (staleFailure) formFixture.requests[0].reject(401, { error: "Old rejection" });
      else formFixture.requests[0].resolve({ token: "OLD", user: { id: 1 } });
      await first;
      assert.deepEqual(navigations, [], page + ": stale outcome must not navigate");
      assert.equal(formFixture.auth.getState().loading, true);
      if (latestFailure) formFixture.requests[1].reject(401, { error: "Current rejection" });
      else formFixture.requests[1].resolve({ token: "NEW", user: { id: 2 } });
      await second;
      assert.deepEqual(navigations, latestFailure ? [] : ["/"]);
      if (latestFailure) assert.equal(edits.at(-1).error, "Current rejection");
    }
  }
}
console.log("auth forms: duplicate submits suppressed; stale success/failure never navigate; current success/failure controls navigation and errors");

// Retain the real Settings confirmation handler from owner 1's render. Invoke
// it after sign-in/storage verification has switched owners, or after sign-out.
for (const replacement of ["login", "storage", "same_token", "logout", "unchanged"]) {
  const f = await fixture();
  f.auth.setState({ user: { id: 1 }, initialized: true });
  for (const id of [1, 2]) {
    f.values.set(`private-planning:v1:owner:${id}`, "1:open");
    f.values.set(`private-planning:v1:outbox:${id}`, `owner ${id} draft`);
  }
  const navigations = [];
  const hooks = [];
  let hookIndex = 0;
  const react = f.synthetic({ useState: (initial) => {
    const index = hookIndex++;
    if (!(index in hooks)) hooks[index] = initial;
    return [hooks[index], (value) => { hooks[index] = value; }];
  } });
  const jsx = f.synthetic({ jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) });
  const settings = new vm.SourceTextModule(transformSync(source("pages/SettingsPage.jsx"),
    { loader: "jsx", jsx: "automatic", format: "esm" }).code, { context: f.context });
  await settings.link((name) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return jsx;
    if (name === "react-router-dom") return f.synthetic({ Link: "Link", useNavigate: () => (path) => navigations.push(path) });
    if (name.includes("useAuthStore")) return f.synthetic({ default: f.auth });
    if (name.includes("i18n")) return f.synthetic({ useT: () => (key) => key });
    return f.synthetic({ default: name });
  });
  await settings.evaluate();
  const render = () => { hookIndex = 0; return flat(settings.namespace.default()); };
  render().find((node) => node.type === "button" && node.props.children === "settings_delete_button").props.onClick();
  const confirm = render().find((node) => node.type === "button" && node.props.children === "settings_delete_confirm_button").props.onClick;
  if (replacement === "login") {
    const login = f.auth.getState().login("new", "password");
    f.requests.at(-1).resolve({ token: "B", user: { id: 2 } });
    await login;
  } else if (replacement === "storage") {
    f.values.set("token", "B");
    const sync = f.auth.getState().syncSessionFromStorage();
    f.requests.at(-1).resolve({ id: 2 });
    await sync;
  } else if (replacement === "same_token") {
    f.auth.setState({ user: { id: 2 } });
  } else if (replacement === "logout") {
    f.auth.getState().logout();
  }
  if (replacement === "unchanged") {
    const pending = confirm();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].config.method, "delete");
    assert.equal(f.requests[0].config.headers.Authorization, "Bearer A");
    assert.equal(f.values.get("private-planning:v1:owner:1"), "1:deleting");
    f.requests[0].resolve({});
    await pending;
    assert.deepEqual(navigations, ["/login"]);
    assert.equal(f.auth.getState().token, null);
    assert.equal(f.values.get("private-planning:v1:owner:1"), "1:deleted");
    assert.equal(f.values.has("private-planning:v1:outbox:1"), false);
  } else {
    await withoutDeletionEffects(f, confirm);
    assert.deepEqual(navigations, [], `${replacement}: stale Settings confirmation must not navigate`);
  }
  assert.equal(f.values.get("private-planning:v1:owner:2"), "1:open");
  assert.equal(f.values.get("private-planning:v1:outbox:2"), "owner 2 draft");
}
console.log("account deletion: rendered Settings owner binding, stale/invalid owners have zero auth/storage/marker/lock/HTTP effects");
