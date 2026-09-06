import api from "./client";

// lang/snapshot_id complete the pilot-fixtures.md §6 request shape - the
// server validates snapshot_id actually matches dish_slug/level/lang before
// ever attaching it to a CookLog row (routes/progress.py).
export const logCook = (dish_slug, level, session_id, lang, snapshot_id) =>
  api.post("/cook-log", { dish_slug, level, session_id, lang, snapshot_id }).then((r) => r.data);
export const getProgress = (lang) => api.get("/progress", { params: { lang } }).then((r) => r.data);

export const getGlossary = (lang) => api.get("/glossary", { params: { lang } }).then((r) => r.data);
export const getGlossaryEntry = (slug, lang) => api.get(`/glossary/${slug}`, { params: { lang } }).then((r) => r.data);
