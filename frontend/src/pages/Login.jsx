import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import { useT, apiMessage } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import PasswordField from "../components/PasswordField";
import { getSessionRuntime } from "../api/client";

export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const signoutNotice = useAuthStore((s) => s.signoutNotice);
  const partialSignout = getSessionRuntime() && signoutNotice === "other_sessions_unconfirmed";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const pending = useRef(false);
  const errorRef = useRef(null);
  // Unknown server text may be unlocalized; keep the form's fallback in useT.
  const errorMessage = err && apiMessage({ code: err.code, min: err.min }, t, t("auth_login_failed"));

  useEffect(() => {
    if (err) errorRef.current?.focus();
  }, [err]);

  const submit = async (e) => {
    e.preventDefault();
    if (pending.current || loading) return;
    pending.current = true;
    setErr(null);
    try {
      const applied = await login(email, password);
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
          {t("auth_login_title")}
        </h1>
        {partialSignout && <p id="login-signout-notice" role="alert" aria-atomic="true" className="mt-4 rounded-lg border p-3 text-sm font-semibold" style={{ color: "var(--ink)", background: "var(--danger-soft)", borderColor: "var(--danger)" }}>{t("account_signout_partial")}</p>}
        <form onSubmit={submit} className="mt-6 space-y-3" aria-busy={loading} aria-describedby={[partialSignout && "login-signout-notice", err && "login-error"].filter(Boolean).join(" ") || undefined}>
          <div>
            <label htmlFor="login-email" className="block mb-1 text-sm font-semibold">{t("auth_email")}</label>
            <input id="login-email" name="email" className="field" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} readOnly={loading} required />
          </div>
          <PasswordField id="login-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} readOnly={loading} />
          {err && <p id="login-error" ref={errorRef} role="alert" tabIndex={-1} className="text-sm font-semibold rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" style={{ color: "var(--danger)" }}>{errorMessage}</p>}
          <button className="btn-primary w-full disabled:opacity-60 disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" type="submit" disabled={loading}>{t(loading ? "auth_logging_in" : "auth_login_button")}</button>
        </form>
        <p role="status" className="sr-only">{loading ? t("auth_logging_in") : ""}</p>
        {getSessionRuntime() && <Link to="/account/recovery" className="flex items-center justify-center mt-3 text-sm font-semibold text-center" style={{ color: "var(--brand)", minHeight: 48 }}>{t("account_forgot_password")}</Link>}
        <Link to="/register" className="block mt-5 text-sm font-semibold text-center" style={{ color: "var(--brand)" }}>
          {t("auth_switch_to_register")}
        </Link>
      </div>
      </div>
    </div>
  );
}
