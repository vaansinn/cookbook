import { Link } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import { useT } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";

export default function PrivacyPage() {
  const t = useT();
  const token = useAuthStore((s) => s.token);
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-lg mx-auto px-6 pt-6 pb-16">
        <div className="flex items-center justify-between">
          <Link to={token ? "/settings" : "/register"} className="text-sm font-bold" style={{ color: "var(--muted)" }}>← {t("privacy_back")}</Link>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </div>
        <h1 className="font-display text-3xl font-bold mt-4" style={{ color: "var(--ink)" }}>{t("privacy_title")}</h1>
        <p className="mt-4 leading-relaxed">{t("privacy_body_1")}</p>
        <p className="mt-4 leading-relaxed">{t("privacy_body_2")}</p>
      </div>
    </div>
  );
}
