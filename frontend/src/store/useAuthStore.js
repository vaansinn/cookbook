import { create } from "zustand";
import api, { setAuthSessionReader } from "../api/client";
import { deleteWithPlanningCleanup, retryPlanningDeletionCleanup } from "../api/planningLifecycle.mjs";

// Storage failures stay blocked and visible; no silent guest or memory-only
// login fallback. Retry storage explicitly, including on sign out.
let bootToken = null;
let bootError = null;
try { bootToken = localStorage.getItem("token"); } catch { bootError = "storage"; }

const useAuthStore = create((set, get) => {
  const begin = () => {
    set((s) => ({ requestGeneration: s.requestGeneration + 1 }));
    const { token, epoch, requestGeneration } = get();
    return { token, epoch, requestGeneration };
  };
  const current = (origin) => ["token", "epoch", "requestGeneration"].every((key) => get()[key] === origin[key]);
  const clear = () => {
    begin();
    try { localStorage.removeItem("token"); } catch {
      set({ user: null, initialized: false, initializing: false, loading: false, initError: "storage" });
      return;
    }
    set((s) => ({ user: null, token: null, initialized: true, initializing: false,
      initError: null, loading: false, error: null, errorData: null, deletionCleanup: null, epoch: s.epoch + 1 }));
  };
  const credentials = async (url, body, fallback) => {
    const previous = get();
    const origin = begin();
    // Preserve the verified owner while the global initialization gate hides
    // consumers. A temporary null owner would delete persisted cook attempts.
    set({ initialized: previous.initialized && !previous.token, initializing: false, loading: true, initError: null, error: null, errorData: null });
    try {
      const { data } = await api.post(url, body, { authOrigin: origin });
      if (!current(origin)) return false;
      localStorage.setItem("token", data.token);
      set((s) => ({ user: data.user, token: data.token, initialized: true, loading: false, epoch: s.epoch + 1 }));
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
    init: async () => {
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
    logout: clear,
    syncSessionFromStorage: async () => {
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
          clear();
          if (result.cleanupError) set({ initialized: false, initError: "deleted_storage",
            deletionCleanup: { accountId, confirmation: result } });
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
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "token" || event.key === null) useAuthStore.getState().syncSessionFromStorage();
  });
  window.addEventListener("auth:expired", (event) => {
    const state = useAuthStore.getState();
    if (state.token && event.detail && ["token", "epoch", "requestGeneration"].every((key) => state[key] === event.detail[key])) state.logout();
  });
}
export const getAuthEpoch = () => useAuthStore.getState().epoch;
export default useAuthStore;
