# Launch dispatch council — 2026-09-27

Read-only planning review of `04a414f218c909dea3c82e720d8d5ac8ba84e228`.
Five independent fresh-context GPT-6 Sol reviewers (`high` reasoning), not five different models or human experts. Main agent chairs. No product implementation, hooks or releases authorized by this review.

## Agent record

- frontend: 01a0e1c3-b4d0-7ef0-9d50-c45bc7a1f1ee (Plato)
- backend: 01a0e1c3-b5e0-7af0-beeb-858c40ee0857 (Chandrasekhar)
- security: 01a0e1c3-b752-7832-befc-0029d506571d (Faraday)
- devops: 01a0e1c3-b8a8-7fe2-8404-e11e0adfc681 (Erdos)
- qa: 01a0e1c3-ba20-7382-a1fc-4a6e7bb215c2 (Boole)

## Shared brief

Plan the remaining TODO L01–L17 work as bounded, reviewable assignments with dependencies, exclusive write sets and acceptance evidence. Phone-first PWA, private SQL data and full implemented prototype parity; preserve existing records. Local development only, with content/policy/human/release gates retained. Inspect actual relevant source. No recursive delegation or writes. GitHub run 35339011776 succeeded for the baseline; not launch approval.

## Round 1 — returned reports

## frontend
**Frontend/UX council seat — confidence: medium.** The smallest useful package is one real EN/DE journey: choose an ingredient on Home, open an authored recipe, switch between Ingredients and Method on a phone, see ingredients beside the method on desktop, and enter the existing cook flow. Present that wired journey for Q09 before extending the port. This follows L02 and LP21; it does not narrow the required planning/event/shopping parity ([TODO.md](D:/Projects/cookbook/.worktrees/teaching-hardening/TODO.md), [implementation-plan.md:292](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-plan.md:292)).

**Dispatch boundary.** Give one Sol task ownership of [Home.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Home.jsx:35), [RecipePage.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/RecipePage.jsx:29), their page styles, and EN/DE strings. Home already makes guarded, debounced real reads, but exposes text search plus cuisine/meal filters, with no ingredient entry control ([Home.jsx:47](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Home.jsx:47)). The server already matches query text against authored ingredient text ([routes/recipes.py:47](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/recipes.py:47)), so a first ingredient choice can use that existing read contract. Keep its current identity and stale-response fence ([recipes.js:7](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/api/recipes.js:7)). RecipePage already receives tier equipment from the API ([models.py:186](D:/Projects/cookbook/.worktrees/teaching-hardening/models.py:186)), yet currently renders one narrow column and marks method steps by clicking list items ([RecipePage.jsx:264](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/RecipePage.jsx:264)); the slice should supply keyboard-operable controls, equipment, and responsive section access.

Reserve shared [App.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/App.jsx:64) and [BottomNav.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/components/BottomNav.jsx:7) for a single integration owner after that leaf is reviewable. The current five destinations include private Shopping and Planning, while the nav is mounted in Home and History but absent from the private planning pages ([PrivatePlanningPage.jsx:117](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/PrivatePlanningPage.jsx:117)). A bounded follow-on can unify navigation, deep links, back behavior, safe areas and narrow German labels without competing edits to planning state. Keep the existing cook route and its account/attempt identity intact ([CookMode.jsx:72](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/CookMode.jsx:72)); configured plan-to-cook remains deferred.

**Acceptance and handoff.** Sol should stop after this slice, report changed paths, build/test results, and a short wired-screen record; the active task owner reviews it and dispatches the next bounded package. Check real authored EN/DE responses, empty/error and rapid language/account changes; keyboard focus and browser back; 320/390/768/1280 widths, both themes, no overflow; and cook entry preserving selected tier, language and servings. Existing discovery tests cover stale reads ([test_discovery_recovery.mjs:96](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_discovery_recovery.mjs:96)). Q09 needs the actual wired screens, including loading/error and focus behavior ([implementation-questions.md:111](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-questions.md:111)).

Remaining decisions: Q09 design acceptance and Q10 culinary/image claims. Independent UI wiring can proceed. Risks: ingredient text search is not a stable structured ingredient catalog; unapproved imagery or equipment claims could mislead; shared navigation edits could disturb private parity. No files were changed.

## backend
**Backend/data verdict:** the first useful package is a bounded contract and continuity pass for L01/L07, followed by one integrated backend change at a time. The planning foundation already exists; a new persistence design would duplicate it. At `04a414f` the worktree is clean, and the supplied CI run `35339011776` establishes a successful five-database disposable PostgreSQL rehearsal. It does not establish launch or recovery compatibility.

The backend integrator should have exclusive ownership of [app.py](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:110), [routes/planning.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/planning.py:342), auth routes and identity resolution, shared models, and the ordered `migrations/versions/` stream. In an active implementation task, dispatch **one bounded Sol assignment** to produce the route/exposure matrix, proposed auth and legacy contracts, migration order, tests, and evidence; review its result before dispatching the next assignment. Leaf work on catalog content validation or shopping projection can run separately only after interfaces are fixed and file ownership is disjoint. This supports automatic task-level delegation without implying unattended running.

The contracts have useful anchors. Planning writes lock the user and workspace, replay matching mutation receipts, reject stale revisions, reconcile shopping, and commit atomically ([routes/planning.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/planning.py:342)). Private records carry workspace constraints, and planned dishes reference retained catalog revisions ([planning_item_models.py](D:/Projects/cookbook/.worktrees/teaching-hardening/planning_item_models.py:27)). Catalog resolution rechecks current user, publication, language, recipe existence, and tier access ([planning_catalog.py](D:/Projects/cookbook/.worktrees/teaching-hardening/planning_catalog.py:316)); the catalog contract says no real entries are shipped ([planning-catalog-v1.md](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/contracts/planning-catalog-v1.md:1)). Authentication still uses bearer JWTs without revocation policy ([auth_identity.py](D:/Projects/cookbook/.worktrees/teaching-hardening/auth_identity.py:1)). Legacy household writes and a public shared-plan route remain exposed ([routes/groceries.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:87), [routes/meal_plans.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:255)).

**Acceptance for that package:** account for every exposed legacy route as preserved, adapted, read-only, or retired; specify one authoritative writer and truthful treatment of unattributed grocery history; map PX01–PX20 to current API tests and gaps ([planning-production-track.md](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/planning-production-track.md:27)). Then test invalid/deleted/expired sessions across routes, cross-account IDs and derived reads, stale confirmations, uncertain retries, revoked catalog revisions, and export/deletion. Migration rehearsals must cover fresh and populated synthetic databases, constraint failure rollback, creator-record preservation, and a designated recovery backend that **reads and writes after candidate-format records exist**. The present restore script proves restored writes and receipt retries, while expressly declining a production recovery claim ([verify_planning_restore.py](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_planning_restore.py:320)).

Independent work can inventory routes, prepare synthetic fixtures, and measure L12 query cost. Q06 session/access policy, Q07 shared-data retention, and Q10 culinary publication need decisions before their dependent behavior is finalized.

Three risks: an old backend cannot write new records; legacy endpoints bypass private ownership; publishing an incomplete catalog changes saved selections. Confidence: **medium** in the dispatch sequence, **low** in launch readiness until those contracts and recovery tests close.

## security
The smallest useful security package is a route and data exposure inventory, followed by a frozen session and legacy data contract. That gives Sol a bounded implementation task without asking it to choose account or sharing policy. This is a read-only review; I made no changes.

The current bearer token lasts 30 days ([app.py](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:45)) and is stored in browser `localStorage` ([useAuthStore.js](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/store/useAuthStore.js:9)). The identity resolver rejects malformed subjects and deleted users, and treats a database outage as retryable; it explicitly does not provide revocation ([auth_identity.py](D:/Projects/cookbook/.worktrees/teaching-hardening/auth_identity.py:1)). Registration and login issue tokens directly ([auth.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:130)); reset and verification routes are absent. These facts support starting an ADR for transport, expiry, logout, reset invalidation and cross-tab behavior, plus synthetic negative tests. They do not support selecting a replacement policy by default.

The legacy surface needs its own contract. Household invite codes permit joining ([groceries.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:60)), and shared meal plans have an unauthenticated slug route that returns the owner’s display name ([meal_plans.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:255)). Account deletion currently retains shared household rows for remaining members while clearing attribution ([auth.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:239)). Export includes attributed household rows and private planning data ([auth.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:195)). The public privacy page still labels its notice a local draft ([en.json](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/locales/en.json:201)).

For an active task, dispatch one bounded Sol package at a time: **(1)** inventory every exposed route, stored record, link and export/deletion consequence; deliver a matrix with source references and synthetic test cases. **(2)** after coordinator review of that matrix, draft ADR-A for sessions and ADR-B for legacy retention, with options and consequences. **(3)** once the affected contracts are accepted, assign backend implementation ownership for `app.py`, `auth_identity.py`, `routes/auth.py`, legacy routes and any ordered migration; assign frontend ownership for `useAuthStore.js`, account screens and locales. Security reviews the contracts and negative cases; QA owns integrated PostgreSQL evidence. Each dispatch should name its base revision, exclusive write paths, dependency, test limit and return artifact, as required by the existing plan ([implementation-plan.md](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-plan.md:140)). Stop after each result for review; this is bounded delegation during the active task, not unattended running.

Independent work can cover route inventory, synthetic legacy fixtures, abuse and outage test design, and fake-mail recovery design. **Q06** blocks final access, verification and session consequences; **Q07** blocks shared-data retention, link disclosure and member powers ([implementation-questions.md](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-questions.md:71)). Operator, retention and provider facts block final privacy copy. Acceptance should demonstrate revoked/deleted/expired credentials across exposed routes, reset replay and concurrency resistance, link revocation, accurate export and deletion for current/former/last household members, and deletion continuity after an isolated restore.

Risks: live legacy attribution may be unreconstructable; token revocation is absent; draft privacy claims could outrun actual operations. Confidence is **high** in this sequencing and **low** in launch privacy readiness until policy and operator evidence are settled.

## devops
**DevOps/reliability recommendation:** Start with a bounded, local release-operations package. CI is green for `04a414f`: the user-verified GitHub run `35339011776` completed the five-database PostgreSQL rehearsal. [TODO.md](D:/Projects/cookbook/.worktrees/teaching-hardening/TODO.md:111) still calls the first remote run unchecked, so the coordinator should record that result while keeping candidate-specific release acceptance open.

The package can be dispatched automatically to **Sol during an active task**, with one integration review and at most one correction pass. Give Sol a fixed base (`04a414f`), a write set limited to release documentation and, if needed, [verify.yml](D:/Projects/cookbook/.worktrees/teaching-hardening/.github/workflows/verify.yml:1) and [verify_release.py](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_release.py:1), and require a diff, test output, and remaining-gate report. Stop at the time or pass limit and return unfinished work to the coordinator; this is no promise of unattended continuing work. The existing [dispatch protocol](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-plan.md:119) assigns DevOps CI, configuration and runbooks, while backend owns `app.py`, migrations and sync transaction boundaries. Sol should request changes there through that owner.

The first deliverable is a provider-independent release and recovery runbook: identify the artifact and content revision, order migration and content validation, define a serialized activation and failure stop, retain old client assets, and specify isolated restore plus a **compatible recovery build that reads and writes candidate-created records**. This addresses [L13–L15](D:/Projects/cookbook/.worktrees/teaching-hardening/TODO.md:111) without choosing a host. It has a concrete gap to resolve: [Procfile](D:/Projects/cookbook/.worktrees/teaching-hardening/Procfile:2) currently chains migration and four sync commands, and the sync implementations commit separately ([recipes](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/sync_recipes.py:220), [glossary](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/sync_glossary.py:81), [skills](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/sync_learning.py:174), [lessons](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/sync_learning.py:230)). A late failure therefore needs an explicit safe recovery contract before publication.

Acceptance: retain the green CI baseline; rerun the exact candidate workflow after integration; use only fresh, exclusive disposable PostgreSQL targets for migration, populated-history, failed-sync/rerun and restore checks. The current coordinator already enforces five empty targets and bounded serial stages ([verify_release.py](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_release.py:7), [verify_release.py](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_release.py:58)). Its successful new-format restore does **not** prove old-backend rollback ([verify_release.py](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_release.py:31)). Record that separate recovery-build proof and deletion/revocation continuity before G4.

Independent work can proceed on the runbook, synthetic failure cases and capacity-measurement method. Q04/Q11/Q12 must settle operator, budget, domain, mail, backup and alert targets before topology-specific tests; Q14 remains the deployment gate ([implementation-plan.md](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-plan.md:76)). Principal risks are partial content activation, recovery code incompatible with new records, and unmeasured restore time or load. Confidence is **high** in the CI baseline and **low** in deployability until those candidate and environment gates pass. No files were changed.

## qa
**QA recommendation:** the smallest useful first package is a read-only parity and evidence audit. Give one bounded Sol task the PX01–PX20 matrix, the exact `04a414f` revision, and ownership of a report only. It should map each row to an API-backed screen, a server test, a browser scenario, and an evidence status. A second independent reviewer checks the mappings and challenges any “pass” supported only by a prototype or source assertion. This gives the coordinator a concrete queue of missing verification before assigning product fixes.

The basis is substantial but incomplete. The release requires full implemented planning, event, and shopping parity ([TODO.md](D:/Projects/cookbook/.worktrees/teaching-hardening/TODO.md:52)); the row-by-row outcomes are specified in [planning-production-track.md](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/planning-production-track.md:27). Real endpoints exist in [routes/planning.py](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/planning.py:233), and the shopping page uses the account-scoped workspace adapter ([PrivateShoppingPage.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/PrivateShoppingPage.jsx:17)). Server integration tests cover source coverage, retries, revocation, undo, and capacity ([test_planning_shopping_integration.py](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/backend/test_planning_shopping_integration.py:190)); frontend contract tests cover four views and scope behavior ([test_planning_shopping_contract.mjs](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/test_planning_shopping_contract.mjs:152)). These do not, by themselves, prove every journey in a real browser.

**Admission gate for each later Sol task:** identify one PX row or launch item, exact expected outcome and negative case, frozen API/content contract, base revision, exclusive write paths, shared dependencies, synthetic fixture, maximum scope, and named reviewer. Backend owns `routes/planning.py`, domain code, and migrations; frontend owns shared adapter/router state; QA owns test harness and evidence. Dispatch independent browser-scenario specification alongside frontend work, but serialize changes to shared files and PostgreSQL targets as the [operating model](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-plan.md:119) requires. End each task after its bounded deliverable, review, and handoff; the coordinator may dispatch the next admitted task during the active run.

**Done gate:** rerun affected tests on the integrated candidate, then record exact revision, fixture, environment, command/device, result, limitations, and independent review ([implementation-plan.md](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/implementation-plan.md:444)). The reported green GitHub run `35339011776` establishes a valuable `04a414f` baseline, including the disposable five-database rehearsal configured in [verify.yml](D:/Projects/cookbook/.worktrees/teaching-hardening/.github/workflows/verify.yml:88). The rehearsal explicitly excludes old-backend rollback and physical-browser acceptance ([verify_release.py](D:/Projects/cookbook/.worktrees/teaching-hardening/scripts/verify_release.py:31)). Do not close PX rows from that run alone.

Independent work can specify browser journeys and the narrowly scoped worker-cleanup check ([TODO.md](D:/Projects/cookbook/.worktrees/teaching-hardening/TODO.md:92)). Q09 wired-screen and Q10 culinary approval remain human decisions. Top risks: fixture tests confirming their own assumptions; shared-file or database interference during parallel work; treating a green rehearsal as release proof. **Confidence: high** in the first QA package and gates, **moderate** in current parity until browser and second-device evidence is recorded.

## Cross-review and chairman synthesis

### frontend

QA’s strongest finding is that source code and contract tests do not establish PX01–PX20 parity in a real browser. I would put its read-only evidence matrix ahead of implementation dispatch, then use the gaps it finds to admit bounded Sol tasks.

I would correct one boundary in my first report: `/dishes?q=` searches authored ingredient *text*, so it can support a demonstrable ingredient entry point, but it is not a stable ingredient identity contract. The first slice should use it only for discovery; any structured ingredient picker must wait for the catalog contract. Also, recipe equipment is available from the API, but Q10 must govern claims about its culinary correctness.

The exact frontend gate is an EN/DE, 320px and desktop, keyboard-operated Home → recipe → cook browser journey using real authored responses, including empty/error states, stale language/account responses, browser back, and unchanged cook attempt identity. Q09 reviews those wired screens. Shared router/nav files get one serial owner.

My view changed on ordering: inventory and parity evidence should precede the first implementation package. The proposed frontend slice remains the smallest useful UI package once admitted.

### backend

The strongest peer finding is DevOps’s partial-publication risk: the startup path runs separate content sync commits, so a late failure can leave an incomplete release. That makes content activation and recovery a backend data contract, not only an operations runbook.

One missing boundary in the proposed three-worker model is **who may change shared database behavior**. Frontend and QA can work in parallel on the wired journey and PX evidence matrix, but one backend owner must serialize changes to models, migrations, auth, planning commands, and content sync. A reviewer can identify a gap without becoming a second writer to those files.

I would add one exact acceptance scenario: on disposable PostgreSQL, create candidate-format planning and catalog records, fail a later content sync, then use the designated recovery build to read and write those records while preserving mutation receipts, revoked access, and deletion state. Record the resulting content visibility and rerun behavior.

My view changed slightly: the first backend contract package should explicitly include content activation and recovery alongside legacy exposure and sessions. It remains a bounded, reviewed dispatch; subagents cannot approve release.

### security

QA’s strongest finding is that existing API and contract tests cannot close PX01–PX20 without evidence from the actual browser journeys. Its row-by-row audit is a sound first dispatch artifact.

One boundary needs tightening: the frontend’s proposed ingredient choice can use authored ingredient text search for the first wired journey, but that should be recorded as the current behavior, not accepted as a stable ingredient identity contract. More directly for security, the legacy shared-plan URL returns the owner’s display name today; Q07 must decide whether that disclosure and link behavior remain before an implementer changes them.

Add a test to the first dispatch packet: enumerate every public and legacy route, then exercise anonymous access, another account’s IDs, removed membership, deleted owner, and revoked link against synthetic records. Include the expected response and data disclosure for each case. Keep auth, migration, and database-owner edits serial; up to three implement-review-fix iterations are a limit, not permission for a subagent to approve its own result.

My view has not changed on sequencing. The peer reports sharpen the acceptance evidence and the public-link boundary. The current task should produce dispatch documents only.

### devops

The strongest peer finding is QA’s requirement to map each PX01–PX20 outcome to an API-backed screen and browser scenario before marking parity complete. It gives DevOps a precise candidate gate; the green CI run alone cannot close those rows. Backend and security also reinforce that recovery must preserve deletion and revocation decisions while a compatible build reads **and writes** candidate-created records.

One boundary needs tightening in my first report: I allowed possible CI or runner edits in the initial Sol package. Since the current task writes dispatch documents only, those edits belong to a later, separately admitted implementation batch. The chairman’s three-worker limit is workable if PostgreSQL targets and migration, sync, and shared-file changes remain serial.

I would add this exact gate to the dispatch document: induce a late content-sync failure on disposable PostgreSQL; verify the recorded stop and rerun behavior, then restore an isolated candidate-format database and exercise a write with the designated recovery build without reviving revoked access. Record artifact and content identities with the result.

My view changed on **initial scope**: document the runnable gate now; implement or execute it later.

### qa

The strongest peer finding is the backend/security route inventory: PX01–PX20 can pass through the new private screens while legacy household or public-link routes still expose related data. The inventory should be an admission dependency for any task claiming account privacy.

One missing boundary in the DevOps proposal is **this task’s write scope**. CI and verifier edits belong in a later implementation batch; the current output is dispatch documentation. The verified green run is baseline evidence, not candidate acceptance.

Correct the first dispatch packet to pair the PX evidence matrix with the route inventory. For each affected row, require a synthetic cross-account or revoked-access case through every relevant exposed route, plus an API-backed browser journey. Mark each result pass, fail, blocked, or untested; do not infer a pass from prototype tests or CI. Later batches can use three non-overlapping workers at most, with shared files, migrations, and database ownership serialized and independent review after each bounded iteration.

My view changed slightly: the route inventory should precede parity sign-off, rather than run as an unrelated parallel check.

## Chairman evaluation and decision ledger

All five seats and their cross-reviews completed. Main independently checked
auth_identity.py's explicit no-revocation contract, app.py's 30-day token expiry,
useAuthStore.js's local token read, the public shared-plan owner_name response,
the Procfile's sequential content sync commands, and verify_release.py's
explicit exclusion of old-backend rollback. GitHub CI was checked by the main
agent, not newly run or independently executed by all reviewers; the DevOps
report's phrase "user-verified" above should be read as supplied baseline evidence.

| Issue / seat | Assessment | Decision |
|---|---|---|
| Frontend: one real wired journey | Concrete existing API boundary; medium confidence until screenshots | Retain thin slice, but admit after D01/D02; ingredient text search is not network identity. Q09 before broader port. |
| Backend: contract/continuity first | Existing transactional planning should be retained, not redesigned | One owner for auth/models/migrations/commands/content transactions; explicit content activation contract added to D01. |
| Security: exposed legacy routes and session gaps | Verified current behavior, not invented future risk | Q06/Q07-dependent changes remain gated; enumerate public/legacy negative cases before privacy sign-off. |
| DevOps: green CI vs operational recovery | CI result is valuable but narrower than launch readiness | Update stale CI status; add late-failure/recovery-build read-and-write scenario; runbook now, operations later. |
| QA: production parity evidence | Source and fixture tests alone are insufficient | D02 maps every PX row; final D10 sign-off also depends on auth/legacy integration. |
| Immediate parallel UI vs inventory first | Frontend changed its recommendation after cross-review | First batch D01/D02/D04; D03 follows the first two. Inventories must remain bounded, not indefinite architecture work. |
| Broad initial DevOps edits | DevOps explicitly withdrew this suggestion | Current turn is documentation only; later exact-path implementation admission required. |

No unresolved minority dissent on this dispatch structure; this is not proof of
product safety or release consensus. The unresolved low-confidence areas remain
session/shared-data policy, authored culinary/configuration data, physical device
behavior, real load, retention and operator recovery. Each has an evidence gate
or user checkpoint in the dispatch plan. Questions can block one package without
stopping independent work. The reviewed native delegation path needs no hooks.

Recommended exact future recovery test: write candidate-format planning/catalog
records on exclusive disposable PostgreSQL; fail a later content sync; verify
safe visibility and rerun behavior; restore and exercise reads and new writes
using the designated recovery build, retaining receipts and revocation/deletion
state. Additive migrations alone do not pass it.

This review ran no application tests and changed no application code. All source
findings are planning evidence; recent baseline tests are linked in the plan.
