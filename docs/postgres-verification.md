# PostgreSQL verification — LP10, iteration 1

Latest local evidence (2026-09-13): a fresh PG10 five-database run of
`scripts/verify_release.py --run` passed all five stages: fresh/history/full sync
and planning, repeat, shopping/templates/preferences, new-format restore and
populated X1b upgrade. It used native PostgreSQL 16.15 on loopback 55432 and
synthetic fixtures only. The completed cluster is stopped and retained; never
reuse its occupied targets as empty. CI configuration exists, but CI execution
and production recovery are not claimed. See the
[current handoff](councils/launch-readiness/shopping-foundation-council.md).

Earlier local evidence (2026-09-13): PG07 passed fresh and representative history
upgrades to `eb75f643cd84`, repeated full sync and configured-item transaction/FK
checks. The separate [planning restore rehearsal](planning-recovery-verification.md)
passed complete 33-table/23-sequence comparison and restored retry/export/new-write
checks. PG08 independently passed valid/invalid populated `da64` corrective
upgrades, populated downgrade refusal and empty downgrade/re-upgrade:
[corrective evidence](planning-corrective-verification.md). Earlier X1a statements
below describe that checkpoint, not current lack
of a local engine or absence of restoration evidence. Operational backup policy,
production recovery and physical-device acceptance remain separate gates.

This is a bounded migration/content-sync smoke test, separate from the SQLite
backend regressions. It is not a release sign-off. **Update 2026-09-13:** it passed
on real local PostgreSQL 16.15 using a new isolated Python 3.11 environment:
fresh and representative old-history upgrades, with the full sync sequence
repeated twice on each target. See [local setup and evidence](local-development.md).
The original LP10 iteration was blocked by a missing driver; that local blocker
is now resolved. The X1a follow-up also passed real PostgreSQL private-planning
transaction and consistent-read tests described below. CI execution and operational
production rollback/recovery remain unverified; bounded local corrective and
restore evidence is linked above.

## Target contract

Use a dedicated disposable local PostgreSQL instance that nobody else is using.
Both databases must already exist and contain **no user relations in any user
schema**. The runner does not create/drop databases, reset schemas, truncate data,
or clean up after success/failure. A second invocation against populated targets
is refused; the repeated sync is performed within one invocation. Provision a
new disposable instance for another invocation. Do not point this at a tunnel,
proxy, shared server, personal database, staging or production.

Required environment variables (no command-line URL or dotenv fallback):

| Variable | Required value |
| --- | --- |
| `COOKBOOK_TEST_DATABASE_URL` | `postgresql://USER:PASSWORD@localhost:55432/cookbook_test_fresh` |
| `COOKBOOK_TEST_HISTORY_URL` | `postgresql://USER:PASSWORD@localhost:55432/cookbook_test_history` |
| `COOKBOOK_TEST_POSTGRES_CONFIRM` | `disposable-local-test-databases` |

The literal hostname and port are fixed to `localhost:55432`. The
`postgresql+psycopg2` scheme is also accepted. Credentials must be explicit;
percent-encode punctuation. Query strings, fragments, alternative hosts/ports,
encoded host/path tricks and service overrides are rejected. Both URLs and the
confirmation are validated before subprocesses, database imports or connections.
Both targets pass a read-only `pg_class` emptiness check before **any** migration,
fixture or sync write begins. Reserve this dedicated instance exclusively for
the run: the preflight is not a lock against an unrelated concurrent writer.

The worker uses an allowlisted environment and Python isolation. Caller
`DATABASE_URL`, `PG*`, app secrets and mail configuration are not inherited.
Connections pin `hostaddr=127.0.0.1`, disable password-file lookup and use bounded
connection/statement/lock timeouts. Flask's existing `DATABASE_URL` input is
populated internally from the validated test target only. Both Flask dotenv
loading and the application's explicit `load_dotenv()` call are disabled.

After an operator has separately provisioned the disposable instance and set
the three variables, run from the repository root with the intended Python:

```powershell
python scripts/verify_postgres.py
```

No install or database provisioning is done by this command. It requires the
repository's Python dependencies, including `psycopg2-binary`. Missing driver or
an inaccessible engine is **BLOCKED (exit 3)**, never a SQLite substitution.
Exit 0 means the smoke passed; exit 1 means a verification/subprocess failure;
exit 2 means unsafe configuration or a nonempty target was refused. A failure
after preflight can leave test data partially populated. Output is captured and
the test credentials are redacted before printing; avoid real credentials even
for local verification.

## Covered scenarios

1. Empty fresh database: upgrade to migration head.
2. Empty history database: upgrade to `ee06718de8cd`, insert a deterministic
   synthetic account, dish, old cook and reflection through the old schema,
   then upgrade to head. Verify original fields/IDs and nullable snapshot/language
   survive, reflection revision becomes 1, and no mutation receipts are invented.
3. On each target run `sync-recipes`, `sync-glossary`, `sync-skills`, then
   `sync-lessons`. Require populated content and bilingual lesson/step links.
4. Repeat the head upgrade and entire sync sequence on each target. Compare
   content rows/IDs for stability and check old history again.

5. After fresh-target sync, run `scripts/planning_postgres_checks.py` in an isolated
   child process against that validated target only. Synthetic route-level checks
   cover concurrent identical retries, competing revisions, rollback after an
   injected post-flush failure, stale receipt replay, cross-account denial and the
   composite ownership FK. Deterministic interleavings verify plan reads and account
   export retain a consistent revision/content snapshot. Export/deletion also cover
   private planning and representative legacy favorites, plans and shared records.

The final X1a run passed on native disposable cluster `postgres-verification-05`,
with fresh/history upgrades to `a631b209ef40` and repeated full sync on both targets.
These planning-specific checks do not establish concurrency correctness for every
older route. Transaction rollback is tested; **migration downgrade, backup/restore
and deployment behavior are still future gates**. The populated-downgrade refusal
has pure mock coverage, not a live downgrade rehearsal.

## Pure safety tests

```powershell
python -B tests/backend/test_postgres_runner_safety.py -v
```

These tests require only the Python standard library. They reject missing
confirmation/URLs, production-like names, wrong hosts/ports, duplicate targets,
URL escapes and inherited configuration; they verify the two-target emptiness
barrier, blocked exit status and output redaction with fakes. They never connect
to PostgreSQL or import its driver. The chairman-owned `tests/run_backend.py`
also discovers this file automatically.

## CI contract

`.github/workflows/verify.yml` runs on explicit `push` and `pull_request` events
with `contents: read`, Python 3.11 and Node 22. It uses `pip -r requirements.txt`
and `npm ci` with the frontend lockfile; it records Python's resolved dependency
versions, source/content identity and build hashes. Python transitive packages
are recorded, not fully locked by this iteration.

The workflow runs the existing backend runner, frontend/prototype scripts and
frontend build (output under runner temporary storage, preserving `static/`).
It provisions the two database names only inside a disposable PostgreSQL 16
service, then runs the smoke script. Those provisioning commands belong to CI,
not the runner. Credentials are public synthetic CI-only values. There is no
deployment, GitHub environment, production secret, `pull_request_target`, or
write permission. Test/build logs and dependency/source records are retained
for seven days; pipeline failures retain their exit status through Bash
`pipefail`. The workflow definition has not been executed in this iteration.
