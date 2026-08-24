# PIPELINE.md — Durable Task Store

The in-session task tracker does not survive between sessions. This file does.
Numbering is monotonically increasing — check the highest `#N` here before adding a new one, never reuse or restart.

## Open

(none yet — P1 foundation just shipped)

## Already shipped

- #1 — P0: Visual direction approved (Baloo 2 + Plus Jakarta Sans, tomato/basil/amber/hot-chili palette, spice-heat tier coding). Mockup artifact: https://claude.ai/code/artifact/5d307275-2afd-48fc-8b42-4531746f6bd4
- #2 — P1: Foundation — Flask+Postgres backend (auth: register/login/me), React+Vite+Tailwind+Zustand frontend, EN/DE i18n, light/dark theme, verified locally (register → login → language switch → dark mode all confirmed working). Password reset / email verification deferred to P5 hardening.

## Next up

- P1 remainder: Heroku app + Postgres addon + deploy, verify the gate on the live URL
- P2: Recipe data model, markdown→Postgres sync, tier tabs, nutrition panel, cook mode, browse/search/filters, unit converter
