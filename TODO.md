# Cookbook — current outstanding work

Updated **2026-09-18**. This is the current actionable checklist for pipeline
**#61**, not a claim of launch readiness. Historical task IDs and delivered work
remain in [PIPELINE.md](PIPELINE.md). Keep this checklist current instead of
creating another competing status list.

## Release boundary and current foundation

First release: a phone-first website/installable web app, with real private
PostgreSQL accounts and the **implemented** approved planning/event/shopping
prototype behavior. Desktop must also work. Preserve the creator's existing
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

- [ ] **L01 — Freeze the remaining release contracts** (chairman + backend/security;
  LP00–02, X0). Reconcile the route/exposure inventory, auth/session ADR,
  legacy-data policy, content activation/recovery policy and PX01–PX20 matrix
  against the implemented slice contracts. Ask Q05–Q08 only where their answer
  changes behavior. Exit: no unresolved architecture assumption presented as
  user approval. **Confidence: low until policy-dependent decisions are settled.**
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
- [ ] **L05 — Complete public account/session security** (backend/security;
  LP11, Q06). Authentication identity/validation guards are implemented; decide
  and finish the launch session transport/storage, expiry/revocation and
  cross-tab policy. Add/verify login/registration abuse throttling, enumeration
  resistance and appropriate reauthentication. Preserve current tier access
  until an explicit replacement policy is approved. Test old/invalid/deleted
  account tokens and outage/recovery across all exposed routes.
- [ ] **L06 — Add secure account recovery and agreed email verification**
  (backend/frontend/DevOps; LP13/23, Q06/Q11). Hashed expiring single-use tokens,
  trusted-origin links, reset/session invalidation, non-enumerating responses,
  throttling, concurrency, failure/retry and token-redaction tests. Use a local
  fake mail sink first; real sender/provider/delivery testing needs authorization.
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
  No guaranteed locked-phone alarm or broad offline editing claim. Establish
  an old-client/asset retention window and test active cooks across two releases.
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
  (QA/DevOps; LP10/50). Inspect the first remote workflow run after this push;
  address platform differences and require a green candidate run. Repeat full
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

- [ ] **Q05:** online-first recovery/accurate resumed timers versus a required
  locked-phone audible alarm; intended device/OS support.
- [ ] **Q06:** exact free/guest/account/premium access and email-ownership policy.
  Public sign-up and future Stripe are confirmed, not today's price/access rules.
- [ ] **Q07:** retained shared household data/attribution and public-link policy
  on account deletion; old merged groceries lack reconstructable provenance.
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
- [ ] Paid tiers/Stripe and Android/iOS store packaging (N0–N3) after explicit
  scope and account/tooling approval. PWA release does not imply store readiness.
- [ ] Compatibility retirement (#57), obsolete consumer cleanup and SQLAlchemy
  legacy-query warnings after inventory/tests; preserve existing data/access.

## Evidence and handoff rules

- Fresh 2026-09-18: backend **32/32 scripts passed**; frontend/prototype
  **352 passed, 2 optional browser tests skipped**; production build **161 modules**.
- Prior 2026-09-13: full backend 32/32 scripts, PG10 five-database release
  rehearsal, mounted recovery and real-browser worker/SQL flows. See the
  [continuation evidence and limitations](docs/councils/launch-readiness/continuation-2026-09-13.md).
  PostgreSQL/device/browser evidence was not rerun merely to commit documentation.
- Remote CI success, physical phones, all-screen accessibility, final content,
  privacy and operating readiness remain unchecked; neither a passing build nor
  this checklist is launch approval.
- Parallelize frontend L02, test/CI L10–13 and provider-independent runbooks;
  one owner integrates shared state/routes and one owns migrations/contracts.
  Policy/content changes wait only on their relevant answer. Each task closes
  with tests, evidence and an updated checkbox—not another stale status summary.
