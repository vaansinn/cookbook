// node --test tests/frontend/test_auth_session.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { createSessionRuntime, SESSION_CHANGE_KEY } from '../../frontend/src/api/authSession.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function locks() {
  let tail = Promise.resolve();
  return { request: (_name, _options, action) => {
    const result = tail.catch(() => {}).then(action); tail = result; return result;
  } };
}
function fixture(transport = 'native', options = {}) {
  let time = Date.parse('2026-10-05T10:00:00Z');
  const local = new Map([['token', 'legacy-secret'], ['private-planning:v1:outbox:1', 'draft']]);
  const calls = [], writes = [];
  let saved = options.saved ?? null;
  let handler = () => json({});
  let serverSession;
  const data = (id = 'A', owner = 1, extra = {}) => ({ user: { id: owner }, session_id: id,
    expires_at: new Date(time + 15 * 60000).toISOString(), session_expires_at: new Date(time + 30 * 86400000).toISOString(), csrf_token: `csrf-${id}`,
    ...(transport === 'native' ? { token: `access-${id}`, refresh_token: `refresh-${id}` } : {}), ...extra });
  const storage = options.storage || {
    get: async () => saved,
    set: async (value, guard) => { assert.equal(guard.isCurrent(), true); saved = value; writes.push(value); },
    remove: async (guard) => { assert.equal(guard.isCurrent(), true); saved = null; writes.push(null); },
  };
  const runtime = createSessionRuntime({ transport, now: () => time, storage, lockManager: locks(), readCsrfToken: () => 'csrf-A',
    changeStorage: { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key) },
    fetchImpl: async (input, init) => {
      const call = { url: typeof input === 'string' ? input : input.url, ...init,
        headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      const response = await handler(call);
      if (transport === 'browser' && response.ok && /\/(me|login|register|refresh)$/.test(call.url)) {
        const value = await response.clone().json();
        if (call.url.endsWith('/me') && !value.user && serverSession) return json(serverSession);
        if (!call.url.endsWith('/me')) serverSession = value;
      }
      return response;
    }, ...options,
  });
  return { runtime, data, calls, writes, local, saved: () => saved, advance: (ms) => { time += ms; },
    handle: (next) => { handler = next; }, login: async () => {
      handler = () => json(data()); return runtime.login({ email: 'a@example.test', password: 'synthetic' });
    } };
}

test('public marker and encrypted refresh-only persistence; no legacy import', async () => {
  const f = fixture();
  assert.equal(await f.runtime.init(), null);
  assert.equal(f.calls.length, 0);
  assert.equal(f.local.get('token'), 'legacy-secret');
  const session = await f.login();
  assert.equal(session.token, 'session:A');
  assert.equal(session.csrf_token, undefined);
  assert.equal(session.refresh_token, undefined);
  assert.equal(f.saved().refresh_token, 'refresh-A');
  assert.equal(f.saved().token, undefined);
  assert.equal(f.saved().csrf_token, undefined);
  assert.equal(f.local.has('token'), false);
  assert.ok(f.local.has(SESSION_CHANGE_KEY));
  assert.equal(f.local.get('private-planning:v1:outbox:1'), 'draft');
  assert.equal(f.calls[0].headers.get('X-Cookbook-Client'), 'native');
  assert.equal(f.calls[0].headers.get('Authorization'), null);
  assert.equal(f.calls[0].body.transport, 'native');
});

test('browser replaces marker with cookie + CSRF, overrides planning omit, no bearer storage', async () => {
  const f = fixture('browser');
  await f.login();
  f.handle(() => json({ ok: true }));
  await f.runtime.fetch('/api/private-planning', { method: 'POST', credentials: 'omit', body: '{}',
    headers: { Authorization: 'Bearer session:A', 'X-CSRF-TOKEN': 'stale', 'X-Cookbook-Client': 'native' } });
  const sent = f.calls.at(-1);
  assert.equal(sent.headers.get('Authorization'), null);
  assert.equal(sent.headers.get('X-CSRF-TOKEN'), 'csrf-A');
  assert.equal(sent.headers.get('X-Cookbook-Client'), null);
  assert.equal(sent.credentials, 'same-origin');
  assert.equal(f.writes.length, 0);
  assert.ok(!JSON.stringify([...f.local]).includes('csrf-A'));
});

test('native fetch substitutes real bearer, including Request input header overrides', async () => {
  const f = fixture(); await f.login();
  f.handle(() => json({ ok: true }));
  await f.runtime.fetch(new Request('https://localhost/api/private-planning', {
    method: 'POST', body: '{}', headers: { Authorization: 'Bearer session:A' },
  }));
  assert.equal(f.calls.at(-1).headers.get('Authorization'), 'Bearer access-A');
  assert.equal(f.calls.at(-1).credentials, 'omit');
  await assert.rejects(f.runtime.fetch('https://other.test/api/data', { headers: { Authorization: 'Bearer session:A' } }), { code: 'invalid_api_origin' });
});

test('single flight boot and near-access-expiry refresh, stable marker despite 30-day family metadata', async () => {
  const f = fixture('native', { saved: { refresh_token: 'saved-refresh' } });
  const gate = deferred(); f.handle(() => gate.promise);
  const first = f.runtime.init(), second = f.runtime.init(), third = f.runtime.refresh();
  assert.equal(first, second); assert.equal(first, third);
  await tick(); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].body.refresh_token, 'saved-refresh');
  gate.resolve(json(f.data())); await first;
  f.advance(14 * 60000 + 1);
  const refreshGate = deferred();
  f.handle((request) => request.url.endsWith('/refresh') ? refreshGate.promise : json({ ok: true }));
  const reads = Array.from({ length: 8 }, () => f.runtime.fetch('/api/data', { headers: { Authorization: 'Bearer session:A' } }));
  await tick(); assert.equal(f.calls.filter((r) => r.url.endsWith('/refresh')).length, 2);
  refreshGate.resolve(json(f.data('A', 1, { token: 'access-new', refresh_token: 'refresh-new' })));
  await Promise.all(reads);
  assert.equal(f.runtime.getSession().token, 'session:A');
  assert.ok(f.calls.filter((r) => r.url.endsWith('/data')).every((r) => r.headers.get('Authorization') === 'Bearer access-new'));
});

test('browser bootstrap recovers expired access using CSRF cookie, no change-event echo', async () => {
  const f = fixture('browser', { readCsrfToken: () => 'cookie-csrf' });
  f.handle((r) => r.url.endsWith('/me') ? json({}, 401) : json(f.data()));
  assert.equal((await f.runtime.init()).token, 'session:A');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].headers.get('X-CSRF-TOKEN'), 'cookie-csrf');
  assert.deepEqual(f.calls[1].body, { transport: 'browser' });
  assert.equal(f.local.has(SESSION_CHANGE_KEY), false);
});

test('browser bootstrap rejected refresh is never replayed', async () => {
  const f = fixture('browser', { readCsrfToken: () => 'csrf-A' });
  f.handle((r) => r.url.endsWith('/me') ? json(f.data('A', 1, { expires_at: '2026-10-05T10:00:01Z' })) : json({}, 401));
  assert.equal(await f.runtime.init(), null);
  assert.equal(f.calls.length, 2);
  assert.equal(f.local.get('token'), 'legacy-secret');
});

for (const failure of [401, 503, 'network']) test(`no dispatched write replay after ${failure}`, async () => {
  const f = fixture(); await f.login();
  f.handle(() => { if (failure === 'network') throw Error('offline'); return json({}, failure); });
  const request = f.runtime.fetch('/api/private-planning', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer session:A' } });
  if (failure === 'network') await assert.rejects(request); else assert.equal((await request).status, failure);
  assert.equal(f.calls.length, 2);
  assert.equal(f.runtime.getSession().token, 'session:A');
});

test('503 bootstrap and refresh failures block API work, preserve owner and retry explicitly', async () => {
  const f = fixture('native', { saved: { refresh_token: 'saved' } });
  f.handle(() => json({}, 503));
  await assert.rejects(f.runtime.init(), { status: 503 });
  await assert.rejects(f.runtime.fetch('/api/data'), { status: 503 });
  assert.equal(f.calls.length, 1);
  assert.equal(f.local.get('token'), 'legacy-secret');
  f.handle(() => json(f.data())); await f.runtime.init();
  f.advance(14 * 60000 + 1); f.handle(() => json({}, 503));
  await assert.rejects(f.runtime.fetch('/api/data'), { status: 503 });
  assert.equal(f.runtime.getSession().token, 'session:A');
  const count = f.calls.length;
  await assert.rejects(f.runtime.fetch('/api/data'), { status: 503 });
  assert.equal(f.calls.length, count);
});

test('logout aborts old reads and late refresh cannot write credentials or resurrect owner', async () => {
  const f = fixture(); await f.login();
  const refresh = deferred();
  f.handle((r) => r.url.endsWith('/refresh') ? refresh.promise : json({ ok: true }));
  const pending = f.runtime.refresh();
  const rejected = assert.rejects(pending, { code: 'stale_session' });
  assert.deepEqual(await f.runtime.logout(), { ok: true, revoked: true });
  await rejected;
  refresh.resolve(json(f.data('A', 1, { refresh_token: 'obsolete' })));
  await tick();
  assert.equal(f.runtime.getSession(), null);
  assert.equal(f.saved(), null);
  assert.ok(!f.writes.some((value) => value?.refresh_token === 'obsolete'));
  const logout = f.calls.find((r) => r.url.endsWith('/logout'));
  assert.deepEqual(logout.body, { transport: 'native', refresh_token: 'refresh-A' });
  assert.equal(logout.headers.get('Authorization'), null);
});

test('account switch aborts obsolete operations even when transport ignores abort', async () => {
  const f = fixture(); await f.login();
  const old = deferred();
  f.handle((r) => r.url.endsWith('/data') ? old.promise : json(f.data('B', 2)));
  const read = f.runtime.fetch('/api/data', { headers: { Authorization: 'Bearer session:A' } });
  const rejected = assert.rejects(read, { code: 'stale_session' });
  await tick();
  await f.runtime.login({ email: 'b@example.test', password: 'synthetic' });
  await rejected;
  old.resolve(json({ private: 'A' })); await tick();
  assert.equal(f.runtime.getSession().token, 'session:B');
  await assert.rejects(f.runtime.fetch('/api/write', { method: 'POST', headers: { Authorization: 'Bearer session:A' } }), { code: 'stale_session' });
  assert.ok(!f.calls.some((r) => r.url.endsWith('/write')));
});

test('serialized persistence guards a write already queued during logout', async () => {
  const gate = deferred(); let delay = false, saved;
  const storage = { get: async () => saved ?? null,
    set: async (value, { isCurrent }) => { if (delay) { await gate.promise; assert.equal(isCurrent(), false); } saved = value; },
    remove: async () => { saved = null; } };
  const f = fixture('native', { storage }); await f.login();
  delay = true; f.handle((r) => r.url.endsWith('/refresh') ? json(f.data('A', 1, { refresh_token: 'rotated' })) : json({ ok: true }));
  const pending = f.runtime.refresh(); const rejected = assert.rejects(pending, { code: 'stale_session' });
  await tick(); const logout = f.runtime.logout(); await tick();
  gate.resolve(); await rejected; await logout;
  assert.equal(saved, null);
  assert.equal(f.runtime.getSession(), null);
});

test('storage failure after rotation retains newest token for persistence-only retry', async () => {
  let broken = false, saved;
  const storage = { get: async () => saved ?? null, set: async (value) => { if (broken) throw Error('locked'); saved = value; }, remove: async () => {} };
  const f = fixture('native', { storage }); await f.login();
  broken = true; f.handle(() => json(f.data('A', 1, { refresh_token: 'latest' })));
  await assert.rejects(f.runtime.refresh(), { code: 'storage' });
  const count = f.calls.length;
  broken = false; await f.runtime.init();
  assert.equal(saved.refresh_token, 'latest');
  assert.equal(f.calls.length, count);
});

test('logout failures keep credentials and never claim revocation', async () => {
  const f = fixture(); await f.login();
  f.handle(() => json({}, 503));
  await assert.rejects(f.runtime.logout(), { status: 503 });
  assert.equal(f.runtime.getSession().token, 'session:A');
  assert.equal(f.saved().refresh_token, 'refresh-A');
  f.handle(() => json({ ok: true }));
  assert.equal((await f.runtime.logout()).revoked, true);
});

test('native logout from an obsolete UI cannot revoke a replacement vault account', async () => {
  const f = fixture('native', { saved: { session_id: 'B', refresh_token: 'refresh-B' } });
  await assert.rejects(f.runtime.logout({ expectedSession: 'session:A' }), { code: 'session_changed' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.saved().refresh_token, 'refresh-B');
});

test('unconfirmed logout success body cannot clear credentials or report revocation', async () => {
  const f = fixture(); await f.login(); f.handle(() => json({ ok: false }));
  await assert.rejects(f.runtime.logout(), { code: 'invalid_response' });
  assert.equal(f.runtime.getSession().token, 'session:A');
  assert.equal(f.saved().refresh_token, 'refresh-A');
});

test('different-owner refresh response fails closed before persistent writes', async () => {
  const f = fixture(); await f.login();
  f.handle(() => json(f.data('B', 2)));
  await assert.rejects(f.runtime.refresh(), { code: 'session_changed' });
  assert.equal(f.saved().session_id, 'A');
});

test('caller abort during shared renewal does not cancel renewal for another caller', async () => {
  const f = fixture(); await f.login(); f.advance(15 * 60000);
  const gate = deferred(), caller = new AbortController();
  f.handle((r) => r.url.endsWith('/refresh') ? gate.promise : json({ ok: true }));
  const one = f.runtime.fetch('/api/data', { signal: caller.signal });
  const rejected = assert.rejects(one);
  const two = f.runtime.fetch('/api/data');
  caller.abort(); gate.resolve(json(f.data()));
  await rejected; await two;
  assert.equal(f.calls.filter((r) => r.url.endsWith('/data')).length, 1);
});

test('backend access deadline controls renewal even when shorter than fifteen minutes', async () => {
  const f = fixture('browser');
  f.handle(() => json(f.data('A', 1, { expires_at: '2026-10-05T10:02:00Z' })));
  await f.runtime.login({});
  f.advance(61000);
  f.handle((r) => r.url.endsWith('/refresh') ? json(f.data()) : json({ ok: true }));
  await f.runtime.fetch('/api/data');
  assert.equal(f.calls.filter((r) => r.url.endsWith('/refresh')).length, 1);
});

test('guest recovery bypasses blocked bootstrap and reset requires later revalidation', async () => {
  const f = fixture('browser', { readCsrfToken: () => null });
  f.handle(() => json({}, 503));
  await assert.rejects(f.runtime.init(), { status: 503 });
  f.handle(() => json({ ok: true }));
  for (const path of ['forgot-password', 'verification/confirm', 'reset-password']) {
    await f.runtime.fetch(`/api/auth/session/${path}`, { method: 'POST', body: '{}', headers: { Authorization: 'Bearer legacy-secret' } });
    assert.equal(f.calls.at(-1).headers.get('Authorization'), null);
  }
  assert.equal(f.calls.length, 4);
  f.handle(() => json({}, 401));
  assert.equal(await f.runtime.init(), null);
});

test('browser coordination unavailable fails visibly before HTTP or local credential cleanup', async () => {
  const f = fixture('browser', { lockManager: null });
  await assert.rejects(f.runtime.init(), { code: 'session_coordination_unavailable' });
  await assert.rejects(f.runtime.login({}), { code: 'session_coordination_unavailable' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.local.get('token'), 'legacy-secret');
});

test('two browser runtimes serialize rotation and reread cookie identity inside their shared lock', async () => {
  let time = Date.parse('2026-10-05T10:00:00Z'), cookieSession;
  let rotations = 0;
  const lockManager = locks(), calls = [];
  const metadata = (sid = 'A') => ({ user: { id: sid === 'A' ? 1 : 2 }, session_id: sid,
    expires_at: new Date(time + 15 * 60000).toISOString(), csrf_token: `csrf-${sid}` });
  cookieSession = metadata();
  const fetchImpl = async (input, init) => {
    const path = new URL(input, 'https://localhost').pathname;
    calls.push({ path, headers: init.headers });
    if (path.endsWith('/me')) return json(cookieSession);
    if (path.endsWith('/refresh')) { rotations++; cookieSession = metadata(); return json(cookieSession); }
    if (path.endsWith('/login')) { cookieSession = metadata('B'); return json(cookieSession); }
    if (path.endsWith('/logout')) return json({ ok: true });
    // Simulate the server SID precondition independently of storage events.
    return init.headers.get('X-Cookbook-Session') === cookieSession.session_id ? json({ ok: true }) : json({ code: 'session_changed' }, 401);
  };
  const options = { transport: 'browser', now: () => time, lockManager, fetchImpl, changeStorage: null, readCsrfToken: () => cookieSession.csrf_token };
  const a = createSessionRuntime(options), b = createSessionRuntime(options);
  await Promise.all([a.init(), b.init()]);
  time += 14 * 60000 + 1;
  await Promise.all([a.fetch('/api/data'), b.fetch('/api/data')]);
  assert.equal(rotations, 1, 'the second tab sees the renewed deadline instead of rotating again');
  await b.login({ email: 'b@example.test', password: 'synthetic' });
  const oldResponse = await a.fetch('/api/personal');
  assert.equal(oldResponse.status, 401, 'cookie B cannot satisfy UI owner A');
  assert.equal(calls.at(-1).headers.get('X-Cookbook-Session'), 'A');
  const before = calls.filter((r) => r.path.endsWith('/logout')).length;
  await assert.rejects(a.logout(), { code: 'session_changed' });
  assert.equal(calls.filter((r) => r.path.endsWith('/logout')).length, before);
  a.dispose(); b.dispose();
});

test('browser lock waits for obsolete Set-Cookie transport before allowing replacement login', async () => {
  const lockManager = locks(), gate = deferred();
  let cookie = { user: { id: 1 }, session_id: 'A', expires_at: '2026-10-05T10:00:01Z', csrf_token: 'csrf-A' };
  let refreshStarted = false, replacementStarted = false;
  const options = { transport: 'browser', now: () => Date.parse('2026-10-05T10:00:00Z'), lockManager,
    changeStorage: null, readCsrfToken: () => cookie.csrf_token,
    fetchImpl: async (url) => {
      if (url.endsWith('/me')) return json(cookie);
      if (url.endsWith('/refresh')) { refreshStarted = true; await gate.promise; cookie = { ...cookie, expires_at: '2026-10-05T10:15:00Z' }; return json(cookie); }
      replacementStarted = true;
      cookie = { user: { id: 2 }, session_id: 'B', expires_at: '2026-10-05T10:15:00Z', csrf_token: 'csrf-B' };
      return json(cookie);
    } };
  const a = createSessionRuntime(options), b = createSessionRuntime(options);
  const old = a.init(); const rejected = assert.rejects(old, { code: 'stale_session' });
  await tick(); assert.equal(refreshStarted, true);
  a.invalidate();
  const login = b.login({});
  await tick(); assert.equal(replacementStarted, false);
  gate.resolve(); await rejected; await login;
  assert.equal(cookie.session_id, 'B');
  assert.equal(b.getSession().token, 'session:B');
  a.dispose(); b.dispose();
});

test('confirmed logout with failed local cleanup retries storage without replaying revoked credential', async () => {
  let saved, broken = false;
  const storage = { get: async () => saved ?? null, set: async (value) => { saved = value; },
    remove: async () => { if (broken) throw Error('locked'); saved = null; } };
  const f = fixture('native', { storage }); await f.login();
  f.handle(() => json({ ok: true })); broken = true;
  await assert.rejects(f.runtime.logout(), { code: 'storage' });
  const count = f.calls.length;
  broken = false;
  assert.equal((await f.runtime.logout()).revoked, true);
  assert.equal(f.calls.length, count);
  assert.equal(saved, null);
});

test('explicit guest logout removes legacy value without falsely reporting server revocation', async () => {
  const f = fixture();
  assert.deepEqual(await f.runtime.logout(), { ok: true, revoked: false });
  assert.equal(f.local.has('token'), false);
  assert.equal(f.calls.length, 0);
});

for (const cleanupFailure of [false, true]) test(`browser proof A cannot authorize logout B before a storage event (cleanup failed: ${cleanupFailure})`, async () => {
  let broken = false;
  const f = fixture('browser', { changeStorage: { removeItem() {}, setItem() { if (broken) throw Error('blocked'); } } });
  await f.login();
  f.handle((r) => r.url.endsWith('/me') ? json(f.data()) : json({ ok: true }));
  broken = cleanupFailure;
  if (broken) await assert.rejects(f.runtime.logout({ expectedSession: 'session:A' }), { code: 'storage' });
  else await f.runtime.logout({ expectedSession: 'session:A' });
  broken = false;
  f.handle((r) => r.url.endsWith('/me') ? json(f.data('B', 2)) : json({ ok: true }));
  await f.runtime.init({ force: true });
  assert.equal(f.runtime.getSession().token, 'session:B');
  const before = f.calls.filter((r) => r.url.endsWith('/logout')).length;
  assert.equal((await f.runtime.logout({ expectedSession: 'session:B' })).revoked, true);
  const requests = f.calls.filter((r) => r.url.endsWith('/logout'));
  assert.equal(requests.length, before + 1);
  assert.equal(requests.at(-1).headers.get('X-Cookbook-Session'), 'B');
});

test('native cleanup proof never deletes a replacement vault session', async () => {
  let saved, broken = false;
  const f = fixture('native', { storage: { get: async () => saved ?? null, set: async (value) => { saved = value; },
    remove: async () => { if (broken) throw Error('locked'); saved = null; } } });
  await f.login(); broken = true; f.handle(() => json({ ok: true }));
  await assert.rejects(f.runtime.logout(), { code: 'storage' });
  saved = { session_id: 'B', user_id: 2, refresh_token: 'refresh-B' }; broken = false;
  const before = f.calls.length;
  await assert.rejects(f.runtime.logout({ expectedSession: 'session:A' }), { code: 'session_changed' });
  assert.equal(f.calls.length, before);
  assert.equal(saved.refresh_token, 'refresh-B');
});

test('browser cleanup proof checks actual cookie ownership before reuse', async () => {
  let broken = false;
  const f = fixture('browser', { changeStorage: { removeItem() {}, setItem() { if (broken) throw Error('locked'); } } });
  await f.login(); broken = true;
  f.handle((r) => r.url.endsWith('/me') ? json(f.data()) : json({ ok: true }));
  await assert.rejects(f.runtime.logout(), { code: 'storage' });
  broken = false; f.handle(() => json(f.data('B', 2)));
  const before = f.calls.filter((r) => r.url.endsWith('/logout')).length;
  await assert.rejects(f.runtime.logout({ expectedSession: 'session:A' }), { code: 'session_changed' });
  assert.equal(f.calls.filter((r) => r.url.endsWith('/logout')).length, before);
});

test('CSRF-only browser identity cannot reuse proof without another server fence check', async () => {
  let broken = false;
  const f = fixture('browser', { changeStorage: { removeItem() {}, setItem() { if (broken) throw Error('locked'); } } });
  await f.login(); broken = true;
  f.handle((r) => r.url.endsWith('/me') ? json(f.data()) : json({ ok: true }));
  await assert.rejects(f.runtime.logout(), { code: 'storage' });
  broken = false;
  f.handle(() => json({ code: 'invalid_session' }, 401));
  const before = f.calls.filter((r) => r.url.endsWith('/logout')).length;
  await assert.rejects(f.runtime.logout({ expectedSession: 'session:A' }), { status: 401 });
  assert.equal(f.calls.filter((r) => r.url.endsWith('/logout')).length, before + 1);
  assert.equal(f.calls.at(-1).headers.get('X-Cookbook-Session'), 'A');
  assert.equal(f.runtime.getSession().token, 'session:A');
});

for (const transport of ['browser', 'native']) {
  test(`${transport}: known revoked or expired credentials logout without renewal`, async () => {
    const f = fixture(transport); await f.login(); f.advance(15 * 60000);
    f.handle((r) => r.url.endsWith('/logout') ? json({ ok: true }) : json({ code: 'invalid_session' }, 401));
    assert.deepEqual(await f.runtime.logout({ expectedSession: 'session:A' }), { ok: true, revoked: true });
    assert.equal(f.calls.some((r) => r.url.endsWith('/refresh')), false);
    assert.equal(f.calls.at(-1).headers.get('X-Cookbook-Session'), 'A');
    assert.equal(f.runtime.getSession(), null);
  });
  for (const rejection of ['refresh', 'logout-all']) test(`${transport}: ${rejection} 401 falls back only to same-SID current logout`, async () => {
    const f = fixture(transport); await f.login();
    if (rejection === 'refresh') f.advance(15 * 60000);
    f.handle((r) => r.url.endsWith(`/${rejection}`) ? json({ code: 'invalid_session' }, 401)
      : r.url.endsWith('/me') ? json(f.data('A', 1, { expires_at: rejection === 'refresh' ? '2026-10-05T10:00:01Z' : f.data().expires_at }))
        : json({ ok: true }));
    assert.deepEqual(await f.runtime.logout({ all: true, expectedSession: 'session:A' }),
      { ok: true, revoked: true, allRevoked: false });
    assert.equal(f.calls.at(-1).url.endsWith('/logout'), true);
    assert.equal(f.calls.at(-1).headers.get('X-Cookbook-Session'), 'A');
    assert.equal(f.calls.at(-1).headers.get('X-CSRF-TOKEN'), transport === 'browser' ? 'csrf-A' : null);
    if (transport === 'native') assert.equal(f.calls.at(-1).body.refresh_token, 'refresh-A');
    assert.equal(f.runtime.getSession(), null);
  });
  for (const status of [401, 503]) test(`${transport}: fallback rejection ${status} preserves credentials without proof`, async () => {
    const f = fixture(transport); await f.login();
    f.handle((r) => r.url.endsWith('/me') ? json(f.data())
      : json({ code: 'invalid_session' }, r.url.endsWith('/logout-all') ? 401 : status));
    await assert.rejects(f.runtime.logout({ all: true, expectedSession: 'session:A' }), { status });
    assert.equal(f.runtime.getSession().token, 'session:A');
    if (transport === 'native') assert.equal(f.saved().refresh_token, 'refresh-A');
    const before = f.calls.filter((r) => r.url.endsWith('/logout')).length;
    f.handle((r) => r.url.endsWith('/me') ? json(f.data()) : json({ ok: true }));
    await f.runtime.logout({ expectedSession: 'session:A' });
    assert.equal(f.calls.filter((r) => r.url.endsWith('/logout')).length, before + 1);
  });
  test(`${transport}: logout-all outage never falls back to a narrower sign-out`, async () => {
    const f = fixture(transport); await f.login();
    f.handle((r) => r.url.endsWith('/me') ? json(f.data()) : json({}, 503));
    await assert.rejects(f.runtime.logout({ all: true }), { status: 503 });
    assert.equal(f.calls.some((r) => r.url.endsWith('/logout')), false);
    assert.equal(f.runtime.getSession().token, 'session:A');
  });
}

test('queued browser lock times out, aborts its request, and never steals the active lock', { timeout: 1000 }, async () => {
  const manager = locks(), held = deferred();
  let active = true, options;
  const holder = manager.request('held', {}, async () => { await held.promise; active = false; });
  const f = fixture('browser', { lockTimeoutMs: 10, lockManager: {
    request: (name, opts, action) => { options = opts; return manager.request(name, opts, action); },
  } });
  const events = []; f.runtime.subscribe((event) => events.push(event));
  await assert.rejects(f.runtime.init(), { code: 'session_coordination_timeout' });
  assert.equal(options.signal.aborted, true);
  assert.equal(options.steal, undefined);
  assert.equal(active, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.local.get('token'), 'legacy-secret');
  assert.equal(events.at(-1).type, 'blocked');
  // This fake manager deliberately ignores abort: even a late grant is fenced.
  held.resolve(); await holder; await tick();
  assert.equal(f.calls.length, 0);
  f.handle(() => json(f.data()));
  assert.equal((await f.runtime.init({ force: true })).token, 'session:A');
});

test('fencing aborts pending lock acquisition immediately without waiting for its timeout', { timeout: 1000 }, async () => {
  let options;
  const f = fixture('browser', { lockManager: { request: (_name, opts) => { options = opts; return new Promise(() => {}); } } });
  const pending = f.runtime.init();
  const rejected = assert.rejects(pending, { code: 'stale_session' });
  f.runtime.invalidate(); await rejected;
  assert.equal(options.signal.aborted, true);
  assert.equal(f.calls.length, 0);
});

test('acquisition deadline stops on grant and does not release an active cookie operation', async () => {
  const gate = deferred();
  const f = fixture('browser', { lockTimeoutMs: 5 });
  f.handle(() => gate.promise);
  const pending = f.runtime.init();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].signal.aborted, false);
  gate.resolve(json(f.data()));
  assert.equal((await pending).token, 'session:A');
});

for (const transport of ['browser', 'native']) test(`logout-all renews expired access first (${transport})`, async () => {
  const f = fixture(transport); await f.login(); f.advance(15 * 60000);
  f.handle((r) => r.url.endsWith('/refresh') ? json(f.data()) : json({ ok: true }));
  assert.equal((await f.runtime.logout({ all: true })).revoked, true);
  assert.ok(f.calls.at(-2).url.endsWith('/refresh'));
  assert.ok(f.calls.at(-1).url.endsWith('/logout-all'));
  assert.equal(f.calls.at(-1).headers.get('Authorization'), transport === 'native' ? 'Bearer access-A' : null);
});

for (const transport of ['browser', 'native']) test(`real Axios + Zustand + planning integration (${transport})`, () => {
  const result = spawnSync(process.execPath, ['--experimental-loader', './tests/frontend/extensionlessLoader.mjs',
    './tests/frontend/test_auth_session_integration.mjs', transport], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
