import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import useSettingsStore from "../store/useSettingsStore";
import { useT } from "../i18n";
import { fetchDish } from "../api/recipes";
import { logCook } from "../api/progress";
import { parseSeconds, fmtSecs, beep } from "../utils/timer";

export default function CookMode() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const level = params.get("level") || "basic";
  const serves = parseInt(params.get("serves"), 10) || 2;

  const [tier, setTier] = useState(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [timer, setTimer] = useState(null); // { total, left, running, done }

  useEffect(() => {
    fetchDish(slug, language).then((d) => setTier(d.tiers[level]));
  }, [slug, level, language]);

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

  const step = tier.steps[stepIdx];
  const secs = parseSeconds(step);

  const startTimer = () => setTimer({ total: secs, left: secs, running: true, done: false });
  const toggleTimer = () => setTimer((tm) => (tm ? { ...tm, running: !tm.running } : null));

  const goNext = () => {
    setTimer(null);
    if (stepIdx < tier.steps.length - 1) {
      setStepIdx((i) => i + 1);
      return;
    }
    logCook(slug, level)
      .then((res) => navigate(`/dish/${slug}`, { state: { cooked: true, newBadges: res.new_badges } }))
      .catch(() => navigate(`/dish/${slug}`));
  };
  const goBack = () => {
    setTimer(null);
    if (stepIdx > 0) setStepIdx((i) => i - 1);
    else navigate(`/dish/${slug}`);
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
          {step}
        </p>

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

      <div className="flex gap-2.5 px-5 pb-6">
        <button onClick={goBack} className="btn-ghost flex-1">← {t("cook_back")}</button>
        <button onClick={goNext} className="btn-primary flex-1">
          {stepIdx < tier.steps.length - 1 ? `${t("cook_next")} →` : t("cook_finish")}
        </button>
      </div>
    </div>
  );
}
