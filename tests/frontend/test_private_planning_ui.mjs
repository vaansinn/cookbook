// Pure-function and source-contract checks; no service, account or browser writes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  addDays, boundItemReady, commandFromForm, commonRevision, dayCount, destructiveOperations, editorReview,
  formatDate, formatQuantity, itemCommandFromForm, loadPlanningSnapshot, mapBounded, planningRoute, previewGroups, previewRecordLabel, previewTargetTitle, previewUsable,
  sessionKey, sortMeals, today, undoAfterSuccess, verifiedSession, visibleDays,
} from '../../frontend/src/components/planning/planningModel.mjs';
import { errorText, planningStrings } from '../../frontend/src/components/planning/planningStrings.mjs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const leaf = 'frontend/src/components/planning/';
const page = read('frontend/src/pages/PrivatePlanningPage.jsx');
const hook = read(`${leaf}usePlanningWorkspace.js`);
const dialogs = read(`${leaf}PlanningDialog.jsx`);
const views = read(`${leaf}PlanningViews.jsx`);
const recovery = read(`${leaf}PlanningRecovery.jsx`);
const css = read('frontend/src/styles/private-planning.css');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const plan = { id: id(1), name: 'A few meals', start_date: '2026-09-14', end_date: '2026-09-23' };
const event = { id: id(2), name: 'Supper', date: '2026-09-18', guests: 4 };
const errorCode = (code) => (err) => err.code === code;

test('shopping deletion previews identify the exact personal item, not all retained scope state', () => {
  assert.equal(previewTargetTitle({ operation: 'shopping.personal.delete', payload: { scope_id: id(1), item_id: id(2) },
    effects: { affected: { shopping_scopes: [{ id: id(1), state: { personal: [{ id: id(2), title: 'Bread' }] } }] } } }), 'Bread');
  assert.equal(previewTargetTitle({ operation: 'template.delete', payload: { template_id: id(3) },
    effects: { affected: { templates: [{ id: id(3), name: 'Dinner menu' }] } } }), 'Dinner menu');
  assert.match(dialogs, /removed_shopping_selections/);
  assert.match(dialogs, /kind !== 'shopping_scopes'/);
  assert.match(dialogs, /shoppingSelectionLoss/);
});

test('SQL decimal display removes trailing zeros and uses the page locale without changing transport values', () => {
  for (const language of ['en', 'de']) assert.equal(formatQuantity('2.000', language), '2');
  assert.equal(formatQuantity('1.250', 'de'), '1,25');
  assert.equal(formatQuantity('1.250', 'en'), '1.25');
  assert.equal(formatQuantity('0.001', 'de'), '0,001');
  assert.equal(formatQuantity('1000000.000', 'de'), '1.000.000');
  for (const invalid of ['Infinity', 'NaN', '9007199254740992', 'not a number']) assert.equal(formatQuantity(invalid, 'de'), invalid);
  assert.equal(formatQuantity(null, 'de'), '');
  assert.match(views, /formatQuantity\(item.quantity, language\)/);
  assert.match(views, /formatQuantity\(item.servings, language\)/);
  assert.equal((views.match(/<PlanningItems[^\n]*snapshot, t, language, canEdit, edit, remove, previewItem/g) || []).length, 2);
  assert.match(dialogs, /formatQuantity\(ingredient.amount, language\)/);
  assert.match(dialogs, /formatQuantity\(authored \? content.base_servings : content.servings, language\)/);
  assert.match(dialogs, /formatQuantity\(record.quantity, language\)/);
  assert.match(dialogs, /Object.entries\(record\)/); // Exact server details remain unchanged.
  assert.match(page, /PlanningItemPreview .*language=\{language\}/);
});

test('repeat commands contain only explicit source, name and new date, leaving the original unchanged', () => {
  assert.deepEqual(commandFromForm({ operation: 'plan.copy', record: plan }, { name: ' Again ', start_date: '2026-09-30', end_date: '1900-01-01' }), {
    operation: 'plan.copy', payload: { plan_id: plan.id, name: 'Again', start_date: '2026-09-30' },
  });
  assert.deepEqual(commandFromForm({ operation: 'event.copy', record: event }, { name: 'Again', date: '2026-10-01', guests: '50', time: '18:00' }), {
    operation: 'event.copy', payload: { event_id: event.id, name: 'Again', date: '2026-10-01' },
  });
  assert.equal(plan.start_date, '2026-09-14');
  assert.equal(event.guests, 4);
  for (const operation of ['plan.copy', 'event.copy']) {
    assert.throws(() => commandFromForm({ operation, record: plan }, { name: '', start_date: '2026-09-30', date: '2026-09-30' }), /required/);
    assert.throws(() => commandFromForm({ operation, record: plan }, { name: 'Again', start_date: '2026-02-30', date: '2026-02-30' }), /invalid_date/);
    assert.equal(destructiveOperations.has(operation), false);
    assert.match(views, new RegExp(operation.replace('.', '\\.')));
  }
  assert.match(dialogs, /value=\{repeating \? today\(\)/);
  assert.match(dialogs, /!repeating && <Field name="end_date"/);
  assert.match(dialogs, /isEvent && !repeating/);
  assert.match(dialogs, /repeating && .*t.planAgainNote : t.eventAgainNote/);
  assert.doesNotMatch(views, /planAgainNote|eventAgainNote/);
});

test('confirmed repeat retries share the normal success handler; stale auth cannot navigate after reload', () => {
  assert.match(recovery, /onRetried\?\.\(result, submitted.operation\)/);
  assert.match(page, /onRetried=\{onConfirmed\}/);
  assert.match(page, /onConfirmed\(result, operation\);/);
  assert.match(page, /operation === 'plan.copy' && result.plan\?\.id/);
  assert.match(page, /operation === 'event.copy' && result.event\?\.id/);
  assert.match(hook, /await reloadLatest.current\(\{ afterWrite: true \}\);[^\n]*\n\s*if \(!current\(source\)\) return null/);
});

test('deletion markers have specific localized settings guidance and do not trigger deletion or discard', () => {
  for (const language of ['en', 'de']) for (const code of ['account_deleted', 'account_deletion_pending']) {
    assert.equal(errorText({ code, readOnly: true }, planningStrings[language]), planningStrings[language][code]);
    assert.notEqual(planningStrings[language][code], planningStrings[language].error);
  }
  assert.match(planningStrings.en.account_deletion_pending, /uncertain saves are kept/);
  assert.match(page, /to="\/settings"/);
  assert.match(dialogs, /to="\/settings"/);
  assert.match(hook, /!error\?\.readOnly/);
  assert.doesNotMatch([page, dialogs, recovery, hook].join('\n'), /method:\s*['"]DELETE|account\.delete/);
});

test('guest-following shows current reviewed guest count and retains it when switching to an override', () => {
  assert.match(dialogs, /const effectiveServings = eventParent && follows \? event\?\.guests/);
  assert.match(dialogs, /if \(!change.target.checked\) setServings\(effectiveServings\)/);
  assert.match(dialogs, /<Field controlled name="servings"[^\n]*value=\{effectiveServings\}/);
  assert.match(dialogs, /controlled \? \{ value: value \?\? '' \} : \{ defaultValue: value \?\? '' \}/);
  assert.match(dialogs, /const event = snapshot.events.find/);
});

test('item submit readiness uses current loaded catalog and selected variant, including reload failures', () => {
  const loaded = { data: {}, loading: false };
  const valid = { active: true, kind: 'dish', creating: true, catalog: loaded, selection: {}, detail: loaded, variant: {} };
  assert.equal(boundItemReady(valid), true);
  for (const field of ['catalog', 'detail']) {
    for (const resource of [{ loading: true }, { ...loaded, loading: true }, { error: new Error('offline') }, { ...loaded, error: new Error('offline') }, {}]) {
      assert.equal(boundItemReady({ ...valid, [field]: resource }), false);
    }
  }
  for (const field of ['selection', 'variant']) assert.equal(boundItemReady({ ...valid, [field]: undefined }), false);
  assert.equal(boundItemReady({ ...valid, creating: false, catalog: undefined, selection: undefined }), true);
  assert.equal(boundItemReady({ ...valid, active: false }), false);
  assert.equal(boundItemReady({ active: true, kind: 'personal' }), true);
  assert.equal(boundItemReady({ active: true, kind: 'note' }), true);
  assert.equal(boundItemReady({ active: true, kind: 'unsupported' }), false);
  assert.match(dialogs, /const itemController = usePlanningItemController\(editor, snapshot, read\)/);
  assert.match(dialogs, /const itemReady = itemController.ready/);
  assert.doesNotMatch(dialogs, /setItemReady|onReady/);
  assert.match(dialogs, /if \(busy \|\| blocked \|\| \(isItem && !itemReady\)\) return/);
});

test('item transfers require the selected destination to belong to the current loaded collection', () => {
  const valid = { active: true, transfer: true, parentType: 'meal', parentId: id(5), targets: [{ id: id(5) }], destinations: { data: { meals: [{ id: id(5) }] } } };
  assert.equal(boundItemReady(valid), true);
  for (const patch of [{ parentId: '' }, { parentId: id(6) }, { targets: [] }, { destinations: { loading: true } }, { destinations: { ...valid.destinations, error: new Error('offline') } }]) {
    assert.equal(boundItemReady({ ...valid, ...patch }), false);
  }
  assert.equal(boundItemReady({ ...valid, parentType: 'event', destinations: undefined }), true);
  assert.equal(boundItemReady({ ...valid, parentType: 'event', parentId: id(6) }), false);
  assert.match(dialogs, /<Field controlled name="parent_id"[^\n]*value=\{parentId\}/);
  assert.match(dialogs, /parentId && !targets.some\(\(target\) => target.id === parentId\)/);
});

test('calendar dates handle leap days and DST without shifting local days', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(dayCount('2026-10-24', '2026-10-26'), 3);
  assert.throws(() => dayCount('2026-02-29', '2026-03-01'), /invalid_date/);
  assert.equal(today(new Date(2026, 8, 13, 23, 55)), '2026-09-13');
  assert.match(formatDate('2026-09-14', 'de'), /14/);
  assert.match(formatDate('2026-09-14', 'en'), /14/);
});

test('three-day pages cover every date exactly once, including short last page and resize clamp', () => {
  const dates = [0, 3, 6, 9].flatMap((offset) => visibleDays(plan, offset));
  assert.equal(dates.length, 10);
  assert.equal(new Set(dates).size, 10);
  assert.deepEqual(visibleDays(plan, 9), ['2026-09-23']);
  assert.deepEqual(visibleDays(plan, 999), ['2026-09-23']);
  assert.deepEqual(visibleDays({ ...plan, end_date: '2026-09-14' }, 9), ['2026-09-14']);
  assert.equal(visibleDays(plan, -3)[0], '2026-09-14');
});

test('multiple optional-named meals retain chronological date/position order without mutating source', () => {
  const meals = [{ id: id(3), date: '2026-09-15', position: 0, name: null },
    { id: id(4), date: '2026-09-14', position: 1 }, { id: id(5), date: '2026-09-14', position: 0 }];
  assert.deepEqual(sortMeals(meals).map((row) => row.id), [id(5), id(4), id(3)]);
  assert.equal(meals[0].id, id(3));
});

test('only verified initialized sessions are exposed and every auth generation affects the key', () => {
  const state = { initialized: true, user: { id: 12, email: 'not-for-planning@example.test' }, token: 'session', epoch: 2, requestGeneration: 3 };
  assert.deepEqual(verifiedSession(state), { accountId: 12, token: 'session', epoch: 2, requestGeneration: 3 });
  for (const patch of [{ initialized: false }, { token: null }, { user: null }]) assert.equal(verifiedSession({ ...state, ...patch }), null);
  for (const patch of [{ initialized: false }, { token: 'next' }, { user: { id: 13 } }, { epoch: 3 }, { requestGeneration: 4 }]) assert.notEqual(sessionKey(state), sessionKey({ ...state, ...patch }));
});

test('leaf routes stay under /planning and distinguish missing records from list routes', () => {
  assert.deepEqual(planningRoute('/planning/'), { area: 'plans', id: null });
  assert.deepEqual(planningRoute(`/planning/events/${id(2)}`), { area: 'events', id: id(2) });
  for (const route of ['/plans', '/planning/other', '/planning/events/not-an-id', `/planning/plans/${id(1)}/extra`]) assert.equal(planningRoute(route).area, 'missing');
});

function snapshotClient(revisions = {}) {
  const calls = [];
  const resources = {
    '/plans': { plans: [plan] }, '/events': { events: [event] },
    [`/plans/${plan.id}/meals`]: { meals: [{ id: id(3), date: '2026-09-15', position: 0 }] },
    [`/plans/${plan.id}/events`]: { links: [{ id: id(4), event, in_range: true, event_id: event.id, plan_id: plan.id }] },
    [`/events/${event.id}/tasks`]: { tasks: [{ id: id(5), event_id: event.id, text: 'Set the table', bucket: 'serving', done: false }] },
    [`/meals/${id(3)}/items`]: { items: [{ id: id(6), meal_id: id(3), kind: 'personal', title: 'Bread', position: 0 }] },
    [`/events/${event.id}/items`]: { items: [{ id: id(7), event_id: event.id, kind: 'note', title: 'Bring a bowl', position: 0 }] },
  };
  return { calls, async loadCollection(path, key) {
    calls.push([path, key]);
    assert.ok(resources[path]?.[key], `Unexpected path/key ${path}/${key}`);
    return { ...resources[path], revision: revisions[path] ?? 7, next_cursor: null };
  } };
}

test('plan snapshot loads only relevant children and requires one common revision', async () => {
  const client = snapshotClient();
  const snapshot = await loadPlanningSnapshot(client, { area: 'plans', id: plan.id });
  assert.equal(snapshot.revision, 7);
  assert.equal(snapshot.links[0].event.id, event.id);
  assert.equal(snapshot.meals.length, 1);
  assert.equal(snapshot.tasks.length, 0);
  assert.deepEqual(client.calls, [['/plans', 'plans'], ['/events', 'events'], [`/plans/${plan.id}/meals`, 'meals'], [`/plans/${plan.id}/events`, 'links'], [`/meals/${id(3)}/items`, 'items']]);
  assert.equal(snapshot.items[0].title, 'Bread');
});

test('event task reads share root revision; missing/deleted owner never triggers a child read', async () => {
  const client = snapshotClient();
  const snapshot = await loadPlanningSnapshot(client, { area: 'events', id: event.id });
  assert.equal(snapshot.tasks[0].text, 'Set the table');
  assert.equal(client.calls.length, 4);
  assert.equal(snapshot.items[0].title, 'Bring a bowl');
  const missing = snapshotClient();
  await loadPlanningSnapshot(missing, { area: 'plans', id: id(99) });
  assert.equal(missing.calls.length, 2);
});

test('root/child interleavings reject entire screen snapshot without automatic retry', async () => {
  for (const changed of ['/events', `/plans/${plan.id}/meals`, `/plans/${plan.id}/events`, `/meals/${id(3)}/items`]) {
    const client = snapshotClient({ [changed]: 8 });
    await assert.rejects(loadPlanningSnapshot(client, { area: 'plans', id: plan.id }), errorCode('revision_changed'));
    assert.equal(client.calls.filter(([path]) => path === changed).length, 1);
  }
  await assert.rejects(loadPlanningSnapshot(snapshotClient({ [`/events/${event.id}/tasks`]: 8 }), { area: 'events', id: event.id }), errorCode('revision_changed'));
  await assert.rejects(loadPlanningSnapshot(snapshotClient({ [`/events/${event.id}/items`]: 8 }), { area: 'events', id: event.id }), errorCode('revision_changed'));
  assert.throws(() => commonRevision([{ revision: 0 }, { revision: 1 }]), errorCode('revision_changed'));
  assert.equal(commonRevision([{ revision: 0 }, { revision: 0 }]), 0);
});

test('plan and meal forms build precise allowlisted payloads, including null clears', () => {
  assert.deepEqual(commandFromForm({ operation: 'plan.create' }, { name: '  Dinners  ', start_date: '2026-09-14', end_date: '2026-09-16' }), {
    operation: 'plan.create', payload: { name: 'Dinners', start_date: '2026-09-14', end_date: '2026-09-16' },
  });
  assert.deepEqual(commandFromForm({ operation: 'plan.rename', record: plan }, { name: 'Next week', unexpected: 'ignored' }).payload, { plan_id: plan.id, name: 'Next week' });
  assert.deepEqual(commandFromForm({ operation: 'meal.create', record: { plan_id: plan.id } }, { date: '2026-09-15', name: '', time: '' }).payload, { plan_id: plan.id, date: '2026-09-15', name: null, time: null });
  assert.deepEqual(commandFromForm({ operation: 'meal.update', record: { id: id(3) } }, { name: '  ', time: '' }).payload, { meal_id: id(3), name: null, time: null });
  for (const operation of ['meal.move', 'meal.copy']) assert.deepEqual(commandFromForm({ operation, record: { id: id(3) } }, { plan_id: id(6), date: '2026-09-16' }).payload, { meal_id: id(3), plan_id: id(6), date: '2026-09-16' });
  assert.throws(() => commandFromForm({ operation: 'plan.create' }, { name: ' ', start_date: '2026-09-14', end_date: '2026-09-16' }), /required/);
  assert.throws(() => commandFromForm({ operation: 'plan.resize', record: plan }, { start_date: '2026-09-16', end_date: '2026-09-14' }), /range/);
  assert.throws(() => commandFromForm({ operation: 'plan.create' }, { name: 'Too long', start_date: '2026-01-01', end_date: '2028-01-01' }), /range/);
});

test('event and reminder payloads preserve identity, live links, buckets and actual done state', () => {
  for (const operation of ['event.create', 'event.update']) {
    const payload = commandFromForm({ operation, record: event }, { name: 'Supper', date: '2026-09-18', time: '18:30', guests: '4' }).payload;
    assert.equal(payload.guests, 4);
    assert.equal(payload.event_id, operation === 'event.update' ? event.id : undefined);
  }
  assert.deepEqual(commandFromForm({ operation: 'event.link' }, { plan_id: plan.id, event_id: event.id }).payload, { plan_id: plan.id, event_id: event.id });
  assert.deepEqual(commandFromForm({ operation: 'task.create', record: { event_id: event.id } }, { text: 'Set table', bucket: 'earlier', done: 'on' }).payload, { event_id: event.id, text: 'Set table', bucket: 'earlier' });
  assert.deepEqual(commandFromForm({ operation: 'task.update', record: { id: id(5) } }, { text: 'Set table', bucket: 'day' }).payload, { task_id: id(5), text: 'Set table', bucket: 'day', done: false });
});

test('destructive previews retain all exact affected records/counts, including future dependencies', () => {
  assert.deepEqual([...destructiveOperations].sort(), ['event.delete', 'event.unlink', 'item.delete', 'meal.delete', 'meal.move', 'plan.delete', 'plan.resize', 'shopping.personal.delete', 'shopping.scope.delete', 'task.delete', 'template.delete']);
  const affected = { plans: [plan], meals: [{ id: id(3), name: 'Dinner' }], events: [], links: [], tasks: [], items: [{ id: id(8), name: 'Future dependent record' }] };
  const groups = previewGroups({ effects: { affected } });
  assert.equal(groups.find((group) => group.kind === 'meals').records, affected.meals);
  assert.equal(groups.find((group) => group.kind === 'items').count, 1);
  assert.equal(groups.reduce((sum, group) => sum + group.count, 0), 3);
  assert.throws(() => previewGroups({ effects: { affected: { plans: [] } } }), errorCode('invalid_response'));
  assert.throws(() => previewGroups({ effects: { affected: { ...affected, items: [{}] } } }), errorCode('invalid_response'));
});

test('preview confirmation requires an unexpired proposal for the displayed revision', () => {
  const preview = { id: id(10), revision: 7, expires_at: '2026-09-13T12:10:00Z' };
  assert.equal(previewUsable(preview, 7, Date.parse('2026-09-13T12:09:59Z')), true);
  assert.equal(previewUsable(preview, 8, Date.parse('2026-09-13T12:09:59Z')), false);
  assert.equal(previewUsable(preview, 7, Date.parse(preview.expires_at)), false);
  assert.equal(previewUsable({ ...preview, expires_at: 'invalid' }, 7, 0), false);
});

test('item and note preview labels use exact saved titles and preserve unresolved recipe references', () => {
  assert.equal(previewRecordLabel({ id: id(8), kind: 'note', title: 'Ask about allergies', group: 'Before supper' }), 'Ask about allergies');
  assert.equal(previewRecordLabel({ id: id(9), kind: 'personal', title: 'Bread' }), 'Bread');
  assert.equal(previewRecordLabel({ id: id(10), kind: 'dish', title: null, entry_id: 'saved-reference' }), 'saved-reference');
  assert.match(dialogs, /record\.group/);
});

test('preview link labels use owned plan names only at the proposal revision, with exact ID fallback', () => {
  const link = { id: id(4), plan_id: plan.id, event_id: event.id };
  const context = { kind: 'links', revision: 7, snapshot: { plans: [plan], revision: 7 } };
  assert.equal(previewRecordLabel(link, context), plan.name);
  assert.equal(previewRecordLabel(link, { ...context, snapshot: { plans: [plan], revision: 8 } }), plan.id);
  assert.equal(previewRecordLabel(link, { ...context, snapshot: null }), plan.id);
  assert.equal(previewRecordLabel(link, { kind: 'links', snapshot: { plans: [plan] } }), plan.id);
  assert.equal(previewRecordLabel(link, { ...context, affected: { plans: [{ ...plan, name: 'Exact preview name' }] } }), 'Exact preview name');
  assert.deepEqual(link, { id: id(4), plan_id: plan.id, event_id: event.id });
});

test('compact confirmation names the affected target and hides empty categories without removing exact details', () => {
  const preview = { operation: 'event.delete', payload: { event_id: event.id }, effects: { affected: { plans: [], meals: [], events: [event], links: [], tasks: [], items: [] } } };
  assert.equal(previewTargetTitle(preview), 'Supper');
  assert.equal(previewTargetTitle({ ...preview, payload: { event_id: id(99) } }), null);
  assert.equal(previewGroups(preview).length, 6);
  assert.match(dialogs, /previewGroups\(preview\)\.filter\(\(\{ kind, count \}\) => count > 0 && kind !== 'shopping_scopes'\)/);
  assert.match(dialogs, /linked_events_outside_range\?\.length > 0/);
  assert.match(dialogs, /Object.entries\(record\)/);
  assert.match(dialogs, /labelContext=\{\{ kind, snapshot, revision: preview.revision/);
});

test('EN/DE dictionaries have matching labels, honest foundation notice and localized recovery', () => {
  const { en, de } = planningStrings;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(de).sort());
  for (const strings of [en, de]) for (const [key, value] of Object.entries(strings)) assert.ok(value.length, key);
  assert.match(en.foundationBody, /shopping lists and templates are private and saved to your account/);
  assert.match(en.foundationBody, /guided cooking from a planned configuration is not available yet/);
  assert.match(de.foundationBody, /Einkaufslisten und Vorlagen sind privat/);
  assert.match(de.foundationBody, /Geführtes Kochen aus einer geplanten Konfiguration ist noch nicht verfügbar/);
  assert.equal(errorText({ code: 'write_coordination_unavailable' }, en), en.lockUnavailable);
  assert.equal(errorText({ code: 'writer_busy' }, de), de.lockError);
  assert.equal(errorText({ code: 'storage_blocked' }, de), de.storageError);
  assert.equal(errorText({ code: 'http_error', status: 401 }, en), en.sessionError);
  assert.equal(errorText({ code: 'http_error', status: 422 }, en), en.sessionError);
  assert.equal(errorText({ code: 'review_required' }, en), en.review_required);
  assert.equal(errorText({ code: 'review_required' }, de), de.review_required);
  assert.match(en.review_required, /Review the submitted change below/);
  assert.match(de.review_required, /Prüfe unten die gesendete Änderung/);
  assert.doesNotMatch(en.review_required, /close/i);
  assert.doesNotMatch(de.review_required, /schließe/i);
});

test('source contract: session subscriptions, generation fences and receipt-only recovery', () => {
  assert.match(hook, /useAuthStore\.subscribe/);
  assert.match(hook, /client\.sessionChanged\(\)/);
  assert.match(hook, /client\.dispose\(\)/);
  assert.match(hook, /ticket !== generation\.current/);
  assert.match(hook, /setSnapshot\(null\)/);
  assert.match(hook, /await source\.client\.discardRejected\(\)/);
  assert.match(hook, /await source\.client\.retry\(\)/);
  assert.doesNotMatch(hook, /setSnapshot\((?:response|result)/);
  assert.match(page, /key=\{key\}/);
  assert.match(page, /!initialized \? <p role="status">\{t.loading\}/);
  assert.match(recovery, /rejected && !reviewed/);
  assert.match(recovery, /JSON\.parse\(pending\.body\)/);
});

test('source contract: native dialogs, server previews, explicit confirm/undo and no local seed', () => {
  const source = [page, hook, views, dialogs].join('\n');
  assert.match(dialogs, /<dialog/);
  assert.match(dialogs, /node\.showModal\(\)/);
  assert.match(dialogs, /onCancel=/);
  assert.match(dialogs, /origin\.focus\(\)/);
  assert.match(dialogs, /aria-labelledby=/);
  assert.match(page, /'preview\.confirm', \{ preview_id: proposal\.id \}, proposal\.revision/);
  assert.match(page, /'undo\.apply', \{ undo_id: workspace\.undo\.id \}/);
  assert.match(hook, /source\.client\.preview\(operation, payload, expectedRevision\)/);
  assert.match(hook, /source\.client\.cancelPreview\(id\)/);
  assert.doesNotMatch(source, /window\.confirm|localStorage\.(?:setItem|removeItem|clear)|useCookStore|useMealPlanStore|dangerouslySetInnerHTML|<img|fetch\(/);
  assert.match(page, /to="\/plans"/);
  assert.match(page, /to="\/"/);
  assert.match(views, /!link\.in_range/);
  assert.match(views, /checked=\{task\.done\}/);
  assert.match(views, /'task\.update', \{ task_id: task\.id, done: !task\.done \}/);
});

test('CSS contract: bounded three-column board, phone agenda, theme class and visible 44px controls', () => {
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /max-height: min\(55vh, 34rem\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.pp-day-body \{ max-height: none/);
  assert.match(css, /\.dark \.private-planning/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /@import|https?:|url\(/);
  assert.doesNotMatch(css, /Baloo/);
  assert.match(css, /"Bricolage Grotesque", "Plus Jakarta Sans"/);
});

test('approved light/dark text pairs meet AA contrast', () => {
  const sections = [css.match(/\.private-planning \{([\s\S]*?)\}/)[1], css.match(/\.dark \.private-planning \{([\s\S]*?)\}/)[1]];
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const section of sections) {
    const tokens = Object.fromEntries([...section.matchAll(/--pp-([\w-]+): (#[\da-f]{6});/g)].map(([, key, hex]) => [key, hex]));
    for (const [fg, bg] of [['ink', 'paper'], ['ink', 'surface'], ['muted', 'oat'], ['muted', 'surface'], ['blue', 'surface'], ['on-blue', 'blue'], ['note-ink', 'note'], ['danger', 'surface']]) {
      const [a, b] = [luminance(tokens[fg]), luminance(tokens[bg])].sort((x, y) => y - x);
      assert.ok((a + .05) / (b + .05) >= 4.5, `${fg}/${bg}`);
    }
  }
});

test('recovery is inside both native dialogs and blocked is distinct from actively saving', () => {
  assert.match(page, /!editor && !proposal && !templateEditor && recovery/);
  assert.equal((dialogs.match(/\{recovery\}/g) || []).length, 2);
  assert.match(page, /busy=\{busy\} blocked=/);
  assert.doesNotMatch(page, /busy=\{busy \|\| !!workspace.pending\}/);
  assert.match(dialogs, /disabled=\{busy \|\| blocked \|\| invalidTargets \|\| \(isItem && !itemReady\)\}/);
  assert.match(dialogs, /\{busy \? t.saving : destructiveOperations/);
  assert.match(recovery, /if \(result && !rejected\) onRetried/);
  assert.doesNotMatch(recovery, /setEditor|setProposal|localStorage/);
});

test('discard/revalidation retains draft fields until explicit review of the newest revision', () => {
  const original = { operation: 'plan.rename', record: plan, revision: 7 };
  const latest = { ...plan, name: 'Changed in another tab' };
  const snapshot = { plans: [latest], events: [event], meals: [], tasks: [], revision: 8 };
  const comparison = editorReview(original, snapshot);
  assert.deepEqual(comparison, { changed: true, available: true, record: latest });
  assert.equal(original.record.name, 'A few meals');
  assert.equal(original.revision, 7);
  assert.equal(editorReview(original, { ...snapshot, plans: [] }).available, false);
  assert.equal(editorReview({ operation: 'meal.create', record: { plan_id: plan.id }, revision: 7 }, { ...snapshot, plans: [] }).available, false);
  assert.equal(editorReview({ operation: 'task.create', record: { event_id: event.id }, revision: 7 }, snapshot).available, true);
  assert.equal(editorReview({ operation: 'plan.create', record: {}, revision: 7 }, snapshot).available, true);
  assert.match(page, /setEditor\(\(draft\) => \(\{ \.\.\.draft, revision: snapshot.revision, snapshot \}\)\)/);
  assert.match(dialogs, /review\.record.*PreviewRecords/);
  assert.match(dialogs, /defaultValue: value \?\? ''/);
});

test('undo is retained through a rejected discard and is changed only after a confirmed successor', () => {
  const existing = { id: id(9), revision: 7, expires: '2026-09-13T12:10:00Z' };
  assert.equal(undoAfterSuccess(existing, undefined, 'discard'), existing);
  assert.equal(undoAfterSuccess(existing, { revision: 8 }, null), null);
  assert.deepEqual(undoAfterSuccess(existing, { undo_id: id(10), undo_expires_at: '2026-09-13T12:12:00Z', revision: 8 }, 'retry'), {
    id: id(10), expires: '2026-09-13T12:12:00Z', revision: 8,
  });
  const runBody = hook.slice(hook.indexOf('async function run('), hook.indexOf('async function preview('));
  assert.doesNotMatch(runBody.slice(0, runBody.indexOf('const response =')), /setUndo/);
  assert.doesNotMatch(runBody.slice(runBody.indexOf('} catch')), /setUndo/);
  assert.match(runBody, /setUndo\(\(previous\) => undoAfterSuccess/);
  assert.match(hook, /value\?\.revision === next.revision \? value : null/);
  assert.match(page, /disabled=\{!canEdit\} onClick=\{\(\) => workspace.run\('undo.apply'/);
});

test('foreground revalidation retains the snapshot/draft, fences reads, and waits for active writes', () => {
  assert.match(hook, /window.addEventListener\('focus', onForeground\)/);
  assert.match(hook, /document.addEventListener\('visibilitychange', onForeground\)/);
  assert.match(hook, /document.visibilityState === 'visible'/);
  assert.match(hook, /if \(!background\) setSnapshot\(null\)/);
  assert.match(hook, /if \(writing.current && !afterWrite\)/);
  assert.match(hook, /if \(revalidateAfterWrite.current\) reloadLatest.current\(\{ background: true \}\)/);
  const storageHandler = hook.slice(hook.indexOf('const onStorage ='), hook.indexOf('const onForeground ='));
  assert.doesNotMatch(storageHandler, /setSnapshot\(null\)|setUndo\(null\)/);
  assert.match(page, /workspace.stale \|\| review.changed/);
  assert.match(dialogs, /onClick=\{onReviewLatest\}/);
});

test('compact page keeps one collapsed truthful notice and local language/theme controls', () => {
  assert.match(page, /<details className="pp-foundation"><summary>\{t.foundationSummary\}/);
  assert.doesNotMatch(page, /<details className="pp-foundation" open/);
  assert.doesNotMatch(views, /t.mealFoundation/);
  assert.match(page, /<LangSwitch \/>/);
  assert.match(page, /<ThemeSwitch \/>/);
  assert.match(css, /\.pp-preferences .*--brand: var\(--pp-blue\)/);
  assert.match(css, /\.private-planning \.pp-preferences button/);
});

test('item reads are limited to visible meal dates, with bounded concurrent work', async () => {
  const client = snapshotClient();
  const result = await loadPlanningSnapshot(client, { area: 'plans', id: plan.id, offset: 6 });
  assert.equal(result.items.length, 0);
  assert.equal(client.calls.filter(([path]) => path.endsWith('/items')).length, 0);
  let flights = 0, maximum = 0;
  const rows = await mapBounded([1, 2, 3, 4, 5, 6], async (value) => {
    flights++; maximum = Math.max(maximum, flights);
    await new Promise((resolve) => setImmediate(resolve));
    flights--; return value * 2;
  }, 2);
  assert.equal(maximum, 2);
  assert.deepEqual(rows, [2, 4, 6, 8, 10, 12]);
});

test('personal items keep decimal strings and quantity/unit pairing; notes cannot acquire recipe or shopping fields', () => {
  const create = { operation: 'item.create', record: { parent_type: 'meal', parent_id: id(3) } };
  assert.deepEqual(itemCommandFromForm(create, { kind: 'personal', title: ' Bread ', quantity: '1.250', unit: 'loaf', group: 'Sides', contribution: 'Guest' }).payload, {
    parent_type: 'meal', parent_id: id(3), kind: 'personal', title: 'Bread', quantity: '1.250', unit: 'loaf', group: 'Sides', contribution: 'Guest',
  });
  const note = itemCommandFromForm(create, { kind: 'note', title: 'Bring bowl', quantity: '10', unit: 'kg', servings: '4', follows_guests: 'on' }).payload;
  assert.deepEqual(note, { parent_type: 'meal', parent_id: id(3), kind: 'note', title: 'Bring bowl', group: null, contribution: null });
  assert.deepEqual(itemCommandFromForm({ operation: 'item.update', record: { id: id(6), kind: 'personal' } }, { title: 'Bread', quantity: '', unit: '' }).payload, {
    item_id: id(6), title: 'Bread', quantity: null, unit: null, group: null, contribution: null,
  });
  for (const values of [{ quantity: '1', unit: '' }, { quantity: '', unit: 'g' }, { quantity: '0', unit: 'g' }, { quantity: '1.0001', unit: 'g' }, { quantity: '1e3', unit: 'g' }]) {
    assert.throws(() => itemCommandFromForm(create, { kind: 'personal', title: 'Bread', ...values }), /quantityInvalid/);
  }
});

test('dish creation pins exact catalog revision/language/variant; guest following excludes an explicit serving override', () => {
  const create = { operation: 'item.create', record: { parent_type: 'event', parent_id: event.id } };
  const selection = { kind: 'dish', entry_id: 'published-entry', catalog_revision: '3', language: 'de', variant_id: 'authored-option', servings: '4' };
  assert.deepEqual(itemCommandFromForm(create, selection).payload, {
    parent_type: 'event', parent_id: event.id, kind: 'dish', entry_id: 'published-entry', catalog_revision: 3, language: 'de',
    options: { variant_id: 'authored-option' }, servings: 4, follows_guests: false, group: null, contribution: null,
  });
  const following = itemCommandFromForm(create, { ...selection, follows_guests: 'on', servings: '999' }).payload;
  assert.equal(following.follows_guests, true);
  assert.equal(Object.hasOwn(following, 'servings'), false);
  assert.equal(Object.hasOwn(following, 'quantity'), false);
  assert.throws(() => itemCommandFromForm(create, { ...selection, variant_id: '' }), /catalogUnavailable/);
  assert.throws(() => itemCommandFromForm(create, { ...selection, entry_id: '' }), /catalogEmpty/);
  assert.throws(() => itemCommandFromForm(create, { ...selection, servings: '1.5' }), /servingsInvalid/);
});

test('dish edits cannot repin identity or alter another item; explicit move/copy carries only source and destination', () => {
  const row = { id: id(8), kind: 'dish', meal_id: id(3), entry_id: 'pinned-entry', catalog_revision: 1, language: 'en' };
  const edited = itemCommandFromForm({ operation: 'item.update', record: row }, { variant_id: 'next-option', servings: '3', entry_id: 'replacement', catalog_revision: 7, language: 'de' }).payload;
  assert.deepEqual(edited, { item_id: id(8), options: { variant_id: 'next-option' }, servings: 3, group: null, contribution: null });
  assert.equal(row.entry_id, 'pinned-entry');
  for (const operation of ['item.move', 'item.copy']) assert.deepEqual(itemCommandFromForm({ operation, record: row }, { parent_type: 'event', parent_id: event.id, follows_guests: 'on' }), {
    operation, payload: { item_id: id(8), parent_type: 'event', parent_id: event.id },
  });
  assert.throws(() => itemCommandFromForm({ operation: 'item.delete', record: row }, {}), /invalid_command/);
});

test('item editor review keeps drafts and requires an existing parent/record at the new revision', () => {
  const snapshot = { plans: [plan], events: [event], meals: [{ id: id(3) }], tasks: [], items: [{ id: id(8), title: 'Changed bread' }], revision: 8 };
  assert.equal(editorReview({ operation: 'item.create', record: { parent_type: 'meal', parent_id: id(3) }, revision: 7 }, snapshot).available, true);
  assert.equal(editorReview({ operation: 'item.create', record: { parent_type: 'meal', parent_id: id(9) }, revision: 7 }, snapshot).available, false);
  const draft = { operation: 'item.update', record: { id: id(8), title: 'My bread' }, revision: 7 };
  assert.equal(editorReview(draft, snapshot).record.title, 'Changed bread');
  assert.equal(draft.record.title, 'My bread');
});

test('item/catalog UI uses fenced reads, exact options, honest empty publication state and no cooking link', () => {
  assert.match(hook, /const read = useCallback/);
  assert.match(hook, /result.revision !== revision/);
  assert.match(dialogs, /state.identity === identity/);
  assert.match(dialogs, /return \(\) => \{ active = false; \}/);
  assert.match(dialogs, /\/catalog\?language=\$\{language\}/);
  assert.match(dialogs, /\/catalog\/\$\{entryId\}\/\$\{catalogRevision\}\?language=\$\{language\}/);
  assert.match(dialogs, /\/items\/\$\{item.id\}\/preview/);
  assert.match(dialogs, /catalog.data && !entries.length/);
  assert.match(dialogs, /variants.find\(\(entry\) => entry.id === variantId\)/);
  assert.doesNotMatch(dialogs, /variants\[0\]|to=["']\/cook|\/catalog\/resolve/);
  assert.match(dialogs, /content.kind === 'planning_example'/);
  assert.match(dialogs, /content.kind === 'recipe'/);
  assert.match(dialogs, /authored \? t.authoredFor : t.resolvedFor/);
  assert.match(views, /t.contributionExcluded/);
  assert.match(views, /remove\('item.delete', \{ item_id: item.id \}\)/);
  assert.doesNotMatch(views, /guests.toLowerCase|servings.toLowerCase/);
  assert.equal(planningStrings.de.guestsCount, 'Gäste');
  assert.equal(planningStrings.de.servingsCount, 'Portionen');
});
