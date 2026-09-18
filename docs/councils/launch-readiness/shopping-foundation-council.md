# Shopping foundation — council and implementation record

2026-09-13, local worktree `codex/teaching-pilot-hardening`. Continues the user's
authorized local implementation. Root main, existing work and prototype preserved.
No commit, push, deployment, production data access, publication or paid service.

## Five independent seats

Actual subagents, not five human reviewers or different models. Each received
the same independent brief, then peer findings for one cross-review. Afterwards
implementation assignments had disjoint write sets; the coordinator integrated
shared routes, migration, lifecycle, UI hooks and tests as chairman.

| Seat / agent | Evaluation and accepted evidence |
|---|---|
| Frontend — Popper `01a09bf0-e492-7680-b317-50e958499cab` | Complete shopping leaf against server projection; account/scope/request-fenced editors; retained disabled screen during reload; explicit column and checkbox semantics. Actual mounted tests exposed hidden Undo after layout changes and cupboard checks claiming purchases. Both corrected. Flagged global appearance portability as incomplete; chairman is integrating a common account source. |
| Backend — Cicero `01a09bf0-e5a9-7092-acf4-c9d54fbed731` | Complete source selection, event deduplication, explicit compatible-unit identities, atomic sticky coverage and invocation-only authorized-resolution cache. Reproduced capacity dead end at 100 scopes and a valid 317,332-byte scope blocked by the 256 KiB inverse. These were real failures, not waived by passing happy-path tests. Added owned selection deletion; chairman added bounded single-scope inverses. |
| Security — Galileo `01a09bf0-e6ec-7593-98d3-978b4ee0d6a8` | Separately revisioned preferences, owner-bound selection references, no guest import, receipt/lifecycle integration. Built isolated mounted-browser harness with native transport/storage blocked before app imports. Recovery and stale-result behavior verified there, distinct from PostgreSQL evidence. Account-wide appearance review still in progress at this checkpoint. |
| DevOps — Beauvoir `01a09bf0-e824-7d92-bf32-fffb4ea1c3db` | Independent templates with no copied dates/links/checks; guarded PostgreSQL concurrency/rollback/FK verifier and additional old-X1b upgrade fixture. Required compatible forward recovery, not the claim that additive DDL permits an old writer. No provisioning or real data use. |
| QA — Gauss `01a09bf0-e976-77f2-89aa-dd227aedda55` | Real registered-route tests found nullable-date undo failure, unchecked template blueprint exposure, revoked-template undo and missing Check-all undo. Fixed and retested. Final scoped deletion/capacity suite: 43 integration cases, plus 17 frontend transport/model contracts. SQLite claims are explicitly separate from PostgreSQL. |

## Decision ledger

| Question | Alternatives / evidence | Chairman decision |
|---|---|---|
| Shopping source | Visible three-day UI vs complete backend selection | Complete backend selection; the viewport cannot define demand. |
| Metadata | Guess label/category/staple from v1 vs authored v2 | Add immutable v2, preserve v1 digest/content and explicit fallback; no culinary inference or automatic publication. |
| Coverage | One aggregate check vs exact source and extra allocation | Source checks, explicit Check all, separate extra. Changed covered quantities require review. |
| Undo | Snapshot every scope vs affected parents only | Affected plan/event scopes, with explicit replacement IDs. Independent unrelated data is not rewritten. |
| Capacity cleanup | Evict scopes/delete plans vs explicit saved-selection removal | Reviewed selection-only deletion with guarded Undo. No silent eviction. |
| Large scope undo | 256 KiB for everything vs bounded individual cleanup | General inverse remains 256 KiB; one-scope cover/personal-delete/scope-delete allows 2 MiB UTF-8, so a valid 512 KiB scope remains cleanable. |
| Preference history | Advance domain revision vs independent preference revision | Shared lock/receipt, separate revision; does not clear domain Undo. Guest settings stay separate. |
| Recovery backend | Old X1b writer vs compatible new-format build | Compatible forward recovery; populated downgrade refused. Exact restored-build behavior is tested, not an old-binary guarantee. |

No unresolved reviewer disagreement is hidden by a majority vote. Remaining
capacity/latency evidence must not be inferred from the early repeated-item
microbenchmark. The formerly permitted 100-scope/400,000-allocation case took
95.075s; memoization alone still took 74.288s. An 8,000-distinct-variant case
took 31.398s despite earlier byte/allocation caps. Those were accepted findings,
not waived. The final admission contract adds 8,000 aggregate allocations,
2 MiB persisted workspace state, 8 MiB referenced catalog bytes and 512 distinct
variant keys before expensive resolution. Selection-only cleanup remains usable.

The final accepted SQLite stress fixture (512 variants, 8,000 allocations,
100 scopes, 2,078,010 state bytes) reconciled in 4.927s with 2,859 SELECTs,
including 514 catalog SELECTs. The 513th variant was refused in 0.041s with zero
catalog queries/resolutions. These measurements exclude commit/HTTP/network;
they are not a PostgreSQL load test or a launch latency SLO. Confidence in
bounded behavior is stronger than confidence in public-load performance.

## Verification checkpoint

**Latest continuation:** full backend runner 32/32 scripts; post-freeze shopping
module 48/48 and registered-route integration 55/55. A wholly new PG10 cluster
passed all five `verify_release.py --run` stages: fresh/history/sync/planning,
repeat, shopping/templates/preferences, compatible new-format restore and
populated X1b upgrade. Its five occupied databases are retained, cluster stopped.
No PG09 targets were reset/reused. This rehearsal verifies the current backend
after the capacity work; CI execution and production recovery remain unverified.

Actual main CUA reruns: planning 8/8, shopping 7/7 and account appearance 7/7.
The appearance expansion covers lost/late acknowledgements across Home → Shopping
without needing focus to settle pending state. Synthetic transport/memory storage
is explicit and distinct from real SQL/browser smoke. Current/upcoming/past event
grouping, independent Event again and template apply were separately exercised
against local PostgreSQL; keyboard dialog return and 320/390/768/1280 smoke passed.

The deadline-based timer, local fonts, account-copy corrections and bounded
library layout port are a subsequent continuation, not proof of full LP21 or
physical-device acceptance. Its final evidence and remaining decisions are in
[the continuation handoff](continuation-2026-09-13.md). Counts below are the
historical X1c checkpoint.

- Full backend runner passed 31/31 scripts after the capacity follow-up,
  including 43/43 shopping integration cases. The subsequently expanded pure
  PostgreSQL target/resume safety suite passed 32/32 independently.
- Frontend/prototype suite: 263 passed, zero failed, one optional standalone
  Playwright-runtime case skipped. This skip is not silently counted as a pass.
- Actual CUA browser: planning recovery 8/8 and shopping recovery 7/7, using real
  mounted components/hook/adapter with explicitly synthetic isolated transport.
- Account appearance mounted browser: 4/4 (SQL hydration, explicit Home/Shopping
  changes, guest separation/zero writes, delayed account switch/logout responses).
- Actual local SQL browser flow: event shopping, label check, refresh persistence,
  personal addition, template save, 320px no-overflow; account language/theme
  change carried from Planning to Shopping and survived refresh.
- PG09 on loopback 55432: fresh and representative earlier cook-history migration
  to fc86, full four-sync sequence twice, planning transaction checks, shopping
  races/replay/rollback/composite FKs and populated downgrade refusal passed.
- New-format compatible restore: exact 36 tables/23 sequences, preserved source,
  old/new receipts, coverage/preferences/export and independent template apply.
- Extra populated pre-fc86 X1b upgrade rehearsal passed after fixing a synthetic
  fixture helper keyword collision. No reset: an independently verified fc86
  old-table schema hash matched the retained empty eb75 schema; read-only guards
  confirmed all 33 expected tables and zero personal rows before reseeding.
  All old row hashes, receipts, catalog and recovery JSON survived the upgrade;
  old replay/v1 export and new shopping write/retry passed. The target now remains
  populated at fc86 and must not be reused as empty.
- Production build passed (158 modules). Output is `.local/build-verification`,
  not the deployed static directory.

## Not sign-off

The [X1c contract](../../contracts/private-planning-x1c.md) describes the delivered
boundary. Public release still requires authored catalog/content acceptance,
configured guided-cook integration and the complete approved discovery/recipe
port, physical S25/iOS/PWA lifecycle checks, accessibility/visual approval and
operating/privacy policy decisions. This record does not certify GDPR compliance.
Domain/hosting/mail/cutover and any spend remain unapproved. No artificial lock,
score or streak was added. Packs, shared batches, leftovers and personal recipe
authoring remain outside this increment.
