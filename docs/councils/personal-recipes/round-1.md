# Independent reports

Five actual subagents; inherited model, fresh contexts; read-only analysis, not implementation or executed acceptance tests.

## Frontend / UX
Agent: 01a09a4f-06e2-73f0-84ba-4eaf8a72f1a9

Frontend / UX round 1: recommend an authenticated “My recipes” area for manual drafts, editing, private reading and cooking. Keep difficulty absent. Treat planning/shopping adapters as explicit integration work before exposing those actions.

Verified implementation:

- Home already supports search and favorites; bottom navigation has five destinations. Add “My recipes” beside discovery controls rather than another bottom tab. See [Home.jsx:179](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Home.jsx:179) and [BottomNav.jsx:7](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/components/BottomNav.jsx:7).
- Recipe reading assumes a selected tier and renders difficulty tabs; personal content cannot simply reuse this page unchanged. See [RecipePage.jsx:104](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/RecipePage.jsx:104) and [RecipePage.jsx:164](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/RecipePage.jsx:164).
- Ingredient display scales a leading number in prose, while grocery aggregation uses `qty_g` and substitutes zero for missing values. These are unsuitable defaults for manual quantities. See [scaleIngredient.js:16](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/utils/scaleIngredient.js:16) and [groceries.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:134).
- Cooking already resumes pinned snapshots and stable step positions. Preserve this behavior across personal edits. See [CookMode.jsx:96](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/CookMode.jsx:96).
- Plans currently validate `dish_slug + level`; prototype personal items use a separate, hardcoded catalog. Neither proves production personal-recipe integration. See [meal_plans.py:45](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:45) and [welcoming-planning-core.js:19](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/prototypes/welcoming-planning-core.js:19).
- Private API cache bypass is already implemented. The roadmap’s earlier unsafe-cache description is stale. See [sw.js:54](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:54).

Proposed flow and fields:

1. “My recipes” → “Add recipe” → one scrolling editor: name, servings, ingredients, ordered instructions. Show “Private—only you” once. Put timing, equipment, notes and source attribution under optional details.
2. Save incomplete work as a draft. Allow an untitled draft with a display placeholder. “Ready to cook” requires a title, positive base servings and at least one nonblank instruction; ingredients need names, or an explicit “No ingredients needed” choice. Missing amounts remain permissible and visibly unmeasured.
3. Ingredient rows carry stable ID, name, optional preparation/form, nullable food reference and quantity mode: measured, to taste, or unspecified. Measured quantities need a positive decimal and unit; preserve qualitative wording separately. Do not infer grams or merge dry/cooked forms. Steps carry stable IDs and plain text.
4. After saving, open a tier-free reading view with “Cook” primary and “Edit” secondary. Starting cooking pins the saved revision; changing servings affects that use only. An edited recipe must not replace an active attempt.

Proposed frontend/API contract:

Use owner-scoped CRUD—`/api/library/recipes` is a reasonable proposed route—with stable recipe identity, revision ID, content language, draft/readiness information and field-level errors. Creation retries reuse an idempotency key; updates submit `base_revision_id`. A conflict preserves the local form and offers comparison with the latest version before resubmission. Distinguish unsaved, saving, saved, failed and conflict states; announce results accessibly.

Keep content language separate from interface language: switching EN/DE must preserve authored text. Use persistent labels, 44px controls, keyboard reorder buttons, focused error summaries and a save bar that remains usable above the phone keyboard.

Ranked risks and mitigations:

1. **Private disclosure:** reject stale account responses, clear private views on account changes, and exclude personal content from public shares. Existing auth epochs provide a pattern: [useAuthStore.js:4](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:4).
2. **Lost edits:** conditional saves, visible save acknowledgement and navigation warnings; no silent overwrite.
3. **Misleading amounts:** scale structured measurements only; retain unknown/to-taste labels.
4. **Historical mutation:** pin revisions; clearly distinguish archive from permanent deletion and explain retained references.
5. **Scope expansion:** defer photos, scanning, branching, nutrition and component authoring. Planning/shopping require owner-aware references, quantity handling and disclosure previews first.

Acceptance checks: create/cook a one-language recipe without difficulty or nutrition; recover a failed save without duplicate creation; resolve two-tab conflicts without lost text; edit during cooking without changing its snapshot; verify account switching, shared-link redaction, export/deletion, unknown quantities, German decimals, keyboard operation and mobile layout.

Assumptions: account-required authoring, server-saved drafts and no offline authoring promise. Confidence is high in these frontend boundaries, medium in integration scope. Agreed retention/reference contracts and observed phone authoring sessions could change the recommendation. Source inspection only; no tests executed or peer reports read.

## Backend / data
Agent: 01a09a4f-085d-7111-9da4-8e0bcb8e484c

Backend / data, round 1: recommend private manual creation, explicit saving, editing and cooking with pinned revisions. Introduce shared version/revision identities incrementally; defer household planning and shopping integration until their access and quantity contracts are ready.

Verified against HEAD `5c60456`; review was read-only. No tests, migrations or production calls were run, and no peer reports were read.

Verified implementation:

- Recipes have a required dish, level and language, with uniqueness on that tuple; ownership is absent. Public discovery selects all dishes. Personal content cannot safely enter those tables unchanged. [models.py:109](D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:109), [recipes.py:29](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/recipes.py:29)
- Curated sync updates tier content in place. Cooking snapshots preserve content separately, but authorize reads solely through tier access. [sync_recipes.py:197](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/sync_recipes.py:197), [snapshots.py:103](D:/Projects/cookbook/.worktrees/teaching-hardening/snapshots.py:103)
- Cook logs require a dish and level; history dereferences `log.dish.slug`. Supporting personal recipes therefore requires schema **and** consumer changes. [models.py:374](D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:374), [progress.py:43](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/progress.py:43)
- Public meal-plan shares expose recipe summaries. Shopping adds quantities cumulatively by food slug and substitutes zero for missing weight. [meal_plans.py:245](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:245), [groceries.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:134)

Proposed contract:

1. `RecipeVersion`: opaque ID, server-assigned `owner_id`, private access, nullable curated `dish_id`, creation/archive timestamps. One language initially. `RecipeRevision`: version FK, revision number, language, schema version, immutable content, draft/usable status, timestamp. Enforce unique `(version_id, revision_number)` and a current pointer that references that version’s revision. Reuse these concepts for future curated migration; do not require that migration for manual entry.

2. Explicit save accepts incomplete drafts. A usable revision requires a nonblank title, positive servings, at least one named ingredient and one instruction. Difficulty, translation, nutrition, timing, equipment, notes and attribution are optional. Validate types, lengths and collection limits even for drafts; return errors by field path.

3. Ingredients preserve stable line IDs, name, display amount, optional decimal quantity/unit, food/form and preparation text. Unknown quantity remains null. Verified food mappings and grams are optional; never infer grams from arbitrary volume or pieces. Steps retain stable IDs and text. Store structured content as validated JSON within revisions; relational identities and constraints surround it.

4. JWT-protected list/read/create/save endpoints derive ownership exclusively from the authenticated account. Save carries `base_revision_id` and `mutation_id`: identical retry returns the original result; reused key with different content or stale base returns `409`. Commit revision insertion, conditional pointer update and retry receipt atomically. Another owner’s IDs return `404`. Server-owned access, ownership and reviewed-status fields are rejected.

5. Cooking pins an authorized usable revision at start. Extend CookLog with a revision reference and enforce either the existing curated reference or a personal reference. Update history/export/reflection consumers accordingly; preserve existing snapshot IDs and unknown historical content. Edits never change an ongoing cook.

Ranked risks and boundaries:

1. **Private-content disclosure:** ownership must cover revision reads, cooking and exports. Reject personal references in public shares and household flows initially.
2. **Lost edits/duplicate saves:** enforce database concurrency and idempotency constraints, not browser-only checks.
3. **History corruption:** immutable revisions survive ordinary edits and archival; never backfill historical cooks from today’s content.
4. **Incorrect shopping:** later integration needs pinned revisions, source-occurrence contributions, compatible units and execution-time authorization before aggregation.
5. **Incomplete deletion:** recommend distinct Archive and permanent Delete semantics. Archive preserves private history; permanent deletion removes recipe revisions and explicitly handles dependent cooks. Account export must include retained revision content; account deletion must remove it transactionally. Existing handlers enumerate tables manually. [auth.py:91](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:91)

Acceptance gates: incomplete draft recovery; one-language cooking without difficulty/nutrition; cross-account denial; concurrent save/retry conflicts; revision-pinned replay after editing; archive/delete/export behavior; legacy curated compatibility; unknown quantities preserved. Verify additive migrations and races on PostgreSQL—the existing helper creates SQLite databases. [helpers.py:23](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/backend/helpers.py:23)

Confidence: high on current incompatibilities, medium on the proposed slice. Assumptions needing product agreement are initial owner-only use and deletion semantics. Required first-release household sharing or offline synchronization would materially expand this recommendation.

## Security / privacy
Agent: 01a09a4f-0aa7-7472-bfec-03204b02f7f3

Round 1 — Security / privacy

Recommend owner-private manual recipes in separate tables and `/api/me/recipes` endpoints. Ship creation, editing, private discovery, cooking, export and deletion together. Defer uploads, publishing and household integration until their disclosure contracts are explicit. Existing catalog authorization is unsuitable for private content.

Verified boundaries and ranked risks:

1. **Critical: accidental public exposure through catalog reuse.** Anonymous listing reads every dish ([routes/recipes.py:19](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/recipes.py:19)); filters do likewise at line 97, and the sitemap enumerates every dish ([app.py:144](/D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:144)). `tier_access` allows Basic and unknown levels ([access.py:15](/D:/Projects/cookbook/.worktrees/teaching-hardening/access.py:15)). Creating personal content as Basic—or a new “personal” tier—could expose it. Keep personal records outside these queries; authorize every operation by authenticated owner.

2. **Critical: snapshots bypass ownership if reused unchanged.** Snapshot rows contain complete content without an owner field ([models.py:360](/D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:360)); read authorization checks only tier ([snapshots.py:103](/D:/Projects/cookbook/.worktrees/teaching-hardening/snapshots.py:103)). Personal revisions/snapshots must inherit ownership, and capture, replay and cook-log attachment must independently verify it. A known identifier or matching digest grants no access.

3. **High: indirect household/public disclosure.** Grocery conversion copies recipe title and ingredients ([routes/groceries.py:139](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:139)); household members receive those records at lines 87–95. Planner-to-list conversion resolves recipes without rechecking access at lines 258–267. Shared meal plans publicly serialize titles ([routes/meal_plans.py:245](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:245)). Initially reject personal references in these integrations. Later require an explicit “share these ingredients with household” action, define copied fields and retention, and omit private titles/IDs unless separately authorized.

4. **High: incomplete deletion/export.** Export currently emits snapshot IDs rather than retained recipe content ([routes/auth.py:104](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:104)); account deletion explicitly removes several tables but does not delete snapshots ([routes/auth.py:134](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:134)). Extend both transactions to personal recipes, revisions and mutation receipts. Proposed recipe deletion purges retained personal content and leaves only content-free cooking-history tombstones. Backup expiration and restore-time deletion handling remain operational decisions.

5. **High: malicious content and device persistence.** Tokens reside in local storage ([frontend/src/api/client.js:6](/D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/api/client.js:6)), making executable recipe markup consequential. Accept plain text only, bound payloads and arrays, and defer uploads/URL fetching. The service worker already bypasses authenticated API caching ([frontend/public/sw.js:56](/D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:56)). Preserve that behavior; add `Cache-Control: private, no-store` and clear editor state on account changes using the existing epoch mechanism ([useAuthStore.js:4](/D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:4)).

Proposed flow and contract:

- Sign in → “My recipes” → private draft → edit/save → server-validated usable recipe → cook a pinned revision. Draft saving requires a title; usability additionally requires positive servings, ingredient text and instruction text. No difficulty required.
- Server fields: opaque `id`, authenticated `owner_id`, fixed private visibility, integer `revision`, timestamps. Writable fields: title, language, servings, ingredient rows, steps; optional notes, equipment and time. Ingredient rows permit quantity/unit/form text and nullable validated `food_slug`; never infer unknown quantities as zero.
- Reject ownership/visibility changes and unknown fields. Apply structural limits to drafts too.
- Owner-scoped POST/GET/PATCH/DELETE/export; authenticated outsiders receive the same 404 as missing IDs. PATCH uses atomic expected-revision comparison, returning 409 only after authorization. Retries use owner-scoped mutation IDs and payload digests.
- Cooking requires a reference contract change: existing `CookLog.dish_id` is mandatory ([models.py:378](/D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:378)). This is a dependency, not grounds to insert private recipes into the catalog.

Acceptance gates: two accounts plus guest test every direct and indirect read/write path; substituted recipe/revision IDs fail; private canary text never appears in catalog, filters, sitemap or shared outputs; malicious markup remains text; oversized requests fail; stale saves conflict; retries do not duplicate; logout/account-switch races discard responses; export includes retained revisions; deletion removes their content and prevents replay.

Assumptions: owner-only access, online drafts and content-purging deletion are proposed defaults requiring product agreement. Confidence is high in the identified source boundaries, moderate in the final integration design. Household-sharing requirements, offline authoring, or history-retention choices would change the recommendation. Inspection was read-only; no tests, production calls or peer reports were used.

## DevOps / reliability
Agent: 01a09a4f-0cb1-7142-84c8-d57c5a96977b

DevOps/reliability round 1: recommend an additive private authoring slice with durable saves and pinned cooking content. Keep the existing Flask/SQLAlchemy runtime; no new service is justified. Reviewed HEAD `5c60456` read-only using the requested council skill. No tests, migrations, production calls, or peer-output reads were performed.

1. Verified implementation and implications

   The [Procfile](/D:/Projects/cookbook/.worktrees/teaching-hardening/Procfile:1) runs Gunicorn and a release chain of migration plus four content syncs. Recipe sync overwrites matched catalog tiers and commits independently at [scripts/sync_recipes.py:197](/D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/sync_recipes.py:197). Consequently, a later release-command failure can leave earlier database changes committed.

   Current identities remain dish/tier based: [models.py:112](/D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:112) requires dish, level and language; [CookLog:378](/D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:378) requires a catalog dish. Personal cooking therefore needs an explicit compatibility adapter and schema changes.

   The worker already bypasses authenticated and non-allowlisted API requests at [sw.js:56](/D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:56). Roadmap claims that it indiscriminately caches private APIs are stale.

2. Proposed smallest contract

   Flow: create private draft → explicitly save → validate as usable → cook a pinned revision → edit into a subsequent revision. Ship export and archive alongside authoring; defer scanning, photos, branching and shared planning/shopping.

   Proposed storage: stable recipe/version ID, server-derived owner, private visibility, draft generation, current revision ID, timestamps and archive marker; immutable revisions contain schema version, semantic digest and content. Isolate personal content from curated sync while exposing one resolver contract for both sources.

   Drafts permit incomplete content. Usable validation requires title, positive servings, ingredient text and instruction text; optional quantities retain unknown values, unit and preparation form. Give ingredient/step rows stable IDs. Difficulty and nutrition remain optional.

   Saves carry `mutation_id` and `expected_revision`; draft writes carry an expected draft generation. Atomically commit content, current pointer and an owner-scoped receipt. Identical retries return the recorded result; changed payload under the same key or stale revision returns `409`. No-op saves create no content revision. Existing receipt/conflict handling offers a precedent at [routes/reflections.py:92](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/reflections.py:92).

3. Ranked risks and mitigations

   - **Data loss during release/backout:** use additive migrations, keep legacy references, exclude personal rows from sync, and roll back application code without dropping new data. Rehearse failure after each release phase.
   - **Duplicate or lost saves:** require database-enforced receipt uniqueness and atomic revision checks across workers. The existing snapshot helper commits internally at [snapshots.py:83](/D:/Projects/cookbook/.worktrees/teaching-hardening/snapshots.py:83); do not compose it unchanged into a larger save transaction.
   - **Private history exposure:** snapshot authorization currently checks tier entitlement only at [snapshots.py:103](/D:/Projects/cookbook/.worktrees/teaching-hardening/snapshots.py:103). Personal revisions require ownership checks on every resolution, including history and export.
   - **Incorrect shopping/retries:** [routes/groceries.py:141](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:141) converts missing grams to zero and adds quantities on each merge. Defer personal integration until contributions are revision-pinned, idempotent and unit-aware.
   - **Unproven recovery/capacity:** backup configuration, restore time and production database version were not verified. Require a disposable restore rehearsal; define recovery objectives, bound payloads, paginate libraries, and track save latency/errors, conflicts, receipt/revision growth and release failures without logging content.

4. Release acceptance and remaining decisions

   Order: approve contracts → rehearse fresh/populated PostgreSQL migrations and restore → deploy compatible backend/schema → deploy authoring/cooking UI → enable writes. The existing verification record explicitly leaves PostgreSQL testing open at [verification:64](/D:/Projects/cookbook/.worktrees/teaching-hardening/docs/teaching-hardening-verification.md:64).

   Acceptance must cover lost responses after commit, concurrent edits, unchanged saves/releases, partial release failure, cooking across edits/archive, account switching, and complete export/account deletion. Extend the explicit deletion sequence at [routes/auth.py:134](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:134).

   Assumptions: authenticated online authoring and modest initial usage. Recommend archive preserving private cooking history; permanent purge semantics and backup retention need product decisions.

Confidence is high in these source-level boundaries, moderate in rollout feasibility. Verified PostgreSQL behavior, restore evidence, expected volume, or a requirement for offline authoring/shared shopping would change the recommendation.

## QA / testing
Agent: 01a09a4f-0f3a-7da3-985e-541e00e047e5

Round 1 — QA/testing seat. Recommend a private manual editor with saved drafts, usable recipes, editing, and version-pinned cooking. Planning/shopping should ship only with explicit private-reference contracts.

Reviewed HEAD `5c60456` read-only; preserved uncommitted changes. No tests, migrations, production calls, or peer reviews were performed.

**Verified implementation boundaries**

- Recipes currently require `dish_id`, `level`, and `lang`; ingredients and steps are JSON. There is no recipe ownership field in this model. [models.py:109](D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:109)
- Discovery enumerates all dishes; snapshot authorization checks difficulty entitlement alone. Personal content cannot safely inherit these paths unchanged. [recipes.py:29](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/recipes.py:29), [snapshots.py:103](D:/Projects/cookbook/.worktrees/teaching-hardening/snapshots.py:103)
- Cook logging requires a curated dish and valid tier, validating snapshots against dish/tier/language. Supporting personal cooking requires an explicit identity adapter. [progress.py:93](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/progress.py:93)
- Shopping merges matching foods using grams, treats missing grams as zero, and otherwise copies ingredient text. Public meal-plan links serialize dish summaries without authentication. [groceries.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:134), [meal_plans.py:245](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:245)
- The service worker already bypasses authenticated and non-allowlisted API requests; older roadmap claims that it caches everything are stale. [sw.js:56](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:56)

**Proposed flow and contracts**

“My recipes → New recipe → Save draft → Preview → Start cooking.” Edits create immutable revisions; cooking retains its selected revision through refresh and subsequent edits.

Proposed draft minimum: trimmed title and content language. Usable minimum: positive finite servings, one nonblank ingredient, one nonblank instruction. Ingredient quantity may remain unknown. Optional timing, equipment, notes, and source text; no mandatory difficulty or translation.

Use server-owned `owner_id`, stable `recipe_id`, `revision_id`, `status`, and `schema_version`. Ingredients carry stable IDs, text, nullable quantity/unit, optional food reference and preparation/form; steps carry stable IDs and text. Never infer unknown grams or nutrition.

Create/update contracts should accept `mutation_id`; updates require `expected_revision`. Identical retries return the original result; reused mutation IDs with different payloads and stale updates return `409`. Validation returns field-addressable errors. Foreign resources return `404`; ownership is never writable.

**Ranked risks and acceptance tests**

1. **Private content escapes through derived routes.** Test owner A, account B, guest, and household peer against list/detail, revisions, cooking, export, shared plans, and cached responses. Assert absence of titles and ingredients, not merely rejection status. Delay A’s response across login to B; test offline navigation with the service worker enabled.

2. **Retries overwrite newer work or duplicate recipes.** Drop the response after commit, retry, then retry again after another edit. Assert one creation, unchanged newer content, stable receipt, and no duplicate revision for a no-op save. Existing reflection tests provide a useful pattern, not proof for recipes. [test_teaching_hardening.py:63](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/backend/test_teaching_hardening.py:63)

3. **Edits/deletion corrupt cooking history.** Start revision 1, reorder/delete steps in revision 2, refresh the original cook, and finish twice. Assert original instructions and one history entry. Proposed archive preserves owner-accessible history; permanent deletion must explicitly define retained content. Export currently contains snapshot references, not their full content. [auth.py:104](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:104)

4. **Quantities become misleading shopping totals.** Test unknown amounts, “to taste,” decimal commas, fractions, incompatible units, dry/cooked forms, and repeated shopping generation. Preserve unknowns; reject invalid servings. Defer household transfer until the UI explicitly communicates ingredient disclosure.

5. **Passing tests overstate release readiness.** Existing helpers create SQLite tables directly, and the isolation browser test blocks service workers. [helpers.py:23](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/backend/helpers.py:23), [browser_isolation.cjs:11](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/browser_isolation.cjs:11) Require disposable PostgreSQL migration/concurrency verification, curated regression checks, and mobile EN/DE keyboard-accessible creation, validation, recovery, and cooking tests.

Assumptions: private account ownership, single-language authoring, archive-first removal. Permanent deletion retention and household disclosure need explicit product decisions. Defer scanning, publishing, branching UI, and nutrition automation.

Confidence: high in identified integration risks; medium in slice boundaries. A verified shared identity resolver, agreed deletion/sharing contracts, or PostgreSQL and service-worker-enabled evidence could change the recommendation.
