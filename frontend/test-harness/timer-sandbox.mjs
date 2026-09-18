// No production imports until all barriers are installed. Never retain/read
// native localStorage, fetch, XHR, wake locks or audio implementations.
const bootStatus = document.getElementById('boot-status');
try {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)
    || !location.pathname.endsWith('/test-harness/timer-recovery.html')) throw new Error('Dedicated loopback Vite URL required');
  const values = new Map(), writes = [], blocked = [], held = new Map();
  const faults = { read: false, write: false };
  const isAttempt = (key) => /^cook_session:(account|guest):[^:]+:[^:]+$/.test(key) && !key.endsWith(':index');
  const methods = {
    getItem(key) { key = String(key); if (faults.read && isAttempt(key)) throw Error('Synthetic storage read failure'); return values.get(key) ?? null; },
    setItem(key, value) { key = String(key); if (faults.write && isAttempt(key)) throw Error('Synthetic storage write failure'); writes.push({ key, action: 'set' }); values.set(key, String(value)); },
    removeItem(key) { key = String(key); writes.push({ key, action: 'remove' }); values.delete(key); },
    clear() { values.clear(); }, key: (index) => [...values.keys()][index] ?? null,
  };
  const storage = new Proxy({}, {
    get: (_target, key) => key === 'length' ? values.size : methods[key] || values.get(key),
    ownKeys: () => [...values.keys()], getOwnPropertyDescriptor: (_target, key) => values.has(key) ? { enumerable: true, configurable: true, value: values.get(key) } : undefined,
  });
  const lock = (target, key, value) => Object.defineProperty(target, key, { value, writable: false, configurable: false });
  lock(window, 'localStorage', storage); lock(window, 'sessionStorage', storage);
  const deny = (kind) => { blocked.push(kind); throw Error(`TEST SAFETY: blocked ${kind}`); };
  lock(window, 'fetch', async () => deny('fetch'));
  lock(window, 'XMLHttpRequest', class { constructor() { deny('XMLHttpRequest'); } });
  lock(navigator, 'sendBeacon', () => deny('sendBeacon'));
  lock(window, 'indexedDB', { open: () => deny('indexedDB'), deleteDatabase: () => deny('indexedDB') });
  lock(window, 'caches', { open: () => deny('CacheStorage'), keys: () => deny('CacheStorage'), match: () => deny('CacheStorage') });
  function hold(name) {
    if (held.has(name)) throw Error('Synthetic lock already held');
    let resolve; const entry = { promise: new Promise((r) => { resolve = r; }) }; held.set(name, entry);
    return () => { if (held.get(name) === entry) held.delete(name); resolve(); };
  }
  lock(navigator, 'locks', { async request(name, options, action) {
    if (!name.startsWith('cook_timer:') || options.mode !== 'exclusive') return deny('unexpected lock');
    if (held.has(name) && options.ifAvailable) return action(null);
    while (held.has(name)) await held.get(name).promise;
    const release = hold(name);
    try { return await action({ name, mode: 'exclusive' }); } finally { release(); }
  } });
  let visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: false, get: () => visibility });
  const wake = { requests: 0, releases: 0, delayed: false, denied: false, pending: [] };
  lock(navigator, 'wakeLock', { async request() {
    wake.requests++;
    if (wake.denied) throw Error('Synthetic wake denial');
    if (wake.delayed) await new Promise((resolve) => wake.pending.push(resolve));
    let released = false;
    return { addEventListener() {}, async release() { if (!released) { released = true; wake.releases++; } } };
  } });
  const feedback = { audio: 0, vibrations: 0 };
  lock(window, 'AudioContext', class { constructor() { feedback.audio++; throw Error('Synthetic audio disabled'); } });
  lock(window, 'webkitAudioContext', class { constructor() { feedback.audio++; throw Error('Synthetic audio disabled'); } });
  lock(navigator, 'vibrate', () => { feedback.vibrations++; return false; });
  const sandbox = { isolated: true, storage, values, writes, blocked, faults, hold, wake, feedback,
    visibility(value) { visibility = value; document.dispatchEvent(new Event('visibilitychange')); } };
  const { boot } = await import('./timer-cases.mjs');
  await boot(sandbox);
} catch (error) {
  bootStatus.dataset.result = 'FAIL'; bootStatus.textContent = `FAIL — timer isolation/boot: ${error.message}`;
}
