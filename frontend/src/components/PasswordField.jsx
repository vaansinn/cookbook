import { useState } from "react";
import { useT } from "../i18n";

export default function PasswordField({ id, autoComplete, value, onChange, readOnly, minLength }) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const revealLabel = t(visible ? "auth_hide_password" : "auth_show_password");

  return (
    <div>
      <label htmlFor={id} className="block mb-1 text-sm font-semibold">{t("auth_password")}</label>
      <div className="relative">
        <input
          id={id} name="password" className="field pr-14"
          type={visible ? "text" : "password"} autoComplete={autoComplete}
          autoCapitalize="none" spellCheck={false}
          value={value} onChange={onChange} readOnly={readOnly} required minLength={minLength}
          aria-describedby={minLength ? `${id}-hint` : undefined}
        />
        <button
          type="button" aria-label={revealLabel} title={revealLabel} aria-controls={id}
          className="absolute right-0.5 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-xl active:bg-brand-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          style={{ minWidth: 48, minHeight: 48, color: "var(--brand)" }}
          onClick={() => setVisible((shown) => !shown)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
        </button>
      </div>
      {minLength && <p id={`${id}-hint`} className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{t("auth_password_hint", { n: minLength })}</p>}
    </div>
  );
}
