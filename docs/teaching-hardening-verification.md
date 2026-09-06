# Teaching-pilot hardening verification

Base: `d787ddc`, isolated branch `codex/teaching-pilot-hardening`. Changes remain
uncommitted. No merge, push, deployment, production-data access or participant
recruitment was performed.

## Implementation increments

1. Snapshot integrity: schema-v2 immutable lesson/skill content from a consistent
   server read; fail broken links; legacy snapshots never rewritten.
2. Reflection reliability: mutation receipts, revisions, atomic confidence writes,
   owner/cook serialization, strict payload validation and export/delete coverage.
3. Session/UI: explicit auth resolution, isolated attempts and stale-response
   guards, legacy adoption, snapshot retry, shared History/reflection editor,
   current-confidence controls, accessible modal help and recommendation references.
4. Verification/documentation: regression scripts, migration smoke test, real
   browser scripts and this gate record; canonical fixture amendment.

## Automated checks

- Backend: run every `tests/backend/test_*.py` separately with the project Python
  environment. Existing assertions were retained except the deliberately revised
  contract: edits now supply mutation/revision; absent-reflection GET returns
  revision-zero context without inserting a row.
- New hardening tests cover retained lesson edits, invalid links, unrelated skills,
  stale replay after correction, receipt collisions, concurrent writes, rollback,
  payload validation, empty submission, partial clearing, legacy snapshots,
  missing target translation and export/deletion.
- `test_hardening_migration.py` migrates a disposable SQLite database to the old
  head, inserts representative cook/reflection history, upgrades and verifies it.
- Frontend: `test_cook_session.mjs`, `test_guest_session.mjs` and
  `test_hardening.mjs`, using the extensionless loader, cover storage and request
  identity, legacy adoption, new attempts, snapshot immutability and delayed auth.
- `npm run build`; full fresh SQLite release sequence: db upgrade, sync-recipes,
  sync-glossary, sync-skills, sync-lessons. Synced 90 tiers, 22 glossary entries,
  one skill and one bilingual lesson.

## Real-browser checks

Scripts `tests/frontend/browser_hardening.cjs`, `browser_recovery.cjs` and
`browser_isolation.cjs` use
Playwright against a disposable localhost Flask server, default port 5097.
Supply Playwright via the environment; default browser channel is installed Edge.
No production URL is accepted. Screenshots are generated under ignored
`artifacts/teaching-hardening/`.

Coverage: guest zero personal writes and resume; signed-in completion and refresh
before reflection; correction from History; independent confidence edits verified
through export; EN/DE and light/dark at mobile width; snapshot failure/retry;
ambiguous successful reflection save followed by refresh and identical retry;
legacy unknown-source adoption; help Escape/focus restoration; Start over.
The isolation script delays a recipe response across a real SPA dish switch and
a successful reflection response across a real login to another account; neither
can clobber the new attempt or expose the prior account's cook/reflection.

Observed results: all backend test files passed (45 tests including populated
SQLite migration); all three frontend Node scripts passed; production build and
the three real Edge browser scripts passed without page errors. Screenshot review
caught no clipped controls after adding History bottom spacing. Browser checks
caught and fixed modal focus restoration and legacy structured steps with null IDs.

## Open gates — do not report these as complete

- **PostgreSQL fresh and populated migration verification:** unavailable locally.
  Docker client exists but the engine pipe is absent, including an elevated check.
  No native `psql`/`pg_ctl` or PostgreSQL Windows service/install was found.
  No cloud service was provisioned and SQLite is not a substitute.
- **User approval of actual wired UI:** screenshots are review evidence, not
  approval. Includes new History editing/current-confidence controls.
- **Culinary review:** Basic lentil-bolognese still says to boil pasta meanwhile
  while its equipment note specifies the same pot sequentially, in EN and DE.
  Requires the user or an authorized experienced cook; no culinary approval inferred.
- **First 1–2 beginner observations:** only after engineering and culinary gates.
  No participants contacted or observations fabricated.

## Rollout

Apply additive migration before deploying the updated frontend. Keep legacy
snapshot rows and no-snapshot cooks unchanged. Preserve empty badges/nudges
compatibility fields. Do not bypass access checks to reconstruct old content.
If rolling back the application, retain the additive receipt/revision schema;
do not downgrade away mutation receipts during active retries.
