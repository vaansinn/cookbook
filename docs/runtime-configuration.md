# Runtime configuration

This foundation change validates settings before Flask extension initialization.
It does not connect to a database during app creation, run migrations, or sync
content. The existing `app:app` WSGI entry point still creates the app on import,
so set the environment **before importing `app`** (including from test runners).

## Modes and isolation

`FLASK_ENV` accepts exactly `production`, `development`, or `testing`. An unset
value means production; an empty or unknown value fails startup. The factory
also accepts `create_app(environment="testing")` for an explicit isolated app.

| Setting | Production (default) | Development | Testing |
| --- | --- | --- | --- |
| `DATABASE_URL` | Required PostgreSQL URL with a database name | Configured URL, otherwise `sqlite:///cookbook.db` | Always `sqlite:///:memory:` |
| `JWT_SECRET_KEY` | Required nonblank secret; built-in dev/test values rejected | Configured secret, otherwise existing `dev-secret` | Fixed test-only secret |
| `.env` loading by this app | Never | Only when `FLASK_SKIP_DOTENV` is not `1` | Never |
| CORS origins | Explicit only; none by default | Explicit, otherwise `http://localhost:5173` | None |
| Trusted proxy counts | Explicit, otherwise all zero | Explicit, otherwise all zero | All zero |
| Body limit | Configurable, default 1 MiB | Configurable, default 1 MiB | 1 MiB |

Testing ignores deployment database, secret, CORS, proxy, and body-limit settings
in the environment. Each factory call has its own in-memory engine; no schema is
created automatically. Use a controlled development environment with a disposable
SQLite URL for the existing backend helpers and migration tests. Setting
`app.config["TESTING"] = True` after creation does **not** isolate an engine that
has already been configured.

Development must be selected before app import, rather than relying on a `.env`
file to select it. The app's dotenv load is development-only and does not override
existing environment values. Flask CLI can load dotenv before importing the app;
set `FLASK_SKIP_DOTENV=1` in the launching environment to disable both paths.
Tests must always set that variable before imports/subprocesses. No `.env` file
was read during implementation or verification.

## Required production configuration

Supply `DATABASE_URL` and `JWT_SECRET_KEY` through the deployment's approved
configuration/secret mechanism. Supported database schemes are `postgresql://`
and `postgresql+psycopg2://`; legacy `postgres://` is normalized to `postgresql://`.
Other schemes, including SQLite, are rejected in production. A suitable psycopg2
driver must already be installed by the deployment dependency process. Structural
validation does not prove connectivity, permissions, schema version, or that a
configured target is the intended environment.

JWT transport, token lifetime (30 days), password/account policies and entitlements
are unchanged. The integrated identity callback now resolves the current account
before protected handlers and distinguishes invalid identity from temporary DB
failure. Production rejects the built-in development
and testing secrets but does not implement a new credential-strength policy.
Factory debug defaults to false; direct `python app.py` enables debug only in
explicit development mode. Run production with the existing WSGI entry point;
do not enable Flask CLI debugging in production.

No live origin, proxy chain, host allowlist, or database target has been inferred.
The runtime owner must supply those deployment facts before activation.

## Origins and proxy trust

`CORS_ORIGINS` is a comma-separated list of exact HTTP(S) origins, including a
port when needed, with no path/trailing slash, credentials, query, fragment,
regex, or wildcard. Example placeholder: `https://ui.example.test`. If unset,
the existing `FRONTEND_URL` is used as a single-origin fallback. An explicitly
empty `CORS_ORIGINS` disables cross-origin response permission even if
`FRONTEND_URL` is set. Same-origin requests do not need CORS permission.
Production adds no localhost permission automatically. Authorization/content-type
preflights remain supported; this change does not enable credentialed cookie CORS.
CORS is a browser response policy, not authentication or a network access control.

Each of these settings is a nonnegative integer and defaults to zero:

- `PROXY_FIX_X_FOR`: trusted `X-Forwarded-For` values.
- `PROXY_FIX_X_PROTO`: trusted `X-Forwarded-Proto` values.
- `PROXY_FIX_X_HOST`: trusted `X-Forwarded-Host` values.
- `PROXY_FIX_X_PORT`: trusted `X-Forwarded-Port` values.
- `PROXY_FIX_X_PREFIX`: trusted `X-Forwarded-Prefix` values.

Configure each count from the actual proxy chain; different headers may have
different counts. Restrict direct access to the application and ensure trusted
proxies strip/replace untrusted incoming forwarded headers before enabling trust.
ProxyFix counts values from the right; it does not authenticate a proxy by IP.
Zero means the corresponding forwarded header cannot change request metadata.
TLS termination, host restrictions, HTTPS redirects/HSTS and request timeouts
require deployment configuration and are not guessed by this batch. Existing
sitemap/robots origin behavior is unchanged; confirm `FRONTEND_URL` separately.

## HTTP boundaries and health

`MAX_CONTENT_LENGTH` must be a positive integer byte count; it defaults to
`1048576` (1 MiB). Known oversized bodies are rejected before route handlers;
Flask also limits body reads for streams where the WSGI server supplies proper
termination semantics. An unknown-length stream may return a capped prefix
instead of 413; enforce full transport/body rejection at the proxy as needed.
API size rejections return JSON with status 413. This is a
body-size limit, not a request-rate limit. Enforce connection/body timeouts,
header limits and traffic controls at the deployment boundary.

Unknown GET/HEAD paths at `/api` or beneath `/api/` return JSON 404 instead of the
React shell. Method errors preserve 405 and the `Allow` header, with a JSON API
body. Non-API SPA navigation keeps its existing behavior.

All API responses, including errors, preflights, private routes and optionally
authenticated content, receive `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. Applying
no-store to the full API avoids relying on token-header presence to identify
private content. This conservatively disables HTTP caching of public API data
too; a reviewed public allowlist can be added separately. Audited root/index,
manifest and icon responses use explicit public max-age=60; hashed main JS/CSS
assets use max-age=31536000. Other SPA routes retain no-cache. The worker permits
only the audited shell paths and Accept-Encoding variation; APIs and private or
identity-varying responses remain network-only. Framework and worker tests cover
these producer/consumer headers; physical-browser offline acceptance is separate.

| Endpoint | Success | Failure | Work performed |
| --- | --- | --- | --- |
| `GET /health/live` | 200 `{"status":"ok"}` | Normal HTTP failure if the process cannot serve | No database access |
| `GET /health/ready` | 200 `{"status":"ok"}` | 503 `{"status":"unavailable"}` for database errors or unexpected result | Dedicated connection, `SELECT 1`, connection released |

Both endpoints receive the same defensive/no-store headers and disclose no
credentials, host, schema, exception message or SQL. Database exception details
are not logged by the readiness handler. Readiness does not check migrations,
content completeness or other services. Driver connection/query timeouts, pool
wait bounds and the probe timeout/frequency must be set and verified against the
chosen deployment; this batch cannot promise a bounded outage response time.
Do not use readiness as liveness and restart healthy processes solely for a DB
outage.

## Offline verification

From `D:/Projects/cookbook/.worktrees/teaching-hardening`, using PowerShell:

```powershell
$env:FLASK_SKIP_DOTENV = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
& D:/Projects/cookbook/venv/Scripts/python.exe -B tests/backend/test_runtime_config.py -v
```

The runtime test module also disables dotenv before importing `app`, and creates
the module-level app under a cleared testing environment. Configuration tests
forbid `Engine.connect`; production factory tests mock `db.init_app`, avoiding
the absent local psycopg2 driver. Readiness success uses only in-memory SQLite;
connection/query/cleanup failures use mocks with synthetic secrets. Tests cover
mode isolation, sanitized validation failures, CORS, independent proxy counts,
body limits, API/SPA boundaries, defensive headers and health responses.

The full backend runner is owned separately. Its subprocesses must set
`FLASK_SKIP_DOTENV=1` and `FLASK_ENV=development` before imports and use disposable
SQLite targets. Local results do not prove PostgreSQL initialization/connectivity,
production proxy/TLS behavior, migrations on PostgreSQL, or deployment readiness.

### Historical isolated-worker verification record (before integration)

All 60 tests passed on 2026-09-13 with the existing Python environment. The new
runtime suite passed 15 tests using the command above. The eight existing scripts
passed 45 tests using this exact separate-process invocation:

```powershell
$env:FLASK_SKIP_DOTENV = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:FLASK_ENV = 'development'
$env:DATABASE_URL = 'sqlite:///:memory:'
$env:JWT_SECRET_KEY = 'regression-tests-only-synthetic-secret'
$env:CORS_ORIGINS = ''
$env:MAX_CONTENT_LENGTH = '1048576'
foreach ($header in @('FOR', 'PROTO', 'HOST', 'PORT', 'PREFIX')) { [Environment]::SetEnvironmentVariable('PROXY_FIX_X_' + $header, '0', 'Process') }
$testFiles = Get-ChildItem -LiteralPath tests/backend -Filter 'test_*.py' | Where-Object Name -ne 'test_runtime_config.py'
foreach ($testFile in $testFiles) {
    Write-Output $testFile.Name
    & D:/Projects/cookbook/venv/Scripts/python.exe -B $testFile.FullName
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

| Existing script in `tests/backend/` | Passed |
| --- | ---: |
| `test_fix1_cooklog_snapshot_validation.py` | 4 |
| `test_fix2_snapshot_preserves_step_ids.py` | 4 |
| `test_fix3_snapshot_capture_race.py` | 1 |
| `test_fix5_sync_requires_both_languages.py` | 2 |
| `test_hardening_migration.py` | 1 |
| `test_step3c_lessons_api.py` | 10 |
| `test_step3c_reflections.py` | 10 |
| `test_teaching_hardening.py` | 13 |

Existing tests emitted datetime/SQLAlchemy deprecation warnings and some SQLite
connection resource warnings. No test failed. `git diff --check` passed. Identity
installation remains the chairman's integration step; `auth_identity.py` was
absent in this isolated worktree and no import or callback was added here.

The integrated worktree now installs `auth_identity.py`, includes the real public
shell-header test (16 runtime tests), and uses `tests/run_backend.py` to sanitize
child environments. See `docs/councils/launch-readiness/foundation-batch.md` for
the final combined evidence; the historical worker totals above are not the
current suite totals or a PostgreSQL verification claim.
