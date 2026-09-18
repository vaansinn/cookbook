# Shopping integration QA — live coordination

2026-09-13. Independent QA write set: the two new integration test files and
this note only. No shared implementation edits, migrations, or development DB.

**Current status after main's scoped coverage-undo fix:** 33/33 backend integration
tests passed (24.342 seconds). All earlier failures below are historical and now
resolved in this suite. The previous frontend run remains 17/17; frontend code was
not changed or rerun by this seat during the scoped-undo follow-up.

## Early P1 for main

Real route reproduction in
`tests/backend/test_planning_shopping_integration.py::test_removed_source_does_not_regain_coverage_but_explicit_undo_does`:
create whole-plan shopping scope, cover first source, preview/confirm item.delete,
then undo.apply. Undo returns 400 `invalid_request`, `Date must be YYYY-MM-DD`.
The captured whole scope has nullable start_date/end_date; the common inverse
date deserializer calls required `day()` for those nulls. Scope restoration must
preserve nulls and restore coverage together with the deleted item.

Initial run: 8/10 backend cases passed; another case expected 404 for foreign owner
scope creation but received 409 shopping_scope_invalid. This status distinction is
not yet treated as a privacy failure: missing and foreign owners must be equally
opaque and leave no state. Tests will assert that outcome without inventing a new
status contract. Frontend transport contract: 10/10 passed.

Backend runtime: `.local/venv/Scripts/python.exe -B`; the system Python lacks
flask_sqlalchemy. Every test uses sqlite:///:memory:, dotenv disabled, environment
sanitized before app import, real metadata, and PRAGMA foreign_keys=ON. PostgreSQL
verification remains main's separate gate. This is an interim report, not release
approval or a full-suite pass.

## Follow-up findings for main

The nullable-date restore failure above is fixed in main's subsequently landed
code: the integration case now passes, as do dependent selected-meal move
preview/confirm/undo and preference-only edits preserving undo.

Two current route failures need main's eligibility integration:

- `test_revoked_template_read_does_not_return_unchecked_blueprint`: save a template,
  revoke its catalog revision, GET /templates. The list returns the full blueprint
  without checking eligibility. The test permits omission or an explicit unavailable
  metadata row, or an explicit catalog-unavailable response; it prohibits returning
  unchecked blueprints as currently usable content.
- `test_template_undo_revalidates_revoked_catalog`: save/delete template through
  preview/confirm, revoke referenced catalog revision, undo. Currently returns 200
  and restores the template; agreed contract requires current eligibility during
  restoration and no SQL changes on failure.

Second run: 18/21 passed, two product failures above and one test-fixture typo
(`task.create` uses `text`, not `title`), now corrected. More source-command cases
are being added; these counts are interim.

## Latest integration evidence

30 backend integration tests now exist. Latest execution: 29 passed, 1 failed.
Both revoked-template cases now pass after main's fixes. All tests use the real
registered routes; no shopping services or projection results are mocked.

Remaining P1: `test_check_all_returns_guarded_undo_and_restores_mixed_source_and_extra_states`.
After first-source `have` and a separate extra, `shopping.cover` marks the complete
row bought but returns only scope_id/revision. There is no undo_id, so the approved
Check all / Undo follow-up cannot restore the mixed previous allocations. The
frontend shows Undo only when api.undo is present. Main must integrate a bounded
inverse for coverage and retain receipt retry/reserved-undo capacity semantics.
Test then verifies exact mixed source/extra restoration and stale-undo rejection.

Frontend initially 16/17 passed. The failure joined the actual group preparation
and coverPayload functions: consolidated rows with zero extra sent include_extra
true, while the real backend rejects it. The frontend owner has since normalized
that flag; final verification follows below. No alternate backend behavior is
being silently invented by this test.

Additional negative coverage includes malformed decimal/types/selection/status,
duplicate and unknown allocation IDs, foreign roots/scopes/personal IDs,
unreviewed deletion, mismatched template kind, stale move confirmation, independent
preference conflicts, revoked/missing entitlements, direct-SQL composite FK checks,
capacity rejection with old receipt replay, and an injected SQLAlchemy receipt
insertion failure proving rollback and exact-body retry. Source-command cases
exercise item servings/options, event guests, item transfer, meal transfer/copy,
plan repeat, contribution removal/reintroduction and template application.

## Python source review

Read actual routes/planning.py, planning_shopping.py,
planning_shopping_projection.py, planning_shopping_models.py, planning_changes.py,
planning_templates.py, planning_template_models.py, planning_preferences.py,
planning_preference_models.py and export/delete integration in planning_models.py.

- The command route locks User then PlanningWorkspace, checks receipts before
  capacity/revision rejection, applies commands, reconciles every domain mutation,
  then commits revision/receipt together. Preferences skip domain revision/undo
  erasure. Forced receipt insertion failure was verified through real routes.
- Projection queries the complete selected parent set, deduplicates linked events,
  excludes nonempty contribution text and notes, resolves current catalog access,
  and uses opaque source allocations. Tests consume returned allocation IDs;
  they do not reconstruct private token encodings.
- Hidden unavailable demand is tolerated only by internal reconciliation; public
  projection fails explicitly. An entitlement loss followed by an unrelated domain
  write preserves prior allocation evidence and makes recovered access require
  review. GET is verified not to mutate SQL state.
- Explicit SQL FK testing covers cross-workspace scope parent ownership. JSON
  shape/digest validation remains service/ORM enforcement, not a claimed SQL JSON
  constraint. PostgreSQL concurrency, migration and backup safety are main's gates.
- Current inverse capture includes all workspace shopping scopes, even unaffected
  ones. The workspace revision prevents overwriting a later domain edit, but the
  256 KiB inverse cap can therefore block a small unrelated removal in a large
  workspace. This is a capacity/precision limitation to assess; it is not evidence
  that all such captured scopes are actually removed. Preview copy must not imply
  that they are. No test fabricates an old-app rollback guarantee.

Main reported PG09 fresh/history head fc86 full sync/repeat and existing planning
transaction checks passing. This seat did not execute or independently validate
that PostgreSQL report; these in-memory tests do not substitute for it.

## Preserved independent cross-review

My position is unchanged: the complete vertical slice is coherent. I support the
engineering defaults conditionally; dependent-scope invalidation and catalog
compatibility need explicit contracts before parallel implementation.

Hard blockers before exposure:

- Moves need reviewed scope loss. meal.move can invalidate an explicit selection
  and thereby remove its entire saved scope, including personal additions and
  checks. Preview must disclose that complete loss; confirmation must bind the
  move and its consequences to one revision and transaction; undo must restore
  both. Audit item moves, event unlink/date changes, and range edits for equivalent
  effects. Do not silently shrink a selection or substitute all.
- Define v1 behavior under v2 shopping. Keeping v1 unchanged is necessary but
  insufficient: specify how existing entries lacking labels/category/purchase
  mode render and participate. Do not guess cupboard membership or present an
  incomplete list as complete. V2 validation should distinguish measured positive
  quantities from qualitative amount=null, unit=taste, permitted only for
  check_cupboard; measured cupboard quantities must remain representable.
  Classification must not change aggregation identity.
- Separate unavailable content from removed demand. Revocation or lost
  eligibility must not silently erase allocations or make a list appear fully
  covered. Define an explicit unavailable/incomplete projection state and block
  actions claiming complete coverage. Catalog availability can change without
  the workspace revision advancing, so confirmation/application must recheck
  eligibility within the transaction's defined consistency boundary.
- Freeze reconciliation and recovery together. Every relevant domain command
  must persist sticky review and remove obsolete coverage atomically. Explicit
  undo is the exception to reintroduced sources start unanswered.
  Preview/inverse/export/deletion must include new records before UI exposure.
  Preference changes must neither invalidate domain undo nor allow undo to
  overwrite newer preferences.

I particularly endorse the complete server projection finding: the existing
visible-day loader cannot serve as a shopping oracle. Bounded acknowledgements
are appropriate, but their retry contract must preserve operation identity and
generated IDs without treating an old receipt as current demand or permission.

Recommended integration order:

1. Freeze scope invalidation, v1/v2 rendering, unavailable-content behavior,
   allocation transitions, and receipt/undo contracts with acceptance examples.
2. Implement additive models and shared transaction integration, including
   preview/inverse/lifecycle coverage. Give shared boundaries one owner.
3. Build complete projection and reconciliation. Templates and separately
   revisioned preferences can proceed in disjoint modules after interface freeze.
4. Wire all four views and recovery, then execute API, PostgreSQL concurrency,
   migration/recovery, and browser acceptance gates.

Later gates, not reasons to halt independent engineering: authored vocabulary,
staple/content acceptance, measured capacity at the 10k-receipt boundary, recovery
compatibility after new-format writes, and clean-second-device/physical-phone
acceptance. Capacity exhaustion must preserve existing retries and explain why
new writes are blocked. Packs/UseRest remain later.

Cross-review itself was read-only: no files, tests, or agents were used in that
round. Developer-council cross-review guidance was applied. This report does not
claim council, release, visual, or culinary approval.

## Handoff execution summary

- `.local/venv/Scripts/python.exe -B tests/backend/test_planning_shopping_integration.py -v`:
  30 cases, 29 passed, one actionable failure (coverage command has no undo token).
- `node --test --test-reporter=spec tests/frontend/test_planning_shopping_contract.mjs`:
  17 cases passed, none skipped; zero-extra contract regression fixed and verified.
- Current tests include actual frontend model/adapter calls and real Flask routes,
  but no mounted React/browser assertions or physical-device acceptance.
- Only this note and the two assigned new test files were written by this seat.
  Shared fixes belong to their implementation owners. No commit or push performed.

## Scoped coverage undo follow-up

Re-read main's central shopping.cover snapshot/receipt integration and
replace_scope_ids restoration. Added three tests in the assigned backend file:

- Duplicate check AND duplicate undo replay after restoration return the exact
  original acknowledgement bytes without any SQL mutation. Replaying both again
  after a newer check in another scope preserves that new coverage and its undo.
  The second scope's pre-existing additions/coverage survive the first undo.
- One remaining receipt slot rejects a new check atomically; two slots permit
  check plus undo. At the resulting full capacity, both original requests remain
  replayable and cannot reset restored coverage.
- A reduced inverse byte cap rejects before apply_command executes and retains
  the preceding valid undo, which still restores the prior coverage. This proves
  guard placement; it is not a full 256 KiB capacity benchmark.

Executed `.local/venv/Scripts/python.exe -B tests/backend/test_planning_shopping_integration.py -v`:
33 tests, all passed, zero skips. The logged synthetic SQLAlchemy error is the
intentional receipt-insertion rollback test, which also passed. No real DB, shared
code edits, commits, or pushes. Full-suite and PostgreSQL reruns remain main's
verification, separate from this evidence.
