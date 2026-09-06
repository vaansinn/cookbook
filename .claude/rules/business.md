# Business & Product Rules

## Agreed direction — updated 2026-09-06

Cooking education is central, without XP, daily streaks, reward badges or automatic mastery. Track explicit practice, optional editable confidence and personal repertoire independently. First validate one dish/technique with contextual help and real beginner observation, then expand. Flexible meaningful recipe versions, optional-difficulty personal recipes/variations and private dinner events remain later release choices.

This is planned direction, not a claim that the code has changed. Preserve existing public/account/premium grants until an explicitly approved entitlement change; difficulty, guidance and display order must not silently become access rules. Preserve the currently approved chef-hat/board-rack visual language. The [consolidated plan](../../IMPLEMENTATION_PLAN.md) and [handoffs](../../AGENT_HANDOFFS.md) supersede older roadmap/reward/tier assumptions for these tasks. Unrelated product, security, content and preview rules remain in force.

## Historical implementation description — transition pending
Recipe Drawer teaches cooking by growing the *same dish* through three tiers — Basic (jar sauce, guaranteed success), Intermediate (fresh ingredients, one new technique), Advanced (from scratch). Duolingo-style progress (streaks, XP, badges) rewards leveling up a dish you already know.

## Priorities (in order)
1. A beginner's first dish must succeed, every time — Basic tier has zero room for failure.
2. Nutrition and content accuracy — computed numbers, not guesses; food-table sync fails loudly on gaps.
3. UX quality — feels like a considered app, not a recipe blog wearing app clothes.
4. Feature breadth — matters, but not before 1–3.

## Feature Decisions
- Basic tier is always free — decided 2026-08-24. Intermediate needs an account, Advanced needs premium — decided and shipped 2026-08-25 (P6, `access.py`). No Stripe/checkout yet; premium is a manually-set `user.plan` flag until pricing is decided.
- Don't add features speculatively — IMPLEMENTATION_PLAN.md defines the active package versus future roadmap; assign a bounded slice before building. A listed later feature is not authorization to implement it.
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
