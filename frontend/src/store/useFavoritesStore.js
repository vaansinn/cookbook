import { create } from "zustand";
import { getFavorites, addFavorite, removeFavorite } from "../api/favorites";

const useFavoritesStore = create((set, get) => ({
  slugs: new Set(),
  loaded: false,

  load: async () => {
    try {
      const slugs = await getFavorites();
      set({ slugs: new Set(slugs), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  isFavorite: (slug) => get().slugs.has(slug),

  toggle: (slug) => {
    const isFav = get().slugs.has(slug);
    const next = new Set(get().slugs);
    isFav ? next.delete(slug) : next.add(slug);
    set({ slugs: next });
    (isFav ? removeFavorite(slug) : addFavorite(slug)).catch(() => {
      const revert = new Set(get().slugs);
      isFav ? revert.add(slug) : revert.delete(slug);
      set({ slugs: revert });
    });
  },
}));

export default useFavoritesStore;
