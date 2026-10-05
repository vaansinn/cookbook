import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import { getSessionRuntime } from "../api/client";
import { useT } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";
import PasswordField from "../components/PasswordField";
import { accountScope, accountControl, useAccountRequest, AccountRequestFeedback } from "../components/AccountSecurity";

function RecoveryForm({ scope }) {
  const t = useT();
  const request = useAccountRequest(scope);
  const loading = useAuthStore((s) => s.loading || s.initializing);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [enteringCode, setEnteringCode] = useState(false);
  const [done, setDone] = useState(false);
  const busy = !!request.pending || loading;
  return (
    <div className="min-h-screen flex flex-col px-6" style={{ background: "var(--bg)" }}>
      <div className="flex justify-end gap-3 pt-6"><LangSwitch /><ThemeSwitch /></div>
      <div className="flex-1 flex flex-col items-center justify-center pb-12">
        <div className="card w-full max-w-sm p-8">
          <h1 className="font-display text-3xl font-bold mb-1" style={{ color: "var(--ink)" }}>{t("account_reset_title")}</h1>
          {!done && <>
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>{t(enteringCode ? "account_reset_code_help" : "account_reset_help")}</p>
            {!enteringCode ? <form className="mt-6 space-y-3" aria-busy={!!request.pending} aria-describedby={request.error ? "reset-feedback" : undefined}
              onSubmit={(event) => { event.preventDefault(); request.run("reset-request", "forgot-password", { email }, "account_reset_requested", () => setEnteringCode(true)); }}>
              <label htmlFor="reset-email" className="block text-sm font-semibold">{t("auth_email")}</label>
              <input id="reset-email" name="email" className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                autoComplete="username" autoCapitalize="none" spellCheck={false} required readOnly={busy} />
              <button type="submit" className={`btn-primary ${accountControl}`} style={{ minHeight: 48 }} disabled={busy}>{t(request.pending ? "account_working" : "account_reset_request")}</button>
              <button type="button" className={`btn-ghost ${accountControl}`} style={{ minHeight: 48 }} disabled={busy} onClick={() => setEnteringCode(true)}>{t("account_have_code")}</button>
            </form> : <form className="mt-6 space-y-3" aria-busy={!!request.pending} aria-describedby={request.error ? "reset-feedback" : undefined}
              onSubmit={(event) => { event.preventDefault(); request.run("password-reset", "reset-password", { token: code.trim(), password }, "account_reset_complete", () => { setPassword(""); setCode(""); setDone(true); }); }}>
              <div>
                <label htmlFor="reset-code" className="block mb-1 text-sm font-semibold">{t("account_reset_code")}</label>
                <input id="reset-code" name="token" className="field" value={code} onChange={(event) => setCode(event.target.value)}
                  autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} required readOnly={busy} />
              </div>
              <PasswordField id="reset-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} readOnly={busy} minLength={8} />
              <button type="submit" className={`btn-primary ${accountControl}`} style={{ minHeight: 48 }} disabled={busy}>{t(request.pending ? "account_working" : "account_reset_submit")}</button>
              <button type="button" className={`btn-ghost ${accountControl}`} style={{ minHeight: 48 }} disabled={busy}
                onClick={() => { setEnteringCode(false); setCode(""); setPassword(""); }}>{t("account_request_another_code")}</button>
            </form>}
          </>}
          <AccountRequestFeedback request={request} id="reset-feedback" />
          {/* After a reset, the explicit link boots a fresh session check while
              keeping the confirmation visible until the person chooses it. */}
          <Link to="/login" reloadDocument={done} className="flex items-center justify-center mt-5 text-sm font-semibold text-center" style={{ color: "var(--brand)", minHeight: 48 }}>{t("account_back_to_login")}</Link>
        </div>
      </div>
    </div>
  );
}

export default function AccountRecoveryPage() {
  const scope = useAuthStore(accountScope);
  if (!getSessionRuntime()) return <Navigate to="/login" replace />;
  return <RecoveryForm key={scope} scope={scope} />;
}
