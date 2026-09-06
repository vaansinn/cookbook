import api from "./client";

// docs/contracts/pilot-fixtures.md §1/§5. Both endpoints accept an
// unauthenticated request - Basic-tier snapshots are readable by guests
// exactly like Basic recipe viewing already is. startSnapshot is called once
// at a NEW session's start (capture-or-reuse); readSnapshot is the one
// legitimate re-fetch - a page reload re-requesting the SAME snapshot_id an
// in-progress session already has, never a fresh capture mid-session.
export const startSnapshot = (dish_slug, level, lang, signal) =>
  api.post("/recipe-snapshot", { dish_slug, level, lang }, { signal }).then((r) => r.data);

export const readSnapshot = (snapshotId, dish_slug, level, lang, signal) =>
  api.get(`/recipe-snapshot/${snapshotId}`, { params: { dish_slug, level, lang }, signal }).then((r) => r.data);
