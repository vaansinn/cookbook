# Cookbook launch-readiness assessment

Date: 2026-09-13. Chairman synthesis after five independent specialist reports and one cross-review round.

## Verdict

**Not ready for an unrestricted public account-based launch today. The existing architecture is a credible foundation; a rewrite is not justified.** A bounded, welcoming, phone-first release is achievable after specific reliability, privacy, content and deployment gates close.

This is not a percentage-complete estimate. Passing tests establish a useful baseline, but important exposed workflows are outside their coverage. The main obstacle is not a missing recipe editor: it is the gap between the polished prototype, the existing production application, and the operational evidence needed to support real users.

Reviewed `D:/Projects/cookbook/.worktrees/teaching-hardening`, branch `codex/teaching-pilot-hardening`, HEAD `5c60456` with pre-existing uncommitted work. Root main is older. Neither remote-main state nor the current deployed website was audited. All findings concern this working tree.

## 1. What actually exists

| Surface | Current evidence | Launch interpretation |
|---|---|---|
| Real web application | React/Vite frontend, Flask/SQLAlchemy backend, curated recipe pipeline, accounts, cooking/history/reflections, groceries and plans | Working foundation; identified defects and unverified release gates remain |
| Welcoming-kitchen preview | Separate HTML/JS design prototype; richer Explore, planning and shopping use separate demo/browser-local state | Approved design reference, not a production frontend/backend integration |
| Phone/PWA | Manifest, icons and service worker | Scaffolding exists; physical-device installation, lifecycle and update behavior not accepted |
| Android/iOS store apps | No native projects or signing/release pipeline found in inspected repository | A separate packaging, device-testing and store-review track, not ready |
| Desktop | Same browser application plus separate responsive prototypes | No separate desktop app needs to be built for browser use; current working-app UX still needs acceptance |
| Packaged desktop | No packaging pipeline found | Defer unless a concrete requirement emerges |

Production routing is in [App.jsx](../../../frontend/src/App.jsx#L53), not the prototype HTML. [PIPELINE.md](../../../PIPELINE.md#L8) explicitly keeps the mobile redesign under prototype work.

**Preserve:** the Flask/React stack, route/API/store separation, SQLAlchemy migrations, immutable cooking snapshots, revisioned reflection writes, account-scoped attempt state, bilingual content and optional learning. No microservices, Kubernetes, generalized plugin framework or wholesale native rewrite is warranted by this review.

**Improve extensibility locally:** share domain/controllers across phone and desktop, keep layout-specific components thin, define API input/error contracts, centralize accessible controls and design tokens, and add tests at real integration boundaries. Do not copy prototype storage into account-backed production workflows.

## 2. Council evaluation

| Seat | Chairman evaluation | Confidence and remaining limit |
|---|---|---|
| Frontend / UX | Strong concrete findings on false-success grocery edits, callback-counting timers, inaccessible checklist rows and stale search responses. Accept the proposed bounded design port; reject launching an unwanted old interface merely to minimize work. | High for inspected source behavior; no fresh device or visual acceptance |
| Backend / data | Strong findings on deletion/export relationships, missing grocery concurrency constraints, weak planner validation and non-idempotent list building. These concern current features, not hypothetical future scaling. | High for missing constraints/validation; actual concurrent outcomes and migrated PostgreSQL behavior untested |
| Security / privacy | Blocking account-launch verdict is upheld. Recovery, revocation, abuse controls, sharing lifecycle and truthful privacy statements need explicit treatment. No exploit or legal-compliance certification is claimed. | High for code/document gaps; edge controls and actual hosting/processors unknown |
| DevOps / reliability | Production SQLite fallback and unsuccessful-response caching are concrete issues. Partial release commits, rollback, restored backups and alerting are important operational gates. | High for inspected configuration; production infrastructure and incident behavior unverified |
| QA / testing | Fresh green baseline is valuable but concentrated on teaching/session code. Current household/planner breadth and real installed-phone behavior need their own acceptance tests. | High for reported executions; no fresh browser, physical-device or PostgreSQL acceptance |

Round-one “conditional” verdicts did not mean ready. Cross-review explicitly retained Security's blocker and narrowed the other verdicts. Frontend revised its initial willingness to defer the design: a bounded port should preserve the user's welcoming product direction.

No unresolved vote can waive data/privacy or release gates. Five same-model contexts can share blind spots; their agreement is not independent human certification.

Original evidence: [round 1](round-1.md), [cross-review](round-2.md), [verification](verification.md).

## 3. Findings that matter before release

### A. Ordinary accounts cannot yet rely on complete deletion/export

[Account handling](../../../routes/auth.py#L91) omits favorites, owned named meal plans and previous-household contributions. User foreign keys remain in [Favorite](../../../models.py#L216), [GroceryItem](../../../models.py#L282), [PlanEntry](../../../models.py#L304) and [MealPlan](../../../models.py#L321). Enforced constraints can reject deletion; export is incomplete regardless.

Define the entire personal-data inventory and retained shared-data policy. Delete private records and revoke owned public links; clear attribution on appropriately retained shared records without deleting another member's data. Exercise rollback if any stage fails. Include former households, not only the current membership.

### B. Account security and support lifecycle is unfinished

[Auth routes](../../../routes/auth.py#L4) defer recovery/verification, assume well-shaped JSON and have no visible application throttling. [JWT lifetime](../../../app.py#L51) is 30 days; client logout does not revoke a copied token. This is an exposure if a credential is compromised, not evidence of a demonstrated exploit.

Before open registration: bounded input validation, abuse controls, forgotten-password recovery, an explicit email-ownership policy, session expiry/revocation, and appropriate recent-authentication checks for destructive actions. Select the smallest coherent implementation, not a new identity platform by default. Verify all protected endpoints reject deleted/revoked accounts.

Privacy copy promises complete deletion/export and no third-party sharing while [Google-hosted fonts](../../../frontend/index.html#L12) make external browser requests. It also describes retired XP/streak behavior. Replace this with an accurate inventory, retention/support information and release-specific disclosures. Self-host fonts to simplify the boundary. EU hosting alone does not eliminate external data flows.

### C. Shopping and plans have silent-loss/duplication paths

The real [GroceryPage](../../../frontend/src/pages/GroceryPage.jsx#L62) clears typed input and updates check/delete state without failure recovery. Users can believe a change saved when it did not.

Backend list creation lacks a unique household constraint; [ingredient merging](../../../routes/groceries.py#L147) uses read/modify/write totals without concurrency protection. [Build list](../../../routes/groceries.py#L248) adds ingredients from all dated entries again on each invocation. [Planner input](../../../routes/groceries.py#L220) can persist invalid dates, unknown identities and invalid servings.

If these features ship, make uncertain writes recoverable, simultaneous additions safe, input bounded and valid, and “repeat request” distinct from “deliberately add another batch.” Specify dates/scope. New prototype shopping behavior is not already implemented here. Do not turn this correction into the whole flexible-planning production project.

Sharing also needs revocation/member-removal or server-enforced deferral. Existing invite/public-link paths cannot be secured merely by removing a navigation tab.

### D. The cooking experience needs reliable phone behavior

[Cook Mode](../../../frontend/src/pages/CookMode.jsx#L153) measures interval callbacks rather than elapsed time. Advancing/backtracking clears a running timer; wake lock is requested only at mount. Use session-scoped deadlines and deliberate cancellation behavior, with tested restoration after refresh/resume.

Deadline reconciliation does **not** by itself guarantee an alarm while the phone is locked. Decide and test what the app promises. Avoid presenting an unreliable background alarm as a dependable cooking timer.

Use native labeled controls for [checklists](../../../frontend/src/pages/RecipePage.jsx#L239), visible focus, accessible error/status feedback and latest-request handling in discovery. Verify phone safe areas, bottom navigation, large text, keyboard appearance and desktop keyboard use.

### E. Deployment and updates are not proven safe

[Database configuration](../../../app.py#L37) falls back to SQLite even outside development. Require explicit production database configuration.

The [release sequence](../../../Procfile#L2) migrates then independently commits content syncs. A later failure can leave an old app facing changed schema/content. Rehearse successful release, failure, rerun and recovery; test the prior application against records written by the candidate. A destructive downgrade is not a rollback strategy.

The [service worker](../../../frontend/public/sw.js#L72) can cache error responses. Cache successful eligible responses only; verify installed clients across two app releases and preserve valid cached assets/content. Keep private/entitlement-varying API responses out of shared caches.

Select supported runtimes, lockfile-enforced installation and repeatable CI/artifacts. Document proxy/TLS configuration, readiness checks, monitoring, backup/restore and who responds to incidents. No provider-side facilities were verified; absence in the repository is not proof they do not exist.

### F. Content acceptance is part of product correctness

The actual Basic lentil recipe says “Meanwhile” for pasta while specifying sequential reuse of one pot; metadata also omits the sauce pan. This remains in both [EN](../../../content/recipes/lentil-bolognese/basic.en.md#L9) and [DE](../../../content/recipes/lentil-bolognese/basic.de.md#L28). This can confuse a beginner despite green software tests.

Have the creator/authorized culinary reviewer approve equipment, sequence, timing, ingredient quantities and the lesson pairing for the release set. Keep AI-image disclosure and creator-cooked/image-comparison claims separate. No generated planning-only example becomes a verified cooking recipe through this review. Do not claim nutritional/allergen accuracy beyond the accepted content evidence.

## 4. Recommended first release — proposed, not applied

**A small, welcoming, online-first cooking application for phones, with a usable desktop browser layout.**

- Curated discovery and recipe detail; ingredient-first entry points only where backed by real metadata, not a pretend complete network.
- Phone-first ingredients/method navigation, simple step cooking and contextual optional teaching.
- Preserve existing guest Basic access.
- Optional account favorites/history/reflection/confidence only after account-security and lifecycle gates close.
- Selectively port approved visual hierarchy, cream/oat/blue styling, compact controls and cleared-for-use imagery into React. This is presentation integration, not copying demo state.
- No scores/streaks/locked learning path. Preserve existing content entitlements until a separate product decision changes them.

Recommended deferrals: personal recipe authoring, branching/scanning, full network traversal, flexible event planning, “Use the rest,” preparation batches, leftovers allocation, nutrition targets, automatic schedules and packaged desktop.

**Shopping/plans require an explicit scope decision.** My smallest-release default would defer their public exposure until the existing reliability/sharing issues are fixed, without deleting their code or data. If planning/shopping is essential to the app's first public promise, include task L4 below as a mandatory gate. Do not silently remove a feature central to the user's desired launch. Preserve a supported path for existing users and their data whichever boundary is chosen.

A guest-only limited preview can avoid opening new accounts while those fixes proceed, but it is not equivalent to the full account-based product.

## 5. Decision ledger

| Decision | Alternatives / evidence | Chairman recommendation | Approval needed? |
|---|---|---|---|
| First channel | Mobile web/PWA exists as scaffolding; signed store packages do not | Validate mobile web first; stores as the next release track unless store presence is essential on day one | Yes |
| Design baseline | Old working React app vs approved standalone prototype | Bounded port of welcoming discovery, recipe and cooking experience; no wholesale prototype backend port | Yes, confirm exact screens |
| Accounts at first release | Guest-only limited release vs optional accounts | Retain optional accounts only after lifecycle/security acceptance; guest access remains | Yes |
| Shopping/plans | Existing APIs have defects; latest UX is only prototype | Defer public exposure by default, or explicitly fund L4 before release | Yes; do not disable automatically |
| API deferral | Hide tabs vs enforced boundary | Enforce server-side restrictions, including direct requests and legacy links/tokens; preserve existing-user data support | Policy and rollout approval |
| Timer promise | Foreground/return-time assistance vs reliable background alarm | Accurate elapsed time and transparent limitations first; stronger alarm promise only after device evidence | Yes |
| Offline promise | Network-only personal data vs offline synchronization | Online-first with explicit recovery; no full offline claim or shared private cache | Yes |
| Auth design | Existing bearer tokens with a real lifecycle vs different session architecture | Choose a bounded, reviewed recovery/revocation design; no forced framework migration | Technical decision after threat model |
| Shared-data deletion | Delete everyone’s list vs retain attributed data vs anonymize | Delete private data; retain agreed shared content with removed attribution; revoke owned share links | Owner/privacy policy approval |
| Hosting | Existing external service vs European-controlled deployment | Confirm domain, provider, processor locations, operating responsibility, backup and support budget | Yes; no provisioning performed |
| Tiers/monetization | Current Basic/account/premium rules vs new business model | Do not change entitlements or add checkout during this audit; free/store monetization decision before packaging | Yes |
| “Green tests” | Treat current pass as launch approval vs targeted evidence | Keep passes; require PostgreSQL, enabled-worker, device and content gates | Not waivable by majority |

## 6. Ordered implementation work

These are proposed reviewable increments, not authorization to implement.

### L0 — Freeze the launch contract and candidate

**Owner:** product/chairman with frontend, security and operations. **Dependency:** first.

Choose the channel, exact exposed screens/features, accounts, shopping scope, offline/timer promise and supported phone/browser matrix. Name a candidate branch/revision including intended uncommitted work; reconcile actual deployment source without overwriting the older main checkout. Inventory existing-user obligations.

**Acceptance:** one finite release checklist links every visible action to a working real-app flow; deferred paths have a defined server boundary. No prototype-only feature appears in launch claims.

### L1 — Establish the release test environment

**Owner:** DevOps + QA. **Dependency:** L0; run in parallel with implementation tracks.

Provide an explicitly disposable PostgreSQL target, supported build runtimes and isolated staging configuration. Require production database URL/secret; avoid dotenv/personal DB leakage in tests. Create CI for current regressions/build and the new PostgreSQL scenarios.

Likely files: `app.py`, root/frontend package manifests, test helpers/migrations, new CI/release docs.

**Acceptance:** fresh and representative pre-migration databases upgrade and sync; tests cannot accidentally target production. Restore a test backup. The currently inaccessible local engine is a blocker to this evidence, not permission to substitute SQLite.

### L2 — Complete account lifecycle and privacy

**Owner:** backend + security; frontend handles account recovery/settings after contract agreement. **Dependency:** L0; final acceptance on L1.

Inventory/export/delete all user relationships, define shared-data handling, validate auth inputs, add abuse controls and secure recovery/revocation. Correct EN/DE privacy/settings claims and browser third-party requests. Decide sharing visibility/revocation if retained.

Likely files: `routes/auth.py`, `models.py`, auth store/client, Settings/Login/Register, localization, related migrations/tests.

**Acceptance:** on migrated PostgreSQL, a user with favorites, owned/shared plans, teaching history and current/former household contributions exports and deletes correctly; co-member data survives; stale tokens/links cannot regain access. Malformed/oversized requests are rejected without writes, account recovery works, and failed multi-record deletion rolls back atomically.

**Recovery:** additive migrations where practical, verified old-client/old-backend behavior after candidate writes; do not restore deleted user data merely to roll application code back.

### L3 — Port the bounded welcoming UI and harden cooking

**Owner:** frontend/UX + QA; API identity/entitlement changes reviewed by backend. **Dependency:** L0; parallel with L2/L5.

Implement approved navigation/discovery/recipe/Cook Mode presentation in React using shared controllers and thin responsive layouts. Preserve snapshots, lesson content, attempts, guest/account isolation and optional reflection. Fix timer deadlines/restoration, stale search results, labeled checklists, focus/error handling and local-date handling.

Likely files: `App.jsx`, `BottomNav.jsx`, `Home.jsx`, `RecipePage.jsx`, `CookMode.jsx`, session store, shared CSS/components/locales. Prototype files remain references.

**Acceptance:** real API-backed journey at 320/390/768/1280 widths, EN/DE, light/dark, large text, keyboard and screen reader. Desktop ingredients-left layout and phone navigation share one state model. Lost connectivity/response and changing account/attempt never silently apply stale state. An active timer survives the agreed transitions accurately; no unverified background-alarm claim.

**Recovery:** keep the previous UI artifact deployable against compatible API/session shapes; test existing cook attempts and old clients after new-format state if any is introduced.

### L4 — Make exposed shopping/planning/sharing trustworthy

**Owner:** backend + frontend, security reviews access; QA owns integration. **Dependency:** L0 scope choice, L1 database evidence; shared migration files coordinated with L2.

If shipping: validate recipe/tier/date/serving identities; enforce one grocery list per household; make quantity updates concurrency-safe; define selected dates and retry-safe build/apply actions; provide pending/error/recovery UX without losing input. Add link/invite revocation and deliberate sharing disclosure. Check membership and entitlement on every read/derived-output path, not just creation.

If deferred: implement and test the agreed server-side availability boundary, preserving data and supported account export/deletion. Do not delete user records to simplify the release.

Likely files: `routes/groceries.py`, `routes/meal_plans.py`, `access.py`, models/migrations, Grocery/MealPlans pages and API modules.

**Acceptance:** concurrent requests retain both contributions; identical retry does not double quantities; only selected dates contribute; rejected saves remain visibly recoverable; revoked membership/share access is denied even by direct API calls. The prototype's complete quantity-allocation model is not required in this increment.

### L5 — Make deployment/update/recovery predictable

**Owner:** DevOps + backend/QA; frontend owns worker changes. **Dependency:** L1; can start before other tracks finish.

Lock reproducible installs/builds; validate all content before publishing and define controlled release order/failure behavior. Fix successful-response-only worker caching. Establish domain/TLS/proxy topology, health/readiness, error/uptime alerting, log redaction, backup retention, restore runbook and incident contact. Dependency support/security inventory belongs here; no vulnerability conclusion is inferred merely from age.

**Acceptance:** full `db upgrade → sync-recipes → sync-glossary → sync-skills → sync-lessons` on fresh/populated PostgreSQL; injected late failure and rerun/recovery; previous application against candidate-written records; installed release A transitions safely to B with offline/500 tests. Record acceptable data-loss/recovery targets and a successful restore, not merely a backup file.

### L6 — Content and physical-device acceptance

**Owner:** QA + frontend + creator/authorized culinary reviewer. **Dependency:** relevant L2–L5 work in staging.

Resolve the Basic recipe contradiction and approve the finite recipe/lesson/image set. Run physical iPhone Safari/home-screen app, physical Android Chrome/installed app, and desktop keyboard/resizing checks. Capture actual device/OS/browser versions and results.

Cover discover → ingredients → cook/help/timer → optional completion/history; recovery/login/logout/account switch; shopping/share paths if exposed; EN/DE/light/dark; airplane mode, app interruption, refresh, export/delete and a two-release update. Verify errors do not falsely claim saves failed when the result is ambiguous.

**Acceptance:** no blocking failures against the agreed product promises. Only then schedule the previously deferred 1–2 beginner observations with user approval. Human/device access, culinary acceptance and recruitment are not completed by this council.

### L7 — Release decision; separate store delivery if chosen

**Owner:** user + QA/security/DevOps. **Dependency:** all gates applicable to L0's scope.

Review evidence and known limitations; explicitly approve a deployment/support plan. No automatic commit, push, release or recruitment.

If store delivery is selected, perform a small native-container feasibility spike before choosing tooling; then native build/signing, secure session/storage review, device lifecycle, deep links/export, beta distribution, listing/privacy/deletion obligations and store review. Web acceptance carries useful evidence but cannot certify the packages.

**Parallelism:** after L0, L1/L2/L3/L5 can proceed with coordinated contracts. L4 runs only for the chosen exposure. Share models/migrations and auth contracts before parallel edits; assign one integration owner. L6 consumes actual integrated candidates, not isolated mock screens.

## 7. Android, iOS and desktop implications

My proposed fastest path is a phone-first website/PWA, with the same app usable on desktop. iPhone home-screen installation is supported by Safari; it is not an App Store release. [Apple's web-app instructions](https://support.apple.com/en-mide/guide/iphone/iphea86e5236/ios).

For stores, investigate React reuse through a native container such as Capacitor rather than assume a rewrite. iOS builds require a macOS/Xcode environment; Android uses Android Studio/SDK tooling. A cloud Mac is possible but still requires signing, device QA and operational ownership. [Capacitor setup](https://capacitorjs.com/docs/getting-started/environment-setup).

Store work includes developer identities, signed builds, screenshots/support/privacy information, review access and actual device testing. Apple minimum-functionality review means merely wrapping the website is not a guaranteed approval; current uploads require the applicable Xcode/SDK versions. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/), [dated requirements](https://developer.apple.com/news/upcoming-requirements/).

Account creation brings deletion obligations: Apple requires an in-app initiation path; Google requires an in-app path plus an external web resource. [Apple deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app), [Google deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Google's newer personal developer accounts also require 12 continuously opted-in closed testers for at least 14 days before applying for production access. Account age/type is unknown here. Android's current ordinary new-app target requirement is API 36; this does not mean only Android 16 phones can run the app. [Testing](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), [target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en).

Full dated source notes and conditional requirements: [platform requirements](platform-requirements.md). Recheck before submission. No store enrollment, testing recruitment, billing integration or packaging is authorized by this review.

**Desktop recommendation:** maintain a clean browser layout from the same frontend. Do not build Electron/Tauri or a separate desktop codebase without a demonstrated need.

## 8. Evidence and stop conditions

Freshly passed: **45 backend tests, all four frontend test scripts, temporary production build**. See [QA execution](qa-execution.md).

Blocked/unverified: **PostgreSQL acceptance is blocked in the accessible local environment**; physical devices, enabled-worker browser acceptance, actual production hosting, restore/release rehearsal and native packages were not tested. Existing prototype results remain historical, not evidence that production integration exists.

The first concrete next step is **L0: approve a one-page release contract**, then assign L1–L3/L5. Do not start personal recipe implementation before this launch boundary is settled.

This council added review documents only. No application/prototype changes, commits, pushes, deployments, purchases or user-data mutations.

Suggested commit message: `docs: assess cookbook launch readiness with developer council`.
