# Worker update/offline gate — isolated manual browser harness

Start only when port **5189 is unused**, from the worktree root:

```powershell
$env:COOKBOOK_WORKER_HARNESS_CONFIRM = 'isolated-loopback-worker-fixtures'
node frontend/test-harness/worker-server.mjs --serve
```

Then main may use CUA at **http://127.0.0.1:5189/**. No browser automation is
performed by these files. Do not use Vite/5173: the harness refuses it. No database,
Flask or other development server is needed. The server binds only 127.0.0.1,
rejects other Host/Origin values and credentials, serves a fixed fixture allowlist,
and has no API proxy or outbound network code. Do not expose/tunnel/deploy it.
No dotenv is loaded. Installed frontend esbuild bundles actual CookMode and its
dependencies **in memory**, without writing a build or altering production files.
Production sources are captured at server start; restart on an unused clean test
origin/context to test later edits. Source hash appears in the page/server output.

Use a fresh dedicated browser context/origin without existing registrations,
caches or credentials. Unknown registrations/cache names cause refusal, never
automatic cleanup. Native app localStorage/sessionStorage are replaced before
imports. Only a random-run-prefixed **synthetic envelope** is persisted in native
sessionStorage to survive same-tab reload. Real account/token/cook keys are never
read. Auth and snapshots use a rejecting synthetic Axios adapter; Finish is an
intentional synthetic 503. Wake/audio are disabled. Real Web Locks remain scoped
to this dedicated origin. CookMode/controller/session code is real; snapshot
availability, cross-tab persistence and physical alarm delivery are not tested.

## Release model and manual sequence

A is explicitly **synthetic history**: current worker policy with only SHELL_CACHE
changed to `recipe-drawer-shell-worker-a`. B serves `frontend/public/sw.js` bytes
unchanged. This is not proof that a historical binary works with new records.
Both fixture application bundles contain the current CookMode. No skipWaiting,
clients.claim, update message seam or automatic navigation is injected into either
worker. The real browser performs registration/update/waiting/activation.

1. Register A. Inspect until active. Explicitly reload to obtain a controller.
   Warm probes; Inspect must show A/B probe URLs in the A cache. Start the **10-minute
   timer** in actual CookMode; Capture active cook.
2. Serve B/check update. Inspect until `waiting=installed`. Compare active cook:
   PASS requires unchanged document/controller, attempt, snapshot, step, and
   running deadline. Do not edit the timer or wait until expiry before comparison.
   Multiple open controlled tabs must not be forced to reload/activate.
3. Before activation, set Probe origin=`drop`, fetch A: expect cached HTTP 200.
   Confirm the server's `counts.dropped` increased (not merely a browser HTTP-cache
   hit). Set `500`: expect HTTP 500, with the good CacheStorage entry preserved;
   return to `drop`: expect 200. A `404` or wrong MIME must invalidate the entry;
   a following `drop` must produce 503. Warm again to recover setup.
4. Synthetic private A then B online must return the requested identity; Inspect
   must show **no `/api/worker-private` cache key**. Private API=`drop` must return
   503, never the previously read account. This is synthetic transport/cache
   isolation evidence, not authentication/entitlement acceptance.
5. Set probes online and retain A. Record evidence, then close **all** harness
   tabs; reopen the same URL. B should be active without a waiting worker. Inspect
   old-cache deletion and preservation of `worker-harness-unrelated-<run>`.
   Fetch old A online: retained server asset should be 200. This demonstrates the
   host's retained-file strategy is independent of worker cache retention.
6. To demonstrate the missing-retention boundary: warm B's probes; remove A assets,
   fetch A (404), retain A again but set `drop`, fetch A (503). A cached former
   release is **not** promised after a 404 invalidation/old-cache cleanup. Record
   this as a release gate/known behavior, not an unexpected harness failure.

`drop` destroys the socket for only the controlled probe/API routes; control,
worker script and application shell remain available. It exercises a **real worker
fetch rejection**, not OS airplane mode, full-origin offline navigation, process
termination, storage eviction, iOS suspension or background alarms. Public fixtures
use `max-age=0, must-revalidate` to avoid HTTP-cache stale-on-error confusing the
result. Leave DevTools “Bypass for network”, “Update on reload” and “Disable cache”
off: those can change the requests/lifecycle being tested. No browser pass is
claimed until main records the actual observations.

## Cleanup and remaining policy

Use **Review cleanup** only on this dedicated origin, then choose the in-page
**Confirm cleanup of this test run** or **Cancel cleanup**. The first click and
cancellation do not remove anything. No native JavaScript confirmation dialog is
used. Confirmation disables controls during cleanup and prevents duplicate calls;
a failure is reported as possibly partial and requires a new review before retry.
Confirmed cleanup unmounts the
synthetic cook, unregisters only this run's matching worker, deletes only its two
known worker caches plus unrelated marker, and removes only its test envelope.
Close every harness tab, then stop this server with Ctrl+C. A new server run has a
new identity and refuses leftover prior-run registrations rather than deleting
them. If the browser was interrupted, inspect/clear **only 127.0.0.1:5189** in its
dedicated test context; do not clear development or production origins.

An already-running server retains its compiled bundle. This source change cannot
dismiss a native dialog left by an older harness: the user must resolve that dialog
first. Do not restart the server, rotate its run identity, or assume cleanup
completed merely because the future source now uses an in-page confirmation.

### Recorded isolated residue and freeze — 2026-09-13

Main reported successful real-browser A activation, warmed-cache socket-failure
fallback, running CookMode/B-waiting comparison with unchanged attempt/snapshot/
deadline, 500 preservation, wrong-MIME invalidation, synthetic private A/B reads
without API caching, and normal B activation after closing all controlled tabs.
Old A cache removal, unrelated-marker preservation, retained A retrieval and
removed-A failure were observed. These are Main's CUA observations, not a new
browser run by this reviewer.

The old bundle's native cleanup confirmation blocked CUA. Main subsequently closed
the affected tab using native `Tab.close`; this removed the UI blockage, but does
**not** establish that cleanup ran. Original B registration/caches may remain on
**http://127.0.0.1:5189 only**. They are isolated temporary synthetic test residue,
not application/account data. Registration/cache cleanup and any remaining test
storage are unverified; no further inspection or deletion was performed here.

The retained running server (Main's execution session 57927) still holds its old
compiled bundle. The new in-page cleanup is source-tested, not browser-accepted on
that old run. Do not restart it, rotate/adopt its identity, add a bypass flag, or
describe tab closure as cache/registration removal. Leaving this explicitly
recorded test-origin residue is acceptable for this handoff; any future cleanup
must remain separately scoped to that dedicated test origin.

Code/test freeze: 23 harness checks plus 13 existing worker checks passed (36/36),
including four new in-page confirmation regressions. This residue note is a
documentation-only follow-up; no server, browser, database or production changes.

Current worker source deliberately returns 500 rather than cached content, and
deletes old owned cache namespaces at activation. This harness changes neither.
Required release decisions remain: retained server-asset compatibility window,
safe update handoff with live cooks, and the exact offline/product promise.
Claiming old-build recovery or comprehensive offline cooking would need more
evidence and scope; the harness must not silently implement either policy.

Pure safety/build check (no server bind or browser):

```powershell
node --test tests/frontend/test_worker_harness.mjs
```
