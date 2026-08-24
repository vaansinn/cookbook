import useSettingsStore from "../store/useSettingsStore";

export default function LangSwitch() {
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <div className="flex items-center gap-1 rounded-full border-2 p-1" style={{ borderColor: "var(--line)" }}>
      {["en", "de"].map((code) => (
        <button
          key={code}
          onClick={() => setLanguage(code)}
          className="rounded-full px-3 py-1.5 text-xs font-bold uppercase"
          style={
            language === code
              ? { background: "var(--brand)", color: "var(--brand-ink)" }
              : { color: "var(--muted)" }
          }
        >
          {code}
        </button>
      ))}
    </div>
  );
}
