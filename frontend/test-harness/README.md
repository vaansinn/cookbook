# Mounted private-planning recovery harness

Open [the harness](http://127.0.0.1:5173/test-harness/planning-recovery.html)
on the existing loopback Vite development server, then click **Run mounted recovery
tests**. Keep the tab foregrounded during the run. Each scenario reports PASS/FAIL
in the page; all eight must pass. A failed case is isolated from the following case.
The button can run the suite again. Reload first after production source changes.

If the local Vite server is not already running, start the existing development
configuration from the worktree root (no dependency installation or dotenv load):

```powershell
node frontend/local-dev.mjs
```

The Flask/PostgreSQL server is not needed. The configured Vite API proxy is never
used by this harness. This HTML is a separate development entry, not imported by
`src/main.jsx` or included in the default production build's `index.html` entry.
Do not add it to production build inputs or deploy it.

## Isolation

- `planning-sandbox.mjs` has no static production imports. It replaces this
  window's `localStorage` and `sessionStorage` with a memory map **before** the
  dynamic import that loads the actual auth/settings stores. It never reads,
  copies, clears, or restores native persisted storage. Other tabs are untouched.
- The real auth store receives only a synthetic verified account through Zustand
  `setState`. Authentication endpoints are never called; the token is not a JWT.
- The actual `PrivatePlanningPage`, `usePlanningWorkspace`, and planning adapter
  run inside a mounted React root and `MemoryRouter`. There are no mocked hooks,
  adapter replacements, rewritten production modules, or production test seams.
- This window's `fetch` has no native fallback. Only synthetic planning requests
  reach an in-memory fixture. All other fetch destinations throw. XHR and beacon
  are blocked. A page CSP also sets `connect-src 'none'`, `form-action 'none'`, and
  blocks frames/workers. It permits local module/style loading, but blocks real
  API requests and WebSockets even if code misses the mock.
- Consequently Vite HMR connection warnings are expected. Reload to load changes.
  Global overrides last until this harness document is closed or navigated away;
  nothing is registered in a service worker or production entry.
- Web Locks are simulated in this one window, including one pre-send lock denial.
  This is **not** real cross-tab locking/storage acceptance.

## Scenarios and evidence boundary

1. Rename commits in the server double but loses its response. Retry is visible,
   focusable, and clickable inside the native modal. The adapter sends identical
   bytes and reconciles exactly one receipt.
2. A 409 retains the same mounted input and draft. Opening submitted details is
   required before discard. Reload exposes remote values; explicit latest-revision
   review enables save without submitting automatically. The next mutation has a
   new ID and the updated revision.
3. A foreground focus event starts a held snapshot load while the editor remains
   mounted. Save is blocked during loading and fields survive completion.
4. Meal deletion creates an undo token. A subsequent rename fails before transport
   at the writer lock. Undo remains visible, then restores the same meal identity.
5. Lost response followed by JWT 422 preserves the exact pending outbox and offers
   retry, never discard. Synthetic reauthentication remounts the actual page;
   retry retains identical bytes and causes no second commit.
6. A plan repeat commits but loses its response. Exact retry must reconcile one
   copy/receipt, preserve the source plan/meal, and navigate the real MemoryRouter
   to the copied plan with its heading visible. `mounted-route` is a test-only
   observer, not a navigation mock.
7. Hold the English catalog list while German loads, then hold German alpha
   detail while beta loads. Explicitly select beta's German variant, release both
   stale responses, and require the selected language/variant, authored preview,
   servings, and draft group to survive into exactly one item-create command.
8. Hold destination-plan B's meal list while choosing C. A late B response must
   not replace C. Force a 409 on item transfer; submitted-details review, discard,
   and explicit latest review must preserve the mounted destination fields. Hold
   the new-revision C read too, then require the chosen meal after completion and
   exactly one successful transfer using a fresh mutation ID/revision.

Catalog doubles follow `planning_catalog.py`'s `validate_content`, `_metadata`,
and `_entry_view`: summary variants have `id`, `base_servings`, and `title`;
localized detail variants additionally contain authored ingredients. They are
synthetic `planning_example` records with canonical SHA-256 content digests, not
recipes or production seeds. Delayed GETs capture their response before release,
so these cases really deliver stale data. No endpoint publishes catalog content.
The fixture allows only its seeded plan/meal collection paths and the two exact
synthetic catalog entry/revision paths; unrecognized requests have no fallback.

These are mounted browser integration checks using native forms/dialogs and DOM
events. They do not establish SQL correctness, real authentication, physical-phone
usability, trusted pointer input, cross-tab behavior, or full planning parity.
Fixtures deliberately support only the routes/commands these scenarios require;
an unexpected request fails instead of forwarding to an API.

The harness import graph can be compiled without writing output:

```powershell
node --input-type=module -e 'import {build} from "esbuild"; await build({entryPoints:["test-harness/planning-sandbox.mjs"],bundle:true,write:false,outdir:"test-harness/.validation-not-written",format:"esm",platform:"browser",define:{"import.meta.env.DEV":"true"}});'
```

Compilation is not a browser PASS. Record the page's final result separately.

## Browser execution — 2026-09-13

The coordinating reviewer reports an actual CUA reload followed by **Run mounted
recovery tests**, with **PASS 5/5 confirmed in the visible DOM**. They also verified
that no real auth/planning browser data changed. This records their browser
execution report; this QA seat did not independently operate that browser run.

The preceding 4/5 run exposed a harness helper bug: clicking a details summary
opened its ancestor and then toggled it closed. The helper now clicks that summary
only once, and the 409 test additionally asserts one click and an open details
element. The original enabled-recovery and explicit-latest-review assertions
remain intact; no production recovery change was required for this correction.
The fixture also supports empty meal/event item GET collections at its current
revision, without a real-network fallback.

The coordinator separately reports **214/214 frontend/prototype tests passing**
with the required `extensionlessLoader`, and a **150-module production build
passing**. These results were not rerun independently by this seat for this entry.
They describe the tested dirty-worktree state, not a pinned commit or subsequent
edits. The five mounted scenarios do not cover item editing, configured catalog
selection, or plan/event repeat navigation; those remain separate bounded QA
targets at that execution. All other evidence limitations above still apply.

## Eight-case extension — verified 2026-09-13

The coordinating agent opened the isolated harness in CUA, clicked **Run mounted
recovery tests**, and read **PASS — 8/8** in the visible final DOM. The prior 6/8
run exposed two real readiness gaps, not fixture failures: a child effect reported
readiness one render late, and transfer readiness did not require the selected
destination. The editor now owns the selector/read controller directly; the
footer and submit handler share its current readiness. The destination is
controlled and retained during revalidation, but cannot be submitted until it is
present in the current loaded collection. The eight-case assertions were retained.
Behavior tests also cover loading/errors, missing choices and destination membership.

These are synthetic-transport mounted tests, not real catalog publication or SQL
acceptance. Real event-repeat navigation, cross-tab sign-out/sign-in and SQL copy
fidelity have separate smoke/rehearsal evidence in the X1b contract and recovery
documents. Full physical-phone and accessibility acceptance remain open.
