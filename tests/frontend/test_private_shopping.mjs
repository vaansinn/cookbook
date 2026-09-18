import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { amountEdit, coverPayload, coverage, currentProjection, decimal, displayAmount, initialDates, nextCheckStatus, personalCommand, scopeCommand, scopeFromSearch, shoppingGroups, shoppingLayouts, twoDayRange, visibleShoppingNotice } from '../../frontend/src/components/shopping/shoppingModel.mjs';
import { shoppingStrings } from '../../frontend/src/components/shopping/shoppingStrings.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const t = shoppingStrings.en;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plan = { id: id(1), start_date: '2026-09-11', end_date: '2026-09-20' };
const source = (n, amount, group = n) => ({ id: id(n), item_id: id(n + 20), group_id: id(group + 40), dish_title: `Dish ${group}`, meal_title: 'Dinner', date: '2026-09-12', amount, unit: 'g', state: 'needed', review: false });
const fixture = () => ({ key: 'pasta:dry:g', label: 'Pasta', ingredient_id: 'pasta', form: 'dry', unit: 'g', category: 'cupboard', purchase_mode: 'measured', required: '820.000', extra: '100.000', total: '920.000', sources: [source(2, '220.000'), source(3, '600.000')], extra_state: 'needed', extra_review: false });

test('shopping URL accepts one UUID only and never interprets a malformed scope as all', () => {
  assert.equal(scopeFromSearch(''), null);
  assert.equal(scopeFromSearch(`?scope=${id(1)}`), id(1));
  for (const query of ['?scope=', '?scope=all', `?scope=${id(1)}&scope=${id(2)}`, '?scope=https://elsewhere']) assert.equal(scopeFromSearch(query), 'invalid');
});
test('all four layouts retain server rows and separate dish references without duplicate aggregates', () => {
  const row = fixture(), before = structuredClone(row);
  for (const layout of shoppingLayouts) {
    const groups = shoppingGroups([row], layout, 'en', t);
    const refs = groups.flatMap((group) => group.rows);
    assert.equal(refs.length, layout === 'dish' ? 2 : 1);
    assert.ok(refs.every((ref) => ref.row === row));
    if (layout === 'dish') {
      assert.deepEqual(refs.map((ref) => ref.sources.map((part) => part.amount)), [['220.000'], ['600.000']]);
      assert.ok(refs.every((ref) => ref.includeExtra === false));
      assert.equal(new Set(refs.map((ref) => ref.key)).size, 2);
    }
  }
  assert.deepEqual(row, before);
});
test('repeated dish occurrences keep all source identities; names never merge personal rows', () => {
  const row = fixture(); row.sources[1].group_id = row.sources[0].group_id;
  const groups = shoppingGroups([row], 'dish', 'en', t);
  assert.equal(groups.length, 1); assert.equal(groups[0].rows[0].sources.length, 2);
  const personal = { ...fixture(), key: 'personal:one', personal_id: id(9), sources: [], total: '1.000', extra: '0.000' };
  const all = shoppingGroups([row, personal], 'alphabetical', 'en', t)[0].rows;
  assert.equal(all.length, 2); assert.notEqual(all[0].row.key, all[1].row.key);
});
test('coverage preserves have/bought distinction, mixed allocations, separate extra, sticky review', () => {
  const row = fixture(); row.sources[0].state = 'bought';
  assert.equal(coverage(row).state, 'partial'); assert.equal(coverage(row).mixed, true);
  assert.equal(coverage(row, [row.sources[0]], false).checked, true);
  row.sources[1].state = 'have'; assert.equal(coverage(row).state, 'partial');
  row.extra_state = 'bought'; assert.equal(coverage(row).state, 'covered');
  row.sources[0].review = true; assert.equal(coverage(row).state, 'review'); assert.equal(coverage(row).checked, false);
  row.sources[0].amount = '1.000'; assert.equal(coverage(row).state, 'review');
});
test('dish, all and extra commands send exactly their source allocations', () => {
  const row = fixture();
  assert.deepEqual(coverPayload(id(1), row, [row.sources[0]], 'bought', false), { scope_id: id(1), row_key: row.key, source_ids: [id(2)], status: 'bought', include_extra: false });
  assert.deepEqual(coverPayload(id(1), row, row.sources, 'have', true).source_ids, [id(2), id(3)]);
  assert.deepEqual(coverPayload(id(1), row, [], 'bought', true).source_ids, []);
  assert.throws(() => coverPayload(id(1), row, [source(99, '1.000')], 'bought', false));
});
test('backend disallows nonexistent extras; ordinary whole-row checks send include_extra false', () => {
  const row = fixture(); row.extra = '0.000'; row.total = row.required;
  assert.equal(coverPayload(id(1), row, row.sources, 'bought', true).include_extra, false);
  const personal = { ...row, personal_id: id(4), sources: [], total: null };
  assert.equal(coverPayload(id(1), personal, [], 'have', true).include_extra, true);
  assert.equal(coverage(personal).empty, false);
});
test('one backend cupboard row preserves measured and taste sources with independent confirmations', () => {
  const row = { ...fixture(), key: '["salt","plain","cupboard"]', label: 'Salt', unit: null, required: null, total: null, extra: '0.000', purchase_mode: 'check_cupboard',
    sources: [{ ...source(2, '1.000'), unit: 'tsp', confirmed: false }, { ...source(3, null), unit: 'taste', confirmed: false }] };
  assert.equal(coverage(row).state, 'unchecked');
  assert.equal(nextCheckStatus(row, coverage(row)), 'have');
  assert.equal(shoppingGroups([row], 'category', 'en', t)[0].rows.length, 1);
  const payload = coverPayload(id(1), row, row.sources, 'have', true);
  assert.equal(payload.source_ids.length, 2); assert.equal(payload.include_extra, false);
  row.sources[0].confirmed = true; row.sources[0].state = 'bought';
  assert.equal(coverage(row).state, 'partial');
  assert.equal(nextCheckStatus(row, coverage(row)), 'have');
  row.sources.forEach((source) => Object.assign(source, { confirmed: true, state: 'needed' }));
  assert.equal(nextCheckStatus(row, coverage(row)), 'bought');
  row.sources.forEach((source) => { source.state = 'have'; });
  assert.equal(nextCheckStatus(row, coverage(row)), 'needed');
  assert.equal(displayAmount(null, 'taste', 'de', shoppingStrings.de), 'Nach Geschmack');
  assert.equal(displayAmount(null, null, 'de', shoppingStrings.de), 'Ohne Mengenangabe');
});
test('a hidden dish notice cannot suppress the fallback Undo after layout changes', () => {
  const projection = { scope: { id: id(1) }, revision: 7, rows: [fixture()] };
  const dish = shoppingGroups(projection.rows, 'dish', 'en', t);
  const notice = { scopeId: id(1), revision: 7, referenceKey: dish[0].rows[0].key };
  assert.equal(visibleShoppingNotice(notice, projection, dish), notice);
  for (const layout of ['category', 'alphabetical', 'amount']) assert.equal(visibleShoppingNotice(notice, projection, shoppingGroups(projection.rows, layout, 'de', shoppingStrings.de)), null);
  assert.equal(visibleShoppingNotice(notice, { ...projection, revision: 8 }, dish), null);
  assert.equal(visibleShoppingNotice(notice, { ...projection, scope: { id: id(2) } }, dish), null);
});
test('total editing uses exact decimal subtraction, corrects minimum only when requested and keeps invalid drafts', () => {
  const row = fixture();
  assert.equal(amountEdit('920', row).extra, '100.000');
  assert.equal(amountEdit('820,001', row).extra, '0.001');
  assert.deepEqual(amountEdit('1', row), { value: '1', error: 'invalidAmount', corrected: false });
  assert.deepEqual(amountEdit('1', row, true), { value: '820.000', extra: '0.000', corrected: true, error: null });
  for (const value of ['', ' ', 'NaN', 'Infinity', '8e2', '-1', '920.0001']) {
    assert.equal(amountEdit(value, row, true).value, value); assert.equal(amountEdit(value, row, true).error, 'invalidAmount');
  }
  assert.equal(row.required, '820.000');
});
test('explicit empty selections are valid; arbitrary dates and meal/event sets do not shorten plans', () => {
  const before = structuredClone(plan);
  assert.deepEqual(scopeCommand('plan', plan, { mode: 'meals', selection: [] }), { owner_type: 'plan', owner_id: id(1), mode: 'meals', selection: [] });
  const choices = [{ key: `meal:${id(2)}` }, { key: `event:${id(3)}` }];
  const payload = scopeCommand('plan', plan, { mode: 'meals', selection: [choices[1].key, choices[0].key, choices[0].key] }, choices);
  assert.deepEqual(payload.selection, choices.map((choice) => choice.key).sort());
  assert.deepEqual(scopeCommand('plan', plan, { mode: 'dates', start_date: '2026-09-12', end_date: '2026-09-18' }), { owner_type: 'plan', owner_id: id(1), mode: 'dates', start_date: '2026-09-12', end_date: '2026-09-18' });
  assert.throws(() => scopeCommand('plan', plan, { mode: 'meals', selection: ['meal:missing'] }, choices));
  assert.throws(() => scopeCommand('event', { id: id(3) }, { mode: 'dates' }));
  assert.deepEqual(plan, before);
});
test('two-day shortcut is inclusive, clipped, date-valid and a pure preview', () => {
  assert.deepEqual(twoDayRange(plan, '2026-09-12'), { start_date: '2026-09-12', end_date: '2026-09-13' });
  assert.deepEqual(twoDayRange(plan, plan.end_date), { start_date: plan.end_date, end_date: plan.end_date });
  assert.throws(() => twoDayRange(plan, '2026-09-31'));
  assert.throws(() => scopeCommand('plan', plan, { mode: 'dates', start_date: '2026-09-10', end_date: '2026-09-12' }));
  assert.equal(initialDates(plan, new Date(2026, 8, 13)).start_date, '2026-09-13');
  assert.equal(initialDates(plan, new Date(2026, 9, 13)).start_date, plan.start_date);
});
test('personal create/update retain independent identity and support an explicit quantity clear', () => {
  const payload = personalCommand(id(1), { personal_id: id(2) }, { title: ' Milk ', amount: '', unit: '' });
  assert.deepEqual(payload, { operation: 'shopping.personal.update', payload: { scope_id: id(1), item_id: id(2), title: 'Milk', amount: null, unit: null } });
  assert.equal(personalCommand(id(1), null, { title: 'Milk', amount: '1,5', unit: 'l' }).payload.amount, '1.500');
  for (const form of [{ title: '', amount: '', unit: '' }, { title: 'Milk', amount: '1', unit: '' }, { title: 'Milk', amount: '', unit: 'l' }]) assert.throws(() => personalCommand(id(1), null, form));
});
test('unit sorting compares only compatible dimensions and leaves forms/demand untouched', () => {
  const rows = [
    { ...fixture(), key: 'dry', total: '800.000' },
    { ...fixture(), key: 'cooked', form: 'cooked', total: '1.000', unit: 'kg' },
    { ...fixture(), key: 'water', total: '2.000', unit: 'l' },
    { ...fixture(), key: 'taste', total: null, unit: 'taste', purchase_mode: 'check_cupboard' },
  ];
  const before = structuredClone(rows), groups = shoppingGroups(rows, 'amount', 'en', t);
  assert.deepEqual(groups[0].rows.map((ref) => ref.key), ['cooked', 'dry']);
  assert.deepEqual(groups[1].rows.map((ref) => ref.key), ['water', 'taste']);
  assert.deepEqual(rows, before);
  assert.equal(displayAmount('1234.500', 'g', 'de', shoppingStrings.de), '1.234,5 g');
  assert.equal(displayAmount(null, 'taste', 'en', t), 'To taste');
  assert.equal(decimal('0.001'), 1n);
});
test('projection cannot cross requested scope or mixed workspace revision', () => {
  const projection = { scope: { id: id(1) }, rows: [fixture()], revision: 7 };
  assert.equal(currentProjection({ shopping: projection, revision: 7 }, id(1)), projection);
  assert.equal(currentProjection({ shopping: projection, revision: 8 }, id(1)), null);
  assert.equal(currentProjection({ shopping: projection, revision: 7 }, id(2)), null);
});
test('EN and DE dictionaries cover the same shopping actions, categories and units', () => {
  assert.deepEqual(Object.keys(shoppingStrings.en).sort(), Object.keys(shoppingStrings.de).sort());
  for (const dictionary of Object.values(shoppingStrings)) assert.ok(Object.values(dictionary).every((value) => typeof value === 'string' && value.length));
});
test('count units use singular for exactly one; picker labels and other quantities stay plural', () => {
  assert.equal(displayAmount('1.000', 'loaf', 'en', shoppingStrings.en), '1 loaf');
  assert.equal(displayAmount('1.000', 'loaf', 'de', shoppingStrings.de), '1 Laib');
  assert.equal(displayAmount('2.000', 'loaf', 'en', shoppingStrings.en), '2 loaves');
  assert.equal(displayAmount('1.001', 'loaf', 'de', shoppingStrings.de), '1,001 Laibe');
  assert.equal(displayAmount('1', 'piece', 'en', shoppingStrings.en), '1 piece');
  assert.equal(shoppingStrings.en.unit_loaf, 'loaves');
  assert.equal(shoppingStrings.de.unit_loaf, 'Laibe');
});
test('leaf source contract uses shared revisioned recovery and explicit preview, not browser shopping persistence', () => {
  const page = fs.readFileSync(path.join(root, 'frontend/src/pages/PrivateShoppingPage.jsx'), 'utf8');
  const dialogs = fs.readFileSync(path.join(root, 'frontend/src/components/shopping/ShoppingDialogs.jsx'), 'utf8');
  assert.match(page, /usePlanningWorkspace\(\{ area: 'shopping'/);
  assert.match(page, /key=\{`\$\{key\}:\$\{scopeId/);
  assert.match(page, /PlanningRecovery/);
  assert.match(page, /api\.preview\('shopping\.personal\.delete'/);
  assert.match(page, /api\.preview\('shopping\.scope\.delete', \{ scope_id: scope\.id \}, snapshot\.revision\)/);
  assert.doesNotMatch(page, /api\.(?:run|preview)\('(?:plan|event)\.delete'/);
  assert.match(page, /location\.state\?\.shoppingOwnerKey === handoffKey/);
  assert.match(page, /JSON\.stringify\(\[session\.accountId, session\.epoch, session\.requestGeneration, handoffNonce\]\)/);
  assert.match(page, /shoppingOwnerKey: handoffKey/);
  assert.doesNotMatch(page, /shoppingOwnerKey: sessionKey/);
  assert.match(page, /preferences\.update.*expected_revision: snapshot\.preference_revision/);
  assert.match(page, /snapshot\?\.selectedScope/);
  assert.match(page, /scope\.owner_type === 'plan'/);
  assert.match(page, /snapshot\.shoppingError \? t\.unavailableContent/);
  assert.match(page, /expectedGeneration !== editorGeneration\.current/);
  assert.match(page, /to="\/groceries"/);
  assert.match(page, /to="\/planning"/);
  assert.match(dialogs, /api\.read\(`\/plans\/\$\{ownerId\}\/meals`, \{ key: 'meals', revision \}/);
  assert.match(dialogs, /api\.read\(`\/plans\/\$\{ownerId\}\/events`, \{ key: 'links', revision \}/);
  assert.match(dialogs, /revision !== api\.snapshot\?\.revision/);
  assert.doesNotMatch(page + dialogs, /localStorage|sessionStorage/);
  assert.doesNotMatch(page, /setInterval\(\(\) => api\.run/);
});

test('mounted shopping survives null snapshots and guards the scope-to-preference continuation', { timeout: 60000 }, async (context) => {
  const require = createRequire(path.join(root, 'frontend/package.json'));
  const esbuild = require('esbuild');
  let playwright;
  try {
    const runtime = process.env.SHOPPING_TEST_RUNTIME || 'C:/Users/zweiz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
    playwright = createRequire(path.join(runtime, 'playwright/package.json'))('playwright');
  } catch { context.skip('Use the bundled Node runtime, or set SHOPPING_TEST_RUNTIME to a compatible node_modules directory containing Playwright.'); return; }
  const entry = (file) => JSON.stringify(path.join(root, 'frontend', file).replaceAll('\\', '/'));
  const built = await esbuild.build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {BrowserRouter,useLocation} from 'react-router-dom';
    import Page from ${entry('src/pages/PrivateShoppingPage.jsx')};
    import auth from ${entry('src/store/useAuthStore.js')};
    function Route(){const location=useLocation(); return <output id="route">{location.pathname+location.search}</output>}
    auth.setState({user:{id:900011},token:'eyJhbGciOiJub25lIn0.eyJzdWIiOiI5MDAwMTEifQ.synthetic',initialized:true,initializing:false,initError:null,epoch:1,requestGeneration:1});
    function Harness(){const [generation,setGeneration]=React.useState(0);window.remountShopping=()=>setGeneration(value=>value+1);return <BrowserRouter><Page key={generation}/><Route/></BrowserRouter>}
    history.replaceState(null,'',window.fixture.initialRoute || '/shopping');
    createRoot(document.getElementById('mount')).render(<Harness/>);
  `, resolveDir: path.join(root, 'frontend'), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'import.meta.env.DEV': 'true' }, logLevel: 'silent' });
  // A fresh headless test process; never connects to main's browser/profile/API.
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  context.diagnostic('Starting isolated mounted shopping browser');
  const browser = await playwright.chromium.launch({ headless: true, ...(process.env.SHOPPING_TEST_BROWSER ? { executablePath: process.env.SHOPPING_TEST_BROWSER } : fs.existsSync(edge) ? { executablePath: edge } : {}) });
  try {
    for (const mode of ['normal', 'changedPreferences', 'racingPreferences', 'lostPreference', 'lostScope', 'deleteScope', 'lostDelete', 'lostDeleteRemount', 'staleDeleteReceipt', 'deleteHandoffRemount']) {
      const session = await browser.newContext({ serviceWorkers: 'block' });
      try {
        const page = await session.newPage();
        page.setDefaultTimeout(5000);
        context.diagnostic(`Mounted scenario: ${mode}`);
        const errors = []; page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) => route.request().isNavigationRequest()
          ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'"><div id="mount"></div>' }) : route.abort());
        await page.goto('http://127.0.0.1:9999/shopping-test-only');
        await page.evaluate(({ mode }) => {
          const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
          const values = new Map(), receipts = new Map();
          const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
          Object.defineProperty(window, 'localStorage', { value: storage });
          Object.defineProperty(window, 'sessionStorage', { value: storage });
          Object.defineProperty(navigator, 'locks', { value: { request: async (_name, _options, action) => action({ name: 'fixture' }) } });
          const original = { id: id(50), owner_type: 'event', owner_id: id(3), mode: 'all', start_date: null, end_date: null, selection: [] };
          const f = window.fixture = { revision: 1, preferenceRevision: 3, scopes: [original], commands: [], held: 0, preferenceReadsAfterWrite: 0,
            preferences: { language: 'en', dark_mode: false, shopping_layout: 'category', shopping_scope_id: id(50) },
            release: null, gate: null, values, proposals: [], cancellations: [],
            initialRoute: ['deleteScope', 'lostDelete', 'lostDeleteRemount', 'staleDeleteReceipt', 'deleteHandoffRemount'].includes(mode) ? `/shopping?scope=${id(50)}` : '/shopping' };
          const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(body) });
          window.fetch = async (url, options = {}) => {
            const pathname = new URL(url, location.href).pathname;
            if (!pathname.startsWith('/api/planning/v1/')) throw Error('Unexpected test request');
            const endpoint = pathname.slice('/api/planning/v1'.length);
            if (endpoint === '/previews') {
              const request = JSON.parse(options.body); f.proposals.push(request);
              if (request.operation !== 'shopping.scope.delete') throw Error('Unexpected destructive proposal');
              const preview = { id: id(60), operation: request.operation, payload: request.payload, revision: f.revision, expires_at: new Date(Date.now() + 600000).toISOString(),
                effects: { affected: { plans: [], meals: [], events: [], links: [], tasks: [], shopping_scopes: [{ id: id(50), name: 'Only this saved selection' }] },
                  removed_shopping_selections: [{ id: id(50), name: 'Only this saved selection', coverage_count: 0, extra_count: 0, personal_count: 0 }] } };
              return response({ preview, revision: f.revision });
            }
            if (endpoint.startsWith('/previews/') && options.method === 'DELETE') { f.cancellations.push(endpoint); return response({ cancelled: true }); }
            if (endpoint === '/commands') {
              const request = JSON.parse(options.body); f.commands.push({ ...request, body: options.body });
              if (receipts.has(request.mutation_id)) {
                if (mode === 'staleDeleteReceipt') f.revision++;
                return response(receipts.get(request.mutation_id));
              }
              if (request.expected_workspace_revision !== f.revision) return response({ code: 'revision_conflict' }, 409);
              if (request.operation === 'preview.confirm') {
                if (request.payload.preview_id !== id(60)) throw Error('Unknown preview');
                f.scopes = []; f.revision++;
                const saved = { applied: true, revision: f.revision, undo_id: id(61), undo_expires_at: new Date(Date.now() + 600000).toISOString() };
                f.deletionReceipt = saved;
                receipts.set(request.mutation_id, saved);
                if (['lostDelete', 'lostDeleteRemount', 'staleDeleteReceipt'].includes(mode)) throw Error('Synthetic lost deletion response');
                return response(saved);
              }
              if (request.operation === 'undo.apply') {
                if (request.payload.undo_id !== id(61)) throw Error('Unknown inverse');
                f.scopes = [original]; f.revision++;
                return response({ applied: true, revision: f.revision });
              }
              if (request.operation === 'shopping.scope') {
                const scope = { id: id(51), ...request.payload }; f.scopes.push(scope); f.revision++;
                const saved = { scope_id: id(51), revision: f.revision }; receipts.set(request.mutation_id, saved);
                if (mode === 'lostScope') throw Error('Synthetic lost scope response');
                f.gate = new Promise((resolve) => { f.release = () => { f.gate = null; resolve(); }; });
                if (mode === 'changedPreferences') { f.preferenceRevision++; f.preferences.shopping_layout = 'dish'; }
                return response(saved);
              }
              if (request.operation === 'preferences.update') {
                if (request.payload.expected_revision !== f.preferenceRevision) return response({ code: 'preference_revision_conflict' }, 409);
                f.preferenceRevision++; Object.assign(f.preferences, request.payload.changes);
                const saved = { revision: f.revision, preference_revision: f.preferenceRevision }; receipts.set(request.mutation_id, saved);
                if (mode === 'lostPreference') throw Error('Synthetic lost preference response');
                return response(saved);
              }
              throw Error('Unexpected command ' + request.operation);
            }
            if (f.gate) { f.held++; await f.gate; }
            const common = { revision: f.revision, next_cursor: null };
            if (endpoint === '/plans') return response({ ...common, plans: [{ id: id(1), name: 'Test plan', start_date: '2026-09-11', end_date: '2026-09-20' }] });
            if (endpoint === '/events') return response({ ...common, events: [{ id: id(3), name: 'Test event', date: '2026-09-12', time: null, guests: 2 }] });
            if (endpoint === '/shopping/scopes') return response({ ...common, scopes: f.scopes });
            if (endpoint.startsWith('/shopping/scopes/')) return response({ revision: f.revision, scope: f.scopes.find((scope) => scope.id === endpoint.split('/').at(-1)), rows: [] });
            if (endpoint === '/preferences') {
              const answer = { revision: f.revision, preference_revision: f.preferenceRevision, preferences: structuredClone(f.preferences) };
              if (f.revision === 2) f.preferenceReadsAfterWrite++;
              if (mode === 'racingPreferences' && f.preferenceReadsAfterWrite === 2) f.preferenceRevision++;
              return response(answer);
            }
            if (endpoint.endsWith('/meals')) return response({ ...common, meals: [] });
            if (endpoint.endsWith('/events')) return response({ ...common, links: [] });
            throw Error('Unexpected read ' + endpoint);
          };
          window.XMLHttpRequest = class { constructor() { throw Error('No real XHR'); } };
        }, { mode });
        await page.addScriptTag({ content: built.outputFiles[0].text });
        if (['deleteScope', 'lostDelete', 'lostDeleteRemount', 'staleDeleteReceipt', 'deleteHandoffRemount'].includes(mode)) {
          const openRemoval = async () => {
            await page.getByLabel('Saved selection actions', { exact: true }).click();
            await page.getByRole('button', { name: 'Remove saved selection', exact: true }).click();
          };
          await openRemoval();
          const modal = page.locator('dialog[open]');
          await modal.getByText('Only this saved selection', { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.fixture.commands.length), 0, 'Preview does not execute deletion');
          await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
          await page.waitForFunction(() => window.fixture.cancellations.length === 1);
          assert.equal(await page.evaluate(() => window.fixture.scopes.length), 1);
          // The native contextual disclosure stays open after cancelling its modal.
          await page.getByRole('button', { name: 'Remove saved selection', exact: true }).click();
          await modal.locator('button.pp-primary').click();
          if (['lostDelete', 'lostDeleteRemount', 'staleDeleteReceipt'].includes(mode)) {
            await modal.locator('.pp-recovery button').waitFor();
            if (mode === 'lostDeleteRemount') {
              await page.evaluate(() => window.remountShopping());
              await page.waitForFunction(() => !document.querySelector('dialog[open]'));
            }
            await page.locator('.pp-recovery button').click();
          }
          await page.waitForFunction(() => document.getElementById('route')?.textContent === '/shopping');
          await page.waitForFunction(() => !document.querySelector('.ps-layout select')?.disabled);
          const handoff = await page.evaluate(() => ({ state: history.state, receipt: window.fixture.deletionReceipt }));
          assert.doesNotMatch(JSON.stringify(handoff.state), /eyJhbGciOiJub25lIn0|eyJzdWIiOiI5MDAwMTEifQ|synthetic|token/i, 'Browser history must contain no JWT or token');
          assert.deepEqual(JSON.parse(handoff.state.usr.shoppingOwnerKey).slice(0, 3), [900011, 1, 1]);
          assert.match(JSON.parse(handoff.state.usr.shoppingOwnerKey)[3], /^[0-9a-f-]{36}$/);
          assert.deepEqual(handoff.state.usr.shoppingUndo, { id: handoff.receipt.undo_id, revision: handoff.receipt.revision, expires: handoff.receipt.undo_expires_at }, 'Handoff copies only the exact server receipt inverse, never a fresh revision');
          assert.equal(await page.getByRole('button', { name: 'Test event', exact: true }).count(), 0, 'Deletion receipt cannot reconstruct the removed selection');
          const undo = page.locator('.pp-undo button');
          assert.equal(await page.evaluate(() => window.fixture.scopes.length), 0);
          const beforeUndo = await page.evaluate(() => window.fixture.commands);
          assert.ok(beforeUndo.every((command) => command.operation === 'preview.confirm'));
          if (['lostDelete', 'lostDeleteRemount', 'staleDeleteReceipt'].includes(mode)) { assert.equal(beforeUndo.length, 2); assert.equal(beforeUndo[0].body, beforeUndo[1].body); }
          if (mode === 'staleDeleteReceipt') {
            assert.equal(await undo.count(), 0, 'An older receipt must not invent an Undo at the current revision');
            assert.equal(await page.evaluate(() => window.fixture.revision), 3);
            assert.deepEqual(errors, []);
            continue;
          }
          await undo.waitFor(); assert.equal(await undo.isEnabled(), true, 'Bounded Undo survives removal-route remount');
          if (mode === 'deleteHandoffRemount') {
            await page.evaluate(() => { window.oldShoppingPage = document.querySelector('.private-shopping'); window.remountShopping(); });
            await page.waitForFunction(() => document.querySelector('.private-shopping') !== window.oldShoppingPage && !document.querySelector('.ps-layout select')?.disabled);
            assert.equal(await undo.count(), 0, 'A new page instance rejects the previous instance nonce even with identical account generations');
            assert.deepEqual(await page.evaluate(() => history.state), handoff.state, 'History is unchanged; the old handoff is rejected, not silently reused');
            assert.deepEqual(errors, []);
            continue;
          }
          await undo.click();
          await page.waitForFunction(() => window.fixture.scopes.length === 1 && !document.querySelector('.ps-layout select').disabled);
          assert.equal(await page.getByRole('button', { name: 'Test event', exact: true }).count(), 1);
          assert.deepEqual(await page.evaluate(() => window.fixture.proposals.map((proposal) => proposal.payload)), [{ scope_id: id(50) }, { scope_id: id(50) }]);
          assert.deepEqual(errors, []);
          continue;
        }
        await page.getByRole('button', { name: 'Test event', exact: true }).click();
        const modal = page.locator('dialog[open]');
        await modal.locator('select').first().selectOption(`plan:${id(1)}`);
        await modal.getByRole('radio', { name: 'Date range', exact: true }).check();
        await modal.locator('input[type=date]').first().fill('2026-09-14');
        await modal.locator('input[type=date]').last().fill('2026-09-16');
        await page.evaluate(() => { window.originalDialog = document.querySelector('dialog[open]'); });
        await modal.getByRole('button', { name: 'Apply selection', exact: true }).click();
        if (mode !== 'lostScope') {
          await page.waitForFunction(() => window.fixture.held > 0);
          assert.equal(await page.evaluate(() => window.originalDialog === document.querySelector('dialog[open]')), true, `${mode}: same mounted dialog during null snapshot`);
          assert.equal(await modal.locator('input[type=date]').first().inputValue(), '2026-09-14');
          assert.equal(await modal.locator('input[type=date]').last().inputValue(), '2026-09-16');
          assert.equal(await modal.locator('button[type=submit]').isDisabled(), true);
          await page.evaluate(() => window.fixture.release());
        }
        if (mode === 'lostPreference' || mode === 'lostScope') {
          await modal.locator('.pp-recovery button').click();
        }
        if (mode === 'racingPreferences') {
          await modal.locator('.pp-recovery').waitFor();
          const after = await page.evaluate(() => ({ writes: window.fixture.commands, pending: JSON.parse(window.fixture.values.get('private-planning:v1:outbox:900011')) }));
          assert.equal(after.pending.state, 'rejected'); assert.equal(after.pending.status, 409);
          assert.equal(after.writes.length, 2); assert.equal(after.writes[1].payload.expected_revision, 3);
          await modal.locator('.pp-recovery details summary').click();
          await modal.locator('.pp-recovery button').click(); // Explicit discard; never a resubmission.
          await modal.locator('.pp-recovery').waitFor({ state: 'detached' });
          assert.equal(await page.evaluate(() => window.fixture.commands.length), 2);
          assert.equal(await modal.locator('input[type=date]').first().inputValue(), '2026-09-14');
          assert.deepEqual(errors, []);
          continue;
        }
        if (mode === 'changedPreferences' || mode === 'lostScope') {
          await modal.getByRole('button', { name: 'Remember this selection', exact: true }).waitFor();
          const writes = await page.evaluate(() => window.fixture.commands);
          assert.equal(writes.filter((write) => write.operation === 'preferences.update').length, 0, 'No automatic preference continuation over changed/unknown baseline');
          await modal.getByRole('button', { name: 'Remember this selection', exact: true }).click();
        }
        await page.waitForFunction((target) => document.getElementById('route')?.textContent === `/shopping?scope=${target}`, id(51));
        const writes = await page.evaluate(() => window.fixture.commands);
        const preferences = writes.filter((write) => write.operation === 'preferences.update');
        if (mode === 'lostPreference') {
          assert.equal(preferences.length, 2); assert.equal(preferences[0].body, preferences[1].body, 'Second outbox retry preserves exact body and ID');
        } else assert.equal(preferences.length, 1);
        assert.equal(preferences[0].payload.expected_revision, mode === 'changedPreferences' ? 4 : 3);
        assert.equal(preferences[0].expected_workspace_revision, 2);
        if (mode === 'normal') {
          await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('de');
          await page.waitForFunction(() => document.querySelector('.private-shopping')?.lang === 'de');
          await page.locator('.ps-preferences button').click();
          await page.waitForFunction(() => document.querySelector('.private-shopping')?.dataset.dark === 'true');
          const last = await page.evaluate(() => window.fixture.commands.slice(-2));
          assert.deepEqual(last.map((write) => write.payload.changes), [{ language: 'de' }, { dark_mode: true }]);
          assert.deepEqual(last.map((write) => write.payload.expected_revision), [4, 5]);
          assert.ok(last.every((write) => write.expected_workspace_revision === 2));
        }
        assert.deepEqual(errors, [], `${mode}: no mounted exceptions`);
      } finally { await session.close(); }
    }
  } finally { await browser.close(); }
});
test('rendered rows expose distinct name checks, arrow details, mixed state and complete sources in both languages', async () => {
  const require = createRequire(path.join(root, 'frontend/package.json'));
  const esbuild = require('esbuild');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const filename = path.join(root, 'frontend/src/components/shopping/ShoppingRows.jsx');
  const built = await esbuild.build({ entryPoints: [filename], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], logLevel: 'silent' });
  const compiled = new Module(filename); compiled.paths = Module._nodeModulePaths(path.dirname(filename)); compiled._compile(built.outputFiles[0].text, filename);
  for (const language of ['en', 'de']) {
    const row = fixture(); row.sources[0].state = 'bought';
    const copy = { ...shoppingStrings[language], undo: language === 'de' ? 'Rückgängig' : 'Undo' };
    const markup = renderToStaticMarkup(React.createElement(compiled.exports.default, {
      groups: shoppingGroups([row], 'category', language, copy), layout: 'category', scopeId: id(1), canEdit: false,
      t: copy, language, cover() {}, edit() {}, remove() {},
    }));
    assert.match(markup, /aria-checked="mixed"/);
    assert.match(markup, /<summary[^>]+aria-label="Details: Pasta"/);
    assert.match(markup, /220 g/); assert.match(markup, /600 g/); assert.match(markup, /920 g/);
    assert.match(markup, /type="checkbox"[^>]*disabled/);
    assert.doesNotMatch(markup, /<summary[^>]*><input/);
  }
});
