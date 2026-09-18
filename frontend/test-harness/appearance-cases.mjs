// Reuse ONLY the side-effect-free fixture export. shopping-cases performs no
// production imports until its separate boot() is invoked; never invoke it here.
import { createFixture, A as SCOPE } from './shopping-cases.mjs';

const OWNER_A = 910001, OWNER_B = 910002;
const TOKENS = { A: 'synthetic-appearance-A-not-a-jwt', B: 'synthetic-appearance-B-not-a-jwt' };
const GUEST_KEY = 'recipedrawer_settings';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
const settle = async () => { await pause(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); };
async function until(check, message, timeout = 7000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) { const result = check(); if (result) return result; await pause(); }
  throw new Error(`Timed out: ${message}`);
}
const rootNode = () => document.getElementById('mounted-page');
const all = (selector, parent = rootNode()) => [...parent.querySelectorAll(selector)];
const home = () => document.getElementById('actual-home');
const homeButton = (label) => home() && all('button', home()).find((button) => button.textContent.trim() === label);
const selected = (button) => !!button?.style.background && button.style.background.includes('--brand');
const lang = (language) => homeButton(language);
const theme = (dark) => homeButton(dark ? 'Dark' : 'Light') || homeButton(dark ? 'Dunkel' : 'Hell');
function visibleAppearance(language, dark) {
  return selected(lang(language)) && selected(theme(dark)) && !selected(theme(!dark));
}
function click(node, label = 'control') {
  assert(node?.isConnected, `${label}: missing/detached`);
  assert(!node.matches(':disabled'), `${label}: disabled`);
  assert(node.getClientRects().length, `${label}: not visible`);
  const modal = rootNode().querySelector('dialog[open]');
  assert(!modal || modal.contains(node), `${label}: outside active native modal`);
  node.focus(); assert(document.activeElement === node, `${label}: not focusable`); node.click();
}
async function clickReady(find, label) {
  const node = await until(() => { const candidate = find(); return candidate && !candidate.disabled && candidate.getClientRects().length ? candidate : null; }, `${label} enabled`);
  click(node, label);
}

// No browser/global side effects: usable for protocol checks without mounting.
export function fixturePair() {
  const fixtures = { A: createFixture(), B: createFixture() };
  fixtures.A.preferences = { ...fixtures.A.preferences, language: 'de', dark_mode: true };
  fixtures.B.preferences = { ...fixtures.B.preferences, language: 'en', dark_mode: false };
  const calls = [];
  let active = 0;
  return { fixtures, calls, get active() { return active; }, async fetch(url, options = {}) {
    const token = options.headers?.Authorization;
    const name = Object.keys(TOKENS).find((key) => token === `Bearer ${TOKENS[key]}`);
    assert(name, 'Planning transport received guest or unknown credentials');
    calls.push({ account: name, path: url.pathname, method: options.method || 'GET' });
    // Normalize only the fixture's sentinel credential after selecting the
    // account-specific server. No account data is shared across these fixtures.
    active++;
    try { return await fixtures[name].fetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer synthetic-shopping-not-a-jwt' } }); }
    finally { active--; }
  } };
}

export async function boot(sandbox) {
  assert(sandbox?.isolated && window.localStorage === sandbox.storage && window.sessionStorage === sandbox.storage, 'Isolation required before production imports');
  const [{ default: React }, { createRoot }, router, { default: Provider }, { default: Home }, { default: Shopping },
    { default: auth }, { default: settings }, { default: publicApi }] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-router-dom'),
    import('../src/components/AccountAppearanceProvider.jsx'), import('../src/pages/Home.jsx'),
    import('../src/pages/PrivateShoppingPage.jsx'), import('../src/store/useAuthStore.js'),
    import('../src/store/useSettingsStore.js'), import('../src/api/client.js'),
  ]);
  const h = React.createElement;
  let root, pair, epoch = 0, publicCalls = [], protocolErrors = [];
  // Home uses Axios; replace only its transport, retaining real interceptors,
  // recipes/favourites services and hooks. Native XHR/fetch remain blocked.
  publicApi.defaults.adapter = async (config) => {
    const method = (config.method || 'get').toUpperCase(), path = config.url;
    publicCalls.push({ method, path });
    if (method !== 'GET' || !['/dishes', '/filters', '/favorites'].includes(path)) {
      const message = `Unexpected Home transport ${method} ${path}`; protocolErrors.push(message); throw new Error(message);
    }
    const authorization = config.headers?.Authorization;
    if (authorization && !Object.values(TOKENS).some((token) => authorization === `Bearer ${token}`)) {
      protocolErrors.push('Non-synthetic Home credentials'); throw new Error('Non-synthetic Home credentials');
    }
    return { status: 200, statusText: 'OK', config, headers: { 'cache-control': 'no-store' },
      data: path === '/filters' ? { cuisines: [], meal_types: [], methods: [] } : path === '/favorites' ? { dish_slugs: [] } : [] };
  };
  function identity(name) {
    // Synthetic auth transition only; never initialize/login through an API.
    auth.setState({ user: name ? { id: name === 'A' ? OWNER_A : OWNER_B, email: `synthetic-${name}@example.invalid`, display_name: `Synthetic account ${name}` } : null,
      token: name ? TOKENS[name] : null, epoch: ++epoch, requestGeneration: 0,
      initialized: true, initializing: false, loading: false, initError: null, deletionCleanup: null });
  }
  function Navigation() {
    const navigate = router.useNavigate(), location = router.useLocation();
    return h('aside', { id: 'appearance-fixture-controls', 'aria-label': 'TEST ONLY fixture routing and accounts' },
      h('output', { id: 'mounted-route' }, location.pathname + location.search),
      h('button', { type: 'button', 'data-fixture-route': 'home', onClick: () => navigate('/') }, 'TEST ONLY Home'),
      h('button', { type: 'button', 'data-fixture-route': 'shopping', onClick: () => navigate(`/shopping?scope=${SCOPE}`) }, 'TEST ONLY Shopping'),
      ...['A', 'B'].map((name) => h('button', { key: name, type: 'button', 'data-fixture-account': name, onClick: () => identity(name) }, `TEST ONLY account ${name}`)));
  }
  function render(path = '/') {
    root = createRoot(rootNode());
    root.render(h(router.MemoryRouter, { initialEntries: [path] },
      h(Navigation), h(Provider, null, h(router.Routes, null,
        h(router.Route, { path: '/', element: h('div', { id: 'actual-home' }, h(Home)) }),
        h(router.Route, { path: '/shopping', element: h(Shopping) })))));
  }
  async function transportSettled() {
    await until(() => pair.active === 0, 'synthetic planning transport idle');
    await settle();
    // React effects can start the post-ack refresh after the first response.
    await until(() => pair.active === 0, 'post-render planning transport idle');
    await settle();
  }
  async function mount({ account = 'A', guest = { language: 'en', darkMode: false }, configure = () => {}, wait = true } = {}) {
    root?.unmount(); root = null; await settle();
    sandbox.guestWriteFault.enabled = false; sandbox.guestWriteFault.attempts = 0;
    sandbox.storage.clear(); sandbox.storage.setItem(GUEST_KEY, JSON.stringify(guest));
    sandbox.storage.setItem('synthetic-cook-attempt-sentinel', 'unchanged-test-only');
    sandbox.writes.length = 0; sandbox.blocked.length = 0; publicCalls = []; protocolErrors = [];
    pair = fixturePair(); configure(pair); sandbox.transport = pair.fetch;
    settings.setState({ language: guest.language, darkMode: guest.darkMode, appearanceOwner: null, appearanceRevision: -1, storageError: false });
    identity(account); render();
    if (wait) {
      if (account) {
        await until(() => pair.calls.some((call) => call.account === account && call.path === '/api/planning/v1/preferences'), 'initial preference request');
        await transportSettled();
      }
      await until(() => visibleAppearance(account ? pair.fixtures[account].preferences.language : guest.language,
        account ? pair.fixtures[account].preferences.dark_mode : guest.darkMode), 'initial SQL/guest appearance in actual Home controls');
    }
    return pair;
  }
  const guestWrites = () => sandbox.writes.filter((write) => write.key === GUEST_KEY);
  const commands = () => Object.values(pair.fixtures).flatMap((fixture) => fixture.commands);
  const shoppingReady = () => rootNode().querySelector('.ps-layout select:not(:disabled)');
  const route = async (name) => { click(rootNode().querySelector(`[data-fixture-route="${name}"]`), `navigate ${name}`); await settle(); };
  const cases = [
    ['First SQL hydration and account switch never write guest preferences or import them', async () => {
      const p = await mount(); const rawGuest = sandbox.storage.getItem(GUEST_KEY);
      assert(visibleAppearance('de', true), 'Account A not visibly hydrated');
      assert(p.calls.every((call) => call.path === '/api/planning/v1/preferences'), 'Appearance Home loaded planning collections');
      click(rootNode().querySelector('[data-fixture-account="B"]'), 'switch account B');
      await until(() => p.calls.some((call) => call.account === 'B'), 'account B preference request');
      await transportSettled();
      await until(() => home()?.textContent.includes('Synthetic account B') && visibleAppearance('en', false), 'account B replaces A appearance');
      await settle();
      assert(commands().length === 0 && guestWrites().length === 0, 'Hydration/account switch wrote SQL or guest settings');
      assert(sandbox.storage.getItem(GUEST_KEY) === rawGuest, 'Hydration overwrote guest preferences');
    }],
    ['Actual Home and Shopping preference commands persist once without guest dual writes', async () => {
      const p = await mount({ configure: ({ fixtures }) => { fixtures.A.preferences.language = 'en'; fixtures.A.preferences.dark_mode = false; } });
      const f = p.fixtures.A, baseline = f.revision;
      await clickReady(() => lang('de'), 'Home German switch');
      await until(() => f.commands.length === 1 && visibleAppearance('de', false), 'Home SQL language acknowledged/rendered');
      await transportSettled();
      await clickReady(() => theme(true), 'Home dark switch');
      await until(() => f.commands.length === 2 && visibleAppearance('de', true), 'Home SQL theme acknowledged/rendered');
      await transportSettled();
      await route('shopping'); await until(shoppingReady, 'actual Shopping loaded');
      assert(rootNode().querySelector('.private-shopping[lang="de"][data-dark="true"]'), 'Shopping did not reuse saved appearance');
      await clickReady(() => rootNode().querySelector('.ps-preferences button[aria-pressed]'), 'Shopping theme switch');
      await until(() => f.commands.length === 3 && shoppingReady() && rootNode().querySelector('.private-shopping[data-dark="false"]'), 'Shopping SQL theme change');
      await transportSettled();
      await route('home'); await until(() => visibleAppearance('de', false), 'Home reflects Shopping command event');
      root.unmount(); root = null; await settle(); render();
      await until(() => visibleAppearance('de', false), 'fresh provider recovers confirmed SQL values'); await settle();
      assert(f.commands.length === 3 && f.receipts.size === 3 && f.preferenceRevision === 3, 'Duplicate/missing preference commands');
      assert(f.revision === baseline && guestWrites().length === 0, 'Appearance changed domain revision or guest storage');
      const payloads = f.commands.map((raw) => JSON.parse(raw).payload);
      assert(payloads.every((payload, i) => payload.expected_revision === i), 'Preference baseline did not advance independently');
      assert(p.fixtures.B.commands.length === 0, 'Appearance write targeted another account');
    }],
    ['Guest switches make zero SQL calls; signing in does not import guest choices', async () => {
      const p = await mount({ account: null, configure: ({ fixtures }) => { fixtures.A.preferences.language = 'en'; fixtures.A.preferences.dark_mode = false; } });
      await clickReady(() => lang('de'), 'guest German switch'); await settle();
      await clickReady(() => theme(true), 'guest dark switch'); await settle();
      assert(visibleAppearance('de', true), 'Guest switches did not update actual controls');
      assert(p.calls.length === 0 && commands().length === 0, 'Guest appearance touched authenticated planning API');
      const rawGuest = sandbox.storage.getItem(GUEST_KEY), writesBeforeSignIn = guestWrites().length;
      assert(JSON.parse(rawGuest).language === 'de' && JSON.parse(rawGuest).darkMode === true, 'Guest-only storage not saved');
      click(rootNode().querySelector('[data-fixture-account="A"]'), 'synthetic sign-in');
      await until(() => home()?.textContent.includes('Synthetic account A') && visibleAppearance('en', false), 'SQL wins without guest import');
      assert(commands().length === 0 && guestWrites().length === writesBeforeSignIn && sandbox.storage.getItem(GUEST_KEY) === rawGuest, 'Sign-in imported or rewrote guest values');
      await clickReady(() => homeButton('Log out'), 'actual Home logout');
      await until(() => visibleAppearance('de', true) && !home().textContent.includes('Synthetic account A'), 'logout restores guest choices');
      assert(commands().length === 0 && sandbox.storage.getItem(GUEST_KEY) === rawGuest, 'Logout changed SQL or guest preferences');
    }],
    ['Delayed account A reads cannot overwrite B or guest appearance after logout', async () => {
      let delayedA;
      const p = await mount({ wait: false, configure: ({ fixtures }) => {
        fixtures.B.preferences.language = 'de'; fixtures.B.preferences.dark_mode = false;
        delayedA = fixtures.A.delay('/preferences');
      } });
      try {
        await until(() => delayedA.entered, 'A preference read held');
        click(rootNode().querySelector('[data-fixture-account="B"]'), 'switch to B while A delayed');
        await until(() => home()?.textContent.includes('Synthetic account B') && visibleAppearance('de', false), 'B SQL appearance loaded');
        delayedA.release(); await until(() => delayedA.completed, 'A stale response delivered'); await settle();
        assert(visibleAppearance('de', false), 'A stale response overwrote B controls');
        const delayedB = p.fixtures.B.delay('/preferences');
        try {
          window.dispatchEvent(new Event('focus')); await until(() => delayedB.entered, 'B foreground read held');
          await clickReady(() => homeButton('Abmelden'), 'actual logout during read');
          await until(() => visibleAppearance('en', false) && !home().textContent.includes('Synthetic account B'), 'guest defaults restored');
          delayedB.release(); await until(() => delayedB.completed, 'logged-out response delivered'); await settle();
          assert(visibleAppearance('en', false), 'Late B response replaced guest appearance');
        } finally { delayedB.release(); }
        assert(commands().length === 0 && guestWrites().length === 0, 'Delayed reads triggered writes');
      } finally { delayedA.release(); }
    }],
    ['Shopping command supersedes a held same-account preference read; its late response stays ignored', async () => {
      const p = await mount(), f = p.fixtures.A, baseline = f.revision;
      const oldRead = f.delay('/preferences');
      let savedEvents = 0;
      const onSaved = () => { savedEvents++; };
      window.addEventListener('cookbook:account-command-saved', onSaved);
      try {
        // Home has only the provider's planning read. The fixture captures the
        // old dark=true response now; it deliberately does not obey abort.
        window.dispatchEvent(new Event('focus'));
        await until(() => oldRead.entered, 'same-account provider read held');
        await until(() => theme(true)?.disabled, 'Home appearance controls disabled during held hydration');
        // Detach this one gate without releasing it. Later reads must be able
        // to see the new SQL revision while the captured old response waits.
        assert(f.gates.get('/preferences') === oldRead, 'Unexpected preference delay gate');
        f.gates.delete('/preferences');
        await route('shopping'); await until(shoppingReady, 'Shopping loads independently of held provider read');
        assert(rootNode().querySelector('.private-shopping[data-dark="true"]'), 'Expected old SQL theme before command');
        await clickReady(() => rootNode().querySelector('.ps-preferences button[aria-pressed]'), 'actual Shopping theme command during held provider read');
        await until(() => f.commands.length === 1 && savedEvents === 1 && shoppingReady()
          && rootNode().querySelector('.private-shopping[data-dark="false"]'), 'Shopping command acknowledged with saved event');
        await route('home');
        await until(() => visibleAppearance('de', false) && !theme(false).disabled, 'provider applies newer SQL before old response is released');
        assert(!oldRead.completed && p.active === 1, 'Old preference read was not held through newer appearance application');
        oldRead.release(); await until(() => oldRead.completed, 'old same-account response delivered last');
        await transportSettled();
        assert(visibleAppearance('de', false) && !theme(false).disabled, 'Late old response overwrote or blocked newer Home appearance');
        assert(f.commands.length === 1 && f.receipts.size === 1 && f.preferenceRevision === 1 && savedEvents === 1, 'Refresh duplicated preference command or event');
        assert(f.revision === baseline && p.fixtures.B.commands.length === 0 && guestWrites().length === 0, 'Refresh changed domain, other account or guest storage');
      } finally { oldRead.release(); window.removeEventListener('cookbook:account-command-saved', onSaved); }
    }],
    ['Guest storage write failure shows a warning, preserves saved bytes and makes zero SQL requests', async () => {
      const p = await mount({ account: null });
      const rawGuest = sandbox.storage.getItem(GUEST_KEY);
      sandbox.guestWriteFault.enabled = true;
      try {
        await clickReady(() => theme(true), 'actual guest theme switch with synthetic storage failure');
        await until(() => visibleAppearance('en', true) && all('[role="status"]').some((node) =>
          node.getClientRects().length && node.textContent.includes('Device preferences could not be saved.')), 'visible guest save-failure warning');
        await settle();
        assert(sandbox.guestWriteFault.attempts === 1 && guestWrites().length === 1 && guestWrites()[0].failed === true, 'Expected exactly one failed guest persistence attempt');
        assert(sandbox.storage.getItem(GUEST_KEY) === rawGuest, 'Failed write changed persisted guest bytes');
        assert(p.calls.length === 0 && commands().length === 0, 'Guest storage failure triggered SQL read, write or import');
      } finally { sandbox.guestWriteFault.enabled = false; }
    }],
    ['Navigating Home to Shopping during a held appearance save clears pending after acknowledgement without focus', async () => {
      const p = await mount({ configure: ({ fixtures }) => { fixtures.A.preferences.language = 'en'; fixtures.A.preferences.dark_mode = false; } });
      const f = p.fixtures.A, baseline = f.revision, send = sandbox.transport;
      let release, entered = false, completed = false, savedEvents = 0;
      const held = new Promise((resolve) => { release = resolve; });
      const onSaved = () => { savedEvents++; };
      window.addEventListener('cookbook:account-command-saved', onSaved);
      // Hold the acknowledgement AFTER the synthetic server saves. The real
      // adapter retains its exact pending request until this response arrives.
      sandbox.transport = async (url, options = {}) => {
        const response = await send(url, options);
        if (!entered && options.method === 'POST' && url.pathname === '/api/planning/v1/commands') {
          entered = true; await held; completed = true;
        }
        return response;
      };
      try {
        await clickReady(() => lang('de'), 'actual Home preference save before navigation');
        await until(() => entered && f.commands.length === 1, 'saved command acknowledgement held');
        await route('shopping');
        await until(() => rootNode().querySelector('.ps-layout select:disabled')
          && f.calls.some((call) => call.path === `/shopping/scopes/${SCOPE}`), 'new Shopping leaf has loaded while pending request remains');
        assert(!completed && savedEvents === 0, 'Command acknowledged before navigation assertion');
        const readsBefore = f.calls.filter((call) => call.method === 'GET').length;
        release();
        await until(() => completed && savedEvents === 1 && shoppingReady(), 'same-page command event enables Shopping without focus');
        await transportSettled();
        assert(rootNode().querySelector('.private-shopping[lang="de"]'), 'Shopping did not retain confirmed language');
        assert(!rootNode().querySelector('.pp-recovery'), 'Shopping still shows unresolved command recovery');
        assert(f.calls.filter((call) => call.method === 'GET').length > readsBefore, 'No revalidation followed the command acknowledgement');
        assert(f.commands.length === 1 && f.receipts.size === 1 && f.preferenceRevision === 1 && f.revision === baseline, 'Navigation retried or duplicated the appearance write');
        assert(guestWrites().length === 0 && p.fixtures.B.commands.length === 0, 'Navigation wrote guest or other-account preferences');
      } finally { release(); sandbox.transport = send; window.removeEventListener('cookbook:account-command-saved', onSaved); }
    }],
  ];
  const run = document.getElementById('run-tests'), show = document.getElementById('show-fixture'), summary = document.getElementById('summary');
  document.getElementById('boot-status').textContent = 'Isolation installed — appearance v3 (seven cases). Actual provider + Home/Shopping + switches + shared hook; synthetic transports only.';
  run.disabled = show.disabled = false;
  show.addEventListener('click', async () => {
    run.disabled = show.disabled = true;
    try { await mount(); summary.removeAttribute('data-result'); summary.textContent = 'Manual synthetic fixture; no case results implied.'; }
    catch (error) { summary.dataset.result = 'FAIL'; summary.textContent = error.message; }
    finally { run.disabled = show.disabled = false; }
  });
  run.addEventListener('click', async () => {
    run.disabled = show.disabled = true; document.getElementById('results').replaceChildren(); let passed = 0;
    for (const [name, execute] of cases) {
      const li = document.createElement('li'); li.textContent = `RUNNING — ${name}`; document.getElementById('results').append(li);
      try {
        await execute();
        assert(!sandbox.blocked.length && !protocolErrors.length && Object.values(pair.fixtures).every((f) => !f.failures.length), 'Isolation/protocol violation');
        assert(publicCalls.every((call) => call.method === 'GET'), 'Unexpected Home API write');
        assert(sandbox.storage.getItem('synthetic-cook-attempt-sentinel') === 'unchanged-test-only', 'Unrelated synthetic storage changed');
        li.dataset.result = 'PASS'; li.textContent = `PASS — ${name}`; passed++;
      } catch (error) { li.dataset.result = 'FAIL'; li.textContent = `FAIL — ${name}\n${error.message}`; console.error(`TEST ONLY appearance: ${name}`, error); }
      finally { for (const fixture of Object.values(pair?.fixtures || {})) for (const gate of fixture.gates.values()) gate.release(); root?.unmount(); root = null; await settle(); }
      summary.textContent = `${passed}/${cases.length} passed so far.`;
    }
    summary.dataset.result = passed === cases.length ? 'PASS' : 'FAIL';
    summary.textContent = `${passed}/${cases.length} mounted appearance cases passed. UI + transport/storage evidence; no real accounts, APIs or native persistence.`;
    run.disabled = show.disabled = false;
  });
}
