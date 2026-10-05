import { create } from "zustand";
import api, { setAuthSessionReader, getSessionRuntime, onSessionRuntimeConfigured, SESSION_CHANGE_KEY } from "../api/client";
import { deleteWithPlanningCleanup, retryPlanningDeletionCleanup } from "../api/planningLifecycle.mjs";

// Storage failures stay blocked and visible; no silent guest or memory-only
// login fallback. Retry storage explicitly, including on sign out.
let bootToken = null;
let bootError = null;
if (!getSessionRuntime()) {
  try { bootToken = localStorage.getItem("token"); } catch { bootError = "storage"; }
}

const useAuthStore = create((set, get) => {
  let sessionInitFlight;
  const begin = () => {
    getSessionRuntime()?.fenceRequests();
    set((s) => ({ requestGeneration: s.requestGeneration + 1 }));
    const { token, epoch, requestGeneration } = get();
    return { token, epoch, requestGeneration };
  };
  const current = (origin) => ["token", "epoch", "requestGeneration"].every((key) => get()[key] === origin[key]);
  const clear = () => {
    if (getSessionRuntime()) return clearVerifiedSession();
    begin();
    try { localStorage.removeItem("token"); } catch {
      set({ user: null, initialized: false, initializing: false, loading: false, initError: "storage" });
      return;
    }
    set((s) => ({ user: null, token: null, initialized: true, initializing: false,
      initError: null, loading: false, error: null, errorData: null, deletionCleanup: null, epoch: s.epoch + 1 }));
  };
  const applySession = (session, signoutNotice = get().signoutNotice) => set((s) => ({ user: session?.user || null, token: session?.token || null,
    initialized: true, initializing: false, loading: false, initError: null, error: null, errorData: null,
    sessionNeedsVerification: false,
    // In-memory only: guest verification preserves the outcome; a verified
    // account (including registration/account replacement) starts fresh.
    signoutNotice: session ? null : signoutNotice,
    logoutError: null, logoutPending: false, logoutAllPending: false, deletionCleanup: null,
    epoch: s.epoch + (s.token !== (session?.token || null) ? 1 : 0) }));
  const sessionFailure = (err) => ({ initialized: false, initializing: false, loading: false,
    initError: err.code === 'storage' ? 'storage' : 'unavailable', error: err.response?.data?.error || err.message,
    errorData: err.response?.data || null });
  const clearVerifiedSession = async () => {
    const origin = begin();
    try {
      await getSessionRuntime().forgetSession();
      if (!current(origin)) return { stale: true };
      applySession(null);
      return true;
    } catch (err) {
      if (!current(origin)) return { stale: true };
      set(sessionFailure(err));
      return false;
    }
  };
  const initSession = () => {
    if (get().logoutPending) return logoutSession(get().logoutAllPending);
    if (sessionInitFlight) return sessionInitFlight;
    if (get().loading) return Promise.resolve(false);
    const origin = begin();
    set({ initialized: false, initializing: true, loading: false, initError: null });
    const flight = getSessionRuntime().init({ force: true }).then((session) => {
      if (current(origin)) applySession(session);
    }).catch((err) => {
      if (current(origin)) set(sessionFailure(err));
    }).finally(() => { if (sessionInitFlight === flight) sessionInitFlight = null; });
    sessionInitFlight = flight;
    return flight;
  };
  const sessionCredentials = async (kind, body, fallback) => {
    if (get().loading) return false;
    const previous = get();
    const origin = begin();
    // Keep the verified owner during transitions, so cook/outbox subscriptions
    // cannot mistake a recoverable failure for a confirmed account departure.
    set({ initialized: previous.initialized && !previous.token, initializing: false,
      loading: true, initError: null, error: null, errorData: null });
    try {
      const session = await getSessionRuntime()[kind](body);
      if (!current(origin)) return false;
      applySession(session);
      return true;
    } catch (err) {
      if (!current(origin)) return false;
      const definitive = [400, 401, 403, 409, 422, 429].includes(err.status);
      set({ ...sessionFailure(err), user: previous.user,
        initialized: definitive && previous.initialized, initError: definitive && previous.initialized ? null : 'unavailable',
        error: err.response?.data?.error || fallback });
      throw err;
    }
  };
  const logoutSession = async (all = false) => {
    if (get().logoutPending && get().loading) return { ok: false, pending: true };
    const origin = begin();
    set({ initialized: false, initializing: false, loading: true, initError: null,
      logoutPending: true, logoutAllPending: all, logoutError: null });
    try {
      const result = await getSessionRuntime().logout({ all, expectedSession: origin.token });
      if (!current(origin)) return { stale: true };
      applySession(null, all && result.allRevoked === false ? 'other_sessions_unconfirmed' : null);
      return result;
    } catch (err) {
      if (!current(origin)) return { stale: true };
      // An identity rejection is not revocation evidence. Keep the owner hidden
      // behind recovery, but let explicit init reverify instead of looping logout.
      const reverify = err.code === 'session_changed' || err.code === 'authentication_required' ||
        (err.status === 401 && err.response?.data?.code === 'invalid_session');
      set({ ...sessionFailure(err), logoutError: err, logoutPending: !reverify,
        sessionNeedsVerification: reverify });
      // Existing click handlers do not await logout. Expose a retryable result
      // and recovery state without creating an unhandled promise rejection.
      return { ok: false, revoked: false, retryable: true, reverify, error: err };
    }
  };
  const credentials = async (url, body, fallback) => {
    if (getSessionRuntime()) return sessionCredentials(url.endsWith('/register') ? 'register' : 'login', body, fallback);
    const previous = get();
    const origin = begin();
    // Preserve the verified owner while the global initialization gate hides
    // consumers. A temporary null owner would delete persisted cook attempts.
    set({ initialized: previous.initialized && !previous.token, initializing: false, loading: true, initError: null, error: null, errorData: null });
    try {
      const { data } = await api.post(url, body, { authOrigin: origin });
      if (!current(origin)) return false;
      localStorage.setItem("token", data.token);
      set((s) => ({ user: data.user, token: data.token, initialized: true, loading: false, signoutNotice: null, epoch: s.epoch + 1 }));
      return true;
    } catch (err) {
      if (!current(origin)) return false;
      set({ user: previous.user, initialized: previous.initialized, initError: previous.initialized ? null : (previous.initError || "unavailable"),
        error: err.response?.data?.error || fallback, errorData: err.response?.data || null, loading: false });
      throw err;
    }
  };
  return {
    user: null, token: bootToken, loading: false, error: null, errorData: null, deletionCleanup: null,
    epoch: 0, requestGeneration: 0, initialized: false, initializing: false, initError: bootError,
    logoutPending: false, logoutAllPending: false, logoutError: null,
    signoutNotice: null,
    sessionNeedsVerification: false,
    init: async () => {
      if (getSessionRuntime()) return initSession();
      if (get().initError === "storage") {
        try { set({ token: localStorage.getItem("token") }); } catch { return; }
      }
      const origin = begin();
      set({ initialized: false, initializing: true, loading: false, initError: null });
      if (!origin.token) { set({ initialized: true, initializing: false }); return; }
      try {
        const { data } = await api.get("/auth/me", { timeout: 15000, authOrigin: origin, handlesAuthRejection: true });
        if (current(origin)) set({ user: data, initialized: true, initializing: false });
      } catch (err) {
        if (!current(origin)) return;
        // /auth/me has no validation input. Flask-JWT-Extended returns a
        // message in its malformed-token 422; other 422s stay recoverable.
        if (err.response?.status === 401 || (err.response?.status === 422 && typeof err.response?.data?.msg === "string")) {
          clear();
        } else {
          set({ initialized: false, initializing: false, initError: "unavailable" });
        }
      }
    },
    login: (email, password) => credentials("/auth/login", { email, password }, "Login failed"),
    register: (email, displayName, password) => credentials("/auth/register", { email, display_name: displayName, password }, "Registration failed"),
    logout: () => getSessionRuntime() ? logoutSession() : clear(),
    logoutAll: () => getSessionRuntime() ? logoutSession(true) : clear(),
    retryLogout: () => getSessionRuntime() ? logoutSession(get().logoutAllPending) : clear(),
    syncSessionFromStorage: async () => {
      if (getSessionRuntime()) {
        sessionInitFlight = null;
        getSessionRuntime().invalidate();
        begin();
        set((s) => ({ initialized: false, initializing: false, loading: false,
          logoutPending: false, epoch: s.epoch + 1 }));
        return initSession();
      }
      // Never trust the storage-event payload as a verified account. Invalidate
      // every mounted consumer immediately, then verify the actual stored token.
      begin();
      set((s) => ({ initialized: false, initializing: false, loading: false, epoch: s.epoch + 1 }));
      try { set({ token: localStorage.getItem("token"), initError: null }); }
      catch { set({ initError: "storage" }); return; }
      await get().init();
      if (!get().token) set({ user: null });
    },
    exportData: () => api.get("/auth/me/export").then((r) => r.data),
    retryDeletionCleanup: async () => {
      const recovery = get().deletionCleanup;
      if (!recovery || get().loading) return;
      const origin = begin();
      set({ loading: true });
      try {
        if (getSessionRuntime() && recovery.sessionCleanup) {
          await getSessionRuntime().forgetSession();
          if (!current(origin)) return;
          // Keep this cleanup generation current while clearing the verified owner.
          set({ user: null, token: null });
          origin.token = null;
        }
        const result = await retryPlanningDeletionCleanup(recovery.accountId, recovery.confirmation);
        if (current(origin)) set({ loading: false, initialized: !result.cleanupError,
          initError: result.cleanupError ? "deleted_storage" : null,
          deletionCleanup: result.cleanupError ? { accountId: recovery.accountId, confirmation: result } : null });
      } catch {
        if (current(origin)) set({ loading: false, initialized: false, initError: "deleted_storage" });
      }
    },
    deleteAccount: async (expectedAccountId) => {
      const accountId = get().user?.id;
      // Bind destructive intent to the owner rendered by the caller. A stale
      // Settings handler must not touch the replacement session or its storage.
      if (!Number.isSafeInteger(expectedAccountId) || expectedAccountId < 1 || accountId !== expectedAccountId) return { stale: true };
      const origin = begin();
      try {
        const result = await deleteWithPlanningCleanup(accountId,
          () => api.delete("/auth/me", { authOrigin: origin, timeout: 15000, handlesAuthRejection: true }), () => current(origin));
        if (current(origin) && result.deleted) {
          const cleared = clear();
          const outcome = getSessionRuntime() ? await cleared : cleared;
          if (outcome?.stale) return { stale: true };
          if (result.cleanupError || outcome === false) set({ initialized: false, initError: "deleted_storage",
            deletionCleanup: { accountId, confirmation: result, sessionCleanup: outcome === false } });
          return result;
        }
        return { stale: true };
      } catch (err) {
        if (current(origin)) throw err;
        return { stale: true };
      }
    },
  };
});

setAuthSessionReader(() => useAuthStore.getState());
onSessionRuntimeConfigured((runtime) => {
  // The module may load before main installs the opt-in. Discard any legacy
  // in-memory token without reading, importing, or deleting its stored value.
  useAuthStore.setState((s) => ({ token: null, initialized: false, initializing: false,
    initError: null, requestGeneration: s.requestGeneration + 1 }));
  runtime.subscribe((event) => {
    // Let the successful recovery response reach its form before its onSuccess
    // calls init(). The runtime already fences all old-owner API operations.
    if (event.type === 'reverify') useAuthStore.setState({ sessionNeedsVerification: true });
    if (event.type === 'blocked') useAuthStore.setState({ initialized: false, initializing: false,
      initError: event.error?.code === 'storage' ? 'storage' : 'unavailable' });
  });
});
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === (getSessionRuntime() ? SESSION_CHANGE_KEY : "token") || event.key === null) useAuthStore.getState().syncSessionFromStorage();
  });
  window.addEventListener("auth:expired", (event) => {
    const state = useAuthStore.getState();
    if (getSessionRuntime()) return;
    if (state.token && event.detail && ["token", "epoch", "requestGeneration"].every((key) => state[key] === event.detail[key])) state.logout();
  });
}
export const getAuthEpoch = () => useAuthStore.getState().epoch;
export default useAuthStore;
