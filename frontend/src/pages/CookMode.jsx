import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import useAuthStore, { getAuthEpoch } from "../store/useAuthStore";
import {
  getOrStartSession, getSessionRecord, setCurrentStep, setSessionSnapshot,
  setSessionCookLog, completeSession, getOrCreateGuestId,
} from "../store/cookSession";
import { useT } from "../i18n";
import { startSnapshot, readSnapshot } from "../api/snapshots";
import ReflectionEditor from "../components/ReflectionEditor";
import HelpDialog from "../components/HelpDialog";
import { createRequestScope } from "../utils/requestScope";
import { logCook } from "../api/progress";
import { parseSeconds, fmtSecs, beep } from "../utils/timer";
import LessonBody, { stripMd } from "../components/LessonBody";

// Cook Mode - the step-by-step cook flow, contextual help (pilot-fixtures.md
// §2/§9/§11) and the post-Finish reflection/next-practice screen (§3/§7/§10/
// §12/§13). Signed-in and guest (Basic-only, §5/§8) share this component;
// the guest branch skips POST /api/cook-log and any reflection call
// entirely (§4's guest exception, §K) - a client-side routing decision made
// before any request is built, never a call the backend happens to reject.

function stepText(step) {
  return typeof step === "object" && step ? step.text : step;
}
function stepId(step) {
  return typeof step === "object" && step ? step.id : null;
}

export default function CookMode() {
  const initialized = useAuthStore((s) => s.initialized);
  const epoch = useAuthStore((s) => s.epoch);
  const userId = useAuthStore((s) => s.user?.id);
  const { slug } = useParams();
  const [params] = useSearchParams();
  const settingsLanguage = useSettingsStore((s) => s.language);
  const t = useT();
  if (!initialized) return <p className="p-8">{t("loading")}</p>;
  return <CookAttempt key={`${epoch}:${userId}:${slug}:${params.get("level")}:${params.get("attempt")}:${params.get("lang") || settingsLanguage}`} />;
}

function CookAttempt() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const settingsLanguage = useSettingsStore((s) => s.language);
  const language = ["en", "de"].includes(params.get("lang")) ? params.get("lang") : settingsLanguage;
  const epoch = useAuthStore((s) => s.epoch);
  const user = useAuthStore((s) => s.user);
  const level = params.get("level") || "basic";
  const serves = parseInt(params.get("serves"), 10) || 2;

  const isGuest = !user;
  const ns = isGuest ? "guest" : "account";
  // getOrCreateGuestId() persists (and reuses) a fixed guest id (pilot-
  // fixtures.md §8) - memoized so it isn't re-derived every render, only
  // when the guest/account boundary itself changes.
  const ownerId = useMemo(() => (isGuest ? getOrCreateGuestId() : user?.id), [isGuest, user?.id]);

  const [tier, setTier] = useState(null); // pinned snapshot content: {title, steps, notes, ...}
  const [stepIdx, setStepIdx] = useState(0);
  const [timer, setTimer] = useState(null); // { total, left, running, done }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pinnedLessons, setPinnedLessonsState] = useState({}); // step_id -> lesson dict

  // "cooking" (step flow, incl. the Finish button) -> "reflecting" (signed-in
  // only, after a successful save) -> "done" (next-practice + exit, for both
  // guests and signed-in users, reached either via reflection or the skip/
  // guest-finish path).
  const [phase, setPhase] = useState("cooking");
  const [cookLog, setCookLog] = useState(null);

  const [reflected, setReflected] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [legacy, setLegacy] = useState(false);
  const scopeRef = useRef(null);

  // Idempotency key (#48) for the /cook-log call, resolved (not always
  // minted) once the dish/level/lang/owner identity is known - reused from
  // localStorage on a refresh or remount of an in-progress cook.
  const sessionIdRef = useRef(null);
  const snapshotIdRef = useRef(null);

  useEffect(() => {
    const scope = createRequestScope(() => getAuthEpoch() === epoch);
    scopeRef.current = scope;
    setTier(null); setLoadError(false); setSaveError(false); setSaving(false);
    setTimer(null); setStepIdx(0); setHelpOpen(false); setPhase("cooking");
    setCookLog(null); setPinnedLessonsState({}); setReflected(false);
    const sessionId = getOrStartSession(ownerId, { dishSlug: slug, level, lang: language, ns, attemptId: params.get("attempt") });
    sessionIdRef.current = sessionId;
    if (params.get("attempt") !== sessionId) {
      navigate(`/dish/${slug}/cook?level=${level}&lang=${language}&serves=${serves}&attempt=${sessionId}`, { replace: true });
      return scope.cancel;
    }
    const record = getSessionRecord(ownerId, sessionId, ns);
    const unknown = record?.snapshot_id == null && record?.capture_pending !== true;
    setLegacy(unknown);
    snapshotIdRef.current = record?.snapshot_id ?? null;
    if (unknown) {
      if (record?.cook_log_id) { setCookLog({ id: record.cook_log_id }); setPhase("reflecting"); }
      return scope.cancel;
    }
    async function load() {
      try {
        const res = record?.snapshot_id != null
          ? await readSnapshot(record.snapshot_id, slug, level, language, scope.signal)
          : await startSnapshot(slug, level, language, scope.signal);
        if (!scope.current()) return;
        setSessionSnapshot(ownerId, sessionId, res.snapshot_id, ns);
        snapshotIdRef.current = res.snapshot_id;
        setTier(res.content);
        setPinnedLessonsState(res.content.lessons || {});
        if (record?.cook_log_id) { setCookLog({ id: record.cook_log_id }); setPhase("reflecting"); }
        const idx = record?.current_step_id ? (res.content.steps || []).map(stepId).indexOf(record.current_step_id) : -1;
        setStepIdx(idx >= 0 ? idx : 0);
      } catch {
        if (scope.current()) setLoadError(true);
      }
    }
    load();
    return scope.cancel;
  }, [slug, level, language, epoch, ownerId, ns, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    const id = getOrStartSession(ownerId, { dishSlug: slug, level, lang: language, ns, forceNew: true });
    navigate(`/dish/${slug}/cook?level=${level}&lang=${language}&serves=${serves}&attempt=${id}`, { replace: true });
  };
  const finish = async () => {
    const scope = scopeRef.current;
    const sessionId = sessionIdRef.current;
    if (!scope?.current() || saving) return;
    setSaveError(false); setSaving(true);
    try {
      if (!isGuest) {
        const result = await logCook(slug, level, sessionId, language, snapshotIdRef.current);
        if (!scope.current()) return;
        setSessionCookLog(ownerId, sessionId, result.cook_log.id, ns);
        setCookLog(result.cook_log); setPhase("reflecting");
      } else {
        completeSession(ownerId, sessionId, ns); setPhase("done");
      }
    } catch { if (scope.current()) setSaveError(true); }
    finally { if (scope.current()) setSaving(false); }
  };

  useEffect(() => {
    if (!timer || !timer.running) return;
    const iv = setInterval(() => {
      setTimer((tm) => {
        if (!tm) return tm;
        const left = tm.left - 1;
        if (left <= 0) {
          beep();
          if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
          return { ...tm, left: 0, running: false, done: true };
        }
        return { ...tm, left };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [timer?.running]);

  useEffect(() => {
    // Wake lock: keep the screen on while cooking (falls back silently if unsupported)
    let lock;
    if ("wakeLock" in navigator) {
      navigator.wakeLock.request("screen").then((l) => (lock = l)).catch(() => {});
    }
    return () => lock?.release?.().catch(() => {});
  }, []);

  if (phase === "reflecting") {
    const sessionId = sessionIdRef.current;
    const done = async (result) => {
      if (!scopeRef.current?.current()) return;
      setReflected(result?.status && result.status !== "skipped");
      completeSession(ownerId, sessionId, ns);
      setPhase("done");
    };
    return <div className="min-h-screen p-6 max-w-lg mx-auto"><ReflectionEditor cookLogId={cookLog.id} onDone={done} onContinue={() => done(null)} /></div>;
  }
  if (phase === "done") {
    return <DoneScreen t={t} isGuest={isGuest} reflected={reflected} dishSlug={slug}
      snapshotId={snapshotIdRef.current} level={level} language={language} />;
  }
  if (legacy) return <div className="min-h-screen p-8 flex flex-col gap-4">
    <p>{t("source_unknown")}</p>
    <button className="btn-primary" onClick={restart}>{t("cook_start_over")}</button>
    <button className="btn-ghost" disabled={saving} onClick={finish}>{t(saving ? "loading" : "legacy_finish")}</button>
    {saveError && <p role="alert">{t("error_generic")}</p>}
  </div>;
  if (!tier) return <div className="min-h-screen p-8">
    <p role="status">{t(loadError ? "snapshot_load_error" : "loading")}</p>
    {loadError && <button className="btn-primary mt-4" onClick={() => setReload((n) => n + 1)}>{t("error_retry")}</button>}
    <Link className="btn-ghost block mt-4" to={`/dish/${slug}`}>{t("lesson_back")}</Link>
  </div>;

  const step = tier.steps[stepIdx];
  const text = stepText(step);
  const sid = stepId(step);
  const secs = parseSeconds(text);
  const lesson = sid ? pinnedLessons[sid] : null;

  const startTimer = () => setTimer({ total: secs, left: secs, running: true, done: false });
  const toggleTimer = () => setTimer((tm) => (tm ? { ...tm, running: !tm.running } : null));

  const persistStep = (idx) => {
    const s = tier.steps[idx];
    setCurrentStep(ownerId, sessionIdRef.current, stepId(s), ns);
  };

  const goNext = () => {
    setTimer(null);
    if (stepIdx < tier.steps.length - 1) {
      const next = stepIdx + 1;
      setStepIdx(next);
      persistStep(next);
      return;
    }
    finish();
  };

  const goBack = () => {
    setTimer(null);
    if (stepIdx > 0) {
      const prev = stepIdx - 1;
      setStepIdx(prev);
      persistStep(prev);
    } else navigate(`/dish/${slug}`);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {tier.schema_version !== 2 && <p className="px-5 pt-3 text-sm">{t("teaching_unavailable")}</p>}
      <button className="chip self-end m-3" onClick={restart}>{t("cook_start_over")}</button>
      <div className="flex items-center justify-between px-5 pt-5">
        <button onClick={() => navigate(`/dish/${slug}`)} className="chip">✕ {t("cook_exit")}</button>
        <div className="flex gap-1 flex-1 mx-4">
          {tier.steps.map((_, i) => (
            <span
              key={i}
              className="flex-1 h-1.5 rounded"
              style={{ background: i <= stepIdx ? "var(--brand)" : "var(--line)" }}
            />
          ))}
        </div>
        <span className="chip">{serves} {t("serves")}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="text-xs font-bold tracking-wide" style={{ color: "var(--muted)" }}>
          {t("cook_step_of", { i: stepIdx + 1, n: tier.steps.length })}
        </div>
        <div className="font-display font-extrabold" style={{ fontSize: "60px", color: "var(--brand)", lineHeight: 1 }}>
          {stepIdx + 1}
        </div>
        <p className="font-display text-xl font-semibold mt-2" style={{ color: "var(--ink)" }}>
          {text}
        </p>

        {lesson && (
          <button
            onClick={() => setHelpOpen(true)}
            className="mt-5 rounded-full px-5 py-2.5 font-bold text-sm border-2"
            style={{ background: "var(--card)", borderColor: "var(--brand)", color: "var(--brand)" }}
          >
            💡 {t("cook_help_cta")}
          </button>
        )}

        {secs && !timer && (
          <button onClick={startTimer} className="mt-6 rounded-full px-5 py-2.5 font-bold text-sm" style={{ background: "var(--basic)", color: "var(--brand-ink)", boxShadow: "0 4px 0 var(--basic-dk)" }}>
            ⏱ {Math.round(secs / 60)} min
          </button>
        )}
        {timer && (
          <button
            onClick={toggleTimer}
            className="mt-6 rounded-full px-5 py-2.5 font-bold text-sm"
            style={
              timer.done
                ? { background: "var(--attention)", color: "var(--attention-ink)" }
                : { background: "var(--basic)", color: "var(--brand-ink)", boxShadow: "0 4px 0 var(--basic-dk)" }
            }
          >
            {timer.done ? `✓ ${t("cook_timer_done")}` : `⏱ ${fmtSecs(timer.left)} · ${t("cook_timer_running")}`}
          </button>
        )}
      </div>

      {saveError && (
        <p className="text-sm font-semibold text-center px-8 mb-2" style={{ color: "var(--danger)" }}>
          {t("error_generic")}
        </p>
      )}
      <div className="flex gap-2.5 px-5 pb-6">
        <button onClick={goBack} className="btn-ghost flex-1" disabled={saving}>← {t("cook_back")}</button>
        <button onClick={saveError ? finish : goNext} className="btn-primary flex-1" disabled={saving}>
          {saving
            ? t("loading")
            : saveError
            ? t("error_retry")
            : stepIdx < tier.steps.length - 1
            ? `${t("cook_next")} →`
            : t("cook_finish")}
        </button>
      </div>

      {helpOpen && lesson && (
        <HelpDialog onClose={() => setHelpOpen(false)}>
          <div className="card w-full max-w-lg rounded-b-none px-6 pt-5 pb-8" style={{ maxHeight: "80vh", overflowY: "auto" }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{t("cook_help_eyebrow")}</p>
                <h2 id="cook-help-title" className="font-display text-2xl font-bold mt-0.5" style={{ color: "var(--ink)" }}>{lesson.title}</h2>
              </div>
              <button onClick={() => setHelpOpen(false)} className="chip" aria-label={t("cook_help_close")}>✕</button>
            </div>

            <LessonBody body={lesson.body} />

            <Link to={`/lesson/${lesson.slug}?snapshot=${snapshotIdRef.current}&dish_slug=${slug}&level=${level}&lang=${language}&attempt=${sessionIdRef.current}`} className="block text-sm font-bold text-center mt-4" style={{ color: "var(--brand)" }}>
              {t("cook_help_see_full_lesson")} →
            </Link>

            <button onClick={() => setHelpOpen(false)} className="btn-primary w-full mt-4">
              {t("cook_help_close")}
            </button>
          </div>
        </HelpDialog>
      )}
    </div>
  );
}

// Dish titles aren't part of the lesson's next_practice shape (just
// dish_slug/level/lang/reason, per pilot-fixtures.md §7) - a readable
// fallback display derived straight from the (English, per architecture.md)
// slug rather than a second API round-trip just to show a nicer heading.
const titleizeSlug = (slug) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

function DoneScreen({ t, isGuest, reflected, dishSlug, snapshotId, level, language }) {
  const [nextPractice, setNextPractice] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const epoch = useAuthStore((s) => s.epoch);
  useEffect(() => {
    const scope = createRequestScope(() => getAuthEpoch() === epoch);
    setNextPractice(null); setFailed(false);
    if (snapshotId) readSnapshot(snapshotId, dishSlug, level, language, scope.signal)
      .then((res) => { if (scope.current()) setNextPractice(res.next_practice); })
      .catch(() => { if (scope.current()) setFailed(true); });
    return scope.cancel;
  }, [snapshotId, dishSlug, level, language, epoch, retry]);
  const [dismissed, setDismissed] = useState(false);
  const heading = isGuest ? t("guest_cook_done_title") : reflected ? t("reflect_saved") : t("cooked_logged");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-8" style={{ background: "var(--bg)" }}>
      <div className="text-5xl">🎉</div>
      <p className="font-display text-xl font-bold mt-3" style={{ color: "var(--ink)" }}>{heading}</p>

      {isGuest && (
        <p className="text-sm mt-2 max-w-sm" style={{ color: "var(--muted)" }}>
          {t("guest_cook_done_hint")}{" "}
          <Link to="/register" style={{ color: "var(--brand)", textDecoration: "underline" }}>{t("list_add_setup_link")}</Link>
        </p>
      )}

      {failed && <button className="btn-ghost mt-4" onClick={() => setRetry((n) => n + 1)}>{t("error_retry")}</button>}
      {nextPractice && !dismissed && (
        <div className="card px-4 py-4 mt-6 max-w-sm w-full text-left">
          <p className="font-display font-bold text-xs uppercase tracking-wide" style={{ color: "var(--brand)" }}>{t("reflect_next_practice_label")}</p>
          <p className="font-display font-semibold mt-1" style={{ color: "var(--ink)" }}>{titleizeSlug(nextPractice.dish_slug)}</p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{stripMd(nextPractice.reason)}</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setDismissed(true)} className="btn-ghost flex-1 text-sm py-2.5">{t("reflect_next_practice_dismiss")}</button>
            <Link to={`/dish/${nextPractice.dish_slug}?level=${nextPractice.level}&lang=${nextPractice.lang}`} className="btn-primary flex-1 text-sm py-2.5 text-center">{t("reflect_next_practice_cta")}</Link>
          </div>
        </div>
      )}

      <Link to={`/dish/${dishSlug}`} className="btn-ghost mt-6 text-sm py-3 px-6">{t("lesson_back")}</Link>
    </div>
  );
}
