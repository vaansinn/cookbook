import { useEffect, useRef } from "react";
import useAuthStore from "../store/useAuthStore";
import { useT } from "../i18n";

export default function AuthRecovery() {
  const t = useT();
  const { init, logout, initError, initializing, loading, deletionCleanup, retryDeletionCleanup } = useAuthStore();
  const message = useRef(null);
  useEffect(() => { if (initError) message.current?.focus(); }, [initError]);
  const pending = initializing || loading;
  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <section className="card w-full max-w-md p-8 space-y-5" aria-labelledby="auth-recovery-title">
        <h1 id="auth-recovery-title" className="font-display text-2xl font-bold">{t("auth_recovery_title")}</h1>
        <p ref={message} tabIndex={-1} role={initError ? "alert" : "status"}>
          {t(initError === "deleted_storage" ? "auth_recovery_deleted_storage" : initError === "storage" ? "auth_recovery_storage" : initError ? "auth_recovery_error" : "auth_recovery_loading")}
        </p>
        {initError && initError !== "deleted_storage" && <button type="button" className="btn-primary w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ minHeight: 44 }} disabled={pending} onClick={() => init()}>{t("auth_recovery_retry")}</button>}
        {initError === "deleted_storage" && deletionCleanup && <button type="button" className="btn-primary w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ minHeight: 44 }} disabled={pending} onClick={retryDeletionCleanup}>{t("auth_recovery_retry_cleanup")}</button>}
        <button type="button" className="btn-ghost w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" style={{ minHeight: 44 }} onClick={logout}>{t("auth_recovery_signout")}</button>
      </section>
    </main>
  );
}
