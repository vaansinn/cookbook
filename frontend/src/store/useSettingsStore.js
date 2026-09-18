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
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { darkMode: typeof saved?.darkMode === 'boolean' ? saved.darkMode : defaults.darkMode,
      language: ['en', 'de'].includes(saved?.language) ? saved.language : defaults.language };
  } catch {
    return defaults;
  }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ darkMode: state.darkMode, language: state.language })); return true; }
  catch { return false; }
}

const useSettingsStore = create((set) => ({
  ...load(),
  appearanceOwner: null, appearanceRevision: -1, storageError: false,
  setDarkMode: (val) => set((s) => {
    if (s.appearanceOwner !== null || typeof val !== 'boolean') return s;
    const n = { ...s, darkMode: val }; return { ...n, storageError: !save(n) };
  }),
  setLanguage: (val) => set((s) => {
    if (s.appearanceOwner !== null || !['en', 'de'].includes(val)) return s;
    const n = { ...s, language: val }; return { ...n, storageError: !save(n) };
  }),
  activateAppearanceOwner: (owner) => set((s) => owner === s.appearanceOwner ? s : {
    ...(owner === null ? load() : { language: 'en', darkMode: false }),
    appearanceOwner: owner, appearanceRevision: -1, storageError: false,
  }),
  acceptAccountAppearance: (owner, revision, values) => set((s) => {
    if (owner === null || owner !== s.appearanceOwner || !Number.isInteger(revision) || revision < 0 || revision < s.appearanceRevision
        || !['en', 'de'].includes(values?.language) || typeof values?.dark_mode !== 'boolean') return s;
    return { language: values.language, darkMode: values.dark_mode, appearanceRevision: revision };
  }),
}));

export default useSettingsStore;
