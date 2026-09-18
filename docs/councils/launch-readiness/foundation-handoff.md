# Foundation batch handoff — 2026-09-13

Three implementation/review iterations completed. The coordinator accepts this
bounded candidate following five-seat final review, not as a release-ready app.
No commit, push, merge, deployment, paid service, production data inspection or
database migration was performed. Root main and pre-existing prototype changes
were preserved. Development remains in `D:/Projects/cookbook/.worktrees/teaching-hardening`.
Detached foundation-auth/config/worker worktrees retain their uncommitted patches;
they were not deleted or used to overwrite unrelated changes.

## Implemented scope

- `routes/auth.py`: bounded JSON/string validation, controlled error responses,
  narrow unique-email conflict classification, rollback on auth DB failures,
  legacy password-hash behavior retained rather than silently migrated.
- `auth_identity.py`, `app.py`, `access.py`: current-user resolution for signed
  requests; invalid/deleted identities fail closed, temporary lookup failures
  remain retryable; unsupported recipe tiers fail closed.
- `runtime_config.py`, `app.py`: explicit production/development/testing,
  production PostgreSQL/secret requirements, exact CORS, opt-in proxy trust,
  request body limits, JSON API boundaries, no-store API responses and liveness/
  readiness. Audited public-shell headers align with the service worker.
- `frontend/public/sw.js`: narrow public shell cache, no API/private caches,
  namespace-only cleanup, response validation and controlled offline failures.
- `frontend/src/store/useAuthStore.js`, `api/client.js`, `App.jsx`,
  `components/AuthRecovery.jsx`, `pages/Login.jsx`, `pages/Register.jsx`, EN/DE
  locales: retryable initialization, 15-second verification timeout, identity
  gate, origin/generation guards, credential-header isolation, preservation of
  attempts on failed switching, and explicit applied/cancelled form outcomes.
  UI/UX guidance informed announced errors, focus placement and 44px controls.
- `routes/meal_plans.py`: resolve and check all applicable current tiers before
  personal saved-plan grocery writes. This does not redesign household policy
  or promise full transactionality after ingredient processing begins.
- `tests/run_backend.py`, new foundation backend/frontend regressions,
  `scripts/verify_postgres.py`, `.github/workflows/verify.yml`: isolated regression
  execution and guarded disposable PostgreSQL/CI verification infrastructure.
- Runtime, PostgreSQL, account-data inventory and council/batch documents.

Existing uncommitted `PIPELINE.md`, welcoming prototype HTML/JS, planning/shopping
modules, tests and evidence are not this batch's implementation and were not
claimed as newly built. Earlier launch-plan documents remain proposals except
for this expressly authorized bounded batch.

## Verification evidence

| Check | Result and boundary |
|---|---|
| Backend regression runner | 15/15 scripts, 106 unittest methods passed, using disposable SQLite or mocks. Includes prior tests, not 106 new tests. |
| Frontend/prototype runner | 107 TAP tests passed. Some legacy scripts count as one TAP test while making multiple assertions; not 107 browser scenarios. |
| Final production build | Passed from frontend working directory with dotenv disabled; 140 modules, JS 344.21 kB, CSS 14.35 kB. Temporary output, not published static assets. |
| Auth integration | Actual Zustand/cookSession subscriber plus synthetic storage/HTTP; compiled actual Login/Register continuations with substituted React/router. Failed switch/reverification preservation and stale response ordering covered. |
| Browser smoke | Actual final built app with a loopback-only synthetic API, no account/database. Login fixture, reload -> 503 recovery, focus on error, Tab to Retry, Enter -> same account, sign-out -> guest. EN/light inspected at 1280x720 and 320x720; recovery fit without horizontal overflow. Screenshots displayed during test, not archived artifacts. Temporary viewport reset and test tab closed. Test listener no longer present after turn transition. |
| Service worker | 12 VM tests and actual Flask/Compress producer-header test; not a real-browser offline/update proof. |
| PostgreSQL | BLOCKED: existing Python environment lacks psycopg2 and no suitable running local engine was available. Safety runner tests pass; actual migrations/full sync/PG concurrency/rollback/restore do not have passing evidence. |
| Hosted CI | Workflow written/reviewed; not run because nothing was pushed. |
| Git whitespace | `git diff --check` passed; existing LF/CRLF warnings remain. |

Backend command from development worktree:

```powershell
& D:/Projects/cookbook/venv/Scripts/python.exe tests/run_backend.py
```

Frontend command (PowerShell explicitly expands file paths; Bash CI expands the
equivalent globs):

```powershell
$foundationTests = @(Get-ChildItem tests/frontend/test_*.mjs | ForEach-Object { $_.FullName }) + @(Get-ChildItem docs/prototypes/*.test.mjs | ForEach-Object { $_.FullName })
node --experimental-vm-modules --experimental-loader ./tests/frontend/extensionlessLoader.mjs --test @foundationTests
```

Build used Vite's `build({envFile:false,build:{outDir:<new temporary directory>,
emptyOutDir:false}})` API **from the frontend directory**. An earlier invocation
from the worktree root warned that Tailwind content was missing; that output was
discarded as acceptance evidence and the corrected build passed without that
warning. Final output:
`C:/Users/zweiz/AppData/Local/Temp/cookbook-foundation-build-fe667ce7-29c0-48f0-8c02-eb7e84382a45`.

Existing deprecation/resource warnings and experimental Node loader/VM warnings
were not treated as new failures. Dependency upgrades were not performed.

## Confidence and remaining work

High confidence in the bounded source fixes and covered synthetic regressions.
Lower confidence in deployment/runtime integration until actual PostgreSQL,
hosted CI, worker lifecycle and physical-device checks are performed.

Not implemented or signed off here:

- Full approved planning/events/shopping prototype integration into the real
  frontend and SQL APIs; SQL-backed preferences and cross-device acceptance.
- Personal recipe authoring/network placement, deferred from this foundation batch.
- Server-side logout/token revocation, email verification/reset/recovery and
  account/rate-limit/password-policy changes. Legacy bcrypt 72-byte behavior and
  existing JWT transport/lifetime remain known launch-review items.
- Complete private/shared export and deletion semantics, retention/privacy notices,
  processor contracts or GDPR compliance. See `account-data-inventory.md`.
- Existing grocery helper's separately committed empty list on later merge failure.
- PostgreSQL migration, concurrent transaction, rollback/backend compatibility,
  backup/restore and complete release-sync evidence.
- Full EN/DE, light/dark, real accounts, physical Android/iPhone, interrupted cooking,
  offline/update acceptance; no locked-phone alarm promise.

No fourth implementation iteration was started. Safe next-batch work can include
reproducible test-environment setup, synthetic migration/restore fixtures, security
contract design and frontend/API parity mapping while product decisions wait.

## Consolidated decisions — no secrets needed

The complete just-in-time register remains `implementation-questions.md`. The
most useful next answers are:

1. **Existing data (Q03):** does anyone besides you use the live app, and which
   saved accounts/plans/history must survive? Until answered, preserve everything.
2. **Ownership (Q08):** may the new plans/events/shopping be private to each account
   initially, while existing household functionality remains separate? Recommended
   to avoid adding collaboration complexity; no automatic data reassignment.
3. **Verification environment (Q04):** can a dedicated disposable local PostgreSQL
   instance be used, and which Android/iPhone devices can later be tested? Proposed
   next setup is local-only, synthetic data, no production connection. Docker was
   not running; do not supply passwords or production connection strings in chat.

Before later dependent work, the already recorded decisions still need answers:
accounts/free-or-paid access and email ownership (Q06), shared-data deletion/public
identity (Q07), online-first versus locked-phone alarm/offline promises (Q05), and
operator/support contact, hosting/mail providers, budget and privacy/retention
approval (Q04/Q11/Q12). These do not all need deciding before the next safe code
batch. Domain branding and culinary/human acceptance remain separate gates.

Suggested commit message (not committed):
`fix(foundation): harden authentication, runtime boundaries and verification`
