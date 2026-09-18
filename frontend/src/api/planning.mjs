/**
 * Private planning v1; no framework, auth-store mutation, cache or offline queue.
 *
 * Integration: getSession must expose only a VERIFIED {accountId, token}, or null
 * while authentication is unresolved. Optional epoch/requestGeneration fields are
 * also fenced. Call sessionChanged() from the auth subscription on every identity,
 * token or session-generation transition (even A -> null -> A with the same token).
 * Polling getSession alone cannot observe transitions between calls. The hook
 * aborts obsolete requests immediately; every async completion also checks auth.
 * read/loadCollection supersede earlier reads of the same resource. A new command
 * invalidates reads; concurrent distinct resource reads are allowed.
 *
 * command/retry return {result, requiresReload: true}, NEVER a current snapshot.
 * After success, reload all displayed resources at a common revision; separate
 * loadCollection calls are not a cross-resource transaction. No automatic retries
 * or pagination restarts. revision_changed means discard the entire load and let
 * the caller explicitly reload. 409/review_required needs user review followed by
 * await discardRejected(), a fresh snapshot, and a NEW explicitly submitted command.
 * pending() returns an account-local copy including the exact serialized body.
 * An ambiguous pending command can ONLY be retried unchanged. Receipt reads are
 * diagnostic: even a 404 never clears the outbox. No guest migration or token
 * persistence. Corrupt/unavailable storage blocks writes without replacing data;
 * recovery of corrupt storage is deliberately outside this adapter.
 * HTTP 401/422 authenticate only the current attempt: they cannot prove an earlier
 * attempt did not commit. Keep the outbox pending through reauthentication.
 *
 * Every network write and discardRejected() acquires an account-specific exclusive
 * Web Lock with ifAvailable:true, held through outbox preparation, network, and
 * acknowledgement cleanup. lockManager defaults to navigator.locks; an injected
 * manager must implement the same cross-context exclusion contract. There is no
 * localStorage-only fallback. writer_busy means another client/tab owns the lock;
 * write_coordination_unavailable (readOnly:true) means writes are unsupported.
 * pending() is only an observational read, never authorization to send or clear.
 * All cooperating tabs must use this adapter's lock name; older writers must be
 * closed before enabling writes. Construction never automatically sends pending.
 * The lifecycle's durable owner marker is checked under the lock before every
 * write. account_deleted / account_deletion_pending block even a tab whose auth
 * storage event has not arrived. A broken marker fails closed with storage_blocked.
 * requestTimeoutMs defaults to 15000 (integer 1..60000), including response-body
 * parsing. request_timeout is ambiguous for commands: keep and retry exact body.
 * Aborts/timeouts release the lock even if fetch ignores its signal; the server
 * may still commit, so a later writer must honor the persisted pending body.
 * dispose() aborts requests, retaining any unresolved outbox for later recovery.
 * preview(operation,payload,expectedRevision) returns {preview,revision} directly;
 * cancelPreview(id) returns {cancelled:true}. Neither uses the outbox or changes
 * domain data. Lost proposals expire server-side after ten minutes; no automatic
 * retry. Their HTTP errors (including 409) use http_error with status/data.
 */

import { readPlanningOwnerState } from './planningLifecycle.mjs';

const ROOT = '/api/planning/v1';
const PREFIX = 'private-planning:v1:outbox:';
const LOCK_PREFIX = 'private-planning:v1:writer:';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const uuidPattern = new RegExp(`^${UUID}$`);
const operations = new Set(['plan.create', 'plan.rename', 'meal.create', 'meal.update',
  'event.create', 'event.update', 'event.link', 'task.create', 'task.update',
  'meal.move', 'meal.copy', 'preview.confirm', 'undo.apply',
  'item.create', 'item.update', 'item.move', 'item.copy', 'plan.copy', 'event.copy',
  'shopping.scope', 'shopping.cover', 'shopping.extra', 'shopping.personal.create', 'shopping.personal.update',
  'template.save', 'template.rename', 'template.apply', 'preferences.update']);
const previewOperations = new Set(['plan.delete', 'plan.resize', 'meal.delete',
  'event.delete', 'task.delete', 'event.unlink', 'item.delete', 'meal.move', 'template.delete', 'shopping.personal.delete', 'shopping.scope.delete']);
const collectionBounds = { plans: 500, meals: 2000, events: 500, tasks: 500, links: 2000, items: 100, scopes: 100, templates: 100 };
const MAX_BODY_BYTES = 16 * 1024;
const MAX_OUTBOX_CHARS = 32 * 1024;
const MAX_REVISION = 2147483646;
const rejectedStatuses = new Set([400, 404, 409, 413]);
// A command at the highest accepted expected revision advances once more.
const revisionValid = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_REVISION + 1;
const expectedRevisionValid = (value) => revisionValid(value) && value <= MAX_REVISION;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');

export class PlanningClientError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'PlanningClientError';
    this.code = code;
    Object.assign(this, details);
  }
}
const fail = (code, details) => { throw new PlanningClientError(code, details); };

// Reject values JSON would silently drop/convert; serialization is the only point
// at which the caller's payload is copied. Retries never rebuild this body.
function assertJson(value, seen = new Set(), depth = 0) {
  if (depth > 32) fail('invalid_payload');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || seen.has(value) ||
      (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) fail('invalid_payload');
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol' ||
      (key !== 'length' || !Array.isArray(value)) && !Object.getOwnPropertyDescriptor(value, key)?.enumerable)) fail('invalid_payload');
  if (Array.isArray(value) && (Object.keys(value).length !== value.length ||
      Object.keys(value).some((key, index) => key !== String(index)))) fail('invalid_payload');
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) fail('invalid_payload');
    assertJson(descriptor.value, seen, depth + 1);
  }
  seen.delete(value);
}

function validateBody(body) {
  if (typeof body !== 'string' || new TextEncoder().encode(body).length > MAX_BODY_BYTES) fail('invalid_body');
  let parsed;
  try { parsed = JSON.parse(body); } catch { fail('invalid_body'); }
  if (!exactKeys(parsed, ['mutation_id', 'expected_workspace_revision', 'operation', 'payload']) ||
      !uuidPattern.test(parsed.mutation_id) || !expectedRevisionValid(parsed.expected_workspace_revision) ||
      !operations.has(parsed.operation) || !object(parsed.payload) || JSON.stringify(parsed) !== body) fail('invalid_body');
  assertJson(parsed.payload);
  return parsed;
}

function route(path) {
  if (typeof path !== 'string') fail('invalid_path');
  const catalog = path.match(/^\/catalog(?:\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([1-9][0-9]{0,9}))?\?language=(en|de)$/);
  if (catalog && catalog[0] === path) {
    if (catalog[1]?.length > 80 || (catalog[2] && Number(catalog[2]) > 2147483647)) fail('invalid_path');
    return { base: path.split('?')[0], collection: null, catalog: true, url: `${ROOT}${path}` };
  }
  const match = path.match(new RegExp(`^(/workspace|/preferences|/templates|/shopping/scopes(?:/${UUID})?|/plans|/plans/${UUID}(?:/meals|/events)?|/events|/events/${UUID}(?:/tasks|/items)?|/meals/${UUID}/items|/items/${UUID}/preview|/mutations/${UUID})(?:\\?([^#]+))?$`));
  if (!match || match[0] !== path) fail('invalid_path');
  const [, base, query] = match;
  const collection = base === '/shopping/scopes' ? 'scopes' : base === '/templates' ? 'templates' : base === '/plans' ? 'plans' : base === '/events' ? 'events' :
    base.endsWith('/meals') ? 'meals' : base.endsWith('/tasks') ? 'tasks' :
    base.endsWith('/events') ? 'links' : base.endsWith('/items') ? 'items' : null;
  const params = new URLSearchParams();
  if (query !== undefined) {
    if (!collection) fail('invalid_path');
    for (const field of query.split('&')) {
      const pair = field.split('=');
      const [key, value] = pair;
      if (pair.length !== 2 || params.has(key) ||
          (key !== 'limit' && key !== 'cursor') ||
          (key === 'limit' && !/^(?:[1-9][0-9]?|100)$/.test(value)) ||
          (key === 'cursor' && !uuidPattern.test(value))) fail('invalid_path');
      params.set(key, value);
    }
  }
  return { base, collection, params, url: `${ROOT}${base}${params.size ? `?${params}` : ''}` };
}

export function createPlanningClient(options = {}) {
  const { fetchImpl = globalThis.fetch, getSession, requestTimeoutMs = 15000 } = options;
  if (typeof fetchImpl !== 'function' || typeof getSession !== 'function' ||
      !Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000) fail('invalid_configuration');
  // Resolve the browser storage getter lazily: SecurityError must fail writes
  // closed, while reads and a recovery screen remain available.
  const storage = () => Object.hasOwn(options, 'storage') ? options.storage : globalThis.localStorage;
  const lockManager = () => Object.hasOwn(options, 'lockManager') ? options.lockManager : globalThis.navigator?.locks;
  let disposed = false;
  let identity = null;
  let generation = 0;
  let writeFlight = null;
  const requests = new Set();
  const lanes = new Map();

  function fence() {
    generation += 1;
    for (const request of requests) request.controller.abort();
    requests.clear();
    lanes.clear();
    writeFlight = null;
  }
  function session() {
    if (disposed) fail('disposed');
    let next;
    try { next = getSession(); } catch { fence(); identity = null; fail('session_unavailable'); }
    if (next != null && (!object(next) ||
        !((typeof next.accountId === 'string' && next.accountId.length > 0 && next.accountId.length <= 256) ||
          (Number.isSafeInteger(next.accountId) && next.accountId > 0)) ||
        typeof next.token !== 'string' || !next.token)) {
      fence(); identity = null; fail('invalid_session');
    }
    next = next == null ? null : { accountId: String(next.accountId), token: next.token,
      epoch: next.epoch, requestGeneration: next.requestGeneration };
    if ((identity === null) !== (next === null) ||
        (next && ['accountId', 'token', 'epoch', 'requestGeneration'].some((key) => next[key] !== identity?.[key]))) fence();
    identity = next;
    return next;
  }
  function origin() {
    const current = session();
    if (!current) fail('unauthenticated');
    return { ...current, generation };
  }
  function check(source, lane, ticket) {
    try { session(); } catch { fail('stale_session'); }
    if (source.generation !== generation || !identity || source.accountId !== identity.accountId || source.token !== identity.token) fail('stale_session');
    if (lane && lanes.get(lane) !== ticket) fail('superseded');
  }
  function beginRead(base) {
    const source = origin();
    for (const request of requests) if (request.lane === base) request.controller.abort();
    const ticket = Symbol(base);
    lanes.set(base, ticket);
    return { source, ticket, lane: base };
  }
  function invalidateReads() {
    for (const request of requests) if (request.lane) request.controller.abort();
    lanes.clear();
  }
  async function request(url, source, { body, lane, ticket, method = body === undefined ? 'GET' : 'POST' } = {}) {
    const entry = { controller: new AbortController(), lane };
    check(source, lane, ticket);
    if (method !== 'GET') checkOwner(source);
    requests.add(entry);
    const signal = entry.controller.signal;
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const timer = setTimeout(() => entry.controller.abort(new PlanningClientError('request_timeout',
      { ambiguous: method !== 'GET' })), requestTimeoutMs);
    const checkRequest = () => {
      check(source, lane, ticket);
      if (signal.aborted) throw signal.reason;
    };
    const transport = async () => {
      const response = await fetchImpl(url, {
        method,
        headers: { Accept: 'application/json', Authorization: `Bearer ${source.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body }),
        signal: entry.controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      });
      checkRequest();
      let data;
      try { data = await response.json(); } catch {
        checkRequest();
        // A definite rejection remains a rejection even with an unreadable body.
        if (!response.ok) fail('http_error', { status: response.status });
        fail('invalid_response');
      }
      checkRequest();
      if (!response.ok) fail('http_error', { status: response.status, data });
      if (!object(data)) fail('invalid_response');
      return data;
    };
    try {
      const result = await Promise.race([transport(), aborted]);
      checkRequest();
      return result;
    } catch (error) {
      check(source, lane, ticket);
      if (error instanceof PlanningClientError) throw error;
      fail('network_error');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      requests.delete(entry);
    }
  }
  async function withWriter(source, action) {
    check(source);
    if (writeFlight) fail('write_in_flight');
    const flight = Symbol('writer');
    writeFlight = flight;
    let entered = false;
    try {
      let manager;
      try { manager = lockManager(); } catch { fail('write_coordination_unavailable', { readOnly: true }); }
      if (typeof manager?.request !== 'function') fail('write_coordination_unavailable', { readOnly: true });
      const result = await manager.request(`${LOCK_PREFIX}${encodeURIComponent(source.accountId)}`,
        { mode: 'exclusive', ifAvailable: true }, async (lock) => {
          // Auth may have changed while the browser dispatched this callback.
          entered = true;
          check(source);
          if (!lock) fail('writer_busy');
          checkOwner(source);
          return action();
        });
      check(source);
      if (!entered) fail('write_coordination_unavailable', { readOnly: true });
      return result;
    } catch (error) {
      check(source);
      if (error instanceof PlanningClientError || entered) throw error;
      fail('write_coordination_unavailable', { readOnly: true });
    } finally { if (writeFlight === flight) writeFlight = null; }
  }
  function checkOwner(source) {
    check(source);
    let state;
    try { state = readPlanningOwnerState(source.accountId, storage()); }
    catch { check(source); fail('storage_blocked'); }
    check(source);
    if (state === 'deleted') fail('account_deleted', { readOnly: true });
    if (state === 'deleting') fail('account_deletion_pending', { readOnly: true });
  }
  const storageKey = (source) => `${PREFIX}${encodeURIComponent(source.accountId)}`;
  function readOutbox(source) {
    check(source);
    let raw;
    try { raw = storage().getItem(storageKey(source)); } catch { check(source); fail('storage_blocked'); }
    check(source);
    if (raw === null) return { raw, entry: null };
    try {
      if (typeof raw !== 'string' || raw.length > MAX_OUTBOX_CHARS) throw new Error();
      const entry = JSON.parse(raw);
      const legacyAuthRejection = entry?.state === 'rejected' && entry.status === 422;
      if (!exactKeys(entry, ['version', 'accountId', 'body', 'state', 'status']) || entry.version !== 1 ||
          entry.accountId !== source.accountId || !['pending', 'rejected'].includes(entry.state) ||
          (entry.state === 'pending' ? entry.status !== null : !rejectedStatuses.has(entry.status) && !legacyAuthRejection)) throw new Error();
      validateBody(entry.body);
      // Earlier v1 clients incorrectly persisted JWT 422 as discardable. Treat
      // only that fully validated legacy envelope as unresolved, without rewriting
      // stored bytes. Explicit retry still uses the original mutation ID/body.
      if (legacyAuthRejection) return { raw, entry: { ...entry, state: 'pending', status: null } };
      return { raw, entry };
    } catch { fail('storage_blocked'); }
  }
  function replaceOutbox(source, previous, entry) {
    checkOwner(source);
    const current = readOutbox(source);
    if (current.raw !== previous) fail('outbox_changed');
    const raw = entry === null ? null : JSON.stringify(entry);
    if (raw !== null && raw.length > MAX_OUTBOX_CHARS) fail('body_too_large');
    check(source);
    try {
      if (raw === null) storage().removeItem(storageKey(source));
      else storage().setItem(storageKey(source), raw);
    } catch { check(source); fail('storage_blocked'); }
    check(source);
    const verified = readOutbox(source);
    if (verified.raw !== raw) fail('storage_blocked');
    return verified;
  }
  async function send(source, saved) {
    // Only invoked inside withWriter; that lock also owns acknowledgement cleanup.
    invalidateReads();
    check(source);
    if (readOutbox(source).raw !== saved.raw) fail('outbox_changed');
    let result;
    try {
      result = await request(`${ROOT}/commands`, source, { body: saved.entry.body });
    } catch (error) {
      check(source);
      if (error.code === 'http_error' && rejectedStatuses.has(error.status)) {
        replaceOutbox(source, saved.raw, { ...saved.entry, state: 'rejected', status: error.status });
        fail('review_required', { status: error.status, data: error.data });
      }
      throw error;
    }
    check(source);
    if (!revisionValid(result.revision)) fail('invalid_response');
    replaceOutbox(source, saved.raw, null);
    invalidateReads();
    return { result, requiresReload: true };
  }

  return {
    sessionChanged() { if (disposed) fail('disposed'); fence(); session(); },
    async read(path) {
      const target = route(path);
      const context = beginRead(target.base);
      const result = await request(target.url, context.source, context);
      check(context.source, context.lane, context.ticket);
      if (!target.catalog && !target.base.startsWith('/mutations/') && !revisionValid(result.revision)) fail('invalid_response');
      return result;
    },
    async loadCollection(path, key) {
      const target = route(path);
      if (!target.collection || key !== target.collection || target.params.has('cursor')) fail('invalid_collection');
      const context = beginRead(target.base);
      const limit = Number(target.params.get('limit') || 100);
      target.params.set('limit', String(limit));
      const maxItems = collectionBounds[key];
      const items = [];
      const cursors = new Set();
      const ids = new Set();
      let revision;
      for (let page = 0; page < maxItems; page += 1) {
        const data = await request(`${ROOT}${target.base}?${target.params}`, context.source, context);
        check(context.source, context.lane, context.ticket);
        if (!revisionValid(data.revision) || !Array.isArray(data[key]) || data[key].length > limit ||
            !Object.hasOwn(data, 'next_cursor') ||
            (data.next_cursor !== null && (typeof data.next_cursor !== 'string' || !uuidPattern.test(data.next_cursor)))) fail('invalid_response');
        if (revision !== undefined && revision !== data.revision) fail('revision_changed');
        revision = data.revision;
        const cursor = target.params.get('cursor');
        let previous = cursor;
        for (const item of data[key]) {
          if (!object(item) || typeof item.id !== 'string' || !uuidPattern.test(item.id) || ids.has(item.id) ||
              (previous && item.id <= previous)) fail('invalid_pagination');
          ids.add(item.id);
          previous = item.id;
          items.push(item);
        }
        if (items.length > maxItems) fail('pagination_bound');
        if (data.next_cursor === null) return { [key]: items, revision, next_cursor: null };
        if (!data[key].length || data.next_cursor !== previous || cursors.has(data.next_cursor)) fail('invalid_pagination');
        if (items.length >= maxItems) fail('pagination_bound');
        cursors.add(data.next_cursor);
        target.params.set('cursor', data.next_cursor);
      }
      fail('pagination_bound');
    },
    async command(operation, payload, expectedRevision) {
      const source = origin();
      if (writeFlight) fail('write_in_flight');
      if (!operations.has(operation) || !expectedRevisionValid(expectedRevision) || !object(payload)) fail('invalid_command');
      assertJson(payload);
      // Snapshot caller-owned data now; shared-state preparation waits for lock.
      const input = JSON.parse(JSON.stringify(payload));
      return withWriter(source, () => {
        const previous = readOutbox(source);
        if (previous.entry) fail(previous.entry.state === 'rejected' ? 'review_required' : 'pending_exists');
        if (typeof globalThis.crypto?.randomUUID !== 'function') fail('random_unavailable');
        const body = JSON.stringify({ mutation_id: globalThis.crypto.randomUUID(),
          expected_workspace_revision: expectedRevision, operation, payload: input });
        validateBody(body);
        const saved = replaceOutbox(source, previous.raw, { version: 1, accountId: source.accountId,
          body, state: 'pending', status: null });
        return send(source, saved);
      });
    },
    async preview(operation, payload, expectedRevision) {
      origin();
      if (writeFlight) fail('write_in_flight');
      const context = beginRead('/previews');
      if (!previewOperations.has(operation) || !object(payload) || !expectedRevisionValid(expectedRevision)) fail('invalid_preview');
      assertJson(payload);
      const body = JSON.stringify({ operation, payload, expected_workspace_revision: expectedRevision });
      if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) fail('invalid_body');
      return withWriter(context.source, async () => {
        const data = await request(`${ROOT}/previews`, context.source, { ...context, body });
        check(context.source, context.lane, context.ticket);
        if (!revisionValid(data.revision) || !object(data.preview) || typeof data.preview.id !== 'string' ||
            !uuidPattern.test(data.preview.id)) fail('invalid_response');
        return { preview: data.preview, revision: data.revision };
      });
    },
    async cancelPreview(id) {
      const source = origin();
      if (typeof id !== 'string' || !uuidPattern.test(id)) fail('invalid_path');
      return withWriter(source, async () => {
        const data = await request(`${ROOT}/previews/${id}`, source, { method: 'DELETE' });
        check(source);
        if (data.cancelled !== true) fail('invalid_response');
        return { cancelled: true };
      });
    },
    pending() {
      const current = session();
      if (!current) return null;
      return readOutbox(origin()).entry;
    },
    async retry() {
      const source = origin();
      return withWriter(source, () => {
        const saved = readOutbox(source);
        if (!saved.entry) fail('no_pending');
        if (saved.entry.state === 'rejected') fail('review_required', { status: saved.entry.status });
        return send(source, saved);
      });
    },
    async discardRejected() {
      const source = origin();
      return withWriter(source, () => {
        const saved = readOutbox(source);
        if (!saved.entry) return;
        if (saved.entry.state !== 'rejected') fail('pending_unresolved');
        replaceOutbox(source, saved.raw, null);
      });
    },
    dispose() { if (!disposed) { fence(); identity = null; disposed = true; } },
  };
}
