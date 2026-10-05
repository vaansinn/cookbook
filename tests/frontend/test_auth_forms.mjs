// node --test tests/frontend/test_auth_forms.mjs
// Execute the actual JSX and i18n with deferred auth and a small hook harness.
// These are component contract tests, not browser/password-manager integration tests.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { transformSync } = require('esbuild');
const source = (path) => readFileSync(new URL('../../frontend/src/' + path, import.meta.url), 'utf8');
const dictionaries = Object.fromEntries(['en', 'de'].map((lang) => [lang, JSON.parse(source(`locales/${lang}.json`))]));
const code = new Map();
const flat = (node) => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flat)];

function fixture(page, initialLanguage = 'en') {
  let language = initialLanguage, active, effects = [], tree, focused;
  const instances = new Map(), modules = new Map(), requests = [], navigations = [];
  const auth = { loading: false };
  for (const action of ['login', 'register']) {
    auth[action] = (...args) => {
      auth.loading = true;
      return new Promise((resolve, reject) => requests.push({
        action, args,
        resolve: (applied) => { auth.loading = false; resolve(applied); },
        reject: (data) => { auth.loading = false; reject(data ? { response: { data } } : Error('offline')); },
      }));
    };
  }
  const slot = (initial) => {
    const index = active.index++;
    if (!active.slots.has(index)) active.slots.set(index, typeof initial === 'function' ? initial() : initial);
    return [active.slots, index];
  };
  const react = {
    useState(initial) {
      const [slots, index] = slot(initial);
      return [slots.get(index), (value) => slots.set(index, typeof value === 'function' ? value(slots.get(index)) : value)];
    },
    useRef(initial) { const [slots, index] = slot(() => ({ current: initial })); return slots.get(index); },
    useEffect(effect, deps) {
      const [slots, index] = slot(undefined), previous = slots.get(index);
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) effects.push(effect);
      slots.set(index, deps);
    },
  };
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router-dom': { Link: 'a', useNavigate: () => (path) => navigations.push(path) },
    '../store/useAuthStore': { default: (select) => select(auth) },
    '../api/client': { getSessionRuntime: () => undefined },
    './store/useSettingsStore': { default: (select) => select({ language }) },
    '../components/LangSwitch': { default: () => null },
    '../components/ThemeSwitch': { default: () => null },
    './locales/en.json': { default: dictionaries.en },
    './locales/de.json': { default: dictionaries.de },
  };
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    if (!code.has(path)) code.set(path, transformSync(source(path), { loader: path.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic', format: 'cjs' }).code);
    const module = { exports: {} };
    const localRequire = (name) => {
      if (name === '../i18n') return load('i18n.js');
      if (name === '../components/PasswordField') return load('components/PasswordField.jsx');
      assert.ok(dependencies[name], `Unexpected dependency: ${name}`);
      return { __esModule: true, ...dependencies[name] };
    };
    new Function('require', 'module', 'exports', code.get(path))(localRequire, module, module.exports);
    modules.set(path, module.exports);
    return module.exports;
  }
  function renderNode(node, path = 'root') {
    if (Array.isArray(node)) return node.map((child, i) => renderNode(child, `${path}.${i}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      if (!instances.has(path)) instances.set(path, { slots: new Map(), index: 0 });
      active = instances.get(path); active.index = 0;
      return renderNode(node.type(node.props), `${path}.render`);
    }
    const rendered = { ...node, props: { ...node.props, children: renderNode(node.props.children, `${path}.children`) } };
    if (node.props.ref) node.props.ref.current = { focus: () => { focused = node.props.id; } };
    return rendered;
  }
  const Page = load(`pages/${page}.jsx`).default;
  const render = () => {
    effects = [];
    tree = renderNode(jsx(Page, {}));
    effects.forEach((effect) => effect());
    return flat(tree);
  };
  const find = (predicate) => flat(tree).find(predicate);
  render();
  return {
    render, find, requests, navigations, auth,
    language: (value) => { language = value; render(); },
    focused: () => focused,
    input: (name) => find((node) => node.type === 'input' && node.props.name === name),
    form: () => find((node) => node.type === 'form'),
    submit: () => find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    fill(name, value) { this.input(name).props.onChange({ target: { value } }); render(); },
  };
}

for (const page of ['Login', 'Register']) for (const lang of ['en', 'de']) {
  const isRegister = page === 'Register';
  const strings = dictionaries[lang];
  test(`${page}/${lang}: visible labels, native constraints, autofill and reveal semantics`, () => {
    const f = fixture(page, lang), nodes = f.render();
    const inputs = nodes.filter((node) => node.type === 'input');
    assert.equal(inputs.length, isRegister ? 3 : 2);
    assert.equal(new Set(inputs.map((node) => node.props.id)).size, inputs.length);
    for (const { props } of inputs) {
      assert.ok(props.id && props.name);
      assert.ok(nodes.find((node) => node.type === 'label' && node.props.htmlFor === props.id)?.props.children);
      assert.equal(props.disabled, undefined);
      assert.equal(props.onPaste, undefined);
      assert.equal(props.onCopy, undefined);
      assert.equal(props.onKeyDown, undefined);
    }
    assert.equal(f.input('email').props.autoComplete, 'username');
    assert.equal(f.input('email').props.type, 'email');
    assert.equal(f.input('email').props.autoCapitalize, 'none');
    assert.equal(f.input('email').props.spellCheck, false);
    assert.equal(f.input('email').props.required, true);
    assert.equal(f.input('password').props.autoComplete, isRegister ? 'new-password' : 'current-password');
    assert.equal(f.input('password').props.required, true);
    assert.equal(f.input('password').props.minLength, isRegister ? 8 : undefined);
    if (isRegister) {
      assert.equal(f.input('display_name').props.required, undefined);
      assert.equal(f.input('display_name').props.autoComplete, 'nickname');
      const hint = f.find((node) => node.props.id === f.input('password').props['aria-describedby']);
      assert.equal(hint.props.children, strings.auth_password_hint.replace('{n}', '8'));
    }
    const password = '  pasted password 🔑  ';
    f.fill('password', password);
    const reveal = f.find((node) => node.type === 'button' && node.props.type === 'button');
    assert.equal(reveal.props['aria-label'], strings.auth_show_password);
    assert.equal(reveal.props['aria-controls'], f.input('password').props.id);
    assert.ok(reveal.props.style.minWidth >= 48 && reveal.props.style.minHeight >= 48);
    assert.match(reveal.props.className, /focus-visible:outline/);
    reveal.props.onClick(); f.render();
    assert.equal(f.input('password').props.type, 'text');
    assert.equal(f.input('password').props.value, password);
    const hide = f.find((node) => node.props['aria-label'] === strings.auth_hide_password);
    assert.ok(hide);
    hide.props.onClick(); f.render();
    assert.equal(f.input('password').props.type, 'password');
    assert.equal(f.input('password').props.value, password);
    assert.equal(f.requests.length, 0);
  });

  test(`${page}/${lang}: one request, loading feedback, retained values and explicit-success navigation`, async () => {
    const f = fixture(page, lang);
    f.fill('email', 'cook@example.test'); f.fill('password', '  exact password  ');
    if (isRegister) f.fill('display_name', 'Ada');
    const first = f.submit();
    await f.submit(); // Same-render repeated Enter/click must not issue another request.
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].action, isRegister ? 'register' : 'login');
    assert.deepEqual(f.requests[0].args, isRegister ? ['cook@example.test', 'Ada', '  exact password  '] : ['cook@example.test', '  exact password  ']);
    f.render();
    assert.equal(f.form().props['aria-busy'], true);
    const button = f.find((node) => node.props.type === 'submit');
    assert.equal(button.props.disabled, true);
    const busyText = isRegister ? strings.auth_registering : strings.auth_logging_in;
    assert.equal(button.props.children, busyText);
    assert.equal(f.find((node) => node.props.role === 'status').props.children, busyText);
    assert.ok(f.render().filter((node) => node.type === 'input').every((node) => node.props.readOnly));
    await f.submit(); assert.equal(f.requests.length, 1);
    f.requests[0].resolve(false); await first; f.render();
    assert.deepEqual(f.navigations, [], 'an obsolete store result must not navigate');
    assert.equal(f.form().props['aria-busy'], false);
    assert.equal(f.input('password').props.value, '  exact password  ');
    const retry = f.submit();
    f.requests[1].resolve(true); await retry; f.render();
    assert.deepEqual(f.navigations, ['/']);
  });

  test(`${page}/${lang}: translated errors receive focus, react to locale changes and permit retry`, async () => {
    const f = fixture(page, lang);
    f.fill('email', 'cook@example.test'); f.fill('password', 'password-123');
    const code = isRegister ? 'email_taken' : 'invalid_credentials';
    const first = f.submit(); f.requests[0].reject({ code, error: 'Untranslated server message' }); await first; f.render();
    let alert = f.find((node) => node.props.role === 'alert');
    assert.equal(alert.props.children, strings[`api_${code}`]);
    assert.equal(alert.props.tabIndex, -1);
    assert.equal(f.focused(), alert.props.id);
    assert.equal(f.form().props['aria-describedby'], alert.props.id);
    assert.equal(f.find((node) => node.props.type === 'submit').props.disabled, false);
    assert.equal(f.input('password').props.value, 'password-123');
    const nextLanguage = lang === 'en' ? 'de' : 'en';
    f.language(nextLanguage);
    assert.equal(f.find((node) => node.props.role === 'alert').props.children, dictionaries[nextLanguage][`api_${code}`]);
    for (const data of [undefined, { code: 'unknown_code', error: 'Untranslated server message' }]) {
      const retry = f.submit(); f.render();
      assert.equal(f.find((node) => node.props.role === 'alert'), undefined);
      assert.equal(f.form().props['aria-describedby'], undefined);
      f.requests.at(-1).reject(data); await retry; f.render();
      alert = f.find((node) => node.props.role === 'alert');
      assert.equal(alert.props.children, dictionaries[nextLanguage][isRegister ? 'auth_register_failed' : 'auth_login_failed']);
      assert.equal(f.focused(), alert.props.id);
    }
    assert.deepEqual(f.navigations, []);
  });
}

test('all auth copy has matching, nonempty EN/DE keys without duplicates', () => {
  const authKeys = (lang) => Object.keys(dictionaries[lang]).filter((key) => key.startsWith('auth_')).sort();
  assert.deepEqual(authKeys('en'), authKeys('de'));
  for (const lang of ['en', 'de']) {
    for (const key of authKeys(lang)) assert.ok(dictionaries[lang][key].trim(), `${lang}/${key}`);
    const keys = [...source(`locales/${lang}.json`).matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]);
    assert.equal(new Set(keys).size, keys.length, `${lang}: duplicate locale key`);
  }
});
