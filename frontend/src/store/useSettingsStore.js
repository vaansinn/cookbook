import { create } from "zustand";

const STORAGE_KEY = "recipedrawer_settings";

function browserLang() {
  try {
    const code = (navigator.language || "").slice(0, 2).toLowerCase();
    return ["en", "de"].includes(code) ? code : "en";
  } catch {
    return "en";
  }
}

const defaults = {
  darkMode: false,
  language: browserLang(),
};

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    darkMode: state.darkMode,
    language: state.language,
  }));
}

const useSettingsStore = create((set) => ({
  ...load(),
  setDarkMode: (val) => set((s) => { const n = { ...s, darkMode: val }; save(n); return n; }),
  setLanguage: (val) => set((s) => { const n = { ...s, language: val }; save(n); return n; }),
}));

export default useSettingsStore;
