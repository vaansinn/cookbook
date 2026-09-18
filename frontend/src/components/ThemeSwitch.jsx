import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { useAccountAppearance } from './AccountAppearanceProvider';

export default function ThemeSwitch() {
  const darkMode = useSettingsStore((s) => s.darkMode);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);
  const t = useT();
  const account = useAccountAppearance();
  const change = (dark_mode) => account ? account.change({ dark_mode }) : setDarkMode(dark_mode);

  return (
    <div className="flex items-center gap-1 rounded-full border-2 p-1" style={{ borderColor: "var(--line)" }}>
      <button
        disabled={account?.busy}
        onClick={() => change(false)}
        className="rounded-full px-3 py-1.5 text-xs font-bold"
        style={!darkMode ? { background: "var(--brand)", color: "var(--brand-ink)" } : { color: "var(--muted)" }}
      >
        {t("settings_theme_light")}
      </button>
      <button
        disabled={account?.busy}
        onClick={() => change(true)}
        className="rounded-full px-3 py-1.5 text-xs font-bold"
        style={darkMode ? { background: "var(--brand)", color: "var(--brand-ink)" } : { color: "var(--muted)" }}
      >
        {t("settings_theme_dark")}
      </button>
    </div>
  );
}
