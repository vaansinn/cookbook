# Private planning X1b — events, items and recovery

2026-09-13, local implementation; not release or full-prototype-parity approval.
Extends [the v1 command foundation](private-planning-v1.md), preserving its user
lock order, revision checks, canonical receipts, strict validation and no imports.

Current shopping, template, preference and contribution behavior is extended by
[X1c](private-planning-x1c.md). Statements below describe the X1b checkpoint.

## Data boundary

The additive migration chain is `a631b209ef40` → `b842c310fa51` (events, links,
tasks, previews, undo) → `c953d421ab62` (authored catalog) → `da64e532bc73`
(planned items) → `eb75f643cd84` (explicit SQL null/integer guards).
The corrective migration is separate; do not rewrite an already-applied migration.

- An event owns its date, time, guests, menu and preparation reminders. Plan links
  reference that identity; unlinking does not delete the occasion. Links outside
  a plan range remain visible facts, not implicit rescheduling or deletion.
- Items belong to exactly one meal or event through same-workspace composite FKs.
  They are configured dishes, personal quantities, or notes. Group and contribution
  labels are optional; a contribution is not yet an implemented shopping policy.
- Dish items retain catalog identity/revision, exact language and authored variant,
  plus whole-number servings. Event followers track guest count; explicit overrides
  do not. Guest updates resolve every follower in the transaction: unavailable or
  overflowing content rejects the entire change.
- Personal quantities are explicit decimal quantities and units, not inferred
  food identities. Notes have no quantities. No ingredient matching by display name.
- Catalog content is retained and digest-checked; ORM hooks reject content edits.
  This is not a database-trigger immutability guarantee. Publication/revocation is
  a trusted operator action, never a browser command. Production catalog is empty
  pending authored-content acceptance; tests publish synthetic fixtures only.

## Routes and commands

All routes remain under `/api/planning/v1`, authenticated and `no-store`.
Collection reads carry a workspace revision and bounded UUID pagination.

| Additional reads | Purpose |
| --- | --- |
| `/events`, `/events/:id` | Independent occasions |
| `/plans/:id/events`, `/events/:id/tasks` | Event references and reminders |
| `/meals/:id/items`, `/events/:id/items` | Menu contents |
| `/items/:id/preview` | Resolve retained configuration through current access |
| `/catalog`, `/catalog/:entry/:revision` | Eligible authored content in requested language |

`POST /catalog/resolve` is a content resolution read, not a personal write.
See [catalog contract](planning-catalog-v1.md) for exact authored variant schema.

New revisioned commands: `event.create/update/link`, `task.create/update`,
`meal.move/copy`, `item.create/update/move/copy`, `preview.confirm`, `undo.apply`.
Independent repeats add `plan.copy {plan_id,name,start_date}` and
`event.copy {event_id,name,date}`. A plan copy shifts its complete range, meals
and linked events by the same date offset, including out-of-range links. Each
referenced event becomes one new independent occasion, not a link to the original.
An event-only copy has no plan links. Both preserve menu configurations, quantities,
contributions and guest overrides while resetting reminder completion; they copy
no receipts, undo, cooking history or purchase coverage. The entire graph's dates,
limits and catalog eligibility are checked before creation. Return only the new
root and aggregate counts, not an unbounded copied graph. All changes are one
revisioned transaction; retry returns the same root and IDs.
Existing plan create/rename and meal create/update remain available. Copy creates
new independent IDs; move retains identity. Configured items are revalidated when
copied, moved, changed or restored. Unavailable content fails closed rather than
substituting a current recipe. Exact payload validation lives beside each service;
unknown fields and unsupported operations fail, never become a bulk JSON replacement.

## Destructive preview and undo

`POST /previews` accepts operation, payload and expected_workspace_revision.
Supported proposals: plan.delete, plan.resize, meal.delete, event.delete,
event.unlink, task.delete and item.delete. Proposal creation changes no domain
revision. The server captures bounded affected records, including linked entities
and outside-range event details, and returns its revision and expiration.
`DELETE /previews/:id` cancels only the owned proposal.

Confirmation uses the ordinary command envelope and preview ID. The server checks
owner, revision, ten-minute usability and recomputed effects, then changes records,
revision, receipt and inverse in one transaction. The inverse covers only affected
records, not the entire workspace. Undo restores identities and relationships and
revalidates configured content. It works only at the exact successor revision,
before expiry. Another successful domain command invalidates it; a failed command
does not. Confirmation reserves one receipt slot for its undo at the quota boundary.

Safety limits add 500 events, 2,000 links and 10,000 tasks/items per workspace;
500 tasks/event, 100 items/parent, 20 previews and 256 KiB inverse payloads.
These are engineering limits, not subscription tiers.

**Expiration is not erasure.** Ten minutes defines preview/undo usability. Expired
previews are cleaned on later proposal creation and replaced undo records on later
successful commands; idle records can persist. Successful receipts retain saved
results, including text, until account deletion. No periodic erasure or retention
duration is claimed. Define privacy retention and expired-retry behavior before
adding cleanup; do not silently prune successful receipts.

## Client and UI

`/planning/*` is a signed-in SQL-backed leaf, separate from the approved prototype
and `/plans` legacy planner. One responsive model supports bounded desktop day
boards and a phone agenda, optional meals, event links and preparation reminders.
EN/DE, light/dark, native dialogs, keyboard focus and visible recovery are included.
Dish/personal-item editor integration is an incremental layer, not full parity.

The account-specific client outbox retains exact request bytes and mutation IDs
through ambiguous failure/refresh. It is not an offline queue and never retries
automatically. Web Locks serialize cooperating tabs; unsupported locking/storage
fails closed for writes. Successful receipts require a fresh common-revision read.
401/422 cannot prove an earlier request failed: keep it pending through sign-in,
including legacy stored 422 rejection records. A real conflict requires review,
explicit rejection discard and a new submission; never silently overwrite.

Originating account/session/generation fences protect reads and writes. Foreground
revalidation retains open drafts; changed saved values require explicit review.
Modal recovery controls stay inside the modal. Undo survives pre-send errors.
Cross-tab token changes reverify identity before private content renders. Account
deletion persists a minimal owner marker under the same writer lock before the
request. Pending/deleted owners cannot recreate their outboxes in a stale tab.
Confirmed deletion has a local-only cleanup retry, bound to the original success
proof; ambiguous deletion is never treated as confirmed. Settings also passes its
rendered owner to the store, so a stale form cannot delete a replacement account.
These protections have lifecycle/auth tests, not merely server-deletion evidence.

Item selectors and their read state share an editor-owned controller. Save and
submit both require the current loaded catalog variant or selected destination;
loading, failed and obsolete reads cannot temporarily enable submission. A chosen
destination stays visible through conflict review but is unusable until it belongs
to the newly loaded collection.

## Evidence and remaining boundaries

PG07 passed fresh and representative old-history upgrades to corrective head,
two full sync sequences each, concurrent mutation/rollback, configured-item
copy/guest scaling/delete/undo, explicit SQL null/fractional checks and foreign
item/link/task constraints. Synthetic data only; development DB remains separate.
Backup/restore matched 33 public tables and 23 sequences and proved exact retry,
export and new writes on the restored database. Independent repeat verification
also passed concurrent replay, graph-copy fidelity, foreign-key isolation,
injected rollback and account cleanup, leaving table rows equal to baseline.
Populated corrective-upgrade cases have a separate evidence document.

Actual browser smoke checks passed plan creation, a ten-day range, meal creation,
refresh persistence, event creation, checked preparation reminder, linking,
destructive preview and undo restoring the event/link/checked reminder. Actual
event repeat retained quantified menu items and reset task checks; real cross-tab
sign-out removed private content and subsequent sign-in restored access.
The isolated mounted harness passed 8/8 recovery cases, including ambiguous
repeat, delayed catalog choices and destination-conflict recovery. Its transport
and accounts are synthetic, not evidence of database correctness.

Responsive checks covered 320/390/768/1280 CSS-pixel widths, EN/DE and light/dark,
with no page overflow in the checked views. The 320px native item dialog retained
keyboard navigation and returned focus to Add item on Escape. During this pass,
the root-launched Vite server was found to omit Tailwind content/styles: PostCSS
now resolves the exact frontend config and content paths are config-relative.
The compiled-CSS test and live dark background both confirm the correction.
This is browser smoke evidence, not exhaustive accessibility or physical S25/iOS
acceptance, and no visual approval is inferred.

Not yet full release parity: saved templates, source-aware shopping, packs/Use the
rest, preparation batches, leftovers, account-saved preferences and the rest of the
approved visual port. No user recipes, community sharing, payments, deployment,
participant recruitment or culinary approval are implied by this increment.
