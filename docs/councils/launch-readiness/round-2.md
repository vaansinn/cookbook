# Launch-readiness council — cross-review

2026-09-13. Each reviewer read all five round-one reports plus official platform evidence. One cross-review round; chairman framing asked reviewers to challenge both scope expansion and abandoning the approved welcoming design. No anonymity or model diversity is claimed.

## Frontend / UX

The strongest supported peer finding is Security/Backend’s incomplete account deletion and export: existing favorites, owned plans, and retained household contributions are omitted from the lifecycle handling ([auth.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:134)). These are current product relationships. Security’s **“not ready for open accounts” remains a blocking verdict**; other conditional verdicts cannot override it. If accounts, sharing, or groceries are deferred, enforce that boundary server-side. Hiding navigation does not disable unsafe APIs.

I revise my earlier suggestion that prototype expansion can simply wait. A release that abandons the approved welcoming design would miss the user’s intended product. **A bounded production port of navigation, discovery, recipe presentation, and Cook Mode is appropriate**: carry the welcoming hierarchy, typography, palette, progressive disclosure, and accessible interactions into React while preserving existing API contracts, snapshot recovery, and optional teaching. The HTML prototype supplies design evidence, not production functionality. Flexible events, ingredient-network traversal, and personal recipes remain optional future work; their absence need not prevent that bounded port.

One concrete acceptance test should exercise the port’s cooking journey with the service worker enabled: start a guest cook, start a timer, open contextual help, background the app, return, and refresh. Verify restored step identity, accurate remaining time, keyboard/screen-reader operation, and clear recovery when network access fails. Run on physical iPhone and Android devices; a desktop viewport simulation cannot close this gate. Timer correction and successful-response-only worker caching are prerequisites.

QA’s 45 backend tests, four frontend scripts, and temporary production build strengthen regression confidence. They do not establish device lifecycle behavior, PostgreSQL integrity, or release recovery. The database fallback remains a separate operational correction.

My verdict is now **conditional for the bounded welcoming production experience, with open accounts blocked pending Security’s acceptance evidence**. Web-first remains a proposed user choice. The chairman’s platform evidence correctly separates browser/PWA installation from signed, reviewed store packages; choosing stores adds packaging and device acceptance work without requiring a frontend rewrite.

---

## Backend / data

My backend verdict remains conditional, explicitly excluding an open account launch until security and account-lifecycle blockers are resolved. Conditional votes cannot override Security’s “not ready.” QA’s 45 passing backend tests, four frontend scripts and temporary production build strengthen regression confidence; they do not establish PostgreSQL integrity or physical-device readiness.

The strongest supported peer finding is Security’s account-deletion/export gap. It independently matches the missing relationship handling at [auth.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:134), now also confirmed by the chairman. Favorites, owned plans and retained household attribution are ordinary existing features. Their lifecycle failures block exposing accounts; they are not optional future enhancements. DevOps’ confirmed database fallback compounds this: testing against unintended SQLite can conceal the constraint behavior expected from PostgreSQL.

I would correct any interpretation of “small launch” that abandons the approved welcoming design. A bounded production port of navigation, discovery, recipe presentation and Cook Mode is appropriate, retaining the existing API/store separation, guest access and snapshot identities. Ingredient-first discovery may need a narrowly specified query contract; the current text search should not be presented as ingredient-network functionality. Flexible events, network traversal and personal recipes can remain deferred. Timer correctness, accessible controls and stale-search protection belong within that bounded port.

One concrete acceptance test: on disposable, migrated PostgreSQL, create a user with favorites, an owned shared plan, cooking/reflection history, and contributions to both current and departed households. Export, then delete the account. Assert complete agreed export coverage, atomic deletion, preserved remaining-member data with cleared attribution, revoked plan links and rejection of subsequent authenticated writes using the deleted account’s token.

Deferring unsafe features requires server-side denial or route removal, verified through direct API requests. Hiding navigation alone leaves the exposure intact.

Web-first remains a proposed user choice. The chairman’s platform evidence establishes separate store-build and deletion obligations; a PWA installation satisfies neither native-store readiness nor reliable offline behavior. No new diagnostics or implementation were performed in this cross-review.

---

## Security / privacy

My verdict remains **not ready for open account-based launch**. Other seats’ conditional verdicts cannot waive unresolved account/privacy blockers. QA’s 45 passing backend tests, four frontend scripts and temporary production build are useful regression evidence; they do not establish PostgreSQL deletion behavior, physical-device security, or native-store readiness.

The strongest supported peer finding is Backend’s independent confirmation that account deletion leaves favorites, owned plans and retained household attribution unresolved ([auth.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:134)). This affects ordinary existing users, not speculative personal recipes. DevOps’ database fallback finding strengthens the requirement to test the intended production database: successful SQLite execution cannot establish enforced foreign-key behavior.

The missing boundary is between reducing product scope and reducing actual exposure. **Hiding navigation does not disable unsafe APIs.** Deferring accounts, households or sharing requires enforceable server-side restrictions, including direct requests and previously issued tokens/links. Existing users must retain a supported deletion/export path. Features that remain exposed need their fixes; flexible events, ingredient networks and personal recipes can wait.

I support a bounded production port of the approved welcoming navigation, discovery, recipe presentation and Cook Mode. Security provides no reason to abandon that design. Implement it within React’s existing API/auth boundaries, preserving entitlement checks and account isolation; treat discovery races, accessible controls and timer recovery as acceptance criteria. Prototype local storage and demo behavior are not production contracts.

One concrete QA acceptance scenario: on disposable migrated PostgreSQL, create a user with favorites, an owned shared plan, and contributions in both departed and current households. Verify complete export, then atomic deletion, agreed anonymization of retained contributions, invalidation of the shared link, and rejection of the deleted user’s token across protected endpoints. Preserve another member’s data. No such fresh evidence is established yet.

The chairman’s platform evidence makes broken deletion relevant to store delivery too. Web-first remains a proposed user choice. A PWA does not establish native-store acceptance; a later native package needs its own auth-storage, export and lifecycle verification.

---

## DevOps / reliability

My verdict remains **conditional for the selected web/PWA scope, with open accounts blocked until security acceptance is satisfied**. This is a narrower qualification, not a vote overriding Security’s “not ready.” QA’s 45 backend tests, four frontend scripts and temporary production build strengthen the baseline; they do not close device, PostgreSQL, restore or deployment gates.

The strongest peer finding is Backend/Security’s independently supported account-lifecycle gap: [auth.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:134) omits relationships that can prevent deletion under enforced foreign keys, while export is incomplete. These are existing exposed-feature defects, not future personal-recipe requirements. Hiding account, household or planning navigation does not disable their APIs. Any reduced release must enforce its scope server-side and account for existing users and shared links.

I would correct an over-minimal interpretation of “keep the architecture”: a **bounded production port of the approved welcoming navigation, discovery, recipe and Cook Mode design is appropriate**. Preserve the React/Flask contracts, guest access, bilingual content and cooking recovery while implementing that experience. Flexible events, ingredient-network behavior and personal recipes can remain deferred. Prototype appearance and tests cannot certify the port; accessible controls, stale-search handling, timer correctness and supported recovery behavior belong in its acceptance criteria.

One concrete QA-owned release rehearsal should exercise an installed client across two builds: cache release A, open a cooking attempt, deploy B in an isolated environment, inject shell/API 500 responses, disconnect, reconnect and resume. Acceptance: errors never replace valid cached content, asset versions remain compatible, elapsed timer state reconciles, and failed saves remain visibly recoverable. This directly addresses confirmed worker error caching and timer defects while testing the proposed design on the real application.

The chairman’s platform evidence preserves another boundary: PWA installation does not satisfy store packaging, signing, review or deletion obligations. Web-first remains a proposed user choice. PostgreSQL availability is currently unknown pending the chairman’s check; previous engine unavailability must not become a permanent waiver. No new implementation or diagnostic execution was performed in this cross-review.

---

## QA / testing

The strongest supported peer finding is Backend/Security’s incomplete account deletion and export. [auth.py:134](D:/Projects/cookbook/.worktrees/teaching-hardening/routes/auth.py:134) omits relationships that the passing [deletion test:145](D:/Projects/cookbook/.worktrees/teaching-hardening/tests/backend/test_teaching_hardening.py:145) never creates. This exposes a concrete limitation in our green suite: teaching-record cleanup does not establish account-wide deletion. Security’s **not ready for open accounts** stands independently of other conditional verdicts.

I would correct any recommendation that reduces launch scope by abandoning the approved welcoming design. A bounded production port of navigation, discovery, recipe presentation, and Cook Mode is appropriate, retaining existing API/store contracts, bilingual content, guest access, and optional teaching. Acceptance should compare the wired React experience against the approved design and verify keyboard interaction, responsive layout, current-query results, and cooking recovery. Flexible events, ingredient networks, personal recipes, and broad curriculum can remain later work.

That boundary must distinguish optional features from exposed liabilities. Existing auth, household, shopping, and sharing endpoints need their identified safeguards or explicit server-side disabling for the selected release. Hiding navigation does not disable unsafe APIs. Timer loss, inaccessible checklists, failed-write recovery, worker error caching, and production database fallback are corrections to exposed behavior—not speculative expansion.

One decisive additional test: on disposable migrated PostgreSQL, create an account with favorites, an owned shared plan, and contributions to both a departed household and a retained household with another member. Export, delete, and repeat deletion; verify the agreed export inventory, atomic cleanup/anonymization, preserved co-member data, revoked shared access where required, and rejection of the deleted account’s token. Record failures without weakening constraints to obtain a pass.

My verdict becomes more explicit: **not ready for open account launch; conditional for a bounded welcoming release after its applicable gates close.** The 45 backend tests, four frontend scripts, and temporary production build remain useful partial evidence. No fresh device/PostgreSQL checks were added; current engine availability belongs to the chairman. The platform evidence establishes separate web/PWA and signed-store acceptance tracks. Web-first remains a proposed user choice, not an automatic platform decision.
