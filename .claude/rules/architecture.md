# Architecture Rules

## State Management
- Zustand stores are the single source of truth: `useAuthStore`, `useSettingsStore` (more stores land as P2+ features arrive — `useRecipeStore`, `useGroceryStore`, etc.)
- Never duplicate server state into local component state — read from the store, write back to it.

## i18n Architecture
- Locale files: `frontend/src/locales/{en,de}.json` — flat key→string, no nesting.
- `useT()` reads `language` from `useSettingsStore` reactively.
- Stored values (dish slugs, tier names "basic"/"intermediate"/"advanced", diet/allergen tags) stay English in the DB — translate only at display time via lookup maps, same rule Clea learned the hard way.
- `{n}` interpolation: `.replace("{n}", ...)` — reposition per language's natural word order.

## Component Structure
- Pages: `frontend/src/pages/`
- Shared components: `frontend/src/components/`
- Zustand stores: `frontend/src/store/`
- Keep components in the same file unless they exceed ~150 lines or are reused elsewhere.

## Backend
- Flask blueprints in `routes/` — one blueprint per domain.
- SQLAlchemy ORM only — no raw SQL string interpolation.
- Migrations: Flask-Migrate (`flask db migrate` + `flask db upgrade`) — never mutate schema by hand.
- Every route that touches user data filters by `user_id` from the decoded JWT.

## Build & Deploy
- `npm run build` inside `frontend/` must exit cleanly before any Heroku push.
- Deploy: `git push heroku main:master`. Heroku app: see `PIPELINE.md` — do not push unless explicitly asked.
- The static Netlify cookbook (`menu.zeni-design.com`) stays live and untouched until this app reaches P3 parity — see the blueprint artifact.

## Gotchas
- **SQLAlchemy on Python 3.13**: pin `SQLAlchemy>=2.0.36` — 2.0.30 (Clea's pin) breaks on 3.13's `__firstlineno__` class attribute. `runtime.txt` pins Heroku to 3.11.9 anyway, but local dev may run a newer Python.
- **psycopg2-binary has no prebuilt wheel for every local Windows/Python combo.** Skip it in the local venv (SQLite is used for local dev — `DATABASE_URL` is unset) and let Heroku's Linux build install it from `requirements.txt`.
