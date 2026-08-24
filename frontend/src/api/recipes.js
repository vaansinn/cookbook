import api from "./client";

export async function fetchDishes(params = {}) {
  const { data } = await api.get("/dishes", { params });
  return data;
}

export async function fetchDish(slug, lang = "en") {
  const { data } = await api.get(`/dishes/${slug}`, { params: { lang } });
  return data;
}

export async function fetchFilters(lang = "en") {
  const { data } = await api.get("/filters", { params: { lang } });
  return data;
}
