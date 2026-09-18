# Separate populated corrective-migration rehearsal

Latest evidence (2026-09-13): **the complete independent corrective rehearsal passed
on new native PG08, PostgreSQL 16.15**. All 16 offline guards passed. PG08 is now
smart-stopped with all databases/runtime files preserved. PG07 was
inspected read-only, stopped cleanly, and preserved; its earlier empty da64 targets
do not prove any corrective transition. See the PG08 execution record below.

This opt-in rehearsal uses exactly three **new** disposable PostgreSQL 16 databases
on `127.0.0.1:55432`. It never connects to fresh, history, development, restored or
recovery-source databases. The preceding restore rehearsal is complete and fresh
has been released to the parallel worker; this rehearsal does not reuse its baseline.

## Guards and exact targets

| Database | Case |
| --- | --- |
| cookbook_test_corrective_valid | Valid populated da64 → eb75; populated downgrade refusal |
| cookbook_test_corrective_invalid | Old constraints admit NULL/fractional records; corrective upgrade must fail without data/schema loss |
| cookbook_test_corrective_empty | Empty da64 → eb75 → da64 → eb75 |

All three names must be **absent** before any database is created; even an existing
empty target is refused. The sole additional connection is the fixed `postgres`
maintenance database for server identity, database-name existence checks and
`CREATE DATABASE ... TEMPLATE template0`. It never loads the app or accesses user
tables there. There is no reset, resume, database drop, role grant or service action.
If interrupted after creation, all databases remain as evidence and another run
refuses them. Do not delete, reset or resume occupied targets or substitute other
names. The coordinator authorized within the user-approved disposable verification
scope preserving PG07 and creating a fresh PG08 cluster for these same exact
names; that separate setup is recorded below. The
rehearsal's occupied-target guard remains unchanged.

Inputs require exact `localhost:55432`, explicit credentials, the exact target name,
and no URL query/fragment. `hostaddr=127.0.0.1`, bounded connection/statement/lock
timeouts and a null password-file path are constructed internally. The worker
checks server/database identity and PostgreSQL major 16. It checks the current
migration head is `eb75f643cd84` before creating databases; no moving-head assumption.
Validation runs before any driver/application import. Child processes use `-I -B`,
an environment allowlist, fixed migration actions/revisions, dotenv disabled and
no credentials in argv. Expected failures must contain the intended CHECK violation
or populated-downgrade refusal; connection/import failures do not pass.

## Command

From the worktree root, using the existing local synthetic test role with CREATEDB:

```powershell
$env:COOKBOOK_TEST_CORRECTIVE_CONFIRM = 'three-new-local-corrective-databases'
$env:COOKBOOK_TEST_CORRECTIVE_VALID_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_corrective_valid'
$env:COOKBOOK_TEST_CORRECTIVE_INVALID_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_corrective_invalid'
$env:COOKBOOK_TEST_CORRECTIVE_EMPTY_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_corrective_empty'
.local/venv/Scripts/python.exe -I -B scripts/verify_planning_corrective.py
```

These credentials belong only to the documented disposable local test role. The
script does not read password files, use production credentials, provision cloud
services or start/stop PostgreSQL. Database writes occur only when the explicit
confirmation and all target guards succeed.

## Evidence required

All three databases migrate from base to `da64e532bc73` through Flask's isolated CLI.
Fixtures are inserted using SQLAlchemy Core against **reflected old SQL tables**,
not current ORM metadata/defaults: synthetic user, workspace, plan, meal, personal
item, retained receipt and draft synthetic catalog with configured dish references.
No content sync or published culinary seed is used.

Valid populated upgrade preserves all public-table rows, IDs, receipt JSON, catalog
digests, columns, indexes and all sequence configurations/states. Only Alembic
revision and the two intended CHECK definitions may change. Independent rolled-back
SQL probes must reject NULL quantity-with-unit, NULL servings and fractional servings.
Populated downgrade then must explicitly refuse and preserve the complete snapshot.

The invalid database retains a NULL personal quantity with a unit, NULL dish servings
and fractional dish servings, all admitted by the old schema. Its eb75 upgrade must
fail with a relevant CHECK violation; every original row, old constraint/index,
sequence value and old Alembic revision must remain. No guessed values or repair.

The empty database must contain no user rows at either revision. Downgrade must
reproduce the exact old snapshot and re-upgrade the exact head snapshot. Snapshot
comparison reuses the restore verifier's read-only public-table/sequence collector,
including its narrow equivalent-array-cast normalization; it never invokes the
restore workflow or reads those databases.

Pure offline guards (no PostgreSQL/application import or connection):

```powershell
.local/venv/Scripts/python.exe -I -B tests/backend/test_planning_corrective_safety.py -v
```

## First continuation — 2026-09-13 (historical refusal)

**Blocked safely: all three exact target databases already exist.** The guarded
rehearsal did not reach database creation, migration, fixture seeding or snapshot
collection in this continuation. Their contents and prior rehearsal progress were
not inspected, so no migration-success claim can be made from this run.

The three owned files were read in full before execution. The runner and guard
tests required no edits. The worktree contains unrelated changes, which were left
alone; Git inspection used a per-command `safe.directory` setting. No commit or
push was made.

### Offline guard evidence

From `D:/Projects/cookbook/.worktrees/teaching-hardening`:

```powershell
.local/venv/Scripts/python.exe -I -B tests/backend/test_planning_corrective_safety.py -v
```

Result: **15 tests passed**, exit 0 (`Ran 15 tests in 0.036s`, `OK`). These cover
exact URL/confirmation validation before I/O, environment isolation, server
identity, refusal of any occupied target including an empty one, the complete
creation barrier, closed migration actions, intended failure causes, and snapshot
comparison guards. Mocked checks establish runner behavior, not live migration
outcomes.

### Existing native PG07 startup

Initial normal and escalated executions of the documented rehearsal command
failed to connect, with no creation messages. Elevated checks then confirmed
`pg_ctl: no server running` and `127.0.0.1:55432 - no response`:

```powershell
.local/postgres-runtime/pgsql/bin/pg_ctl.exe status -D .local/postgres-verification-07
.local/postgres-runtime/pgsql/bin/pg_isready.exe -h 127.0.0.1 -p 55432 -d postgres -U cookbook_tests -t 5
```

After authorization within the user-approved disposable verification scope to
start the stopped existing PG07 cluster,
its resolved directory and existing configuration were checked:
`listen_addresses = '127.0.0.1'`, `port = 55432`. Only that cluster was started:

```powershell
.local/postgres-runtime/pgsql/bin/pg_ctl.exe start -D D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-07 -l D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-07/corrective-startup.log -w -t 30
```

The startup wait expired while PostgreSQL recovered from the interrupted process.
The retained startup log records a sharing-violation retry on the log inside the
data directory, followed by successful automatic recovery. Without another start
attempt, PostgreSQL reported readiness at **19:49:00 CEST**. Follow-up status showed
PG07 running (PID 16296), and `pg_isready` reported accepting connections. The
startup log remains at the exact path above; nothing was deleted to resolve the
delay. PG07 was left running. No development-cluster command was issued.

### Live refusal and read-only metadata evidence

The exact four environment assignments and Python command in **Command** above
were executed again with local-engine escalation. Output:

```text
REFUSED: A corrective target already exists; all three must be NEW. No reset/resume.
```

The command tool reported a nonzero exit (1); no PASS or creation message was
printed. The refusal precedes the migration-head check and every target connection.

A separate isolated Python diagnostic reused `validate_targets`, `isolated_env`,
`load_tools`, `engine_url` and `identity` from the runner. It connected only to the
fixed `postgres` maintenance database, began with `SET TRANSACTION READ ONLY`, and
ran these metadata queries (the second once per exact authorized name):

```sql
SELECT current_database(), host(inet_server_addr()), inet_server_port(),
       current_setting('server_version');
SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname=:name);
```

Result, exit 0:

```text
IDENTITY ('postgres', '127.0.0.1', 55432, '16.15')
cookbook_test_corrective_valid EXISTS
cookbook_test_corrective_invalid EXISTS
cookbook_test_corrective_empty EXISTS
```

| Required live case | Evidence from this continuation |
| --- | --- |
| Valid populated da64 → eb75 preserves rows/schema/sequences | Not executed: occupied-target barrier |
| Old-admitted NULL quantity with unit, NULL/fractional servings cause unchanged failure | Not executed: occupied-target barrier |
| Populated eb75 → da64 explicitly refuses unchanged | Not executed: occupied-target barrier |
| Empty da64 → eb75 → da64 → eb75 | Not executed: occupied-target barrier |

All existing databases remain evidence. There were no database resets/drops,
fixture repairs, fresh/history/restore/development connections, personal-data reads,
production actions or network provisioning. The existing-cluster start was the
only explicitly authorized service action; the rehearsal script itself performs
none. Completing the live cases requires a separately authorized path that
respects the occupied evidence; this run must not be resumed by bypassing guards.
This is not a production rollback, old-application compatibility, or backup
retention-policy claim.

## Authorized read-only PG07 inspection and independent PG08 execution

The coordinator identified the occupied corrective databases as synthetic and
authorized within the user-approved disposable verification scope read-only
inspection of those exact three targets, followed by an independent fresh PG08
setup if needed. The specific PG08 direction came from the coordinator, not a new
user answer. This supersedes the earlier setup blocker; it does not authorize
resetting or resuming PG07 targets.

### What PG07 established

An isolated `python.exe -I -B -c` diagnostic used the runner's validated URLs,
environment allowlist and pinned engine builder. On `postgres`, it checked live
`data_directory` against the exact `.local/postgres-verification-07` path before
connecting to the three authorized synthetic databases. Every inspection
transaction was read-only; the existing snapshot collector read rows, schema and
sequence state without advancing sequences. No app was loaded.

All three targets were at **da64e532bc73**, with the old CHECK definitions and no
public-table rows except `alembic_version`: zero users, workspaces, plans, meals,
items, receipts or catalog rows. This is consistent with interrupted setup, not
evidence that a corrective upgrade, failed transition or empty down/up cycle
completed. Failed transitions cannot be claimed retroactively from final state.

Snapshot SHA-256 fingerprints, calculated over UTF-8
`json.dumps(snapshot, sort_keys=True, separators=(',', ':'))`:

| PG07 target suffix | Read-only snapshot fingerprint |
| --- | --- |
| valid | `5b08f3ee496aca83682913e4b82b24a3b5a266ffa3257aae70c774864f635586` |
| invalid | `33be7bf2595c4c3a665487e4cee44667c377db414e4ec0322c2bb7c08dabcead` |
| empty | `33be7bf2595c4c3a665487e4cee44667c377db414e4ec0322c2bb7c08dabcead` |

Inspection of the owned seeder identified an argument collision:
`insert(name, **values)` was called with both a positional table name and the
plan's `name=` field. Renaming the helper argument to `table_name` fixes seeding
without changing production code or migrations. The new offline regression test
exercises both fixture variants through plan creation and receipt insertion.
The PG07 snapshot alone does not establish the original failure's cause.

Exact changed source/test paths in this worktree:

- `D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_planning_corrective.py`
- `D:/Projects/cookbook/.worktrees/teaching-hardening/tests/backend/test_planning_corrective_safety.py`

### Bounded native setup commands

Existing native setup conventions were read from `docs/local-development.md` and
PG07 configuration: UTF-8, SCRAM-SHA-256, synthetic `cookbook_tests` bootstrap
superuser, loopback-only port 55432, 30 connections and 64MB shared buffers.
No binaries were downloaded or installed.

Immediately before stopping PG07, a read-only maintenance connection rechecked its
exact live data directory and server identity, then established **zero other
client sessions and zero prepared transactions**. After closing that connection,
the native tool performed a smart shutdown (exit 0):

```powershell
.local/postgres-runtime/pgsql/bin/pg_ctl.exe stop -D D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-07 -m smart -w -t 30
```

Before `initdb`, PowerShell resolved the worktree and `.local` parent, rejected a
reparse-point `.local`, calculated the absolute PG08 path, required it to be inside
the resolved worktree, and refused if that exact target already existed. It also
checked that the existing synthetic test password file matched the documented
disposable password without printing its contents. Checks confirmed:

```text
Verified absent PG08 target: D:\Projects\cookbook\.worktrees\teaching-hardening\.local\postgres-verification-08
```

Initialization used the following arguments and succeeded with exit 0.
`--no-clean` preserves partial evidence if initialization fails:

```powershell
.local/postgres-runtime/pgsql/bin/initdb.exe -D D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-08 -U cookbook_tests -A scram-sha-256 -E UTF8 --no-locale --pwfile=.local/test-password.txt --no-clean -c listen_addresses=127.0.0.1 -c port=55432 -c max_connections=30 -c shared_buffers=64MB
```

After checking that port 55432 had no listener, that the new log path was absent,
and that the generated configuration matched those settings, PG08 started with
exit 0. Its log is outside the data directory to avoid the earlier Windows
startup-log sharing conflict:

```powershell
.local/postgres-runtime/pgsql/bin/pg_ctl.exe start -D D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-08 -l D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-08.log -w -t 30
```

### Guard and live rehearsal results

After the fixture fix:

```powershell
.local/venv/Scripts/python.exe -I -B tests/backend/test_planning_corrective_safety.py -v
```

Result: **16 tests passed**, exit 0 (`Ran 16 tests in 0.060s`, `OK`). The original
15-test suite also passed before the edit.

A separate read-only maintenance check verified live PG08 identity and the
absence of all three exact targets before invoking the script:

```text
VERIFIED PG08 D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-08
SERVER 16.15
cookbook_test_corrective_valid ABSENT
cookbook_test_corrective_invalid ABSENT
cookbook_test_corrective_empty ABSENT
```

The four environment assignments and exact Python command in **Command** above
then ran with local-engine escalation. The script independently repeated its
guards, verified migration head, created the new triple and completed with
**exit 0**:

```text
Created cookbook_test_corrective_valid on 127.0.0.1:55432
Created cookbook_test_corrective_invalid on 127.0.0.1:55432
Created cookbook_test_corrective_empty on 127.0.0.1:55432
PASS valid: populated da64 -> eb75; all rows/IDs/receipts/catalog digests/sequences preserved; independent NULL quantity/NULL servings/fractional servings SQL probes rejected
PASS downgrade refusal: populated eb75 -> da64 explicitly refused; complete snapshot unchanged
PASS invalid: old-schema NULL quantity/NULL servings/fractional servings retained after expected CHECK failure; rows/revision/old constraints/indexes/sequences unchanged
PASS empty: da64 -> eb75 -> da64 -> eb75; exact old/head snapshots restored, no user rows
PASS: 33 public tables and 23 sequences compared; all three corrective databases retained
No fresh/history/restore/recovery-source/dev connections, database resets/drops, or service changes
```

The final line describes the script; the separately authorized PG07 stop and PG08
initialization/start are recorded above. The invalid-upgrade case contains all
three invalid records in one database and proves the expected CHECK failure with
an unchanged complete snapshot. Each newly forbidden rule is also exercised
independently by a rolled-back SQL probe on the successfully upgraded valid case.

### Retained final evidence

A final read-only inspection checked PG08's exact live directory and asserted the
expected revisions. It confirmed:

| Exact PG08 database | Revision | Retained fixtures |
| --- | --- | --- |
| cookbook_test_corrective_valid | eb75f643cd84 | One user/workspace/plan/meal/catalog/receipt; personal quantity 2.125 with unit loaf; dish servings 4 |
| cookbook_test_corrective_invalid | da64e532bc73 | One user/workspace/plan/meal/catalog/receipt; NULL quantity with unit loaf; NULL dish servings; fractional dish servings 1.5 |
| cookbook_test_corrective_empty | eb75f643cd84 | Only the Alembic revision row; no user rows |

Final snapshot fingerprints using the same serialization as above:

| PG08 target suffix | Read-only snapshot fingerprint |
| --- | --- |
| valid | `659983e99edbe4b96bc0b949311669ddba15411bd3186d70548d050abbb55399` |
| invalid | `a96f00f7f6ff75063151d3299617f13fb52c00d623a90adcacf06be9d188ec92` |
| empty | `14e3fdfe16acf74481813f13140035776531504dae0269180aa765059c966e2e` |

Final native status: **PG07 and PG08 stopped and preserved**, with all three PG08
databases retained. Before stopping PG08, an isolated read-only maintenance check
verified its exact live data directory and PostgreSQL 16 identity on
`127.0.0.1:55432`, then reported **zero other client sessions and zero prepared
transactions**. After disposing that connection, only PG08 was smart-stopped:

```powershell
.local/postgres-runtime/pgsql/bin/pg_ctl.exe stop -D D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-08 -m smart -w -t 30
.local/postgres-runtime/pgsql/bin/pg_ctl.exe status -D D:/Projects/cookbook/.worktrees/teaching-hardening/.local/postgres-verification-08
```

Stop returned exit 0 (`server stopped`); status returned exit 3 (`no server
running`). The retained log confirms `database system is shut down` at
**2026-09-13 20:00:40.553 CEST**. No other service was stopped in this final step.
All database directories and runtime/log files remain present. Restarting PG08
and re-running the script will refuse occupied targets; do not reset or reuse
them. PG08 runtime files
and `.local/postgres-verification-08.log` are retained under the worktree. No
personal/development database, fresh/history database or other cluster was
connected to or modified. Source edits are limited to the owned verifier, its
guard tests and this document. No commit or push was made.
