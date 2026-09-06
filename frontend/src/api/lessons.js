import api from "./client";

// docs/contracts/pilot-fixtures.md §11 - two request shapes, same underlying
// Lesson. getLessonBySlug backs LessonPage.jsx; getLessonByRef backs both
// CookMode.jsx's contextual-help pin capture (a NEW session only - see §9)
// and the standalone lesson page's own fallback needs. Both may 404 (no
// lesson for that slug/step) or reject with 403 (locked tier) - callers
// decide how to treat that (LessonPage shows an error; CookMode's pin
// capture just omits that step_id from pinned_lessons).
export const getLessonBySlug = (slug, lang) => api.get(`/lessons/${slug}`, { params: { lang } }).then((r) => r.data);

export const getLessonByRef = (dish_slug, level, lang, step_id) =>
  api.get("/lessons/by-ref", { params: { dish_slug, level, lang, step_id } }).then((r) => r.data);
