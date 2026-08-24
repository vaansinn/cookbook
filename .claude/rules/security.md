# Security Rules

## Authentication
- All API routes touching user data verify the JWT from `Authorization: Bearer <token>`.
- Every query filters by `user_id` from the decoded token — never trust a resource ID alone.
- Tokens live in `localStorage`; never log or transmit them in URLs.

## Input Handling
- Validate and sanitise all user input at the Flask route boundary.
- SQLAlchemy ORM only — never raw string interpolation in SQL.

## Secrets & Config
- No credentials or API keys in source code or committed files.
- All secrets via environment variables. `.env` is gitignored.

## Data Privacy
- Household grocery lists and progress data are private per household — enforce at the route level, not just the UI.
- EU audience (blueprint decision) — GDPR export/delete lands in P5, not optional.

## Deployment
- HTTPS only (Heroku enforces this).
- CORS locked to known origins (`FRONTEND_URL` env var + localhost for dev).

## Gotchas
- **Missing `user_id` filter**: any authenticated user could read/modify another household's grocery list or progress by guessing IDs if a route fetches by resource ID alone. Always AND the `user_id`/`household_id` filter — this is the single most common way a solo-built app leaks data.
- **Talisman/rate-limiting/email flows are deferred to P5** (see `PIPELINE.md`) — the Foundation phase auth is intentionally minimal (no password reset, no email verification yet). Don't assume they exist when building later features that reference "verified email" or similar.
