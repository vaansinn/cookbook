import api from "./client";

// docs/contracts/pilot-fixtures.md §11 - two request shapes, same underlying
// Lesson. Standalone pages read live content; active cooks use server snapshots.
// A failed lookup must never be retained as a permanent absence of help.
export const getLessonBySlug = (slug, lang, signal) => api.get(`/lessons/${slug}`, { params: { lang }, signal }).then((r) => r.data);

export const getLessonByRef = (dish_slug, level, lang, step_id) =>
  api.get("/lessons/by-ref", { params: { dish_slug, level, lang, step_id } }).then((r) => r.data);
