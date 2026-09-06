import { create } from "zustand";
import api from "../api/client";

// `epoch` bumps on every login, logout, register, account deletion, and
// server-signalled session expiry (a 401 arriving mid-session). Any
// in-flight request started under an earlier epoch must discard its result
// instead of applying it to store/component state when it resolves - that's
// what keeps one account's slow response from landing in another account's
// session after a switch. Read it with getAuthEpoch() from call sites that
// don't otherwise subscribe to this store.
const useAuthStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem("token"),
  loading: false,
  error: null,
  errorData: null,
  epoch: 0,
  initialized: false,

  init: async () => {
    const token = localStorage.getItem("token");
    const requestEpoch = get().epoch;
    if (!token) { set({ initialized: true }); return; }
    try {
      const { data } = await api.get("/auth/me");
      if (get().epoch === requestEpoch && get().token === token) set({ user: data, initialized: true });
    } catch {
      if (get().epoch !== requestEpoch) return;
      localStorage.removeItem("token");
      set((s) => ({ user: null, token: null, initialized: true, epoch: s.epoch + 1 }));
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null, errorData: null });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      set((s) => ({ user: data.user, token: data.token, initialized: true, loading: false, epoch: s.epoch + 1 }));
    } catch (err) {
      set({ error: err.response?.data?.error || "Login failed", errorData: err.response?.data || null, loading: false });
      throw err;
    }
  },

  register: async (email, displayName, password) => {
    set({ loading: true, error: null, errorData: null });
    try {
      const { data } = await api.post("/auth/register", { email, display_name: displayName, password });
      localStorage.setItem("token", data.token);
      set((s) => ({ user: data.user, token: data.token, initialized: true, loading: false, epoch: s.epoch + 1 }));
    } catch (err) {
      set({ error: err.response?.data?.error || "Registration failed", errorData: err.response?.data || null, loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    set((s) => ({ user: null, token: null, initialized: true, epoch: s.epoch + 1 }));
  },

  exportData: () => api.get("/auth/me/export").then((r) => r.data),

  deleteAccount: async () => {
    await api.delete("/auth/me");
    localStorage.removeItem("token");
    set((s) => ({ user: null, token: null, initialized: true, epoch: s.epoch + 1 }));
  },
}));

// A 401 on a request that carried a token means the session expired or was
// revoked server-side mid-session (see the response interceptor in
// api/client.js, which dispatches this event) - clear it exactly like an
// explicit logout so any in-flight request from the old session gets caught
// by the epoch guard, the same as an explicit logout/switch would.
if (typeof window !== "undefined") {
  window.addEventListener("auth:expired", () => {
    if (!useAuthStore.getState().token) return; // already logged out
    localStorage.removeItem("token");
    useAuthStore.setState((s) => ({ user: null, token: null, initialized: true, epoch: s.epoch + 1 }));
  });
}

export const getAuthEpoch = () => useAuthStore.getState().epoch;

export default useAuthStore;
