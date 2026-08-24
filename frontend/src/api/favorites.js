import api from "./client";

export const getFavorites = () => api.get("/favorites").then((r) => r.data.dish_slugs);
export const addFavorite = (slug) => api.post(`/favorites/${slug}`);
export const removeFavorite = (slug) => api.delete(`/favorites/${slug}`);
