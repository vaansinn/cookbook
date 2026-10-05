# Cookbook — current outstanding work

Updated **2026-10-05**. This is the current actionable checklist for pipeline
**#61**, not a claim of launch readiness. Historical task IDs and delivered work
remain in [PIPELINE.md](PIPELINE.md). Keep this checklist current instead of
creating another competing status list.

Execution order, bounded Sol assignments and user checkpoints:
[dispatch plan](docs/councils/launch-readiness/dispatch-plan-2026-09-27.md).
Machine-readable task packets: [manifest](docs/councils/launch-readiness/dispatch-manifest-2026-09-27.json).
These organize L01–L17; they do not independently mark work complete or authorize
implementation/deployment. Five-seat planning review and cross-review are recorded
in the [council record](docs/councils/launch-readiness/dispatch-council-2026-09-27.md).

Phase 1 artifacts and fresh diagnostic evidence:
[October 5 handoff](docs/councils/launch-readiness/phase-1-handoff-2026-10-05.md).
D01/D02/D04 now have source-grounded contracts, all 20 parity rows and a recovery
test design. These documentation deliverables do not close L01/L04/L15 or approve
their proposed policies. October 5's priority clarification puts the connected
core app first: D03 can proceed using existing authorized APIs and unchanged cook
contracts. L18/N0 gates native-specific session/packaging/alarm choices, not this
platform-independent UI work. Locked-phone alarms remain required for release.

## Release boundary and current foundation

**Android milestone update, October 5:** the user chose a personal Google Play
account (not registered yet) and authorised separate project-local Android/JDK
tools and SDK licence acceptance. The original `com.cookbook.localdev` harness
was paired wirelessly, installed and confirmed working by the user. `mobile/`
now builds the separate **Cookbook Bundled Dev** (`com.cookbook.bundleddev`) with
the real React assets inside the APK and only its API using local port 5100.
Both apps/data are preserved independently. Native device checks passed for
packaged startup without an API mapping and real guest recipe loading with an
API-only mapping. Build/lint, four Android unit tests, 26 mobile checks and 353
frontend/prototype tests passed (one existing skip). Release builds stay disabled.
Authenticated SQL save/reopen and interrupted-write acceptance remain open;
this is not production native authentication or completion of L18.
[Build and device handoff](mobile/README.md). UI/API integration can continue
independently. No public backend or Play account is needed for this local test.
Personal-account verification/testing is a later release gate.

First release: **Android app first**, with Galaxy S25 as the initial test device;
**iOS later, public web/desktop deferred**, confirmed October 5. Retain real private
PostgreSQL accounts and the **implemented** approved planning/event/shopping
prototype behavior. Reuse existing UI/backend where feasible; native framework
choice for production remains provisional; Capacitor is being evaluated through
the development harness above. Audible timers must work while the phone is locked.
Preserve the creator's existing
records. Local development is authorized; paid infrastructure, deployment,
public content activation and participant recruitment are not.

Implemented locally: account-private plans/meals/events/items and links;
revisioned/idempotent commands, previews and undo; scoped source-aware shopping;
templates, repeat flows and current/upcoming/past views; SQL appearance
preferences; account/stale-response guards; deadline-based cooking timers;
retained teaching snapshots/reflections; local fonts; cache hardening; isolated
test/release runners and a CI workflow. These are a foundation, not complete
product, culinary, privacy or operational acceptance.

The user authorized committing/pushing the accumulated work on 2026-09-18.
That does **not** authorize deployment or change the unanswered product decisions.

## Next engineering work

Every unchecked item needs recorded evidence before closure. Owner labels are
specialist roles, not an assertion that another agent is currently assigned.

**Current priority (user clarification, October 5):** the missing connection
between approved design and features is the immediate concern, not a reported
login/loading defect. Keep the alarm feasibility check bounded; do not make full
alarm implementation the first milestone. Next: L02/D03 real recipe journey, then
connected planning/shopping gaps and core account work. Native-specific contracts
still require review before implementing them; alarm acceptance stays a launch gate.

**Bounded alarm/tooling check, October 5:** deadline-based timer state already
exists in `frontend/src/utils/cookTimer.mjs`; sound is a Web Audio beep in
`frontend/src/utils/timer.js`, not a scheduled Android alarm. Android SDK directory,
ADB and emulator binaries exist locally; platform directories 32/33 and build-tools
30.0.3/33.0.1 were found. Tools were not on this shell's PATH; no packaged Android
project existed at that initial inspection; the later development harness above
supersedes that tooling status. Android documents a system exact/wakeup
alarm route with permission constraints ([official guide](https://developer.android.com/develop/background-work/services/alarms)).
This establishes a plausible integration path, not a working alarm or accepted
toolchain. No SDK installs, phone access, APK build or device alarm test performed.
Finish that proof within the packaging track, without holding up the shared UI.

- [ ] **L18 — Admit Android-first architecture and release track** (frontend,
  backend/security, DevOps/QA; N0–N3, Q01/Q05). Alongside core app integration,
  evaluate reuse of React in a packaged app versus alternatives; prove the alarm
  path on S25 before accepting the native architecture. Review packaged API origin,
  session/credential storage and logout, deep links/Back, suspend/resume,
  permissions denied/revoked, safe-area/keyboard/accessibility, signing/build
  tooling and release/update recovery. Revalidate the same-origin cookie ADR
  rather than assuming it fits a native container. Preserve SQL ownership,
  snapshots/attempts and full PX parity. Android packaging is now launch work;
  iOS and web/desktop publishing are deferred. Check current store obligations
  before a distribution plan; no paid enrollment, submission or deployment yet.
  **Confidence: low until packaged-device feasibility is demonstrated.**

Platform precedence: older phone/desktop browser and PWA checks below remain
useful development/regression evidence, not proof of Android acceptance or a
requirement to publish a website first. L11/L13/L16 must sign off the real Android
package; a physical iPhone is not an Android launch gate. Preserve desktop code,
but defer desktop-specific release polish. Rebaseline agent packets after N0.

- [ ] **L01 — Freeze the remaining release contracts** (chairman + backend/security;
  LP00–02, X0). Reconcile the route/exposure inventory, auth/session ADR,
  legacy-data policy, content activation/recovery policy and PX01–PX20 matrix
  against the implemented slice contracts. Ask Q05–Q08 only where their answer
  changes behavior. Exit: no unresolved architecture assumption presented as
  user approval. **Confidence: low until policy-dependent decisions are settled.**
  D01 inputs: [route inventory](docs/councils/launch-readiness/exposure-matrix.md),
  [session ADR](docs/councils/launch-readiness/session-contract.md) and
  [legacy/content ADR](docs/councils/launch-readiness/legacy-contract.md).
- [ ] **L02 — Finish the welcoming discovery → recipe → cook port** (frontend;
  LP20–23, #60b–f). The compact Home port is only partial. Wire ingredient-first
  discovery/Explore to real authored data; recipe overview, AI disclosures,
  equipment, imagery and component previews; phone Ingredients/Method access and
  desktop ingredients-left layout. Carry the same accessible shell into account,
  History and Settings without losing saved attempts or reflection semantics.
  Show one actual EN/DE wired slice for **Q09** before broadening the port.
- [ ] **L03 — Author and approve the finite planning catalog** (backend + content;
  X2/PX08, Q10). Infrastructure exists, but no curated development catalog was
  published by this work. Map stable ingredient/form IDs, languages, servings,
  recipe identities, option combinations, coherent method/equipment/time and
  immutable revisions. Test unavailable/revoked content and explicit revision
  changes. Keep soup/salad as unverified planning examples with no fake guided
  cooking. **Confidence: low until real culinary/component mappings are approved.**
- [ ] **L04 — Prove complete production prototype parity** (QA + frontend/backend;
  X7–10). Check every [PX01–PX20 row](docs/councils/launch-readiness/planning-production-track.md)
  against actual API-backed screens, not only fixtures: one/ten-day plans,
  move/copy/repeat/templates, linked events, contributions/guest overrides,
  scoped shopping's four views, source/total checks, extras, seasoning, sticky
  review, destructive previews/undo, conflicts and refresh. Prove clean-browser
  and second-device restoration from SQL. Record intentional differences and
  fix gaps; do not reduce the agreed release scope silently.
  D02 [evidence matrix](docs/councils/launch-readiness/parity-evidence.md) identifies
  missing meal/item positioning, detailed destructive shopping impact and selected-
  servings preview before save. Old household records are not private-plan aliases.
  [Browser scenarios](docs/councils/launch-readiness/browser-scenarios.md) remain unrun.
- [ ] **L05 — Complete public account/session security** (backend/security;
  LP11, Q06). [October 5 authentication batch](docs/councils/launch-readiness/authentication-batch-2026-10-05.md)
  implements SQL session families, short-lived access, rotating renewal,
  browser cookies/CSRF, native encrypted storage, cross-tab coordination and
  server revocation. Local working clients remain legacy until native end-to-end
  acceptance and controlled cutover. Finish production abuse-load validation,
  registration enumeration policy, session retention and appropriate
  reauthentication. Preserve current tier access
  until an explicit replacement policy is approved. Test old/invalid/deleted
  account tokens and outage/recovery across all exposed routes.
- [ ] **L06 — Add secure account recovery and agreed email verification**
  (backend/frontend/DevOps; LP13/23, Q06/Q11). Hashed expiring single-use codes,
  reset/session invalidation, generic recovery responses, throttling, PostgreSQL
  concurrency and local inbox are implemented with gated EN/DE screens. Real
  sender/provider, trusted hosted links, asynchronous delivery/outbox, retention,
  verification policy and delivery testing remain open and need authorization
  where they create external services. No automatic verified-email access gate.
- [ ] **L07 — Close legacy endpoint/data exposure** (backend/security; LP12, X9,
  #41a/#49a, Q07). Inventory old household/planner/grocery/public-link routes and
  assign preserved, adapted, read-only or retired behavior on the server. Recheck
  membership and current recipe access at derived reads/writes. Resolve list
  uniqueness/first-write races and unsafe validation where still exposed;
  test invitation/link revocation and member removal if retained. No silent
  dual writes, ownership guesses or destructive migration of existing records.
- [ ] **L08 — Complete privacy lifecycle and operator documentation**
  (security/backend + operator; LP12, X9). Agree controller/audience/purposes,
  processors/transfers, retention including mutation receipts/previews/inverses,
  logs, backups and incident handling. Verify accurate exports, account deletion,
  shared-data attribution and deletion/revocation reapplication after restore.
  Replace draft privacy/support copy with the approved actual data flows.
  Existing export/deletion routes alone are **not GDPR sign-off**.
- [ ] **L09 — Finish timer/PWA device acceptance** (frontend/QA; LP22/24, Q05).
  Verify background/lock/resume, wake-lock denial/reacquisition, refresh, clock
  changes, account/attempt changes, old-worker waiting/activation and installed
  mode on physical devices. Resume timing target: within one displayed second.
  Q05 now requires an audible alarm while locked. First run a bounded platform
  feasibility check, starting with Galaxy S25: compare browser limitations with
  OS-scheduled alarm integration, permissions and actual locked-device behavior.
  Do not weaken the requirement to elapsed-time-on-return or claim current support;
  Android-first packaging is now selected under Q01; its framework and physical
  alarm verification remain open. No broad offline
  editing claim. Establish an old-client/asset retention window and test active
  cooks across two releases. See the Q05 decision register for official sources.
- [ ] **L10 — Close the isolated worker-harness cleanup check** (QA).
  Re-run the revised Review/Confirm/Cancel cleanup in a real browser. Inspect
  only the synthetic `127.0.0.1:5189` test origin for the possibly retained test
  worker/cache and use its explicit cleanup controls if present. Preserve all
  application/account storage and unrelated caches. Record the result.
- [ ] **L11 — Run the full accessibility/responsive acceptance matrix**
  (frontend/QA; LP50, #60h). EN/DE, light/dark, 320/390/768/1280, keyboard-only
  complete journeys, screen reader, zoom/large text, contrast, touch targets,
  focus return and readable errors. Fix the known narrow German bottom-nav
  label wrapping. Run Lighthouse performance/accessibility/SEO/PWA checks and
  investigate rather than treating a score as acceptance. Representative browser
  checks already passed; exhaustive and physical-device acceptance has not.
- [ ] **L12 — Measure realistic capacity and recovery** (backend/DevOps/QA;
  LP41/50, Q12). Benchmark PostgreSQL projection latency/query count/memory and
  modest concurrent use at admitted limits; include the 10k receipt boundary,
  expired preview/undo retention and recoverable capacity exhaustion. Existing
  worst accepted SQLite projection measured ~4.927 s / 2,859 SELECTs; that is
  diagnostic evidence, **not a production SLO**. Define targets, optimize as
  needed and prove old retries remain usable. **Confidence: low for live load.**
- [ ] **L13 — Execute CI and candidate-specific release verification**
  (QA/DevOps; LP10/50). Initial remote workflow **passed** for `04a414f` on
  2026-09-18, including all five disposable PostgreSQL databases; result confirmed
  2026-10-05 ([run](https://github.com/vaansinn/cookbook/actions/runs/35339011776)).
  Fresh October 5 local baseline: 32/32 backend scripts, 352 frontend/prototype
  passes with 2 optional browser skips, production build 161 modules. PostgreSQL
  and browser acceptance were not rerun in this documentation batch.
  This closes the initial-CI check, not L13. Require a green final candidate run. Repeat full
  automated/build/sync/migration evidence on fresh and representative populated
  disposable PostgreSQL, including invalid corrective migrations, transaction
  rollback, restored-history reads/writes and a compatible recovery artifact.
  Never substitute SQLite or production personal data for these gates.
- [ ] **L14 — Complete controlled content publication** (backend/DevOps/content;
  LP40, Q10). Validate the entire bilingual recipe/glossary/skill/lesson/catalog
  release before activation; test late failure/rerun, serialization and safe
  partial-publication recovery. Keep old cook snapshots immutable. Successful
  local sync rehearsals do not approve culinary content or authorize publishing.
- [ ] **L15 — Prepare then approve hosting/cutover operations** (DevOps + operator;
  LP14/41, Q04/Q11/Q12). Choose budget/owner/domain/mail and approved EU-oriented
  hosting later (Hetzner preferred; no purchase now). Test the actual topology's
  HTTPS/proxy/host/CORS/security headers/readiness, restricted staging and private
  caching. Define reproducible artifact promotion, old-asset retention, backups,
  measured restore RTO/RPO, alerts/support, incident/rollback runbooks, old-origin
  redirects and explicit local-draft preservation. **Confidence: low until a
  deployment environment and operational owner are agreed.**
  D04 [runbook](docs/councils/launch-readiness/release-runbook.md) and
  [recovery scenarios](docs/councils/launch-readiness/recovery-test-design.md) are
  drafted; compatible recovery-build read/write and late-sync-failure proof remain
  to implement and execute, distinct from the existing current-build restore.
- [ ] **L16 — Obtain independent final council and human acceptance**
  (chairman + five specialists, user/content reviewer; LP51). Review the exact
  candidate against every open item/evidence link; classify residual risk with
  owner and expiry. Obtain wired-screen Q09 and culinary/image Q10 approval
  separately. Resolve lentil Bolognese's simultaneous-versus-sequential equipment
  contradiction, starter quantities/timing, EN/DE and creator-cooked/image claims.
- [ ] **L17 — Run authorized beginner observations, then release/aftercare**
  (QA + operator; #39a, LP60, Q13/Q14). Only after engineering and culinary
  acceptance, request approval for 1–2 beginner observations/bounded beta and
  feedback/privacy handling. Fix findings, present the exact candidate and
  recovery/stop rules, then request separate deployment/cutover authority.
  Confirm post-release checks/support and observation window; no automatic
  recruitment, release or recurring monitor.

## Decisions to batch for the user at the relevant checkpoint

Full wording and answers: [Q&A register](docs/councils/launch-readiness/implementation-questions.md).
Continue independent work while a decision is pending; do not ask everything up front.

- [x] **Q05 product requirement:** confirmed October 5: audible timer alarm while
  the phone is locked, “like a regular alarm.” Platform feasibility/device testing
  is still open; accurate time or an alarm only on return is not a substitute.
- [x] **Q06 launch policy:** approved October 5: guest Basic, all curated recipes
  free when signed in, email verification/password recovery, paid tiers later.
  Implementation, detailed unverified-account flow and mail setup remain open.
- [x] **Q07 deletion-retention direction:** approved October 5: delete private
  data/revoke owned public links; retain existing shared content for remaining
  members without attribution. New plans remain private. Actual lifecycle tests,
  remaining invitation/public identity/export rules and retention periods are open;
  old merged groceries lack reconstructable provenance.
- [ ] **Q08 technical completion:** private ownership is answered; close the
  remaining contract review and demonstrate independent scope semantics.
- [ ] **Q09/Q10:** approve the actual wired screens and finite culinary/image set.
- [ ] **Q04/Q11/Q12:** operating budget/owner, physical iPhone access, domain,
  mail/support, retention, backups/restore and alert targets before provisioning.
- [ ] **Q13/Q14:** tester participation and exact release/cutover approval later.
  This Git push approval is **not** deployment approval.
- [ ] **Q15:** choose the next feature using observations after the release window.

## Deferred backlog — retained, not launch blockers

- [ ] Personal recipe library/editor and ingredient-based network suggestions
  (#51), private variations/branch/history comparisons (#40/#53/#44), variable
  versions and full future fixture contract (#47b). Use the
  [personal-recipes council plan](docs/councils/personal-recipes/implementation-plan.md)
  when explicitly resumed; community sharing remains a separate choice.
- [ ] Scanning/import review (#52/#58), ingredient/nutrition/unit tools (#54),
  including a real metric/imperial converter and provenance/coverage.
- [ ] Editable packs and **Use the rest**, shared-preparation batches/yields and
  complete-meal leftovers. These were planned, not implemented prototype parity;
  keep their quantities/ownership separate and do not auto-add recipes.
- [ ] Explore-to-plan shortcut and direct guided cooking from a configured planned
  item. Configured **preview is required now** (L03/L04); starting a cook that
  drops the chosen components is never an acceptable shortcut.
- [ ] Broader curriculum/skill paths/help and learning suggestions
  (#33b–#38b/#42/#43/#46), structured per-step ingredients (#60g) and additional
  observed-needs validation (#39b). Timers in #36b are partly delivered; fuller
  prep/teaching work remains. No XP, streaks, locked paths or automatic difficulty.
- [ ] Further usability proposals: reliable optional cook-count trust signal
  (#28), quick servings (#31), German glossary triggers, optional chef artwork
  and supporting-navigation simplification (#45). Recipe sticky controls
  (#29/#30) are part of L02; do not build competing designs.
- [ ] Event timing/bundle extensions (#49b/#55/#56) beyond implemented private
  menus/manual reminders; automatic schedules are not shipped. Legacy household
  multiple lists/live collaboration/email invitations and unlinked standalone
  shopping lists are separate from the new private scope model.
- [ ] Optional AI plan proposals (#26), automatic planning, pantry/retailer prices,
  nutrition targets and external providers. Revalidate provider/model, cost,
  privacy and throttling at implementation time; old provider mentions are not
  credentials or approval to call them.
- [ ] Paid tiers/Stripe, iOS packaging and public web/desktop release. Android
  packaging has moved to L18/N0–N3 in the first-release track. Do not delete the
  existing web interface or assume a full rewrite; app-first is not app-only.
- [ ] Compatibility retirement (#57), obsolete consumer cleanup and SQLAlchemy
  legacy-query warnings after inventory/tests; preserve existing data/access.

## Evidence and handoff rules

- Fresh 2026-09-18: backend **32/32 scripts passed**; frontend/prototype
  **352 passed, 2 optional browser tests skipped**; production build **161 modules**.
- Prior 2026-09-13: full backend 32/32 scripts, PG10 five-database release
  rehearsal, mounted recovery and real-browser worker/SQL flows. See the
  [continuation evidence and limitations](docs/councils/launch-readiness/continuation-2026-09-13.md).
  PostgreSQL/device/browser evidence was not rerun merely to commit documentation.
- Remote CI for `04a414f` succeeded on 2026-09-18; checked 2026-09-27, not rerun.
  Final candidate CI, physical phones, all-screen accessibility, final content,
  privacy and operating readiness remain open; neither a passing build nor
  this checklist is launch approval.
- Parallelize frontend L02, test/CI L10–13 and provider-independent runbooks;
  one owner integrates shared state/routes and one owns migrations/contracts.
  Policy/content changes wait only on their relevant answer. Each task closes
  with tests, evidence and an updated checkbox—not another stale status summary.
