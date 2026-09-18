# Foundation council — iteration 2

Five independent delta reviews of the integrated candidate; no production data accessed.

## frontend — 01a09ad0-e24f-7c81-b8fa-d22e88ff5ec6

Two introduced issues should be fixed in iteration 3:

1. **[P1] Failed account switching deletes resumable cooking state.** [useAuthStore.js:29](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:29) clears `user` when credentials are submitted, before authentication succeeds. The immediate subscriber at [cookSession.js:256](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/cookSession.js:256) interprets that transition as an account change and deletes all previous-owner attempt records. A rejected login restores the user but cannot restore those records. Preserve the verified owner during pending credentials, or distinguish temporary verification state from a committed account boundary. Test an authenticated user with persisted attempts submitting invalid credentials; attempts must survive, while successful switching/logout must retain existing cleanup.

2. **[P2] Superseded credential requests still signal success to forms.** [useAuthStore.js:32](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:32) and line 36 return normally for stale outcomes. [Login.jsx:20](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Login.jsx:20) and [Register.jsx:21](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Register.jsx:21) consequently navigate home even when that submission was superseded or failed. Return an explicit applied/cancelled result and navigate only for applied success. Test overlapping submissions with the older response settling while the newer request remains pending.

Both are autonomous foundation corrections; no session-policy decision is required.

Independently reran auth-recovery and worker checks: **13 TAP tests passed**. Current tests omit these consumer interactions. Confidence: high from source tracing. Actual PostgreSQL, CI, and browser/PWA verification remain unproven; broader policy decisions remain deferred.

## backend — 01a09ad0-e40f-7ec3-a633-659f85657a8c

Backend/data delta: no must-fix defect found in the iteration 2 changes.

- [meal_plans.py:142](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:142) now resolves and authorizes every convertible tier before list creation or ingredient mutation. This closes the personal-plan downgrade bypass and prevents partial writes on authorization rejection. Missing-content skipping preserves existing behavior.
- [useAuthStore.js:53](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:53) preserves credentials on transient identity failures; [App.jsx:56](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/App.jsx:56) blocks consumers until identity resolves. The previous backend/client 503 mismatch is addressed.
- [run_backend.py:15](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/run_backend.py:15) removes inherited application settings, closing the reported configuration-contamination path.

Deferred, pre-existing limitation: [groceries.py:26](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:26) commits newly created lists separately. Therefore, authorization rejection is atomic, but a later ingredient-processing failure can leave an empty list. This does not invalidate the scoped fix; avoid claiming complete conversion transactionality.

Safe iteration 3 boundary: resolve concrete findings from other seats and verify those changes. No additional backend alteration is required by this review. Household-sharing semantics remain policy-gated; PostgreSQL, actual CI and browser verification remain evidence gaps.

Confidence: high in the inspected control flow. I did not independently rerun the coordinator’s reported tests or import the application.

## security — 01a09ad0-e665-7a62-b74f-18f36309a1c8

**P2 must-fix, introduced: failed login deletes existing account cooking state.** [useAuthStore.js:29](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:29) sets `user: null` before credential verification. The existing subscriber at [cookSession.js:256](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/cookSession.js:256) interprets this as an account departure and deletes persisted attempts and pending reflection submissions. On failure, line 37 restores the original user, but the records are gone.

An isolated probe executing both current modules with synthetic storage and a rejected login reproduced this: both records disappeared while user 1 was restored and epoch remained unchanged. No application/database import occurred.

Smallest safe correction: preserve the previously verified user during credential verification while `initialized: false` gates rendering; perform account cleanup only upon an actual identity transition or sign-out. Test failed login from an authenticated account using the real cooking-state subscription, asserting unchanged attempts, pending reflections, token, and epoch. Retain successful-switch and logout cleanup checks.

No additional concrete security/privacy defect found in the inspected delta. Personal-plan conversion now authorizes resolved items before grocery writes; shell caching retains API/private/no-store exclusions.

Deferred: household-sharing semantics and token policy. Actual PostgreSQL, CI, and browser verification remain evidence gaps, not passes.

Confidence: high for the reproduced defect; source-level review otherwise. No files changed.

## devops — 01a09ad0-e909-7293-a782-0bdabf4ff789

No must-fix DevOps/reliability defect found in the iteration 2 delta.

The previous findings are addressed:

- [app.py:212](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:212) explicitly permits caching audited public assets; [sw.js:46](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:46) accepts only `Accept-Encoding` variation. The new producer-header regression covers Flask/Compress behavior while preserving API no-store.
- [tests/run_backend.py:15](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/run_backend.py:15) constructs an allowlisted child environment, with hostile-parent coverage.
- [verify.yml:62](D:/Projects/cookbook/.worktrees/teaching-hardening/.github/workflows/verify.yml:62) includes both required Node flags and retains Bash pipeline failure propagation.

[useAuthStore.js:53](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:53) bounds identity initialization to 15 seconds and preserves credentials on transient failures. Its global gate, recovery actions and stale-response guards address the previously reported outage-induced logout.

Third-iteration boundary: resolve concrete findings from the other seats and verify affected paths; no additional reliability refactor is justified by this review.

Deferred environment evidence remains actual PostgreSQL migrations/sync, hosted CI execution, and real-browser worker/update behavior. Deployment connection/pool timeouts and recovery remain later operating gates, not newly introduced defects or authorization to provision infrastructure.

Confidence: high in the inspected corrections; moderate in end-to-end behavior. Read-only source review; reported test totals were not independently rerun.

## qa — 01a09ad0-ebd2-7e53-8f25-25a616f91eb0

**[P2, introduced; fix in iteration 3] Superseded login failures still trigger successful navigation.** At [useAuthStore.js:36](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:36), a stale credential rejection returns normally. [Login.jsx:20](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Login.jsx:20) and [Register.jsx:21](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Register.jsx:21) interpret that resolved promise as success and navigate home.

Concrete failure: submit twice; the first request returns 401 while the second remains pending. The first submission navigates away, unmounting the form; a subsequent failure from the second request loses its visible error. Using the existing isolated fixture and actual store/client source, I reproduced `staleRejectedLoginNavigated=true`, `latestPending=true`, `token=null`.

Smallest correction: return an explicit accepted/superseded outcome and navigate only after accepted authentication. Apply this to both forms; disabling repeat submission is useful additional protection. Add a regression exercising the form’s continuation, with stale success and stale failure arriving before the latest request completes. Current tests check store state but miss caller navigation.

The earlier shell-header and runner-isolation findings appear corrected in source; CI now includes both required Node flags. No additional concrete QA defect identified in the reviewed conversion changes.

This correction is within the authorized foundation boundary. Actual PostgreSQL, CI and browser verification remain deferred evidence requirements; ownership and session-policy decisions remain outside this iteration.

Confidence: high for the reproduced race. No writes, application imports, database connections or subagents.

## Chairman decision

Accept the frontend/security cooking-state finding as a must-fix data-loss regression, and QA/frontend's reproduced stale-form navigation defect. Preserve the last verified owner during temporary verification, keep the global render gate, and make credential outcomes explicitly applied/cancelled. Test actual cookSession subscribers and compiled Login/Register form continuations. Runtime/cache/test-infrastructure changes require no new refactor. Backend's empty-list-on-later-merge-failure observation is pre-existing and is retained as a conversion transaction gap, not falsely claimed fixed. Iteration 3 is the final authorized pass.
