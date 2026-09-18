# Personal recipes — chairman's implementation proposal

2026-09-13 · Status: council-reviewed proposal, not implemented or product-approved.

## Verdict

Build a private manual recipe library first, then connect it to cooking through an
ownership-aware recipe reference. Keep the welcoming design, simple authoring,
optional learning and no mandatory difficulty. Do not put personal recipes in the
public Dish/RecipeTier catalogue. Do not require a migration of all curated recipes
before manual authoring can ship.

This is a production-feature proposal informed by the prototype. The prototype's
hardcoded recipe catalogue and browser-local planner are not production adapters.
Keep its uncommitted work intact. Select a fresh implementation worktree/base after
checking branch/remote changes; this review inspected local `5c60456` on
`codex/teaching-pilot-hardening`, not a verified current remote deployment.

First reviewable delivery: My recipes, create/edit/save, private reading, archive,
export and defined permanent deletion. Next delivery: personal cooking/history.
Do not show enabled Cook, Add to plan or Shopping controls before their corresponding
backend contracts are implemented and tested.

Excluded initially: public publishing, household sharing, scanning/import extraction,
photo uploads, nutrition calculation, branching UI, component authoring, automatic
translations, offline authoring and a full curated recipe/version migration.
Existing personal-freeform planner items are not converted into recipes automatically.

## Council evidence and evaluation

Five fresh-context subagents used the inherited model, not five distinct models.
The main coordinating agent served as chairman. Reports: [brief](brief.md),
[independent round](round-1.md), [cross-review](round-2.md).

| Seat | Strongest contribution | Chairman evaluation |
|---|---|---|
| Frontend/UX | Untitled drafts, tier-free reader, interface/content-language separation | Adopt; require explicit readiness and no silent language conversion. Screen design still needs user review. |
| Backend/data | Private identities, immutable revisions, typed references | Adopt incrementally; do not generalize curated sync unnecessarily. Resolve exact constraints before parallel coding. |
| Security/privacy | Public catalogue/snapshot paths lack personal ownership; household ingredients disclose content | Confirmed in source. Reject private references on unsupported paths. Archive is not deletion. |
| DevOps/reliability | Release chain can partially commit; rollback after new data needs compatible readers | Adopt compatible-backend rollback floor and PostgreSQL/restore gates. Earlier separate draft-generation proposal withdrawn. |
| QA/testing | Negative canary tests, old-client history, service-worker-enabled verification | Adopt. Existing tests are precedents, not acceptance evidence for this unbuilt feature. |

The chairman checked decisive source boundaries: `models.py:109` requires curated
dish/tier identity; `routes/recipes.py:29` lists all dishes; `snapshots.py:103` checks
tier entitlement, not personal ownership; `models.py:374` and `routes/progress.py:43`
assume every cook has a dish. `routes/groceries.py:134` copies source titles and
ingredients and treats missing grams as zero. `routes/auth.py:84`/`:122` explicitly
enumerate export/delete data. `Procfile:1` runs migration plus separate content
sync commands. `tests/frontend/browser_isolation.cjs:11` blocks service workers.
These are verified current-source properties, not claims of an existing private-data
leak: personal recipes do not exist yet.

Confidence: high in the identified incompatibilities, moderate in the proposed
slice. Five agreeing reviewers do not replace migration tests or user acceptance.

## Decision ledger — proposed defaults needing product approval

| Question | Alternatives raised | Chairman recommendation |
|---|---|---|
| Who can create/read? | Owner-only; shared household | Account-required, owner-only first. Existing guest curated cooking remains. |
| Draft minimum | Mandatory title; untitled content | Save any structurally valid draft containing actual entered content. Show an Untitled label without storing it as its name; don't create empty records. |
| Cooking readiness | Always require ingredients; explicit ingredient-free recipes | Title, positive servings, one instruction, plus named ingredients OR explicit `no_ingredients_needed`. Unknown ingredient amounts are allowed. |
| Draft persistence | Mutable drafts plus published revisions; explicit immutable saves | One immutable revision per meaningful explicit save, including drafts. Readiness is not public publication. No autosave promise. |
| Removal | Archive only; purge | Separate Archive/Restore from Delete permanently. Archive retains private history; purge removes retained recipe content. Recommend content-free cook-history tombstones, subject to approval. |
| Existing curated data | Full migration now; additive private slice | Add private identities and a resolver boundary; preserve curated tables/snapshots and current access rules. |
| Integration order | Immediate shopping/household use; staged adapters | Library first, cooking next; planning/shopping separately gated. Ingredients themselves are a disclosure, even without a recipe title. |
| Images/components | Include in initial form; later | Defer uploads and component authoring; source attribution text is allowed, with no remote fetching. |

Untitled drafts and explicit-save revisions achieved convergence after peer review;
they were not unanimous starting assumptions. Retention, ingredient-free readiness,
account-only authoring and integration scope still require the user's decision.

## 1. User flow

Keep Recipes as the main destination. Add My recipes as a view/filter and Add recipe
as a clear action, not another permanent bottom-navigation destination. Signed-out
users get an honest sign-in entry; no unsaved guest content is silently imported.

1. My recipes → Add recipe → one compact editor.
2. Visible essentials: name, servings, ingredient rows, ordered instructions.
   Save draft remains available for incomplete content. Content language defaults
   visibly to the interface language but is stored independently.
3. Optional details disclose timing, equipment, notes and source attribution.
   No cuisine, nutrition, difficulty or second-language requirement.
4. Save shows Saving → Saved, or a visible failure. A successful save opens the
   private reader; incomplete drafts show specific missing items, not a mastery score.
5. Edit reopens the saved content. Cancel/navigation warns about unsaved changes.
   A conflict preserves local work and displays the current saved version for review;
   no automatic retry over another edit. A new deliberate submission gets a new
   mutation ID and the reviewed current base.
6. When the cooking adapter is ready, Start cooking pins the selected usable
   revision. Per-cook servings do not rewrite the recipe. Editing the library recipe
   never changes a running attempt.

Use plain text, persistent labels, keyboard reorder actions and 44px touch controls.
Mobile save controls must remain accessible with the software keyboard open; desktop
can widen the form without changing state semantics. Do not redraw the form and lose
cursor position after each ingredient edit. EN/DE interface changes leave authored
text and its language untouched. Announce save/error states and restore dialog focus.

Offline: retain an already-open form in memory after a network failure and permit
retry; do not promise survival of closing the tab. Server-acknowledged drafts survive
reload. Persistent offline drafts would require a separate privacy/recovery contract.

## 2. Field contract

These are proposed v1 fields; freeze exact enums and limits in a machine-readable
schema before implementation. Unknown quantities are never zero.

| Field | Draft | Ready to cook | Behavior |
|---|---|---|---|
| Title | Optional | Nonblank | Suggested limit 160 characters; display placeholder only for untitled drafts. |
| Content language | Required/defaulted | Required | One EN or DE content language initially; UI language is separate. |
| Base servings | Nullable | Positive finite value | Structured decimal; suggested range >0 to 1000. No implicit overwrite when scaling a use. |
| Ingredients | May be incomplete | Named rows unless explicit ingredient-free flag | Stable line ID; name; quantity mode; nullable decimal/unit; optional form/preparation and quantity wording. |
| Instructions | May be incomplete | At least one nonblank step | Stable step IDs, ordered plain text. Reordering retains identity; replacing a distinct step gets a new ID. |
| Ingredient-free flag | Default false | Explicit alternative | Cannot coexist with nonempty ingredient content. Not automatically inferred from an empty array. |
| Preparation/cooking times | Optional | Optional | Nonnegative whole minutes; no automatic schedule or safety inference. |
| Equipment, notes | Optional | Optional | Ordered equipment names and plain-text notes. |
| Source attribution | Optional | Optional | Text plus optional validated HTTP(S) link; never fetch on the server or embed remote media. |
| Food mapping | Optional | Optional | Only verified/selected mappings; arbitrary food IDs do not supply a trusted weight or allergen guarantee. |

Quantity modes: measured, qualitative (e.g. to taste), unspecified. Measured means
a positive normalized decimal and supported unit for usable content. Draft rows
also retain bounded raw amount/unit input (suggested 100 characters each), with
nullable parsed values and server-derived readiness issues. A half-entered fraction
or an amount entered before its unit must survive Save draft unchanged; it is not
converted to zero or silently dropped. Structural violations, unsupported fields
and oversized values still fail validation. Only complete parsed measurements
participate in scaling. Preserve the user's descriptive
wording for nonmeasured rows. Parse accepted fractions and German decimal commas
deterministically; invalid/ambiguous input needs correction rather than guessing.
Keep mass, volume and counted units separate; dry/cooked/canned forms are different.
Scale only structured values, and never rewrite numbers embedded in free text.
Initially render no calculated nutrition for personal recipes.

Suggested defensive bounds: 256 KiB request body, 200 ingredient rows, 200 steps,
4000 characters per step, 20,000 characters of notes, 50 equipment entries and
2048-character source links. These are proposed product limits, not measured needs.
Apply server validation even to drafts; return field paths such as
`ingredients[2].quantity`. Reject unknown writable fields, HTML execution and
client-supplied owner/visibility/verified/skill claims. Blank UI placeholder rows
are not stored as real ingredients/steps.

## 3. Backend and persistence

Stay with Flask/SQLAlchemy/PostgreSQL. No extra service is needed for manual entry.

- `RecipeVersion`: stable opaque identity, server-derived owner, private visibility,
  timestamps/archive state and current revision pointer. Name is an internal version
  identity, not a required user-facing branch or difficulty. Private rows have no
  curated Dish link in v1. Ownership cannot be transferred through the editor.
- `RecipeRevision`: immutable content JSON with validated field schema, content
  language, schema version, revision number, semantic digest, timestamp and parent
  version. Enforce unique version/revision number and a pointer that cannot reference
  another recipe's revision. Derive readiness from validated content.
- `RecipeMutationReceipt`: user-scoped mutation ID, target, canonical request digest
  and minimal result identifiers. Unique `(owner_id, mutation_id)`. Avoid duplicating
  recipe prose in receipts. Authorization still applies before any replay result.

Use one explicit-save protocol. In one transaction: authorize/lock the owning
recipe, check an existing receipt, compare `base_revision_id`, validate content,
insert a meaningful new revision if changed, advance the pointer and record the
result. Exact retry returns the original result without changing the latest pointer.
Changed payload under the same mutation ID or a stale base yields a typed 409.
An identical-content save against the current base returns that revision, not a
new content revision. A stale base is not silently accepted because content matches.
Creation also needs a unique receipt to handle concurrent lost-response retries.

No inner helper may commit a larger transaction unexpectedly. Reuse reflection
mutation patterns as a reference, not the existing internally committing snapshot
capture helper wholesale. Serialize archive/purge against saves; deleted targets
cannot be recreated by replaying an old mutation. Maintain minimal deletion/replay
markers while the account exists, with a defined receipt retention contract; remove
them on account deletion. Markers must contain no recipe title or prose.

Proposed API namespace (one choice, not multiple parallel contracts):

| Endpoint | Purpose |
|---|---|
| GET `/api/library/recipes` | Paginated owner-only list, search, active/archive and readiness filters. |
| POST `/api/library/recipes` | Create nonempty draft with mutation ID. |
| GET `/api/library/recipes/{id}` | Authorized current revision and readiness. |
| POST `/api/library/recipes/{id}/revisions` | Full explicit save with mutation ID and base revision ID. |
| GET `/api/library/recipes/{id}/revisions/{revision_id}` | Owner-authorized retained content for editor/cook/history. |
| POST `/api/library/recipes/{id}/archive` or `/restore` | Version-checked, replay-safe state change. |
| DELETE `/api/library/recipes/{id}` | Confirmed permanent purge under the approved retention contract. |

Use 401 for missing authentication, indistinguishable 404 for foreign/missing IDs,
409 for authorized revision/mutation conflict, 422 for field validation and 413 for
payload limits. Successful saves return recipe ID, revision ID/number, readiness
and created/unchanged/replayed disposition. Errors never include another owner's
current revision. Private responses use `Cache-Control: private, no-store`.

## 4. Cooking, history and future integrations

Introduce a discriminated resolver contract, not a fake Basic tier:

- curated reference: existing dish slug, level, language, snapshot ID when present;
- personal reference: recipe/version ID, authorized revision ID and content language.

Only the private owner can read or cook a personal revision. Do not reuse global
digest-based snapshots to grant access. Cooking retains an immutable authorized
revision and stable attempt/session ID; personal content carries no invented skill
identity or curated verification. Outcome-only reflection can remain available;
practice evidence must continue to require trustworthy retained teaching identity.

Extend cook storage with an explicit personal reference and enforced source shape,
or an equivalently validated additive representation approved in the contract task.
Never introduce dummy public Dish rows. Every consumer must handle personal history:
serialization, frontend links, export, reflection ownership and replay matching.

Version the history contract (or use an explicit client capability). Legacy clients
receive only compatible curated rows and matching counts; upgraded clients receive
typed references. Verify this with an actual previous frontend, not just a serializer
test. The compatible-backend rollback floor starts with the first personal recipe
write: even before personal cooking, older export/deletion handlers omit the new
records and receipts. Once personal cooks exist, extend that floor to typed history,
reflection and replay consumers too. Rolling back to today's backend is unsafe.
Keep a library-aware export/delete/replay backend floor and
disable new writes when necessary; do not drop private tables to roll back a UI.

Archive prevents ordinary new selections but keeps authorized earlier cooking
attempts/history readable. Permanent purge removes revisions and dependent content
copies. Recommended history tombstone retains only minimum cook facts, no recipe
title/ingredients/notes/source. Preserve enough session identity to reject replay
resurrection. Confirm whether reflections tied to purged cooks should be removed
or retained without recipe references. Account deletion always removes all owned
personal recipes, revisions, receipts, cooks/reflections and tombstones. Export
includes retained revision content and joinable cook references, not just IDs.

Planning/shopping follow in a separate slice: pinned per-use revisions, source-aware
contributions, dimensional units and explicit household-disclosure consent. Do not
silently import private account data into the browser-local prototype. Public shares,
SEO, sitemap and discovery exclude personal records throughout. A favorite remains
a bookmark, not a private copy. No inferred nutrient/allergen completeness.

## 5. Reviewable tasks and dependencies

| ID | Owner / likely surfaces | Deliverable and acceptance |
|---|---|---|
| PR-01 | Chairman + backend/security/QA; new private-recipe contract and fixture files | Resolve ledger choices, freeze fields/limits, save/replay/purge/readiness and typed-reference examples. Catalogue every consumer and old-client response. No feature code before this contract. |
| PR-02 | Backend + DevOps; models, additive migrations, new library service/routes | Private identities, constraints, immutable saves, receipts, archive/restore/purge and no-op behavior. Real PostgreSQL create/edit/concurrent/retry/delete tests; content sync leaves private records unchanged. Depends PR-01. |
| PR-03 | Frontend/UX; MyRecipes, editor/reader, API/store, routes, EN/DE | Compact manual flow against agreed mock contract, then real API. Draft recovery, field errors, retained conflict edits, language separation, account-switch isolation. Design mock can parallel PR-02 after PR-01; live acceptance requires PR-02. |
| PR-04 | Security + backend; auth export/delete, resolver and public projections | Owner canary/ID substitution tests on all direct and indirect paths; malicious content stays text; export includes retained content; purge and account deletion cover copies/receipts and cannot resurrect via retry. Ship with library, not after it. Depends PR-02; coordinate auth/models ownership. |
| PR-05 | Backend + frontend; CookLog, progress, sessions, CookMode, History/reflections | Typed private cooking, pinned revisions through edit/archive/refresh, replay-safe finish and no fabricated skills. Old/new client compatibility including counts. Requires PR-01/02/04 and separate UI review. |
| PR-06 | DevOps + QA; migrations, release tests, browser evidence | Fresh/populated PostgreSQL, concurrency, partial release failure, restore with deletion handling, old-consumer/new-data and compatible rollback. EN/DE, light/dark, 320/390/768/1280, keyboard, worker-enabled account isolation. Release library after PR-02/03/04 pass; cooking only after PR-05 passes. |
| PR-07 | Chairman + planning owner; later integration proposal | Personal recipe to plan/shopping with explicit household-copy policy and quantity/source contracts. Not an implicit dependency for the manual library; no enabled unsupported controls. |

Parallelize contract-based frontend and backend work, plus QA fixtures/security
negative cases. Do not let multiple agents independently edit models, migration
heads or auth deletion logic; assign one integration owner. These are proposed
task IDs for this document, not reused global PIPELINE numbering.

## 6. Verification, operations and remaining gates

Required before release: fresh and representative populated disposable PostgreSQL
migrations, two-worker revision races, duplicate creates, delayed response after
commit, stale retries after edits/purge, rollback without data deletion, current
curated tests and full content-sync sequence. SQLite is not a substitute. The old
PostgreSQL gate remains unverified; do not assume today's environment is unchanged.

Test a two-account plus guest canary across list/detail/revisions/cooking/history,
export, search, shares, sitemap, households and worker caches. Run a worker-enabled
browser test: the existing isolation harness blocks service workers. Test malicious
text, over-limit requests, unknown quantities, comma/fraction entry and step reorder.

Operational plan: measure errors/conflicts/save latency and revision/receipt growth
without logging recipe bodies. Bound/paginate reads. Define backup retention and a
restore procedure that reapplies deletion records before serving traffic. Verify
the intended database version and restore capability on approved test infrastructure;
do not assume Heroku, Hetzner or any production settings were checked here.

Evidence in this council run: actual source inspection and five independent reports
plus five peer reviews; skill validator passed using the existing project Python
environment, and installed/source SKILL.md were compared. No personal-recipe code,
new migrations, browser authoring implementation or feature acceptance tests ran.
The prototype's previously passing 89 tests do not verify this new feature.

The skill's first real exercise found three workflow gaps: recursive delegation
needed an explicit prohibition, decisions needed a shared ledger, and rollback
needed old-reader/new-data testing. All three were added to the installed skill.

A final bounded QA consistency pass found and corrected two issues in the chairman
draft: partial quantity input needed a saved raw representation, and the compatible
rollback floor must begin at the first private recipe write, not the first cook.
This was a read-only plan review, not executable feature verification.

Next action: approve the narrow scope and retention/readiness choices above, then
PR-01's field/API fixture and a compact Add recipe mockup. No commit, push or
deployment was performed by this council.
