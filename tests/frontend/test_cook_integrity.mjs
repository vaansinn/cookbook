// node --experimental-vm-modules tests/frontend/test_cook_integrity.mjs
// Independent same-attempt regressions. Actual cookSession/cookTimer modules,
// fresh synthetic storage/auth/locks per test. No browser, native persistence,
// API, production data, environment configuration or mounted-UI claims.
// Safety contract:
// - saved cook => timer reads/writes return {ok:false,error:'finished'};
// - no alarm after completion, including delayed successful write settlement;
// - pin returns {ok:true,snapshot_id:<persisted winner>}, not the losing input;
// - storage/missing/stale-identity failures are explicit, never fake success.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const readSource = (path) => readFileSync(new URL('../../frontend/src/' + path, import.meta.url), 'utf8');
// One source snapshot per run, even while another worker is editing.
const timerSource = readSource('utils/cookTimer.mjs');
const sessionSource = readSource('store/cookSession.js');
const OWNER = 940001, WALL = 1800000000000;
const plain = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const assertWinner = (result, snapshotId, status) => {
  assert.equal(result?.ok, true);
  assert.equal(result.snapshot_id, snapshotId, 'Caller must receive the persisted winner');
  assert.equal(result.status, status);
};
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function fixture({ coordination = true } = {}) {
  const values = new Map(), writes = [], lockCalls = [], tails = new Map(), listeners = new Set();
  const faults = { read: false, write: false, remove: false };
  let sequence = 0, wall = WALL;
  let identity = { initialized: true, user: { id: OWNER }, epoch: 1, requestGeneration: 0, token: 'synthetic-cook-integrity-not-a-jwt' };
  const methods = {
    getItem: (key) => { if (faults.read) throw Error('Synthetic read denied'); return values.get(String(key)) ?? null; },
    setItem: (key, value) => { if (faults.write) throw Error('Synthetic quota exceeded'); values.set(String(key), String(value)); writes.push(['set', String(key)]); },
    removeItem: (key) => { if (faults.remove) throw Error('Synthetic removal denied'); values.delete(String(key)); writes.push(['remove', String(key)]); },
    key: (index) => [...values.keys()][index] ?? null,
    clear: () => { values.clear(); },
  };
  const storage = new Proxy(methods, {
    ownKeys: () => [...values.keys()],
    getOwnPropertyDescriptor: (_target, key) => values.has(key) ? { enumerable: true, configurable: true, value: values.get(key) } : undefined,
    get: (target, key) => key === 'length' ? values.size : target[key],
  });
  const auth = {
    getState: () => identity,
    subscribe: (callback) => { listeners.add(callback); return () => listeners.delete(callback); },
    change: (patch) => {
      const previous = identity; identity = { ...identity, ...patch };
      for (const listener of [...listeners]) listener(identity, previous);
    },
  };
  const locks = { async request(name, options, action) {
    assert.equal(options.mode, 'exclusive');
    lockCalls.push({ name, ifAvailable: options.ifAvailable === true });
    if (options.ifAvailable && tails.has(name)) return action(null);
    const previous = tails.get(name), done = deferred(); tails.set(name, done.promise);
    if (previous) await previous; else await Promise.resolve();
    try { return await action({ name }); }
    finally { done.resolve(); if (tails.get(name) === done.promise) tails.delete(name); }
  } };
  const deny = () => { throw Error('Test isolation forbids network access'); };
  const context = vm.createContext({ localStorage: storage, sessionStorage: storage, navigator: { locks: coordination ? locks : undefined, sendBeacon: deny },
    fetch: deny, XMLHttpRequest: class { constructor() { deny(); } }, AbortController,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
    setTimeout, clearTimeout,
  });
  const authModule = new vm.SyntheticModule(['default'], function () { this.setExport('default', auth); }, { context });
  const timerModule = new vm.SourceTextModule(timerSource, { context });
  await timerModule.link(() => { throw Error('Unexpected cookTimer dependency'); }); await timerModule.evaluate();
  const sessionModule = new vm.SourceTextModule(sessionSource, { context });
  await sessionModule.link((name) => {
    if (name === './useAuthStore') return authModule;
    if (name === '../utils/cookTimer.mjs') return timerModule;
    throw Error(`Unexpected cookSession dependency ${name}`);
  });
  await sessionModule.evaluate();
  const session = sessionModule.namespace, timer = timerModule.namespace, controllers = [];
  const key = (id, ns = 'account') => `cook_session:${ns}:${OWNER}:${id}`;
  const start = (options = {}) => session.getOrStartSession(OWNER, {
    dishSlug: 'synthetic-cook', level: 'basic', lang: 'en', forceNew: true, ...options,
  });
  const controller = (id, { write = (value, options) => session.setSessionTimer(OWNER, id, value, 'account', options) } = {}) => {
    const state = { view: null, alarms: 0, alarmFinishedFlags: [] };
    const scope = timer.createCookAuthScope(auth);
    state.api = timer.createCookTimerController({
      read: () => session.getSessionTimer(OWNER, id), write, current: scope.current,
      stepIds: ['step-1'], wallNow: () => wall, monoNow: () => wall - WALL,
      onChange: (view) => { state.view = view; }, onElapsed: () => {
        state.alarms++;
        state.alarmFinishedFlags.push(session.getSessionRecord(OWNER, id)?.cook_log_id != null);
      },
    });
    controllers.push(() => { scope.cancel(); state.api.dispose(); });
    state.api.load(); return state;
  };
  return { session, timer, auth, faults, values, writes, lockCalls, key, start, controller,
    advance: (ms) => { wall += ms; },
    hold: async (id) => {
      const entered = deferred(), release = deferred();
      const done = locks.request(`cook_timer:account:${OWNER}:${id}`, { mode: 'exclusive' }, async () => { entered.resolve(); await release.promise; });
      await entered.promise; return { release: release.resolve, done };
    },
    dispose: () => { for (const close of controllers) close(); },
  };
}

test('saved cook rejects timer reads and every stale timer write/reset without changing the record', async () => {
  const f = await fixture(), id = f.start({ snapshotId: 101 });
  try {
    const original = f.timer.newCookTimer('step-1', 60, WALL);
    assert.equal((await f.session.setSessionTimer(OWNER, id, original)).ok, true);
    await f.session.setSessionCookLog(OWNER, id, 701);
    const before = f.values.get(f.key(id));
    assert.deepEqual(plain(f.session.getSessionTimer(OWNER, id)), { ok: false, error: 'finished' });
    for (const [value, reset] of [[f.timer.pauseCookTimer(original, 50000, WALL + 10000), false], [null, false], [null, true]]) {
      assert.deepEqual(plain(await f.session.setSessionTimer(OWNER, id, value, 'account', { expectedTimer: original, reset })), { ok: false, error: 'finished' });
      assert.equal(f.values.get(f.key(id)), before, 'A completed attempt must stay byte-identical');
    }
  } finally { f.dispose(); }
});

test('already-mounted same-attempt controller cannot alarm or resurrect a timer after another tab saves', async () => {
  const f = await fixture(), id = f.start({ snapshotId: 101 });
  try {
    const stale = f.controller(id); stale.api.start('step-1', 60); await flush();
    assert.equal(stale.view.error, null);
    await f.session.setSessionCookLog(OWNER, id, 702);
    const before = f.values.get(f.key(id));
    f.advance(61000); stale.api.tick(); await flush();
    assert.equal(stale.alarms, 0, 'Other-tab completion must suppress elapsed feedback');
    assert.equal(stale.view.blocked, true); assert.equal(stale.view.error, 'finished');
    assert.equal(f.values.get(f.key(id)), before);
    stale.api.retry(); await flush();
    assert.equal(stale.alarms, 0); assert.equal(stale.view.error, 'finished');
  } finally { f.dispose(); }
});

test('an elapsed write may alarm before completion but its delayed acknowledgement cannot alarm afterwards', async () => {
  const f = await fixture(), id = f.start({ snapshotId: 101 }), held = deferred(), entered = deferred();
  try {
    const stale = f.controller(id, { write: async (value, options) => {
      const result = await f.session.setSessionTimer(OWNER, id, value, 'account', options);
      if (value?.status === 'elapsed' && result.ok) { entered.resolve(); await held.promise; }
      return result;
    } });
    stale.api.start('step-1', 60); await flush();
    f.advance(61000); stale.api.tick(); await entered.promise;
    assert.equal(stale.alarms, 1, 'Accepted expiry emits once inside the attempt lock');
    await f.session.setSessionCookLog(OWNER, id, 703);
    const before = f.values.get(f.key(id)), alarmCountAtCompletion = stale.alarms;
    held.resolve(); await flush();
    stale.api.tick(); await flush();
    assert.equal(stale.alarms, alarmCountAtCompletion, 'Successful old write is not authority to alarm after completion');
    assert.deepEqual(stale.alarmFinishedFlags, [false]);
    assert.equal(stale.view.error, 'finished');
    assert.equal(f.values.get(f.key(id)), before);
  } finally { held.resolve(); f.dispose(); }
});

test('completion and deletion affect only their exact attempt, not another attempt or guest namespace', async () => {
  const f = await fixture(), a = f.start(), b = f.start(), guest = f.start({ ns: 'guest' });
  try {
    const original = f.timer.newCookTimer('step-1', 60, WALL);
    await f.session.setSessionCookLog(OWNER, a, 704);
    assert.equal((await f.session.setSessionTimer(OWNER, b, original)).ok, true);
    assert.equal((await f.session.setSessionTimer(OWNER, guest, original, 'guest')).ok, true);
    await f.session.completeSession(OWNER, a);
    assert.equal((await f.session.setSessionTimer(OWNER, a, original)).ok, false);
    assert.equal(f.values.has(f.key(a)), false, 'Missing attempt must not be recreated');
    assert.equal(f.session.getSessionTimer(OWNER, b).timer.stepId, 'step-1');
    assert.equal(f.session.getSessionTimer(OWNER, guest, 'guest').timer.stepId, 'step-1');
  } finally { f.dispose(); }
});

test('two competing snapshot pins return one persisted winner and preserve unrelated attempt metadata', async () => {
  const f = await fixture(), id = f.start();
  try {
    await f.session.setCurrentStep(OWNER, id, 'step-1');
    const original = f.timer.newCookTimer('step-1', 60, WALL);
    await f.session.setSessionTimer(OWNER, id, original);
    const results = await Promise.all([
      f.session.setSessionSnapshot(OWNER, id, 201, 'account', { requireLock: true }),
      f.session.setSessionSnapshot(OWNER, id, 202, 'account', { requireLock: true }),
    ]);
    const record = f.session.getSessionRecord(OWNER, id);
    assert.equal(record.snapshot_id, 201, 'First serialized pin wins');
    assertWinner(results[0], 201, 'pinned');
    assertWinner(results[1], 201, 'existing');
    for (const result of results) assert.equal(result.current_step_id, 'step-1');
    assert.equal(record.capture_pending, false); assert.equal(record.current_step_id, 'step-1');
    assert.deepEqual(plain(record.timer), plain(original));
    assert.ok(f.lockCalls.every((call) => call.name === `cook_timer:account:${OWNER}:${id}`), 'All shared-record writers must use the same attempt lock');
  } finally { f.dispose(); }
});

for (const fault of ['read', 'write']) {
  test(`snapshot ${fault} failure is explicit, retains bytes and permits retry on the SAME attempt`, async () => {
    const f = await fixture(), id = f.start(), before = f.values.get(f.key(id));
    try {
      f.faults[fault] = true;
      assert.deepEqual(plain(await f.session.setSessionSnapshot(OWNER, id, 301)), { ok: false, error: 'storage' });
      assert.equal(f.values.get(f.key(id)), before);
      f.faults[fault] = false;
      assertWinner(await f.session.setSessionSnapshot(OWNER, id, 301), 301, 'pinned');
      assert.equal(f.session.getSessionRecord(OWNER, id).session_id, id);
    } finally { f.faults[fault] = false; f.dispose(); }
  });
}

test('a persisted snapshot winner is readable without rewriting it when writes are denied', async () => {
  const f = await fixture(), id = f.start({ snapshotId: 401 }), before = f.values.get(f.key(id));
  try {
    const count = f.writes.length; f.faults.write = true;
    assertWinner(await f.session.setSessionSnapshot(OWNER, id, 402), 401, 'existing');
    assert.equal(f.values.get(f.key(id)), before); assert.equal(f.writes.length, count);
  } finally { f.faults.write = false; f.dispose(); }
});

test('missing or corrupt attempt is not silently repaired while pinning a snapshot', async () => {
  const f = await fixture(), id = f.start();
  try {
    f.values.set(f.key(id), '{synthetic-corruption');
    assert.deepEqual(plain(await f.session.setSessionSnapshot(OWNER, id, 501)), { ok: false, error: 'corrupt' });
    assert.equal(f.values.get(f.key(id)), '{synthetic-corruption');
    f.values.delete(f.key(id));
    assert.deepEqual(plain(await f.session.setSessionSnapshot(OWNER, id, 501)), { ok: false, error: 'missing' });
    assert.equal(f.values.has(f.key(id)), false);
  } finally { f.dispose(); }
});

test('a queued snapshot pin cannot adopt a restored same-account token or mutate after auth invalidation', async () => {
  const f = await fixture(), id = f.start(), before = f.values.get(f.key(id)), hold = await f.hold(id);
  try {
    const original = f.auth.getState(), pending = f.session.setSessionSnapshot(OWNER, id, 601);
    f.auth.change({ token: 'synthetic-other-token' }); f.auth.change(original);
    hold.release(); await hold.done;
    // Snapshot metadata uses a generic coordination failure for an invalidated
    // lock request; the important boundary is explicit failure and zero writes.
    assert.deepEqual(plain(await pending), { ok: false, error: 'coordination' });
    assert.equal(f.values.get(f.key(id)), before);
  } finally { hold.release(); await hold.done; f.dispose(); }
});

test('CookMode-required coordination cannot silently degrade to an unlocked snapshot pin', async () => {
  const f = await fixture({ coordination: false }), id = f.start(), before = f.values.get(f.key(id));
  try {
    assert.deepEqual(plain(await f.session.setSessionSnapshot(OWNER, id, 801, 'account', { requireLock: true })),
      { ok: false, error: 'coordination' });
    assert.deepEqual(plain(await f.session.setSessionTimer(OWNER, id, f.timer.newCookTimer('step-1', 60, WALL))),
      { ok: false, error: 'coordination' });
    assert.equal(f.values.get(f.key(id)), before);
    assert.equal(f.lockCalls.length, 0);
  } finally { f.dispose(); }
});
