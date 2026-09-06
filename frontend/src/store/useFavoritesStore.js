import { create } from "zustand";
import { getFavorites, addFavorite, removeFavorite } from "../api/favorites";
import useAuthStore, { getAuthEpoch } from "./useAuthStore";

const useFavoritesStore = create((set, get) => ({
  slugs: new Set(),
  loaded: false,

  load: async () => {
    const epoch = getAuthEpoch();
    try {
      const slugs = await getFavorites();
      if (getAuthEpoch() !== epoch) return; // account changed while this was in flight
      set({ slugs: new Set(slugs), loaded: true });
    } catch {
      if (getAuthEpoch() !== epoch) return;
      set({ loaded: true });
    }
  },

  isFavorite: (slug) => get().slugs.has(slug),

  toggle: (slug) => {
    const epoch = getAuthEpoch();
    const isFav = get().slugs.has(slug);
    const next = new Set(get().slugs);
    isFav ? next.delete(slug) : next.add(slug);
    set({ slugs: next });
    (isFav ? removeFavorite(slug) : addFavorite(slug)).catch(() => {
      if (getAuthEpoch() !== epoch) return; // don't revert onto a different account's state
      const revert = new Set(get().slugs);
      isFav ? revert.add(slug) : revert.delete(slug);
      set({ slugs: revert });
    });
  },
}));

// Reset on every account change (login, logout, switch, session expiry) -
// keyed on useAuthStore's epoch bump rather than user identity, so even a
// same-user re-login clears any favorites left over from a stale in-flight
// request tied to the previous epoch.
useAuthStore.subscribe((state, prevState) => {
  if (state.epoch !== prevState.epoch) {
    useFavoritesStore.setState({ slugs: new Set(), loaded: false });
  }
});

export default useFavoritesStore;
