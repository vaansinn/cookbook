# Foundation council — iteration 1 cross-review

Read-only replies from the same five actual specialist agents. The coordinator chairs; these are not human reviewers or different-model claims.

## 01a09ad0-e909-7293-a782-0bdabf4ff789

Strongest additional peer finding: [useAuthStore.js:27](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:27) deletes valid credentials on every initialization failure. This preexisting consumer behavior defeats the new retryable authentication 503. Preserve credentials during network/5xx failures, gate account content until verification succeeds, and expose retry. Test failure→successful retry, unchanged 401 cleanup, and logout/account-switch races.

No material disagreement. Frontend and QA independently corroborate the shell-header incompatibility; QA corroborates runner environment contamination.

The coordinator’s reproduced CI loader failure also warrants correction. The current workflow already contains the extensionless-loader flag, so verify that exact updated command rather than reapplying the edit.

Safe iteration 2: repair shell/header compatibility, runner isolation, retryable auth initialization, and CI invocation. Personal-plan entitlement enforcement may preserve existing rules; household-sharing behavior stays outside this batch where policy is unresolved. No schema, token-policy, infrastructure provisioning, or production changes.

The reported integrated 100-test pass is useful SQLite evidence. PostgreSQL remains BLOCKED by the missing driver; CI and physical-browser acceptance remain unproven. Confidence: high on inspected source paths. No edits or agents.

## 01a09ad0-ebd2-7e53-8f25-25a616f91eb0

Strongest peer finding: the preexisting auth consumer clears valid credentials on retryable 503/network failures. Frontend, backend and security independently identify the same gap; it undermines the new identity resolver’s failure contract.

No material disagreement. The shell/header mismatch and inherited test configuration findings reinforce QA’s assessment. The coordinator’s reproduced missing-loader failure additionally establishes that passing local frontend scripts does not validate the CI command.

Concrete corrections/tests:

- Preserve credentials during transient initialization failures, gate private content, and test successful retry, 401 cleanup, and logout/account-switch races.
- Align audited shell headers with worker eligibility; test actual producer headers followed by offline retrieval.
- Sanitize backend child environments; test hostile inherited configuration.
- Restore the existing extensionless-loader flag in CI and rerun the exact workflow frontend command.
- For personal-plan conversion, test downgraded access and atomic rejection before grocery writes; leave household-sharing semantics deferred.

Safe iteration 2 boundary: these targeted corrections and regressions, without schema, token/session-policy, ownership, production or provider changes.

Coordinator reports 13 backend scripts/100 tests passed. PostgreSQL remains **BLOCKED: missing driver**; CI remains unexecuted. Confidence: high in the cross-review conclusions.

## 01a09ad0-e24f-7c81-b8fa-d22e88ff5ec6

Strongest additional peer finding: DevOps/QA’s inherited-environment defect undermines reproducible verification. Passing 100 backend tests in one shell cannot exclude failures caused by inherited CORS, proxy, or body-limit settings.

No material disagreement. Current source has already advanced: `tests/run_backend.py` now allowlists essential environment variables, and `.github/workflows/verify.yml` includes the extensionless loader. These are visible corrections, not independently verified passes.

Concrete checks: test hostile inherited configuration against the runner’s child environment; rerun the exact corrected CI frontend command. For the shared worker finding, test actual Flask/Compress headers followed by offline fallback. For auth initialization, verify 503/network failure preserves credentials, blocks unverified account content, and permits successful retry; 401 must still clear credentials.

Safe iteration 2 boundary: those foundation corrections, plus atomic current-tier validation for personal saved-plan grocery conversion before any list mutation. Keep household-sharing semantics, schema, token transport/lifetime, and production actions deferred.

Coordinator-reported evidence remains 13 backend scripts/100 tests passed; actual PostgreSQL remains BLOCKED by the missing driver. No new execution claims from this cross-review.

## 01a09ad0-e665-7a62-b74f-18f36309a1c8

Strongest security peer finding: the pre-existing entitlement bypass at [meal_plans.py:140](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:140). Direct inspection confirms that saved-plan grocery conversion materializes advanced ingredients after an account downgrade without rechecking access. The adjacent apply-week route already checks current entitlement.

Correction: resolve and authorize all applicable plan items before `_get_or_create_list` or any merge. Test a mixed basic/advanced plan after downgrade: expect 403, no newly created list, and unchanged existing grocery rows. Verify an authorized account still succeeds.

No material disagreement. The independently reproduced shell-header mismatch and inherited test configuration are credible foundation defects. Shell repair must retain API/private/no-store exclusions and permit only explicitly understood `Accept-Encoding` variation.

Safe iteration 2: those corrections, retryable auth initialization, and the coordinator-confirmed CI loader fix. Reproduce the corrected exact CI command locally. Keep household-sharing policy, schema, token transport/lifetime, and production actions outside this iteration.

The reported 100 backend tests support integration; they do not establish PostgreSQL or CI success. PostgreSQL remains BLOCKED by the missing driver.

## 01a09ad0-e40f-7ec3-a633-659f85657a8c

Strongest peer finding: the worker rejects normal Flask shell responses (`no-cache`, `Vary: Accept-Encoding`), so passing synthetic worker tests do not establish offline-shell behavior. Align explicit caching headers for the audited public shell with worker eligibility; allow only understood `Accept-Encoding` variation. Test realistic producer headers, online population, offline retrieval, and continued private/API exclusion.

No material disagreement. Security’s “no bypass” conclusion should be limited to reviewed paths: the pre-existing personal-plan grocery conversion still omits current-tier authorization.

Iteration 2 can safely address:

- Shell/header compatibility.
- Retryable auth initialization without exposing unverified account content.
- Backend-runner environment sanitization, tested against hostile inherited settings.
- The reproduced CI loader omission, followed by running the exact corrected workflow command.
- Personal-plan tier rechecking before any grocery mutation, with downgrade and atomic-rejection tests.

Keep household-sharing semantics, schema, token/session policy, production and provider choices outside this iteration.

The coordinator’s 13 scripts/100 tests passed is integrated backend evidence, not PostgreSQL or CI acceptance. PostgreSQL remains BLOCKED by the missing driver. Confidence: high in the source-level findings; runtime coverage remains bounded.

## Chairman decision

Accept the five bounded iteration-2 corrections: real shell/cache headers, retryable frontend identity verification, isolated test environment, corrected CI loader, and atomic current-tier checking for personal-plan grocery conversion. Repeated source findings and reproduced failures justify these fixes; household ownership, session policy and production choices remain gated. Agreement does not replace PostgreSQL or device evidence.
