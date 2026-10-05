// Opt-in session transport. Public snapshots contain an owner marker, never credentials.
export const SESSION_CHANGE_KEY = 'cookbook:session-change:v1';
export const SESSION_LOCK_NAME = 'cookbook:browser-session:v1';
export const sessionMarker = (id) => `session:${id}`;
export class SessionRuntimeError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'SessionRuntimeError'; this.code = code; Object.assign(this, details); }
}
const fail = (code, details) => { throw new SessionRuntimeError(code, details); };
const stale = () => new SessionRuntimeError('stale_session');
const writeMethod = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

/**
 * storage (native only): async get() -> object|null, set(object, {isCurrent}), remove({isCurrent}).
 * The host encrypts serialized JSON. Access tokens and CSRF values stay in memory.
 * changeStorage is a localStorage-shaped NONSECRET notification store (injectable in tests).
 * Configure once, before mounting consumers; fetchImpl must be the raw transport.
 */
export function createSessionRuntime({ transport, fetchImpl = (...args) => globalThis.fetch(...args), storage,
  changeStorage, now = Date.now, refreshSkewMs = 60000, requestTimeoutMs = 15000,
  lockManager, lockTimeoutMs = requestTimeoutMs,
  readCsrfToken = () => {
    const value = globalThis.document?.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('csrf_refresh_token='));
    return value ? decodeURIComponent(value.slice('csrf_refresh_token='.length)) : null;
  },
  origin = globalThis.location?.origin || 'https://localhost' } = {}) {
  if (!['browser', 'native'].includes(transport) || typeof fetchImpl !== 'function') fail('invalid_configuration');
  if (transport === 'native' && !['get', 'set', 'remove'].every((key) => typeof storage?.[key] === 'function')) fail('credential_storage_required');
  let generation = 0, session = null, refreshToken = null, initialized = false;
  let initFlight, refreshFlight, logoutFlight, authFlight, blocked, disposed = false;
  let revocationProof = null;
  let io = Promise.resolve();
  const active = new Set(), listeners = new Set();
  let cookieRequests = null;
  const notifications = () => changeStorage === undefined ? globalThis.localStorage : changeStorage;
  const snapshot = () => session ? { user: session.user, token: sessionMarker(session.session_id),
    session_id: session.session_id, expires_at: session.expires_at, session_expires_at: session.session_expires_at } : null;
  const emit = (type, error) => { for (const listener of listeners) listener({ type, session: snapshot(), error }); };
  const check = (version) => { if (disposed || version !== generation) throw stale(); };
  const advance = () => {
    generation++;
    for (const controller of active) controller.abort(stale());
    active.clear();
    initFlight = refreshFlight = logoutFlight = null;
    return generation;
  };
  const queued = (version, action) => {
    const result = io.catch(() => {}).then(async () => {
      check(version);
      try {
        const value = await action({ isCurrent: () => !disposed && version === generation });
        check(version);
        return value;
      } catch (error) {
        check(version);
        if (error instanceof SessionRuntimeError) throw error;
        fail('storage', { cause: error });
      }
    });
    io = result;
    return result;
  };
  function announce(version, removeLegacy = false, broadcast = true) {
    check(version);
    try {
      const local = notifications();
      if (local) {
        // Never read/import the old bearer. Remove it only after a new bootstrap
        // succeeds or after explicit logout/confirmed account deletion.
        if (removeLegacy) local.removeItem('token');
        if (broadcast) local.setItem(SESSION_CHANGE_KEY, globalThis.crypto?.randomUUID?.() || `${now()}:${Math.random()}`);
      }
    } catch (error) { fail('storage', { cause: error }); }
  }
  function guardFailure(version, error) {
    check(version);
    blocked = error;
    emit('blocked', error);
    throw error;
  }
  async function coordinated(version, action) {
    if (transport !== 'browser') return action();
    let manager;
    try { manager = lockManager === undefined ? globalThis.navigator?.locks : lockManager; }
    catch { fail('session_coordination_unavailable'); }
    if (typeof manager?.request !== 'function') fail('session_coordination_unavailable');
    let entered = false;
    const controller = new AbortController();
    active.add(controller);
    const timer = setTimeout(() => controller.abort(new SessionRuntimeError('session_coordination_timeout')), lockTimeoutMs);
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const request = manager.request(SESSION_LOCK_NAME, { mode: 'exclusive', signal: controller.signal }, async () => {
        // Also fence a late grant from an injected manager that ignores abort.
        if (controller.signal.aborted) throw controller.signal.reason;
        entered = true;
        clearTimeout(timer);
        active.delete(controller);
        check(version);
        const pending = new Set();
        cookieRequests = pending;
        try { return await action(); }
        finally {
          // A transport that ignores cancellation may still deliver Set-Cookie.
          // Keep the lock until that transport settles, even after local fencing.
          await Promise.allSettled([...pending]);
          if (cookieRequests === pending) cookieRequests = null;
        }
      });
      return await Promise.race([request, aborted]);
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!entered) fail('session_coordination_unavailable', { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
      active.delete(controller);
      controller.signal.removeEventListener('abort', onAbort);
    }
  }
  async function dispatch(input, init, version, consume) {
    check(version);
    const controller = new AbortController();
    const caller = init.signal;
    const abort = () => controller.abort(caller.reason);
    if (caller?.aborted) abort();
    else caller?.addEventListener('abort', abort, { once: true });
    active.add(controller);
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = () => reject(controller.signal.reason); });
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new SessionRuntimeError('request_timeout')), requestTimeoutMs);
    try {
      if (controller.signal.aborted) throw controller.signal.reason;
      const operation = async () => {
        const response = await fetchImpl(input, { ...init, signal: controller.signal });
        check(version);
        if (controller.signal.aborted) throw controller.signal.reason;
        const result = consume ? await consume(response) : response;
        check(version);
        if (controller.signal.aborted) throw controller.signal.reason;
        return result;
      };
      const work = operation();
      cookieRequests?.add(work);
      return await Promise.race([work, aborted]);
    } finally {
      clearTimeout(timer);
      caller?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', rejectAbort);
      active.delete(controller);
    }
  }
  async function endpoint(path, method, body, version, credentials = session) {
    const headers = new Headers({ Accept: 'application/json' });
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (transport === 'native') {
      headers.set('X-Cookbook-Client', 'native');
      if (credentials?.access) headers.set('Authorization', `Bearer ${credentials.access}`);
    } else if (writeMethod(method) && credentials?.csrf_token) headers.set('X-CSRF-TOKEN', credentials.csrf_token);
    if (credentials?.session_id) headers.set('X-Cookbook-Session', credentials.session_id);
    return dispatch(new URL(`/api/auth/session/${path}`, origin).href, {
      method, headers, credentials: transport === 'browser' ? 'same-origin' : 'omit',
      cache: 'no-store', redirect: 'error', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, version, async (response) => {
      let data;
      try { data = response.status === 204 ? null : await response.json(); }
      catch { if (response.ok) fail('invalid_response'); }
      if (!response.ok) fail('http_error', { status: response.status, response: { status: response.status, data } });
      return data;
    });
  }
  async function browserIdentity(version, expected = session) {
    let metadata;
    try { metadata = await endpoint('me', 'GET', undefined, version, null); }
    catch (error) { if (error.status !== 401) throw error; }
    check(version);
    if (metadata) return decoded(metadata, expected, false);
    const csrf_token = readCsrfToken();
    return csrf_token ? { csrf_token, session_id: expected?.session_id } : null;
  }
  function decoded(data, previous, requireNativeTokens) {
    const expires = typeof data?.expires_at === 'number'
      ? (data.expires_at < 1e12 ? data.expires_at * 1000 : data.expires_at) : Date.parse(data?.expires_at);
    if (!data?.user?.id || typeof data.session_id !== 'string' || !data.session_id || !Number.isFinite(expires)) fail('invalid_response');
    if (transport === 'browser' && (typeof data.csrf_token !== 'string' || !data.csrf_token)) fail('invalid_response');
    if (transport === 'native' && requireNativeTokens &&
      (typeof data.token !== 'string' || !data.token || typeof data.refresh_token !== 'string' || !data.refresh_token)) fail('invalid_response');
    if (previous && (previous.session_id !== data.session_id || previous.user.id !== data.user.id)) fail('session_changed');
    // Backend expires_at is the actual access deadline, including on /me.
    // session_expires_at is optional family metadata, never a refresh timer.
    return { user: data.user, session_id: data.session_id, expires_at: data.expires_at, expires,
      session_expires_at: data.session_expires_at,
      csrf_token: data.csrf_token, access: transport === 'native' ? (data.token || previous?.access) : undefined };
  }
  async function accept(data, version, { previous = null, bootstrap = false, broadcast = false, requireNativeTokens = true } = {}) {
    check(version);
    const next = decoded(data, previous, requireNativeTokens);
    if (revocationProof?.session_id !== next.session_id) revocationProof = null;
    // Retain a successfully rotated credential in memory even if persistence
    // fails, so an explicit retry can save it instead of replaying a consumed token.
    session = next;
    if (transport === 'native' && data.refresh_token) refreshToken = data.refresh_token;
    if (transport === 'native') await queued(version, (guard) => storage.set({ version: 1,
      refresh_token: refreshToken, session_id: next.session_id, user_id: next.user.id,
      expires_at: next.expires_at, session_expires_at: next.session_expires_at }, guard));
    check(version);
    if (bootstrap) announce(version, true, broadcast);
    initialized = true;
    blocked = null;
    emit('ready');
    return snapshot();
  }
  function refresh() {
    if (refreshFlight) return refreshFlight;
    if (initFlight) return initFlight;
    if (authFlight || logoutFlight) return Promise.reject(new SessionRuntimeError('session_busy'));
    const version = generation;
    const operation = () => coordinated(version, async () => {
      if (transport === 'native' && !refreshToken) fail('authentication_required');
      const browser = transport === 'browser' ? await browserIdentity(version) : null;
      if (transport === 'browser' && !browser) fail('authentication_required');
      if (browser?.expires > now() + refreshSkewMs) return accept(browser, version, { previous: session, requireNativeTokens: false });
      const data = await endpoint('refresh', 'POST', transport === 'native'
        ? { refresh_token: refreshToken, transport } : { transport }, version,
      transport === 'native' ? null : browser);
      return accept(data, version, { previous: session });
    });
    const flight = operation().catch((error) => guardFailure(version, error)).finally(() => {
      if (refreshFlight === flight) refreshFlight = null;
    });
    refreshFlight = flight;
    return flight;
  }
  function init({ force = false } = {}) {
    if (initFlight) return initFlight;
    if (refreshFlight) return refreshFlight;
    if (authFlight || logoutFlight) return Promise.reject(new SessionRuntimeError('session_busy'));
    if (initialized && !force && !blocked) return Promise.resolve(snapshot());
    const version = generation;
    const operation = () => coordinated(version, async () => {
      // A retry after secure-storage failure must first persist the newest token.
      if (transport === 'native' && session && refreshToken && blocked?.code === 'storage') {
        return accept({ ...session, token: session.access, refresh_token: refreshToken }, version, { bootstrap: true });
      }
      if (transport === 'native' && !refreshToken) {
        const saved = await queued(version, () => storage.get());
        if (saved !== null && (!saved || typeof saved.refresh_token !== 'string' || !saved.refresh_token)) fail('storage');
        refreshToken = saved?.refresh_token || null;
        if (!refreshToken) { initialized = true; blocked = null; emit('ready'); return null; }
      }
      let metadata;
      if (transport === 'browser' || session?.access) {
        try { metadata = await endpoint('me', 'GET', undefined, version); }
        catch (error) { check(version); if (error.status !== 401) throw error; }
      }
      if (metadata && decoded(metadata, null, false).expires > now() + refreshSkewMs) {
        return accept(metadata, version, { bootstrap: true, previous: transport === 'native' ? session : null, requireNativeTokens: false });
      }
      const csrf = transport === 'browser' && (metadata?.csrf_token || readCsrfToken());
      if (transport === 'native' || csrf) {
        // /me is a read. There is at most ONE refresh attempt per bootstrap,
        // including when its response is rejected or ambiguous.
        try {
          const data = await endpoint('refresh', 'POST', transport === 'native'
            ? { refresh_token: refreshToken, transport } : { transport }, version,
          transport === 'native' ? null : { csrf_token: csrf, session_id: metadata?.session_id });
          return await accept(data, version, { bootstrap: true,
            previous: metadata ? decoded(metadata, null, false) : null });
        } catch (error) { check(version); if (error.status !== 401) throw error; }
      }
      session = null;
      initialized = true;
      blocked = null;
      emit('ready');
      return null;
    });
    const flight = operation().catch((error) => guardFailure(version, error)).finally(() => {
      if (initFlight === flight) initFlight = null;
    });
    initFlight = flight;
    return flight;
  }
  async function ready() {
    if (authFlight || logoutFlight) fail('session_busy');
    if (blocked) throw blocked;
    if (initFlight) await initFlight;
    if (!initialized) await init();
    if (session && session.expires <= now() + refreshSkewMs) await refresh();
    return snapshot();
  }
  function credentials(kind, body) {
    // Serialize credential submissions: overlapping Set-Cookie responses cannot
    // be fenced by JavaScript after a browser has accepted their headers.
    if (authFlight || logoutFlight) return Promise.reject(new SessionRuntimeError('session_busy'));
    const version = advance();
    revocationProof = null;
    emit('invalidated');
    const operation = () => coordinated(version, async () => {
      const browser = transport === 'browser' ? await browserIdentity(version, null) : null;
      const data = await endpoint(kind, 'POST', { ...body, transport }, version, browser);
      return accept(data, version, { bootstrap: true, broadcast: true });
    });
    const flight = operation().catch((error) => {
      check(version);
      // A definitive credential rejection has not replaced the previous owner.
      if ([400, 401, 403, 409, 422, 429].includes(error.status)) throw error;
      return guardFailure(version, error);
    }).finally(() => {
      if (authFlight === flight) authFlight = null;
    });
    authFlight = flight;
    return flight;
  }
  async function forget(version = advance()) {
    if (transport === 'native') await queued(version, (guard) => storage.remove(guard));
    check(version);
    announce(version, true);
    session = null; refreshToken = null; initialized = true; blocked = null; revocationProof = null;
    emit('ready');
    return { ok: true };
  }
  function logout({ all = false, expectedSession } = {}) {
    if (logoutFlight) return logoutFlight;
    const version = advance();
    emit('invalidated');
    const operation = () => coordinated(version, async () => {
      if (expectedSession && session && snapshot().token !== expectedSession) fail('session_changed');
      let target = session?.session_id || expectedSession?.replace(/^session:/, '');
      let browser;
      if (transport === 'native') {
        const saved = await queued(version, () => storage.get());
        // Validate durable ownership even when an in-memory cleanup proof exists.
        if (saved && target && saved.session_id !== target) fail('session_changed');
        target ||= saved?.session_id;
        refreshToken ||= saved?.refresh_token;
      } else {
        browser = await browserIdentity(version);
        if (target && browser?.session_id && browser.session_id !== target) fail('session_changed');
        target ||= browser?.session_id;
        if (browser?.user) session = browser;
      }
      const outcome = (allRevoked) => ({ ok: true, revoked: true, ...(all ? { allRevoked } : {}) });
      // A CSRF cookie alone does not prove browser ownership. Ask the backend
      // again in that case; its idempotent logout validates the captured SID.
      if (target && revocationProof?.session_id === target && (!all || revocationProof.all) &&
        (transport === 'native' || browser?.user || !browser)) {
        const allRevoked = revocationProof.all;
        await forget(version);
        return outcome(allRevoked);
      }
      if (transport === 'native' ? !refreshToken && !session : !browser) {
        if (target) fail('authentication_required');
        await forget(version);
        return { ok: true, revoked: false };
      }
      if (!target) fail('authentication_required');
      const identity = () => ({ ...(transport === 'browser' ? browser : {}), session_id: target });
      const currentLogout = () => endpoint('logout', 'POST', transport === 'native'
        ? { transport, refresh_token: refreshToken } : { transport }, version, identity());
      const renew = async () => {
        const data = await endpoint('refresh', 'POST', transport === 'native'
          ? { refresh_token: refreshToken, transport } : { transport }, version, identity());
        if (data?.session_id !== target) fail('session_changed');
        await accept(data, version, { previous: session });
        if (transport === 'browser') browser = session;
      };
      let result, allRevoked = false;
      if (all) {
        try {
          if (!session || (transport === 'native' && !session.access) ||
            (transport === 'browser' && !browser.user) || session.expires <= now() + refreshSkewMs) await renew();
          result = await endpoint('logout-all', 'POST', { transport }, version, session);
          allRevoked = true;
        } catch (error) {
          // A JWT/refresh 401 is NOT revocation proof. Only a successful,
          // same-SID current logout can finish this narrower fallback.
          if (error.status !== 401) throw error;
          result = await currentLogout();
        }
      } else {
        result = await currentLogout();
      }
      if (result?.ok !== true) fail('invalid_response');
      revocationProof = { session_id: target, all: allRevoked };
      await forget(version);
      return outcome(allRevoked);
    });
    const flight = operation().catch((error) => guardFailure(version, error)).finally(() => {
      if (logoutFlight === flight) logoutFlight = null;
    });
    logoutFlight = flight;
    return flight;
  }
  async function fetch(input, options = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, origin);
    const headers = new Headers(options.headers ?? input?.headers);
    const supplied = headers.get('Authorization');
    const marker = supplied?.match(/^Bearer (session:.+)$/i)?.[1];
    if (url.origin !== new URL(origin).origin || !url.pathname.startsWith('/api/')) {
      if (marker) fail('invalid_api_origin');
      return fetchImpl(input, options);
    }
    const version = generation;
    const method = (options.method || input?.method || 'GET').toUpperCase();
    const publicAuth = /^\/api\/auth\/session\/(forgot-password|reset-password|verification\/confirm)\/?$/.test(url.pathname);
    const signal = options.signal || input?.signal;
    if (signal?.aborted) throw signal.reason;
    if (!publicAuth && marker && marker !== snapshot()?.token) throw stale();
    if (!publicAuth) await ready();
    check(version);
    if (!publicAuth && marker && marker !== snapshot()?.token) throw stale();
    headers.delete('Authorization');
    headers.delete('X-CSRF-TOKEN');
    headers.delete('X-Cookbook-Client');
    headers.delete('X-Cookbook-Session');
    if (!publicAuth && session) headers.set('X-Cookbook-Session', session.session_id);
    if (transport === 'native') {
      headers.set('X-Cookbook-Client', 'native');
      if (!publicAuth && session?.access) headers.set('Authorization', `Bearer ${session.access}`);
    } else if (writeMethod(method) && session?.csrf_token) headers.set('X-CSRF-TOKEN', session.csrf_token);
    // Deliberately no retry/replay after dispatch, including a 401 or lost response.
    const reset = publicAuth && method === 'POST' && url.pathname.replace(/\/$/, '').endsWith('/reset-password');
    const send = () => dispatch(input, { ...options, method, signal, headers,
      credentials: transport === 'browser' ? 'same-origin' : 'omit', redirect: 'error' }, version);
    const response = reset ? await coordinated(version, send) : await send();
    if (!publicAuth && response.status === 401) {
      blocked = new SessionRuntimeError('authentication_required', { status: 401 });
      emit('blocked', blocked);
    }
    if (response.ok && method === 'POST' && url.pathname.replace(/\/$/, '').endsWith('/auth/session/reset-password')) {
      // Reset may revoke the active owner. Reverify before further protected
      // work; retain encrypted credentials until the server resolves identity.
      advance(); session = null; refreshToken = null; initialized = false; blocked = null; revocationProof = null;
      announce(generation, false);
      emit('reverify');
    }
    return response;
  }
  return {
    transport, getSession: snapshot, init, refresh, fetch, logout,
    login: (body) => credentials('login', body), register: (body) => credentials('register', body),
    // Only for a confirmed server-side account deletion; logout must call logout().
    forgetSession: () => forget(),
    fenceRequests: () => advance(),
    invalidate: () => { advance(); initialized = false; blocked = null; session = null; refreshToken = null; revocationProof = null; emit('invalidated'); },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    dispose: () => { advance(); disposed = true; session = null; refreshToken = null; listeners.clear(); },
  };
}
