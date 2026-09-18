# Cross-review

Each original reviewer received all five first-round reports. These are actual returned assessments, not chairman-generated roleplay.

## Frontend / UX
Agent: 01a09a4f-06e2-73f0-84ba-4eaf8a72f1a9

The strongest peer finding is Security’s snapshot boundary: [snapshots.py:103](D:/Projects/cookbook/.worktrees/teaching-hardening/snapshots.py:103) checks tier entitlement only. Reusing cooking presentation requires ownership-aware resolution first.

My recommendations on the disagreements:

- **Draft/readiness:** retain untitled drafts when another field contains work; display “Untitled recipe.” Requiring a title can obstruct recovery without improving security. Cooking requires title, positive servings, instructions, and named ingredients or explicit “No ingredients needed.” These are **product decisions**, not security requirements.
- **Save model:** choose immutable explicit saves, including incomplete drafts, with conditional revision updates and idempotent retries. Unchanged saves reuse the revision. A separate mutable server draft adds another concurrency contract without demonstrated need. Call usable content “ready,” not “published”; it remains private.
- **Removal:** offer Archive as reversible removal from normal browsing, preserving authorized history. Permanent Delete should purge personal content and leave content-free history tombstones. Retention and whether individual purge ships immediately are **product decisions**; account deletion must cover all personal content.
- **Migration:** full curated migration is unnecessary. Add shared reference contracts incrementally while retaining curated identities.

Two corrections strengthen my first report. “Private—only you” becomes misleading once household shopping copies ingredients: later transfer needs an explicit disclosure preview naming fields and recipients. Also, old-client compatibility is a release gate: [progress.py:47](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/progress.py:47) assumes every cook has a dish. Test mixed history with the previous frontend and application rollback after personal cooks exist; retain a compatible backend and safe legacy projection.

My scope recommendation stands, with these stronger release gates.

A concrete council-skill gap: it requests conflicts and deletion analysis but no shared decision matrix distinguishing draft validity, cooking readiness, archive and purge. This run exposed inconsistent assumptions; require that matrix before synthesis.

## Backend / data
Agent: 01a09a4f-085d-7111-9da4-8e0bcb8e484c

Strongest peer finding: Security identifies household shopping as disclosure of ingredient text and recipe titles, even when recipe endpoints remain private. The converter explicitly copies both. [groceries.py:139](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/groceries.py:139) Keep personal references rejected there until the product defines an explicit transfer action and retention policy.

My resolved recommendations:

- **Draft/readiness:** adopt Frontend’s untitled drafts; placeholders are presentation, not stored titles. Usable content requires title, positive servings, instructions, and named ingredients **or explicit `no_ingredients_needed`**. These are product decisions; title-required drafts provide no demonstrated security benefit.
- **Revisions:** retain immutable explicit saves, including incomplete drafts; unchanged saves create no revision. A mutable draft plus immutable usable content introduces two concurrency contracts without a present autosave requirement. Reconsider when autosave is selected.
- **Removal:** offer Archive preserving owner-only replay, and permanent Delete purging revisions, content-bearing receipts and derived private copies. Prefer content-free history tombstones, including no recipe title. This retention choice requires product agreement; deleting must never silently mean archiving.
- **Migration:** full curated migration is unnecessary. Add personal version/revision storage and a shared resolver while preserving curated identities and historical snapshots.

Missing boundary: old clients cannot consume new personal cook records safely. History currently dereferences `log.dish.slug`, and the frontend constructs dish links. [progress.py:47](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/progress.py:47), [ProgressPage.jsx:121](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/ProgressPage.jsx:121) Introduce an explicit history-contract version: legacy responses expose curated records and matching counts; upgraded responses carry discriminated references. Never fabricate a dish/tier fallback.

Concrete test: create personal history with the upgraded client, then load the previous client; verify no server error, broken links or disclosure. Also retry a pre-deletion mutation after purge: it must not resurrect content.

Changes: relaxed draft/readiness rules, concrete purge semantics, and a mandatory old-client compatibility gate.

Skill workflow gap: require an old-reader/new-data matrix; round one missed this release-critical case.

## Security / privacy
Agent: 01a09a4f-0aa7-7472-bfec-03204b02f7f3

Strongest peer finding: Backend/QA correctly identify that personal cooking requires consumer compatibility. History dereferences `log.dish.slug` ([progress.py:47](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/progress.py:47)), and the frontend constructs catalog links ([ProgressPage.jsx:121](/D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/ProgressPage.jsx:121)). Adding nullable references alone would break history.

My resolutions:

- **Draft/readiness—product decision:** withdraw my mandatory draft title. Allow untitled drafts with structural limits and a display placeholder. Recommend usable content require title, positive finite servings, instructions, and either named ingredients or an explicit “no ingredients” choice. Empty accidental rows must not qualify.
- **Retention—product decision:** support Archive preserving private revisions and history, alongside permanent Delete purging content, receipts containing content, and dependent content copies. Archive must not be labelled deletion. Backup expiration remains an explicit operational contract.
- **Save architecture—engineering recommendation:** immutable revisions on explicit saves, including incomplete drafts, with unchanged saves reusing the revision. One revision concurrency mechanism is sufficient initially; a separate mutable server draft introduces unnecessary state. “Usable” does not mean publicly published.
- **Curated migration:** unnecessary for this slice. Add typed personal references and compatible consumers while retaining existing curated identities.

Missing boundary: authorization must precede returning retry receipts as well as ordinary reads. After permanent deletion, replaying an old mutation must neither disclose deleted content nor recreate it.

Concrete release test: create personal cook history, then exercise the previous frontend and proposed rollback backend. Require a defined legacy response or upgrade boundary; never fabricate Basic/catalog fallback. Old backend rollback becomes unsafe once new record shapes exist.

Household shopping remains deferred: copied ingredient text itself discloses private source content, even without recipe titles.

Skill defect exposed: its rollback guidance does not explicitly require testing old consumers **after new-format writes**. Add that compatibility gate.

## DevOps / reliability
Agent: 01a09a4f-0cb1-7142-84c8-d57c5a96977b

Strongest peer finding: QA correctly separates browser isolation from cache verification: [browser_isolation.cjs:11](/D:/Projects/cookbook/.worktrees/teaching-hardening/tests/frontend/browser_isolation.cjs:11) disables service workers. Existing success cannot establish private-cache safety.

My revised recommendations:

- **Draft/readiness—product decisions:** permit untitled drafts with structural limits; require title, positive servings and instructions for cooking. Require named ingredients unless the user explicitly selects “No ingredients needed.” This accommodates frontend’s exception without silently treating an accidentally empty list as complete.
- **Save model:** choose immutable explicit saves, including incomplete drafts, with readiness recorded per revision. Defer autosave and a separate mutable-draft generation protocol. No-op saves reuse the revision; receipts remain durable. This simplifies my round-1 proposal.
- **Deletion—product decision:** offer clearly distinct Archive and permanent Delete. Recommend Archive retain owner-readable history; Delete purge retained recipe content and leave content-free history tombstones. Purge must cover receipt payloads and browser state; restore procedures must reapply recorded deletions before reopening service. Retention periods remain undecided.
- **Migration:** full curated migration is unnecessary. Add shared reference contracts and personal revisions incrementally. However, backend compatibility is mandatory: [progress.py:47](/D:/Projects/cookbook/.worktrees/teaching-hardening/routes/progress.py:47) dereferences `log.dish.slug`. Once personal cooks exist, rolling back to that backend can break history.

Concrete release test: create personal cooks, load an old frontend, and exercise the intended backend rollback target. Require safe unsupported-content handling and intact curated history; keep a compatible backend as the rollback floor. Also test workers enabled, account switching and post-deletion restore.

Security’s household finding strengthens my deferral: shared ingredients themselves disclose private source content. Later transfer needs an explicit product disclosure contract, independent of recipe-title redaction.

Workflow defect: the council skill lacks a required shared decision/conflict ledger; five reports produced inconsistent draft minima and revision terminology. Require that ledger before synthesis. Read-only review; no tests executed.

## QA / testing
Agent: 01a09a4f-0f3a-7da3-985e-541e00e047e5

Strongest peer finding: backend/security correctly identify that private cooking needs ownership-aware revisions and compatible history consumers. A nullable `dish_id` alone breaks `_cook_log_dict` at [progress.py:47](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/progress.py:47); existing clients construct catalog links at [ProgressPage.jsx:121](D:/Projects/cookbook/.worktrees/teaching-hardening/frontend/src/pages/ProgressPage.jsx:121).

My revised recommendations:

- **Draft/readiness:** accept untitled drafts containing some entered content; display “Untitled” without storing it as the title. Usable recipes require title, positive servings, instructions, and named ingredients or an explicit “No ingredients needed” choice. Unknown amounts remain valid. These are product decisions; I withdraw my mandatory draft-title recommendation.
- **Persistence:** choose immutable explicit saves, including drafts, with no-op deduplication and one optimistic-concurrency contract. A separate mutable draft generation adds unnecessary state for explicit saving. “Usable” does not mean publicly published.
- **Deletion:** Archive preserves private revision/history access. Permanent Delete purges personal content, including content-bearing receipts, and leaves content-free history tombstones if desired. Retaining tombstones and backup expiry are product decisions; archive must not masquerade as deletion.
- **Migration:** full curated migration is unnecessary. Add personal identities and a shared resolver incrementally, preserving legacy references.
- **Household shopping:** defer it initially. Later consent must specify ingredients, quantities, source title/ID disclosure, and retained copies.

Concrete release correction: version the history response or require explicit client capability. Legacy responses should contain only compatible curated records and matching counts. Test an old frontend and backend fallback against a database already containing personal cooks: no crashes, fabricated catalog references, or data loss. Also test deletion followed by retry cannot resurrect content.

Skill workflow defect: the council skill requires fresh-context delegation but does not explicitly tell an assigned seat to avoid recursively coordinating another council. This run’s brief supplied that safeguard; add it to the skill.
