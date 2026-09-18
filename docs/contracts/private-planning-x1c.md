# Private planning X1c — shopping, templates and preferences

Local implementation, 2026-09-13. Extends X1b; not public-release approval.
Migration `fc86a754de95` follows `eb75f643cd84`. No automatic catalog publication,
prototype import, household migration, paid service or account sharing.

## Source of truth

Shopping is a complete server projection, not the three visible agenda days.
A saved selection belongs to one private plan or event. Whole, inclusive date
range and explicit meal/event selections have distinct canonical identities.
Empty selections stay empty. Linked events count once; contributions and
out-of-range links do not contribute. An invalid selection is never broadened.

Ingredients match by authored ID, form and compatible unit, never translated
labels. Only g/kg and ml/l convert; weight, volume and counts do not mix.
Catalog v1 remains unchanged and renders explicit identity/form fallback labels
in Other, without inferred cupboard classification. Catalog v2 adds authored
localized labels, category and purchase mode. Qualitative `taste`/null amounts
require `check_cupboard`. V1 snapshots are not upgraded with current content.
Unavailable catalog content prevents presenting a partial list as complete.

Each source allocation has an opaque identity and independent needed/have/bought
coverage. Extras and personal additions are separate. Buying one dish's 220 g
does not cover the other dish's 600 g. A shopping amount edit changes only extra,
not recipe demand. Below-minimum UI input resets on blur; invalid/blank input is
not silently saved. Server validation is authoritative. Cupboard checks retain
measured and qualitative source details without inventing a pack/pantry amount.

Ordinary domain commands reconcile saved coverage inside their transaction. Changed
covered quantities require review; removed/reintroduced sources do not inherit
old checks. Internal unavailable-source bookkeeping is not a public partial
projection. Explicit guarded undo can restore earlier coverage. Reads do not
mutate personal state.

Capacity recovery has a narrow exception: confirmed deletion of an owned saved
selection can remove it without resolving unrelated unavailable/over-budget
lists. Its guarded Undo validates and resolves only the restored selection,
including current catalog access and per-invocation work limits. This is not a
waiver of ownership, revision, receipt, per-scope validity or content access.

## Writes, previews and lifecycle

Use the existing user then workspace lock, canonical mutation receipt and
expected workspace revision. Commands return bounded acknowledgements, not old
projections. Exact retries return their original result without reapplying.
The client reloads current resources and fences account/session/request changes.

`shopping.cover` retains a bounded single-scope inverse and returns guarded undo.
Destructive commands capture only affected parent selections, not unrelated
workspaces or every saved list. Selection removal previews disclose lost checks,
extras and personal additions. New inverses carry exact replacement scope IDs;
legacy inverses remain readable. An oversized inverse is refused, not truncated.
Undo is valid only at its exact successor revision and expires after ten minutes.

Private template summaries never expose an unchecked blueprint. Save/apply and
undo revalidate catalog eligibility. Applying a meal/menu template appends fresh
independent item IDs; no dates, event links, reminders or shopping checks are
copied. Guest-following dish servings use the destination occasion's guest count.
Explicit per-dish servings remain explicit. Deletion requires reviewed undo.

Preferences have a separate revision: language, theme, planning/shopping layout
and remembered shopping selection. Their writes still use the shared receipt
and workspace lock but do not advance the domain revision or invalidate undo.
Foreign/stale selection references confer no access. A GET masks a missing
selection without writing. Browser guest preferences are not imported.

Export/account deletion include scopes, coverage, extras, personal additions,
templates and preferences, plus existing preview/undo/receipt records. Ownership
of relational parents is enforced with composite foreign keys. JSON contracts
are service/ORM-validated, not claimed as database JSON-schema constraints.

## Bounds and recovery

100 saved scopes; 4,000 allocations per projection; 512 KiB persisted scope;
8,000 aggregate demanded source allocations and 2 MiB aggregate persisted state;
8 MiB distinct referenced catalog bytes and 512 distinct authorized variant keys
per reconciliation invocation. Keys include entry, revision, language and
canonical options, not servings. Overlapping scopes still consume allocations;
notes/contributions do not. Catalog byte sizing occurs in SQL before materializing
large JSON, and variant admission precedes content resolution. Individual reads
also respect catalog/variant work limits. Capacity errors are explicit 422
`shopping_capacity_exceeded`, distinct from authentication failure. No saved data
is evicted. These are provisional engineering limits, not a public scale promise;
100 templates; 100 items and 64 KiB per blueprint; 256 KiB general undo snapshot
(2 MiB UTF-8 for individual scope cover/personal removal/selection removal);
16 KiB client command. Existing receipt and workspace bounds also apply.
Bounds reject new work explicitly and never prevent an existing exact replay.
They are not a public scale/performance promise.

New-format records make an old X1b writer an unsafe rollback backend: it does not
understand their lifecycle or reconciliation. Downgrade refuses populated new
records and planning receipts/previews/undo. Retain compatible forward recovery.
Disposable PostgreSQL migration, concurrent-write and populated restore evidence
is recorded in the current council handoff; SQLite is not that evidence.

## UI and remaining boundaries

`/shopping` is the new top-level private shopping destination. `/groceries` and
legacy planner routes remain explicit legacy access; there is no dual-write.
Category, alphabetical, dish and amount layouts share the same projection.
Dish rows show Dish/Total columns. Name/checkbox checks; only the arrow expands.
Source checks, Check all, undo, extras, personal additions, date selection and
remembered scope use SQL commands and the common recovery adapter.

Account appearance is hydrated from SQL through a session-fenced provider.
Signed-in shared language/theme controls use the same command/recovery adapter;
Confirmed preference writes trigger fresh reads across mounted shared consumers.
Guest
device preferences remain separate and are restored on sign-out, never imported.
Confirmed command notifications carry no personal payload and only trigger reads.
They supersede older reads; they never automatically resubmit a rejected edit.
Guided cooking from
configured catalog items, full welcoming recipe/discovery port, physical-phone
acceptance, culinary publication and operational release remain separate gates.
Packs/Use the rest, shared batches, leftovers and personal recipe authoring are
not included in this slice.
