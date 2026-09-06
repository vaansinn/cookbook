// Renders a Lesson's markdown-ish body (content/lessons/<slug>/{en,de}.md via
// scripts/sync_learning.py - see models.Lesson.body) as the card layout
// approved in the Step 2 mockup (TeachingPilotMockups.jsx / LessonPage.jsx):
// a "**Label**: text" paragraph becomes a labelled card (success-cue/
// if-too-hard colouring, cycling through the tier palette), any other
// paragraph renders as plain body text. Shared between LessonPage.jsx and
// CookMode.jsx's contextual-help panel so both read the same lesson content
// the same way.
const CARD_BG = ["var(--basic-soft)", "var(--inter-soft)"];
const CARD_FG = ["var(--basic-dk)", "var(--inter-dk)"];

// Also used by LessonPage.jsx/CookMode.jsx for the shorter authored strings
// that carry the same lightweight markdown (next_practice.reason) but don't
// need the full card treatment above.
export const stripMd = (s) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");

export default function LessonBody({ body }) {
  const paragraphs = (body || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let labelIdx = 0;

  return (
    <>
      {paragraphs.map((p, i) => {
        const m = p.match(/^\*\*(.+?)\*\*:\s*([\s\S]*)$/);
        if (m) {
          const n = labelIdx % CARD_BG.length;
          labelIdx += 1;
          return (
            <div key={i} className="rounded-2xl px-4 py-3 mt-3" style={{ background: CARD_BG[n] }}>
              <p className="font-display font-bold text-xs uppercase tracking-wide" style={{ color: CARD_FG[n] }}>
                {m[1]}
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{stripMd(m[2])}</p>
            </div>
          );
        }
        return (
          <p key={i} className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink)" }}>{stripMd(p)}</p>
        );
      })}
    </>
  );
}
