import api from "./client";

export const logCook = (dish_slug, level) => api.post("/cook-log", { dish_slug, level }).then((r) => r.data);
export const getProgress = (lang) => api.get("/progress", { params: { lang } }).then((r) => r.data);

export const getGlossary = (lang) => api.get("/glossary", { params: { lang } }).then((r) => r.data);
export const getGlossaryEntry = (slug, lang) => api.get(`/glossary/${slug}`, { params: { lang } }).then((r) => r.data);
