# X — production integration of the full approved planning prototype

**Mandatory for the first web/PWA release**, confirmed by the user on 2026-09-13. This replaces the reduced P-track launch proposal. Main execution/gates: [implementation-plan.md](implementation-plan.md).

Status: detailed implementation proposal; ownership, legacy-data and content/version contracts still need G1 approval. No implementation or migration is performed by this document.

Current remaining work: [launch checklist](../../../TODO.md), updated 2026-09-18.
Latest execution record: [continuation and verification](continuation-2026-09-13.md),
following [X1c shopping, templates and account preferences](shopping-foundation-council.md).
Local implementation/migration has since progressed under the user's separate
authorization. The proposal itself is not evidence of completed parity or release.

**Implementation update 2026-09-13:** private ownership and local development are
now user-confirmed. Bounded X1a schema/commands for workspaces, plans and meals are
implemented under the [slice contract](../../contracts/private-planning-v1.md).
Subsequent X1b/X1c work implements items/events/scopes/catalog infrastructure,
previews/undo, shopping, templates, preferences and repeat flows. The original
X1a limitations below are historical, not current missing-feature claims.
Authored catalog publication, full frontend/PX parity and release acceptance
remain open. No legacy or browser import is authorized. Publication/recovery/content
decisions for the complete X track remain gated.

## 1. Exact parity boundary

Sources: [current editor notes](../../prototypes/welcoming-planning-editor-notes.md), [current shopping notes](../../prototypes/welcoming-shopping-notes.md), [domain core](../../prototypes/welcoming-planning-core.js), [editor tests](../../prototypes/welcoming-planning-editor.test.mjs), [shopping tests](../../prototypes/welcoming-shopping.test.mjs). Historical foundation notes and older test counts do not override later implemented behavior.

| ID | Required behavior | Production acceptance oracle |
|---|---|---|
| PX01 | Variable plan dates; ordered, optional-named/timed meals; multiple dishes/personal items/notes | One-day and ten-day plans, empty days, several meals and dishes; no permanent meal slots |
| PX02 | Move/copy/reorder/edit/delete; quick servings/Change; independent configurations | Move retains identity; copy gets new identities; one dish edit changes neither another copy nor a cook |
| PX03 | Current/upcoming/past and Plan again | Local-date period logic uses plan end; repeats shift dates, create independent contents/events and no purchase state |
| PX04 | Event menu/groups, guest-follow overrides, contributions and preparation | Guest change updates only followers; contributed items produce no host shopping; tasks remain personal reminders |
| PX05 | Shared event identity across plans | Edit/date change updates all links; out-of-range event visible but excluded from that plan's demand |
| PX06 | Delete/unlink/repeat/template semantics | Unlink/delete plan preserves events; event deletion previews all links; repeated plan copies each distinct event once; templates carry no dates/live links |
| PX07 | Exact destructive preview/confirm and one-step undo | Preview lists affected meals/scopes/checks/extras/personal items; stale confirmation/undo cannot overwrite a newer change |
| PX08 | Configured recipe and planning-example previews | Selected servings/language/authored sauce choice drives ingredients and matching preview method; active cooks untouched; examples have no fake method |
| PX09 | Shopping is a top-level destination | Reopen last plan/event and selected scope; old routes resolve to same records; explicit empty/missing-owner states |
| PX10 | Whole/date/meal-event/empty selections | Canonical scope; two-day shortcut previews before apply; selection doesn't shorten plan; each selection has independent saved state |
| PX11 | Derived quantities and source/form/unit identity | Event counted once per selected scope; contribution excluded; kg/g and l/ml compatible, no volume/mass or dry/cooked conversion |
| PX12 | Category, A–Z, Dish, Amount | Layout never changes scope/checks; locale sorting; Weight then Count then Other with within-family comparison |
| PX13 | Full dish rows and Dish/Total columns | Shared ingredient appears under each relevant dish with local and aggregate totals, without duplicate demand |
| PX14 | Name/checkbox marks; arrow alone expands | Dish check covers its source occurrences; Check all/Undo/Dismiss follow-up; consolidated mixed state/remaining amount |
| PX15 | Needed/have/bought and source coverage | Already have doesn't create pantry stock; mixed states preserved; removed/reintroduced sources don't recover stale checks |
| PX16 | Extra amounts and editor behavior | 820 g needed +100 g extra =920 g; below-minimum resets on blur/save, not typing; blur doesn't save; invalid/blank stays error |
| PX17 | Increased-demand review | Review remains sticky after increases and subsequent decreases until explicit confirmation; source/extra allocations separate |
| PX18 | Herbs/spices cupboard check | Salt displayed once with separate measured/to-taste details; unchanged approved check transitions; flour/main ingredients not broadly reclassified |
| PX19 | Personal shopping additions and orphan extras | Stable private item IDs; never merge by text; edit/remove/undo; remaining extras stay visible if recipe demand disappears |
| PX20 | Compact adaptive UI and persistence recovery | Phone agenda, bounded desktop board/date jump, compact cards/actions/focus; saved actions survive reload; unsaved/failed changes aren't falsely saved |

**Not in implemented parity:** Explore-to-plan shortcut; guided cooking started directly from a planned configuration; packs/Use the rest; prepared batches/leftovers/yields; full pantry; arbitrary partial weights within one dish; retailer/nutrition/automatic schedules; user-contributed recipes; multi-user live collaboration. No future array in the demo establishes these as implemented.

Keep soup/salad as clearly labeled planning examples, neutral images and illustrative quantities. The tomato/sauce configurations need authored production content; the preview fixture is not culinary approval.

## 2. Proposed ownership and persistence architecture

### Recommended scope, pending Q08/G1

Use one **private planning workspace per account** initially. Events linked to plans must belong to the same authorized workspace. A contribution such as “Alex brings dessert” remains text/exclusion metadata, not another user's account, invitation or permission.

This supports the full prototype's behavior without inventing shared editing. Existing household data gets an explicit legacy-support/migration policy; never assign a household's data to one member merely to fit the new model.

Guest Basic cooking is unchanged. Guest planning/demo persistence needs an explicit policy: proposed account-backed real planning requires sign-in, while an optional clearly separated demo may remain browser-local. Do not automatically seed demo records into every real account or migrate guest/prototype records at login.

### Authoritative state

- **User-confirmed requirement, 2026-09-13:** real SQL-backed account persistence and GDPR readiness; not browser/app-only saving. Apply the privacy gate in the main plan. Confirmed saved planning/preferences must reappear after clearing browser storage and signing in on a clean second device; local-only prototype success cannot pass X10.
- PostgreSQL owns real saved plans/events/shopping, revisions and operation receipts.
- API commands change named entities/fields. No endpoint accepts an arbitrary replacement of all account planning state.
- Frontend holds query caches and bounded form drafts. It shows pending/rejected/uncertain distinctly; refresh/reconnect rereads authoritative state.
- Proposed conservative concurrency boundary: one locked workspace revision for planning/shopping mutations. This matches the prototype's “newer edit invalidates undo” behavior and covers newly added links/scopes without complex per-entity dependency races.
- A concurrent change elsewhere in the workspace can therefore cause reload/review. This is a deliberate first-release trade-off, not real-time merging. If later relaxed to aggregate revisions, preserve cross-plan event/scope atomicity.
- Preference-only updates use a separate revision path if they cannot affect content/coverage or invalidate undo; this separation must be explicit in the contract.

### Proposed record contracts

Names are provisional until the backend migration review; responsibilities/invariants are mandatory.

| Record | Required identity/data | Invariants |
|---|---|---|
| PlanningWorkspace | ID, user owner, content revision, timestamps | Unique per user; authorize/lock before mutation; no client-selected owner escalation |
| Plan | ID/workspace, name, start/end dates, ordering | Valid inclusive range; empty days derived; user names need not be translated |
| Meal | ID/plan, date, optional name/time, position | Date inside plan; stable identity on moves; transaction updates source/destination |
| PlannedItem | ID, exactly one meal or event parent, kind, position, optional group/contribution | Dish, personal and note are distinct; parent/workspace consistency enforced |
| Dish configuration | Item ID, catalog entry/revision, language, servings, selected option IDs, follows-guests | Authoritative available combinations; positive finite servings; no difficulty inference |
| Personal ingredient | Item ID, ingredient/form ID, quantity or qualitative marker, unit | Named ingredient identity, not translated display text; notes contribute no shopping |
| Event | ID/workspace, name/date/optional time, integer guests | Independent occasion; guest-count updates affect only following dish items |
| Event link | Plan ID/event ID | Same workspace; unique pair; event date can lie outside plan range |
| Preparation task | ID/event, earlier/day/serving bucket, text, done, position | Editable reminders, no generated timetable |
| Meal/menu template | ID/workspace, kind/name, independent item blueprint | Apply generates new IDs; no date/live event link or purchase coverage |
| ShoppingScope | ID/workspace, plan/event owner, mode and canonical selection/date bounds | Same selection resolves same scope; event currently all-only; empty meal selection valid |
| Shopping adjustment | Scope + ingredient/form/unit key, explicit extra | Requirements not stored as user-editable totals; nonnegative extra; qualitative extra disallowed |
| Shopping coverage allocation | Scope + ingredient/form/unit + source identity or extra identity, status/covered basis/review | Source-specific needed/have/bought; changed-demand review; no transfer between scopes |
| Personal shopping item | ID/scope, text, amount/unit, own coverage | Never matched to recipe rows by display name |
| User planning preferences | User, layout, last owner and per-owner current scope | Layout independent from scope; safe deleted-owner fallback |
| Command receipt | User/workspace, mutation ID, canonical digest, successful result/revision | Unique user mutation; repeat same payload replay; different payload conflict |
| Preview / inverse record | Principal, command/effects, generated IDs, dependency revision/content revisions, expiry | Bounded sensitive data; exact confirmation and guarded inverse; delete with account/retention policy |
| Planning catalog revision | Stable entry ID, immutable revision, kind, authorized recipe association, language/options, ingredient/method/equipment/time presentation | Server-authored content; planningExample cannot become guided recipe through client input |

Use decimal quantity storage/arithmetic with a documented precision/rounding policy matching displayed/source totals; avoid accumulated floating-point drift. Preserve raw qualitative quantities separately. Migrations enforce actual foreign keys, owner consistency and unique scope/link constraints, with service-level cross-parent checks where needed.

Freeze exact body/text/collection/quantity limits and pagination before G1. Preserve flexible durations and meals; “flexible” must not mean unbounded response allocation or unrestricted request size.

## 3. Recipe configurations and content — a separate blocking contract

The prototype catalog hard-codes tomato jar versus tomatoes/herbs, Bolognese, soup and salad. Current production recipe tiers do not by themselves implement these recipe-wide choices.

**Proposed release approach:** a small server-authored, versioned planning catalog linked to existing curated recipe identities where applicable. It describes only real authored options and resolves the selected configuration to coherent ingredient quantities and matching preview method/equipment/time. It is not a personal-recipe editor or automatic recipe generator.

- Canonical ingredient/form IDs map explicitly to existing food records where valid; preserve distinct forms and unit dimensions.
- Each planned dish stores its selected configuration and content revision so shopping/preview do not silently change when source content is edited.
- Authoring a revised catalog creates a new revision; offer an explicit item update with impact/review rather than automatically changing all saved plans.
- Validate catalog/recipe/tier/language eligibility server-side when adding, copying, displaying and deriving shopping. Define the user-visible unavailable/revoked-content state without silently substituting another recipe or exposing unauthorized content.
- Do not copy prototype quantities into curated production content as verified facts. Q10 approves the finite launch content set.
- Configured **preview** is mandatory. Direct guided-cooking integration for a configured planned item is not implemented parity. Do not route it into an ordinary cook that silently discards the options. Existing standalone recipe cooking continues unchanged.
- Personal items/free text are not curated recipes. Soup/salad remain marked examples with no authored cooking steps/creator-cooked claim.

**G1 evidence:** recipe/configuration/ingredient mapping for the finite release set; content-update and entitlement policy; example treatment; proof the planned API can render/derive the selected options without modifying active cook snapshots. Culinary execution acceptance follows later.

## 4. Proposed API and command protocol

Use a new planning API namespace, e.g. `/api/planning/v1`, alongside an explicitly supported legacy boundary. Final paths are frozen in ADR-D before parallel clients are built.

### Reads

- List/get plans and events with pagination/date windows and revision metadata.
- Fetch catalog/options and a configured planned-item preview.
- Fetch templates, scope descriptors and source-aware shopping projections.
- Fetch command/preview status for uncertain outcomes using authorized opaque IDs.
- Return current references/quantities/statuses, not a whole-account mutable dump. Access-check every owner/source/link and derived result.

### Writes

A bounded command endpoint or equivalent resource routes accepts:
`mutation_id`, `expected_workspace_revision`, an allowlisted operation and a strictly validated operation-specific body. Owner/user comes from authentication, not the payload.

Operations cover:
- Plan/meal/item create/update/move/copy/reorder/delete and date-range changes.
- Event create/update/link/unlink/delete/repeat, guest changes and preparation tasks.
- Plan again; template save/update/delete/apply.
- Scope selection; shopping extra/personal item/coverage changes; dish/all/seasoning coverage.
- Confirmed destructive effects and inverse/undo.
- Separate preferences update when it doesn't alter domain state.

Within one transaction:
1. Resolve current principal and allowed workspace/operation.
2. Check existing mutation receipt. Same ID/body returns the recorded success without new effects; different body returns conflict.
3. Lock workspace and validate expected revision, all references, current permissions and catalog dependencies.
4. Apply validated command, derive impacts and reconcile affected shopping scopes.
5. Save changed records, increment revision and successful receipt atomically.
6. Return result IDs/revision and affected projections or invalidation keys.

Stale versions return a conflict requiring latest-state review, not automatic overwrite. Replayed old responses must not overwrite a newer client cache; fetch/reconcile latest state as necessary. Preserve mutation ID and submitted body across response loss and refresh using a bounded account-scoped outbox that is **not** a general offline mutation queue. Clear/isolate it on account transitions.

### Preview → confirmation

Potentially destructive commands first return a principal-bound preview:
- exact normalized command and generated copy IDs;
- affected meals, links and scopes;
- explicit checks/extras/personal additions that would be removed or invalidated;
- workspace/catalog dependency revisions and expiry;
- opaque confirmation reference.

Confirmation commits only that reviewed proposal once. Any intervening relevant change—including a newly linked plan/scope or content/permission change—requires renewed preview. A tampered/expired/foreign preview fails before revealing protected effects. Cancellation creates no domain changes; short-lived preview records are bounded and expire.

### Undo

Preserve the prototype's one-step, session-visible behavior. The successful command may return an inverse token. Undo requires the exact successor workspace revision, valid principal/permission and unchanged dependencies; a later domain mutation disables it.

Apply the bounded inverse to affected records, not a saved whole-account snapshot. The inverse restores relevant scope checks/extras/personal items where the original operation removed them, without overwriting unrelated records. Refresh/reload clears the UI's undo offer; receipts can still reconcile uncertain saves. Account deletion/revocation and retention restrictions cannot be undone through this mechanism.

This extra persistence must be included in export/deletion/log-redaction/backup policy. Do not indefinitely retain deleted personal content inside inverse records.

## 5. Ordered mandatory X increments

### X0 — Parity, ownership and contract freeze

**Owner:** backend/frontend/QA, security review. **When:** Wave 0 before G1.
- Finalize PX01–PX20 against current functions/test names; mark intentional production differences.
- Resolve Q03, Q07/Q08: account-private versus household ownership, guest/demo behavior and legacy preservation.
- Freeze records/API/limits, content mapping/revision policy, error/retry/preview/undo rules and migration/recovery strategy.
**Artifact:** ADR-X, route/permission map, schema sketch and parity/test matrix.\
**Acceptance:** every approved prototype behavior has a real persistence/calculation path and an owner; no unbuilt future feature is smuggled in.

### X1 — Domain schema, command infrastructure and fixtures

**Owner:** backend integrator; QA harness; depends on LP10/11 and X0.
- Add ordered migrations for workspace/plans/meals/items/events/links/templates/scopes/coverage/catalog references/receipts/previews.
- Implement shared authorization, revision lock, validation, idempotent commands, preview binding and guarded inverse.
- Add representative legacy and parity fixtures; keep existing cooking/auth tables/contracts intact.
**Acceptance:** PostgreSQL constraints, no cross-account references, concurrent revision conflicts, rollback on injected failure, uncertain-command replay and lifecycle cleanup. No frontend writes until this contract is stable.

### X2 — Authoritative catalog and configured previews

**Owner:** backend/content; frontend preview leaf after API freeze.
- Implement authored catalog revisions/options, ingredient/form mapping and exact selected-configuration projection.
- Seed/publish only the reviewed finite entries; examples remain distinct; preserve active cooks and history.
- Add current-access checks and explicit content-update/unavailable behavior.
**Acceptance:** tomato jar vs tomatoes/herbs changes both requirements and preview method; Bolognese/defaults and personal/example items render correctly; unrelated planned instances/cooks unchanged.

### X3 — Flexible plan, repeat and template operations

**Owner:** backend plan service; depends on X1/X2.
- Implement plan range/name CRUD; arbitrary ordered meals/items and field-specific edits.
- Move/copy/reorder items and meals with exact identities; repeat plans shifts dates and copies each linked event once.
- Implement date-trim and deletion impact previews with scope-loss confirmation and guarded undo.
- Save/apply independent meal/menu templates; copies carry no purchase coverage/extras.
**Acceptance:** one-/ten-day, empty/multi-meal fixtures; independent copies; stale preview/undo; retry does not create duplicate meals/events/templates; local-date period logic.

### X4 — Events, live links and reminders

**Owner:** backend event service; can run alongside X3 after shared X1 interfaces freeze.
- Event/menu/group/personal contribution CRUD, guest-follow overrides and task edits.
- Link/unlink across same-owner plans; date edits reconcile every affected scope.
- Preserve out-of-range visibility with demand exclusion; delete plan leaves events; delete event previews and removes every relevant link/scope dependency.
- Repeat event creates new IDs/reset reminders without purchase state.
**Acceptance:** one event linked to two plans, move outside one range, contribution exclusion, guest overrides, delete/undo/copy retries and newly added links invalidating an old preview.

### X5 — Shopping projection and canonical scopes

**Owner:** backend shopping service; depends on X1/X2 and plan/event domain contracts.
- Canonical all/date/selected-meal-event/empty scopes; deduplicate event demand per scope only.
- Derive contributions from configured items with compatible-unit normalization and explicit source identities.
- Preserve stable scope-specific extras/personal additions; empty scopes contain no recipe needs; removed ingredients leave intentional extras visible.
- Supply all four UI groupings from the same source projection; server response supports dish-local/aggregate totals without double counting.
**Acceptance:** 220+600=820; Friday-only=220; whole/event selections independent; different forms/units not merged; contribution/out-of-range exclusion; empty and invalid selections never silently expand.

### X6 — Coverage, amount editing and reconciliation

**Owner:** backend shopping service; depends on X5.
- Persist per-source needed/have/bought, separate extra and personal-item allocations, sticky changed-demand review.
- Support dish-row checking, all-current-allocations checking, mixed/remaining summaries and seasoning actions without summing incompatible units.
- Remove obsolete source coverage; reintroduced source starts unanswered. Preserve independent states across scopes and grouping.
- Enforce minimum target at commit; client resets below minimum only on blur/save, blank/invalid remains an error. Source recipe requirement never changes from a shopping edit.
**Acceptance:** checking 220 leaves600; +100extra gives920 and independent extra checkbox; source increases/decreases and removals preserve approved review semantics; ambiguous retry/check-all/undo remain safe under concurrency.

### X7 — Account-scoped adapter and plan/event UI port

**Owner:** frontend planning leaf, shared integration by frontend owner.
**Depends:** LP20, X1 stable contract; integrated acceptance uses X2–X4.
- New API/query/cache/command adapter with account/workspace identity and version fencing.
- Port compact cards, bounded three-day desktop board/date jump, phone agenda, list current/upcoming/past and independent Plan again.
- Wire named/unnamed meals, items/options/servings quick editors, explicit move/copy, templates and configured previews.
- Port menu/preparation, guest controls/contributions and live event link/out-of-range presentation.
- Destructive previews show actual server effects; Escape/cancel/focus return and stale confirmation/undo are deliberate.
**Acceptance:** PX01–PX08 through real APIs; no prototype whole-state save; active cooking attempts untouched; account switch discards stale successes/failures without silently losing an acknowledged save.

### X8 — Shopping UI port and network recovery

**Owner:** frontend shopping leaf; can run alongside X7 after shared adapter freezes.
**Depends:** LP20, X5/6 contracts.
- Top-level Shopping, remembered owner and scopes, compatible legacy routes, explicit empty states.
- Four grouping layouts, locale sorting, Dish/Total columns, name checkbox versus arrow-only disclosure.
- Source-row checks, Check all/Undo/Dismiss, extras, personal additions, cupboard-check semantics and quieter controls.
- Minimum correction, scoped unsaved editors, updated-quantity review and safe stale aggregate handling.
- Preserve pending/rejected/uncertain response UX across refresh/reconnect; no silent offline account writes or last-writer-wins.
**Acceptance:** PX09–PX20 real API scenarios; focus/keyboard and EN/DE/themes/phone/desktop; grouping and scope independent; all saved actions survive account reload.

### X9 — Legacy continuity and full personal-data lifecycle

**Owner:** backend/security/DevOps; depends on Q03/Q07 and X schemas.
- Choose explicit legacy coexistence or reviewed conversion. Inventory old favorites/plans/households/aggregates and links; do not auto-copy shared data into a private account.
- Unknown provenance/quantities remain explicitly unknown/retained legacy records. No guessed allocation into new scopes.
- Define one authoritative writer during cutover; no unreviewed dual-write between old/new planners. Old clients get the approved compatible adapter or explicit reload/read-only behavior, not successful writes into an abandoned store.
- Extend export/deletion to every new record, preview/undo data and preferences, preserving co-member and retention rules.
- Define compatible recovery build and test it after new records/commands; literal pre-X backend is not a valid rollback target if it cannot safely use the X model.
**Acceptance:** migrated synthetic legacy databases preserve declared data/link behavior; no privilege expansion; lifecycle complete; recovery reads/writes and deletion/revocation reconciliation proven.

### X10 — Integrated parity and release rehearsal

**Owner:** QA with all owners; consumes X1–X9.
- Preserve the prototype regression cases as behavior specifications, add server-authoritative equivalents and fault/concurrency/device tests.
- Execute every PX row, multi-plan event impacts, stale preview/undo, receipt replay, account transitions and worker updates while editing/cooking.
- Full PostgreSQL migration/content-sync/restore/recovery plus LP50 physical/mobile/accessibility/content gates.
**Acceptance:** signed parity matrix for the exact candidate. Mock/local prototype success cannot substitute for backend integration. No unresolved mandatory X item at G4.

## 6. Parallel dispatch and integration order

| After | Concurrent work allowed | Shared write boundary |
|---|---|---|
| X0/ADR-X | X1 domain foundation, QA fixture/scenario authoring, LP20 visual primitives, content mapping/preparation | One backend schema/migration/command owner |
| X1 contracts | X2 catalog, X3 plan service, X4 event service via disjoint leaf modules, X7 adapter/UI against fixtures | Parent command/authorization/migration files remain integrator-owned |
| X5/6 contracts | X7 plan/event UI and X8 shopping UI, QA end-to-end scenarios, X9 migration/lifecycle | One frontend adapter/router/locales/worker owner; leaf components split |
| Integrated X2–X9 | X10 plus LP40/41/50/51 acceptance | One candidate, isolated test targets, serialized migrations/releases |

Use the main dispatch template. Proposed paths: new backend `planning/` services and `routes/planning.py`, existing models/migrations under integrator ownership; frontend `api/planning.js`, `store/` or `hooks/` controllers and `components/planning/`, `components/shopping/` leaf UI. These are proposed paths, not files already created.

Do not run two writers on the same shared files or concurrent migrations against the same database. Cap total agents at the available capacity; rotate a reviewer into a leaf implementation seat only with a new disjoint assignment, then use a different reviewer.

## 7. Low-confidence issues and required Q&A

- **High confidence:** user chose full implemented prototype parity and web/PWA first; present behavior can be specified from the code/tests.
- **Low confidence until G1:** private versus household authority; guest planning; exact legacy records/continuity; authored variant/catalog mapping; content-update/entitlement semantics; practical source/revision/preview/undo schema and limits.
- **Medium design confidence, unverified implementation:** workspace-wide serial revision is a conservative manageable first-release choice; false conflicts across independent plans are an explicit trade-off. No operational data yet proves load/concurrency behavior.
- **Low recovery confidence:** a new domain/model cannot be assumed rollback-compatible with the old backend; designate/test a recovery build or an approved read-only/forward-fix strategy.
- **Unverified until release:** real-device/worker lifecycle, restored database and mail delivery, culinary quantities and image comparison.

**Ask next at X0:** Q03 existing data; Q08 private account planning versus new household collaboration and independent-scope behavior; Q07 retention/link policy; choose finite content mapping and update policy. These are production differences; do not repeatedly reopen already approved row/card designs.

## 8. Scope and sign-off rule

The user's inclusion decision is final unless they change it. Contract uncertainty does not permit silently reducing X to the older planner, a subset of checkboxes, or a local-only demo.

G1 accepts this track only with approved ownership/content/legacy/API/recovery contracts and a feasible PostgreSQL/device verification route. G3 accepts the integrated interface; G4 requires all mandatory parity and release evidence. Full plan approval does not itself authorize code changes, purchases, production cutover or publication.
