# Implementation-plan challenge — cross-review

2026-09-13. Same five reviewers read their peers and official release guidance. No tests or implementation. Final chairman decisions appear in implementation-plan.md.

## Frontend / UX

The strongest peer dependency is Security’s session decision coupled with DevOps’ origin contract. These determine account recovery UX, browser persistence and cache eligibility before frontend integration. I correct my earlier “preserve private exclusions” wording: cookie sessions require reassessing the worker’s Authorization-header check; header absence cannot establish anonymity.

Parallel ownership needs sharper boundaries. Assign frontend sole editing ownership of routes, auth client/store, shared UI state and worker; Security specifies session/cache requirements, backend owns API contracts and migrations, and DevOps owns origins and activation orchestration. Account integration and design port must not independently restructure the same screens.

Before implementation-plan approval, settle channel and breadth—both remain pending—plus the selected screen boundary, session transport, canonical-origin strategy, timer/offline promises and compatibility policy. Define how existing accounts remain accessible and how origin-bound attempts, installed clients and recovery/share links are handled. Redirects do not transfer local state; guest/prototype records must not silently become account records. Backend’s missing historical grocery provenance also limits export/deletion promises: agree truthful handling of unattributed merged rows without inventing ownership.

The sign-off trap is approving “rollback supported” because the previous build starts or reads candidate records. Recovery must also support writes after candidate writes, preserve deletion/revocation, and keep old clients/assets usable. Before plan approval, name the recovery approach, owner, acceptance scenarios and feasible verification environment; successful rehearsal is later evidence.

During increments, require integrated error/retry, account-switch, persistence and contract evidence. Before release, require physical-device lifecycle, accessible visual journeys, enabled-worker updates, recovery delivery and restore/rollback results against the assembled candidate. These results are not prerequisites for approving their implementation plan.

This refines my original position without expanding scope. No tests, writes or implementation performed.

---

## Backend / data

The strongest peer dependency is Security’s session decision coupled with DevOps’ origin transition. Backend identity, recovery URLs, frontend credentials and cache eligibility must share one contract. Cookie sessions invalidate an Authorization-header-only cache exclusion; define explicitly public cacheable responses and private-response handling for the selected authentication scheme.

Parallel ownership needs tightening: Backend should exclusively integrate `app.py`, auth/access helpers, models, migration ordering and sync transaction boundaries; DevOps owns deployment configuration and orchestration; Frontend owns API-client/session storage and worker implementation. Security reviews these contracts. Assign concrete file ownership before dispatch.

Correct the privacy acceptance language: historical grocery contributions cannot necessarily be reconstructed. Recipe merging omits attribution, and aggregated rows cannot establish each contributor’s quantities. Inventory recoverable associations, preserve unknown provenance, and approve truthful export/deletion semantics; do not fabricate attribution or introduce a historical reconstruction project.

Before implementation-plan approval, settle channel/breadth, session transport, origin/account continuity, retention semantics, conditional shopping mutation contracts, integration ownership and the proposed compatibility/recovery strategy. Channel and breadth remain pending. Identify a feasible disposable PostgreSQL verification route; completed migrations or passing tests are not prerequisites for approving their plan.

Origin continuity must distinguish server accounts from browser-local attempts and credentials. Specify reauthentication, existing-account identity preservation, old recovery/share links and any optional local-state transfer. Redirects do not establish that continuity, and guest/prototype state must not silently become account data.

The sign-off trap is calling an additive migration “rollback-safe.” Later increment/release evidence must exercise the recovery backend reading **and writing** candidate-created records, old installed clients, partial content publication, and restoration preserving deletion/revocation decisions. Approve those scenarios and recovery boundaries now; require successful execution before release.

My position is unchanged, with these ownership and provenance corrections. No tests, writes or implementation performed.

---

## Security / privacy

The strongest peer dependency is Backend’s identity/migration ownership combined with DevOps’ origin-transition contract. Session storage, recovery URLs, proxy trust and cache eligibility must be decided together. Assign backend the auth/API/migration implementation, frontend the client/worker implementation, DevOps the origin/release configuration, and security the control review. Parallel work must not independently redefine shared contracts or edit `app.py` and the worker without coordination.

Backend’s missing grocery provenance corrects my earlier “complete export” wording: merged historical rows cannot reliably identify individual contributions. Before plan approval, specify truthful legacy export/deletion semantics and distinguish unknown attribution from future provenance. Do not invent ownership or remove co-member content to satisfy an absolute privacy claim.

Origin migration also needs an explicit account-continuity policy: retain server identity, choose reauthentication or a reviewed transfer mechanism, and define treatment of origin-local attempts. Redirects do not transfer browser storage; guest/prototype state must not silently become account data. If cookies replace bearer tokens, the worker’s `Authorization` check no longer identifies authenticated requests. Review cache allowlists, HTTP caching and CSRF controls against that choice.

The sign-off trap is calling recovery safe because the old backend can read candidate records. Require a planned rehearsal of old-backend **writes**, session revocations and deletions after candidate writes, or designate a compatible recovery build/forward fix. Restoring a backup must not reactivate deleted accounts or links.

Before implementation-plan approval: settle channel/breadth—still pending—identity/origin contracts, legacy-data policy, ownership and a feasible verification route. My earlier “enforceable contract” means a specified design with acceptance criteria, not completed controls. Email delivery, PostgreSQL migration/recovery, account-switch caching and physical-device results belong to increment/release acceptance. The release guidance supports this separation; no new tests or changes were performed.

---

## DevOps / reliability

The strongest peer dependency is Security’s session decision: it determines frontend credential handling, recovery URLs, CORS/CSRF controls and cache eligibility. Resolve it alongside the canonical-origin and account-continuity contract before approving dependent implementation. An `Authorization`-header bypass cannot identify cookie-authenticated requests; cache eligibility must remain safe under the selected session model.

Parallel ownership needs tightening. Assign backend the sole implementation ownership of `app.py`, auth helpers, models and migration ordering; Security reviews the contract, while DevOps supplies environment/proxy requirements. Frontend owns worker changes; DevOps owns release sequencing and asset retention. This prevents separate teams changing authentication, origins and caching incompatibly.

Backend’s historical grocery-provenance finding changes the migration plan: missing attribution cannot be reconstructed from merged quantities. Before plan approval, specify truthful legacy export/deletion behavior and reconciliation rules. Do not invent contribution history or delete co-members’ quantities.

Origin migration also requires an explicit account reauthentication and guest-attempt preservation policy. Redirects do not transfer browser storage. Keep guest/prototype state separate from account records unless a deliberate import is approved.

The sign-off trap is treating “previous backend reads new records” as sufficient recovery. Strengthen my original requirement to include **writes** after candidate writes, plus preserved deletion/revocation decisions. Define a compatible recovery build or forward-fix route where rollback cannot satisfy these invariants.

Before implementation-plan approval, settle these contracts, ownership, recovery strategy, feasible PostgreSQL verification path and acceptance criteria. Channel and breadth remain pending; affected branches cannot become approved scope through silence. Completed infrastructure or passing implementation tests are unnecessary for plan approval.

Later increment/release evidence must demonstrate migration and concurrent-write behavior, restore reconciliation, email delivery, installed-client updates, origin transition and device outcomes against identified artifacts. Store rollout mechanics remain conditional on channel selection.

No tests, writes or implementation performed.

---

## QA / testing

The strongest peer dependency is Security’s session/origin contract: frontend recovery, API authorization, worker caching, and DevOps cutover all depend on it. Backend’s single migration owner is equally necessary. Assign explicit file ownership for `app.py`, auth helpers, models/migrations, account clients, and the worker; parallel tracks must consume agreed contracts rather than independently redefine them.

I correct my round-one acceptance wording: “complete export” cannot imply reconstructing grocery contribution history that was never recorded. Before plan approval, define truthful handling of unattributed merged rows, duplicate lists, and invalid legacy records. Later fixtures must include these cases without inventing ownership or deleting co-member quantities.

Origin migration needs an explicit account/state transition: whether accounts retain server identities, how users authenticate again, and what happens to origin-local attempts, installed apps, and recovery/share links. Redirects are insufficient. If sessions switch from bearer tokens to cookies, authenticated requests may lack an `Authorization` header; cache eligibility must follow the chosen authentication contract across worker, HTTP, and intermediary caches.

Before implementation-plan approval, settle channel/breadth, exposed journeys, identity/origin and historical-data policies, compatibility/recovery strategy, ownership, measurable gates, and a feasible isolated verification route. Channel and breadth remain pending; a conditional draft can proceed, but final scope approval cannot assume answers. Completed implementation is **not** required.

Increment acceptance supplies contract, concurrency, migration, and failure-recovery results. Release acceptance supplies integrated device/update, email, culinary, restore, and operational evidence.

The sign-off trap is calling recovery proven because the previous backend can **read** new records. It must also safely **write**, preserve deletion/revocation decisions, and coexist with already-updated clients—or have a specified compatible recovery build. Halting rollout does not reverse installed updates. No new tests, writes, or implementation performed.
