# Local planning recovery rehearsal

This is a synthetic PostgreSQL 16 rehearsal, not a production backup policy or
permission to publish culinary content. Run only after the main migration verifier
has exited successfully and nobody is writing its disposable cluster.

## Exact targets and lifecycle

All connections are pinned to `127.0.0.1:55432`, while input URLs must spell
`localhost:55432` exactly. Development port 55433 and arbitrary hosts, ports,
database names, query parameters and inherited libpq settings are rejected.

| Database | Role |
| --- | --- |
| cookbook_test_fresh | Existing completed-verifier source; table data never written |
| cookbook_test_recovery_source | New empty clone, then dedicated synthetic recovery fixtures |
| cookbook_test_restored | New empty restore target, then test-client recovery checks |

The script can create only the last two database names using `TEMPLATE template0`.
Both existing destinations must pass read-only emptiness checks before *any*
creation/restore. It never resets, drops databases, starts/stops services, imports
legacy/prototype data, or touches the development database. The original source
must have the verifier's one surviving synthetic user/workspace and three receipts,
and be at the current migration head. This is a narrow fixture check, not a general
proof that arbitrary data is synthetic; explicit confirmation remains required.

The workflow dumps fresh with a read-only libpq connection, restores the clone,
compares it, then adds one synthetic account plus a configured dish, personal item,
event, link, task, mutation receipts, and expired preview/undo data **only to the
clone**. A second dump restores that complete fixture into the final target.
The synthetic catalog revision is marked published solely inside the disposable
test databases; it is not a development seed or culinary Q10 approval.

## Execution

From the worktree root, after main confirms the migration verifier is finished:

```powershell
$env:COOKBOOK_TEST_RESTORE_CONFIRM = 'verifier-finished-synthetic-clone-and-restore'
$env:COOKBOOK_TEST_DATABASE_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_fresh'
$env:COOKBOOK_TEST_RECOVERY_SOURCE_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_recovery_source'
$env:COOKBOOK_TEST_RESTORED_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_restored'
.local/venv/Scripts/python.exe -I -B scripts/verify_planning_restore.py
```

These are the documented disposable test credentials, never production credentials.
If the local test role differs, provide its explicit percent-encoded credentials in
all three URLs without logging them. Creating a missing database requires that role
to have local CREATEDB permission; an operator can instead precreate the exact empty
targets. No permission or role is granted by this script.

The runtime is discovered at `.local/postgres-runtime/pgsql/bin`; both `pg_dump`
and `pg_restore` must report major 16. No PATH fallback or download is attempted.
Children receive isolated environments, no shell commands, no credentials in argv,
and bounded timeouts. `pg_restore` uses `--single-transaction --exit-on-error`,
without `--clean` or `--create`. Archives are generated in a unique temporary
directory and removed on completion/failure; target databases remain for inspection.
An interrupted OS process may leave its temporary archive: treat it as synthetic
account data and remove only its explicitly identified temporary directory.

If a run fails after population, do not rerun against those occupied destinations.
The tool deliberately refuses them. Preserve evidence and arrange new disposable
test infrastructure separately; the script has no reset mode.

One narrow resume is supported: if only the initial clone was restored and fixture
seeding has **not** begun, set `COOKBOOK_TEST_RESTORE_RESUME=verified-pristine-clone`.
The final target must still be empty, and the clone's complete snapshot must equal
fresh before any database creation or fixture write. A seeded/changed clone fails
this comparison. This option never overwrites or restores into a populated target.

## Acceptance and limits

Before test-client writes, compare every row of every public table, table columns,
constraints, indexes, and every public sequence's configuration, `last_value` and
`is_called`. This includes identities, receipt bodies/status/digests, catalog content
digests, exact numeric values and original preview/undo expiration timestamps.
Row values stay in memory and the local dump; logs contain only stage summaries.

The restored test client must replay an old command with the exact mutation/body
and receive the saved body/status without changing the database; reject expired
undo and preview tokens; reproduce the account export; resolve the configured
item; refuse a foreign plan; and accept a fresh write, its retry and a subsequent
export. The clone remains unchanged during these checks, and fresh is compared to
its original baseline at the end. Retained schema constraints are included in
comparison, rather than treating a row-only copy as a complete restore.
PostgreSQL 16 can render equivalent varchar-array CHECK casts differently after
dump/reparse; comparison normalizes only that exact literal-array cast form. It
does not omit constraint checks or normalize away differing bounds/literals.

This does not verify roles/ACLs/ownership (`--no-owner --no-privileges`), filesystem
or cluster recovery, physical-device outboxes, an older application build, recovery
time/data-loss objectives, or retention/deletion policy. No migration downgrade is
executed. Populated `da64` valid/invalid corrective-upgrade and populated downgrade
refusal rehearsals remain separate gates requiring their own empty target databases;
they are intentionally not mixed into the restore targets.

Offline guard checks, with no application imports or database connections:

```powershell
.local/venv/Scripts/python.exe -I -B tests/backend/test_planning_restore_safety.py -v
```

## Recorded execution

2026-09-13, native PostgreSQL **16.15**, existing PG07 cluster, migration head
`eb75f643cd84`: rehearsal **EXIT 0**. No service restart, database drop, development
database connection or existing-verifier edit was performed.

- Created `cookbook_test_recovery_source` and `cookbook_test_restored`, both on
  `127.0.0.1:55432`. `cookbook_test_fresh` remained unchanged by full snapshot comparison.
- Complete restored snapshot matched **33 public tables and 23 sequences**, including
  all rows, IDs, receipts, catalog digests, columns/constraints/indexes, sequence
  configuration/state and preview/undo expiry timestamps.
- Old exact receipt replay and expired preview/undo rejection left the restored
  database unchanged; configured-item projection, foreign-plan refusal, account
  export, a fresh write, its retry and post-write export passed.
- Both populated rehearsal databases remain available for inspection. Generated
  temporary dump archives were cleaned up. No fixtures were added to fresh or dev.
- A subsequent normal run refused the populated recovery source before writes:
  `REFUSED: cookbook_test_recovery_source must be empty; no reset is provided`.
- **19 offline safety tests passed** using the command above; these are separate
  from, and do not substitute for, the live PostgreSQL evidence.

Two initial guard failures were resolved without deleting database contents. The
identity query now uses `host(inet_server_addr())` because this server's direct text
cast included `/32`. The first clone comparison detected PostgreSQL's equivalent
array-cast rendering described above; after the narrow normalization was tested,
the successful command used the documented pristine-clone resume option. The
complete clone snapshot matched fresh before fixture seeding resumed. Neither
initial attempt is counted as a successful rehearsal.

Do not rerun the success command against these now-populated targets, including
with resume enabled. Populated corrective-upgrade and downgrade-refusal cases,
operational backup retention, and recovery time/data-loss objectives remain open.
