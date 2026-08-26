import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import { useT, apiMessage } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";

export default function Register() {
  const t = useT();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await register(email, displayName, password);
      navigate("/");
    } catch (e2) {
      setErr(apiMessage(e2.response?.data, t, "Registration failed"));
    }
  };

  return (
    <div className="min-h-screen flex flex-col px-6" style={{ background: "var(--bg)" }}>
      <div className="flex justify-end gap-3 pt-6">
        <LangSwitch />
        <ThemeSwitch />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center pb-12">
      <div className="card w-full max-w-sm p-8">
        <h1 className="font-display text-3xl font-bold mb-1" style={{ color: "var(--ink)" }}>
          {t("auth_register_title")}
        </h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input className="field" type="text" placeholder={t("auth_display_name")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className="field" type="email" placeholder={t("auth_email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="field" type="password" placeholder={t("auth_password")} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {err && <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{err}</p>}
          <button className="btn-primary w-full" type="submit">{t("auth_register_button")}</button>
        </form>
        <Link to="/login" className="block mt-5 text-sm font-semibold text-center" style={{ color: "var(--brand)" }}>
          {t("auth_switch_to_login")}
        </Link>
        <Link to="/privacy" className="block mt-2 text-xs font-semibold text-center" style={{ color: "var(--muted)" }}>
          {t("settings_privacy_link")}
        </Link>
      </div>
      </div>
    </div>
  );
}
