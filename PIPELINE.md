# PIPELINE.md — Durable Task Store

The in-session task tracker does not survive between sessions. This file does.
Numbering is monotonically increasing — check the highest `#N` here before adding a new one, never reuse or restart.

## Open

(none yet — P1 foundation just shipped)

## Already shipped

- #1 — P0: Visual direction approved (Baloo 2 + Plus Jakarta Sans, tomato/basil/amber/hot-chili palette, spice-heat tier coding). Mockup artifact: https://claude.ai/code/artifact/5d307275-2afd-48fc-8b42-4531746f6bd4
- #2 — P1: Foundation — Flask+Postgres backend (auth: register/login/me), React+Vite+Tailwind+Zustand frontend, EN/DE i18n, light/dark theme, verified locally AND on live Heroku URL (register → login → language switch → dark mode all confirmed working end to end). Password reset / email verification deferred to P5 hardening.
- #3 — P1: Heroku deploy — app `zeni-cookbook` (EU region), Postgres essential-0 addon (~$5/mo, cheaper than the blueprint's earlier $12-17 estimate), Node+Python dual buildpacks, live at https://zeni-cookbook-3e8f40a9b7cb.herokuapp.com. Gate verified live: register, login, DE switch, dark mode all confirmed on the real URL via browser automation.

- #4 — P2: Recipe core — Dish/RecipeTier/FoodItem models, markdown→Postgres sync (`flask sync-recipes`, wired into the Heroku release phase so every deploy re-syncs content automatically), computed-nutrition pipeline (fails loudly on any ingredient missing a food-table mapping), browse page (search + cuisine filter chips + tier-availability dots), recipe page (tier tabs, nutrition panel, servings scaler, prep/ingredients/instructions/notes), Cook Mode (step-by-step, per-step timers, wake lock, progress dots). Content: Lentil Bolognese fully seeded at all 3 tiers × EN/DE (the proof dish); the other 5 existing dishes ported at Intermediate/EN only. Gate verified locally end-to-end: cooked Lentil Bolognese Basic through all 4 steps in German, in dark mode, nutrition numbers hand-verified correct (802/890/984 kcal for basic/intermediate/advanced).

- #5 — Backfill: Basic + Advanced tiers + German for all 5 remaining dishes (chickpea-tikka-masala, lemon-ricotta-spaghetti, potato-chickpea-skillet, spinach-egg-fried-rice, sushi-rice). All 6 dishes now have all 3 tiers × EN/DE — 36 recipe tiers total. Added 8 food-table entries (garam masala, turmeric, yogurt, chili flakes, pine nuts, saffron, sherry vinegar, bottled sushi seasoning). Fixed a display bug found in testing: recipe header duplicated the cuisine name when a tag matched it case-insensitively. Verified live on Heroku.

## Next up

- Deferred from P2: full metric/imperial unit converter (would need the ingredient schema split into structured qty+unit, not just a qty_g anchor — current servings scaler covers the common case by reusing the old site's proven regex scaling)
- P3: households, shared grocery lists, week planner, "add to list" from a recipe
- P4: glossary (technique + nutrition), streaks/XP/badges, progression nudges
- Custom domain for the new app is undecided — menu.zeni-design.com keeps serving the static Netlify cookbook until P3 parity per the blueprint
