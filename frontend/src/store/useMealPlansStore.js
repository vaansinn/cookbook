import { create } from "zustand";
import { getMealPlans, createMealPlan, updateMealPlan, deleteMealPlan, generateMealPlan } from "../api/mealPlans";

const useMealPlansStore = create((set, get) => ({
  plans: [],
  loaded: false,

  load: async () => {
    const plans = await getMealPlans();
    set({ plans, loaded: true });
  },

  create: async (name, items) => {
    const plan = await createMealPlan(name, items);
    set({ plans: [plan, ...get().plans] });
    return plan;
  },

  generate: async (name) => {
    const plan = await generateMealPlan(name);
    set({ plans: [plan, ...get().plans] });
    return plan;
  },

  update: async (id, data) => {
    const plan = await updateMealPlan(id, data);
    set({ plans: get().plans.map((p) => (p.id === id ? plan : p)) });
    return plan;
  },

  remove: async (id) => {
    await deleteMealPlan(id);
    set({ plans: get().plans.filter((p) => p.id !== id) });
  },
}));

export default useMealPlansStore;
