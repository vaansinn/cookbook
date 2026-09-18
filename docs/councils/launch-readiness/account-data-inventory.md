# Account data inventory — source-only, foundation batch

Inspected `models.py`, `routes/auth.py`, `routes/groceries.py` and account/settings stores on 2026-09-13. This describes declared relationships, not records in a live database. No production account information was read.

| Existing records | Declared user reference | Continuity/lifecycle concern |
|---|---|---|
| User | Primary account identity | Preserve identity and hashed credentials; current plan/access values are not redesigned |
| Favorite | Non-null user ID | Include in accurate export/deletion; current auth deletion does not cover every FK |
| HouseholdMember | Non-null unique user ID plus household | Shared-data/member policy needed; do not assume all households are personal |
| GroceryItem | Nullable added_by, household list | Missing attribution and aggregate quantities cannot be reconstructed into source allocations |
| PlanEntry | Nullable added_by, household | Former-member attribution needs explicit preservation/removal policy |
| MealPlan / MealPlanItem | Plan has non-null user ID; items reference plan | Named public-share bundles differ from both household dated entries and new flexible plans |
| CookLog | Non-null user ID, attempt/session and optional snapshot | Preserve exact history linkage and immutable captured content |
| BadgeAward | Non-null user ID | Legacy personal records still exist even though new learning should not use XP/streaks |
| CookReflection / ReflectionMutation | Non-null user IDs; cook/revision/mutation identities | Retained corrections/replay records have personal lifecycle and retention obligations |
| SkillConfidence | Non-null user ID and skill | Independent current assessment; must not overwrite historical reflection |

`User.to_dict()` currently returns identity/email/display name/plan, not language/theme. `useSettingsStore.js` persists language/theme locally; full SQL-backed preferences therefore remain work to implement, not a completed capability. Current browser-token logout is not server-side token revocation. New current-user JWT lookup prevents a token for an already-deleted account from reaching protected handlers, but does not settle session revocation policy or deletion completeness.

## Safe default while questions remain

Preserve all records; do not merge, delete, reassign or import account/household/prototype data automatically. Do not enable stronger SQL constraints before representative reconciliation tests. Synthetic fixtures can model missing attribution and former membership without choosing the actual deletion/retention policy.

## Decisions still needed

- Whether existing accounts/data are only the creator's or include other users; this controls cutover/support and migration acceptance, not whether existing data is presumed valuable.
- Whether new planning is account-private initially and how existing household/public-link features remain accessible.
- Retention and attribution policy for shared records when an account leaves/deletes, plus processing/controller/provider responsibilities.

These questions must not be disguised as technical defaults. First-batch hardening does not claim complete account export/deletion, cross-device preferences or GDPR compliance.
