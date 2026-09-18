// This module intentionally has NO static production imports. Install every
// barrier before dynamically importing React/page/store modules.
const status = document.getElementById('boot-status');
try {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)
      || !location.pathname.endsWith('/test-harness/planning-recovery.html')) {
    throw new Error('Harness requires its dedicated loopback Vite development URL.');
  }
  const values = new Map();
  const storage = Object.freeze({
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: (key) => values.delete(String(key)),
    clear: () => values.clear(),
  });
  // Never read native storage, even to take a backup. These own properties are
  // realm-local; other tabs and the actual persisted storage are untouched.
  const lock = (target, name, value) => Object.defineProperty(target, name,
    { value, writable: false, configurable: false });
  lock(window, 'localStorage', storage);
  lock(window, 'sessionStorage', storage);
  const sandbox = { storage, values, transport: null, blocked: [], lockFailures: 0 };
  const deny = (kind) => {
    sandbox.blocked.push(kind);
    throw new Error(`TEST SAFETY: blocked ${kind}`);
  };
  lock(window, 'fetch', async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/planning/v1/')) {
      return deny(`unexpected fetch ${options.method || 'GET'} ${url.pathname}`);
    }
    if (!sandbox.transport) return deny('fetch before fixture setup');
    return sandbox.transport(url, options);
  });
  lock(window, 'XMLHttpRequest', class { constructor() { deny('XMLHttpRequest'); } });
  lock(navigator, 'sendBeacon', () => deny('sendBeacon'));
  // Deterministic single-realm Web Lock semantics. This is not a test of the
  // browser's real cross-tab Web Locks implementation.
  const held = new Set();
  lock(navigator, 'locks', Object.freeze({
    async request(name, options, callback) {
      if (options.mode !== 'exclusive' || options.ifAvailable !== true) return deny('unexpected lock options');
      if (sandbox.lockFailures > 0) { sandbox.lockFailures--; return callback(null); }
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { held.delete(name); }
    },
  }));
  console.info('TEST ONLY: planning harness; memory storage + synthetic fetch installed; CSP blocks real network writes.');
  const { boot } = await import('./planning-recovery.jsx');
  await boot(sandbox);
} catch (error) {
  status.textContent = `FAIL — harness did not boot: ${error.message}`;
  status.dataset.result = 'FAIL';
  console.error('TEST ONLY harness boot failed', error);
}
