import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import useAuthStore, { getAuthEpoch } from "../store/useAuthStore";
import { getReflection, submitReflection } from "../api/reflections";
import { createRequestScope } from "../utils/requestScope";

// Used both immediately after cooking and for corrections from History.
// Ambiguous writes retain their exact payload+UUID, including after refresh.
export default function ReflectionEditor({ cookLogId, onDone, onContinue }) {
  const t = useT();
  const userId = useAuthStore((s) => s.user?.id);
  const epoch = useAuthStore((s) => s.epoch);
  const identity = `${epoch}:${userId}:${cookLogId}`;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const scopeRef = useRef(null);
  const titleRef = useRef(null);
  const [row, setRow] = useState(null);
  const [draft, setDraft] = useState({});
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const storageKey = `reflection_pending:${userId}:${cookLogId}`;
  const persist = (value) => {
    try { value ? localStorage.setItem(storageKey, JSON.stringify(value)) : localStorage.removeItem(storageKey); } catch { /* current-page retry remains available */ }
    setPending(value);
  };
  useEffect(() => {
    const scope = createRequestScope(() => currentIdentity.current === identity && getAuthEpoch() === epoch);
    scopeRef.current = scope;
    setRow(null); setDraft({}); setError(null); setBusy(false);
    try { setPending(JSON.parse(localStorage.getItem(storageKey) || "null")); } catch { setPending(null); }
    if (userId) getReflection(cookLogId, scope.signal).then((data) => {
      if (!scope.current()) return;
      setRow(data); titleRef.current?.focus();
    }).catch(() => { if (scope.current()) setError("load"); });
    return scope.cancel;
  }, [identity, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const scope = scopeRef.current;
    if (!row || busy || !scope?.current()) return;
    if (!pending && Object.keys(draft).length === 0) { onContinue(); return; }
    const payload = pending || { cook_log_id: cookLogId, mutation_id: crypto.randomUUID(), expected_revision: row.revision, ...draft };
    persist(payload); setBusy(true); setError(null);
    try {
      const result = await submitReflection(payload);
      if (!scope.current()) return;
      persist(null); setBusy(false); onDone(result);
    } catch (err) {
      if (!scope.current()) return;
      setBusy(false);
      if (err.response?.status === 409 && err.response.data.current_reflection) {
        persist(null); setRow(err.response.data.current_reflection); setDraft({}); setError("conflict");
      } else if (err.response?.status === 400 || err.response?.status === 409) {
        persist(null); setError("invalid");
      } else setError("save");
    }
  };
  const value = (field) => field in draft ? draft[field] : row?.[field] ?? null;
  const choose = (field, next) => setDraft((old) => ({ ...old, [field]: next }));
  return (
    <section className="card p-5 my-4" aria-labelledby={`reflection-${cookLogId}`}>
      <h2 ref={titleRef} tabIndex={-1} id={`reflection-${cookLogId}`} className="font-display text-2xl font-bold">{t("reflect_title")}</h2>
      {!row && <p role="status">{t(error ? "error_generic" : "loading")}</p>}
      {row && <>
        {!row.focus_skill && <p className="text-sm mt-2">{t("teaching_unavailable")}</p>}
        <fieldset disabled={busy || !!pending} className="mt-4 flex flex-col gap-4">
          <label className="font-bold text-sm">{t("reflection_outcome_label")}
            <select className="btn-ghost w-full mt-2" value={value("outcome") || ""} onChange={(e) => choose("outcome", e.target.value || null)}>
              <option value="">{t("reflection_unanswered")}</option>
              {["happy", "mixed", "need_help"].map((v) => <option key={v} value={v}>{t(`reflect_outcome_${v}`)}</option>)}
            </select>
          </label>
          {row.focus_skill && <>
            <label className="font-bold text-sm">{t("reflect_practiced_label", { skill: row.focus_skill === "simmering" ? t("skill_simmering") : row.focus_skill })}
              <select className="btn-ghost w-full mt-2" value={value("practiced_skill_confirmed") === null ? "" : String(value("practiced_skill_confirmed"))} onChange={(e) => choose("practiced_skill_confirmed", e.target.value === "" ? null : e.target.value === "true")}>
                <option value="">{t("reflection_unanswered")}</option><option value="true">{t("reflection_yes")}</option><option value="false">{t("reflection_no")}</option>
              </select>
            </label>
            <label className="font-bold text-sm">{t("reflect_confidence_title")}
              <select className="btn-ghost w-full mt-2" value={value("confidence") || ""} onChange={(e) => choose("confidence", e.target.value || null)}>
                <option value="">{t("reflection_unanswered")}</option>
                {["unknown", "wants_guidance", "comfortable"].map((v) => <option key={v} value={v}>{t(`reflect_confidence_${v}`)}</option>)}
              </select>
            </label>
          </>}
        </fieldset>
      </>}
      {(error || pending) && <p role="alert" className="text-sm mt-4" style={{ color: "var(--hot)" }}>{t(error === "conflict" ? "reflection_conflict" : pending ? "reflection_ambiguous" : "error_generic")}</p>}
      <div className="flex flex-col gap-3 mt-5">
        {row ? <button className="btn-primary" disabled={busy} onClick={save}>{t(busy ? "loading" : pending ? "error_retry" : "reflect_save")}</button> : <button className="btn-ghost" onClick={() => setReload((n) => n + 1)}>{t("error_retry")}</button>}
        <button className="btn-ghost" disabled={busy} onClick={onContinue}>{t("reflection_continue")}</button>
      </div>
    </section>
  );
}
