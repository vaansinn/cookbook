// Pure routing/VM and in-memory bundle tests. No listener, browser, DB or fetch.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { createCleanupConfirmation } from '../../frontend/test-harness/worker-cleanup.mjs';
import { ASSETS, PROBES, ORIGIN, CONFIRM_KEY, CONFIRM_VALUE, CSP,
  validateStart, workerReleases, createLab, buildFixture, start } from '../../frontend/test-harness/worker-server.mjs';

const source = await readFile(new URL('../../frontend/public/sw.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../frontend/test-harness/worker-update.html', import.meta.url), 'utf8');
const page = await readFile(new URL('../../frontend/test-harness/worker-page.mjs', import.meta.url), 'utf8');
const cook = await readFile(new URL('../../frontend/test-harness/worker-cook.jsx', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../../frontend/test-harness/worker-server.mjs', import.meta.url), 'utf8');
const run = 'ab'.repeat(16);
const lab = () => createLab({ workerSource: source, html, bundle: '/* synthetic test bundle */', run });
const get = (subject, path, headers = {}) => subject.route({ path, headers: { host: '127.0.0.1:5189', ...headers } });
const control = (subject, key, value, headers = {}, body) => subject.route({ path: '/worker-control', method: 'POST',
  body: body ?? JSON.stringify({ key, value }), headers: { host: '127.0.0.1:5189', origin: ORIGIN,
    'x-worker-run': run, 'content-type': 'application/json', ...headers } });

test('server opt-in is exact, with no host/port/root override or implicit start', async () => {
  validateStart({ [CONFIRM_KEY]: CONFIRM_VALUE }, ['--serve']);
  for (const args of [[], ['--serve', '--port', '5173'], ['--host', '0.0.0.0'], ['--serve', '--serve'], ['--reset']]) {
    assert.throws(() => validateStart({ [CONFIRM_KEY]: CONFIRM_VALUE }, args));
  }
  for (const value of [undefined, '', 'yes', CONFIRM_VALUE + ' ']) {
    await assert.rejects(start({ [CONFIRM_KEY]: value }, ['--serve']));
  }
});

test('release B bytes are exact current source; A changes only its cache namespace', () => {
  const releases = workerReleases(source);
  assert.equal(releases.B, source);
  assert.match(releases.sha256, /^[a-f0-9]{64}$/);
  assert.equal(releases.A.replace('const SHELL_CACHE = "recipe-drawer-shell-worker-a";',
    source.match(/const SHELL_CACHE = .*;/)[0]), source);
  assert.notEqual(releases.cacheA, releases.cacheB);
  assert.throws(() => workerReleases('unrecognized future worker'));
  assert.throws(() => workerReleases(source + '\n' + source.match(/const SHELL_CACHE = .*;/)[0]));
});

test('non-loopback hosts and any credential-bearing request are refused before controls', () => {
  for (const host of ['localhost:5189', '127.0.0.1:5173', '0.0.0.0:5189', 'example.test:5189', '127.0.0.1:5189.evil', undefined]) {
    assert.equal(get(lab(), '/', { host }).status, 403);
  }
  for (const headers of [{ cookie: 'private-cookie' }, { cookie: '' }, { authorization: 'Bearer private' },
    { origin: 'https://production.test' }, { origin: 'null' }]) {
    const subject = lab();
    assert.equal(control(subject, 'release', 'B', headers).status, 403);
    assert.equal(subject.status().release, 'A');
  }
});

test('control writes require exact same Origin, run token, JSON type and closed shape', () => {
  for (const headers of [{ origin: undefined }, { 'x-worker-run': 'old-run' }, { 'x-worker-run': undefined },
    { 'content-type': 'text/plain' }]) assert.equal(control(lab(), 'release', 'B', headers).status, 403);
  for (const body of ['null', '[]', '{', '{}', '{"key":"release","value":"B","extra":true}', 'x'.repeat(513)]) {
    assert.ok(control(lab(), '', '', {}, body).status >= 400);
  }
  for (const [key, value] of [['release', 'C'], ['retainA', 'false'], ['assetMode', 'proxy'],
    ['apiMode', 'http://production.test'], ['__proto__', {}], ['host', 'remote']]) {
    assert.equal(control(lab(), key, value).status, 400);
  }
});

test('fixed route allowlist never proxies app, filesystem or remote URLs', () => {
  for (const path of ['/api/auth/me', '/api/planning/v1/workspace', '/api/cook-log', '/health', '/.env',
    '/@fs/D:/Projects/cookbook/.env', '/src/main.jsx', '/dish/private', '/worker-control?reset=1',
    '/sw.js', `/sw.js?run=${run}&extra=1`, '/assets/arbitrary.js']) assert.equal(get(lab(), path).status, 404, path);
  for (const path of ['https://external.test/', '//external.test/']) assert.equal(get(lab(), path).status, 400);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) assert.equal(lab().route({ path: '/api/auth/me', method, headers: { host: '127.0.0.1:5189' } }).status, 405);
});

test('HTML has run identity and release-specific hashed entry without inline scripts', () => {
  const subject = lab();
  const response = get(subject, '/');
  assert.equal(response.status, 200);
  assert.ok(response.body.includes(run) && response.body.includes(ASSETS.A));
  assert.ok(!response.body.includes('__WORKER_'));
  assert.match(response.body, /<script type="module" src="\/assets\/index-WorkerA01.js"><\/script>/);
  assert.equal(control(subject, 'release', 'B').status, 200);
  assert.ok(get(subject, '/').body.includes(ASSETS.B));
  assert.equal(control(subject, 'release', 'A').status, 409);
});

test('worker B is served unchanged, uncached and with root scope only on exact run URL', () => {
  const subject = lab(); control(subject, 'release', 'B');
  const response = get(subject, `/sw.js?run=${run}`);
  assert.equal(response.body, source);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.headers['Service-Worker-Allowed'], '/');
  assert.equal(get(subject, '/sw.js?run=' + 'cd'.repeat(16)).status, 404);
});

test('headers confine frame, worker and connection surfaces to isolated origin', () => {
  assert.match(CSP, /connect-src 'self'/);
  assert.match(CSP, /worker-src 'self'/);
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(CSP, /form-action 'none'/);
  assert.match(CSP, /script-src 'self';/);
  const response = get(lab(), '/');
  assert.equal(response.headers['Content-Security-Policy'], CSP);
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(response.headers['Referrer-Policy'], 'no-referrer');
  assert.ok(!Object.hasOwn(response.headers, 'Access-Control-Allow-Origin'));
});

test('probe faults are bounded and server control/shell remain reachable', () => {
  const subject = lab();
  for (const mode of ['drop', '500', '404', 'wrong-mime', 'online']) {
    assert.equal(control(subject, 'assetMode', mode).status, 200);
    const response = get(subject, PROBES.A);
    if (mode === 'drop') assert.equal(response.drop, true);
    else assert.equal(response.status, ['500', '404'].includes(mode) ? Number(mode) : 200);
    assert.equal(get(subject, '/worker-control').status, 200);
    assert.equal(get(subject, '/').status, 200);
    assert.equal(get(subject, ASSETS.A).status, 200);
  }
  assert.equal(subject.status().counts.dropped, 1);
  assert.equal(subject.status().counts.probes, 5);
});

test('old asset retention is an explicit independent server switch', () => {
  const subject = lab(); control(subject, 'release', 'B');
  assert.equal(get(subject, ASSETS.A).status, 200);
  assert.equal(get(subject, PROBES.A).status, 200);
  control(subject, 'retainA', false);
  assert.equal(get(subject, ASSETS.A).status, 404);
  assert.equal(get(subject, PROBES.A).status, 404);
  assert.equal(get(subject, ASSETS.B).status, 200);
  control(subject, 'retainA', true);
  assert.equal(get(subject, ASSETS.A).status, 200);
});

test('synthetic private endpoint is no-store and faults never affect actual APIs', () => {
  const subject = lab();
  for (const account of ['A', 'B']) {
    const result = get(subject, '/api/worker-private', { 'x-worker-account': account });
    assert.deepEqual(JSON.parse(result.body), { synthetic: true, account });
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
  control(subject, 'apiMode', 'drop');
  assert.equal(get(subject, '/api/worker-private').drop, true);
  assert.equal(get(subject, '/api/auth/me').status, 404);
  assert.equal(subject.status().counts.privateApi, 3);
});

test('browser boot fences native app stores before dynamic actual CookMode import', () => {
  assert.ok(page.indexOf("lock(window, 'localStorage'") < page.indexOf("await import('./worker-cook.jsx')"));
  assert.match(page, /worker-harness:\$\{run\}:synthetic-storage/);
  assert.doesNotMatch(page, /nativeSession\.clear\(/);
  assert.match(page, /credentials: 'omit'/);
  assert.match(page, /redirect: 'error'/);
  assert.match(page, /existing\.every\(owns\)/);
  assert.match(page, /names\.every\(\(name\) => ownedCaches\.includes\(name\)\)/);
  assert.match(page, /cook\?\.dispose\(\)/);
  assert.match(page, /if \(ownedCaches\.includes\(name\)\) await caches\.delete\(name\)/);
  assert.match(cook, /import\('\.\.\/src\/pages\/CookMode.jsx'\)/);
  assert.match(cook, /api\.defaults\.adapter/);
  assert.match(cook, /response: \{ status: 503/);
  assert.doesNotMatch(cook, /fetch\(/);
});

test('fixture never forces worker activation/client claim or auto reload on update', () => {
  assert.doesNotMatch(page, /\.skipWaiting\s*\(|\.claim\s*\(|\.postMessage\s*\(/);
  const update = page.slice(page.indexOf("button('update'"), page.indexOf("button('compare'"));
  assert.match(update, /registration\.update\(\)/);
  assert.doesNotMatch(update, /location\.reload|location\.assign|location\.href\s*=/);
  assert.match(page, /current\.record\.timer\.deadline === captured\.record\.timer\.deadline/);
  assert.match(page, /controllerChanges === captured\.controllerChanges/);
  assert.match(page, /registration\?\.waiting\?\.state === 'installed'/);
});

test('server has fixed bind, bounded requests and no filesystem-serving/proxy path', () => {
  assert.match(serverSource, /server\.listen\(5189, '127\.0\.0\.1'/);
  assert.match(serverSource, /Buffer\.byteLength\(body\) > 512/);
  assert.match(serverSource, /server\.requestTimeout = 5000/);
  assert.doesNotMatch(serverSource, /from ['"]dotenv|import\(['"]dotenv|createProxy|http\.request\(|https\.request\(|fetch\(/);
  assert.match(serverSource, /write: false/);
  assert.match(serverSource, /if \(result\.drop\) \{ req\.socket\.destroy\(\)/);
});

function browserResponse(path, { status = 200, body = 'retained', mime = 'text/javascript' } = {}) {
  const value = new Response(body, { status, headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=0, must-revalidate' } });
  Object.defineProperties(value, { url: { value: new URL(path, ORIGIN).href }, type: { value: 'basic' }, redirected: { value: false } });
  value.clone = () => browserResponse(path, { status, body, mime });
  return value;
}

function workerVM(workerSource, stores) {
  const listeners = new Map();
  let network = async (req) => browserResponse(req.url);
  const caches = { keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const cache = stores.get(name);
      return { match: async (req) => cache.get(req.url)?.clone(), put: async (req, value) => cache.set(req.url, value.clone()), delete: async (req) => cache.delete(req.url) };
    } };
  vm.runInNewContext(workerSource, { URL, Response, caches, fetch: (req) => network(req),
    self: { location: { origin: ORIGIN }, addEventListener: (name, fn) => listeners.set(name, fn),
      skipWaiting: () => assert.fail('Forced activation'), clients: { claim: () => assert.fail('Forced claim') } } });
  return { setNetwork: (fn) => { network = fn; },
    async activate() { let pending; listeners.get('activate')({ waitUntil: (value) => { pending = value; } }); await pending; },
    fetch(path) { let result; listeners.get('fetch')({ request: new Request(new URL(path, ORIGIN)), respondWith: (value) => { result = value; } }); return result; } };
}
const offline = () => { throw new TypeError('Synthetic origin connection failure'); };

test('actual worker B removes A cache on activation but preserves unrelated cache', async () => {
  const releases = workerReleases(source), stores = new Map();
  const a = workerVM(releases.A, stores);
  await a.fetch(PROBES.A);
  stores.set('worker-harness-unrelated-' + run, new Map());
  assert.ok(stores.has(releases.cacheA));
  const b = workerVM(releases.B, stores);
  await b.activate();
  assert.ok(!stores.has(releases.cacheA));
  assert.ok(stores.has('worker-harness-unrelated-' + run));
  b.setNetwork(offline);
  assert.equal((await b.fetch(PROBES.A)).status, 503);
});

test('retained old server asset can populate B cache; 404 then failure cannot recover it', async () => {
  const stores = new Map(), b = workerVM(source, stores);
  assert.equal((await b.fetch(PROBES.A)).status, 200);
  b.setNetwork(offline);
  assert.equal((await b.fetch(PROBES.A)).status, 200);
  b.setNetwork(() => browserResponse(PROBES.A, { status: 404 }));
  assert.equal((await b.fetch(PROBES.A)).status, 404);
  b.setNetwork(offline);
  assert.equal((await b.fetch(PROBES.A)).status, 503);
});

test('500 is observable and does not poison old asset cache, wrong MIME invalidates it', async () => {
  const b = workerVM(source, new Map());
  await b.fetch(PROBES.B);
  b.setNetwork(() => browserResponse(PROBES.B, { status: 500 }));
  assert.equal((await b.fetch(PROBES.B)).status, 500);
  b.setNetwork(offline);
  assert.equal((await b.fetch(PROBES.B)).status, 200);
  b.setNetwork(() => browserResponse(PROBES.B, { mime: 'text/html' }));
  await b.fetch(PROBES.B); b.setNetwork(offline);
  assert.equal((await b.fetch(PROBES.B)).status, 503);
});

test('real worker policy never caches synthetic account API reads', async () => {
  const stores = new Map(), b = workerVM(source, stores);
  await b.fetch('/api/worker-private');
  assert.equal(stores.size, 0);
  b.setNetwork(offline);
  assert.equal((await b.fetch('/api/worker-private')).status, 503);
});

test('actual CookMode harness bundles in memory with no server or browser', async () => {
  const built = await buildFixture();
  assert.equal(built.workerSource, source);
  assert.equal(built.html, html);
  assert.ok(built.bundle.length > 10000);
  assert.match(built.bundle, /Synthetic worker cooking fixture/);
  assert.match(built.bundle, /function CookMode\(/);
  assert.match(built.bundle, /function createCookTimerController\(/);
  assert.doesNotMatch(built.bundle, /\/\/@ sourceMappingURL=/);
});

test('cleanup review and cancel never invoke cleanup; direct confirm without review refuses', async () => {
  let calls = 0; const states = [];
  const gate = createCleanupConfirmation({ cleanup: async () => { calls++; }, render: (state) => states.push(state), onError: assert.fail });
  assert.equal(await gate.confirm(), false);
  assert.equal(gate.ask(), true);
  assert.equal(states.at(-1).reviewing, true);
  assert.equal(calls, 0);
  assert.equal(gate.cancel(), true);
  assert.equal(states.at(-1).reviewing, false);
  assert.equal(await gate.confirm(), false);
  assert.equal(calls, 0);
});

test('explicit cleanup confirmation is single-flight and cannot repeat after completion', async () => {
  let calls = 0, release; const states = [];
  const pending = new Promise((resolve) => { release = resolve; });
  const gate = createCleanupConfirmation({ cleanup: async () => { calls++; await pending; }, render: (state) => states.push(state), onError: assert.fail });
  gate.ask(); const confirmed = gate.confirm();
  assert.equal(calls, 1); assert.equal(states.at(-1).busy, true);
  assert.equal(await gate.confirm(), false); assert.equal(gate.ask(), false); assert.equal(gate.cancel(), false);
  release(); assert.equal(await confirmed, true);
  assert.deepEqual(states.at(-1), { reviewing: false, busy: false, complete: true });
  assert.equal(await gate.confirm(), false); assert.equal(gate.ask(), false); assert.equal(calls, 1);
});

test('partial cleanup failure is disclosed and requires a fresh explicit review', async () => {
  let calls = 0; const errors = [], states = [];
  const gate = createCleanupConfirmation({ cleanup: async () => { calls++; throw Error('synthetic cleanup failure'); },
    render: (state) => states.push(state), onError: (error) => errors.push(error.message) });
  gate.ask(); assert.equal(await gate.confirm(), false);
  assert.deepEqual(errors, ['synthetic cleanup failure']);
  assert.deepEqual(states.at(-1), { reviewing: false, busy: false, complete: false });
  assert.equal(await gate.confirm(), false); assert.equal(calls, 1);
  gate.ask(); gate.cancel(); assert.equal(calls, 1);
});

test('browser cleanup uses explicit in-page controls, focus and no blocking native dialog', () => {
  assert.doesNotMatch(page, /(?:^|[^\w$.])(?:window\.)?(?:confirm|alert|prompt)\s*\(/);
  assert.match(html, /id="cleanup-review" hidden role="region"/);
  assert.match(html, /id="cleanup-confirm" type="button"/);
  assert.match(html, /id="cleanup-cancel" type="button"/);
  assert.match(page, /getElementById\('cleanup-cancel'\)\.focus\(\)/);
  assert.match(page, /getElementById\('controls'\)\.disabled = busy \|\| complete/);
  assert.match(page, /getElementById\('cleanup'\)\.onclick = \(\) => cleanupConfirmation\.ask\(\)/);
  assert.match(page, /getElementById\('cleanup-confirm'\)\.onclick = \(\) => cleanupConfirmation\.confirm\(\)/);
  assert.match(page, /assert\(regs\.every\(owns\)/);
});
