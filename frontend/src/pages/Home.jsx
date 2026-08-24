import useAuthStore from "../store/useAuthStore";
import { useT } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";

export default function Home() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="max-w-3xl mx-auto px-6 py-8 flex items-center justify-between flex-wrap gap-4">
        <div>
          <span className="font-display font-bold text-lg" style={{ color: "var(--brand)" }}>
            {t("app_name")}
          </span>
          {user && (
            <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              {t("home_signed_in_as", { name: user.display_name || user.email })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LangSwitch />
          <ThemeSwitch />
          <button onClick={logout} className="btn-ghost text-sm py-2 px-4">
            {t("auth_logout")}
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6">
        <h1 className="font-display text-4xl font-bold" style={{ color: "var(--ink)" }}>
          {t("home_greeting")}
        </h1>
        <p className="mt-3" style={{ color: "var(--muted)" }}>
          Foundation phase — recipe browsing, tiers, and nutrition land in P2.
        </p>
      </main>
    </div>
  );
}
