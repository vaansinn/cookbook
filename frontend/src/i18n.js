import en from "./locales/en.json";
import de from "./locales/de.json";
import useSettingsStore from "./store/useSettingsStore";

const translations = { en, de };

export function useT() {
  const lang = useSettingsStore((s) => s.language) || "en";
  return (key, vars) => {
    let s = translations[lang]?.[key] ?? translations.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
    }
    return s;
  };
}

// Translate a backend API error: routes attach a stable "code"; if we have
// an api_<code> key, use that (filled from the payload), else fall back to
// the server's English text.
export function apiMessage(data, t, fallback = "") {
  if (data?.code) {
    const key = "api_" + data.code;
    const s = t(key, { n: data.min });
    if (s !== key) return s;
  }
  return data?.error || fallback;
}

export default translations;
