# Visual Design Rules

**The CSS variable + Tailwind system is the single source of truth.** Established in the P0 mockup (approved 2026-08-24) — push back on anything that would break it.

## Typography
- **Display / headlines / big numbers / tab labels**: `font-display` → Baloo 2, bold rounded, warm and game-like.
- **Body / UI text**: default sans → Plus Jakarta Sans.
- No serif anywhere in the app UI — the original mockup used Instrument Serif and the user rejected it as reading like a "reading app" / food blog, not a cooking app. Don't reintroduce it.

## Colour System
- CSS vars in `frontend/src/index.css`, consumed via Tailwind (`tailwind.config.js` maps `brand`, `basic`, `inter`, `hot`, `locked`, `ink`, `muted`, `line` to `var(--*)`). Never hardcode a hex value in a component — breaks theming.
- **User-approved replacement (2026-09-06): enamel blue + porcelain.** `brand` is blue for primary actions, active states, links and teaching panels. Dark mode uses neutral charcoal surfaces.
- Tier labels carry difficulty; `basic`/`inter`/`hot` are blue compatibility aliases, not green/amber/red. Do not bring back spice-heat coloring.
- Use `success` for actual successful outcomes, `danger` for errors/destructive actions, and `attention` for timer attention. Pair their fills with their own `*-ink` tokens. Never infer success or failure from lesson paragraph order or confidence/difficulty choices.

## Dark Mode
Every colour is a CSS var with a `html.dark` override — see `index.css`. No `dark:` Tailwind hardcoding of literal colours; always go through the var-backed Tailwind color names (`bg-app`, `text-ink`, `border-line`, etc).

## Component Patterns (established in P0 mockup, carry into real components)
- Buttons are tactile: solid fill + a flat bottom "shadow" ledge (`box-shadow: 0 4px 0 var(--*-dk)`), fully rounded. This is the Duolingo-style pressable-button pattern — keep it for primary actions.
- Cards: white/dark surface, 2px border in `var(--line)`, generously rounded (`rounded-3xl`/`20px`+).
- Circular icon badges for dish thumbnails and avatars, not rounded squares.

## When a Request Conflicts with This System
State the issue and propose the CSS-var equivalent before implementing. Don't silently hardcode a colour or bypass the theme system.

## Gotchas
- The approved blue preview supersedes the old warm/spice palette. Typography, component geometry and navigation remain unchanged in this palette-only pass.
