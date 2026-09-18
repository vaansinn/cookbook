// Run: node --test tests/frontend/test_planning_client.mjs
// Pure Node: no browser, application dependencies, services or network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { createPlanningClient } from '../../frontend/src/api/planning.mjs';
import { planningOwnerMarkerKey } from '../../frontend/src/api/planningLifecycle.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plan = (n) => ({ id: id(n), name: `Plan ${n}` });
const payload = () => ({ name: '  Dinner  ', start_date: '2026-09-14', end_date: '2026-09-16' });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const errorCode = (code) => (error) => { assert.equal(error.code, code); return true; };
const rejects = (promise, code) => assert.rejects(promise, errorCode(code));
const throws = (fn, code) => assert.throws(fn, errorCode(code));

// One manager shared across simulated tabs. The callback's returned promise owns
// the lock, as in Web Locks; ifAvailable never queues a competing request.
function mockLocks() {
  const held = new Set();
  const calls = [];
  return { held, calls,
    async request(name, options, callback) {
      calls.push({ name, options });
      assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { held.delete(name); }
    },
  };
}

function fixture() {
  let identity = { accountId: 'A', token: 'token-A' };
  const values = new Map();
  const faults = {};
  const storage = {
    getItem(key) { if (faults.get) throw Error('unavailable'); return values.get(key) ?? null; },
    setItem(key, value) {
      if (faults.set) throw Error('quota');
      if (!faults.dropSet) values.set(key, value);
      faults.afterSet?.();
    },
    removeItem(key) { if (faults.remove) throw Error('unavailable'); values.delete(key); },
  };
  const calls = [];
  const locks = mockLocks();
  const fetchImpl = (url, options) => {
    const pending = deferred();
    calls.push({ url, options, ...pending });
    // Deliberately ignore abort: the adapter must fence even an uncancellable
    // transport or a response already delivered to response.json().
    return pending.promise;
  };
  const make = (options = {}) => createPlanningClient({ fetchImpl, storage, lockManager: locks, getSession: () => identity, ...options });
  const client = make();
  return { client, make, calls, values, faults, storage, locks,
    setSession(value, notify = true) { identity = value; if (notify) client.sessionChanged(); },
    finish(index, data, status) { calls[index].resolve(response(data, status)); },
    key(account = 'A') { return `private-planning:v1:outbox:${encodeURIComponent(account)}`; },
  };
}

test('fixed same-origin read routes; explicit auth and no redirects/cache/cookies', async () => {
  const f = fixture();
  const read = f.client.read('/workspace');
  assert.equal(f.calls[0].url, '/api/planning/v1/workspace');
  assert.deepEqual(f.calls[0].options.headers, { Accept: 'application/json', Authorization: 'Bearer token-A' });
  assert.equal(f.calls[0].options.redirect, 'error');
  assert.equal(f.calls[0].options.cache, 'no-store');
  assert.equal(f.calls[0].options.credentials, 'omit');
  f.finish(0, { workspace: null, revision: 0 });
  assert.deepEqual(await read, { workspace: null, revision: 0 });
  for (const path of ['https://evil.test/plans', '//evil.test/plans', '/api/planning/v1/plans',
    '/commands', '/plans/../workspace', '/plans%2f..', '/plans#x', '/plans?x=1',
    '/workspace?limit=1', '/plans?limit=1&limit=2', '/plans?limit=101', '/plans?limit=0',
    '/plans?limit=01', '/plans?cursor=https://evil.test', '/plans?%6cimit=2', '/plans?limit=2&',
    '/plans?limit=1=2', '/plans\\workspace', '/plans?cursor=undefined']) {
    await rejects(f.client.read(path), 'invalid_path');
  }
  assert.equal(f.calls.length, 1);
});

test('abort on account switch; late success and failure never cross accounts', async () => {
  for (const failure of [false, true]) {
    const f = fixture();
    const old = f.client.read('/workspace');
    const checked = rejects(old, 'stale_session');
    f.setSession({ accountId: 'B', token: 'token-B' });
    assert.equal(f.calls[0].options.signal.aborted, true);
    const current = f.client.read('/workspace');
    if (failure) f.calls[0].reject(Error('old private network error'));
    else f.finish(0, { workspace: { private: 'A' }, revision: 1 });
    await checked;
    f.finish(1, { workspace: { owner: 'B' }, revision: 5 });
    assert.equal((await current).workspace.owner, 'B');
  }
});

test('same-account token, epoch, request generation and transient sessions fence reads', async () => {
  for (const replacement of [
    { accountId: 'A', token: 'token-new' },
    { accountId: 'A', token: 'token-A', epoch: 1 },
    { accountId: 'A', token: 'token-A', requestGeneration: 1 },
  ]) {
    const f = fixture();
    const read = f.client.read('/workspace');
    // Completion polling must work even without an immediate notification.
    f.setSession(replacement, false);
    f.finish(0, { error: 'expired' }, 401);
    await rejects(read, 'stale_session');
  }
  const f = fixture();
  const read = f.client.read('/workspace');
  f.setSession(null);
  f.setSession({ accountId: 'A', token: 'token-A' });
  f.finish(0, { revision: 1 });
  await rejects(read, 'stale_session');
});

test('auth change during asynchronous JSON parsing fences success and parse failure', async () => {
  for (const failure of [false, true]) {
    const f = fixture();
    const json = deferred();
    const started = deferred();
    const read = f.client.read('/workspace');
    f.calls[0].resolve({ ok: true, status: 200, json() { started.resolve(); return json.promise; } });
    await started.promise;
    f.setSession({ accountId: 'B', token: 'token-B' });
    if (failure) json.reject(Error('private parse failure'));
    else json.resolve({ revision: 1, private: 'A' });
    await rejects(read, 'stale_session');
  }
});

test('new same-resource request supersedes old success and error without blocking other resources', async () => {
  for (const failure of [false, true]) {
    const f = fixture();
    const old = f.client.read('/plans');
    const other = f.client.read('/workspace');
    const latest = f.client.read('/plans?limit=2');
    assert.equal(f.calls[0].options.signal.aborted, true);
    assert.equal(f.calls[1].options.signal.aborted, false);
    if (failure) f.finish(0, { error: 'old 401' }, 401);
    else f.finish(0, { plans: [plan(1)], revision: 1 });
    await rejects(old, 'superseded');
    f.finish(1, { revision: 2 });
    f.finish(2, { plans: [], revision: 2 });
    assert.equal((await latest).revision, 2);
    assert.equal((await other).revision, 2);
  }
});

test('exact persisted body survives response loss, dispose/refresh and token replacement', async () => {
  const f = fixture();
  const input = payload();
  const command = f.client.command('plan.create', input, 7);
  input.name = 'caller mutated it';
  const body = f.calls[0].options.body;
  assert.equal(JSON.parse(body).payload.name, '  Dinner  ');
  assert.equal(f.client.pending().body, body);
  assert.equal(f.values.get(f.key()).includes('token-A'), false);
  f.calls[0].reject(Error('server committed; response lost'));
  await rejects(command, 'network_error');
  assert.equal(f.calls.length, 1);
  await rejects(f.client.command('plan.create', payload(), 8), 'pending_exists');
  await rejects(f.client.discardRejected(), 'pending_unresolved');
  const copy = f.client.pending();
  copy.body = 'edited copy';
  assert.equal(f.client.pending().body, body);
  f.client.dispose();
  f.setSession({ accountId: 'A', token: 'token-refreshed' }, false);
  const refreshed = f.make();
  const retried = refreshed.retry();
  assert.equal(f.calls[1].options.body, body);
  assert.equal(f.calls[1].options.headers.Authorization, 'Bearer token-refreshed');
  f.finish(1, { plan: plan(1), revision: 8 }, 201);
  assert.deepEqual(await retried, { result: { plan: plan(1), revision: 8 }, requiresReload: true });
  assert.equal(refreshed.pending(), null);
});

test('one pending write, no automatic retry on network, HTTP 503 or invalid success JSON', async () => {
  for (const kind of ['network', '503', 'json', 'shape']) {
    const f = fixture();
    const command = f.client.command('plan.create', payload(), 0);
    const body = f.calls[0].options.body;
    await rejects(f.client.retry(), 'write_in_flight');
    await rejects(f.client.command('plan.create', payload(), 0), 'write_in_flight');
    if (kind === 'network') f.calls[0].reject(Error('offline'));
    if (kind === '503') f.finish(0, { error: 'unavailable' }, 503);
    if (kind === 'json') f.calls[0].resolve({ ok: true, status: 201, json: async () => { throw Error('truncated'); } });
    if (kind === 'shape') f.finish(0, { revision: '1' }, 201);
    await rejects(command, kind === 'network' ? 'network_error' : kind === '503' ? 'http_error' : 'invalid_response');
    assert.equal(f.client.pending().body, body);
    assert.equal(f.client.pending().state, 'pending');
    assert.equal(f.calls.length, 1);
  }
});

test('account-local pending writes never migrate to guest or another owner; late command results are fenced', async () => {
  for (const status of [201, 409, 401, 503]) {
    const f = fixture();
    const old = f.client.command('plan.create', payload(), 0);
    const oldRaw = f.values.get(f.key());
    f.setSession(null);
    assert.equal(f.client.pending(), null);
    await rejects(f.client.retry(), 'unauthenticated');
    await rejects(f.client.command('plan.create', payload(), 0), 'unauthenticated');
    f.setSession({ accountId: 'B', token: 'token-B' });
    assert.equal(f.client.pending(), null);
    const next = f.client.command('plan.create', payload(), 0);
    f.finish(0, { revision: 1, error: 'revision_conflict' }, status);
    await rejects(old, 'stale_session');
    assert.equal(f.values.get(f.key()), oldRaw);
    assert.equal(f.client.pending().accountId, 'B');
    f.finish(1, { revision: 1, plan: plan(2) }, 201);
    assert.equal((await next).requiresReload, true);
    f.setSession({ accountId: 'A', token: 'token-A-new' });
    assert.equal(f.client.pending().body, JSON.parse(oldRaw).body);
  }
});

test('same-account token refresh fences writes without rewriting or clearing pending', async () => {
  const f = fixture();
  const old = f.client.command('plan.create', payload(), 0);
  const raw = f.values.get(f.key());
  f.setSession({ accountId: 'A', token: 'new-token' });
  f.finish(0, { error: 'revision_conflict', current_revision: 10 }, 409);
  await rejects(old, 'stale_session');
  assert.equal(f.values.get(f.key()), raw);
  const retry = f.client.retry();
  assert.equal(f.calls[1].options.body, JSON.parse(raw).body);
  f.finish(1, { revision: 1 }, 201);
  await retry;
});

test('logout during outbox persistence prevents the old write from being sent', async () => {
  const f = fixture();
  f.faults.afterSet = () => f.setSession(null);
  await rejects(f.client.command('plan.create', payload(), 0), 'stale_session');
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse(f.values.get(f.key())).state, 'pending');
});

test('409 variants persist review; retry cannot update revision or send until explicit discard', async () => {
  for (const reason of ['revision_conflict', 'mutation_conflict', 'limit_reached']) {
    const f = fixture();
    const first = f.client.command('plan.create', payload(), 3);
    const original = JSON.parse(f.calls[0].options.body);
    f.finish(0, { error: reason, current_revision: 15 }, 409);
    await assert.rejects(first, (error) => {
      assert.equal(error.code, 'review_required');
      assert.equal(error.status, 409);
      assert.equal(error.data.error, reason);
      return true;
    });
    assert.equal(f.client.pending().state, 'rejected');
    assert.equal(JSON.parse(f.client.pending().body).expected_workspace_revision, 3);
    const refreshed = f.make();
    await rejects(refreshed.retry(), 'review_required');
    await rejects(refreshed.command('plan.create', payload(), 15), 'review_required');
    assert.equal(f.calls.length, 1);
    await refreshed.discardRejected();
    const next = refreshed.command('plan.create', payload(), 15);
    const submitted = JSON.parse(f.calls[1].options.body);
    assert.notEqual(submitted.mutation_id, original.mutation_id);
    assert.equal(submitted.expected_workspace_revision, 15);
    f.finish(1, { revision: 16 }, 201);
    await next;
  }
});

test('receipt 404 is not proof of no save; even found receipts do not silently clear pending', async () => {
  const f = fixture();
  const command = f.client.command('plan.create', payload(), 0);
  const body = f.calls[0].options.body;
  f.calls[0].reject(Error('lost'));
  await rejects(command, 'network_error');
  const mutation = JSON.parse(body).mutation_id;
  const missing = f.client.read(`/mutations/${mutation}`);
  f.finish(1, { error: 'not_found' }, 404);
  await rejects(missing, 'http_error');
  assert.equal(f.client.pending().body, body);
  const receipt = f.client.read(`/mutations/${mutation}`);
  f.finish(2, { result: { revision: 1 }, status_code: 201 });
  assert.equal((await receipt).result.revision, 1);
  assert.equal(f.client.pending().body, body);
  const retry = f.client.retry();
  assert.equal(f.calls[3].options.body, body);
  f.finish(3, { revision: 1 }, 201);
  assert.equal((await retry).requiresReload, true);
});

test('storage unavailable, quota errors and silently dropped persistence all block before sending', async () => {
  for (const kind of ['get', 'set', 'dropSet']) {
    const f = fixture();
    f.faults[kind] = true;
    await rejects(f.client.command('plan.create', payload(), 0), 'storage_blocked');
    assert.equal(f.calls.length, 0);
    const read = f.client.read('/workspace');
    f.finish(0, { revision: 0 });
    assert.equal((await read).revision, 0);
  }
  const client = createPlanningClient({ storage: null, lockManager: mockLocks(), fetchImpl: () => assert.fail('must not send'),
    getSession: () => ({ accountId: 'A', token: 'A' }) });
  await rejects(client.command('plan.create', payload(), 0), 'storage_blocked');
});

test('malformed, oversized, wrong-owner or unknown-version outboxes are never overwritten', async () => {
  const seed = fixture();
  const command = seed.client.command('plan.create', payload(), 0);
  seed.calls[0].reject(Error('lost'));
  await rejects(command, 'network_error');
  const valid = JSON.parse(seed.values.get(seed.key()));
  for (const raw of ['{', 'null', '[]', 'x'.repeat(32769),
    JSON.stringify({ ...valid, version: 2 }), JSON.stringify({ ...valid, accountId: 'B' }),
    JSON.stringify({ ...valid, body: '{}' }), JSON.stringify({ ...valid, state: 'sent' }),
    JSON.stringify({ ...valid, status: 409 }), JSON.stringify({ ...valid, extra: true }),
    JSON.stringify({ ...valid, body: valid.body.replace('"payload":', '"operation":"plan.rename","payload":') }),
  ]) {
    const f = fixture();
    f.values.set(f.key(), raw);
    throws(() => f.client.pending(), 'storage_blocked');
    await rejects(f.client.command('plan.create', payload(), 0), 'storage_blocked');
    await rejects(f.client.retry(), 'storage_blocked');
    await rejects(f.client.discardRejected(), 'storage_blocked');
    assert.equal(f.values.get(f.key()), raw);
    assert.equal(f.calls.length, 0);
    f.setSession({ accountId: 'B', token: 'B' });
    assert.equal(f.client.pending(), null);
  }
});

test('failed removal after server success preserves retryable body', async () => {
  const f = fixture();
  const command = f.client.command('plan.create', payload(), 0);
  const body = f.calls[0].options.body;
  f.faults.remove = true;
  f.finish(0, { revision: 1 }, 201);
  await rejects(command, 'storage_blocked');
  assert.equal(f.client.pending().body, body);
  f.faults.remove = false;
  const retry = f.client.retry();
  assert.equal(f.calls[1].options.body, body);
  f.finish(1, { revision: 1 }, 201);
  await retry;
  assert.equal(f.client.pending(), null);
});

test('changed outbox during a response is not removed or overwritten', async () => {
  for (const status of [201, 409]) {
    const f = fixture();
    const command = f.client.command('plan.create', payload(), 0);
    const replacement = JSON.parse(f.values.get(f.key()));
    const body = JSON.parse(replacement.body);
    body.mutation_id = id(123);
    replacement.body = JSON.stringify(body);
    const raw = JSON.stringify(replacement);
    f.values.set(f.key(), raw);
    f.finish(0, { revision: 1 }, status);
    await rejects(command, 'outbox_changed');
    assert.equal(f.values.get(f.key()), raw);
  }
});

test('command boundaries fence earlier reads and reads begun while a command is pending', async () => {
  const f = fixture();
  const oldRead = f.client.read('/workspace');
  const command = f.client.command('plan.create', payload(), 0);
  f.finish(0, { revision: 0 });
  await rejects(oldRead, 'superseded');
  const during = f.client.read('/workspace');
  f.finish(1, { revision: 1 }, 201);
  assert.equal((await command).requiresReload, true);
  f.finish(2, { revision: 0 });
  await rejects(during, 'superseded');
});

test('pagination aggregates one revision with canonical bounded cursor requests', async () => {
  const f = fixture();
  const load = f.client.loadCollection('/plans?limit=1', 'plans');
  f.finish(0, { plans: [plan(1)], revision: 9, next_cursor: id(1) });
  await new Promise(setImmediate);
  assert.equal(f.calls[1].url, `/api/planning/v1/plans?limit=1&cursor=${id(1)}`);
  f.finish(1, { plans: [plan(2)], revision: 9, next_cursor: null });
  assert.deepEqual(await load, { plans: [plan(1), plan(2)], revision: 9, next_cursor: null });
  const meals = f.client.loadCollection(`/plans/${id(1)}/meals`, 'meals');
  f.finish(2, { meals: [], revision: 9, next_cursor: null });
  assert.deepEqual(await meals, { meals: [], revision: 9, next_cursor: null });
});

test('pagination revision mismatch discards full load, with no automatic restart', async () => {
  const f = fixture();
  const load = f.client.loadCollection('/plans', 'plans');
  f.finish(0, { plans: [plan(1)], revision: 1, next_cursor: id(1) });
  await new Promise(setImmediate);
  f.finish(1, { plans: [plan(2)], revision: 2, next_cursor: null });
  await rejects(load, 'revision_changed');
  assert.equal(f.calls.length, 2);
});

test('account switch on a later pagination page aborts the whole snapshot', async () => {
  const f = fixture();
  const load = f.client.loadCollection('/plans', 'plans');
  f.finish(0, { plans: [plan(1)], revision: 1, next_cursor: id(1) });
  await new Promise(setImmediate);
  f.setSession({ accountId: 'B', token: 'B' });
  assert.equal(f.calls[1].options.signal.aborted, true);
  f.finish(1, { plans: [plan(2)], revision: 1, next_cursor: null });
  await rejects(load, 'stale_session');
  assert.equal(f.calls.length, 2);
});

test('pagination rejects malformed pages, external cursors, duplicate IDs and non-progress', async () => {
  for (const [data, code] of [
    [{ plans: [], revision: 0 }, 'invalid_response'],
    [{ plans: [], revision: '0', next_cursor: null }, 'invalid_response'],
    [{ plans: [], revision: 0, next_cursor: 'https://evil.test' }, 'invalid_response'],
    [{ plans: [], revision: 0, next_cursor: id(1) }, 'invalid_pagination'],
    [{ plans: [plan(1)], revision: 0, next_cursor: id(2) }, 'invalid_pagination'],
    [{ plans: [plan(1), plan(1)], revision: 0, next_cursor: null }, 'invalid_pagination'],
    [{ plans: [plan(2), plan(1)], revision: 0, next_cursor: null }, 'invalid_pagination'],
    [{ plans: Array.from({ length: 101 }, (_, n) => plan(n)), revision: 0, next_cursor: null }, 'invalid_response'],
  ]) {
    const f = fixture();
    const load = f.client.loadCollection('/plans', 'plans');
    f.finish(0, data);
    await rejects(load, code);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  const load = f.client.loadCollection('/plans', 'plans');
  f.finish(0, { plans: [plan(1)], revision: 0, next_cursor: id(1) });
  await new Promise(setImmediate);
  f.finish(1, { plans: [plan(1)], revision: 0, next_cursor: id(1) });
  await rejects(load, 'invalid_pagination');
});

test('pagination resource bounds terminate without unbounded requests', async () => {
  for (const key of ['plans', 'meals']) {
    const f = fixture();
    const maxItems = key === 'plans' ? 500 : 2000;
    const path = key === 'plans' ? '/plans' : `/plans/${id(1)}/meals`;
    const load = f.client.loadCollection(path, key);
    const rejected = rejects(load, 'pagination_bound');
    for (let page = 0; page < maxItems / 100; page += 1) {
      const entries = Array.from({ length: 100 }, (_, i) => plan(page * 100 + i + 1));
      f.finish(page, { [key]: entries, revision: 1, next_cursor: entries.at(-1).id });
      await new Promise(setImmediate);
    }
    await rejected;
    assert.equal(f.calls.length, maxItems / 100);
  }
});

test('loadCollection rejects invalid keys, detail routes and partial starting cursors', async () => {
  const f = fixture();
  for (const [path, key] of [['/plans', 'meals'], ['/workspace', 'workspace'],
    [`/plans?cursor=${id(1)}`, 'plans'], [`/plans/${id(1)}`, 'plans'], ['/plans', '__proto__']]) {
    await rejects(f.client.loadCollection(path, key), 'invalid_collection');
  }
  assert.equal(f.calls.length, 0);
});

test('exact null, whitespace and omitted fields survive serialization; lossy payloads are rejected', async () => {
  const f = fixture();
  const command = f.client.command('meal.update', { meal_id: id(1), name: null }, 0);
  const body = JSON.parse(f.calls[0].options.body);
  assert.deepEqual(body.payload, { meal_id: id(1), name: null });
  assert.equal(Object.hasOwn(body.payload, 'time'), false);
  f.finish(0, { revision: 1 }, 200);
  await command;
  for (const value of [{ name: undefined }, { value: NaN }, { value: Infinity },
    { value: 1n }, { value: new Date() }, { value: [undefined] }, { value: Array(2) },
    { get name() { throw Error('must not invoke getter'); } }]) {
    await rejects(f.client.command('plan.create', value, 1), 'invalid_payload');
  }
  const cyclic = {}; cyclic.self = cyclic;
  await rejects(f.client.command('plan.create', cyclic, 1), 'invalid_payload');
  for (const rev of [-1, true, 1.2, 2147483647]) await rejects(f.client.command('plan.create', payload(), rev), 'invalid_command');
  await rejects(f.client.command('workspace.replace', {}, 1), 'invalid_command');
  await rejects(f.client.command('plan.create', { name: 'x'.repeat(17000) }, 1), 'invalid_body');
  assert.equal(f.calls.length, 1);
  assert.equal(f.client.pending(), null);
});

test('dispose fences active reads and writes, retains pending and disables further access', async () => {
  const f = fixture();
  const command = f.client.command('plan.create', payload(), 0);
  const read = f.client.read('/workspace');
  const raw = f.values.get(f.key());
  f.client.dispose();
  f.client.dispose();
  assert.equal(f.calls.every((call) => call.options.signal.aborted), true);
  f.finish(0, { revision: 1 }, 201);
  f.calls[1].reject(Error('disposed transport'));
  await rejects(command, 'stale_session');
  await rejects(read, 'stale_session');
  assert.equal(f.values.get(f.key()), raw);
  throws(() => f.client.pending(), 'disposed');
  throws(() => f.client.sessionChanged(), 'disposed');
  await rejects(f.client.retry(), 'disposed');
  await rejects(f.client.read('/workspace'), 'disposed');
});

test('all preview types POST exact proposal body, return direct wrapper and require no outbox', async () => {
  const f = fixture();
  // An unavailable outbox does not block proposals when the owner marker is readable.
  f.values.set(f.key(), 'malformed user outbox retained');
  const getItem = f.storage.getItem;
  f.storage.getItem = (key) => { if (key === f.key()) throw Error('blocked outbox'); return getItem(key); };
  for (const [operation, input] of [
    ['plan.delete', { plan_id: id(1) }],
    ['plan.resize', { plan_id: id(1), start_date: '2026-09-14', end_date: '2026-09-16' }],
    ['meal.delete', { meal_id: id(2) }], ['event.delete', { event_id: id(3) }],
    ['task.delete', { task_id: id(4) }], ['event.unlink', { link_id: id(5) }],
  ]) {
    const index = f.calls.length;
    const proposal = f.client.preview(operation, input, 5);
    assert.equal(f.calls[index].url, '/api/planning/v1/previews');
    assert.equal(f.calls[index].options.method, 'POST');
    assert.equal(f.calls[index].options.body, JSON.stringify({ operation, payload: input, expected_workspace_revision: 5 }));
    const preview = { id: id(index + 10), operation, payload: input,
      effects: { affected: {} }, expires_at: '2026-09-13T16:10:00Z' };
    f.finish(index, { preview, revision: 5 }, 201);
    assert.deepEqual(await proposal, { preview, revision: 5 });
  }
  assert.equal(f.values.get(f.key()), 'malformed user outbox retained');
});

test('cancelPreview sends DELETE to a fixed UUID route, returns cancellation without touching pending', async () => {
  const f = fixture();
  const command = f.client.command('plan.create', payload(), 0);
  f.calls[0].reject(Error('lost'));
  await rejects(command, 'network_error');
  const raw = f.values.get(f.key());
  const cancelled = f.client.cancelPreview(id(1));
  assert.equal(f.calls[1].url, `/api/planning/v1/previews/${id(1)}`);
  assert.equal(f.calls[1].options.method, 'DELETE');
  assert.equal(f.calls[1].options.body, undefined);
  assert.equal(f.calls[1].options.headers.Authorization, 'Bearer token-A');
  f.finish(1, { cancelled: true });
  assert.deepEqual(await cancelled, { cancelled: true });
  assert.equal(f.values.get(f.key()), raw);
  for (const bad of ['https://evil.test', `${id(1)}/../commands`, `${id(1)}?owner=B`, null]) {
    await rejects(f.client.cancelPreview(bad), 'invalid_path');
  }
  assert.equal(f.calls.length, 2);
});

test('preview and cancellation fence old-account successes, HTTP errors and transport failures', async () => {
  for (const kind of ['preview', 'cancel']) for (const outcome of ['success', '409', 'network']) {
    const f = fixture();
    const request = kind === 'preview' ? f.client.preview('plan.delete', { plan_id: id(1) }, 0) : f.client.cancelPreview(id(2));
    f.setSession({ accountId: 'A', token: 'token-A', epoch: 2, requestGeneration: 3 });
    assert.equal(f.calls[0].options.signal.aborted, true);
    if (outcome === 'network') f.calls[0].reject(Error('old owner private failure'));
    else f.finish(0, kind === 'preview' ? { preview: { id: id(2) }, revision: 0 } : { cancelled: true }, outcome === '409' ? 409 : 201);
    await rejects(request, 'stale_session');
    assert.equal(f.values.size, 0);
  }
});

test('proposal errors and response loss neither retry nor create an outbox', async () => {
  for (const status of [400, 401, 404, 409, 503]) {
    const f = fixture();
    const preview = f.client.preview('plan.delete', { plan_id: id(1) }, 0);
    const data = { error: 'revision_conflict', current_revision: 9 };
    f.finish(0, data, status);
    await assert.rejects(preview, (error) => {
      assert.equal(error.code, 'http_error');
      assert.equal(error.status, status);
      assert.deepEqual(error.data, data);
      return true;
    });
    assert.equal(f.client.pending(), null);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  const preview = f.client.preview('plan.delete', { plan_id: id(1) }, 0);
  f.calls[0].reject(Error('lost proposal response; server expires it'));
  await rejects(preview, 'network_error');
  assert.equal(f.values.size, 0);
  assert.equal(f.calls.length, 1);
});

test('preview operations cannot execute as direct commands; proposal validation prevents unknown actions', async () => {
  const f = fixture();
  for (const operation of ['plan.delete', 'plan.resize', 'event.delete', 'event.unlink', 'meal.delete', 'task.delete']) {
    await rejects(f.client.command(operation, {}, 0), 'invalid_command');
  }
  for (const operation of ['preview.confirm', 'undo.apply', 'plan.create', 'https://evil.test']) {
    await rejects(f.client.preview(operation, {}, 0), 'invalid_preview');
  }
  await rejects(f.client.preview('plan.delete', {}, true), 'invalid_preview');
  await rejects(f.client.preview('plan.delete', { name: 'x'.repeat(17000) }, 0), 'invalid_body');
  assert.equal(f.calls.length, 0);
  assert.equal(f.values.size, 0);
});

test('a second preview cannot interrupt an active proposal writer', async () => {
  const f = fixture();
  const first = f.client.preview('plan.delete', { plan_id: id(1) }, 0);
  await rejects(f.client.preview('plan.delete', { plan_id: id(2) }, 0), 'write_in_flight');
  assert.equal(f.calls[0].options.signal.aborted, false);
  f.finish(0, { preview: { id: id(3) }, revision: 0 }, 201);
  assert.equal((await first).preview.id, id(3));
  assert.equal(f.calls.length, 1);
  assert.equal(f.client.pending(), null);
});

test('event/task/link collection paths retain the server shapes and enforce collection keys', async () => {
  const f = fixture();
  for (const [path, key, row] of [
    ['/events', 'events', { id: id(1), name: 'Dinner', date: '2026-09-14' }],
    [`/events/${id(1)}/tasks`, 'tasks', { id: id(2), event_id: id(1), text: 'Prep', done: false }],
    [`/plans/${id(3)}/events`, 'links', { id: id(4), plan_id: id(3), event_id: id(1), event: { id: id(1) }, in_range: false }],
  ]) {
    const index = f.calls.length;
    const load = f.client.loadCollection(path, key);
    assert.equal(f.calls[index].url, `/api/planning/v1${path}?limit=100`);
    f.finish(index, { [key]: [row], revision: 6, next_cursor: null });
    assert.deepEqual(await load, { [key]: [row], revision: 6, next_cursor: null });
  }
  const detail = f.client.read(`/events/${id(1)}`);
  f.finish(3, { event: { id: id(1) }, revision: 6 });
  assert.equal((await detail).event.id, id(1));
  await rejects(f.client.loadCollection(`/plans/${id(3)}/events`, 'events'), 'invalid_collection');
  await rejects(f.client.read(`/events/${id(1)}/tasks?limit=101`), 'invalid_path');
  assert.equal(f.calls.length, 4);
});

test('event, task, move/copy, confirmation and undo commands use the exact durable command protocol', async () => {
  const f = fixture();
  let revision = 0;
  for (const [operation, input, result] of [
    ['event.create', { name: 'Dinner', date: '2026-09-14' }, { event: { id: id(1) } }],
    ['event.update', { event_id: id(1), time: null }, { event: { id: id(1) } }],
    ['event.link', { event_id: id(1), plan_id: id(2) }, { link: { id: id(3) } }],
    ['task.create', { event_id: id(1), bucket: 'earlier', text: 'Prep' }, { task: { id: id(4) } }],
    ['task.update', { task_id: id(4), done: true }, { task: { id: id(4) } }],
    ['meal.move', { meal_id: id(5), plan_id: id(2), date: '2026-09-14' }, { meal: { id: id(5) } }],
    ['meal.copy', { meal_id: id(5), plan_id: id(2), date: '2026-09-14' }, { meal: { id: id(6) } }],
    ['preview.confirm', { preview_id: id(7) }, { applied: true, undo_id: id(8), undo_expires_at: '2026-09-13T17:10:00Z' }],
    ['undo.apply', { undo_id: id(8) }, { restored: true }],
  ]) {
    const index = f.calls.length;
    const command = f.client.command(operation, input, revision);
    const body = JSON.parse(f.calls[index].options.body);
    assert.equal(body.operation, operation);
    assert.deepEqual(body.payload, input);
    assert.equal(body.expected_workspace_revision, revision);
    assert.equal(f.client.pending().body, f.calls[index].options.body);
    revision += 1;
    f.finish(index, { ...result, revision });
    assert.deepEqual(await command, { result: { ...result, revision }, requiresReload: true });
    assert.equal(f.client.pending(), null);
  }
});

test('highest accepted expected revision permits its successful successor revision', async () => {
  const f = fixture();
  const command = f.client.command('plan.create', payload(), 2147483646);
  f.finish(0, { revision: 2147483647 }, 201);
  assert.equal((await command).result.revision, 2147483647);
});

test('hidden serialization hooks and array properties cannot silently rewrite a payload', async () => {
  const f = fixture();
  const hiddenHook = Object.defineProperty({}, 'toJSON', { value: () => ({ plan_id: id(9) }) });
  const array = [1]; array.extra = 2;
  for (const input of [hiddenHook, { array }]) await rejects(f.client.command('plan.create', input, 0), 'invalid_payload');
  assert.equal(f.calls.length, 0);
});

test('two same-account clients admit exactly one writer and never replace its pending body', async () => {
  const f = fixture();
  const second = f.make();
  const first = f.client.command('plan.create', payload(), 0);
  const raw = f.values.get(f.key());
  assert.equal(f.locks.held.size, 1);
  assert.equal(f.locks.calls[0].name, 'private-planning:v1:writer:A');
  await rejects(second.command('plan.create', { ...payload(), name: 'Other tab' }, 0), 'writer_busy');
  await rejects(second.retry(), 'writer_busy');
  await rejects(second.discardRejected(), 'writer_busy');
  assert.equal(f.calls.length, 1);
  assert.equal(f.values.get(f.key()), raw);
  f.calls[0].reject(Error('response lost'));
  await rejects(first, 'network_error');
  assert.equal(f.locks.held.size, 0);
  await rejects(second.command('plan.create', payload(), 0), 'pending_exists');
  assert.equal(f.values.get(f.key()), raw);
  assert.equal(f.calls.length, 1);
});

test('refresh startup observes an existing pending body without acquiring a lock or auto-sending', async () => {
  const f = fixture();
  const first = f.client.command('plan.create', payload(), 0);
  f.calls[0].reject(Error('lost response'));
  await rejects(first, 'network_error');
  const raw = f.values.get(f.key());
  const lockCalls = f.locks.calls.length;
  const refreshed = f.make();
  assert.equal(refreshed.pending().body, JSON.parse(raw).body);
  await new Promise(setImmediate);
  assert.equal(f.calls.length, 1);
  assert.equal(f.locks.calls.length, lockCalls);
  assert.equal(f.values.get(f.key()), raw);
});

test('simultaneous refresh retries send one exact body and hold lock through JSON and ack cleanup', async () => {
  const f = fixture();
  const initial = f.client.command('plan.create', payload(), 0);
  f.calls[0].reject(Error('response lost'));
  await rejects(initial, 'network_error');
  const body = f.calls[0].options.body;
  const a = f.make(), b = f.make();
  const retry = a.retry();
  await rejects(b.retry(), 'writer_busy');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].options.body, body);
  const json = deferred(), started = deferred();
  f.calls[1].resolve({ ok: true, status: 201, json() { started.resolve(); return json.promise; } });
  await started.promise;
  await rejects(b.command('plan.create', payload(), 1), 'writer_busy');
  assert.equal(f.locks.held.size, 1);
  assert.equal(f.client.pending().body, body);
  const remove = f.storage.removeItem;
  f.storage.removeItem = (key) => {
    assert.equal(f.locks.held.has('private-planning:v1:writer:A'), true);
    remove(key);
  };
  json.resolve({ revision: 1 });
  assert.equal((await retry).requiresReload, true);
  assert.equal(f.locks.held.size, 0);
  assert.equal(b.pending(), null);
  await rejects(b.retry(), 'no_pending');
  assert.equal(f.calls.length, 2);
});

test('write-path storage access is inside the account lock, including rejection and discard', async () => {
  const f = fixture();
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const original = f.storage[method];
    f.storage[method] = (...args) => {
      assert.equal(f.locks.held.has('private-planning:v1:writer:A'), true, method);
      return original(...args);
    };
  }
  const command = f.client.command('plan.create', payload(), 0);
  f.finish(0, { error: 'revision_conflict', current_revision: 1 }, 409);
  await rejects(command, 'review_required');
  await rejects(f.make().retry(), 'review_required');
  const discarded = f.client.discardRejected();
  await rejects(f.make().command('plan.create', payload(), 1), 'writer_busy');
  await discarded;
  assert.equal(f.values.has(f.key()), false);
  assert.equal(f.locks.held.size, 0);
});

test('auth is rechecked after delayed lock grant before any storage access or send', async () => {
  for (const method of ['command', 'retry', 'discardRejected', 'preview', 'cancelPreview']) {
    const f = fixture();
    const gate = deferred();
    const delayed = f.make({ lockManager: {
      async request(name, options, callback) { await gate.promise; return f.locks.request(name, options, callback); },
    } });
    const request = method === 'command' ? delayed.command('plan.create', payload(), 0) :
      method === 'preview' ? delayed.preview('plan.delete', { plan_id: id(1) }, 0) :
      method === 'cancelPreview' ? delayed.cancelPreview(id(1)) : delayed[method]();
    // Same owner/token, new session epoch must still fence the callback.
    f.setSession({ accountId: 'A', token: 'token-A', epoch: 1 }, false);
    f.storage.getItem = () => assert.fail('stale lock callback must not read outbox');
    gate.resolve();
    await rejects(request, 'stale_session');
    assert.equal(f.calls.length, 0);
    assert.equal(f.values.size, 0);
    assert.equal(f.locks.held.size, 0);
  }
});

test('outbox is reread after delayed grant; another tab pending cannot be overwritten', async () => {
  const f = fixture();
  const gate = deferred();
  const delayed = f.make({ lockManager: {
    async request(name, options, callback) { await gate.promise; return f.locks.request(name, options, callback); },
  } });
  const lateCommand = delayed.command('plan.create', { ...payload(), name: 'Delayed tab' }, 0);
  assert.equal(f.values.size, 0);
  const immediate = f.client.command('plan.create', payload(), 0);
  f.calls[0].reject(Error('response lost'));
  await rejects(immediate, 'network_error');
  const raw = f.values.get(f.key());
  gate.resolve();
  await rejects(lateCommand, 'pending_exists');
  assert.equal(f.values.get(f.key()), raw);
  assert.equal(f.calls.length, 1);
});

test('retry and discard reread current outbox under a delayed grant', async () => {
  for (const method of ['retry', 'discardRejected']) {
    const f = fixture();
    const initial = f.client.command('plan.create', payload(), 0);
    if (method === 'retry') f.calls[0].reject(Error('lost'));
    else f.finish(0, { error: 'revision_conflict' }, 409);
    await rejects(initial, method === 'retry' ? 'network_error' : 'review_required');
    const gate = deferred();
    const delayed = f.make({ lockManager: {
      async request(name, options, callback) { await gate.promise; return f.locks.request(name, options, callback); },
    } });
    const action = delayed[method]();
    if (method === 'retry') {
      const retry = f.client.retry();
      f.finish(1, { revision: 1 });
      await retry;
      gate.resolve();
      await rejects(action, 'no_pending');
      assert.equal(f.calls.length, 2);
    } else {
      await f.client.discardRejected();
      const next = f.client.command('plan.create', payload(), 1);
      f.calls[1].reject(Error('new ambiguous command'));
      await rejects(next, 'network_error');
      const raw = f.values.get(f.key());
      gate.resolve();
      await rejects(action, 'pending_unresolved');
      assert.equal(f.values.get(f.key()), raw);
    }
  }
});

test('caller payload is detached before asynchronous lock dispatch and then persisted exactly', async () => {
  const f = fixture();
  const gate = deferred();
  const client = f.make({ lockManager: {
    async request(name, options, callback) { await gate.promise; return f.locks.request(name, options, callback); },
  } });
  const input = payload();
  const command = client.command('plan.create', input, 0);
  input.name = 'mutated by UI';
  gate.resolve();
  await new Promise(setImmediate);
  assert.equal(JSON.parse(f.calls[0].options.body).payload.name, '  Dinner  ');
  f.finish(0, { revision: 1 }, 201);
  await command;
});

test('missing or blocked lock managers fail closed for every write, while reads remain available', async () => {
  for (const lockManager of [null, {}, { request: async () => undefined }, { request() { throw Error('policy blocked'); } },
    { request: async () => { throw Error('security blocked'); } }]) {
    const f = fixture();
    const client = f.make({ lockManager });
    f.storage.getItem = () => assert.fail('no lock means no write-path storage read');
    for (const action of [() => client.command('plan.create', payload(), 0), () => client.retry(),
      () => client.discardRejected(), () => client.preview('plan.delete', { plan_id: id(1) }, 0),
      () => client.cancelPreview(id(1))]) {
      await assert.rejects(action(), (error) => {
        assert.equal(error.code, 'write_coordination_unavailable');
        assert.equal(error.readOnly, true);
        return true;
      });
    }
    assert.equal(f.calls.length, 0);
    const read = client.read('/workspace');
    f.finish(0, { revision: 0 });
    assert.equal((await read).revision, 0);
  }
});

test('default manager uses navigator.locks; absent and throwing getters block writes', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    for (const kind of ['working', 'absent', 'throws']) {
      const locks = mockLocks();
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value:
        kind === 'working' ? { locks } : kind === 'absent' ? {} :
          Object.defineProperty({}, 'locks', { get() { throw Error('blocked'); } }) });
      const f = fixture();
      const client = createPlanningClient({ storage: f.storage, getSession: () => ({ accountId: 'A', token: 'A' }),
        fetchImpl: async () => response({ revision: 1 }, 201) });
      if (kind === 'working') {
        await client.command('plan.create', payload(), 0);
        assert.equal(locks.calls.length, 1);
      } else await rejects(client.command('plan.create', payload(), 0), 'write_coordination_unavailable');
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'navigator', previous);
    else delete globalThis.navigator;
  }
});

test('different accounts have independent locks and outboxes', async () => {
  const f = fixture();
  const other = f.make({ getSession: () => ({ accountId: 'B', token: 'B' }) });
  const a = f.client.command('plan.create', payload(), 0);
  const b = other.command('plan.create', payload(), 0);
  assert.equal(f.calls.length, 2);
  assert.equal(f.locks.held.size, 2);
  assert.notEqual(f.locks.calls[0].name, f.locks.calls[1].name);
  assert.equal(f.values.size, 2);
  f.finish(0, { revision: 1 });
  f.finish(1, { revision: 1 });
  await Promise.all([a, b]);
  assert.equal(f.values.size, 0);
  assert.equal(f.locks.held.size, 0);
});

test('write timeout releases lock even when fetch ignores abort, retaining exact body for explicit retry', async () => {
  const f = fixture();
  const timed = f.make({ requestTimeoutMs: 10 });
  const command = timed.command('plan.create', payload(), 0);
  const raw = f.values.get(f.key());
  await assert.rejects(command, (error) => {
    assert.equal(error.code, 'request_timeout');
    assert.equal(error.ambiguous, true);
    return true;
  });
  assert.equal(f.calls[0].options.signal.aborted, true);
  assert.equal(f.locks.held.size, 0);
  assert.equal(f.values.get(f.key()), raw);
  assert.equal(f.calls.length, 1);
  const other = f.make();
  await rejects(other.command('plan.create', payload(), 1), 'pending_exists');
  const retry = other.retry();
  assert.equal(f.calls[1].options.body, f.calls[0].options.body);
  // Late success from the timed-out request may not clear the retry's outbox.
  f.finish(0, { revision: 1 }, 201);
  await new Promise(setImmediate);
  assert.equal(f.values.get(f.key()), raw);
  assert.equal(f.locks.held.size, 1);
  f.finish(1, { revision: 1 }, 201);
  await retry;
  assert.equal(f.values.size, 0);
  assert.equal(f.locks.held.size, 0);
});

test('timeout covers hung response.json and old errors cannot reject a later retry', async () => {
  const f = fixture();
  const timed = f.make({ requestTimeoutMs: 10 });
  const command = timed.command('plan.create', payload(), 0);
  const json = deferred();
  f.calls[0].resolve({ ok: true, status: 201, json: () => json.promise });
  await rejects(command, 'request_timeout');
  const raw = f.values.get(f.key());
  assert.equal(f.locks.held.size, 0);
  const retry = f.client.retry();
  json.reject(Error('old private parse error'));
  await new Promise(setImmediate);
  assert.equal(f.values.get(f.key()), raw);
  assert.equal(f.client.pending().state, 'pending');
  f.finish(1, { revision: 1 });
  await retry;
});

test('dispose or auth transition promptly releases an unresponsive write and preserves ambiguity', async () => {
  for (const action of ['dispose', 'logout', 'epoch']) {
    const f = fixture();
    const command = f.client.command('plan.create', payload(), 0);
    const failed = rejects(command, 'stale_session');
    const raw = f.values.get(f.key());
    if (action === 'dispose') f.client.dispose();
    else f.setSession(action === 'logout' ? null : { accountId: 'A', token: 'token-A', epoch: 2 });
    // No mock HTTP completion: abort itself must settle and release the lock.
    await failed;
    assert.equal(f.locks.held.size, 0);
    assert.equal(f.values.get(f.key()), raw);
    const other = f.make({ getSession: () => ({ accountId: 'A', token: 'fresh' }) });
    const retry = other.retry();
    assert.equal(f.calls[1].options.body, f.calls[0].options.body);
    f.finish(1, { revision: 1 });
    await retry;
  }
});

test('reads are bounded and read timeout never creates an outbox', async () => {
  const f = fixture();
  const timed = f.make({ requestTimeoutMs: 10, lockManager: null });
  await rejects(timed.read('/workspace'), 'request_timeout');
  assert.equal(f.calls[0].options.signal.aborted, true);
  assert.equal(f.values.size, 0);
  assert.equal(f.locks.calls.length, 0);
  for (const requestTimeoutMs of [0, -1, 1.2, 60001, Infinity, null]) {
    throws(() => f.make({ requestTimeoutMs }), 'invalid_configuration');
  }
});

test('preview and cancellation time out under the same writer lock without an outbox', async () => {
  for (const method of ['preview', 'cancelPreview']) {
    const f = fixture();
    const timed = f.make({ requestTimeoutMs: 10 });
    const write = method === 'preview' ? timed.preview('item.delete', { item_id: id(1) }, 0) : timed.cancelPreview(id(1));
    await rejects(f.client.command('plan.create', payload(), 0), 'writer_busy');
    await rejects(write, 'request_timeout');
    assert.equal(f.locks.held.size, 0);
    assert.equal(f.values.size, 0);
    assert.equal(f.calls.length, 1);
  }
});

test('item collections, resolved item previews and catalog reads use fixed allowlisted routes', async () => {
  const f = fixture();
  for (const path of [`/meals/${id(1)}/items`, `/events/${id(2)}/items`]) {
    const index = f.calls.length;
    const load = f.client.loadCollection(path, 'items');
    assert.equal(f.calls[index].url, `/api/planning/v1${path}?limit=100`);
    f.finish(index, { items: [{ id: id(3), kind: 'note', title: 'Note' }], revision: 5, next_cursor: null });
    assert.equal((await load).items[0].title, 'Note');
  }
  const detail = f.client.read(`/items/${id(3)}/preview`);
  f.finish(2, { item: { id: id(3) }, preview: null, revision: 5 });
  assert.equal((await detail).preview, null);
  for (const path of ['/catalog?language=en', '/catalog?language=de',
    '/catalog/synthetic-entry/1?language=en', '/catalog/synthetic-entry/2147483647?language=de']) {
    const index = f.calls.length;
    const read = f.client.read(path);
    assert.equal(f.calls[index].url, `/api/planning/v1${path}`);
    // Catalog responses are not workspace snapshots and need no workspace revision.
    const data = path.startsWith('/catalog?') ? { entries: [] } : { entry_id: 'synthetic-entry', revision: 1, variants: [] };
    f.finish(index, data);
    assert.deepEqual(await read, data);
  }
  await rejects(f.client.loadCollection('/catalog?language=en', 'entries'), 'invalid_collection');
  assert.equal(f.locks.calls.length, 0);
});

test('item collection limit is exactly 100, including paginated totals and revision checks', async () => {
  for (const lastRevision of [3, 4]) {
    const f = fixture();
    const load = f.client.loadCollection(`/meals/${id(1)}/items`, 'items');
    f.finish(0, { items: Array.from({ length: 60 }, (_, n) => plan(n + 1)), revision: 3, next_cursor: id(60) });
    await new Promise(setImmediate);
    f.finish(1, { items: Array.from({ length: 41 }, (_, n) => plan(n + 61)), revision: lastRevision, next_cursor: null });
    await rejects(load, lastRevision === 3 ? 'pagination_bound' : 'revision_changed');
    assert.equal(f.calls.length, 2);
  }
  const f = fixture();
  const load = f.client.loadCollection(`/events/${id(1)}/items`, 'items');
  f.finish(0, { items: Array.from({ length: 100 }, (_, n) => plan(n + 1)), revision: 3, next_cursor: null });
  assert.equal((await load).items.length, 100);
});

test('catalog and item paths reject external destinations, unsupported queries and malformed identities', async () => {
  const f = fixture();
  for (const path of ['/catalog', '/catalog?language=fr', '/catalog?language=en&language=de',
    '/catalog?language=en&limit=10', '/catalog?limit=1&language=en', '/catalog?language=%65n',
    '/catalog/foo/1', '/catalog/foo/0?language=en', '/catalog/foo/01?language=en',
    '/catalog/foo/2147483648?language=en', '/catalog/Bad-Slug/1?language=en',
    `/catalog/${'a'.repeat(81)}/1?language=en`, '/catalog/../1?language=en',
    '/catalog/foo%2fbar/1?language=en', '/catalog/resolve', '/catalog?language=en\n',
    `/items/${id(1)}/preview?language=en`, `/items/${id(1)}/preview?limit=1`,
    '/meals/https://evil.test/items', '/events/../items', `/meals/${id(1)}/items?language=en`]) {
    await rejects(f.client.read(path), 'invalid_path');
  }
  assert.equal(f.calls.length, 0);
});

test('item command allowlist preserves payload exactly; deletion requires a proposal', async () => {
  const f = fixture();
  const inputs = [
    ['item.create', { parent_type: 'meal', parent_id: id(1), kind: 'personal', title: '  Bread  ', quantity: '1.000', unit: 'loaf' }],
    ['item.update', { item_id: id(2), group: null, contribution: '  Guest  ', options: { variant_id: 'small' } }],
    ['item.move', { item_id: id(2), parent_type: 'event', parent_id: id(3) }],
    ['item.copy', { item_id: id(2), parent_type: 'meal', parent_id: id(1) }],
  ];
  for (const [operation, input] of inputs) {
    const index = f.calls.length;
    const command = f.client.command(operation, input, index);
    const body = JSON.parse(f.calls[index].options.body);
    assert.equal(body.operation, operation);
    assert.deepEqual(body.payload, input);
    assert.equal(f.client.pending().body, f.calls[index].options.body);
    f.finish(index, { item: { id: id(2) }, revision: index + 1 });
    assert.equal((await command).requiresReload, true);
  }
  await rejects(f.client.command('item.delete', { item_id: id(2) }, 4), 'invalid_command');
  const preview = f.client.preview('item.delete', { item_id: id(2) }, 4);
  f.finish(4, { preview: { id: id(5), operation: 'item.delete' }, revision: 4 }, 201);
  assert.equal((await preview).preview.operation, 'item.delete');
  assert.equal(f.client.pending(), null);
});

test('lost committed response then JWT 401/422 retains exact body through refresh and reauthentication', async () => {
  for (const status of [401, 422]) {
    const f = fixture();
    const initial = f.client.command('plan.create', payload(), 7);
    const body = f.calls[0].options.body;
    const raw = f.values.get(f.key());
    f.calls[0].reject(Error('server committed revision 8; response lost'));
    await rejects(initial, 'network_error');
    const retry = f.client.retry();
    assert.equal(f.calls[1].options.body, body);
    f.finish(1, { msg: 'Signature verification failed' }, status);
    await assert.rejects(retry, (error) => {
      assert.equal(error.code, 'http_error');
      assert.equal(error.status, status);
      return true;
    });
    assert.equal(f.values.get(f.key()), raw);
    assert.equal(f.client.pending().state, 'pending');
    await rejects(f.client.discardRejected(), 'pending_unresolved');
    await rejects(f.client.command('plan.create', payload(), 8), 'pending_exists');
    assert.equal(f.calls.length, 2);
    f.setSession(null);
    assert.equal(f.client.pending(), null);
    await rejects(f.client.retry(), 'unauthenticated');
    f.client.dispose();
    f.setSession({ accountId: 'A', token: 'reauthenticated-A', epoch: 2, requestGeneration: 3 }, false);
    const refreshed = f.make();
    assert.equal(refreshed.pending().body, body);
    assert.equal(f.calls.length, 2, 'refresh must not send automatically');
    const recovered = refreshed.retry();
    assert.equal(f.calls[2].options.body, body);
    assert.equal(f.calls[2].options.headers.Authorization, 'Bearer reauthenticated-A');
    f.finish(2, { plan: plan(1), revision: 8 }, 201);
    assert.deepEqual(await recovered, { result: { plan: plan(1), revision: 8 }, requiresReload: true });
    assert.equal(refreshed.pending(), null);
    assert.equal(f.locks.held.size, 0);
  }
});

test('unreadable JWT 422 response also leaves the command ambiguous and nondiscardable', async () => {
  const f = fixture();
  const command = f.client.command('plan.create', payload(), 0);
  const raw = f.values.get(f.key());
  f.calls[0].resolve({ ok: false, status: 422, json: async () => { throw Error('truncated JWT error'); } });
  await rejects(command, 'http_error');
  assert.equal(f.values.get(f.key()), raw);
  await rejects(f.client.discardRejected(), 'pending_unresolved');
  await rejects(f.client.command('plan.create', payload(), 0), 'pending_exists');
  assert.equal(f.calls.length, 1);
});

test('legacy persisted 422 rejection is nondiscardable and recovers by exact explicit retry', async () => {
  const f = fixture();
  const initial = f.client.command('plan.create', payload(), 0);
  const body = f.calls[0].options.body;
  f.calls[0].reject(Error('lost response'));
  await rejects(initial, 'network_error');
  const legacy = { ...JSON.parse(f.values.get(f.key())), state: 'rejected', status: 422 };
  const raw = JSON.stringify(legacy);
  f.values.set(f.key(), raw);
  const refreshed = f.make();
  assert.deepEqual(refreshed.pending(), { ...legacy, state: 'pending', status: null });
  await rejects(refreshed.discardRejected(), 'pending_unresolved');
  await rejects(refreshed.command('plan.create', payload(), 0), 'pending_exists');
  assert.equal(f.values.get(f.key()), raw, 'observation must not rewrite legacy storage');
  assert.equal(f.calls.length, 1);
  const recovered = refreshed.retry();
  assert.equal(f.calls[1].options.body, body);
  f.finish(1, { revision: 1 }, 201);
  await recovered;
  assert.equal(refreshed.pending(), null);
});

test('legacy 422 recovery does not bypass malformed-body or account-ownership validation', async () => {
  const f = fixture();
  const initial = f.client.command('plan.create', payload(), 0);
  f.calls[0].reject(Error('lost response'));
  await rejects(initial, 'network_error');
  const legacy = { ...JSON.parse(f.values.get(f.key())), state: 'rejected', status: 422 };
  for (const entry of [{ ...legacy, accountId: 'B' }, { ...legacy, body: '{}' }]) {
    const raw = JSON.stringify(entry);
    f.values.set(f.key(), raw);
    throws(() => f.client.pending(), 'storage_blocked');
    await rejects(f.client.retry(), 'storage_blocked');
    await rejects(f.client.discardRejected(), 'storage_blocked');
    assert.equal(f.values.get(f.key()), raw);
  }
  assert.equal(f.calls.length, 1);
});

test('owner marker is checked under lock before preparing or sending any write', async () => {
  for (const [marker, code] of [['1:deleting', 'account_deletion_pending'], ['1:deleted', 'account_deleted'], ['bad', 'storage_blocked']]) {
    const f = fixture();
    f.values.set(planningOwnerMarkerKey('A'), marker);
    const originalGet = f.storage.getItem;
    f.storage.getItem = (key) => {
      assert.equal(f.locks.held.has('private-planning:v1:writer:A'), true);
      assert.equal(key, planningOwnerMarkerKey('A'), 'blocked writer must not read/prepare an outbox');
      return originalGet(key);
    };
    for (const action of [() => f.client.command('plan.create', payload(), 0), () => f.client.retry(),
      () => f.client.discardRejected(), () => f.client.preview('plan.delete', { plan_id: id(1) }, 0),
      () => f.client.cancelPreview(id(1))]) await rejects(action(), code);
    assert.equal(f.calls.length, 0);
    assert.equal(f.values.get(planningOwnerMarkerKey('A')), marker);
    assert.equal(f.values.has(f.key()), false);
  }
});

test('delayed lock acquisition rereads a deletion marker installed while auth event was delayed', async () => {
  const f = fixture();
  const gate = deferred();
  const stale = f.make({ lockManager: {
    async request(name, options, callback) { await gate.promise; return f.locks.request(name, options, callback); },
  } });
  const command = stale.command('plan.create', payload(), 0);
  f.values.set(planningOwnerMarkerKey('A'), '1:deleted');
  gate.resolve();
  await rejects(command, 'account_deleted');
  assert.equal(f.values.has(f.key()), false);
  assert.equal(f.calls.length, 0);
});

test('plan and event copying use the durable exact-retry command protocol', async () => {
  for (const operation of ['plan.copy', 'event.copy']) {
    const f = fixture();
    const input = { [`${operation.split('.')[0]}_id`]: id(1), name: '  Repeated dinner  ',
      [operation === 'plan.copy' ? 'start_date' : 'date']: '2026-09-20' };
    const command = f.client.command(operation, input, 4);
    const body = f.calls[0].options.body;
    assert.equal(JSON.parse(body).operation, operation);
    assert.deepEqual(JSON.parse(body).payload, input);
    f.calls[0].reject(Error('copy response lost'));
    await rejects(command, 'network_error');
    const refreshed = f.make();
    const retry = refreshed.retry();
    assert.equal(f.calls[1].options.body, body);
    f.finish(1, { revision: 5 }, 201);
    assert.deepEqual(await retry, { result: { revision: 5 }, requiresReload: true });
    assert.equal(refreshed.pending(), null);
  }
});
