# Cookbook — launch implementation plan

**Status: full release plan remains a draft for staged sign-off. A bounded foundation implementation batch was separately authorized; release is not approved.**\
Updated 2026-09-13. Based on the [launch assessment](assessment.md), five independent planning specialists one [cross-review](implementation-round-2.md) and a [targeted scope clarification](implementation-scope-update.md) after the user's decisions.

## Executive plan

Current outstanding work: [launch checklist](../../../TODO.md), updated 2026-09-18.
Latest local execution: [continuation and evidence](continuation-2026-09-13.md),
following the [shopping foundation council](shopping-foundation-council.md)
and [X1c contracts](../../contracts/private-planning-x1c.md). This is not approval
to publish content or release the app; historical proposal sections remain below.

Preserve the existing React/Flask/SQLAlchemy foundation. Bring the approved welcoming experience into the real app, harden exposed account/cooking/planning behavior, prove a repeatable recoverable release, then launch the explicitly selected phone experience.

This document is the execution map. [Q&A checkpoints](implementation-questions.md) record when to involve the user. [Release guidance](release-guidance.md) records current official sources and how they influence the plan.

The user's subsequent instruction authorizes up to three safe implement/test/council
iterations while collecting remaining questions. See the [foundation batch](foundation-batch.md)
for implemented scope and evidence. This exception does not settle planning ownership,
data migration, account policy, GDPR or deployment gates, and does not mean the full
SQL-backed feature integration below has been implemented.

**Confirmed by the user: phone-first website/installable web app, then app stores; full approved planning/event/shopping prototype functionality in the first release.** The mandatory [X production track](planning-production-track.md) specifies its parity requirements, proposed data/API contracts and parallel work packages. This is a substantial backend integration, not a cosmetic port of the older planner.

Current decisions supersede the original preflight below: Q03 confirms creator-only existing use (preserve those records), Q08 confirms private new user data, and local development is authorized. Disposable PostgreSQL migration/transaction/restore rehearsals are now available. Public access/verification, shared legacy retention, culinary catalog publication, physical-device checks and deployment still have their own gates. See the current council record and Q&A register rather than treating historical baseline gaps as current blockers.

Historical planning-pass note: no feature implementation, infrastructure changes, fresh application test runs, commit, push, deployment or recruitment occurred while originally preparing this document. Subsequent authorized local implementation is recorded above; no public release is implied.

## 1. Baseline, boundaries and proposed release shape

Reviewed working tree: `D:/Projects/cookbook/.worktrees/teaching-hardening`; branch `codex/teaching-pilot-hardening`; HEAD `5c60456e32d4db4ac78c9a2d3e074ff3395a52f1` plus existing uncommitted prototype changes. Root main is older. Current remote/deployed revisions and real-user inventory have not been established. Preserve all existing changes; an implementation handoff must identify both commit and uncommitted contents.

Previous council verification passed 45 backend tests, four frontend scripts and a temporary production build. These were SQLite-based backend checks, not PostgreSQL acceptance. See [verification limits](verification.md). This planning turn rechecked source/status and guidance, not the whole application test suite.

### Confirmed release shape

| Track | First-release status | Required outcome |
|---|---|---|
| Core cooking and account foundations | Included; access policy at Q06 | Welcoming discovery/recipes/cooking, preserved guest access and teaching/history integrity, reliable account lifecycle |
| Full planning/events/shopping — X | **Mandatory**, Q02 | Production-backed current prototype parity including flexible meals/events and source-level shopping; PX01–PX20 |
| Phone-first web/installable app | **Confirmed**, Q01 | One responsive app; physical iPhone/Android browser and home-screen acceptance |
| Desktop browser | Included | Same data, reliable management and cooking with appropriate layouts |
| Native app stores — N | Deferred until after web release | Later feasibility/signing/platform review; no packaged desktop app in first release |

The earlier reduced P-track and guest-only launch options are superseded, not alternative ways to satisfy Q02. Full parity does not mean every earlier roadmap idea is already included. The [X boundary](planning-production-track.md) distinguishes implemented behavior from future additions.

New planning is account-private under the user's Q08 answer, with existing guest Basic cooking preserved. Exact public launch access/verification remains at Q06; no new multi-user collaboration is implied.
Retain guest/account separation, immutable recipe/lesson snapshots, exact attempt identity, revision/idempotency semantics, optional confidence/reflection, EN/DE and no XP/streaks/mastery. Do not change existing recipe entitlements or invent paid checkout through a design refactor.

Personal recipes, branching/scanning, full network generation, ingredient-surplus/batch/leftover systems and broader curriculum are deferred unless separately selected. No production migration of browser-local demo data or guest activity into accounts.

## 2. Approval model and just-in-time Q&A

### Confirmed persistence requirement and privacy gate

User clarification, 2026-09-13: registered users and their saved account information must use a proper SQL backend, not browser/app-only persistence; GDPR compliance is a launch requirement. This does not answer Q03 about existing users/data or approve any provider, collaboration model or implementation.

- PostgreSQL is authoritative for account identities, saved preferences, favourites, recipe/configuration references, plans, events, shopping state and retained cooking history/reflections. Credentials use secure password hashes, never recoverable plaintext. Future personal recipes must use the same ownership foundation; authoring remains deferred.
- The browser/app communicates through an authenticated backend API, never directly with the database. Local caches, pending requests and explicitly unsaved drafts are auxiliary and account-isolated. Guests and active local cooking attempts retain their separately defined lifecycle; this does not silently introduce cross-device live-timer synchronization.
- Images/assets may use controlled file/object storage with SQL metadata and ownership rather than binary database columns. They remain covered by retention, access and backup policies; “SQL-backed” does not require every byte in SQL.
- **Acceptance:** after a confirmed save, clear browser storage or use a clean second device, sign in and recover the same saved account data. Repeat with an uncertain response and correct mutation reconciliation. Signing out must prevent the next account from seeing previous private state. This is required in LP23/X10/LP50.

LP02/LP12/LP41/LP51 must also carry a privacy evidence checklist before release:

1. Identify the controller/operator, establishment, audience and contact; document processing purposes, necessary fields, lawful bases and any special-category/children's-data implications. A blanket consent checkbox is not the default solution. [EDPB lawful processing](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en).
2. Record data flows, privacy-by-default access, retention/deletion periods and whether a DPIA or DPO is required. Do not collect unnecessary profile, health or tracking data to fill an account screen. [EDPB compliance guidance](https://www.edpb.europa.eu/sme/be-compliant/be-compliant_en).
3. Implement and test access, correction, export/deletion and applicable restriction/objection/portability request handling, including shared data and justified retention exceptions. Publish understandable notices and a working request contact. [EDPB individuals' rights](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en).
4. Inventory hosting, email, monitoring, assets, backup and other processors/subprocessors; verify contracts, locations and any international-transfer safeguards. European hosting preference is retained, but provider location is not a compliance guarantee. [EDPB controller/processor guidance](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en).
5. Test least privilege, account isolation, HTTPS, secure credentials, encryption/key management appropriate to risk, redacted logs, patching and isolated restore. Document incident assessment, applicable breach reporting and deletion continuity after recovery. [EDPB security guidance](https://www.edpb.europa.eu/sme/be-compliant/secure-personal-data_en).

Resolve architecture-defining privacy choices at Q04/Q06–Q08 before G1; finalize provider contracts, notices, retention jobs and incident/rights procedures at Q11/Q12 before G4. Review nonessential analytics/cookies separately before enabling them. A qualified privacy/legal review should confirm applicability and unresolved legal choices for the actual operator and deployment. Tests, an EU server and this plan do not certify GDPR compliance; evidence and ongoing operating responsibilities are required.

| Gate | What is approved | Required inputs | What it does not mean |
|---|---|---|---|
| G0 — Preflight authorization | Bounded inventory, contract design and explicitly scoped disposable spikes | User approval to start those tasks; environment/spend limits | No feature implementation, production inspection, provisioning or release |
| G1 — Implementation-plan sign-off | Selected scope, architecture/contracts, owners, tests and recovery route | Q01–Q03 answered; applicable policy/product decisions resolved; low-confidence preflight outputs accepted | Not evidence that fixes work; not deployment approval |
| G2 — Foundation acceptance | Integrated identity/data/environment foundations | Relevant backend/security/QA results and agreed frontend contracts | Not acceptance of mock-only screens |
| G3 — Product-slice acceptance | Wired selected journeys and approved design | Real APIs, failure-state tests, user screen review Q09 | Not content/device/operational sign-off |
| G4 — Release-candidate acceptance | Exact integrated artifact satisfies engineering, content and operating gates | PostgreSQL, device/worker, email, culinary, restore/security evidence | No automatic publication |
| G5 — Release authorization | Exact deployment/cutover/store action | User approval Q14, named operator and rollback/forward-recovery plan | No unrelated spending, bulk changes or recruitment |
| G6 — Launch closure | Agreed observation window reviewed; follow-ups owned | Operational evidence, support issues and user prioritization Q15 | No open-ended autonomous monitoring |

Ask no more than three focused questions at once. An unanswered question pauses its dependent track, not independently approved work. Proposed defaults are not user consent.

**Q01–Q02 answered:** web/PWA first, app stores later; full approved planning/events/shopping included. **Still asked/pending:** Q03 existing users/data.\
**Before G1:** relevant Q04 operating/test access, Q05 timer/offline promise, Q06 account/access policy, Q07 shared-data semantics and Q08 production planning ownership/scopes. Establish the origin *strategy* now; exact domain/mail identity can wait for Q11.\
**During delivery:** Q09 wired-screen review; Q10 culinary/image approval; Q11 concrete cutover/email details; Q12 numeric operating/support targets.\
**Before external actions:** Q13 participants and Q14 release authorization. Full wording and pause effects are in [implementation-questions.md](implementation-questions.md).

An overall roadmap can be acknowledged while a conditional track remains unsigned. Do not label the complete implementation plan “approved” while its mandatory contracts are unresolved. If a later answer changes architecture or scope, revise and re-sign only the affected contract/dependencies.

## 3. Confidence register — what must become stronger

Confidence below concerns the proposed solution/evidence, not certainty that a source defect exists.

| Risk | Current confidence | Strengthen before G1 | Later proof required | Owner |
|---|---|---|---|---|
| R1: Actual launch scope/users/deployed baseline | Channel and feature breadth confirmed; data/deployment confidence remains low | Q03; candidate-to-live mapping and permitted metadata inventory | Cutover continuity and release identity | Coordinator/user/DevOps |
| R2: Production database and verification access | Low feasibility; prior local engine check blocked | Identify an explicitly disposable PostgreSQL route, supported version, owner and isolation controls; capability smoke if authorized | Fresh/populated migration, concurrency, integrity and restore | DevOps/QA |
| R3: Session/auth/origin architecture | Medium-low; current bearer behavior known, replacement undecided | ADR comparing bounded bearer hardening vs web cookie session strategy and native needs; expiry/revocation/recovery/CSRF/cache contract | Real email, negative auth, account-switch and native/browser evidence | Backend/security/frontend |
| R4: Legacy deletion/export and shared provenance | Low for historical ownership; source omissions confirmed | Inventory every user reference, duplicates/invalid legacy records, unknown grocery provenance; approve truthful handling | Migrated synthetic legacy fixtures, atomic failures, co-member preservation | Backend/security |
| R5: Phone timer/offline promise | Low for device capabilities; callback defect known | Q05 and a state-transition/feasibility record; if locked alarms are mandatory, an actual bounded selected-platform spike before architecture approval | Physical lock/background/refresh/clock-change tests; no unsupported alarm claim | Frontend/QA |
| R6: Prototype/content mapping | Medium for visuals; low for production component catalog | PX01–PX20 action/API map; finite versioned ingredient/form/variant catalog, configured preview and content/access policy | Wired parity, current access, correct configured content and attempt isolation | Frontend/backend/content |
| R7: Full X authority and transactions | Low until contracts close; prototype behavior specified | Q08/ADR-X: workspace/source/scope identity, revisioned commands, exact preview/inverse undo; no invented provenance | All PX rows, concurrency, uncertain retries, stale confirmation/undo and coverage reconciliation | Backend/security/QA |
| R8: Release/content/rollback compatibility | Low for new X records; separate content commits confirmed | Serialized publishing, client horizon and compatible recovery artifact; pre-X backend may be unsafe | Designated recovery backend reads **and writes** candidate data; partial publication and two-release rehearsal | Backend/DevOps/QA |
| R9: Store viability/toolchain | Deferred, not a web-release blocker | N0 before later store approval: accounts, tooling, native session/lifecycle feasibility | Signed builds, store requirements and native-device acceptance when N starts | DevOps/frontend/security |
| R10: Culinary accuracy/AI image correspondence | Unverified acceptance, not a framework problem | Assign reviewer and finite release set; resolve any content assumption driving architecture | Q10 actual bilingual content/equipment walkthrough and image claims approval | User/content reviewer |
| R11: Operating load/cost/support | Low; no measured deployment | Q04 bounded envelope and responsible operator; feasible monitoring/backup design | Q12 measured thresholds, alert delivery, restore and modest-load evidence | DevOps/user |

G1 does not require completed product tests. It does require a specified, feasible route to obtain them and closure of architecture-defining unknowns. A blocked PostgreSQL route, mandatory but unproven alarm capability, or undefined personal-data policy is not removed by recording it as “future testing.”

Each preflight investigation gets a narrow question, permitted environment, output, success/failure rule and one bounded fallback. If still unresolved, report the decision needed; do not keep installing tools or inventing a solution.

## 4. Agent operating model

Use up to five active specialist agents plus the coordinator. Reuse expertise; do not create a new council for every small patch. Independent review is required for security/data/release changes, not five votes on every CSS adjustment.

| Role | Primary responsibility | Exclusive shared-file owner |
|---|---|---|
| Coordinator / integrator | Scope, decisions, dispatch, integration queue, evidence and user Q&A | Canonical plan/decision ledger; no unreviewed code integration |
| Backend implementer | Auth resolver/API contracts, data lifecycle, mutations and migrations | `app.py`, `access.py`, `models.py`, auth routes, ordered migration stream, sync transaction boundaries |
| Frontend implementer | Welcoming port, controllers, recovery UX, responsive layouts | Router/nav, API client/auth store, Cook Mode/session storage, worker/manifest, shared CSS/locales |
| Security reviewer | Threat/control matrix, session/privacy/share review, abuse tests | Security specifications/test scenarios; requests changes to owned product files |
| DevOps implementer | Build/CI/env/release orchestration, hosting/runbooks | CI/workflow/runtime/package configuration, deployment scripts/docs; requests `app.py`/worker edits from owners |
| QA implementer/reviewer | Synthetic fixtures, regression/device/release evidence | Test harness and integrated acceptance suite; coordinates feature-level test locations with code owner |

Backend/frontend can delegate disjoint leaf components once contracts are frozen and capacity allows. Never assign separate agents overlapping edits to `app.py`, migrations, auth clients, router, worker or locale files. A frontend subtask returns a component/patch; its integrator wires shared routes/tokens. DevOps and backend agree sync interfaces before either changes release sequencing.

### Branch and integration protocol

1. Verify latest intended base and dirty/untracked work at dispatch. Preserve main and existing prototype/plan files. No automatic fetch/pull, commit or publication implied by this plan; remote reconciliation happens read-only or with explicit authority.
2. On implementation authorization, use isolated `codex/...` worktrees/branches per approved work package where supported. Do not share one mutable checkout between parallel writers.
3. Record exact base revision and approved file write set; include hashes/inventory for uncommitted input. Never copy production databases/secrets into worktrees.
4. Freeze shared contracts first. Workers request contract changes through the integrator, not unilateral “fixes.”
5. Integrate one reviewed change at a time into the candidate. If commits/cherry-picks are not authorized, use reviewed patch/artifact handoffs; do not make git history changes silently.
6. Re-run affected tests after integration, then the full selected gate. Isolated green branches do not prove the assembled app.
7. New persistent shapes require old-reader/writer and recovery tests after candidate writes. Coordinate migrations in one sequence; inspect/reconcile duplicate/invalid legacy data before enforcing constraints.

### Required dispatch packet

```text
Task ID / desired user outcome:
Approved scope and decision/contract versions:
Base revision + uncommitted input identity:
Allowed write paths / read-only shared dependencies:
Depends on / downstream consumers:
Implementation steps and explicit non-goals:
Required happy/negative/concurrency/device cases:
Acceptance artifact and reviewer:
Persistence/old-client/recovery constraints:
Questions or blockers requiring escalation:
No production data, secrets, commits/push/deploy/provisioning unless expressly authorized.
Return: changed paths, concise diff rationale, exact tests/results, limitations,
       remaining questions, compatibility/migration notes, suggested commit.
```

Security and QA review a different agent's critical work. The coordinator cannot declare a blocker resolved solely because the implementer reports success.

## 5. Dependency map and waves

Relations below are acceptance dependencies; leaf work can start earlier against approved contracts.

```text
LP00–LP02 + X0: scope, inventory, feasibility and frozen contracts
                            |
                            G1
                            |
           LP10/14 + LP11→LP12/13        LP20 + QA fixtures
                 |                            |
                 G2                    LP21/22/23/24
                 |
             X1 foundation
                 |
       X2 catalog + X3 plans + X4 events
                 |
           X5 demand → X6 coverage
                 |
       X7 plan/event UI + X8 shopping UI + X9 continuity
                 |
                 G3: wired core + mandatory X parity
                 |
          X10 + LP40/41 → LP50/51
                 |
                 G4 → Q14/G5 → LP60/G6

Native N follows the first web release; it is not this critical path.
```

LP10 and LP14 share `app.py` input only through backend ownership. LP22/LP23/LP24 are logical packages, not permission to run overlapping frontend writers simultaneously. Content review and test-case authoring can start early; publishing/rehearsals consume integrated code.

Do not assign a calendar release date before G1 and the environment/platform spikes. After that, estimate each package with a range and separate agent work, user waiting, environment work and external review lead time. Parallelism reduces independent work, not migration integration or device/store waiting.

## 6. Wave 0 — close plan-defining unknowns

### LP00 — Release contract and exposure matrix

**Owner:** coordinator with user/security/frontend. **Dependencies:** Q01–Q03.
- Record confirmed core + full X + phone-first web/PWA and deferred N; settle surfaces, account/tier promises and user-data obligations.
- List every UI route and API endpoint as included, supported existing-user only, deferred/denied or public reference. Removing a tab is not disabling an API.
- Map approved prototype interactions to actual APIs, including clear exclusions. Ingredient-first browsing requires real metadata; do not label ordinary text search a recipe network.
- Define no-new-feature boundary and acceptance scenarios.
**Output:** signed release contract and route/API matrix. **Acceptance:** no exposed action relies on a fake/example-only flow; existing-user access/export/deletion continuity is explicit.

### LP01 — Baseline, data and environment inventory

**Owner:** DevOps + backend; QA validates test safety.
- Identify code/content/artifact lineage and permitted live metadata; no personal records or secret reads.
- Inventory model foreign keys, route/helper callers, existing migration chain, duplicate-list possibility, invalid dated entries and unattributed merged groceries.
- Confirm PostgreSQL test route, physical devices/toolchain access, intended origins, operating owner/budget and current-host dependencies.
- Inventory dependency/asset licensing, runtime support, known advisories using scoped tools once authorized; do not auto-upgrade everything.
**Output:** sanitized inventory, risk entries and verification-access plan. **Acceptance:** owner can state what is known, unknown and inaccessible; no “empty production” assumption or fabricated provenance.

### LP02 — Architecture/compatibility records and bounded spikes

**Owner:** backend/security/frontend/DevOps; coordinator accepts.
Freeze:
- **ADR-A:** session transport/storage, credential expiry, server revocation, reset/verification, recent-auth rules, origin/CSRF/CORS and private-cache eligibility.
- **ADR-B:** data inventory/export/deletion, unknown legacy provenance, share/invite policy, migration reconciliation and retained shared data.
- **ADR-C:** cooking state/clock behavior, attempt storage versioning, offline promise and safe update handoff.
- **ADR-D:** client/API/error/mutation contracts, old-client support horizon, feature availability and recovery behavior.
- **ADR-E:** content prevalidation/activation, serialized release, artifact promotion, backup/deletion reconciliation.
- **ADR-X (X0):** mandatory planning/event/shopping ownership/schema, authored catalog/configured previews, source/scope/coverage identity, revisioned commands, exact preview/confirm/inverse undo, legacy cutover and recovery. See [detailed X track](planning-production-track.md).
Use disposable spikes only where needed to prove feasibility. Native N0 stays deferred under Q01. Do not implement a generalized framework.
**Acceptance:** applicable architecture-critical R1–R8 have evidence-backed decisions or the affected track remains unsigned; R9 is deferred. G1 review lists every remaining phase-local question.

## 7. Wave 1 — trustworthy foundations

### LP10 — Isolated tests and repeatable CI

**Owner:** QA + DevOps. **Depends:** LP01/02.
- Pin supported runtime strategy and lockfile-enforced frontend install; record Python dependency resolution and artifacts.
- Build deterministic synthetic accounts/content and disposable PostgreSQL fixtures. Assert an allowlisted test target; refuse production-like/unapproved URLs; disable dotenv leakage and real outbound email.
- Run current backend/frontend suites, add migration/contract jobs, production build and selected prototype regressions to protect reference behavior.
- Save source/content/build identity and test reports; no secrets/personal data in logs/screenshots.
**Acceptance:** clean reproducible build; current tests preserved; fresh/populated PostgreSQL jobs run in a usable environment; failure cannot mutate a personal database. Current SQLite passes remain separate evidence.

### LP11 — Auth resolver, validation and session lifecycle

**Owner:** backend; security review. **Depends:** ADR-A/D, LP10 harness.
- Introduce one authenticated-user/session resolution contract rejecting expired, revoked and deleted accounts across all protected endpoints.
- Validate object bodies, field types, bounded sizes and supported values; consistent controlled 4xx responses, request IDs and redacted logs.
- Implement agreed expiry/revocation/logout/recent-auth semantics. Preserve explicit guest access.
- Apply abuse controls to login/registration/reset/invites where exposed; define backing storage and multi-worker behavior. Do not rely on process-local limits without an explicit small-deployment constraint.
- If cookie sessions are selected, implement CSRF/origin protections and revise cache tests; lack of an Authorization header must not imply anonymous.
**Acceptance:** malformed/oversized input, credential attempts, revocation, stale/deleted tokens, cross-account access and guest behavior pass. No claim of exploit-free software or ASVS certification.

### LP12 — Account export, deletion and legacy reconciliation

**Owner:** backend; security/QA review. **Depends:** LP11, ADR-B, Q07.
- Enumerate private/owned/shared records including favorites, plans, reflections/confidence/receipts, household history and public links.
- Implement one atomic deletion policy preserving co-members' agreed data and removing attribution where appropriate.
- Export actually retained personal information and accurate linkage; explain unknown legacy contribution provenance. Never assign unrecorded ownership or infer contributors' quantities from merged totals.
- Reconcile known duplicates/invalid records before constraints; quarantine/report uncertain cases rather than silently discard data.
- Coordinate deletion/revocation retention required for recovery; no credential/token values in export.
**Acceptance:** representative migrated PostgreSQL fixtures cover current/former/last-member households, unknown attribution, favorites, plans, retries and injected failure. Shared content remains consistent; old tokens/owned links cannot resurrect access.

### LP13 — Recovery email and account support

**Owner:** backend; frontend account integration in LP23; DevOps mail configuration.
**Depends:** ADR-A, Q06; exact public sender/origin at Q11.
- Build non-enumerating reset/request responses, random hashed expiring single-use tokens and validated trusted-origin links.
- Test replay, expiry, throttling, concurrent use, verification policy, email-provider failure and no token leakage in logs/referrers.
- Apply agreed session invalidation after reset; avoid automatic login through a recovery side effect unless separately justified.
- Use a fake mail sink in CI/staging; verify real delivery only with explicitly approved test addresses. Document sender-domain authentication/deliverability and support recovery procedure.
**Acceptance:** a user can recover access securely; email failure is visible/supportable; destructive actions have the agreed reauthentication path. Operational mail delivery is an eventual release gate, not something mock tests prove.

### LP14 — Production configuration and service boundaries

**Owner:** backend changes `app.py`; DevOps provides configuration/runbooks.
**Depends:** LP01, ADR-A/E.
- Reject missing production database/secret configuration; keep development SQLite explicit only.
- Define trusted proxy hops/hosts, HTTPS/security headers, CORS, body/request limits and private-response cache headers for the selected topology.
- Add meaningful liveness/readiness without exposing internals; distinguish database failure from an SPA HTML 200.
- Restrict staging and avoid indexing/demo exposure; robots directives are not access control.
- Define behavior for unavailable/deferred endpoints and unknown routes, including direct API requests.
**Acceptance:** bad production config fails closed; probes detect relevant failures; no private caching or staging leakage; existing-user continuity follows the approved matrix.

**G2:** backend/security/QA accept integrated foundations. Pure presentation work may develop earlier against agreed contracts; real account-dependent acceptance waits for these results.

## 8. Wave 2 — integrate the welcoming product

### LP20 — Shared UI shell and responsive primitives

**Owner:** frontend. **Depends:** LP00, ADR-C/D.
- Port approved cream/oat/blue tokens, typography, compact navigation and progressive disclosure into React; self-host cleared fonts.
- Create a small shared set of accessible fields, buttons, dialog/sheet, list/card and async-state patterns.
- Keep one controller/state model for phone tabs and desktop columns; preserve existing routes/deep links or document redirects.
- Implement focus restoration, safe-area layout, target sizes, semantic labels and reduced-motion behavior.
**Acceptance:** EN/DE and both themes at 320/390/768/1280 widths, no horizontal page overflow, large text and keyboard navigation. No dashboard/features added merely to fill space.

### LP21 — Discovery and recipe presentation

**Owner:** frontend, backend only for an approved narrow query contract. **Depends:** LP20.
- Wire approved discovery/ingredient entry points to real data; cancel/discard stale search/language results.
- Port concise recipe header, image/disclosure treatment, equipment section and ingredients/method access.
- Desktop keeps ingredients left; phone keeps the agreed switch/jump control available.
- Preserve per-attempt recipe/tier/language/servings identity; do not imply component substitution works where production content/contracts do not support it.
- Use labeled native checklist controls, meaningful image alternatives and loading/empty/error states.
**Acceptance:** representative real recipes and unavailable/missing-language states behave correctly. Present the first wired slice for Q09 before broadening the port.

### LP22 — Cooking state and timing correctness

**Owner:** frontend. **Depends:** LP20/21, ADR-C; backend changes only through owner.
- Represent running timers with a deadline; paused timers retain explicit remaining duration. Define clock-change handling and reconciliation.
- Persist against exact account/guest namespace and attempt; Next/Back does not silently discard an active timer. Cancel/restart is deliberate.
- Restore step/help/timer/form behavior according to the transition table. Preserve lesson snapshots and legacy no-snapshot paths.
- Reacquire wake lock where supported after visibility returns; handle denial gracefully. Guard all stale async success/failure paths.
- Keep ambiguous saves distinguishable from definite rejection; preserve mutation identity/payload for retry and reconciliation. Optional reflection remains optional.
**Acceptance:** unit tests with delayed callbacks/clock changes; refresh/background/account/attempt transitions; target remaining-time reconciliation within one displayed second once rendering resumes. Physical alarm behavior is verified separately; no locked-phone alarm promise from a JavaScript interval.

### LP23 — Account/history/settings integration

**Owner:** frontend; consumes LP11–13. **Depends:** LP20, agreed API contracts.
- Wire registration/login/recovery/verification/logout/session expiry with persistent labels, pending states and recoverable input.
- Preserve history corrections, independently editable confidence, optional unanswered values and visible revision conflicts.
- Wire truthful export/deletion/retention messaging and error/retry behavior.
- Correct stale XP/streak/privacy copy, provider data-flow statements, AI/image/creator claims and support links.
**Acceptance:** keyboard and screen-reader journey; expired/reset/deleted account transitions; no previous account data or stale form results; current/history confidence semantics retained.

### LP24 — PWA caches, assets and safe updates

**Owner:** frontend; security reviews eligibility, DevOps coordinates release.
**Depends:** ADR-A/C/E, LP20.
- Cache only successful explicitly public responses/assets; provide deliberate offline/error fallbacks.
- Validate authentication under the selected transport across worker, HTTP and proxy caches; preserve private/entitlement boundaries.
- Version owned caches/assets, retain compatible previous assets, and clean only this application's cache namespace.
- Define update availability and safe activation without losing a live cook; handle many-versions-old clients, not just A→B.
- Check manifest scope/start URL, icons, install presentation and origin-local storage failure.
**Acceptance:** worker-enabled tests with 500s/offline/missing assets/account switching and active attempts across releases. No test harness setting that disables the worker may be cited as worker acceptance.

## 9. Mandatory X track — full production planning/events/shopping

The user's Q02 decision replaces the reduced P option. Implement [planning-production-track.md](planning-production-track.md) as part of the first web release, not a future optional extension.

That specification contains PX01–PX20 parity/regression oracles; proposed relational ownership/schema; a versioned authored component catalog; transactional commands with idempotency/revision fencing; exact destructive previews and bounded inverse undo; independent scoped source coverage, extras and partial check-offs; and legacy/lifecycle/recovery requirements.

### X delivery sequence

| Package | Primary owner | Main dependencies | Review outcome |
|---|---|---|---|
| X0 — Parity/ownership/contracts | Backend + frontend/security/QA | LP00–02, Q03/Q07/Q08 | G1-ready ADR-X, finite catalog map and acceptance matrix |
| X1 — Schema/command foundation | Backend integrator | X0, LP10/11 contracts/test harness | Authorized atomic revisioned/idempotent commands, previews/undo and migrations |
| X2 — Versioned planning catalog | Backend/content | X1 | Stable identities, authored alternatives, authorized configured previews |
| X3 — Flexible plans and items | Backend plan leaf | X1/X2 contracts | Ordered meals/items, move/copy/repeat/date edits/templates |
| X4 — Events and shared links | Backend event leaf | X1/X2 contracts | Guest overrides, menus/tasks, live links and cross-plan operations |
| X5 — Derived scoped shopping | Backend calculation leaf | X2–X4 contracts | Scopes, source quantities, event deduplication, units/extras/personal items |
| X6 — Coverage/reconciliation | Backend mutation leaf | X5 | Partial source have/bought, Check all, sticky review and seasoning behavior |
| X7 — Real plan/event interface | Frontend planning leaf | LP20, X1–X4 contracts | Full compact editor/preview workflows through real APIs |
| X8 — Real shopping interface | Frontend shopping leaf | LP20, X5/6 contracts | Four views/date selection, source/total columns and recoverable edits |
| X9 — Legacy/lifecycle/cutover | Backend/security/DevOps | Q03/Q07, X schemas | Truthful preservation, one authoritative writer, full export/deletion and recovery |
| X10 — Integrated parity proof | QA/all owners | X1–X9 integrated | Every PX row passes on the actual candidate |

Separate leaf modules can run in parallel after contract freeze; one owner integrates models/migrations and another shared frontend state/routes. X7/X8 may develop against fixtures earlier, but fixtures never satisfy integration acceptance.

## 10. Existing planner compatibility and X sign-off

Known defects in older grocery/household routes still need resolution or an explicitly approved server-enforced boundary. X is not permission to abandon existing users/data or hide vulnerable endpoints.

- LP11–14 cover common authentication, validation, lifecycle and exposure boundaries.
- X9 assigns each legacy plan/list/link API a preserved, adapted, read-only or retired role under Q03/Q07. No automatic destructive conversion or silent dual-write.
- Recheck membership/ownership/current content access at read and derived-output time.
- Resolve duplicate lists safely before uniqueness enforcement; keep unknown merged contribution provenance truthful.
- Any exposed invitation/public-link behavior requires explicit revocation, member removal, identity minimization and deletion tests. Deferring collaboration does not make exposed sharing endpoints safe.
- Designate a recovery artifact able to use new X records. A literal old backend is not an acceptable rollback just because migrations are additive.

**G1 condition:** ADR-X decisions, approved ownership/content/legacy policy, feasible test/recovery route and complete PX matrix. **G3 condition:** wired core and full X interactions accepted. **G4 condition:** all mandatory X and release evidence passes.

Packs/Use the rest, shared preparation, leftovers, personal recipe authoring, automatic network generation and currently unimplemented guided cooking from a configured planned item remain outside prototype parity. Preserve selected recipe previews and the existing standalone cook path without silently discarding component choices.

## 11. Wave 3 — publishing, operations and integrated candidate

### LP40 — Content validation and controlled publishing

**Owner:** backend controls sync boundaries; DevOps orchestration; creator approves content.
**Depends:** ADR-E, LP10; Q10 before approving changed culinary content.
- Inventory finite release recipes/lessons/images and X2 planning catalog/variant revisions with their verification/license states.
- Validate complete bilingual recipes/lesson/skill links and authored planning ingredient/component-preview mappings before activation; do not publish earlier groups and discover a late invalid link without a recovery plan.
- Serialize release/publishing operations and define atomic content activation or an explicitly safe maintenance/compatibility alternative.
- Keep migrations separate from content transaction expectations; retain immutable prior snapshots.
- Correct the Basic pot/pan/parallel-sequential contradiction only after culinary approval, then align metadata/time/lesson references.
**Acceptance:** full sync sequence and deliberate late failure/rerun on fresh/populated PostgreSQL; no rewrites of old cook content; changed content digest/capture semantics remain correct.

### LP41 — Deployable artifact, domain/email cutover, restore and observability

**Owner:** DevOps; backend/frontend changes through owners. **Depends:** LP14/24/40, Q04/11/12.
- Build once and promote the identified artifact; record runtime/dependency/content/migration identities, configuration difference and rollout steps.
- Define canonical origin, old redirects/link behavior, account reauthentication and installed-web-app guidance. Server accounts retain identities; local storage does not follow redirects.
- Apply the approved browser-local preservation/export/re-entry policy; never migrate guests into accounts automatically.
- Configure restricted staging, least-privilege credentials, HTTPS/proxy, dependency health, logs/error tracking and synthetic uptime checks without excess personal data.
- Confirm sender-domain authentication, delivery/bounces, support contact, provider processors/retention, backups and credential/signing custody.
- Restore into isolation, validate integrity and reapply required deletion/revocation decisions before traffic; test defined recovery build reading **and writing** candidate-created records.
- Measure resource/load/latency/cost and alert delivery; define actionable runbooks, not merely installed monitoring software.
**Acceptance:** recorded restore time/data-loss window, real alert received by approved recipient, safe test-origin cutover, rollback/forward-fix evidence, no stale revoked access. No real provisioning or cutover without explicit authorization.

## 12. Conditional N track — Android/iOS stores

**N0 — Feasibility before channel architecture sign-off.** Confirm account type/identity, required tools/devices/Mac access, minimum-functionality review risk and native session/storage model. A bounded React-container spike must cover API origin/auth, suspend/resume/timer, safe areas/Back, export/deep links and permission denial. Compare alternatives only if that spike fails or requirements demand them.

**N1 — Native projects and release builds, after core contracts.** One owner for each platform configuration/signing; shared React/API remains common. Build reproducibly, keep secrets out of repo/logs, configure app identity/privacy manifests/required-reason APIs and minimum permissions. Test real package behavior, not just a mobile browser. Signing credentials/accounts belong to the user.

**N2 — Beta and store readiness, after integrated product/security/content acceptance.** Use approved tester accounts and actual signed candidates. Verify current SDK/target rules, privacy/Data safety/deletion URLs, support/age/content declarations, screenshots and reviewer access. Google new-personal-account testing requirements can add mandatory elapsed time; user recruitment approval is separate.

**N3 — Submission/release only at G5.** User authorizes store submission and publishing settings. First publication and staged/phased updates are different; do not assume update rollout tools apply to initial launch. Review rejection or required changes reopens affected gates without weakening them.

Web/PWA is confirmed first, so N remains deferred; do not install native tooling or enroll/purchase accounts automatically. See [dated platform requirements](platform-requirements.md) and [release guidance](release-guidance.md); recheck at submission.

## 13. Wave 4 — prove the integrated release

### LP50 — Automated, device and operational evidence

**Owner:** QA; implementers resolve findings. **Depends:** all selected code tracks integrated.
- Run all existing applicable tests plus the full contract/negative/concurrency matrix.
- Run production build/full release sync on disposable PostgreSQL, fresh and representative populated history.
- Verify account deletion/export with all relationships and unknown provenance; reset/revoke/share/member/entitlement transitions.
- Exercise physical iPhone Safari/home-screen web app and Android Chrome/installed web app; desktop keyboard/resizing. Native packages belong to later N acceptance.
- Cover 320/390/768/1280 layouts, EN/DE/light/dark, 200% text/zoom where applicable, focus/semantics/screen readers, slow/interrupted network, denied storage/wake lock, back/reload, app switch/lock and old/new client updates.
- Test modest realistic load, email/DB failures and recovery; preserve evidence of rejected/ambiguous writes and retry outcomes.
**Acceptance:** every exposed core journey and mandatory gate has candidate-specific pass evidence; blocked and untested remain visible. No weakening foreign keys or disabling the worker to manufacture a pass.

### LP51 — Human/content/visual acceptance and candidate review

**Owner:** user/culinary reviewer + QA/security/DevOps.
- Present actual wired screens and short scenario results, unresolved defects and risk owners.
- Verify finite recipe/image claims and the agreed cooking promise; remove or withhold unverified content only through the approved scope policy.
- After engineering/culinary acceptance, seek Q13 approval for 1–2 beginner observations and a bounded beta. Keep usability observations distinct from store-testing obligations.
- Reconcile feedback into must-fix vs later; avoid adding unrelated features.
**Acceptance:** G4 signed for exact artifact/scope; no unresolved blocking defect or required environmental evidence.

## 14. Evidence matrix and release criteria

| Gate evidence | Minimum scenarios | Owner |
|---|---|---|
| Identity/privacy | Malformed inputs, reset replay/expiry/throttling, revoked/deleted user, export/delete all relationships, unknown attribution/co-members | Backend/security/QA |
| Persistence | Fresh/populated PostgreSQL, duplicate/invalid legacy data, synchronized concurrent writes, failure rollback, old-reader and old-writer compatibility | Backend/QA |
| Cooking | Guest/account attempts, snapshot immutability, lessons missing/error, timer deadline/pause/restart, ambiguous completion/reflection, phone interruption | Frontend/QA |
| Mandatory X parity | All PX01–PX20; plans/events/templates, exact preview/undo, independent scopes, partial coverage/extras, content access, concurrency and uncertain retries | Backend/frontend/QA |
| UI/accessibility | Actual wired routes, EN/DE/themes, phone/desktop, large text, keyboard/screen reader, focus/error/status feedback | Frontend/QA/user |
| Worker/update | Worker enabled, cached 500 prevention, public/private eligibility, account switch, old assets, active cook A→B and older client | Frontend/security/QA |
| Operations | Bad-config rejection, DB-aware readiness, restricted staging, delivery/alerts, full sync failure/recovery, isolated restore with revocations | DevOps/backend/QA |
| Domain/platform | Old/new links, origin-local state policy, reauthentication, physical installed apps; signed packages/store checklists if N | DevOps/frontend/QA |
| Content | Equipment/sequence/time consistency, lesson links, EN/DE, approved image/license/AI/creator claims | Creator/authorized reviewer |

Each evidence row records task/requirement, exact code commit plus diff identity, content revision, artifact hash, environment/config, synthetic fixture, device/OS/browser or command, result, timestamp, reviewer and limitations. Status is pass/fail/blocked/untested/not-applicable with rationale. Protect/redact and time-limit evidence retention.

### Proposed measurable quality bar

- Zero unresolved critical/high issues involving account exposure, loss/corruption, uncontrolled duplicate purchases, unrecoverable core journeys or misleading cooking behavior.
- All selected guest/account core flows pass; no successful UI state without confirmed save or explicitly marked uncertainty.
- WCAG 2.2 AA engineering target for the selected web flows, combining automated/manual checks; no conformance/legal certification from a color test.
- Practical compact controls retain accessible touch areas; platform-specific native target guidance is checked separately.
- Timer reconciliation target: within one displayed second after rendering resumes; locked-alarm delivery is a separate agreed/tested capability.
- Reference performance goals: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at mobile/desktop field p75. Before sufficient traffic, report lab device/network scenarios as proxies, not field compliance. Freeze an achievable prelaunch budget before G4.
- Q12 freezes numeric load/error/latency, backup data-loss and recovery-time targets using staging measurements. No fabricated 99.9% promise or arbitrary “1000 concurrent users” requirement.
- No release while required PostgreSQL, real-device, email, culinary or recovery evidence is blocked.
- Lower-severity accepted issues have a documented user impact, workaround, owner, due date and recheck trigger.

Guidance: [W3C](https://www.w3.org/WAI/standards-guidelines/wcag/), [Web Vitals](https://web.dev/articles/vitals), [Android quality](https://developer.android.com/docs/quality-guidelines/core-app-quality). These are chosen engineering targets, not blanket legal/store guarantees.

## 15. Wave 5 — controlled release and aftercare

### LP60 — Authorized release, stop rules and follow-up

**Owner:** DevOps/operator with user authorization Q14; QA validates.
1. Confirm exact candidate/artifact, backups/deletion ledger, operator availability, support contact and tested recovery path.
2. Perform only explicitly authorized commit/push/deploy/domain/store actions. Use a bounded beta/audience before broad promotion where selected.
3. Smoke-test real allowed endpoints and approved synthetic accounts; do not use customer personal data as a test fixture.
4. Observe agreed error/latency/readiness, core synthetic journeys, email/support failures and resource/cost limits.
5. Stop/hold rollout immediately for cross-account disclosure, data corruption/loss, destructive recovery failure, invalid cooking promise or materially wrong content. Also stop for the pre-agreed sustained operational thresholds.
6. Roll back only to the demonstrated compatible recovery artifact, or use approved forward recovery. Halting a rollout does not remove installed updates. Do not restore a database casually or reactivate deleted users.
7. Resume only after affected gates pass and the operator/user authorizes the change.
8. Review the agreed initial observation window (proposed 48 hours of launch attention and a seven-day support review, adjustable to capacity), then choose the next increment at Q15.

This document schedules no automation and promises no unattended monitoring. Any recurring checks, invitations, alerts to external recipients or future autonomous work require the appropriate explicit authorization.

## 16. Chairman decisions and deliberately rejected shortcuts

### Evaluation of the five seats

| Seat | Evidence adopted and effect on this plan | Limitation / unresolved point |
|---|---|---|
| Frontend / UX | Correctly separated working HTML prototype from wired React; retained exact compact editing/shopping behavior and cook-attempt isolation in X7/X8 | Visual parity is not API or physical-device acceptance; configured cooking handoff is not current parity |
| Backend / data | Identified new domain/source identities, transactions and legacy ownership gaps; drove X1–X6/X9 and the authored catalog contract | Proposed schema/revision/undo design still needs ADR-X review and PostgreSQL evidence |
| Security / privacy | Traced indirect access, deletion, ownership and cookie/cache consequences; strengthened LP11–14 and all X commands | No security certification or legal sign-off; Q07/Q08 policy and current content-access rules remain binding |
| DevOps / reliability | Distinguished build success from deployable/recoverable service; added old-writer, content activation, origin and operating gates | No suitable PostgreSQL engine, hosting configuration or physical-device route was proven by the review |
| QA / testing | Converted current prototype behavior into falsifiable parity invariants and challenged stale undo/coverage/legacy assumptions | Scenario specification and old test passes are not candidate-specific execution evidence |

All five completed independent review, cross-review and one targeted scope update. Their earlier smaller-release proposals do not override Q02. No unresolved reviewer concern is waived by majority agreement; unresolved policy, environment and content issues remain gated below.

### Decision ledger

| Question / alternatives | Evidence and chairman recommendation | Status / approval |
|---|---|---|
| Reduced planner repair vs full prototype integration | Existing APIs lack the current dated/grouped/event/source model; implement mandatory X0–X10 | Full scope **user-confirmed** Q02 |
| Whole-draft replacement vs bounded server commands | Prototype replacement is browser-local; server accounts need authorization, retry and conflict fences. Recommend atomic commands with a conservative planning-workspace revision | Engineering proposal; ADR-X before G1 |
| Fine-grained merge vs conservative revision conflicts | Cross-plan links and destructive previews make omitted dependencies dangerous. Start with explicit conflicts, not automatic merge; refine only with evidence | Engineering trade-off, not a promise of real-time collaboration |
| Personal vs household planning authority | Prototype owner means plan/event, not account identity. Recommend private account planning with existing household continuity separately defined | User Q08 pending; preserve existing data under Q03/Q07 |
| Reconstruct legacy contributors vs preserve unknown provenance | Current aggregate rows can lack attribution and per-source quantities. Preserve truthful legacy records; reviewed conversion only where facts support it | Q03/Q07 and X9 contract pending |
| Current mutable variants vs authored versioned catalog | Demo sauce alternatives have no equivalent general production component contract. Pin finite authored configurations; apply current access checks; never silently alter a cook | ADR-X/X2 proposal; culinary acceptance at Q10 |
| Literal old backend rollback vs compatible recovery build | Old code may not understand new X records. Require recovery reads and writes after candidate-created data, or an explicitly approved safe maintenance/forward-recovery strategy | ADR-E/X9 before G1; executed proof before G4 |
| Plan approval vs release proof | Contracts and feasible verification enable implementation; actual tests and human/environment acceptance enable release | Separate G1, G4 and G5; no automatic implementation/publication |

- **Accepted:** one stack, shared phone/desktop state, bounded welcoming port, existing teaching integrity and optional guest/account model.
- **Accepted:** backend owns `app.py`/models/migrations; frontend owns auth client/state/worker; DevOps supplies topology/release requirements. The council tightened this after identifying overlapping ownership.
- **Corrected:** “complete export” means accurate disclosure of what is retained, not invented historical contributor identity. Unknown merged provenance is a contract issue.
- **Corrected:** recovery includes designated compatible backend **writes** after candidate writes and deletion/revocation continuity; additive migration or old-reader success alone is insufficient. Pre-X code may need a compatible recovery build.
- **Corrected:** a cookie migration changes worker/HTTP cache and CSRF assumptions. It is a reviewed architecture decision, not an isolated security patch.
- **Rejected:** publishing the demo as if it were the real app; hiding unsafe tabs while APIs remain exposed; full native rewrite without evidence; automatic old-data cleanup; privacy promises based solely on European hosting; green SQLite tests as PostgreSQL proof.
- **Confirmed:** first release is phone-first web/PWA with full approved planning/event/shopping parity; stores later. Five targeted reviews informed mandatory X0–X10, replacing the reduced P proposal.
- **Pending:** Q03 user/data inventory; Q06–08 account/ownership/legacy policy; authored component mapping and API/recovery contracts before G1. Native tool choice, exact host/domain/mail, monetary commitments and release authority stay at their later checkpoints.
- **No fake consensus:** all five seats supplied reports; same-model cross-review is helpful but not a substitute for tests or independent human/security/legal/culinary review where appropriate.

Traceability to assessment: account findings → LP11–13; full planning/shopping/data → X0–X10, legacy exposure → LP11–14/X9; phone UI/timers → LP20–24; release/worker/database → LP10/14/24/40/41; content/device gaps → LP50/51; platform readiness → N; operational launch → LP60.

## 17. Definition of done and next action

A work package is done only when its changes are integrated into the identified candidate, accepted tests pass, relevant user decision is recorded, reviewer findings are resolved, docs/contracts are updated, and compatibility/recovery consequences are explicit.

The launch is done only when G4/G5/G6 are satisfied for the selected scope—not because all agents stopped, a build passed, or a store accepted an upload.

**Next action:** answer Q03 (Q01/Q02 confirmed), then authorize LP00–LP02 and X0 preflight plus the necessary bounded environment investigation. Settle Q06–Q08 when designing ownership/auth/legacy contracts. Use that evidence to sign the implementation contract before dispatching feature/fix writers.

Suggested commit message: `docs(plan): add phased launch implementation and decision gates`.
