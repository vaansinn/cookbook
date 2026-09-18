// Run with Node's extensionlessLoader.mjs, like test_cook_session.mjs.
// Browser test is opt-in: COOK_TIMER_BROWSER_TESTS=1. Playwright is resolved
// from frontend dependencies, or COOK_TIMER_TEST_RUNTIME (a node_modules path).
// COOK_TIMER_TEST_BROWSER optionally selects an executable; otherwise Playwright
// uses its installed Chromium. No workstation-specific defaults are required.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { installFakeLocalStorage } from './fakeLocalStorage.mjs';
import { MAX_TIMER_MS, validCookTimer, newCookTimer, remainingMs, restoreCookTimer,
  reconcileCookTimer, createCookTimerController, manageCookWakeLock, playCookTimerAlarm, createCookAuthScope } from '../../frontend/src/utils/cookTimer.mjs';
installFakeLocalStorage();
if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
const heldLocks = new Set();
Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: {
  async request(name, options, action) {
    await Promise.resolve();
    if (options.ifAvailable && heldLocks.has(name)) return action(null);
    while (heldLocks.has(name)) await new Promise((resolve) => setImmediate(resolve));
    heldLocks.add(name);
    try { return await action({ name }); } finally { heldLocks.delete(name); }
  },
} });
const { getOrStartSession, getSessionRecord, getSessionTimer, setSessionTimer, setCurrentStep, completeSession, setSessionCookLog, setSessionSnapshot } = await import('../../frontend/src/store/cookSession.js');
const { default: auth } = await import('../../frontend/src/store/useAuthStore.js');
const base = 1800000000000;
const make = () => newCookTimer('step-1', 60, base);

test('deadline reconciles delayed callbacks and refresh to within one displayed second', () => {
  const timer = make();
  assert.equal(Math.ceil(remainingMs(timer, base + 19251) / 1000), 41);
  assert.equal(restoreCookTimer(timer, base + 59001, ['step-1']).timer.status, 'running');
  assert.equal(restoreCookTimer(timer, base + 65000, ['step-1']).timer.status, 'elapsed');
  assert.equal(remainingMs(timer, base + 65000), 0);
});
test('strict timer validation accepts absent legacy state and enforces 24 hours and field combinations', () => {
  assert.deepEqual(restoreCookTimer(undefined, base), { timer: null, error: null });
  assert.equal(newCookTimer('x', MAX_TIMER_MS / 1000, base).durationMs, MAX_TIMER_MS);
  for (const seconds of [0, -1, Infinity, NaN, MAX_TIMER_MS / 1000 + 1]) assert.throws(() => newCookTimer('x', seconds, base));
  for (const patch of [{ schema: 2 }, { stepId: '' }, { status: 'cancelled' }, { deadline: '123' }, { updatedAt: -1 },
    { pausedRemaining: 0 }, { clockNotice: undefined }, { durationMs: MAX_TIMER_MS + 1 }, { deadline: base + 60001 }]) {
    assert.equal(validCookTimer({ ...make(), ...patch }), false, JSON.stringify(patch));
  }
  assert.equal(restoreCookTimer(make(), base, ['other-step']).error, 'corrupt');
});
test('refresh with a backwards clock pauses the saved remaining duration and keeps a clock notice', () => {
  const timer = { ...make(), updatedAt: base + 10000 };
  const restored = restoreCookTimer(timer, base - 3000).timer;
  assert.equal(restored.status, 'paused'); assert.equal(restored.pausedRemaining, 50000);
  assert.equal(restored.clockNotice, true); assert.equal(validCookTimer(restored), true);
  assert.equal(restoreCookTimer(restored, base - 5000).timer.clockNotice, true);
});
test('mounted wall/monotonic discrepancy pauses the last known remaining value in either direction', () => {
  const previous = { wall: base + 10000, mono: 10000, remaining: 50000 };
  for (const wall of [base - 100000, base + 100000]) {
    const result = reconcileCookTimer(make(), previous, wall, 11000);
    assert.equal(result.status, 'paused'); assert.equal(result.pausedRemaining, 50000); assert.equal(result.clockNotice, true);
  }
  assert.equal(reconcileCookTimer(make(), previous, base + 55000, 55000).status, 'running');
  assert.equal(reconcileCookTimer(make(), previous, base + 65000, 65000).status, 'elapsed');
});

function fixture(initial = null) {
  const f = { wall: base, mono: 0, saved: initial, writes: [], view: null, alerts: 0, failure: null, current: true };
  f.controller = createCookTimerController({ stepIds: ['step-1', 'step-2'], wallNow: () => f.wall, monoNow: () => f.mono,
    current: () => f.current, onChange: (value) => { f.view = value; }, onElapsed: () => { f.alerts++; },
    read: () => ({ ok: true, timer: f.saved }),
    write: (timer, options) => { f.writes.push({ timer, options }); if (f.failure) return { ok: false, error: f.failure }; f.saved = timer; options.onElapsed?.(); return { ok: true }; } });
  f.advance = (ms) => { f.wall += ms; f.mono += ms; };
  f.controller.load(); return f;
}
test('explicit pause/resume uses remaining duration; one running timer cannot be implicitly replaced', () => {
  const f = fixture(); f.controller.start('step-1', 60); f.advance(15200); f.controller.pause();
  assert.equal(f.view.timer.pausedRemaining, 44800); f.advance(100000); f.controller.tick();
  assert.equal(f.view.remaining, 44800); f.controller.start('step-2', 40); assert.equal(f.view.timer.stepId, 'step-1');
  f.controller.resume(); assert.equal(f.view.timer.deadline, f.wall + 44800);
  f.advance(44800); f.controller.tick(); f.controller.tick(); assert.equal(f.alerts, 1);
  f.controller.resume(); assert.equal(f.view.timer.status, 'elapsed', 'Expiry is terminal, not accidentally resumable');
  f.controller.start('step-2', 40); assert.equal(f.view.timer.stepId, 'step-2');
  f.controller.cancel(); assert.equal(f.saved, null);
});
test('controller checkpoints deadlines, restores elapsed state without inventing remaining time and never auto retries failed writes', () => {
  const f = fixture(); f.controller.start('step-1', 60); f.advance(30000); f.controller.tick();
  assert.equal(f.saved.updatedAt, base + 30000); assert.equal(f.saved.deadline, base + 60000);
  f.failure = 'storage'; f.controller.pause(); const count = f.writes.length;
  assert.equal(f.view.error, 'storage'); assert.equal(f.view.blocked, false);
  f.advance(10000); f.controller.tick(); assert.equal(f.writes.length, count);
  f.failure = null; f.controller.retry(); assert.equal(f.saved.status, 'paused'); assert.equal(f.view.error, null);
  const restored = fixture({ ...make(), deadline: base - 1, updatedAt: base - 60001 });
  assert.equal(restored.view.timer.status, 'elapsed'); assert.equal(restored.alerts, 0);
});
test('corrupt timers require explicit reset and stale owners cannot write or alert', () => {
  const corrupt = { ...make(), schema: 99 }, f = fixture(corrupt);
  assert.equal(f.view.error, 'corrupt'); assert.equal(f.writes.length, 0);
  f.controller.start('step-1', 30); assert.deepEqual(f.saved, corrupt);
  f.controller.reset(); assert.equal(f.saved, null); assert.equal(f.view.blocked, false);
  f.controller.start('step-1', 30); const count = f.writes.length;
  f.current = false; f.advance(40000); f.controller.tick(); f.controller.cancel();
  assert.equal(f.writes.length, count); assert.equal(f.alerts, 0);
});
test('attempt, namespace and navigation storage boundaries remain independent', async () => {
  localStorage.clear();
  const owner = 47, options = { dishSlug: 'dish', level: 'basic', lang: 'en', snapshotId: 9 };
  const a = getOrStartSession(owner, options), b = getOrStartSession(owner, { ...options, forceNew: true });
  const guest = getOrStartSession(owner, { ...options, ns: 'guest' });
  assert.equal((await setSessionTimer(owner, a, make())).ok, true);
  await setCurrentStep(owner, a, 'step-2'); await setCurrentStep(owner, a, 'step-1');
  assert.deepEqual(getSessionTimer(owner, a).timer, make()); assert.equal(getSessionTimer(owner, b).timer, null);
  assert.equal(getSessionTimer(owner, guest, 'guest').timer, null);
  assert.equal(getSessionTimer(owner, a, 'guest').error, 'missing');
  assert.equal(getSessionTimer(48, a).error, 'missing');
  assert.equal(getSessionTimer(owner, a, 'other').error, 'identity');
  assert.equal(getSessionRecord(owner, a).snapshot_id, 9);
  await completeSession(owner, b); assert.deepEqual(getSessionTimer(owner, a).timer, make());
  auth.setState({ user: { id: owner } }); auth.setState({ user: { id: 48 } });
  assert.equal(getSessionTimer(owner, a).error, 'missing');
  assert.equal(getSessionTimer(owner, guest, 'guest').ok, true);
});
test('corrupt timer storage stays byte-identical until timer-only reset; conflicting writes cannot overwrite', async () => {
  const owner = 51, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en', snapshotId: 99 });
  const key = `cook_session:account:${owner}:${id}`;
  const record = { ...getSessionRecord(owner, id), timer: { schema: 'broken' } };
  localStorage.setItem(key, JSON.stringify(record)); const before = localStorage.getItem(key);
  assert.equal((await setSessionTimer(owner, id, make())).error, 'corrupt'); assert.equal(localStorage.getItem(key), before);
  assert.equal((await setSessionTimer(owner, id, null, 'account', { reset: true, expectedTimer: record.timer })).ok, true);
  const { timer: _timer, ...rest } = record; assert.deepEqual(getSessionRecord(owner, id), rest);
  assert.equal((await setSessionTimer(owner, id, make())).ok, true);
  assert.equal((await setSessionTimer(owner, id, null)).error, 'changed');
  assert.equal((await setSessionTimer(owner, id, null, 'account', { expectedTimer: make() })).ok, true);
  localStorage.setItem(key, JSON.stringify({ ...rest, session_id: 'different' }));
  assert.equal((await setSessionTimer(owner, id, make())).error, 'identity');
});
test('denied reads and writes report storage failure without claiming persistence', async () => {
  const owner = 52, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en' });
  const original = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
    assert.equal(getSessionTimer(owner, id).error, 'storage'); assert.equal((await setSessionTimer(owner, id, make())).error, 'storage');
    globalThis.localStorage = { getItem: original.getItem.bind(original), setItem() { throw Error('quota'); } };
    assert.equal((await setSessionTimer(owner, id, make())).error, 'storage');
    assert.equal(JSON.parse(original.getItem(`cook_session:account:${owner}:${id}`)).timer, undefined);
  } finally { globalThis.localStorage = original; }
});

function fakePage() {
  const page = new EventTarget(); page.visibilityState = 'visible';
  page.change = (state) => { page.visibilityState = state; page.dispatchEvent(new Event('visibilitychange')); };
  return page;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test('wake lock denial is nonfatal and late acquisition after disposal is released', async () => {
  const page = fakePage(), statuses = []; let resolve, releases = 0;
  const stop = manageCookWakeLock({ page, onStatus: (s) => statuses.push(s), device: { wakeLock: { request: () => new Promise((r) => { resolve = r; }) } } });
  stop(); resolve({ release: async () => { releases++; } }); await flush();
  assert.equal(releases, 1); assert.deepEqual(statuses, ['requesting']);
  const denied = []; const end = manageCookWakeLock({ page, onStatus: (s) => denied.push(s), device: { wakeLock: { request: async () => { throw Error('denied'); } } } });
  await flush(); assert.equal(denied.at(-1), 'denied'); end();
});
test('wake lock is visible-only, reacquires on return and releases stale generations', async () => {
  const page = fakePage(), pending = [], released = [], statuses = [];
  page.visibilityState = 'hidden';
  const stop = manageCookWakeLock({ page, onStatus: (s) => statuses.push(s), device: { wakeLock: { request: () => new Promise((r) => pending.push(r)) } } });
  assert.equal(pending.length, 0); page.change('visible'); page.change('hidden'); page.change('visible');
  assert.equal(pending.length, 1, 'Repeated visibility never overlaps pending acquisitions');
  pending[0]({ release: async () => released.push(0) }); await flush();
  assert.equal(pending.length, 2); pending[1]({ release: async () => released.push(1) });
  await flush(); assert.deepEqual(released, [0]); assert.equal(statuses.at(-1), 'active');
  stop(); await flush(); assert.deepEqual(released, [0, 1]);
});
test('two controllers share an attempt lock: one winner, stale controls rejected, metadata preserves the timer', async () => {
  const owner = 60, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en', snapshotId: 2 });
  const views = [];
  const controllers = [0, 1].map((index) => createCookTimerController({
    stepIds: ['step-1', 'step-2'], wallNow: () => base, monoNow: () => 0,
    read: () => getSessionTimer(owner, id), write: (timer, options) => setSessionTimer(owner, id, timer, 'account', options),
    onChange: (value) => { views[index] = value; },
  }));
  controllers.forEach((c) => c.load());
  controllers[0].start('step-1', 60); controllers[1].start('step-2', 90);
  await flush();
  assert.equal(views[0].error, null); assert.equal(views[1].error, 'busy');
  assert.equal(getSessionTimer(owner, id).timer.stepId, 'step-1');
  controllers[1].retry(); controllers[0].pause(); await flush();
  const paused = getSessionTimer(owner, id).timer;
  controllers[1].cancel(); await flush();
  assert.equal(views[1].error, 'changed'); assert.deepEqual(getSessionTimer(owner, id).timer, paused);
  await setCurrentStep(owner, id, 'step-2'); assert.deepEqual(getSessionTimer(owner, id).timer, paused);
  controllers[0].resume(); await flush(); assert.equal(getSessionTimer(owner, id).timer.status, 'running');
  controllers.forEach((c) => c.dispose());
});
test('a pause after a delayed callback is not consumed by an asynchronous checkpoint', async () => {
  let now = base, saved = null, writes = 0, view;
  const controller = createCookTimerController({ stepIds: ['step-1'], wallNow: () => now, monoNow: () => now - base,
    read: () => ({ ok: true, timer: saved }), onChange: (value) => { view = value; },
    write: async (value) => { saved = value; writes++; return { ok: true }; },
  });
  controller.load(); controller.start('step-1', 60); await flush();
  now += 31000; controller.pause(); await flush();
  assert.equal(saved.status, 'paused'); assert.equal(saved.pausedRemaining, 29000); assert.equal(writes, 2);
  assert.equal(view.blocked, false); controller.dispose();
});
test('lock-unavailable and stale-after-lock-acquisition fail closed without timer writes', async () => {
  const owner = 61, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en' });
  const locks = navigator.locks;
  try {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    assert.equal((await setSessionTimer(owner, id, make())).error, 'coordination');
  } finally { Object.defineProperty(navigator, 'locks', { configurable: true, value: locks }); }
  let current = true;
  const pending = setSessionTimer(owner, id, make(), 'account', { current: () => current });
  current = false; assert.equal((await pending).error, 'identity');
  assert.equal(getSessionTimer(owner, id).timer, null);
});
test('corruption -> another controller repair -> stale Reset cannot remove the repaired timer', async () => {
  for (const corrupt of [{ schema: 99 }, newCookTimer('unknown-snapshot-step', 60, base)]) {
    const owner = 62, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en', forceNew: true });
    const key = `cook_session:account:${owner}:${id}`;
    localStorage.setItem(key, JSON.stringify({ ...getSessionRecord(owner, id), timer: corrupt }));
    const views = [];
    const controllers = [0, 1].map((index) => createCookTimerController({ stepIds: ['step-1'], wallNow: () => base, monoNow: () => 0,
      read: () => getSessionTimer(owner, id), write: (timer, options) => setSessionTimer(owner, id, timer, 'account', options),
      onChange: (value) => { views[index] = value; },
    }));
    controllers.forEach((controller) => controller.load()); assert.equal(views[0].error, 'corrupt');
    controllers[1].reset(); await flush(); controllers[1].start('step-1', 120); await flush();
    const repaired = getSessionTimer(owner, id).timer;
    controllers[0].reset(); await flush();
    assert.equal(views[0].error, 'changed'); assert.deepEqual(getSessionTimer(owner, id).timer, repaired);
    controllers.forEach((controller) => controller.dispose());
  }
});
test('auth scope synchronously and irreversibly fences token/generation changes including A -> null -> A', () => {
  let state = { initialized: true, user: { id: 1 }, epoch: 1, requestGeneration: 1, token: 'A' };
  const listeners = new Set(), store = { getState: () => state, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
  const change = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn(state)); };
  for (const patch of [{ token: 'B' }, { requestGeneration: 2 }, { token: null }]) {
    const baseline = state, scope = createCookAuthScope(store);
    change(patch); change(baseline);
    assert.equal(scope.current(), false); assert.equal(scope.signal.aborted, true);
    scope.cancel(); assert.equal(listeners.size, 0);
  }
});
test('queued metadata and timer writes cannot adopt a restored same-account token', async () => {
  const owner = 63, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en' });
  const before = auth.getState();
  const stepWrite = setCurrentStep(owner, id, 'step-2');
  auth.setState({ token: 'different-token-with-same-account-and-epoch' }); auth.setState({ token: before.token });
  await stepWrite;
  const timerWrite = setSessionTimer(owner, id, make());
  auth.setState({ token: 'different-token-with-same-account-and-epoch' }); auth.setState({ token: before.token });
  assert.equal((await timerWrite).error, 'identity');
  assert.equal(getSessionRecord(owner, id).current_step_id, null); assert.equal(getSessionTimer(owner, id).timer, null);
});
test('completion in another controller blocks timer reads/writes/reset/expiry and never alarms', async () => {
  const owner = 64, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en', snapshotId: 10 });
  let now = base, view, alarms = 0;
  const controller = createCookTimerController({ stepIds: ['step-1'], wallNow: () => now, monoNow: () => now - base,
    read: () => getSessionTimer(owner, id), write: (value, options) => setSessionTimer(owner, id, value, 'account', options),
    onChange: (value) => { view = value; }, onElapsed: () => { alarms++; },
  });
  controller.load(); controller.start('step-1', 1); await flush();
  const before = getSessionRecord(owner, id).timer;
  await setSessionCookLog(owner, id, 99);
  assert.equal(getSessionTimer(owner, id).error, 'finished');
  assert.equal((await setSessionTimer(owner, id, null, 'account', { reset: true, expectedTimer: before })).error, 'finished');
  now += 2000; controller.tick(); controller.resume(); controller.start('step-1', 60); await flush();
  assert.equal(view.error, 'finished'); assert.equal(view.timer, null); assert.equal(alarms, 0);
  assert.deepEqual(getSessionRecord(owner, id).timer, before);
  controller.dispose();
});
test('expiry feedback executes under the lifecycle lock and never after completion', async () => {
  const owner = 65, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en', snapshotId: 10 });
  const running = make(), elapsed = restoreCookTimer(running, base + 61000).timer;
  await setSessionTimer(owner, id, running);
  let alarms = 0;
  const options = { expectedTimer: running, current: () => true, onElapsed: () => {
    assert(heldLocks.has(`cook_timer:account:${owner}:${id}`)); alarms++;
  } };
  assert.equal((await setSessionTimer(owner, id, elapsed, 'account', options)).ok, true);
  assert.equal(alarms, 1); await setSessionCookLog(owner, id, 99);
  assert.equal((await setSessionTimer(owner, id, elapsed, 'account', { ...options, expectedTimer: elapsed })).error, 'finished');
  assert.equal(alarms, 1);
});
test('concurrent snapshot pins return the persisted winner and explicit failure, never a silent losing success', async () => {
  const owner = 66, id = getOrStartSession(owner, { dishSlug: 'dish', level: 'basic', lang: 'en' });
  const results = await Promise.all([setSessionSnapshot(owner, id, 101, 'account', { requireLock: true }),
    setSessionSnapshot(owner, id, 202, 'account', { requireLock: true })]);
  assert.deepEqual(results.map((result) => [result.ok, result.status, result.snapshot_id]), [[true, 'pinned', 101], [true, 'existing', 101]]);
  assert.equal(getSessionRecord(owner, id).snapshot_id, 101);
  const missing = await setSessionSnapshot(owner, 'missing', 202, 'account', { requireLock: true });
  assert.equal(missing.ok, false); assert.equal(missing.error, 'missing');
  const fresh = getOrStartSession(owner, { dishSlug: 'another', level: 'basic', lang: 'en' });
  const storage = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: storage.getItem.bind(storage), setItem() { throw Error('quota'); } };
    assert.equal((await setSessionSnapshot(owner, fresh, 202, 'account', { requireLock: true })).error, 'storage');
  } finally { globalThis.localStorage = storage; }
  assert.equal(getSessionRecord(owner, fresh).snapshot_id, null);
  const locks = navigator.locks;
  try {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true });
    assert.equal(setSessionSnapshot(owner, fresh, 202, 'account', { requireLock: true }).error, 'coordination');
  } finally { Object.defineProperty(navigator, 'locks', { value: locks, configurable: true }); }
});
test('audio closes once on completion or unmount, outside React state updaters', () => {
  let closed = 0; const oscillators = [];
  class Audio {
    currentTime = 0; destination = {};
    createOscillator() { const oscillator = { frequency: {}, connect() {}, start() {}, stop() {} }; oscillators.push(oscillator); return oscillator; }
    createGain() { return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; }
    close() { closed++; return Promise.resolve(); }
  }
  const close = playCookTimerAlarm(Audio); oscillators.forEach((o) => o.onended()); close(); assert.equal(closed, 1);
  playCookTimerAlarm(Audio)(); assert.equal(closed, 2);
});

test('mounted actual CookMode keeps timer through navigation, snapshot failures, Finish rejection and exact-attempt changes', { timeout: 30000 }, async (context) => {
  if (process.env.COOK_TIMER_BROWSER_TESTS !== '1') {
    context.skip('Optional: set COOK_TIMER_BROWSER_TESTS=1; provide Playwright through frontend dependencies or COOK_TIMER_TEST_RUNTIME, and optionally COOK_TIMER_TEST_BROWSER.'); return;
  }
  const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
  const runtime = process.env.COOK_TIMER_TEST_RUNTIME;
  const playwright = runtime ? createRequire(`${runtime}/playwright/package.json`)('playwright') : require('playwright');
  const absolute = (relative) => JSON.stringify(fileURLToPath(new URL(`../../frontend/${relative}`, import.meta.url)));
  const built = await require('esbuild').build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {BrowserRouter,Routes,Route,useNavigate} from 'react-router-dom';
    import CookMode from ${absolute('src/pages/CookMode.jsx')};
    import auth from ${absolute('src/store/useAuthStore.js')};
    import {getOrStartSession,getSessionRecord,getSessionTimer} from ${absolute('src/store/cookSession.js')};
    auth.setState({user:{id:701},token:'synthetic',initialized:true,epoch:1});
    const options={dishSlug:'synthetic-dish',level:'basic',lang:'en',snapshotId:10};
    const a=getOrStartSession(701,options), b=getOrStartSession(701,{...options,forceNew:true});
    window.fixture.a=a;window.fixture.b=b;window.fixture.record=()=>getSessionRecord(701,a);
    window.fixture.timer=()=>getSessionTimer(701,a).timer;
    window.fixture.holdTimerLock=()=>navigator.locks.request('cook_timer:account:701:'+a,{mode:'exclusive'},()=>new Promise(resolve=>{window.fixture.releaseTimerLock=resolve}));
    function Harness(){const navigate=useNavigate(); const [generation,setGeneration]=React.useState(0);
      window.fixture.remount=()=>setGeneration(v=>v+1);window.fixture.go=(id)=>navigate('/dish/synthetic-dish/cook?level=basic&lang=en&attempt='+id);
      return <Routes><Route path='/dish/:slug/cook' element={<CookMode key={generation}/>}/></Routes>}
    history.replaceState(null,'','/dish/synthetic-dish/cook?level=basic&lang=en&attempt='+a);
    createRoot(document.getElementById('mount')).render(<BrowserRouter><Harness/></BrowserRouter>);
  `, resolveDir: fileURLToPath(new URL('../../frontend', import.meta.url)), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', logLevel: 'silent', loader: { '.css': 'empty' },
    plugins: [{ name: 'isolated-cook-api', setup(build) {
      build.onResolve({ filter: /api\/(snapshots|progress)$/ }, (args) => args.importer.endsWith('CookMode.jsx') ? { path: args.path, namespace: 'fixture' } : undefined);
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: args.path.endsWith('snapshots') ? `
        export async function readSnapshot(){if(window.fixture.snapshotError)throw Error('synthetic snapshot error');return {snapshot_id:10,content:{schema_version:2,title:'Synthetic',steps:[{id:'step-1',text:'Wait 1 min.'},{id:'step-2',text:'Serve.'}],lessons:{}}}}
        export const startSnapshot=readSnapshot;
      ` : `export async function logCook(){window.fixture.finishes++;if(window.fixture.finishError)throw Error('synthetic finish rejection');return {cook_log:{id:12}}}` }));
    } }] });
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.COOK_TIMER_TEST_BROWSER ? { executablePath: process.env.COOK_TIMER_TEST_BROWSER } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(5000);
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="mount"></div>' }) : route.abort());
    await page.goto('http://127.0.0.1:9999/cook-timer-test-only');
    await page.evaluate(() => {
      window.fixture = { snapshotError: false, finishError: true, finishes: 0, wakeRequests: 0, wakeReleases: 0 };
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        window.fixture.wakeRequests++; return { release: async () => { window.fixture.wakeReleases++; }, addEventListener() {} };
      } } });
    });
    await page.addScriptTag({ content: built.outputFiles[0].text });
    await page.getByRole('button', { name: 'Start timer: 1:00', exact: true }).click();
    await page.waitForFunction(() => window.fixture.timer()?.status === 'running');
    const original = await page.evaluate(() => window.fixture.timer());
    await page.evaluate(() => { window.fixture.holdTimerLock(); });
    await page.waitForFunction(() => typeof window.fixture.releaseTimerLock === 'function');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByText('Timer changes are blocked:', { exact: false }).waitFor();
    assert.equal((await page.evaluate(() => window.fixture.timer())).status, 'running', 'Held real browser lock must reject the competing control');
    await page.evaluate(() => window.fixture.releaseTimerLock());
    await page.getByRole('button', { name: 'Retry timer storage', exact: true }).click();
    await page.getByRole('button', { name: 'Next →', exact: true }).click();
    await page.getByRole('region', { name: 'Timer · step 1', exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.fixture.timer())).deadline, original.deadline);
    await page.getByRole('button', { name: 'Done cooking', exact: true }).click();
    await page.getByText('Something went wrong. Please try again.', { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.fixture.timer())).status, 'running', 'Failed Finish must not cancel');
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForFunction(() => window.fixture.timer()?.status === 'paused');
    await page.evaluate(() => { window.fixture.snapshotError = true; window.fixture.remount(); });
    await page.getByText('We couldn’t load this cook. Retry to keep the same attempt.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    const paused = await page.evaluate(() => window.fixture.timer());
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.waitForFunction(() => window.fixture.timer()?.status === 'running');
    assert.ok((await page.evaluate(() => window.fixture.timer())).deadline > original.deadline - 2000);
    await page.evaluate(() => { window.fixture.snapshotError = false; window.fixture.go(window.fixture.b); });
    await page.getByRole('button', { name: 'Start timer: 1:00', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 0, 'New attempt cannot inherit the old timer');
    await page.evaluate(() => window.fixture.go(window.fixture.a));
    await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
    assert.ok(paused.pausedRemaining > 0);
    await page.evaluate(() => { window.fixture.finishError = false; });
    await page.getByRole('button', { name: 'Done cooking', exact: true }).click();
    await page.waitForFunction(() => window.fixture.wakeReleases === window.fixture.wakeRequests);
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 0, 'Reflection does not expose an active timer');
    const wakeRequests = await page.evaluate(() => window.fixture.wakeRequests);
    await page.evaluate(() => { window.fixture.snapshotError = true; window.fixture.remount(); });
    await page.getByText('We couldn’t load this cook. Retry to keep the same attempt.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).count(), 0, 'A saved cook cannot resurrect its timer while reflection content is unavailable');
    assert.equal(await page.evaluate(() => window.fixture.wakeRequests), wakeRequests);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('CookMode integrates without changing snapshot/guest flows, callback countdowns or navigation timer resets', async () => {
  const file = new URL('../../frontend/src/pages/CookMode.jsx', import.meta.url);
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /tm\.left\s*-|setTimer\(/);
  assert.match(source, /phase !== "cooking"/);
  assert.match(source, /if \(!isGuest\)[\s\S]*logCook/);
  assert.match(source, /createCookTimerController/); assert.match(source, /cook_timer_origin/);
  assert.match(source, /readSnapshot\(record.snapshot_id/); assert.match(source, /ReflectionEditor/);
  const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
  await require('esbuild').build({ entryPoints: [fileURLToPath(file)], bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, logLevel: 'silent' });
  const en = JSON.parse(fs.readFileSync(new URL('../../frontend/src/locales/en.json', import.meta.url))), de = JSON.parse(fs.readFileSync(new URL('../../frontend/src/locales/de.json', import.meta.url)));
  const keys = (dict) => Object.keys(dict).filter((key) => /^cook_(timer|wakelock)_/.test(key)).sort();
  assert.deepEqual(keys(en), keys(de));
  for (const key of keys(en)) { assert.ok(en[key]); assert.ok(de[key]); }
});
