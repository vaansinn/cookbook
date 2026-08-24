import api from "./client";

export const getHousehold = () => api.get("/household").then((r) => r.data.household);
export const createHousehold = (name) => api.post("/household", { name }).then((r) => r.data.household);
export const joinHousehold = (code) => api.post("/household/join", { code }).then((r) => r.data.household);
export const leaveHousehold = () => api.post("/household/leave").then((r) => r.data);

export const getGroceryList = () => api.get("/grocery-list").then((r) => r.data.items);
export const addGroceryText = (text) => api.post("/grocery-list/items", { text }).then((r) => r.data.items);
export const addRecipeToList = (dish_slug, level, serves, lang) =>
  api.post("/grocery-list/items", { dish_slug, level, serves, lang }).then((r) => r.data.items);
export const setItemChecked = (id, checked) => api.patch(`/grocery-list/items/${id}`, { checked }).then((r) => r.data.item);
export const deleteItem = (id) => api.delete(`/grocery-list/items/${id}`);
export const clearChecked = () => api.post("/grocery-list/clear-checked");

export const getPlan = () => api.get("/plan").then((r) => r.data.entries);
export const addPlanEntry = (date, dish_slug, level, serves) =>
  api.post("/plan", { date, dish_slug, level, serves }).then((r) => r.data.entry);
export const deletePlanEntry = (id) => api.delete(`/plan/${id}`);
export const buildListFromPlan = (lang) => api.post("/plan/build-list", { lang }).then((r) => r.data.items);
