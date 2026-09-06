import { useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "../../i18n";

// Static, click-through mockups for Step 2 review (docs/contracts/
// pilot-fixtures.md §2/§3/§7) - NOT wired to real cook-session/reflection
// state. All data below is hardcoded fixture content; toggles are local UI
// state only, nothing is sent to a server. Reachable only by direct URL
// (App.jsx route /mockups/teaching-pilot) - no nav entry, per this task's
// constraints. Once approved, Step 3 wires the real versions of these
// screens into CookMode.jsx.
//
// Two screens live here (a CookMode help overlay and the post-Finish
// reflection screen) because neither is a standalone route in the shipped
// product - both are states of Cook Mode. The third mockup (the lesson
// page itself) is a real, permanent route: see LessonPage.jsx / /lesson/:slug.

const STEP_TEXT = "Rinse the lentils, then simmer them in a pot with double their volume of water for 12-15 min until soft. Drain.";

function MockupBanner({ t }) {
  return (
    <div className="text-xs font-bold text-center py-2" style={{ background: "var(--inter-soft)", color: "var(--inter-dk)" }}>
      {t("mockup_banner")}
    </div>
  );
}

function ContextualHelpMockup({ t }) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between px-5 pt-5">
        <button className="chip">✕ {t("cook_exit")}</button>
        <div className="flex gap-1 flex-1 mx-4">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex-1 h-1.5 rounded" style={{ background: i === 0 ? "var(--brand)" : "var(--line)" }} />
          ))}
        </div>
        <span className="chip">2 {t("serves")}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="text-xs font-bold tracking-wide" style={{ color: "var(--muted)" }}>{t("cook_step_of", { i: 1, n: 4 })}</div>
        <div className="font-display font-extrabold" style={{ fontSize: "60px", color: "var(--brand)", lineHeight: 1 }}>1</div>
        <p className="font-display text-xl font-semibold mt-2" style={{ color: "var(--ink)" }}>{STEP_TEXT}</p>

        <button
          onClick={() => setHelpOpen(true)}
          className="mt-5 rounded-full px-5 py-2.5 font-bold text-sm border-2"
          style={{ background: "var(--card)", borderColor: "var(--brand)", color: "var(--brand)" }}
        >
          💡 {t("cook_help_cta")}
        </button>

        <button className="mt-3 rounded-full px-5 py-2.5 font-bold text-sm" style={{ background: "var(--basic)", color: "var(--brand-ink)", boxShadow: "0 4px 0 var(--basic-dk)" }}>
          ⏱ 12 min
        </button>
      </div>

      <div className="flex gap-2.5 px-5 pb-6">
        <button className="btn-ghost flex-1">← {t("cook_back")}</button>
        <button className="btn-primary flex-1">{t("cook_next")} →</button>
      </div>

      {helpOpen && (
        <div className="fixed inset-0 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="card w-full max-w-lg rounded-b-none px-6 pt-5 pb-8" style={{ maxHeight: "80vh", overflowY: "auto" }}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>{t("cook_help_eyebrow")}</p>
                <h2 className="font-display text-2xl font-bold mt-0.5" style={{ color: "var(--ink)" }}>Simmering</h2>
              </div>
              <button onClick={() => setHelpOpen(false)} className="chip" aria-label={t("cook_help_close")}>✕</button>
            </div>

            <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: "var(--basic-soft)" }}>
              <p className="font-display font-bold text-xs uppercase tracking-wide" style={{ color: "var(--basic-dk)" }}>{t("lesson_success_cue_label")}</p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
                Look for a steady trickle of small bubbles breaking the surface here and there — maybe a few every second — with the water gently moving rather than crashing around.
              </p>
            </div>

            <div className="rounded-2xl px-4 py-3 mt-3" style={{ background: "var(--inter-soft)" }}>
              <p className="font-display font-bold text-xs uppercase tracking-wide" style={{ color: "var(--inter-dk)" }}>{t("lesson_if_too_hard_label")}</p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
                Turn the heat down a notch and give it a minute to settle — check the lentils near the 12-minute mark for mush rather than tender.
              </p>
            </div>

            <Link to="/lesson/simmering" className="block text-sm font-bold text-center mt-4" style={{ color: "var(--brand)" }}>
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

function ReflectionMockup({ t }) {
  const [outcome, setOutcome] = useState(null);
  const [practiced, setPracticed] = useState(false); // never pre-checked (contract §3)
  const [confidence, setConfidence] = useState(null);
  const [saved, setSaved] = useState(false);

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

  if (saved) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-8" style={{ background: "var(--bg)" }}>
        <div className="text-5xl">🎉</div>
        <p className="font-display text-xl font-bold mt-3" style={{ color: "var(--ink)" }}>{t("reflect_saved")}</p>

        <div className="card px-4 py-4 mt-6 max-w-sm w-full text-left">
          <p className="font-display font-bold text-xs uppercase tracking-wide" style={{ color: "var(--brand)" }}>{t("reflect_next_practice_label")}</p>
          <p className="font-display font-semibold mt-1" style={{ color: "var(--ink)" }}>Chickpea Tikka Masala</p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>Try keeping a steady simmer in another dish.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setSaved(false)} className="btn-ghost flex-1 text-sm py-2.5">{t("reflect_next_practice_dismiss")}</button>
            <Link to="/dish/chickpea-tikka-masala" className="btn-primary flex-1 text-sm py-2.5 text-center">{t("reflect_next_practice_cta")}</Link>
          </div>
        </div>
      </div>
    );
  }

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

      <label className="card flex items-center gap-3 px-4 py-3.5 mt-5 cursor-pointer">
        <input type="checkbox" checked={practiced} onChange={(e) => setPracticed(e.target.checked)} className="w-5 h-5" />
        <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{t("reflect_practiced_label", { skill: "Simmering" })}</span>
      </label>

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

      <button onClick={() => setSaved(true)} className="btn-primary mt-6">{t("reflect_save")}</button>
      <button onClick={() => setSaved(true)} className="text-sm font-bold text-center mt-3 py-2" style={{ color: "var(--muted)" }}>
        {t("reflect_skip")}
      </button>
    </div>
  );
}

export default function TeachingPilotMockups() {
  const t = useT();
  const [tab, setTab] = useState("help");

  return (
    <div style={{ background: "var(--bg)" }}>
      <MockupBanner t={t} />
      <div className="flex gap-2 justify-center py-3" style={{ background: "var(--card)", borderBottom: "2px solid var(--line)" }}>
        <button
          onClick={() => setTab("help")}
          className="chip font-bold text-sm"
          style={tab === "help" ? { background: "var(--brand)", color: "var(--brand-ink)" } : {}}
        >
          {t("mockup_tab_help")}
        </button>
        <button
          onClick={() => setTab("reflect")}
          className="chip font-bold text-sm"
          style={tab === "reflect" ? { background: "var(--brand)", color: "var(--brand-ink)" } : {}}
        >
          {t("mockup_tab_reflect")}
        </button>
        <Link to="/lesson/simmering" className="chip font-bold text-sm">{t("mockup_tab_lesson")} ↗</Link>
      </div>

      {tab === "help" ? <ContextualHelpMockup t={t} /> : <ReflectionMockup t={t} />}
    </div>
  );
}
