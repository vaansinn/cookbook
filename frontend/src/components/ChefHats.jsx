const LEVEL_COUNT = { basic: 1, intermediate: 2, advanced: 3 };
const LEVEL_COLOR_VAR = { basic: "--basic", intermediate: "--inter", advanced: "--hot" };

// Difficulty indicator: N chef hats for basic/intermediate/advanced. Replaces
// the chili-count icon, which read as spice level rather than difficulty
// (see .claude/rules/business.md — this is the flagged replacement for that
// metaphor, chosen over spice heat specifically because it's unambiguous).
function HatIcon() {
  return (
    <svg viewBox="0 0 16 18" width="1em" height="1.1em" fill="currentColor" aria-hidden="true">
      <path d="M8 0C5 0 3.4 2 3.6 4.3 1.7 4.7.5 6.2.5 8c0 2.1 1.7 3.6 3.7 3.8L4 14.5c0 .8.7 1.5 1.6 1.5h4.8c.9 0 1.6-.7 1.6-1.5l-.2-2.7c2-.2 3.7-1.7 3.7-3.8 0-1.8-1.2-3.3-3.1-3.7C12.6 2 11 0 8 0z" />
    </svg>
  );
}

export default function ChefHats({ level, size = "1em" }) {
  const count = LEVEL_COUNT[level] || 1;
  const colorVar = LEVEL_COLOR_VAR[level] || "--muted";
  return (
    <span className="inline-flex gap-0.5 items-end" style={{ color: `var(${colorVar})`, fontSize: size }} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <HatIcon key={i} />
      ))}
    </span>
  );
}
