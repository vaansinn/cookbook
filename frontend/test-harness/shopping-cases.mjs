// Production imports occur only in boot(), after shopping-sandbox's barriers.
// This sidecar imports neither the old harness nor any mocked hook/page.
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const A = id(10), B = id(11), PLAN = id(1), MEAL = id(2), EVENT = id(3), ACCOUNT = 900002;
const KEY = JSON.stringify(['synthetic-pasta', 'dry', 'g']);
const SALT = JSON.stringify(['synthetic-salt', 'fine', 'cupboard']);
const clone = (value) => JSON.parse(JSON.stringify(value));
const assert = (value, message) => { if (!value) throw new Error(message); };
const response = (data, status = 200) => new Response(JSON.stringify(data),
  { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const source = (item, ingredient, unit, amount, dish, state = 'needed', confirmed = false) => ({
  id: JSON.stringify([id(item), ingredient, ingredient === 'synthetic-salt' ? 'fine' : 'dry', unit]),
  item_id: id(item), group_id: `synthetic-${dish}`, dish_title: `Synthetic ${dish}`,
  meal_title: item === 20 ? 'Friday meal' : 'Saturday event', date: item === 20 ? '2026-09-18' : '2026-09-19',
  amount, unit, state, review: false, confirmed,
});
function row(key, label, sources, required, mode = 'measured') {
  return { key, label, ingredient_id: key === SALT ? 'synthetic-salt' : 'synthetic-pasta',
    form: key === SALT ? 'fine' : 'dry', category: key === SALT ? 'herbs' : 'cupboard',
    purchase_mode: mode, unit: mode === 'measured' ? 'g' : null, required,
    total: required, extra: '0.000', extra_state: 'needed', extra_review: false, sources,
    state: 'needed', review: false, remaining: required };
}
function summarize(row) {
  const parts = [...row.sources, ...(row.personal_id || Number(row.extra) > 0 ? [{ state: row.extra_state, review: row.extra_review }] : [])];
  const covered = parts.filter((p) => !p.review && ['have', 'bought'].includes(p.state));
  row.review = parts.some((p) => p.review);
  row.state = row.review ? 'review' : covered.length === parts.length && parts.length
    ? covered.every((p) => p.state === covered[0].state) ? covered[0].state : 'covered' : covered.length ? 'partial' : 'needed';
  row.remaining = row.total === null ? null : (row.personal_id ? covered.length ? 0 : Number(row.total)
    : Math.max(0, Number(row.total) - row.sources.reduce((sum, s) => sum + (!s.review && s.state !== 'needed' ? Number(s.amount) : 0), 0)
      - (!row.extra_review && row.extra_state !== 'needed' ? Number(row.extra) : 0))).toFixed(3);
}

export function createFixture() {
  const scopes = [
    { id: A, owner_type: 'plan', owner_id: PLAN, mode: 'all', selection: [], start_date: null, end_date: null },
    { id: B, owner_type: 'plan', owner_id: PLAN, mode: 'meals', selection: [`meal:${MEAL}`], start_date: null, end_date: null },
  ];
  const personal = { ...row(JSON.stringify(['personal-addition', id(30)]), 'Synthetic private bread', [], '1.000'),
    personal_id: id(30), unit: 'loaf', category: 'other' };
  const pasta = row(KEY, 'Synthetic pasta', [source(20, 'synthetic-pasta', 'g', '220.000', 'Bolognese'),
    source(21, 'synthetic-pasta', 'g', '600.000', 'Tomato', 'have', true)], '820.000');
  const salt = row(SALT, 'Synthetic salt', [source(20, 'synthetic-salt', 'g', '2.000', 'Bolognese'),
    source(21, 'synthetic-salt', null, null, 'Tomato')], null, 'check_cupboard');
  const state = { revision: 7, preferenceRevision: 0,
    preferences: { language: 'en', dark_mode: false, shopping_layout: 'dish', shopping_scope_id: A },
    scopes, rows: { [A]: [pasta, salt, personal], [B]: [row(KEY, 'Synthetic pasta', [clone(pasta.sources[0])], '220.000')] },
    commands: [], calls: [], receipts: new Map(), gates: new Map(), undo: null, mode: null, failures: [], additions: 0 };
  state.delay = (path) => {
    let release;
    const gate = { entered: false, completed: false, promise: new Promise((resolve) => { release = resolve; }) };
    gate.release = () => { if (state.gates.get(path) === gate) state.gates.delete(path); release(); };
    state.gates.set(path, gate); return gate;
  };
  const read = async (path, value) => {
    const captured = clone(value), gate = state.gates.get(path);
    if (gate) { gate.entered = true; await gate.promise; gate.completed = true; }
    return response(captured);
  };
  const plans = [{ id: PLAN, name: 'Synthetic complete week', start_date: '2026-09-14', end_date: '2026-09-20' }];
  const meals = [{ id: MEAL, plan_id: PLAN, name: 'Friday meal', date: '2026-09-18', time: null, position: 0 }];
  const events = [{ id: EVENT, name: 'Saturday event', date: '2026-09-19', time: null, guests: 6 }];
  state.fetch = async (url, options = {}) => {
    try {
      const path = url.pathname.slice('/api/planning/v1'.length), method = options.method || 'GET';
      state.calls.push({ path, method });
      assert(options.headers?.Authorization === 'Bearer synthetic-shopping-not-a-jwt', 'Unexpected non-synthetic credentials');
      if (method === 'GET') {
        const collections = { '/plans': ['plans', plans], '/events': ['events', events], '/shopping/scopes': ['scopes', scopes],
          [`/plans/${PLAN}/meals`]: ['meals', meals], [`/plans/${PLAN}/events`]: ['links', [{ id: id(4), plan_id: PLAN, event_id: EVENT, event: events[0], in_range: true }]] };
        if (collections[path]) {
          const [key, records] = collections[path];
          return read(path, { [key]: clone(records).sort((a, b) => a.id.localeCompare(b.id)), revision: state.revision, next_cursor: null });
        }
        if (path === '/preferences') return read(path, { preferences: state.preferences, preference_revision: state.preferenceRevision, revision: state.revision });
        const scope = scopes.find((s) => path === `/shopping/scopes/${s.id}`);
        if (scope) {
          state.rows[scope.id].forEach(summarize);
          return read(path, { scope, rows: state.rows[scope.id], revision: state.revision });
        }
        throw new Error(`Unexpected fixture GET ${path}`);
      }
      assert(method === 'POST' && path === '/commands', 'Only synthetic command POST is supported');
      const raw = options.body, command = JSON.parse(raw), p = command.payload;
      state.commands.push(raw);
      const receipt = state.receipts.get(command.mutation_id);
      if (receipt) {
        assert(receipt.raw === raw, 'Mutation identity reused with different bytes');
        return response(receipt.result);
      }
      if (state.mode === 'conflict' || command.expected_workspace_revision !== state.revision) {
        if (state.mode === 'conflict') { state.mode = null; state.revision++; }
        return response({ code: 'revision_conflict', error: 'Synthetic conflict', current_revision: state.revision }, 409);
      }
      const preference = command.operation === 'preferences.update';
      if (preference && p.expected_revision !== state.preferenceRevision) return response({ code: 'preference_revision_conflict', error: 'Synthetic preference conflict' }, 409);
      const before = clone(state.rows);
      let result = {};
      if (preference) {
        Object.assign(state.preferences, p.changes); result.preference_revision = ++state.preferenceRevision;
      } else if (command.operation === 'shopping.scope') {
        assert(p.owner_type === 'plan' && p.owner_id === PLAN, 'Unexpected scope owner');
        const target = scopes.find((s) => s.mode === p.mode && JSON.stringify(s.selection) === JSON.stringify(p.selection || []));
        assert(target, 'Fixture supports whole scope or Friday selection'); result.scope_id = target.id;
      } else if (command.operation === 'shopping.cover') {
        const target = state.rows[p.scope_id]?.find((r) => r.key === p.row_key);
        assert(target && ['bought', 'have', 'needed'].includes(p.status), 'Invalid fixture coverage target');
        assert(p.source_ids.every((identity) => target.sources.some((s) => s.id === identity)), 'Foreign source allocation');
        for (const s of target.sources) if (p.source_ids.includes(s.id)) Object.assign(s, { state: p.status, review: false, confirmed: true });
        if (p.include_extra) Object.assign(target, { extra_state: p.status, extra_review: false });
      } else if (command.operation === 'shopping.extra') {
        const target = state.rows[p.scope_id].find((r) => r.key === p.row_key);
        assert(target && Number(p.amount) >= 0, 'Invalid fixture extra');
        target.extra = p.amount; target.total = (Number(target.required) + Number(p.amount)).toFixed(3);
      } else if (command.operation === 'shopping.personal.create') {
        const identity = id(100 + ++state.additions);
        state.rows[p.scope_id].push({ ...row(JSON.stringify(['personal-addition', identity]), p.title, [], p.amount),
          personal_id: identity, unit: p.unit, category: 'other' }); result.item_id = identity;
      } else if (command.operation === 'undo.apply') {
        assert(state.undo?.id === p.undo_id && state.undo.revision === state.revision, 'Invalid fixture undo');
        state.rows = clone(state.undo.rows); state.undo = null;
      } else throw new Error(`Unsupported fixture operation ${command.operation}`);
      if (!preference) {
        state.revision++;
        if (command.operation === 'shopping.cover') {
          state.undo = { id: id(200 + state.revision), revision: state.revision, rows: before };
          result.undo_id = state.undo.id; result.undo_expires_at = new Date(Date.now() + 600000).toISOString();
        } else state.undo = null;
      }
      result.revision = state.revision;
      state.receipts.set(command.mutation_id, { raw, result: clone(result) });
      if (state.mode === 'lost') { state.mode = null; throw new TypeError('Synthetic response lost after commit'); }
      return response(result);
    } catch (error) {
      if (error.message !== 'Synthetic response lost after commit') state.failures.push(error.message);
      throw error;
    }
  };
  return state;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(predicate, reason, timeout = 6000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) { const value = predicate(); if (value) return value; await pause(); }
  throw new Error(`Timed out: ${reason}`);
}
const mountNode = () => document.getElementById('mounted-page');
const all = (selector, parent = mountNode()) => [...parent.querySelectorAll(selector)];
const dialog = () => mountNode().querySelector('dialog[open]');
const button = (text, parent = mountNode()) => all('button', parent).find((b) => b.textContent.trim() === text);
function click(node) {
  assert(node, 'Mounted control lookup returned no element');
  assert(!node.matches(':disabled'), `Mounted control is disabled: ${node.getAttribute('aria-label') || node.textContent.trim()}`);
  assert(!dialog() || dialog().contains(node), 'Control is outside the active native modal');
  assert(node.getClientRects().length, 'Control is not visible');
  node.focus(); assert(document.activeElement === node || node.matches('.ps-item-name'), 'Control could not receive focus');
  node.click();
}
async function clickWhenReady(find, label, acknowledged = () => true) {
  let last = 'not checked';
  const node = await until(() => {
    const candidate = find(), ack = acknowledged();
    last = `${candidate ? candidate.matches(':disabled') ? 'disabled' : !candidate.isConnected ? 'detached'
      : !candidate.getClientRects().length ? 'hidden' : 'enabled' : 'missing'}; current acknowledgement=${!!ack}`;
    return ack && candidate?.isConnected && !candidate.matches(':disabled') && candidate.getClientRects().length ? candidate : null;
  }, label).catch((error) => { throw new Error(`${error.message}; last control state: ${last}`); });
  click(node);
}
function fill(node, value) {
  assert(node && !node.disabled && (!dialog() || dialog().contains(node)), 'Input unavailable/inert');
  const prototype = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  node.focus(); Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true }));
}
const submit = () => click(dialog()?.querySelector('button[type="submit"]'));
const pastaRow = () => all('.ps-row').find((r) => r.dataset.rowKey === KEY && r.closest('.ps-group').textContent.includes('Synthetic Bolognese'));
const settle = async () => { await pause(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); };

export async function boot(sandbox) {
  assert(sandbox?.isolated && window.localStorage === sandbox.storage && window.sessionStorage === sandbox.storage, 'Isolation required before imports');
  const [{ default: React }, { createRoot }, router, { default: Page }, { default: auth }, { default: settings }, strings, planning] = await Promise.all([
    import('react'), import('react-dom/client'), import('react-router-dom'), import('../src/pages/PrivateShoppingPage.jsx'),
    import('../src/store/useAuthStore.js'), import('../src/store/useSettingsStore.js'),
    import('../src/components/shopping/shoppingStrings.mjs'), import('../src/components/planning/planningStrings.mjs'),
  ]);
  const h = React.createElement, t = { ...planning.planningStrings.en, ...strings.shoppingStrings.en };
  let root, active, epoch = 0;
  function RouteControls() {
    const location = router.useLocation(), navigate = router.useNavigate();
    return h('aside', { id: 'fixture-controls', 'aria-label': 'TEST ONLY router controls' },
      h('output', { id: 'mounted-route' }, location.pathname + location.search),
      ...[A, B].map((scope, i) => h('button', { key: scope, type: 'button', 'data-test-scope': scope,
        onClick: () => navigate(`/shopping?scope=${scope}`) }, `TEST ONLY scope ${i ? 'B' : 'A'}`)));
  }
  const pending = () => JSON.parse(sandbox.storage.getItem(`private-planning:v1:outbox:${ACCOUNT}`) || 'null');
  const ready = () => mountNode().querySelector('.ps-layout select:not(:disabled)');
  const mount = async (configure = () => {}, wait = true) => {
    root?.unmount(); await pause(); sandbox.storage.clear(); sandbox.blocked.length = 0;
    active = createFixture(); configure(active); sandbox.transport = active.fetch;
    settings.setState({ language: 'en', darkMode: false });
    auth.setState({ user: { id: ACCOUNT, email: 'synthetic-shopping@example.invalid' }, token: 'synthetic-shopping-not-a-jwt',
      initialized: true, initializing: false, loading: false, initError: null, epoch: ++epoch, requestGeneration: 0 });
    root = createRoot(mountNode()); root.render(h(router.MemoryRouter, { initialEntries: [`/shopping?scope=${A}`] }, h(RouteControls), h(Page)));
    if (wait) await until(ready, 'complete initial projection');
    return active;
  };
  const recover = () => dialog()?.querySelector('.pp-recovery button');
  const closed = () => until(() => !dialog() && ready(), 'modal closes after confirmed save');
  const cases = [
    ['Scope save + remember preference survives the shared snapshot refresh', async () => {
      const f = await mount(); click(button(t.changeSelection)); await until(dialog, 'scope modal');
      click(dialog().querySelector('input[type="radio"][value="meals"]'));
      const choice = await until(() => all('input[type="checkbox"]', dialog()).find((n) => n.parentElement.textContent.includes('Friday meal')), 'complete meal choice');
      click(choice); await settle();
      const gate = f.delay('/plans');
      try {
        submit(); await until(() => gate.entered, 'post-receipt snapshot deliberately held');
        assert(dialog() && !dialog().querySelector('button[type="submit"]:not(:disabled)'), 'Snapshot gap lost/reenabled modal');
        assert(f.commands.length === 1 && f.preferences.shopping_scope_id === A, 'Preference changed before fresh snapshot');
        gate.release(); await closed();
        assert(f.commands.length === 2 && JSON.parse(f.commands[1]).operation === 'preferences.update', 'Missing two-step remember');
        assert(f.preferences.shopping_scope_id === B && document.getElementById('mounted-route').textContent.includes(B), 'Remember/navigation lost');
        assert(mountNode().textContent.includes('220') && !mountNode().textContent.includes('820'), 'New scope did not render its independent projection');
      } finally { gate.release(); }
    }],
    ['Dish name checks one source; arrow only expands; Check all undo restores mixed states', async () => {
      const f = await mount(); const row = pastaRow();
      assert(row.querySelector('.ps-quantity').textContent.includes('220') && row.querySelector('.ps-total').textContent.includes('820'), 'Dish/Total not both present');
      const details = row.querySelector('details'); click(details.querySelector('summary')); await settle();
      assert(details.open && f.commands.length === 0, 'Arrow changed coverage');
      click(details.querySelector('summary')); await settle();
      const name = row.querySelector('.ps-item-name');
      assert(!dialog() && name.getClientRects().length, 'Ingredient name not reachable'); name.click();
      await until(() => f.commands.length === 1 && ready(), 'dish name coverage saved');
      const first = JSON.parse(f.commands[0]).payload;
      assert(first.source_ids.length === 1 && first.source_ids[0] === f.rows[A][0].sources[0].id && !first.include_extra, 'Dish name checked combined demand');
      assert(!details.open && f.rows[A][0].sources[1].state === 'have', 'Name expanded details or overwrote another allocation');
      const mixed = clone(f.rows[A][0].sources);
      // Fixture commits can precede React's fresh notice render. Wait for the
      // exact acknowledged control, not merely an enabled layout elsewhere.
      await clickWhenReady(() => pastaRow()?.querySelector('.ps-check-notice button[aria-label]'), 'dish Check all',
        () => ready() && pastaRow()?.querySelector('.ps-check-notice [role="status"]')?.textContent === t.checkedDish);
      await until(() => f.commands.length === 2 && ready(), 'Check all committed');
      assert(f.rows[A][0].sources.every((s) => s.state === 'bought'), 'Check all missed a source');
      await clickWhenReady(() => {
        const notice = pastaRow()?.querySelector('.ps-check-notice');
        return notice && button(t.undo, notice);
      }, 'Undo after Check all',
      () => ready() && pastaRow()?.querySelector('.ps-check-notice [role="status"]')?.textContent === t.checkedAll);
      await until(() => f.commands.length === 3 && ready(), 'undo committed');
      assert(JSON.stringify(f.rows[A][0].sources) === JSON.stringify(mixed), 'Undo failed to restore mixed bought/have');
      assert(f.rows[B][0].sources[0].state === 'needed', 'Coverage leaked into independent scope');
    }],
    ['Amount minimum resets on blur without save; conflict recovery retains an invalid draft', async () => {
      const f = await mount(); click(pastaRow().querySelector('summary')); await settle(); click(button(t.changeAmount, pastaRow()));
      const input = await until(() => dialog()?.querySelector('input[inputmode="decimal"]'), 'amount editor');
      fill(input, '100'); await settle(); assert(input.value === '100', 'Minimum corrected during typing'); input.blur(); await settle();
      assert(input.value === '820.000' && f.commands.length === 0, 'Blur failed minimum correction or persisted it');
      fill(input, '920'); await settle(); f.mode = 'conflict'; submit();
      await until(() => pending()?.state === 'rejected' && recover(), '409 recovery inside modal');
      fill(input, 'not-a-number'); await settle();
      assert(recover().disabled, 'Discard enabled before submitted request review');
      click(dialog().querySelector('.pp-recovery summary')); await until(() => !recover().disabled, 'review unlocks discard'); click(recover());
      await until(() => !pending() && button(t.reviewLatest, dialog()) && !button(t.reviewLatest, dialog()).disabled, 'fresh conflict snapshot');
      assert(input.isConnected && input.value === 'not-a-number', 'Conflict reload discarded invalid draft');
      click(button(t.reviewLatest, dialog())); await settle(); submit(); await settle();
      assert(input.isConnected && input.value === 'not-a-number' && input.getAttribute('aria-invalid') === 'true' && f.commands.length === 1, 'Invalid reviewed draft submitted or disappeared');
    }],
    ['Late scope A projection cannot replace mounted scope B', async () => {
      let gate; const f = await mount((fixture) => { gate = fixture.delay(`/shopping/scopes/${A}`); }, false);
      try {
        await until(() => gate.entered, 'scope A projection held');
        click(mountNode().querySelector(`[data-test-scope="${B}"]`)); await until(ready, 'scope B ready while A delayed');
        gate.release(); await until(() => gate.completed, 'late A response delivered'); await settle();
        assert(document.getElementById('mounted-route').textContent.includes(B) && mountNode().textContent.includes('220') && !mountNode().textContent.includes('820'), 'Late response overwrote scope B');
        assert(f.commands.length === 0, 'Navigating unexpectedly persisted preferences');
      } finally { gate.release(); }
    }],
    ['Language, theme and layout preference commands preserve the active domain undo', async () => {
      const f = await mount(); click(pastaRow().querySelector('input[type="checkbox"]'));
      await until(() => f.undo && ready(), 'domain undo established'); const undoId = f.undo.id, domain = f.revision;
      fill(ready(), 'amount'); await until(() => f.preferenceRevision === 1 && ready(), 'layout preference saved');
      assert(f.revision === domain && f.undo.id === undoId, 'Preference save invalidated domain undo');
      const language = await until(() => mountNode().querySelector('.ps-preferences select:not(:disabled)'), 'actual language preference control');
      fill(language, 'de'); await until(() => f.preferenceRevision === 2 && ready() && mountNode().querySelector('.private-shopping[lang="de"]'), 'SQL language saved/rendered');
      click(mountNode().querySelector('.ps-preferences button[aria-pressed]'));
      await until(() => f.preferenceRevision === 3 && ready() && mountNode().querySelector('.private-shopping[data-dark="true"]'), 'SQL theme saved/rendered');
      assert(f.revision === domain && f.undo.id === undoId, 'Language/theme changed domain revision');
      assert(button(planning.planningStrings.de.undo), 'Layout/preference change hid still-valid domain Undo');
      click(button(planning.planningStrings.de.undo)); await until(() => f.revision === domain + 1 && ready(), 'undo remains usable after preference refresh');
      assert(f.rows[A][0].sources[0].state === 'needed' && f.rows[A][0].sources[1].state === 'have', 'Preference refresh corrupted undo');
    }],
    ['Lost personal-add response retries exact bytes through reachable native modal controls', async () => {
      const f = await mount(); click(button(t.addPersonal)); await until(dialog, 'personal modal');
      const input = dialog().querySelector('input:not([inputmode])'); fill(input, 'Synthetic one-time addition');
      await settle(); f.mode = 'lost'; submit(); await until(() => pending()?.state === 'pending' && recover() && !recover().disabled, 'retry inside native dialog');
      assert(dialog().open && dialog().contains(recover()) && input.isConnected, 'Recovery escaped native modal or destroyed draft');
      assert(f.additions === 1 && f.commands.length === 1, 'Lost response did not model exactly one committed addition');
      click(recover()); await closed();
      assert(f.commands.length === 2 && f.commands[0] === f.commands[1], 'Retry changed request bytes/mutation identity');
      assert(f.additions === 1 && f.receipts.size === 1 && !pending(), 'Retry duplicated addition or left unresolved outbox');
    }],
    ['Untouched cupboard checkbox records have, preserving measured and qualitative sources', async () => {
      const f = await mount(); const salt = all('.ps-row').find((r) => r.dataset.rowKey === SALT);
      click(salt.querySelector('summary')); await settle();
      assert(salt.querySelectorAll('.ps-sources li').length === 2, 'Cupboard details lost measured/qualitative sources');
      click(salt.querySelector('input[type="checkbox"]')); await until(() => f.commands.length && ready(), 'cupboard acknowledgement');
      assert(JSON.parse(f.commands[0]).payload.status === 'have', 'Untouched cupboard check incorrectly records a purchase');
    }],
  ];
  const run = document.getElementById('run-tests'), show = document.getElementById('show-fixture');
  const summary = document.getElementById('summary');
  document.getElementById('boot-status').textContent = 'Isolation installed (control-waits v2). Actual shopping page, shared hook and adapter ready; synthetic transport only.';
  run.disabled = false; show.disabled = false;
  show.addEventListener('click', async () => { run.disabled = show.disabled = true;
    try { await mount(); summary.removeAttribute('data-result'); summary.textContent = 'Manual synthetic fixture. No mounted case results implied.'; }
    catch (error) { summary.dataset.result = 'FAIL'; summary.textContent = error.message; }
    finally { run.disabled = show.disabled = false; }
  });
  run.addEventListener('click', async () => {
    run.disabled = show.disabled = true; document.getElementById('results').replaceChildren(); let passed = 0;
    for (const [name, execute] of cases) {
      const li = document.createElement('li'); li.textContent = `RUNNING — ${name}`; document.getElementById('results').append(li);
      try {
        await execute(); assert(!sandbox.blocked.length && !active.failures.length, [...sandbox.blocked, ...active.failures].join('\n'));
        li.dataset.result = 'PASS'; li.textContent = `PASS — ${name}`; passed++;
      } catch (error) { li.dataset.result = 'FAIL'; li.textContent = `FAIL — ${name}\n${error.message}`; console.error(`TEST ONLY ${name}`, error); }
      finally { for (const gate of active?.gates.values() || []) gate.release(); root?.unmount(); root = null; await pause(); }
      summary.textContent = `${passed}/${cases.length} passed so far.`;
    }
    summary.dataset.result = passed === cases.length ? 'PASS' : 'FAIL';
    summary.textContent = `${passed}/${cases.length} mounted cases passed. Synthetic transport; no native storage/API access. Actual language/theme/layout controls and shared hook.`;
    run.disabled = show.disabled = false;
  });
}
