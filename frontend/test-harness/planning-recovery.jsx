import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import PrivatePlanningPage from '../src/pages/PrivatePlanningPage';
import useAuthStore from '../src/store/useAuthStore';
import useSettingsStore from '../src/store/useSettingsStore';
import { planningStrings } from '../src/components/planning/planningStrings.mjs';

const t = planningStrings.en;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PLAN = id(1), MEAL = id(2), ACCOUNT = 900001;
const PLAN_B = id(3), PLAN_C = id(4), MEAL_B = id(5), MEAL_C = id(6), ITEM = id(7), COPY = id(8);
const OUTBOX = `private-planning:v1:outbox:${ACCOUNT}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(predicate, message, timeout = 6000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await pause();
  }
  throw new Error(`Timed out: ${message}`);
}
const dialog = () => document.querySelector('#mounted-page dialog[open]');
const all = (selector, parent = document.getElementById('mounted-page')) => [...parent.querySelectorAll(selector)];
const findButton = (label, parent) => all('button', parent).find((node) => node.textContent.trim() === label);
function click(node) {
  assert(node, 'Expected a mounted control');
  assert(!node.matches(':disabled'), `Control disabled: ${node.textContent}`);
  // Open real native details ancestors so actions are visible and reachable.
  const ancestors = [];
  for (let p = node.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') ancestors.unshift(p);
  for (const details of ancestors) {
    const summary = details.querySelector(':scope > summary');
    // A summary is visible while its own details is closed. Pre-opening it here
    // would make node.click() immediately close it again; native toggle events
    // can coalesce and React would only observe the final closed state.
    if (!details.open && !summary?.contains(node)) {
      assert(summary, 'Details ancestor needs a direct summary');
      summary.click();
    }
  }
  assert(node.getClientRects().length > 0, `Control not visible: ${node.textContent}`);
  const modal = dialog();
  assert(!modal || modal.contains(node), 'Attempted an action outside the modal while document is inert');
  node.focus();
  assert(document.activeElement === node, 'Control cannot receive focus in mounted DOM');
  node.click();
}
function fill(name, value) {
  const input = dialog()?.querySelector(`[name="${name}"]`);
  assert(input && !input.matches(':disabled'), `Missing/enabled field ${name}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return input;
}
const submit = () => click(dialog()?.querySelector('button[type="submit"]'));
const field = (name) => dialog()?.querySelector(`[name="${name}"]`);
const canSubmit = () => dialog()?.querySelector('button[type="submit"]:not(:disabled)');
function choose(name, value) {
  const select = field(name);
  assert(select instanceof HTMLSelectElement && !select.matches(':disabled'), `Missing/enabled select ${name}`);
  assert([...select.options].some((option) => option.value === value), `Missing option ${name}=${value}`);
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  return select;
}
const hasOption = (name, value) => [...(field(name)?.options || [])].some((option) => option.value === value);
const settle = async () => {
  await pause();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
function RouteEvidence() {
  const route = useLocation();
  return <output id="mounted-route" aria-label="Test-only MemoryRouter location">{route.pathname}</output>;
}

// Mirrors planning_catalog.py validate_content, _metadata and _entry_view.
// Synthetic planning examples only: never publish these records to an API.
async function catalogFixture() {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  const records = await Promise.all(['alpha', 'beta'].map(async (slug) => {
    const content = { schema_version: 1, recipe: null, variants: ['en', 'de'].map((language) => ({
      id: `${slug}-${language}`, base_servings: 2, languages: { [language]: {
        title: `Synthetic ${slug} ${language}`, ingredients: [{ ingredient_id: 'rice', form: 'dry', unit: 'g', amount: '100.000' }],
      } },
    })) };
    const record = { entry_id: `synthetic-${slug}`, revision: 1, kind: 'planning_example', content };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(record))));
    return { ...record, availability: 'published', content_digest: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') };
  }));
  return (language, entryId = null) => {
    assert(['en', 'de'].includes(language), 'Unexpected catalog language');
    const view = (row, summary) => ({ entry_id: row.entry_id, revision: row.revision, kind: row.kind,
      availability: row.availability, content_digest: row.content_digest, language, recipe: null,
      variants: row.content.variants.filter((variant) => variant.languages[language]).map((variant) => ({
        id: variant.id, base_servings: variant.base_servings,
        ...(summary ? { title: variant.languages[language].title } : clone(variant.languages[language])),
      })),
    });
    if (!entryId) return { entries: records.map((row) => view(row, true)) };
    const record = records.find((row) => row.entry_id === entryId);
    assert(record, 'Unexpected synthetic catalog identity');
    return view(record, false);
  };
}
const output = (data, status = 200) => new Response(JSON.stringify(data),
  { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Minimal wire-compatible server double; never calls native fetch. Its receipt
// map models committed/lost responses, while all UI behavior remains production.
async function server() {
  const plan = { id: PLAN, name: 'Synthetic week', start_date: '2026-09-14', end_date: '2026-09-16', created_at: '2026-09-13T12:00:00' };
  const meal = { id: MEAL, plan_id: PLAN, date: '2026-09-14', name: 'Synthetic meal', time: null, position: 0 };
  const catalog = await catalogFixture();
  const state = { revision: 2, plans: [plan], meals: [meal], items: [], catalogEnabled: false, calls: [], commands: [], receipts: new Map(), mode: null, proposals: new Map(), inverse: null, errors: [], holdReads: null, gates: new Map() };
  state.delay = (key) => {
    assert(!state.gates.has(key), `Duplicate read gate ${key}`);
    let release;
    const gate = { entered: false, completed: false, promise: new Promise((resolve) => { release = resolve; }) };
    gate.release = () => { state.gates.delete(key); release(); };
    state.gates.set(key, gate);
    return gate;
  };
  const readResult = async (key, value) => {
    const captured = clone(value), gate = state.gates.get(key);
    if (gate) { gate.entered = true; await gate.promise; gate.completed = true; }
    return output(captured);
  };
  state.seedDestinations = () => {
    state.plans.push({ ...plan, id: PLAN_B, name: 'Destination B' }, { ...plan, id: PLAN_C, name: 'Destination C' });
    state.meals.push({ ...meal, id: MEAL_B, plan_id: PLAN_B, name: 'Meal B' }, { ...meal, id: MEAL_C, plan_id: PLAN_C, name: 'Meal C' });
    state.items.push({ id: ITEM, meal_id: MEAL, event_id: null, kind: 'personal', title: 'Synthetic bread',
      quantity: '1.250', unit: 'loaf', position: 0, group: 'Sides', contribution: null,
      entry_id: null, catalog_revision: null, language: null, options: null, servings: null, follows_guests: false });
  };
  state.remoteRename = () => { state.plans[0].name = 'Latest remote name'; state.revision++; };
  state.fetch = async (url, options) => {
    const method = options.method || 'GET';
    const path = url.pathname.slice('/api/planning/v1'.length);
    state.calls.push({ method, path, query: url.search });
    assert(options.headers?.Authorization?.startsWith('Bearer synthetic-'), 'Non-synthetic auth attempted');
    if (method === 'GET') {
      if (state.holdReads) await state.holdReads;
      if (state.meals.some((row) => path === `/meals/${row.id}/items`)) {
        return readResult(path, { items: state.items.filter((row) => path === `/meals/${row.meal_id}/items`), revision: state.revision, next_cursor: null });
      }
      const collections = { '/plans': ['plans', state.plans], '/events': ['events', []] };
      for (const row of state.plans) {
        collections[`/plans/${row.id}/meals`] = ['meals', state.meals.filter((meal) => meal.plan_id === row.id)];
        collections[`/plans/${row.id}/events`] = ['links', []];
      }
      if (collections[path]) {
        const [key, rows] = collections[path];
        return readResult(path, { [key]: clone(rows).sort((a, b) => a.id.localeCompare(b.id)), revision: state.revision, next_cursor: null });
      }
      if (path === '/catalog' || /^\/catalog\/synthetic-(alpha|beta)\/1$/.test(path)) {
        assert([...url.searchParams.keys()].join(',') === 'language', 'Unexpected catalog query');
        const language = url.searchParams.get('language');
        const value = state.catalogEnabled ? catalog(language, path === '/catalog' ? null : path.split('/')[2]) : { entries: [] };
        assert(state.catalogEnabled || path === '/catalog', 'Catalog detail requested without enabled fixture');
        return readResult(path + url.search, value);
      }
    }
    if (method === 'POST' && path === '/previews') {
      const request = JSON.parse(options.body);
      assert(request.operation === 'meal.delete' && request.payload.meal_id === MEAL, 'Unexpected preview');
      assert(request.expected_workspace_revision === state.revision, 'Stale fixture preview');
      const preview = { id: id(20), operation: request.operation, payload: request.payload, revision: state.revision,
        expires_at: new Date(Date.now() + 600000).toISOString(), effects: { affected: {
          plans: [], meals: clone(state.meals), events: [], links: [], tasks: [], items: [],
        }, events_preserved: false } };
      state.proposals.set(preview.id, preview);
      return output({ preview, revision: state.revision }, 201);
    }
    if (method === 'DELETE' && path.startsWith('/previews/')) {
      state.proposals.delete(path.split('/').at(-1));
      return output({ cancelled: true });
    }
    if (method === 'POST' && path === '/commands') {
      const raw = options.body, request = JSON.parse(raw);
      state.commands.push(raw);
      const mode = state.mode;
      state.mode = null;
      // Authentication precedes command receipt lookup on the real server.
      if (mode === 'jwt422') return output({ msg: 'Signature verification failed' }, 422);
      if (mode === 'conflict') state.remoteRename();
      const previous = state.receipts.get(request.mutation_id);
      if (previous) {
        assert(previous.raw === raw, 'Retry changed exact serialized body');
        return output(previous.result, previous.status);
      }
      if (request.expected_workspace_revision !== state.revision) return output({ code: 'revision_conflict', current_revision: state.revision }, 409);
      let result, status = 200;
      if (request.operation === 'plan.rename') {
        assert(request.payload.plan_id === PLAN, 'Unexpected plan target');
        state.plans[0].name = request.payload.name;
        result = { plan: clone(state.plans[0]) };
      } else if (request.operation === 'plan.copy') {
        assert(request.payload.plan_id === PLAN && request.payload.start_date === '2026-09-21', 'Unexpected repeat payload');
        assert(!state.plans.some((row) => row.id === COPY), 'Duplicate copy attempted');
        const copied = { ...clone(plan), id: COPY, name: request.payload.name, start_date: '2026-09-21', end_date: '2026-09-23' };
        state.plans.push(copied);
        state.meals.push({ ...clone(meal), id: id(9), plan_id: COPY, date: '2026-09-21' });
        result = { plan: clone(copied), counts: { plans: 1, meals: 1, events: 0, links: 0, tasks: 0, items: 0 } }; status = 201;
      } else if (request.operation === 'item.create') {
        const p = request.payload;
        assert(p.parent_type === 'meal' && p.parent_id === MEAL && p.kind === 'dish', 'Unexpected item creation');
        assert(p.entry_id === 'synthetic-beta' && p.catalog_revision === 1 && p.language === 'de'
          && p.options?.variant_id === 'beta-de' && p.servings === 4, 'Stale catalog selection reached command');
        const item = { id: ITEM, meal_id: MEAL, event_id: null, position: 0, kind: 'dish', title: null,
          entry_id: p.entry_id, catalog_revision: p.catalog_revision, language: p.language, options: clone(p.options),
          servings: Number(p.servings).toFixed(3), follows_guests: false, group: p.group, contribution: p.contribution, quantity: null, unit: null };
        state.items.push(item); result = { item: clone(item) }; status = 201;
      } else if (request.operation === 'item.move') {
        const p = request.payload;
        assert(p.item_id === ITEM && p.parent_type === 'meal' && p.parent_id === MEAL_C, 'Unexpected item destination');
        const item = state.items.find((row) => row.id === ITEM);
        assert(item?.meal_id === MEAL, 'Item moved more than once');
        item.meal_id = MEAL_C; result = { item: clone(item) };
      } else if (request.operation === 'preview.confirm') {
        const preview = state.proposals.get(request.payload.preview_id);
        assert(preview?.revision === state.revision, 'Invalid confirmation target');
        state.inverse = clone(state.meals);
        state.meals = [];
        state.proposals.delete(preview.id);
        result = { applied: true, undo_id: id(30), undo_expires_at: new Date(Date.now() + 600000).toISOString() };
      } else if (request.operation === 'undo.apply') {
        assert(request.payload.undo_id === id(30) && state.inverse, 'Invalid undo target');
        state.meals = state.inverse;
        state.inverse = null;
        result = { restored: true };
      } else throw new Error(`Unsupported fixture operation ${request.operation}`);
      result.revision = ++state.revision;
      state.receipts.set(request.mutation_id, { raw, result: clone(result), status });
      if (mode === 'lost') throw new TypeError('Synthetic response loss AFTER server commit');
      return output(result, status);
    }
    const message = `Unexpected fixture request: ${method} ${path}`;
    state.errors.push(message);
    throw new Error(message);
  };
  return state;
}

export async function boot(sandbox) {
  let root, active, epoch = 0;
  const mount = async (configure = () => {}) => {
    root?.unmount();
    await pause();
    sandbox.storage.clear();
    sandbox.lockFailures = 0;
    active = await server();
    configure(active);
    sandbox.transport = active.fetch;
    useSettingsStore.setState({ language: 'en', darkMode: false });
    useAuthStore.setState({ user: { id: ACCOUNT, email: 'synthetic@example.invalid' }, token: 'synthetic-token',
      epoch: ++epoch, requestGeneration: 0, initialized: true, initializing: false, loading: false, initError: null });
    root = createRoot(document.getElementById('mounted-page'));
    root.render(<MemoryRouter initialEntries={[`/planning/plans/${PLAN}`]}><RouteEvidence /><PrivatePlanningPage /></MemoryRouter>);
    await until(() => findButton(t['plan.rename']) && !findButton(t['plan.rename']).disabled, 'loaded actual planning page');
    return active;
  };
  const openRename = async (name) => {
    click(findButton(t['plan.rename']));
    await until(() => dialog()?.querySelector('[name="name"]'), 'rename modal');
    return fill('name', name);
  };
  const pending = () => JSON.parse(sandbox.storage.getItem(OUTBOX) || 'null');
  const recoverButton = () => dialog()?.querySelector('.pp-recovery button');
  const waitRecovery = () => until(() => recoverButton() && !recoverButton().disabled, 'enabled recovery inside modal');
  const closed = () => until(() => !dialog() && !findButton(t.reload)?.disabled, 'dialog closed and snapshot loaded');
  const cases = [
    ['Modal recovery reachable after an ambiguous save', async () => {
      const fixture = await mount();
      await openRename('Draft after response loss');
      fixture.mode = 'lost'; submit();
      await waitRecovery();
      assert(pending()?.state === 'pending', 'Lost response must remain pending');
      assert(recoverButton().textContent === t.retry, 'Pending recovery must offer exact retry');
      click(recoverButton()); await closed();
      assert(fixture.commands.length === 2 && fixture.commands[0] === fixture.commands[1], 'Mounted retry must send identical bytes');
      assert(fixture.receipts.size === 1 && fixture.revision === 3 && !pending(), 'Retry must reconcile one commit');
    }],
    ['409 keeps draft and requires explicit latest-revision review', async () => {
      const fixture = await mount();
      const input = await openRename('My retained draft');
      fixture.mode = 'conflict'; submit();
      await until(() => pending()?.state === 'rejected' && recoverButton(), '409 rejection rendered');
      assert(recoverButton().disabled, 'Discard requires opening submitted details');
      const submittedSummary = dialog().querySelector('.pp-recovery summary');
      const submittedDetails = submittedSummary.parentElement;
      assert(!submittedDetails.open, 'Submitted details must initially be closed');
      let reviewClicks = 0;
      const countReviewClick = () => { reviewClicks++; };
      submittedSummary.addEventListener('click', countReviewClick);
      try { click(submittedSummary); }
      finally { submittedSummary.removeEventListener('click', countReviewClick); }
      assert(reviewClicks === 1, 'Harness must activate review summary exactly once');
      assert(submittedDetails.open, 'Submitted review must remain open after one click');
      await waitRecovery(); click(recoverButton());
      await until(() => findButton(t.reviewLatest, dialog()) && !findButton(t.reviewLatest, dialog()).disabled, 'latest revision available for review');
      assert(input.isConnected && input.value === 'My retained draft', 'Discard/reload remounted or replaced draft');
      assert(dialog().querySelector('button[type="submit"]').disabled, 'Submit enabled before explicit latest review');
      const latestSummary = dialog().querySelector('.pp-form-review summary');
      click(latestSummary);
      assert(latestSummary.parentElement.open, 'Latest saved values must be expanded for review');
      assert(dialog().querySelector('.pp-form-review').textContent.includes('Latest remote name'), 'Latest saved record missing');
      click(findButton(t.reviewLatest, dialog()));
      await until(() => !dialog().querySelector('button[type="submit"]').disabled, 'review enables submit');
      assert(fixture.commands.length === 1, 'Review must not submit automatically');
      assert(input.isConnected && input.value === 'My retained draft', 'Review replaced draft');
      submit(); await closed();
      const [first, second] = fixture.commands.map(JSON.parse);
      assert(second.expected_workspace_revision === 3 && second.mutation_id !== first.mutation_id, 'Fresh reviewed command baseline/ID incorrect');
      assert(fixture.plans[0].name === 'My retained draft', 'Draft was not saved');
    }],
    ['Foreground focus reload preserves open editor fields', async () => {
      const fixture = await mount();
      const input = await openRename('Unsaved focus draft');
      const reads = fixture.calls.length;
      let release;
      fixture.holdReads = new Promise((resolve) => { release = resolve; });
      fixture.remoteRename();
      window.dispatchEvent(new Event('focus'));
      try {
        await until(() => fixture.calls.length > reads && dialog()?.querySelector('button[type="submit"]').disabled, 'foreground request and blocked save');
        assert(input.isConnected && input.value === 'Unsaved focus draft', 'Foreground load cleared field');
      } finally { fixture.holdReads = null; release(); }
      await until(() => findButton(t.reviewLatest, dialog()) && !findButton(t.reviewLatest, dialog()).disabled, 'foreground load completes');
      assert(input.isConnected && input.value === 'Unsaved focus draft', 'Foreground completion replaced field');
      assert(fixture.commands.length === 0, 'Foreground refresh wrote a command');
      click(findButton(t.close, dialog()));
    }],
    ['Undo survives a pre-send writer-lock failure', async () => {
      const fixture = await mount();
      click(findButton(t['meal.delete']));
      await until(() => dialog() && findButton(t.confirm, dialog()), 'delete preview modal');
      click(findButton(t.confirm, dialog())); await closed();
      await until(() => document.querySelector('.pp-undo button:not(:disabled)'), 'available undo');
      const priorWrites = fixture.commands.length;
      await openRename('Must not reach transport');
      sandbox.lockFailures = 1; submit();
      await until(() => dialog()?.textContent.includes(t.lockError), 'writer-busy error in modal');
      assert(fixture.commands.length === priorWrites && !pending(), 'Pre-send failure reached transport or created pending');
      assert(document.querySelector('.pp-undo button'), 'Failed next write removed valid undo');
      click(findButton(t.close, dialog()));
      await until(() => document.querySelector('.pp-undo button:not(:disabled)'), 'undo remains usable');
      click(document.querySelector('.pp-undo button'));
      await until(() => fixture.meals.length === 1 && !document.querySelector('.pp-undo'), 'undo restored original meal');
      assert(fixture.meals[0].id === MEAL, 'Undo changed meal identity');
    }],
    ['JWT 422 preserves exact retry through synthetic reauthentication', async () => {
      const fixture = await mount();
      await openRename('Once despite JWT failure');
      fixture.mode = 'lost'; submit(); await waitRecovery();
      const original = sandbox.storage.getItem(OUTBOX);
      fixture.mode = 'jwt422'; click(recoverButton()); await waitRecovery();
      await until(() => fixture.commands.length === 2 && dialog()?.textContent.includes(t.sessionError), '422 shown in mounted recovery');
      assert(sandbox.storage.getItem(OUTBOX) === original && pending().state === 'pending', '422 rewrote or rejected unresolved outbox');
      assert(recoverButton().textContent === t.retry && !findButton(t.discard, dialog()), 'JWT failure exposed discard');
      useAuthStore.setState({ token: 'synthetic-reauthenticated', epoch: ++epoch });
      await until(() => !dialog() && findButton(t.retry) && !findButton(t.retry).disabled, 'reauthenticated page offers pending recovery');
      click(findButton(t.retry));
      await until(() => !pending() && !findButton(t.retry), 'reauthenticated exact retry acknowledged');
      assert(fixture.commands.length === 3 && fixture.commands.every((raw) => raw === fixture.commands[0]), '422/reauthentication changed retry bytes');
      assert(fixture.receipts.size === 1 && fixture.revision === 3, '422 recovery duplicated commit');
    }],
    ['Ambiguous plan repeat retries exact bytes, opens destination, and creates one copy', async () => {
      const fixture = await mount();
      const original = clone({ plan: fixture.plans[0], meal: fixture.meals[0] });
      click(findButton(t['plan.copy']));
      await until(() => field('start_date'), 'repeat editor');
      fill('name', 'Synthetic repeated week'); fill('start_date', '2026-09-21');
      fixture.mode = 'lost'; submit(); await waitRecovery();
      assert(pending()?.state === 'pending' && fixture.plans.length === 2, 'Repeat did not commit before response loss');
      click(recoverButton()); await closed();
      await until(() => document.getElementById('mounted-route').textContent === `/planning/plans/${COPY}`
        && all('.pp-section-heading h2').some((node) => node.textContent === 'Synthetic repeated week'), 'recovered repeat navigates to copied plan');
      assert(fixture.commands.length === 2 && fixture.commands[0] === fixture.commands[1], 'Repeat retry changed exact command bytes');
      assert(fixture.receipts.size === 1 && fixture.revision === 3 && fixture.plans.length === 2 && fixture.meals.length === 2 && !pending(), 'Repeat recovery created multiple copies/receipts');
      assert(JSON.stringify(original) === JSON.stringify({ plan: fixture.plans[0], meal: fixture.meals[0] }), 'Repeat modified its source');
    }],
    ['Delayed catalog language and variant responses cannot overwrite the selected dish', async () => {
      const fixture = await mount((state) => { state.catalogEnabled = true; });
      const english = fixture.delay('/catalog?language=en');
      let alpha;
      try {
        click(findButton(t['item.create']));
        await until(() => field('kind'), 'item editor');
        choose('kind', 'dish');
        await until(() => english.entered && field('language'), 'held English catalog read');
        assert(!canSubmit(), 'Dish save enabled before catalog load');
        choose('language', 'de');
        await until(() => hasOption('catalog_selection', 'synthetic-alpha:1'), 'German catalog arrives before English');
        assert(field('catalog_selection').value === '' && field('variant_id').value === '', 'Catalog auto-selected a dish or variant');
        alpha = fixture.delay('/catalog/synthetic-alpha/1?language=de');
        choose('catalog_selection', 'synthetic-alpha:1');
        await until(() => alpha.entered, 'held alpha detail read');
        assert(!canSubmit(), 'Dish save enabled before authored variant read');
        choose('catalog_selection', 'synthetic-beta:1');
        await until(() => hasOption('variant_id', 'beta-de'), 'beta detail arrives before alpha');
        assert(!canSubmit() && field('variant_id').value === '', 'Variant must require explicit selection');
        choose('variant_id', 'beta-de'); fill('servings', '4');
        const group = fill('group', 'Retained catalog draft');
        await until(canSubmit, 'selected beta dish enables save');
        alpha.release(); english.release();
        await until(() => alpha.completed && english.completed, 'stale catalog reads released');
        await settle();
        assert(field('language').value === 'de' && field('catalog_selection').value === 'synthetic-beta:1'
          && field('variant_id').value === 'beta-de', 'Late response changed selected language/dish/variant');
        assert(!hasOption('variant_id', 'alpha-de') && !hasOption('variant_id', 'beta-en'), 'Stale variants painted in current selector');
        assert(dialog().querySelector('.pp-catalog-preview')?.textContent.includes('Synthetic beta de'), 'Current authored preview missing');
        assert(group.isConnected && group.value === 'Retained catalog draft' && fixture.commands.length === 0, 'Read completion lost draft or submitted automatically');
        submit(); await closed();
        const command = JSON.parse(fixture.commands[0]);
        assert(fixture.commands.length === 1 && fixture.receipts.size === 1 && command.payload.group === 'Retained catalog draft', 'Catalog save did not produce one selected item');
        assert(fixture.items[0].entry_id === 'synthetic-beta' && fixture.items[0].options.variant_id === 'beta-de'
          && fixture.items[0].language === 'de' && fixture.items[0].servings === '4.000', 'Saved item differs from selected authored variant');
      } finally { english.release(); alpha?.release(); }
    }],
    ['Destination reads and 409 review retain the mounted item-transfer fields', async () => {
      const fixture = await mount((state) => state.seedDestinations());
      click(findButton(t['item.move']));
      await until(() => hasOption('parent_id', MEAL), 'source destination choices');
      const delayedB = fixture.delay(`/plans/${PLAN_B}/meals`);
      try {
        choose('destination_plan', PLAN_B);
        await until(() => delayedB.entered, 'held destination B read');
        assert(!canSubmit(), 'Transfer enabled while destination reads are pending');
        choose('destination_plan', PLAN_C);
        await until(() => hasOption('parent_id', MEAL_C), 'destination C arrives before B');
        const target = choose('parent_id', MEAL_C);
        const planSelect = field('destination_plan');
        delayedB.release(); await until(() => delayedB.completed, 'stale destination B released'); await settle();
        assert(planSelect.value === PLAN_C && target.value === MEAL_C && !hasOption('parent_id', MEAL_B), 'Late destination read replaced current selection');
        await until(canSubmit, 'transfer save available');
        fixture.mode = 'conflict'; submit();
        await until(() => pending()?.state === 'rejected' && recoverButton(), 'item transfer conflict');
        assert(recoverButton().disabled, 'Conflict discard enabled before submitted details review');
        click(dialog().querySelector('.pp-recovery summary')); await waitRecovery(); click(recoverButton());
        await until(() => findButton(t.reviewLatest, dialog()) && !findButton(t.reviewLatest, dialog()).disabled, 'item transfer latest review available');
        assert(target.isConnected && target.value === MEAL_C && planSelect.isConnected && planSelect.value === PLAN_C,
          'Conflict discard/reload lost mounted destination draft');
        assert(!canSubmit(), 'Transfer enabled before explicit latest review');
        click(dialog().querySelector('.pp-form-review summary'));
        assert(dialog().querySelector('.pp-form-review').textContent.includes('Synthetic bread'), 'Current item missing from review');
        // The new baseline triggers another exact-revision destination read.
        // Hold it so the assertion covers both loading and completion, not just
        // a same-tick snapshot before React has run its effect.
        const reviewedRead = fixture.delay(`/plans/${PLAN_C}/meals`);
        try {
          click(findButton(t.reviewLatest, dialog()));
          await until(() => reviewedRead.entered, 'reviewed destination revision read');
          assert(!canSubmit(), 'Transfer enabled before reviewed destination read completes');
          assert(planSelect.isConnected && planSelect.value === PLAN_C, 'Review reset chosen plan');
          reviewedRead.release(); await until(() => reviewedRead.completed && hasOption('parent_id', MEAL_C), 'reviewed destination choices restored');
          await settle();
          assert(target.isConnected && target.value === MEAL_C && field('parent_type').value === 'meal', 'Explicit latest review lost chosen destination meal');
          assert(fixture.commands.length === 1, 'Review submitted automatically');
          await until(canSubmit, 'reviewed transfer enables submit'); submit(); await closed();
          const [first, second] = fixture.commands.map(JSON.parse);
          assert(fixture.commands.length === 2 && second.mutation_id !== first.mutation_id && second.expected_workspace_revision === 3,
            'Reviewed transfer reused stale mutation/baseline');
          assert(JSON.stringify(first.payload) === JSON.stringify(second.payload), 'Conflict recovery changed transfer draft');
          assert(fixture.receipts.size === 1 && fixture.items[0].meal_id === MEAL_C && fixture.items[0].quantity === '1.250', 'Transfer did not preserve one item and its fields');
        } finally { reviewedRead.release(); }
      } finally { delayedB.release(); }
    }],
  ];
  const run = document.getElementById('run-tests');
  const summary = document.getElementById('summary');
  document.getElementById('boot-status').textContent = 'Isolation installed. Ready: actual React page, hook and adapter; native dialogs; synthetic transport and locks.';
  run.disabled = false;
  run.addEventListener('click', async () => {
    run.disabled = true;
    const results = document.getElementById('results');
    results.replaceChildren();
    let passed = 0;
    for (const [name, execute] of cases) {
      const row = document.createElement('li');
      row.textContent = `RUNNING — ${name}`;
      results.append(row);
      summary.textContent = `Running ${passed}/${cases.length} passed…`;
      try {
        await execute();
        assert(active.errors.length === 0, active.errors.join('\n'));
        passed++;
        row.dataset.result = 'PASS'; row.textContent = `PASS — ${name}`;
      } catch (error) {
        row.dataset.result = 'FAIL'; row.textContent = `FAIL — ${name}\n${error.message}`;
        console.error(`TEST ONLY FAIL: ${name}`, error);
      } finally {
        for (const gate of active?.gates.values() || []) gate.release();
        root?.unmount(); root = null;
        await pause();
      }
    }
    summary.dataset.result = passed === cases.length ? 'PASS' : 'FAIL';
    summary.textContent = `${passed === cases.length ? 'PASS' : 'FAIL'} — ${passed}/${cases.length} mounted recovery scenarios. No real API transport used. Reload page to inspect updated source.`;
    console.info(`TEST ONLY mounted planning recovery: ${passed}/${cases.length}`);
    run.disabled = false;
  });
}
