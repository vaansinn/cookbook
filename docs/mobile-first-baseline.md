# #60a baseline and responsive preview

Date: 2026-09-07. Status: preview ready for review; #60a is not fully closed.

## Base and scope

- Inspected local HEAD and GitHub main: `f3ba9c25fe93b9db0d597dbf687d9690c3733c49`.
- `git ls-remote origin refs/heads/main` initially failed inside the network sandbox; a permitted read-only retry succeeded. No remote changes were made.
- Work remains in the existing isolated `codex/teaching-pilot-hardening` worktree. Local main and the pre-existing planning diff were preserved. Create the separate implementation worktree before #60b, after visual approval and a fresh base check.
- This increment adds only a standalone prototype and documentation. Application source, APIs, database contracts and content are unchanged. The baseline build regenerated ignored static output from the unchanged source.

## Automated baseline

Working directory: repository root unless stated otherwise.
Python: `C:/Users/zweiz/AppData/Local/Temp/cookbook-review-6b4aa01a/.review-venv/Scripts/python.exe`.

| Check | Command / method | Result |
|---|---|---|
| Backend | Each `tests/backend/test_*.py` run in a separate Python process | All 8 files passed, 45 tests |
| Frontend | Each `tests/frontend/test_*.mjs` via `node --experimental-loader ./tests/frontend/extensionlessLoader.mjs <file>` | All 4 scripts passed |
| Production build | `npm run build` in `frontend/` | Passed; 139 modules |
| Prototype syntax | Extract inline script and compile using Node `vm.Script` | Passed |

Backend tests use disposable SQLite databases. This is not PostgreSQL acceptance. Existing warnings include SQLAlchemy/date deprecations, test JWT key length, SQLite resource cleanup and Node's experimental loader. They were not silently fixed as part of a UI preview.

## Preview

Latest visual exploration: [Welcoming kitchen draft](prototypes/welcoming-kitchen.html), with [scope, asset prompts and verification](prototypes/welcoming-kitchen-notes.md). This adds ingredient-first discovery and generated imagery around the actual five-ingredient starter recipe. The earlier structural prototype below is retained for comparison. Both remain pending visual approval; production UI is unchanged.

Source: [mobile-cooking.html](prototypes/mobile-cooking.html).

Run from the repository root with a suitable Python:

```text
python -m http.server 5098 --bind 127.0.0.1 --directory docs/prototypes
```

Open `http://127.0.0.1:5098/mobile-cooking.html`. Port 5097 remains the existing application, not the preview.

The top disclosure exposes screen, language, appearance and ready/loading/error/locked preview states. The sample is not a real recipe, login/access implementation or live attempt. The locked-state placeholder does not propose removing the existing real-app ingredient teaser. Production versions, full recipe content, prep, nutrition, notes, sharing and auth actions remain required.

### Proposed interaction contract for approval

- Compact recipe: a single sticky region combines short dish/version context with Ingredients / Method tabs. The main title scrolls away. A bottom action bar reserves its own space and respects safe-area padding.
- Wide recipe: ingredients appear on the left and method on the right; tab-only controls/roles are removed.
- Compact Cook Mode: an always-visible ingredient action opens a modal sheet with full ingredients and the same running timer. Escape/Close returns focus to its trigger.
- Wide Cook Mode: full ingredients appear on the left, with the wider current-step panel on the right, as requested in the desktop preview revision. DOM and keyboard reading order follow this arrangement; compact behavior is unchanged. Moving from the open compact sheet to the wide layout closes the sheet and moves focus to the visible step heading without resetting the timer.
- The prototype uses 900px as its content-fit breakpoint. This refines the plan's provisional ranges; production must account for available width after shared navigation, not assume all 768px tablets fit two columns.
- Per-step ingredient mapping remains #60g. Sample amounts are not to be imported into the real recipe.

### Browser checks performed

Browser: Codex in-app Chromium browser; desktop viewport emulation, not physical phone certification.

- Visually inspected 390px phone, 320px German dark-mode cooking, 768px German tablet recipe and 1024px wide layouts.
- Scrolled the phone recipe to `scrollY=538`; the tab region remained at viewport top `0`.
- Direct-touch tab round-trip restored ingredients to `scrollY=538` and preserved the checked spaghetti ingredient. Locator auto-scroll can reposition sticky targets before a click; use direct touch or keyboard plus measured scroll position when testing this behavior.
- ArrowRight selected Method; Home returned to Ingredients.
- Timer continued from 05:00 to 04:29 while the ingredient sheet remained open. Escape closed it and returned focus to Ingredients.
- Resizing an open sheet from compact to 1024px retained the timer, closed the modal and placed focus on the visible cooking H1. No horizontal overflow was measured in the wide cooking view or 768px recipe view.
- Simulated error/retry returned to recipe content; advanced selection showed the locked preview and could return to Basic; German simulated loading recovered to the recipe.
- Captured current application's guest Home and recipe overview as before-state evidence using a separate temporary tab; the user's existing tab was not navigated or signed into.

Screenshots were saved under the thread's visualization directory:

```text
C:/Users/zweiz/.codex/visualizations/2026/09/05/01a07204-bcec-7173-9431-3eaab7058750/
  baseline-home.png
  baseline-recipe.png
  mobile-sticky-ingredients.png
  mobile-cooking-step.png
  mobile-ingredient-sheet.png
  desktop-recipe-sections.png
  desktop-cooking-de.png
```

## Still required before/alongside implementation

- User approval of the revised recipe/Cook Mode visuals and final shared navigation treatment. Do not call #60a complete or start changing production UI merely because the prototype works.
- Complete the signed-in supporting-screen baseline (groceries, plans, History) and original Cook Mode screenshots with dedicated test fixtures, before those screens change. This turn did not sign into a user account or rerun the three existing browser regression scripts.
- This prototype has no refresh persistence, actual snapshot/auth/reflection flow or API mutations. Its successful timer/tab checks do not prove the future React integration preserves those contracts.
- Full zoom/screen-reader/physical iOS Safari/Android Chrome acceptance and actual wired-screen approval remain #60h gates.
- Original PostgreSQL, culinary contradiction and beginner-observation gates remain open. No observations or production deployment performed.
