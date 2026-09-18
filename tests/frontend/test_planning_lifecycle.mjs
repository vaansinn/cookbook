// node --test tests/frontend/test_planning_client.mjs tests/frontend/test_planning_lifecycle.mjs
// Actual lifecycle + actual adapter. Mock storage events are intentionally never
// delivered: stale-tab prevention must come from durable state under the lock.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { createPlanningClient } from '../../frontend/src/api/planning.mjs';
import { deleteWithPlanningCleanup, planningOwnerMarkerKey, readPlanningOwnerState,
  retryPlanningDeletionCleanup } from '../../frontend/src/api/planningLifecycle.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const outbox = (id) => `private-planning:v1:outbox:${id}`;
const writer = (id) => `private-planning:v1:writer:${id}`;
const payload = { name: 'Dinner', start_date: '2026-09-14', end_date: '2026-09-16' };
const uuid = '00000000-0000-4000-8000-000000000001';
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const rejects = (promise, code) => assert.rejects(promise, (error) => { assert.equal(error.code, code); return true; });

function fixture() {
  const values = new Map();
  const held = new Set();
  const faults = {};
  const accesses = [];
  const storage = {
    getItem(key) {
      accesses.push(['get', key]);
      if (faults.get?.(key)) throw Error('storage unavailable');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      accesses.push(['set', key, value]);
      if (faults.set?.(key, value)) throw Error('quota');
      if (!faults.dropSet?.(key, value)) values.set(key, value);
      faults.afterSet?.(key, value);
    },
    removeItem(key) {
      accesses.push(['remove', key]);
      if (faults.remove?.(key)) throw Error('erasure failed');
      if (!faults.dropRemove) values.delete(key);
    },
  };
  const lockManager = {
    async request(name, options, callback) {
      assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name, mode: 'exclusive' }); }
      finally { held.delete(name); }
    },
  };
  const calls = [];
  const client = (accountId = 1) => createPlanningClient({ storage, lockManager,
    getSession: () => ({ accountId, token: `stale-token-${accountId}`, epoch: 0, requestGeneration: 0 }),
    fetchImpl(url, options) {
      const request = deferred();
      calls.push({ url, options, ...request });
      return request.promise;
    },
  });
  return { values, held, faults, storage, accesses, calls, client, options: { storage, lockManager },
    async seedPending(accountId = 1) {
      const request = client(accountId).command('plan.create', payload, 0);
      calls.at(-1).reject(Error('lost response'));
      await rejects(request, 'network_error');
      return values.get(outbox(accountId));
    },
  };
}

test('actual stale tab cannot recreate outbox after delete lock released and before storage event', async () => {
  const f = fixture();
  const stale = f.client(1);
  await f.seedPending(1);
  const otherRaw = await f.seedPending(2);
  const deletion = deferred();
  let sends = 0;
  const deleting = deleteWithPlanningCleanup(1, () => {
    sends += 1;
    assert.equal(f.held.has(writer(1)), true);
    assert.equal(readPlanningOwnerState(1, f.storage), 'deleting');
    return deletion.promise;
  }, () => true, f.options);
  await rejects(stale.command('plan.create', payload, 1), 'writer_busy');
  deletion.resolve();
  assert.deepEqual(await deleting, { deleted: true, cleanupError: false });
  assert.equal(f.held.size, 0);
  assert.equal(f.values.has(outbox(1)), false);
  assert.equal(f.values.get(planningOwnerMarkerKey(1)), '1:deleted');
  // No auth update or storage event: the verified-looking stale session persists.
  for (const action of [() => stale.command('plan.create', payload, 1), () => stale.retry(),
    () => stale.discardRejected(), () => stale.preview('plan.delete', { plan_id: uuid }, 1),
    () => stale.cancelPreview(uuid), () => f.client(1).command('plan.create', payload, 0)]) {
    await rejects(action(), 'account_deleted');
  }
  assert.equal(f.values.has(outbox(1)), false);
  assert.equal(f.values.get(outbox(2)), otherRaw);
  assert.equal(f.calls.length, 2, 'no planning HTTP after deletion');
  assert.equal(sends, 1);
});

test('confirmed deletion remains protective when final marker and/or outbox cleanup fail', async () => {
  for (const failure of ['marker', 'outbox', 'both', 'silent-remove']) {
    const f = fixture();
    await f.seedPending();
    const other = await f.seedPending(2);
    const stale = f.client();
    const result = await deleteWithPlanningCleanup(1, async () => {
      if (failure === 'marker' || failure === 'both') f.faults.set = (_, value) => value === '1:deleted';
      if (failure === 'outbox' || failure === 'both') f.faults.remove = () => true;
      if (failure === 'silent-remove') f.faults.dropRemove = true;
    }, () => true, f.options);
    assert.deepEqual(result, { deleted: true, cleanupError: true });
    const state = readPlanningOwnerState(1, f.storage);
    assert.equal(state, failure === 'marker' || failure === 'both' ? 'deleting' : 'deleted');
    await rejects(stale.command('plan.create', payload, 0), state === 'deleted' ? 'account_deleted' : 'account_deletion_pending');
    await rejects(stale.retry(), state === 'deleted' ? 'account_deleted' : 'account_deletion_pending');
    assert.equal(f.calls.length, 2);
    assert.equal(f.values.get(outbox(2)), other);
    // Actual successful return value is proof for local-only recovery, even when
    // the durable final marker could not be stored. No DELETE callback involved.
    f.faults.set = null; f.faults.remove = null; f.faults.dropRemove = false;
    assert.deepEqual(await retryPlanningDeletionCleanup(1, result, f.options), { deleted: true, cleanupError: false });
    assert.equal(f.values.get(planningOwnerMarkerKey(1)), '1:deleted');
    assert.equal(f.values.has(outbox(1)), false);
    assert.equal(f.values.get(outbox(2)), other);
  }
});

test('persisted deleted marker permits local cleanup retry after refresh without server DELETE', async () => {
  const f = fixture();
  await f.seedPending();
  f.faults.remove = () => true;
  await deleteWithPlanningCleanup(1, async () => {}, () => true, f.options);
  f.faults.remove = null;
  const result = await retryPlanningDeletionCleanup(1, undefined, f.options);
  assert.deepEqual(result, { deleted: true, cleanupError: false });
  assert.equal(f.values.has(outbox(1)), false);
  const repeat = await deleteWithPlanningCleanup(1, () => assert.fail('already deleted: local cleanup only'), () => true, f.options);
  assert.deepEqual(repeat, result);
});

test('missing, malformed or unpersistable protection fails before DELETE and preserves every outbox', async () => {
  for (const kind of ['get', 'set', 'drop-set', 'readback', 'malformed']) {
    const f = fixture();
    const raw = await f.seedPending();
    const marker = planningOwnerMarkerKey(1);
    if (kind === 'get') f.faults.get = (key) => key === marker;
    if (kind === 'set') f.faults.set = (key) => key === marker;
    if (kind === 'drop-set') f.faults.dropSet = () => true;
    if (kind === 'readback') f.faults.afterSet = () => { f.faults.get = (key) => key === marker; };
    if (kind === 'malformed') f.values.set(marker, 'unrecognized marker');
    await rejects(deleteWithPlanningCleanup(1, () => assert.fail('must persist protection first'), () => true, f.options), 'storage_blocked');
    assert.equal(f.values.get(outbox(1)), raw);
    if (kind === 'malformed') assert.equal(f.values.get(marker), 'unrecognized marker');
    assert.equal(f.held.size, 0);
  }
});

test('definitive first DELETE rejection is not marked deleted and permits normal planning/retry', async () => {
  for (const status of [400, 401, 403, 409, 413, 422]) {
    const f = fixture();
    const raw = await f.seedPending();
    const failure = Object.assign(Error('DELETE rejected'), { response: { status } });
    await assert.rejects(deleteWithPlanningCleanup(1, async () => { throw failure; }, () => true, f.options), (error) => error === failure);
    assert.equal(readPlanningOwnerState(1, f.storage), 'open');
    assert.equal(f.values.get(outbox(1)), raw);
    const retry = f.client().retry();
    assert.equal(f.calls[1].options.body, JSON.parse(raw).body);
    f.calls[1].resolve({ ok: true, status: 201, json: async () => ({ revision: 1 }) });
    await retry;
    const deleted = await deleteWithPlanningCleanup(1, async () => {}, () => true, f.options);
    assert.deepEqual(deleted, { deleted: true, cleanupError: false });
  }
});

test('ambiguous deletion preserves unresolved intent and only explicit successful delete retry resolves it', async () => {
  for (const status of [undefined, 404, 500, 503]) {
    const f = fixture();
    const raw = await f.seedPending();
    const failure = Object.assign(Error('unknown deletion outcome'), status ? { response: { status } } : {});
    await assert.rejects(deleteWithPlanningCleanup(1, async () => { throw failure; }, () => true, f.options), (error) => error === failure);
    assert.equal(readPlanningOwnerState(1, f.storage), 'deleting');
    assert.equal(f.values.get(outbox(1)), raw);
    await rejects(f.client().command('plan.create', payload, 1), 'account_deletion_pending');
    await rejects(f.client().retry(), 'account_deletion_pending');
    await rejects(f.client().discardRejected(), 'account_deletion_pending');
    // No GET reconciliation exists. New login/client still has no deletion proof.
    await rejects(retryPlanningDeletionCleanup(1, { deleted: true, cleanupError: true }, f.options), 'deletion_unconfirmed');
    const authFailure = Object.assign(Error('authentication required after earlier DELETE'), { response: { status: 401 } });
    await assert.rejects(deleteWithPlanningCleanup(1, async () => { throw authFailure; }, () => true, f.options), (error) => error === authFailure);
    assert.equal(readPlanningOwnerState(1, f.storage), 'deleting');
    assert.equal(f.values.get(outbox(1)), raw);
    assert.deepEqual(await deleteWithPlanningCleanup(1, async () => {}, () => true, f.options), { deleted: true, cleanupError: false });
  }
});

test('resolved HTTP rejection plus failed storage rollback remains uncertain with explicit recovery', async () => {
  const f = fixture();
  const raw = await f.seedPending();
  const failure = Object.assign(Error('DELETE forbidden'), { response: { status: 403 } });
  await assert.rejects(deleteWithPlanningCleanup(1, async () => {
    f.faults.set = (_, value) => value === '1:open';
    throw failure;
  }, () => true, f.options), (error) => {
    assert.equal(error.code, 'deletion_recovery_required');
    assert.equal(error.cause, failure);
    assert.equal(error.cleanupError, true);
    return true;
  });
  assert.equal(readPlanningOwnerState(1, f.storage), 'deleting');
  assert.equal(f.values.get(outbox(1)), raw);
  await rejects(f.client().retry(), 'account_deletion_pending');
  f.faults.set = null;
  assert.deepEqual(await deleteWithPlanningCleanup(1, async () => {}, () => true, f.options), { deleted: true, cleanupError: false });
});

test('deletion cannot start while another tab holds a pending command lock', async () => {
  const f = fixture();
  const command = f.client().command('plan.create', payload, 0);
  await rejects(deleteWithPlanningCleanup(1, () => assert.fail('writer owns lock'), () => true, f.options), 'writer_busy');
  assert.equal(f.values.has(planningOwnerMarkerKey(1)), false);
  f.calls[0].reject(Error('response lost'));
  await rejects(command, 'network_error');
  assert.deepEqual(await deleteWithPlanningCleanup(1, async () => {}, () => true, f.options), { deleted: true, cleanupError: false });
});

test('stale deletion before dispatch returns stale and leaves older intent protected', async () => {
  const f = fixture();
  assert.deepEqual(await deleteWithPlanningCleanup(1, () => assert.fail('stale'), () => false, f.options), { stale: true });
  assert.equal(f.values.size, 0);
  let current = true;
  f.faults.afterSet = () => { current = false; };
  assert.deepEqual(await deleteWithPlanningCleanup(1, () => assert.fail('stale after storage'), () => current, f.options), { stale: true });
  assert.equal(readPlanningOwnerState(1, f.storage), 'open');
  f.values.set(planningOwnerMarkerKey(1), '1:deleting');
  let checks = 0;
  assert.deepEqual(await deleteWithPlanningCleanup(1, () => assert.fail('stale previous intent'), () => ++checks === 1, f.options), { stale: true });
  assert.equal(readPlanningOwnerState(1, f.storage), 'deleting');
});

test('auth switch during DELETE cleans captured owner only and never clears the new owner', async () => {
  const f = fixture();
  await f.seedPending(1);
  const other = await f.seedPending(2);
  let current = true;
  const result = await deleteWithPlanningCleanup(1, async () => { current = false; }, () => current, f.options);
  assert.deepEqual(result, { deleted: true, cleanupError: false });
  assert.equal(f.values.has(outbox(1)), false);
  assert.equal(f.values.get(outbox(2)), other);
  assert.equal(f.values.has(planningOwnerMarkerKey(2)), false);
});

test('local cleanup proof cannot be forged, copied or applied to another account', async () => {
  const f = fixture();
  const result = await deleteWithPlanningCleanup(1, async () => {
    f.faults.set = (_, value) => value === '1:deleted';
  }, () => true, f.options);
  assert.equal(result.deleted, true);
  f.faults.set = null;
  f.values.set(planningOwnerMarkerKey(2), '1:deleting');
  for (const confirmation of [undefined, { ...result }, { deleted: true }]) {
    await rejects(retryPlanningDeletionCleanup(1, confirmation, f.options), 'deletion_unconfirmed');
  }
  await rejects(retryPlanningDeletionCleanup(2, result, f.options), 'deletion_unconfirmed');
  assert.deepEqual(await retryPlanningDeletionCleanup(1, result, f.options), { deleted: true, cleanupError: false });
  assert.equal(readPlanningOwnerState(2, f.storage), 'deleting');
});

test('marker contains no private contents and every marker mutation uses the owner lock', async () => {
  const f = fixture();
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const original = f.storage[method];
    f.storage[method] = (...args) => { assert.equal(f.held.has(writer(1)), true); return original(...args); };
  }
  await deleteWithPlanningCleanup(1, async () => {}, () => true, f.options);
  assert.deepEqual([...f.values], [[planningOwnerMarkerKey(1), '1:deleted']]);
});

test('unsupported locks or invalid account cannot send DELETE or touch storage', async () => {
  const f = fixture();
  for (const lockManager of [null, {}, { request() { throw Error('security blocked'); } }, { request: async () => undefined }]) {
    await rejects(deleteWithPlanningCleanup(1, () => assert.fail('no lock'), () => true, { ...f.options, lockManager }), 'write_coordination_unavailable');
  }
  for (const account of [0, -1, null, '1', 1.2]) {
    await rejects(deleteWithPlanningCleanup(account, () => assert.fail('invalid owner'), () => true, f.options), 'invalid_account');
  }
  assert.equal(f.accesses.length, 0);
});
