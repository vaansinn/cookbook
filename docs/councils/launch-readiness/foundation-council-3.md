# Foundation council — final iteration 3

The previous five agents became unavailable across a turn transition before their final reports could be retrieved. These are five fresh actual specialist reviewers, supplied the saved iteration-2 findings and current source. The coordinator remains chairman. No claim of human or different-model review is made.

## frontend — 01a09ae3-fdae-7cf1-aa88-285ceec49be2

Accept the bounded foundation candidate. No introduced must-fix frontend/UX defect found in this review.

- Prior P1 data loss is fixed: [useAuthStore.js:31](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:31) preserves the verified owner during credential verification. [test_hardening.mjs:50](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_hardening.mjs:50) exercises the real subscriber, confirming failed switching/reverification preserves attempts and pending reflections, while successful switching/logout clears them.
- Prior P2 stale navigation is fixed: superseded outcomes return `false` at [useAuthStore.js:34](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:34) and line 39. [Login.jsx:20](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Login.jsx:20) and [Register.jsx:21](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Register.jsx:21) require applied success. [test_auth_recovery.mjs:270](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_auth_recovery.mjs:270) covers both stale outcomes while replacement requests remain pending.
- The global identity gate remains at [App.jsx:56](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/App.jsx:56); credential exclusions and stale-401 guards remain intact in [client.js:27](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/api/client.js:27).

Independently reran both focused test files: 2/2 passed. The reported 107-test run, build, and synthetic browser checks were not independently repeated. Real PostgreSQL, hosted CI, and device gates remain unproven. This is not launch readiness. No writes, database access, or subagents.

## backend — 01a09ae4-4f77-7583-8fe7-9e3f6e18a968

Accept the bounded foundation candidate: no introduced backend/data must-fix found in inspected source. I’m a fresh reviewer; the saved iteration-2 findings remain applicable. Git diff was unavailable, limiting delta verification.

- [meal_plans.py:142](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:142) authorizes every resolved tier before creating lists or merging ingredients. Authorization rejection leaves grocery state unchanged; missing-content skipping remains.
- [test_plan_conversion_access.py:40](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/backend/test_plan_conversion_access.py:40) covers downgrade rejection without list creation, existing-item preservation, authorized success, and malformed-input rejection.
- [auth_identity.py:18](D:/Projects/cookbook/.worktrees/teaching-hardening/auth_identity.py:18) bounds subjects and separates invalid identity (401) from database failure (503). [auth.py:30](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:30) validates bounded JSON/string inputs; [auth.py:74](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:74) preserves legacy bcrypt semantics.
- Preexisting transaction gap: [groceries.py:26](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:26) commits a new empty list separately. Later merge failure can retain it; complete conversion atomicity is unproven.

Supplied evidence, not independently rerun: 15/15 backend scripts, 106 tests; 107 TAP tests; 140-module build; synthetic-API browser recovery EN/light at 1280/320, keyboard retry/sign-out passed.

Actual PostgreSQL, hosted CI, and full physical-device coverage remain unproven. Household-sharing, session, and password-policy decisions remain deferred. No writes, application imports, database access, or subagents. Not launch signoff.

## security — 01a09ae4-5110-7331-b19c-d2a58137fe0a

Accept as a bounded foundation candidate: no introduced security/privacy must-fix found. This is a fresh review informed by the saved iteration-2 findings, not testimony from the unavailable reviewer.

- The previous data-loss finding is addressed: temporary verification preserves the verified owner; failed credentials restore readiness without changing token or epoch. Actual switches/logout still trigger owner cleanup. [useAuthStore.js:26](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:26), [cookSession.js:256](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/cookSession.js:256). Subscriber regression covers retained attempts/reflections and switch/logout cleanup. [test_hardening.mjs:50](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_hardening.mjs:50).
- Credential requests strip authorization; expiration requires matching token, epoch and generation. Stale credential outcomes return false. [client.js:8](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/api/client.js:8), [useAuthStore.js:34](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:34).
- Invalid/deleted identities receive generic 401 responses; lookup outages remain retryable 503s. [auth_identity.py:18](D:/Projects/cookbook/.worktrees/teaching-hardening/auth_identity.py:18).

Integrated evidence supplied, not independently rerun: 15/15 backend scripts, 106 tests; frontend/prototype 107 TAP tests; build 140 modules; synthetic-API browser recovery at EN/light 1280/320, keyboard retry/sign-out passed.

Actual PostgreSQL, hosted CI and full physical-device evidence remain unproven. Household-sharing and token/session policy remain deferred. No launch signoff. No writes, application imports, network calls or subagents.

## devops — 01a09ae4-532e-7213-a430-618fe1fb8ed1

Accept as a bounded foundation candidate: no introduced must-fix DevOps/reliability defect found in the inspected scope. This is a fresh reviewer assessment; iteration-2 findings remain preserved.

- Shell producer headers and worker eligibility agree: public assets receive explicit cache lifetimes; worker storage rejects private/no-store responses and unsupported variation. [app.py:211](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:211), [sw.js:36](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:36).
- Runtime testing isolates deployment settings; the backend runner allowlists its child environment. [runtime_config.py:70](D:/Projects/cookbook/.worktrees/teaching-hardening/runtime_config.py:70), [run_backend.py:15](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/run_backend.py:15).
- CI retains both Node flags, explicit Bash execution and a job timeout. [verify.yml:10](D:/Projects/cookbook/.worktrees/teaching-hardening/.github/workflows/verify.yml:10), [verify.yml:62](D:/Projects/cookbook/.worktrees/teaching-hardening/.github/workflows/verify.yml:62).
- PostgreSQL validation restricts targets; both emptiness checks precede writes, with loopback pinning and connection/query limits. [verify_postgres.py:35](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_postgres.py:35), [verify_postgres.py:116](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_postgres.py:116), [verify_postgres.py:269](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_postgres.py:269).

Reported evidence: 15/15 backend scripts, 106 tests; 107 TAP tests; 140-module build; synthetic-API browser recovery at EN/light 1280/320, keyboard retry/sign-out passed. Not independently rerun.

Deferred: actual PostgreSQL, hosted CI, worker-update/full physical-device evidence, rollback/restore, deployment timeouts, and existing ownership/session policy decisions. No provisioning, writes, application imports or subagents. This is not launch signoff.

## qa — 01a09ae4-55fa-7df0-ad8a-ba5f50592605

Fresh QA seat applying the developer-council skill; saved iteration-2 findings remain intact. Accept the bounded foundation candidate: no introduced must-fix found in these corrections.

The tests exercise actual consumers:

- [test_auth_recovery.mjs:281](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_auth_recovery.mjs:281) compiles current Login/Register JSX and invokes their actual submit handlers. Assertions cover stale success/failure while the replacement remains pending, then current navigation/error outcomes. This exercises the guards in [Login.jsx:20](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Login.jsx:20) and [Register.jsx:21](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Register.jsx:21). React/router/Zustand are substituted here: continuation coverage, not mounted-browser integration.
- [test_hardening.mjs:4](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_hardening.mjs:4) imports actual auth/client/cookSession modules using real Zustand. [Assertions at line 52](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_hardening.mjs:52) exercise failed-login preservation, outage/reverification, successful-switch cleanup and logout through the [actual subscriber](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/cookSession.js:256). Storage and HTTP are synthetic.

Supplied integrated evidence—15/15 backend scripts, 106 tests; 107 frontend/prototype TAP tests; 140-module build; synthetic-API browser recovery at EN/light 1280/320 with keyboard retry/sign-out—supports this acceptance; I did not rerun it.

Actual PostgreSQL, hosted CI and full physical-device verification remain unproven. Ownership/sharing and session-policy decisions remain deferred. This is not launch signoff.

## Chairman evaluation and verdict

Accept this bounded foundation candidate. All five final seats found no remaining introduced must-fix in their inspected scope. Frontend independently reran the two focused auth files; the others performed source-level reviews. QA correctly distinguishes compiled form continuation tests from mounted-browser tests. Backend flags the pre-existing helper's separately committed empty grocery list, so only authorization rejection is claimed atomic. No material dissent was suppressed, and agreement is not launch acceptance.

Decisive source paths and regression results were checked by the coordinator. The synthetic browser test validates only EN/light recovery, keyboard Retry, account restoration and sign-out at desktop and narrow width; it does not prove PostgreSQL, real-account authentication, native/device behavior or worker lifecycle. Actual PostgreSQL, hosted CI, privacy/ownership policy, backup/restore, and complete cross-device SQL-backed feature parity remain open.

Stop after three implementation iterations as requested. Safe future work still exists, but is not silently started as a fourth iteration. No commit, push, merge, production data access or deployment.
