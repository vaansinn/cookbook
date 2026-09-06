import api from "./client";

// docs/contracts/pilot-fixtures.md §3/§10/§12/§13. Signed-in only - a guest
// finish never calls any of these (see CookMode.jsx's guest branch).
//
// submitReflection is the single create-or-update call. `payload` should
// only include the fields the user actually touched (outcome/
// practiced_skill_confirmed/confidence) - never send practiced_skill_confirmed
// at all unless the checkbox was actually clicked (§12 - an untouched
// checkbox must submit as absent, not false).
export const submitReflection = (payload) => api.post("/reflections", payload).then((r) => r.data);

// Resumable state: revision zero is an unanswered reflection (no row created).
// 404 means the cook itself is unavailable, not merely an unanswered form.
export const getReflection = (cookLogId, signal) => api.get(`/cook-log/${cookLogId}/reflection`, { signal }).then((r) => r.data);
export const getSkillConfidences = (signal) => api.get('/me/skills', { signal }).then((r) => r.data);

export const getSkillConfidence = (slug) => api.get(`/me/skills/${slug}`).then((r) => r.data);
export const putSkillConfidence = (slug, confidence) => api.put(`/me/skills/${slug}`, { confidence }).then((r) => r.data);
