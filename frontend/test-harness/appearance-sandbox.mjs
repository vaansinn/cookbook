// Install barriers BEFORE importing production code or stores. Native storage
// and native fetch are never read, retained, copied, cleared or restored.
const status = document.getElementById('boot-status');
try {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)
      || !location.pathname.endsWith('/test-harness/appearance-recovery.html')) throw new Error('Dedicated loopback Vite URL required');
  const values = new Map(), writes = [];
  const guestWriteFault = { enabled: false, attempts: 0 };
  const storage = Object.freeze({
    get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => {
      const name = String(key);
      if (guestWriteFault.enabled && name === 'recipedrawer_settings') {
        guestWriteFault.attempts++;
        writes.push({ action: 'set', key: name, failed: true });
        throw new DOMException('Synthetic guest preference quota failure', 'QuotaExceededError');
      }
      writes.push({ action: 'set', key: name }); values.set(name, String(value));
    },
    removeItem: (key) => { writes.push({ action: 'remove', key: String(key) }); values.delete(String(key)); },
    clear: () => { writes.push({ action: 'clear' }); values.clear(); },
  });
  const lock = (target, name, value) => Object.defineProperty(target, name, { value, writable: false, configurable: false });
  lock(window, 'localStorage', storage); lock(window, 'sessionStorage', storage);
  // Seed only invented guest settings before modules initialize their stores.
  storage.setItem('recipedrawer_settings', JSON.stringify({ language: 'en', darkMode: false }));
  const sandbox = { isolated: true, storage, writes, guestWriteFault, transport: null, blocked: [] };
  const deny = (kind) => { sandbox.blocked.push(kind); throw new Error(`TEST SAFETY: blocked ${kind}`); };
  lock(window, 'fetch', async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/planning/v1/') || !sandbox.transport) return deny('unexpected fetch');
    return sandbox.transport(url, options);
  });
  lock(window, 'XMLHttpRequest', class { constructor() { deny('XMLHttpRequest'); } });
  lock(navigator, 'sendBeacon', () => deny('sendBeacon'));
  lock(window, 'indexedDB', Object.freeze({ open: () => deny('indexedDB'), deleteDatabase: () => deny('indexedDB') }));
  lock(window, 'caches', Object.freeze({ open: () => deny('CacheStorage'), keys: () => deny('CacheStorage'), match: () => deny('CacheStorage') }));
  const held = new Set();
  lock(navigator, 'locks', Object.freeze({ async request(name, options, callback) {
    if (options.mode !== 'exclusive' || options.ifAvailable !== true) return deny('unexpected lock options');
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name, mode: 'exclusive' }); } finally { held.delete(name); }
  } }));
  const { boot } = await import('./appearance-cases.mjs');
  await boot(sandbox);
} catch (error) {
  status.dataset.result = 'FAIL'; status.textContent = `FAIL — appearance isolation/boot: ${error.message}`;
  console.error('TEST ONLY appearance harness boot failed', error);
}
