# Foundation batch — iteration 1 independent council reports

Five read-only specialists reviewed the integrated first candidate. These are source/limited diagnostic reviews, not release approval.

## Frontend / UX

Agent `01a09ad0-e24f-7c81-b8fa-d22e88ff5ec6`.

Two findings for Frontend / UX:

1. **[P2, introduced] The shell-cache rules reject the app’s normal static responses.** [sw.js:42](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:42) rejects both `no-cache` and every `Vary` header. The immediate producer, [app.py:209](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:209), uses Flask `send_from_directory` with compression enabled. An isolated Flask/Compress probe returned `Cache-Control: no-cache` and `Vary: Accept-Encoding`. Consequently, ordinary shell resources never populate the new cache; reopening the installed app offline returns 503 despite prior visits. Smallest safe correction: establish explicit cache headers for the verified public shell and permit only `Vary: Accept-Encoding`, retaining private/no-store rejection. Add a test using realistic producer headers. This is an autonomous foundation fix.

2. **[P2, preexisting consumer gap] Startup still discards valid credentials during temporary failures.** [useAuthStore.js:27](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:27) clears the token and increments the account epoch for every `/auth/me` rejection. The new identity resolver deliberately returns 503 during database failure, but reopening the app during that outage still logs the user out and redirects protected routes to login. Smallest safe correction: retain credentials on network/5xx failures, expose a retryable initialization state, and keep authenticated content gated until identity verification succeeds. Preserve existing 401 cleanup. This is an autonomous consumer fix without changing token lifetime or session policy.

Confidence: high for both code paths. Independently ran **11/11 worker tests successfully**; they use synthetic headers and miss finding 1. The header probe imported only Flask/Compress, never the application or database.

No edits or subagents. Physical browser/PWA validation remains unperformed; PostgreSQL availability and unexecuted CI remain environment/evidence blockers, not passes. No additional user decision is needed for these corrections.

## Backend / data

Agent `01a09ad0-e40f-7ec3-a633-659f85657a8c`.

Backend/data seat: no definite introduced backend-runtime defect found. Two pre-existing consumer gaps remain:

1. P2 — [useAuthStore.js:27](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:27): startup `/auth/me` handling deletes the token on every failure, including the new identity lookup’s retryable 503. A temporary database outage therefore still forces logout. Smallest correction: preserve credentials on network/503 failures, expose retryable initialization failure, and retain existing invalid-credential cleanup and epoch guards. This is a safe error-handling correction within foundation scope; no token/session-policy change is needed.

2. P2 — [meal_plans.py:140](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:140): saved-plan grocery conversion never calls `tier_access`. An account downgraded after saving an advanced recipe can still materialize its ingredients. The tightened helper cannot protect this path. Smallest correction: validate all resolvable items against the requesting user’s current access before creating or changing grocery rows; reject atomically. This preserves the existing personal-plan entitlement rule. The analogous [household conversion:261](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:261) should remain separately gated where correcting it would decide unresolved household-sharing policy.

Safe next work: targeted fixes and regression checks for those first two cases, subject to the coordinator’s bounded batch selection. Neither requires a schema change.

Environment blockers: actual PostgreSQL migration/constraint behavior and CI remain unverified; the reported SQLite/mock passes cannot establish them.

Confidence: high in both findings from direct source and consumer inspection; moderate overall because this review executed no application imports or database tests. No edits or subagents used.

## Security / privacy

Agent `01a09ad0-e665-7a62-b74f-18f36309a1c8`.

No introduced security/privacy defect found in the reviewed foundation changes. One pre-existing consumer defect undermines the new retryable-auth behavior:

- **P2 — Temporary auth outage discards a valid login.** [useAuthStore.js:27](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:27) clears the token and advances the account epoch on *every* `/auth/me` failure. Consequently, the sanitized 503 introduced at [auth_identity.py:30](D:/Projects/cookbook/.worktrees/teaching-hardening/auth_identity.py:30) still logs out a returning user during a database outage. Smallest safe correction: preserve the token on 503/network failures, keep account content unavailable until identity verification succeeds, and expose retry. Add a frontend regression covering initialization failure followed by successful retry. This is an autonomous foundation fix; it requires no transport, lifetime, or session-policy decision.

The reviewed identity enforcement, unknown-tier denial, API no-store headers, exact CORS matching, and worker API-cache exclusion show no concrete bypass in their immediate consumers.

Environment blockers remain actual PostgreSQL execution, CI execution, and real-browser worker verification. Existing ownership, deletion, and credential-policy questions remain deferred—not consent for changes.

Confidence: high in the reported source-level failure; moderate overall because this review ran no application imports or runtime tests. No files changed.

## DevOps / reliability

Agent `01a09ad0-e909-7293-a782-0bdabf4ff789`.

Two introduced defects:

1. **[P2] Shell caching never succeeds with current Flask headers.** [sw.js:42](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:42) rejects `no-cache` and any `Vary`. Its immediate consumer, Flask’s static/SPA serving, produces `Cache-Control: no-cache`; Flask-Compress adds `Vary: Accept-Encoding`. An isolated probe reproduced both without importing the repository application. Consequently, visiting the shell online never prepares its offline fallback; offline requests return 503. Worker tests use synthetic responses without these headers. Smallest safe correction: explicitly configure caching for the audited public shell/assets, permit only the understood `Accept-Encoding` variation, and add a test using actual server headers. Preserve private/no-store rejection.

2. **[P2] Backend runner inherits configuration that breaks reproducibility.** [tests/run_backend.py:20](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/run_backend.py:20) copies the full caller environment but overrides only selected settings. Existing helpers create development-mode applications, which consume inherited CORS, proxy and body-limit values. A mocked subprocess capture confirmed `CORS_ORIGINS=*` survives; pure configuration validation then rejects startup. Valid small body limits can also alter unrelated endpoint tests. Smallest safe correction: construct an allowlisted child environment with explicit test defaults for all runtime settings; cover hostile inherited settings with a subprocess-environment test.

Both corrections are safe autonomous work within this foundation batch. Neither requires new policy decisions. No additional concrete DevOps defect identified; documented deployment timeout/recovery gaps remain deferred, not introduced findings.

Confidence: high for both findings. Review was read-only; no repository application import, database connection, file edit or subagent. PostgreSQL execution remains environment-blocked, CI remains unexecuted, and integrated-suite results were not independently established here.

## QA / testing

Agent `01a09ad0-ebd2-7e53-8f25-25a616f91eb0`.

QA seat: two concrete findings.

1. **[P2, introduced] Worker tests miss the actual shell response headers.** [sw.js:42](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:42) rejects `no-cache` and every `Vary` header. Its immediate consumer, [app.py:209](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:209), uses Flask file serving with Flask-Compress. An isolated framework-only probe returned `Cache-Control: no-cache` and `Vary: Accept-Encoding`; both disqualify the response. Consequently, normal Flask-served shell resources never populate the new cache, and offline fallback returns 503 despite the passing “shell survives offline” test. The fixture at [test_service_worker.mjs:15](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_service_worker.mjs:15) omits these real headers. Smallest safe correction: add a realistic header-contract regression, then align explicit public-shell response headers and worker eligibility, including representation-only `Accept-Encoding` variation. Preserve private/API exclusions.

2. **[P2, introduced infrastructure gap] Backend runner inherits configuration that changes test behavior.** [run_backend.py:20](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/run_backend.py:20) copies the entire environment and overrides only five variables. Existing helpers and new auth tests create development-mode apps, so inherited `MAX_CONTENT_LENGTH=1` causes ordinary requests to return 413; invalid `CORS_ORIGINS` or proxy counts prevent startup. Thus the promised reproducible isolation depends on the caller’s shell. Smallest safe correction: sanitize application configuration before launching children, preferably with an OS-essential environment allowlist; add a pure subprocess-environment test covering hostile inherited settings. Existing helpers’ environment sensitivity predates this batch; the new isolation wrapper leaves it unresolved.

Both corrections are safe autonomous foundation work; neither requires a policy decision. PostgreSQL execution and CI remain environment/evidence blockers, not passes.

Confidence: high. Independently reran all 11 worker VM checks successfully and verified framework headers without importing repository application code, reading dotenv, or connecting to a database. No files changed.
