import api from "./client";

export const getMealPlans = () => api.get("/meal-plans").then((r) => r.data.plans);
export const createMealPlan = (name, items) => api.post("/meal-plans", { name, items }).then((r) => r.data.plan);
export const updateMealPlan = (id, data) => api.patch(`/meal-plans/${id}`, data).then((r) => r.data.plan);
export const deleteMealPlan = (id) => api.delete(`/meal-plans/${id}`);
export const getSharedMealPlan = (slug, lang) =>
  api.get(`/meal-plans/shared/${slug}`, { params: { lang } }).then((r) => r.data);
export const addPlanToGroceryList = (id, lang) =>
  api.post(`/meal-plans/${id}/grocery-list`, { lang }).then((r) => r.data);
export const applyPlanToWeek = (id, start_date) =>
  api.post(`/meal-plans/${id}/apply-week`, { start_date }).then((r) => r.data);
export const generateMealPlan = (name) => api.post("/meal-plans/generate", { name }).then((r) => r.data.plan);
