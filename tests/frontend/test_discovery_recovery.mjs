// node --experimental-vm-modules tests/frontend/test_discovery_recovery.mjs
// Actual discovery request helper + recipes + requestScope, with deferred transport,
// synthetic auth and deterministic timers. No mounted-UI or real API claims.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const esbuild = require('esbuild');
const source = (path) => readFileSync(new URL('../../frontend/src/' + path, import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

async function fixture() {
  let authState = { initialized: true, user: { id: 920001 }, token: 'synthetic-discovery-A-not-a-jwt', epoch: 1, requestGeneration: 0 };
  const subscriptions = new Set(), requests = [], pendingTimers = new Map();
  let timerId = 0;
  const auth = {
    getState: () => authState,
    subscribe: (callback) => { subscriptions.add(callback); return () => subscriptions.delete(callback); },
    change: (patch) => {
      const previous = authState; authState = { ...authState, ...patch };
      for (const callback of [...subscriptions]) callback(authState, previous);
    },
  };
  const context = vm.createContext({ AbortController,
    setTimeout: (callback) => { const id = ++timerId; pendingTimers.set(id, callback); return id; },
    clearTimeout: (id) => pendingTimers.delete(id),
  });
  const module = (values) => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  // Intentionally ignore abort in this transport. Late successes AND failures
  // must be harmless because the actual helper checks its response generation.
  const api = module({ default: { get: (path, config) => new Promise((resolve, reject) => {
    requests.push({ path, config, resolve: (data) => resolve({ data }), reject: () => reject(Error('Synthetic delayed failure')) });
  }) } });
  const scope = new vm.SourceTextModule(source('utils/requestScope.js'), { context });
  await scope.link(() => { throw Error('Unexpected requestScope import'); }); await scope.evaluate();
  const recipes = new vm.SourceTextModule(source('api/recipes.js'), { context });
  const imports = {
    './client': api,
    '../store/useAuthStore': module({ default: auth }),
    '../utils/requestScope': scope,
  };
  await recipes.link((name) => { assert.ok(imports[name], `Unexpected recipes dependency ${name}`); return imports[name]; });
  await recipes.evaluate();
  let generation = 0, selection = { lang: 'en', q: 'first', cuisine: 'Italian', meal_type: 'dinner' };
  let slug = 'synthetic-first';
  const views = { dishes: { value: null, error: false }, filters: { value: null, error: false }, recipe: { value: null, error: false } }, applied = [];
  const cleanups = [];
  return {
    auth, requests, views, applied, subscriptions, recipes: recipes.namespace,
    select: (patch) => { selection = { ...selection, ...patch }; generation++; },
    route: (next) => { slug = next; generation++; },
    dispatch: () => { const callbacks = [...pendingTimers.values()]; pendingTimers.clear(); for (const callback of callbacks) callback(); },
    start: (kind = 'dishes', delay = kind === 'dishes' ? 200 : 0) => {
      const ticket = generation, params = { ...selection }, recipeSlug = slug;
      const cleanup = recipes.namespace.startDiscoveryRead({ delay,
        request: (signal) => kind === 'filters' ? recipes.namespace.fetchFilters(params.lang, signal)
          : kind === 'recipe' ? recipes.namespace.fetchDish(recipeSlug, params.lang, signal) : recipes.namespace.fetchDishes(params, signal),
        isCurrent: () => ticket === generation,
        onStart: () => { views[kind] = { value: null, error: false }; },
        onSuccess: (value) => { views[kind] = { value, error: false }; applied.push([kind, 'success']); },
        onError: () => { views[kind] = { value: null, error: true }; applied.push([kind, 'error']); },
      });
      cleanups.push(cleanup); return cleanup;
    },
    dispose: () => { for (const cleanup of cleanups) cleanup(); },
  };
}

test('filters support an optional AbortSignal without changing the default language API', async () => {
  const f = await fixture(), controller = new AbortController();
  const first = f.recipes.fetchFilters();
  assert.equal(f.requests[0].path, '/filters'); assert.equal(f.requests[0].config.params.lang, 'en');
  assert.equal(f.requests[0].config.signal, undefined);
  f.requests[0].resolve({ cuisines: [] }); await first;
  const second = f.recipes.fetchFilters('de', controller.signal);
  assert.equal(f.requests[1].config.params.lang, 'de'); assert.equal(f.requests[1].config.signal, controller.signal);
  f.requests[1].resolve({ cuisines: ['Synthetic'] }); await second;
});

test('fetchDish retains existing one/two-argument calls and forwards the optional third signal', async () => {
  const f = await fixture(), controller = new AbortController();
  for (const args of [['synthetic-one'], ['synthetic-two', 'de'], ['synthetic-three', 'en', controller.signal]]) {
    const pending = f.recipes.fetchDish(...args), request = f.requests.at(-1);
    assert.equal(request.path, `/dishes/${args[0]}`);
    assert.equal(request.config.params.lang, args[1] || 'en'); assert.equal(request.config.signal, args[2]);
    request.resolve({ tiers: {} }); await pending;
  }
});

for (const [dimension, patch] of Object.entries({ query: { q: 'latest' }, language: { lang: 'de' }, cuisine: { cuisine: 'Thai' }, meal: { meal_type: 'breakfast' } })) {
  test(`new ${dimension} suppresses late success and failure, even before old effect cleanup`, async () => {
    const f = await fixture();
    try {
      f.start(); f.dispatch(); f.start(); f.dispatch();
      const [oldSuccess, oldFailure] = f.requests;
      f.select(patch); f.start();
      assert.equal(f.views.dishes.value, null); assert.equal(f.views.dishes.error, false);
      f.dispatch(); const fresh = f.requests[2];
      fresh.resolve(['current']); await flush();
      oldSuccess.resolve(['obsolete']); oldFailure.reject(); await flush();
      assert.deepEqual(f.views.dishes, { value: ['current'], error: false });
      assert.deepEqual(f.applied, [['dishes', 'success']]);
    } finally { f.dispose(); }
  });
}

for (const [dimension, patch] of Object.entries({ account: { user: { id: 920002 } }, token: { token: 'synthetic-discovery-B-not-a-jwt' },
  epoch: { epoch: 2 }, generation: { requestGeneration: 1 }, initialization: { initialized: false } })) {
  test(`${dimension} transition aborts both reads and rejects late results/errors`, async () => {
    const f = await fixture();
    try {
      f.start('filters'); f.start(); f.start('recipe'); f.dispatch();
      f.auth.change(patch);
      assert.ok(f.requests.every((request) => request.config.signal.aborted));
      f.requests[0].resolve({ cuisines: ['obsolete'] }); f.requests[1].reject(); f.requests[2].resolve({ tiers: { advanced: 'obsolete' } }); await flush();
      assert.equal(f.applied.length, 0); assert.equal(f.views.dishes.error, false); assert.equal(f.views.filters.value, null);
    } finally { f.dispose(); }
  });
}

test('batched A -> guest -> identical A cannot revive the old response', async () => {
  const f = await fixture();
  try {
    const original = f.auth.getState(); f.start('filters');
    f.auth.change({ user: null, token: null }); f.auth.change(original);
    f.requests[0].resolve({ cuisines: ['old account response'] }); await flush();
    assert.equal(f.applied.length, 0); assert.equal(f.requests[0].config.signal.aborted, true);
  } finally { f.dispose(); }
});

test('cleanup cancels debounce and in-flight reads; unmounted callbacks cannot publish', async () => {
  const f = await fixture();
  const beforeDispatch = f.start(); beforeDispatch(); f.dispatch(); assert.equal(f.requests.length, 0);
  const afterDispatch = f.start('filters'); afterDispatch();
  f.requests[0].reject(); await flush();
  assert.equal(f.requests[0].config.signal.aborted, true); assert.equal(f.applied.length, 0);
  assert.equal(f.subscriptions.size, 0);
});

test('retry clears old dishes/errors immediately and submits the current query/language/filters', async () => {
  const f = await fixture();
  try {
    f.start(); f.dispatch(); f.requests[0].resolve(['previous cards']); await flush();
    f.select({ q: 'new query', lang: 'de', cuisine: 'Thai', meal_type: 'lunch' });
    f.start(); assert.equal(f.views.dishes.value, null); f.dispatch(); f.requests[1].reject(); await flush();
    assert.equal(f.views.dishes.error, true);
    f.start(); assert.deepEqual(f.views.dishes, { value: null, error: false }); f.dispatch();
    assert.deepEqual(JSON.parse(JSON.stringify(f.requests[2].config.params)), { q: 'new query', lang: 'de', cuisine: 'Thai', meal_type: 'lunch' });
    f.requests[2].resolve(['recovered']); await flush();
    assert.deepEqual(f.views.dishes, { value: ['recovered'], error: false });
  } finally { f.dispose(); }
});

test('filter failure is recoverable independently and stale filter errors cannot erase recovery', async () => {
  const f = await fixture();
  try {
    f.start('filters'); f.requests[0].reject(); await flush(); assert.equal(f.views.filters.error, true);
    f.start('filters'); const obsolete = f.requests[1];
    f.select({ lang: 'de' }); f.start('filters');
    assert.equal(f.views.filters.error, false); assert.equal(f.requests[2].config.params.lang, 'de');
    f.requests[2].resolve({ cuisines: ['new filter'] }); await flush(); obsolete.reject(); await flush();
    assert.deepEqual(f.views.filters, { value: { cuisines: ['new filter'] }, error: false });
    assert.equal(f.requests.some((request) => request.path === '/dishes'), false);
  } finally { f.dispose(); }
});

test('unverified identity never dispatches even public discovery requests from this mounted owner', async () => {
  const f = await fixture();
  try {
    f.auth.change({ initialized: false }); f.start('filters'); f.start(); f.dispatch(); await flush();
    assert.equal(f.requests.length, 0);
  } finally { f.dispose(); }
});

for (const change of ['slug', 'language']) {
  test(`recipe ${change} transition suppresses both competing success and failure; retry uses current route`, async () => {
    const f = await fixture();
    try {
      f.start('recipe'); f.start('recipe');
      const [oldSuccess, oldFailure] = f.requests;
      if (change === 'slug') f.route('synthetic-latest'); else f.select({ lang: 'de' });
      f.start('recipe'); assert.equal(f.views.recipe.value, null);
      f.requests[2].reject(); await flush(); assert.equal(f.views.recipe.error, true);
      f.start('recipe'); assert.equal(f.views.recipe.error, false);
      const current = f.requests[3];
      assert.equal(current.path, change === 'slug' ? '/dishes/synthetic-latest' : '/dishes/synthetic-first');
      assert.equal(current.config.params.lang, change === 'language' ? 'de' : 'en');
      current.resolve({ title: 'Current recipe' }); await flush();
      oldSuccess.resolve({ title: 'Obsolete recipe' }); oldFailure.reject(); await flush();
      assert.deepEqual(f.views.recipe, { value: { title: 'Current recipe' }, error: false });
    } finally { f.dispose(); }
  });
}

for (const page of ['Home', 'RecipePage', 'CookMode']) {
  test(`actual ${page} still bundles with its unchanged shared stores and components`, async () => {
    const result = await esbuild.build({ entryPoints: [new URL(`../../frontend/src/pages/${page}.jsx`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')],
      bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, logLevel: 'silent' });
    assert.ok(result.outputFiles[0].contents.length > 0);
  });
}
