import test from 'node:test';
import assert from 'node:assert/strict';
import api, { configureNativeApi, setAuthSessionReader } from '../../frontend/src/api/client.js';
import { installNativeApiFetch } from '../../frontend/src/api/runtimeFetch.mjs';
import { createPlanningClient } from '../../frontend/src/api/planning.mjs';
import { createNativeApiFetch } from '../src/native-fetch.mjs';

const requests = [];
let respond = (options) => ({ status: 200, url: options.url, headers: { 'Content-Type': 'application/json' }, data: { ok: true } });
const fetchImpl = createNativeApiFetch(async (options) => { requests.push(options); return respond(options); });
configureNativeApi(fetchImpl);
installNativeApiFetch(fetchImpl);
setAuthSessionReader(() => ({ token: 'synthetic-token', epoch: 1, requestGeneration: 1 }));

test('Axios native transport preserves JSON bodies and auth interceptors', async () => {
  const reply = await api.post('/reflections', { mutation_id: 'test', outcome: 'happy' });
  assert.equal(reply.data.ok, true);
  const request = requests.at(-1);
  assert.equal(request.url, 'http://127.0.0.1:5100/api/reflections');
  assert.equal(new Headers(request.headers).get('authorization'), 'Bearer synthetic-token');
  assert.deepEqual(JSON.parse(request.data), { mutation_id: 'test', outcome: 'happy' });
  await api.post('/auth/login', { email: 'synthetic@example.invalid', password: 'not-a-real-password' });
  assert.equal(new Headers(requests.at(-1).headers).get('authorization'), null);
});

test('HTTP validation/conflict errors survive Axios rather than becoming success', async () => {
  for (const status of [401, 409, 422, 503]) {
    respond = options => ({ status, url: options.url, headers: {}, data: { error: 'synthetic' } });
    await assert.rejects(api.get('/auth/me', { handlesAuthRejection: true }), error => error.response.status === status);
  }
});

test('planning defaults use the same native transport and keep owner fencing', async () => {
  respond = options => ({ status: 200, url: options.url, headers: {}, data: { revision: 0, plans: [], next_cursor: null } });
  const client = createPlanningClient({ getSession: () => ({ accountId: 'test-account', token: 'planning-token' }) });
  try {
    const result = await client.loadCollection('/plans', 'plans');
    assert.equal(result.revision, 0);
    assert.equal(new Headers(requests.at(-1).headers).get('authorization'), 'Bearer planning-token');
    assert.match(requests.at(-1).url, /^http:\/\/127\.0\.0\.1:5100\/api\/planning\/v1\/plans\?/);
  } finally { client.dispose(); }
});
