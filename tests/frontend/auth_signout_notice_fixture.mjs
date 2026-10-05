// Fresh module graph per transport/locale. Real runtime + Zustand + Login JSX +
// i18n; synthetic transport only. Static React rendering checks visible markup,
// not browser routing, focus or live screen-reader announcements.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const [transport, language] = process.argv.slice(2);
const values = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
globalThis.window = { addEventListener() {} };
const { default: auth } = await import('../../frontend/src/store/useAuthStore.js');
const { configureSessionRuntime, getSessionRuntime } = await import('../../frontend/src/api/client.js');
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
let cookie = null, saved = null, mode = 'partial', owner = 1, logoutGate;
const calls = [];
const metadata = () => ({ user: { id: owner }, session_id: `S${owner}`, csrf_token: `csrf-${owner}`,
  expires_at: new Date(Date.now() + 900000).toISOString(),
  ...(transport === 'native' ? { token: `access-${owner}`, refresh_token: `refresh-${owner}` } : {}) });
const runtime = configureSessionRuntime({ transport, changeStorage: globalThis.localStorage,
  lockManager: { request: async (_name, _options, action) => action() }, readCsrfToken: () => cookie?.csrf_token,
  storage: { get: async () => saved, set: async (value) => { saved = value; }, remove: async () => { saved = null; } },
  fetchImpl: async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (/\/(login|register)$/.test(url)) {
      if (mode === 'login-reject') return json({ code: 'invalid_credentials' }, 401);
      cookie = metadata(); return json(cookie);
    }
    if (url.endsWith('/me') || url.endsWith('/refresh')) return cookie ? json(cookie) : json({ code: 'invalid_session' }, 401);
    if (url.endsWith('/logout-all')) {
      if (mode !== 'all-confirmed') return json({ code: 'invalid_session' }, 401);
      cookie = null; return json({ ok: true });
    }
    if (url.endsWith('/logout')) {
      if (logoutGate) return logoutGate;
      if (mode === 'fallback-reject') return json({ code: 'invalid_session' }, 401);
      cookie = null; return json({ ok: true });
    }
    throw Error(`Unexpected synthetic request: ${url}`);
  },
});
const source = (path) => readFileSync(new URL('../../frontend/src/' + path, import.meta.url), 'utf8');
const dictionaries = Object.fromEntries(['en', 'de'].map((lang) => [lang, JSON.parse(source(`locales/${lang}.json`))]));
const modules = new Map();
const dependencies = {
  react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
  'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children), useNavigate: () => () => {} },
  // SSR normally uses Zustand's initial snapshot. Select the current real store
  // state here so these explicit renders represent the post-action Login screen.
  '../store/useAuthStore': { default: (select) => select(auth.getState()) },
  '../api/client': { getSessionRuntime },
  './store/useSettingsStore': { default: (select) => select({ language }) },
  '../components/LangSwitch': { default: () => null },
  '../components/ThemeSwitch': { default: () => null },
  './locales/en.json': { default: dictionaries.en }, './locales/de.json': { default: dictionaries.de },
};
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const code = transformSync(source(path), { loader: path.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic', format: 'cjs' }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => {
    if (name === '../i18n') return load('i18n.js');
    if (name === '../components/PasswordField') return load('components/PasswordField.jsx');
    assert.ok(dependencies[name], `Unexpected dependency: ${name}`);
    return { __esModule: true, ...dependencies[name] };
  }, module, module.exports);
  modules.set(path, module.exports); return module.exports;
}
const Login = load('pages/Login.jsx').default;
const render = () => renderToStaticMarkup(React.createElement(Login));
const notice = () => render().match(/<p\b[^>]*id="login-signout-notice"[^>]*>(.*?)<\/p>/)?.[0];
const expectNotice = () => {
  assert.equal(auth.getState().signoutNotice, 'other_sessions_unconfirmed');
  const html = notice(); assert.ok(html);
  assert.ok(html.includes(dictionaries[language].account_signout_partial));
  assert.match(html, /role="alert"/); assert.match(html, /aria-atomic="true"/);
  assert.doesNotMatch(html, /sr-only|hidden/);
  assert.match(render(), /aria-describedby="login-signout-notice"/);
};
const login = () => auth.getState().login('synthetic@example.test', 'synthetic-password');
assert.equal(auth.getState().signoutNotice, null); assert.equal(notice(), undefined);
await login();
const guestTransitions = [];
const unsubscribe = auth.subscribe((state) => { if (state.initialized && !state.user) guestTransitions.push(state.signoutNotice); });
assert.deepEqual(await auth.getState().logoutAll(), { ok: true, revoked: true, allRevoked: false });
unsubscribe();
assert.ok(guestTransitions.length > 0);
assert.ok(guestTransitions.every((value) => value === 'other_sessions_unconfirmed'), 'notice and guest transition are atomic');
assert.equal(calls.at(-1).headers.get('X-Cookbook-Session'), 'S1');
expectNotice();
await auth.getState().init(); expectNotice();
await auth.getState().syncSessionFromStorage(); expectNotice();
assert.ok(!JSON.stringify([...values]).includes('other_sessions_unconfirmed'), 'notice is never persisted');
mode = 'login-reject'; await assert.rejects(login()); expectNotice();
mode = 'partial'; await login();
assert.equal(auth.getState().signoutNotice, null); assert.equal(notice(), undefined);
await auth.getState().logoutAll(); expectNotice();
owner = 2; await auth.getState().register('new@example.test', 'New cook', 'synthetic-password');
assert.equal(auth.getState().signoutNotice, null); assert.equal(notice(), undefined);
await auth.getState().logoutAll(); expectNotice();
owner = 3; cookie = metadata(); saved = { refresh_token: 'refresh-3', session_id: 'S3' };
await auth.getState().syncSessionFromStorage();
assert.equal(auth.getState().user.id, 3);
assert.equal(auth.getState().signoutNotice, null); assert.equal(notice(), undefined);
await auth.getState().logout(); assert.equal(notice(), undefined);
await login(); mode = 'all-confirmed';
assert.equal((await auth.getState().logoutAll()).allRevoked, true); assert.equal(notice(), undefined);
await login(); mode = 'fallback-reject';
assert.equal((await auth.getState().logoutAll()).ok, false);
assert.equal(auth.getState().signoutNotice, null); assert.equal(notice(), undefined);
// A stale completion must not leave a warning on a newly verified account.
mode = 'partial'; await auth.getState().init();
let release;
logoutGate = new Promise((resolve) => { release = resolve; });
const staleLogout = auth.getState().logoutAll();
while (!calls.at(-1).url.endsWith('/logout')) await new Promise((resolve) => setImmediate(resolve));
owner = 4; cookie = metadata(); saved = { refresh_token: 'refresh-4', session_id: 'S4' };
const replacement = auth.getState().syncSessionFromStorage();
release(json({ ok: true }));
assert.equal((await staleLogout).stale, true); await replacement;
assert.equal(auth.getState().user.id, 4);
assert.equal(auth.getState().signoutNotice, null); assert.equal(notice(), undefined);
runtime.dispose();
