// NO production imports before all isolation barriers are installed.
const status = document.getElementById('boot-status');
try {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)
      || !location.pathname.endsWith('/test-harness/shopping-recovery.html')) {
    throw new Error('Use the dedicated loopback Vite development harness URL.');
  }
  const values = new Map();
  const storage = Object.freeze({
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)), clear: () => values.clear(),
  });
  const lock = (target, name, value) => Object.defineProperty(target, name,
    { value, configurable: false, writable: false });
  // Never inspect, back up, or clear the browser's native storage.
  lock(window, 'localStorage', storage);
  lock(window, 'sessionStorage', storage);
  const sandbox = { isolated: true, storage, transport: null, blocked: [] };
  const deny = (kind) => { sandbox.blocked.push(kind); throw new Error(`TEST SAFETY: blocked ${kind}`); };
  lock(window, 'fetch', async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/planning/v1/') || !sandbox.transport) {
      return deny('unexpected fetch');
    }
    // No reference to native fetch is retained. Every request is synthetic.
    return sandbox.transport(url, options);
  });
  lock(window, 'XMLHttpRequest', class { constructor() { deny('XMLHttpRequest'); } });
  lock(navigator, 'sendBeacon', () => deny('sendBeacon'));
  lock(window, 'indexedDB', Object.freeze({ open: () => deny('indexedDB'), deleteDatabase: () => deny('indexedDB') }));
  lock(window, 'caches', Object.freeze({ open: () => deny('CacheStorage'), keys: () => deny('CacheStorage'), match: () => deny('CacheStorage') }));
  const held = new Set();
  lock(navigator, 'locks', Object.freeze({ async request(name, options, callback) {
    if (options.mode !== 'exclusive' || options.ifAvailable !== true) return deny('unexpected lock protocol');
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name, mode: 'exclusive' }); }
    finally { held.delete(name); }
  } }));
  const { boot } = await import('./shopping-cases.mjs');
  await boot(sandbox);
} catch (error) {
  status.dataset.result = 'FAIL'; status.textContent = `FAIL — isolation/boot: ${error.message}`;
  console.error('TEST ONLY shopping harness boot failed', error);
}
