# Private planning v1 — command foundation

The X1a record below remains the foundation. The implemented X1b extension is
specified in [events, configured items and recovery](private-planning-x1b.md).
Its schema, operations and UI supersede the original deferral statements below.

2026-09-13. First bounded production-backend increment, local development only.
This freezes the plan/meal command foundation, **not** the entire X track or release.
User confirmed private account-owned data, SQL persistence, full approved
planning/events/shopping for launch, and local development without paid resources.

## Delivered boundary

- Create/name/read plans with explicit inclusive calendar-date ranges.
- Add multiple optional-named/timed meals per date; edit meal name/time.
- One private workspace per account; no household owner, invitation or sharing.
- Atomic revisioned commands and durable successful-response receipts.
- Account export/deletion includes these records; no demo/legacy imports.

At the X1a checkpoint there were no UI writes. The existing prototype and old production planner are unchanged.
Dish items, catalog/options, events, shopping, movement/copy/templates, date-range
changes, deletion/preview/undo, preferences and the account-scoped frontend outbox
remain separate increments. Missing operations return validation errors; there is
no whole-workspace replacement endpoint. A meal is a grouping record, not a recipe.

## Schema and ownership

Migration `a631b209ef40`, parent `f027a841d110`, adds only:

| Table | Key invariant |
| --- | --- |
| planning_workspaces | UUID ID, unique user owner FK, nonnegative revision |
| private_plans | UUID ID, workspace FK, name, inclusive start/end dates |
| private_meals | UUID ID, same-workspace composite plan FK, date, optional name/time, unique position per plan/date |
| planning_mutations | Workspace + mutation UUID unique, canonical request digest, saved result/status/time |

Owner comes exclusively from the validated JWT account, never a request field.
The composite `(plan_id, workspace_id)` foreign key references the matching
`(id, workspace_id)` unique constraint, rejecting cross-owner relationships in
PostgreSQL as well as in the service. Child/workspace user FKs cascade on deletion.
Explicit lifecycle cleanup also supports the existing SQLite test harness.

Workspaces are created lazily by successful commands. GET, login and export do
not create data. Invalid/foreign/stale commands create neither a workspace nor a
receipt. No migration seed, household conversion or browser-storage adoption.

## Routes

All paths below are under `/api/planning/v1`, require a current account and return
JSON with `Cache-Control: no-store`.

| Route | Result |
| --- | --- |
| GET /workspace | `{workspace: null, revision: 0}` initially; otherwise workspace metadata and revision |
| GET /plans | `{plans: [...], revision, next_cursor}` |
| GET /plans/:id | `{plan, revision}` |
| GET /plans/:id/meals | `{meals: [...], revision, next_cursor}` |
| GET /mutations/:mutation_id | `{result, status_code}` for a successful owned receipt |
| POST /commands | One allowlisted command below |

Pagination uses `limit` (default 50, maximum 100) and canonical UUID `cursor`;
stable UUID lexical order, not a calendar presentation order. Client groups/sorts
meals by date/position after loading the needed pages. Unknown/duplicate pagination
fields are rejected. Each response includes its workspace revision: discard and
restart a multi-page load if that revision changes. Cursor possession grants no
access to the cursor's original account.

GETs and account export start a PostgreSQL REPEATABLE READ, READ ONLY transaction
after discarding JWT's prior lookup transaction. Account existence is rechecked
within that snapshot. Metadata, records and revision cannot mix commits. SQLite
is regression evidence, not concurrent snapshot acceptance.

## Command body

```json
{
  "mutation_id": "83d2e0d1-ce92-4f7b-b17b-d660b74a0147",
  "expected_workspace_revision": 0,
  "operation": "plan.create",
  "payload": {
    "name": "A few dinners",
    "start_date": "2026-09-14",
    "end_date": "2026-09-16"
  }
}
```

| Operation | Payload | Successful status |
| --- | --- | --- |
| plan.create | name, start_date, end_date | 201 `{plan, revision}` |
| plan.rename | plan_id, name | 200 `{plan, revision}` |
| meal.create | plan_id, date, optional name/time | 201 `{meal, revision}` |
| meal.update | meal_id, one or both of name/time | 200 `{meal, revision}` |

Omitted edit fields are unchanged. Null clears optional meal name/time; empty or
whitespace-only optional names normalize to null. Plan names cannot be empty.
Date, parent and position cannot be patched through meal.update. Every accepted
command, even a same-value rename, advances revision once and produces a receipt.

### Transaction and retry semantics

1. Validate complete bounded body, including unknown/duplicate JSON keys.
2. Lock existing User via a no-op update, then its workspace. This reuses the
   existing reflection lock order and serializes lazy workspace creation/deletion.
3. Find receipt before checking expected revision or storage quotas.
4. Same mutation and canonical body returns the recorded **body and HTTP status**;
   different valid body with that ID returns 409 `mutation_conflict`.
5. A new stale mutation returns 409 `revision_conflict` plus `current_revision`.
6. Validate owned target, range and quotas; apply record changes, revision and
   receipt in one transaction. Failure rolls everything back, including first
   workspace creation. Unexpected database failures return sanitized 503.

Canonical digest is SHA-256 over sorted JSON keys/compact serialization. JSON
formatting/key order is insignificant, but changing request fields (including
expected revision, omitted versus explicit null, or name whitespace) changes the
request identity. Clients must retain the exact submitted body on ambiguous retry.
An old replay response is not the current workspace: clients must reconcile
revision before applying it to a cache. A missing mutation receipt (404) does not
prove a still-in-flight command will never commit; retry the same ID/body.

Malformed fields are 400 `invalid_request`; >16 KiB is 413; missing/foreign records
share 404 `not_found`; exhausted quotas are 409 `limit_reached`. Errors never echo
raw SQL, credentials or another owner's current values. Existing JWT 401/422
behavior is retained; this increment does not replace authentication transport.

## Resource limits

Engineering safety bounds, not paid tiers: 16 KiB command body, 160-character
names, canonical UUIDs, integer revision 0..2147483646, dates YYYY-MM-DD with a
1..730-day inclusive range, optional 24-hour HH:MM. Controls, NULs, lone Unicode
surrogates, boolean revisions, malformed dates/times and unknown fields rejected.
Meals must lie inside their plan. Append positions are serialized by the command
lock. Limits: 500 plans/workspace, 2,000 meals/plan, 100 meals/day, 10,000 meals
and 10,000 successful mutation receipts/workspace. Existing retries remain valid
at the receipt quota. Receipts are not silently expired/pruned. Future retention
policy must define expired-retry semantics before changing this contract.

## Data lifecycle and compatibility

Export adds `private_planning` (workspace/plans/meals/receipts), `favorites` and
`legacy_meal_plans`. Recipe references are exported as saved references, not
unauthorized full cooking content. New private records/receipts disappear in the
same account-deletion transaction. The pre-existing deletion FK omissions for
favorites and exclusively owned old meal plans/items are corrected too.

Existing shared household rows remain under the old retention behavior; only the
deleted account's nullable `added_by` is cleared, not reassigned. Other members'
attribution/content remain unchanged. This is not a complete shared-data privacy
policy; unknown historical provenance and arbitrary names in free text remain
limitations for the later legal/product retention checkpoint.

Legacy and new planners coexist without imports, dual writes or changes to cook
attempts. Migration adds no user data and does not rewrite old tables. Downgrade
refuses once **any** private workspace exists, rather than silently dropping saved
data. A pre-X application is not an approved recovery build: it cannot export or
operate the new records. Use a forward fix; destructive conversion/recovery needs
separate review. Backup/restore and cutover remain open.

## Review and verification

Independent reviewer Erdos (`01a09b5b-3acc-7ff1-a695-b5f8d3c6e56a`) reviewed the
contract and actual implementation. QA author Lorentz
(`01a09b5b-3c2c-7212-bc79-007513566d33`) independently added 16 API/lifecycle tests.
This was a bounded review, not another five-seat council or release sign-off.
Adopted findings: portable first lock, matching composite FK, legacy deletion
references, bounded receipts, and revision-consistent reads/export.

Tests: `tests/backend/test_private_planning.py`, mock downgrade guards in
`test_private_planning_migration.py`, and real PostgreSQL checks in
`scripts/planning_postgres_checks.py`, invoked after the guarded verifier's fresh
migration/sync passes. PostgreSQL uses synthetic accounts and a separate disposable
cluster; never development or production personal records. Coverage includes
concurrent initial retry, competing revisions, failure after domain flush,
composite FK rejection, consistent interleaved read/export, private lifecycle,
shared-row retention and legacy coexistence. Full-suite/current evidence is
recorded in the pipeline; a green mock test is not PostgreSQL evidence.

Next dependency: X1b event identity/link schema and destructive preview/undo
contracts, followed by authored dish configurations. Do not wire a reduced planner
over the approved prototype and call it full parity. No new user answer is needed
to design these private-data contracts; culinary/catalog publication, sharing,
recovery policy, physical devices and eventual hosting remain later gates.
