import { useEffect, useRef } from "react";
import useAuthStore from "../store/useAuthStore";
import { useT } from "../i18n";
import { getSessionRuntime } from "../api/client";
import { useSignOut } from "./AccountSecurity";

export default function AuthRecovery() {
  const t = useT();
  const { init, initError, initializing, loading, deletionCleanup, retryDeletionCleanup, logoutError, logoutPending, logoutAllPending } = useAuthStore();
  const signOut = useSignOut();
  const sessionMode = !!getSessionRuntime();
  const signoutError = signOut.error || (sessionMode && logoutError ? "account_signout_failed" : "");
  const message = useRef(null);
  useEffect(() => { if (initError || signoutError) message.current?.focus(); }, [initError, signoutError]);
  const pending = initializing || loading || signOut.pending;
  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <section className="card w-full max-w-md p-8 space-y-5" aria-labelledby="auth-recovery-title">
        <h1 id="auth-recovery-title" className="font-display text-2xl font-bold">{t("auth_recovery_title")}</h1>
        <p ref={message} tabIndex={-1} role={initError || signoutError ? "alert" : "status"}>
          {t(signoutError || (sessionMode && logoutPending ? "account_signing_out" : initError === "deleted_storage" ? "auth_recovery_deleted_storage" : initError === "storage" ? "auth_recovery_storage" : initError ? "auth_recovery_error" : "auth_recovery_loading"))}
        </p>
        {initError && initError !== "deleted_storage" && <button type="button" className="btn-primary w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ minHeight: 44 }} disabled={pending} onClick={() => init()}>{t("auth_recovery_retry")}</button>}
        {initError === "deleted_storage" && deletionCleanup && <button type="button" className="btn-primary w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ minHeight: 44 }} disabled={pending} onClick={retryDeletionCleanup}>{t("auth_recovery_retry_cleanup")}</button>}
        <button type="button" className="btn-ghost w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ minHeight: 48 }} disabled={pending}
          onClick={() => signOut.run(sessionMode && logoutPending ? "retryLogout" : "logout")}>{t(sessionMode && logoutAllPending ? "account_logout_all_retry" : "auth_recovery_signout")}</button>
      </section>
    </main>
  );
}
