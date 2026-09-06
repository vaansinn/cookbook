# Recipe Drawer — consolidated implementation and delegation plan

Prepared 2026-09-06. All features below are planned unless explicitly listed as shipped. Updated after scope review: the first milestone is a one-dish teaching pilot, not the entire roadmap. This is the primary implementation specification; PIPELINE.md owns task IDs and status. AGENT_HANDOFFS.md provides dispatch instructions. Pass this file and AGENT_HANDOFFS.md to each implementing agent.

## 1. Authoritative baseline and preparation

- Cookbook repository: https://github.com/vaansinn/cookbook
- Verified remote main: dccd4db177336b7f52d992bb9a3dade681c61d1e (2026-09-05).
- The original planning audit used local code at 6011faf, 15 commits behind the verified remote. For publication, this documentation commit is based on dccd4db and preserves those newer application commits. The roadmap features remain planned, not implemented.
- Before implementation, verify the actual checkout SHA against the current remote and preserve uncommitted/incoming work. Do not reset the checkout or blindly overwrite a newer PIPELINE.md.
- Before allocating more IDs, recheck the highest task number on the active shared branch. This plan reserves #32–#58 relative to the verified remote baseline; the original learning draft's #16–#30 were collisions, not new shipped tasks.
- Ask about additional unpushed work only if a concrete overlap appears. Never assume remote main contains another agent's unfinished work.

Existing functionality to preserve: recipe browsing and EN/DE content; account access and premium gates; favorites and sharing; ChefHats and board-rack recipe tabs; named MealPlan/MealPlanItem bundles; public plan links; apply-to-week; plan-to-grocery; plan generation; dated PlanEntry household planner; cook history; glossary; nutrition; privacy export/delete; approved meal-plan card styling.

Existing meal-plan routes to audit when modifying recipe references, access, portions, or shopping:
- /api/meal-plans CRUD and /api/meal-plans/shared/<slug>
- /api/meal-plans/<id>/apply-week and /api/meal-plans/<id>/grocery-list
- /api/meal-plans/generate
- /api/plan, /api/plan/build-list, and /api/grocery-list/items

The generator currently derives a global tier from two historical cooks and nudges the final dish upward. This is part of the learning-mechanic replacement, not an independent algorithm to preserve indefinitely.

## 2. Product direction and pending choices

Agreed direction for this plan:
- Cooking education is central. Remove XP and daily streaks; use practice history, optional confidence, and personal repertoire.
- Support user-authored recipes without mandatory difficulty or complete nutrition.
- Support personal variations with source attribution, comparisons, and revision history.
- Support dinners/events grouping dishes, shopping, portions, and preparation.
- Reuse inspected historical code where it fits, rather than rebuilding equivalent flows from memory.

Implementation defaults (recommendations, not invented prior approvals):
- Personal recipes are private; public community publishing and collaborative recipe editing are out of scope.
- No points, replacement ranks, or automatic mastery; remove reward badges with the game-mechanic transition.
- Difficulty, amount of guidance, visibility/ownership, and commercial access are independent concepts.
- Existing public/account/premium access is preserved by explicit metadata. Reordering a version never changes who can read it.
- Keep existing meal-plan bundles and dated planning; event planning extends this product family rather than creating a competing planner.
- UI descriptions use “My version”, “Changes”, and “Earlier versions”, not Git jargon.
- All app-owned UI/curated learning content remains EN/DE. Personal recipes may exist in one user-selected language; never force a translation or fabricate one.

Choices that may affect a later release, with bounded defaults:
| Decision | Proposed default | When needed |
|---|---|---|
| Learning access/pricing | Keep current entitlements; no checkout work. A complete free starter path is a proposal. | #44, before any entitlement changes |
| Copies of premium recipes | Store provenance and inherited source restriction; no automatic publication or access bypass. Present exact copy/downgrade policy before enabling affected premium copying. | #53 |
| Natural-language planning (#26) | Retain as optional catalog selection after reliable planning; provider/model/quotas require separate setup. | Before activating paid API calls |
| “Cooked N times” (#28) | Defer pending a clear user-value decision and reliable logging; do not label popularity as quality. | Before implementing the signal |
| Event collaboration | Private host-owned event first; explicit sharing later. No automatic exposure of guest details through plan share links. | #55 |
| Learner testing/media | Start recruitment planning alongside curriculum; user supplies or authorizes participants/review/assets. Technical QA can finish while learning evidence is pending. | #33/#39 |

Existing local instructions describing Duolingo mechanics or mandatory three-tier progression are historical product direction for these affected tasks. Implement the user's newer direction; keep unrelated code/style/security rules. Preserve the approved hats, colors, typography, and card language. Under the current project workflow, present new UI previews for explicit visual feedback before implementing that visual; already approved designs need no repeat approval. Planning does not authorize deployment, contacting people, or paid services.

## 3. Reconcile existing tasks instead of duplicating them

| Existing task | Disposition |
|---|---|
| #20 variable tier counts | Superseded as an implementation specification by #40/#47. Preserve its ID and history; no claim of completion. Position-based pricing was a proposal, not a chosen migration rule. |
| #26 natural-language plan preparation | Retained, conditional/later. Operate only on the real catalog and server validation. Check current provider/model documentation when implementing; do not assume the model string in the old backlog is available. |
| #28 trust signal | Retained, deferred recommendation; optional product decision. Distinct from personal XP. |
| #29 sticky recipe mini-header | Retained; independently implementable, one recipe-page owner. |
| #30 sticky recipe action bar | Retained; coordinate with #29, Cook Mode links, and mobile bottom navigation. |
| #31 quick serving choices | Retained; coordinate with the canonical serving/quantity contract. |
| Shipped #16–#19, #21–#25, #27 | Preserve code and shipped records. Do not rebuild them as new learning tasks. |
| P5 hardening, Lighthouse, offline verification | Still open; verify which launch gates apply. Not superseded by this roadmap. |

Original learning draft task numbers map one-for-one by adding 16: old #16 → #32 through old #30 → #46. Do not confuse an “old draft #24” with the actual shipped #24 apply-to-week feature. Use only the new IDs in handoffs.

## 4. Contracts sized to the release

### First release: #47a pilot contract

A beginner can learn one useful technique, cook a meal with contextual help, record how it went, and choose another opportunity to practise it—without points or streaks.

Use current curated recipes and access rules. The pilot does **not** depend on #40's version/revision migration, personal recipes, scanning, events, or a generalized course engine.

| Pilot concept | Required contract |
|---|---|
| Recipe reference | Existing dish_slug + level + lang, resolved server-side to RecipeTier. Preserve URLs and access; no new universal version ID. |
| Skill / lesson | Stable authored slugs, EN/DE content, explicit recipe/focus-skill links. |
| Step | Stable ID, instruction, optional lesson/help/success cue. Legacy prose normalizes through one serializer. |
| Content used in a cook | Immutable normalized content blob/fingerprint, keyed by source tier/language/hash. Reuse identical snapshots; no branches, edit conflicts, or localized current-revision pointers. |
| Session | Account-scoped session_id from #48, recipe reference, server-issued snapshot ID/hash, optional reflection and explicitly confirmed practice. |
| Next practice | An authored accessible recipe link with an explanation; no recommendation engine required. |

Capture the authorized snapshot when serving the session's recipe and retain it through completion even if sync changes current content. Never accept arbitrary client content as authorization to pin/read locked recipes. Check source access on snapshot reads, scope personal session state to the account, clear client state on logout. Old cooks with no captured content remain “source content unknown”.

Normalize semantic content deterministically: ingredients/amounts/units/food mappings, servings, steps/help, lesson references and displayed nutrition with its calculation-input digest. Exclude sync timestamps and serialization/key-order noise. Relevant nutrition-input changes create a new fingerprint; unrelated food-table edits do not. Retained lesson content has its own digest/revision. #35 owns snapshot creation; #48 accepts optional snapshot references while supporting existing recipes before #35 lands.

#47a is a small interface agreement, not a blocker for #50, #48's current-reference fix, content drafting, or existing household/planning fixes.

### Later target: #47b and #40

This future contract becomes binding when variable versions/personal recipes are selected for implementation, not before the teaching pilot.

| Concept | Intended behavior |
|---|---|
| Dish | Curated grouping, optional for private recipes; no accidental public creation. |
| RecipeVersion | Stable cookable variation identity; optional difficulty, owner/visibility and explicit access independent of display order. |
| RecipeRevision | Immutable localized content, per-version/language current pointer, source/parent references. Restore appends a meaningful revision. |
| RecipeTier | Compatibility/current-content projection during migration. |
| Recipe reference | Version ID, language and pinned revision as needed; one adapter maps old references and pilot snapshots. |
| Ingredient | Stable line ID, display amount/unit, optional verified grams/food mapping. Unknown stays unknown. |
| CookLog | Preserve session and exact pilot snapshot; never invent historical content. |
| MealPlan / PlanEntry | Existing reusable bundle versus dated application; distinguish retries from intentional new applications. |
| DinnerEvent / EventDish | Private host-owned occasion, per-dish servings, pinned content. V1 can use curated references/snapshots before #40/#51. |
| Shopping contribution | Stable source occurrence/item/ingredient, reconciled before aggregation; preserve manual items. |
| Practice / confidence | Explicit history versus editable self-assessment; never inferred from counts or difficulty. |

“My smoky version” retains its authorized original and separate history. Event content changes only through explicit host updates. Personal/adapted recipes lose automatic curated-review and teaching-outcome guarantees.

Rules: enforce recipe access separately from container access; never expose private snapshots/guest information through public shares; centralize step compatibility for #57; use recoverable base-revision conflicts for deliberate personal saves, separate from autosave; distinguish ingredient weight/yield and nutrition bases; follow #40's deterministic sync rules rather than creating a revision per deployment.

## 5. First release, parallel work, and effort

Use isolated checkouts/worktrees from the same verified current base. Pass this document and AGENT_HANDOFFS.md together. This roadmap does not dispatch agents or authorize all listed features.

### Active implementation package

| Sequence | Bounded assignment | Exit / next action |
|---|---|---|
| Start in parallel | #50 actual cache fix; #33a one dish/one lesson; #39a observation preparation; #47a baseline/pilot fixtures | Review cache tests/content; arrange authorized human review early. |
| Reliable completion | #48 cook retries; #32 useful reward-free history | Preserve history, save each cook once. |
| One end-to-end slice | #34a–#38a lesson → contextual help → saved cook → optional reflection/practice → authored next-practice link | One usable dish, not every feature in these larger tasks. |
| First observation | #39a with one or two beginners plus experienced-cook content review | Correct observed confusion before expansion. |
| Controlled expansion | #33b–#38b three dishes/five skills and necessary richer help; #39b further observations, provisionally three to five beginners total | Decide whether the learning approach earns further investment. |
| Later selection | Deliberately select library/version work, event v1, or another roadmap slice | Do not auto-start every track when an API is ready. |

Letters identify slices of existing IDs, not new tasks. Track slice completion without marking its entire parent complete. First observation does not wait for a full LearningPath/repertoire system, overlapping timers, or a recommendation engine. A next-practice link can use an accessible existing recipe before its full teaching conversion.

Independent maintenance can proceed throughout: #50, #48, #41a solo first-write, #49a current planning/list correctness, #29–#31 usability and applicable P5 hardening. Human-test delays do not block these. Later library/events may be separately authorized while evidence is pending; do not silently consume pilot capacity or claim teaching is validated.

### Four responsibilities

| Role | Initial responsibility |
|---|---|
| Reliability agent | #50 then #48; separately assigned #41a/#49a if capacity permits. |
| Content agent | #33a and #39a materials/review; expand after feedback. |
| End-to-end teaching agent | #47a interface with reviewer, #32, bounded #34a–#38a full-stack flow. |
| Integration/review role | Current base, actual overlap coordination, migration order, acceptance/status/evidence tracking; can be part-time. |

Agents own complete slices, including required model/route/UI/router/locale edits in isolated checkouts. Do not route every central-file edit through one integrator. List actual overlaps, serialize conflicting edits or agree a small interface/merge order. Integration coordinates the shared backlog, not all source edits. Land migrations in a known order, rebase dependents to the actual head, and resolve migration heads before merging.

### Rough near-term effort

Hands-on person-days for someone familiar with the code, including focused tests. Excludes waiting for UI approval, participants, media and culinary review. These are not agent wall-clock promises; parallelism does not divide totals evenly. Re-estimate after the current-code audit and first integrated slice.

| Bounded work | Rough effort | Confidence / uncertainty |
|---|---|---|
| #50 cache fix | 0.5–2 engineering days | Medium; stale-worker rollout/browser reproduction. |
| #47a base + fixtures | 0.5–1.5 engineering days | Medium; incoming work. |
| #48 cook retries | 1–2 engineering days | Medium; concurrency/migration. |
| #32 reward-free history | 1–2 engineering days | Medium; old-client compatibility/UI approval. |
| #33a lesson/audit | 1–3 content days | Medium; EN/DE review/cooking feedback. |
| #34a–#38a combined thin flow | 4–8 engineering days | Low; snapshot/help plumbing and UI approval. One package, not five full tasks. |
| #39a materials/technical setup | 0.5–1 day | Medium; participant/session time additional and externally scheduled. |
| Pilot integration/regression | 1–3 engineering days | Low; cross-slice conflicts; do not double-count focused tests above. |
| Optional #41a solo flow | 1–3 engineering days | Medium-low; joining/data preservation. |
| Optional #49a current plan/list fix | 2–4 engineering days | Low; source attribution/purchased-item semantics. |

Critical path: reviewed starter content + approved UI/interface → integrated thin flow → available beginner observation → corrections. No credible completion date until external availability is known. Full version/library/variation work requires its own larger, lower-confidence breakdown; scanning needs provider approval/credentials; event scheduling needs validated requirements. Do not estimate the entire roadmap from task count.

## Proposed learning model

### What the user sees

Use a skill record with independent signals, rather than a ladder that automatically awards mastery:

| Signal | Example | Meaning |
|---|---|---|
| Learning material | "Viewed the simmering lesson" | Opened/read material; does not prove understanding |
| Practice history | "Practised simmering with lentil Bolognese" | User explicitly reports practising this skill during that cook |
| Current confidence | "I'd like guidance" / "Comfortable on my own" | Optional, editable self-assessment; blank means unknown |
| Personal repertoire | "A dish I feel comfortable cooking" | User-selected dish/version, independent of skill confidence |
| Suggested next action | "Try simmering in another dish" | Optional practice opportunity with a visible explanation |

These are not consecutive ranks. An experienced newcomer can report confidence without doing introductory lessons. A returning cook can request more help without losing history. Time away does not reset progress. Viewing a lesson, finishing a recipe, or practising three times never automatically means mastery.

### One cooking-to-learning cycle

1. Choose a dish or a skill to practise. Show required equipment, estimated active/total time, and at most one or two focus skills for this cook.
2. Offer the relevant short lesson. It can also be opened from the cooking step or skipped.
3. Cook with observable checkpoints and optional explanations. Changing guidance detail does not change the recipe or its access.
4. Save the cook first. Offer an optional reflection: "How did it go?" with "Happy with it", "Mixed result", "Need help", and Skip.
5. Let the user select which focus skill(s) they actually practised. Optionally capture confidence or a short note. Nothing is preselected as evidence of practice.
6. Offer up to three next actions: repeat with help, apply the same skill elsewhere, or try a related skill. The user can dismiss them and browse normally.

No daily targets, leaderboards, total skill score, penalties, compulsory quizzes, or reward badges. A later optional planning preference can ask how often the person wants to cook; it must not become a streak under another name.

## Delivery stages

Section 5 is the executable sequence. Detailed tasks below describe both that package and **later roadmap scope**, not competing implementation waves.

| Stage | Scope | Gate |
|---|---|---|
| First teaching slice | #33a–#38a, #32, #47a, #48, #50 | One dish/technique with a working loop. |
| Early evidence | #39a, then fixes | Observe as soon as the slice is usable. |
| Pilot expansion | Remaining selected #33–#38 scope; #39b | Three dishes/five skills after early corrections. |
| Independent practical work | #41a/#49a, #29–#31, reliability | Bounded assignments; not gated on participants. |
| Later releases | #40/#47b, #42–#46, #51–#57 | Explicit release choice; event v1 needs no personal library. |
| Deferred integrations | #58 and optional #26 | Reassess need, provider viability/cost, authorization. |

Each implemented slice includes EN/DE app-owned content, current themes, relevant loading/empty/error states, proportionate verification, and the required visual preview/feedback. Track slice and whole-task status separately. No deployment is authorized here.

## #32 — Retire game mechanics and retain useful history

Outcome: the app stops presenting activity as points or rank while keeping the user's cooking record.

Implementation:

1. Inventory XP, streak, level-title, badge, and reward-toast usage in routes/progress.py, ProgressPage.jsx, RecipePage.jsx, CookMode.jsx, BottomNav.jsx, and both locale files.
2. Replace the Progress page's reward panels with a simple recent-cooks list. Use neutral navigation copy/iconography. Keep favorites and cooking completion.
3. Stop awarding new badges and stop generating the "cooked twice → next tier" nudge. Remove difficulty-weighted XP and calendar-streak calculations from the active API path. Also remove the global two-cooks-as-proven-tier escalation in routes/meal_plans.py; retain the existing generator with an accessible variety-based fallback until #43 adds explicit learning signals.
4. Keep existing CookLog and BadgeAward rows. Historical records are not evidence of skill practice or confidence. Do not backfill invented learning states. The thin replacement shows real cook history and available favorites/repertoire, without badges or percentages; #38 progressively enriches it.
5. Coordinate the frontend and /api/progress response transition. If needed, temporarily keep unused compatibility fields for a cached older client; remove them in a later compatible release. Do not introduce fake zero-point progress as a replacement UI.
6. Preserve legacy account export/delete handling. Amend current-product notes when this task ships so future changes do not reintroduce the retired mechanics.

Acceptance: finishing a cook adds one history entry with no reward screen; old cooks still appear; no active screen encourages a daily return or shows XP/ranks; authentication and access restrictions still behave correctly. Verify a new account and an account with existing history.

Dependencies: #48 for reliable logging; coordinate #47a's small teaching interface; no #40/#47b prerequisite. Ship backend retirement and a modest usable history screen together, with My Learning expansion in #38. Do not leave frozen scores visible while waiting for the full learning system.

## #33 — Author a small pilot curriculum and audit its recipes

Outcome: teaching content and intended learning outcomes exist before a generalized course system is built.

Scope boundary: Slice #33a: audit one accessible lentil Bolognese recipe and draft one EN/DE lesson, provisionally maintaining a simmer, with one accessible next-practice link. Confirm the skill fits the actual recipe; do not force the proposed choice. Deliver culinary-review questions and #39a observation materials immediately. Slice #33b: expand to the three-dish/five-skill curriculum below only after first observation and corrections.

Implementation:

1. Draft a pilot path, provisionally "Confident stovetop dinners", using lentil Bolognese, chickpea tikka masala, and potato-chickpea skillet. Start from existing basic/intermediate versions and audit whether each genuinely supports its assigned skills.
2. Draft five skill lessons: preparing ingredients before heating; making an even dice; softening aromatics with controlled heat; maintaining a simmer; checking texture and adjusting sauce consistency. Treat these names and assignments as an editorial proposal, not an automatic classification of all existing recipes.
3. Make a dish/version-to-skill table. Introduce no more than one or two focus skills per cooking session and ensure at least two skills recur in different dishes. Identify assumed prerequisite knowledge without making it a hard unlock.
4. Write each lesson with an observable outcome, short explanation, demonstration plan, success cues, common difficulties, recovery guidance, and linked practice recipes. Reuse appropriate glossary material; definitions alone are insufficient.
5. Audit pilot instructions for undefined jargon, quantities, ingredient preparation, equipment, sequence, and realistic beginner timing. Fix the Bolognese equipment/parallel-task inconsistency and explain "al dente" in context. Separate active time from total time where measured.
6. Prepare EN/DE content and a practical demonstration asset list. Prefer actual process photos or short clips at difficult steps; verify rights and culinary accuracy before publication. Avoid generating an apparent reference photo that has not been checked against the actual outcome.
7. Prepare the experienced-cook review and beginner recruitment materials alongside drafting, not after the software is built. Arrange actual review/participants through user-authorized coordination; record pending assets and culinary review explicitly. The content draft is deliverable before external review, but does not become validated teaching merely by syncing successfully.

Acceptance: each pilot recipe has a coherent equipment/step sequence; every focus skill has an actionable lesson and at least one practice recipe; the path includes repeat practice across dishes; translations match; ingredient/nutrition parsing still passes. Actual participant testing belongs to #39.

Dependencies: none. Deliverable: content draft and curriculum mapping, not a full course catalog.

## #34 — Add skills, lessons, learning paths, and validated sync

Outcome: one lesson can be reused across recipes and languages without copying its content into each recipe.

Scope boundary: Slice #34a: implement the one-skill/one-lesson read/sync flow and explicit current-recipe links. Use existing dish_slug/level/lang through the resolver, not #40. A small authored next-practice mapping is sufficient. LearningPath tables/endpoints, prerequisite graphs and the full five-lesson catalog are #34b scope, not first-observation prerequisites.

Implementation:

1. Add a Skill model with stable slug, translated names, and description; a Lesson model with stable slug, skill reference, translated instructional sections, optional media/caption/alt text, and content revision; a LearningPath with ordered lesson references and practice suggestions. Start with one lesson per pilot skill without imposing that forever.
2. Add an explicit recipe-to-skill association identifying focus skills versus assumed skills. Use #47a's current recipe reference for the pilot; migrate links through #40/#47b later using the same common resolver. Use explicit content links rather than English keyword matches as the learning source of truth.
3. Define file formats in content/skills/, content/lessons/, and content/learning-paths/. Keep authored text in content files and derived database rows in the current sync workflow.
4. Add scripts/sync_learning.py and a Flask sync-learning command. Validate duplicate slugs, missing references, language completeness, permitted section types, media metadata, and invalid prerequisite cycles before committing a sync.
5. Add migrations and read-only /api/skills, /api/lessons/<slug>, and /api/learning-paths endpoints. Return learning expectations and recipe links, but apply existing recipe entitlement checks when returning recipe content.
6. Define glossary-to-lesson links. Retain glossary entries that have no lesson, especially nutrition definitions. Keep old glossary URLs functional and support German references explicitly.
7. Add the command to the release sequence only after migrations and referenced recipe/glossary syncs are available. Do not automatically delete removed content that historical practice records reference; archive it.

Likely files: models.py, app.py, migrations/, scripts/, content/, new routes/learning.py.

Acceptance: all pilot lessons sync in both languages; repeated sync creates no duplicates; a missing skill reference fails clearly without partially publishing the curriculum; an existing glossary link still works. Test content validation and migration on a disposable database.

Dependencies: #33a content and #47a pilot fixtures. No #40 dependency. Drafting is independent; expand schema only for the selected slice. No personal learning state is stored by this task.

## #35 — Make cooking steps support instruction and help

Outcome: Cook Mode can reliably show quantities, demonstrations, checkpoints, and independent timers.

Scope boundary: Slice #35a: convert only the starter recipe, normalize legacy prose, add contextual lesson/success cues and the lightweight session snapshot in section 4. Rich allocations and multiple-timer metadata can follow as #35b when the content needs them. No full revision graph.

Implementation:

1. Extend the recipe content format with stable ingredient IDs and optional structured step data. Each step has a stable ID, instruction text, ingredient references, optional quantity allocations, skill/lesson references, success cues, why text, troubleshooting entries, and zero or more explicitly labelled timers.
2. Keep the current gram anchors authoritative for nutrition. Add structured display amount/unit fields where needed for pilot step scaling; validate allocations for divided ingredients. Do not infer allocated quantities from arbitrary prose or present every ingredient's total as the amount used in each step.
3. Convert only pilot recipe steps initially. Parse existing numbered prose into the same canonical step shape so other recipes remain usable. This compatibility is temporary debt owned by #57, with an inventory of remaining recipes/consumers and an explicit removal gate.
4. Add a serializer that provides plain instruction text to existing recipe/SEO consumers and instructional detail to the new Cook Mode. Audit every consumer of tier.steps, including seo.py and teaser construction in models.py.
5. Apply the recipe access decision before serializing structured help. A locked recipe must not expose its withheld instructions through checkpoints, troubleshooting, media captions, or a lesson's recipe-specific example. Generic public skill teaching remains separate.
6. Validate timer values, stable IDs, ingredient references, and lesson links during sync. Capture the lightweight server-issued content snapshot/fingerprint from section 4 for a running session; do not fetch a newer snapshot at completion. Full RecipeRevision linkage is a later #40 migration.

Acceptance: pilot steps expose correct scaled amounts and learning help; existing recipes and SEO retain readable instructions; locked tiers remain locked through every representation; a recipe with two simultaneous timers can be represented without prose parsing.

Dependencies: #33a, #34a, #47a. No #40 dependency. #57 tracks prose compatibility separately from later version migration.

## #36 — Build Learn and improve guided cooking

Outcome: the user can enter through either a learning interest or a meal and receive help at the moment it is needed.

Scope boundary: Slice #36a: one accessible lesson entry, contextual help that returns to the same cooking step, and integration with completion/reflection/next practice. Retain current navigation and existing cooking controls. Expanded preparation screens, richer guidance modes and multiple persistent timers below are #36b; do not wait for them to observe the starter flow.

Implementation:

1. For #36a, preview a lesson entry/detail and contextual help without reorganizing navigation. For #36b, preview the fuller Learn landing/path; replacing the glossary destination requires that later design approval while keeping reference lookup and existing URLs available.
2. Add Learn pages/routes, frontend API helpers, and a Zustand learning-content store. Show the pilot path, skill lookup, lesson expectations, and practice recipe links. Make generic public lessons available without account creation.
3. Add a preparation screen for pilot cooks: cookware, ingredient checklist, expected time, and focus skills. Provide a concise repeat-cook route through preparation.
4. Render structured steps with their needed ingredients, observable checkpoints, and expandable "Show me", "Why?", and "Need help?" content. Return from a lesson to the same cook/step.
5. Add a guidance preference (detailed/concise) independent of recipe difficulty and subscription. Show both the current step and access to an overall recipe view.
6. Replace the single step-bound timer with named timers using finish timestamps. Persist a cooking session locally, support pause/resume and refresh, and keep timers running when changing steps. Verify elapsed time on return from a backgrounded tab; do not promise background alarms unsupported by the browser.
7. Allow anonymous users to cook public Basic recipes; offer account creation to save personal history. Preserve Intermediate/Premium checks and never send a guest completion to an authenticated endpoint as if it succeeded.
8. Consume #50's cache/session policy before shipping personal endpoints: only approved public content is cached; private/premium responses cannot be reused across accounts. Scope cooking session data to its user, current recipe reference and captured snapshot (version/revision after #40); clear private state on logout. Pending reflection synchronization is owned by #37.

Likely files: App.jsx, BottomNav.jsx, GlossaryPage.jsx, CookMode.jsx, useSettingsStore.js, frontend/public/sw.js, new Learn pages/stores and API helpers.

Acceptance: a user can open a lesson inside a cook and return without losing the step or timers; concise mode preserves essential instructions; a guest can finish a public recipe; logout/account switching never exposes another user's learning state; all pilot paths work in EN/DE and both themes.

Dependencies: #36a needs #34a, #35a and #50; richer #36b controls consume their corresponding later content slices. Keep existing Meal Plans navigation reachable; #45 owns final navigation integration.

## #37 — Add reflection and explicit practice records

Outcome: record a useful learning history without claiming that completion proves competence.

Scope boundary: Slice #37a: completion first, optional outcome/note, explicit confirmation of the one focus skill and optional editable confidence, with ownership/export/delete coverage. Broader lesson-resume records and repertoire management below are #37b. Keep omitted fields genuinely unknown.

Implementation:

1. Extend the idempotent CookLog contract delivered by #48 with optional reflection fields. Reuse its stable session and optional pilot snapshot reference; do not add a competing cook ID or retry mechanism.
2. Add SkillPractice rows referencing the cook and skill, with explicit user confirmation; add UserSkillState for current confidence (unknown / wants guidance / comfortable independently), optional interest, and update time. Keep practice history separate from the editable current assessment. Add a minimal user/lesson visit record with last-opened time and content revision for resuming material; call it "viewed", never "learned". Historical practice changes only through an explicit user correction or deletion.
3. Add a user-specific confident-dish/version selection. It must be deliberately selected by the user, not inferred from a successful cook or favorite.
4. Return the saved cook ID from POST /api/cook-log. Add an owner-scoped PATCH /api/cook-log/<id>/reflection for outcome, selected practiced skills, and an optional bounded note. Validate skill IDs against the session's recipe/content snapshot. Add PUT /api/me/skills/<slug> for confidence, PUT /api/me/lessons/<slug>/visit for resuming material, and PUT/DELETE /api/me/repertoire/<dish_slug>/<version_slug> for confident-dish selections (map existing level slugs until #40).
5. Save completion before showing reflection. Let the user skip the whole reflection or individual questions. Limit the prompt to the cook's focus skills; offer deeper editing later from My Learning.
6. Support correcting a mistaken cook or reflection with owner-scoped deletion/update. Remove dependent practice records consistently; do not rewrite independently reported confidence unless the user changes it.
7. Extend account export/delete to the new state, private notes, and confident-dish selections. Include existing favorites in the data-coverage audit so the updated flow is complete.
8. On a failed save, show a retryable unsaved state. If storing a pending submission locally, scope it to the account and session, reuse its idempotency ID, and clear it on logout. Do not claim an offline action is synced until the server confirms it.

Acceptance: skipping reflection saves the cook and no invented skill practice; confirming one skill records only that skill; retrying completion saves once; confidence can be revised in either direction; old cooks retain their history without fabricated assessments; another user cannot read/change a note; export and deletion cover every new personal table.

Dependencies: #37a needs #34a, #35a, #48 and #50; broader #37b state is separate. Reflection UI integrates with #36; #32 retires the reward display independently.

## #38 — Build My Learning and explainable suggestions

Outcome: users understand their experience and can choose a useful next meal without chasing a score.

Scope boundary: Slice #38a: useful history plus an authored, access-checked next-practice link with a reason; allow dismissal or repeating the recipe. Full learning dashboard, repertoire and generalized deterministic suggestions below are #38b, after observation. Do not require a recommendation engine to test the learning loop.

Implementation:

1. Evolve the history screen from #32 into My Learning: recent cooks, practiced skills, editable confidence, saved interests, and dishes the user feels comfortable cooking. Keep these sections distinct; do not calculate an overall percentage of cooking mastery.
2. Build GET /api/me/learning and /api/me/learning/suggestions. Keep user-specific state in a dedicated frontend store and clear it at logout.
3. Implement deterministic suggestion rules: a selected difficulty/problem offers the relevant help plus optional repeat; an explicitly practised skill offers another eligible dish using it; a declared interest offers its introductory lesson; otherwise offer the pilot's first accessible meal. Use recency to order useful choices, never to subtract progress.
4. Return at most three suggestions, each with a reason, lesson/recipe target, and focus skill. Exclude unavailable language content and recipes the user cannot cook under their current access; any paid exploration belongs in a clearly separate section. Expose the same eligibility/rationale service to #43 rather than maintaining a separate progression algorithm in meal-plan generation.
5. Make repeat, skip, and "not interested" available. Persist dismissals by user and stable suggestion key through an owner-scoped dismissal endpoint so the same suggestion does not immediately reappear. Include this preference state in account export/delete. Keep prerequisites advisory; experienced users can choose freely.
6. Treat self-reported confidence as a preference for support, not proof. No "mastered", mandatory cook counts, or forced automatic version upgrades.

Acceptance: a new user, a user with only old cook logs, a user requesting help, and a confident returning user each get coherent views; suggestions explain themselves; dismissals stick; a free user is not told to perform a locked recipe as their only next step.

Dependencies: #38a needs #36a/#37a, not completion of their full parent tasks. #38b consumes broader learning state when selected. No AI service is needed; the initial authored link needs no recommendation infrastructure.

## #39 — Validate the pilot before expanding

Outcome: evidence that users can complete a meal and reuse what they learned; a list of specific corrections rather than a broad redesign.

Scope boundary: #39a prepares now and observes the first usable one-dish slice with one or two beginners; #39b expands observation after corrections, provisionally three to five participants total. These are qualitative sessions, not statistical proof.

Implementation:

1. Run local content validation, focused API tests for access/isolation/idempotency, migration verification on a disposable populated database, and the frontend build. Exercise legacy recipes alongside pilot recipes.
2. Verify the thin path before #39a; include the following richer controls only once implemented. For the expanded pilot, verify the complete path in a real browser: lesson → recipe → preparation → contextual help → overlapping timer → completion → optional reflection → suggestion. Check mobile layout, keyboard use, EN/DE, both themes, reload/background behavior, and offline/account boundaries.
3. Prepare the guide/observation sheet alongside #33a. Arrange one or two early beginners only through user-authorized outreach; do not wait for the three-dish curriculum. Broader sessions follow corrections. Participant availability and cooking conditions are external dependencies.
4. Observe one first cook, one repeat if practical, and a different dish using a learned skill. Record where the person hesitates, requests outside help, cannot recognise success, or ignores an explanation. Ask whether the suggested next action makes sense to them.
5. Compare first and later attempts qualitatively: independence, ability to explain a cue, and willingness to cook again. Self-reported confidence supports this evidence but is not a competency test. Do not claim statistical validation from a small pilot.
6. Fix observed recipe/lesson blockers and retest the affected flow. Keep external participant results separate from automated or agent-driven QA; missing participant feedback means the teaching hypothesis remains unvalidated.

Acceptance: release checks pass; every pilot skill has accurate instruction and a usable practice link; beginner feedback is documented or explicitly still pending; findings identify the next smallest content/product change. Deployment remains a separate explicitly authorized action.

Dependencies: preparation has none; #39a observation needs only the usable #33a–#38a slice, reliable completion and #50. Full #39b QA covers the features actually added; do not gate early observation on whole-task completion. Run a separate integration matrix for #51–#56 as those features ship. Existing Lighthouse and real-browser PWA checks remain open and must be included where relevant. Report engineering acceptance and human learning validation as separate statuses.

## #40 — Support variable, named recipe versions

Outcome: a dish can have one, two, four, or another justified number of versions; version names explain meaningful differences.

Scope boundary: Later release, not a teaching prerequisite. Select this work when flexible curated versions or personal recipes/variations are authorized. #47b freezes the detailed model; adopt pilot snapshot references without rewriting their historical meaning.

Implementation:

1. When this later release is selected, implement #47b's RecipeVersion/RecipeRevision contract before its personal-library/variation consumers. Include stable slug, owner/visibility, display order, localized label, optional difficulty, change summary, focus/assumed skills, time/equipment, and explicit access. Use pilot findings later to choose actual additional curated versions; the core migration does not require a finished pilot.
2. Introduce RecipeVersion and immutable localized RecipeRevision identities and link translated RecipeTier current content to them. Initially backfill basic/intermediate/advanced one-for-one with an initial revision per language. Preserve all content and explicit public/account/premium access. Support private versions without accidentally adding them to the public dish catalog.
3. Add nullable version/revision references to CookLog, PlanEntry, and MealPlanItem and migrate learning associations. Backfill by dish plus existing level/language where available. Historical CookLog lacks an exact content revision/language: retain a legacy/unknown marker instead of claiming today's snapshot is what was cooked. Verify all mappings and counts before constraints; preserve legacy columns initially.
4. Accept legacy level requests and old cook URLs through a compatibility mapping. Use canonical version IDs/slugs for new writes; retain archived version metadata for history.
5. Remove fixed three-item assumptions from discovery indicators, recipe comparison, ChefHats/board-rack tabs, Cook Mode, MealPlansPage, SharedMealPlanPage, planner, generator, sync validation, API validators, and access.py. Preserve existing approved designs where applicable. Unknown versions or missing access declarations fail closed.
6. Update content filenames/metadata and support a transition period. Migrate SEO's choice of public recipe explicitly rather than selecting a potentially locked fallback. Validate every API path that serves or consumes recipe content, including batch plan-to-list building.
7. Pilot one single-version and one four-version dish in test fixtures before changing real editorial content. Add/remove real versions only where the learning/content audit supports it; archival must preserve old cook history and planned-meal handling.

Curated sync and revision rules:
- Compute a deterministic semantic digest per version/language. Exclude deployment time, last-synced timestamps, key ordering and incidental formatting; explicitly document normalization without stripping meaningful recipe text.
- An unchanged successful sync appends zero revisions. A semantic content change appends exactly one revision for each affected language, even if several fields change. EN-only changes must not manufacture a DE revision.
- Include ingredient quantities/mappings, servings, instructions, teaching metadata and displayed nutrition/calculation inputs in the digest. A change to a used food's relevant nutrient/weight data triggers a new affected snapshot; changes to unrelated foods do not. Never recompute old snapshot nutrition using today's food table.
- Validate the complete affected input before atomically publishing revisions/current pointers. Failed sync leaves no partial publication. Concurrent/retried sync of the same digest must not duplicate revisions; enforce a deduplication constraint/transaction.
- Old cooks, variation originals and events stay pinned. Offer explicit update/recalculation for a future event. During migration, retain/link the pilot content blob and hash; do not label a new backfill revision as the original content of an unknown historical cook.
- Personal deliberate Save creates a revision only for a meaningful content change; a no-op save does not. Autosave/keystrokes update drafts only. Restore is an explicit append action with provenance, never history deletion.
- Verify unchanged deploy twice, EN-only edit, relevant/unrelated food edits, failed/concurrent sync, no-op personal save and stable historical cook/event content.

Acceptance: one-, two-, and four-version fixtures work through browse, cooking, planning, groceries, logging, and translation; existing recipe URLs and history remain meaningful; free/account/premium access is unchanged unless #44 separately authorizes a change; content sync remains repeatable.

Dependencies: #47b and #44's recorded “preserve existing grants” mapping unless a different policy is explicitly approved. This is later roadmap scope, not on the teaching pilot's critical path. It may run independently only if separately selected. Pilot findings govern editorial expansion. #57 owns old-field retirement. Do not rewrite all 90 recipes merely to land identity.

## #41 — Make shopping easier and household sharing optional

Outcome: a solo cook gets a usable shopping list immediately, and a shared kitchen remains supported.

Scope boundary: Slice #41a: only first-write solo-kitchen setup and safe existing-household behavior. Categories, already-have review, package guidance and substitutions are later #41b scope; no version/library/nutrition prerequisite for #41a.

Implementation:

1. Keep the existing household ownership model internally. On an explicit first add/plan action, create a private single-member kitchen transactionally if none exists; reading a page alone should not create resources. Remove the setup wall from the normal shopping flow.
2. Make sharing an optional action. Define joining behavior before shipping: preview an explicit merge/keep/discard choice for existing private lists/plans, never silently lose items. Preserve ownership checks and last-member cleanup.
3. Add stable grocery categories to food metadata with EN/DE labels. Group the list for shopping and retain "used in" recipe references and manual items.
4. Add a separate "already have" selection during recipe-to-list review. Keep it distinct from "bought/checked" and scope it to that shopping operation; do not imply an automatically maintained pantry.
5. Show useful purchase guidance only when backed by authored unit data, such as a known can size. Keep recipe-required weight visible and never invent exact pack counts from unknown produce sizes.
6. Add a small curated substitution list with context/limitations and a note to check dietary suitability. Shopping advice must not silently alter recipe ingredients or computed nutrition; an actual recipe substitution needs a validated variant or explicit recalculation.

Acceptance: a new solo account can add a recipe without household setup; existing shared accounts still see the same list; already-have items are omitted as selected; categories localize; joining a kitchen cannot silently discard private items.

Likely files: routes/groceries.py, models.py, GroceryPage.jsx, grocery API helpers, content/foods.json, sync scripts, migrations. Dependencies: #41a uses existing ownership and can start independently; #50 must protect affected private flows. Coordinate actual route/schema overlaps with #49; #41b may consume #54 metadata when available. Do not gate the no-household fix on completion of nutrition or teaching.

## #42 — Add optional preferences and better discovery

Outcome: users can find a feasible meal or skill practice without a long onboarding questionnaire.

Implementation:

1. Add skippable preferences for available equipment, serving count, dietary exclusions, and typical available cooking time. Add skill interests separately; do not ask for a universal beginner/intermediate/advanced self-rating.
2. Store persistent signed-in preferences with account-scoped read/update/export/delete handling. Keep per-search overrides separate so selecting a quick meal tonight does not rewrite permanent preferences.
3. Add time, equipment, and skill filters alongside existing recipe search. Use version-specific metadata; a dish must not qualify through one version while displaying a different incompatible version.
4. Explain matches and missing metadata; offer an explicit way to relax non-dietary constraints when no recipes match. Never silently relax dietary exclusions to fill the results.
5. Make the same eligibility filter available to suggestions and planner templates. Show that authored dietary tags support discovery and do not verify every packaged ingredient or substitution.

Acceptance: skipping setup leaves discovery usable; version selection respects the chosen constraints; changing a temporary filter does not overwrite preferences; no-match behavior is clear; preferences are private and included in export/delete.

Dependencies: #34 for skill filters; extend identities for #40 when it ships.

## #43 — Connect learning to a simple meal planner

Outcome: a user can plan familiar meals and a manageable amount of practice, then shop accurately.

Implementation:

1. Extend the shipped MealPlan/MealPlanItem bundles and /api/meal-plans/generate; do not create another template system. Use an optional three-meal suggestion: familiar meal, one learning meal, another using that skill. Replace the old global tier-count progression with #38's explicit practice/confidence signals.
2. Filter bundle/generator choices using #42 preferences and current access. Show why each recipe was suggested; add per-item servings and stable item identities. Preserve existing plan sharing, editing, card controls, and apply-to-week. Support a leftovers/custom note with no ingredients if compatible with #47's item-kind contract.
3. Add explicit date-range selection to plan queries and list generation. The current build-list endpoint processes every household plan entry; scope the new workflow to the selected period.
4. Consume #49's source-contribution service for /plan/build-list and /meal-plans/<id>/grocery-list; never add another aggregation algorithm. Preserve stable MealPlanItem IDs when editing (the current delete-and-recreate update loses them). Make apply-week retry-safe using operation IDs while allowing a deliberate new application on another date. Preview changes to purchased quantities.
5. Revalidate every selected recipe's existence, language, servings, and entitlement on the server at list-build time, including batch paths. Report inaccessible/archived entries instead of silently skipping them.
6. Suggest ingredient overlap only from available content data. Do not promise zero waste, exact grocery cost, or automatic stock tracking.

Acceptance: changing one meal updates only its contributions; building the same selected plan twice does not double ingredients; dates and servings persist; manual groceries survive; a locked recipe cannot be added through batch planning.

Dependencies: #38b suggestions where used, #41, #42 and #49. Current-reference bundle improvements need no #40; adopt its resolver when that migration ships. Named-bundle improvements that do not need learning may ship earlier. #26 can later convert language into this same validated plan proposal.

## #44 — Decide learning access independently of difficulty

Outcome: users understand what they can learn, and access is no longer inferred from a difficulty label.

Implementation:

1. Prepare a content access matrix covering public lessons, account-saved learning, complete practice paths, and premium content. Compare keeping current access with offering a complete free starter path; include the effect on existing accounts and recipes.
2. Identify exactly which recipes/versions would change access and any pricing implications. This task requires a product decision before changing entitlements; the backlog does not assume all teaching or advanced content becomes free.
3. With the chosen policy, use explicit public/account/premium requirements per version/content offering, coordinated with #40 and #47. Preserve current grants by default to unblock the additive core. The older #20 position-based rule was unconfirmed; do not derive entitlement from ordering. Test source restrictions on personal copies through #53 as well as plan/event consumers.
4. Describe access before a user starts a path; never present a locked mandatory step as an unexpected next action. Keep paid exploration separate from actionable practice suggestions.
5. Update recipe teasers, learning-path copy, settings, and product documentation together. Checkout/subscription billing is a separate future scope, not part of this task.

Acceptance: difficulty/guidance can change without accidentally changing access; one chosen starter journey is coherent under its stated requirements; legacy users receive the chosen transition behavior; no unexplained dead end appears in the pilot path.

Dependencies: decision may happen before the pilot release; entitlement implementation coordinated with #40. No price is assumed here.

## #45 — Simplify navigation and supporting features

Outcome: teaching and cooking are easy to find without increasing the number of competing destinations.

Implementation:

1. Review #39 observations and the shipped five-tab navigation before proposing changes. Keep Meal Plans (/plans), its public links, Groceries/week planning, personal Library, Learn, and event entry points discoverable. A single Plan destination with Meals/Week/Events subviews is a proposal, not a pre-approved deletion of the Meal Plans tab. Preview the full information architecture, including definitions under Learn.
2. Keep nutrition available on recipes, but evaluate moving calorie-led discovery emphasis behind cooking time, needed skills, and equipment. Preserve the approximate-values explanation and computed source of truth.
3. Retain favorites as quick access; keep them distinct from "comfortable cooking" and learning interests. Remove unused reward copy/assets after compatibility needs from #32 expire.
4. Review deferred features against the teaching goal. Keep full unit conversion, real-time household sync, and richer meal-list management on the backlog only where actual user friction warrants them; do not silently mark existing work complete or delete its history.

Acceptance: a beginner can find a meal, help, their list, and their learning record without understanding product jargon; glossary/recipe deep links still resolve; nutrition remains accessible; no active game reward language returns.

Dependencies: #39 findings. Keep the established typography, theme tokens, and visual language; this task is not a rebrand.

## #46 — Expand the curriculum deliberately

Outcome: grow coverage where users need more help or useful next dishes.

Implementation:

1. Rank pilot feedback and content gaps, then choose one next path such as eggs/heat control, sauces, or baking fundamentals. Define practical outcomes before choosing recipe count.
2. Reuse existing lessons and improve weak ones before adding overlapping explanations. Map skills across existing dishes before commissioning new dishes.
3. Apply the recipe/lesson audit, EN/DE completeness checks, demonstration review, and novice cook-through to each new path.
4. Publish meaningful recipe versions only; adding a dish does not require manufacturing three difficulty levels. Keep historical versions accessible to history even if removed from discovery.

Acceptance: every new lesson has an appropriate practice opportunity; every new version explains its useful difference; content review and beginner findings accompany expansion.

Dependencies: #39; #40 when new content needs variable version counts.

## Verification and migration rules across tasks

- Use additive migrations and populated disposable databases for learning/version changes. Preserve existing recipe content, cook logs, plans, favorites, and account ownership unless a separate task explicitly changes them.
- Enforce account/household isolation and entitlement checks on every new or modified endpoint. Include the batch planner path and structured recipe serializers in access tests.
- Keep personal learning history distinct from public recipe/lesson caches. Verify account switching, logout, stale service workers, and premium-access changes where caching is involved.
- Use focused tests for migration mappings, content-reference validation, idempotent writes, ownership, suggestion eligibility, and contribution arithmetic. Use browser checks for navigation, preparation, contextual help, timers, and reflection. Documentation-only planning does not require an application build.
- Do not claim learning mastery from a viewed lesson, elapsed time, a recipe completion, or AI inference. Do not auto-populate confidence for existing users.
- External participant recruitment, filming, culinary review, and publication may need people or assets the agent cannot supply. Prepare concrete materials first, report remaining dependencies precisely, and never substitute agent QA for observed beginner feedback.
- Keep P5 hardening, Lighthouse, and offline verification visible in PIPELINE.md. The learning roadmap does not silently replace those obligations.

## Deliberately deferred

Leaderboards and replacement points systems; compulsory tests; automated skill certification; a full pantry inventory; generic AI-generated recipes or unreviewed coaching; broad social feeds; grocery delivery integrations; complex calendar optimization; large recipe-library expansion; billing implementation. Revisit only with a concrete user need and explicit scope.

### #58 — Deferred external import adapters

Keep this allocated ID; do not assign implementation or provider setup in the active package. Archived Spoonacular, Fooby, Open Food Facts, CocktailDB and USDA code is reference material, not evidence that integrations currently work. Fooby was only a metadata stub.

Reactivation checklist:
1. Identify a concrete unmet user need after manual entry/library basics; select one adapter, not the whole archive.
2. Verify current official API availability, authentication, storage/display rights, quotas and cost. Obtain required approval/credentials; never reuse archived secrets.
3. Depend on #51/#54's relevant draft/food interfaces. Import into an attributed, user-reviewed draft; preserve missing values. No silent save or automatic first-result food match.
4. Define sanitization/server-fetch restrictions, timeouts, limits and duplicate-source behavior. Test with provider fixtures and keep manual entry functional without the service.
5. Estimate and authorize that bounded slice before implementation; keep #26 catalog-based natural-language planning separate.

Recommended first work package: section 5's #50, #33a/#39a, #47a, #48/#32 and one end-to-end teaching slice. #41a/#49a remain separately assignable maintenance. Library, variations and events are retained future release choices, not automatic parallel starts.


## #47 — Establish the integration baseline and staged contracts

Outcome: agents use the same current base and only the contracts needed for their selected release.

### #47a — Pilot interface; active now

1. Preserve planning changes and inspect incoming work. Prepare an integration base at or after dccd4db; record SHA, migration head and actual file overlaps. Do not overwrite unpushed work or newer task IDs.
2. Publish a small fixture set under docs/contracts/: existing dish_slug/level/lang reference; one skill/lesson; structured starter step; authorized content snapshot/hash; cook session/reflection; eligible authored next-practice link.
3. Include public/locked examples, unknown historical content, stable IDs and server-owned fields. Keep current entitlements and URLs. No RecipeVersion/RecipeRevision migration, branch graph, generalized course or shopping/event schema required.
4. Agree the interface with #48 and the content agent. #48 may land first using existing references. #50, content drafting, #41a and #49a do not wait for this package.
5. Order only migrations actually required for selected slices. Feature agents edit needed full-stack files in isolated checkouts; reviewer coordinates real conflicts and integration order.
6. Maintain a small consumer inventory for #35's serializer/snapshot change, including SEO, Cook Mode, existing recipes and legacy clients; link cleanup to #57.

Acceptance for #47a: the teaching agent can build the one-dish flow against fixtures without inventing fields; current base includes shipped meal-plan work; no full future-domain migration is required.

### #47b — Future version/library contract; not active pilot scope

1. When #40/#51/#53 are selected, refine section 4's later model into fixtures for private/adapted recipes, immutable localized revisions, source provenance, current pointers, conflicts, archive/deletion and access.
2. Define adoption/linkage of pilot snapshots and migration of current references without falsifying historical content.
3. Include MealPlanItem, public shares, dated planning, SEO and events implemented so far. Avoid a separate incompatible personal-recipe namespace.
4. Specify quantity/ingredient identities and the deterministic sync rules in #40, with explicit tests and ordered additive migrations.
5. Publish versioned changes before dependent library/variation code, not as an upfront requirement for unrelated work.

Acceptance for #47b: future consumers share validated version/revision/access fixtures and an ordered migration plan. Track #47a complete separately while #47b remains planned.

Owner: teaching feature owner with integration/review for #47a; assigned version/library owner with review for #47b. Dependencies: none for baseline preparation; later contract work starts only when that release is selected.

## #48 — Make cook logging retry-safe

Outcome: one cooking attempt produces one history entry even on double-click, reconnect, or retry.

Implementation:
1. Publish the existing-reference request contract and coordinate it with #47a: client-generated session_id plus recipe reference; user identity always comes from JWT. Support older clients temporarily.
2. Add a unique (user_id, session_id) constraint, allowing legacy rows with no key. Do not deduplicate old logs heuristically: two identical cooks could both be real.
3. Return the existing cook for a repeat of the same key/payload; return a clear conflict if the key is reused for another recipe/revision. Resolve concurrent insert races transactionally.
4. Create the key once when a cooking session starts, persist it in account-scoped session state, and reuse it after refresh/network failure. Starting another cook intentionally creates a new key.
5. Accept the server-issued session snapshot from #35 when available; do not substitute current content on completion. Before #35, retain the existing recipe reference and mark uncaptured source content unknown. Do not fabricate historical revisions.
6. Keep completion and later reflection separate. Return a durable cook ID for #37. Include the new fields in export/deletion coverage.

Owner/surfaces: learning backend with coordinated schema changes; routes/progress.py, progress API client, cooking session helper.

Acceptance: concurrent duplicate submissions create one row; different sessions create two; a mismatched replay conflicts; legacy logs remain; user A cannot inspect or replay user B's record. Test retry and account switch in the UI.

Dependencies: none for current-reference idempotency. Share payload fixtures with #47a and add #35 snapshot support when ready; no #40 prerequisite.

## #49 — Reconcile shopping quantities and plan applications

Outcome: updating or rebuilding a source changes only its own grocery requirements.

Scope boundary: Slice #49a: fix retry/rebuild correctness for existing plan/list flows using current recipe references and stable source/item identities. Implement only the necessary source-contribution core; preserve manual/purchased items and existing totals honestly. Add the EventDish adapter as #49b when #55 is selected. Neither slice gates the teaching pilot.

Implementation:
1. Define a source application identity and stable line identity for direct recipe adds, MealPlan applications, PlanEntry items, and future EventDish rows. Keep intentional new additions distinct from retries of one operation.
2. Add normalized contribution records with source owner/container, source instance/item/ingredient, current recipe reference (optional snapshot now, full revision later), required quantity/unit/food mapping, and an explicit purchased/review state policy. Preserve manual list items independently.
3. Compute each source's desired requirements, compare with its previous contribution set, and transactionally insert/update/remove differences. Aggregate compatible quantities by food identity and unit dimension; unknown units stay separate.
4. Route /plan/build-list, /meal-plans/<id>/grocery-list, and direct recipe operations through this service. Filter date ranges explicitly. Validate recipe visibility, entitlement, servings, and language at execution time.
5. Fix MealPlan edits to preserve stable item IDs. Give apply-week an operation key and persisted application mapping; retrying an application must not duplicate PlanEntries. A new date/application is intentionally separate.
6. Preserve checked/purchased items during edits. Preview a delta that needs more shopping; do not treat quantities already bought as still-to-buy or quietly uncheck unrelated items. Define zero/negative/unknown quantity handling.
7. Treat existing mixed grocery totals as legacy/manual contributions until explicitly rebuilt or cleared; do not claim historical source attribution that was never stored. Offer a preview before a migration/rebuild can replace them.
8. Add an EventDish source adapter as #49b only when #55 is selected; it is not required for #49a acceptance. Introduce no event UI in this task.

Owner/surfaces: planning backend; contribution service, routes/groceries.py, routes/meal_plans.py, coordinated models/migrations.

Acceptance: rebuilding the same plan twice leaves totals unchanged; modifying servings applies the difference; deleting one source preserves others/manual items; two independent events with the same dish remain distinct; replaying apply-week does not duplicate dates; denied recipes fail without a partial list update.

Dependencies: none for existing-reference #49a beyond the verified code baseline. Coordinate current API/ownership fixtures and actual route overlaps with #41/#48. #49b needs the selected event interface, not #40 or #51.

## #50 — Isolate private data in caches and sessions

Outcome: personal recipes, learning records, and guest details cannot appear in another account's browser session.

Implementation:
1. Audit the current service worker: it caches API GETs without a public/private allowlist. Inventory all existing auth, meal-plan, recipe, and future personal endpoints.
2. Change the actual service-worker fetch/Cache Storage logic to bypass cache reads AND cache.put for private/authenticated API requests. Response Cache-Control: no-store alone is insufficient when worker code explicitly caches responses. Default these routes to network-only; use an explicit allowlist for genuinely public, non-personalized content. A recipe response containing entitlement-specific details must not share a public cache entry.
3. Version and clear legacy API caches on rollout. Include client logout/account switching in invalidation of stores, recipe snapshots, pending writes, and cooking sessions.
4. Provide explicit offline behavior: public cached lessons/recipes may remain usable; private data without supported account-scoped offline design shows an honest unavailable state. Do not promise private offline sync in this release.
5. Scope pending cook/reflection submissions to account/session and reuse keys from #48. Never submit one account's pending work under another token.
6. Exercise loss of premium access and expired JWTs. Server checks remain authoritative; hidden UI does not grant access.
7. Add focused real-browser checks for two accounts on one device and an upgrade from the old service worker.

Owner/surfaces: verification/security lane with integration owner; frontend/public/sw.js, auth/store reset hooks, response-cache headers.

Acceptance: A → logout → B never exposes A's data, including offline fallback; obsolete caches are cleared; existing public offline behavior has a documented verified scope.

Dependencies: none. Audit, implement and verify against current endpoints immediately; do not wait for #47 or the learning release. Must pass before shipping new personal learning/library/event flows; extend tests as endpoints are added.

## #51 — Add a private personal recipe library

Outcome: users can write recipes without adopting the curated teaching format.

Implementation:
1. Reuse the preserved meal editor flow as a reference: manual title, servings, ingredients, steps, notes, optional timing/equipment/photo/source. Use #40's recipe identity and revision model, not the historical Meal table.
2. Add owner-scoped list/create/read/update/archive routes under /api/library/recipes. Use an initial immutable revision and a base_revision_id on edits; a conflicting save offers comparison/reload instead of overwriting work.
3. Build a library with authored recipes, personal variations, and saved curated recipes distinguishable by source. A favorite remains a bookmark, not a new private copy.
4. Let a draft save with incomplete content; require enough instructions/ingredients to start a normal cooking/shopping flow, and explain missing fields. Difficulty, second language, and complete nutrition are optional.
5. Integrate personal recipes with Cook Mode, cook logging, meal-plan selection, shopping, and later event menus through the canonical resolver. Keep teaching/skill attribution opt-in and explicitly unreviewed.
6. Guard public recipe discovery, sitemap/SEO, and shared plan projections. Sharing a bundle containing a private recipe must not implicitly publish it; preview redaction/removal.
7. Add export/delete coverage and archive behavior. Previously scheduled uses can retain an authorized snapshot; disclose an archived reference rather than breaking historical cooks.
8. Keep recipe/media upload separate from scan extraction. Use approved storage access and validate limits/content before accepting user files.

Owner/surfaces: library agent owns required routes/pages/store and recipe models/router/privacy hooks in its isolated checkout; reviewer coordinates actual overlaps and migration order.

Acceptance: a one-language recipe without nutrition can be saved and cooked; ingredient amounts scale when structured and stay visibly unknown otherwise; another account cannot read it by ID; plan sharing does not leak it; concurrent saves conflict safely; history survives an edit.

Dependencies: #40, #47b, #50, and #49 for grocery integration. #54 enriches ingredients but does not block basic manual entry. This is later library scope, not a pilot dependency.

## #52 — Restore scan-to-review recipe capture

Outcome: a user can photograph a recipe and turn it into a reviewed personal draft.

Implementation:
1. Inspect the historical ScanPanel in Meals.jsx, useMealStore.transcribeImage, and routes/meals.py transcribe-image endpoint. Reuse interaction/field mapping ideas; update provider-specific implementation against current official documentation when this task runs.
2. Implement an authenticated extraction endpoint with file size/type/content validation, bounded request duration, per-user quota/rate limits, and clear unavailable/error states. Store keys server-side; no provider call until configuration/cost limits are authorized.
3. Define and validate a strict extraction schema mapping to #47b ingredient/step fields. Missing/unreadable amounts remain unknown. Source text is untrusted input and cannot override extraction instructions.
4. Display the photo beside editable extracted fields where practical. Highlight missing/uncertain data, require a deliberate Save to create a recipe, and support retry/cancel without duplicate library entries.
5. Do not infer nutrition, allergen completeness, skill competence, or reviewed status from a photo. Route ingredient matching to #54's review flow. Record that source was an image and let the user supply attribution.
6. State before upload that the image is processed by the configured external service. Use transient handling by default; keeping an original image is an explicit user choice with deletion support.
7. Test clear and low-quality images, fractions, multiple ingredient sections, unsupported files, long inputs, timeouts, malformed extraction, and quota exhaustion with fixtures. Mock provider responses for normal automated tests.

Owner/surfaces: library/import agent; extraction route/provider adapter and ScanPanel; coordinated configuration/rate-limit hooks.

Acceptance: extraction never silently saves; missing text is not filled with invented facts; failed/retried requests don't duplicate recipes; manual entry works without provider credentials; files are not retained beyond the stated policy.

Dependencies: #51, #54 ingredient mapping interface, #50. Provider model, costs, and credentials are implementation-time decisions, not assumed available from the old app.

## #53 — Add personal variations, comparisons, and revision history

Outcome: users can adapt a recipe, keep several named variations, and understand what changed.

Implementation:
1. Add “Make my version” to recipes the user is currently entitled to read. Create a new private RecipeVersion and first RecipeRevision with a server-resolved source_revision_id, source title/attribution snapshot, and provenance. Never trust a client-supplied owner or source payload as authorization.
2. Keep a source baseline for “Compared with the original” and a same-variation previous revision for “Since last time”. Revisions use stable ingredient/step IDs to distinguish edits, additions, removals, and reorderings.
3. Build a cooking-language comparison: amount changes, ingredient substitutions, step changes, portions, and notes. Normalize comparison quantities to a common serving basis where possible so scaling alone does not look like many substitutions. Unknown quantities stay explicit.
4. Normal Save appends a revision; “Save as another variation” creates a sibling version. “Restore” appends a new revision using earlier content, preserving all later history.
5. Require base revision checks for edits/restores. Keep autosave/draft state separate from meaningful saved revisions to avoid a history entry per keystroke.
6. If the original changes, show an optional comparison against the newer authorized source. Do not auto-merge recipe changes. Keep cycles impossible in source/parent references.
7. Decide the exact premium-copy and downgrade policy through #44 before enabling premium-derived copying. Default to private provenance with inherited restrictions; never provide an implicit paywall bypass or publish an entire licensed source through a shared comparison.
8. Record which exact revision was cooked, planned, or used in an event. Offer explicit “Update planned recipe” with shopping/prep delta review when a newer revision exists.
9. Preserve useful attribution if a source is archived, but enforce visibility/deletion policy for source text. Audit export and permanent account deletion across derived versions.

Owner/surfaces: library agent; variation/revision routes, comparison helper, version history UI; integration review for provenance/access.

Acceptance: independent smoky/quick variations have separate histories; original comparison stays stable after source edits; restore preserves history; serving-only changes compare sensibly; editing a library recipe does not silently alter a scheduled dinner; another user cannot inspect private source snapshots.

Dependencies: #40, #44 copy policy, #47b, #51. Personal self-authored revision history can ship before premium-copy policy is settled.

## #54 — Reuse ingredient search, nutrition tables, and units carefully

Outcome: personal recipe editing has useful food lookup and trustworthy nutrition coverage.

Implementation:
1. Inspect historical BaseIngredient, Ingredients.jsx, MealFilterBar.jsx, ingredientSearch.js, units.js, and seed_ingredients.py. Inventory fields/aliases/categories versus Cookbook FoodItem/foods.json; map identities instead of importing duplicate food tables.
2. Retain curated food records and add private custom food records/aliases with explicit ownership, provenance, unit basis, and nullable nutrients. Public lookup must not expose another user's custom entries.
3. Support name/alias/category search, selectable nutrient columns, ingredient-based recipe filtering, and clear full-recipe/per-serving/per-100g views. Don't make a large nutrient table the default cooking entry screen.
4. Normalize supported weight and volume units separately. Converting volume to weight requires food-specific density; pieces need a verified unit weight. Preserve source display text and flag unresolved amounts.
5. Compute nutrition only from verified mappings and grams; report completeness/coverage alongside partial results. Unknown is not zero. Do not reuse the old calculation that silently skipped non-gram ingredients or mixed totals with per-serving values.
6. Review the seed table before adopting values: distinguish raw/cooked foods and document provenance. External enrichment should offer candidate selection and show its source; never automatically accept the first name-search result as a correct food match.
7. For a substituted ingredient or changed quantity, recalculate the new revision's nutrition consistently. “Shopping alternative” advice alone must not silently rewrite the recipe or nutrition.
8. Test fractions, kg/g, ml/l, US volume units, ingredient-specific conversion, zero versus missing nutrients, partial mapping, and serving changes. The old unit helper is reference code, not proof every locale/unit definition fits.

Owner/surfaces: ingredient agent or library subtask; food search routes, food metadata, nutrition/conversion helpers, library ingredient editor. Coordinate schema with integration owner.

Acceptance: a partly mapped recipe is visibly incomplete; a cup of oil is not treated as a cup of flour by weight; EN/DE aliases work; edits update nutrition without erasing provenance; private foods remain private.

Dependencies: #47b quantity contract; #40 revision payload. Optional external nutrient enrichment depends on reactivating deferred #58 and is not required for the internal food tools.

## #55 — Add dinner events using existing meal-plan bundles

Outcome: several dishes can be organized for one occasion with appropriate portions and one shopping view.

Scope boundary: Later, separately selectable release. V1 uses existing curated recipes/bundles plus immutable content snapshots and #49's event adapter; it does not depend on personal library #51 or full version migration #40. Personal recipes/variations can be added after those later contracts exist.

Implementation:
1. Start with one dated DinnerEvent (name, serving date/time/timezone, host, notes, guest count). Offer “Plan this dinner” from an existing MealPlan and duplicate-event for another date. Don't require a recurring parent occasion before the first dinner.
2. Add EventDish with stable ID, current curated reference plus content-snapshot ID/hash (version/revision once available), course, explicit servings, and preparation status. Snapshot selections when creating an event so future bundle/library edits cannot silently change it.
3. Allow guest groups and dietary notes without requiring named attendees. Keep declared preferences, allergies, and unknown information distinguishable; do not automatically certify menu safety from tags.
4. Let the host choose portions per dish and alternatives for subgroups. Six guests do not imply six main-course portions of every side; never auto-increase every dish uniformly without review.
5. Generate/reconcile event contributions through #49; offer an event-focused list view that can coexist with household/manual groceries. Editing one event must not change another event's quantities.
6. Add simple prep/checklist states (to prepare / in progress / ready), manual notes, and links to each recipe's Cook Mode. #56 adds detailed timing.
7. Enforce event ownership and recipe access independently. Preserve existing public meal-plan links as menu-only projections; guest details remain private. Sharing/collaborator invitation is a separate explicit action, not inherited accidentally from household membership.
8. Extend account export/delete and archive behavior. If a pinned recipe becomes unavailable, explain it and require an accessible replacement rather than silently omitting it.
9. Reuse old Event/EventOccurrence/Guest/Meal relationships as design references. Do not port the old add-meal route without checking recipe ownership or the name-deduplicating shopping sync.

Owner/surfaces: planning/events agent; event models/routes/store/pages, MealPlansPage event action, contribution adapter. Feature owner edits required migrations/router wiring; reviewer coordinates integration order.

Acceptance: a dinner with mains/sides/dessert has distinct portion settings; copying a bundle preserves it; repeated shopping generation is stable; changing source curated content doesn't change the event snapshot (repeat with personal recipes when supported); guests and private recipes never leak through a shared meal-plan URL.

Dependencies: existing MealPlan bundles, #49 event-source support and #50; reuse #35's lightweight snapshot facility or implement that bounded facility from section 4 if events are separately selected first. #41a is needed only if entering through household-backed shopping without existing membership. No #40/#51 prerequisite for curated-only v1. Explicitly check snapshot access and preserve selected content.

## #56 — Add a practical event preparation schedule

Outcome: the host can see what to do in advance and what is needed before serving.

Implementation:
1. First deliver manual tasks grouped into day before / earlier today / before serving, with optional start/end time, recipe link, status, and responsible-person text. Keep task ownership labels separate from actual collaborator access.
2. Adapt current wedding Schedule.jsx timeline interactions as needed, not the wedding store/blob. Store event-relative tasks and local timezone explicitly; handle dates crossing midnight.
3. Link preparation tasks to a pinned event content snapshot (or revision after #40) and optional structured step ID. An explicit event recipe-content update should offer a task-change review, not erase completed preparation.
4. Provide manual “work backwards from serving” offsets and recalculate when serving time changes, with a preview. Do not pretend total recipe duration identifies all parallel/active steps.
5. After reliable step duration/dependency/equipment metadata exists, optionally add dependency-aware suggested ordering and equipment conflict notices. Keep this advanced sub-slice deferred until authored metadata and tests support it.
6. Reuse #36's timer infrastructure only where helpful; event tasks and cooking timers must stay distinguishable. Calendar export may be added after core scheduling is validated.
7. Test a dessert prepared the day before, two overlapping dishes, a changed serving time, interrupted/reloaded progress, timezone/day-boundary handling, and archived recipe steps.

Owner/surfaces: planning/events agent; event preparation API/store/UI, timeline component adapter, timer integration.

Acceptance: a host can track preparation across several dishes, retain completion after reload, and reschedule deliberately. The first release makes no promise to optimize oven capacity or automatically produce a safe complete cooking schedule.

Dependencies: #55; structured-step/timer integration consumes #35/#36. Manual scheduling may ship first.

## #57 — Retire temporary recipe compatibility paths

Outcome: legacy support is owned, bounded work rather than permanent duplicate implementations.

Implementation:
1. Maintain an inventory of prose-only recipes, legacy level references, plain-step consumers, old client API fields, and any unconverted plan/history references starting when #35/#40 land.
2. Convert remaining curated content after the pilot format stabilizes; retain human review and EN/DE pairing. Personal drafts may remain plain authored text, but must normalize to the same runtime step shape.
3. Run reference/backfill audits across MealPlanItem, PlanEntry, CookLog, skills, personal revisions, events, shopping contributions, and SEO. Historical unknown revisions remain explicitly unknown.
4. Keep legacy URL redirects/resolution as long as external links need them; retiring duplicate storage/calculation does not require breaking public links.
5. Remove redundant serializers, mutation fields, and obsolete locale/reward strings only after the consumer inventory is empty and rollback compatibility is understood. Never drop old data to make an audit pass.
6. Use an additive release followed by a separate cleanup release; verify stale PWA clients and current frontend before retiring compatibility fields.

Owner/surfaces: integration/review with assigned feature owner. Dependencies: prose/step cleanup depends on #35 and its consumer inventory; version-column cleanup waits for #40 and its own inventory. Neither cleanup is a first-observation gate. Consumers use the contract for their selected release.

Acceptance: one runtime recipe representation/quantity calculation; no active consumer depends on retired columns; legacy links resolve; historical source unknowns remain truthful; restore/backout procedure is documented.

## Historical reuse manifest

Source repository: https://github.com/vaansinn/wedding-planner
Optional local read-only source checkout on this machine: D:/Projects/meal-planner
Preserved tag: v0-with-meal-planner → a5eb8b6c30e8a1b190f68712b8935cacdf6ac666
Removal commit: b506e2af7d3ab5a4890c9d611540a67f718fbf61 (2026-06-29).
Current wedding timeline inspected at local commit 37ef166; do not confuse that newer timeline with the archived meal planner.

| Source at preserved tag | Reuse target | Adaptation required |
|---|---|---|
| routes/meals.py; frontend/src/pages/Meals.jsx; frontend/src/store/useMealStore.js | #51/#52 editor and photo capture | Canonical revisions, EN/DE UI, ownership, validated extraction, limits; old editor overwrites ingredients |
| models.py BaseIngredient/Ingredient; routes/ingredients.py; frontend/src/pages/Ingredients.jsx | #54 food lookup and nutrient table | Map to Cookbook food identities; fix incomplete quantity/nutrition assumptions |
| frontend/src/components/MealFilterBar.jsx; utils/ingredientSearch.js; utils/units.js | #42/#54 search/filter/conversion | Source-aware quantities, supported unit standards, complete localization/theme |
| routes/events.py; pages/Events.jsx; store/useEventStore.js; Event* models | #55 event composition | Explicit recipe access, per-dish portions, revision pins, correct shopping totals |
| routes/lists.py; routes/shopping.py | #49/#55 list interaction references | Replace name-only deduplication/additive totals with source contributions |
| routes/meals.py provider sections | #58 optional import adapters | Verify external APIs; Fooby was a metadata-only stub |
| current frontend/src/components/wedding/tabs/Schedule.jsx | #56 timeline interaction | Extract small components; event-specific state, timezone and cooking dependencies |

Portable source access for other agents: use the GitHub repository above at tag v0-with-meal-planner (commit a5eb8b6c30e8a1b190f68712b8935cacdf6ac666). Supply repository read access or an authorized source archive if the agent cannot access it. No local Windows path is required. In any already-cloned source checkout:

```sh
git show v0-with-meal-planner:routes/events.py
```

If the tag is absent, obtain it from that repository in a separate source checkout; do not modify the active wedding worktree. The optional machine-local command is:

```powershell
git -C D:/Projects/meal-planner show v0-with-meal-planner:routes/events.py
```

Use the one-command safe.directory override only if ownership requires it. Never restore the tag over the wedding app or copy its database/migrations wholesale. Do not read .env files, copy credentials, query private guest records, or run the stale seed script (BaseIngredient no longer exists in the current wedding models). These sources were inspected statically; runtime/API functionality was not revalidated.

## Release acceptance and agent handback

Each task report includes:
- Task ID and completed sub-slice; base SHA and changed files.
- User-visible behavior and any approved design reference.
- Contract/API/schema changes, migration parent/head, and compatibility implications.
- Checks actually run with results; separate automated/browser checks from external user evidence.
- Known gaps, decisions, and remaining external dependencies.
- Integration order, actual overlapping files/migration dependencies, and a concise suggested commit message.

Cross-feature integration scenarios (run only the scenarios for implemented scope; personal library/events are not pilot gates):
1. Public learner: opens a lesson, cooks an accessible recipe without login, signs in to save future practice; no accidental premium access.
2. Returning account: retains old cook history, sees no XP/streaks, reports confidence optionally, receives an eligible next suggestion.
3. Personal library: writes or scans a recipe, reviews it, makes two variations, restores one revision, compares against its source.
4. Planning: includes a private recipe in an owned bundle, adjusts servings, applies to a week twice through one retry key; no duplicates or public-source leak.
5. Dinner event: creates an event from a bundle, sets per-dish portions and dietary notes, builds shopping, changes one dish, retains other contributions and preparation statuses.
6. Account boundary: A logs out and B opens the same browser offline/online; no private recipe, learning note, guest, or premium cache leaks.
7. Content revision: an original recipe updates after a cook/event was saved; pinned history stays stable and updating a future event is explicit.

Feature release gates: references appropriate to the selected release + ownership/access tests; migrations on populated disposable data; repeatable content sync; frontend build; relevant real-browser EN/DE/light/dark/mobile flows; cache boundaries for any personal data. Rehearse schema/data backout and preserve backups before production migration.

Human validation gate: actual experienced-cook review and beginner practice observations are required to claim the teaching approach works. Missing recruitment does not block completing software checks or unrelated library/planner releases, but must remain visible as pending.

Plan-only delivery: no app code, migrations, external accounts, deployments, or provider purchases are performed by producing these documents.
