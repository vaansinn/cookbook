# Local continuation — engineering evidence and next decisions

Worktree: `D:/Projects/cookbook/.worktrees/teaching-hardening`, branch
`codex/teaching-pilot-hardening`. Local, uncommitted. Root main, the approved
prototype and existing changes remain preserved. No deployment, catalog
publication, production import, paid service, commit or push.

## Delivered in this continuation

- Private SQL shopping, templates and preferences, including selection cleanup,
  guarded undo, source-level coverage, quantity review and account-wide appearance.
- Current/upcoming/past plan/event lists with independent repeat actions and local
  midnight/focus refresh; no fixed seven-day assumption.
- Shopping workload admission before expensive catalog materialization: 8,000
  aggregate allocations, 2 MiB saved state, 8 MiB referenced catalog content and
  512 distinct variant keys. The full contract and cleanup exception are in X1c.
- Account/credential/request-fenced library and recipe reads. Old successes and
  errors cannot replace a later account, query, language or selection.
- Per-attempt deadline timers with pause/resume/cancel, refresh recovery, explicit
  storage/coordination errors and terminal expiry. Navigation and snapshot retry
  do not silently reset timers. Wake-lock promises are released after hiding or
  unmounting; sound remains optional foreground feedback.
- Completion-marker checks prevent stale timer writes/reset/alerts. Timer and
  metadata writes coordinate through the same exact-attempt Web Lock. Corrupt
  reset compares the reviewed value, preserving an intervening repair.
- Snapshot pinning returns the persisted winner. A competing capture is never
  displayed as though it won; the winner is authorized/read before rendering.
  Failed persistence shows recovery instead of silently accepting an unpinned cook.
- Self-hosted, licensed Bricolage Grotesque/Plus Jakarta Sans fonts and exact
  public font cache allowlisting; no Google Fonts request. PWA orientation is not
  artificially portrait-locked. Export/deletion/privacy copy now describes actual
  behavior and explicitly remains a local-development summary, not a legal notice.
- Bounded Home presentation port: cream/oat materials, compact cards/native
  filters, consistent line icons, separate favorite and recipe targets, responsive
  layout and visible focus. This is not the full approved discovery/recipe port.
  Ingredient-base classification, matched pictures and component-aware guided
  cooking remain open; no speculative content mapping or verification claims.
- Opt-in five-database release-rehearsal coordinator and CI definition. No reset,
  resume, old-writer rollback or deployment shortcut is implied.

## Verification

- Full isolated backend runner, pre-final-freeze checkpoint: **32/32 scripts passed**. Post-cap freeze:
  **48/48 shopping module**, **55/55 registered-route integration** passed.
- Final frontend/prototype run: **352 passed, zero failed, two skipped**. The
  skips are optional standalone browser runtimes, not quietly counted as passes.
  Production build: **161 modules**, output `.local/build-verification` only.
- Main CUA real-component recovery: **8/8 planning**, **7/7 shopping**,
  **7/7 appearance**, **11/11 final timer cases**. Native API/storage are blocked
  in those isolated harnesses; they are not PostgreSQL or physical-device tests.
- Final timer integrity follow-up: independently authored **11/11 helper tests**
  passed; main subsequently confirmed **11/11 mounted cases** after closing the
  unrelated blocked worker-test tab. The mounted winner/failure cases render
  actual CookMode, with synthetic locks/transport rather than native two-tab races.
- Main real local SQL/browser smoke covered plans/events, shopping persistence,
  selection delete/undo, personal additions, template save/apply, past-event repeat,
  appearance and library search/favorites. Checked representative EN/DE,
  light/dark and 320/390/768/1280 layouts. A 320px German logout wrapping defect
  was corrected and rechecked, with zero nested card buttons or horizontal page
  overflow at 320px. Desktop 1280px shows four compact columns. German narrow
  navigation-label wrapping and the complete recipe visual port still need polish.
- Fresh **PG10**, native PostgreSQL 16.15, five precreated empty databases:
  all release stages passed: fresh/history/sync/planning; repeat;
  shopping/templates/preferences; compatible new-format restore; populated X1b
  upgrade. Synthetic fixtures only. Cluster stopped after SQL identity/idle
  verification, databases retained. PG09 was not reset or reused. Development
  PostgreSQL on 55433 remains separate. CI has not been executed remotely.

### Performance honesty

The early tiny repeated-item benchmark did not establish worst-case behavior.
Previously admitted extreme cases took 95.075s, 74.288s after memoization, then
31.398s for 8,000 distinct variants. The final capped SQLite fixture with 512
variants, 8,000 allocations, 100 scopes and 2,078,010 state bytes took **4.927s**
(2,859 SELECTs / 514 catalog SELECTs); the 513th variant was rejected in
**0.041s**, before catalog queries. These exclude commit, HTTP and network and
are **not** a PostgreSQL load test, heap bound or launch SLO.

### Real service-worker rehearsal

Dedicated test-only origin `127.0.0.1:5189`; no API proxy/database. A is synthetic
history (current policy with only its cache name changed), B is the exact current
worker: SHA256 `dd20168d489accbd7c9992aeef78ca4e862af57d6b693c66ba8fc4824ea5dc4c`.
Current CookMode runs with synthetic snapshot/auth/attempt adapters.

Main CUA observed:

1. B waited while A controlled an active ten-minute cook: same document,
   controller, attempt, snapshot, step and deadline. No forced reload/activation.
2. Public probe fetch rejection returned cached 200, with server drop counters
   increasing. HTTP 500 stayed visible without poisoning the good cache; another
   rejection returned 200. Wrong MIME invalidated the entry; next rejection was 503.
3. Synthetic private A/B reads returned their own identity online. Failed B read
   returned 503; neither account endpoint entered CacheStorage.
4. After closing the old client and reopening, B activated, old owned cache was
   removed, and the unrelated test cache survived.
5. Retained old server asset returned 200 under B; removing it returned 404.
   Re-enabling it while the probe origin was unreachable returned 503. Cache
   cleanup is not a substitute for a retained-server-asset compatibility window.

This simulates selected origin socket failures, not airplane mode, process kill,
full-origin offline navigation, real historical builds, multi-device cooking or
locked-screen alarms. Initial Capture was refused because the first timer click
had not started it; it was started and the full comparison then passed.

Cleanup's native JavaScript confirmation blocked CUA; dialog retrieval returned
  no handle and rich keyboard/close operations timed out. The native CUA Tab.close
operation then closed the test tab and unblocked verification. The earlier user
request to dismiss it is no longer needed. Only run-owned synthetic state was
targeted; no development-origin/account data was cleared. Cleanup was not
confirmed: the dedicated 5189 origin may retain its synthetic worker/cache marker.
The helper server is stopped; the cookbook API/frontend remain running.
Future harness cleanup uses an explicit in-page confirmation instead of this
problematic JavaScript dialog (36/36 combined harness/worker tests passed). Do not
claim the revised cleanup was browser-tested.

## Council disposition and confidence

Five actual specialist agents plus cross-review were used, then bounded targeted
follow-ups. QA initially found timer identity/reset fixes sound; security found
additional completion-marker and competing-snapshot risks. The chairman accepted
both findings rather than treating the earlier passing tests as closure. Both
were fixed and independently tested. Capacity limits likewise followed measured
counterexamples rather than assumed performance.

Confidence is strongest in ownership/replay/transaction and tested recovery
invariants, moderate in local usability and bounded workload behavior, and low
until further evidence for physical phone suspension, public load, operational
recovery and the complete approved visual/content integration. This is not launch
approval or GDPR certification.

## Next work and user checkpoints

Continue the remaining agreed implementation, not the deferred roadmap:

- Finish the welcoming discovery → recipe → cook port and its Q09 wired review;
  the present Home layout pass alone does not meet full visual parity.
- Finish approved prototype parity/configured guided-cook integration after an
  explicit real recipe/component mapping. An empty planning catalog does not
  block every independent UI task, but does block honest real-content acceptance.
- Test S25 and iOS/PWA
  lifecycle, keyboard/screen-reader/zoom and no-overflow across complete journeys.
- Set operational latency/recovery targets and test the release candidate against
  them. Keep versioned assets during an agreed compatibility window.

The next policy-dependent packages need three focused decisions, not hosting
credentials or payment details:

1. **Q05:** accept online-first cooking with an accurate resumed timer, but no
   guaranteed locked-phone/background alarm? Recommended first-release default.
2. **Q06:** keep guest Basic access and offer all curated recipes free to signed-in
   users for the first release, with verified email/password recovery and Stripe
   deferred? This is a proposal, not an applied access change: existing advanced-tier
   eligibility must not be silently opened or monetized without confirmation.
3. **Q07:** retain legacy shared household content for remaining members without
   the deleted user's attribution, while deleting their private records? Existing
   merged rows cannot reliably reconstruct who originally contributed each item.

Culinary/image approval Q10, final privacy notice/operator/retention/restore-erasure
policy, domain/mail/budget and release authorization remain separate later gates.
No participant recruitment or public signup rollout is authorized by this handoff.

Suggested commit message (not executed):
`feat(planning): harden private SQL planning and cooking recovery`
