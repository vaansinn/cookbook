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

- #6 — P3: Households, shared grocery list, week planner. Join a household with an 8-char invite code (no email required — SMTP still isn't configured, deferred to P5). Grocery items merge across recipes by `food_slug`, summed in grams, with a "used in: X, Y" source list per item — verified with two real accounts adding different recipes and seeing merged onion/garlic/oil lines with correct combined weights. Week planner assigns dishes to dates and batch-adds a whole week's ingredients to the list in one call, same merge path. Checked/unchecked state is shared live across household members (poll-on-load, not push — matches the blueprint's "poll first, live sync only if it annoys in practice"). Verified end to end locally AND on the live Heroku URL.

- #7 — P4: Cook logging, streaks/XP/badges, progression nudges, glossary. `POST /api/cook-log` fires from Cook Mode's last step; streak (consecutive days), XP (10/20/35 for basic/intermediate/advanced), level name, and 4 badges (first_dish, first_advanced, five_cuisines, week_streak) are all *derived* live from the cook_logs table on every request, never stored — can't drift out of sync. Nudges: cook a dish twice at its highest tried tier with a next tier available → surfaced on the Progress page, verified firing and clearing correctly as tiers progress. Glossary: 14 entries (9 technique, 5 nutrition) in EN+DE, same markdown→sync pattern as recipes (`flask sync-glossary`, wired into the Heroku release phase). Recipe steps/notes auto-link matching technique keywords to their glossary entry; nutrition tile labels (kcal/protein/carbs/fiber) link directly. Verified end to end via real UI clicks (not just API) — cooked a dish through Cook Mode, saw the toast + badge award, checked Progress page, clicked a glossary auto-link in an Advanced recipe — all live on Heroku.

## Next up

- Deferred from P2: full metric/imperial unit converter (would need the ingredient schema split into structured qty+unit, not just a qty_g anchor — current servings scaler covers the common case by reusing the old site's proven regex scaling)
- Deferred from P3: multiple/per-week grocery lists (one active list per household for now); real-time push sync if polling turns out to annoy in practice; email-based household invites (waiting on P5 SMTP)
- Deferred from P4: German trigger-word matching for glossary auto-links (`trigger_words` are English-only right now — German recipe text doesn't get auto-linked yet, needs German phrases added per entry)
- P5: PWA + offline caching + wake-lock (Cook Mode already has wake-lock from P2), schema.org SEO + pre-rendering, accessibility pass, GDPR pages + export/delete, 15-dish content target
- Custom domain for the new app is undecided — menu.zeni-design.com keeps serving the static Netlify cookbook until P3 parity per the blueprint. **P3 parity was reached in the previous session** — user chose to hold off on the DNS swap for now, revisit when asked.
