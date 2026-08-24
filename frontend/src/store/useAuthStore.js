import { create } from "zustand";
import api from "../api/client";

const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem("token"),
  loading: false,
  error: null,
  errorData: null,

  init: async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data });
    } catch {
      localStorage.removeItem("token");
      set({ token: null });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null, errorData: null });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      set({ user: data.user, token: data.token, loading: false });
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
      set({ user: data.user, token: data.token, loading: false });
    } catch (err) {
      set({ error: err.response?.data?.error || "Registration failed", errorData: err.response?.data || null, loading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    set({ user: null, token: null });
  },
}));

export default useAuthStore;
