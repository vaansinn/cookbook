import { Link, useParams } from "react-router-dom";
import { useT } from "../i18n";
import LangSwitch from "../components/LangSwitch";
import ThemeSwitch from "../components/ThemeSwitch";

// Static content mirroring content/lessons/simmering/{en,de}.md, for the
// Step 2 mockup review (docs/contracts/pilot-fixtures.md §2/§7). Not wired
// to GET /api/lessons/<slug> yet - that's Step 3's job once this is
// approved, so this ignores the :slug param and always renders the one
// pilot lesson. Route itself (App.jsx) is real and permanent.
const LESSON = {
  skill: "Simmering",
  title: "Simmering",
  dishSlug: "lentil-bolognese",
  level: "basic",
  intro:
    "Simmering is the gentle middle ground between “barely warm” and “a hard rolling boil” — a handful of small bubbles rising lazily and breaking at the surface, not a pot that's heaving and splashing. For this step, it's what cooks the lentils through evenly over the full 12-15 minutes without either scorching onto the bottom of the pot or breaking the lentils down into mush before they're properly tender.",
  successCue:
    "Look for a steady trickle of small bubbles breaking the surface here and there — maybe a few every second — with the water gently moving rather than crashing around. If it sounds like a light patter rather than a rumble, and you can still see individual bubbles rather than a solid wall of foam, you're in the right place.",
  ifTooHard:
    "Turn the heat down a notch and give it a minute to settle — a pot doesn't calm down instantly, so don't keep adjusting every few seconds. Check the lentils near the 12-minute mark: if a good number are already falling apart into mush rather than just tender, you were running it too hot, and next time you'll want to catch that sooner.",
  ifNothing:
    "No bubbles for a minute or two after you put the pot on? Turn the heat up slightly and be patient — cold water takes a moment to catch up, and that's completely normal, not a sign you're doing anything wrong.",
  closing:
    "Once you can spot this by eye, you'll lean on it constantly — most stovetop cooking runs on a simmer, not a hard boil, so this is one of the most useful things to get comfortable reading.",
  nextPractice: {
    dishSlug: "eggs-benedict",
    dishTitle: "Eggs Benedict",
    reason:
      "Eggs Benedict asks for a bare simmer for poaching — a quieter, more delicate version of the same bubbles, so it's a good next check on whether you can tell the two apart by eye, not just by habit.",
  },
};

export default function LessonPage() {
  useParams(); // :slug - ignored for this static mockup pass, see comment above
  const t = useT();

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-lg mx-auto px-6 pt-6 pb-12">
        <div className="flex justify-between items-center">
          <Link to={`/dish/${LESSON.dishSlug}/cook?level=${LESSON.level}`} className="text-sm font-bold" style={{ color: "var(--muted)" }}>
            {t("lesson_back")}
          </Link>
          <div className="flex gap-3"><LangSwitch /><ThemeSwitch /></div>
        </div>

        <div
          className="rounded-full mt-5 mb-1 inline-flex items-center justify-center font-display font-bold text-xl"
          style={{ width: 56, height: 56, background: "var(--basic-soft)", color: "var(--basic-dk)" }}
        >
          🍲
        </div>
        <h1 className="font-display text-3xl font-bold mt-2" style={{ color: "var(--ink)" }}>{LESSON.title}</h1>

        <p className="mt-4 leading-relaxed text-sm" style={{ color: "var(--ink)" }}>{LESSON.intro}</p>

        <div className="card px-4 py-4 mt-5">
          <p className="font-display font-bold text-sm uppercase tracking-wide" style={{ color: "var(--basic-dk)" }}>
            {t("lesson_success_cue_label")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{LESSON.successCue}</p>
        </div>

        <div className="card px-4 py-4 mt-3">
          <p className="font-display font-bold text-sm uppercase tracking-wide" style={{ color: "var(--inter-dk)" }}>
            {t("lesson_if_too_hard_label")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{LESSON.ifTooHard}</p>
        </div>

        <div className="card px-4 py-4 mt-3">
          <p className="font-display font-bold text-sm uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {t("lesson_if_nothing_label")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{LESSON.ifNothing}</p>
        </div>

        <p className="mt-4 leading-relaxed text-sm" style={{ color: "var(--ink)" }}>{LESSON.closing}</p>

        <div className="card px-4 py-4 mt-6" style={{ borderColor: "var(--brand)" }}>
          <p className="font-display font-bold text-sm uppercase tracking-wide" style={{ color: "var(--brand)" }}>
            {t("lesson_next_practice_label")}
          </p>
          <p className="font-display font-semibold mt-1" style={{ color: "var(--ink)" }}>{LESSON.nextPractice.dishTitle}</p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{LESSON.nextPractice.reason}</p>
          <Link
            to={`/dish/${LESSON.nextPractice.dishSlug}`}
            className="btn-primary inline-block mt-3 text-sm py-2.5 px-4"
          >
            {t("lesson_next_practice_cta")}
          </Link>
        </div>

        <Link to={`/dish/${LESSON.dishSlug}/cook?level=${LESSON.level}`} className="btn-ghost block text-center mt-6 text-sm py-3">
          {t("lesson_back")}
        </Link>
      </div>
    </div>
  );
}
