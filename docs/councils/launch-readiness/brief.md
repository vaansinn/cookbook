# Phone-first launch readiness — neutral council brief

2026-09-13. User asks for a five-specialist council on the general state of the app,
before implementing personal recipes. Aim: get a useful phone-first app launched,
with a sound backend and understandable/extensible frontend; identify overlooked
risks and explain Android/iOS readiness and desktop status.

This is a review/launch plan, not authority to implement fixes, deploy, commit,
push, provision infrastructure, submit to stores, access private production data,
or recruit users. Read-only inspection and relevant local diagnostic tests are
permitted. Return reports in messages; chairman alone writes council documents.

## Baseline

Review `D:/Projects/cookbook/.worktrees/teaching-hardening` at HEAD `5c60456`, branch
`codex/teaching-pilot-hardening`. Existing uncommitted files contain planning/shopping
prototype and council documents. Preserve all work. Root `D:/Projects/cookbook`
has older main `a9dd95f` plus unrelated user files; don't inspect those unrelated
assets or treat that checkout's roadmap as the latest implementation.
No .codegraph directory at reviewed worktree root. Use rg. Local git may require
per-command safe.directory; don't alter global git configuration.

## Product context and unknowns

- Cooking and teaching should feel welcoming, simple, phone-first; no XP/streaks,
  automatic mastery, or compulsory learning. Guests retain curated cooking access.
- Browser prototype has ingredient-first Explore, component choices, cream/oat/blue
  design, flexible plans/events and interactive shopping. Verify which features
  are real application functionality versus standalone HTML/local-storage demos.
- Personal recipes and ingredient-network placement are proposed future features;
  do not add them to launch scope by default. Packs/Use the rest, batches/leftovers,
  scanning, branching and broad curriculum are also future unless essential.
- User has mentioned Hetzner and preference for European-controlled hosting, but
  provider, domain, live deployment, budgets, store accounts and intended first
  launch channel are not verified. Do not assume app-store launch is mandatory
  or that a browser installation meets that requirement.
- Distinguish phone website/PWA, Android/iOS store builds, desktop website/PWA and
  a packaged desktop application. Do not assume native projects exist.

## Evidence and allocation

Read C:/Users/zweiz/.codex/skills/developer-council/SKILL.md. Perform only your
assigned seat, no recursive delegation, no peer report reading in round 1.

- Frontend/UX: actual navigation/screen and component architecture, mobile cooking
  interaction, prototype/app gap, responsive desktop, native/wrapper evidence.
  Apply relevant UI skills. Browser read-only inspection allowed; no saved-state
  edits; don't start/stop shared servers. Clearly distinguish visual observation
  from code inspection and simulator from physical-device evidence.
- Backend/data: models/routes/access/transactions, current real features, data
  integrity and extension boundaries. Focus existing launch risk, not future schema
  speculation or rebuilding everything. Inspect test evidence but leave test execution
  to QA to avoid duplication.
- Security/privacy: auth/account recovery/delete/export, public shares/households,
  cache/access, validation, secrets handling, rate limits and data policies. No
  sensitive file contents or production probes; static assertions must be labeled.
- DevOps/reliability: actual runtime/dependencies/deployment/CI, migration/restore,
  observability/domain/support operations, native tooling/signing evidence and
  configuration gaps. No service provisioning, infrastructure mutation or production
  access. Assess EU-host options as architectural constraints, not purchases.
- QA/testing: own fresh local tests/builds where safe. Inspect commands first; no
  scripts using production or existing personal databases. Disposable local test
  databases only; don't start shared servers. Report exact runs, failures/blocked
  checks and release test matrix including iOS/Android physical devices. Don't use
  SQLite evidence as proof of PostgreSQL migration/concurrency behavior.

Chairman independently researches CURRENT official Apple/Google store and platform
requirements, checks decisive source claims, and synthesizes the launch plan.

## Required first-round output (roughly 600–900 words)

1. Verdict for your area: ready / conditional / not ready, with launch scope.
2. Up to five ranked, concrete concerns with file:line evidence and a failure
   scenario. Separate verified defect, unverified gate, and future-design concern.
3. What is good enough to keep; what not to rebuild before launch.
4. Minimum launch tasks and acceptance evidence; what can safely ship later.
5. One overlooked issue outside obvious feature completeness and relevant platform
   implications. Note assumptions and uncertainty, not unsupported percentages.

After all five reports return, chairman sends one cross-review round. Do not
manufacture consensus or turn this into an unlimited audit. Honest unknowns,
small launch scope and safe expansion are the goal.
