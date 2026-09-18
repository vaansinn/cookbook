// Standalone test origin. No Vite/API proxy, dotenv, database, or outbound fetch.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'http://127.0.0.1:5189';
export const CONFIRM_KEY = 'COOKBOOK_WORKER_HARNESS_CONFIRM';
export const CONFIRM_VALUE = 'isolated-loopback-worker-fixtures';
export const ASSETS = { A: '/assets/index-WorkerA01.js', B: '/assets/index-WorkerB01.js' };
export const PROBES = { A: '/assets/index-ProbeA001.js', B: '/assets/index-ProbeB001.js' };
const modes = ['online', 'drop', '500', '404', 'wrong-mime'];
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self'; img-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function validateStart(env, argv) {
  if (env[CONFIRM_KEY] !== CONFIRM_VALUE || argv.length !== 1 || argv[0] !== '--serve') {
    throw Error('Explicit isolated worker-harness confirmation and --serve required; no host/port/path overrides');
  }
}

export function workerReleases(source) {
  const pattern = /const SHELL_CACHE = `\$\{CACHE_PREFIX\}([^`]+)`;/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1 || !source.includes('const CACHE_PREFIX = "recipe-drawer-";')) {
    throw Error('Worker cache declaration changed; review harness before use');
  }
  const cacheB = 'recipe-drawer-' + matches[0][1];
  const cacheA = 'recipe-drawer-shell-worker-a';
  if (cacheB === cacheA) throw Error('Fixture namespace collides');
  return {
    A: source.replace(pattern, 'const SHELL_CACHE = "recipe-drawer-shell-worker-a";'),
    B: source, cacheA, cacheB,
    sha256: createHash('sha256').update(source).digest('hex'),
  };
}

export function createLab({ workerSource, html, bundle, run = randomBytes(16).toString('hex') }) {
  if (!/^[a-f0-9]{32}$/.test(run)) throw Error('Invalid harness run identity');
  const workers = workerReleases(workerSource);
  const state = { release: 'A', retainA: true, assetMode: 'online', apiMode: 'online' };
  const counts = { probes: 0, privateApi: 0, dropped: 0 };
  const status = () => ({ ...state, run, origin: ORIGIN, cacheA: workers.cacheA, cacheB: workers.cacheB,
    counts: { ...counts }, unrelatedCache: `worker-harness-unrelated-${run}`, workerSha256: workers.sha256, assets: ASSETS, probes: PROBES });
  const response = (status, body, type = 'text/plain', cache = 'no-store') => ({ status, body,
    headers: { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP } });
  function failure(mode) {
    if (mode === 'drop') { counts.dropped++; return { drop: true }; }
    if (mode === '500' || mode === '404') return response(Number(mode), 'Synthetic origin failure');
    if (mode === 'wrong-mime') return response(200, '<p>Synthetic wrong MIME</p>', 'text/html');
    return null;
  }
  function route({ method = 'GET', path = '/', headers = {}, body = '' }) {
    if (headers.host !== '127.0.0.1:5189' || headers.cookie !== undefined || headers.authorization !== undefined) {
      return response(403, 'Dedicated loopback origin without credentials required');
    }
    if (headers.origin && headers.origin !== ORIGIN) return response(403, 'Foreign origin refused');
    if (!path.startsWith('/') || path.startsWith('//')) return response(400, 'Invalid path');
    const url = new URL(path, ORIGIN);
    if (url.pathname === '/worker-control' && !url.search) {
      if (method === 'GET') return response(200, JSON.stringify(status()), 'application/json');
      if (method !== 'POST' || headers.origin !== ORIGIN || headers['x-worker-run'] !== run
          || headers['content-type'] !== 'application/json' || Buffer.byteLength(body) > 512) return response(403, 'Control request refused');
      let value;
      try { value = JSON.parse(body); } catch { return response(400, 'Invalid control'); }
      if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== 2
          || !Object.hasOwn(value, 'key') || !Object.hasOwn(value, 'value')) return response(400, 'Invalid control');
      const valid = value.key === 'release' ? ['A', 'B'].includes(value.value)
        : value.key === 'retainA' ? typeof value.value === 'boolean'
          : ['assetMode', 'apiMode'].includes(value.key) && modes.includes(value.value);
      if (!valid) return response(400, 'Invalid control');
      // A->B only: never pretend to reset an installed worker/occupied caches.
      if (value.key === 'release' && state.release === 'B' && value.value === 'A') return response(409, 'Start a new isolated origin session instead of reverting');
      state[value.key] = value.value;
      return response(200, JSON.stringify(status()), 'application/json');
    }
    if (method !== 'GET') return response(405, 'No application mutations');
    if (url.pathname === '/sw.js' && url.search === `?run=${run}`) {
      return { ...response(200, workers[state.release], 'text/javascript'),
        headers: { ...response(200, '').headers, 'Content-Type': 'text/javascript', 'Service-Worker-Allowed': '/' } };
    }
    if (url.search) return response(404, 'Not an allowlisted fixture URL');
    if (['/', '/index.html'].includes(url.pathname)) {
      return response(200, html.replaceAll('__WORKER_RUN__', run).replaceAll('__WORKER_ENTRY__', ASSETS[state.release]),
        'text/html', 'public, max-age=0, must-revalidate');
    }
    const release = Object.entries(ASSETS).find(([, path]) => path === url.pathname)?.[0];
    if (release) {
      if (release === 'A' && !state.retainA) return response(404, 'Old release asset removed');
      return response(200, bundle, 'text/javascript', 'public, max-age=0, must-revalidate');
    }
    const probe = Object.entries(PROBES).find(([, path]) => path === url.pathname)?.[0];
    if (probe) {
      counts.probes++;
      if (probe === 'A' && !state.retainA) return response(404, 'Old release asset removed');
      return failure(state.assetMode) || response(200, `export default "SYNTHETIC-${probe}";`, 'text/javascript', 'public, max-age=0, must-revalidate');
    }
    if (url.pathname === '/api/worker-private') {
      counts.privateApi++;
      return failure(state.apiMode) || response(200, JSON.stringify({ synthetic: true,
        account: headers['x-worker-account'] === 'B' ? 'B' : 'A' }), 'application/json');
    }
    return response(404, 'Not an allowlisted fixture route; no proxy exists');
  }
  return { route, status };
}

export async function buildFixture() {
  // Local declared dependency only, no install and no production build output.
  const { build } = await import('esbuild');
  const result = await build({ entryPoints: [fileURLToPath(new URL('./worker-page.mjs', import.meta.url))],
    bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
    loader: { '.css': 'empty' }, sourcemap: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env.DEV': 'true' } });
  if (result.outputFiles.length !== 1) throw Error('Expected one in-memory harness bundle');
  return { bundle: result.outputFiles[0].text,
    workerSource: await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    html: await readFile(new URL('./worker-update.html', import.meta.url), 'utf8') };
}

export async function start(env = process.env, argv = process.argv.slice(2)) {
  validateStart(env, argv);
  const lab = createLab(await buildFixture());
  const server = http.createServer(async (req, res) => {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (Buffer.byteLength(body) > 512) { res.writeHead(413); res.end('Control too large'); return; }
      }
      const result = lab.route({ method: req.method, path: req.url, headers: req.headers, body });
      if (result.drop) { req.socket.destroy(); return; }
      res.writeHead(result.status, result.headers); res.end(result.body);
    } catch { res.writeHead(400); res.end('Harness request refused'); }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxHeadersCount = 30;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(5189, '127.0.0.1', resolve); });
  console.log(`TEST ONLY ${ORIGIN}/ — synthetic worker update + actual CookMode; no API proxy`);
  console.log(`Current worker SHA256 ${lab.status().workerSha256}; do not use an origin with existing app data`);
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch(() => { console.error('Worker harness refused/failed: check confirmation, local dependencies and unused loopback port. No reset attempted.'); process.exitCode = 1; });
}
