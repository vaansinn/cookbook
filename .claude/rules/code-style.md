# Code Style & Engineering Rules

## Simplicity First
Minimum code that solves the problem. No speculative abstractions, no unrequested flexibility, no error handling for impossible scenarios.

## Surgical Changes
Touch only what you must. Don't refactor unrelated code. Match existing style. Remove imports/vars your own change made unused; leave pre-existing dead code alone and mention it instead.

## React / JS Conventions
- Prefer `const` over `let` where not reassigned.
- No `console.log` in committed code.
- `useT()` must be called inside a component, never at module level.

## i18n
- All UI strings go through `useT()` — no hardcoded English in JSX.
- Stored data values stay English; translate only at display time.
- Both `en.json` and `de.json` get every new key in the same commit.

## Commits
- Commit after every code change — don't leave changes uncommitted.
- One logical change, one commit.
- Do not push to Heroku unless explicitly asked.

## Gotchas
- **Duplicate locale keys parse silently, last one wins** (bit Clea at #177) — grep both locale files for a key's exact name before adding it.
- **Missing `const t = useT()`** — build passes, runtime throws. Declare the hook at the top of every component that uses `t(...)`, including small helper components.
