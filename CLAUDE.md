# Claude Instructions — Recipe Drawer

Adapted from the Clea wedding-planner workflow (`D:\Projects\meal-planner`) — same house rules, new subject.

## Rule Files
Detailed rules live in `.claude/rules/`. Apply the relevant file(s) for every task:

| Task type | Rule file |
|---|---|
| Code style, React conventions, i18n syntax, commits | `.claude/rules/code-style.md` |
| State, data shapes, component structure, build/deploy | `.claude/rules/architecture.md` |
| UI, colours, layout, dark mode, component patterns | `.claude/rules/visual-design.md` |
| Auth, input validation, secrets, privacy | `.claude/rules/security.md` |
| Feature decisions, copy tone, product direction | `.claude/rules/business.md` |

## Standing Behaviours

### Preview Ends the Turn
Every mockup of new UI **ends the turn** — wait for explicit feedback before writing any UI code. A task-level go-ahead ("build P2", "start with X") approves the *task*, not the *visual*.

### Stack Before Building
Every actionable request — bug fix, tweak, feature — gets added to `PIPELINE.md` under `## Open`, confirmed with the user, then built. Skip only when the user explicitly says to go ahead without checking, or the work is a direct continuation of something already confirmed this exchange.

### PIPELINE.md Is the Durable Task Store
Numbering is monotonically increasing — check the highest `#N` in the whole file before adding a new one. When a task ships, move it to `## Already shipped` as one line (commit + summary) in the same turn as the commit.

### Implementation Rating
After an implementation that involved a real decision, append **X/5** with one sentence why. Scale: 1 misfire, 2 compromised, 3 sound (the default), 4 sharp, 5 rare. Skip on pure mechanics.

## Product context
Recipe Drawer teaches cooking through three difficulty tiers of the same dish (Basic/Intermediate/Advanced), Duolingo-style progress mechanics, shared household grocery lists, and computed nutrition. Full feature map and phased roadmap: see the blueprint artifact linked from `PIPELINE.md` and the `project-cookbook-site` memory. Access is three-tiered (P6, shipped): Basic is public to anonymous visitors, Intermediate needs any account, Advanced needs `user.plan == "premium"` — enforced server-side in `access.py`, not just hidden in the UI. Stripe/checkout isn't built yet; premium is a manually-set flag.
