# Agent handoffs — Recipe Drawer

Pass this file **and IMPLEMENTATION_PLAN.md together**. The plan is the implementation specification; PIPELINE.md owns IDs/status. These handoffs do not launch agents or authorize the entire roadmap.

## Prepare once before dispatch

1. Verify the integration base. Inspected remote baseline: dccd4db177336b7f52d992bb9a3dade681c61d1e. The original audit used 6011faf; the published planning commit is based on dccd4db and preserves its newer application work. Recheck the actual checkout and incoming changes; do not overwrite a newer PIPELINE.md.
2. Give agents the repository/branch, exact base SHA, these two documents, the current task registry and repository read access. #58 remains allocated but deferred; recheck the shared branch before allocating more IDs.
3. Use isolated worktrees/checkouts. Assign a bounded slice, anticipated paths, actual overlaps and merge order—not a blanket ban on editing central files.
4. Feature agents may edit required models/routes/UI/router/locale files end to end. Serialize genuine conflicts and migration changes; refresh dependent work against the actual integrated migration head. The reviewer owns coordinated backlog updates, not every code edit.
5. Prepare #47a's small pilot fixtures with the teaching owner. Do not block #50, current-reference #48, content drafting, #41a or #49a on a full domain contract.
6. Track planned / in progress / implemented / verified / shipped separately. A verified sub-slice does not complete its parent; human learning evidence and deployment remain separate.

## First assignments — three implementation roles plus review

| Role | Bounded assignment | Explicitly excluded |
|---|---|---|
| Reliability agent | #50 actual service-worker fix, then #48 cook retries | Full version migration, library/events, blanket private offline sync. |
| Content agent | #33a one dish/one lesson, #39a observation materials and review questions | Finishing all three dishes/five skills before first observation. |
| End-to-end teaching agent | #47a fixtures, #32 history transition, #34a–#38a thin flow | Full course engine, repertoire dashboard, branching, generalized recommendations. |
| Integration/review role | Current base, merge/migration ordering, acceptance/status, actual human evidence | Acting as mandatory author of every shared-file edit. |

First milestone: a beginner learns one technique, cooks with contextual help, records how it went, and chooses another practice opportunity—without points or streaks.

Order: reliability/content/fixtures start together; teaching owner builds the thin flow using the reliable completion interface; observe with one or two beginners as soon as usable; correct confusion; then consider three dishes/five skills and broader observations. UI approval and authorized culinary/participant review are external dependencies, not tasks an agent can declare complete by itself.

#41a solo first-write, #49a existing plan/list correctness, #29–#31 usability and P5 hardening may be separately assigned at any point. They do not wait for learner recruitment. They must not silently expand the pilot assignment.

## Universal copy/paste prompt

Implement only the assigned Recipe Drawer slice using IMPLEMENTATION_PLAN.md and PIPELINE.md.

Task/slice: [existing ID and named boundary]
Repository and integration base SHA/branch: [verified current base]
Prerequisites already available: [commits/fixtures/content]
Expected paths and real overlaps: [paths and coordination]
Merge/migration order: [agreed order]
Expected handback: [patch/tests/content/preview]

Read repository instructions and the complete assigned task, including its scope boundary and dependencies. Use the current implementation, including existing MealPlan/MealPlanItem flows where relevant. Do not implement against the stale 6011faf snapshot unless specifically assigned an audit.

Complete the bounded slice, not its entire parent or neighboring roadmap tasks. Missing future-version/library contracts do not block the teaching pilot. If a required pilot field is unspecified, propose the smallest fixture change to the teaching/review owner instead of inventing a parallel model.

Preserve user data, access grants, existing sharing, hats/tabs and approved cards. Use additive migrations and owner-scoped reads/writes. All app-owned UI/curated teaching content needs EN/DE; personal authored content can be single-language.

You may edit necessary full-stack files in your isolated checkout. Coordinate actual overlaps and migration order. Do not reset another checkout or silently change shared interfaces.

New visual designs require the repository's preview/explicit-feedback workflow before UI implementation. No production deployment, external outreach, paid service setup or unrequested commits. Do not copy secrets, user databases or stale wedding migrations.

Return the slice/status, base SHA, changed files, behavior, interface/schema impact, actual checks/results, unresolved decisions/evidence, integration order and suggested commit message. Do not call browser/agent QA beginner validation.

## Reliability brief

Read #50 and #48 first; inspect current service worker, authentication/store reset hooks, progress endpoint and cooking session client.

#50: change explicit cache reads/writes, not only response headers. Private/authenticated APIs must bypass both cached fallback and cache.put. Allowlist genuinely public content, version/evict old API caches, reset account-owned stores/pending sessions. Verify account A → logout → B online/offline, stale-worker upgrade and entitlement expiry. This fix has no #47 prerequisite.

#48: use account-scoped session_id uniqueness with existing dish_slug/level/lang. Same key/payload returns the saved cook; conflicting payload returns a recoverable conflict; deliberate new session saves separately. Preserve old unknown history. Share fixtures with #47a. Accept #35's server-issued snapshot when available without refetching changed content at completion.

Optional follow-on assignment: #41a first-write solo kitchen or #49a current plan/list retry/rebuild correctness. Do not implement the whole household/nutrition/event roadmap under those labels.

## Content and early-observation brief

Read #33 and #39. Start with one accessible lentil Bolognese recipe and one useful focus skill, provisionally maintaining a simmer. Check the actual recipe before committing to the mapping.

Deliver EN/DE lesson, clear success cues, recovery guidance, necessary equipment/sequence corrections and one accessible next-practice link. Audit jargon and the Bolognese equipment/parallel-task issue. Supply only necessary demonstration asset briefs; missing media must be explicit, not invented as validated evidence.

Prepare experienced-cook review questions and an observation sheet immediately. Recruitment/outreach requires authorization. First sessions use one or two beginners when the thin flow is ready. Record hesitation, outside help, recognition of success and usefulness of the next suggestion. Fix blockers before expanding to three dishes/five skills; later sessions can provisionally involve three to five beginners total. No statistical or mastery claims.

## End-to-end teaching brief

Read #47a, #32 and the first-slice boundaries in #34–#38. Own the full stack of the selected flow.

1. Agree a few fixtures: existing recipe reference, skill/lesson, step/help, immutable content blob/hash, cook session and optional reflection, authored eligible next-practice link.
2. Ship usable history with reward retirement, including removal of count-based escalation in the existing plan generator. Preserve historical cook rows; do not create confidence/practice from old counts.
3. Sync/read one lesson and its explicit recipe link. Do not create a generalized LearningPath engine just for one sequence.
4. Convert one recipe's relevant steps; keep legacy prose usable through one serializer. Capture authorized content at session start, retain the snapshot through completion, check source access, and reuse unchanged hashes. No RecipeVersion/RecipeRevision graph.
5. Add contextual help that returns to the same cooking step. Preserve current navigation/controls. Integrate reliable completion before optional reflection.
6. Offer explicit practice confirmation and optional confidence/note. Add an authored next-practice link with a reason; skip/dismiss remains possible. Cover account isolation/export/delete.
7. Hand off the usable slice for #39a. Do not wait for broad repertoire/resume features, overlapping timers or a recommendation engine. Expand only after early corrections and the next slice is selected.

Checks: legacy recipes/SEO, locked content, snapshot stability across sync, retry-safe completion, no XP/streaks, skip reflection, no inferred practice, access-checked suggestion, EN/DE/themes/mobile and account switching.

## Integration/review brief

Verify the current base and staged contracts; agree likely file overlaps before work. Land additive migrations serially and check the final head. Review only release-relevant integration scenarios—library/event checks are not first-pilot gates.

Keep rough effort and external availability visible using section 5 of the plan. Re-estimate after the first integrated slice. Missing participants do not block reliability fixes, but teaching effectiveness remains unvalidated.

Hand the starter flow to actual human review early. Report engineering verified, culinary reviewed, beginner observed and deployed as distinct statuses. Do not declare the entire #33–#38 task set complete because their “a” slices work.

## Future assignments — not active dispatch

Select one bounded release explicitly before assigning these:

- #47b/#40: variable versions and full localized revision/provenance model. Adopt pilot snapshots; enforce no-op sync/no-op save and meaningful per-language revision rules. #44 preserves current access unless a new policy is approved.
- #51/#53: private manual library then personal variations/comparisons/history. No mandatory difficulty; immutable meaningful saves; no automatic premium-copy bypass.
- #54/#52: food mapping/units/nutrition coverage and scan-to-reviewed-draft. Manual entry works without credentials; provider use needs current official-document verification and approved configuration/cost.
- #55: curated-only event v1 from current bundles, content snapshots, per-dish portions, private guest notes and #49b event contributions. No #40/#51 prerequisite; add personal recipes later.
- #56: manual event preparation and serving-time offsets first; advanced automatic dependency/equipment scheduling remains deferred.
- #57: separate prose cleanup and later version-column cleanup, each gated by its own actual consumer inventory.
- #58: deferred, ID retained. No adapter work/provider setup until its reactivation checklist and bounded estimate are approved.

Historical source: https://github.com/vaansinn/wedding-planner at v0-with-meal-planner (a5eb8b6c30e8a1b190f68712b8935cacdf6ac666). Give remote agents repository read access or an authorized archive. See the plan's reuse manifest; D:/Projects/meal-planner is only an optional machine-local checkout. Never restore the tag over the active wedding app.

## Handback template

Task/slice:
Base SHA and branch:
Status: implemented / verified / needs decision / awaiting external evidence
Changed files and behavior:
Contract/API changes:
Migration parent/head and backfill:
Checks actually run and results:
Compatibility/backout:
Pending human evidence, approvals or assets:
Actual overlaps and integration order:
Remaining parent-task scope:
Suggested commit message:
