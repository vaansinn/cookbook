# Verification scope and evidence — launch-readiness review

Historical initial review. Subsequent local PostgreSQL availability and current
implementation evidence supersede the original environment blocker below; see
[the shopping foundation council record](shopping-foundation-council.md).

Date: 2026-09-13. Active worktree: `D:/Projects/cookbook/.worktrees/teaching-hardening`, branch `codex/teaching-pilot-hardening`, HEAD `5c60456`, with pre-existing uncommitted prototype work. This is not a statement about the current deployed site or remote main.

## Executed this review

QA independently executed 45 backend tests (all eight test files, separate processes), all four frontend scripts, and a production Vite build. All passed. See [the execution ledger](qa-execution.md) for commands, precautions, warnings and counts.

Tests used newly created temporary SQLite databases and disabled dotenv loading, including in migration subprocesses. The existing project virtual environment was used without installing dependencies. Build output went to a newly created temporary directory; the app's served static directory was not overwritten. The corrected build ran in `frontend`, with env-file loading disabled. It transformed 139 modules (340.69 kB JavaScript and 13.93 kB CSS). These are build sizes, not measured startup/network performance.

A timer source-reducer diagnostic confirmed callback-counting behavior; it was not a physical-device/background test.

## Chairman's independent source checks

- Account export/delete: `routes/auth.py:91–151`; missing Favorite/MealPlan handling and previous-household contributions; foreign keys at `models.py:219,282,304,324`.
- False-success grocery UX: `frontend/src/pages/GroceryPage.jsx:62–83`.
- Timer reducer and cancellation: `frontend/src/pages/CookMode.jsx:153–177,219–236`.
- API/shell error caching: `frontend/public/sw.js:72–94`; private network-only exclusions retained.
- Production database fallback and 30-day JWT: `app.py:37–51`.
- Grocery read/insert and read/modify/write races: `routes/groceries.py:26–31,147–153`; no unique household list constraint at `models.py:264–268`.
- Invalid planning data and additive all-date shopping: `routes/groceries.py:220–232,248–272`; unknown tier fallback at `access.py:25`.
- Non-atomic publishing: `Procfile:2`, commits at `scripts/sync_recipes.py:220`, `scripts/sync_learning.py:174,230`.
- Actual production routing/navigation: `frontend/src/App.jsx:53–104`, `frontend/src/components/BottomNav.jsx:7–17`; preview status at `PIPELINE.md:8–38`.
- Stale privacy promises: `frontend/src/locales/en.json:153–164`. XP/streak computation is retired, rather than newly active: `routes/progress.py:10–22`.
- Actual published-content source contradiction: `content/recipes/lentil-bolognese/basic.en.md:9,28–34` and German equivalent. The unrelated `recipes/lentil-bolognese.md` is not the Basic-tier content source.

Source findings establish code paths and missing guards. They do not claim production exploitation, data loss, device reproduction or incident occurrence.

## Fresh PostgreSQL availability check

The chairman checked local command availability for `psql`, `pg_ctl`, `postgres` and `docker`, PostgreSQL-named Windows services, and the usual `C:/Program Files/PostgreSQL` directory.

Only Docker CLI was found; no matching PostgreSQL service or standard installation directory was returned. Initial Docker inspection could not read the protected user Docker configuration. A retry with a new empty temporary CLI configuration reached the default engine check but reported the `//./pipe/docker_engine` pipe missing (and still emitted a configuration-access warning). No engine was started, installed or reconfigured; no user Docker config was opened manually.

**PostgreSQL verification is blocked in the currently accessible local environment.** This is not proof that the user has no external/test database. An explicitly disposable PostgreSQL engine/database must be supplied or separately authorized before migration, foreign-key, concurrent-write and recovery gates can close. SQLite is not a substitute.

## Not executed or not established

- PostgreSQL tests, full fresh/populated release sync rehearsal, deliberate mid-release failure, backup restoration and old-application rollback after new writes.
- Fresh real-browser or physical iOS/Android checks, installed-PWA lifecycle, service-worker-enabled release upgrades, assistive-technology walkthrough or offline failure recovery.
- Android/iOS builds, native packaging/signing, app-store review, packaged desktop builds.
- Hosting/domain/TLS, live production state, provider backups/monitoring, secrets configuration or dependency vulnerability audit.
- Fresh prototype suite/browser verification (historical counts are not substituted for this review's test evidence).
- Culinary acceptance, generated-image correspondence, or beginner observations.

## Change boundary

This council creates only review documents under `docs/councils/launch-readiness`. No production/prototype source changes, commits, merges, push, deployment, provisioning or participant recruitment. Pre-existing edits and untracked files remain untouched. QA temporary outputs may remain in system temp; no material user data was deleted.
