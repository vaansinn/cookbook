# Bundled Android development app

The real React interface is now packaged **inside the APK**, not loaded from
Vite on port 5173. Data still comes from the local PC:

`packaged UI (https://localhost) -> native HTTP -> device loopback:5100 -> paired ADB reverse -> Flask:5100 -> PostgreSQL`

This is development-only, not an offline product, production native-auth approval
or a Play release candidate. Release variants remain disabled. The separate
welcoming-kitchen design prototype is not substituted for the functional UI.

### Authentication batch update — 2026-10-05

The vault plugin and browser/native session runtime now exist. The installed
Bundled Dev app deliberately still uses the legacy login against the unchanged
working backend. Its account and planning data have not been migrated or reset.
`-SessionAuth` enables the new native runtime **only for an explicit acceptance
build**; do not install that build against the old backend. The default command
below retains the legacy runtime. Normal production *web* builds now select
sessions to match the strict backend; this does not change Vite development mode.

The updated development APK was installed without clearing app data. S25 tests
passed encrypted-vault round trips, fresh IVs, tamper rejection and cookie-handler
isolation after Activity recreation. Recreation needs an unlocked foreground
Activity; initial stopped-Activity attempts failed and were not counted as passes.
The isolated test namespace never reads the user's actual credentials.

Before native cutover, still prove the complete native JS/API session flow,
restart/refresh/logout/account switching, cookie behavior across in-flight HTTP
and recreation, and delayed old-vault operations versus replacement Activities.
These are engineering acceptance gates, not new product choices. Password-manager
provider acceptance and hosted domain association remain separate device/release
checks. [Full evidence and rollout contract](../docs/councils/launch-readiness/authentication-batch-2026-10-05.md).

## Preserve the first app

| App | ID | Purpose |
| --- | --- | --- |
| Cookbook Local Dev | com.cookbook.localdev | Original port-5173 harness; user confirmed it opens on S25 |
| Cookbook Bundled Dev | com.cookbook.bundleddev | Packaged interface; only API uses the PC |

The bundled app installs alongside the first app. It does not read, overwrite,
migrate or clear its tokens, preferences, cooking attempts or pending changes.
Sign in separately using synthetic test data. Both apps use the same local SQL
backend but have separate native-local storage. Final product identity is undecided.

## Build

Requires Node >=22, JDK 21, Android SDK 36, build-tools 35.0.0, existing frontend
dependencies and the pinned mobile dependencies (`npm ci --ignore-scripts` from
mobile). Project-local tools under `.local/android-toolchain/` leave system
Java/Android Studio untouched. Do not regenerate the owned project with cap add.

From repository root:

```powershell
./mobile/build-local.ps1 -NodePath 'C:/path/to/node.exe' -VerifyReleaseBlocked
```

Optional -JdkPath/-SdkPath select compatible installations. This builds a separate
native entry into ignored mobile/dist, disables dotenv/inherited VITE_* injection,
syncs assets, runs mobile tests, compiles the debug APK, runs Android unit tests
and lint, and verifies release tasks are absent. It does not overwrite Flask
static assets, install on a phone, or expose a listener. Process environment is
restored. Capacitor is pinned to 8.5.2 and the Gradle distribution checksum is pinned.

Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
No Play account, upload key, production endpoint or public service is configured.

## Connect the local backend

Start the existing PostgreSQL and Flask through
[local-development.md](../docs/local-development.md). Do not initialize/reset an
existing database just to test Android. API readiness:
http://127.0.0.1:5100/health/ready. **Vite is not needed by this app.**

Use explicitly authorised USB or paired wireless debugging on a trusted network.
Enter pairing codes locally, never in the repo. Select the exact intended device.

```powershell
$adb = './.local/android-toolchain/sdk/platform-tools/adb.exe'
& $adb devices -l
& $adb -s DEVICE_SERIAL reverse tcp:5100 tcp:5100
& $adb -s DEVICE_SERIAL install -r './mobile/android/app/build/outputs/apk/debug/app-debug.apk'
& $adb -s DEVICE_SERIAL shell am start -n com.cookbook.bundleddev/com.cookbook.localdev.MainActivity
```

At the end remove only this mapping:
`& $adb -s DEVICE_SERIAL reverse --remove tcp:5100`.
Reconnection/reboot may require reapplying it. Never expose Flask/PostgreSQL to the
LAN, remove all reverse mappings, kill unrelated ADB processes, clear app data or
uninstall to fix connectivity. The older app's 5173 mapping can remain.

## Device verification

`./mobile/test-device.ps1 -Serial DEVICE_SERIAL` builds/installs a test runner,
checks packaged startup without a 5100 mapping, then checks guest recipes after
mapping only the API port. It refuses to replace an existing 5100 mapping.
It does not create accounts/plans or touch the older app. On success it leaves
the mapping and bundled app open. The test runner package is
`com.cookbook.bundleddev.test`; it is not a release component.

Remaining interactive acceptance:

- Synthetic login, save a plan, close/reopen and confirm SQL persistence.
- Network loss during reads/writes and explicit pending-command recovery.
- Android Back/dialogs, keyboard, system bars, TalkBack and large text.
- Account switches, process recreation, return to cooking, EN/DE and light/dark.
- Locked-phone audible alarms remain separate implementation/acceptance work.

## Transport and security boundary

The native entry installs transport before mounting the app. Axios uses its fetch
adapter and planning uses the same injected fetch. Web clients keep relative /api
and normal browser fetch. No global fetch/XHR patch, CORS weakening or auth-storage
change is introduced.

Only /api/... or https://localhost/api/... are mapped to fixed local API port 5100.
JSON bodies, auth headers and exact serialized mutation payloads are retained.
Foreign origins, traversal, redirects and non-JSON uploads fail closed. HTTP
validation/conflict statuses remain visible; no automatic retries occur.

Aborts and a 15-second total deadline discard late results. Native requests may
still commit after JS cancellation: existing receipts/outbox rules remain essential.
There is no new offline queue, account import or storage migration.

Navigation stays on exact https://localhost. Non-loopback cleartext is denied.
Only INTERNET is declared. Backup/transfer and native service-worker registration
are disabled. Existing browser/old-app data is untouched. Capacitor core plugins
still exist; the JS transport is not an OS network sandbox. Loopback does not
authenticate the API server: use only this trusted local backend.

Existing browser-style token storage remains inside the native WebView.
Native credential storage, server-side revocation, verification/recovery and
production HTTPS transport are separate release work. Synthetic accounts only.

## Evidence — 2026-10-05

- Mobile build/config/transport/integration tests: **26 passed**.
- Android debug build, unit tests, lint and absent release tasks: passed.
- Existing frontend/prototype suite: **353 passed, 1 skipped**.
- Normal web build: passed, 162 modules; mobile build: passed, 166 modules.
- S25 instrumentation: packaged interface mounted at https://localhost with no
  API-port mapping; a second run loaded real guest recipe links through native
  HTTP after mapping port 5100. Both runs passed. Native service worker was absent.
- Installed/opened Cookbook Bundled Dev and its test runner alongside the original
  app. Left only the new API mapping in addition to the untouched original mapping.
- No account/plan was created or changed by these device checks. Authenticated
  save/reopen persistence, cancelled-write recovery and visual acceptance remain open.
- Android lint: 0 errors, 16 warnings (mostly generated resources/dependency
  update notices); not waived for production. Four Android unit tests passed.
- A separate agent reviewed the transport integration after implementation and
  reported no additional concrete findings. This was not a full release council.

The authoritative roadmap remains [TODO](../TODO.md). No automatic commit,
push, deployment, account enrollment or real-user data migration.

Verified debug APK SHA-256:
`7f93d750838ed327790f6616554d9b432f5d5f4298314540dea7c1df8bec1397`.
This identifies this local build; rebuilding may change the digest.
