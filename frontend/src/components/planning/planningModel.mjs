// Calendar dates stay calendar dates: never derive them from UTC midnight in the
// viewer's timezone. These helpers also form the page's small testable boundary.
export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const dayStamp = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('invalid_date');
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw new Error('invalid_date');
  return value;
};
export const dayCount = (start, end) => Math.round((dayStamp(end) - dayStamp(start)) / 86400000) + 1;
export const addDays = (date, amount) => new Date(dayStamp(date) + amount * 86400000).toISOString().slice(0, 10);
export function visibleDays(plan, offset = 0) {
  const count = dayCount(plan.start_date, plan.end_date);
  const first = Math.max(0, Math.min(Math.floor(offset / 3) * 3, Math.floor((count - 1) / 3) * 3));
  return Array.from({ length: Math.min(3, count - first) }, (_, i) => addDays(plan.start_date, first + i));
}
export function formatDate(date, language, options = {}) {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', ...options, timeZone: 'UTC',
  }).format(new Date(dayStamp(date)));
}
// SQL decimals are transport strings, not localized display text. Preserve raw
// values in forms/exact details; format only finite, safely bounded UI numbers.
export function formatQuantity(value, language) {
  const raw = String(value ?? '');
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return raw;
  const number = Number(raw);
  if (!Number.isFinite(number) || number > Number.MAX_SAFE_INTEGER) return raw;
  return new Intl.NumberFormat(language === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 3 }).format(number);
}
export const sortMeals = (meals) => [...meals].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position || a.id.localeCompare(b.id));
export const sortOwners = (owners) => [...owners].sort((a, b) => (a.start_date || a.date).localeCompare(b.start_date || b.date) || a.name.localeCompare(b.name));
export function verifiedSession(state) {
  if (!state.initialized || !state.user?.id || !state.token) return null;
  return { accountId: state.user.id, token: state.token, epoch: state.epoch, requestGeneration: state.requestGeneration };
}
export const sessionKey = (state) => JSON.stringify([state.initialized, state.user?.id, state.token, state.epoch, state.requestGeneration]);

export function planningRoute(pathname) {
  const match = pathname.replace(/\/$/, '').match(/^\/planning(?:\/(plans|events)(?:\/([0-9a-f-]{36}))?)?$/);
  return match ? { area: match[1] || 'plans', id: match[2] || null } : { area: 'missing', id: null };
}

export function commonRevision(collections) {
  const revision = collections[0]?.revision;
  if (!Number.isInteger(revision) || revision < 0 || collections.some((part) => part.revision !== revision)) {
    throw Object.assign(new Error('revision_changed'), { code: 'revision_changed' });
  }
  return revision;
}

export async function mapBounded(rows, read, concurrency = 4) {
  const results = new Array(rows.length);
  let index = 0;
  let stopped = false;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (!stopped && index < rows.length) {
      const current = index++;
      try { results[current] = await read(rows[current]); }
      catch (error) { stopped = true; throw error; }
    }
  }));
  return results;
}

export async function loadPlanningSnapshot(client, route) {
  if (route.area === 'preferences') {
    const preferences = await client.read('/preferences');
    commonRevision([preferences]);
    return preferences;
  }
  const roots = await Promise.all([
    client.loadCollection('/plans', 'plans'), client.loadCollection('/events', 'events'),
  ]);
  const revision = commonRevision(roots);
  const [plans, events] = [roots[0].plans, roots[1].events];
  const parts = [...roots];
  let meals = [], links = [], tasks = [], items = [];
  if (route.area === 'shopping') {
    const [scoped, preferences] = await Promise.all([
      client.loadCollection('/shopping/scopes', 'scopes'), client.read('/preferences'),
    ]);
    parts.push(scoped, preferences);
    commonRevision(parts);
    const identity = route.id || preferences.preferences.shopping_scope_id;
    const selected = scoped.scopes.find((row) => row.id === identity);
    let shopping = null, shoppingError = null;
    if (selected) {
      try {
        shopping = await client.read(`/shopping/scopes/${selected.id}`);
        parts.push(shopping);
      } catch (error) {
        // Keep the owner/scope controls usable to resolve inaccessible content;
        // never render a partial ingredient list as the complete shopping list.
        if (error.code === 'http_error' && error.data?.code === 'catalog_unavailable') shoppingError = error;
        else throw error;
      }
    }
    commonRevision(parts);
    return { plans, events, meals, links, tasks, items, scopes: scoped.scopes,
      shopping, shoppingError, selectedScope: selected || null, ...preferences, revision };
  }
  if (route.area === 'plans' && plans.some((plan) => plan.id === route.id)) {
    const children = await Promise.all([
      client.loadCollection(`/plans/${route.id}/meals`, 'meals'),
      client.loadCollection(`/plans/${route.id}/events`, 'links'),
    ]);
    parts.push(...children);
    meals = children[0].meals;
    links = children[1].links;
    commonRevision(parts);
    const days = visibleDays(plans.find((plan) => plan.id === route.id), route.offset || 0);
    const itemCollections = await mapBounded(meals.filter((meal) => days.includes(meal.date)),
      (meal) => client.loadCollection(`/meals/${meal.id}/items`, 'items'));
    parts.push(...itemCollections);
    items = itemCollections.flatMap((collection) => collection.items);
  }
  if (route.area === 'events' && events.some((event) => event.id === route.id)) {
    const children = await Promise.all([client.loadCollection(`/events/${route.id}/tasks`, 'tasks'), client.loadCollection(`/events/${route.id}/items`, 'items')]);
    parts.push(...children);
    tasks = children[0].tasks;
    items = children[1].items;
  }
  commonRevision(parts); // No mixed-revision screen or write baseline.
  return { plans, events, meals: sortMeals(meals), links, tasks, items, revision };
}

export const destructiveOperations = new Set(['plan.delete', 'plan.resize', 'meal.delete', 'event.delete', 'task.delete', 'event.unlink', 'item.delete', 'meal.move', 'template.delete', 'shopping.personal.delete', 'shopping.scope.delete']);
export function previewGroups(preview) {
  const affected = preview?.effects?.affected;
  const names = ['plans', 'meals', 'events', 'links', 'tasks'];
  if (!affected || names.some((name) => !Array.isArray(affected[name])) || Object.values(affected).some((records) => !Array.isArray(records) || records.some((r) => !r || typeof r.id !== 'string'))) {
    throw Object.assign(new Error('invalid_response'), { code: 'invalid_response' });
  }
  // Future dependent records must also be visible before confirmation; never
  // silently omit an affected collection added by a later backend increment.
  return Object.keys(affected).map((kind) => ({ kind, records: affected[kind], count: affected[kind].length }));
}
export function previewUsable(preview, revision, now = Date.now()) {
  return !!preview?.id && preview.revision === revision && Date.parse(preview.expires_at) > now;
}
export function previewRecordLabel(record, { kind, snapshot, revision, affected } = {}) {
  if (kind === 'links' && record.plan_id) {
    // Prefer the proposal itself, then enrich from an equally recent owned
    // snapshot. Never put a newer/older plan name onto an exact server preview.
    const plan = affected?.plans?.find((row) => row.id === record.plan_id)
      || (Number.isInteger(revision) && snapshot?.revision === revision
        ? snapshot.plans?.find((row) => row.id === record.plan_id) : null);
    return plan?.name || record.plan_id;
  }
  return record.title || record.name || record.text || record.entry_id || record.id;
}

export function previewTargetTitle(preview) {
  if (preview.operation === 'shopping.personal.delete') {
    return preview.effects.affected.shopping_scopes?.find((scope) => scope.id === preview.payload.scope_id)
      ?.state.personal.find((item) => item.id === preview.payload.item_id)?.title || null;
  }
  const [kind] = preview.operation.split('.');
  const collection = { plan: 'plans', meal: 'meals', event: 'events', task: 'tasks', item: 'items', template: 'templates' }[kind];
  const record = preview.effects.affected[collection]?.find((row) => row.id === preview.payload[`${kind}_id`]);
  return record?.title || record?.name || record?.text || record?.entry_id || null;
}

export function undoAfterSuccess(previous, result, recovery) {
  if (recovery === 'discard') return previous;
  if (Number.isInteger(result.preference_revision)) return previous;
  return result.undo_id ? { id: result.undo_id, expires: result.undo_expires_at, revision: result.revision } : null;
}

// Revalidation never rewrites the user's draft. It supplies a current record for
// comparison and an explicit new revision baseline after the user reviews it.
export function editorReview(editor, snapshot) {
  if (!snapshot) return { changed: false, available: false, record: null };
  const [kind, action] = editor.operation.split('.');
  const collection = { plan: 'plans', meal: 'meals', event: 'events', task: 'tasks', item: 'items' }[kind];
  const record = snapshot[collection]?.find((row) => row.id === editor.record?.id) || null;
  let available = action === 'create' || editor.operation === 'event.link' || !!record;
  if (editor.operation === 'meal.create') available = snapshot.plans.some((row) => row.id === editor.record.plan_id);
  if (editor.operation === 'task.create') available = snapshot.events.some((row) => row.id === editor.record.event_id);
  if (editor.operation === 'item.create') available = snapshot[editor.record.parent_type === 'meal' ? 'meals' : 'events'].some((row) => row.id === editor.record.parent_id);
  return { changed: editor.revision !== snapshot.revision, available, record };
}

export function commandFromForm(editor, values) {
  const op = editor.operation, row = editor.record || {};
  if (op.startsWith('item.')) return itemCommandFromForm(editor, values);
  const name = String(values.name || '').trim();
  const time = values.time || null;
  let payload;
  switch (op) {
    case 'plan.create': payload = { name, start_date: values.start_date, end_date: values.end_date }; break;
    case 'plan.rename': payload = { plan_id: row.id, name }; break;
    case 'plan.copy': payload = { plan_id: row.id, name, start_date: values.start_date }; break;
    case 'plan.resize': payload = { plan_id: row.id, start_date: values.start_date, end_date: values.end_date }; break;
    case 'meal.create': payload = { plan_id: row.plan_id, date: values.date, name: name || null, time }; break;
    case 'meal.update': payload = { meal_id: row.id, name: name || null, time }; break;
    case 'meal.move': case 'meal.copy': payload = { meal_id: row.id, plan_id: values.plan_id, date: values.date }; break;
    case 'event.create': case 'event.update':
      payload = { ...(op === 'event.update' ? { event_id: row.id } : {}), name, date: values.date, time, guests: Number(values.guests) }; break;
    case 'event.link': payload = { plan_id: values.plan_id, event_id: values.event_id }; break;
    case 'event.copy': payload = { event_id: row.id, name, date: values.date }; break;
    case 'task.create': case 'task.update':
      payload = { ...(op === 'task.create' ? { event_id: row.event_id } : { task_id: row.id }), text: String(values.text || '').trim(), bucket: values.bucket };
      if (op === 'task.update') payload.done = values.done === 'on';
      break;
    default: throw new Error('invalid_command');
  }
  if (('name' in payload && !op.startsWith('meal.') && !name) || ('text' in payload && !payload.text)) throw new Error('required');
  if ('start_date' in payload && 'end_date' in payload && !(dayCount(payload.start_date, payload.end_date) >= 1 && dayCount(payload.start_date, payload.end_date) <= 730)) throw new Error('range');
  if (op === 'plan.copy' || op === 'event.copy') dayStamp(payload.start_date || payload.date);
  return { operation: op, payload };
}

export const itemUnits = ['g', 'kg', 'ml', 'l', 'piece', 'head', 'loaf', 'bunch', 'pack', 'tsp', 'tbsp'];

// Read resources already hide data from another selector/revision identity.
// Bind readiness to that current data and an explicit valid selection, never
// to the previous render's loading flag or merely a non-empty options list.
export function boundItemReady({ active, transfer, parentType, parentId, targets, destinations, kind, creating, catalog, selection, detail, variant }) {
  if (!active) return false;
  const loaded = (resource) => !!resource?.data && !resource.loading && !resource.error;
  if (transfer) return !!parentId && targets.some((target) => target.id === parentId)
    && (parentType === 'event' || (parentType === 'meal' && loaded(destinations)));
  if (kind !== 'dish') return kind === 'personal' || kind === 'note';
  return !!variant && loaded(detail) && (!creating || (!!selection && loaded(catalog)));
}

export function itemCommandFromForm(editor, values) {
  const operation = editor.operation, row = editor.record || {};
  if (!['item.create', 'item.update', 'item.move', 'item.copy'].includes(operation)) throw new Error('invalid_command');
  if (operation === 'item.move' || operation === 'item.copy') {
    if (!['meal', 'event'].includes(values.parent_type) || !values.parent_id) throw new Error('itemDestination');
    return { operation, payload: { item_id: row.id, parent_type: values.parent_type, parent_id: values.parent_id } };
  }
  const creating = operation === 'item.create';
  const kind = creating ? values.kind : row.kind;
  if (!['dish', 'personal', 'note'].includes(kind)) throw new Error('required');
  const payload = creating ? { parent_type: row.parent_type, parent_id: row.parent_id, kind } : { item_id: row.id };
  if (kind === 'dish') {
    if (creating) {
      if (!values.entry_id || !Number.isInteger(Number(values.catalog_revision)) || Number(values.catalog_revision) < 1 || !['en', 'de'].includes(values.language)) throw new Error('catalogEmpty');
      Object.assign(payload, { entry_id: values.entry_id, catalog_revision: Number(values.catalog_revision), language: values.language });
    }
    if (!values.variant_id) throw new Error('catalogUnavailable');
    payload.options = { variant_id: values.variant_id };
    const eventParent = creating ? row.parent_type === 'event' : !!row.event_id;
    if (eventParent && values.follows_guests === 'on') payload.follows_guests = true;
    else {
      const servings = Number(values.servings);
      if (!Number.isInteger(servings) || servings < 1 || servings > 1000) throw new Error('servingsInvalid');
      payload.servings = servings;
      if (eventParent) payload.follows_guests = false;
    }
  } else {
    payload.title = String(values.title || '').trim();
    if (!payload.title) throw new Error('required');
    if (kind === 'personal') {
      const quantity = String(values.quantity || '').trim();
      const unit = values.unit || null;
      if (quantity || unit) {
        if (!/^\d+(?:\.\d{1,3})?$/.test(quantity) || Number(quantity) <= 0 || Number(quantity) > 1000000 || !itemUnits.includes(unit)) throw new Error('quantityInvalid');
      }
      payload.quantity = quantity || null;
      payload.unit = unit;
    }
  }
  payload.group = String(values.group || '').trim() || null;
  payload.contribution = String(values.contribution || '').trim() || null;
  return { operation, payload };
}
