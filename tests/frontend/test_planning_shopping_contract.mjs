// Pure transport-contract tests: synthetic responses, memory storage, no network.
// Run: node --test tests/frontend/test_planning_shopping_contract.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { createPlanningClient } from '../../frontend/src/api/planning.mjs';
import { loadPlanningSnapshot } from '../../frontend/src/components/planning/planningModel.mjs';
import { amountEdit, coverage, coverPayload, currentProjection, decimal, scopeCommand, shoppingGroups, shoppingLayouts } from '../../frontend/src/components/shopping/shoppingModel.mjs';
import { shoppingStrings } from '../../frontend/src/components/shopping/shoppingStrings.mjs';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
function fixture() {
  const values = new Map(), calls = [];
  let session = { accountId: 'shopping-A', token: 'synthetic-A' };
  let transport = async () => response({ revision: 8 });
  let held = false;
  const client = createPlanningClient({
    getSession: () => session,
    storage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    },
    lockManager: { async request(name, options, fn) {
      assert.equal(options.ifAvailable, true);
      if (held) return fn(null);
      held = true;
      try { return await fn({ name }); } finally { held = false; }
    } },
    fetchImpl: (url, options) => { calls.push({ url, options }); return transport(url, options); },
  });
  return { client, calls, values,
    respond: fn => { transport = fn; },
    switchAccount() { session = { accountId: 'shopping-B', token: 'synthetic-B' }; client.sessionChanged(); },
  };
}

test('scope list and complete projection use authenticated no-store reads', async () => {
  const f = fixture();
  f.respond(async url => response(url.endsWith(id(1))
    ? { revision: 7, scope: { id: id(1) }, rows: [] }
    : { revision: 7, scopes: [{ id: id(1) }], next_cursor: null }));
  const list = await f.client.loadCollection('/shopping/scopes', 'scopes');
  assert.equal(list.scopes[0].id, id(1));
  assert.deepEqual((await f.client.read(`/shopping/scopes/${id(1)}`)).rows, []);
  assert.equal(f.calls.length, 2);
  for (const { url, options } of f.calls) {
    assert.ok(url.startsWith('/api/planning/v1/shopping/scopes'));
    assert.equal(options.headers.Authorization, 'Bearer synthetic-A');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
  }
  assert.equal(f.values.size, 0, 'reading cannot create local saved shopping state');
  f.client.dispose();
});

const commands = [
  ['shopping.scope', { owner_type: 'plan', owner_id: id(1), mode: 'meals', selection: [] }],
  ['shopping.cover', { scope_id: id(2), row_key: 'opaque-server-key', source_ids: [id(3)], status: 'have', include_extra: false }],
  ['shopping.extra', { scope_id: id(2), row_key: 'opaque-server-key', amount: '100.000' }],
  ['template.save', { parent_type: 'meal', parent_id: id(3), name: 'Synthetic menu' }],
  ['template.apply', { template_id: id(4), parent_type: 'event', parent_id: id(5) }],
  ['preferences.update', { expected_revision: 0, changes: { shopping_layout: 'dish', shopping_scope_id: id(2), language: 'de', dark_mode: true } }],
];
for (const [operation, payload] of commands) {
  test(`${operation}: lost response retains exact bytes and retry never rebuilds the payload`, async () => {
    const f = fixture();
    let attempts = 0;
    f.respond(async () => {
      if (++attempts === 1) throw Error('synthetic lost response after commit');
      return response({ revision: operation === 'preferences.update' ? 7 : 8 });
    });
    const draft = structuredClone(payload);
    await assert.rejects(f.client.command(operation, draft, 7), e => e.code === 'network_error');
    const pending = f.client.pending();
    assert.equal(pending.state, 'pending');
    const saved = JSON.parse(pending.body);
    assert.equal(saved.operation, operation);
    assert.deepEqual(saved.payload, payload);
    assert.equal(saved.expected_workspace_revision, 7);
    draft.unrelatedLaterEdit = 'must not enter retry';
    const result = await f.client.retry();
    assert.equal(f.calls[0].options.body, f.calls[1].options.body);
    assert.equal(result.requiresReload, true);
    assert.equal(result.result.revision, operation === 'preferences.update' ? 7 : 8);
    assert.equal(f.client.pending(), null);
    f.client.dispose();
  });
}

test('shopping conflict remains explicit and prevents a second command until reviewed', async () => {
  const f = fixture();
  f.respond(async () => response({ code: 'revision_conflict', current_revision: 9 }, 409));
  const [, payload] = commands[1];
  await assert.rejects(f.client.command('shopping.cover', payload, 7), e => e.code === 'review_required');
  const rejected = f.client.pending();
  assert.equal(rejected.state, 'rejected');
  await assert.rejects(f.client.retry(), e => e.code === 'review_required');
  assert.equal(f.calls.length, 1);
  await f.client.discardRejected();
  f.respond(async () => response({ revision: 10 }));
  await f.client.command('shopping.cover', payload, 9);
  assert.notEqual(JSON.parse(rejected.body).mutation_id, JSON.parse(f.calls[1].options.body).mutation_id);
  f.client.dispose();
});

test('late private projection cannot render after account change', async () => {
  const f = fixture();
  let finish;
  f.respond(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.client.read(`/shopping/scopes/${id(1)}`);
  const rejected = assert.rejects(pending, e => e.code === 'stale_session');
  assert.equal(typeof finish, 'function', 'projection route must reach transport');
  f.switchAccount();
  finish(response({ revision: 7, rows: [{ privateTitle: 'Account A only' }] }));
  await rejected;
  assert.equal(f.client.pending(), null);
  f.client.dispose();
});

test('dependent meal move, template and scope deletion request previews without domain writes', async () => {
  const f = fixture();
  f.respond(async () => response({ revision: 7, preview: { id: id(9) } }, 201));
  for (const [operation, payload] of [
    ['meal.move', { meal_id: id(1), plan_id: id(2), date: '2026-09-18' }],
    ['template.delete', { template_id: id(3) }],
    ['shopping.scope.delete', { scope_id: id(4) }],
  ]) {
    const value = await f.client.preview(operation, payload, 7);
    assert.equal(value.preview.id, id(9));
    assert.deepEqual(JSON.parse(f.calls.at(-1).options.body), { operation, payload, expected_workspace_revision: 7 });
    assert.equal(f.client.pending(), null);
  }
  f.client.dispose();
});

const source = (n, amount, group = `dish-${n}`) => ({
  id: `opaque-source-${n}`, item_id: id(n), group_id: group, dish_title: group,
  amount, unit: 'g', date: '2026-09-18', state: 'needed', review: false,
});
function sharedRow(extra = '100.000') {
  return { key: 'opaque-pasta-row', ingredient_id: 'synthetic-pasta', form: 'dry', unit: 'g',
    label: 'Synthetic pasta', category: 'cupboard', purchase_mode: 'measured',
    required: '820.000', extra, total: extra === '0.000' ? '820.000' : '920.000',
    sources: [source(1, '220.000'), source(2, '600.000')],
    extra_state: 'needed', extra_review: false, remaining: '920.000', state: 'needed' };
}

test('four views preserve the authoritative aggregate and full local dish sources in EN/DE', () => {
  const row = sharedRow();
  const original = structuredClone(row);
  for (const lang of ['en', 'de']) for (const layout of shoppingLayouts) {
    const refs = shoppingGroups([row], layout, lang, shoppingStrings[lang]).flatMap(group => group.rows);
    assert.equal(refs.length, layout === 'dish' ? 2 : 1);
    for (const ref of refs) {
      assert.equal(ref.row.total, '920.000');
      assert.equal(ref.row.required, '820.000');
    }
    if (layout === 'dish') {
      assert.deepEqual(refs.map(ref => ref.sources.map(s => s.amount)), [['220.000'], ['600.000']]);
      assert.ok(refs.every(ref => !ref.includeExtra), 'dish checkbox does not allocate the extra');
    }
  }
  assert.deepEqual(row, original, 'grouping must not mutate quantity or saved coverage');
});

test('dish selection covers only its sources; full total includes independent extra', () => {
  const row = sharedRow();
  const refs = shoppingGroups([row], 'dish', 'en', shoppingStrings.en).flatMap(group => group.rows);
  const local = coverPayload(id(9), row, refs[0].sources, 'bought', refs[0].includeExtra);
  assert.deepEqual(local.source_ids, ['opaque-source-1']);
  assert.equal(local.include_extra, false);
  const whole = coverPayload(id(9), row, row.sources, 'have', true);
  assert.deepEqual(whole.source_ids, ['opaque-source-1', 'opaque-source-2']);
  assert.equal(whole.include_extra, true);
  row.sources[0].state = 'bought';
  assert.equal(coverage(row).state, 'partial');
  assert.equal(coverage(row, refs[0].sources, false).checked, true);
  row.sources[1].state = 'have';
  assert.equal(coverage(row).state, 'partial', 'unanswered extra prevents full coverage');
  row.extra_state = 'have';
  assert.equal(coverage(row).state, 'covered');
  row.sources[0].review = true;
  assert.equal(coverage(row).state, 'review');
});

test('consolidated checkbox payload does not request a nonexistent extra allocation', () => {
  const row = sharedRow('0.000');
  for (const layout of ['category', 'alphabetical', 'amount']) {
    const ref = shoppingGroups([row], layout, 'en', shoppingStrings.en)[0].rows[0];
    const payload = coverPayload(id(9), ref.row, ref.sources, 'bought', ref.includeExtra);
    assert.equal(payload.include_extra, false, `${layout} must be accepted by shopping.cover when extra is zero`);
    assert.equal(payload.source_ids.length, 2);
  }
});

test('amount editing preserves draft typing, corrects minimum on finish, and emits exact extra', () => {
  const row = sharedRow();
  const original = structuredClone(row);
  assert.equal(amountEdit('8', row, false).value, '8');
  assert.equal(amountEdit('8', row, false).corrected, false);
  assert.deepEqual(amountEdit('8', row, true), { value: '820.000', extra: '0.000', corrected: true, error: null });
  for (const value of ['', ' ', 'nope', 'NaN', '1e3', '920.0001']) {
    assert.equal(amountEdit(value, row, true).error, 'invalidAmount');
    assert.equal(amountEdit(value, row, true).value, value);
  }
  assert.equal(amountEdit('920,125', row, true).extra, '100.125');
  assert.equal(decimal(amountEdit('820.001', row, true).extra), 1n);
  assert.deepEqual(row, original);
});

test('explicit empty scope stays empty and obsolete selections never widen to all', () => {
  const plan = { id: id(1), start_date: '2026-09-13', end_date: '2026-09-22' };
  assert.deepEqual(scopeCommand('plan', plan, { mode: 'meals', selection: [] }, []),
    { owner_type: 'plan', owner_id: id(1), mode: 'meals', selection: [] });
  assert.throws(() => scopeCommand('plan', plan, { mode: 'meals', selection: [`meal:${id(4)}`] }, []));
  assert.throws(() => scopeCommand('plan', plan, { mode: 'dates', start_date: '2026-09-12', end_date: '2026-09-14' }));
  assert.throws(() => scopeCommand('event', { id: id(2) }, { mode: 'meals', selection: [] }));
});

function snapshotClient(projectionRevision = 7) {
  const calls = [];
  const data = new Map([
    ['/plans', { plans: [{ id: id(1), start_date: '2026-09-13', end_date: '2026-09-22' }], revision: 7 }],
    ['/events', { events: [{ id: id(2), date: '2026-09-18' }], revision: 7 }],
    ['/shopping/scopes', { scopes: [{ id: id(9), plan_id: id(1), mode: 'all' }], revision: 7 }],
    ['/preferences', { preferences: { shopping_scope_id: id(9), shopping_layout: 'dish' }, preference_revision: 3, revision: 7 }],
    [`/shopping/scopes/${id(9)}`, { scope: { id: id(9) }, rows: [sharedRow()], revision: projectionRevision }],
  ]);
  const read = async path => {
    calls.push(path);
    assert.ok(data.has(path), `unexpected child/recipe read ${path}`);
    return structuredClone(data.get(path));
  };
  return { calls, client: { read, loadCollection: read } };
}

test('shopping snapshot uses the complete server projection, independent of the three-day agenda', async () => {
  const f = snapshotClient();
  const snapshot = await loadPlanningSnapshot(f.client, { area: 'shopping', id: id(9), offset: 0 });
  assert.equal(currentProjection(snapshot, id(9)).rows[0].required, '820.000');
  assert.equal(snapshot.items.length, 0, 'shopping does not reconstruct demand from visible item cards');
  assert.equal(f.calls.length, 5);
  assert.equal(currentProjection(snapshot, id(88)), null);
  assert.equal(currentProjection({ ...snapshot, revision: 8 }, id(9)), null);
});

test('a changed projection revision rejects the entire shopping snapshot', async () => {
  const f = snapshotClient(8);
  await assert.rejects(loadPlanningSnapshot(f.client, { area: 'shopping', id: id(9) }), e => e.code === 'revision_changed');
  assert.equal(f.calls.length, 5, 'no implicit restart using a different baseline');
});
