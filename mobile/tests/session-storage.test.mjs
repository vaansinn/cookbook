import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStorage } from '../src/session-storage.mjs';

test('native session record round trips without browser storage', async () => {
  let value = null;
  const storage = createSessionStorage({ get: async () => ({ value }), set: async input => { value = input.value; }, remove: async () => { value = null; } });
  assert.equal(await storage.get(), null);
  await storage.set({ refresh_token: 'synthetic-test-token' });
  assert.deepEqual(await storage.get(), { refresh_token: 'synthetic-test-token' });
  await storage.remove();
  assert.equal(await storage.get(), null);
});

test('queued clear cannot be overtaken by a slow earlier save', async () => {
  let finish;
  let value = null;
  const gate = new Promise(resolve => { finish = resolve; });
  const storage = createSessionStorage({ get: async () => ({ value }), set: async input => { await gate; value = input.value; }, remove: async () => { value = null; } });
  const original = { refresh_token: 'original' };
  const saved = storage.set(original);
  original.refresh_token = 'changed';
  const cleared = storage.remove();
  finish();
  await Promise.all([saved, cleared]);
  assert.equal(await storage.get(), null);
});

test('corrupt or unavailable vault fails closed; no silent reset', async () => {
  let removed = false;
  const storage = createSessionStorage({ get: async () => ({ value: 'broken' }), set: async () => { throw new Error('unavailable'); }, remove: async () => { removed = true; } });
  await assert.rejects(storage.get());
  await assert.rejects(storage.set({ token: 'synthetic' }));
  assert.equal(removed, false);
});

test('invalid shape and oversized data are not written', async () => {
  let writes = 0;
  const storage = createSessionStorage({ get: async () => ({ value: '[]' }), set: async () => { writes++; }, remove: async () => {} });
  await assert.rejects(storage.get());
  await assert.rejects(storage.set([]));
  await assert.rejects(storage.set({ data: 'a'.repeat(17000) }));
  assert.equal(writes, 0);
});

test('origin guard is rechecked when a queued storage operation starts', async () => {
  let finish;
  let current = true;
  let writes = 0;
  const storage = createSessionStorage({ get: () => new Promise(resolve => { finish = resolve; }),
    set: async () => { writes++; }, remove: async () => { writes++; } });
  const read = storage.get();
  await Promise.resolve();
  const save = storage.set({ refresh_token: 'obsolete' }, { isCurrent: () => current });
  const remove = storage.remove({ isCurrent: () => current });
  current = false;
  finish({ value: null });
  await read;
  await assert.rejects(save, /Obsolete/);
  await assert.rejects(remove, /Obsolete/);
  assert.equal(writes, 0);
});
