# Local development — 2026-09-13

Worktree: `D:/Projects/cookbook/.worktrees/teaching-hardening`, branch
`codex/teaching-pilot-hardening`. The main checkout and its data were not migrated.
No cloud resources, payments, production imports, commits or deployment.

## What is running

| Service | Address | Persistence |
| --- | --- | --- |
| Existing React application | http://127.0.0.1:5173/ | Uses local API |
| Flask development API | http://127.0.0.1:5100/health/ready | Local PostgreSQL |
| Development PostgreSQL 16.15 | 127.0.0.1:55433 / cookbook_dev | `.local/postgres-dev` |
| Disposable verification clusters | 127.0.0.1:55432 only while testing | Separate PG07–PG10 directories under `.local/`; never reuse an occupied database as an empty target |
| Approved welcoming-kitchen prototype | Existing port 5098, when its preview server is running | Existing browser-local prototype storage |

The React application retains the older cooking/library presentation and adds
responsive SQL-backed private planning at `/planning/plans` and shopping at
`/shopping`. Plans/events, saved menu templates, source-aware shopping selections,
extras/checks and account appearance are wired to SQL. Current/upcoming/past
browsing and explicit repeat use the same saved records. The full welcoming
discovery/recipe port and configured guided-cooking handoff remain open; shared
preparation/leftovers and packs are deferred, not silently implemented.
Accounts entered here are separate from hosted accounts. One clearly labelled
synthetic account and test plans/events were created for browser verification;
no real account was imported. Use synthetic data while the foundation evolves.

All four new listeners were checked as **127.0.0.1 only**. These development
servers are not suitable for public exposure. Known synthetic database passwords
and a stable local-only JWT key must never be reused in production. Do not forward
ports or change the bind address to test a phone: phone access needs a separately
scoped secure setup. S25 testing and iPhone testing are not yet completed.

## Restart on this PC

Run as your normal Windows user, from the worktree above. Do not use the old
project virtual environment. Do not run initialization concurrently with another
initializer or while editing content through a running application.

1. Start the existing native database (only if `status` says it is stopped):

```powershell
.local/postgres-runtime/pgsql/bin/pg_ctl.exe -D .local/postgres-dev status
.local/postgres-runtime/pgsql/bin/pg_ctl.exe -D .local/postgres-dev -l .local/postgres-dev/server.log -w -t 30 start
```

2. Initialize/update content, then serve the API in a terminal:

```powershell
.local/venv/Scripts/python.exe scripts/local_dev.py init
# Proceed only after init exits successfully.
.local/venv/Scripts/python.exe scripts/local_dev.py serve
```

3. In another terminal, from the worktree:

```powershell
node frontend/local-dev.mjs
```

The Python launcher accepts only `init` or `serve`. It refuses runtime/database
overrides, disables dotenv and debug/reloader, checks the exact database identity,
migration state and stored bilingual lesson links. An interrupted initialization
leaves `.local/initialization-incomplete`; rerun init successfully, do not delete
that marker to bypass the check. Stage-specific migration/sync failures are shown
without raw SQL or credentials. Other failures remain sanitized; check the local
runtime, database availability and port before retrying.

The frontend must use `node frontend/local-dev.mjs`, **not** `vite --config`:
Vite requires `envFile: false` as an inline API option. The launcher does not load
personal dotenv or inherited `VITE_*` values into the client environment. Both
`/api` and `/health` are proxied to loopback port 5100.
PostCSS resolves the exact frontend Tailwind config, whose content globs are
relative to that config. This preserves dark tokens and application utilities
when starting from the repository root. Restart Vite after changing this config;
the real transformed-CSS regression covers this launch-directory case.

Stop the API/frontend with Ctrl+C in their own terminals. For sessions launched by
an agent, ask it to stop the exact owned processes; never kill every Python/Node
process. Then stop the development database without deleting its data:

```powershell
.local/postgres-runtime/pgsql/bin/pg_ctl.exe -D .local/postgres-dev -m fast -w -t 30 stop
```

Database data survives this stop and a PC restart. No automatic startup service
was installed. `.local/` is ignored by Git, not backed up by Git; do not remove
that directory or the worktree if local data matters. Native runtime, virtual
environment and generated database files are machine-local, not source artifacts.

## Runtime provenance and Docker alternative

Python 3.11.4: existing local installation, new `.local/venv`, dependencies from
`requirements.txt`. No system Python packages were changed. Transitive packages
are not fully locked; this remains a release reproducibility task.

PostgreSQL 16.15: EDB Windows x64 archive linked from the
[official binary page](https://www.enterprisedb.com/download-postgresql-binaries),
file ID `1260494`, downloaded over HTTPS. Recorded archive SHA-256:
`5e8afffe67daf949aeeb03b74951f1ec2324e1888f73fbd036ab0e567ab004d9`.
This is a local provenance hash, not independent vendor checksum verification;
`postgres.exe` is not Authenticode-signed. It runs from `.local/postgres-runtime`,
not a system installation. The two cluster types were initialized with UTF-8,
SCRAM-SHA-256 authentication, explicit loopback binding and different users/ports.

Docker Desktop was installed but its engine remained stuck starting even after
starting its existing helper service. No reset, upgrade, WSL changes, cloud
resource or container was performed. The provided `compose.local.yaml` is a
portable alternative; syntax was checked, container execution was not verified.
Do not start it while the native clusters occupy those ports. Its persistent
development volume is **different** from native development data, not a migration.

```powershell
docker compose --env-file config/local-compose.env -f compose.local.yaml up -d database
```

Use an explicitly local Docker engine. The empty env file prevents Compose from
loading a personal `.env`. Development uses a named volume on port 55433;
verification is opt-in, uses tmpfs and port 55432. Never run volume deletion or
prune commands to recover local development data.

## PostgreSQL verification

See [the guarded verification contract](postgres-verification.md). The runner
does not provision or reset databases. With a **fresh, dedicated** Compose
verification cluster, provision only its two targets:

```powershell
docker compose --env-file config/local-compose.env -f compose.local.yaml --profile verification up -d verification
docker compose --env-file config/local-compose.env -f compose.local.yaml exec -T verification createdb -U cookbook_tests cookbook_test_fresh
docker compose --env-file config/local-compose.env -f compose.local.yaml exec -T verification createdb -U cookbook_tests cookbook_test_history
$env:COOKBOOK_TEST_DATABASE_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_fresh'
$env:COOKBOOK_TEST_HISTORY_URL = 'postgresql://cookbook_tests:cookbook-disposable-tests-only@localhost:55432/cookbook_test_history'
$env:COOKBOOK_TEST_POSTGRES_CONFIRM = 'disposable-local-test-databases'
.local/venv/Scripts/python.exe scripts/verify_postgres.py
```

Use a separate shell from the application launcher; it intentionally refuses
these test overrides. Native verification used the same database names and port
on a separate cluster, with `createdb -h 127.0.0.1 -p 55432 -U cookbook_tests`.
Native disposable clusters remain on disk after stopping; they are not tmpfs.
Do not re-run against populated databases. Preserve failed evidence and create
another fresh disposable cluster after stopping the previous test cluster.

## Verified, not release-approved

**X1b update (2026-09-13):** local development now uses `eb75f643cd84` and the
restarted API serves event/item/preview/undo/repeat routes. `/planning/*` is wired
for signed-in private planning; the older X1a checkpoint below is historical.
PG07 passed corrective-head fresh/history migrations and repeated sync. PG08
independently passed valid/invalid populated corrective upgrades and populated
downgrade refusal, plus empty downgrade/re-upgrade; see
[corrective evidence](planning-corrective-verification.md). The
separate [recovery rehearsal](planning-recovery-verification.md) passed restored
row/schema/sequence equality, exact retry, export and new writes. Current browser
smoke evidence includes real SQL-backed plans/events/reminders/personal items;
mounted failure recovery passed 8/8 with synthetic transport and is documented separately in
`frontend/test-harness/README.md`. Full shopping and the remaining release gates
are not completed by this foundation. Do not reset development data to reproduce
tests; verification clusters and recovery databases are separate and disposable.

Final verification checkpoint: 26/26 scripts through `tests/run_backend.py`,
the updated 16-check corrective guard suite, 222/222 frontend/prototype checks,
and a 150-module production build
to `.local/build-verification` only. Browser smoke verified event copy, cross-tab
logout/login, dialog focus return and the checked responsive views. These are not
physical S25/iOS or full accessibility acceptance. The older bullets below are the
historical X1a checkpoint, not a statement that X1b is absent.

- Real PostgreSQL 16.15: fresh migrations to `a631b209ef40`; representative
  pre-hardening user/dish/cook/reflection preservation; full recipe/glossary/
  skill/lesson sync twice on **both** targets, with stable content and IDs.
- Actual local launcher: initialization succeeded repeatedly; a before/after
  comparison verified stable content and IDs. API readiness and 15-dish responses
  matched directly and through the real frontend proxy.
- Browser: guest library and lentil recipe loaded from the local backend.
- Backend suite: 19/19 scripts passed (SQLite/mocks remain separate evidence).
- Private planning on disposable PostgreSQL: concurrent retries/revision conflicts,
  injected transaction rollback, cross-account/composite-FK isolation, consistent
  reads/export during concurrent edits and new/legacy account deletion passed.
- Local development database migrated to the same head and API restarted. The
  frontend proxy returns readiness 200 and private-workspace 401 without login,
  confirming the new authenticated routes are served. No planning UI is wired yet.
- Frontend/prototype: 108/108 TAP checks passed, including real Vite configuration
  sentinel coverage. Production build: 140 modules, output only under `.local/`.
- Failed/interrupted initialization and semantic-readiness delegation have mock
  regression coverage. Deliberate live-database corruption/recovery is not tested.

Two initial disposable runs reached migration head but failed while printing
Unicode sync output on Windows. Explicit `-X utf8` in isolated Python subprocesses
fixed the issue; a third fresh cluster passed the full run. Earlier failed
clusters are stopped and retained, never reset into apparently fresh evidence.

Still open: full production shopping, saved templates and date-status grouping,
packs/Use the rest, shared preparation/leftovers, SQL preferences, complete approved
visual integration, physical phones and secure phone access. Hosting/domain/mail,
culinary publication, operational backup/retention/erasure policy, privacy rights
evidence and release authorization remain separate gates. No GDPR-compliance or
launch-ready claim follows from local verification. The current scope is recorded
in the [X1b contract](contracts/private-planning-x1b.md); the historical X1a contract
remains available for compatibility context.
