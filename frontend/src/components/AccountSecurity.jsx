import { useEffect, useRef, useState } from "react";
import useAuthStore from "../store/useAuthStore";
import api, { getSessionRuntime } from "../api/client";
import { useT } from "../i18n";

// Include generation even for a same-owner replacement session.
export const accountScope = (state) => JSON.stringify([state.user?.id ?? null, state.token, state.epoch, state.requestGeneration]);
export const accountControl = "w-full text-sm disabled:opacity-60 disabled:cursor-wait focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function requestError(error) {
  const code = error.response?.data?.code || error.code;
  if (code === "invalid_token") return "account_code_invalid";
  if (code === "rate_limited" || error.response?.status === 429) return "account_rate_limited";
  if (code === "mail_unavailable") return "account_mail_unavailable";
  if (code === "password_too_short") return "account_password_invalid";
  if (code === "invalid_input") return "account_input_invalid";
  if (["authentication_required", "stale_session"].includes(code) || error.response?.status === 401) return "account_session_changed";
  return "account_request_failed";
}

// Used only by session-gated controls. Callers key their form by accountScope,
// resetting drafts immediately when the owner or request generation changes.
export function useAccountRequest(scope) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const flight = useRef(null);
  const mounted = useRef(false);
  const message = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error || notice) message.current?.focus(); }, [error, notice]);

  const run = async (action, endpoint, body, successKey, onSuccess) => {
    const origin = useAuthStore.getState();
    if (!mounted.current || !getSessionRuntime() || flight.current || accountScope(origin) !== scope || origin.loading || origin.initializing) return;
    const ticket = {};
    flight.current = ticket;
    const current = () => mounted.current && flight.current === ticket && accountScope(useAuthStore.getState()) === scope;
    setPending(action); setError(""); setNotice("");
    try {
      const response = await api.post(`/auth/session/${endpoint}`, body, { authOrigin: origin });
      if (!current()) return;
      if (response.data?.ok !== true) throw new Error("unconfirmed_response");
      setNotice(successKey);
      await onSuccess?.();
    } catch (failure) {
      if (current()) setError(requestError(failure));
    } finally {
      if (current()) setPending("");
      if (flight.current === ticket) flight.current = null;
    }
  };
  return { pending, error, notice, message, run };
}

// Logout may advance its own generation synchronously. Fence its completion to
// that post-dispatch generation; never accept a later account/session's result.
export function useSignOut() {
  const scope = useAuthStore(accountScope);
  const [result, setResult] = useState(null);
  const flight = useRef(null);
  const mounted = useRef(false);
  const message = useRef(null);
  const error = result?.scope === scope && result.error;
  const pending = result?.scope === scope && result.pending;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) message.current?.focus(); }, [error]);
  const run = async (action = "logout") => {
    const origin = useAuthStore.getState();
    if (!mounted.current || origin.loading || origin.initializing || accountScope(origin) !== scope || (flight.current?.scope === scope)) return;
    const ticket = { scope };
    flight.current = ticket;
    setResult({ scope, pending: true });
    const current = () => mounted.current && flight.current === ticket && accountScope(useAuthStore.getState()) === ticket.scope;
    try {
      const request = useAuthStore.getState()[action]();
      const dispatched = useAuthStore.getState();
      ticket.scope = origin.user?.id === dispatched.user?.id && origin.token === dispatched.token && origin.epoch === dispatched.epoch
        ? accountScope(dispatched) : null;
      if (current()) setResult({ scope: ticket.scope, pending: true });
      const outcome = await request;
      if (!current()) return;
      if (outcome?.stale) { setResult(null); return; }
      const state = useAuthStore.getState();
      const failed = outcome === false || outcome?.ok === false || state.logoutError || state.initError;
      setResult({ scope: ticket.scope, pending: false, error: failed ? "account_signout_failed" : "" });
    } catch {
      if (current()) setResult({ scope: ticket.scope, pending: false, error: "account_signout_failed" });
    } finally {
      if (flight.current === ticket) flight.current = null;
    }
  };
  return { pending: !!pending, error, message, run };
}

export function AccountRequestFeedback({ request, id }) {
  const t = useT();
  return <>
    <p role="status" className="sr-only">{request.pending ? t("account_working") : ""}</p>
    {(request.error || request.notice) && <p id={id} ref={request.message} tabIndex={-1} role={request.error ? "alert" : "status"}
      className="text-sm mt-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      style={{ color: request.error ? "var(--danger)" : "var(--ink)" }}>{t(request.error || request.notice)}</p>}
  </>;
}

function SecurityControls({ scope, user }) {
  const t = useT();
  const request = useAccountRequest(scope);
  const signOut = useSignOut();
  const loading = useAuthStore((s) => s.loading || s.initializing);
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const confirmation = useRef(null);
  const allButton = useRef(null);
  useEffect(() => { if (confirming) confirmation.current?.focus(); }, [confirming]);
  const busy = !!request.pending || signOut.pending || loading;
  const verified = typeof user.email_verified === "boolean" ? user.email_verified : null;

  return (
    <section className="card p-4 mt-6 space-y-3" aria-labelledby="account-security-title">
      <h2 id="account-security-title" className="font-display font-bold">{t("account_security_title")}</h2>
      {verified !== null && <p className="text-sm">{t(verified ? "account_email_verified" : "account_email_unverified")}</p>}
      {verified !== true && <>
        <button type="button" disabled={busy} className={`btn-ghost ${accountControl}`} style={{ minHeight: 48 }}
          onClick={() => request.run("verification-request", "verification/request", {}, "account_verification_requested")}>{t("account_verification_request")}</button>
        <form className="space-y-3" aria-busy={!!request.pending} aria-describedby={request.error ? "security-feedback" : undefined}
          onSubmit={(event) => { event.preventDefault(); if (!busy) request.run("verification-confirm", "verification/confirm", { token: code.trim() }, "account_verification_confirmed", async () => { setCode(""); await useAuthStore.getState().init(); }); }}>
          <div>
            <label htmlFor="verification-code" className="block mb-1 text-sm font-semibold">{t("account_verification_code")}</label>
            <input id="verification-code" name="token" className="field" value={code} onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} required readOnly={busy} />
          </div>
          <button type="submit" disabled={busy} className={`btn-primary ${accountControl}`} style={{ minHeight: 48 }}>{t("account_verification_confirm")}</button>
        </form>
      </>}
      <AccountRequestFeedback request={request} id="security-feedback" />
      {!confirming ? <button ref={allButton} type="button" disabled={busy} className={`btn-ghost ${accountControl}`} style={{ minHeight: 48 }}
        onClick={() => setConfirming(true)}>{t("account_logout_all")}</button> :
        <div className="space-y-3" role="group" aria-labelledby="logout-all-confirmation">
          <p id="logout-all-confirmation" ref={confirmation} tabIndex={-1} className="text-sm">{t("account_logout_all_confirm")}</p>
          <button type="button" disabled={busy} className={`btn-primary ${accountControl}`} style={{ minHeight: 48 }}
            onClick={() => signOut.run("logoutAll")}>{t(signOut.pending ? "account_signing_out" : "account_logout_all_confirm_button")}</button>
          <button type="button" disabled={busy} className={`btn-ghost ${accountControl}`} style={{ minHeight: 48 }}
            onClick={() => { setConfirming(false); requestAnimationFrame(() => allButton.current?.focus()); }}>{t("settings_cancel")}</button>
        </div>}
      {signOut.error && <p ref={signOut.message} tabIndex={-1} role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{t(signOut.error)}</p>}
    </section>
  );
}

export default function AccountSecurity() {
  const scope = useAuthStore(accountScope);
  const user = useAuthStore((s) => s.user);
  if (!getSessionRuntime() || !user) return null;
  return <SecurityControls key={scope} scope={scope} user={user} />;
}
