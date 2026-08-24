# Business & Product Rules

## What This Product Is
Recipe Drawer teaches cooking by growing the *same dish* through three tiers — Basic (jar sauce, guaranteed success), Intermediate (fresh ingredients, one new technique), Advanced (from scratch). Duolingo-style progress (streaks, XP, badges) rewards leveling up a dish you already know.

## Priorities (in order)
1. A beginner's first dish must succeed, every time — Basic tier has zero room for failure.
2. Nutrition and content accuracy — computed numbers, not guesses; food-table sync fails loudly on gaps.
3. UX quality — feels like a considered app, not a recipe blog wearing app clothes.
4. Feature breadth — matters, but not before 1–3.

## Feature Decisions
- Basic tier is always free — decided 2026-08-24. Whether Intermediate/Advanced ever get locked behind a plan, and when, is open until there's real traction.
- Don't add features speculatively — the phased roadmap (blueprint artifact) is the plan; deviations get proposed, not silently built.
- "Coming soon" placeholders are fine for planned-but-not-ready tabs — never ship a blank stub.

## Language & Tone (UI copy)
- Warm and encouraging, never condescending — the target user for Basic has never cooked.
- Difficulty language leans into the spice-heat metaphor (🌶️/🌶️🌶️/🔒) established in the P0 mockup — keep it consistent, don't invent a second metaphor.
- Nutrition panel always carries an "approximate values" note — the site explains, never prescribes diet or medical advice.

## Internationalisation
- EN + DE at launch (decided 2026-08-24) — every new UI string needs both.
- Recipe content (all 3 tiers × both languages) is the real bottleneck — see the blueprint's content pipeline section before assuming a dish is "done" after one language.

## Gotchas
- **Nutrition numbers are computed, not typed.** Never hardcode a calorie count on a recipe — it comes from the food table + ingredient quantities at sync time, or it goes stale silently.
- **Tier tabs are the future paywall boundary.** Any change to tab structure has payment-gating implications even before Stripe is wired up (P6) — think about it now, don't paint into a corner.
