import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";
import { useT } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";

export default function SettingsPage() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const exportData = useAuthStore((s) => s.exportData);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  const doExport = async () => {
    setError("");
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recipe-drawer-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("error_generic"));
    }
  };

  const doDelete = async () => {
    setError("");
    try {
      await deleteAccount();
      navigate("/login");
    } catch {
      setError(t("error_generic"));
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-lg mx-auto px-6 pt-6 pb-16">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm font-bold" style={{ color: "var(--muted)" }}>← {t("back_to_all")}</Link>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </div>

        <h1 className="font-display text-2xl font-bold mt-4" style={{ color: "var(--ink)" }}>{t("settings_title")}</h1>

        <h2 className="font-display font-bold text-sm uppercase tracking-wide mt-6 mb-2" style={{ color: "var(--brand)" }}>{t("settings_account")}</h2>
        <div className="card p-4">
          <div className="font-semibold">{user?.display_name || user?.email}</div>
          <div className="text-sm" style={{ color: "var(--muted)" }}>{user?.email}</div>
        </div>

        <Link to="/privacy" className="block mt-4 text-sm font-semibold" style={{ color: "var(--brand)" }}>
          {t("settings_privacy_link")}
        </Link>

        <div className="card p-4 mt-6">
          <div className="font-display font-bold text-sm" style={{ color: "var(--ink)" }}>{t("settings_export_title")}</div>
          <p className="text-sm mt-1.5 mb-3" style={{ color: "var(--muted)" }}>{t("settings_export_desc")}</p>
          <button onClick={doExport} className="btn-ghost w-full text-sm py-2.5">{t("settings_export_button")}</button>
        </div>

        <div className="rounded-3xl border-2 p-4 mt-4" style={{ background: "var(--hot-soft)", borderColor: "var(--hot-soft)" }}>
          <div className="font-display font-bold text-sm" style={{ color: "var(--hot-dk)" }}>{t("settings_delete_title")}</div>
          <p className="text-sm mt-1.5 mb-3">{t("settings_delete_desc")}</p>

          {error && <p className="text-sm font-semibold mb-2" style={{ color: "var(--hot)" }}>{error}</p>}

          {!confirmingDelete ? (
            <button onClick={() => setConfirmingDelete(true)} className="w-full text-sm py-2.5 rounded-2xl border-2 font-display font-bold" style={{ borderColor: "var(--hot)", color: "var(--hot-dk)" }}>
              {t("settings_delete_button")}
            </button>
          ) : (
            <div>
              <p className="text-sm font-semibold mb-3">{t("settings_delete_confirm")}</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmingDelete(false)} className="btn-ghost flex-1 text-sm py-2.5">{t("settings_cancel")}</button>
                <button onClick={doDelete} className="flex-1 text-sm py-2.5 rounded-2xl font-display font-bold" style={{ background: "var(--hot)", color: "var(--brand-ink)", boxShadow: "0 4px 0 var(--hot-dk)" }}>
                  {t("settings_delete_confirm_button")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
