# Launch implementation-plan challenge — shared brief

2026-09-13. User requests a complete implementation plan from the completed launch council, with Q&A at the right time, parallel agent work, low-confidence issues to resolve before plan sign-off, and release best practices.

This is planning/documentation only. Do not implement code, run diagnostic suites, provision, install, start/stop servers, read secrets, touch personal/production data, commit, push or deploy. No recursive agents. Main writes plan and sources; seats return reports, no file writes.

Worktree: D:/Projects/cookbook/.worktrees/teaching-hardening; branch codex/teaching-pilot-hardening; HEAD 5c60456 with pre-existing uncommitted prototype work. .codegraph absent. Read the installed C:/Users/zweiz/.codex/skills/developer-council/SKILL.md completely; perform only your seat. Reference the completed assessment.md and verification.md beside this brief. Inspect narrow source/contracts if needed, not another exhaustive audit. Existing assessment is evidence, not a binding scope decision.

Two user questions are currently pending: first channel (web/PWA, Android first, both stores) and whether launch includes cooking/accounts only, bounded shopping/planning, or all prototype planning/event/shopping features. No response means pending, not consent. Do not silently assume phase-one product. Guests/optional teaching/no XP remain approved principles. Approved welcoming design is separate from real React frontend. Personal recipes/network/scanning are not newly authorized.

Provide 400–600 words, aimed at execution:
- 3–5 concrete work packages for your seat with dependencies, likely owned paths, test/acceptance artifacts.
- What can run in parallel, what shared contracts/migrations/routes need one owner.
- Questions the user should answer now versus just before affected work; a recommended default and consequence of no answer.
- Low-confidence assumptions and bounded investigation that must precede implementation-plan sign-off versus evidence legitimately deferred to release acceptance.
- One overlooked practical release concern. Avoid enterprise process or invented calendar estimates.

Seat responsibilities:
Frontend: bounded design port, reusable shared state/responsive boundary, phone lifecycle UX, offline/timer contract, integration/visual gates. Read relevant UI skill if needed; do not redesign.
Backend: auth/data/shopping contract ordering, privacy lifecycle, migration/old-reader/rollback boundaries, conditioned feature scope; no full future recipe/event schemas.
Security: threat/identity/session decisions and recovery/email, privacy/caching/share gates, secrets and operational permissions. Main researches current official guidance.
DevOps: environment/CI/release/content publishing/restore, stage/production and cost/support ownership, domain-origin migration, store/toolchain dependency ordering. Main researches current official platform requirements.
QA: plan sign-off vs increment completion vs release sign-off, measurable acceptance, release evidence ledger/test isolation, physical-device/user observations and rollout stop criteria.

After independent reports there will be one short cross-review. Main is chairman and will integrate your findings into a single dispatchable plan rather than five separate roadmaps.
