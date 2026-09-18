# Personal recipes — council brief

Date: 2026-09-13. Request: prepare adding users' own recipes, including the flow,
fields and backend. This is an implementation plan, not permission to implement
the feature, run migrations, commit, push, deploy or provision services.

## Shared context

Inspect `D:/Projects/cookbook/.worktrees/teaching-hardening`, branch
`codex/teaching-pilot-hardening`, HEAD `5c60456`. Planning/shopping prototype changes
are uncommitted; preserve them. Main checkout is older and must not be changed.
No `.codegraph/` directory was found at this worktree root; ordinary `rg` is fine.
Use per-command git safe.directory if needed, not global configuration changes.

The application uses Flask/SQLAlchemy/PostgreSQL and a React frontend. The local
welcoming-kitchen HTML prototype is separate from production app APIs/accounts.
Verify specifics in the actual source. No production data/secrets access.

User preferences: mobile-first cooking, a welcoming and uncluttered interface,
ingredient-first discovery, optional learning rather than XP/streaks/locked paths.
Personal recipes should be manageable without mandatory difficulty levels.
The prototype has recipe-wide component choices (jarred tomato sauce versus
tomatoes/herbs), a separate recipe network, flexible meal plans/events and shopping.
The user previously explored personal branches/versions; this request prioritizes
manual recipe creation. Determine a sensible first slice and future-compatible
boundaries; do not silently include scanning, public publishing, full branching,
nutrition automation or a general curriculum rewrite.

## Evidence starting points (read those relevant to your seat)

- `IMPLEMENTATION_PLAN.md` sections 4, #40/#47b and #51–#54; historical planning
  proposals, not evidence of implementation. Reconcile rather than blindly adopt.
- `models.py`, `app.py`, `access.py`, `routes/recipes.py`, `routes/snapshots.py`,
  `routes/progress.py`, `routes/auth.py`, `routes/meal_plans.py`, `routes/groceries.py`.
- `scripts/sync_recipes.py`, `scripts/recipe_snapshots.py` if present, migrations,
  `Procfile`, requirements, `docs/teaching-hardening-verification.md`.
- `frontend/src/App.jsx`, pages Home/RecipePage/CookMode/SettingsPage,
  stores/auth/session, API modules, `frontend/public/sw.js`.
- `docs/prototypes/welcoming-planning-core.js`, editor and shopping modules,
  `welcoming-tomato.js`, `welcoming-kitchen.js` and planning/editor notes.
- `tests/backend/`, `tests/frontend/`, prototype tests and
  `docs/contracts/pilot-fixtures.md`.

## Decision to prepare

What is the smallest coherent, safe implementation for entering, saving, editing
and using a personal recipe here? Specify UX flow and required/optional fields,
draft versus usable validation, identities/revisions, ingredient quantities/forms,
ownership and private access, API save/conflict semantics, cooking/planning/shopping
integration boundaries, deletion/export, migrations and release verification.
Identify what should ship first and what genuinely needs a later slice. Explicitly
separate user choices, recommendations, assumptions and source-proven facts.

## Council procedure

Use `docs/skills/developer-council/SKILL.md`. Your assigned seat reviews independently
in round 1; do not read peers or existing verdicts. Return findings in your message,
not files. Read-only; no recursive agents. Aim for 400–700 words, evidence paths/lines,
ranked risks, acceptance checks, assumptions and confidence. The coordinator will
send peers' reports for one brief cross-review and synthesize the implementation
plan as chairman. No forced consensus; no assumption that five models were used.
