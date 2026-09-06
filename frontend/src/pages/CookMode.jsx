import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import useAuthStore, { getAuthEpoch } from "../store/useAuthStore";
import {
  getOrStartSession, getSessionRecord, setCurrentStep, setSessionSnapshot,
  setPinnedLessons, setSessionCookLog, completeSession, getOrCreateGuestId,
} from "../store/cookSession";
import { useT } from "../i18n";
import { startSnapshot, readSnapshot } from "../api/snapshots";
import { getLessonByRef } from "../api/lessons";
import { logCook } from "../api/progress";
import { submitReflection } from "../api/reflections";
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
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const language = useSettingsStore((s) => s.language);
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

  const [reflOutcome, setReflOutcome] = useState(null);
  const [reflPracticed, setReflPracticed] = useState(null); // tri-state: null = never touched (§12)
  const [reflConfidence, setReflConfidence] = useState(null);
  const [reflSaving, setReflSaving] = useState(false);
  const [reflError, setReflError] = useState(false);
  const [reflected, setReflected] = useState(false); // true once a reflection was actually submitted (vs. skipped)

  // Idempotency key (#48) for the /cook-log call, resolved (not always
  // minted) once the dish/level/lang/owner identity is known - reused from
  // localStorage on a refresh or remount of an in-progress cook.
  const sessionIdRef = useRef(null);
  const snapshotIdRef = useRef(null);

  useEffect(() => {
    // Clear any previously rendered (possibly premium, possibly another
    // owner's) content immediately.
    setTier(null);
    setSaveError(false);
    setSaving(false);
    setHelpOpen(false);
    setPhase("cooking");
    setCookLog(null);
    setPinnedLessonsState({});
    setReflOutcome(null);
    setReflPracticed(null);
    setReflConfidence(null);
    setReflError(false);
    setReflected(false);

    const requestEpoch = epoch;
    const sessionId = getOrStartSession(ownerId, { dishSlug: slug, level, lang: language, ns });
    sessionIdRef.current = sessionId;
    const record = getSessionRecord(ownerId, sessionId, ns);

    async function load() {
      let content, snapshotId;
      try {
        if (record?.snapshot_id != null) {
          // The one legitimate re-fetch (§1): a resume re-requesting the
          // SAME snapshot_id, never a fresh capture mid-session. Access is
          // re-checked every time regardless.
          const res = await readSnapshot(record.snapshot_id, slug, level, language);
          content = res.content;
          snapshotId = res.snapshot_id;
        } else {
          const res = await startSnapshot(slug, level, language);
          content = res.content;
          snapshotId = res.snapshot_id;
          setSessionSnapshot(ownerId, sessionId, snapshotId, ns);
        }
      } catch {
        // Locked tier (access lapsed or was never granted) or dish/tier gone
        // - same redirect-away behavior as before.
        if (getAuthEpoch() === requestEpoch) navigate(`/dish/${slug}`, { replace: true });
        return;
      }
      if (getAuthEpoch() !== requestEpoch) return; // account changed mid-request

      snapshotIdRef.current = snapshotId;
      setTier(content);

      // A refresh between a successful cook-log save and reflection (§13):
      // resume straight into the reflection screen for the right cook,
      // never re-prompted as if the cook needs re-saving.
      if (record?.cook_log_id) {
        setCookLog({ id: record.cook_log_id });
        setPhase("reflecting");
      } else {
        const stepIds = (content.steps || []).map(stepId);
        const idx = record?.current_step_id ? stepIds.indexOf(record.current_step_id) : -1;
        setStepIdx(idx >= 0 ? idx : 0);
      }

      // Lesson-content pin (§9): captured once at a NEW session's start,
      // never re-fetched live for a resumed one - a resumed session reads
      // exactly what's already pinned on the record.
      let lessons = record?.pinned_lessons;
      if (lessons == null) {
        lessons = {};
        const ids = [...new Set((content.steps || []).map(stepId).filter(Boolean))];
        await Promise.all(ids.map(async (id) => {
          try {
            lessons[id] = await getLessonByRef(slug, level, language, id);
          } catch {
            // No lesson for this step (or not accessible to this requester) - fine, just omit it.
          }
        }));
        setPinnedLessons(ownerId, sessionId, lessons, ns);
      }
      if (getAuthEpoch() !== requestEpoch) return;
      setPinnedLessonsState(lessons);
    }
    load();
  }, [slug, level, language, epoch, ownerId, ns]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (!tier) {
    return <div className="min-h-screen p-8" style={{ background: "var(--bg)", color: "var(--muted)" }}>{t("loading")}</div>;
  }

  if (phase === "reflecting") {
    return (
      <ReflectionScreen
        t={t}
        pinnedLessons={pinnedLessons}
        outcome={reflOutcome} setOutcome={setReflOutcome}
        practiced={reflPracticed} setPracticed={setReflPracticed}
        confidence={reflConfidence} setConfidence={setReflConfidence}
        saving={reflSaving}
        error={reflError}
        onSubmit={() => {
          const primaryLesson = Object.values(pinnedLessons).find(Boolean) || null;
          if (reflOutcome == null && reflPracticed == null && reflConfidence == null) {
            completeSession(ownerId, sessionIdRef.current, ns);
            setPhase("done");
            return;
          }
          setReflSaving(true);
          setReflError(false);
          const payload = { cook_log_id: cookLog.id };
          if (primaryLesson?.skill) payload.skill_slug = primaryLesson.skill;
          if (reflOutcome != null) payload.outcome = reflOutcome;
          if (reflPracticed != null) payload.practiced_skill_confirmed = reflPracticed;
          if (reflConfidence != null) payload.confidence = reflConfidence;
          submitReflection(payload)
            .then(() => {
              setReflSaving(false);
              setReflected(true);
              completeSession(ownerId, sessionIdRef.current, ns);
              setPhase("done");
            })
            .catch(() => {
              setReflSaving(false);
              setReflError(true); // visible retry (§13) - stay on this screen, never navigate forward
            });
        }}
        onSkip={() => {
          completeSession(ownerId, sessionIdRef.current, ns);
          setPhase("done");
        }}
      />
    );
  }

  if (phase === "done") {
    const nextPractice = Object.values(pinnedLessons).find((l) => l?.next_practice)?.next_practice || null;
    return <DoneScreen t={t} isGuest={isGuest} reflected={reflected} nextPractice={nextPractice} dishSlug={slug} />;
  }

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
    attemptFinish();
  };

  // Reattempted by the retry button on failure, reusing the same
  // sessionIdRef - never minting a new one - so a flaky first attempt
  // replays via #48's idempotency key instead of double-logging.
  const attemptFinish = () => {
    setSaveError(false);

    if (isGuest) {
      // §4 guest exception / §K: no server round-trip at all for a guest -
      // this is a client-side branch decided before any request is built,
      // never a call the backend happens to reject.
      completeSession(ownerId, sessionIdRef.current, ns);
      setPhase("done");
      return;
    }

    setSaving(true);
    const requestEpoch = epoch;
    if (!sessionIdRef.current) sessionIdRef.current = crypto.randomUUID();
    logCook(slug, level, sessionIdRef.current, language, snapshotIdRef.current)
      .then((res) => {
        if (getAuthEpoch() !== requestEpoch) { navigate(`/dish/${slug}`); return; }
        setSessionCookLog(ownerId, sessionIdRef.current, res.cook_log.id, ns);
        setCookLog(res.cook_log);
        setSaving(false);
        setPhase("reflecting");
      })
      .catch(() => {
        if (getAuthEpoch() !== requestEpoch) { navigate(`/dish/${slug}`); return; }
        // A real failure (network error, 409 conflict, 5xx) - never treat
        // this like success. Stay on the Finish screen with a visible
        // retry instead of silently losing the cook.
        setSaving(false);
        setSaveError(true);
      });
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
                ? { background: "var(--hot)", color: "var(--brand-ink)" }
                : { background: "var(--basic)", color: "var(--brand-ink)", boxShadow: "0 4px 0 var(--basic-dk)" }
            }
          >
            {timer.done ? `✓ ${t("cook_timer_done")}` : `⏱ ${fmtSecs(timer.left)} · ${t("cook_timer_running")}`}
          </button>
        )}
      </div>

      {saveError && (
        <p className="text-sm font-semibold text-center px-8 mb-2" style={{ color: "var(--hot)" }}>
          {t("error_generic")}
        </p>
      )}
      <div className="flex gap-2.5 px-5 pb-6">
        <button onClick={goBack} className="btn-ghost flex-1" disabled={saving}>← {t("cook_back")}</button>
        <button onClick={saveError ? attemptFinish : goNext} className="btn-primary flex-1" disabled={saving}>
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
        <div className="fixed inset-0 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="card w-full max-w-lg rounded-b-none px-6 pt-5 pb-8" style={{ maxHeight: "80vh", overflowY: "auto" }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{t("cook_help_eyebrow")}</p>
                <h2 className="font-display text-2xl font-bold mt-0.5" style={{ color: "var(--ink)" }}>{lesson.title}</h2>
              </div>
              <button onClick={() => setHelpOpen(false)} className="chip" aria-label={t("cook_help_close")}>✕</button>
            </div>

            <LessonBody body={lesson.body} />

            <Link to={`/lesson/${lesson.slug}`} className="block text-sm font-bold text-center mt-4" style={{ color: "var(--brand)" }}>
              {t("cook_help_see_full_lesson")} →
            </Link>

            <button onClick={() => setHelpOpen(false)} className="btn-primary w-full mt-4">
              {t("cook_help_close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReflectionScreen({ t, pinnedLessons, outcome, setOutcome, practiced, setPracticed, confidence, setConfidence, saving, error, onSubmit, onSkip }) {
  const primaryLesson = Object.values(pinnedLessons).find(Boolean) || null;

  const outcomeOptions = [
    { value: "happy", label: t("reflect_outcome_happy") },
    { value: "mixed", label: t("reflect_outcome_mixed") },
    { value: "need_help", label: t("reflect_outcome_need_help") },
  ];
  const confidenceOptions = [
    { value: "unknown", label: t("reflect_confidence_unknown") },
    { value: "wants_guidance", label: t("reflect_confidence_wants_guidance") },
    { value: "comfortable", label: t("reflect_confidence_comfortable") },
  ];

  return (
    <div className="min-h-screen flex flex-col px-6 pt-8 pb-6" style={{ background: "var(--bg)" }}>
      <h1 className="font-display text-2xl font-bold" style={{ color: "var(--ink)" }}>{t("reflect_title")}</h1>

      <div className="flex gap-2 mt-4">
        {outcomeOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setOutcome(outcome === o.value ? null : o.value)}
            className="flex-1 rounded-2xl border-2 py-3 text-sm font-bold"
            style={{
              borderColor: outcome === o.value ? "var(--brand)" : "var(--line)",
              background: outcome === o.value ? "var(--brand-soft)" : "var(--card)",
              color: "var(--ink)",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {primaryLesson && (
        <label className="card flex items-center gap-3 px-4 py-3.5 mt-5 cursor-pointer">
          <input
            type="checkbox"
            checked={practiced === true}
            onChange={(e) => setPracticed(e.target.checked)}
            className="w-5 h-5"
          />
          <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {t("reflect_practiced_label", { skill: primaryLesson.title })}
          </span>
        </label>
      )}

      <p className="font-display font-bold text-sm mt-6" style={{ color: "var(--ink)" }}>{t("reflect_confidence_title")}</p>
      <div className="flex flex-col gap-2 mt-2">
        {confidenceOptions.map((c) => (
          <button
            key={c.value}
            onClick={() => setConfidence(confidence === c.value ? null : c.value)}
            className="rounded-2xl border-2 py-3 px-4 text-sm font-bold text-left"
            style={{
              borderColor: confidence === c.value ? "var(--brand)" : "var(--line)",
              background: confidence === c.value ? "var(--brand-soft)" : "var(--card)",
              color: "var(--ink)",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {error && (
        <p className="text-sm font-semibold text-center mb-2" style={{ color: "var(--hot)" }}>{t("error_generic")}</p>
      )}
      <button onClick={onSubmit} className="btn-primary mt-2" disabled={saving}>
        {saving ? t("loading") : error ? t("error_retry") : t("reflect_save")}
      </button>
      {!error && (
        <button onClick={onSkip} className="text-sm font-bold text-center mt-3 py-2" style={{ color: "var(--muted)" }} disabled={saving}>
          {t("reflect_skip")}
        </button>
      )}
    </div>
  );
}

// Dish titles aren't part of the lesson's next_practice shape (just
// dish_slug/level/lang/reason, per pilot-fixtures.md §7) - a readable
// fallback display derived straight from the (English, per architecture.md)
// slug rather than a second API round-trip just to show a nicer heading.
const titleizeSlug = (slug) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

function DoneScreen({ t, isGuest, reflected, nextPractice, dishSlug }) {
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

      {nextPractice && !dismissed && (
        <div className="card px-4 py-4 mt-6 max-w-sm w-full text-left">
          <p className="font-display font-bold text-xs uppercase tracking-wide" style={{ color: "var(--brand)" }}>{t("reflect_next_practice_label")}</p>
          <p className="font-display font-semibold mt-1" style={{ color: "var(--ink)" }}>{titleizeSlug(nextPractice.dish_slug)}</p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{stripMd(nextPractice.reason)}</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setDismissed(true)} className="btn-ghost flex-1 text-sm py-2.5">{t("reflect_next_practice_dismiss")}</button>
            <Link to={`/dish/${nextPractice.dish_slug}`} className="btn-primary flex-1 text-sm py-2.5 text-center">{t("reflect_next_practice_cta")}</Link>
          </div>
        </div>
      )}

      <Link to={`/dish/${dishSlug}`} className="btn-ghost mt-6 text-sm py-3 px-6">{t("lesson_back")}</Link>
    </div>
  );
}
