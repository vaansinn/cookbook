# Private planning implementation council — 2026-09-13

Local continuation of the approved foundation. Chairman: main coordinator.
Five independent specialist agents reviewed actual source, followed by peer
cross-review. All used the inherited model; this is not five-model diversity.
Workers and reviewer roles were kept explicit; review is not release approval.

| Seat | Agent | Principal finding |
| --- | --- | --- |
| Backend/data | Maxwell `01a09b8d-868e-7fc0-81e4-7f62928d86ef` | Decimal copy/undo normalization, transactional guest followers, undo capacity, SQL null guards |
| Security/privacy | Euler `01a09b8e-2886-7600-b02f-21dc47b161d9` | Cross-tab auth invalidation and deleted-owner outbox recreation race; expiry is not erasure |
| DevOps/reliability | Confucius `01a09b91-9f63-73d2-9cad-5c976c279bd7` | Corrective migration evidence, populated restore/retry/export and downgrade refusal |
| Frontend/UX | Sagan `01a09b91-a06b-7161-aef9-941a199a609a` | Recovery trapped behind modal, prematurely lost undo, absent foreground revalidation |
| QA/testing | Parfit `01a09b95-1c6b-7811-93cd-476f9867b97d` | Ambiguous commit incorrectly discardable after JWT 422; source tests are not mounted acceptance |

## Round 1 → corrections

The chairman implemented Decimal/integer normalization for retained item values,
transactional follower resolution, reserved undo receipt capacity and the separate
`eb75f643cd84` migration. Cross-tab token events now invalidate and reverify auth.
The UI worker placed recovery inside dialogs, retained drafts for explicit conflict
review, kept undo through failures and added foreground revalidation. The client
worker preserves exact ambiguous requests after both 401 and 422.

## Round 2 → strongest peer evidence

All seats prioritized QA's lost-response → JWT-422 → discard reproduction. The
fix also handles already-saved legacy `rejected/status:422` records: they remain
readable, nondiscardable and recover by exact retry after reauthentication.
The client suite passed 59 checks at that checkpoint.

Backend moved its four source defects to verification gates. Independent API tests
then proved event-wide rollback on quantity overflow/revocation, explicit override
isolation, one-slot confirmation rejection with no changes and final-slot undo plus
receipt replay. Item/preview suites passed 22 and 27 tests respectively.

Security found a remaining deletion race even with a shared lock: a stale tab can
start after cleanup and before receiving logout. A durable minimal owner marker
checked under the same lock is now implemented and tested. The security seat
withdrew the race finding after the 75-check client/lifecycle run. This is not a
claim of physical erasure from backups or unsupported browser storage.

DevOps distinguished fresh/history-to-head from a valid/invalid populated `da64`
corrective upgrade. PG07 passed the final-head fresh/history + repeated-sync test,
including configured dishes and actual foreign/null/fractional SQL constraints.
Separate backup/restore and corrective-upgrade rehearsals are required evidence.

Frontend and QA accepted the structural UI corrections subject to mounted/browser
tests. Real create/refresh/link/delete/undo smoke evidence is credited only for
those flows, not ambiguous failures or account switching.

## Targeted closure of the implementation/review batch

The eight-case mounted harness initially passed six cases and caught two real
item-editor defects. The shared editor-owned controller now binds submit/button
readiness to the exact current read and selected variant/destination. Controlled
destination fields survive revision reloads. CUA subsequently reported **8/8**
without removing the failing assertions. Added behavior tests replace the old
source-regex assertion for loading readiness.

Confirmed account deletion retains its original owner-bound cleanup proof for a
local-only retry when storage cleanup fails. A stale Settings closure now passes
its rendered account ID and is rejected before state/storage/HTTP if another
account has replaced it. New continuation worker Erdos
`01a09be0-26ba-7732-8cbb-2e1fa9c54fc2` implemented and tested that final binding;
this is an implementation follow-up, not a fictional additional council seat.

Real browser smoke includes event copy with independent identity/reset tasks and
cross-tab logout/login. 320px item-dialog overflow and Escape focus return passed;
768/1280px boards and EN/DE/light/dark were inspected. The live review also exposed
root-launched Tailwind content/config resolution dropping dark CSS. Explicit
config-relative paths, compiled-CSS regression and live computed theme verification
closed it. UI skills kept the approved materials and emphasized visible loading,
keyboard recovery and honest boundaries rather than adding decorative controls.

PG07 restore compared 33 tables and 23 sequences and verified exact receipt replay,
export, eligibility and new writes. Its repeat rehearsal verified graph-copy
fidelity/concurrency/rollback and left all table rows equal to baseline. Corrective
upgrade evidence is tracked separately in `docs/planning-corrective-verification.md`;
occupied interrupted-run targets are preserved, not reset into apparently clean
evidence. New continuation worker Rawls
`01a09be0-279c-7c51-99d2-b6a671efd0bf` handles that bounded operational follow-up.
The independent PG08 run then passed all four migration cases, comparing 33
tables and 23 sequences. The coordinator reran its updated 16 guard tests.
Final regression checkpoint: 26/26 isolated backend scripts, 222/222
frontend/prototype checks, production build (150 modules), and a second 8/8
mounted-browser run after the stylesheet correction.

## Confidence and remaining sign-off boundaries

- High: owner/revision/receipt design and tested bounded transactional operations.
- Improved evidence for modal recovery and stale browser interactions: eight
  mounted cases and selected real-browser flows pass. This is not exhaustive
  browser, assistive-technology or physical-phone acceptance.
- Local restoration now includes IDs, sequences, replay and new writes. Operational
  backup schedules, credentials/roles, retention and restoration after erasure are
  still separate gates; a disposable rehearsal does not settle them.
- No culinary/content publication sign-off, physical S25/iOS acceptance, hosting,
  privacy-retention policy or full prototype-parity approval is implied.
- Ten-minute preview/undo expiry is a validity window, not scheduled physical
  erasure. Durable successful receipts are intentionally retained; changing their
  retention requires an explicit retry policy and user-facing privacy decision.

The chairman continues safe local implementation rather than treating pending
catalog publication as a blocker for unrelated functionality. No commit, push,
cloud provisioning or account imports were authorized by this council.
