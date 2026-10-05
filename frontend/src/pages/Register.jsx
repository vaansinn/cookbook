import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import { useT, apiMessage } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import PasswordField from "../components/PasswordField";

export default function Register() {
  const t = useT();
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const pending = useRef(false);
  const errorRef = useRef(null);
  const errorMessage = err && apiMessage({ code: err.code, min: err.min }, t, t("auth_register_failed"));

  useEffect(() => {
    if (err) errorRef.current?.focus();
  }, [err]);

  const submit = async (e) => {
    e.preventDefault();
    if (pending.current || loading) return;
    pending.current = true;
    setErr(null);
    try {
      const applied = await register(email, displayName, password);
      if (applied) navigate("/");
    } catch (e2) {
      setErr(e2.response?.data || {});
    } finally {
      pending.current = false;
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
        <form onSubmit={submit} className="mt-6 space-y-3" aria-busy={loading} aria-describedby={err ? "register-error" : undefined}>
          <div>
            <label htmlFor="register-name" className="block mb-1 text-sm font-semibold">{t("auth_display_name_optional")}</label>
            <input id="register-name" name="display_name" className="field" type="text" autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} readOnly={loading} />
          </div>
          <div>
            <label htmlFor="register-email" className="block mb-1 text-sm font-semibold">{t("auth_email")}</label>
            <input id="register-email" name="email" className="field" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} readOnly={loading} required />
          </div>
          <PasswordField id="register-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} readOnly={loading} minLength={8} />
          {err && <p id="register-error" ref={errorRef} role="alert" tabIndex={-1} className="text-sm font-semibold rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" style={{ color: "var(--danger)" }}>{errorMessage}</p>}
          <button className="btn-primary w-full disabled:opacity-60 disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" type="submit" disabled={loading}>{t(loading ? "auth_registering" : "auth_register_button")}</button>
        </form>
        <p role="status" className="sr-only">{loading ? t("auth_registering") : ""}</p>
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
