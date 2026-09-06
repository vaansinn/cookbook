# #47a — Teaching pilot fixture contract

Status: final for the pilot slice (#47a). Two agents build against this without
talking to each other live — one on the teaching flow (#34a–#38a), one on
idempotent cook-logging (#48). Field names here are the ones to implement
against; if a slice needs something this doc doesn't define, propose an
addition to this file rather than inventing a parallel shape.

Scope: `dish_slug` + `level` + `lang` resolved through the existing
`Dish`/`RecipeTier` tables (`models.py`). No `RecipeVersion`/`RecipeRevision`
migration (#40/#47b) is part of this contract.

Conventions: JSON field names are `snake_case`. `level` is one of
`basic`/`intermediate`/`advanced`. `lang` is `en`/`de`. All timestamps are
UTC ISO-8601. Nothing here is a git-style diff/merge concept — see
`architecture.md`'s "no Git jargon" note.

---

## 1. Content snapshot — server-authorized, never a client hash

A cook session must be able to show and replay the *actual instructions the
user cooked from*, even after the recipe is edited or the browser is closed.
A hash alone cannot do that — it can only prove two things were equal, it
can't hand back the content. So the server stores the full content, not a
digest of it.

**New table: `recipe_content_snapshots`**

| Field | Type | Notes |
|---|---|---|
| `id` | int, PK | This *is* the snapshot reference (`snapshot_id`) held by the client and by `CookLog`. |
| `dish_slug` | string(80) | |
| `level` | string(20) | |
| `lang` | string(5) | |
| `content` | JSON | Full recipe content at capture time — the equivalent of `RecipeTier.to_dict(full=True)`: `title`, `tier_summary`, `serves`, `time_min`, `equipment`, `diet_flags`, `allergens`, `tags`, `prep`, `ingredients`, `steps`, `notes`, `nutrition`. Not a hash, not a subset — the whole thing, so it can be redisplayed on its own later even if the live recipe has changed. |
| `content_digest` | string | Deterministic digest of `content`, used **only** to decide whether an existing row already represents this exact content (see reuse rule below). It is a lookup key, not the authorization artifact — the row's `content` column is. |
| `created_at` | datetime | |

`__table_args__`: unique on `(dish_slug, level, lang, content_digest)` so a
retried or repeated capture of unchanged content resolves to the same row
instead of inserting a duplicate.

**Capture / reuse rule.** When a cook session starts (or a guest opens the
recipe to cook it), the server:
1. Computes `content_digest` for the current `RecipeTier` content.
2. Looks for an existing `recipe_content_snapshots` row with the same
   `(dish_slug, level, lang, content_digest)`. If found, reuse its `id` —
   do **not** insert a new row just because someone else is cooking the same
   unchanged recipe today.
3. Otherwise inserts a new row and returns its `id`.

**Lifecycle through a cook.** The client receives `snapshot_id` once, at
session start, and holds it through completion. It never asks the server for
"the current content" again mid-session — the whole point of the snapshot is
that it doesn't move under the user's feet, including if the recipe is edited
mid-cook.

**The one legitimate re-fetch: a page reload.** A refresh may re-request the
*same* `snapshot_id` the session already has (e.g. to redraw the UI after a
reload) — that is not "getting new content," it's redisplaying the same
immutable row, and it must come back byte-identical every time. What must
never happen is the server silently substituting whatever the live recipe
currently contains for that `snapshot_id` — a snapshot row is immutable once
created; it is never updated in place.

**Entitlement is re-checked on every read, not just at creation.** Every read
of a snapshot (initial capture, a reload, anything) re-runs the same
tier/premium check `access.py` applies to live recipes, using the snapshot's
own `dish_slug`/`level` and the requester's *current* access — not whatever
access they had when the session started. Example: a premium subscription
lapses mid-session; the next snapshot read for an `advanced` snapshot must
fail access, even though the session already had the snapshot id in hand.
Holding a `snapshot_id` is not itself a substitute credential.

**Old cooks with no captured snapshot** (anything logged before this table
exists) show as "source content unknown" — never backfilled with today's
content and mislabeled as original.

---

## 2. Step identity — stable ID, full tier+language identity, not text matching

**A step reference is the 4-tuple `(dish_slug, level, lang, step_id)`.**
Not `(dish_slug, step_id)` and not `(recipe_slug, step_id)` — Basic and
Advanced instructions for the same dish are genuinely different text, and EN
and DE are separate translations with their own step content. A `step_id`
only means something once you also know which tier and which language it
lives in.

`step_id` is a stable string set by the recipe author (e.g. `"simmer-15"`),
carried in the structured step data introduced by #35's step format. It must
survive copy edits to the instruction text — it is not a numeric array
index, and not derived from the instruction wording.

**Lesson-to-step link.** A `Lesson` (or its recipe-link table, #34a) that
points at a specific instructional moment in a recipe stores:

```
{
  "dish_slug": "lentil-bolognese",
  "level": "basic",
  "lang": "en",
  "step_id": "simmer-15"
}
```

**Sync-time validation is mandatory and must fail loudly.** When
`scripts/sync_learning.py` (or whatever #34a's sync entry point is) commits a
lesson's recipe/step links, it must resolve every one of these 4-tuples
against the actual synced `RecipeTier` step data for that exact
`(dish_slug, level, lang)`. A link that doesn't resolve — wrong step_id,
wrong level, wrong lang, step renamed/removed — aborts the sync with a clear
error identifying the broken link. It must never publish a lesson with a
dangling step reference, and must never fall back to "closest text match."

**Glossary trigger-word matching is a separate, unrelated mechanism.**
`GlossaryLinkedText.jsx` auto-links any occurrence of an authored trigger
word (`GlossaryEntry.trigger_words`) wherever it appears in recipe prose —
it's a best-effort *display* convenience, not an instructional association,
and it has no `step_id` or level/lang awareness at all (today it only
matches English text; see the file's own comment). It must never be used to
decide which step a lesson is teaching against — that association is only
ever the explicit 4-tuple above, resolved and validated at sync time.

---

## 3. Reflection payload — four distinct fields, never conflated

`CookReflection` (or equivalent fields on a reflection endpoint) carries
four independent pieces of information. None of them is inferable from any
of the others.

| Field | Type | Meaning |
|---|---|---|
| `outcome` | string or null | Optional. Free text or a selected value (e.g. `"happy"` / `"mixed"` / `"need_help"` per the product copy in the implementation plan). How it went — not evidence of anything else. |
| `practiced_skill_confirmed` | bool, no default | Explicit, user-clicked confirmation that they actually practiced *the cook's specific focus skill*. This is never set from "the recipe was marked complete" — completing a cook proves nothing about practice on its own. If the user never answers this question, the field is simply absent/null, not `false`. |
| `confidence` | string or null | Optional self-assessment (e.g. `unknown` / `wants_guidance` / `comfortable`), editable independently of `outcome` — changing one must not touch the other. Also independently updatable later outside this reflection payload (see #37's `PUT /api/me/skills/<slug>`). |
| *(skip)* | — | The skip path is the absence of a `CookReflection`/`SkillPractice` row at all — not a row with all fields defaulted. Skipping records nothing, and specifically must never synthesize `practiced_skill_confirmed = true` from the fact that the cook itself was saved. |

A single reflection submission may set `outcome`, `practiced_skill_confirmed`,
and `confidence` together, but each is optional/independent except that
`practiced_skill_confirmed` — when present at all — must be an explicit
boolean the user affirmatively set, never a computed default.

---

## 4. Cook-session lifecycle

**Identity and keying.** A cook session is scoped to *one* of:
- a signed-in account (`user_id` from the decoded JWT), or
- a distinct guest namespace (a client-generated guest id, never a `user_id`
  of `null`/`0` masquerading as one, and never merged into the signed-in
  keyspace even if the same browser later signs in).

These two are never mixed under one storage key.

The session key is **not** bare `(dish_slug, level)`. The lookup key a
session is keyed by is:

```
(owner_namespace, owner_id, session_id)
```

— where `owner_namespace` is `"account"` for a signed-in user or `"guest"`
for a guest (so the two are never comparable, even if a numeric `owner_id`
and a guest id ever collided), `owner_id` is the account's `user_id` for
signed-in users or the guest namespace id for guests, and `session_id` alone
disambiguates two separate attempts by the same owner at the same
dish/level/lang.

`dish_slug`, `level`, `lang`, `snapshot_id`, and `current_step_id` are
**fields on** the stored record, not part of what identifies it — a value
that changes as a side effect of using the record (as `current_step_id`
does, every time the user advances a step) can't also be part of the key
used to look that same record up. Of these fields, `dish_slug`/`level`/
`lang`/`snapshot_id` are fixed once captured at session start, for the life
of one cook attempt — they identify *what* is being cooked and from *which*
content, and never change turn-by-turn. Only `current_step_id` and
completion/reflection state are expected to change as the user progresses.
A deliberate switch to a different recipe/tier starts a new attempt (a new
`session_id`), never a silent mutation of the existing record's recipe/
snapshot fields.

**`session_id` minting.** A new `session_id` is generated only for a
deliberate new cook — the user explicitly chose "Start cooking" / "Cook
again" / "Start over." It is never minted on every component mount or page
load; a refresh or remount reuses the `session_id` already held for that
in-progress cook.

**Clearing.** All of this per-user session state (signed-in or guest) is
cleared on logout and on account switch — this is the same private-state
boundary #50's cache/store-reset work already has to enforce for other
stores; cook-session state joins that reset, not a separate mechanism.

**Concurrency / idempotency.** Two submissions of the same finish action
(double-tap, retry after a flaky response) for the same `(user_id,
session_id)` must produce exactly one saved `CookLog` row, decided
transactionally at the database level via a unique constraint on
`(user_id, session_id)` — not via a client-side "already submitting" flag
alone, since that can't stop a genuine second network request. See section 6
for the exact request/response shape this produces.

**Signed-in save-then-reflect ordering.**
1. The cook-completion save (`POST /api/cook-log`) happens and must succeed
   **before** reflection is ever offered. Reflection is strictly additive to
   an already-saved `CookLog` row — it is never a precondition for that row
   existing.
2. Skipping reflection (or answering only part of it) leaves the saved
   `CookLog` row exactly as it was saved — nothing about the save is
   retroactively incomplete because reflection was skipped.
3. If the completion save fails (network error, 5xx, validation error), the
   UI must show a visible error state with a retry action on the same
   screen. It must never navigate the user forward (e.g. to the reflection
   or next-practice screen) as though the save had succeeded — that would
   silently lose the cook.

**Guest exception.** Guests are the one stated exception to "save before
reflection," because for a guest there is no server-side save to sequence
against at all (section 5). A guest completes the cook entirely client-side
and is shown the next-practice suggestion (section 7) without any server
round-trip and without being pushed to register. This is a sequencing
exception for accounts, not a gate on the teaching content itself — guests
still get the full teaching flow, just with no persisted record.

---

## 5. Guest snapshot handling

A guest reads and reuses **the same** `recipe_content_snapshots` row as any
signed-in visitor to that `dish_slug`/`level`/`lang` — the reuse rule in
section 1 applies identically; a guest visit never forces a new snapshot row
to be inserted for otherwise-unchanged content. (In practice a guest can
only ever reach `level = basic` snapshots, since Basic is the only tier
`access.py` serves to anonymous requests — the same entitlement re-check
from section 1 still runs on every guest read.)

What a guest explicitly does **not** get, because there is no account to own
either:
- No `CookLog` row.
- No `CookReflection`/`SkillPractice`/confidence row.

Account creation stays fully optional and is never forced by the cook flow
(see section 4's guest exception). If a guest later creates an account or
logs in, **nothing is migrated or uploaded** from their guest session —
their reflection/confidence answers, if any, were never persisted anywhere,
so there is nothing to attach to the new account, and none of it may
retroactively appear there. This is a hard rule, not an oversight: don't build
a "carry over guest state on signup" path for this data.

---

## 6. Cook-log idempotency endpoint — request/response shape

`POST /api/cook-log` — the endpoint #48's reliability logic implements
against. Signed-in only (guests never call this — section 5).

### Request

```json
{
  "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
  "dish_slug": "lentil-bolognese",
  "level": "basic",
  "lang": "en",
  "snapshot_id": 482
}
```

- `session_id`: string, client-generated UUID, minted per section 4's rule.
  This is the idempotency key, scoped per-user by the unique constraint
  below.
- `dish_slug` / `level` / `lang`: the resolved recipe reference being
  logged.
- `snapshot_id`: FK into `recipe_content_snapshots` — the exact content this
  cook was performed against (section 1).

### Server-side constraint

`cook_logs` gets a unique constraint on `(user_id, session_id)` (an
additive migration — `user_id` from the decoded JWT, never the request
body). The route inserts inside a transaction and reacts to the constraint
rather than pre-checking-then-inserting (to actually close the race, not
just narrow it):

- Insert succeeds → **fresh success**.
- Insert violates the unique constraint → re-read the existing row for
  `(user_id, session_id)` and compare its stored `(dish_slug, level, lang,
  snapshot_id)` against the incoming request:
  - Same payload → **idempotent replay** (the double-tap case).
  - Different payload → **conflict** (the client is reusing a `session_id`
    that already means something else — a client bug or a stale retry
    against a `session_id` that should have been re-minted).

### Response — fresh success

`201 Created`

```json
{
  "status": "created",
  "cook_log": {
    "id": 9931,
    "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
    "dish_slug": "lentil-bolognese",
    "level": "basic",
    "lang": "en",
    "snapshot_id": 482,
    "cooked_at": "2026-09-06T14:02:11Z"
  }
}
```

### Response — idempotent replay (same session_id, same payload)

`200 OK`, same `cook_log` body as the original insert (the already-saved
row, not a new one):

```json
{
  "status": "already_saved",
  "cook_log": {
    "id": 9931,
    "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
    "dish_slug": "lentil-bolognese",
    "level": "basic",
    "lang": "en",
    "snapshot_id": 482,
    "cooked_at": "2026-09-06T14:02:11Z"
  }
}
```

The client cannot distinguish this from the fresh-success case just by
reading `cook_log` — treat both as "the cook is saved, proceed to
reflection." `status` is what tells you which happened, if you care.

### Response — conflict (same session_id, different payload)

`409 Conflict`

```json
{
  "status": "conflict",
  "error": "session_id already logged with different parameters",
  "existing_cook_log": {
    "id": 9931,
    "session_id": "b3f1c2d0-8a41-4e2a-9b1a-6b6a2e6a9f10",
    "dish_slug": "lentil-bolognese",
    "level": "intermediate",
    "lang": "en",
    "snapshot_id": 470,
    "cooked_at": "2026-09-06T13:55:02Z"
  }
}
```

The client must not overwrite or merge into `existing_cook_log`. This is the
signal (section 4's retry rule) to surface a visible error/retry state — a
409 here is not "saved," and the frontend must not treat it as success.

---

## 7. Next-practice link shape

Returned alongside (or after) a completed cook, whether the user is a guest
or signed-in:

```json
{
  "dish_slug": "chickpea-tikka-masala",
  "level": "basic",
  "lang": "en",
  "reason": "Try keeping a steady simmer in another dish."
}
```

- `dish_slug` / `level` / `lang`: an existing, access-checked recipe
  reference the user is actually eligible to open (never a locked tier as
  the only suggestion).
- `reason`: a short authored string explaining *why* this is being
  suggested — not a generic "try this next," and not computed/opaque. The
  example above is deliberately neutral/outcome-agnostic: section 3 makes
  `practiced_skill_confirmed` optional and skippable, so the default reason
  text must never presume practice happened when it might not have (i.e.
  never phrase it as "you just practiced X"). Personalized "you practiced
  X" phrasing is only appropriate once `practiced_skill_confirmed` is
  actually `true` for that session — never as the default/fallback wording.
- Always skippable/dismissable: the user can ignore it and browse normally;
  it is a suggestion, never a required next step, and dismissing it must not
  affect the already-saved cook or reflection in any way.

---

## Explicitly undecided — do not guess past this

- **Who generates `session_id`.** This doc assumes client-generated UUID
  (simplest, and lets the client mint it once at "Start cooking" without a
  round-trip). If #48 finds a reason the server must mint it instead, that's
  a change to this contract, not a silent per-implementation choice.
- **Exact `outcome` enum values** beyond the three named in the product plan
  (`happy` / `mixed` / `need_help`) — confirm final copy/keys with the
  content agent (#33a) before locking the column's allowed values.
- **Guest namespace mechanics** (how the guest id is generated/stored,
  e.g. `localStorage` key shape) — belongs to whichever slice implements the
  guest-side client state (#36a/#37a), not to this contract; this doc only
  fixes that it must be a *distinct* namespace, never `user_id`-shaped.
- **Step data shape pre-#35.** Section 2 assumes structured steps with a
  `step_id` field exist by the time lesson-step links are validated. Until
  #35a lands, `RecipeTier.steps` is `list[str]` with no stable ID — #34a's
  sync validation has nothing to resolve against for those recipes. Do not
  invent a synthetic `step_id` (e.g. array index) as a stand-in; block the
  lesson-recipe link for a dish until its steps are converted, and say so in
  the sync's validation error.
