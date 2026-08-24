import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import { useT, apiMessage } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";

export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    try {
      await login(email, password);
      navigate("/");
    } catch (e2) {
      setErr(apiMessage(e2.response?.data, t, "Login failed"));
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6" style={{ background: "var(--bg)" }}>
      <div className="flex gap-3">
        <LangSwitch />
        <ThemeSwitch />
      </div>
      <div className="card w-full max-w-sm p-8">
        <h1 className="font-display text-3xl font-bold mb-1" style={{ color: "var(--ink)" }}>
          {t("auth_login_title")}
        </h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input className="field" type="email" placeholder={t("auth_email")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="field" type="password" placeholder={t("auth_password")} value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="text-sm font-semibold" style={{ color: "var(--hot)" }}>{err}</p>}
          <button className="btn-primary w-full" type="submit">{t("auth_login_button")}</button>
        </form>
        <Link to="/register" className="block mt-5 text-sm font-semibold text-center" style={{ color: "var(--brand)" }}>
          {t("auth_switch_to_register")}
        </Link>
      </div>
    </div>
  );
}
