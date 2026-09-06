# Learning plan — moved into the consolidated implementation plan

The original learning-only draft has been superseded by [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), which includes the detailed learning tasks plus personal recipes, scanning, variations/history, nutrition tools, dinner events, current meal-plan integration, and shared contracts.

For delegation, pass IMPLEMENTATION_PLAN.md and [AGENT_HANDOFFS.md](AGENT_HANDOFFS.md). [PIPELINE.md](PIPELINE.md) owns IDs/status. This pointer avoids leaving two conflicting implementation specifications. The active release is now a one-dish/one-skill loop with early observation; #47a is its small contract. Full #40/#47b version/revision work, personal library and events are later choices, not teaching prerequisites. #58 remains allocated but deferred.

## Original draft numbering correction

These are old **learning-draft** IDs, not the actual shipped Cookbook tasks bearing the same numbers.

| Old draft ID | Canonical task |
|---|---|
| #16 | #32 |
| #17 | #33 |
| #18 | #34 |
| #19 | #35 |
| #20 | #36 |
| #21 | #37 |
| #22 | #38 |
| #23 | #39 |
| #24 | #40 |
| #25 | #41 |
| #26 | #42 |
| #27 | #43 |
| #28 | #44 |
| #29 | #45 |
| #30 | #46 |

All detailed learning steps were carried forward and reconciled, including MealPlanItem migration, existing bundle generation, early participant planning, explicit compatibility ownership, and a useful transition away from rewards. The former draft #24 migration is now #40; actual shipped #24 remains “Add to week plan”.

Source baseline verified on 2026-09-06: Cookbook remote dccd4db177336b7f52d992bb9a3dade681c61d1e. The original audit used an older local checkout; the published planning commit is based on this verified remote baseline. Recheck the current branch before implementation.
