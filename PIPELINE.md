# PIPELINE.md — Durable Task Store

The in-session task tracker does not survive between sessions. This file does.
Numbering is monotonically increasing — check the highest `#N` here before adding a new one, never reuse or restart.

## Open

(none yet — P1 foundation just shipped)

## Already shipped

- #1 — P0: Visual direction approved (Baloo 2 + Plus Jakarta Sans, tomato/basil/amber/hot-chili palette, spice-heat tier coding). Mockup artifact: https://claude.ai/code/artifact/5d307275-2afd-48fc-8b42-4531746f6bd4
- #2 — P1: Foundation — Flask+Postgres backend (auth: register/login/me), React+Vite+Tailwind+Zustand frontend, EN/DE i18n, light/dark theme, verified locally AND on live Heroku URL (register → login → language switch → dark mode all confirmed working end to end). Password reset / email verification deferred to P5 hardening.
- #3 — P1: Heroku deploy — app `zeni-cookbook` (EU region), Postgres essential-0 addon (~$5/mo, cheaper than the blueprint's earlier $12-17 estimate), Node+Python dual buildpacks, live at https://zeni-cookbook-3e8f40a9b7cb.herokuapp.com. Gate verified live: register, login, DE switch, dark mode all confirmed on the real URL via browser automation.

## Next up

- P2: Recipe data model, markdown→Postgres sync, tier tabs, nutrition panel, cook mode, browse/search/filters, unit converter
- Custom domain for the new app is undecided — menu.zeni-design.com keeps serving the static Netlify cookbook until P3 parity per the blueprint
