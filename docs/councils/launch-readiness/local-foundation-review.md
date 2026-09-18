# Local foundation council — 2026-09-13

Scope: local launch/configuration and test isolation only. Five actual independent
reviewers, followed by one cross-review round; coordinator chaired. All used the
host model, not five different models or human experts. No reviewer ran services
or inspected personal data. Coordinator performed the runtime verification.

Worktree: `D:/Projects/cookbook/.worktrees/teaching-hardening`, branch
`codex/teaching-pilot-hardening`. Existing dirty work was preserved. Public launch
remains phone-first web/PWA with full approved prototype functionality; this
increment supplies the development environment, not that integration.

| Seat | Agent ID | Main independent findings |
| --- | --- | --- |
| Frontend/UX | 01a09b48-90fc-7690-a731-23c9edbab590 | Vite config-file envFile switch ineffective; opaque startup errors |
| Backend/data | 01a09b48-91f1-7192-999b-fbb63df96049 | Populated tables do not prove valid lesson links; public-table-only emptiness test incomplete |
| Security/privacy | 01a09b48-934d-7dc1-bff4-495fb306405e | Vite must receive dotenv isolation as an inline API option |
| DevOps/reliability | 01a09b48-94ae-7801-8988-a5641bc6417d | Failed reinitialization readiness; stage diagnostics; explicit verification DB provisioning |
| QA/testing | 01a09b48-9650-7103-8abc-0e85314c9a1d | Vite sentinel test; migration smoke does not exercise actual dev launcher |

## Cross-review and chairman decisions

All five cross-reviews supported persisted lesson-link validation, not a completion
marker alone. DevOps explicitly revised the marker-first recommendation. Frontend
and QA elevated semantic readiness after backend's evidence. No unresolved
security dissent was waived. Agreement does not constitute runtime evidence.

| Issue | Decision and evidence | Remaining boundary |
| --- | --- | --- |
| Vite dotenv | Programmatic `createServer` inline `envFile:false`; actual resolved-config canary test passed for files and parent VITE variables | Not a general sandbox against malicious local tooling |
| Incomplete initialization | Persistent incomplete marker plus stored bilingual lesson/step-link validation before serve | Mock failure coverage; no deliberate live corruption/recovery rehearsal |
| Empty unversioned DB | All-user-schema pg_class occupancy query | Not authorization to target existing personal DBs |
| Diagnostics | Fixed per-command failure codes, no raw SQL/credentials | Generic import/connection/application failure message remains an ergonomics limitation |
| Verification provisioning | Documented two named empty targets, dedicated port/storage | Compose runtime not executed because Docker engine unavailable |
| Actual launcher | Real init repeats preserved content/IDs; readiness and 15 dishes matched directly and through proxy; browser library/recipe opened | Signed-in, account-switch, phone and full shutdown/restart browser acceptance still open |

Coordinator's additional fix: Python isolation ignores PYTHONIOENCODING on Windows.
Explicit `-X utf8` now preserves content-sync diagnostics without treating a
successful command as a console-print failure. Two diagnostic clusters retained;
third fresh native PostgreSQL cluster passed fresh/history upgrades and repeated
full sync. No database reset or production data was used.

Final evidence: 17/17 backend scripts, 108/108 frontend/prototype TAP checks,
140-module production build into ignored local output, real PostgreSQL smoke.
Existing SQLite/mocks do not prove PostgreSQL concurrency or restore behavior.
Details and restart steps: [local development](../../local-development.md).

Confidence: high that this bounded local setup works and avoids hosted data;
medium in operational recovery until restart/restore and negative live-database
tests are expanded. Full UI integration, privacy compliance and launch readiness
are outside this verdict. No new user decision blocks continuing private-account
data contracts; domain, hosting, mail, sharing/retention and device acceptance
remain later checkpoints. No cloud spend, commit, push or deployment authorized.
