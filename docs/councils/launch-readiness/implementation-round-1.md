# Implementation-plan challenge — independent reports

2026-09-13. Five same-model specialist contexts, not independent humans. Planning/source inspection only; no fresh tests. Roles and agent IDs retained for traceability.

## Frontend / UX

Agent: `01a09a92-0284-7060-8377-76230bb7d175`.

Frontend / UX round one: recommend a bounded port of the approved welcoming design into React, with shared cooking state and explicit recovery behavior. Channel and feature breadth remain pending. Guests, optional teaching and no XP remain approved principles.

1. **Map and port the approved screens.** After screen-scope agreement, map each prototype interaction to an existing route, API and entitlement. Likely ownership: `frontend/src/App.jsx`, `components/BottomNav.jsx`, `pages/Home.jsx`, `pages/RecipePage.jsx`, `index.css` and locales. Preserve the approved visual direction; frontend-design guidance supports fidelity here. Produce a screen/action inventory and reference-to-React visual comparisons. Acceptance: every exposed action completes a real flow; guest Basic cooking remains reachable. Production routes already distinguish guest cooking and protected features ([App.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/App.jsx:26)).

2. **Establish shared state and accessible responsive boundaries.** Keep phone tabs and desktop columns as presentations of one controller. Own discovery request ordering, selected recipe/servings/preparation state, labeled controls and focus restoration. Dependencies: recipe identity, language and entitlement contracts. Current discovery accepts whichever response finishes last, and preparation rows are clickable list items ([Home.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/Home.jsx:118), [RecipePage.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/RecipePage.jsx:239)). Acceptance artifacts: delayed-response scenarios, keyboard/screen-reader walkthrough, and EN/DE screenshots at 320/390/768/1280 widths, large text and both themes. Resizing must preserve state.

3. **Define and implement the phone cooking lifecycle.** Likely paths: `CookMode.jsx`, `store/cookSession.js`, and a bounded timer controller. Agree deadline, pause, cancel, navigation, restart and restoration semantics before changing persistence. The current timer counts callbacks and clears on step navigation ([CookMode.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/CookMode.jsx:153)); existing attempt storage separates guest/account identities and pins snapshots. Preserve those boundaries. Acceptance: refresh/resume, navigation, account switching, denied wake lock and unavailable storage produce deliberate outcomes. Deadline accuracy and background alarm delivery require separate acceptance.

4. **Integrate truthful network and account recovery.** Coordinate API clients, account/settings pages, locales and `frontend/public/sw.js` with backend/security. Show pending, rejected and uncertain outcomes distinctly; preserve recoverable input. Shopping/planning screens enter this package only if selected: current grocery input clears before success ([GroceryPage.jsx](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/GroceryPage.jsx:62)). Artifacts: agreed error-state matrix, retry/reconciliation scenarios and service-worker-enabled two-release evidence. Personal data remains outside shared caches.

Presentation work and lifecycle work can proceed in parallel after contracts settle; backend account work can proceed alongside them. Assign one frontend integration owner for routes, shared state, tokens and worker updates. Backend owns API/schema migrations; frontend persistence changes require explicit old-reader compatibility review.

The user should answer channel and launch breadth now. My proposed defaults are web/PWA and cooking/accounts first, with accounts gated by lifecycle acceptance; unanswered choices remain pending and prevent final scope sign-off. Before affected work, settle exact screens, offline/timer promises and existing-user access. Recommend online-first recovery and return-time timer reconciliation; do not make either a release promise without agreement.

Before plan sign-off, bound the remaining investigation to a screen/API mapping, cooking transition table, storage compatibility review and parent-owned platform feasibility research. Actual device behavior, accessibility, visual fidelity and update recovery remain release evidence. Existing green checks do not establish these outcomes.

One practical concern: an update arriving mid-cook. Define a safe update handoff that preserves the attempt and avoids missing assets; current worker installation immediately calls `skipWaiting()`.

No implementation, tests or file writes performed.

---

## Backend / data

Agent: `01a09a92-041e-7583-bb9e-d287e0e1b39e`.

Backend/data round one: sequence identity and privacy contracts before dependent shopping writes. Keep channel and feature scope pending. Preserve guest access, optional teaching, no XP, and existing cooking snapshots/reflection revisions.

1. **Freeze identity, authorization and API contracts.** Backend owns the authenticated-user resolver, request validation, error codes and transaction boundaries; Security owns recovery, email ownership and revocation decisions. Likely paths: `routes/auth.py`, `app.py`, `access.py`, `models.py`. Agree contracts before frontend recovery/settings integration. Current [auth handlers](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:28) assume input types and issue tokens directly. Acceptance artifacts: endpoint/permission matrix and contract cases covering malformed requests, deleted accounts, revoked sessions, account switching and unchanged guest entitlements.

2. **Complete export/deletion and shared-data lifecycle.** Depend on the identity contract and an approved retention policy. Own `routes/auth.py`, relevant models and migrations. [Export](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:91) scopes contributions through current membership; deletion omits favorites and owned named plans. Inventory every user reference, including former households, mutation records and public links. Proposed behavior: delete private records, revoke owned links, remove attribution from agreed retained shared records. Acceptance: synthetic PostgreSQL fixtures covering former/current households, last-member deletion, surviving co-members, complete export and atomic rollback on failure.

3. **Implement the selected shopping/planning boundary.** This package remains conditional. If included, own `routes/groceries.py`, `routes/meal_plans.py`, household access and shared models. Define strict recipe/tier/language/date/serving validation, selected-date builds, retry identity, deliberate repeated additions and edit conflicts. Enforce one list per household and serialize conflicting mutations or use equivalent database guarantees. Current [build-list](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:248) adds every dated entry again; [named-plan grocery application](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:124) relies on earlier entitlement checks. Acceptance: concurrent additions, lost-response retries, changed entitlements, revoked membership and missing content. If deferred, specify server enforcement and existing-user data support; hidden navigation is insufficient.

4. **Own migration and compatibility integration.** Backend owns one ordered migration stream; DevOps owns release orchestration. Likely paths: `models.py`, `migrations/`, content-sync scripts and release-contract documentation. Establish duplicate-list reconciliation and invalid legacy-row handling before adding constraints. Acceptance artifacts must cover fresh/populated PostgreSQL upgrades, interrupted publication/rerun, old clients reading candidate responses, and the rollback backend reading **and writing** candidate-created records. If compatibility fails, define a compatible recovery build or forward fix. Application rollback must not resurrect deleted accounts.

After contracts settle, frontend integration, lifecycle implementation, conditional shopping work and release-environment preparation can proceed in parallel. One backend integrator must arbitrate shared auth helpers, grocery merge helpers, route semantics and migrations.

Answer **now**: first channel and launch feature breadth. Recommended default is web/PWA with cooking/accounts, conditional on account acceptance; shopping remains a separate inclusion decision. No answer means these choices remain pending. **Before affected work:** approve shared-data retention and, if shopping ships, repeat-build/edit semantics. Recommend anonymized shared retention and explicit batch additions with retry keys; unanswered policy-dependent behavior cannot be finalized.

Before plan sign-off, bound investigation to the user-reference inventory, household transitions, migration chain, shared helper callers and a supplied disposable PostgreSQL verification path. Legacy-data prevalence and actual concurrent outcomes remain unknown. Runtime migration, concurrency, restore and old-reader evidence belongs to increment/release acceptance.

Overlooked concern: merged grocery rows are not reliable contribution history—[recipe merging](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:134) creates rows without `added_by`. Resolve truthful export/deletion semantics without implying recoverable provenance.

Source review only; no implementation, tests or writes performed.

---

## Security / privacy

Agent: `01a09a92-0775-7e91-b8ec-d26a9c601526`.

Round one — Security / privacy

Account launch needs an enforceable identity, recovery and deletion contract before implementation-plan sign-off. Channel and feature scope remain pending. Guests, optional teaching and no XP remain approved principles. Confidence is high in the inspected source gaps; deployment controls remain unverified.

1. Identity, sessions and recovery. Backend/security should own a threat model covering stolen tokens, credential guessing, mailbox takeover and account recovery. The client reads bearer tokens from [localStorage](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/api/client.js:6); [authentication](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:4) explicitly defers recovery/verification. Resolve token storage, expiry, server revocation, email ownership, recent authentication for deletion, bounded inputs and abuse controls together. Likely paths: `app.py`, `routes/auth.py`, `models.py`, auth store/client and account screens. Acceptance artifacts: session decision record and negative-case matrix covering reset-token replay, enumeration, throttling, revoked/deleted users and account switching. Dependency: channel/origin contract and email delivery ownership.

2. Complete privacy lifecycle. Backend owns the data inventory, export/delete transaction and migrations; security reviews ownership and retention. [Current export](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:95) follows only current membership, corroborating the assessment’s former-household gap. Inventory private records, shared contributions, links, browser state, logs and backups. Proposed policy: delete private records, remove attribution from agreed retained shared records, revoke owned links and preserve co-member data; approval remains pending. Likely paths: auth routes, models/migrations, Settings and EN/DE locales. Acceptance: migrated PostgreSQL fixtures demonstrate complete export, atomic deletion failure, surviving co-member data and denied stale access. Rollback must preserve deletion and revocation semantics.

3. Conditional sharing and derived-access gates. If sharing ships, define explicit publication, displayed identity, invite rotation, member removal and link revocation. The [public response](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:245) exposes the owner’s display name and plan name; secrecy of the URL alone is insufficient lifecycle control. Recheck current entitlement when generating groceries: [this route](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/meal_plans.py:124) relies on earlier authorization. Likely paths: meal-plan/grocery routes, `access.py`, models and sharing UI. Acceptance: cross-account, removed-member, revoked-link and downgraded-entitlement cases. If deferred, test an approved server boundary against direct requests and legacy links.

4. Browser and operational privacy. Frontend/DevOps can prepare cache, data-flow and operational controls concurrently. Preserve private API exclusions, cache only successful eligible responses, self-host fonts and align disclosures with actual processors. Likely paths: service worker, frontend index/locales, `app.py`, CI and release documentation. Acceptance: enabled-worker account-switch/update evidence, HTTP-cache checks, synthetic log-redaction evidence and an operator permission/rotation checklist. Include reset/share URLs in redaction. Cookie-based sessions would require reconsidering worker eligibility because the existing authenticated-request check uses the `Authorization` header.

One backend integration owner must control identity contracts, shared authorization helpers and migration ordering. Frontend account UX, privacy-copy drafts and operational inventories can proceed against reviewed contracts.

The user should answer channel and feature breadth now. Recommended defaults are web/PWA first and bounded cooking/accounts, conditional on security acceptance; no answer leaves both pending. Before affected work, settle shared-data retention, email ownership policy and support responsibility. Recommend verified email before sharing; this remains a proposal.

Before plan sign-off, bound investigation to session alternatives, route/data inventory, deployment origins/proxy assumptions and email delivery options. Parent owns current official-source research. Actual PostgreSQL, email, cache and device evidence belongs to release acceptance; none was executed here.

An overlooked release concern is backup restoration resurrecting deleted accounts or revoked links. Require a restore procedure that reapplies deletion/revocation records before traffic resumes.

---

## DevOps / reliability

Agent: `01a09a92-0ac3-7b31-851a-8a5a50ea0674`.

The release plan needs an explicit operational contract before sign-off. Hosting, the deployed revision and recovery facilities remain unknown; repository configuration does not establish production behavior. Channel and feature scope remain **pending**. This round used read-only document/source inspection; no tests or changes were performed.

1. **Reproducible candidate, CI and isolated staging.** DevOps owns runtime/build configuration, CI and environment documentation; backend owns application configuration changes. Likely paths: `runtime.txt`, package manifests/lockfile, `requirements.txt`, `app.py`, and new CI configuration. Production currently permits SQLite fallback ([app.py:37](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:37)); the root build uses `npm install` despite an existing frontend lockfile ([package.json:4](D:/Projects/cookbook/.worktrees/teaching-hardening/package.json:4)). Depend on an identified candidate and disposable PostgreSQL arrangement. Acceptance artifacts: recorded dependency/runtime versions, repeatable artifact identity, configuration rejection checks, isolated regression results, and fresh/populated PostgreSQL migration evidence. Promote the accepted artifact without rebuilding it for production.

2. **Controlled migration and content publishing.** DevOps owns release orchestration; one backend integration owner owns migration ordering and sync transaction boundaries. Likely paths: `Procfile`, `scripts/sync_*.py`, `migrations/`, release documentation. The release command serially migrates and publishes four content groups ([Procfile:2](D:/Projects/cookbook/.worktrees/teaching-hardening/Procfile:2)); existing verification records independent commits. Specify whole-content prevalidation, release serialization, partial-failure behavior and safe reruns before implementation. Acceptance artifacts: successful fresh/populated rehearsals, an injected late failure, recovery/rerun results, and the previous backend reading candidate-written records. Culinary approval remains a separate publishing prerequisite. A failed release must not automatically trigger a destructive database downgrade.

3. **Client updates and domain transition.** DevOps owns DNS/TLS/proxy/origin configuration; frontend owns worker behavior against a jointly agreed compatibility contract. Likely paths: `app.py`, `frontend/public/sw.js`, manifest/build configuration and deployment documentation. The worker caches responses without checking success ([sw.js:72](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/public/sw.js:72)); application CORS and proxy trust also require topology-specific configuration. Acceptance artifacts: installed release A→B update evidence, offline/error recovery, old-tab asset availability and account isolation. If the origin changes, explicitly handle existing bookmarks, share/recovery links, installed applications and browser-local sessions; do not assume redirects transfer local state.

4. **Restore, monitoring and conditional store delivery.** DevOps owns operating runbooks and release inventory, with security reviewing permissions/redaction and QA recording evidence. Depend on the selected provider, support owner and recovery objectives. Acceptance artifacts: isolated restore with integrity checks and measured recovery, actionable readiness/error alerts, verified alert delivery, and documented rollout stop/recovery criteria. Reconcile deletion obligations before restored data becomes accessible. Store delivery remains conditional: establish account ownership, build/signing access, beta distribution and support responsibilities before packaging. Parent-owned research must resolve current platform/toolchain requirements; no provider purchase or enrollment is presumed.

Environment/CI work, content prevalidation design and operational inventory can proceed in parallel. Migration sequencing, release activation, canonical origins and shared client/API compatibility require named owners; parallel teams must not independently redefine them.

Ask **now** for channel, feature exposure, existing hosting/domain obligations, spending ceiling and operational owner. Recommended defaults are web/PWA first, isolated staging and a small supported operating footprint—all proposals. No answer leaves affected scope and commitments pending. Ask before configuration or packaging for exact recovery targets, alert destination, domain cutover and signing custody.

Before plan sign-off, bound investigation to sanitized deployment inventory, candidate/deployment mapping, disposable PostgreSQL availability and release-failure semantics. Actual restore, update, alert and device results belong to release acceptance.

An easily overlooked concern is staging discoverability: staging currently inherits permissive robots behavior ([app.py:150](D:/Projects/cookbook/.worktrees/teaching-hardening/app.py:150)). Specify access restrictions and indexing prevention; robots directives alone do not protect it.

---

## QA / testing

Agent: `01a09a92-0d99-7750-ad70-d0a7b8f70d9e`.

Round-one QA recommendation: distinguish plan approval, increment completion, and release approval. The [verification record](D:/Projects/cookbook/.worktrees/teaching-hardening/docs/councils/launch-readiness/verification.md) reports 45 backend tests, four frontend scripts, and a successful build; these establish a baseline, not launch acceptance. No tests or writes were performed for this report.

1. **Acceptance contract and evidence ledger.** Dependency: product decisions and identified candidate. QA owns proposed acceptance documents under `docs/councils/launch-readiness/`. Map each exposed journey and API boundary to an invariant, scenario, expected result, owner, and evidence. Record candidate revision **plus uncommitted-diff identity**, content revision, environment, command/device, result, and limitations. Distinguish passed, failed, blocked, and untested. Plan sign-off requires settled product promises, agreed acceptance criteria, and a feasible verification route. Increment completion requires relevant integrated evidence; release approval requires all applicable gates against the assembled candidate.

2. **Isolated integration and persistence verification.** Dependencies: DevOps’ disposable PostgreSQL environment and backend-owned auth/data contracts. Likely paths: `tests/`, `tests/frontend/`, and shared fixture helpers. Define synthetic accounts spanning current/former households, favorites, plans, snapshots, and links. Acceptance artifacts must demonstrate complete export, atomic deletion failure recovery, preservation of co-member data, and denial through stale sessions/links. If shopping ships, test synchronized concurrent contributions, response loss after server commit, identical retries, deliberate repeat additions, invalid inputs, and selected-date boundaries. If deferred, test the approved server restriction directly. Isolation must fail closed for an unapproved database target and prevent real email delivery or dotenv leakage.

3. **Real-app journey and device acceptance.** Dependencies: agreed screen boundary, timer/offline contracts, and integrated React/API candidate. Likely paths: `tests/frontend/`, proposed browser tests, and device records under release documentation. Verify guest discovery → recipe → cooking → optional teaching/completion, plus account recovery and switching where exposed. Cover EN/DE, keyboard/screen-reader operation, large text, phone interruption, refresh, connectivity loss, and installed-worker updates. Proposed timer criterion: reconcile to the stored deadline within one displayed second after resume; this does not establish locked-phone alarm delivery. Capture physical-device versions and observed results. Require culinary approval of the finite bilingual release set and separately authorized beginner observations; passing automation cannot substitute for either.

4. **Release rehearsal and rollout decision.** Dependencies: integrated candidate and DevOps’ release/recovery procedure. QA owns evidence and acceptance; DevOps owns execution mechanics. Cover fresh/populated PostgreSQL upgrades, late content-sync failure, rerun, restored backup, and the previous backend reading candidate-written records. Exercise installed release A against B and the selected recovery path. Stop rollout for any cross-account disclosure, irreversible data loss, unrecoverable account access, materially wrong cooking instructions, or failed core journey without recovery. Agree numeric operational thresholds before rollout. Resume only after correction and affected-gate revalidation.

Packages 2 and 3 can develop scenarios in parallel; package 4’s rehearsal design can also start early. Assign one owner for migration ordering and persistent shapes, one for API/auth/error contracts, and one integration owner for shared routes and release artifacts.

**Decisions now:** channel and feature scope remain pending. Recommend web/PWA and cooking with optional accounts first, subject to lifecycle gates; silence leaves both choices unresolved. Set timer/offline promises before affected implementation, shared-data retention before deletion work, and device/support ownership before acceptance scheduling.

Confidence is high in the documented coverage gaps, low in environment availability and compatibility. Before plan sign-off, bound investigation to test-runner wiring, disposable PostgreSQL feasibility, supported devices, and old/new record contracts. Actual device, restore, and culinary results belong to release acceptance.

An overlooked release concern: migration failure logs and screenshots can expose synthetic credentials or account data. Define evidence redaction and retention alongside the ledger.
