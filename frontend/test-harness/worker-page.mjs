// Real SW/CacheStorage are deliberately used ONLY on the dedicated test origin.
// No static app imports: native app storage/transport is isolated first.
import { createCleanupConfirmation } from './worker-cleanup.mjs';
const boot = document.getElementById('boot');
const assert = (ok, message) => { if (!ok) throw Error(message); };
const run = document.querySelector('meta[name="worker-run"]')?.content;
const documentId = crypto.randomUUID();
const lock = (object, key, value) => Object.defineProperty(object, key, { value, writable: false, configurable: false });
const log = (message) => { const item = document.createElement('li'); item.textContent = message; document.getElementById('log').prepend(item); };
let cook, registration, captured, config, controllerChanges = 0, stopped = false;

try {
  assert(location.origin === 'http://127.0.0.1:5189' && ['/', '/index.html'].includes(location.pathname)
    && !location.search && /^[a-f0-9]{32}$/.test(run), 'Dedicated worker server URL required');
  assert('serviceWorker' in navigator && window.isSecureContext, 'Service worker-capable loopback context required');
  const workerURL = `${location.origin}/sw.js?run=${run}`;
  const nativeFetch = window.fetch.bind(window);
  const nativeSession = window.sessionStorage;
  // Read/write only this random run's test envelope. Never read native app keys.
  const storageKey = `worker-harness:${run}:synthetic-storage`;
  const raw = nativeSession.getItem(storageKey);
  const saved = raw ? JSON.parse(raw) : [];
  assert(Array.isArray(saved) && saved.every((entry) => Array.isArray(entry) && entry.length === 2
    && entry.every((value) => typeof value === 'string')), 'Synthetic storage envelope invalid');
  const values = new Map(saved);
  const persist = () => nativeSession.setItem(storageKey, JSON.stringify([...values]));
  const methods = { getItem: (key) => values.get(String(key)) ?? null,
    setItem(key, value) { values.set(String(key), String(value)); persist(); },
    removeItem(key) { values.delete(String(key)); persist(); }, clear() { values.clear(); persist(); },
    key: (index) => [...values.keys()][index] ?? null };
  const storage = new Proxy({}, { get: (_, key) => key === 'length' ? values.size : methods[key] || values.get(key),
    ownKeys: () => [...values.keys()], getOwnPropertyDescriptor: (_, key) => values.has(key) ? { enumerable: true, configurable: true, value: values.get(key) } : undefined });
  lock(window, 'localStorage', storage); lock(window, 'sessionStorage', storage);
  const deny = () => { throw Error('TEST SAFETY: native app transport/persistence disabled'); };
  lock(window, 'XMLHttpRequest', class { constructor() { deny(); } });
  lock(window, 'WebSocket', class { constructor() { deny(); } });
  lock(navigator, 'sendBeacon', deny);
  lock(window, 'indexedDB', { open: deny, deleteDatabase: deny });
  lock(navigator, 'wakeLock', { request: async () => { throw Error('Synthetic wake-lock denial'); } });
  lock(navigator, 'vibrate', () => false);
  lock(window, 'AudioContext', class { constructor() { deny(); } });
  lock(window, 'webkitAudioContext', class { constructor() { deny(); } });
  // Real native fetch is closed over for explicit harness operations ONLY.
  lock(window, 'fetch', async () => deny());
  async function request(path, options = {}) {
    assert(!stopped && (path === '/worker-control' || path === '/' || path === '/api/worker-private'
      || Object.values(config?.probes || {}).includes(path)), 'Unexpected harness request');
    return nativeFetch(location.origin + path, { ...options, credentials: 'omit', redirect: 'error' });
  }
  async function refreshConfig() {
    const response = await request('/worker-control', { cache: 'no-store' });
    assert(response.ok, 'Harness control unavailable');
    config = await response.json();
    assert(config.run === run && config.origin === location.origin, 'Server restarted/identity changed; do not adopt another run');
    return config;
  }
  await refreshConfig();
  const ownedCaches = [config.cacheA, config.cacheB, config.unrelatedCache];
  const owns = (reg) => reg.scope === `${location.origin}/`
    && [reg.installing, reg.waiting, reg.active].filter(Boolean).every((worker) => worker.scriptURL === workerURL);
  const existing = await navigator.serviceWorker.getRegistrations();
  assert(existing.every(owns), 'Existing unrelated worker: use a fresh dedicated browser context; no cleanup attempted');
  assert(!navigator.serviceWorker.controller || navigator.serviceWorker.controller.scriptURL === workerURL, 'Unrelated controlling worker');
  const names = await caches.keys();
  assert(names.every((name) => ownedCaches.includes(name)), 'Existing unrelated caches: no cleanup attempted');
  assert(!names.length || existing.length > 0, 'Occupied caches without this run’s worker: no adoption/cleanup');
  registration = existing[0];
  navigator.serviceWorker.addEventListener('controllerchange', () => { controllerChanges++; log('OBSERVED controllerchange; inspect active attempt before continuing'); });

  async function inspect() {
    await refreshConfig();
    const current = await navigator.serviceWorker.getRegistration('/');
    assert(!current || owns(current), 'Registration ownership changed');
    registration = current;
    const cached = {};
    for (const name of await caches.keys()) {
      if (ownedCaches.includes(name)) cached[name] = (await (await caches.open(name)).keys()).map((req) => new URL(req.url).pathname);
    }
    const observation = { documentId, server: config, controller: navigator.serviceWorker.controller?.scriptURL || null,
      active: current?.active?.state || null, waiting: current?.waiting?.state || null,
      installing: current?.installing?.state || null, controllerChanges, cook: cook?.snapshot(), caches: cached };
    document.getElementById('state').textContent = JSON.stringify(observation, null, 2);
    return observation;
  }
  async function control(key, value) {
    const result = await request('/worker-control', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Worker-Run': run }, body: JSON.stringify({ key, value }) });
    assert(result.ok, 'Control refused'); config = await result.json();
  }
  function button(id, action) {
    document.getElementById(id).onclick = async () => {
      try { await action(); if (!stopped) await inspect(); }
      catch (error) { log(`FAIL / BLOCKED — ${error.message}`); }
    };
  }
  button('install', async () => {
    await refreshConfig(); assert(config.release === 'A', 'Register A before serving B');
    registration = await navigator.serviceWorker.register(workerURL, { scope: '/', updateViaCache: 'none' });
    log('OBSERVED registration requested. Inspect until active, then explicitly reload for control.');
  });
  button('reload', async () => { assert(registration?.active, 'Wait for active registration first'); location.reload(); });
  button('inspect', inspect);
  button('capture', async () => {
    assert(navigator.serviceWorker.controller && cook?.snapshot().record?.timer?.status === 'running', 'Controlled page and running timer required');
    captured = { ...structuredClone(cook.snapshot()), documentId, controller: navigator.serviceWorker.controller, controllerChanges };
    log('CAPTURED active attempt/deadline; do not edit timer/step before comparison');
  });
  button('update', async () => {
    assert(captured && registration?.active, 'Capture an active controlled cook first');
    await control('release', 'B'); await registration.update();
    log('OBSERVED B update requested; Inspect until waiting=installed, then Compare. No skipWaiting or reload was requested.');
  });
  button('compare', async () => {
    const current = cook.snapshot();
    assert(captured && registration?.waiting?.state === 'installed', 'Waiting B and captured cook required');
    assert(documentId === captured.documentId && navigator.serviceWorker.controller === captured.controller
      && controllerChanges === captured.controllerChanges, 'Document/controller changed while cook active');
    assert(current.attempt === captured.attempt && current.record.snapshot_id === captured.record.snapshot_id
      && current.record.current_step_id === captured.record.current_step_id
      && current.record.timer?.status === 'running' && current.record.timer.deadline === captured.record.timer.deadline,
    'Active attempt/step/deadline changed');
    log('PASS — B waiting; same mounted document/controller, attempt, snapshot, step and running deadline');
  });
  async function probe(release) {
    const response = await request(config.probes[release]);
    const body = await response.text();
    log(`OBSERVED ${release} probe: HTTP ${response.status}; ${body.slice(0, 120)}`);
    return { response, body };
  }
  button('warm', async () => {
    assert(navigator.serviceWorker.controller, 'Controlled page required');
    await control('assetMode', 'online'); await control('retainA', true);
    for (const release of ['A', 'B']) assert((await probe(release)).response.status === 200, 'Probe warm failed');
    await request('/');
    await (await caches.open(config.unrelatedCache)).put(`${location.origin}/worker-unrelated`, new Response('Synthetic unrelated cache marker'));
    log('WARMED public probes/root and unrelated-cache marker. Inspect CacheStorage; this is setup, not offline acceptance.');
  });
  button('probe-a', () => probe('A')); button('probe-b', () => probe('B'));
  for (const [id, key] of [['asset-mode', 'assetMode'], ['api-mode', 'apiMode']]) {
    document.getElementById(id).value = config[key];
    document.getElementById(id).onchange = async (event) => {
      try { await control(key, event.target.value); log(`SET ${key}=${event.target.value}`); await inspect(); }
      catch (error) { log(`FAIL / BLOCKED — ${error.message}`); }
    };
  }
  for (const account of ['A', 'B']) button('account-' + account.toLowerCase(), async () => {
    const response = await request('/api/worker-private', { headers: { 'X-Worker-Account': account } });
    log(`OBSERVED private ${account}: HTTP ${response.status}; ${(await response.text()).slice(0, 120)}`);
  });
  button('retain', () => control('retainA', true)); button('remove', () => control('retainA', false));
  const cleanupConfirmation = createCleanupConfirmation({
    render({ reviewing, busy, complete }) {
      document.getElementById('cleanup-review').hidden = !reviewing && !busy;
      document.getElementById('cleanup').setAttribute('aria-expanded', String(reviewing || busy));
      document.getElementById('controls').disabled = busy || complete;
      document.getElementById('cleanup-confirm').disabled = !reviewing || busy;
      document.getElementById('cleanup-cancel').disabled = busy;
      document.getElementById('cleanup-status').textContent = busy ? 'Cleaning this synthetic test run…'
        : 'Nothing further will be removed without confirmation.';
      if (reviewing) document.getElementById('cleanup-cancel').focus();
      else if (!busy && !complete) document.getElementById('cleanup').focus();
    },
    onError(error) { log(`FAIL / BLOCKED — ${error.message}. Cleanup may be partial; review before any retry.`); },
    cleanup: async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    assert(regs.every(owns), 'Worker ownership changed; cleanup refused');
    cook?.dispose();
    for (const reg of regs) await reg.unregister();
    for (const name of await caches.keys()) if (ownedCaches.includes(name)) await caches.delete(name);
    nativeSession.removeItem(storageKey); stopped = true;
    document.getElementById('controls').disabled = true;
    log('CLEANED only current-run worker/known fixture caches/test envelope. Close all harness tabs before stopping/reusing server port.');
    },
  });
  document.getElementById('cleanup').onclick = () => cleanupConfirmation.ask();
  document.getElementById('cleanup-cancel').onclick = () => cleanupConfirmation.cancel();
  document.getElementById('cleanup-confirm').onclick = () => cleanupConfirmation.confirm();
  const { mountCook } = await import('./worker-cook.jsx');
  cook = await mountCook({ isolated: true });
  document.getElementById('controls').disabled = false;
  boot.textContent = 'READY — current worker SHA256 and observations below. Start timer in actual CookMode, then use manual controls.';
  await inspect();
} catch (error) { boot.setAttribute('role', 'alert'); boot.textContent = `BLOCKED — ${error.message}. No automatic worker/cache cleanup.`; }
