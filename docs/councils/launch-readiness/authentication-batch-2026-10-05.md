# Authentication hardening batch — 2026-10-05

Status: local candidate implemented and tested; native session cutover and public
release remain gated. The current working account/database have not been migrated.

## Baseline and boundaries

The creator confirmed a plan created in Cookbook Bundled Dev survives restart and
appears when signing into the local browser with the same account. This is evidence
of shared local PostgreSQL persistence, not production readiness or all-feature parity.
Keep cookbook_dev, its accounts/plans, existing cooking attempts and pending planning
commands. Do not read passwords, copy personal data into test fixtures, or reset data.

## Delivery contract

1. Shared server session registry; short-lived JWT access credentials retain the
   existing route/decorator contract while every credential with a session ID is
   checked against live revocation state. Browser sessions use HttpOnly cookies and
   CSRF/origin checks; native sessions use bearer access credentials and encrypted
   device-local renewal credentials. Public UI markers are not credentials.
2. Rotating renewal credentials, absolute expiry, current-device logout, logout-all
   and reset revocation. No automatic replay of a possibly committed planning write.
3. Password-manager-friendly forms, visible labels, password visibility controls,
   EN/DE and existing design tokens. No visual redesign.
4. Hashed expiring one-use recovery/verification secrets and a development-only mail
   delivery seam. Production sender, DNS/domain association and real delivery stay
   separate acceptance gates. Verification is additive; do not silently lock out
   existing accounts or alter recipe entitlements.
5. Disposable PostgreSQL migration tests, existing regressions, Android build/lint,
   isolated device-vault checks and integrated browser acceptance before cutover.

## Parallel ownership

- Backend: auth session/recovery models, migration, routes and identity checks.
- Frontend: runtime credential transport, auth store and account-switch fencing.
- Form UX: existing login/register forms, labels/autofill and locales.
- Integrator: Android vault, local test environment, integration and independent review.

These are bounded implementation assignments, not a completed five-person council review.

## Risks requiring evidence

- Refresh rotation across browser tabs: serialize renewal and avoid replaying stale
  refresh credentials or replacing a newer account after an old response.
- Native storage failure: visible recovery, never plaintext fallback or silent reset.
- Logout during a network outage: local sign-out is not proof of server revocation.
- Old installed clients: legacy acceptance is transitional, must be disabled for
  release. One-time sign-in after cutover preserves account data.
- Cookie-authenticated legacy routes: review CSRF and any GET that mutates data.
- Session removal on account deletion and credential redaction in export/logging.

## Acceptance ledger

### Implemented

- Additive migration `0d97b865efa6`: sessions, hashed rotating refresh credentials,
  hashed reset/verification codes, bounded throttle counters, verification state
  and legacy-token revocation cutoff. Existing account IDs/passwords/plans survive.
- Browser access/refresh cookies are HttpOnly, SameSite=Lax, Secure by default;
  trusted-origin and session-bound CSRF checks cover writes. The loaded session ID
  fences stale tabs against a replacement account. Cross-origin credentialed CORS
  remains disabled; browser clients use their same-origin API proxy.
- Native bearer access stays in memory; renewal credentials use Android Keystore
  AES-GCM-encrypted preferences, serialized writes and explicit storage failures.
  No plaintext fallback. Native Java HTTP does not inherit the browser cookie jar.
- Access expires after 15 minutes; families expire after 30 days. Refresh rotation,
  replay revocation, logout, logout-all and reset revocation are transactional.
  Known expired/revoked family credentials can repeat current-device logout only,
  after session/transport/CSRF validation; they cannot regain account access.
- Cross-tab Web Locks have bounded acquisition and stale-request fences. Pending
  writes are never automatically replayed. Revocation proof is bound to its exact
  session. A fallback that signs out only this device explicitly warns that other
  sessions were not confirmed signed out.
- Login/register retain existing visuals with visible labels, password reveal,
  autofill attributes and accessible errors. New manual-code recovery and Settings
  verification/logout-all controls are translated in EN/DE and gated to session mode.
- Recovery messages go only to ignored `.local/auth-mail/*.eml` in the disposable
  development candidate. No emails are sent. Codes are never auto-consumed; successful
  reset requires a separate sign-in. Browser account deletion clears all auth cookies.
- Grocery GET no longer creates a household list as a side effect.
- CI gains a guarded PostgreSQL credential-race check after the existing release
  rehearsal. The populated-shopping verifier retains every old column fingerprint,
  including user fields, and separately checks new defaults and empty auth tables.

### Evidence

| Check | Result / boundary |
|---|---|
| Full backend discovery | 511 passed; subsequent verifier-only additions also pass their 38-test suite |
| Auth backend focused rerun | 25 passed after idempotent logout and deletion-cookie fixes |
| Full frontend suite | 368 passed, 1 existing skip |
| Approved design-prototype tests | 90 passed |
| Mobile JS/build/transport/storage tests | 32 passed |
| Android builds | Legacy and opt-in session builds, 5 unit tests and lint passed (0 errors, 16 warnings); release tasks remain absent |
| Production web build | Passed in separate `.local/auth-web-build`; existing >500 kB bundle warning remains |
| PostgreSQL fresh/history | Additive migrations, repeated recipe/glossary/skill/lesson sync and planning transactions passed |
| PostgreSQL auth races | Concurrent refresh/replay, one-use reset, verification, export redaction and deletion cascades passed |
| Full five-database rehearsal | Passed all five stages: fresh/history/sync/planning, repeat, shopping/templates/preferences, new-format backup/restore and populated X1b-to-current upgrade |
| Real browser | Synthetic login, SQL plan creation, refresh retention, verification, two-tab logout, recovery-code request and revoked-session logout warning passed |
| Responsive account controls | EN/DE and light/dark inspected; 320/390 recovery views have no horizontal page overflow; earlier form review also covered landscape |
| S25 instrumentation | 2 passed: encrypted round-trip/fresh IV/tamper handling and cookie isolation after Activity recreation |

Initial S25 recreation attempts failed because the Activity stayed STOPPED. The
user unlocked/opened the app and the unchanged recreation assertion then passed.
This is not evidence of full background/process-death session behavior. Browser
password-reset submission itself was not automated; endpoint/concurrency tests
cover synthetic reset, while actual password-manager and user-reset acceptance
remain separate.

Independent bounded reviews found and closed stale logout proof, expired-session
recovery loops, unbounded lock acquisition, missing deletion-cookie clearing,
native vault worker lifecycle ordering and incomplete backup exclusions. These
reviews were not a full five-person council or an external security audit.

### Running environment and reproduction

- Working app: browser `127.0.0.1:5173`, API `127.0.0.1:5100`, PostgreSQL
  `127.0.0.1:55433/cookbook_dev`. No reset, account copy or personal-data fixture.
- Installed `Cookbook Bundled Dev` was updated without clearing storage, but keeps
  **legacy authentication**. The new vault was tested in an isolated namespace.
- Candidate browser must use **`http://localhost:5180`**, not `127.0.0.1`: cookies
  ignore ports. `frontend/auth-candidate.mjs` proxies only the guarded disposable
  API launched by `scripts/auth_candidate.py` on loopback 5101. Stop those candidate
  services before switching test clusters; never repoint them at cookbook_dev.
- Candidate scripts require the same exact disposable target URLs/confirmation as
  `scripts/verify_postgres.py`. Run the migration verifier on empty targets first;
  neither serving nor auth-race verification resets an existing database.
- `python -I -B scripts/auth_postgres_checks.py` runs the session concurrency checks
  against `cookbook_test_fresh` only. Never pass real user/production data.
- Normal web **builds** select sessions; Vite **development** remains legacy unless
  explicitly enabled. `mobile/build-local.ps1 -SessionAuth` makes an acceptance APK
  but does not install it. The ordinary mobile build explicitly stays legacy.
- The ignored `.local/cookbook-session-candidate-20261005.apk` is built, **not
  installed or approved for cutover**. Standard APK output was rebuilt in legacy
  mode afterward. The existing user app and its ADB mappings are preserved.
- Test clusters are retained in `.local/postgres-auth-20261005` and
  `.local/postgres-auth-release-20261005`; they contain synthetic data only.
  Do not blindly rerun empty-target verifiers or reset an occupied cluster.
- Screenshot evidence: `.local/auth-recovery-mobile.jpg` and
  `.local/auth-signout-warning.jpg` (actual wired UI, not mockups).

## Remaining gates and next engineering increment

1. Native end-to-end acceptance on a **separate synthetic test environment**:
   new JS/API login, rotation, process death/restart, logout and account switching.
   Validate actual HTTP cookie behavior across an in-flight request/recreation and
   delayed old-vault operations versus replacement Activity operations. The two S25
   storage/lifecycle assertions do not prove this complete path.
2. Rehearse a controlled local cutover, then back up and additively migrate the
   creator's database, coordinate API/browser/APK activation and retire legacy
   tokens. Expect one deliberate sign-in; preserve accounts, plans and drafts.
   No automatic database downgrade: resurrecting old credentials is unsafe.
3. Real Android autofill-provider acceptance and domain/app association. Markup
   support is implemented, but compatibility with every password manager is not proven.
4. Before public release: chosen HTTPS origin, exact `AUTH_TRUSTED_ORIGINS`, secure
   cookies, production signing/secret management, real mail sender/DNS, asynchronous
   delivery/outbox, mail failure monitoring and delivery acceptance. The local mail
   callable is not a production mail system.
5. Close registration enumeration/abuse policy (registration still returns an
   explicit email-taken response), production throttle/load tuning, retention and
   cleanup of expired security records/local test mail, and appropriate sensitive-
   action reauthentication. Email verification is informational until policy is agreed.
6. Store enrollment/release signing, privacy/controller/support text, recovery
   operations and the other TODO release gates remain separate. No GDPR or app-store
   readiness claim follows from these tests.

No further product choice is needed for the next isolated native-engineering
increment. Actual phone/password-manager acceptance needs the user's device access;
external providers, spending and public cutover need their own authorization.
