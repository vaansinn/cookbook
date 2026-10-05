// Spawned by test_auth_session.mjs in a fresh module graph for each opt-in transport.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createPlanningClient } from '../../frontend/src/api/planning.mjs';
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const transport = process.argv[2] || 'browser';
const values = new Map([['token', 'legacy-bearer'], ['private-planning:v1:outbox:1', 'owner draft']]);
const handlers = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
globalThis.window = { addEventListener: (name, handler) => handlers.set(name, handler) };
const { default: auth } = await import('../../frontend/src/store/useAuthStore.js');
const { default: api, configureNativeApi, configureSessionRuntime } = await import('../../frontend/src/api/client.js');
const { apiFetch, installNativeApiFetch, SESSION_CHANGE_KEY } = await import('../../frontend/src/api/runtimeFetch.mjs');
let saved = null, time = Date.now(), owner = 1, sid = 'A', mode = 'ok', accessExpires = time + 15 * 60000, removeFails = false;
let blockLock = false, waitingSignal;
const lockManager = { request: async (name, options, action) => {
  if (blockLock) return new Promise((_, reject) => {
    waitingSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  return action({ name });
} };
Object.defineProperty(globalThis, 'navigator', { value: { locks: lockManager }, configurable: true });
const calls = [];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const raw = async (input, options = {}) => {
  const request = new Request(typeof input === 'string' ? new URL(input, 'https://localhost') : input, options);
  const body = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
  const data = body ? JSON.parse(body) : undefined;
  calls.push({ url: request.url, headers: request.headers, method: request.method, credentials: request.credentials, data, body, signal: request.signal });
  if (mode === 'offline') return json({ error: 'Unavailable' }, 503);
  if (mode === 'invalid-session' && /\/(logout|me|refresh)$/.test(request.url)) return json({ code: 'invalid_session' }, 401);
  if (mode === 'all-invalid' && request.url.endsWith('/logout-all')) return json({ msg: 'Token has expired' }, 401);
  if (request.url.endsWith('/logout')) return mode === 'logout-fail' ? json({ error: 'Retry logout' }, 503) : json({ ok: true });
  if (/\/auth\/session\/(login|register|refresh)$/.test(request.url)) accessExpires = time + 15 * 60000;
  if (/\/auth\/session\/(login|register|me|refresh)$/.test(request.url)) return json({ user: { id: owner }, session_id: sid,
    expires_at: new Date(accessExpires).toISOString(), session_expires_at: new Date(time + 30 * 86400000).toISOString(), csrf_token: `csrf-${sid}`,
    ...(transport === 'native' ? { token: `access-${sid}`, refresh_token: `refresh-${sid}` } : {}) });
  if (mode === 'write-401') return json({ error: 'expired' }, 401);
  if (request.url.endsWith('/commands')) {
    if (mode === 'command-loss') throw Error('Synthetic response lost');
    return json({ revision: 1 });
  }
  return json({ ok: true });
};
if (transport === 'native') { installNativeApiFetch(raw); configureNativeApi(raw); }
const runtime = configureSessionRuntime({ transport, fetchImpl: raw, now: () => time,
  lockManager, lockTimeoutMs: 15, readCsrfToken: () => `csrf-${sid}`,
  storage: { get: async () => saved, set: async (value) => { saved = value; }, remove: async () => {
    if (removeFails) throw Error('Synthetic vault locked'); saved = null;
  } } });
api.defaults.baseURL = 'https://localhost/api';
assert.equal(auth.getState().token, null);
assert.equal(values.get('token'), 'legacy-bearer');
await auth.getState().login('test@example.test', 'synthetic');
assert.equal(auth.getState().token, 'session:A');
assert.equal(values.has('token'), false);
assert.equal(calls.find((r) => r.url.endsWith('/login')).data.email, 'test@example.test');
assert.equal(calls.find((r) => r.url.endsWith('/login')).data.transport, transport);
const epoch = auth.getState().epoch, generation = auth.getState().requestGeneration;
time += 14 * 60000 + 1;
await Promise.all([api.post('/write', { value: 1 }), apiFetch('https://localhost/api/planning', {
  method: 'POST', body: '{}', headers: { Authorization: 'Bearer session:A' }, credentials: 'omit',
})]);
assert.equal(calls.filter((r) => r.url.endsWith('/refresh')).length, 1);
assert.equal(auth.getState().token, 'session:A');
assert.equal(auth.getState().epoch, epoch);
assert.equal(auth.getState().requestGeneration, generation);
for (const request of calls.filter((r) => /\/(write|planning)$/.test(r.url))) {
  assert.equal(request.headers.get('Authorization'), transport === 'native' ? 'Bearer access-A' : null);
  assert.equal(request.headers.get('X-CSRF-TOKEN'), transport === 'browser' ? 'csrf-A' : null);
  assert.equal(request.credentials, transport === 'browser' ? 'same-origin' : 'omit');
  assert.equal(request.headers.get('X-Cookbook-Session'), 'A');
}
const outbox = new Map();
const planning = createPlanningClient({ lockManager, getSession: () => {
  const state = auth.getState();
  return state.initialized && state.user ? { accountId: state.user.id, token: state.token,
    epoch: state.epoch, requestGeneration: state.requestGeneration } : null;
}, storage: { getItem: (key) => outbox.get(key) ?? null,
  setItem: (key, value) => outbox.set(key, value), removeItem: (key) => outbox.delete(key) } });
time += 14 * 60000 + 1;
await planning.command('plan.create', { name: 'synthetic' }, 0);
assert.equal(planning.pending(), null);
mode = 'command-loss';
await assert.rejects(planning.command('plan.create', { name: '  Exact saved body  ' }, 0));
const durable = [...outbox.values()][0];
const lostBody = calls.at(-1).body;
mode = 'ok'; time += 14 * 60000 + 1;
await runtime.refresh();
assert.equal([...outbox.values()][0], durable);
await planning.retry();
assert.equal(calls.at(-1).body, lostBody);
assert.equal(planning.pending(), null);
planning.dispose();
mode = 'write-401'; const count = calls.length;
await assert.rejects(api.post('/write', {}), (err) => err.response?.status === 401);
assert.equal(calls.length, count + 1);
assert.equal(auth.getState().user.id, 1);
assert.equal(auth.getState().initialized, false);
mode = 'offline'; await auth.getState().init();
assert.equal(auth.getState().user.id, 1);
assert.equal(auth.getState().initError, 'unavailable');
assert.equal(values.get('private-planning:v1:outbox:1'), 'owner draft');
mode = 'ok'; await auth.getState().init();
assert.equal(auth.getState().initialized, true);
owner = 2; sid = 'B';
await auth.getState().login('other@example.test', 'synthetic');
const before = calls.length;
await assert.rejects(api.post('/write', {}, { authOrigin: { token: 'session:A', epoch, requestGeneration: generation } }), { code: 'stale_session' });
assert.equal(calls.length, before);
// Storage payload is never treated as authority, and a retryable failure keeps B.
mode = 'offline';
handlers.get('storage')({ key: SESSION_CHANGE_KEY, newValue: 'forged-user-A' });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(auth.getState().user.id, 2);
assert.equal(auth.getState().initialized, false);
mode = 'ok'; await auth.getState().init();
assert.equal(auth.getState().user.id, 2);
mode = 'logout-fail';
const failed = await auth.getState().logout();
assert.equal(failed.ok, false); assert.equal(failed.revoked, false);
assert.equal(auth.getState().logoutPending, true);
assert.equal(auth.getState().user.id, 2);
assert.equal(auth.getState().initialized, false);
mode = 'ok';
const done = await auth.getState().retryLogout();
assert.equal(done.revoked, true);
assert.equal(auth.getState().user, null);
assert.equal(auth.getState().token, null);
assert.equal(auth.getState().initialized, true);
assert.equal(values.get('private-planning:v1:outbox:1'), 'owner draft');
// A JWT rejection can confirm only the captured current session via fallback,
// never all sessions. Store clears its gate only after that server confirmation.
owner = 4; sid = 'D'; await auth.getState().login('fourth@example.test', 'synthetic');
mode = 'all-invalid';
const narrowed = await auth.getState().logoutAll();
assert.deepEqual(narrowed, { ok: true, revoked: true, allRevoked: false });
assert.equal(calls.at(-1).url.endsWith('/logout'), true);
assert.equal(calls.at(-1).headers.get('X-Cookbook-Session'), 'D');
assert.equal(auth.getState().user, null);
assert.equal(auth.getState().logoutAllPending, false);
assert.equal(auth.getState().initialized, true);
mode = 'ok'; await auth.getState().login('fourth@example.test', 'synthetic');
mode = 'invalid-session';
const invalid = await auth.getState().logout();
assert.equal(invalid.ok, false);
assert.equal(invalid.revoked, false);
assert.equal(invalid.reverify, true);
assert.equal(auth.getState().user.id, 4);
assert.equal(auth.getState().initialized, false, 'private owner stays behind the recovery gate');
assert.equal(auth.getState().logoutPending, false, 'explicit init must not retry the rejected logout forever');
assert.equal(auth.getState().sessionNeedsVerification, true);
assert.equal(auth.getState().logoutError.response.data.code, 'invalid_session');
const rejectedLogouts = calls.filter((r) => r.url.endsWith('/logout')).length;
await auth.getState().init();
assert.equal(calls.filter((r) => r.url.endsWith('/logout')).length, rejectedLogouts);
assert.equal(auth.getState().user, null);
assert.equal(auth.getState().initialized, true, 'explicit verification allows sign-in without asserting revocation');
assert.equal(auth.getState().logoutError, null);
if (transport === 'native') assert.equal(saved.refresh_token, 'refresh-D', 'a 401 alone never deletes durable credentials');
assert.equal(values.get('private-planning:v1:outbox:1'), 'owner draft');
mode = 'ok'; await auth.getState().login('fourth@example.test', 'synthetic');
if (transport === 'browser') {
  owner = 5; sid = 'E'; // Cookie replacement before any notification.
  const mismatch = await auth.getState().logout();
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.revoked, false);
  assert.equal(mismatch.reverify, true);
  assert.equal(auth.getState().user.id, 4);
  const beforeReverify = calls.filter((r) => r.url.endsWith('/logout')).length;
  await auth.getState().init();
  assert.equal(auth.getState().token, 'session:E');
  assert.equal(auth.getState().initialized, true);
  assert.equal(calls.filter((r) => r.url.endsWith('/logout')).length, beforeReverify);
  blockLock = true;
  const beforeTimeout = calls.length;
  const timeout = await auth.getState().logout();
  assert.equal(timeout.ok, false);
  assert.equal(timeout.revoked, false);
  assert.equal(waitingSignal.aborted, true);
  assert.equal(timeout.error.code, 'session_coordination_timeout');
  assert.equal(calls.length, beforeTimeout);
  assert.equal(auth.getState().token, 'session:E');
  assert.equal(auth.getState().initialized, false);
  assert.equal(auth.getState().loading, false);
  assert.equal(auth.getState().initError, 'unavailable', 'existing recovery UI renders this failure');
  assert.equal(auth.getState().logoutPending, true);
  blockLock = false;
  assert.equal((await auth.getState().retryLogout()).revoked, true);
}
// Confirmed deletion cleans only its captured owner; vault failure must retain
// the deletion proof so a retry performs local cleanup, never another DELETE.
owner = 3; sid = 'C'; await auth.getState().login('third@example.test', 'synthetic');
values.set('private-planning:v1:outbox:3', 'delete this owner draft');
removeFails = transport === 'native';
assert.equal((await auth.getState().deleteAccount(3)).deleted, true);
assert.equal(values.has('private-planning:v1:outbox:3'), false);
if (transport === 'native') {
  assert.equal(auth.getState().initError, 'deleted_storage');
  assert.equal(auth.getState().deletionCleanup.sessionCleanup, true);
  const requestCount = calls.length;
  removeFails = false;
  await auth.getState().retryDeletionCleanup();
  assert.equal(calls.length, requestCount);
  assert.equal(auth.getState().user, null);
  assert.equal(auth.getState().token, null);
  assert.equal(auth.getState().initialized, true);
}
runtime.dispose();
console.log(`Session integration passed: ${transport}`);
