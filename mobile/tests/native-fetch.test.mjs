import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeApiFetch } from '../src/native-fetch.mjs';

const nativeUrl = 'http://127.0.0.1:5100/api/recipes';
const reply = (overrides = {}) => ({
  url: nativeUrl,
  status: 200,
  headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'test' },
  data: '{"ok":true}',
  ...overrides,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('native transport rejects explicit cookies and hides cookie response headers', async () => {
  let calls = 0;
  const fetch = createNativeApiFetch(async () => {
    calls++;
    return reply({ headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'synthetic-cookie=not-a-real-credential',
      'Set-Cookie2': 'synthetic-cookie-2=not-a-real-credential',
    } });
  });
  for (const name of ['Cookie', 'cookie2']) {
    await assert.rejects(fetch('/api/recipes', { headers: { [name]: 'synthetic=value' } }));
  }
  assert.equal(calls, 0);
  const response = await fetch('/api/recipes');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('set-cookie2'), null);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls, 1);
});

test('maps both supported URL forms and passes fixed native options and headers', async () => {
  for (const input of ['/api/recipes?search=a%20b', 'https://localhost/api/recipes?search=a%20b']) {
    const calls = [];
    const fetch = createNativeApiFetch(async options => {
      calls.push(options);
      return reply({ url: options.url });
    });
    const response = await fetch(input, { headers: { Authorization: 'Bearer test-token' } });
    assert.ok(response instanceof Response);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('x-request-id'), 'test');
    assert.deepEqual(calls, [{
      url: `${nativeUrl}?search=a%20b`, method: 'GET',
      headers: { authorization: 'Bearer test-token' }, disableRedirects: true,
      responseType: 'text', connectTimeout: 10000, readTimeout: 15000,
    }]);
  }
});

test('HTTP errors remain real Responses with their JSON bodies and never retry', async () => {
  for (const status of [200, 201, 401, 409, 422, 503]) {
    let calls = 0;
    const response = await createNativeApiFetch(async () => {
      calls++;
      return reply({ status, data: `{"status":${status}}` });
    })('/api/recipes');
    assert.equal(response.status, status);
    assert.equal(response.ok, status < 300);
    assert.deepEqual(await response.json(), { status });
    assert.equal(calls, 1);
  }
});

test('reads Axios-style Request text and preserves serialized mutation payload exactly', async () => {
  const payload = '{ "name": "Soup", "amount": 1.00, "items": [2,1] }\n';
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    let sent;
    const fetch = createNativeApiFetch(async options => { sent = options; return reply(); });
    const input = new Request('https://localhost/api/recipes', {
      method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: payload,
    });
    await fetch(input);
    assert.equal(sent.method, method);
    assert.equal(sent.data, payload);
    assert.equal(sent.headers.authorization, 'Bearer token');
    assert.equal(input.bodyUsed, true);
    await fetch('/api/recipes', { method, body: payload });
    assert.equal(sent.data, payload);
    assert.equal(sent.headers['content-type'], 'application/json');
  }
});

test('init overrides Request method, headers and body without reading the old body', async () => {
  const input = new Request('https://localhost/api/recipes', {
    method: 'POST', headers: { Authorization: 'old' }, body: '{"old":true}',
  });
  let sent;
  await createNativeApiFetch(async options => { sent = options; return reply(); })(input, {
    method: 'patch', headers: new Headers({ Authorization: 'new' }), body: '{ "new": true }',
    credentials: 'omit',
  });
  assert.equal(input.bodyUsed, false);
  assert.equal(sent.method, 'PATCH');
  assert.equal(sent.headers.authorization, 'new');
  assert.equal(sent.data, '{ "new": true }');
});

test('supports bodyless methods and null-body responses, including HEAD and 304', async () => {
  for (const status of [204, 205, 304]) {
    const response = await createNativeApiFetch(async () => reply({ status }))('/api/recipes');
    assert.equal(response.status, status);
    assert.equal(response.body, null);
    assert.equal(await response.text(), '');
  }
  for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) {
    const response = await createNativeApiFetch(async options => {
      assert.equal(options.method, method);
      assert.equal(Object.hasOwn(options, 'data'), false);
      return reply();
    })('/api/recipes', { method });
    if (method === 'HEAD') assert.equal(response.body, null);
  }
});

test('preserves JSON returned already decoded by Capacitor', async () => {
  for (const data of [{ message: 'conflict' }, ['a', 1], null, false, 42]) {
    const response = await createNativeApiFetch(async () => reply({ status: 409, data }))('/api/recipes');
    assert.deepEqual(await response.json(), data);
  }
});

test('rejects foreign origins, credentials, traversal and malformed URLs before native invocation', async () => {
  let calls = 0;
  const fetch = createNativeApiFetch(async () => { calls++; return reply(); });
  for (const url of [
    'https://example.com/api/recipes', 'http://localhost/api/recipes',
    'http://127.0.0.1:5100/api/recipes', 'https://localhost:443/api/recipes',
    'https://user:password@localhost/api/recipes', 'https://localhost.evil/api/recipes',
    '//localhost/api/recipes', 'api/recipes', '/other', '/api', '/apiary/recipes',
    '/api/../recipes', '/api/./recipes', '/api/%2e%2e/recipes', '/api/.%2E/recipes',
    '/api/%252e%252e/recipes', '/api/a%2fb', '/api/a%5Cb', '/api/a\\b',
    '/api/recipes#fragment', '/api/recipes#', '/api/%23fragment', '/api/%3Fquery',
    '/api/%zz', '/api/%00', '/api/recipes\n', ' /api/recipes', '/api/recipes?q=bad\\path',
  ]) await assert.rejects(fetch(url), TypeError, url);
  await assert.rejects(fetch(new Request('https://example.com/api/recipes')), TypeError);
  assert.equal(calls, 0);
});

test('rejects non-JSON uploads, credentials and unsupported methods without invoking native', async () => {
  let calls = 0;
  const fetch = createNativeApiFetch(async () => { calls++; return reply(); });
  for (const init of [
    { method: 'OPTIONS' }, { method: 'TRACE' }, { method: 'CONNECT' },
    { credentials: 'include' }, { credentials: 'invalid' }, { credentials: null },
    { method: 'GET', body: '{}' }, { method: 'HEAD', body: '{}' },
    { method: 'POST', body: 'not json' }, { method: 'POST', body: '' },
    { method: 'POST', body: { name: 'Soup' } },
    { method: 'POST', body: new FormData() },
    { method: 'POST', body: new URLSearchParams({ a: 'b' }) },
    { method: 'POST', body: new Blob(['{}'], { type: 'application/json' }) },
    { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } },
    { method: 'POST', body: '{}', headers: { 'Content-Type': 'multipart/form-data' } },
  ]) await assert.rejects(fetch('/api/recipes', init), TypeError);
  await assert.rejects(fetch(new Request('https://localhost/api/recipes', {
    method: 'POST', body: '{}', credentials: 'include',
  })), TypeError);
  await assert.rejects(fetch(new Request('https://localhost/api/recipes', {
    method: 'POST', body: new FormData(),
  })), TypeError);
  assert.equal(calls, 0);
});

test('rejects redirects and any non-exact response URL before exposing response data', async () => {
  for (const overrides of [
    ...[300, 301, 302, 303, 305, 307, 308, 399].map(status => ({ status })),
    ...[undefined, '', '/api/recipes', 'https://localhost/api/recipes',
      'http://localhost:5100/api/recipes', 'https://example.com/api/recipes',
      `${nativeUrl}/`, `${nativeUrl}?extra=true`, `${nativeUrl}#fragment`,
      'http://user:pass@127.0.0.1:5100/api/recipes',
      'http://127.0.0.1:5100/api/other/../recipes',
    ].map(url => ({ url })),
  ]) {
    let calls = 0;
    const fetch = createNativeApiFetch(async () => {
      calls++;
      const result = reply(overrides);
      Object.defineProperty(result, 'data', { get() { assert.fail('must not expose data'); } });
      return result;
    });
    await assert.rejects(fetch('/api/recipes'), TypeError);
    assert.equal(calls, 1);
  }
});

test('rejects before invocation when already aborted, including Request signals', async () => {
  const controller = new AbortController();
  const reason = new DOMException('Cancelled', 'AbortError');
  controller.abort(reason);
  let calls = 0;
  const fetch = createNativeApiFetch(async () => { calls++; return reply(); });
  await assert.rejects(fetch('/api/recipes', { signal: controller.signal }), error => error === reason);
  await assert.rejects(fetch(new Request('https://localhost/api/recipes', {
    signal: controller.signal,
  })), error => error === reason);
  assert.equal(calls, 0);
});

test('abort rejects promptly after invocation and consumes late success or failure without retry', async () => {
  for (const fails of [false, true]) {
    const native = deferred();
    const controller = new AbortController();
    let calls = 0;
    const pending = createNativeApiFetch(() => { calls++; return native.promise; })(
      new Request('https://localhost/api/recipes', { signal: controller.signal }),
    );
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await tick();
    assert.equal(calls, 1);
    controller.abort();
    await rejected;
    if (fails) native.reject(new Error('late native failure'));
    else native.resolve(reply());
    await tick();
    assert.equal(calls, 1);
  }
});

test('abort and deadline cover slow Request.text and consume its late failures', async () => {
  for (const cancellation of ['abort', 'timeout']) {
    for (const fails of [false, true]) {
      const body = deferred();
      const started = deferred();
      const controller = new AbortController();
      const input = new Request('https://localhost/api/recipes', {
        method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      input.text = () => { started.resolve(); return body.promise; };
      let calls = 0;
      const pending = createNativeApiFetch(() => { calls++; return reply(); }, { timeoutMs: 20 })(input);
      const rejected = assert.rejects(pending, { name: cancellation === 'abort' ? 'AbortError' : 'TimeoutError' });
      await started.promise;
      if (cancellation === 'abort') controller.abort();
      await rejected;
      if (fails) body.reject(new Error('late body failure'));
      else body.resolve('{}');
      await tick();
      assert.equal(calls, 0);
    }
  }
});

test('total deadline rejects stalled native calls and consumes late results without retry', async () => {
  for (const fails of [false, true]) {
    const native = deferred();
    let calls = 0;
    const pending = createNativeApiFetch(() => { calls++; return native.promise; }, { timeoutMs: 20 })('/api/recipes');
    await assert.rejects(pending, { name: 'TimeoutError' });
    assert.equal(calls, 1);
    if (fails) native.reject(new Error('late timeout failure'));
    else native.resolve(reply());
    await tick();
    assert.equal(calls, 1);
  }
});

test('native failures, including synchronous throws, propagate without retries', async () => {
  for (const synchronous of [false, true]) {
    const failure = new TypeError('offline');
    let calls = 0;
    const fetch = createNativeApiFetch(() => {
      calls++;
      if (synchronous) throw failure;
      return Promise.reject(failure);
    });
    await assert.rejects(fetch('/api/recipes', { method: 'POST', body: '{}' }), error => error === failure);
    assert.equal(calls, 1);
  }
});

test('removes abort listeners on success, failure, abort and timeout', async () => {
  for (const outcome of ['success', 'failure', 'abort', 'timeout']) {
    const controller = new AbortController();
    const signal = controller.signal;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    let listener;
    let removed = 0;
    signal.addEventListener = (type, callback, options) => { listener = callback; add(type, callback, options); };
    signal.removeEventListener = (type, callback) => { assert.equal(callback, listener); removed++; remove(type, callback); };
    const pending = createNativeApiFetch(() => {
      if (outcome === 'failure') throw new Error('offline');
      if (outcome === 'success') return reply();
      return new Promise(() => {});
    }, { timeoutMs: 20 })('/api/recipes', { signal });
    if (outcome === 'success') await pending;
    else {
      const rejected = assert.rejects(pending);
      if (outcome === 'abort') controller.abort();
      await rejected;
    }
    assert.equal(removed, 1);
  }
});

test('test deadline overrides cannot extend the production bound', () => {
  for (const timeoutMs of [0, -1, 15001, Infinity, NaN, '20']) {
    assert.throws(() => createNativeApiFetch(() => {}, { timeoutMs }), TypeError);
  }
  assert.throws(() => createNativeApiFetch(null), TypeError);
});
