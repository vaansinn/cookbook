import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import useAuthStore from "../store/useAuthStore";
import {
  getOrStartSession, getSessionRecord, setCurrentStep, setSessionSnapshot,
  setSessionCookLog, completeSession, getOrCreateGuestId,
  getSessionTimer, setSessionTimer,
} from "../store/cookSession";
import { useT } from "../i18n";
import { startSnapshot, readSnapshot } from "../api/snapshots";
import ReflectionEditor from "../components/ReflectionEditor";
import HelpDialog from "../components/HelpDialog";
import { logCook } from "../api/progress";
import { parseSeconds, fmtSecs } from "../utils/timer";
import { createCookTimerController, manageCookWakeLock, playCookTimerAlarm, cookAuthKey, createCookAuthScope, MAX_TIMER_MS } from "../utils/cookTimer.mjs";
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
// Earlier pinned snapshots can contain string steps. Their immutable position
// is the identity fallback; never bind a timer to the currently visible index.
const timerStepId = (step, index) => stepId(step) || `legacy-step:${index}`;

function CookTimerPanel({ state, controller, steps, stepIdx = 0, t }) {
  const { timer, blocked, error, remaining, saving: timerSaving } = state;
  const step = steps?.[stepIdx], text = stepText(step);
  const secs = typeof text === "string" ? parseSeconds(text) : null;
  const eligible = secs && secs * 1000 <= MAX_TIMER_MS;
  const originIdx = timer ? steps?.findIndex((value, index) => timerStepId(value, index) === timer.stepId) ?? -1 : -1;
  const origin = originIdx >= 0 ? t("cook_timer_origin", { step: originIdx + 1 }) : t("cook_timer_origin_pending");
  const start = () => controller.current?.start(timerStepId(step, stepIdx), secs);
  return <>
    {eligible && !timer && !blocked && <button onClick={start} aria-label={t("cook_timer_start", { time: fmtSecs(secs) })} className="mt-6 rounded-full px-5 py-2.5 font-bold text-sm" style={{ background: "var(--basic)", color: "var(--brand-ink)", boxShadow: "0 4px 0 var(--basic-dk)" }}>
      ⏱ {Math.round(secs / 60)} min
    </button>}
    {timer && <section className="mt-6 text-sm" aria-label={origin}>
      <p style={{ color: "var(--muted)" }}>{origin}</p>
      <p className="rounded-full px-5 py-2.5 font-bold tabular-nums" role={timer.status === "elapsed" ? "status" : "timer"}
        style={timer.status === "elapsed" ? { background: "var(--attention)", color: "var(--attention-ink)" } : { background: "var(--basic)", color: "var(--brand-ink)" }}>
        {timer.status === "elapsed" ? t("cook_timer_done") : `${fmtSecs(Math.ceil(remaining / 1000))} · ${t(timer.status === "paused" ? "cook_timer_paused" : "cook_timer_active")}`}
      </p>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {timer.status !== "elapsed" && <button className="chip" disabled={blocked} onClick={() => timer.status === "running" ? controller.current?.pause() : controller.current?.resume()}>{t(timer.status === "running" ? "cook_timer_pause" : "cook_timer_resume")}</button>}
        <button className="chip" disabled={blocked} onClick={() => controller.current?.cancel()}>{t("cook_timer_cancel")}</button>
        {timer.status === "elapsed" && eligible && <button className="chip" disabled={blocked} onClick={start}>{t("cook_timer_new")}</button>}
      </div>
    </section>}
    {timerSaving && <p role="status" className="text-sm mt-2">{t("cook_timer_saving")}</p>}
    {timer?.clockNotice && <p role="alert" className="text-sm mt-2">{t("cook_timer_clock_changed")}</p>}
    {error && <div role="alert" className="text-sm mt-2">
      <p>{t(error === "storage" ? (blocked && !timerSaving ? "cook_timer_storage_read" : "cook_timer_storage_write") : error === "finished" ? "cook_timer_finished" : error === "changed" ? "cook_timer_changed" : error === "corrupt" ? "cook_timer_corrupt" : ["coordination", "busy"].includes(error) ? "cook_timer_coordination" : "cook_timer_missing")}</p>
      {error !== "finished" && <button className="chip mt-2" onClick={() => controller.current?.retry()}>{t("cook_timer_retry")}</button>}
      {error === "corrupt" && <button className="chip mt-2" onClick={() => controller.current?.reset()}>{t("cook_timer_reset")}</button>}
    </div>}
    {(timer || eligible) && <p className="text-xs mt-2 max-w-sm" style={{ color: "var(--muted)" }}>{t("cook_timer_background")}</p>}
    {secs && !eligible && <p className="text-sm mt-2">{t("cook_timer_limit")}</p>}
  </>;
}

export default function CookMode() {
  const initialized = useAuthStore((s) => s.initialized);
  const authKey = useAuthStore(cookAuthKey);
  const { slug } = useParams();
  const [params] = useSearchParams();
  const settingsLanguage = useSettingsStore((s) => s.language);
  const t = useT();
  if (!initialized) return <p className="p-8">{t("loading")}</p>;
  return <CookAttempt key={`${authKey}:${slug}:${params.get("level")}:${params.get("attempt")}:${params.get("lang") || settingsLanguage}`} />;
}

function CookAttempt() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const settingsLanguage = useSettingsStore((s) => s.language);
  const language = ["en", "de"].includes(params.get("lang")) ? params.get("lang") : settingsLanguage;
  const authKey = useAuthStore(cookAuthKey);
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
  const [timerState, setTimerState] = useState({ timer: null, error: null, blocked: true, remaining: 0 });
  const timerController = useRef(null);
  const timerSteps = useRef(null);
  timerSteps.current = tier ? (tier.steps || []).map(timerStepId) : null;
  const [wakeStatus, setWakeStatus] = useState("inactive");
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
    const scope = createCookAuthScope(useAuthStore);
    scopeRef.current = scope;
    setTier(null); setLoadError(false); setSaveError(false); setSaving(false);
    setStepIdx(0); setHelpOpen(false); setPhase("cooking");
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
        let res = record?.snapshot_id != null
          ? await readSnapshot(record.snapshot_id, slug, level, language, scope.signal)
          : await startSnapshot(slug, level, language, scope.signal);
        if (!scope.current()) return;
        let pin = await setSessionSnapshot(ownerId, sessionId, res.snapshot_id, ns, { requireLock: true });
        if (!scope.current()) return;
        if (!pin?.ok) throw new Error('snapshot_pin_unconfirmed');
        if (pin.snapshot_id !== res.snapshot_id) {
          // Another tab won the pin. Never display our losing capture or use
          // its lesson/step identities; authorize/read the persisted winner.
          res = await readSnapshot(pin.snapshot_id, slug, level, language, scope.signal);
          if (!scope.current()) return;
          if (res.snapshot_id !== pin.snapshot_id) throw new Error('snapshot_winner_mismatch');
          pin = await setSessionSnapshot(ownerId, sessionId, res.snapshot_id, ns, { requireLock: true });
          if (!scope.current()) return;
          if (!pin?.ok || pin.snapshot_id !== res.snapshot_id) throw new Error('snapshot_pin_unconfirmed');
        }
        snapshotIdRef.current = pin.snapshot_id;
        setTier(res.content);
        setPinnedLessonsState(res.content.lessons || {});
        if (pin.cook_log_id) { setCookLog({ id: pin.cook_log_id }); setPhase("reflecting"); }
        const idx = pin.current_step_id ? (res.content.steps || []).map(stepId).indexOf(pin.current_step_id) : -1;
        setStepIdx(idx >= 0 ? idx : 0);
      } catch {
        if (scope.current()) setLoadError(true);
      }
    }
    load();
    return scope.cancel;
  }, [slug, level, language, authKey, ownerId, ns, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const restart = () => {
    if (!scopeRef.current?.current()) return;
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
        await setSessionCookLog(ownerId, sessionId, result.cook_log.id, ns);
        if (!scope.current()) return;
        setCookLog(result.cook_log); setPhase("reflecting");
      } else {
        await completeSession(ownerId, sessionId, ns);
        if (scope.current()) setPhase("done");
      }
    } catch { if (scope.current()) setSaveError(true); }
    finally { if (scope.current()) setSaving(false); }
  };

  useEffect(() => {
    if (phase !== "cooking" || params.get("attempt") !== sessionIdRef.current) return;
    const sessionId = sessionIdRef.current;
    // A saved cook may still be loading its reflection snapshot. It is no
    // longer active cooking, even before that request updates the visible phase.
    if (getSessionRecord(ownerId, sessionId, ns)?.cook_log_id) return;
    let closeAlarm;
    // Independent of snapshot requests/retries; captured exact attempt identity.
    // A new mutable request scope must never make this controller current again.
    const timerScope = createCookAuthScope(useAuthStore, () => sessionIdRef.current === sessionId && (ns === "guest"
      ? !useAuthStore.getState().user : String(useAuthStore.getState().user?.id) === String(ownerId)));
    const current = timerScope.current;
    const controller = createCookTimerController({
      read: () => getSessionTimer(ownerId, sessionId, ns),
      write: (value, options) => setSessionTimer(ownerId, sessionId, value, ns, options),
      stepIds: () => timerSteps.current, current, onChange: setTimerState,
      onElapsed: () => {
        if (document.visibilityState !== "visible") return;
        closeAlarm?.(); closeAlarm = playCookTimerAlarm();
        try { navigator.vibrate?.([300, 150, 300]); } catch { /* optional feedback */ }
      },
    });
    timerController.current = controller;
    controller.load();
    const iv = setInterval(() => controller.tick(), 250);
    const reconcile = () => controller.tick(true);
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("pagehide", reconcile);
    return () => {
      timerScope.cancel(); controller.dispose(); timerController.current = null; clearInterval(iv); closeAlarm?.();
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("pagehide", reconcile);
    };
  }, [phase, ownerId, ns, authKey, slug, level, language, params.get("attempt")]); // Independent of snapshot fetch/retry.

  useEffect(() => {
    if (!tier || phase !== "cooking" || timerState.error === "finished") return;
    const originScope = scopeRef.current;
    return manageCookWakeLock({ onStatus: setWakeStatus, current: () => originScope?.current() });
  }, [tier, phase, authKey, timerState.error === "finished"]);

  if (phase === "reflecting") {
    const sessionId = sessionIdRef.current;
    const done = async (result) => {
      const originScope = scopeRef.current;
      if (!originScope?.current()) return;
      await completeSession(ownerId, sessionId, ns);
      if (!originScope.current()) return;
      setReflected(result?.status && result.status !== "skipped"); setPhase("done");
    };
    return <div className="min-h-screen p-6 max-w-lg mx-auto"><ReflectionEditor cookLogId={cookLog.id} onDone={done} onContinue={() => done(null)} /></div>;
  }
  if (phase === "done") {
    return <DoneScreen t={t} isGuest={isGuest} reflected={reflected} dishSlug={slug}
      snapshotId={snapshotIdRef.current} level={level} language={language} />;
  }
  if (legacy) return <div className="min-h-screen p-8 flex flex-col gap-4">
    <p>{t("source_unknown")}</p>
    <CookTimerPanel state={timerState} controller={timerController} t={t} />
    <button className="btn-primary" onClick={restart}>{t("cook_start_over")}</button>
    <button className="btn-ghost" disabled={saving} onClick={finish}>{t(saving ? "loading" : "legacy_finish")}</button>
    {saveError && <p role="alert">{t("error_generic")}</p>}
  </div>;
  if (!tier) return <div className="min-h-screen p-8">
    <p role="status">{t(loadError ? "snapshot_load_error" : "loading")}</p>
    <CookTimerPanel state={timerState} controller={timerController} t={t} />
    {loadError && <button className="btn-primary mt-4" onClick={() => setReload((n) => n + 1)}>{t("error_retry")}</button>}
    <Link className="btn-ghost block mt-4" to={`/dish/${slug}`}>{t("lesson_back")}</Link>
  </div>;

  const step = tier.steps[stepIdx];
  const text = stepText(step);
  const sid = stepId(step);
  const lesson = sid ? pinnedLessons[sid] : null;

  const persistStep = (idx) => {
    if (!scopeRef.current?.current()) return;
    const s = tier.steps[idx];
    setCurrentStep(ownerId, sessionIdRef.current, stepId(s), ns);
  };

  const goNext = () => {
    if (!scopeRef.current?.current()) return;
    if (stepIdx < tier.steps.length - 1) {
      const next = stepIdx + 1;
      setStepIdx(next);
      persistStep(next);
      return;
    }
    finish();
  };

  const goBack = () => {
    if (!scopeRef.current?.current()) return;
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

        <CookTimerPanel state={timerState} controller={timerController} steps={tier.steps} stepIdx={stepIdx} t={t} />
        <p role="status" className="text-xs mt-2" style={{ color: "var(--muted)" }}>{t(`cook_wakelock_${wakeStatus}`)}</p>
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
  const authKey = useAuthStore(cookAuthKey);
  useEffect(() => {
    const scope = createCookAuthScope(useAuthStore);
    setNextPractice(null); setFailed(false);
    if (snapshotId) readSnapshot(snapshotId, dishSlug, level, language, scope.signal)
      .then((res) => { if (scope.current()) setNextPractice(res.next_practice); })
      .catch(() => { if (scope.current()) setFailed(true); });
    return scope.cancel;
  }, [snapshotId, dishSlug, level, language, authKey, retry]);
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
