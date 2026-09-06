# Mobile-first adaptive UI implementation plan

Status: #60a baseline/preview in progress; revised recipe/Cook Mode prototype ready for visual review. Application changes not started. See [baseline and preview evidence](mobile-first-baseline.md).
Prepared: 2026-09-07. Inspected base: `f3ba9c2`, `codex/teaching-pilot-hardening`.
Pipeline umbrella: #60. This document supplements, not replaces, IMPLEMENTATION_PLAN.md and AGENT_HANDOFFS.md.

## 1. Objective and boundaries

Make cooking comfortable on a phone, useful on a kitchen tablet, and fully functional on desktop. Give desktop more room for browsing, planning and management. Deliver one application with shared data and cooking state, not separate mobile and desktop products.

The user has agreed to the mobile-first direction and sticky Ingredients / Method navigation. Exact responsive visuals still require preview approval. The earlier interactive redesign is a direction sample, not an approved production specification: its sample recipes, quantities, three illustrative cooking steps and simplified controls must not be copied into production.

Preserve:

- Existing URLs and deep links, including recipe tier/language/servings/attempt parameters and shared-plan links.
- Public Basic, account Intermediate and premium Advanced access; server authorization stays authoritative.
- Account initialization, guest separation, request-generation guards, legacy recovery, immutable snapshots, optional reflections and revisioned/idempotent writes.
- Existing grocery/household, meal-plan, History, glossary, lesson, settings, authentication, privacy and sharing functionality.
- EN/DE, light/dark, enamel-blue primary color and separate semantic status colors. No serif, XP, streaks, rankings or mastery scores.

Do not include native apps, a framework upgrade, new hosting, photography procurement, personal recipes, recipe branching, scanning, dinner events or broader curriculum. No automatic commit, merge, push or deployment.

### Existing-task reconciliation

- #29 (sticky recipe mini-header) and #30 (sticky recipe actions) are delivered through #60c. Do not implement competing sticky bars independently.
- #45: #60 covers adaptive layout/navigation presentation only, not removing destinations or expanding learning navigation.
- #28 (cook-count trust signal) and #31 (quick-pick servings) remain separate; retain the current servings control without adding them implicitly.
- Per-step quantities below are a bounded follow-on, not approval for all of #35b/#40/#47b/#54. The responsive release must not depend on the full future ingredient/version model.
- Existing PostgreSQL verification, culinary approval and beginner-observation gates remain separate and open unless independently evidenced as complete.

## 2. Starting point verified in the code

| Area | Current implementation | Required change |
|---|---|---|
| Routes | App.jsx mounts page components directly | Shared layout wrapper without changing route/access semantics |
| Navigation | BottomNav.jsx uses the same sticky bottom nav at all widths | Adaptive navigation with all existing destinations reachable |
| Recipe | RecipePage.jsx is a max-width single column; ingredients precede method | Mobile tabs; wide side-by-side layout |
| Cooking | CookMode.jsx combines lifecycle/state/effects with presentation | One stable controller and reusable presentation components |
| Session state | store/cookSession.js has imperative, owner-scoped per-attempt persistence | Retain this contract; do not replace it with device-specific state |
| Presentation | No responsive breakpoint classes/media queries found in src during inspection | Mobile base styles with explicit wider-layout enhancements |
| Ingredients | Display scaling uses scaleIngredientText; general recipe API returns method strings | Reuse current display behavior initially; author reliable step/ingredient links separately |
| Teaching | Snapshots retain structured step IDs and schema-v2 lessons | Both compact and wide cooking views consume the same retained content |

## 3. Architecture and responsive contract

### Shared logic; adaptive presentation

Use the existing React 18 / React Router / Zustand / Tailwind stack. CSS should do most layout adaptation. Do not add user-agent detection, device-specific URLs or another component framework.

Proposed file boundaries (create only where extraction/reuse warrants them):

```text
frontend/src/
  components/layout/
    AppLayout.jsx          # shared application chrome
    AppNavigation.jsx      # one destination definition, compact/wide presentation
    CookingLayout.jsx      # minimal cooking chrome and safe-area-aware actions
  components/recipe/
    RecipeSections.jsx     # Ingredients / Method state and responsive arrangement
    IngredientList.jsx     # shared rendering; recipe or retained snapshot input
    MethodList.jsx
  components/cooking/
    CookStep.jsx
    CookActions.jsx
    CookIngredients.jsx
  hooks/
    useCookController.js   # extracted existing lifecycle, invoked once per route
  pages/
    CookMode.jsx           # stable owner of controller and adaptive view
    RecipePage.jsx         # current data/access owner with extracted sections
```

Keep existing stores/APIs as the authority for their current responsibilities. Extract CookMode's existing local/effect logic into one controller rather than moving everything into a new global store. A custom hook invoked twice creates two independent controllers: do not mount it inside separate mobile/desktop trees.

- Stable state owner above any layout branch: step, timer, help, completion phase, errors, reflection draft and session identity.
- Layout changes must not trigger snapshot capture, API mutation, new session creation, step resets or duplicate timer/audio effects.
- No `key={viewport}` or conditional remount of the route/controller.
- Prefer one DOM instance of ingredients/method arranged with CSS. If duplicated navigation chrome is needed, hide the inactive copy from layout and accessibility; never duplicate form IDs or stateful editors.
- Use a small matchMedia hook only for behavior that CSS cannot express (for example, closing a compact ingredient dialog when its wide panel becomes visible). Its subscription must not own business state.

### Initial layout ranges

These are implementation starting points, not device identities. Validate with real EN/DE content and zoom before freezing them.

| Available viewport | Starting behavior |
|---|---|
| Below 768px | Compact navigation; recipe tabs; single-column cooking; ingredient sheet/dialog |
| 768–1023px | Tablet layout; use two columns only if each remains readable; touch-sized controls |
| 1024px and above | Persistent side navigation for management; wider library/plans; ingredients beside method/current step |

When a sidebar reduces available content width, keep the compact recipe arrangement until both columns actually fit. Grid column count follows available space, not a hard-coded device label. A touch-capable tablet/laptop does not get smaller targets just because its viewport is wide.

Use one document scroll area by default. Dialogs may scroll internally when necessary. Do not create independently scrolling desktop ingredient/method panes without a demonstrated need.

## 4. Reviewable implementation tasks

### #60a — Baseline, contracts and responsive visual approval

1. Recheck current local/remote implementation state before starting; create an isolated `codex/` implementation worktree from the verified base. Preserve local main, this planning diff and user-authored plans. Fetch/inspect remote state before choosing a base; never silently discard newer work.
2. Record the baseline test results and screenshots for recipe, Cook Mode, library, groceries, plans and History. Inventory settings/login/share/error/locked states so the preview's simplifications cannot delete functionality.
3. Document agreed breakpoints, sticky offsets, state ownership and navigation destinations. Keep `/progress` working even if the displayed label is History.
4. Produce revised phone and desktop previews including sticky Ingredients / Method tabs, long DE content, ingredient access during cooking, timer, loading/error and locked states.
5. Present the previews, end that turn, and obtain explicit visual approval before implementing new UI. Resolve mobile navigation placement and recipe action placement in that approval, rather than leaving competing solutions to separate agents.
6. Once approved, update the relevant visual rules to supersede the old Baloo/oversized rounding/button-ledge requirements while retaining the CSS-variable theme architecture.

Acceptance: approved compact/wide layouts and a written state/interaction contract; no production layout changed during this task.

### #60b — Shared shell, design primitives and stable cooking controller

Depends on #60a. Integrator owns shared files.

1. Add responsive spacing/content-width tokens and approved typography/control geometry to index.css and Tailwind configuration. Retain existing blue/status variables and check light/dark text pairs.
2. Introduce AppLayout and a single navigation configuration. Preserve auth wrappers, route paths, language/theme/settings access and visible active state. Keep Cook Mode outside the management sidebar if approved.
3. Add a minimal CookingLayout with readable content width and space reserved for its action area. Account for phone safe-area insets and the on-screen keyboard; do not hide focused controls behind pinned bars.
4. Extract CookMode lifecycle into useCookController in a behavior-preserving change before rearranging its view. Preserve account/attempt/request scope checks and exact session capture before writes.
5. Expose only the data/actions needed by the UI: retained content, step, servings, timer, help, load/save status, finish/retry/restart/exit and reflection phase. Keep side effects out of presentational components.
6. Run existing session/guest/request-isolation tests. Add a test that repeated breakpoint changes do not create another controller, session, snapshot or write.

Acceptance: existing screens still function through the new shell; rotation/resizing does not reset state or duplicate requests. Shared interfaces are frozen before parallel page work.

### #60c — Recipe sections and persistent mobile navigation

Depends on #60b. Delivers the layout portion of #29/#30.

1. Extract IngredientList and MethodList without changing entitlement filtering, glossary links, prep checks, servings, nutrition or existing actions.
2. On compact screens, add exactly two section tabs: Ingredients / Method. Initial visit opens Ingredients; subsequent switches restore each section's reading position.
3. Keep the compact tab bar visible while reading the recipe; the large title scrolls away. Combine any short dish/tier context with the same sticky region rather than stacking separate headers. Retain access to version selection without confusing version controls with content tabs.
4. Implement per-section reading anchors/offsets scoped to dish, tier and language. Restore after layout, clamp if content changed, and exclude heights above the section so changing the header cannot move the user to the wrong step.
5. Preserve prep/method checks and servings through tab switches. Do not remount content controllers, refetch the recipe or reset the form when switching.
6. On wide screens, show ingredients on the left and method on the right; hide the tab controls and remove tab-only accessibility roles as appropriate. Crossing back to compact preserves the last section and relevant reading position. Repair focus if the previously focused element becomes hidden.
7. Implement tab semantics and keyboard navigation (associated tab/panel IDs, selected state, arrows/Home/End, meaningful focus). Inactive panels are not reachable by keyboard or screen reader. URL back navigation must remain predictable; ordinary tab toggles must not fill history with entries.
8. Place Start cooking and Add to groceries according to the approved compact action layout. Preserve auth prompts, errors and tier access; actions must never cover the final list item or tab content.
9. Cover long recipes, missing optional sections, legacy strings, locked previews, tab-to-tab return, changed serving count, browser back, zoom and orientation changes.

Acceptance: a user can check an ingredient and return to the same instruction without scrolling back manually. Desktop displays both sections. No content/access behavior is lost.

### #60d — Phone-first Cook Mode with ingredient access

Depends on #60b and IngredientList from #60c. This is the first end-to-end product acceptance priority.

1. Make the instruction, not its step number, the dominant text. Use a concise progress label and large, reachable Previous/Next controls. Keep Start over visually separate from routine step actions.
2. Provide an always-reachable Ingredients control. On compact screens, open an accessible sheet/dialog; on wide screens, show the same retained ingredient list on the left and the wider current-step panel on the right. Keep DOM and keyboard reading order aligned with the visual order.
3. Ingredients must come from the active attempt's snapshot, never a fresh live-recipe fetch. Legacy no-snapshot attempts retain their existing unknown-source behavior; do not manufacture a current ingredient list under the old attempt.
4. Opening/closing ingredients or help must preserve current step, timer and help/form state. Dialogs support Escape, a visible close action, focus containment and return to the trigger. Avoid stacked ingredient/help dialogs.
5. Keep timer state in the stable controller. Test pause/resume and a timer expiring while ingredients are open; any timer attention remains perceivable without closing the dialog. Preserve existing intentional step-transition semantics unless separately changed and tested.
6. Retain the current keep-screen-awake capability with safe cleanup. Verify background/foreground and permission/unsupported behavior; reacquire while visible where supported without creating an extra cooking session. Do not promise guaranteed background alarms or full offline support.
7. Render retained contextual lesson help and authored cues only where available. Do not derive teaching prose, practice evidence or recommendations from the mockup or viewport.
8. Preserve completed-cook recovery, reflection editor, conflicts, retries, Continue without further changes, guest zero-personal-write behavior and legacy Start over choices.
9. Test a real phone-sized cooking journey, including rotation while timing, long DE instructions, account switches during delayed responses, finish/save failure and refresh before reflection.

Acceptance: users can cook, consult ingredients/help and complete or recover the attempt without losing their place. Wide layout remains fully functional using the same controller.

### #60e — Adaptive recipe library

Depends on #60b; can run parallel to #60c/#60d after shared contracts are frozen.

1. Replace oversized emoji meal/cuisine controls with approved compact filters. Preserve existing filter values, search, favorites and account behavior; do not add new backend filter capabilities implicitly.
2. Add a regular adaptive card grid and compact-list alternative using the same result data. Keep title, time, cuisine and meaningful available-version information in predictable positions.
3. Derive version count/labels from actual authorized API data. Do not hard-code three versions, show paid content as unlocked, invent durations or copy mockup nutrition values.
4. Ensure recipes without photos are intentionally presented. No placeholder image allocation that creates empty card space; real photography is a later asset decision.
5. Preserve search/filter state and reading position when returning from a recipe. View preference is cosmetic, not account data; favorites remain appropriately account-scoped.
6. Show useful empty, loading, failure and retry states. Keep filters accessible in DE and at narrow widths without horizontally scrolling category rails.

Acceptance: browsing works at phone/tablet/desktop widths, no nested interactive controls inside recipe links, and switching grid/list never changes the result set.

### #60f — Supporting screens and feature-parity pass

Depends on #60b; can run alongside the recipe/cooking work with bounded ownership.

1. Groceries: keep a touch-friendly checklist on phones; use wider grouping/organisation on desktop. Preserve household setup/invites, selection, editing and API error handling. Do not replace functionality with the preview's static list.
2. Meal plans: compact agenda/list on phones; use a wider weekly arrangement only where current plan data supports it. Preserve generation, saved plans, serving/tier references and shared links. Do not introduce required scheduling fields or a dinner-event model just for layout.
3. History: compact entries with accessible Edit reflection; retain independent confidence, optional/null answers and conflict review. Wider layout may align metadata but cannot reduce mobile capability.
4. Adapt glossary/lesson, settings, authentication, privacy and shared-plan pages to the shared shell. Check long help content, form keyboard behavior and current recommendation eligibility/navigation.
5. Preserve account-specific state boundaries and reset transient personal forms appropriately on account changes. Do not move auth/data effects into duplicate responsive navigation components.

Acceptance: all existing routes remain usable on both phone and desktop; no controls from the current app disappear because they were absent from the mockup.

### #60g — Structured step ingredients (separately gated follow-on)

Contract design may start after #60a; integration follows #60d. This is not required to ship sticky tabs, the ingredient drawer or the responsive layouts. Report it explicitly as pending if only those parts are delivered.

The current method API returns plain strings and display quantities are scaled from ingredient text. Reliable per-step quantities cannot be obtained by guessing ingredient names or replacing every number in prose.

1. Inspect ingredient parsing/sync, stable step identities, authoritative quantities/units and current nutrition behavior. Write a bounded contract before code: stable ingredient IDs, explicit step references and representation of partial/divided quantities (for example, half of an ingredient used now and the rest later).
2. Define a single display/scaling source for the full ingredient list and per-step amount labels. Keep unquantified items such as 'to taste' intact. Cover decimal commas, fractions, count units, unsupported text and EN/DE; do not silently alter nutrition math.
3. Add authored references to a reviewed starter recipe in both languages. Validate unknown/duplicate links and inconsistent allocations during sync. Broad catalog conversion is out of scope; remaining recipes use the complete ingredient list.
4. Extend new snapshot content and its deterministic digest with the new references/quantity semantics and an appropriate schema version. Maintain schema-v2 teaching recognition (the existing UI has an exact `schema_version !== 2` check that must become capability-aware).
5. Never rewrite existing snapshots. Older cooks without trusted mappings use their retained full ingredient list; legacy cooks without a snapshot use the existing legacy path. Do not fetch current mappings to decorate an earlier attempt.
6. Render a compact 'For this step' list generated from the authored references. Inline replacements within prose require explicit structured placeholders; no arbitrary regex substitution. Partial quantities must display the step amount, not the full recipe amount.
7. Add parser/sync, scaling, snapshot reuse/immutability, access and old-client tests. Do not bypass teaser filtering to expose restricted method content.
8. If any database migration is needed, test it on disposable fresh and populated PostgreSQL databases. If no suitable engine is available, report that verification blocked; SQLite does not satisfy it. Obtain culinary review before calling authored quantities ready for beginners.

Acceptance: linked step amounts and full-list amounts agree at all supported serving counts; old cooks remain unchanged. No misleading per-step quantities are displayed for unlinked recipes.

### #60h — Integrated verification and handoff

Starts with #60a baseline and finishes after #60c–#60f. #60g has its own additional content/backend gate.

1. Run all existing backend test files and frontend session/guest/hardening/palette tests using the project's documented environment. Run the production frontend build. Record exact commands, environment, pass/fail totals and any baseline failures.
2. Update existing browser checks only where presentation changed; preserve their behavioral assertions. Use the permitted browser tooling for interactive verification. Add responsive/tab/ingredient-access cases and integration-level state checks.
3. Exercise widths 320, 360/390, 768, 1024 and 1440px, portrait/landscape, light/dark, EN/DE and browser zoom. Prioritise phone testing before desktop polish, not as a final shrinking exercise.
4. Verify keyboard tabs/focus/escape, screen-reader names/states, touch targets, safe areas, virtual keyboard, no horizontal overflow and no sticky-content occlusion. Test long real content, not only short fixtures.
5. Exercise guest and signed-in attempts, locked tiers, account switches, new/resumed/legacy attempts, delayed failures/successes, ambiguous saves, reflection revision conflicts and confidence/history independence.
6. Record network/mutation evidence: tab switches and breakpoints cause no additional snapshot creation, cook logs, reflections or confidence writes; guest activity causes no personal writes. An authorized public snapshot request is not a personal write.
7. Verify external phone access to the local test environment through an explicitly configured, safe development setup; desktop emulation is not physical-phone acceptance. Prefer a physical iOS Safari and Android Chrome check if available; label unavailable devices as unverified.
8. Present screenshots of actual wired mobile/tablet/desktop screens, including loading/error/locked states. Request user approval; do not equate screenshots or a passing build with acceptance.
9. Update this document, PIPELINE.md and relevant visual/architecture rules with evidence and remaining gates. Do not leave a shipped label on unverified work.
10. Hand off a diff summary, test evidence, known limitations, rollback instructions and a suggested commit message. No commit/push/deploy or participant recruitment without a separate request.

Acceptance: no behavioral regressions, the phone cooking flow passes first, and every unverified environment/human gate is explicitly listed. Existing culinary and PostgreSQL gaps are not closed by this UI release.

## 5. Delivery order and agent ownership

| Increment | Tasks | Ownership / concurrency | Reviewable result |
|---|---|---|---|
| 1 | #60a | Integrator/designer | Baseline, contracts, approved responsive preview |
| 2 | #60b | Integrator; single writer on App.jsx, index.css, Tailwind, controller and shared navigation | Adaptive foundation without lifecycle regressions |
| 3 | #60c then #60d | Recipe/cooking owner; sequential integration of shared IngredientList | Phone-first recipe-to-cook journey |
| 4 | #60e and #60f | Library owner and supporting-pages owner, parallel after increment 2 | Library/management parity |
| 5 | #60h | Reviewer/integrator; tests start earlier, final acceptance here | Verified responsive release |
| Follow-on | #60g | Content/backend owner plus cooking owner at integration | Trustworthy per-step quantities for reviewed linked recipes |

Before dispatch, each owner receives the verified base, exact owned files, shared contracts, tests and exclusions. Each uses an isolated worktree. One integrator handles locale-key merges and shared-file edits; agents supply required EN/DE keys without racing on the same files. Do not merge a stale duplicate implementation of the controller, navigation, tabs or sticky actions.

Each handoff must state: implemented scope, affected files, regression evidence, screenshots where appropriate, pending gates and whether another task can start. Assigning these tasks is a later action; this document does not start other agents automatically.

## 6. Readiness and rollback

- Keep increments independently reviewable. Avoid an all-at-once rewrite of every page and every state store.
- The core layout work (#60a–#60f) should require no new backend endpoints or database migrations. If one becomes necessary, explain the dependency and revise scope before proceeding.
- Keep old and new UI contracts compatible during each increment; revert the affected presentation increment if verification fails without deleting sessions, snapshots or mutation receipts.
- Release the responsive UI independently of #60g if its data contract/content is not ready, with full ingredient access retained and per-step amounts explicitly listed as deferred.
- No release claim until engineering checks and wired-UI approval are complete. Beginner observations still wait for the separate culinary/engineering gates.
