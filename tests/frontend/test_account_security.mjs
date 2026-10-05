// node --test tests/frontend/test_account_security.mjs
// Actual components + i18n, synthetic accounts/transport, deferred responses.
// No user account, mail files, browser credentials or running server are used.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { posix } from 'node:path';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { transformSync } = require('esbuild');
const source = (path) => readFileSync(new URL('../../frontend/src/' + path, import.meta.url), 'utf8');
const dictionaries = Object.fromEntries(['en', 'de'].map((lang) => [lang, JSON.parse(source(`locales/${lang}.json`))]));
const compiled = new Map();
const flatten = (node) => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flatten)];
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture(entry, { runtime = true, language = 'en', guest = false, verified = false } = {}) {
  let state = { user: guest ? null : { id: 1, email: 'synthetic@example.test', email_verified: verified }, token: guest ? null : 'session:synthetic-1',
    epoch: 1, requestGeneration: 1, initialized: true, initializing: false, loading: false };
  const requests = [], signouts = [], navigations = [], instances = new Map(), modules = new Map();
  let active, tree, effects, visited, dirty, focused, initCount = 0, cancelledFrames = [];
  const auth = (select = (value) => value) => select(state);
  auth.getState = () => state;
  auth.subscribe = () => () => {};
  const change = (patch) => { state = { ...state, ...patch }; };
  state.init = async () => { initCount++; change({ requestGeneration: state.requestGeneration + 1,
    user: state.user && { ...state.user, email_verified: true } }); };
  state.login = () => { throw Error('Recovery must never log in'); };
  for (const action of ['logout', 'logoutAll', 'retryLogout']) state[action] = () => {
    change({ requestGeneration: state.requestGeneration + 1, loading: true });
    return new Promise((resolve, reject) => signouts.push({ action,
      resolve: (result = { ok: false, revoked: false }) => { change({ loading: false }); resolve(result); },
      reject: () => { change({ loading: false }); reject(Error('synthetic logout failure')); },
    }));
  };
  const api = { post: (path, body, config) => new Promise((resolve, reject) => requests.push({ path, body, config,
    resolve: (data = { ok: true }) => resolve({ data }), reject: (code = 'invalid_token', status = 400) => reject({ response: { data: { code, error: 'Never render raw server text' }, status } }),
  })) };
  const slot = (initial) => {
    const i = active.index++;
    if (!active.slots.has(i)) active.slots.set(i, typeof initial === 'function' ? initial() : initial);
    return [active, i];
  };
  const react = {
    useState(initial) { const [instance, i] = slot(initial); return [instance.slots.get(i), (value) => {
      const next = typeof value === 'function' ? value(instance.slots.get(i)) : value;
      if (!Object.is(next, instance.slots.get(i))) dirty = true;
      instance.slots.set(i, next);
    }]; },
    useRef(initial) { const [instance, i] = slot(() => ({ current: initial })); return instance.slots.get(i); },
    useEffect(effect, deps) { const [instance, i] = slot(undefined), previous = instance.slots.get(i);
      if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) effects.push(() => {
        instance.cleanups.get(i)?.(); instance.cleanups.set(i, effect());
      });
      instance.slots.set(i, deps);
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const settings = (select) => select({ language }); settings.getState = () => ({ language });
  const stubs = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router-dom': { Link: 'a', Navigate: 'navigate', useNavigate: () => (path) => navigations.push(path) },
    'store/useAuthStore': { default: auth }, 'store/useSettingsStore': { default: settings },
    'store/useFavoritesStore': { default: (select) => select({ slugs: new Set(), load() {}, toggle() {} }) },
    'api/client': { default: api, getSessionRuntime: () => runtime ? {} : undefined },
    'api/recipes': { discoveryIdentity: (value) => value.token, startDiscoveryRead: () => () => {}, fetchDishes() {}, fetchFilters() {} },
    'components/LangSwitch': { default: () => null }, 'components/ThemeSwitch': { default: () => null }, 'components/BottomNav': { default: () => null },
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    if (!compiled.has(path)) compiled.set(path, transformSync(source(path), { loader: path.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic', format: 'cjs' }).code);
    const module = { exports: {} };
    const localRequire = (name) => {
      const resolved = name.startsWith('.') ? posix.normalize(posix.join(posix.dirname(path), name)) : name;
      if (stubs[resolved]) return { __esModule: true, ...stubs[resolved] };
      if (resolved.endsWith('.css')) return {};
      if (resolved.endsWith('.json')) return { __esModule: true, default: JSON.parse(source(resolved)) };
      return load(resolved === 'i18n' ? 'i18n.js' : `${resolved}.jsx`);
    };
    new Function('require', 'module', 'exports', 'requestAnimationFrame', compiled.get(path))(localRequire, module, module.exports, (fn) => cancelledFrames.push(fn));
    modules.set(path, module.exports); return module.exports;
  }
  function renderNode(node, path = 'root') {
    if (Array.isArray(node)) return node.map((child, i) => renderNode(child, `${path}.${i}`));
    if (!node || typeof node !== 'object') return node;
    path += `:${node.key ?? ''}`;
    if (typeof node.type === 'function') {
      visited.add(path);
      if (!instances.has(path)) instances.set(path, { slots: new Map(), cleanups: new Map(), refs: [], index: 0 });
      active = instances.get(path); active.index = 0;
      return renderNode(node.type(node.props), `${path}.render`);
    }
    const rendered = { ...node, props: { ...node.props, children: renderNode(node.props.children, `${path}.children`) } };
    if (node.props.ref) {
      node.props.ref.current = { focus: () => { focused = node.props.id || node.props.children; } };
      active?.refs.push(node.props.ref);
    }
    return rendered;
  }
  const Page = load(entry).default;
  const render = () => {
    for (let count = 0; count < 10; count++) {
      dirty = false; effects = []; visited = new Set(); tree = renderNode(jsx(Page, {}));
      for (const [path, instance] of instances) if (!visited.has(path)) {
        for (const cleanup of instance.cleanups.values()) cleanup?.();
        for (const ref of instance.refs) ref.current = null;
        instances.delete(path);
      }
      effects.forEach((effect) => effect());
      if (!dirty) break;
    }
    const frames = cancelledFrames; cancelledFrames = []; frames.forEach((fn) => fn());
    return flatten(tree);
  };
  const find = (predicate) => flatten(tree).find(predicate);
  render();
  return { render, find, requests, signouts, navigations, auth, change,
    focused: () => focused, initCount: () => initCount,
    text: () => JSON.stringify(tree, (key, value) => key === 'ref' ? undefined : value),
    button: (key) => find((node) => node.type === 'button' && node.props.children === dictionaries[language][key]),
    input: (id) => find((node) => node.type === 'input' && node.props.id === id),
    click(key) { const button = this.button(key); assert.ok(button, key); button.props.onClick(); render(); },
    fill(id, value) { this.input(id).props.onChange({ target: { value } }); render(); },
    submit() { find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); render(); },
    unmount() { for (const instance of instances.values()) for (const cleanup of instance.cleanups.values()) cleanup?.(); instances.clear(); },
  };
}

for (const language of ['en', 'de']) {
  const strings = dictionaries[language];
  test(`${language}: recovery and account controls are inert without a runtime`, () => {
    const recovery = fixture('pages/AccountRecoveryPage.jsx', { runtime: false, language, guest: true });
    assert.equal(recovery.find((node) => node.type === 'navigate').props.to, '/login');
    const security = fixture('components/AccountSecurity.jsx', { runtime: false, language });
    assert.equal(security.render().length, 0);
    const login = fixture('pages/Login.jsx', { runtime: false, language, guest: true });
    assert.equal(login.find((node) => node.props.to === '/account/recovery'), undefined);
    assert.equal(recovery.requests.length + security.requests.length + login.requests.length, 0);
    const candidate = fixture('pages/Login.jsx', { language, guest: true });
    assert.ok(candidate.find((node) => node.props.to === '/account/recovery'));
  });

  test(`${language}: manual reset, enumeration-safe request, exact payload and no automatic login`, async () => {
    const f = fixture('pages/AccountRecoveryPage.jsx', { guest: true, language });
    assert.equal(f.requests.length, 0);
    f.fill('reset-email', 'synthetic@example.test');
    f.submit(); f.submit();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].path, '/auth/session/forgot-password');
    assert.deepEqual(f.requests[0].body, { email: 'synthetic@example.test' });
    assert.equal(f.input('reset-email').props.readOnly, true);
    f.requests[0].resolve(); await tick(); f.render();
    assert.ok(f.text().includes(strings.account_reset_requested));
    assert.equal(f.focused(), 'reset-feedback');
    f.fill('reset-code', '  synthetic-single-use-code  '); f.fill('reset-password', '  exact new password  ');
    assert.equal(f.input('reset-code').props.autoComplete, 'one-time-code');
    assert.equal(f.input('reset-password').props.autoComplete, 'new-password');
    f.submit(); f.submit();
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[1].path, '/auth/session/reset-password');
    assert.deepEqual(f.requests[1].body, { token: 'synthetic-single-use-code', password: '  exact new password  ' });
    assert.equal(f.requests[1].config.authOrigin.requestGeneration, 1);
    f.requests[1].resolve(); await tick(); f.render();
    assert.ok(f.text().includes(strings.account_reset_complete));
    assert.equal(f.input('reset-password'), undefined);
    assert.equal(f.find((node) => node.type === 'form'), undefined);
    assert.equal(f.find((node) => node.props.to === '/login').props.reloadDocument, true, 'explicit sign-in link reboots session verification after reset');
    assert.equal(f.initCount(), 0); assert.deepEqual(f.navigations, []); assert.equal(f.signouts.length, 0);
  });

  test(`${language}: invalid/expired codes, throttling and mail failures remain localized and retryable`, async () => {
    const f = fixture('pages/AccountRecoveryPage.jsx', { guest: true, language });
    f.click('account_have_code'); f.fill('reset-code', 'synthetic-code'); f.fill('reset-password', 'password-123');
    for (const [code, key] of [['invalid_token', 'account_code_invalid'], ['rate_limited', 'account_rate_limited'], ['mail_unavailable', 'account_mail_unavailable'], ['invalid_input', 'account_input_invalid'], ['unknown', 'account_request_failed']]) {
      f.submit(); f.requests.at(-1).reject(code); await tick(); f.render();
      assert.equal(f.find((node) => node.props.role === 'alert').props.children, strings[key]);
      assert.equal(f.focused(), 'reset-feedback');
      assert.equal(f.input('reset-password').props.value, 'password-123');
      assert.equal(f.button('account_reset_submit').props.disabled, false);
    }
    f.submit(); f.requests.at(-1).resolve({}); await tick(); f.render();
    assert.equal(f.find((node) => node.props.role === 'alert').props.children, strings.account_request_failed);
  });

  test(`${language}: verification is optional, manual and refreshes only after explicit success`, async () => {
    const f = fixture('components/AccountSecurity.jsx', { language });
    assert.ok(f.text().includes(strings.account_email_unverified));
    f.click('account_verification_request'); f.button('account_verification_request').props.onClick();
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].path, '/auth/session/verification/request');
    assert.deepEqual(f.requests[0].body, {});
    f.requests[0].resolve(); await tick(); f.render();
    f.fill('verification-code', ' synthetic-verify-code '); f.submit();
    assert.equal(f.requests[1].path, '/auth/session/verification/confirm');
    assert.deepEqual(f.requests[1].body, { token: 'synthetic-verify-code' });
    f.requests[1].resolve(); await tick(); f.render();
    assert.equal(f.initCount(), 1);
    assert.ok(f.text().includes(strings.account_email_verified));
    assert.equal(f.input('verification-code'), undefined);
    assert.ok(f.button('account_logout_all'));
    for (const verified of [undefined, null, 'true', 1]) {
      const unknown = fixture('components/AccountSecurity.jsx', { language, verified });
      // undefined uses the fixture default; explicitly remove the server field.
      if (verified === undefined) { unknown.change({ user: { id: 1 } }); unknown.render(); }
      assert.ok(!unknown.text().includes(strings.account_email_verified));
      assert.ok(!unknown.text().includes(strings.account_email_unverified));
      assert.ok(unknown.input('verification-code'));
    }
  });

  test(`${language}: logout-all requires confirmation and catches returned/throwing failures`, async () => {
    const f = fixture('components/AccountSecurity.jsx', { language });
    f.click('account_logout_all'); assert.equal(f.signouts.length, 0);
    assert.equal(f.focused(), 'logout-all-confirmation');
    f.click('settings_cancel'); assert.equal(f.signouts.length, 0);
    assert.equal(f.focused(), strings.account_logout_all);
    f.click('account_logout_all');
    f.click('account_logout_all_confirm_button');
    assert.equal(f.signouts.length, 1); assert.equal(f.signouts[0].action, 'logoutAll');
    // Its own generation change remounts Settings controls. Global recovery
    // receives store-owned logout errors; a previous form never sets new state.
    f.signouts[0].reject(); await tick(); f.render();
    assert.equal(f.find((node) => node.props.role === 'alert'), undefined);
  });
}

for (const entry of ['pages/AccountRecoveryPage.jsx', 'components/AccountSecurity.jsx']) {
  for (const staleFailure of [false, true]) for (const changeKind of ['owner', 'generation', 'unmount']) {
    test(`${entry}: fences ${changeKind} ${staleFailure ? 'failure' : 'success'} and resets drafts`, async () => {
      const recovery = entry.startsWith('pages');
      const f = fixture(entry, { guest: recovery });
      if (recovery) { f.click('account_have_code'); f.fill('reset-code', 'old-code'); f.fill('reset-password', 'old-password'); }
      else f.fill('verification-code', 'old-code');
      const oldSubmit = f.find((node) => node.type === 'form').props.onSubmit;
      f.submit();
      if (changeKind === 'owner') f.change({ user: { id: 2, email_verified: false }, token: 'session:synthetic-2', epoch: 2 });
      if (changeKind === 'generation') f.change({ requestGeneration: 2 });
      if (changeKind === 'unmount') f.unmount(); else f.render();
      oldSubmit({ preventDefault() {} }); assert.equal(f.requests.length, 1, 'old closures cannot dispatch under a replacement owner');
      staleFailure ? f.requests[0].reject() : f.requests[0].resolve();
      await tick();
      oldSubmit({ preventDefault() {} }); assert.equal(f.requests.length, 1, 'settled unmounted forms cannot dispatch again');
      assert.equal(f.initCount(), 0, 'stale verification cannot reinitialize the new owner');
      if (changeKind !== 'unmount') {
        f.render();
        assert.equal(f.find((node) => node.props.role === 'alert'), undefined);
        assert.equal(f.input(recovery ? 'reset-password' : 'verification-code')?.props.value || '', '');
        assert.ok(!f.text().includes('old-code'));
        assert.ok(!f.text().includes(dictionaries.en.account_reset_complete));
      }
    });
  }
}

for (const entry of ['pages/Home.jsx', 'components/AuthRecovery.jsx']) for (const rejection of [false, true]) {
  test(`${entry}: asynchronous logout ${rejection ? 'rejection' : 'negative result'} is visible without navigation`, async () => {
    const f = fixture(entry);
    const key = entry.startsWith('pages') ? 'auth_logout' : 'auth_recovery_signout';
    const click = f.button(key).props.onClick;
    click(); click(); f.render();
    assert.equal(f.signouts.length, 1);
    rejection ? f.signouts[0].reject() : f.signouts[0].resolve(); await tick(); f.render();
    assert.ok(f.text().includes(dictionaries.en.account_signout_failed));
    assert.deepEqual(f.navigations, []);
    assert.ok(f.find((node) => node.props.role === 'alert'));
    f.change({ user: { id: 2 }, token: 'session:synthetic-2', epoch: 2 }); f.render();
    assert.ok(!f.text().includes(dictionaries.en.account_signout_failed));
  });
}

test('AuthRecovery preserves logout-all retry intent across a page unmount', async () => {
  const f = fixture('components/AuthRecovery.jsx');
  f.change({ initError: 'unavailable', logoutPending: true, logoutAllPending: true, logoutError: Error('synthetic') }); f.render();
  assert.ok(f.text().includes(dictionaries.en.account_signout_failed));
  f.click('account_logout_all_retry'); assert.equal(f.signouts[0].action, 'retryLogout');
  assert.equal(f.button('account_logout_all_retry').props.disabled, true);
  f.signouts[0].reject(); await tick();
});

for (const entry of ['pages/Home.jsx', 'components/AuthRecovery.jsx']) for (const kind of ['owner', 'generation']) {
  test(`${entry}: logout failure from a previous ${kind} cannot appear or disable the replacement`, async () => {
    const f = fixture(entry);
    const key = entry.startsWith('pages') ? 'auth_logout' : 'auth_recovery_signout';
    const oldClick = f.button(key).props.onClick;
    oldClick(); f.render();
    f.change(kind === 'owner' ? { user: { id: 2 }, token: 'session:synthetic-2', epoch: 2, loading: false }
      : { requestGeneration: f.auth.getState().requestGeneration + 1, loading: false });
    f.render(); oldClick(); assert.equal(f.signouts.length, 1);
    f.signouts[0].reject(); await tick(); f.render();
    assert.ok(!f.text().includes(dictionaries.en.account_signout_failed));
    assert.equal(f.button(key).props.disabled, false);
  });
}

test('recovery never reads or consumes URL codes; added copy is paired and unique', () => {
  assert.doesNotMatch(source('pages/AccountRecoveryPage.jsx'), /useSearchParams|location\.|URLSearchParams|localStorage|sessionStorage|\.login\(/);
  for (const lang of ['en', 'de']) {
    const keys = [...source(`locales/${lang}.json`).matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]);
    assert.equal(new Set(keys).size, keys.length);
    for (const key of Object.keys(dictionaries.en).filter((key) => key.startsWith('account_'))) assert.ok(dictionaries[lang][key]?.trim(), `${lang}/${key}`);
  }
  assert.match(source('App.jsx'), /path="\/account\/recovery" element=\{<AccountRecoveryPage \/>\}/);
});
